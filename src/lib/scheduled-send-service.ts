// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Scheduled Send Service
// Phase 9: Gmail Fixes — Scheduled email sending with timezone support
//
// Schedule emails to be sent at a specific future time, cancel/reschedule
// pending sends, and process the scheduled send queue.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { sendEmail, type EmailResult } from '@/lib/email';

// ===== TYPES =====

export interface ScheduleSendParams {
  userId: string;
  leadId?: string;
  to: string;
  subject: string;
  body: string;
  scheduledAt: Date | string;
  emailAccountId?: string;
  timezone?: string;
  metadata?: Record<string, unknown>;
}

export interface ScheduledSendResult {
  success: boolean;
  scheduledEmailId?: string;
  error?: string;
}

export interface RescheduleResult {
  success: boolean;
  error?: string;
}

// ===== TIMEZONE HELPERS =====

/**
 * Convert a date/time in a specific timezone to UTC.
 * Falls back to parsing the date as-is if timezone is invalid.
 */
function convertToUtc(date: Date | string, timezone?: string): Date {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (!timezone) return d;

  try {
    // Use Intl to get the offset for the timezone at the given date
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(d);
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0';

    // Construct a UTC date that, when formatted in the target timezone, gives the same wall time
    const localString = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;

    // The difference between the formatter output and the original date tells us the offset
    const formattedAsDate = new Date(localString + 'Z');
    const offsetMs = d.getTime() - formattedAsDate.getTime();

    // We want: when the wall clock in `timezone` reads the given time, what UTC is it?
    // Since `d` in UTC gives `formatter` output in `timezone`, we need the reverse
    const targetWallTime = new Date(typeof date === 'string' ? date : date.toISOString());
    const utcDate = new Date(targetWallTime.getTime() + offsetMs);

    return utcDate;
  } catch {
    // Invalid timezone — return the date as-is
    return d;
  }
}

/**
 * Validate that a timezone string is recognized by the runtime.
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ===== CORE FUNCTIONS =====

/**
 * Schedule an email to be sent at a specific future time.
 * Handles timezone conversion if a timezone is provided.
 */
export async function scheduleSend(params: ScheduleSendParams): Promise<ScheduledSendResult> {
  try {
    const { userId, leadId, to, subject, body, scheduledAt, emailAccountId, timezone, metadata } = params;

    // Convert timezone
    const utcScheduledAt = convertToUtc(scheduledAt, timezone);

    // Validate: scheduled time must be in the future
    if (utcScheduledAt.getTime() <= Date.now()) {
      return { success: false, error: 'Scheduled time must be in the future' };
    }

    // Validate email account ownership if provided
    if (emailAccountId) {
      const account = await db.emailAccount.findFirst({
        where: { id: emailAccountId, userId, status: 'active' },
      });
      if (!account) {
        return { success: false, error: 'Email account not found or inactive' };
      }
    }

    // Generate a tracking pixel ID for open tracking
    const trackingPixelId = `sp_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    // Create the scheduled email record
    const scheduledEmail = await db.scheduledEmail.create({
      data: {
        userId,
        leadId: leadId || null,
        to,
        subject,
        body,
        scheduledAt: utcScheduledAt,
        status: 'pending',
        emailAccountId: emailAccountId || null,
        trackingPixelId,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });

    console.log(`[ScheduledSend] Email scheduled: ${scheduledEmail.id} to ${to} at ${utcScheduledAt.toISOString()}`);

    return { success: true, scheduledEmailId: scheduledEmail.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error scheduling email';
    console.error('[ScheduledSend] Failed to schedule:', message);
    return { success: false, error: message };
  }
}

/**
 * Cancel a pending scheduled send before it executes.
 */
export async function cancelScheduledSend(
  scheduledEmailId: string,
  userId: string
): Promise<ScheduledSendResult> {
  try {
    const scheduledEmail = await db.scheduledEmail.findFirst({
      where: { id: scheduledEmailId, userId },
    });

    if (!scheduledEmail) {
      return { success: false, error: 'Scheduled email not found' };
    }

    if (scheduledEmail.status !== 'pending') {
      return { success: false, error: `Cannot cancel email with status: ${scheduledEmail.status}` };
    }

    await db.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: { status: 'cancelled' },
    });

    console.log(`[ScheduledSend] Cancelled: ${scheduledEmailId}`);
    return { success: true, scheduledEmailId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error cancelling scheduled send';
    console.error('[ScheduledSend] Cancel failed:', message);
    return { success: false, error: message };
  }
}

/**
 * Reschedule a pending send to a different time.
 */
export async function rescheduleSend(
  scheduledEmailId: string,
  userId: string,
  newScheduledAt: Date | string,
  timezone?: string
): Promise<RescheduleResult> {
  try {
    const scheduledEmail = await db.scheduledEmail.findFirst({
      where: { id: scheduledEmailId, userId },
    });

    if (!scheduledEmail) {
      return { success: false, error: 'Scheduled email not found' };
    }

    if (scheduledEmail.status !== 'pending') {
      return { success: false, error: `Cannot reschedule email with status: ${scheduledEmail.status}` };
    }

    const utcScheduledAt = convertToUtc(newScheduledAt, timezone);

    if (utcScheduledAt.getTime() <= Date.now()) {
      return { success: false, error: 'New scheduled time must be in the future' };
    }

    await db.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: { scheduledAt: utcScheduledAt },
    });

    console.log(`[ScheduledSend] Rescheduled: ${scheduledEmailId} to ${utcScheduledAt.toISOString()}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error rescheduling send';
    console.error('[ScheduledSend] Reschedule failed:', message);
    return { success: false, error: message };
  }
}

/**
 * Get all pending scheduled sends for a user.
 */
export async function getPendingScheduledSends(
  userId: string,
  options?: { limit?: number; offset?: number }
): Promise<{
  scheduledEmails: Awaited<ReturnType<typeof db.scheduledEmail.findMany>>;
  total: number;
}> {
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  const where = { userId, status: 'pending' };

  const [scheduledEmails, total] = await Promise.all([
    db.scheduledEmail.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      take: limit,
      skip: offset,
    }),
    db.scheduledEmail.count({ where }),
  ]);

  return { scheduledEmails, total };
}

/**
 * Process all scheduled sends that are due.
 * Called by a periodic job (e.g., Celery beat or cron).
 * Returns the number of emails processed.
 */
export async function processScheduledSends(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    // Find all pending scheduled emails that are due
    const dueEmails = await db.scheduledEmail.findMany({
      where: {
        status: 'pending',
        scheduledAt: { lte: new Date() },
      },
      take: 100, // Process in batches
      orderBy: { scheduledAt: 'asc' },
    });

    for (const email of dueEmails) {
      processed++;

      try {
        // Mark as sending to prevent duplicate processing
        await db.scheduledEmail.update({
          where: { id: email.id },
          data: { status: 'sending' },
        });

        // Send the email
        const result: EmailResult = await sendEmail({
          to: email.to,
          subject: email.subject,
          html: email.body,
          text: email.body.replace(/<[^>]*>/g, ''), // Strip HTML for text version
        });

        if (result.sent) {
          await db.scheduledEmail.update({
            where: { id: email.id },
            data: { status: 'sent' },
          });
          succeeded++;

          console.log(`[ScheduledSend] Sent: ${email.id} to ${email.to}`);
        } else {
          await db.scheduledEmail.update({
            where: { id: email.id },
            data: {
              status: 'failed',
              metadata: JSON.stringify({
                ...(email.metadata ? JSON.parse(email.metadata) : {}),
                error: result.error,
                failedAt: new Date().toISOString(),
              }),
            },
          });
          failed++;

          console.error(`[ScheduledSend] Failed: ${email.id} — ${result.error}`);
        }
      } catch (error) {
        // Mark as failed
        try {
          await db.scheduledEmail.update({
            where: { id: email.id },
            data: {
              status: 'failed',
              metadata: JSON.stringify({
                ...(email.metadata ? JSON.parse(email.metadata || '{}') : {}),
                error: error instanceof Error ? error.message : 'Unknown send error',
                failedAt: new Date().toISOString(),
              }),
            },
          });
        } catch {
          // Ignore update error
        }
        failed++;
      }
    }
  } catch (error) {
    console.error('[ScheduledSend] Process queue error:', error);
  }

  return { processed, succeeded, failed };
}
