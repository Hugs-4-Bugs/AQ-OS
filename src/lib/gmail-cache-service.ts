// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Gmail In-Memory Cache Service
// Phase 9: Gmail Integration
// Simple Map-based cache with TTL, auto-cleanup, and pattern matching
// ═══════════════════════════════════════════════════════════════════

// ===== TYPES =====

interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number; // Unix timestamp in ms
  createdAt: number;
}

// ===== CACHE KEY PREFIXES =====

export const CachePrefix = {
  SYNC_STATUS: 'gmail:sync:',
  INBOX_LIST: 'gmail:inbox:',
  THREAD_DATA: 'gmail:thread:',
  RATE_LIMIT: 'gmail:ratelimit:',
  TOKEN_STATUS: 'gmail:token:',
  LABELS: 'gmail:labels:',
  DRAFTS: 'gmail:drafts:',
  PUBSUB: 'gmail:pubsub:',
} as const;

// ===== DEFAULT TTL VALUES =====

export const CacheTTL = {
  SYNC_STATUS: 5 * 60 * 1000,     // 5 minutes
  INBOX_LIST: 5 * 60 * 1000,      // 5 minutes
  THREAD_DATA: 5 * 60 * 1000,     // 5 minutes
  RATE_LIMIT: 60 * 1000,          // 1 minute
  TOKEN_STATUS: 5 * 60 * 1000,    // 5 minutes
  LABELS: 60 * 60 * 1000,         // 1 hour
  DRAFTS: 10 * 60 * 1000,         // 10 minutes
  PUBSUB: 30 * 60 * 1000,         // 30 minutes
  DEFAULT: 5 * 60 * 1000,         // 5 minutes
} as const;

// ===== CACHE IMPLEMENTATION =====

class GmailCache {
  private cache: Map<string, CacheEntry> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private stats = { hits: 0, misses: 0, sets: 0, deletes: 0 };

  constructor() {
    // Auto-cleanup expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);

    // Don't prevent Node.js process from exiting
    if (this.cleanupInterval && typeof this.cleanupInterval === 'object' && 'unref' in this.cleanupInterval) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Set a cache value with optional TTL.
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttlMs - Time to live in milliseconds (defaults to CacheTTL.DEFAULT)
   */
  set<T = unknown>(key: string, value: T, ttlMs?: number): void {
    const ttl = ttlMs ?? CacheTTL.DEFAULT;
    const now = Date.now();

    this.cache.set(key, {
      value,
      expiresAt: now + ttl,
      createdAt: now,
    });

    this.stats.sets++;
  }

  /**
   * Get a cache value. Returns null if not found or expired.
   * @param key - Cache key
   */
  get<T = unknown>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.value as T;
  }

  /**
   * Delete a specific cache value.
   * @param key - Cache key
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) this.stats.deletes++;
    return deleted;
  }

  /**
   * Clear cache entries matching a pattern.
   * Pattern supports trailing wildcard: "gmail:sync:*" matches all keys starting with "gmail:sync:"
   * If no pattern provided, clears entire cache.
   * @param pattern - Optional glob-like pattern with trailing *
   */
  clear(pattern?: string): number {
    if (!pattern) {
      const count = this.cache.size;
      this.cache.clear();
      this.stats.deletes += count;
      return count;
    }

    let deleted = 0;

    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      for (const key of this.cache.keys()) {
        if (key.startsWith(prefix)) {
          this.cache.delete(key);
          deleted++;
        }
      }
    } else {
      // Exact match
      if (this.cache.delete(pattern)) {
        deleted = 1;
      }
    }

    this.stats.deletes += deleted;
    return deleted;
  }

  /**
   * Check if a key exists and is not expired.
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Get remaining TTL for a key in milliseconds.
   * Returns 0 if key doesn't exist or is expired.
   */
  getTTL(key: string): number {
    const entry = this.cache.get(key);
    if (!entry) return 0;
    const remaining = entry.expiresAt - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Extend TTL for an existing key.
   */
  extend(key: string, additionalMs: number): boolean {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) return false;
    entry.expiresAt += additionalMs;
    return true;
  }

  /**
   * Get or set a cache value (compute if missing pattern).
   * @param key - Cache key
   * @param factory - Function to compute value if not in cache
   * @param ttlMs - TTL for the computed value
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlMs?: number
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }

  /**
   * Remove all expired entries from the cache.
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[GmailCache] Cleaned ${cleaned} expired entries. Cache size: ${this.cache.size}`);
    }

    return cleaned;
  }

  /**
   * Get cache statistics.
   */
  getStats(): {
    size: number;
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    hitRate: string;
  } {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      deletes: this.stats.deletes,
      hitRate: total > 0 ? `${((this.stats.hits / total) * 100).toFixed(1)}%` : '0%',
    };
  }

  /**
   * Invalidate all Gmail-related cache for a specific email account.
   * Called when account data changes (sync, new messages, etc.)
   */
  invalidateAccount(emailAccountId: string): number {
    const patterns = [
      `${CachePrefix.SYNC_STATUS}${emailAccountId}`,
      `${CachePrefix.INBOX_LIST}${emailAccountId}`,
      `${CachePrefix.THREAD_DATA}${emailAccountId}`,
      `${CachePrefix.TOKEN_STATUS}${emailAccountId}`,
      `${CachePrefix.DRAFTS}${emailAccountId}`,
      `${CachePrefix.LABELS}${emailAccountId}`,
      `${CachePrefix.PUBSUB}${emailAccountId}`,
    ];

    let total = 0;
    for (const pattern of patterns) {
      total += this.clear(`${pattern}*`);
    }
    return total;
  }

  /**
   * Destroy the cache and stop cleanup interval.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

// ===== SINGLETON INSTANCE =====

let cacheInstance: GmailCache | null = null;

/**
 * Get the singleton GmailCache instance.
 */
export function getGmailCache(): GmailCache {
  if (!cacheInstance) {
    cacheInstance = new GmailCache();
  }
  return cacheInstance;
}

/**
 * Reset the cache instance (for testing only).
 */
export function resetGmailCache(): void {
  if (cacheInstance) {
    cacheInstance.destroy();
    cacheInstance = null;
  }
}

// ===== CONVENIENCE FUNCTIONS =====

/**
 * Set a cache value using the singleton instance.
 */
export function cacheSet<T = unknown>(key: string, value: T, ttlMs?: number): void {
  getGmailCache().set(key, value, ttlMs);
}

/**
 * Get a cache value using the singleton instance.
 */
export function cacheGet<T = unknown>(key: string): T | null {
  return getGmailCache().get<T>(key);
}

/**
 * Delete a cache value using the singleton instance.
 */
export function cacheDelete(key: string): boolean {
  return getGmailCache().delete(key);
}

/**
 * Clear cache entries using the singleton instance.
 */
export function cacheClear(pattern?: string): number {
  return getGmailCache().clear(pattern);
}
