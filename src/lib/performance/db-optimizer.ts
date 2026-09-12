// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Database Performance Optimizer
// Phase 14.7: Query analysis, slow query tracking, optimization
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────

export interface QueryStat {
  query: string;
  count: number;
  totalMs: number;
  avgMs: number;
  maxMs: number;
  minMs: number;
  lastRunAt: number;
}

export interface SlowQuery {
  query: string;
  durationMs: number;
  timestamp: number;
  params?: string;
}

export interface ExplainPlan {
  sql: string;
  plan: string[];
  usesIndex: boolean;
  tableScans: string[];
}

export interface OptimizationResult {
  action: string;
  success: boolean;
  details: string;
  durationMs?: number;
}

// ─── Query Performance Tracker ────────────────────────────────────

const SLOW_QUERY_THRESHOLD_MS = 100;
const MAX_SLOW_QUERIES = 100;
const MAX_QUERY_STATS = 50;

const queryStats = new Map<string, QueryStat>();
const slowQueries: SlowQuery[] = [];

/**
 * Normalize a SQL query for stats grouping (replace params with ?)
 */
function normalizeQuery(query: string): string {
  return query
    .replace(/\s+/g, ' ')
    .replace(/'[^']*'/g, '?')
    .replace(/\d+/g, '?')
    .trim()
    .slice(0, 200);
}

/**
 * Record a query execution for performance tracking.
 * Call this around every db query you want to track.
 */
export function recordQuery(query: string, durationMs: number, params?: unknown[]): void {
  const normalized = normalizeQuery(query);
  const now = Date.now();

  // Update stats
  const existing = queryStats.get(normalized);
  if (existing) {
    existing.count++;
    existing.totalMs += durationMs;
    existing.avgMs = existing.totalMs / existing.count;
    existing.maxMs = Math.max(existing.maxMs, durationMs);
    existing.minMs = Math.min(existing.minMs, durationMs);
    existing.lastRunAt = now;
  } else {
    if (queryStats.size >= MAX_QUERY_STATS) {
      // Remove the least-recently-used stat
      const oldest = [...queryStats.entries()].sort((a, b) => a[1].lastRunAt - b[1].lastRunAt)[0];
      if (oldest) queryStats.delete(oldest[0]);
    }
    queryStats.set(normalized, {
      query: normalized,
      count: 1,
      totalMs: durationMs,
      avgMs: durationMs,
      maxMs: durationMs,
      minMs: durationMs,
      lastRunAt: now,
    });
  }

  // Track slow queries
  if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
    slowQueries.push({
      query: normalized,
      durationMs,
      timestamp: now,
      params: params ? JSON.stringify(params).slice(0, 500) : undefined,
    });
    // Evict oldest if at capacity
    if (slowQueries.length > MAX_SLOW_QUERIES) {
      slowQueries.shift();
    }
  }
}

/**
 * Wrap a Prisma query call with automatic performance tracking.
 *
 * @example
 * const leads = await trackQuery(() => db.lead.findMany({ where: { userId } }));
 */
export async function trackQuery<T>(fn: () => Promise<T>, label?: string): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;
    recordQuery(label || 'prisma_query', duration);
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    recordQuery(label || 'prisma_query_error', duration);
    throw error;
  }
}

// ─── Analyze Query Performance ────────────────────────────────────

/**
 * Run EXPLAIN QUERY PLAN on a given SQL statement and return structured results.
 */
export async function analyzeQueryPerformance(sql: string): Promise<ExplainPlan> {
  const start = performance.now();

  try {
    const result = await db.$queryRawUnsafe<{ id: number; parent: number; notused: number; detail: string }[]>(
      `EXPLAIN QUERY PLAN ${sql}`
    );

    const plan = result.map((r) => r.detail);
    const usesIndex = plan.some((line) => line.toUpperCase().includes('USING INDEX') || line.toUpperCase().includes('USING COVERING INDEX'));
    const tableScans = plan
      .filter((line) => line.toUpperCase().includes('SCAN'))
      .map((line) => {
        const match = line.match(/TABLE\s+(\w+)/i);
        return match ? match[1] : line;
      });

    const duration = performance.now() - start;
    recordQuery('EXPLAIN QUERY PLAN', duration);

    return { sql, plan, usesIndex, tableScans };
  } catch (error) {
    return {
      sql,
      plan: [`Error analyzing query: ${error instanceof Error ? error.message : String(error)}`],
      usesIndex: false,
      tableScans: [],
    };
  }
}

// ─── Get Slow Queries ─────────────────────────────────────────────

/**
 * Get all queries that exceeded the slow query threshold, sorted by duration desc.
 */
export function getSlowQueries(limit = 20): SlowQuery[] {
  return [...slowQueries]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, limit);
}

// ─── Get Query Statistics ─────────────────────────────────────────

/**
 * Return aggregated query timing statistics.
 */
export function getQueryStats(): QueryStat[] {
  return [...queryStats.values()].sort((a, b) => b.totalMs - a.totalMs);
}

/**
 * Get a summary of query performance.
 */
export function getQueryStatsSummary(): {
  totalQueries: number;
  totalSlowQueries: number;
  avgQueryTime: number;
  worstQuery: QueryStat | null;
  slowQueryThreshold: number;
} {
  const stats = [...queryStats.values()];
  const totalCount = stats.reduce((acc, s) => acc + s.count, 0);
  const totalTime = stats.reduce((acc, s) => acc + s.totalMs, 0);

  return {
    totalQueries: totalCount,
    totalSlowQueries: slowQueries.length,
    avgQueryTime: totalCount > 0 ? totalTime / totalCount : 0,
    worstQuery: stats.length > 0
      ? stats.reduce((worst, s) => (s.maxMs > worst.maxMs ? s : worst), stats[0])
      : null,
    slowQueryThreshold: SLOW_QUERY_THRESHOLD_MS,
  };
}

// ─── Optimize Database ────────────────────────────────────────────

/**
 * Run SQLite optimization commands:
 * - PRAGMA optimize
 * - ANALYZE tables
 * - PRAGMA wal_checkpoint(TRUNCATE)
 */
export async function optimizeDatabase(): Promise<OptimizationResult[]> {
  const results: OptimizationResult[] = [];

  // PRAGMA optimize
  const optimizeStart = performance.now();
  try {
    await db.$executeRawUnsafe('PRAGMA optimize');
    results.push({
      action: 'PRAGMA optimize',
      success: true,
      details: 'SQLite query planner optimization applied',
      durationMs: performance.now() - optimizeStart,
    });
  } catch (error) {
    results.push({
      action: 'PRAGMA optimize',
      success: false,
      details: `Failed: ${error instanceof Error ? error.message : String(error)}`,
      durationMs: performance.now() - optimizeStart,
    });
  }

  // ANALYZE — update statistics for the query planner
  const analyzeStart = performance.now();
  try {
    await db.$executeRawUnsafe('ANALYZE');
    results.push({
      action: 'ANALYZE',
      success: true,
      details: 'Table statistics updated for query planner',
      durationMs: performance.now() - analyzeStart,
    });
  } catch (error) {
    results.push({
      action: 'ANALYZE',
      success: false,
      details: `Failed: ${error instanceof Error ? error.message : String(error)}`,
      durationMs: performance.now() - analyzeStart,
    });
  }

  // WAL checkpoint — compact the write-ahead log
  const checkpointStart = performance.now();
  try {
    await db.$executeRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)');
    results.push({
      action: 'WAL checkpoint',
      success: true,
      details: 'Write-ahead log checkpointed and truncated',
      durationMs: performance.now() - checkpointStart,
    });
  } catch (error) {
    results.push({
      action: 'WAL checkpoint',
      success: false,
      details: `Failed: ${error instanceof Error ? error.message : String(error)}`,
      durationMs: performance.now() - checkpointStart,
    });
  }

  return results;
}

// ─── Query Optimization Patterns ──────────────────────────────────

/**
 * Cursor-based pagination helper.
 * More efficient than OFFSET for large datasets because it avoids scanning past rows.
 */
export function buildCursorPagination(cursor?: string, limit = 20) {
  return {
    take: limit + 1, // Take one extra to determine if there's a next page
    ...(cursor
      ? {
          skip: 1, // Skip the cursor row itself
          cursor: { id: cursor },
        }
      : {}),
  };
}

/**
 * Batch read helper — prevents N+1 queries by loading related records in bulk.
 *
 * @example
 * // Instead of loading leads one-by-one with their analyses:
 * const leadIds = leads.map(l => l.id);
 * const analyses = await batchRead(leadIds, (ids) =>
 *   db.leadAnalysis.findMany({ where: { leadId: { in: ids } } })
 * );
 */
export async function batchRead<T, R>(
  ids: string[],
  fetcher: (batchIds: string[]) => Promise<R[]>,
  batchSize = 50,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const batchResults = await trackQuery(
      () => fetcher(batch),
      `batchRead(${batch.length} ids)`,
    );
    results.push(...batchResults);
  }
  return results;
}

/**
 * Build a select clause that only includes the fields you need.
 * Avoids SELECT * which transfers unnecessary data.
 */
export function selectFields<T extends Record<string, boolean>>(fields: T): { [K in keyof T]: true } {
  const select: Record<string, true> = {};
  for (const [key, include] of Object.entries(fields)) {
    if (include) select[key] = true;
  }
  return select as { [K in keyof T]: true };
}

/**
 * Build WHERE clause ordering for SQLite optimization.
 * Put most selective conditions first for better query planning.
 */
export function orderWhereConditions(conditions: { field: string; selectivity: number; value: unknown }[]): Record<string, unknown> {
  // Sort by selectivity descending (most selective first)
  const sorted = [...conditions].sort((a, b) => b.selectivity - a.selectivity);
  const where: Record<string, unknown> = {};
  for (const cond of sorted) {
    where[cond.field] = cond.value;
  }
  return where;
}
