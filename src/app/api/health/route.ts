// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/health
// Fast health check for load balancers and monitoring.
// Checks: database connectivity, memory, environment variables, errors.
// No authentication required.
// Phase L10: Observability (Enhanced)
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getErrorCounts } from '@/lib/observability/error-tracker';
import logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = performance.now();

  // ── Database connectivity check ─────────────────────────────────
  const database: { status: string; responseTime?: number; error?: string } = { status: 'checking' };
  try {
    const dbStart = performance.now();
    await db.user.count({ take: 1 });
    const dbLatency = Math.round((performance.now() - dbStart) * 100) / 100;
    database.status = 'healthy';
    database.responseTime = dbLatency;
  } catch (err) {
    logger.error('Health check: database connectivity failed', undefined, {
      error: err instanceof Error ? err : new Error(String(err)),
    });
    database.status = 'unhealthy';
    database.error = err instanceof Error ? err.message : 'Database connection failed';
  }

  // ── Memory check ────────────────────────────────────────────────
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round((mem.heapUsed / (1024 * 1024)) * 100) / 100;
  const heapTotalMB = Math.round((mem.heapTotal / (1024 * 1024)) * 100) / 100;
  const heapUsageRatio = mem.heapUsed / mem.heapTotal;
  const memoryOk = heapUsageRatio < 0.95;

  const memory: { status: string; used: string; total: string; error?: string } = {
    status: memoryOk ? 'healthy' : 'unhealthy',
    used: `${heapUsedMB}MB`,
    total: `${heapTotalMB}MB`,
    ...(memoryOk ? {} : { error: `Heap usage critical: ${(heapUsageRatio * 100).toFixed(1)}%` }),
  };

  // ── Error tracking check ───────────────────────────────────────
  const errorCounts = getErrorCounts();
  const errors: { status: string; recentCount: number; criticalCount: number } = {
    status: errorCounts.criticalCount > 0 ? 'unhealthy'
      : errorCounts.recentCount > 10 ? 'degraded'
      : 'healthy',
    recentCount: errorCounts.recentCount,
    criticalCount: errorCounts.criticalCount,
  };

  // ── Determine overall status ────────────────────────────────────
  const allHealthy = database.status === 'healthy'
    && memory.status === 'healthy'
    && errors.status === 'healthy';

  const anyUnhealthy = database.status === 'unhealthy'
    || memory.status === 'unhealthy'
    || errors.status === 'unhealthy';

  const status = anyUnhealthy ? 'down'
    : !allHealthy ? 'degraded'
    : 'healthy';

  const totalLatency = Math.round((performance.now() - startTime) * 100) / 100;
  const statusCode = status === 'healthy' ? 200
    : status === 'degraded' ? 200
    : 503;

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      uptime: Math.round(process.uptime()),
      checks: {
        database,
        memory,
        errors,
      },
      latencyMs: totalLatency,
    },
    { status: statusCode }
  );
}
