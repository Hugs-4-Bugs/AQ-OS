// GET /api/admin/security/config-changes — configuration change history
// RBAC: audit.read (super_admin, admin, support, analytics)
import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withPermission(request, 'audit.read', async () => {
    try {
      const { searchParams } = new URL(request.url);
      const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
      const offset = parseInt(searchParams.get('offset') || '0', 10);

      const where = {
        securityEventType: 'config_change',
      };

      const [entries, total] = await Promise.all([
        db.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: isNaN(limit) ? 50 : limit,
          skip: isNaN(offset) ? 0 : offset,
          select: {
            id: true, userId: true, action: true, details: true,
            ipAddress: true, resource: true, resourceId: true,
            createdAt: true, requestId: true, outcome: true,
            beforeState: true, afterState: true, securityEventType: true, confirmed: true,
          },
        }),
        db.auditLog.count({ where }),
      ]);

      return NextResponse.json({ success: true, data: { entries, total } });
    } catch (error) {
      console.error('[SecurityAPI] config changes error:', error);
      return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
  });
}
