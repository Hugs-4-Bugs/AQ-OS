// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Settings: Revoke Team Invitation API Route
// DELETE /api/settings/team/invite/[id] — Revoke/cancel invitation
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, logAuthEvent, getClientIp, getUserAgent } from '@/lib/auth';

// DELETE /api/settings/team/invite/[id] - Revoke a pending invitation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    const ip = getClientIp(request);
    const ua = getUserAgent(request);
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Invitation ID is required' }, { status: 400 });
    }

    // Find the invitation
    const invitation = await db.orgInvitation.findUnique({
      where: { id },
    });

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    // RBAC: Only owner/admin of the org, or the person who sent the invite, can revoke
    const membership = await db.orgMember.findFirst({
      where: { userId: user.id, orgId: invitation.orgId },
    });

    const isInviter = invitation.invitedBy === user.id;
    const isOrgAdmin = membership && ['owner', 'admin'].includes(membership.role);

    if (!isInviter && !isOrgAdmin) {
      return NextResponse.json(
        { error: 'Only organization owners, admins, or the original inviter can revoke invitations' },
        { status: 403 }
      );
    }

    // Check if already accepted
    if (invitation.acceptedAt) {
      return NextResponse.json(
        { error: 'Cannot revoke an already accepted invitation' },
        { status: 400 }
      );
    }

    // Delete the invitation
    await db.orgInvitation.delete({
      where: { id },
    });

    // Audit log
    await logAuthEvent({
      userId: user.id,
      action: 'invite_revoked',
      details: JSON.stringify({ invitationId: id, email: invitation.email, orgId: invitation.orgId }),
      ipAddress: ip,
      userAgent: ua,
      resource: 'org_invitation',
      resourceId: id,
    });

    return NextResponse.json({ success: true, message: 'Invitation revoked' });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      return NextResponse.json({ error: error.message }, { status: (error as { statusCode: number }).statusCode });
    }
    console.error('Error revoking invitation:', error);
    return NextResponse.json({ error: 'Failed to revoke invitation' }, { status: 500 });
  }
}
