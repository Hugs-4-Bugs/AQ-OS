// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Gmail-Specific Audit Logging Service
// Phase 9: Gmail Integration
// All functions write to AuditLog table with resource='gmail'
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ===== GMAIL AUDIT EVENT TYPES =====

export type GmailAuditAction =
  | 'gmail_connected'
  | 'gmail_disconnected'
  | 'gmail_inbox_synced'
  | 'gmail_email_drafted'
  | 'gmail_email_sent'
  | 'gmail_email_failed'
  | 'gmail_token_refreshed'
  | 'gmail_unsubscribe_detected'
  | 'gmail_bounce_detected'
  | 'gmail_auth_url_generated'
  | 'gmail_oauth_callback'
  | 'gmail_token_revoked'
  | 'gmail_active_account_set'
  | 'gmail_thread_synced'
  | 'gmail_draft_created'
  | 'gmail_draft_sent'
  | 'gmail_draft_deleted'
  | 'gmail_reply_sent'
  | 'gmail_pubsub_configured'
  | 'gmail_pubsub_removed'
  | 'gmail_tracking_open'
  | 'gmail_tracking_click'
  | 'gmail_rate_limit_hit'
  | 'gmail_sync_error';

// ===== INTERFACES =====

export interface GmailAuditParams {
  userId: string;
  action: GmailAuditAction | string;
  details?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface GmailAuditResult {
  success: boolean;
  auditLogId?: string;
  error?: string;
}

// ===== CORE LOGGING FUNCTION =====

/**
 * Log a Gmail event to the AuditLog with resource='gmail'.
 * Silently fails if logging errors — never blocks the main flow.
 */
export async function logGmailEvent(params: GmailAuditParams): Promise<GmailAuditResult> {
  try {
    const details = params.metadata
      ? JSON.stringify({ ...(params.details ? { description: params.details } : {}), ...params.metadata })
      : params.details || null;

    const auditLog = await db.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        details,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        resource: 'gmail',
        resourceId: params.resourceId || null,
      },
    });

    return { success: true, auditLogId: auditLog.id };
  } catch (error) {
    // Never fail the main flow due to audit logging failure
    console.error('[GmailAudit] Failed to log Gmail event:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ===== SPECIFIC AUDIT FUNCTIONS =====

/**
 * Log Gmail connected event.
 * Called when a user successfully connects a Gmail account.
 */
export async function logGmailConnected(
  userId: string,
  email: string
): Promise<void> {
  await logGmailEvent({
    userId,
    action: 'gmail_connected',
    details: `Gmail account connected: ${email}`,
    metadata: { email },
  });
  console.log(`[GmailAudit] Gmail connected: ${email} (user: ${userId})`);
}

/**
 * Log Gmail disconnected event.
 * Called when a user disconnects or revokes a Gmail account.
 */
export async function logGmailDisconnected(
  userId: string,
  email: string
): Promise<void> {
  await logGmailEvent({
    userId,
    action: 'gmail_disconnected',
    details: `Gmail account disconnected: ${email}`,
    metadata: { email },
  });
  console.log(`[GmailAudit] Gmail disconnected: ${email} (user: ${userId})`);
}

/**
 * Log inbox synced event.
 * Called after a successful inbox sync operation.
 */
export async function logInboxSynced(
  userId: string,
  emailAccountId: string,
  messageCount: number
): Promise<void> {
  await logGmailEvent({
    userId,
    action: 'gmail_inbox_synced',
    details: `Inbox synced: ${messageCount} messages processed`,
    resourceId: emailAccountId,
    metadata: { messageCount },
  });
  console.log(`[GmailAudit] Inbox synced: ${messageCount} messages (account: ${emailAccountId})`);
}

/**
 * Log email drafted event.
 * Called when a draft is created.
 */
export async function logEmailDrafted(
  userId: string,
  to: string,
  subject: string
): Promise<void> {
  await logGmailEvent({
    userId,
    action: 'gmail_email_drafted',
    details: `Draft created — to: ${to}, subject: "${subject}"`,
    metadata: { to, subject },
  });
  console.log(`[GmailAudit] Draft created — to: ${to}, subject: "${subject}"`);
}

/**
 * Log email sent event.
 * Called after an email is successfully sent via Gmail API.
 */
export async function logEmailSent(
  userId: string,
  to: string,
  subject: string,
  messageId: string
): Promise<void> {
  await logGmailEvent({
    userId,
    action: 'gmail_email_sent',
    details: `Email sent — to: ${to}, subject: "${subject}"`,
    resourceId: messageId,
    metadata: { to, subject, messageId },
  });
  console.log(`[GmailAudit] Email sent — to: ${to}, subject: "${subject}", messageId: ${messageId}`);
}

/**
 * Log email failed event.
 * Called when sending an email fails.
 */
export async function logEmailFailed(
  userId: string,
  to: string,
  subject: string,
  error: string
): Promise<void> {
  await logGmailEvent({
    userId,
    action: 'gmail_email_failed',
    details: `Email failed — to: ${to}, subject: "${subject}", error: ${error}`,
    metadata: { to, subject, error },
  });
  console.error(`[GmailAudit] Email failed — to: ${to}, subject: "${subject}", error: ${error}`);
}

/**
 * Log token refreshed event.
 * Called when an access token is refreshed.
 */
export async function logTokenRefreshed(
  userId: string,
  emailAccountId: string
): Promise<void> {
  await logGmailEvent({
    userId,
    action: 'gmail_token_refreshed',
    details: `Access token refreshed for email account`,
    resourceId: emailAccountId,
    metadata: { emailAccountId },
  });
  console.log(`[GmailAudit] Token refreshed (account: ${emailAccountId})`);
}

/**
 * Log unsubscribe detected event.
 * Called when an unsubscribe request is detected.
 */
export async function logUnsubscribeDetected(
  userId: string,
  email: string
): Promise<void> {
  await logGmailEvent({
    userId,
    action: 'gmail_unsubscribe_detected',
    details: `Unsubscribe detected for: ${email}`,
    metadata: { email },
  });
  console.log(`[GmailAudit] Unsubscribe detected: ${email}`);
}

/**
 * Log bounce detected event.
 * Called when an email bounce is detected.
 */
export async function logBounceDetected(
  userId: string,
  email: string,
  bounceType: string
): Promise<void> {
  await logGmailEvent({
    userId,
    action: 'gmail_bounce_detected',
    details: `Bounce detected — email: ${email}, type: ${bounceType}`,
    metadata: { email, bounceType },
  });
  console.log(`[GmailAudit] Bounce detected — email: ${email}, type: ${bounceType}`);
}

// ===== QUERY HELPERS =====

/**
 * Get Gmail audit events for a user.
 */
export async function getGmailAuditHistory(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    action?: string;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<{
  events: Array<{
    id: string;
    action: string;
    details: string | null;
    resourceId: string | null;
    createdAt: Date;
  }>;
  total: number;
}> {
  try {
    const where: Record<string, unknown> = {
      userId,
      resource: 'gmail',
    };

    if (options?.action) {
      where.action = options.action;
    }

    if (options?.startDate || options?.endDate) {
      const createdAt: Record<string, Date> = {};
      if (options.startDate) createdAt.gte = options.startDate;
      if (options.endDate) createdAt.lte = options.endDate;
      where.createdAt = createdAt;
    }

    const [events, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
        select: {
          id: true,
          action: true,
          details: true,
          resourceId: true,
          createdAt: true,
        },
      }),
      db.auditLog.count({ where }),
    ]);

    return { events, total };
  } catch (error) {
    console.error('[GmailAudit] Failed to get Gmail audit history:', error);
    return { events: [], total: 0 };
  }
}
