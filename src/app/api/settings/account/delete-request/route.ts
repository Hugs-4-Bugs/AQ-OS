// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Settings: Account Deletion Request API Route
// POST /api/settings/account/delete-request — Request account deletion
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, verifyPassword, logAuthEvent, getClientIp, getUserAgent } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';

// POST /api/settings/account/delete-request - Request account deletion
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    // RBAC: Only owners can request account deletion
    if (!hasPermission(user.role as import('@/lib/rbac').UserRole, 'billing:write')) {
      return NextResponse.json({ error: 'Only organization owners can request account deletion' }, { status: 403 });
    }

    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    const body = await request.json();
    const { password, reason } = body;

    if (!password) {
      return NextResponse.json({ error: 'Password confirmation is required' }, { status: 400 });
    }

    // Verify password
    const fullUser = await db.user.findUnique({
      where: { id: user.id },
      select: { id: true, passwordHash: true, email: true, authProvider: true },
    });

    if (!fullUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // For Google-authenticated users without a password, skip password check
    if (fullUser.passwordHash) {
      const isValid = await verifyPassword(password, fullUser.passwordHash);
      if (!isValid) {
        return NextResponse.json({ error: 'Incorrect password' }, { status: 400 });
      }
    } else if (fullUser.authProvider !== 'google') {
      return NextResponse.json({ error: 'No password set for this account' }, { status: 400 });
    }

    // Check if user is org owner — must transfer ownership first
    const ownedOrg = await db.organization.findFirst({
      where: { ownerId: user.id },
    });

    if (ownedOrg) {
      return NextResponse.json(
        { error: 'You are the owner of an organization. Please transfer ownership or delete the organization before deleting your account.' },
        { status: 400 }
      );
    }

    // Create GDPR deletion request
    await db.gdprRequest.create({
      data: {
        userId: user.id,
        requestType: 'deletion',
        status: 'pending',
        notes: reason ? `User reason: ${reason}` : 'Account deletion requested by user',
      },
    });

    // Soft-delete the account
    await db.user.update({
      where: { id: user.id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });

    // Revoke all sessions
    await db.userSession.updateMany({
      where: { userId: user.id, isRevoked: false },
      data: { isRevoked: true },
    });

    // Audit log
    await logAuthEvent({
      userId: user.id,
      action: 'account_deletion_requested',
      details: JSON.stringify({ reason: reason || 'No reason provided', email: fullUser.email }),
      ipAddress: ip,
      userAgent: ua,
      resource: 'user',
      resourceId: user.id,
    });

    return NextResponse.json({
      success: true,
      message: 'Account deletion request submitted. Your account has been deactivated and will be permanently deleted within 30 days.',
    });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      return NextResponse.json({ error: error.message }, { status: (error as { statusCode: number }).statusCode });
    }
    console.error('Error requesting account deletion:', error);
    return NextResponse.json({ error: 'Failed to process deletion request' }, { status: 500 });
  }
}
