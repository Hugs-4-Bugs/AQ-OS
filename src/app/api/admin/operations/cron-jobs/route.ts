// GET /api/admin/operations/cron-jobs — REAL cron/job monitoring
// RBAC: system.health.read (super_admin, admin, support, analytics)
import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { getCronJobMonitoring } from '@/lib/admin-operations-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withPermission(request, 'system.health.read', async () => {
    try {
      const data = await getCronJobMonitoring();
      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error('[AdminOpsAPI] cron-jobs monitoring error:', error);
      return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
  });
}
