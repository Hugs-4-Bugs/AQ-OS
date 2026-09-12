// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Team Invitation API
// GET: Get invitation details (public — no auth required)
// POST: Accept invitation (requires auth)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

/** GET /api/team/invite/[token] — Get invitation details (public) */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const invitation = await db.orgInvitation.findUnique({
      where: { token },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            logo: true,
          },
        },
        inviter: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found' },
        { status: 404 }
      );
    }

    if (invitation.acceptedAt) {
      return NextResponse.json(
        { error: 'Invitation has already been accepted', alreadyAccepted: true },
        { status: 410 }
      );
    }

    if (invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Invitation has expired', expired: true },
        { status: 410 }
      );
    }

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
        organization: invitation.organization,
        inviter: invitation.inviter,
      },
    });
  } catch (error) {
    console.error('Error fetching invitation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invitation' },
      { status: 500 }
    );
  }
}

/** POST /api/team/invite/[token] — Accept invitation (requires auth) */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { token } = await params;

      const invitation = await db.orgInvitation.findUnique({
        where: { token },
      });

      if (!invitation) {
        return NextResponse.json(
          { error: 'Invitation not found' },
          { status: 404 }
        );
      }

      if (invitation.acceptedAt) {
        return NextResponse.json(
          { error: 'Invitation has already been accepted' },
          { status: 410 }
        );
      }

      if (invitation.expiresAt < new Date()) {
        return NextResponse.json(
          { error: 'Invitation has expired' },
          { status: 410 }
        );
      }

      // Check if user is already a member
      const existingMember = await db.orgMember.findFirst({
        where: { orgId: invitation.orgId, userId: user.id },
      });

      if (existingMember) {
        // Mark invitation as accepted anyway
        await db.orgInvitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        });

        return NextResponse.json(
          { error: 'You are already a member of this organization' },
          { status: 409 }
        );
      }

      // Create the membership and mark invitation as accepted in a transaction
      await db.$transaction([
        db.orgMember.create({
          data: {
            orgId: invitation.orgId,
            userId: user.id,
            role: invitation.role,
          },
        }),
        db.orgInvitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        }),
        // Update user's orgId
        db.user.update({
          where: { id: user.id },
          data: { orgId: invitation.orgId },
        }),
      ]);

      return NextResponse.json({
        message: 'Invitation accepted successfully',
        orgId: invitation.orgId,
        role: invitation.role,
      });
    } catch (error) {
      console.error('Error accepting invitation:', error);
      return NextResponse.json(
        { error: 'Failed to accept invitation' },
        { status: 500 }
      );
    }
  });
}
