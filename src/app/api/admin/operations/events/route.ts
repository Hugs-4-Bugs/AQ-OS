// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/admin/operations/events
// Phase 32: Paginated list of SystemEvent records with filters.
// RBAC: system.health.read (super_admin, admin, support, analytics)
// Read-only.
//
// Query params:
//   type=error|warning|info|critical
//   source=<substring>
//   resolved=true|false
//   startDate=ISO, endDate=ISO
//   limit=N (max 200, default 50), offset=N
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { getOperationalEvents } from '@/lib/admin-operations-service';

export const dynamic = 'force-dynamic';

const VALID_TYPES = ['error', 'warning', 'info', 'critical'] as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withPermission(request, 'system.health.read', async () => {
    try {
      const { searchParams } = new URL(request.url);
      const typeParam = searchParams.get('type');
      const type =
        typeParam && (VALID_TYPES as readonly string[]).includes(typeParam)
          ? (typeParam as (typeof VALID_TYPES)[number])
          : undefined;
      const source = searchParams.get('source') || undefined;
      const resolvedParam = searchParams.get('resolved');
      const resolved =
        resolvedParam === 'true' ? true : resolvedParam === 'false' ? false : undefined;
      const startDateStr = searchParams.get('startDate');
      const endDateStr = searchParams.get('endDate');
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const offset = parseInt(searchParams.get('offset') || '0', 10);

      const data = await getOperationalEvents({
        type,
        source: source || undefined,
        resolved,
        startDate: startDateStr ? new Date(startDateStr) : undefined,
        endDate: endDateStr ? new Date(endDateStr) : undefined,
        limit: isNaN(limit) ? 50 : limit,
        offset: isNaN(offset) ? 0 : offset,
      });
      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error('[AdminOpsAPI] events list error:', error);
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}
