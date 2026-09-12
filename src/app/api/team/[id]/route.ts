// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Team Member API
// PATCH: Update team member role
// DELETE: Remove team member
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withPermission } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

/** PATCH /api/team/[id] — Update team member role */
export async function PATCH(
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

      // Find the member
      const member = await db.orgMember.findFirst({
        where: { id, orgId: user.orgId },
      });

      if (!member) {
        return NextResponse.json(
          { error: 'Team member not found' },
          { status: 404 }
        );
      }

      // Cannot change owner's role
      if (member.role === 'owner') {
        return NextResponse.json(
          { error: 'Cannot change owner role' },
          { status: 403 }
        );
      }

      // Cannot change your own role
      if (member.userId === user.id) {
        return NextResponse.json(
          { error: 'Cannot change your own role' },
          { status: 403 }
        );
      }

      const body = await request.json();
      const { role } = body;

      const validRoles = ['admin', 'member', 'viewer'];
      if (!role || !validRoles.includes(role)) {
        return NextResponse.json(
          { error: 'Valid role is required (admin, member, viewer)' },
          { status: 400 }
        );
      }

      const updated = await db.orgMember.update({
        where: { id },
        data: { role },
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
      });

      return NextResponse.json({
        message: 'Role updated successfully',
        member: {
          id: updated.id,
          userId: updated.userId,
          role: updated.role,
          joinedAt: updated.joinedAt,
          user: updated.user,
        },
      });
    } catch (error) {
      console.error('Error updating team member:', error);
      return NextResponse.json(
        { error: 'Failed to update team member' },
        { status: 500 }
      );
    }
  });
}

/** DELETE /api/team/[id] — Remove team member */
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

      // Find the member
      const member = await db.orgMember.findFirst({
        where: { id, orgId: user.orgId },
      });

      if (!member) {
        return NextResponse.json(
          { error: 'Team member not found' },
          { status: 404 }
        );
      }

      // Cannot remove owner
      if (member.role === 'owner') {
        return NextResponse.json(
          { error: 'Cannot remove the organization owner' },
          { status: 403 }
        );
      }

      // Cannot remove yourself
      if (member.userId === user.id) {
        return NextResponse.json(
          { error: 'Cannot remove yourself' },
          { status: 403 }
        );
      }

      await db.orgMember.delete({
        where: { id },
      });

      return NextResponse.json({
        message: 'Team member removed successfully',
      });
    } catch (error) {
      console.error('Error removing team member:', error);
      return NextResponse.json(
        { error: 'Failed to remove team member' },
        { status: 500 }
      );
    }
  });
}
