// AcquisitionOS — GET /api/health/synthetic
// Synthetic user-journey probes for critical paths.
// Auth: super_admin (to prevent external abuse that could amplify traffic
// or reveal probe latency data).

import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdmin } from '@/lib/auth-middleware';
import { runAllProbes, deriveContextFromRequest } from '@/lib/observability/synthetic-probes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withSuperAdmin(request, async () => {
    const ctx = deriveContextFromRequest(request);
    const summary = await runAllProbes(ctx);

    const status = summary.totalFailed === 0
      ? (summary.totalSkipped > 0 ? 'partial' : 'pass')
      : 'fail';

    return NextResponse.json(
      {
        status,
        timestamp: new Date().toISOString(),
        summary: {
          total: summary.results.length,
          pass: summary.totalOk,
          fail: summary.totalFailed,
          skipped: summary.totalSkipped,
          totalLatencyMs: summary.totalLatencyMs,
        },
        results: summary.results,
      },
      {
        status: summary.totalFailed > 0 ? 503 : 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  });
}
