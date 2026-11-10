// AcquisitionOS — Circuit Breaker
// Wraps external service calls so that when a dependency is consistently
// failing, the breaker opens and short-circuits with BreakerOpenError
// instead of every request waiting for the timeout.

import logger from '@/lib/logger';

export type BreakerState = 'closed' | 'open' | 'half-open';

export class BreakerOpenError extends Error {
  constructor(public readonly breakerName: string, public readonly retryAfterMs: number) {
    super(`Circuit breaker "${breakerName}" is open — retry in ${Math.round(retryAfterMs / 1000)}s`);
    this.name = 'BreakerOpenError';
  }
}

export class BreakerTimeoutError extends Error {
  constructor(public readonly breakerName: string, timeoutMs: number) {
    super(`Circuit breaker "${breakerName}" timed out after ${timeoutMs}ms`);
    this.name = 'BreakerTimeoutError';
  }
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  timeoutMs?: number;
  successThreshold?: number;
}

interface CircuitBreakerInternal {
  name: string;
  state: BreakerState;
  failureCount: number;
  successCount: number;
  openedAt: number;
  lastError?: string;
  options: Required<CircuitBreakerOptions>;
}

const DEFAULTS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  cooldownMs: 30_000,
  timeoutMs: 8_000,
  successThreshold: 1,
};

const breakers = new Map<string, CircuitBreakerInternal>();

export function getCircuitBreaker(name: string, options?: CircuitBreakerOptions) {
  let breaker = breakers.get(name);
  if (!breaker) {
    breaker = {
      name,
      state: 'closed',
      failureCount: 0,
      successCount: 0,
      openedAt: 0,
      options: { ...DEFAULTS, ...options },
    };
    breakers.set(name, breaker);
  }
  return {
    exec: <T>(fn: () => Promise<T>): Promise<T> => execWithBreaker(breaker!, fn),
    getState: (): BreakerState => breaker!.state,
    getFailureCount: (): number => breaker!.failureCount,
    reset: (): void => {
      breaker!.state = 'closed';
      breaker!.failureCount = 0;
      breaker!.successCount = 0;
      breaker!.openedAt = 0;
      breaker!.lastError = undefined;
    },
  };
}

async function execWithBreaker<T>(
  breaker: CircuitBreakerInternal,
  fn: () => Promise<T>
): Promise<T> {
  const now = Date.now();

  if (breaker.state === 'open') {
    const elapsed = now - breaker.openedAt;
    if (elapsed >= breaker.options.cooldownMs) {
      breaker.state = 'half-open';
      breaker.successCount = 0;
      logger.info(`Circuit breaker "${breaker.name}" → half-open`, undefined, { elapsedMs: elapsed });
    } else {
      const retryAfterMs = breaker.options.cooldownMs - elapsed;
      throw new BreakerOpenError(breaker.name, retryAfterMs);
    }
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new BreakerTimeoutError(breaker.name, breaker.options.timeoutMs)),
      breaker.options.timeoutMs
    );
  });

  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    onSuccess(breaker);
    return result;
  } catch (err) {
    onFailure(breaker, err);
    throw err;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function onSuccess(breaker: CircuitBreakerInternal): void {
  if (breaker.state === 'half-open') {
    breaker.successCount++;
    if (breaker.successCount >= breaker.options.successThreshold) {
      breaker.state = 'closed';
      breaker.failureCount = 0;
      logger.info(`Circuit breaker "${breaker.name}" → closed (recovered)`, undefined, {
        successCount: breaker.successCount,
      });
    }
  } else if (breaker.state === 'closed') {
    breaker.failureCount = 0;
  }
}

function onFailure(breaker: CircuitBreakerInternal, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  breaker.lastError = msg;

  if (breaker.state === 'half-open') {
    breaker.state = 'open';
    breaker.openedAt = Date.now();
    breaker.failureCount++;
    logger.warn(`Circuit breaker "${breaker.name}" → open (half-open trial failed)`, undefined, { error: msg });
    return;
  }

  breaker.failureCount++;
  if (breaker.failureCount >= breaker.options.failureThreshold) {
    breaker.state = 'open';
    breaker.openedAt = Date.now();
    logger.warn(`Circuit breaker "${breaker.name}" → open (after ${breaker.failureCount} failures)`, undefined, {
      error: msg,
      failureThreshold: breaker.options.failureThreshold,
    });
  }
}

export function getAllBreakerStates(): Array<{
  name: string;
  state: BreakerState;
  failureCount: number;
  lastError?: string;
  openedAt?: number;
}> {
  return Array.from(breakers.values()).map((b) => ({
    name: b.name,
    state: b.state,
    failureCount: b.failureCount,
    ...(b.lastError ? { lastError: b.lastError } : {}),
    ...(b.openedAt ? { openedAt: b.openedAt } : {}),
  }));
}

export function resetBreaker(name: string): boolean {
  const b = breakers.get(name);
  if (!b) return false;
  b.state = 'closed';
  b.failureCount = 0;
  b.successCount = 0;
  b.openedAt = 0;
  b.lastError = undefined;
  return true;
}

export function _resetAllBreakers(): void {
  breakers.clear();
}
