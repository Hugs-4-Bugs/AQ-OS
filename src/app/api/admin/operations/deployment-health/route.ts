// GET /api/admin/operations/deployment-health — REAL deployment/runtime info
// RBAC: system.health.read (super_admin, admin, support, analytics)
import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { getDeploymentHealth } from '@/lib/admin-operations-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withPermission(request, 'system.health.read', async () => {
    try {
      const data = await getDeploymentHealth();
      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error('[AdminOpsAPI] deployment-health error:', error);
      return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
  });
}
