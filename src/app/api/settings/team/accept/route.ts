// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Settings: Team Accept Invitation API Route
// POST /api/settings/team/accept — Accept team invitation
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, logAuthEvent, getClientIp, getUserAgent } from '@/lib/auth';

// POST /api/settings/team/accept - Accept team invitation
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: 'Invitation token is required' }, { status: 400 });
    }

    // Find the invitation
    const invitation = await db.orgInvitation.findUnique({
      where: { token },
      include: { organization: true },
    });

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    // Check if already accepted
    if (invitation.acceptedAt) {
      return NextResponse.json({ error: 'Invitation has already been accepted' }, { status: 400 });
    }

    // Check if expired
    if (invitation.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 });
    }

    // Verify the user's email matches the invitation
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'This invitation is not for your email address' },
        { status: 403 }
      );
    }

    // Check if user already in an org
    const existingMembership = await db.orgMember.findFirst({
      where: { userId: user.id },
    });

    if (existingMembership) {
      return NextResponse.json(
        { error: 'You already belong to an organization. Leave your current org first.' },
        { status: 400 }
      );
    }

    // Accept invitation in a transaction
    const result = await db.$transaction(async (tx) => {
      // Mark invitation as accepted
      await tx.orgInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      // Add user to org
      await tx.orgMember.create({
        data: {
          orgId: invitation.orgId,
          userId: user.id,
          role: invitation.role,
        },
      });

      // Update user's orgId
      await tx.user.update({
        where: { id: user.id },
        data: { orgId: invitation.orgId },
      });

      return invitation.organization;
    });

    // Audit log
    await logAuthEvent({
      userId: user.id,
      action: 'invite_accepted',
      details: JSON.stringify({ orgId: invitation.orgId, orgName: result.name, role: invitation.role }),
      ipAddress: ip,
      userAgent: ua,
      resource: 'org_invitation',
      resourceId: invitation.id,
    });

    return NextResponse.json({
      success: true,
      organization: {
        id: result.id,
        name: result.name,
        logo: result.logo,
      },
      role: invitation.role,
    });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      return NextResponse.json({ error: error.message }, { status: (error as { statusCode: number }).statusCode });
    }
    console.error('Error accepting invitation:', error);
    return NextResponse.json({ error: 'Failed to accept invitation' }, { status: 500 });
  }
}
