// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — API Response Caching Middleware
// Phase 14.7: GET caching, ETag, Cache-Control, auto-invalidation
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { get as cacheGet, set as cacheSet, invalidate } from './cache-manager';

// ─── Types ────────────────────────────────────────────────────────

interface ApiCacheOptions {
  /** Cache TTL in milliseconds */
  ttlMs: number;
  /** Include user ID in cache key (default: true) */
  varyByUser?: boolean;
  /** Additional cache key parts */
  varyBy?: string[];
  /** Stale-while-revalidate window in seconds (default: 60) */
  staleWhileRevalidate?: number;
  /** Whether to add ETag header (default: true) */
  etag?: boolean;
}

interface CachedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  cachedAt: number;
}

// ─── Cache Key Generation ─────────────────────────────────────────

/**
 * Generate a deterministic cache key from the request URL, query params, and user ID.
 */
export function generateCacheKey(request: NextRequest, userId?: string, varyBy?: string[]): string {
  const url = new URL(request.url);
  const params = new URLSearchParams(url.searchParams);
  params.sort(); // Deterministic ordering

  const parts = [
    'api-cache',
    url.pathname,
    params.toString(),
  ];

  if (userId) {
    parts.push('user:' + userId);
  }

  if (varyBy) {
    parts.push(...varyBy);
  }

  return parts.join('|');
}

// ─── ETag Support ─────────────────────────────────────────────────

/**
 * Generate an ETag from a response body.
 */
function generateETag(body: string): string {
  // Simple hash — not cryptographic, just for cache comparison
  let hash = 0;
  for (let i = 0; i < body.length; i++) {
    const char = body.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return '"' + Math.abs(hash).toString(36) + '"';
}

// ─── API Cache Middleware ─────────────────────────────────────────

/**
 * Middleware for caching GET API route responses.
 *
 * @example
 * // In an API route handler:
 * export async function GET(request: NextRequest) {
 *   return withApiCache(request, async () => {
 *     const data = await db.lead.findMany({ where: { userId } });
 *     return NextResponse.json({ leads: data });
 *   }, { ttlMs: CACHE_TTL.LEAD_LIST, varyByUser: true });
 * }
 */
export async function withApiCache(
  request: NextRequest,
  handler: () => Promise<NextResponse>,
  options: ApiCacheOptions,
): Promise<NextResponse> {
  const {
    ttlMs,
    varyByUser = true,
    varyBy,
    staleWhileRevalidate = 60,
    etag: enableEtag = true,
  } = options;

  // Only cache GET requests
  if (request.method !== 'GET') {
    return handler();
  }

  const cacheKey = generateCacheKey(request, varyByUser ? undefined : undefined, varyBy);

  // Check cache
  const cached = cacheGet<CachedResponse>(cacheKey);
  if (cached) {
    // Check If-None-Match for ETag conditional request
    if (enableEtag && cached.headers['etag']) {
      const ifNoneMatch = request.headers.get('if-none-match');
      if (ifNoneMatch === cached.headers['etag']) {
        return new NextResponse(null, {
          status: 304,
          headers: {
            ETag: cached.headers['etag'],
            'Cache-Control': cached.headers['cache-control'] || '',
          },
        });
      }
    }

    // Return cached response with age header
    const age = Math.floor((Date.now() - cached.cachedAt) / 1000);
    const response = new NextResponse(cached.body, {
      status: cached.status,
      headers: {
        ...cached.headers,
        Age: age.toString(),
        'X-Cache': 'HIT',
      },
    });

    return response;
  }

  // Execute handler
  const response = await handler();

  // Only cache successful responses
  if (response.status >= 200 && response.status < 300) {
    const body = await response.text();
    const etagValue = enableEtag ? generateETag(body) : undefined;

    const maxAge = Math.floor(ttlMs / 1000);
    const cacheControl = 'public, max-age=' + maxAge + ', stale-while-revalidate=' + staleWhileRevalidate;

    const responseHeaders: Record<string, string> = {
      'Cache-Control': cacheControl,
      'X-Cache': 'MISS',
    };

    if (etagValue) {
      responseHeaders['ETag'] = etagValue;
    }

    // Store in cache
    cacheSet(cacheKey, {
      status: response.status,
      headers: responseHeaders,
      body,
      cachedAt: Date.now(),
    }, ttlMs);

    // Return the response
    return new NextResponse(body, {
      status: response.status,
      headers: responseHeaders,
    });
  }

  // Pass through non-cacheable responses
  response.headers.set('X-Cache', 'BYPASS');
  return response;
}

// ─── Cache Invalidation on Mutations ──────────────────────────────

/**
 * Invalidate API cache after a mutation (POST/PUT/DELETE).
 * Call this from your mutation handlers.
 *
 * @example
 * export async function POST(request: NextRequest) {
 *   const result = await db.lead.create({ data });
 *   invalidateApiCache('api-cache* /leads*');
 *   return NextResponse.json(result);
 * }
 */
export function invalidateApiCache(pattern: string): number {
  return invalidate(pattern);
}

/**
 * Invalidate all caches related to a specific entity.
 * Useful when an entity is updated and multiple cached endpoints are affected.
 */
export function invalidateEntity(entity: string, entityId?: string): void {
  const pattern = entityId
    ? 'api-cache*' + entity + '*' + entityId + '*'
    : 'api-cache*' + entity + '*';
  invalidate(pattern);
}

/**
 * Common cache invalidation helpers for specific entity mutations.
 */
export const CacheInvalidation = {
  onLeadChange: (leadId?: string) => invalidateEntity('leads', leadId),
  onPipelineChange: () => invalidate('api-cache*leads*api-cache*pipeline*'),
  onSubscriptionChange: (userId?: string) => {
    invalidate('api-cache*subscription*');
    if (userId) invalidate('api-cache*user*' + userId + '*');
  },
  onCreditsChange: (userId?: string) => {
    invalidate('api-cache*credits*');
    if (userId) invalidate('api-cache*user*' + userId + '*');
  },
  onSettingsChange: (userId?: string) => {
    invalidate('api-cache*settings*');
    if (userId) invalidate('api-cache*user*' + userId + '*');
  },
  onAnalyticsChange: () => invalidate('api-cache*analytics*api-cache*insights*'),
  onCompetitorChange: () => invalidate('api-cache*competitors*'),
};

// ─── Cache Headers Helper ─────────────────────────────────────────

/**
 * Generate Cache-Control header value with common configurations.
 */
export function cacheControlHeaders(options: {
  maxAge?: number;
  staleWhileRevalidate?: number;
  isPrivate?: boolean;
  noStore?: boolean;
}): Record<string, string> {
  if (options.noStore) {
    return {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
    };
  }

  const scope = options.isPrivate ? 'private' : 'public';
  const parts = [scope];

  if (options.maxAge !== undefined) {
    parts.push('max-age=' + options.maxAge);
  }

  if (options.staleWhileRevalidate !== undefined) {
    parts.push('stale-while-revalidate=' + options.staleWhileRevalidate);
  }

  return {
    'Cache-Control': parts.join(', '),
  };
}
