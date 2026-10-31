// GET /api/admin/security/events — security events list (filtered by securityEventType)
// RBAC: security.events.read (super_admin, admin)
import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withPermission(request, 'security.events.read', async () => {
    try {
      const { searchParams } = new URL(request.url);
      const severity = searchParams.get('severity') || undefined;
      const securityEventType = searchParams.get('securityEventType') || undefined;
      const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
      const offset = parseInt(searchParams.get('offset') || '0', 10);
      const startDateStr = searchParams.get('startDate');
      const endDateStr = searchParams.get('endDate');

      const where: Record<string, unknown> = {
        securityEventType: { not: null },
      };
      if (severity) where.severity = severity;
      if (securityEventType) where.securityEventType = securityEventType;
      if (startDateStr || endDateStr) {
        const createdAt: Record<string, Date> = {};
        if (startDateStr) createdAt.gte = new Date(startDateStr);
        if (endDateStr) createdAt.lte = new Date(endDateStr);
        where.createdAt = createdAt;
      }

      const [entries, total] = await Promise.all([
        db.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: isNaN(limit) ? 50 : limit,
          skip: isNaN(offset) ? 0 : offset,
          select: {
            id: true, userId: true, action: true, details: true,
            ipAddress: true, resource: true, resourceId: true,
            createdAt: true, severity: true, requestId: true, outcome: true,
            securityEventType: true, confirmed: true,
          },
        }),
        db.auditLog.count({ where }),
      ]);

      return NextResponse.json({ success: true, data: { entries, total } });
    } catch (error) {
      console.error('[SecurityAPI] events list error:', error);
      return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
  });
}
