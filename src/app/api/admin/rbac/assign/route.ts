// POST /api/admin/rbac/assign — Assign/remove an admin role to a user
// Server-side authorized: requires 'rbac.assign' permission (SUPER_ADMIN only)
// Prevents self-escalation and escalation by non-super_admin users.
//
// BLOCKER 1 FIX: Sensitive action confirmation is SERVER-ENFORCED.
// The mutation requires a valid confirmationId + token that has been
// consumed through the existing confirmAction() mechanism.
// The confirmation is bound to the exact action+target and is single-use.
import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { canAssignRole, ADMIN_ROLES, type AdminRole } from '@/lib/rbac';
import { confirmAction, recordAuditEvent, type SensitiveAction } from '@/lib/security/audit-chain';
import { getRequestId } from '@/lib/security/request-id';
import { getClientIp, getUserAgent } from '@/lib/auth';

export async function POST(request: NextRequest) {
  return withPermission(request, 'rbac.assign', async (adminUser) => {
    try {
      const body = await request.json();
      const { userId, role, action, confirmationId, token } = body;

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

      // ── BLOCKER 1 FIX: SERVER-ENFORCED SENSITIVE ACTION CONFIRMATION ──
      // The mutation CANNOT proceed without a valid, consumed confirmation.
      const actionType = (action === 'assign' ? 'rbac_assign_role' : 'rbac_remove_role') as SensitiveAction;
      const requestId = getRequestId(request);
      const ipAddress = getClientIp(request);
      const userAgent = getUserAgent(request);

      if (!confirmationId || !token) {
        // Audit the failed attempt (no confirmation provided)
        await recordAuditEvent({
          actorId: adminUser.id,
          action: `rbac_${action}_role`,
          resource: 'user',
          resourceId: userId,
          details: { reason: 'missing_confirmation', targetRole: role },
          ipAddress,
          userAgent,
          requestId,
          severity: 'HIGH',
          outcome: 'denied',
          securityEventType: 'sensitive_action_rejected',
          confirmed: false,
        }).catch(() => {});

        return NextResponse.json(
          { error: 'Sensitive action confirmation required. Call POST /api/admin/security/confirmation/request first, then provide confirmationId + token.' },
          { status: 403 }
        );
      }

      // Validate + consume the confirmation through the existing mechanism
      const confirmationResult = await confirmAction({
        confirmationId,
        token,
        actionType,
        targetId: userId,
        adminId: adminUser.id,
      });

      if (!confirmationResult.valid) {
        // Audit the failed confirmation
        await recordAuditEvent({
          actorId: adminUser.id,
          action: `rbac_${action}_role`,
          resource: 'user',
          resourceId: userId,
          details: { reason: 'confirmation_failed', rejectionReason: confirmationResult.reason, targetRole: role },
          ipAddress,
          userAgent,
          requestId,
          severity: 'HIGH',
          outcome: 'denied',
          securityEventType: 'sensitive_action_rejected',
          confirmed: false,
        }).catch(() => {});

        return NextResponse.json(
          { error: `Confirmation invalid: ${confirmationResult.reason}` },
          { status: 403 }
        );
      }

      // ── Confirmation is valid + consumed — proceed with mutation ──
      const targetUser = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, role: true, isActive: true },
      });
      if (!targetUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const newRole = action === 'assign' ? role : 'owner';
      const previousRole = targetUser.role;

      await db.user.update({ where: { id: userId }, data: { role: newRole } });

      // Audit the successful mutation through the tamper-evident chain writer
      await recordAuditEvent({
        actorId: adminUser.id,
        action: `rbac_${action}_role`,
        resource: 'user',
        resourceId: userId,
        details: { targetEmail: targetUser.email, targetRole: role, confirmationId },
        ipAddress,
        userAgent,
        requestId,
        severity: action === 'assign' && role === 'super_admin' ? 'CRITICAL' : 'HIGH',
        outcome: 'success',
        securityEventType: 'authz_role_change',
        confirmed: true,
        beforeState: { role: previousRole },
        afterState: { role: newRole },
      }).catch(() => {});

      // Also record a security event for super_admin escalation
      if (action === 'assign' && role === 'super_admin') {
        const { recordSecurityEvent } = await import('@/lib/security/audit-chain');
        void recordSecurityEvent({
          actorId: adminUser.id,
          securityEventType: 'authz_privilege_escalation',
          severity: 'CRITICAL',
          action: 'privilege_escalation',
          resource: 'user',
          resourceId: userId,
          details: { targetEmail: targetUser.email, newRole },
          ipAddress,
          userAgent,
          requestId,
          outcome: 'success',
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
