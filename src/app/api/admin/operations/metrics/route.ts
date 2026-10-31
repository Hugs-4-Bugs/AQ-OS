// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/admin/operations/metrics
// Phase 32: Aggregate operational metrics for the dashboard.
// RBAC: system.health.read (super_admin, admin, support, analytics)
// Read-only.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { getOperationalMetrics } from '@/lib/admin-operations-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withPermission(request, 'system.health.read', async () => {
    try {
      const data = await getOperationalMetrics();
      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error('[AdminOpsAPI] metrics error:', error);
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}
