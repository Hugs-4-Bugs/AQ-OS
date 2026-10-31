// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/admin/operations/system-health
// Phase 32: Aggregate platform-wide health metrics.
// RBAC: system.health.read (super_admin, admin, support, analytics)
// Read-only.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { getSystemHealth } from '@/lib/admin-operations-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withPermission(request, 'system.health.read', async () => {
    try {
      const data = await getSystemHealth();
      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error('[AdminOpsAPI] system-health error:', error);
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}
