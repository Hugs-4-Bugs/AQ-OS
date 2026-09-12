import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createInvitation, listOrgInvitations, sendInviteEmail, type InviteRole } from '@/lib/invite-lifecycle-service';

// ═══════════════════════════════════════════════════════════════════
// GET /api/settings/org/invites — List all org invitations
// POST /api/settings/org/invites — Create new invitation
// ═══════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!authUser.orgId) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    const invitations = await listOrgInvitations(authUser.orgId);

    return NextResponse.json({ invitations });
  } catch (error) {
    console.error('List org invitations error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invitations' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!authUser.orgId) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    const body = await request.json();
    const { email, role } = body;

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles: InviteRole[] = ['admin', 'member', 'viewer'];
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
        { status: 400 }
      );
    }

    // Create invitation
    const invitation = await createInvitation({
      orgId: authUser.orgId,
      email,
      role,
      invitedBy: authUser.id,
    });

    // Send invite email
    try {
      await sendInviteEmail(invitation.id);
    } catch (emailError) {
      console.warn('Failed to send invite email:', emailError);
      // Continue even if email fails — invitation is still created
    }

    return NextResponse.json({ invitation }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('already') || error.message.includes('Invalid') || error.message.includes('Maximum') || error.message.includes('Only organization')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    console.error('Create invitation error:', error);
    return NextResponse.json(
      { error: 'Failed to create invitation' },
      { status: 500 }
    );
  }
}
