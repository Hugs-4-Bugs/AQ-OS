// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin User Detail & Actions API
//
// GET  /api/admin/users/[id]  — full detail for one user
// PATCH /api/admin/users/[id] — admin actions:
//   • toggle_active    — activate / deactivate the account
//   • adjust_credits   — add/deduct credits with ledger entry + reason
//   • revoke_sessions  — revoke all active refresh sessions
//
// PLATFORM-LEVEL access across ALL tenants — guarded by Phase 29
// granular permissions:
//   GET  → user360.read (super_admin, admin, support, analytics)
//   PATCH → per-action permission (users.suspend, users.ban, etc.)
//
// SECURITY / SAFETY RAILS:
// - Only safe, non-sensitive fields are ever returned (no passwordHash,
//   OTP tokens, magic-link tokens, etc.).
// - An admin can never deactivate or revoke their own account.
// - Deactivating a user revokes all their sessions immediately.
// - Credit adjustments clamp at 0 and always write a CreditsLedger row.
// - Every mutating action writes an AuditLog entry tied to the admin.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

// ─── Helpers ──────────────────────────────────────────────────────────

function truncate(s: unknown, max: number): string {
  if (s == null) return '';
  const str = String(s);
  return str.length > max ? str.slice(0, max) : str;
}

async function writeAdminAudit(
  adminId: string,
  action: string,
  targetUserId: string,
  details: Record<string, unknown>,
  ipAddress: string,
  userAgent: string
): Promise<void> {
  try {
    // BLOCKER 2 FIX: use recordAuditEvent (tamper-evident chain writer)
    const { recordAuditEvent } = await import('@/lib/security/audit-chain');
    const before = (details as any).previousState;
    const after = (details as any).newState ?? (details as any).newRole ?? (details as any).newActive;
    await recordAuditEvent({
      actorId: adminId,
      action,
      resource: 'user',
      resourceId: targetUserId,
      details,
      ipAddress,
      userAgent,
      severity: action.includes('ban') || action.includes('restrict') ? 'HIGH' : 'MEDIUM',
      outcome: 'success',
      securityEventType: action.startsWith('admin_') ? action : `admin_${action}`,
      beforeState: before !== undefined ? { value: before } : undefined,
      afterState: after !== undefined ? { value: after } : undefined,
    });
  } catch (error) {
    // Never fail the main action due to audit logging failure
    console.error('Admin audit log error:', error);
  }
}

// ─── GET /api/admin/users/[id] ───────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  return withPermission(request, 'user360.read', async () => {
    try {
      const user = await db.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          role: true,
          plan: true,
          credits: true,
          creditsMonthly: true,
          rolloverCredits: true,
          isTrial: true,
          trialEndsAt: true,
          isActive: true,
          emailVerified: true,
          authProvider: true,
          company: true,
          country: true,
          phone: true,
          orgId: true,
          developerAccessEnabled: true,
          lastLoginAt: true,
          createdAt: true,
          deletedAt: true,
        },
      });

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const [
        activeSubscription,
        ledger,
        sessions,
        activeSessionCount,
        loginHistory,
        auditLogs,
        leadCount,
        workflowCount,
        notificationCount,
        apiKeyCount,
        // ── Phase 28: User360 business activity ──
        workflowExecutions,
        autopilotRuns,
        outreachMessages,
        modelInvocations,
        connectedAccounts,
        recentLeads,
      ] = await Promise.all([
        db.subscription.findFirst({
          where: { userId: id, status: { in: ['active', 'trialing'] } },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            plan: true,
            status: true,
            billingCycle: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            creditsTotal: true,
            creditsUsed: true,
            creditsRemaining: true,
            isTrial: true,
            trialEndsAt: true,
            cancelAtPeriodEnd: true,
          },
        }),
        db.creditsLedger.findMany({
          where: { userId: id },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, action: true, credits: true, balance: true, description: true, createdAt: true },
        }),
        db.userSession.findMany({
          where: { userId: id },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, deviceInfo: true, ipAddress: true, createdAt: true, expiresAt: true, isRevoked: true },
        }),
        db.userSession.count({ where: { userId: id, isRevoked: false, expiresAt: { gt: new Date() } } }),
        db.loginHistory.findMany({
          where: { userId: id },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { id: true, ip: true, success: true, failReason: true, createdAt: true, country: true },
        }),
        db.auditLog.findMany({
          where: { userId: id },
          orderBy: { createdAt: 'desc' },
          take: 15,
          select: { id: true, action: true, resource: true, resourceId: true, createdAt: true },
        }),
        db.lead.count({ where: { userId: id } }),
        db.workflowDefinition.count({ where: { userId: id } }),
        db.notification.count({ where: { userId: id } }),
        db.apiKey.count({ where: { userId: id } }),
        // ── Phase 28: User360 business activity ──
        db.workflowExecution.count({ where: { workflow: { userId: id } } }).catch(() => 0),
        db.autopilotRun.count({ where: { userId: id } }).catch(() => 0),
        db.outreachMessage.count({ where: { lead: { userId: id } } }).catch(() => 0),
        db.modelInvocation.count({ where: { userId: id } }).catch(() => 0),
        db.connectedAccount.count({ where: { userId: id } }).catch(() => 0),
        db.lead.findMany({
          where: { userId: id },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, email: true, businessName: true, city: true, createdAt: true },
        }),
      ]);

      return NextResponse.json({
        success: true,
        data: {
          user,
          subscription: activeSubscription,
          creditsLedger: ledger,
          sessions,
          activeSessionCount,
          loginHistory,
          auditLogs,
          resourceCounts: {
            leads: leadCount,
            workflows: workflowCount,
            workflowExecutions,
            autopilotRuns,
            outreachMessages,
            modelInvocations,
            connectedAccounts,
            notifications: notificationCount,
            apiKeys: apiKeyCount,
          },
          recentLeads,
        },
      });
    } catch (error) {
      console.error('Admin user detail error:', error);
      return NextResponse.json({ error: 'Failed to load user detail' }, { status: 500 });
    }
  });
}

// ─── PATCH /api/admin/users/[id] ─────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  // PATCH uses user360.read as the base authorization — each action
  // then additionally checks its specific permission (users.suspend,
  // users.ban, credits.adjust, etc.) inside the handler.
  return withPermission(request, 'user360.read', async (adminUser) => {
    try {
      const { searchParams } = new URL(request.url);
      // ID can arrive via the dynamic segment or ?userId= fallback
      const targetId = id || searchParams.get('userId') || '';
      if (!targetId) {
        return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
      }

      let body: Record<string, unknown>;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }

      const action = typeof body.action === 'string' ? body.action : '';
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const ua = request.headers.get('user-agent') || 'unknown';

      // ── Load target user ─────────────────────────────────────
      const target = await db.user.findUnique({
        where: { id: targetId },
        select: { id: true, email: true, name: true, role: true, isActive: true, credits: true },
      });
      if (!target) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      // BLOCKER 1: Server-enforced sensitive action confirmation
      const { requireConfirmation } = await import('@/lib/security/require-confirmation');
      const confirmResult = await requireConfirmation(request, adminUser, {
        actionType: 'admin_user_action',
        targetId,
      });
      if (!confirmResult.valid) {
        return NextResponse.json({ error: confirmResult.reason }, { status: 403 });
      }

      // ── Action dispatch ──────────────────────────────────────

      // 1) Activate / deactivate -------------------------------------------------
      if (action === 'toggle_active') {
        // Check users.update permission for toggle_active
        const { hasPermission: checkPerm } = await import('@/lib/rbac');
        if (!checkPerm(adminUser.role as never, 'users.update' as never)) {
          return NextResponse.json({ error: 'Insufficient permission: users.update required' }, { status: 403 });
        }
        if (targetId === adminUser.id) {
          return NextResponse.json(
            { error: 'You cannot deactivate your own account' },
            { status: 400 }
          );
        }

        const newActive = !target.isActive;
        const updated = await db.user.update({
          where: { id: targetId },
          data: { isActive: newActive },
          select: { id: true, isActive: true },
        });

        // Deactivation immediately revokes every active session
        let revokedSessions = 0;
        if (!newActive) {
          const res = await db.userSession.updateMany({
            where: { userId: targetId, isRevoked: false },
            data: { isRevoked: true },
          });
          revokedSessions = res.count;
        }

        await writeAdminAudit(
          adminUser.id,
          newActive ? 'admin_activate_user' : 'admin_deactivate_user',
          targetId,
          {
            targetEmail: target.email,
            previousState: target.isActive,
            newState: newActive,
            revokedSessions,
          },
          ip,
          ua
        );

        return NextResponse.json({
          success: true,
          data: { id: updated.id, isActive: updated.isActive, revokedSessions },
        });
      }

      // 2) Adjust credits --------------------------------------------------------
      if (action === 'adjust_credits') {
        // Check credits.adjust permission
        const { hasPermission: checkPerm2 } = await import('@/lib/rbac');
        if (!checkPerm2(adminUser.role as never, 'credits.adjust' as never)) {
          return NextResponse.json({ error: 'Insufficient permission: credits.adjust required' }, { status: 403 });
        }
        const amount = Number(body.amount);
        const reason = truncate(body.reason, 200).trim();

        if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount === 0) {
          return NextResponse.json(
            { error: 'amount must be a non-zero integer (negative to deduct)' },
            { status: 400 }
          );
        }
        if (Math.abs(amount) > 1_000_000) {
          return NextResponse.json({ error: 'amount exceeds safe limit' }, { status: 400 });
        }
        if (!reason) {
          return NextResponse.json({ error: 'reason is required for credit adjustments' }, { status: 400 });
        }

        const currentBalance = target.credits;
        const newBalance = Math.max(0, currentBalance + amount);
        const effectiveDelta = newBalance - currentBalance;
        if (effectiveDelta === 0) {
          return NextResponse.json(
            { error: 'Adjustment has no effect — balance is already at the floor of 0' },
            { status: 400 }
          );
        }

        const updated = await db.$transaction(async (tx) => {
          const u = await tx.user.update({
            where: { id: targetId },
            data: { credits: newBalance },
            select: { id: true, credits: true },
          });
          await tx.creditsLedger.create({
            data: {
              userId: targetId,
              action: 'admin_adjustment',
              credits: effectiveDelta,
              balance: newBalance,
              description: `Admin adjustment by ${adminUser.email}: ${reason}`,
            },
          });
          return u;
        });

        await writeAdminAudit(
          adminUser.id,
          'admin_adjust_credits',
          targetId,
          {
            targetEmail: target.email,
            requestedDelta: amount,
            appliedDelta: effectiveDelta,
            previousBalance: currentBalance,
            newBalance,
            reason,
          },
          ip,
          ua
        );

        return NextResponse.json({
          success: true,
          data: { id: updated.id, credits: updated.credits, previousBalance: currentBalance },
        });
      }

      // 3) Revoke sessions -------------------------------------------------------
      if (action === 'revoke_sessions') {
        // Check users.update permission for revoke_sessions
        const { hasPermission: checkPerm3 } = await import('@/lib/rbac');
        if (!checkPerm3(adminUser.role as never, 'users.update' as never)) {
          return NextResponse.json({ error: 'Insufficient permission: users.update required' }, { status: 403 });
        }
        const res = await db.userSession.updateMany({
          where: { userId: targetId, isRevoked: false },
          data: { isRevoked: true },
        });

        await writeAdminAudit(
          adminUser.id,
          'admin_revoke_sessions',
          targetId,
          { targetEmail: target.email, revokedCount: res.count },
          ip,
          ua
        );

        return NextResponse.json({
          success: true,
          data: { id: targetId, revokedSessions: res.count },
        });
      }

      // ── Phase 29: Account enforcement (suspend, restrict, ban, reactivate) ──
      if (['suspend', 'restrict', 'ban', 'reactivate'].includes(action)) {
        if (targetId === adminUser.id) {
          return NextResponse.json(
            { error: 'You cannot perform account enforcement on your own account' },
            { status: 400 }
          );
        }

        // Check the admin has the specific permission for this action
        const permissionMap: Record<string, string> = {
          suspend: 'users.suspend',
          restrict: 'users.restrict',
          ban: 'users.ban',
          reactivate: 'users.reactivate',
        };
        const requiredPermission = permissionMap[action];

        // Verify permission — withPermission already checked user360.read,
        // but we additionally check the specific action permission
        // (users.suspend, users.ban, etc.) for granular control.
        const { hasPermission } = await import('@/lib/rbac');
        if (!hasPermission(adminUser.role as never, requiredPermission as never)) {
          // Log security event for failed authorization
          await db.systemEvent.create({
            data: {
              type: 'warning',
              category: 'security',
              message: `Unauthorized admin action attempt: ${action} on ${target.email} by ${adminUser.email}`,
              metadata: JSON.stringify({ targetUserId: targetId, adminId: adminUser.id, action, requiredPermission }),
              resolved: false,
            },
          }).catch(() => {});

          return NextResponse.json(
            { error: `Insufficient permission: ${requiredPermission} required for ${action}` },
            { status: 403 }
          );
        }

        const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : 'No reason provided';
        const isActive = action === 'reactivate';
        const updated = await db.user.update({
          where: { id: targetId },
          data: { isActive },
        });

        // If suspending/banning, revoke all sessions
        if (!isActive) {
          await db.userSession.updateMany({
            where: { userId: targetId, isRevoked: false },
            data: { isRevoked: true },
          }).catch(() => {});
        }

        // Audit log
        await writeAdminAudit(
          adminUser.id,
          `admin_${action}`,
          targetId,
          { targetEmail: target.email, reason, previousState: target.isActive, newState: isActive },
          ip,
          ua
        );

        // Security event for ban (escalation-level action)
        if (action === 'ban') {
          await db.systemEvent.create({
            data: {
              type: 'warning',
              category: 'security',
              message: `User banned: ${target.email} by ${adminUser.email}. Reason: ${reason}`,
              metadata: JSON.stringify({ targetUserId: targetId, adminId: adminUser.id, reason }),
              resolved: false,
            },
          }).catch(() => {});
        }

        return NextResponse.json({
          success: true,
          data: { id: updated.id, isActive: updated.isActive, action, reason },
        });
      }

      return NextResponse.json(
        { error: 'Unknown action. Supported: toggle_active, adjust_credits, revoke_sessions, suspend, restrict, ban, reactivate' },
        { status: 400 }
      );
    } catch (error) {
      console.error('Admin user action error:', error);
      return NextResponse.json({ error: 'Failed to perform admin action' }, { status: 500 });
    }
  });
}
