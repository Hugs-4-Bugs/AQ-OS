// POST /api/admin/rbac/assign — Assign/remove an admin role to a user
// Server-side authorized: requires 'rbac.assign' permission (SUPER_ADMIN only)
// Prevents self-escalation and escalation by non-super_admin users.
import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { canAssignRole, ADMIN_ROLES, type AdminRole } from '@/lib/rbac';

export async function POST(request: NextRequest) {
  return withPermission(request, 'rbac.assign', async (adminUser) => {
    try {
      const body = await request.json();
      const { userId, role, action } = body;

      if (!userId || !role || !action) {
        return NextResponse.json({ error: 'userId, role, and action are required' }, { status: 400 });
      }
      if (!['assign', 'remove'].includes(action)) {
        return NextResponse.json({ error: 'action must be "assign" or "remove"' }, { status: 400 });
      }
      if (!ADMIN_ROLES.includes(role as AdminRole)) {
        return NextResponse.json({ error: `Invalid admin role. Valid: ${ADMIN_ROLES.join(', ')}` }, { status: 400 });
      }

      // Prevent self-modification (cannot change your own role)
      if (userId === adminUser.id) {
        return NextResponse.json({ error: 'Cannot modify your own admin role' }, { status: 403 });
      }

      // Check if assigner can assign this role
      if (!canAssignRole(adminUser.role as never, role as never)) {
        return NextResponse.json({ error: 'Insufficient authority to assign this role' }, { status: 403 });
      }

      const targetUser = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true, isActive: true } });
      if (!targetUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const newRole = action === 'assign' ? role : 'owner'; // remove → revert to owner (default)
      const previousRole = targetUser.role;

      await db.user.update({ where: { id: userId }, data: { role: newRole } });

      // Audit log
      await db.auditLog.create({
        data: {
          userId: adminUser.id,
          action: `rbac_${action}_role`,
          resource: 'user',
          resourceId: userId,
          details: JSON.stringify({ previousRole, newRole, targetEmail: targetUser.email }),
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        },
      }).catch(() => {});

      // Security event for role escalation
      if (action === 'assign' && role === 'super_admin') {
        await db.systemEvent.create({
          data: {
            type: 'info',
            category: 'security',
            message: `Super admin role assigned to ${targetUser.email} by ${adminUser.email}`,
            metadata: JSON.stringify({ targetUserId: userId, assignerId: adminUser.id }),
            resolved: false,
          },
        }).catch(() => {});
      }

      return NextResponse.json({
        success: true,
        data: { userId, previousRole, newRole, action },
      });
    } catch (error) {
      console.error('RBAC assign error:', error);
      return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
    }
  });
}
