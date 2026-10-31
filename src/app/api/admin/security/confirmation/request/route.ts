// POST /api/admin/security/confirmation/request — request sensitive action confirmation
// RBAC: rbac.assign (super_admin only — only super_admin can request role-change confirmations)
import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { requestConfirmation, SENSITIVE_ACTIONS, type SensitiveAction } from '@/lib/security/audit-chain';
import { getClientIp, getUserAgent } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withPermission(request, 'rbac.assign', async (admin) => {
    try {
      const body = await request.json();
      const { actionType, targetId } = body;

      if (!actionType || !SENSITIVE_ACTIONS.includes(actionType as SensitiveAction)) {
        return NextResponse.json(
          { success: false, error: `Invalid actionType. Valid: ${SENSITIVE_ACTIONS.join(', ')}` },
          { status: 400 }
        );
      }
      if (!targetId || typeof targetId !== 'string') {
        return NextResponse.json({ success: false, error: 'targetId is required' }, { status: 400 });
      }

      const result = await requestConfirmation({
        actionType: actionType as SensitiveAction,
        targetId,
        adminId: admin.id,
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
      });

      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      console.error('[SecurityAPI] confirmation request error:', error);
      return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
  });
}
