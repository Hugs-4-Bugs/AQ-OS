// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/admin/operations/audit
// Phase 32: Paginated AuditLog search with filters.
// RBAC: audit.read (super_admin, admin, support, analytics)
// Read-only.
//
// Query params:
//   userId=<id>, action=<substring>, resource=<name>
//   startDate=ISO, endDate=ISO
//   limit=N (max 200, default 50), offset=N
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { getAuditLog } from '@/lib/admin-operations-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withPermission(request, 'audit.read', async () => {
    try {
      const { searchParams } = new URL(request.url);
      const userId = searchParams.get('userId') || undefined;
      const action = searchParams.get('action') || undefined;
      const resource = searchParams.get('resource') || undefined;
      const startDateStr = searchParams.get('startDate');
      const endDateStr = searchParams.get('endDate');
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const offset = parseInt(searchParams.get('offset') || '0', 10);

      const data = await getAuditLog({
        userId: userId || undefined,
        action: action || undefined,
        resource: resource || undefined,
        startDate: startDateStr ? new Date(startDateStr) : undefined,
        endDate: endDateStr ? new Date(endDateStr) : undefined,
        limit: isNaN(limit) ? 50 : limit,
        offset: isNaN(offset) ? 0 : offset,
      });
      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error('[AdminOpsAPI] audit search error:', error);
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}
