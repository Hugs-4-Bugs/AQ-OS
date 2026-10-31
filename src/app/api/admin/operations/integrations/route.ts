// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/admin/operations/integrations
// Phase 32: Per-provider integration status with evidence-based health.
// RBAC: integrations.read (super_admin, admin, support, analytics)
// Read-only.
//
// Returns: per-provider { configState, reachability, health, evidence }
// HEALTHY is NEVER claimed from env var presence alone.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { getIntegrationsStatus } from '@/lib/admin-operations-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withPermission(request, 'integrations.read', async () => {
    try {
      const data = await getIntegrationsStatus();
      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error('[AdminOpsAPI] integrations status error:', error);
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}
