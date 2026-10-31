// GET /api/admin/operations/workflows — REAL workflow execution monitoring
// RBAC: system.health.read (super_admin, admin, support, analytics)
import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { getWorkflowMonitoring } from '@/lib/admin-operations-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withPermission(request, 'system.health.read', async () => {
    try {
      const { searchParams } = new URL(request.url);
      const status = searchParams.get('status') || undefined;
      const userId = searchParams.get('userId') || undefined;
      const workflowId = searchParams.get('workflowId') || undefined;
      const startDateStr = searchParams.get('startDate');
      const endDateStr = searchParams.get('endDate');
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const offset = parseInt(searchParams.get('offset') || '0', 10);

      const data = await getWorkflowMonitoring({
        status, userId, workflowId,
        startDate: startDateStr ? new Date(startDateStr) : undefined,
        endDate: endDateStr ? new Date(endDateStr) : undefined,
        limit: isNaN(limit) ? 50 : limit,
        offset: isNaN(offset) ? 0 : offset,
      });
      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error('[AdminOpsAPI] workflows monitoring error:', error);
      return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
  });
}
