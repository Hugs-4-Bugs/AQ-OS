// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Detailed Health Check Endpoint
// Phase L10: Observability — Enhanced
// GET /api/health/detailed — Returns component-level health status
// SECURITY HARDENING: anonymous callers (load-balancer probes) receive
// status-only output. Component errors, business metrics and infra
// details require an authenticated session.
// Uses the observability health module for structured, reusable checks.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { runFullHealthCheck } from '@/lib/observability/health';
import { metricsCollector } from '@/lib/observability/metrics-collector';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = performance.now();

  // Run all health checks via the observability health module
  const result = await runFullHealthCheck();

  // Observe the total health check duration
  const totalDuration = (performance.now() - startTime) / 1000;
  metricsCollector.observeHistogram('api_request_duration_seconds', { route: '/api/health/detailed' }, totalDuration);

  const statusCode = result.status === 'healthy' ? 200
    : result.status === 'degraded' ? 200
    : 503;

  // Anonymous callers get the minimum needed for uptime probes
  const authUser = await getAuthUser(request);
  if (!authUser) {
    return NextResponse.json(
      { status: result.status, timestamp: new Date().toISOString() },
      { status: statusCode }
    );
  }

  return NextResponse.json(result, { status: statusCode });
}
