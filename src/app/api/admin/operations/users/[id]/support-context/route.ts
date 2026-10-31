// GET /api/admin/operations/users/[id]/support-context — REAL per-user operational view
// RBAC: user360.read (super_admin, admin, support, analytics) — same as Phase 30
// Reuses existing models — no duplicate User360 implementation.
import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { getUserSupportContext } from '@/lib/admin-operations-service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  return withPermission(request, 'user360.read', async () => {
    try {
      if (!id || id.length < 4) {
        return NextResponse.json({ success: false, error: 'Valid user id is required' }, { status: 400 });
      }
      const data = await getUserSupportContext({ userId: id });
      if (!data) {
        return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error('[AdminOpsAPI] user support context error:', error);
      return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
  });
}
