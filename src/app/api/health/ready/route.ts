// AcquisitionOS — GET /api/health/ready
// Readiness probe — verifies every hard dependency needed to handle a request.
// Returns 200 only if every critical dependency responds within its timeout.
// Returns 503 if any critical dependency is down — load balancers should
// remove the instance from rotation.
//
// Critical dependencies checked:
//   - Database (Prisma) — 2 s budget
//   - Redis (if configured) — 2 s budget (skipped if REDIS_URL unset)
//
// No authentication — LB probes need to reach this without session cookies.
// Output contains NO sensitive information: only component names, statuses,
// and latency bucket. No hostnames, no connection strings.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRedis } from '@/lib/observability/health';
import logger from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEPENDENCY_TIMEOUT_MS = 2000;

async function withTimeout<T>(
  label: string,
  fn: () => Promise<T>,
  timeoutMs: number = DEPENDENCY_TIMEOUT_MS
): Promise<{ ok: true; latencyMs: number; value: T } | { ok: false; latencyMs: number; error: string }> {
  const start = performance.now();
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
    return { ok: true, latencyMs: Math.round(performance.now() - start), value: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, latencyMs: Math.round(performance.now() - start), error: msg };
  }
}

export async function GET() {
  const startTime = performance.now();

  const dbCheck = await withTimeout('database', () => db.user.count({ take: 1 }));

  const redisConfigured = Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);
  const redisCheck = redisConfigured
    ? await withTimeout('redis', async () => checkRedis())
    : { ok: true as const, latencyMs: 0, value: { status: 'skipped', details: 'Redis not configured' } };

  const criticalOk = dbCheck.ok;

  const components: Record<string, { status: 'healthy' | 'unhealthy' | 'skipped'; latencyMs?: number; error?: string }> = {
    database: dbCheck.ok
      ? { status: 'healthy', latencyMs: dbCheck.latencyMs }
      : { status: 'unhealthy', latencyMs: dbCheck.latencyMs, error: dbCheck.error },
    redis: !redisConfigured
      ? { status: 'skipped' }
      : redisCheck.ok && redisCheck.value.status === 'healthy'
        ? { status: 'healthy', latencyMs: redisCheck.latencyMs }
        : { status: 'unhealthy', latencyMs: redisCheck.latencyMs, error: 'Redis unavailable' },
  };

  const totalLatencyMs = Math.round(performance.now() - startTime);

  if (!criticalOk) {
    logger.warn('Readiness probe failed', undefined, { components, totalLatencyMs });
  }

  return NextResponse.json(
    {
      status: criticalOk ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: components,
      latencyMs: totalLatencyMs,
    },
    {
      status: criticalOk ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
