// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Proxy Rotation Service
// Phase 7 Remediation: Lead engine fixes
//
// Manages a pool of proxy endpoints with health tracking,
// rotation strategies, rate limiting, and auto-removal of unhealthy proxies.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ===== TYPES =====

export type ProxyType = 'datacenter' | 'residential' | 'mobile' | 'isp';
export type RotationStrategy = 'round-robin' | 'random' | 'least-used' | 'least-latency';

export interface ProxyEndpoint {
  id: string;
  url: string;
  type: ProxyType;
  isActive: boolean;
  successRate: number;
  avgLatency: number;
  lastUsedAt: Date | null;
  failureCount: number;
  totalRequests: number;
  successCount: number;
  lastError: string | null;
  rateLimitPerMinute: number;
  currentMinuteRequests: number;
  minuteResetAt: Date | null;
  country?: string;
  provider?: string;
}

export interface ProxyPoolStatus {
  total: number;
  active: number;
  unhealthy: number;
  residential: number;
  datacenter: number;
  avgLatency: number;
  avgSuccessRate: number;
  totalRequestsToday: number;
}

// ===== IN-MEMORY STATE =====

// Round-robin index for rotation
let roundRobinIndex = 0;

// In-memory rate limit counters (reset per minute)
const rateLimitCounters = new Map<string, { count: number; resetAt: number }>();

// Cache for proxy pool (refreshed periodically)
let proxyCache: ProxyEndpoint[] = [];
let proxyCacheExpiry = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

// ===== CONSTANTS =====

const UNHEALTHY_THRESHOLD_SUCCESS_RATE = 0.3; // Below 30% success = unhealthy
const UNHEALTHY_THRESHOLD_FAILURES = 10; // More than 10 consecutive failures
const AUTO_REMOVE_AFTER_FAILURES = 25; // Auto-remove after 25 failures
const DEFAULT_RATE_LIMIT = 60; // 60 requests per minute per proxy

// ===== CORE FUNCTIONS =====

/**
 * Get the next proxy based on the configured rotation strategy.
 * Respects rate limits and skips unhealthy proxies.
 */
export async function getNextProxy(
  strategy: RotationStrategy = 'round-robin'
): Promise<ProxyEndpoint | null> {
  const pool = await getActiveProxyPool();

  if (pool.length === 0) {
    console.warn('[ProxyRotation] No active proxies available');
    return null;
  }

  // Filter out rate-limited proxies
  const available = pool.filter((p) => !isProxyRateLimited(p));

  if (available.length === 0) {
    console.warn('[ProxyRotation] All proxies rate-limited, using least-used');
    // Fall back to least-used strategy among all active
    return getLeastUsedProxy(pool);
  }

  let selected: ProxyEndpoint | null = null;

  switch (strategy) {
    case 'round-robin':
      selected = getRoundRobinProxy(available);
      break;
    case 'random':
      selected = getRandomProxy(available);
      break;
    case 'least-used':
      selected = getLeastUsedProxy(available);
      break;
    case 'least-latency':
      selected = getLeastLatencyProxy(available);
      break;
    default:
      selected = getRoundRobinProxy(available);
  }

  // Update last used timestamp and rate counter
  if (selected) {
    await markProxyUsed(selected.id);
    incrementRateCounter(selected.id);
  }

  return selected;
}

/**
 * Mark a proxy as healthy after a successful request.
 */
export async function markProxyHealthy(proxyId: string, latencyMs: number): Promise<void> {
  try {
    const proxy = await db.proxyEndpoint.findUnique({ where: { id: proxyId } });
    if (!proxy) return;

    const newTotal = proxy.totalRequests + 1;
    const newSuccess = proxy.successCount + 1;
    const newSuccessRate = newSuccess / newTotal;
    // Running average of latency
    const newAvgLatency = proxy.avgLatency === 0
      ? latencyMs
      : Math.round((proxy.avgLatency * proxy.totalRequests + latencyMs) / newTotal);

    await db.proxyEndpoint.update({
      where: { id: proxyId },
      data: {
        successCount: newSuccess,
        totalRequests: newTotal,
        successRate: newSuccessRate,
        avgLatency: newAvgLatency,
        failureCount: 0, // Reset consecutive failure count
        lastUsedAt: new Date(),
        lastError: null,
        isActive: true, // Re-activate if was previously marked unhealthy
      },
    });
  } catch (error) {
    console.error('[ProxyRotation] Failed to mark proxy healthy:', error);
  }
}

/**
 * Mark a proxy as unhealthy after a failed request.
 * Auto-removes if failure count exceeds threshold.
 */
export async function markProxyUnhealthy(proxyId: string, error: string): Promise<void> {
  try {
    const proxy = await db.proxyEndpoint.findUnique({ where: { id: proxyId } });
    if (!proxy) return;

    const newFailures = proxy.failureCount + 1;
    const newTotal = proxy.totalRequests + 1;
    const newSuccessRate = newTotal > 0 ? proxy.successCount / newTotal : 0;

    const shouldDeactivate = newFailures >= UNHEALTHY_THRESHOLD_FAILURES
      || newSuccessRate < UNHEALTHY_THRESHOLD_SUCCESS_RATE;

    const shouldRemove = newFailures >= AUTO_REMOVE_AFTER_FAILURES;

    if (shouldRemove) {
      await db.proxyEndpoint.delete({ where: { id: proxyId } });
      console.warn(`[ProxyRotation] Auto-removed proxy ${proxyId} after ${newFailures} failures`);
    } else {
      await db.proxyEndpoint.update({
        where: { id: proxyId },
        data: {
          totalRequests: newTotal,
          successRate: newSuccessRate,
          failureCount: newFailures,
          lastError: error.substring(0, 500),
          lastUsedAt: new Date(),
          isActive: !shouldDeactivate,
        },
      });

      if (shouldDeactivate) {
        console.warn(`[ProxyRotation] Deactivated proxy ${proxyId} (failures: ${newFailures}, successRate: ${newSuccessRate.toFixed(2)})`);
      }
    }
  } catch (err) {
    console.error('[ProxyRotation] Failed to mark proxy unhealthy:', err);
  }
}

/**
 * Get the overall proxy pool status.
 */
export async function getProxyPoolStatus(): Promise<ProxyPoolStatus> {
  const proxies = await db.proxyEndpoint.findMany();
  const active = proxies.filter((p) => p.isActive);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const totalRequestsToday = proxies.reduce((sum, p) => {
    return sum + (p.lastUsedAt && p.lastUsedAt >= todayStart ? 1 : 0);
  }, 0);

  return {
    total: proxies.length,
    active: active.length,
    unhealthy: proxies.filter((p) => !p.isActive).length,
    residential: proxies.filter((p) => p.type === 'residential').length,
    datacenter: proxies.filter((p) => p.type === 'datacenter').length,
    avgLatency: active.length > 0
      ? Math.round(active.reduce((sum, p) => sum + p.avgLatency, 0) / active.length)
      : 0,
    avgSuccessRate: active.length > 0
      ? active.reduce((sum, p) => sum + p.successRate, 0) / active.length
      : 0,
    totalRequestsToday,
  };
}

/**
 * Add a new proxy to the pool.
 */
export async function addProxy(config: {
  url: string;
  type: ProxyType;
  rateLimitPerMinute?: number;
  country?: string;
  provider?: string;
}): Promise<ProxyEndpoint> {
  const proxy = await db.proxyEndpoint.create({
    data: {
      url: config.url,
      type: config.type,
      isActive: true,
      successRate: 1.0,
      avgLatency: 0,
      lastUsedAt: null,
      failureCount: 0,
      totalRequests: 0,
      successCount: 0,
      lastError: null,
      rateLimitPerMinute: config.rateLimitPerMinute || DEFAULT_RATE_LIMIT,
      currentMinuteRequests: 0,
      minuteResetAt: null,
      country: config.country || null,
      provider: config.provider || null,
    },
  });

  // Invalidate cache
  proxyCacheExpiry = 0;

  return mapDbProxy(proxy);
}

/**
 * Remove a proxy from the pool.
 */
export async function removeProxy(proxyId: string): Promise<boolean> {
  try {
    await db.proxyEndpoint.delete({ where: { id: proxyId } });
    proxyCacheExpiry = 0;
    return true;
  } catch {
    return false;
  }
}

// ===== HELPER FUNCTIONS =====

async function getActiveProxyPool(): Promise<ProxyEndpoint[]> {
  const now = Date.now();

  if (proxyCache.length > 0 && now < proxyCacheExpiry) {
    return proxyCache;
  }

  const proxies = await db.proxyEndpoint.findMany({
    where: { isActive: true },
    orderBy: { successRate: 'desc' },
  });

  proxyCache = proxies.map(mapDbProxy);
  proxyCacheExpiry = now + CACHE_TTL_MS;

  return proxyCache;
}

function mapDbProxy(p: {
  id: string;
  url: string;
  type: string;
  isActive: boolean;
  successRate: number;
  avgLatency: number;
  lastUsedAt: Date | null;
  failureCount: number;
  totalRequests: number;
  successCount: number;
  lastError: string | null;
  rateLimitPerMinute: number;
  currentMinuteRequests: number;
  minuteResetAt: Date | null;
  country: string | null;
  provider: string | null;
}): ProxyEndpoint {
  return {
    id: p.id,
    url: p.url,
    type: p.type as ProxyType,
    isActive: p.isActive,
    successRate: p.successRate,
    avgLatency: p.avgLatency,
    lastUsedAt: p.lastUsedAt,
    failureCount: p.failureCount,
    totalRequests: p.totalRequests,
    successCount: p.successCount,
    lastError: p.lastError,
    rateLimitPerMinute: p.rateLimitPerMinute,
    currentMinuteRequests: p.currentMinuteRequests,
    minuteResetAt: p.minuteResetAt,
    country: p.country || undefined,
    provider: p.provider || undefined,
  };
}

function getRoundRobinProxy(available: ProxyEndpoint[]): ProxyEndpoint {
  roundRobinIndex = roundRobinIndex % available.length;
  const proxy = available[roundRobinIndex];
  roundRobinIndex++;
  return proxy;
}

function getRandomProxy(available: ProxyEndpoint[]): ProxyEndpoint {
  const index = Math.floor(Math.random() * available.length);
  return available[index];
}

function getLeastUsedProxy(available: ProxyEndpoint[]): ProxyEndpoint {
  return available.reduce((least, current) =>
    current.totalRequests < least.totalRequests ? current : least
  );
}

function getLeastLatencyProxy(available: ProxyEndpoint[]): ProxyEndpoint {
  // Only consider proxies with at least 1 request for meaningful latency data
  const withLatency = available.filter((p) => p.avgLatency > 0);
  const pool = withLatency.length > 0 ? withLatency : available;

  return pool.reduce((best, current) =>
    current.avgLatency < best.avgLatency ? current : best
  );
}

function isProxyRateLimited(proxy: ProxyEndpoint): boolean {
  const counter = rateLimitCounters.get(proxy.id);
  if (!counter) return false;

  const now = Date.now();
  if (now > counter.resetAt) {
    rateLimitCounters.delete(proxy.id);
    return false;
  }

  return counter.count >= proxy.rateLimitPerMinute;
}

function incrementRateCounter(proxyId: string): void {
  const now = Date.now();
  const counter = rateLimitCounters.get(proxyId);

  if (!counter || now > counter.resetAt) {
    // Start new minute window
    rateLimitCounters.set(proxyId, {
      count: 1,
      resetAt: now + 60_000,
    });
  } else {
    counter.count++;
  }
}

async function markProxyUsed(proxyId: string): Promise<void> {
  try {
    await db.proxyEndpoint.update({
      where: { id: proxyId },
      data: { lastUsedAt: new Date() },
    });
  } catch {
    // Silently fail - non-critical
  }
}
