// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — AI Provider Fallback Service
// Phase 8: AI Fixes — Provider Chain, Health Checks, Retry Logic
//
// Provides resilience for AI API calls:
// - Provider chain: primary → fallback1 → fallback2
// - Health checks for providers
// - Auto-fallback on provider failure
// - Provider reliability metrics tracking
// - Retry with exponential backoff
// ═══════════════════════════════════════════════════════════════════

import ZAI from 'z-ai-web-dev-sdk';

// ===== TYPES =====

export type ProviderId = 'z-ai-primary' | 'z-ai-fallback-1' | 'z-ai-fallback-2';

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  priority: number;
  maxRetries: number;
  timeoutMs: number;
}

export interface ProviderHealthStatus {
  id: ProviderId;
  name: string;
  isHealthy: boolean;
  lastCheckAt: Date;
  lastError: string | null;
  consecutiveFailures: number;
  latencyMs: number | null;
}

export interface ProviderMetrics {
  id: ProviderId;
  name: string;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  averageLatencyMs: number;
  lastFailureAt: Date | null;
  reliability: number; // 0-1, success rate
  isCurrentlyHealthy: boolean;
}

export interface FallbackResult<T> {
  data: T;
  provider: ProviderId;
  attempts: number;
  totalLatencyMs: number;
  usedFallback: boolean;
}

// ===== PROVIDER CHAIN CONFIGURATION =====

const PROVIDER_CHAIN: ProviderConfig[] = [
  {
    id: 'z-ai-primary',
    name: 'Z-AI Primary',
    priority: 1,
    maxRetries: 2,
    timeoutMs: 30000,
  },
  {
    id: 'z-ai-fallback-1',
    name: 'Z-AI Fallback 1',
    priority: 2,
    maxRetries: 1,
    timeoutMs: 45000,
  },
  {
    id: 'z-ai-fallback-2',
    name: 'Z-AI Fallback 2',
    priority: 3,
    maxRetries: 1,
    timeoutMs: 60000,
  },
];

// ===== IN-MEMORY HEALTH TRACKING =====

interface ProviderState {
  isHealthy: boolean;
  consecutiveFailures: number;
  lastCheckAt: Date;
  lastError: string | null;
  lastFailureAt: Date | null;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  totalLatencyMs: number;
  latencyMs: number | null;
  circuitOpenUntil: Date | null;
}

const providerStates: Map<ProviderId, ProviderState> = new Map();

// Initialize provider states
for (const provider of PROVIDER_CHAIN) {
  providerStates.set(provider.id, {
    isHealthy: true,
    consecutiveFailures: 0,
    lastCheckAt: new Date(),
    lastError: null,
    lastFailureAt: null,
    totalCalls: 0,
    successCalls: 0,
    failedCalls: 0,
    totalLatencyMs: 0,
    latencyMs: null,
    circuitOpenUntil: null,
  });
}

const CONSECUTIVE_FAILURES_THRESHOLD = 3;
const CIRCUIT_BREAKER_DURATION_MS = 60000; // 1 minute
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30000;

// ===== CORE FUNCTIONS =====

/**
 * Execute an AI call with automatic fallback through the provider chain.
 * Tries primary first, then falls back to secondary providers on failure.
 * Implements retry with exponential backoff per provider.
 */
export async function callWithFallback<T>(
  fn: (provider: ProviderId) => Promise<T>,
  options?: {
    maxTotalAttempts?: number;
    skipProviders?: ProviderId[];
  }
): Promise<FallbackResult<T>> {
  const maxTotalAttempts = options?.maxTotalAttempts || 6;
  const skipProviders = options?.skipProviders || [];
  const startTime = Date.now();

  // Sort providers by priority
  const availableProviders = PROVIDER_CHAIN
    .filter((p) => !skipProviders.includes(p.id))
    .sort((a, b) => a.priority - b.priority);

  let totalAttempts = 0;

  for (const provider of availableProviders) {
    if (totalAttempts >= maxTotalAttempts) break;

    // Check circuit breaker
    const state = providerStates.get(provider.id)!;
    if (state.circuitOpenUntil && state.circuitOpenUntil > new Date()) {
      continue; // Skip this provider, circuit is open
    }

    // Try this provider with retries
    for (let attempt = 0; attempt <= provider.maxRetries; attempt++) {
      if (totalAttempts >= maxTotalAttempts) break;
      totalAttempts++;

      try {
        // Exponential backoff for retries
        if (attempt > 0) {
          const backoffMs = Math.min(
            BACKOFF_BASE_MS * Math.pow(2, attempt - 1),
            BACKOFF_MAX_MS
          );
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }

        const result = await executeWithTimeout(fn(provider.id), provider.timeoutMs);

        // Success — update state
        const latency = Date.now() - startTime;
        trackSuccess(provider.id, latency);

        return {
          data: result,
          provider: provider.id,
          attempts: totalAttempts,
          totalLatencyMs: latency,
          usedFallback: provider.priority > 1,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        trackProviderFailure(provider.id, message);

        // If this was the last attempt for this provider, move to next
        if (attempt >= provider.maxRetries) break;
      }
    }
  }

  // All providers failed
  throw new Error(
    `All AI providers failed after ${totalAttempts} attempts. ` +
    availableProviders.map((p) => {
      const state = providerStates.get(p.id)!;
      return `${p.name}: ${state.lastError || 'unknown error'}`;
    }).join('; ')
  );
}

/**
 * Check the health of all AI providers.
 * Returns current health status for each provider.
 */
export async function checkProviderHealth(): Promise<ProviderHealthStatus[]> {
  const results: ProviderHealthStatus[] = [];

  for (const provider of PROVIDER_CHAIN) {
    const state = providerStates.get(provider.id)!;

    // Check circuit breaker
    if (state.circuitOpenUntil && state.circuitOpenUntil > new Date()) {
      results.push({
        id: provider.id,
        name: provider.name,
        isHealthy: false,
        lastCheckAt: new Date(),
        lastError: 'Circuit breaker open',
        consecutiveFailures: state.consecutiveFailures,
        latencyMs: state.latencyMs,
      });
      continue;
    }

    // Try a lightweight health check
    try {
      const start = Date.now();
      const zai = await ZAI.create();
      // Simple health check: just verify we can create the client
      const latency = Date.now() - start;

      state.isHealthy = true;
      state.lastCheckAt = new Date();
      state.latencyMs = latency;

      results.push({
        id: provider.id,
        name: provider.name,
        isHealthy: true,
        lastCheckAt: new Date(),
        lastError: null,
        consecutiveFailures: 0,
        latencyMs: latency,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Health check failed';
      state.isHealthy = false;
      state.lastCheckAt = new Date();

      results.push({
        id: provider.id,
        name: provider.name,
        isHealthy: false,
        lastCheckAt: new Date(),
        lastError: message,
        consecutiveFailures: state.consecutiveFailures,
        latencyMs: state.latencyMs,
      });
    }
  }

  return results;
}

/**
 * Track a provider failure.
 * Updates metrics and potentially opens circuit breaker.
 */
export function trackProviderFailure(providerId: ProviderId, error: string): void {
  const state = providerStates.get(providerId);
  if (!state) return;

  state.consecutiveFailures++;
  state.totalCalls++;
  state.failedCalls++;
  state.lastError = error;
  state.lastFailureAt = new Date();
  state.isHealthy = false;

  // Open circuit breaker after threshold
  if (state.consecutiveFailures >= CONSECUTIVE_FAILURES_THRESHOLD) {
    state.circuitOpenUntil = new Date(Date.now() + CIRCUIT_BREAKER_DURATION_MS);
    console.warn(
      `[AI-Fallback] Circuit breaker opened for ${providerId} after ${state.consecutiveFailures} consecutive failures`
    );
  }
}

/**
 * Get metrics for all AI providers.
 */
export function getProviderMetrics(): ProviderMetrics[] {
  const metrics: ProviderMetrics[] = [];

  for (const provider of PROVIDER_CHAIN) {
    const state = providerStates.get(provider.id)!;

    metrics.push({
      id: provider.id,
      name: provider.name,
      totalCalls: state.totalCalls,
      successCalls: state.successCalls,
      failedCalls: state.failedCalls,
      averageLatencyMs: state.totalCalls > 0
        ? Math.round(state.totalLatencyMs / state.totalCalls)
        : 0,
      lastFailureAt: state.lastFailureAt,
      reliability: state.totalCalls > 0
        ? state.successCalls / state.totalCalls
        : 1,
      isCurrentlyHealthy: state.isHealthy,
    });
  }

  return metrics;
}

// ===== INTERNAL HELPERS =====

function trackSuccess(providerId: ProviderId, latencyMs: number): void {
  const state = providerStates.get(providerId);
  if (!state) return;

  state.consecutiveFailures = 0;
  state.totalCalls++;
  state.successCalls++;
  state.totalLatencyMs += latencyMs;
  state.latencyMs = latencyMs;
  state.isHealthy = true;
  state.lastError = null;
  state.circuitOpenUntil = null; // Close circuit on success
}

function executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
