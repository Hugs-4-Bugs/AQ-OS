// GET /api/admin/security/audit/[id] — secure detail view
// RBAC: audit.read
import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  return withPermission(request, 'audit.read', async () => {
    try {
      if (!id || id.length < 4) {
        return NextResponse.json({ success: false, error: 'Valid audit id required' }, { status: 400 });
      }
      const entry = await db.auditLog.findUnique({
        where: { id },
        select: {
          id: true, userId: true, action: true, details: true,
          ipAddress: true, userAgent: true, resource: true, resourceId: true,
          createdAt: true, metadata: true,
          sequence: true, previousHash: true, eventHash: true,
          severity: true, requestId: true, outcome: true,
          beforeState: true, afterState: true, securityEventType: true, confirmed: true,
        },
      });
      if (!entry) {
        return NextResponse.json({ success: false, error: 'Audit entry not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: entry });
    } catch (error) {
      console.error('[SecurityAPI] audit detail error:', error);
      return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
  });
}
