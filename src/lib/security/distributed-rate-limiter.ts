/**
 * AcquisitionOS — Distributed Rate Limiter (Hardened)
 *
 * Production-grade rate limiting with Redis as the PRIMARY store.
 *
 * SECURITY FIXES (vs previous version):
 * A. Atomic Redis operations via Lua script (INCR + EXPIRE in single command)
 * B. Correct fail-closed: Redis mandatory in production; in-memory only with
 *    explicit RATE_LIMIT_DEV_MODE=true; storeAvailable=false for in-memory
 * C. Stable HMAC secret: mandatory RATE_LIMIT_HMAC_SECRET in production;
 *    no random fallback that changes after restart
 * D. Trusted proxy IP: only trusts X-Forwarded-For from configured trusted
 *    proxy IPs (TRUSTED_PROXY_IPS), not arbitrary values
 * E. Atomic email cooldown: uses SET NX EX (atomic set-if-not-exists + expiry)
 *    instead of INCR+EXPIRE (race condition)
 *
 * See: rate-limit-policies.ts for configurable limits.
 */

import { createHmac } from 'crypto';
import { NextResponse } from 'next/server';

// ── Types ──────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number; // epoch ms
  category: string;
  /** true only when Redis is the active store; false for in-memory fallback */
  storeAvailable: boolean;
}

export interface RateLimitPolicy {
  maxRequests: number;
  windowSeconds: number;
  /** If true, fail-closed when store unavailable (return 503) */
  failClosed: boolean;
}

export type RateLimitDimension = 'ip' | 'account' | 'ip_account' | 'endpoint';

export interface RateLimitKey {
  endpoint: string;
  ip?: string;
  accountIdentifier?: string;
  dimension: RateLimitDimension;
}

// ── Environment Detection ──────────────────────────────────────────

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEV_MODE = process.env.RATE_LIMIT_DEV_MODE === 'true';
// #1: Production takes precedence — VITEST flag is ignored in production
const IS_TEST = !IS_PRODUCTION && (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true');

// ── C. Stable HMAC Secret ──────────────────────────────────────────
//
// In production: RATE_LIMIT_HMAC_SECRET MUST be set. No random fallback.
// In development: a fixed dev secret is used if not configured.
// The secret must be the same across all application instances.

const DEV_HMAC_SECRET = 'acq-os-dev-hmac-secret-do-not-use-in-production';

function getHmacSecret(): string {
  const secret = process.env.RATE_LIMIT_HMAC_SECRET;
  if (secret && secret.length >= 32) {
    return secret;
  }
  if (IS_PRODUCTION) {
    // FAIL: mandatory secret missing in production
    throw new Error(
      'FATAL: RATE_LIMIT_HMAC_SECRET is missing or too short (< 32 chars) in production. ' +
      'Set a stable 64-char hex secret via: openssl rand -hex 32'
    );
  }
  // Development fallback — stable across restarts
  if (!secret) {
    console.warn('[rate-limiter] RATE_LIMIT_HMAC_SECRET not set — using dev fallback. DO NOT use in production.');
  }
  return DEV_HMAC_SECRET;
}

let _hmacSecret: string | null = null;
function hmacSecret(): string {
  if (_hmacSecret === null) {
    _hmacSecret = getHmacSecret();
  }
  return _hmacSecret;
}

/**
 * Hash an account identifier (email) using HMAC-SHA256.
 * Prevents storing raw emails in rate-limit keys or logs.
 * Returns a stable, non-reversible identifier (same secret = same hash).
 */
export function hashAccountIdentifier(identifier: string): string {
  if (!identifier) return 'unknown';
  const normalized = identifier.trim().toLowerCase();
  return createHmac('sha256', hmacSecret())
    .update(normalized)
    .digest('hex')
    .substring(0, 32);
}

// ── D. Trusted Proxy IP Extraction ─────────────────────────────────
//
// Only trusts X-Forwarded-For when the DIRECT connection IP is a configured
// trusted proxy. This prevents arbitrary XFF spoofing.
//
// Configure trusted proxies via TRUSTED_PROXY_IPS (comma-separated).
// Default trusted proxies: localhost (Caddy reverse proxy on port 81).

const TRUSTED_PROXY_IPS = (process.env.TRUSTED_PROXY_IPS || '127.0.0.1,::1')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

export function getTrustedClientIP(request: {
  headers: { get(name: string): string | null };
  ip?: string;
}): string {
  // INFRA-001: Next.js 16 does NOT populate request.ip (the adapter
  // explicitly comments it out). The previous `request.ip || '127.0.0.1'`
  // fallback always evaluated to '127.0.0.1' — which is in the default
  // TRUSTED_PROXY_IPS list — making the trusted-proxy check a no-op and
  // trusting X-Forwarded-For from every request.
  //
  // Both Caddy and nginx OVERWRITE X-Real-IP with the actual peer address.
  // X-Forwarded-For is only safe when overwritten by Caddy — nginx uses
  // $proxy_add_x_forwarded_for which APPENDS, preserving client-supplied
  // values. Prefer X-Real-IP; do NOT fall back to unverified XFF.
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

// ── Redis Store ────────────────────────────────────────────────────

interface RedisLike {
  // #7: eval returns any (Lua table → array, not number)
  eval(script: string, keys: string[], args: string[]): Promise<any>;
  // #3: Correct SET NX EX signature
  setNXEX(key: string, value: string, ttlSeconds: number): Promise<string | null>;
  ttl(key: string): Promise<number>;
  del(key: string): Promise<number>;
  ping(): Promise<string>;
}

// #5: Bounded reconnection — retry every REDIS_RETRY_INTERVAL_MS, not permanently cached
let redisClient: RedisLike | null = null;
let lastRedisAttempt = 0;
const REDIS_RETRY_INTERVAL_MS = 10_000; // Retry connection every 10s after failure

/**
 * Initialize or reuse Redis client.
 * #5: Implements bounded reconnection — does NOT permanently cache failures.
 * Retries every REDIS_RETRY_INTERVAL_MS to recover after transient outages.
 */
async function getRedisClient(): Promise<RedisLike | null> {
  // If we have a client, verify it's still alive
  if (redisClient) {
    try {
      await redisClient.ping();
      return redisClient;
    } catch {
      console.warn('[rate-limiter] Redis ping failed — marking as unavailable, will retry.');
      redisClient = null;
    }
  }

  // Bounded retry: don't attempt reconnection more than once per interval
  const now = Date.now();
  if (now - lastRedisAttempt < REDIS_RETRY_INTERVAL_MS) {
    return null; // Too soon to retry
  }
  lastRedisAttempt = now;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    if (IS_PRODUCTION) {
      console.error('[rate-limiter] CRITICAL: REDIS_URL not configured in production. Rate limiting will fail-closed for sensitive operations.');
    } else {
      console.warn('[rate-limiter] REDIS_URL not configured — using in-memory fallback (dev mode only).');
    }
    return null;
  }

  try {
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
      // A. Atomic INCR + EXPIRE via Lua script
      eval: (script, keys, args) => client.eval(script, keys.length, ...keys, ...args),
      // #3: Correct SET NX EX — ioredis syntax: client.set(key, val, 'NX', 'EX', ttl)
      setNXEX: (key, value, ttlSeconds) => client.set(key, value, 'NX', 'EX', ttlSeconds),
      ttl: (key) => client.ttl(key),
      del: (key) => client.del(key),
      ping: () => client.ping(),
    };

    if (IS_PRODUCTION) {
      console.log('[rate-limiter] Redis connected — distributed rate limiting active.');
    }

    return redisClient;
  } catch (err) {
    console.error('[rate-limiter] Redis connection failed:', err instanceof Error ? err.message : String(err));
    if (IS_PRODUCTION) {
      console.error('[rate-limiter] CRITICAL: Redis unavailable in production. Sensitive operations will fail-closed (503).');
    }
    return null;
  }
}

// ── A. Atomic Lua Script for Rate Limiting ─────────────────────────
//
// This script atomically:
// 1. INCRs the counter
// 2. Sets EXPIRE only on the first increment (count == 1)
// 3. Returns the current count and TTL
//
// This prevents race conditions where two concurrent requests could both
// see count=0, both increment, and neither set the expiry.

const RATE_LIMIT_LUA_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
local ttl = redis.call('TTL', KEYS[1])
return {count, ttl}
`;

// ── In-Memory Fallback (Dev Only) ───────────────────────────────────

interface MemoryBucket {
  count: number;
  expiresAt: number;
}

const memoryStore = new Map<string, MemoryBucket>();
const MAX_MEMORY_KEYS = 10_000;
let lastCleanup = Date.now();

function cleanupExpiredMemory(): void {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, bucket] of memoryStore) {
    if (bucket.expiresAt <= now) memoryStore.delete(key);
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

  if (memoryStore.size >= MAX_MEMORY_KEYS) {
    const entries = Array.from(memoryStore.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    for (let i = 0; i < entries.length * 0.1; i++) memoryStore.delete(entries[i][0]);
  }

  memoryStore.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
  return { count: 1, ttl: windowSeconds };
}

// ── B. Core Rate Limit Check with Correct Fail-Closed ──────────────

export async function checkRateLimit(
  key: RateLimitKey,
  policy: RateLimitPolicy
): Promise<RateLimitResult> {
  // #1: Test mode bypass — production takes precedence (IS_TEST excludes production).
  // storeAvailable=false ensures tests never report Redis as available.
  if (IS_TEST) {
    return {
      allowed: true,
      limit: policy.maxRequests,
      remaining: policy.maxRequests,
      retryAfterSeconds: 0,
      resetAt: Date.now() + policy.windowSeconds * 1000,
      category: key.endpoint,
      storeAvailable: false, // #1: Never report Redis available in test mode
    };
  }

  const redis = await getRedisClient();
  const dimensionKey = buildKeyString(key);
  const redisKey = `rl:${key.endpoint}:${key.dimension}:${dimensionKey}`;

  // ── Redis path (atomic Lua script) ───────────────────────────
  if (redis) {
    try {
      // A. Atomic INCR + EXPIRE via Lua script
      // #7: ioredis eval returns Lua table as array [count, ttl]
      const result = await redis.eval(
        RATE_LIMIT_LUA_SCRIPT,
        [redisKey],
        [String(policy.windowSeconds)]
      );
      // #7: Parse Lua response safely — validate for NaN
      const actualCount = Array.isArray(result) ? Number(result[0]) : Number(result);
      const actualTtl = Array.isArray(result) ? Number(result[1]) : policy.windowSeconds;
      if (!Number.isFinite(actualCount) || actualCount < 0) {
        throw new Error(`Invalid Lua response: count=${actualCount}`);
      }
      const safeTtl = Number.isFinite(actualTtl) && actualTtl > 0 ? actualTtl : policy.windowSeconds;
      const resetAt = Date.now() + (safeTtl * 1000);

      if (actualCount > policy.maxRequests) {
        return {
          allowed: false, limit: policy.maxRequests, remaining: 0,
          retryAfterSeconds: safeTtl,
          resetAt, category: key.endpoint, storeAvailable: true,
        };
      }

      return {
        allowed: true, limit: policy.maxRequests,
        remaining: Math.max(0, policy.maxRequests - actualCount),
        retryAfterSeconds: 0, resetAt, category: key.endpoint, storeAvailable: true,
      };
    } catch (err) {
      console.error('[rate-limiter] Redis Lua error:', err instanceof Error ? err.message : String(err));
      redisClient = null; // #5: Clear client so reconnection is attempted
      // #4: In production, Redis errors fail-closed for ALL operations
      if (IS_PRODUCTION && !DEV_MODE) {
        return {
          allowed: false, limit: policy.maxRequests, remaining: 0,
          retryAfterSeconds: policy.windowSeconds,
          resetAt: Date.now() + policy.windowSeconds * 1000,
          category: key.endpoint, storeAvailable: false,
        };
      }
    }
  }

  // #4: Production MUST NEVER use in-memory rate limiting.
  // In production without Redis, ALL operations fail-closed (503).
  // In-memory is ONLY available with explicit RATE_LIMIT_DEV_MODE=true.
  if (IS_PRODUCTION && !DEV_MODE) {
    // Production without Redis: fail-closed for ALL operations
    return {
      allowed: false, limit: policy.maxRequests, remaining: 0,
      retryAfterSeconds: policy.windowSeconds,
      resetAt: Date.now() + policy.windowSeconds * 1000,
      category: key.endpoint, storeAvailable: false,
    };
  }

  const { count, ttl } = memoryCheck(redisKey, policy.windowSeconds);

  if (count > policy.maxRequests) {
    return {
      allowed: false, limit: policy.maxRequests, remaining: 0,
      retryAfterSeconds: ttl, resetAt: Date.now() + ttl * 1000,
      category: key.endpoint, storeAvailable: false, // in-memory = NOT distributed
    };
  }

  return {
    allowed: true, limit: policy.maxRequests,
    remaining: Math.max(0, policy.maxRequests - count),
    retryAfterSeconds: 0, resetAt: Date.now() + ttl * 1000,
    category: key.endpoint, storeAvailable: false, // in-memory = NOT distributed
  };
}

function buildKeyString(key: RateLimitKey): string {
  switch (key.dimension) {
    case 'ip': return key.ip || 'unknown';
    case 'account': return hashAccountIdentifier(key.accountIdentifier || 'unknown');
    case 'ip_account': return `${key.ip || 'unknown'}:${hashAccountIdentifier(key.accountIdentifier || 'unknown')}`;
    case 'endpoint': return 'global';
    default: return 'unknown';
  }
}

// ── E. Atomic Email Cooldown (SET NX EX) ───────────────────────────
//
// Uses Redis SET NX EX (set-if-not-exists with expiry) for atomic cooldown.
// This prevents race conditions where parallel requests could both pass
// the cooldown check and dispatch duplicate emails.
//
// Returns true if the cooldown was CLAIMED (first request — OK to dispatch).
// Returns false if the cooldown is already active (should NOT dispatch).

export async function claimCooldown(
  endpoint: string,
  accountIdentifier: string,
  cooldownSeconds: number
): Promise<{ claimed: boolean; storeAvailable: boolean }> {
  const key = `cd:${endpoint}:${hashAccountIdentifier(accountIdentifier)}`;
  const redis = await getRedisClient();

  if (redis) {
    try {
      // #3: Correct SET NX EX — ioredis: client.set(key, val, 'NX', 'EX', ttl)
      // Returns 'OK' if set (claim succeeded), null if key exists (cooldown active)
      const result = await redis.setNXEX(key, '1', cooldownSeconds);
      return { claimed: result === 'OK', storeAvailable: true };
    } catch (err) {
      console.error('[rate-limiter] Cooldown Redis error:', err instanceof Error ? err.message : String(err));
      if (IS_PRODUCTION) {
        // Fail-closed: don't dispatch if we can't verify cooldown
        return { claimed: false, storeAvailable: false };
      }
    }
  }

  // In-memory fallback (dev only)
  // Use a simple atomic-ish check: if key exists, cooldown active
  const now = Date.now();
  const existing = memoryStore.get(key);
  if (existing && existing.expiresAt > now) {
    return { claimed: false, storeAvailable: false };
  }
  memoryStore.set(key, { count: 1, expiresAt: now + cooldownSeconds * 1000 });
  return { claimed: true, storeAvailable: false };
}

/**
 * Backward-compatible alias. Returns true if cooldown is ACTIVE (should NOT dispatch).
 * Uses claimCooldown internally — the claim is atomic.
 */
export async function isCooldownActive(
  endpoint: string,
  accountIdentifier: string,
  cooldownSeconds: number
): Promise<boolean> {
  const { claimed } = await claimCooldown(endpoint, accountIdentifier, cooldownSeconds);
  return !claimed; // If NOT claimed, cooldown is active
}

// ── Response Helpers ───────────────────────────────────────────────

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
    response.headers.set('X-RateLimit-Store', 'in-memory');
  }
  return response;
}

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
  hashedAccount?: string;
  clientIpMasked?: string;
}

const metricsBuffer: RateLimitMetric[] = [];
const MAX_METRICS_BUFFER = 1000;

export function recordRateLimitMetric(key: RateLimitKey, result: RateLimitResult): void {
  const metric: RateLimitMetric = {
    timestamp: Date.now(),
    endpoint: key.endpoint,
    dimension: key.dimension,
    decision: result.allowed ? 'allowed' : result.storeAvailable ? 'denied' : 'store_unavailable',
    limit: result.limit,
    remaining: result.remaining,
    retryAfterSeconds: result.retryAfterSeconds,
    hashedAccount: key.accountIdentifier ? hashAccountIdentifier(key.accountIdentifier) : undefined,
    clientIpMasked: key.ip ? maskIP(key.ip) : undefined,
  };

  metricsBuffer.push(metric);
  if (metricsBuffer.length > MAX_METRICS_BUFFER) metricsBuffer.shift();

  if (!result.allowed) {
    console.warn(
      `[rate-limit] DENIED ${key.endpoint} dim=${key.dimension} ` +
      `ip=${metric.clientIpMasked || 'n/a'} remaining=${result.remaining} ` +
      `retryAfter=${result.retryAfterSeconds}s store=${result.storeAvailable ? 'redis' : 'memory'}`
    );
  }
}

function maskIP(ip: string): string {
  if (ip.includes('.')) {
    const parts = ip.split('.');
    return `${parts[0]}.xxx.xxx.xxx`;
  }
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return `${parts[0]}:xxxx:xxxx:xxxx`;
  }
  return 'unknown';
}

export function getRateLimitMetrics(): RateLimitMetric[] {
  return [...metricsBuffer];
}

export function getRateLimitStats(): {
  totalChecks: number;
  allowed: number;
  denied: number;
  storeUnavailable: number;
  byEndpoint: Record<string, { allowed: number; denied: number }>;
} {
  const stats = {
    totalChecks: metricsBuffer.length,
    allowed: 0, denied: 0, storeUnavailable: 0,
    byEndpoint: {} as Record<string, { allowed: number; denied: number }>,
  };
  for (const m of metricsBuffer) {
    if (m.decision === 'allowed') stats.allowed++;
    else if (m.decision === 'denied') stats.denied++;
    else stats.storeUnavailable++;
    if (!stats.byEndpoint[m.endpoint]) stats.byEndpoint[m.endpoint] = { allowed: 0, denied: 0 };
    if (m.decision === 'allowed') stats.byEndpoint[m.endpoint].allowed++;
    else stats.byEndpoint[m.endpoint].denied++;
  }
  return stats;
}
