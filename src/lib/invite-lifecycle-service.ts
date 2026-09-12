// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Invite Lifecycle Service
// Phase 6: Create, send, track, remind, expire, revoke invitations
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import crypto from 'crypto';

// ─── Types ───────────────────────────────────────────────────────

export type InviteRole = 'admin' | 'member' | 'viewer';
export type InviteStatus = 'sent' | 'opened' | 'accepted' | 'expired' | 'revoked';

export interface Invitation {
  id: string;
  orgId: string;
  orgName: string;
  email: string;
  role: InviteRole;
  token: string;
  invitedBy: string;
  inviterName: string;
  status: InviteStatus;
  openedAt: Date | null;
  acceptedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateInvitationInput {
  orgId: string;
  email: string;
  role: InviteRole;
  invitedBy: string;
}

export interface InvitationWithDetails extends Invitation {
  orgMemberCount: number;
}

// ─── Constants ───────────────────────────────────────────────────

const INVITE_EXPIRY_DAYS = 7;
const INVITE_REMIND_AFTER_DAYS = 3;
const MAX_PENDING_INVITES_PER_ORG = 50;

// ─── Public API ──────────────────────────────────────────────────

/**
 * Create a new invitation with role selection
 */
export async function createInvitation(input: CreateInvitationInput): Promise<Invitation> {
  const { orgId, email, role, invitedBy } = input;

  // Validate role
  if (!['admin', 'member', 'viewer'].includes(role)) {
    throw new Error('Invalid role. Must be admin, member, or viewer');
  }

  // Check if user is already a member
  const existingMember = await db.orgMember.findFirst({
    where: { orgId, user: { email } },
  });
  if (existingMember) {
    throw new Error('This user is already a member of the organization');
  }

  // Check for existing pending invitation
  const existingInvite = await db.orgInvitation.findFirst({
    where: {
      orgId,
      email,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (existingInvite) {
    throw new Error('An active invitation already exists for this email');
  }

  // Check invite limit
  const pendingCount = await db.orgInvitation.count({
    where: {
      orgId,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (pendingCount >= MAX_PENDING_INVITES_PER_ORG) {
    throw new Error(`Maximum pending invitations (${MAX_PENDING_INVITES_PER_ORG}) reached`);
  }

  // Verify inviter is an org member with admin/owner role
  const inviterMember = await db.orgMember.findFirst({
    where: { orgId, userId: invitedBy },
  });
  if (!inviterMember || !['owner', 'admin'].includes(inviterMember.role)) {
    throw new Error('Only organization owners and admins can send invitations');
  }

  // Get org details
  const org = await db.organization.findUnique({ where: { id: orgId } });
  if (!org) throw new Error('Organization not found');

  // Get inviter name
  const inviter = await db.user.findUnique({ where: { id: invitedBy } });
  const inviterName = inviter?.name || inviter?.email || 'Unknown';

  // Generate unique token
  const token = crypto.randomBytes(32).toString('hex');

  // Create invitation
  const invitation = await db.orgInvitation.create({
    data: {
      orgId,
      email: email.toLowerCase().trim(),
      role,
      token,
      invitedBy,
      expiresAt: new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  return {
    id: invitation.id,
    orgId: invitation.orgId,
    orgName: org.name,
    email: invitation.email,
    role: invitation.role as InviteRole,
    token: invitation.token,
    invitedBy: invitation.invitedBy,
    inviterName,
    status: 'sent',
    openedAt: null,
    acceptedAt: invitation.acceptedAt,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
  };
}

/**
 * Send invite email with magic link
 * In production, this would use the email service
 */
export async function sendInviteEmail(invitationId: string): Promise<{ sent: boolean; magicLink: string }> {
  const invitation = await db.orgInvitation.findUnique({
    where: { id: invitationId },
  });

  if (!invitation) {
    throw new Error('Invitation not found');
  }

  if (invitation.acceptedAt) {
    throw new Error('Invitation has already been accepted');
  }

  if (invitation.expiresAt < new Date()) {
    throw new Error('Invitation has expired');
  }

  // Generate magic link
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
  const magicLink = `${baseUrl}/invite/accept?token=${invitation.token}`;

  // In production: send email via email service
  // For now, we log it and return the link for dev purposes
  console.log(`[Invite Email] To: ${invitation.email}, Link: ${magicLink}, Role: ${invitation.role}`);

  return { sent: true, magicLink };
}

/**
 * Track invite status: sent → opened → accepted/expired
 */
export async function trackInviteStatus(token: string): Promise<{
  status: InviteStatus;
  invitation: Invitation | null;
}> {
  const invitation = await db.orgInvitation.findUnique({
    where: { token },
  });

  if (!invitation) {
    return { status: 'revoked', invitation: null };
  }

  // Check if expired
  if (invitation.expiresAt < new Date() && !invitation.acceptedAt) {
    // Auto-mark as expired
    await db.orgInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date(0) }, // Use epoch to mark as expired
    });
    return { status: 'expired', invitation: await formatInvitation(invitation) };
  }

  // Check if accepted
  if (invitation.acceptedAt) {
    return { status: 'accepted', invitation: await formatInvitation(invitation) };
  }

  // Mark as opened (first time tracking)
  return { status: 'opened', invitation: await formatInvitation(invitation) };
}

/**
 * Auto-remind after 3 days
 * Called by a scheduled job or cron
 */
export async function autoRemind(): Promise<{ reminded: number; errors: string[] }> {
  const remindAfter = new Date(Date.now() - INVITE_REMIND_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const errors: string[] = [];
  let reminded = 0;

  // Find invitations that are older than 3 days and haven't been accepted
  const pendingInvites = await db.orgInvitation.findMany({
    where: {
      acceptedAt: null,
      createdAt: { lt: remindAfter },
      expiresAt: { gt: new Date() },
    },
  });

  for (const invite of pendingInvites) {
    try {
      // In production: send reminder email
      console.log(`[Invite Reminder] Reminding ${invite.email} about invitation to org ${invite.orgId}`);
      reminded++;
    } catch (e) {
      errors.push(`Failed to remind ${invite.email}: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  return { reminded, errors };
}

/**
 * Auto-expire after 7 days
 * Called by a scheduled job or cron
 */
export async function autoExpire(): Promise<{ expired: number }> {
  const expiredInvites = await db.orgInvitation.findMany({
    where: {
      acceptedAt: null,
      expiresAt: { lt: new Date() },
    },
  });

  // In practice, we don't delete them — we just mark them as expired
  // The expiresAt < now check in queries handles this naturally
  // But we could update status here if we had a status field

  return { expired: expiredInvites.length };
}

/**
 * Revoke an invitation
 */
export async function revokeInvitation(invitationId: string, revokedBy: string): Promise<void> {
  const invitation = await db.orgInvitation.findUnique({
    where: { id: invitationId },
  });

  if (!invitation) {
    throw new Error('Invitation not found');
  }

  if (invitation.acceptedAt) {
    throw new Error('Cannot revoke an accepted invitation');
  }

  // Verify revoker has permission
  const revokerMember = await db.orgMember.findFirst({
    where: { orgId: invitation.orgId, userId: revokedBy },
  });
  if (!revokerMember || !['owner', 'admin'].includes(revokerMember.role)) {
    throw new Error('Only organization owners and admins can revoke invitations');
  }

  // Delete the invitation (or soft-delete by setting expiresAt to now)
  await db.orgInvitation.delete({
    where: { id: invitationId },
  });
}

/**
 * Handle role change before acceptance
 */
export async function changeInviteRole(
  invitationId: string,
  newRole: InviteRole,
  changedBy: string
): Promise<Invitation> {
  if (!['admin', 'member', 'viewer'].includes(newRole)) {
    throw new Error('Invalid role. Must be admin, member, or viewer');
  }

  const invitation = await db.orgInvitation.findUnique({
    where: { id: invitationId },
  });

  if (!invitation) {
    throw new Error('Invitation not found');
  }

  if (invitation.acceptedAt) {
    throw new Error('Cannot change role of an accepted invitation');
  }

  if (invitation.expiresAt < new Date()) {
    throw new Error('Cannot change role of an expired invitation');
  }

  // Verify changer has permission
  const changerMember = await db.orgMember.findFirst({
    where: { orgId: invitation.orgId, userId: changedBy },
  });
  if (!changerMember || !['owner', 'admin'].includes(changerMember.role)) {
    throw new Error('Only organization owners and admins can change invitation roles');
  }

  const updated = await db.orgInvitation.update({
    where: { id: invitationId },
    data: { role: newRole },
  });

  return formatInvitation(updated);
}

/**
 * Accept an invitation (called when user clicks magic link)
 */
export async function acceptInvitation(token: string, userId: string): Promise<Invitation> {
  const invitation = await db.orgInvitation.findUnique({
    where: { token },
  });

  if (!invitation) {
    throw new Error('Invalid invitation token');
  }

  if (invitation.acceptedAt) {
    throw new Error('Invitation has already been accepted');
  }

  if (invitation.expiresAt < new Date()) {
    throw new Error('Invitation has expired');
  }

  // Check if user is already a member
  const existingMember = await db.orgMember.findFirst({
    where: { orgId: invitation.orgId, userId },
  });
  if (existingMember) {
    throw new Error('You are already a member of this organization');
  }

  // Add user as org member
  await db.orgMember.create({
    data: {
      orgId: invitation.orgId,
      userId,
      role: invitation.role,
    },
  });

  // Update invitation as accepted
  const updated = await db.orgInvitation.update({
    where: { id: invitation.id },
    data: { acceptedAt: new Date() },
  });

  // Update user's orgId
  await db.user.update({
    where: { id: userId },
    data: { orgId: invitation.orgId },
  });

  return formatInvitation(updated);
}

/**
 * List all invitations for an organization
 */
export async function listOrgInvitations(orgId: string): Promise<Invitation[]> {
  const invitations = await db.orgInvitation.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
  });

  return Promise.all(invitations.map(formatInvitation));
}

// ─── Helper ──────────────────────────────────────────────────────

interface RawInvitation {
  id: string;
  orgId: string;
  email: string;
  role: string;
  token: string;
  invitedBy: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

async function formatInvitation(inv: RawInvitation): Promise<Invitation> {
  const org = await db.organization.findUnique({ where: { id: inv.orgId } });
  const inviter = await db.user.findUnique({ where: { id: inv.invitedBy } });

  let status: InviteStatus = 'sent';
  if (inv.acceptedAt && inv.acceptedAt.getTime() === 0) {
    status = 'expired';
  } else if (inv.acceptedAt) {
    status = 'accepted';
  } else if (inv.expiresAt < new Date()) {
    status = 'expired';
  }

  return {
    id: inv.id,
    orgId: inv.orgId,
    orgName: org?.name || 'Unknown',
    email: inv.email,
    role: inv.role as InviteRole,
    token: inv.token,
    invitedBy: inv.invitedBy,
    inviterName: inviter?.name || inviter?.email || 'Unknown',
    status,
    openedAt: null,
    acceptedAt: inv.acceptedAt && inv.acceptedAt.getTime() === 0 ? null : inv.acceptedAt,
    expiresAt: inv.expiresAt,
    createdAt: inv.createdAt,
  };
}
