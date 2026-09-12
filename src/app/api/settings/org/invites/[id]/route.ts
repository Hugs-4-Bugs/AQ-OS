import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { revokeInvitation, changeInviteRole, sendInviteEmail, acceptInvitation, type InviteRole } from '@/lib/invite-lifecycle-service';

// ═══════════════════════════════════════════════════════════════════
// GET /api/settings/org/invites/[id] — Get invitation details
// POST /api/settings/org/invites/[id] — Accept/revoke/resend invitation
// DELETE /api/settings/org/invites/[id] — Delete invitation
// ═══════════════════════════════════════════════════════════════════

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;

    const invitation = await db.orgInvitation.findUnique({
      where: { id },
      include: {
        organization: {
          select: { id: true, name: true },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    // Check if user belongs to the same org
    if (authUser.orgId !== invitation.orgId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Determine status
    let status = 'sent';
    if (invitation.acceptedAt && invitation.acceptedAt.getTime() === 0) {
      status = 'expired';
    } else if (invitation.acceptedAt) {
      status = 'accepted';
    } else if (invitation.expiresAt < new Date()) {
      status = 'expired';
    }

    // Get inviter name
    const inviter = await db.user.findUnique({
      where: { id: invitation.invitedBy },
      select: { name: true, email: true },
    });

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        orgId: invitation.orgId,
        orgName: invitation.organization.name,
        email: invitation.email,
        role: invitation.role,
        token: invitation.token,
        invitedBy: invitation.invitedBy,
        inviterName: inviter?.name || inviter?.email || 'Unknown',
        status,
        expiresAt: invitation.expiresAt,
        acceptedAt: invitation.acceptedAt && invitation.acceptedAt.getTime() === 0 ? null : invitation.acceptedAt,
        createdAt: invitation.createdAt,
      },
    });
  } catch (error) {
    console.error('Get invitation error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invitation' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const action = body.action as string;

    if (!action) {
      return NextResponse.json({ error: 'Action is required (accept, revoke, resend, changeRole)' }, { status: 400 });
    }

    switch (action) {
      case 'accept': {
        // User accepting the invitation via magic link
        const token = body.token as string;
        if (!token) {
          return NextResponse.json({ error: 'Token is required for acceptance' }, { status: 400 });
        }

        const invitation = await acceptInvitation(token, authUser.id);
        return NextResponse.json({ invitation, message: 'Invitation accepted successfully' });
      }

      case 'revoke': {
        // Admin/owner revoking the invitation
        await revokeInvitation(id, authUser.id);
        return NextResponse.json({ message: 'Invitation revoked successfully' });
      }

      case 'resend': {
        // Admin/owner resending the invitation email
        try {
          const result = await sendInviteEmail(id);
          return NextResponse.json({ message: 'Invitation resent successfully', magicLink: result.magicLink });
        } catch (e) {
          return NextResponse.json(
            { error: e instanceof Error ? e.message : 'Failed to resend invitation' },
            { status: 400 }
          );
        }
      }

      case 'changeRole': {
        // Admin/owner changing the role before acceptance
        const newRole = body.role as InviteRole;
        if (!newRole || !['admin', 'member', 'viewer'].includes(newRole)) {
          return NextResponse.json({ error: 'Valid role is required (admin, member, viewer)' }, { status: 400 });
        }

        const invitation = await changeInviteRole(id, newRole, authUser.id);
        return NextResponse.json({ invitation, message: `Role changed to ${newRole}` });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: accept, revoke, resend, or changeRole' },
          { status: 400 }
        );
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('already') || error.message.includes('expired') || error.message.includes('Only organization') || error.message.includes('Cannot')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    console.error('Invitation action error:', error);
    return NextResponse.json(
      { error: 'Failed to process invitation action' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;

    // Check if invitation exists and belongs to user's org
    const invitation = await db.orgInvitation.findUnique({
      where: { id },
    });

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    if (invitation.orgId !== authUser.orgId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check permission
    const membership = await db.orgMember.findFirst({
      where: { orgId: invitation.orgId, userId: authUser.id },
    });

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only organization owners and admins can delete invitations' },
        { status: 403 }
      );
    }

    await db.orgInvitation.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Invitation deleted successfully' });
  } catch (error) {
    console.error('Delete invitation error:', error);
    return NextResponse.json(
      { error: 'Failed to delete invitation' },
      { status: 500 }
    );
  }
}
