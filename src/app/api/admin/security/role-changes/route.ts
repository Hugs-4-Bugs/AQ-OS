// GET /api/admin/security/role-changes — role change history
// RBAC: rbac.read (super_admin only)
import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withPermission(request, 'rbac.read', async () => {
    try {
      const { searchParams } = new URL(request.url);
      const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
      const offset = parseInt(searchParams.get('offset') || '0', 10);

      const where = {
        OR: [
          { action: { contains: 'rbac_assign' } },
          { action: { contains: 'rbac_remove' } },
        ],
      };

      const [entries, total] = await Promise.all([
        db.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: isNaN(limit) ? 50 : limit,
          skip: isNaN(offset) ? 0 : offset,
          select: {
            id: true, userId: true, action: true, details: true,
            ipAddress: true, userAgent: true, resource: true, resourceId: true,
            createdAt: true, requestId: true, outcome: true,
            beforeState: true, afterState: true, securityEventType: true, confirmed: true,
          },
        }),
        db.auditLog.count({ where }),
      ]);

      return NextResponse.json({ success: true, data: { entries, total } });
    } catch (error) {
      console.error('[SecurityAPI] role changes error:', error);
      return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
  });
}
