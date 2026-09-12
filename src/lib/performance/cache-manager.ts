// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — In-Memory Cache Manager with LRU Eviction
// Phase 14.7: Cache-aside pattern, TTL, LRU, stats, memory tracking
// ═══════════════════════════════════════════════════════════════════

// ─── Types ────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  sizeBytes: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  maxSize: number;
  memoryUsageBytes: number;
  evictions: number;
}

// ─── Pre-configured TTLs ──────────────────────────────────────────

export const CACHE_TTL = {
  USER_PROFILE: 5 * 60 * 1000,     // 5 min
  SUBSCRIPTION: 2 * 60 * 1000,     // 2 min
  CREDITS: 1 * 60 * 1000,          // 1 min
  ANALYTICS: 10 * 60 * 1000,       // 10 min
  COMPETITOR_DATA: 30 * 60 * 1000, // 30 min
  LEAD_LIST: 3 * 60 * 1000,        // 3 min
  PIPELINE: 2 * 60 * 1000,         // 2 min
  OUTREACH: 5 * 60 * 1000,         // 5 min
  SETTINGS: 15 * 60 * 1000,        // 15 min
  FEATURE_FLAGS: 10 * 60 * 1000,   // 10 min
} as const;

// ─── Cache Implementation ─────────────────────────────────────────

const MAX_ENTRIES = 1000;
const cache = new Map<string, CacheEntry<unknown>>();

let statsHits = 0;
let statsMisses = 0;
let statsEvictions = 0;

/**
 * Estimate the byte size of a value for memory tracking.
 */
function estimateSize(value: unknown): number {
  const str = JSON.stringify(value);
  // Approximate: 2 bytes per char for JS string internal representation
  return str ? str.length * 2 : 0;
}

/**
 * Evict the least recently used entries when cache exceeds MAX_ENTRIES.
 */
function evictLRU(): void {
  while (cache.size > MAX_ENTRIES) {
    // Find the least recently accessed entry
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of cache) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      cache.delete(oldestKey);
      statsEvictions++;
    } else {
      break;
    }
  }
}

/**
 * Remove expired entries from the cache.
 */
function removeExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Get a value from the cache. Returns undefined if not found or expired.
 */
export function get<T>(key: string): T | undefined {
  removeExpired();

  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    statsMisses++;
    return undefined;
  }

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    statsMisses++;
    return undefined;
  }

  // Update access tracking for LRU
  entry.lastAccessedAt = Date.now();
  entry.accessCount++;
  statsHits++;

  return entry.value;
}

/**
 * Set a value in the cache with a TTL (in milliseconds).
 */
export function set<T>(key: string, value: T, ttlMs: number): void {
  removeExpired();

  const now = Date.now();
  const sizeBytes = estimateSize(value);

  cache.set(key, {
    value,
    expiresAt: now + ttlMs,
    createdAt: now,
    lastAccessedAt: now,
    accessCount: 0,
    sizeBytes,
  });

  // Evict if over capacity
  if (cache.size > MAX_ENTRIES) {
    evictLRU();
  }
}

/**
 * Invalidate cache entries matching a glob-like pattern.
 * Supports '*' as a wildcard.
 *
 * @example
 * invalidate('user:*')    — removes all keys starting with 'user:'
 * invalidate('lead:123')  — removes exact key 'lead:123'
 * invalidate('*')         — removes everything
 */
export function invalidate(pattern: string): number {
  let removed = 0;

  if (pattern === '*') {
    removed = cache.size;
    cache.clear();
    return removed;
  }

  // Convert glob pattern to regex
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars except *
    .replace(/\*/g, '.*');                  // Replace * with .*
  const regex = new RegExp(`^${regexStr}$`);

  for (const key of [...cache.keys()]) {
    if (regex.test(key)) {
      cache.delete(key);
      removed++;
    }
  }

  return removed;
}

/**
 * Clear the entire cache.
 */
export function invalidateAll(): void {
  cache.clear();
  statsHits = 0;
  statsMisses = 0;
  statsEvictions = 0;
}

/**
 * Cache-aside pattern: get from cache, or fetch and cache the result.
 */
export async function getOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number,
): Promise<T> {
  const cached = get<T>(key);
  if (cached !== undefined) {
    return cached;
  }

  const value = await fetcher();
  set(key, value, ttlMs);
  return value;
}

// ─── Statistics ───────────────────────────────────────────────────

/**
 * Get cache statistics including hit rate, memory usage, and eviction count.
 */
export function getCacheStats(): CacheStats {
  removeExpired();

  let memoryUsageBytes = 0;
  for (const entry of cache.values()) {
    memoryUsageBytes += entry.sizeBytes;
  }

  const total = statsHits + statsMisses;

  return {
    hits: statsHits,
    misses: statsMisses,
    hitRate: total > 0 ? statsHits / total : 0,
    size: cache.size,
    maxSize: MAX_ENTRIES,
    memoryUsageBytes,
    evictions: statsEvictions,
  };
}

/**
 * Get detailed info about all cache entries (for debugging).
 */
export function getCacheEntries(): Array<{
  key: string;
  createdAt: number;
  expiresAt: number;
  lastAccessedAt: number;
  accessCount: number;
  sizeBytes: number;
  isExpired: boolean;
}> {
  const now = Date.now();
  return [...cache.entries()].map(([key, entry]) => ({
    key,
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt,
    lastAccessedAt: entry.lastAccessedAt,
    accessCount: entry.accessCount,
    sizeBytes: entry.sizeBytes,
    isExpired: now > entry.expiresAt,
  }));
}

/**
 * Reset cache statistics without clearing data.
 */
export function resetCacheStats(): void {
  statsHits = 0;
  statsMisses = 0;
  statsEvictions = 0;
}
