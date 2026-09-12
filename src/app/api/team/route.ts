// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Team API
// GET: List organization members
// POST: Invite a team member
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withPermission } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import crypto from 'crypto';

/** GET /api/team — List organization members and pending invitations */
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      if (!user.orgId) {
        return NextResponse.json(
          { error: 'You are not part of an organization' },
          { status: 400 }
        );
      }

      const [members, invitations] = await Promise.all([
        db.orgMember.findMany({
          where: { orgId: user.orgId },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        }),
        db.orgInvitation.findMany({
          where: {
            orgId: user.orgId,
            acceptedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      return NextResponse.json({
        members: members.map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt,
          user: m.user,
        })),
        invitations: invitations.map((inv) => ({
          id: inv.id,
          email: inv.email,
          role: inv.role,
          token: inv.token,
          createdAt: inv.createdAt,
          expiresAt: inv.expiresAt,
        })),
      });
    } catch (error) {
      console.error('Error fetching team:', error);
      return NextResponse.json(
        { error: 'Failed to fetch team members' },
        { status: 500 }
      );
    }
  });
}

/** POST /api/team — Invite a team member */
export async function POST(request: NextRequest) {
  return withPermission(request, 'team:write', async (user) => {
    try {
      if (!user.orgId) {
        return NextResponse.json(
          { error: 'You are not part of an organization' },
          { status: 400 }
        );
      }

      const body = await request.json();
      const { email, role } = body;

      if (!email || !email.includes('@')) {
        return NextResponse.json(
          { error: 'Valid email is required' },
          { status: 400 }
        );
      }

      const validRoles = ['admin', 'member', 'viewer'];
      if (!role || !validRoles.includes(role)) {
        return NextResponse.json(
          { error: 'Valid role is required (admin, member, viewer)' },
          { status: 400 }
        );
      }

      // Check if user is already a member
      const existingUser = await db.user.findUnique({ where: { email } });
      if (existingUser) {
        const existingMember = await db.orgMember.findFirst({
          where: { orgId: user.orgId, userId: existingUser.id },
        });
        if (existingMember) {
          return NextResponse.json(
            { error: 'This user is already a team member' },
            { status: 409 }
          );
        }
      }

      // Check for existing pending invitation
      const existingInvitation = await db.orgInvitation.findFirst({
        where: {
          orgId: user.orgId,
          email,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (existingInvitation) {
        return NextResponse.json(
          { error: 'An invitation has already been sent to this email' },
          { status: 409 }
        );
      }

      // Create invitation with token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const invitation = await db.orgInvitation.create({
        data: {
          orgId: user.orgId,
          email,
          role,
          token,
          invitedBy: user.id,
          expiresAt,
        },
      });

      return NextResponse.json({
        message: 'Invitation sent successfully',
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          token: invitation.token,
          createdAt: invitation.createdAt,
          expiresAt: invitation.expiresAt,
        },
      }, { status: 201 });
    } catch (error) {
      console.error('Error inviting team member:', error);
      return NextResponse.json(
        { error: 'Failed to send invitation' },
        { status: 500 }
      );
    }
  });
}
