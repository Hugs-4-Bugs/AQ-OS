// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — usePaymentSSE Hook
// Phase 5: Real-time payment status updates via Server-Sent Events
//
// Connects to /api/payments/sse and maintains a persistent SSE
// connection for receiving real-time payment, subscription, and
// credit updates. Automatically syncs the subscription store when
// subscription or credit changes are received.
//
// FEATURES:
// - Auto-connects when user is authenticated
// - Exponential backoff reconnection (1s → 2s → 4s → ... → 30s max)
// - Syncs subscription store on subscription_update and credit_update events
// - Graceful cleanup on unmount
// - Manual reconnect capability
// ═══════════════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { useSubscriptionStore, type PlanType } from '@/lib/subscription-store';

// ===== TYPES =====

export interface PaymentSSEData {
  connected: boolean;
  subscriptionStatus: string;
  plan: string;
  credits: number;
  lastPaymentStatus: string;
  timestamp: number;
}

export interface UsePaymentSSEReturn {
  data: PaymentSSEData | null;
  isConnected: boolean;
  error: string | null;
  reconnect: () => void;
}

export interface UsePaymentSSEOptions {
  /** Whether to auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Callback invoked on every status update event */
  onStatusUpdate?: (data: PaymentSSEData) => void;
}

// ===== CONSTANTS =====

/** SSE endpoint path */
const SSE_ENDPOINT = '/api/payments/sse';

/** Initial reconnection delay in milliseconds */
const INITIAL_RECONNECT_DELAY_MS = 1000;

/** Maximum reconnection delay in milliseconds */
const MAX_RECONNECT_DELAY_MS = 30_000;

/** Backoff multiplier for exponential backoff */
const BACKOFF_MULTIPLIER = 2;

// ===== HELPER: Parse SSE event data safely =====

function parseSSEData(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    console.warn('[usePaymentSSE] Failed to parse SSE event data:', raw);
    return null;
  }
}

// ===== HELPER: Build PaymentSSEData from event data =====

function buildSSEData(eventData: Record<string, unknown>): PaymentSSEData {
  return {
    connected: (eventData.connected as boolean) ?? true,
    subscriptionStatus: (eventData.subscriptionStatus as string) ?? 'unknown',
    plan: (eventData.plan as string) ?? 'free',
    credits: (eventData.credits as number) ?? 0,
    lastPaymentStatus: (eventData.lastPaymentStatus as string) ?? 'none',
    timestamp: (eventData.timestamp as number) ?? Date.now(),
  };
}

// ===== HELPER: Sync subscription store from SSE event data =====

function syncStoreFromSSEData(eventData: Record<string, unknown>) {
  const { setPlan, setCredits, setSubscriptionStatus, setRolloverCredits, setAddonCredits, setTrial } =
    useSubscriptionStore.getState();

  const plan = eventData.plan as PlanType | undefined;
  if (plan) setPlan(plan);

  const subStatus = eventData.subscriptionStatus as string | undefined;
  if (subStatus) setSubscriptionStatus(subStatus);

  const credits = eventData.credits as number | undefined;
  const creditsMonthly = eventData.creditsMonthly as number | undefined;
  if (typeof credits === 'number' && typeof creditsMonthly === 'number') {
    setCredits(credits, creditsMonthly);
  }

  const rolloverCredits = eventData.rolloverCredits as number | undefined;
  if (typeof rolloverCredits === 'number') setRolloverCredits(rolloverCredits);

  const addonCredits = eventData.addonCredits as number | undefined;
  if (typeof addonCredits === 'number') setAddonCredits(addonCredits);

  const isTrial = eventData.isTrial as boolean | undefined;
  const trialEndsAt = eventData.trialEndsAt as string | null | undefined;
  if (typeof isTrial === 'boolean') setTrial(isTrial, trialEndsAt ?? null);
}

// ===== HOOK =====

/**
 * Hook for consuming the SSE payment status stream.
 *
 * @param options - Configuration options
 * @param options.autoConnect - Whether to auto-connect on mount (default: true)
 * @param options.onStatusUpdate - Callback invoked on every status update
 *
 * @returns Object with current data, connection status, error, and reconnect function
 *
 * @example
 * ```tsx
 * function PaymentStatusBar() {
 *   const { data, isConnected, error, reconnect } = usePaymentSSE({
 *     onStatusUpdate: (data) => {
 *       console.log('Payment status updated:', data.subscriptionStatus);
 *     },
 *   });
 *
 *   if (!isConnected) return <span>Connecting...</span>;
 *   if (error) return <button onClick={reconnect}>Reconnect</button>;
 *
 *   return <span>{data?.subscriptionStatus} — {data?.credits} credits</span>;
 * }
 * ```
 */
export function usePaymentSSE(options?: UsePaymentSSEOptions): UsePaymentSSEReturn {
  const { autoConnect = true, onStatusUpdate } = options ?? {};

  // ── State ────────────────────────────────────────────────────
  const [data, setData] = useState<PaymentSSEData | null>(null);
  // connectionActive is the source-of-truth for whether we have an active SSE connection
  const [connectionActive, setConnectionActive] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  // Incrementing triggers a new connection attempt
  const [connectionTrigger, setConnectionTrigger] = useState(autoConnect ? 1 : 0);

  // ── Refs ─────────────────────────────────────────────────────
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY_MS);
  const isMountedRef = useRef(true);
  const onStatusUpdateRef = useRef(onStatusUpdate);

  // ── Store selectors ──────────────────────────────────────────
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Keep the onStatusUpdate ref in sync
  useEffect(() => {
    onStatusUpdateRef.current = onStatusUpdate;
  }, [onStatusUpdate]);

  // ── Derived state ────────────────────────────────────────────
  // If not authenticated, report not-authenticated error regardless of connection state
  const isConnected = connectionActive && isAuthenticated;
  const error = isAuthenticated ? connectionError : 'Not authenticated';

  // ── Manual reconnect function ────────────────────────────────
  const reconnect = useCallback(() => {
    reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
    setConnectionError(null);
    setConnectionTrigger((v) => v + 1);
  }, []);

  // ── Main SSE connection effect ───────────────────────────────
  // This effect manages the full EventSource lifecycle.
  // connectionTrigger acts as the dependency that triggers reconnection.
  // When connectionTrigger is 0, no connection is attempted.
  useEffect(() => {
    isMountedRef.current = true;

    // Don't connect if trigger is 0 (means autoConnect was false and no manual connect)
    if (connectionTrigger === 0) return;

    // Don't connect if not authenticated
    if (!isAuthenticated) return;

    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isEffectActive = true;

    const cleanup = () => {
      isEffectActive = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };

    const scheduleReconnect = (delay: number) => {
      reconnectTimer = setTimeout(() => {
        if (!isEffectActive || !isMountedRef.current) return;

        // Re-check authentication before reconnecting
        if (!useAuthStore.getState().isAuthenticated) {
          return;
        }

        // Exponential backoff
        reconnectDelayRef.current = Math.min(
          reconnectDelayRef.current * BACKOFF_MULTIPLIER,
          MAX_RECONNECT_DELAY_MS
        );

        // Trigger a new connection by bumping the trigger counter
        // Only bump if we haven't already moved past this version
        setConnectionTrigger((v) => v + 1);
      }, delay);
    };

    try {
      eventSource = new EventSource(SSE_ENDPOINT, {
        withCredentials: true,
      });

      // ── Event: connected ────────────────────────────────────
      eventSource.addEventListener('connected', (e: MessageEvent) => {
        if (!isEffectActive || !isMountedRef.current) return;

        const eventData = parseSSEData(e.data);
        if (!eventData) return;

        // Reset reconnect delay on successful connection
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
        setConnectionActive(true);
        setConnectionError(null);

        const sseData = buildSSEData(eventData);
        setData(sseData);

        // Sync subscription store with initial data
        syncStoreFromSSEData(eventData);

        // Notify callback
        onStatusUpdateRef.current?.(sseData);
      });

      // ── Event: payment_status ───────────────────────────────
      eventSource.addEventListener('payment_status', (e: MessageEvent) => {
        if (!isEffectActive || !isMountedRef.current) return;

        const eventData = parseSSEData(e.data);
        if (!eventData) return;

        const sseData = buildSSEData(eventData);
        setData(sseData);
        syncStoreFromSSEData(eventData);
        onStatusUpdateRef.current?.(sseData);
      });

      // ── Event: subscription_update ──────────────────────────
      eventSource.addEventListener('subscription_update', (e: MessageEvent) => {
        if (!isEffectActive || !isMountedRef.current) return;

        const eventData = parseSSEData(e.data);
        if (!eventData) return;

        const sseData = buildSSEData(eventData);
        setData(sseData);
        syncStoreFromSSEData(eventData);
        onStatusUpdateRef.current?.(sseData);
      });

      // ── Event: credit_update ────────────────────────────────
      eventSource.addEventListener('credit_update', (e: MessageEvent) => {
        if (!isEffectActive || !isMountedRef.current) return;

        const eventData = parseSSEData(e.data);
        if (!eventData) return;

        const sseData = buildSSEData(eventData);
        setData(sseData);
        syncStoreFromSSEData(eventData);
        onStatusUpdateRef.current?.(sseData);
      });

      // ── Event: heartbeat ────────────────────────────────────
      eventSource.addEventListener('heartbeat', () => {
        // Heartbeat confirms the connection is alive — no state change needed
      });

      // ── EventSource error handling ──────────────────────────
      eventSource.onerror = () => {
        if (!isEffectActive || !isMountedRef.current) return;

        setConnectionActive(false);

        if (eventSource?.readyState === EventSource.CLOSED) {
          // Connection was closed — attempt reconnection with backoff
          const delay = reconnectDelayRef.current;
          setConnectionError(`Connection lost. Reconnecting in ${Math.round(delay / 1000)}s...`);
          scheduleReconnect(delay);
        } else if (eventSource?.readyState === EventSource.CONNECTING) {
          // EventSource is trying to reconnect itself — wait for it
          setConnectionError('Reconnecting...');
        }
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create SSE connection';
      // Defer setState to avoid synchronous setState within effect body
      queueMicrotask(() => {
        if (isMountedRef.current) {
          setConnectionError(message);
        }
      });
      console.error('[usePaymentSSE] Connection error:', err);
    }

    return () => {
      cleanup();
      isMountedRef.current = false;
    };
  }, [isAuthenticated, connectionTrigger]);

  // ── Return ───────────────────────────────────────────────────
  return {
    data,
    isConnected,
    error,
    reconnect,
  };
}
