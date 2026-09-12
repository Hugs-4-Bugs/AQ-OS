// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Sliding Window Rate Limiter
// Phase 14.3: Security Hardening
//
// In-memory sliding window rate limiter with pre-configured limiters
// for different endpoint categories. Returns 429 with Retry-After
// header and standard rate limit headers.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';

// ===== TYPES =====

interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
  /** Key generator — defaults to IP-based */
  keyGenerator?: (request: NextRequest) => string;
}

interface RateLimitEntry {
  timestamps: number[];
  limit: number;
  windowMs: number;
}

// ===== RATE LIMITER STORE =====

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter(ts => now - ts < entry.windowMs);
    // Remove empty entries
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }
}, 60_000).unref?.();

// ===== PRE-CONFIGURED RATE LIMITERS =====

export const RATE_LIMITERS: Record<string, RateLimitConfig> = {
  api: {
    limit: 100,
    windowSeconds: 60,
    keyGenerator: (req) => {
      // SECURITY NOTE: x-user-id header is only trustworthy when set by the
      // Next.js Edge middleware after JWT verification. Since there is no active
      // middleware.ts, we fall back to IP-based rate limiting for safety.
      // TODO: Once src/middleware.ts is restored, the x-user-id header will be
      // verified and this fallback can safely use it.
      return `ip:${getClientIp(req)}`;
    },
  },
  auth: {
    limit: 5,
    windowSeconds: 60,
    keyGenerator: (req) => `ip:${getClientIp(req)}`,
  },
  // Stricter MFA rate limiter — 3 attempts per minute per IP
  mfa: {
    limit: 3,
    windowSeconds: 60,
    keyGenerator: (req) => `ip:${getClientIp(req)}`,
  },
  ai: {
    limit: 20,
    windowSeconds: 60,
    keyGenerator: (req) => {
      // IP-based rate limiting only — see SECURITY NOTE in 'api' limiter.
      return `ip:${getClientIp(req)}`;
    },
  },
  webhook: {
    limit: 1000,
    windowSeconds: 60,
    keyGenerator: (req) => `ip:${getClientIp(req)}`,
  },
  upload: {
    limit: 10,
    windowSeconds: 60,
    keyGenerator: (req) => {
      // IP-based rate limiting only — see SECURITY NOTE in 'api' limiter.
      return `ip:${getClientIp(req)}`;
    },
  },
  export: {
    limit: 5,
    windowSeconds: 60,
    keyGenerator: (req) => {
      // IP-based rate limiting only — see SECURITY NOTE in 'api' limiter.
      return `ip:${getClientIp(req)}`;
    },
  },
  // Per-API-key burst limiter — 100 requests per minute burst
  api_key_burst: {
    limit: 100,
    windowSeconds: 60,
    keyGenerator: (req) => {
      const authHeader = req.headers.get('authorization') || '';
      if (authHeader.startsWith('Bearer aq_')) {
        // Use a hash of the key as the rate limit key
        // (we don't have the full key here, just use prefix)
        return `apikey:${authHeader.substring(7, 19)}`;
      }
      return `ip:${getClientIp(req)}`;
    },
  },
};

// ===== HELPER: Get client IP =====

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}

// ===== CORE RATE LIMIT CHECK =====

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // Unix timestamp in seconds
  retryAfter?: number; // Seconds until the limit resets
}

/**
 * Check if a request should be rate-limited using a sliding window.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const limit = config.limit;

  // Get or create entry
  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [], limit, windowMs };
    store.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter(ts => now - ts < windowMs);

  const currentCount = entry.timestamps.length;
  const remaining = Math.max(0, limit - currentCount);

  if (currentCount >= limit) {
    // Find when the oldest request in the window will expire
    const oldestInWindow = entry.timestamps[0];
    const resetAt = Math.ceil((oldestInWindow + windowMs) / 1000);
    const retryAfter = Math.ceil((oldestInWindow + windowMs - now) / 1000);

    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt,
      retryAfter: Math.max(1, retryAfter),
    };
  }

  // Add current timestamp
  entry.timestamps.push(now);

  // Calculate reset time based on the newest entry in the window
  const newestInWindow = entry.timestamps[entry.timestamps.length - 1];
  const resetAt = Math.ceil((newestInWindow + windowMs) / 1000);

  return {
    allowed: true,
    limit,
    remaining: remaining - 1,
    resetAt,
  };
}

// ===== MIDDLEWARE =====

/**
 * Rate limit middleware for API routes.
 * Usage:
 *   export async function POST(request: NextRequest) {
 *     const limitResult = await withRateLimit(request, 'api');
 *     if (limitResult) return limitResult; // 429 response
 *     // ... normal handler logic
 *   }
 */
export function withRateLimit(
  request: NextRequest,
  limiterName: string
): NextResponse | null {
  const config = RATE_LIMITERS[limiterName];
  if (!config) {
    console.warn(`Unknown rate limiter: ${limiterName}`);
    return null;
  }

  const key = config.keyGenerator
    ? config.keyGenerator(request)
    : `ip:${getClientIp(request)}`;

  const prefix = `rl:${limiterName}:`;
  const result = checkRateLimit(prefix + key, config);

  // Set rate limit headers
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.resetAt),
  };

  if (!result.allowed) {
    headers['Retry-After'] = String(result.retryAfter || 60);

    return NextResponse.json(
      {
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${result.retryAfter || 60} seconds.`,
        retryAfter: result.retryAfter,
      },
      {
        status: 429,
        headers,
      }
    );
  }

  return null; // Request is allowed
}

/**
 * Create a rate-limited response with proper headers.
 * Useful when you need to add rate limit headers to a successful response.
 */
export function addRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult
): NextResponse {
  response.headers.set('X-RateLimit-Limit', String(result.limit));
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  response.headers.set('X-RateLimit-Reset', String(result.resetAt));
  return response;
}

/**
 * Get current rate limit status for a key without consuming a request.
 */
export function getRateLimitStatus(
  limiterName: string,
  key: string
): RateLimitResult | null {
  const config = RATE_LIMITERS[limiterName];
  if (!config) return null;

  const prefix = `rl:${limiterName}:`;
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;

  const entry = store.get(prefix + key);
  if (!entry) {
    return {
      allowed: true,
      limit: config.limit,
      remaining: config.limit,
      resetAt: Math.ceil((now + windowMs) / 1000),
    };
  }

  const currentCount = entry.timestamps.filter(ts => now - ts < windowMs).length;
  const remaining = Math.max(0, config.limit - currentCount);

  return {
    allowed: currentCount < config.limit,
    limit: config.limit,
    remaining,
    resetAt: Math.ceil((now + windowMs) / 1000),
  };
}
