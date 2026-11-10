// AcquisitionOS — GET /api/metrics/scrape
// Prometheus scrape endpoint.
//
// AUTHENTICATION:
//   Accepts EITHER:
//     (a) Authorization: Bearer <METRICS_SCRAPE_TOKEN>   (recommended)
//     (b) ?token=<METRICS_SCRAPE_TOKEN>                   (fallback)
//   METRICS_SCRAPE_TOKEN must be set in production. In dev, if unset,
//   the endpoint is openly readable so local `curl` works.
//
// PRIVACY: NO email, user ID, tenant ID, IP, prompt, or message body is
// ever emitted as a label. Labels are strictly limited to: method, route
// template, status_class, severity, channel, provider. Low-cardinality.

import { NextRequest, NextResponse } from 'next/server';
import { metricsCollector } from '@/lib/observability/metrics-collector';
import { db } from '@/lib/db';
import { collectScrapeSafeMetrics, scrapeMetricsState } from '@/lib/observability/scrape-metrics';
import { getErrorCounts } from '@/lib/observability/error-tracker';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEV_FALLBACK_WARNING =
  '[metrics/scrape] METRICS_SCRAPE_TOKEN not set — endpoint is open in dev. Set METRICS_SCRAPE_TOKEN in production.';

function authenticate(request: NextRequest): { ok: true } | { ok: false; reason: string } {
  const configuredToken = process.env.METRICS_SCRAPE_TOKEN;
  const isProd = process.env.NODE_ENV === 'production';

  if (!configuredToken) {
    if (isProd) {
      return { ok: false, reason: 'METRICS_SCRAPE_TOKEN not configured' };
    }
    if (!scrapeMetricsState.devWarned) {
      console.warn(DEV_FALLBACK_WARNING);
      scrapeMetricsState.devWarned = true;
    }
    return { ok: true };
  }

  const authHeader = request.headers.get('authorization') || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const queryToken = request.nextUrl.searchParams.get('token');
  const presented = bearerMatch?.[1] || queryToken || '';
  if (!presented) {
    return { ok: false, reason: 'no token presented' };
  }

  const a = Buffer.from(presented);
  const b = Buffer.from(configuredToken);
  if (a.length !== b.length) return { ok: false, reason: 'token length mismatch' };
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0 ? { ok: true } : { ok: false, reason: 'token mismatch' };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = authenticate(request);
  if (!auth.ok) {
    return new NextResponse('Unauthorized\n', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Bearer realm="acquisitionos-metrics"',
        'Cache-Control': 'no-store',
      },
    });
  }

  try {
    await collectScrapeSafeMetrics(db);

    const mem = process.memoryUsage();
    metricsCollector.setGauge('process_heap_used_bytes', undefined, mem.heapUsed);
    metricsCollector.setGauge('process_heap_total_bytes', undefined, mem.heapTotal);
    metricsCollector.setGauge('process_rss_bytes', undefined, mem.rss);
    metricsCollector.setGauge('process_uptime_seconds', undefined, process.uptime());

    const errCounts = getErrorCounts();
    metricsCollector.setGauge('app_errors_recent', undefined, errCounts.recentCount);
    metricsCollector.setGauge('app_errors_critical', undefined, errCounts.criticalCount);

    const output = metricsCollector.toPrometheusFormat();
    return new NextResponse(output, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[metrics/scrape] collection failed:', error);
    return new NextResponse('# metrics collection error\n', {
      status: 500,
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
    });
  }
}
