// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — PostgreSQL Connection Pool Configuration
// Phase L9: Production Database Preparation
//
// This module provides a configured Prisma client optimized for
// PostgreSQL with connection pooling support (PgBouncer / Supabase).
//
// USAGE:
//   Import from this module when running PostgreSQL:
//   import { dbPool } from '@/lib/db-pool';
//
// The main `src/lib/db.ts` can conditionally import from this module
// when the DATABASE_URL indicates a PostgreSQL connection.
//
// CONNECTION POOL SIZING GUIDE:
// ┌──────────────┬───────────────┬──────────────────────────────────┐
// │ Environment  │ pool_size     │ Notes                            │
// ├──────────────┼───────────────┼──────────────────────────────────┤
// │ Development  │ 3-5           │ Single user, low concurrency     │
// │ Staging      │ 10            │ Small team, moderate traffic     │
// │ Production   │ 20-30         │ Based on CPU cores * 2 + spares │
// │ Large Scale  │ 50+           │ Use PgBouncer for 1000+ conns    │
// └──────────────┴───────────────┴──────────────────────────────────┘
//
// FORMULA: pool_size = (CPU_cores * 2) + effective_spindle_count
// For serverless (Vercel): pool_size = 5-10 (limited by cold starts)
// With PgBouncer: pool_size can be much larger (transaction-mode pooling)
// ═══════════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';

// ===== CONFIGURATION =====

/**
 * Connection pool configuration.
 * These values can be overridden via environment variables.
 */
export interface PoolConfig {
  /** Maximum number of connections in the pool. Default: auto-detected based on environment. */
  poolSize: number;

  /** Connection timeout in milliseconds. Default: 30000 (30 seconds). */
  connectionTimeoutMs: number;

  /** Idle timeout in milliseconds before a connection is closed. Default: 10000 (10s). */
  idleTimeoutMs: number;

  /** Maximum query execution time in milliseconds. Default: 30000 (30 seconds). */
  queryTimeoutMs: number;

  /** Enable statement-level query logging. Default: false (use structured logging). */
  emitQueryLogs: boolean;

  /** URL parameters for connection pooling (PgBouncer / Supabase). */
  urlParams: {
    /** Use PgBouncer transaction-mode pooling. */
    pgbouncer: boolean;
    /** SSL mode for the connection. */
    sslmode: string;
    /** Connection timeout (seconds, URL param). */
    connect_timeout: number;
    /** Statement timeout (seconds, URL param). */
    statement_timeout: number;
  };
}

/**
 * Detect the current environment and compute pool size.
 */
function detectPoolSize(): number {
  const env = process.env.NODE_ENV || 'development';

  // Allow explicit override
  if (process.env.DATABASE_POOL_SIZE) {
    const parsed = parseInt(process.env.DATABASE_POOL_SIZE, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  switch (env) {
    case 'test':
      return 3;
    case 'development':
      return 5;
    case 'production': {
      // For serverless / Vercel, use a smaller pool
      if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
        return 7;
      }
      // For long-running servers, use CPU-based sizing
      const cpuCount = require('os').cpus().length || 4;
      return Math.min(cpuCount * 2 + 4, 30);
    }
    default:
      return 5;
  }
}

/**
 * Build the default pool configuration.
 */
export function getPoolConfig(): PoolConfig {
  const env = process.env.NODE_ENV || 'development';

  return {
    poolSize: detectPoolSize(),

    connectionTimeoutMs: parseInt(
      process.env.DATABASE_TIMEOUT_MS || '30000',
      10
    ),

    idleTimeoutMs: parseInt(
      process.env.DATABASE_IDLE_TIMEOUT_MS || '10000',
      10
    ),

    queryTimeoutMs: parseInt(
      process.env.DATABASE_QUERY_TIMEOUT_MS || '30000',
      10
    ),

    emitQueryLogs: env !== 'production',

    urlParams: {
      pgbouncer: process.env.PGBOUNCER_ENABLED === 'true' ||
        (process.env.DATABASE_URL || '').includes('pgbouncer=true'),

      sslmode: process.env.DATABASE_SSL_MODE || 'require',

      connect_timeout: parseInt(
        process.env.DATABASE_CONNECT_TIMEOUT_S || '15',
        10
      ),

      statement_timeout: parseInt(
        process.env.DATABASE_STATEMENT_TIMEOUT_S || '30',
        10
      ),
    },
  };
}

/**
 * Build a PostgreSQL-compatible DATABASE_URL with pool parameters.
 * This appends connection pooling URL parameters to the base URL.
 */
export function buildPooledDatabaseUrl(baseUrl?: string): string {
  const url = baseUrl || process.env.DATABASE_URL || '';
  const config = getPoolConfig();

  if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
    // Not a PostgreSQL URL — return as-is (SQLite)
    return url;
  }

  const urlObj = new URL(url);

  // Set connection pool parameters
  if (config.urlParams.pgbouncer) {
    urlObj.searchParams.set('pgbouncer', 'true');
  }

  urlObj.searchParams.set('sslmode', config.urlParams.sslmode);
  urlObj.searchParams.set('connect_timeout', String(config.urlParams.connect_timeout));

  if (config.urlParams.statement_timeout > 0) {
    urlObj.searchParams.set('statement_timeout', String(config.urlParams.statement_timeout));
  }

  // Connection pool size hint (used by some drivers)
  urlObj.searchParams.set('connection_limit', String(config.poolSize));

  return urlObj.toString();
}

// ===== PRISMA CLIENT WITH POOL CONFIGURATION =====

const globalForPool = globalThis as unknown as {
  prismaPool: PrismaClient | undefined;
  __poolVersion: number;
};

const POOL_VERSION = 1;

/**
 * Create a Prisma client configured for PostgreSQL with connection pooling.
 * This client is suitable for production use with PgBouncer or direct connections.
 */
function createPooledClient(): PrismaClient {
  const config = getPoolConfig();
  const poolUrl = buildPooledDatabaseUrl();

  return new PrismaClient({
    datasources: {
      db: {
        url: poolUrl,
      },
    },
    log: config.emitQueryLogs
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
        ]
      : [
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
        ],
  });
}

/**
 * Singleton Prisma client with connection pooling.
 * Safe to import multiple times — returns the same instance in development.
 */
export const dbPool: PrismaClient =
  globalForPool.__poolVersion === POOL_VERSION && globalForPool.prismaPool
    ? globalForPool.prismaPool
    : (() => {
        // Clean up old client if version mismatch
        if (globalForPool.prismaPool) {
          globalForPool.prismaPool.$disconnect().catch(() => {});
        }
        const client = createPooledClient();
        globalForPool.prismaPool = client;
        globalForPool.__poolVersion = POOL_VERSION;
        return client;
      })();

// Persist in development for hot-reload
if (process.env.NODE_ENV !== 'production') {
  globalForPool.prismaPool = dbPool;
  globalForPool.__poolVersion = POOL_VERSION;
}

// ===== CONNECTION POOL HEALTH CHECK =====

export interface PoolHealth {
  isPostgres: boolean;
  poolSize: number;
  connectionTimeoutMs: number;
  queryTimeoutMs: number;
  pgbouncerEnabled: boolean;
  sslMode: string;
}

/**
 * Get current connection pool health information.
 */
export function getPoolHealth(): PoolHealth {
  const config = getPoolConfig();
  const dbUrl = process.env.DATABASE_URL || '';

  return {
    isPostgres: dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://'),
    poolSize: config.poolSize,
    connectionTimeoutMs: config.connectionTimeoutMs,
    queryTimeoutMs: config.queryTimeoutMs,
    pgbouncerEnabled: config.urlParams.pgbouncer,
    sslMode: config.urlParams.sslmode,
  };
}

/**
 * Run a health-check query against the pooled connection.
 * Returns latency in milliseconds, or throws on failure.
 */
export async function pingPool(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = performance.now();
  try {
    await dbPool.user.count({ take: 1 });
    const latencyMs = performance.now() - start;
    return { ok: true, latencyMs: Math.round(latencyMs * 100) / 100 };
  } catch (err) {
    return {
      ok: false,
      latencyMs: performance.now() - start,
      error: err instanceof Error ? err.message : 'Connection failed',
    };
  }
}

// ===== EXPORTS =====

export { getPoolConfig, buildPooledDatabaseUrl };
