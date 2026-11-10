// AcquisitionOS — GET /api/admin/operations/alert-audit
import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdmin } from '@/lib/auth-middleware';
import { getDeliveryAudit, getPendingGroupCount, getDedupStateSize } from '@/lib/observability/ops-alerting/dispatcher';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withSuperAdmin(request, async () => {
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') || '50'), 200);
    const audit = getDeliveryAudit(limit);
    return NextResponse.json(
      {
        ok: true,
        timestamp: new Date().toISOString(),
        pendingGroups: getPendingGroupCount(),
        dedupStateSize: getDedupStateSize(),
        audit,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  });
}
