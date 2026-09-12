// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — In-memory Rate Limiter
// Simple sliding-window rate limiter for feedback endpoints.
// Used by POST /api/feedback (10/hr per user) and POST /api/feedback/crash
// (50/hr per IP). Not distributed — single-instance only.
// ═══════════════════════════════════════════════════════════════════

interface RateBucket {
  timestamps: number[];
}

const buckets = new Map<string, RateBucket>();

// Periodically clean up expired buckets to prevent memory leaks
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
let lastCleanup = Date.now();

function cleanup(windowMs: number): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  for (const [key, bucket] of buckets.entries()) {
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
    if (bucket.timestamps.length === 0) {
      buckets.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

/**
 * Check rate limit for a key.
 * @param key Unique identifier (e.g., `feedback:user:<userId>` or `crash:ip:<ip>`)
 * @param limit Maximum requests allowed in window
 * @param windowMs Window size in milliseconds
 * @returns RateLimitResult — if allowed is false, request should be rejected
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  cleanup(windowMs);
  const now = Date.now();
  const cutoff = now - windowMs;

  const bucket = buckets.get(key) || { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= limit) {
    const oldestInWindow = bucket.timestamps[0];
    const resetAt = oldestInWindow + windowMs;
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      limit,
    };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);

  return {
    allowed: true,
    remaining: Math.max(0, limit - bucket.timestamps.length),
    resetAt: now + windowMs,
    limit,
  };
}

// Convenience constants
export const FEEDBACK_RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 }; // 10/hr
export const CRASH_RATE_LIMIT = { limit: 50, windowMs: 60 * 60 * 1000 }; // 50/hr
