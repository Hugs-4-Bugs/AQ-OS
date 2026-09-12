// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Dashboard Sharing Service
// Task 7: Create and manage shareable dashboard links
// ═══════════════════════════════════════════════════════════════════

import crypto from 'crypto';
import { db } from '@/lib/db';

// ═══════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

export type DashboardType = 'executive' | 'sales' | 'ai' | 'ops';
export type SharePermission = 'readonly' | 'comment' | 'edit';

export interface ShareDashboardOptions {
  permissions?: SharePermission;
  allowedUsers?: string[];
  orgSharing?: boolean;
  expiresAt?: Date;
}

export interface ShareAccessResult {
  hasAccess: boolean;
  share: {
    id: string;
    userId: string;
    dashboardType: string;
    permissions: SharePermission;
    allowedUsers: string[];
    orgSharing: boolean;
    expiresAt: Date | null;
    accessCount: number;
    isActive: boolean;
  } | null;
  reason?: string;
}

// ═══════════════════════════════════════════════════════════════════
// HELPER: Generate a unique share token
// ═══════════════════════════════════════════════════════════════════

function generateShareToken(): string {
  return `ds_${crypto.randomBytes(24).toString('hex')}`;
}

// ═══════════════════════════════════════════════════════════════════
// SHARE DASHBOARD
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a shareable link for a dashboard.
 * Generates a unique shareToken and stores the share configuration.
 */
export async function shareDashboard(
  userId: string,
  dashboardType: DashboardType,
  options?: ShareDashboardOptions
): Promise<{
  id: string;
  shareToken: string;
  dashboardType: string;
  permissions: SharePermission;
  allowedUsers: string[];
  orgSharing: boolean;
  expiresAt: Date | null;
  createdAt: Date;
}> {
  // Validate dashboard type
  const validTypes: DashboardType[] = ['executive', 'sales', 'ai', 'ops'];
  if (!validTypes.includes(dashboardType)) {
    throw new Error(`Invalid dashboardType. Must be one of: ${validTypes.join(', ')}`);
  }

  // Validate permissions
  const permissions: SharePermission = options?.permissions || 'readonly';
  const validPermissions: SharePermission[] = ['readonly', 'comment', 'edit'];
  if (!validPermissions.includes(permissions)) {
    throw new Error(`Invalid permissions. Must be one of: ${validPermissions.join(', ')}`);
  }

  // Validate allowedUsers if provided
  const allowedUsers = options?.allowedUsers || [];
  if (allowedUsers.length > 0) {
    // Verify that the specified user IDs exist
    const existingUsers = await db.user.findMany({
      where: { id: { in: allowedUsers }, isActive: true },
      select: { id: true },
    });
    const existingIds = new Set(existingUsers.map(u => u.id));
    const invalidIds = allowedUsers.filter(id => !existingIds.has(id));
    if (invalidIds.length > 0) {
      throw new Error(`Invalid user IDs in allowedUsers: ${invalidIds.join(', ')}`);
    }
  }

  // Validate expiresAt if provided
  if (options?.expiresAt && options.expiresAt <= new Date()) {
    throw new Error('expiresAt must be a future date');
  }

  const shareToken = generateShareToken();

  const share = await db.dashboardShare.create({
    data: {
      userId,
      dashboardType,
      shareToken,
      permissions,
      allowedUsers: JSON.stringify(allowedUsers),
      orgSharing: options?.orgSharing || false,
      expiresAt: options?.expiresAt || null,
      accessCount: 0,
      isActive: true,
    },
  });

  // Audit log
  await db.auditLog.create({
    data: {
      userId,
      action: 'dashboard_shared',
      details: JSON.stringify({
        shareId: share.id,
        dashboardType,
        permissions,
        orgSharing: options?.orgSharing || false,
        allowedUsersCount: allowedUsers.length,
        expiresAt: options?.expiresAt?.toISOString() || null,
      }),
      resource: 'dashboard_share',
      resourceId: share.id,
    },
  }).catch(() => {});

  return {
    id: share.id,
    shareToken: share.shareToken ?? shareToken,
    dashboardType: share.dashboardType ?? dashboardType,
    permissions: share.permissions as SharePermission,
    allowedUsers: JSON.parse(share.allowedUsers ?? '[]'),
    orgSharing: share.orgSharing,
    expiresAt: share.expiresAt,
    createdAt: share.createdAt,
  };
}

// ═══════════════════════════════════════════════════════════════════
// GET SHARED DASHBOARD
// ═══════════════════════════════════════════════════════════════════

/**
 * Get a shared dashboard by its share token.
 * Verifies the token is active and not expired.
 * Increments the accessCount on each access.
 */
export async function getSharedDashboard(shareToken: string): Promise<{
  id: string;
  userId: string;
  dashboardType: string;
  permissions: SharePermission;
  allowedUsers: string[];
  orgSharing: boolean;
  expiresAt: Date | null;
  accessCount: number;
  lastAccessedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
} | null> {
  const share = await db.dashboardShare.findFirst({
    where: { shareToken },
  });

  if (!share) {
    return null;
  }

  // Check if share is active
  if (!share.isActive) {
    return null;
  }

  // Check if share is expired
  if (share.expiresAt && share.expiresAt < new Date()) {
    // Auto-deactivate expired shares
    await db.dashboardShare.update({
      where: { id: share.id },
      data: { isActive: false },
    }).catch(() => {});
    return null;
  }

  // Increment access count and update last accessed
  const updated = await db.dashboardShare.update({
    where: { id: share.id },
    data: {
      accessCount: { increment: 1 },
      lastAccessedAt: new Date(),
    },
  });

  return {
    id: updated.id,
    userId: updated.userId ?? '',
    dashboardType: updated.dashboardType ?? '',
    permissions: updated.permissions as SharePermission,
    allowedUsers: JSON.parse(updated.allowedUsers ?? '[]'),
    orgSharing: updated.orgSharing,
    expiresAt: updated.expiresAt,
    accessCount: updated.accessCount,
    lastAccessedAt: updated.lastAccessedAt,
    isActive: updated.isActive,
    createdAt: updated.createdAt,
  };
}

// ═══════════════════════════════════════════════════════════════════
// REVOKE SHARE
// ═══════════════════════════════════════════════════════════════════

/**
 * Revoke a share by setting isActive=false.
 * Only the original creator can revoke a share.
 */
export async function revokeShare(
  shareId: string,
  userId: string
): Promise<{ success: boolean; message: string }> {
  const share = await db.dashboardShare.findUnique({
    where: { id: shareId },
  });

  if (!share) {
    throw new Error('Share not found');
  }

  if (share.userId !== userId) {
    throw new Error('Only the share creator can revoke it');
  }

  if (!share.isActive) {
    return { success: true, message: 'Share is already revoked' };
  }

  await db.dashboardShare.update({
    where: { id: shareId },
    data: { isActive: false },
  });

  // Audit log
  await db.auditLog.create({
    data: {
      userId,
      action: 'dashboard_share_revoked',
      details: JSON.stringify({
        shareId,
        dashboardType: share.dashboardType,
        shareToken: share.shareToken,
      }),
      resource: 'dashboard_share',
      resourceId: shareId,
    },
  }).catch(() => {});

  return { success: true, message: 'Share revoked successfully' };
}

// ═══════════════════════════════════════════════════════════════════
// GET USER SHARES
// ═══════════════════════════════════════════════════════════════════

/**
 * Get all shares created by a user.
 * Returns shares ordered by most recently created first.
 */
export async function getUserShares(userId: string): Promise<Array<{
  id: string;
  dashboardType: string;
  shareToken: string;
  permissions: SharePermission;
  allowedUsers: string[];
  orgSharing: boolean;
  expiresAt: Date | null;
  accessCount: number;
  lastAccessedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}>> {
  const shares = await db.dashboardShare.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  return shares.map(share => ({
    id: share.id,
    dashboardType: share.dashboardType ?? '',
    shareToken: share.shareToken ?? '',
    permissions: share.permissions as SharePermission,
    allowedUsers: JSON.parse(share.allowedUsers ?? '[]'),
    orgSharing: share.orgSharing,
    expiresAt: share.expiresAt,
    accessCount: share.accessCount,
    lastAccessedAt: share.lastAccessedAt,
    isActive: share.isActive,
    createdAt: share.createdAt,
    updatedAt: share.updatedAt,
  }));
}

// ═══════════════════════════════════════════════════════════════════
// UPDATE SHARE PERMISSIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Update the permissions on a share.
 * Only the original creator can update permissions.
 */
export async function updateSharePermissions(
  shareId: string,
  userId: string,
  permissions: SharePermission
): Promise<{
  id: string;
  permissions: SharePermission;
  updatedAt: Date;
}> {
  const validPermissions: SharePermission[] = ['readonly', 'comment', 'edit'];
  if (!validPermissions.includes(permissions)) {
    throw new Error(`Invalid permissions. Must be one of: ${validPermissions.join(', ')}`);
  }

  const share = await db.dashboardShare.findUnique({
    where: { id: shareId },
  });

  if (!share) {
    throw new Error('Share not found');
  }

  if (share.userId !== userId) {
    throw new Error('Only the share creator can update permissions');
  }

  if (!share.isActive) {
    throw new Error('Cannot update permissions on an inactive share');
  }

  const updated = await db.dashboardShare.update({
    where: { id: shareId },
    data: { permissions },
  });

  // Audit log
  await db.auditLog.create({
    data: {
      userId,
      action: 'dashboard_share_updated',
      details: JSON.stringify({
        shareId,
        oldPermissions: share.permissions,
        newPermissions: permissions,
      }),
      resource: 'dashboard_share',
      resourceId: shareId,
    },
  }).catch(() => {});

  return {
    id: updated.id,
    permissions: updated.permissions as SharePermission,
    updatedAt: updated.updatedAt,
  };
}

// ═══════════════════════════════════════════════════════════════════
// CHECK SHARE ACCESS
// ═══════════════════════════════════════════════════════════════════

/**
 * Check if a user has access to a shared dashboard.
 * - If orgSharing is true, any user in the same org can access.
 * - If allowedUsers is non-empty, only those users can access.
 * - If neither, anyone with the token can access (public link).
 * - The requestingUserId is optional: if not provided, access is granted
 *   for public links but denied for restricted ones.
 */
export async function checkShareAccess(
  shareToken: string,
  requestingUserId?: string
): Promise<ShareAccessResult> {
  const share = await db.dashboardShare.findFirst({
    where: { shareToken },
  });

  if (!share) {
    return { hasAccess: false, share: null, reason: 'Share not found' };
  }

  // Check if share is active
  if (!share.isActive) {
    return { hasAccess: false, share: null, reason: 'Share has been revoked' };
  }

  // Check if share is expired
  if (share.expiresAt && share.expiresAt < new Date()) {
    return { hasAccess: false, share: null, reason: 'Share has expired' };
  }

  const allowedUsers: string[] = JSON.parse(share.allowedUsers ?? '[]');

  const shareInfo: ShareAccessResult['share'] = {
    id: share.id,
    userId: share.userId ?? '',
    dashboardType: share.dashboardType ?? '',
    permissions: share.permissions as SharePermission,
    allowedUsers,
    orgSharing: share.orgSharing,
    expiresAt: share.expiresAt,
    accessCount: share.accessCount,
    isActive: share.isActive,
  };

  // The creator always has access
  if (requestingUserId && requestingUserId === share.userId) {
    return { hasAccess: true, share: shareInfo };
  }

  // If orgSharing is true, check if the requesting user is in the same org
  if (share.orgSharing && requestingUserId) {
    const creator = await db.user.findUnique({
      where: { id: share.userId ?? '' },
      select: { orgId: true },
    });

    if (creator?.orgId) {
      const requester = await db.user.findUnique({
        where: { id: requestingUserId },
        select: { orgId: true },
      });

      if (requester?.orgId === creator.orgId) {
        return { hasAccess: true, share: shareInfo };
      }
    }
  }

  // If allowedUsers is specified, check membership
  if (allowedUsers.length > 0) {
    if (!requestingUserId) {
      return { hasAccess: false, share: shareInfo, reason: 'Authentication required for this share' };
    }
    if (allowedUsers.includes(requestingUserId)) {
      return { hasAccess: true, share: shareInfo };
    }
    return { hasAccess: false, share: shareInfo, reason: 'You are not in the allowed users list' };
  }

  // If no restrictions (no orgSharing, no allowedUsers), anyone with the token can access
  return { hasAccess: true, share: shareInfo };
}
