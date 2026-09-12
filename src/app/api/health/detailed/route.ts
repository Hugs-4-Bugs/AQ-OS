// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Detailed Health Check Endpoint
// Phase L10: Observability — Enhanced
// GET /api/health/detailed — Returns component-level health status
// No authentication required.
// Uses the observability health module for structured, reusable checks.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { runFullHealthCheck } from '@/lib/observability/health';
import { metricsCollector } from '@/lib/observability/metrics-collector';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const startTime = performance.now();

  // Run all health checks via the observability health module
  const result = await runFullHealthCheck();

  // Observe the total health check duration
  const totalDuration = (performance.now() - startTime) / 1000;
  metricsCollector.observeHistogram('api_request_duration_seconds', { route: '/api/health/detailed' }, totalDuration);

  const statusCode = result.status === 'healthy' ? 200
    : result.status === 'degraded' ? 200
    : 503;

  return NextResponse.json(result, { status: statusCode });
}
