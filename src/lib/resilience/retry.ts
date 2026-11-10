// AcquisitionOS — Retry with exponential backoff + jitter
// Reusable retry helper for transient failures.

import logger from '@/lib/logger';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterFactor?: number;
  retryOn?: (err: unknown) => boolean;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

const DEFAULTS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
  jitterFactor: 0.5,
  retryOn: (err) => {
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      if (
        msg.includes('enotfound') ||
        msg.includes('econnrefused') ||
        msg.includes('econnreset') ||
        msg.includes('etimedout') ||
        msg.includes('fetch failed') ||
        msg.includes('network error')
      ) {
        return true;
      }
      if (/api error (429|502|503|504)/.test(msg)) return true;
      if (msg.includes('socket hang up')) return true;
    }
    return false;
  },
  onRetry: () => {},
};

function computeDelay(attempt: number, opts: Required<RetryOptions>): number {
  const base = opts.baseDelayMs * Math.pow(2, attempt - 1);
  const capped = Math.min(base, opts.maxDelayMs);
  const jitter = Math.random() * opts.jitterFactor * capped;
  return Math.min(capped + jitter, opts.maxDelayMs);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULTS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (err) {
      lastError = err;

      if (attempt === opts.maxAttempts) {
        logger.warn(`withRetry: exhausted ${opts.maxAttempts} attempts`, undefined, {
          lastError: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }

      if (!opts.retryOn(err)) {
        throw err;
      }

      const delayMs = computeDelay(attempt, opts);
      opts.onRetry({ attempt, delayMs, error: err });
      logger.warn(`withRetry: attempt ${attempt} failed, retrying in ${Math.round(delayMs)}ms`, undefined, {
        error: err instanceof Error ? err.message : String(err),
        nextAttempt: attempt + 1,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
