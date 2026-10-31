// POST /api/admin/security/confirmation/confirm — confirm a sensitive action
// RBAC: rbac.assign (super_admin only)
import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { confirmAction, SENSITIVE_ACTIONS, type SensitiveAction } from '@/lib/security/audit-chain';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withPermission(request, 'rbac.assign', async (admin) => {
    try {
      const body = await request.json();
      const { confirmationId, token, actionType, targetId } = body;

      if (!confirmationId || !token || !actionType || !targetId) {
        return NextResponse.json(
          { success: false, error: 'confirmationId, token, actionType, and targetId are required' },
          { status: 400 }
        );
      }
      if (!SENSITIVE_ACTIONS.includes(actionType as SensitiveAction)) {
        return NextResponse.json({ success: false, error: 'Invalid actionType' }, { status: 400 });
      }

      const result = await confirmAction({
        confirmationId,
        token,
        actionType: actionType as SensitiveAction,
        targetId,
        adminId: admin.id,
      });

      return NextResponse.json({ success: result.valid, data: result }, {
        status: result.valid ? 200 : 400,
      });
    } catch (error) {
      console.error('[SecurityAPI] confirmation confirm error:', error);
      return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
  });
}
