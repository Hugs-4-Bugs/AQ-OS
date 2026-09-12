// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Prisma Client with Query Monitoring
// Phase 11: Observability Infrastructure
//
// Extends the Prisma client with:
// - Slow query logging (>100ms)
// - Query count tracking per request
// - Query timing metrics
// - Connection pool monitoring
//
// FC (Aliyun Function Compute) SUPPORT:
//   FC has a READ-ONLY filesystem except for /tmp. SQLite needs write
//   access to the DB file AND its directory (for journal/WAL files).
//   On startup, if the configured DB path is not writable, we copy the
//   bundled DB file to /tmp/custom.db and redirect DATABASE_URL there.
//   This preserves existing users/sessions across requests within the
//   same FC instance lifecycle.
// ═══════════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client'
import { metricsCollector } from '@/lib/observability/metrics-collector';
import { logger } from '@/lib/observability/logger';
import * as fs from 'fs';
import * as path from 'path';

// ===== FC READ-ONLY FILESYSTEM WORKAROUND =====

/**
 * Ensure the SQLite database is on a writable filesystem.
 *
 * On Aliyun FC, the deployment directory is read-only. SQLite needs
 * write access to the DB file AND its directory (for journal files).
 * If the configured DB path is not writable, copy the bundled DB to
 * /tmp/custom.db and redirect DATABASE_URL there.
 *
 * This runs once at module load time, BEFORE PrismaClient is created.
 */
function ensureWritableDatabasePath(): void {
  const rawUrl = process.env.DATABASE_URL || 'file:/home/z/my-project/db/custom.db';

  // Only handle SQLite file: URLs
  if (!rawUrl.startsWith('file:')) {
    return;
  }

  // Extract the file path from the file: URL
  // file:/home/z/my-project/db/custom.db → /home/z/my-project/db/custom.db
  let dbPath = rawUrl.replace(/^file:/, '');
  // Handle file:./relative paths
  if (dbPath.startsWith('./')) {
    dbPath = path.resolve(process.cwd(), dbPath);
  }

  const dbDir = path.dirname(dbPath);

  // Check if the DB directory is writable by trying to write a temp file
  let dirWritable = false;
  try {
    const probeFile = path.join(dbDir, `.probe-${Date.now()}.tmp`);
    fs.writeFileSync(probeFile, '1');
    fs.unlinkSync(probeFile);
    dirWritable = true;
  } catch {
    dirWritable = false;
  }

  if (dirWritable) {
    // Original path is writable — nothing to do
    return;
  }

  // Directory is NOT writable (FC read-only filesystem).
  // Copy the DB file to /tmp (writable on FC) and redirect DATABASE_URL.
  const tmpDir = '/tmp';
  const tmpDbPath = path.join(tmpDir, 'custom.db');

  try {
    // Ensure /tmp exists
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // If /tmp/custom.db already exists (from a previous warm invocation
    // of this FC instance), reuse it — it has the latest data.
    if (fs.existsSync(tmpDbPath)) {
      process.env.DATABASE_URL = `file:${tmpDbPath}`;
      // Only log once per process
      if (!process.env.__DB_REDIRECTED_TO_TMP) {
        process.env.__DB_REDIRECTED_TO_TMP = '1';
        console.log(`[DB] Reusing existing /tmp DB: ${tmpDbPath}`);
      }
      return;
    }

    // First cold start: copy bundled DB to /tmp
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, tmpDbPath);
      process.env.DATABASE_URL = `file:${tmpDbPath}`;
      console.log(`[DB] Copied bundled DB from ${dbPath} to ${tmpDbPath} (FC read-only workaround)`);
    } else {
      // Bundled DB doesn't exist — /tmp/custom.db will be created by Prisma
      // on first query. Tables must be created via `prisma db push`.
      process.env.DATABASE_URL = `file:${tmpDbPath}`;
      console.log(`[DB] Bundled DB not found at ${dbPath}. Using fresh DB at ${tmpDbPath}.`);
      console.log(`[DB] WARNING: DB will be empty. Run prisma db push to create tables.`);
    }
  } catch (err) {
    console.error(`[DB] Failed to set up writable DB path:`, err);
    // Keep original DATABASE_URL — Prisma will fail with a clear error
  }
}

// Run the FC workaround BEFORE creating PrismaClient
ensureWritableDatabasePath();

// ===== QUERY MONITORING STATE =====

interface QueryStats {
  totalQueries: number;
  slowQueries: number;
  totalDurationMs: number;
  queriesByOperation: Map<string, { count: number; totalDurationMs: number }>;
  recentSlowQueries: Array<{
    query: string;
    durationMs: number;
    timestamp: string;
  }>;
}

const MAX_SLOW_QUERY_LOG = 50;
const SLOW_QUERY_THRESHOLD_MS = 100;

// Per-request query tracking (using AsyncLocalStorage pattern via global state)
let currentRequestQueryCount = 0;

class DbMonitor {
  private stats: QueryStats = {
    totalQueries: 0,
    slowQueries: 0,
    totalDurationMs: 0,
    queriesByOperation: new Map(),
    recentSlowQueries: [],
  };
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  recordQuery(durationMs: number, query: string): void {
    this.stats.totalQueries++;
    this.stats.totalDurationMs += durationMs;

    // Extract operation type from query (e.g., "SELECT", "INSERT", "UPDATE", "DELETE")
    const operation = this.extractOperation(query);
    const opStats = this.stats.queriesByOperation.get(operation) || { count: 0, totalDurationMs: 0 };
    opStats.count++;
    opStats.totalDurationMs += durationMs;
    this.stats.queriesByOperation.set(operation, opStats);

    // Track slow queries
    if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
      this.stats.slowQueries++;
      this.stats.recentSlowQueries.push({
        query: query.substring(0, 200), // Truncate long queries
        durationMs: Math.round(durationMs * 100) / 100,
        timestamp: new Date().toISOString(),
      });
      if (this.stats.recentSlowQueries.length > MAX_SLOW_QUERY_LOG) {
        this.stats.recentSlowQueries.shift();
      }

      logger.warn(`Slow DB query detected (${durationMs.toFixed(2)}ms)`, undefined, {
        operation,
        duration: durationMs,
        queryPreview: query.substring(0, 100),
      });
    }

    // Record to Prometheus metrics
    metricsCollector.observeHistogram('db_query_duration_seconds', { operation }, durationMs / 1000);
  }

  incrementRequestQueryCount(): void {
    currentRequestQueryCount++;
  }

  getRequestQueryCount(): number {
    return currentRequestQueryCount;
  }

  resetRequestQueryCount(): void {
    currentRequestQueryCount = 0;
  }

  getStats(): QueryStats & { avgQueryTimeMs: number; uptime: number } {
    return {
      ...this.stats,
      avgQueryTimeMs: this.stats.totalQueries > 0
        ? this.stats.totalDurationMs / this.stats.totalQueries
        : 0,
      uptime: Date.now() - this.startTime,
      queriesByOperation: new Map(this.stats.queriesByOperation),
    };
  }

  getRecentSlowQueries(count: number = 20): QueryStats['recentSlowQueries'] {
    return this.stats.recentSlowQueries.slice(-count);
  }

  getQueryCountByOperation(): Record<string, { count: number; avgMs: number }> {
    const result: Record<string, { count: number; avgMs: number }> = {};
    for (const [op, stats] of this.stats.queriesByOperation) {
      result[op] = {
        count: stats.count,
        avgMs: stats.count > 0 ? stats.totalDurationMs / stats.count : 0,
      };
    }
    return result;
  }

  private extractOperation(query: string): string {
    const trimmed = query.trim().toUpperCase();
    if (trimmed.startsWith('SELECT')) return 'SELECT';
    if (trimmed.startsWith('INSERT')) return 'INSERT';
    if (trimmed.startsWith('UPDATE')) return 'UPDATE';
    if (trimmed.startsWith('DELETE')) return 'DELETE';
    if (trimmed.startsWith('CREATE')) return 'CREATE';
    if (trimmed.startsWith('ALTER')) return 'ALTER';
    if (trimmed.startsWith('PRAGMA')) return 'PRAGMA';
    return 'OTHER';
  }
}

const dbMonitor = new DbMonitor();

// ===== PRISMA CLIENT SETUP =====

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  __prismaVersion?: number
  __dbMonitor: DbMonitor | undefined
}

// Bump this version when schema changes to force new Prisma client
const PRISMA_VERSION = 9;

// Force new client if version mismatch (schema changes)
if (globalForPrisma.__prismaVersion !== PRISMA_VERSION) {
  if (globalForPrisma.prisma) {
    globalForPrisma.prisma.$disconnect().catch(() => {});
  }
  globalForPrisma.prisma = undefined;
  globalForPrisma.__prismaVersion = PRISMA_VERSION;
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [
      {
        emit: 'event',
        level: 'query',
      },
      {
        emit: 'event',
        level: 'error',
      },
      {
        emit: 'event',
        level: 'warn',
      },
    ],
  })

// Set up query event listeners for monitoring
if (!globalForPrisma.prisma) {
  db.$on('query' as never, (e: { duration: number; query: string; timestamp: string }) => {
    const durationMs = e.duration;
    dbMonitor.recordQuery(durationMs, e.query);
    dbMonitor.incrementRequestQueryCount();
  });

  db.$on('error' as never, (e: { message: string; timestamp: string }) => {
    logger.error('Prisma error event', undefined, { error: new Error(e.message) });
  });

  db.$on('warn' as never, (e: { message: string; timestamp: string }) => {
    logger.warn('Prisma warning', undefined, { message: e.message });
  });
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
if (process.env.NODE_ENV !== 'production') globalForPrisma.__dbMonitor = dbMonitor

// ===== CONNECTION POOL MONITORING =====

export interface ConnectionPoolStats {
  activeConnections: number;
  idleConnections: number;
  totalConnections: number;
  waitingCount: number;
}

/**
 * Get connection pool statistics.
 * Note: SQLite doesn't have a traditional connection pool,
 * but we can report useful information.
 */
export function getConnectionPoolStats(): ConnectionPoolStats {
  // For SQLite, we report basic stats
  // In production with PostgreSQL/MySQL, this would use $queryRaw
  return {
    activeConnections: 1,
    idleConnections: 0,
    totalConnections: 1,
    waitingCount: 0,
  };
}

// ===== EXPORTS =====

export { dbMonitor, SLOW_QUERY_THRESHOLD_MS };
