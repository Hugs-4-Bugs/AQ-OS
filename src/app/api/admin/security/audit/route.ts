// GET /api/admin/security/audit — production-grade audit search with filters
// RBAC: audit.read (super_admin, admin, support, analytics)
import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withPermission(request, 'audit.read', async () => {
    try {
      const { searchParams } = new URL(request.url);
      const actorId = searchParams.get('actorId') || undefined;
      const action = searchParams.get('action') || undefined;
      const resource = searchParams.get('resource') || undefined;
      const severity = searchParams.get('severity') || undefined;
      const securityEventType = searchParams.get('securityEventType') || undefined;
      const outcome = searchParams.get('outcome') || undefined;
      const requestId = searchParams.get('requestId') || undefined;
      const startDateStr = searchParams.get('startDate');
      const endDateStr = searchParams.get('endDate');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
      const offset = parseInt(searchParams.get('offset') || '0', 10);

      const where: Record<string, unknown> = {};
      if (actorId) where.userId = actorId;
      if (action) where.action = { contains: action };
      if (resource) where.resource = resource;
      if (severity) where.severity = severity;
      if (securityEventType) where.securityEventType = securityEventType;
      if (outcome) where.outcome = outcome;
      if (requestId) where.requestId = requestId;
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
            ipAddress: true, userAgent: true, resource: true, resourceId: true,
            createdAt: true, metadata: true,
            sequence: true, severity: true, requestId: true, outcome: true,
            beforeState: true, afterState: true, securityEventType: true, confirmed: true,
          },
        }),
        db.auditLog.count({ where }),
      ]);

      return NextResponse.json({ success: true, data: { entries, total } });
    } catch (error) {
      console.error('[SecurityAPI] audit search error:', error);
      return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
  });
}
