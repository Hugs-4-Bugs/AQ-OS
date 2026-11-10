// AcquisitionOS — POST /api/admin/operations/alert-ack
import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdmin } from '@/lib/auth-middleware';
import { acknowledgeAlert, clearAcknowledgement, isAcknowledged } from '@/lib/observability/ops-alerting/dispatcher';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withSuperAdmin(request, async (user) => {
    const body = await request.json().catch(() => ({}));
    const dedupKey = typeof body?.dedupKey === 'string' ? body.dedupKey : '';
    const action = typeof body?.action === 'string' ? body.action : 'ack';
    if (!dedupKey) {
      return NextResponse.json(
        { ok: false, error: 'dedupKey is required' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    if (action === 'unack') {
      clearAcknowledgement(dedupKey);
    } else {
      acknowledgeAlert(dedupKey);
    }
    return NextResponse.json(
      {
        ok: true,
        timestamp: new Date().toISOString(),
        dedupKey,
        action,
        acknowledged: action === 'ack' ? isAcknowledged(dedupKey) : !isAcknowledged(dedupKey),
        ackedBy: user.id,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  });
}
