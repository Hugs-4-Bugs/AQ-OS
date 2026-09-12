import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!authUser.orgId) {
      return NextResponse.json({ invitations: [] });
    }

    const invitations = await db.orgInvitation.findMany({
      where: { orgId: authUser.orgId },
      include: {
        inviter: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      invitations: invitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        token: inv.token,
        invitedBy: inv.inviter,
        expiresAt: inv.expiresAt,
        acceptedAt: inv.acceptedAt,
        createdAt: inv.createdAt,
      })),
    });
  } catch (error) {
    console.error('Get team invitations error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team invitations' },
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

    const body = await request.json();
    const { email, role, orgId } = body;

    if (!email || !role || !orgId) {
      return NextResponse.json(
        { error: 'Email, role, and orgId are required' },
        { status: 400 }
      );
    }

    // Verify the user belongs to this org
    const membership = await db.orgMember.findFirst({
      where: { orgId, userId: authUser.id },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'You are not a member of this organization' },
        { status: 403 }
      );
    }

    // Only admin/owner can invite
    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only owners and admins can send invitations' },
        { status: 403 }
      );
    }

    // Check for existing pending invitation
    const existingInvitation = await db.orgInvitation.findFirst({
      where: {
        orgId,
        email,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvitation) {
      return NextResponse.json(
        { error: 'A pending invitation already exists for this email' },
        { status: 409 }
      );
    }

    // Check if user is already a member
    const existingMember = await db.user.findUnique({
      where: { email },
      include: { organizations: { where: { orgId } } },
    });

    if (existingMember && existingMember.organizations.length > 0) {
      return NextResponse.json(
        { error: 'This user is already a member of the organization' },
        { status: 409 }
      );
    }

    // Generate unique token and set 7-day expiry
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await db.orgInvitation.create({
      data: {
        orgId,
        email,
        role,
        token,
        invitedBy: authUser.id,
        expiresAt,
      },
    });

    return NextResponse.json(
      {
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          token: invitation.token,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create team invitation error:', error);
    return NextResponse.json(
      { error: 'Failed to create team invitation' },
      { status: 500 }
    );
  }
}
