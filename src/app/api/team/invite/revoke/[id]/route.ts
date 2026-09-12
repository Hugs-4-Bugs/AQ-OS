// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Revoke Invitation API
// DELETE: Revoke a pending invitation
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

/** DELETE /api/team/invite/revoke/[id] — Revoke a pending invitation */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withPermission(request, 'team:write', async (user) => {
    try {
      const { id } = await params;

      if (!user.orgId) {
        return NextResponse.json(
          { error: 'You are not part of an organization' },
          { status: 400 }
        );
      }

      const invitation = await db.orgInvitation.findFirst({
        where: { id, orgId: user.orgId, acceptedAt: null },
      });

      if (!invitation) {
        return NextResponse.json(
          { error: 'Invitation not found or already accepted' },
          { status: 404 }
        );
      }

      await db.orgInvitation.delete({
        where: { id },
      });

      return NextResponse.json({
        message: 'Invitation revoked successfully',
      });
    } catch (error) {
      console.error('Error revoking invitation:', error);
      return NextResponse.json(
        { error: 'Failed to revoke invitation' },
        { status: 500 }
      );
    }
  });
}
