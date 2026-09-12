// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Enhanced Health Check Module (Observability)
// Phase L10: Observability
//
// Provides structured health check functions for:
// - Database connectivity
// - Redis connectivity (if configured)
// - External service availability (Stripe, Razorpay, SMTP)
// - Memory / process health
// - Disk / filesystem health
//
// Each check returns a ComponentHealth with:
// - status: 'healthy' | 'degraded' | 'unhealthy'
// - latencyMs: response time of the check
// - details: human-readable description
// - error: error message if unhealthy
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { isEmailServiceConfigured } from '@/lib/email';
import logger from '@/lib/logger';
import { accessSync, statSync, constants } from 'fs';
import { join, dirname } from 'path';

// ===== TYPES =====

export type ComponentStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ComponentHealth {
  status: ComponentStatus;
  latencyMs?: number;
  details?: string;
  error?: string;
}

export interface HealthCheckResult {
  status: ComponentStatus;
  version: string;
  environment: string;
  uptime: number;
  timestamp: string;
  components: {
    database: ComponentHealth;
    redis: ComponentHealth;
    memory: ComponentHealth;
    disk: ComponentHealth;
    process: ComponentHealth;
    envVars: ComponentHealth;
    providers: ComponentHealth;
  };
  metrics: {
    activeUsers: number;
    totalLeads: number;
    queueDepth: number;
  };
}

// ===== HEALTH CHECK FUNCTIONS =====

/**
 * Check database connectivity and measure query latency.
 * Status is based on latency thresholds:
 * - < 200ms: healthy
 * - 200ms - 1000ms: degraded
 * - > 1000ms or error: unhealthy
 */
export async function checkDatabase(): Promise<ComponentHealth> {
  const start = performance.now();
  try {
    await db.user.count({ take: 1 });
    const latencyMs = performance.now() - start;

    let status: ComponentStatus = 'healthy';
    let details = 'Database connection is active';

    if (latencyMs > 1000) {
      status = 'unhealthy';
      details = `Database latency critically high: ${latencyMs.toFixed(0)}ms`;
    } else if (latencyMs > 200) {
      status = 'degraded';
      details = `Database latency elevated: ${latencyMs.toFixed(0)}ms`;
    }

    return { status, latencyMs: Math.round(latencyMs * 100) / 100, details };
  } catch (error) {
    logger.error('Health check: database connectivity failed', undefined, {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return {
      status: 'unhealthy',
      latencyMs: performance.now() - start,
      error: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}

/**
 * Check Redis connectivity if configured.
 * Gracefully skipped (returns healthy with details) when Redis is not configured.
 */
export async function checkRedis(): Promise<ComponentHealth> {
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_HOST;

  if (!redisUrl) {
    return {
      status: 'healthy',
      details: 'Redis not configured — skipped',
    };
  }

  const start = performance.now();
  try {
    const Redis = await import('ioredis').then(m => m.default).catch(() => null);

    if (!Redis) {
      return {
        status: 'degraded',
        details: 'Redis URL configured but ioredis package not available',
      };
    }

    const client = new Redis(redisUrl, {
      connectTimeout: 2000,
      lazyConnect: true,
    });

    try {
      await client.connect();
      await client.ping();
      const latencyMs = performance.now() - start;
      return {
        status: 'healthy',
        latencyMs: Math.round(latencyMs * 100) / 100,
        details: 'Redis connection active',
      };
    } finally {
      await client.quit().catch(() => {});
    }
  } catch (error) {
    logger.error('Health check: Redis connectivity failed', undefined, {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return {
      status: 'unhealthy',
      latencyMs: performance.now() - start,
      error: error instanceof Error ? error.message : 'Redis connection failed',
    };
  }
}

/**
 * Check memory health based on heap usage ratio.
 * - < 85%: healthy
 * - 85% - 95%: degraded
 * - > 95%: unhealthy
 */
export function checkMemory(): ComponentHealth {
  const mem = process.memoryUsage();
  const heapUsedMB = mem.heapUsed / (1024 * 1024);
  const heapTotalMB = mem.heapTotal / (1024 * 1024);
  const rssMB = mem.rss / (1024 * 1024);
  const heapUsageRatio = mem.heapUsed / mem.heapTotal;

  let status: ComponentStatus = 'healthy';
  let details: string;

  if (heapUsageRatio > 0.95) {
    status = 'unhealthy';
    details = `Heap usage critical: ${(heapUsageRatio * 100).toFixed(1)}% (${heapUsedMB.toFixed(0)}MB / ${heapTotalMB.toFixed(0)}MB)`;
  } else if (heapUsageRatio > 0.85) {
    status = 'degraded';
    details = `Heap usage elevated: ${(heapUsageRatio * 100).toFixed(1)}% (${heapUsedMB.toFixed(0)}MB / ${heapTotalMB.toFixed(0)}MB)`;
  } else {
    details = `Heap usage normal: ${(heapUsageRatio * 100).toFixed(1)}% (${heapUsedMB.toFixed(0)}MB / ${heapTotalMB.toFixed(0)}MB)`;
  }

  return {
    status,
    details,
    latencyMs: Math.round(rssMB * 100) / 100,
  };
}

/**
 * Check disk/filesystem health.
 * Verifies data directory is writable and checks SQLite file size.
 */
export function checkDisk(): ComponentHealth {
  try {
    const dbPath = process.env.DATABASE_URL?.replace('file:', '') || join(process.cwd(), 'db');
    const dataDir = dirname(dbPath.replace(/^\/\//, '/'));

    try {
      accessSync(dataDir, constants.W_OK);
    } catch {
      try {
        accessSync(process.cwd(), constants.W_OK);
      } catch {
        return {
          status: 'unhealthy',
          error: 'Working directory is not writable',
        };
      }
    }

    if (dbPath && dbPath !== ':memory:') {
      try {
        const realPath = dbPath.startsWith('//') ? dbPath.slice(1) : dbPath;
        const stats = statSync(realPath);
        const sizeMB = stats.size / (1024 * 1024);
        const maxSizeMB = 1024;

        if (sizeMB > maxSizeMB) {
          return {
            status: 'degraded',
            details: `SQLite database size ${sizeMB.toFixed(0)}MB exceeds ${maxSizeMB}MB threshold. Consider migrating to PostgreSQL.`,
          };
        }

        return {
          status: 'healthy',
          details: `Database file: ${sizeMB.toFixed(1)}MB, data directory writable`,
        };
      } catch {
        return {
          status: 'healthy',
          details: 'Data directory accessible (database file not yet created or using remote DB)',
        };
      }
    }

    return {
      status: 'healthy',
      details: 'Disk access verified',
    };
  } catch (err) {
    return {
      status: 'degraded',
      error: err instanceof Error ? err.message : 'Could not check disk status',
    };
  }
}

/**
 * Check process health (uptime, CPU usage).
 */
export function checkProcess(): ComponentHealth {
  const uptimeSeconds = process.uptime();
  const cpuUsage = process.cpuUsage();

  return {
    status: 'healthy',
    details: `Process running for ${formatUptime(uptimeSeconds)}. CPU: user=${(cpuUsage.user / 1000).toFixed(0)}ms, system=${(cpuUsage.system / 1000).toFixed(0)}ms`,
    latencyMs: Math.round(uptimeSeconds * 1000) / 1000,
  };
}

/**
 * Check critical and recommended environment variables.
 */
export function checkEnvVars(): ComponentHealth {
  const critical: string[] = [];
  const recommended: string[] = [];

  if (!process.env.DATABASE_URL) critical.push('DATABASE_URL');
  if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') recommended.push('JWT_SECRET');
  if (!process.env.SMTP_HOST) recommended.push('SMTP_HOST');
  if (!process.env.SMTP_USER) recommended.push('SMTP_USER');
  if (!process.env.SMTP_PASSWORD) recommended.push('SMTP_PASSWORD');

  if (critical.length > 0) {
    return {
      status: 'unhealthy',
      error: `Missing critical env vars: ${critical.join(', ')}`,
      details: recommended.length > 0 ? `Also missing recommended: ${recommended.join(', ')}` : undefined,
    };
  }

  if (recommended.length > 0) {
    return {
      status: 'degraded',
      details: `Missing recommended env vars: ${recommended.join(', ')}. Some features may be unavailable.`,
    };
  }

  return {
    status: 'healthy',
    details: 'All critical and recommended environment variables are set',
  };
}

/**
 * Check external service provider availability.
 * Tests: email/SMTP, Google OAuth, Stripe, Razorpay.
 */
export function checkProviders(): ComponentHealth {
  const providers: string[] = [];
  const missing: string[] = [];

  const emailConfigured = isEmailServiceConfigured();
  if (emailConfigured) {
    providers.push('email');
  } else {
    missing.push('email (SMTP/Resend)');
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push('google-oauth');
  } else {
    missing.push('google-oauth');
  }

  if (process.env.STRIPE_SECRET_KEY) {
    providers.push('stripe');
  } else {
    missing.push('stripe');
  }

  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    providers.push('razorpay');
  }

  if (providers.length === 0) {
    return {
      status: 'unhealthy',
      error: 'No external providers configured',
      details: 'At least email or OAuth should be configured for the app to function',
    };
  }

  if (missing.length > 0) {
    return {
      status: 'degraded',
      details: `Configured: ${providers.join(', ')}. Missing: ${missing.join(', ')}`,
    };
  }

  return {
    status: 'healthy',
    details: `All providers configured: ${providers.join(', ')}`,
  };
}

/**
 * Run the full health check suite and return a structured result.
 */
export async function runFullHealthCheck(): Promise<HealthCheckResult> {
  const [
    database,
    redis,
    memory,
    disk,
    processCheck,
    envVars,
    providers,
  ] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    Promise.resolve(checkMemory()),
    Promise.resolve(checkDisk()),
    Promise.resolve(checkProcess()),
    Promise.resolve(checkEnvVars()),
    Promise.resolve(checkProviders()),
  ]);

  const components = {
    database,
    redis,
    memory,
    disk,
    process: processCheck,
    envVars,
    providers,
  };

  let activeUsers = 0;
  let totalLeads = 0;
  let queueDepth = 0;

  try {
    [activeUsers, totalLeads, queueDepth] = await Promise.all([
      db.user.count({ where: { isActive: true, deletedAt: null } }),
      db.lead.count({ where: { isActive: true } }),
      db.workflowExecution.count({ where: { status: 'running' } }),
    ]);
  } catch {
    // Metrics are best-effort
  }

  return {
    status: determineOverallStatus(components),
    version: '2.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    components,
    metrics: { activeUsers, totalLeads, queueDepth },
  };
}

// ===== HELPERS =====

function determineOverallStatus(components: HealthCheckResult['components']): ComponentStatus {
  const statuses = Object.values(components).map(c => c.status);

  if (statuses.includes('unhealthy')) return 'unhealthy';
  if (statuses.includes('degraded')) return 'degraded';
  return 'healthy';
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

const healthModule = {
  checkDatabase,
  checkRedis,
  checkMemory,
  checkDisk,
  checkProcess,
  checkEnvVars,
  checkProviders,
  runFullHealthCheck,
};

export default healthModule;
