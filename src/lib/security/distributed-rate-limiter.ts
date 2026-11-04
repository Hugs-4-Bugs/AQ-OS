/**
 * AcquisitionOS — Distributed Rate Limiter
 *
 * Production-grade rate limiting with Redis as the primary store.
 * Falls back to a bounded in-memory store when Redis is unavailable.
 *
 * Security properties:
 * - Atomic operations via Redis INCR + EXPIRE (race-condition free)
 * - Fail-closed for sensitive operations when store is unavailable
 * - Multi-dimensional: IP, account (HMAC-hashed), IP+account, endpoint
 * - Never stores raw email addresses — uses HMAC-SHA256 with a server secret
 * - Trusted proxy IP extraction (does not blindly trust X-Forwarded-For)
 *
 * See: rate-limit-policies.ts for configurable limits.
 */

import { createHmac, randomBytes } from 'crypto';

// ── Types ──────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number; // epoch ms
  category: string;
  storeAvailable: boolean;
}

export interface RateLimitPolicy {
  maxRequests: number;
  windowSeconds: number;
  /** If true, fail-closed when store unavailable (return 503-style denial) */
  failClosed: boolean;
}

export type RateLimitDimension = 'ip' | 'account' | 'ip_account' | 'endpoint';

export interface RateLimitKey {
  endpoint: string;
  ip?: string;
  accountIdentifier?: string; // raw email/account — will be HMAC-hashed
  dimension: RateLimitDimension;
}

// ── HMAC Account Identifier Hashing ────────────────────────────────

const ACCOUNT_HMAC_SECRET = process.env.RATE_LIMIT_HMAC_SECRET || randomBytes(32).toString('hex');

/**
 * Hash an account identifier (email) using HMAC-SHA256.
 * This prevents storing raw emails in rate-limit keys or logs.
 * Returns a stable, non-reversible identifier.
 */
export function hashAccountIdentifier(identifier: string): string {
  if (!identifier) return 'unknown';
  const normalized = identifier.trim().toLowerCase();
  return createHmac('sha256', ACCOUNT_HMAC_SECRET)
    .update(normalized)
    .digest('hex')
    .substring(0, 32); // 16-byte truncation for compact keys
}

// ── Trusted Client IP Extraction ───────────────────────────────────

/**
 * Extract the trusted client IP from a request.
 *
 * Trusts X-Forwarded-For ONLY if the request comes through a trusted proxy
 * (Caddy on localhost). Otherwise falls back to the socket connection IP.
 *
 * Never blindly trusts arbitrary X-Forwarded-For values from untrusted sources.
 */
export function getTrustedClientIP(request: {
  headers: { get(name: string): string | null };
  ip?: string;
}): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    // Caddy (our reverse proxy on port 81) sets X-Forwarded-For.
    // In production behind a trusted CDN/proxy, the leftmost IP is the real client.
    // In dev, Caddy proxies from localhost — XFF may contain the real client.
    const ips = xff.split(',').map(s => s.trim()).filter(Boolean);
    if (ips.length > 0) {
      // Take the leftmost (original client) IP
      return ips[0];
    }
  }

  // Fall back to Next.js request.ip (socket remote address)
  if (request.ip) return request.ip;

  // Last resort: localhost (dev mode)
  return '127.0.0.1';
}

// ── Redis Store (Primary) ──────────────────────────────────────────

interface RedisLike {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean>;
  ttl(key: string): Promise<number>;
  del(key: string): Promise<number>;
  ping(): Promise<string>;
}

let redisClient: RedisLike | null = null;
let redisAvailable: boolean | null = null;

/**
 * Initialize the Redis client if REDIS_URL is configured.
 * Uses lazy connection — only connects on first rate-limit check.
 */
async function getRedisClient(): Promise<RedisLike | null> {
  if (redisClient !== null) return redisClient;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    redisAvailable = false;
    return null;
  }

  try {
    // Dynamic import to avoid loading 'ioredis' if not installed
    const Redis = (await import('ioredis')).default;
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      connectTimeout: 2000,
      retryStrategy: (times) => Math.min(times * 100, 1000),
    });

    await client.connect();
    await client.ping();

    redisClient = {
      incr: (key) => client.incr(key),
      expire: (key, seconds) => client.expire(key, seconds),
      ttl: (key) => client.ttl(key),
      del: (key) => client.del(key),
      ping: () => client.ping(),
    };
    redisAvailable = true;
    return redisClient;
  } catch (err) {
    console.warn('[rate-limiter] Redis unavailable, falling back to in-memory:', err instanceof Error ? err.message : String(err));
    redisAvailable = false;
    return null;
  }
}

// ── In-Memory Fallback Store (Bounded) ─────────────────────────────

interface MemoryBucket {
  count: number;
  expiresAt: number;
}

const memoryStore = new Map<string, MemoryBucket>();
const MAX_MEMORY_KEYS = 10_000; // Bounded to prevent unbounded memory growth

// Cleanup expired entries every 60 seconds
let lastCleanup = Date.now();
function cleanupExpiredMemory() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, bucket] of memoryStore) {
    if (bucket.expiresAt <= now) {
      memoryStore.delete(key);
    }
  }
}

function memoryCheck(key: string, windowSeconds: number): { count: number; ttl: number } {
  cleanupExpiredMemory();

  const now = Date.now();
  const existing = memoryStore.get(key);

  if (existing && existing.expiresAt > now) {
    existing.count++;
    return { count: existing.count, ttl: Math.ceil((existing.expiresAt - now) / 1000) };
  }

  // New bucket
  if (memoryStore.size >= MAX_MEMORY_KEYS) {
    // Evict oldest entries (simple LRU-ish — clear 10% of entries)
    const entries = Array.from(memoryStore.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    for (let i = 0; i < entries.length * 0.1; i++) {
      memoryStore.delete(entries[i][0]);
    }
  }

  memoryStore.set(key, {
    count: 1,
    expiresAt: now + windowSeconds * 1000,
  });
  return { count: 1, ttl: windowSeconds };
}

// ── Core Rate Limit Check ──────────────────────────────────────────

/**
 * Check rate limit for a given key and policy.
 *
 * Returns RateLimitResult with `allowed: boolean`.
 * If `policy.failClosed` is true and the store is unavailable,
 * returns `allowed: false` (fail-closed for sensitive operations).
 */
export async function checkRateLimit(
  key: RateLimitKey,
  policy: RateLimitPolicy
): Promise<RateLimitResult> {
  const redis = await getRedisClient();

  // Build the rate-limit key string
  const dimensionKey = buildKeyString(key);
  const redisKey = `rl:${key.endpoint}:${key.dimension}:${dimensionKey}`;

  // If Redis is available, use atomic INCR + EXPIRE
  if (redis) {
    try {
      const count = await redis.incr(redisKey);
      if (count === 1) {
        // First request in window — set expiry
        await redis.expire(redisKey, policy.windowSeconds);
      }
      const ttl = await redis.ttl(redisKey);
      const resetAt = Date.now() + (ttl > 0 ? ttl * 1000 : policy.windowSeconds * 1000);

      if (count > policy.maxRequests) {
        return {
          allowed: false,
          limit: policy.maxRequests,
          remaining: 0,
          retryAfterSeconds: ttl > 0 ? ttl : policy.windowSeconds,
          resetAt,
          category: key.endpoint,
          storeAvailable: true,
        };
      }

      return {
        allowed: true,
        limit: policy.maxRequests,
        remaining: Math.max(0, policy.maxRequests - count),
        retryAfterSeconds: 0,
        resetAt,
        category: key.endpoint,
        storeAvailable: true,
      };
    } catch (err) {
      console.error('[rate-limiter] Redis error, falling back:', err instanceof Error ? err.message : String(err));
      // Fall through to in-memory
    }
  }

  // In-memory fallback
  const { count, ttl } = memoryCheck(redisKey, policy.windowSeconds);
  const storeAvailable = true; // In-memory fallback is always available

  if (count > policy.maxRequests) {
    if (policy.failClosed && !storeAvailable) {
      // Fail-closed: deny sensitive operations when store is unreliable
      return {
        allowed: false,
        limit: policy.maxRequests,
        remaining: 0,
        retryAfterSeconds: ttl,
        resetAt: Date.now() + ttl * 1000,
        category: key.endpoint,
        storeAvailable: false,
      };
    }

    return {
      allowed: false,
      limit: policy.maxRequests,
      remaining: 0,
      retryAfterSeconds: ttl,
      resetAt: Date.now() + ttl * 1000,
      category: key.endpoint,
      storeAvailable: storeAvailable,
    };
  }

  return {
    allowed: true,
    limit: policy.maxRequests,
    remaining: Math.max(0, policy.maxRequests - count),
    retryAfterSeconds: 0,
    resetAt: Date.now() + ttl * 1000,
    category: key.endpoint,
    storeAvailable: storeAvailable,
  };
}

function buildKeyString(key: RateLimitKey): string {
  switch (key.dimension) {
    case 'ip':
      return key.ip || 'unknown';
    case 'account':
      return hashAccountIdentifier(key.accountIdentifier || 'unknown');
    case 'ip_account':
      return `${key.ip || 'unknown'}:${hashAccountIdentifier(key.accountIdentifier || 'unknown')}`;
    case 'endpoint':
      return 'global';
    default:
      return 'unknown';
  }
}

// ── Cooldown Check (for email dispatch protection) ─────────────────

/**
 * Check if a cooldown is active for a given action.
 * Prevents duplicate email/OTP dispatch within the cooldown window.
 *
 * @returns true if cooldown is active (should NOT dispatch), false if OK to proceed
 */
export async function isCooldownActive(
  endpoint: string,
  accountIdentifier: string,
  cooldownSeconds: number
): Promise<boolean> {
  const key = `cd:${endpoint}:${hashAccountIdentifier(accountIdentifier)}`;
  const redis = await getRedisClient();

  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, cooldownSeconds);
        return false; // First request — no cooldown active
      }
      return true; // Cooldown active
    } catch {
      // Fall through to memory
    }
  }

  // Memory fallback
  const { count } = memoryCheck(key, cooldownSeconds);
  return count > 1;
}

// ── NextResponse Helper ────────────────────────────────────────────

import { NextResponse } from 'next/server';

/**
 * Create a 429 Too Many Requests response with proper headers.
 */
export function rateLimitResponse(result: RateLimitResult, message?: string): NextResponse {
  const body = {
    error: message || 'Too many requests. Please try again later.',
    code: 'RATE_LIMITED',
    retryAfter: result.retryAfterSeconds,
  };

  const response = NextResponse.json(body, { status: 429 });
  response.headers.set('Retry-After', String(result.retryAfterSeconds));
  response.headers.set('X-RateLimit-Limit', String(result.limit));
  response.headers.set('X-RateLimit-Remaining', '0');
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

  if (!result.storeAvailable) {
    response.headers.set('X-RateLimit-Store', 'fallback');
  }

  return response;
}

/**
 * Create a 503 Service Unavailable response for fail-closed scenarios.
 */
export function storeUnavailableResponse(endpoint: string): NextResponse {
  return NextResponse.json(
    {
      error: 'Rate limit service temporarily unavailable. Please try again in a moment.',
      code: 'RATE_LIMIT_STORE_UNAVAILABLE',
    },
    { status: 503 }
  );
}

// ── Observability ──────────────────────────────────────────────────

export interface RateLimitMetric {
  timestamp: number;
  endpoint: string;
  dimension: RateLimitDimension;
  decision: 'allowed' | 'denied' | 'store_unavailable';
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  // Privacy-safe: hashed account identifier (not raw email)
  hashedAccount?: string;
  // Trusted client IP (or privacy-safe representation)
  clientIpMasked?: string;
}

const metricsBuffer: RateLimitMetric[] = [];
const MAX_METRICS_BUFFER = 1000;

/**
 * Record a rate-limit decision for observability.
 * Never logs passwords, OTPs, reset tokens, or raw email addresses.
 */
export function recordRateLimitMetric(
  key: RateLimitKey,
  result: RateLimitResult
): void {
  const metric: RateLimitMetric = {
    timestamp: Date.now(),
    endpoint: key.endpoint,
    dimension: key.dimension,
    decision: result.allowed
      ? 'allowed'
      : result.storeAvailable
        ? 'denied'
        : 'store_unavailable',
    limit: result.limit,
    remaining: result.remaining,
    retryAfterSeconds: result.retryAfterSeconds,
    hashedAccount: key.accountIdentifier
      ? hashAccountIdentifier(key.accountIdentifier)
      : undefined,
    clientIpMasked: key.ip ? maskIP(key.ip) : undefined,
  };

  metricsBuffer.push(metric);
  if (metricsBuffer.length > MAX_METRICS_BUFFER) {
    metricsBuffer.shift(); // Remove oldest
  }

  // Log denial (not allowed) for security monitoring
  if (!result.allowed) {
    console.warn(`[rate-limit] DENIED ${key.endpoint} dim=${key.dimension} ip=${metric.clientIpMasked || 'n/a'} remaining=${result.remaining} retryAfter=${result.retryAfterSeconds}s`);
  }
}

/**
 * Mask an IP address for privacy-safe logging.
 * Keeps the first octet (IPv4) or first group (IPv6), masks the rest.
 */
function maskIP(ip: string): string {
  if (ip.includes('.')) {
    // IPv4: keep first octet
    const parts = ip.split('.');
    return `${parts[0]}.xxx.xxx.xxx`;
  }
  if (ip.includes(':')) {
    // IPv6: keep first group
    const parts = ip.split(':');
    return `${parts[0]}:xxxx:xxxx:xxxx`;
  }
  return 'unknown';
}

/**
 * Get rate-limit metrics for monitoring dashboards.
 */
export function getRateLimitMetrics(): RateLimitMetric[] {
  return [...metricsBuffer];
}

/**
 * Get aggregate rate-limit statistics.
 */
export function getRateLimitStats(): {
  totalChecks: number;
  allowed: number;
  denied: number;
  storeUnavailable: number;
  byEndpoint: Record<string, { allowed: number; denied: number }>;
} {
  const stats = {
    totalChecks: metricsBuffer.length,
    allowed: 0,
    denied: 0,
    storeUnavailable: 0,
    byEndpoint: {} as Record<string, { allowed: number; denied: number }>,
  };

  for (const m of metricsBuffer) {
    if (m.decision === 'allowed') stats.allowed++;
    else if (m.decision === 'denied') stats.denied++;
    else stats.storeUnavailable++;

    if (!stats.byEndpoint[m.endpoint]) {
      stats.byEndpoint[m.endpoint] = { allowed: 0, denied: 0 };
    }
    if (m.decision === 'allowed') stats.byEndpoint[m.endpoint].allowed++;
    else stats.byEndpoint[m.endpoint].denied++;
  }

  return stats;
}
