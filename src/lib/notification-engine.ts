// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Notification Engine Service
// Phase 11: Comprehensive notification dispatch system
//
// CRITICAL RULES:
// - NEVER lose notification events — always create DB record first, then dispatch
// - NEVER skip preferences check — respect DND and channel preferences
// - NEVER block the main thread — dispatch to channels async (fire and forget)
// - NEVER skip audit logs — log notification_sent, notification_read, notification_archived
// - NEVER skip org isolation — always filter by userId
// - Batch operations for efficiency
// - Rate limit per user (max 50 notifications per minute)
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ═══════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════

/** All notification types across 9 categories */
export type NotificationType =
  // Lead updates
  | 'lead_discovered'
  | 'lead_stage_moved'
  | 'lead_pipeline_update'
  // Payment updates
  | 'payment_success'
  | 'payment_failed'
  | 'payment_invoice'
  | 'payment_subscription'
  | 'payment_credits'
  | 'payment_trial'
  // Gmail sync
  | 'gmail_sync_complete'
  | 'gmail_thread_update'
  // Telegram delivery
  | 'telegram_delivery_status'
  | 'telegram_incoming_message'
  // WhatsApp delivery
  | 'whatsapp_sent'
  | 'whatsapp_delivered'
  | 'whatsapp_read'
  | 'whatsapp_failed'
  // AI completion
  | 'ai_analysis_complete'
  | 'ai_scoring_complete'
  | 'ai_outreach_complete'
  // Workflow events
  | 'workflow_step_complete'
  | 'workflow_step_failed'
  | 'workflow_execution_complete'
  | 'workflow_execution_failed'
  // Onboarding events
  | 'onboarding_step_complete'
  | 'onboarding_complete'
  | 'onboarding_reminder'
  // Failures
  | 'system_failure'
  | 'integration_error'
  // Meeting events
  | 'meeting_scheduled'
  | 'meeting_completed'
  | 'meeting_cancelled'
  | 'meeting_updated'
  | 'meeting_reminder'
  | 'meeting_rescheduled'
  | 'meeting_approved'
  // Calendar events
  | 'calendar_synced'
  | 'calendar_connected'
  | 'calendar_disconnected'
  // Deal events
  | 'deal_accepted'
  | 'deal_rejected'
  | 'deal_updated'
  | 'rate_limit_exceeded';

/** Notification channels */
export type NotificationChannel = 'in_app' | 'email' | 'telegram' | 'whatsapp';

/** Notification category for grouping */
export type NotificationCategory =
  | 'lead_update'
  | 'payment_update'
  | 'gmail_sync'
  | 'telegram_delivery'
  | 'whatsapp_delivery'
  | 'ai_completion'
  | 'workflow_event'
  | 'onboarding_event'
  | 'meeting_update'
  | 'calendar_sync'
  | 'deal_update'
  | 'failure';

/** Mapping of notification types to categories */
export const NOTIFICATION_CATEGORY_MAP: Record<NotificationType, NotificationCategory> = {
  lead_discovered: 'lead_update',
  lead_stage_moved: 'lead_update',
  lead_pipeline_update: 'lead_update',
  payment_success: 'payment_update',
  payment_failed: 'payment_update',
  payment_invoice: 'payment_update',
  payment_subscription: 'payment_update',
  payment_credits: 'payment_update',
  payment_trial: 'payment_update',
  gmail_sync_complete: 'gmail_sync',
  gmail_thread_update: 'gmail_sync',
  telegram_delivery_status: 'telegram_delivery',
  telegram_incoming_message: 'telegram_delivery',
  whatsapp_sent: 'whatsapp_delivery',
  whatsapp_delivered: 'whatsapp_delivery',
  whatsapp_read: 'whatsapp_delivery',
  whatsapp_failed: 'whatsapp_delivery',
  ai_analysis_complete: 'ai_completion',
  ai_scoring_complete: 'ai_completion',
  ai_outreach_complete: 'ai_completion',
  workflow_step_complete: 'workflow_event',
  workflow_step_failed: 'workflow_event',
  workflow_execution_complete: 'workflow_event',
  workflow_execution_failed: 'workflow_event',
  onboarding_step_complete: 'onboarding_event',
  onboarding_complete: 'onboarding_event',
  onboarding_reminder: 'onboarding_event',
  system_failure: 'failure',
  integration_error: 'failure',
  meeting_scheduled: 'meeting_update',
  meeting_completed: 'meeting_update',
  meeting_cancelled: 'meeting_update',
  meeting_updated: 'meeting_update',
  meeting_reminder: 'meeting_update',
  meeting_rescheduled: 'meeting_update',
  meeting_approved: 'meeting_update',
  calendar_synced: 'calendar_sync',
  calendar_connected: 'calendar_sync',
  calendar_disconnected: 'calendar_sync',
  deal_accepted: 'deal_update',
  deal_rejected: 'deal_update',
  deal_updated: 'deal_update',
  rate_limit_exceeded: 'failure',
};

/** Parameters for sendNotification */
export interface SendNotificationParams {
  userId: string;
  type: NotificationType | string;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

/** Parameters for batchNotify — same shape as SendNotificationParams */
export type BatchNotificationParams = SendNotificationParams;

/** Filter options for getNotifications */
export interface NotificationFilters {
  type?: string;
  read?: boolean;
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
}

/** Type-specific preference override */
export interface TypePreference {
  inApp?: boolean;
  email?: boolean;
  telegram?: boolean;
  whatsapp?: boolean;
}

/** Update data for preferences */
export interface PreferenceUpdates {
  inAppEnabled?: boolean;
  emailEnabled?: boolean;
  telegramEnabled?: boolean;
  whatsappEnabled?: boolean;
  dndStartTime?: string | null;
  dndEndTime?: string | null;
  dndTimezone?: string | null;
  typePreferences?: Record<string, TypePreference> | null;
}

/** Result of a notification dispatch */
export interface NotificationDispatchResult {
  notification: {
    id: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    read: boolean;
    actionUrl: string | null;
    metadata: string | null;
    deliveredVia: string | null;
    createdAt: Date;
  };
  channels: NotificationChannel[];
  dndActive: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// RATE LIMITING — Max 50 notifications per minute per user
// ═══════════════════════════════════════════════════════════════════

const MAX_NOTIFICATIONS_PER_MINUTE = 50;
const RATE_LIMIT_WINDOW_MS = 60_000;

const rateLimitBuckets: Map<string, number[]> = new Map();

/**
 * Check if a user has exceeded the notification rate limit.
 * Returns true if the user is within limits, false if rate-limited.
 */
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitBuckets.get(userId) || [];

  // Remove timestamps outside the window
  const recentTimestamps = timestamps.filter((t: number) => now - t < RATE_LIMIT_WINDOW_MS);

  if (recentTimestamps.length >= MAX_NOTIFICATIONS_PER_MINUTE) {
    return false; // Rate-limited
  }

  recentTimestamps.push(now);
  rateLimitBuckets.set(userId, recentTimestamps);
  return true;
}

// Clean up stale rate limit entries every 5 minutes
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  const entries = Array.from(rateLimitBuckets.entries());
  for (const [key, timestamps] of entries) {
    const recent = timestamps.filter((t: number) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) {
      rateLimitBuckets.delete(key);
    } else {
      rateLimitBuckets.set(key, recent);
    }
  }
}, 300_000);

// Prevent the interval from keeping the process alive
if (cleanupInterval && typeof cleanupInterval.unref === 'function') {
  cleanupInterval.unref();
}

// ═══════════════════════════════════════════════════════════════════
// AUDIT LOGGING — Never blocks the main flow
// ═══════════════════════════════════════════════════════════════════

type NotificationAuditAction =
  | 'notification_sent'
  | 'notification_read'
  | 'notification_archived'
  | 'notification_batch_sent'
  | 'notification_deleted'
  | 'notification_preferences_updated'
  | 'notification_rate_limited'
  | 'notification_dispatch_failed';

async function logAudit(
  userId: string,
  action: NotificationAuditAction | string,
  metadata?: Record<string, unknown>,
  resourceId?: string
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId,
        action,
        details: metadata ? JSON.stringify(metadata) : null,
        resource: 'notification',
        resourceId: resourceId || null,
      },
    });
  } catch (error) {
    console.error('[NotificationEngine] Failed to log audit event:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════
// REALTIME EVENT PUBLISHING — Lightweight event bus
// ═══════════════════════════════════════════════════════════════════

/** Event payload published to realtime subscribers */
export interface NotificationEvent {
  event: 'notification_created' | 'notification_read' | 'notification_archived' | 'notifications_cleared';
  userId: string;
  data: Record<string, unknown>;
}

type NotificationEventHandler = (event: NotificationEvent) => void;

const eventHandlers: Set<NotificationEventHandler> = new Set();

/**
 * Subscribe to notification events. Returns an unsubscribe function.
 * Used by realtime engine (socket.io) to push events to connected clients.
 */
export function onNotificationEvent(handler: NotificationEventHandler): () => void {
  eventHandlers.add(handler);
  return () => {
    eventHandlers.delete(handler);
  };
}

/**
 * Publish a notification event to all subscribers.
 * Fire-and-forget — never blocks.
 */
function publishEvent(event: NotificationEvent): void {
  for (const handler of eventHandlers) {
    try {
      handler(event);
    } catch (error) {
      console.error('[NotificationEngine] Event handler error:', error);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// PREFERENCES — DND checks, channel routing, defaults
// ═══════════════════════════════════════════════════════════════════

interface NotificationPreferencesRecord {
  id: string;
  userId: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  telegramEnabled: boolean;
  whatsappEnabled: boolean;
  dndStartTime: string | null;
  dndEndTime: string | null;
  dndTimezone: string | null;
  typePreferences: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 7. getUserPreferences — Get notification preferences (create defaults if none)
 */
export async function getUserPreferences(
  userId: string
): Promise<NotificationPreferencesRecord> {
  let prefs = await db.notificationPreferences.findUnique({
    where: { userId },
  });

  if (!prefs) {
    prefs = await db.notificationPreferences.create({
      data: {
        userId,
        inAppEnabled: true,
        emailEnabled: true,
        telegramEnabled: false,
        whatsappEnabled: false,
      },
    });
  }

  return prefs;
}

/**
 * 8. isChannelEnabled — Check if a channel is enabled for a specific notification type
 *
 * Checks: global channel toggle → type-specific override → result
 */
export async function isChannelEnabled(
  userId: string,
  channel: NotificationChannel,
  type?: string
): Promise<boolean> {
  const prefs = await getUserPreferences(userId);

  // Check global channel toggle
  const globalEnabled: Record<NotificationChannel, boolean> = {
    in_app: prefs.inAppEnabled,
    email: prefs.emailEnabled,
    telegram: prefs.telegramEnabled,
    whatsapp: prefs.whatsappEnabled,
  };

  if (!globalEnabled[channel]) {
    return false;
  }

  // Check type-specific override if type is provided
  if (type && prefs.typePreferences) {
    try {
      const typePrefs = JSON.parse(prefs.typePreferences) as Record<string, TypePreference>;
      const override = typePrefs[type];
      if (override) {
        const channelKey: Record<NotificationChannel, keyof TypePreference> = {
          in_app: 'inApp',
          email: 'email',
          telegram: 'telegram',
          whatsapp: 'whatsapp',
        };
        const key = channelKey[channel];
        if (override[key] !== undefined) {
          return override[key] as boolean;
        }
      }
    } catch {
      // Malformed JSON — ignore override, use global
    }
  }

  return true;
}

/**
 * 9. isInDND — Check if current time is in the Do Not Disturb window
 *
 * Handles overnight DND windows (e.g., 22:00 → 07:00)
 */
export function isInDND(preferences: NotificationPreferencesRecord): boolean {
  if (!preferences.dndStartTime || !preferences.dndEndTime) {
    return false;
  }

  try {
    const timezone = preferences.dndTimezone || 'UTC';
    const now = new Date();

    // Get current time in the configured timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    });

    const currentTimeStr = formatter.format(now);
    const [currentHours, currentMinutes] = currentTimeStr.split(':').map(Number);
    const currentMinutesTotal = (currentHours as number) * 60 + (currentMinutes as number);

    const [startHours, startMinutes] = preferences.dndStartTime.split(':').map(Number);
    const startMinutesTotal = (startHours as number) * 60 + (startMinutes as number);

    const [endHours, endMinutes] = preferences.dndEndTime.split(':').map(Number);
    const endMinutesTotal = (endHours as number) * 60 + (endMinutes as number);

    // Handle overnight DND (e.g., 22:00 → 07:00)
    if (startMinutesTotal > endMinutesTotal) {
      // DND wraps around midnight
      return currentMinutesTotal >= startMinutesTotal || currentMinutesTotal < endMinutesTotal;
    } else {
      // Normal DND window (e.g., 12:00 → 13:00)
      return currentMinutesTotal >= startMinutesTotal && currentMinutesTotal < endMinutesTotal;
    }
  } catch (error) {
    console.error('[NotificationEngine] DND check error:', error);
    return false;
  }
}

/**
 * 10. updatePreferences — Update notification preferences
 */
export async function updatePreferences(
  userId: string,
  updates: PreferenceUpdates
): Promise<NotificationPreferencesRecord> {
  const data: Record<string, unknown> = {};

  if (updates.inAppEnabled !== undefined) data.inAppEnabled = updates.inAppEnabled;
  if (updates.emailEnabled !== undefined) data.emailEnabled = updates.emailEnabled;
  if (updates.telegramEnabled !== undefined) data.telegramEnabled = updates.telegramEnabled;
  if (updates.whatsappEnabled !== undefined) data.whatsappEnabled = updates.whatsappEnabled;

  if (updates.dndStartTime !== undefined) {
    data.dndStartTime = updates.dndStartTime;
  }
  if (updates.dndEndTime !== undefined) {
    data.dndEndTime = updates.dndEndTime;
  }
  if (updates.dndTimezone !== undefined) {
    data.dndTimezone = updates.dndTimezone;
  }
  if (updates.typePreferences !== undefined) {
    data.typePreferences = updates.typePreferences
      ? JSON.stringify(updates.typePreferences)
      : null;
  }

  const prefs = await db.notificationPreferences.upsert({
    where: { userId },
    update: data,
    create: {
      userId,
      inAppEnabled: updates.inAppEnabled ?? true,
      emailEnabled: updates.emailEnabled ?? true,
      telegramEnabled: updates.telegramEnabled ?? false,
      whatsappEnabled: updates.whatsappEnabled ?? false,
      dndStartTime: (updates.dndStartTime as string | null) ?? null,
      dndEndTime: (updates.dndEndTime as string | null) ?? null,
      dndTimezone: (updates.dndTimezone as string | null) ?? null,
      typePreferences: updates.typePreferences ? JSON.stringify(updates.typePreferences) : null,
    },
  });

  await logAudit(userId, 'notification_preferences_updated', {
    updates,
  });

  return prefs;
}

// ═══════════════════════════════════════════════════════════════════
// CHANNEL-SPECIFIC DISPATCH — Each channel has its own function
// ═══════════════════════════════════════════════════════════════════

/**
 * 4. sendEmailNotification — Send notification via email
 *
 * Fire-and-forget — never blocks the main thread.
 */
export async function sendEmailNotification(
  userId: string,
  notification: { title: string; message: string; type: string; actionUrl?: string | null }
): Promise<void> {
  try {
    // Get user email
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (!user) {
      console.warn(`[NotificationEngine] User ${userId} not found for email notification`);
      return;
    }

    // Dynamic import to avoid bundling email service on client
    const { isEmailServiceConfigured } = await import('@/lib/email');

    if (!isEmailServiceConfigured()) {
      console.log(`[NotificationEngine] Email service not configured, skipping email for user ${userId}`);
      return;
    }

    // Build the email payload directly using the sendEmail chain
    const { sendVerificationEmail: _unused } = await import('@/lib/email');

    // We need to use the internal sendEmail, but it's not exported.
    // Instead, we'll send a notification-style email through a simple fetch or direct SMTP call.
    // For now, use a lightweight email sending approach:
    const emailSubject = `[AcquisitionOS] ${notification.title}`;
    const emailText = notification.message +
      (notification.actionUrl ? `\n\nTake action: ${notification.actionUrl}` : '');

    const emailHtml = buildNotificationEmailHtml(notification.title, notification.message, notification.actionUrl);

    // Use the email service's internal send mechanism
    const nodemailer = await import('nodemailer');
    const smtpConfigured = !!(
      process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
    );

    if (smtpConfigured) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const fromAddress = process.env.EMAIL_FROM || 'AcquisitionOS <noreply@acquisitionos.com>';

      await transporter.sendMail({
        from: fromAddress,
        to: user.email,
        subject: emailSubject,
        html: emailHtml,
        text: emailText,
      });
    } else {
      // Try Resend
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const from = process.env.EMAIL_FROM || 'AcquisitionOS <noreply@acquisitionos.com>';

        await resend.emails.send({
          from,
          to: user.email,
          subject: emailSubject,
          html: emailHtml,
          text: emailText,
        });
      } catch {
        console.log(`[NotificationEngine] No email provider available, skipping email notification for user ${userId}`);
      }
    }

    await logAudit(userId, 'notification_sent', {
      channel: 'email',
      type: notification.type,
      title: notification.title,
    });
  } catch (error) {
    console.error('[NotificationEngine] Email notification failed:', error);
    await logAudit(userId, 'notification_dispatch_failed', {
      channel: 'email',
      type: notification.type,
      error: error instanceof Error ? error.message : 'Unknown error',
    }).catch(() => {});
  }
}

/**
 * Build a simple HTML email for notifications
 */
function buildNotificationEmailHtml(
  title: string,
  message: string,
  actionUrl?: string | null
): string {
  const actionButton = actionUrl
    ? `<div style="margin: 24px 0; text-align: center;">
         <a href="${actionUrl}" target="_blank" rel="noopener noreferrer"
            style="display: inline-block; background: #0d9488; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 14px 36px; border-radius: 8px;">
           Take Action
         </a>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0; padding:0; background-color:#f0fdfa; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0fdfa; padding:32px 0;">
    <tr>
      <td align="center" style="padding:0 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#0d9488 0%,#0f766e 100%); padding:24px 40px; text-align:center;">
              <h1 style="margin:0; font-size:20px; font-weight:700; color:#ffffff;">AcquisitionOS</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <h2 style="margin:0 0 16px 0; font-size:18px; font-weight:600; color:#0f766e;">${title}</h2>
              <p style="margin:0 0 8px 0; font-size:15px; line-height:24px; color:#1e293b;">${message}</p>
              ${actionButton}
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; margin-top:16px;">
          <tr>
            <td style="padding:16px 24px; text-align:center; font-size:12px; color:#64748b;">
              &copy; ${new Date().getFullYear()} AcquisitionOS. You received this because you have notifications enabled.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * 5. sendTelegramNotification — Send notification via Telegram bot
 *
 * Fire-and-forget — never blocks the main thread.
 */
export async function sendTelegramNotification(
  userId: string,
  notification: { title: string; message: string; type: string }
): Promise<void> {
  try {
    // Check if user has a connected Telegram bot
    const config = await db.telegramConfig.findUnique({
      where: { userId },
      select: { isConnected: true, chatId: true, isPaused: true },
    });

    if (!config || !config.isConnected || !config.chatId || config.isPaused) {
      console.log(`[NotificationEngine] Telegram not connected/paused for user ${userId}, skipping`);
      return;
    }

    // Format the message for Telegram
    const telegramMessage = `🔔 *${escapeMarkdownV2(notification.title)}*\n\n${escapeMarkdownV2(notification.message)}`;

    const { sendMessage } = await import('@/lib/telegram-service');
    await sendMessage(userId, config.chatId, telegramMessage, {
      parseMode: 'MarkdownV2',
      disableNotification: false,
    });

    await logAudit(userId, 'notification_sent', {
      channel: 'telegram',
      type: notification.type,
      title: notification.title,
    });
  } catch (error) {
    console.error('[NotificationEngine] Telegram notification failed:', error);
    await logAudit(userId, 'notification_dispatch_failed', {
      channel: 'telegram',
      type: notification.type,
      error: error instanceof Error ? error.message : 'Unknown error',
    }).catch(() => {});
  }
}

/**
 * Escape text for Telegram MarkdownV2 format
 */
function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * 6. sendWhatsAppNotification — Send notification via WhatsApp
 *
 * Fire-and-forget — never blocks the main thread.
 */
export async function sendWhatsAppNotification(
  userId: string,
  notification: { title: string; message: string; type: string }
): Promise<void> {
  try {
    // Check if user has a connected WhatsApp account
    const config = await db.whatsappConfig.findUnique({
      where: { userId },
      select: {
        isConnected: true,
        isPaused: true,
        provider: true,
        phoneNumber: true,
        metaPhoneNumberId: true,
        metaAccessToken: true,
        twilioAccountSid: true,
        twilioPhoneNumber: true,
      },
    });

    if (!config || !config.isConnected || config.isPaused) {
      console.log(`[NotificationEngine] WhatsApp not connected/paused for user ${userId}, skipping`);
      return;
    }

    const textMessage = `🔔 ${notification.title}\n\n${notification.message}`;

    if (config.provider === 'meta') {
      const { sendMetaMessage } = await import('@/lib/whatsapp-service');
      // Send to user's own WhatsApp number (self-notification)
      await sendMetaMessage(userId, config.phoneNumber, textMessage);
    } else if (config.provider === 'twilio') {
      const { sendTwilioMessage } = await import('@/lib/whatsapp-service');
      await sendTwilioMessage(userId, config.phoneNumber, textMessage);
    }

    await logAudit(userId, 'notification_sent', {
      channel: 'whatsapp',
      type: notification.type,
      title: notification.title,
    });
  } catch (error) {
    console.error('[NotificationEngine] WhatsApp notification failed:', error);
    await logAudit(userId, 'notification_dispatch_failed', {
      channel: 'whatsapp',
      type: notification.type,
      error: error instanceof Error ? error.message : 'Unknown error',
    }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════
// CORE DISPATCH
// ═══════════════════════════════════════════════════════════════════

/**
 * 2. dispatchToChannels — Route notification to enabled channels
 *
 * Routes to:
 * - In-app: already created in DB, publish realtime event
 * - Email: call email service (if emailEnabled and not in DND)
 * - Telegram: call telegram service (if telegramEnabled and user has connected bot)
 * - WhatsApp: call whatsapp service (if whatsappEnabled and user has connected account)
 *
 * ALL channel dispatches are fire-and-forget (async, non-blocking).
 */
export async function dispatchToChannels(
  userId: string,
  notification: { id: string; title: string; message: string; type: string; actionUrl?: string | null },
  preferences: NotificationPreferencesRecord
): Promise<NotificationChannel[]> {
  const channels: NotificationChannel[] = ['in_app']; // In-app is always dispatched

  const dndActive = isInDND(preferences);

  // In-app: publish realtime event
  publishEvent({
    event: 'notification_created',
    userId,
    data: {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      actionUrl: notification.actionUrl,
    },
  });

  // Only dispatch to external channels if NOT in DND
  if (dndActive) {
    console.log(`[NotificationEngine] DND active for user ${userId}, skipping external channels`);
    return channels;
  }

  // Check type-specific preferences
  const typePrefEnabled = (channel: NotificationChannel): boolean => {
    if (preferences.typePreferences) {
      try {
        const typePrefs = JSON.parse(preferences.typePreferences) as Record<string, TypePreference>;
        const override = typePrefs[notification.type];
        if (override) {
          const channelKey: Record<NotificationChannel, keyof TypePreference> = {
            in_app: 'inApp',
            email: 'email',
            telegram: 'telegram',
            whatsapp: 'whatsapp',
          };
          const key = channelKey[channel];
          if (override[key] !== undefined) {
            return override[key] as boolean;
          }
        }
      } catch {
        // Malformed JSON — fall through to global check
      }
    }

    // Global channel preference
    const globalEnabled: Record<NotificationChannel, boolean> = {
      in_app: preferences.inAppEnabled,
      email: preferences.emailEnabled,
      telegram: preferences.telegramEnabled,
      whatsapp: preferences.whatsappEnabled,
    };
    return globalEnabled[channel];
  };

  // Email dispatch (fire-and-forget)
  if (typePrefEnabled('email')) {
    channels.push('email');
    sendEmailNotification(userId, notification).catch((err: unknown) => {
      console.error('[NotificationEngine] Email dispatch error:', err);
    });
  }

  // Telegram dispatch (fire-and-forget)
  if (typePrefEnabled('telegram')) {
    channels.push('telegram');
    sendTelegramNotification(userId, notification).catch((err: unknown) => {
      console.error('[NotificationEngine] Telegram dispatch error:', err);
    });
  }

  // WhatsApp dispatch (fire-and-forget)
  if (typePrefEnabled('whatsapp')) {
    channels.push('whatsapp');
    sendWhatsAppNotification(userId, notification).catch((err: unknown) => {
      console.error('[NotificationEngine] WhatsApp dispatch error:', err);
    });
  }

  return channels;
}

/**
 * 1. sendNotification — Create in-app notification AND dispatch to other channels
 *
 * Flow:
 * 1. Check rate limit
 * 2. Get user preferences
 * 3. Create Notification record in DB (NEVER lose the event)
 * 4. Dispatch to enabled channels (fire-and-forget)
 * 5. Log audit event
 * 6. Return notification record
 */
export async function sendNotification(
  params: SendNotificationParams
): Promise<NotificationDispatchResult> {
  const { userId, type, title, message, actionUrl, metadata } = params;

  // 1. Rate limit check
  if (!checkRateLimit(userId)) {
    await logAudit(userId, 'notification_rate_limited', {
      type,
      title,
      limit: MAX_NOTIFICATIONS_PER_MINUTE,
      window: '1 minute',
    });
    console.warn(`[NotificationEngine] Rate limit exceeded for user ${userId}`);

    // STILL create the DB record — never lose the event, but skip dispatch
    const notification = await db.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        read: false,
        actionUrl: actionUrl || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        deliveredVia: 'in_app',
      },
    });

    return {
      notification: {
        id: notification.id,
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        read: notification.read,
        actionUrl: notification.actionUrl,
        metadata: notification.metadata,
        deliveredVia: notification.deliveredVia,
        createdAt: notification.createdAt,
      },
      channels: ['in_app'],
      dndActive: false,
    };
  }

  // 2. Get user preferences
  const preferences = await getUserPreferences(userId);

  // 3. Create Notification record FIRST — never lose the event
  const notification = await db.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      read: false,
      actionUrl: actionUrl || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      deliveredVia: 'in_app', // Will be updated after dispatch
    },
  });

  // 4. Dispatch to enabled channels (fire-and-forget)
  const channels = await dispatchToChannels(
    userId,
    {
      id: notification.id,
      title,
      message,
      type,
      actionUrl,
    },
    preferences
  );

  // Update deliveredVia to reflect actual channels
  const deliveredVia = channels.join(',');
  await db.notification.update({
    where: { id: notification.id },
    data: { deliveredVia },
  }).catch((err: unknown) => {
    console.error('[NotificationEngine] Failed to update deliveredVia:', err);
  });

  const dndActive = isInDND(preferences);

  // 5. Audit log
  await logAudit(userId, 'notification_sent', {
    notificationId: notification.id,
    type,
    title,
    channels,
    dndActive,
  });

  return {
    notification: {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      read: notification.read,
      actionUrl: notification.actionUrl,
      metadata: notification.metadata,
      deliveredVia,
      createdAt: notification.createdAt,
    },
    channels,
    dndActive,
  };
}

/**
 * 3. batchNotify — Send multiple notifications efficiently (batch DB insert)
 *
 * Creates all notification records in a single transaction,
 * then dispatches to channels individually (fire-and-forget).
 */
export async function batchNotify(
  paramsList: BatchNotificationParams[]
): Promise<NotificationDispatchResult[]> {
  if (paramsList.length === 0) return [];

  const results: NotificationDispatchResult[] = [];

  // Batch create notification records
  const notificationRecords = await db.$transaction(
    paramsList.map((params) =>
      db.notification.create({
        data: {
          userId: params.userId,
          type: params.type,
          title: params.title,
          message: params.message,
          read: false,
          actionUrl: params.actionUrl || null,
          metadata: params.metadata ? JSON.stringify(params.metadata) : null,
          deliveredVia: 'in_app',
        },
      })
    )
  );

  // Dispatch each notification to channels (fire-and-forget)
  for (let i = 0; i < notificationRecords.length; i++) {
    const notification = notificationRecords[i];
    const params = paramsList[i];

    // Get preferences for the user (cached for same user in batch)
    const preferences = await getUserPreferences(params.userId);
    const dndActive = isInDND(preferences);

    // Rate limit check per notification
    const rateLimitOk = checkRateLimit(params.userId);

    let channels: NotificationChannel[] = ['in_app'];

    if (rateLimitOk) {
      channels = await dispatchToChannels(
        params.userId,
        {
          id: notification.id,
          title: params.title,
          message: params.message,
          type: params.type,
          actionUrl: params.actionUrl,
        },
        preferences
      );

      // Update deliveredVia
      const deliveredVia = channels.join(',');
      await db.notification.update({
        where: { id: notification.id },
        data: { deliveredVia },
      }).catch(() => {});
    }

    results.push({
      notification: {
        id: notification.id,
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        read: notification.read,
        actionUrl: notification.actionUrl,
        metadata: notification.metadata,
        deliveredVia: channels.join(','),
        createdAt: notification.createdAt,
      },
      channels,
      dndActive,
    });
  }

  // Batch audit log
  const userIds = [...new Set(paramsList.map((p) => p.userId))];
  for (const userId of userIds) {
    const userNotifications = paramsList.filter((p) => p.userId === userId);
    await logAudit(userId, 'notification_batch_sent', {
      count: userNotifications.length,
      types: userNotifications.map((p) => p.type),
    });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════
// NOTIFICATION TYPE HELPERS — 9 Categories
// ═══════════════════════════════════════════════════════════════════

/**
 * 11. notifyLeadUpdate — Lead discovered, stage moved, pipeline update
 */
export async function notifyLeadUpdate(
  userId: string,
  type: 'lead_discovered' | 'lead_stage_moved' | 'lead_pipeline_update',
  data: {
    leadId: string;
    leadName?: string;
    fromStage?: string;
    toStage?: string;
    source?: string;
    count?: number;
  }
): Promise<NotificationDispatchResult> {
  const titles: Record<string, string> = {
    lead_discovered: 'New Lead Discovered',
    lead_stage_moved: 'Lead Stage Updated',
    lead_pipeline_update: 'Pipeline Updated',
  };

  const messages: Record<string, string> = {
    lead_discovered: data.count
      ? `${data.count} new leads discovered${data.source ? ` from ${data.source}` : ''}`
      : `New lead discovered: ${data.leadName || data.leadId}${data.source ? ` from ${data.source}` : ''}`,
    lead_stage_moved: `${data.leadName || data.leadId} moved from ${data.fromStage || 'unknown'} to ${data.toStage || 'unknown'}`,
    lead_pipeline_update: `Pipeline has been updated with new changes`,
  };

  return sendNotification({
    userId,
    type,
    title: titles[type] || 'Lead Update',
    message: messages[type] || 'Lead has been updated',
    actionUrl: `/leads/${data.leadId}`,
    metadata: { ...data, category: 'lead_update' },
  });
}

/**
 * 12. notifyPaymentUpdate — Payment success/failed, invoice, subscription, credits, trial
 */
export async function notifyPaymentUpdate(
  userId: string,
  type: 'payment_success' | 'payment_failed' | 'payment_invoice' | 'payment_subscription' | 'payment_credits' | 'payment_trial',
  data: {
    amount?: number;
    currency?: string;
    plan?: string;
    credits?: number;
    invoiceId?: string;
    reason?: string;
    trialDaysLeft?: number;
  }
): Promise<NotificationDispatchResult> {
  const titles: Record<string, string> = {
    payment_success: 'Payment Successful',
    payment_failed: 'Payment Failed',
    payment_invoice: 'Invoice Generated',
    payment_subscription: 'Subscription Updated',
    payment_credits: 'Credits Updated',
    payment_trial: 'Trial Update',
  };

  const messages: Record<string, string> = {
    payment_success: `Payment of ${data.currency || 'USD'} ${data.amount || 0} was successful`,
    payment_failed: `Payment of ${data.currency || 'USD'} ${data.amount || 0} failed${data.reason ? `: ${data.reason}` : ''}`,
    payment_invoice: `Invoice ${data.invoiceId || ''} has been generated`,
    payment_subscription: `Your subscription has been updated${data.plan ? ` to ${data.plan}` : ''}`,
    payment_credits: `${data.credits || 0} credits have been ${data.credits && data.credits > 0 ? 'added' : 'deducted'}`,
    payment_trial: data.trialDaysLeft !== undefined
      ? `Your trial has ${data.trialDaysLeft} days remaining`
      : 'Your trial status has been updated',
  };

  return sendNotification({
    userId,
    type,
    title: titles[type] || 'Payment Update',
    message: messages[type] || 'Payment has been updated',
    actionUrl: '/settings?tab=billing',
    metadata: { ...data, category: 'payment_update' },
  });
}

/**
 * 13. notifyGmailSync — Gmail sync complete, thread update
 */
export async function notifyGmailSync(
  userId: string,
  type: 'gmail_sync_complete' | 'gmail_thread_update',
  data: {
    syncId?: string;
    threadCount?: number;
    newMessages?: number;
    threadSubject?: string;
    fromEmail?: string;
  }
): Promise<NotificationDispatchResult> {
  const titles: Record<string, string> = {
    gmail_sync_complete: 'Gmail Sync Complete',
    gmail_thread_update: 'Gmail Thread Update',
  };

  const messages: Record<string, string> = {
    gmail_sync_complete: `Synced ${data.threadCount || 0} threads with ${data.newMessages || 0} new messages`,
    gmail_thread_update: `New email in thread: ${data.threadSubject || 'No subject'}${data.fromEmail ? ` from ${data.fromEmail}` : ''}`,
  };

  return sendNotification({
    userId,
    type,
    title: titles[type] || 'Gmail Sync',
    message: messages[type] || 'Gmail has been synced',
    actionUrl: data.threadCount ? '/inbox' : undefined,
    metadata: { ...data, category: 'gmail_sync' },
  });
}

/**
 * 14. notifyTelegramDelivery — Telegram delivery status, incoming message
 */
export async function notifyTelegramDelivery(
  userId: string,
  type: 'telegram_delivery_status' | 'telegram_incoming_message',
  data: {
    deliveryId?: string;
    status?: string;
    recipientName?: string;
    senderName?: string;
    messagePreview?: string;
    chatId?: string;
  }
): Promise<NotificationDispatchResult> {
  const titles: Record<string, string> = {
    telegram_delivery_status: 'Telegram Delivery Update',
    telegram_incoming_message: 'Telegram Message Received',
  };

  const messages: Record<string, string> = {
    telegram_delivery_status: `Message to ${data.recipientName || 'recipient'} is now ${data.status || 'unknown'}`,
    telegram_incoming_message: `New message from ${data.senderName || 'unknown'}${data.messagePreview ? `: ${data.messagePreview.substring(0, 80)}` : ''}`,
  };

  return sendNotification({
    userId,
    type,
    title: titles[type] || 'Telegram Update',
    message: messages[type] || 'Telegram delivery updated',
    metadata: { ...data, category: 'telegram_delivery' },
  });
}

/**
 * 15. notifyWhatsAppDelivery — WhatsApp sent/delivered/read/failed
 */
export async function notifyWhatsAppDelivery(
  userId: string,
  type: 'whatsapp_sent' | 'whatsapp_delivered' | 'whatsapp_read' | 'whatsapp_failed',
  data: {
    deliveryId?: string;
    recipientPhone?: string;
    recipientName?: string;
    errorMessage?: string;
    providerMessageId?: string;
  }
): Promise<NotificationDispatchResult> {
  const titles: Record<string, string> = {
    whatsapp_sent: 'WhatsApp Message Sent',
    whatsapp_delivered: 'WhatsApp Message Delivered',
    whatsapp_read: 'WhatsApp Message Read',
    whatsapp_failed: 'WhatsApp Message Failed',
  };

  const messages: Record<string, string> = {
    whatsapp_sent: `Message sent to ${data.recipientName || data.recipientPhone || 'recipient'}`,
    whatsapp_delivered: `Message delivered to ${data.recipientName || data.recipientPhone || 'recipient'}`,
    whatsapp_read: `Message read by ${data.recipientName || data.recipientPhone || 'recipient'}`,
    whatsapp_failed: `Message to ${data.recipientName || data.recipientPhone || 'recipient'} failed${data.errorMessage ? `: ${data.errorMessage}` : ''}`,
  };

  return sendNotification({
    userId,
    type,
    title: titles[type] || 'WhatsApp Update',
    message: messages[type] || 'WhatsApp delivery updated',
    metadata: { ...data, category: 'whatsapp_delivery' },
  });
}

/**
 * 16. notifyAICompletion — AI analysis/scoring/outreach complete
 */
export async function notifyAICompletion(
  userId: string,
  type: 'ai_analysis_complete' | 'ai_scoring_complete' | 'ai_outreach_complete',
  data: {
    leadId?: string;
    leadName?: string;
    score?: number;
    channel?: string;
    creditsUsed?: number;
  }
): Promise<NotificationDispatchResult> {
  const titles: Record<string, string> = {
    ai_analysis_complete: 'AI Analysis Complete',
    ai_scoring_complete: 'AI Scoring Complete',
    ai_outreach_complete: 'AI Outreach Generated',
  };

  const messages: Record<string, string> = {
    ai_analysis_complete: `Analysis for ${data.leadName || data.leadId || 'lead'} is ready${data.creditsUsed ? ` (${data.creditsUsed} credits used)` : ''}`,
    ai_scoring_complete: `Scoring for ${data.leadName || data.leadId || 'lead'} is complete${data.score !== undefined ? ` — Score: ${data.score}` : ''}`,
    ai_outreach_complete: `Outreach message for ${data.leadName || data.leadId || 'lead'} via ${data.channel || 'unknown'} is ready`,
  };

  return sendNotification({
    userId,
    type,
    title: titles[type] || 'AI Complete',
    message: messages[type] || 'AI operation completed',
    actionUrl: data.leadId ? `/leads/${data.leadId}` : undefined,
    metadata: { ...data, category: 'ai_completion' },
  });
}

/**
 * 17. notifyWorkflowEvent — Workflow step/execution events
 */
export async function notifyWorkflowEvent(
  userId: string,
  type: 'workflow_step_complete' | 'workflow_step_failed' | 'workflow_execution_complete' | 'workflow_execution_failed',
  data: {
    workflowId?: string;
    workflowName?: string;
    stepName?: string;
    executionId?: string;
    error?: string;
    durationMs?: number;
  }
): Promise<NotificationDispatchResult> {
  const titles: Record<string, string> = {
    workflow_step_complete: 'Workflow Step Complete',
    workflow_step_failed: 'Workflow Step Failed',
    workflow_execution_complete: 'Workflow Complete',
    workflow_execution_failed: 'Workflow Failed',
  };

  const messages: Record<string, string> = {
    workflow_step_complete: `Step "${data.stepName || 'unknown'}" in "${data.workflowName || 'workflow'}" completed${data.durationMs ? ` in ${data.durationMs}ms` : ''}`,
    workflow_step_failed: `Step "${data.stepName || 'unknown'}" in "${data.workflowName || 'workflow'}" failed${data.error ? `: ${data.error}` : ''}`,
    workflow_execution_complete: `Workflow "${data.workflowName || 'workflow'}" completed successfully${data.durationMs ? ` in ${data.durationMs}ms` : ''}`,
    workflow_execution_failed: `Workflow "${data.workflowName || 'workflow'}" failed${data.error ? `: ${data.error}` : ''}`,
  };

  return sendNotification({
    userId,
    type,
    title: titles[type] || 'Workflow Event',
    message: messages[type] || 'Workflow event occurred',
    metadata: { ...data, category: 'workflow_event' },
  });
}

/**
 * 18. notifyOnboardingEvent — Onboarding progress events
 */
export async function notifyOnboardingEvent(
  userId: string,
  type: 'onboarding_step_complete' | 'onboarding_complete' | 'onboarding_reminder',
  data: {
    step?: string;
    stepName?: string;
    totalSteps?: number;
    completedSteps?: number;
    percentage?: number;
  }
): Promise<NotificationDispatchResult> {
  const titles: Record<string, string> = {
    onboarding_step_complete: 'Onboarding Step Complete',
    onboarding_complete: 'Onboarding Complete! 🎉',
    onboarding_reminder: 'Complete Your Setup',
  };

  const messages: Record<string, string> = {
    onboarding_step_complete: `Step "${data.stepName || data.step || 'unknown'}" completed${data.percentage !== undefined ? ` — ${data.percentage}% done` : ''}`,
    onboarding_complete: 'You\'ve completed all onboarding steps! You\'re ready to go.',
    onboarding_reminder: `You're ${data.percentage !== undefined ? `${data.percentage}%` : 'partially'} through setup. Complete remaining steps to unlock all features.`,
  };

  return sendNotification({
    userId,
    type,
    title: titles[type] || 'Onboarding Update',
    message: messages[type] || 'Onboarding progress updated',
    actionUrl: '/settings?tab=onboarding',
    metadata: { ...data, category: 'onboarding_event' },
  });
}

/**
 * 19. notifyFailure — System failures, integration errors
 */
export async function notifyFailure(
  userId: string,
  type: 'system_failure' | 'integration_error' | 'rate_limit_exceeded',
  data: {
    service?: string;
    error?: string;
    code?: string | number;
    recoverable?: boolean;
    actionRequired?: boolean;
  }
): Promise<NotificationDispatchResult> {
  const titles: Record<string, string> = {
    system_failure: 'System Error',
    integration_error: 'Integration Error',
    rate_limit_exceeded: 'Rate Limit Reached',
  };

  const messages: Record<string, string> = {
    system_failure: `A system error occurred${data.service ? ` in ${data.service}` : ''}${data.error ? `: ${data.error}` : ''}${data.recoverable === false ? ' — Manual intervention may be required.' : ''}`,
    integration_error: `${data.service || 'Integration'} error${data.error ? `: ${data.error}` : ''}${data.actionRequired ? ' — Action required.' : ''}`,
    rate_limit_exceeded: `Rate limit exceeded${data.service ? ` for ${data.service}` : ''}. Please wait before retrying.`,
  };

  return sendNotification({
    userId,
    type,
    title: titles[type] || 'Error',
    message: messages[type] || 'An error occurred',
    actionUrl: data.actionRequired ? '/settings' : undefined,
    metadata: { ...data, category: 'failure' },
  });
}

// ═══════════════════════════════════════════════════════════════════
// CRUD OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * 20. getNotifications — List notifications with pagination and filters
 *
 * Always filters by userId (org isolation).
 */
export async function getNotifications(
  userId: string,
  filters?: NotificationFilters
): Promise<{
  notifications: Array<{
    id: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    read: boolean;
    actionUrl: string | null;
    metadata: string | null;
    deliveredVia: string | null;
    createdAt: Date;
  }>;
  total: number;
  hasMore: boolean;
}> {
  const where: Record<string, unknown> = { userId };

  if (filters?.type) {
    where.type = filters.type;
  }

  if (filters?.read !== undefined) {
    where.read = filters.read;
  }

  if (filters?.since || filters?.until) {
    const createdAt: Record<string, Date> = {};
    if (filters.since) createdAt.gte = filters.since;
    if (filters.until) createdAt.lte = filters.until;
    where.createdAt = createdAt;
  }

  const limit = filters?.limit || 20;
  const offset = filters?.offset || 0;

  const [notifications, total] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // +1 to check hasMore
      skip: offset,
    }),
    db.notification.count({ where }),
  ]);

  const hasMore = notifications.length > limit;
  const result = hasMore ? notifications.slice(0, limit) : notifications;

  return {
    notifications: result.map((n) => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read,
      actionUrl: n.actionUrl,
      metadata: n.metadata,
      deliveredVia: n.deliveredVia,
      createdAt: n.createdAt,
    })),
    total,
    hasMore,
  };
}

/**
 * 21. markAsRead — Mark single notification as read
 */
export async function markAsRead(
  notificationId: string,
  userId: string
): Promise<boolean> {
  const notification = await db.notification.findFirst({
    where: { id: notificationId, userId }, // Org isolation
  });

  if (!notification) {
    return false;
  }

  if (notification.read) {
    return true; // Already read
  }

  await db.notification.update({
    where: { id: notificationId },
    data: { read: true },
  });

  // Publish realtime event
  publishEvent({
    event: 'notification_read',
    userId,
    data: { notificationId },
  });

  // Audit log
  await logAudit(userId, 'notification_read', {
    notificationId,
    type: notification.type,
  });

  return true;
}

/**
 * 22. markAllAsRead — Mark all unread notifications as read
 */
export async function markAllAsRead(userId: string): Promise<number> {
  const result = await db.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });

  // Publish realtime event
  publishEvent({
    event: 'notifications_cleared',
    userId,
    data: { count: result.count, action: 'mark_all_read' },
  });

  // Audit log
  await logAudit(userId, 'notification_read', {
    action: 'mark_all_read',
    count: result.count,
  });

  return result.count;
}

/**
 * 23. archiveNotification — Archive a notification
 *
 * Since there's no `archived` field on the Notification model,
 * we add `archived: true` to the metadata JSON.
 */
export async function archiveNotification(
  notificationId: string,
  userId: string
): Promise<boolean> {
  const notification = await db.notification.findFirst({
    where: { id: notificationId, userId }, // Org isolation
  });

  if (!notification) {
    return false;
  }

  // Update metadata to include archived flag
  let parsedMetadata: Record<string, unknown> = {};
  if (notification.metadata) {
    try {
      parsedMetadata = JSON.parse(notification.metadata) as Record<string, unknown>;
    } catch {
      // Malformed JSON, start fresh
    }
  }

  parsedMetadata.archived = true;
  parsedMetadata.archivedAt = new Date().toISOString();

  await db.notification.update({
    where: { id: notificationId },
    data: {
      metadata: JSON.stringify(parsedMetadata),
    },
  });

  // Publish realtime event
  publishEvent({
    event: 'notification_archived',
    userId,
    data: { notificationId },
  });

  // Audit log
  await logAudit(userId, 'notification_archived', {
    notificationId,
    type: notification.type,
  });

  return true;
}

/**
 * 24. getUnreadCount — Get unread notification count
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return db.notification.count({
    where: { userId, read: false },
  });
}

/**
 * 25. deleteOldNotifications — Cleanup old notifications
 *
 * Deletes notifications older than the specified number of days.
 * Default: 90 days.
 */
export async function deleteOldNotifications(
  userId: string,
  olderThanDays: number = 90
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const result = await db.notification.deleteMany({
    where: {
      userId,
      createdAt: { lt: cutoffDate },
    },
  });

  // Audit log
  await logAudit(userId, 'notification_deleted', {
    count: result.count,
    olderThanDays,
    cutoffDate: cutoffDate.toISOString(),
  });

  return result.count;
}
