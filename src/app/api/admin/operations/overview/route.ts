// GET /api/admin/operations/overview — REAL unified operations overview
// RBAC: system.health.read (super_admin, admin, support, analytics)
// Aggregates all subsystems into a single status panel. Every status is
// backed by actual DB queries or real provider checks. No fabricated HEALTHY.
import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { getUnifiedOperationsOverview } from '@/lib/admin-operations-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withPermission(request, 'system.health.read', async () => {
    try {
      const data = await getUnifiedOperationsOverview();
      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error('[AdminOpsAPI] unified overview error:', error);
      return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
  });
}
