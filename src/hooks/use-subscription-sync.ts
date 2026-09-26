// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — useSubscriptionSync Hook
// Phase 4: Subscription System + Credits Engine + Plan Gates + Billing
//
// Syncs subscription data from the backend to the Zustand store.
// Called once when the user enters the dashboard to ensure fresh
// subscription/credits/entitlements data.
// ═══════════════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  useSubscriptionStore,
  type BackendSubscriptionData,
  type BackendEntitlementsData,
} from '@/lib/subscription-store';
import { apiCall, ApiError } from '@/lib/api-error-handler';

// Sync interval: 5 minutes
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Hook that syncs subscription data from the backend to the Zustand store.
 * - Fetches /api/subscriptions/current for subscription, trial, and credit data
 * - Fetches /api/subscriptions/entitlements for feature entitlements
 * - Auto-refreshes every 5 minutes
 * - Re-fetches on window focus
 *
 * Should be called inside the authenticated section of the app only.
 */
export function useSubscriptionSync() {
  const syncFromBackend = useSubscriptionStore((s) => s.syncFromBackend);
  const syncEntitlements = useSubscriptionStore((s) => s.syncEntitlements);
  const setLoading = useSubscriptionStore((s) => s.setLoading);
  const markUnavailable = useSubscriptionStore((s) => s.markUnavailable);
  const lastFetchedAt = useSubscriptionStore((s) => s.lastFetchedAt);
  const reset = useSubscriptionStore((s) => s.reset);
  const isFetchingRef = useRef(false);

  const doSync = useCallback(async () => {
    // Prevent concurrent syncs
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);

    // ── P3 (Sep 2026): failure semantics ─────────────────────────
    // 401               → genuinely unauthenticated → reset store.
    // 403/5xx/network   → infrastructure/unavailable → markUnavailable()
    //                     and KEEP the last-known-good plan. NEVER map a
    //                     backend failure to plan "free" (that falsely
    //                     stripped Pro/Elite users of their features).
    let sawInfraFailure = false;

    try {
      // Fetch subscription current status
      try {
        const subData = await apiCall<BackendSubscriptionData>('/api/subscriptions/current', {
          credentials: 'include',
        }, { errorMessage: 'Failed to sync subscription status', showToast: false });
        syncFromBackend(subData);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          // Not authenticated — reset store (correct: real logout state)
          reset();
          return;
        }
        sawInfraFailure = true;
        // Other errors — log but don't block entitlements fetch
        console.warn('[SubscriptionSync] Failed to fetch subscription status (plan state preserved):', error);
      }

      // Fetch entitlements
      try {
        const entData = await apiCall<BackendEntitlementsData>('/api/subscriptions/entitlements', {
          credentials: 'include',
        }, { errorMessage: 'Failed to sync entitlements', showToast: false });
        syncEntitlements(entData);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          reset();
          return;
        }
        sawInfraFailure = true;
        console.warn('[SubscriptionSync] Failed to fetch entitlements (entitlements preserved):', error);
      }

      // P3: only after BOTH fetch attempts resolved — if any failed with a
      // non-401 error, mark the store "unavailable". currentPlan keeps its
      // last-known-good value (loading/never-verified is NOT Free).
      if (sawInfraFailure) {
        markUnavailable();
      }
    } catch (error) {
      console.error('[SubscriptionSync] Unexpected error during sync:', error);
      markUnavailable();
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [syncFromBackend, syncEntitlements, setLoading, markUnavailable, reset]);

  // Initial sync on mount
  useEffect(() => {
    doSync();
  }, [doSync]);

  // Periodic sync every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      doSync();
    }, SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [doSync]);

  // Re-sync on window focus (if more than 30 seconds since last fetch)
  useEffect(() => {
    const handleFocus = () => {
      const now = Date.now();
      if (!lastFetchedAt || now - lastFetchedAt > 30 * 1000) {
        doSync();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [doSync, lastFetchedAt]);
}
