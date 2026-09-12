// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Reminders Processor
// Manages meeting reminder lifecycle:
// - Create reminder records in DB
// - Process pending reminders (cron-compatible)
// - Send individual reminders (in-app + email)
// - Cancel/reschedule reminders
// - Query upcoming reminders
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { sendNotification } from '@/lib/notification-engine';
import { sendMeetingReminderToClient } from '@/lib/meeting/meeting-email';

// ═══════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════

/** Reminder processing result */
export interface ReminderProcessResult {
  processed: number;
  sent: number;
  failed: number;
  errors: string[];
}

/** Reminder send result */
export interface ReminderSendResult {
  sent: boolean;
  inAppNotified: boolean;
  emailSent: boolean;
  error?: string;
}

/** Upcoming reminder with meeting details */
export interface UpcomingReminder {
  id: string;
  meetingId: string;
  meetingTitle: string;
  meetingUrl: string | null;
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  durationMinutes: number;
  platform: string;
  location: string | null;
  remindAt: Date;
  minutesBefore: number;
  type: string;
  leadId: string | null;
  leadName: string | null;
  attendeeEmails: string[];
  hostName: string;
  hostEmail: string;
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const LOG_PREFIX = '[MeetingReminders]';

/** Default reminder schedules (minutes before meeting) */
const DEFAULT_REMINDER_MINUTES = [10, 60];

// ═══════════════════════════════════════════════════════════════════
// 1. CREATE MEETING REMINDERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Create reminder records in the database for a meeting.
 * Uses the user's configured reminder preferences or defaults.
 *
 * @param meetingId - The meeting to create reminders for
 * @param userId - The user who owns the meeting
 * @param startDateTime - When the meeting starts
 * @param reminderMinutes - Array of minutes before the meeting to remind (default: user preferences)
 * @returns Array of created reminder IDs
 */
export async function createMeetingReminders(
  meetingId: string,
  userId: string,
  startDateTime: Date,
  reminderMinutes?: number[]
): Promise<string[]> {
  console.log(`${LOG_PREFIX} Creating reminders for meeting ${meetingId}`);

  try {
    // Get user's reminder preferences if not specified
    let minutes = reminderMinutes;
    if (!minutes || minutes.length === 0) {
      const settings = await db.userSettings.findUnique({
        where: { userId },
        select: {
          meetingRemindersEnabled: true,
          meetingReminderMinutes: true,
        },
      });

      if (settings && !settings.meetingRemindersEnabled) {
        console.log(`${LOG_PREFIX} Reminders disabled for user ${userId}`);
        return [];
      }

      if (settings?.meetingReminderMinutes) {
        try {
          minutes = JSON.parse(settings.meetingReminderMinutes);
        } catch {
          minutes = DEFAULT_REMINDER_MINUTES;
        }
      } else {
        minutes = DEFAULT_REMINDER_MINUTES;
      }
    }

    // Get meeting details for reminder type
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      select: { reminders: true },
    });

    // Determine reminder type from meeting config
    let reminderType = 'popup'; // default
    if (meeting?.reminders) {
      try {
        const reminderConfig = JSON.parse(meeting.reminders) as Array<{ minutesBefore: number; type: string }>;
        if (reminderConfig.length > 0) {
          reminderType = reminderConfig[0].type || 'popup';
        }
      } catch {
        // Use default
      }
    }

    const createdIds: string[] = [];

    for (const mins of minutes) {
      const remindAt = new Date(startDateTime.getTime() - mins * 60 * 1000);

      // Don't create reminders that are already in the past
      if (remindAt.getTime() <= Date.now()) {
        console.log(`${LOG_PREFIX} Skipping past reminder: ${mins} min before meeting`);
        continue;
      }

      const reminder = await db.meetingReminder.create({
        data: {
          meetingId,
          userId,
          remindAt,
          type: reminderType,
          minutesBefore: mins,
          sent: false,
        },
      });

      createdIds.push(reminder.id);
    }

    console.log(`${LOG_PREFIX} Created ${createdIds.length} reminders for meeting ${meetingId}`);
    return createdIds;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error creating meeting reminders:`, error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2. PROCESS PENDING REMINDERS — For cron jobs
// ═══════════════════════════════════════════════════════════════════

/**
 * Process all pending reminders that are due.
 * Designed to be called by a cron job at regular intervals.
 *
 * @returns Processing result with counts
 */
export async function processPendingReminders(): Promise<ReminderProcessResult> {
  console.log(`${LOG_PREFIX} Processing pending reminders`);

  const result: ReminderProcessResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    errors: [],
  };

  try {
    const now = new Date();

    // Find all unsent reminders that are due
    const pendingReminders = await db.meetingReminder.findMany({
      where: {
        sent: false,
        remindAt: { lte: now },
      },
      include: {
        meeting: {
          select: {
            id: true,
            title: true,
            startDateTime: true,
            endDateTime: true,
            timezone: true,
            durationMinutes: true,
            platform: true,
            meetingUrl: true,
            location: true,
            leadId: true,
            status: true,
            attendees: true,
            user: {
              select: { id: true, name: true, email: true },
            },
            lead: {
              select: { businessName: true },
            },
          },
        },
      },
      take: 100, // Process in batches
    });

    console.log(`${LOG_PREFIX} Found ${pendingReminders.length} pending reminders`);

    for (const reminder of pendingReminders) {
      result.processed++;

      // Skip if meeting is cancelled
      if (reminder.meeting.status === 'cancelled') {
        await db.meetingReminder.update({
          where: { id: reminder.id },
          data: { sent: true, sentAt: new Date() },
        });
        continue;
      }

      // Skip if meeting has already ended
      if (reminder.meeting.endDateTime < now) {
        await db.meetingReminder.update({
          where: { id: reminder.id },
          data: { sent: true, sentAt: new Date() },
        });
        continue;
      }

      try {
        const sendResult = await sendMeetingReminder(reminder.id);

        if (sendResult.sent) {
          result.sent++;
        } else {
          result.failed++;
          if (sendResult.error) {
            result.errors.push(`Reminder ${reminder.id}: ${sendResult.error}`);
          }
        }
      } catch (error) {
        result.failed++;
        const message = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Reminder ${reminder.id}: ${message}`);
        console.error(`${LOG_PREFIX} Error sending reminder ${reminder.id}:`, error);
      }
    }

    console.log(
      `${LOG_PREFIX} Processing complete: ${result.sent} sent, ${result.failed} failed`
    );
  } catch (error) {
    console.error(`${LOG_PREFIX} Error processing pending reminders:`, error);
    result.errors.push(error instanceof Error ? error.message : 'Unknown processing error');
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// 3. SEND MEETING REMINDER — Send a single reminder (in-app + email)
// ═══════════════════════════════════════════════════════════════════

/**
 * Send a single meeting reminder via in-app notification and email.
 *
 * @param reminderId - The reminder ID to send
 * @returns Send result with status for each channel
 */
export async function sendMeetingReminder(reminderId: string): Promise<ReminderSendResult> {
  console.log(`${LOG_PREFIX} Sending reminder ${reminderId}`);

  const result: ReminderSendResult = {
    sent: false,
    inAppNotified: false,
    emailSent: false,
  };

  try {
    // Fetch the reminder with meeting details
    const reminder = await db.meetingReminder.findUnique({
      where: { id: reminderId },
      include: {
        meeting: {
          select: {
            id: true,
            title: true,
            startDateTime: true,
            endDateTime: true,
            timezone: true,
            durationMinutes: true,
            platform: true,
            meetingUrl: true,
            location: true,
            leadId: true,
            status: true,
            attendees: true,
            user: {
              select: { id: true, name: true, email: true },
            },
            lead: {
              select: { businessName: true, ownerName: true },
            },
          },
        },
      },
    });

    if (!reminder) {
      result.error = `Reminder ${reminderId} not found`;
      return result;
    }

    if (reminder.sent) {
      console.log(`${LOG_PREFIX} Reminder ${reminderId} already sent`);
      result.sent = true;
      return result;
    }

    const meeting = reminder.meeting;
    const user = meeting.user;

    // 1. Send in-app notification
    try {
      const timeUntil = reminder.minutesBefore >= 60
        ? `${Math.floor(reminder.minutesBefore / 60)} hour${Math.floor(reminder.minutesBefore / 60) > 1 ? 's' : ''}`
        : `${reminder.minutesBefore} minute${reminder.minutesBefore > 1 ? 's' : ''}`;

      await sendNotification({
        userId: user.id,
        type: 'meeting_reminder',
        title: 'Meeting Reminder',
        message: `"${meeting.title}" starts in ${timeUntil}${meeting.leadId ? ` with ${meeting.lead?.businessName || 'lead'}` : ''}`,
        actionUrl: `/meetings/${meeting.id}`,
        metadata: {
          meetingId: meeting.id,
          reminderId,
          minutesBefore: reminder.minutesBefore,
          startDateTime: meeting.startDateTime.toISOString(),
        },
      });

      result.inAppNotified = true;
    } catch (error) {
      console.warn(`${LOG_PREFIX} In-app notification failed for reminder ${reminderId}:`, error);
    }

    // 2. Send email to user if configured
    if (reminder.type === 'email' || reminder.type === 'both') {
      try {
        const userSettings = await db.userSettings.findUnique({
          where: { userId: user.id },
          select: { meetingEmailReminder: true },
        });

        if (userSettings?.meetingEmailReminder !== false) {
          // Send a reminder email to the user
          await sendEmail({
            to: user.email,
            subject: `Reminder: ${meeting.title} starts soon`,
            html: buildUserReminderHtml(meeting, user, reminder.minutesBefore),
            text: buildUserReminderText(meeting, user, reminder.minutesBefore),
          });
          result.emailSent = true;
        }
      } catch (error) {
        console.warn(`${LOG_PREFIX} Email reminder failed for reminder ${reminderId}:`, error);
      }
    }

    // 3. Send email to client attendees if configured
    try {
      const userSettings = await db.userSettings.findUnique({
        where: { userId: user.id },
        select: { meetingEmailReminder: true },
      });

      if (userSettings?.meetingEmailReminder !== false) {
        const attendees = safeParseAttendees(meeting.attendees);

        // Only send to external attendees (not the host)
        const externalAttendees = attendees.filter(
          (a) => a.email && a.email !== user.email
        );

        for (const attendee of externalAttendees) {
          try {
            await sendMeetingReminderToClient({
              meetingId: meeting.id,
              clientEmail: attendee.email,
              clientName: attendee.name || attendee.email,
              meetingTitle: meeting.title,
              meetingUrl: meeting.meetingUrl || undefined,
              startDateTime: meeting.startDateTime,
              endDateTime: meeting.endDateTime,
              timezone: meeting.timezone,
              durationMinutes: meeting.durationMinutes,
              platform: meeting.platform,
              location: meeting.location || undefined,
              hostName: user.name || 'Meeting Host',
              minutesUntilMeeting: reminder.minutesBefore,
            });
          } catch (emailError) {
            console.warn(`${LOG_PREFIX} Client reminder email failed:`, emailError);
          }
        }
      }
    } catch (error) {
      console.warn(`${LOG_PREFIX} Client reminder processing failed:`, error);
    }

    // 4. Mark reminder as sent
    await db.meetingReminder.update({
      where: { id: reminderId },
      data: {
        sent: true,
        sentAt: new Date(),
      },
    });

    result.sent = true;
    console.log(`${LOG_PREFIX} Reminder ${reminderId} sent successfully`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error sending reminder ${reminderId}:`, error);
    result.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// 4. CANCEL MEETING REMINDERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Cancel all pending reminders for a meeting.
 * Used when a meeting is cancelled or rescheduled.
 *
 * @param meetingId - The meeting whose reminders to cancel
 * @returns Number of reminders cancelled
 */
export async function cancelMeetingReminders(meetingId: string): Promise<number> {
  console.log(`${LOG_PREFIX} Cancelling reminders for meeting ${meetingId}`);

  try {
    // Mark all unsent reminders as sent (effectively cancelling them)
    const result = await db.meetingReminder.updateMany({
      where: {
        meetingId,
        sent: false,
      },
      data: {
        sent: true,
        sentAt: new Date(),
      },
    });

    console.log(`${LOG_PREFIX} Cancelled ${result.count} reminders for meeting ${meetingId}`);
    return result.count;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error cancelling meeting reminders:`, error);
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 5. RESCHEDULE MEETING REMINDERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Reschedule all reminders for a meeting after a time change.
 * Cancels existing unsent reminders and creates new ones.
 *
 * @param meetingId - The meeting whose reminders to reschedule
 * @param newStartDateTime - The new meeting start time
 * @returns Array of new reminder IDs
 */
export async function rescheduleMeetingReminders(
  meetingId: string,
  newStartDateTime: Date
): Promise<string[]> {
  console.log(`${LOG_PREFIX} Rescheduling reminders for meeting ${meetingId}`);

  try {
    // 1. Cancel existing unsent reminders
    await cancelMeetingReminders(meetingId);

    // 2. Get meeting details for user ID and reminder config
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      select: {
        userId: true,
        reminders: true,
      },
    });

    if (!meeting) {
      console.warn(`${LOG_PREFIX} Meeting ${meetingId} not found for rescheduling`);
      return [];
    }

    // 3. Parse existing reminder configuration
    let reminderMinutes = DEFAULT_REMINDER_MINUTES;
    if (meeting.reminders) {
      try {
        const reminderConfig = JSON.parse(meeting.reminders) as Array<{ minutesBefore: number; type: string }>;
        reminderMinutes = reminderConfig.map((r) => r.minutesBefore);
      } catch {
        // Use defaults
      }
    }

    // 4. Create new reminders
    const newIds = await createMeetingReminders(
      meetingId,
      meeting.userId,
      newStartDateTime,
      reminderMinutes
    );

    console.log(`${LOG_PREFIX} Rescheduled ${newIds.length} reminders for meeting ${meetingId}`);
    return newIds;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error rescheduling meeting reminders:`, error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// 6. GET UPCOMING REMINDERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Get upcoming reminders for a user.
 *
 * @param userId - The user whose reminders to fetch
 * @param limit - Maximum number of reminders to return (default 20)
 * @returns Array of upcoming reminders with meeting details
 */
export async function getUpcomingReminders(
  userId: string,
  limit: number = 20
): Promise<UpcomingReminder[]> {
  console.log(`${LOG_PREFIX} Getting upcoming reminders for user ${userId}`);

  try {
    const now = new Date();

    const reminders = await db.meetingReminder.findMany({
      where: {
        userId,
        sent: false,
        remindAt: { gte: now },
        meeting: {
          status: { in: ['scheduled', 'confirmed', 'rescheduled'] },
        },
      },
      include: {
        meeting: {
          select: {
            id: true,
            title: true,
            startDateTime: true,
            endDateTime: true,
            timezone: true,
            durationMinutes: true,
            platform: true,
            meetingUrl: true,
            location: true,
            leadId: true,
            attendees: true,
            user: {
              select: { name: true, email: true },
            },
            lead: {
              select: { businessName: true },
            },
          },
        },
      },
      orderBy: { remindAt: 'asc' },
      take: limit,
    });

    return reminders.map((reminder) => {
      const attendees = safeParseAttendees(reminder.meeting.attendees);

      return {
        id: reminder.id,
        meetingId: reminder.meeting.id,
        meetingTitle: reminder.meeting.title,
        meetingUrl: reminder.meeting.meetingUrl,
        startDateTime: reminder.meeting.startDateTime,
        endDateTime: reminder.meeting.endDateTime,
        timezone: reminder.meeting.timezone,
        durationMinutes: reminder.meeting.durationMinutes,
        platform: reminder.meeting.platform,
        location: reminder.meeting.location,
        remindAt: reminder.remindAt,
        minutesBefore: reminder.minutesBefore,
        type: reminder.type,
        leadId: reminder.meeting.leadId,
        leadName: reminder.meeting.lead?.businessName || null,
        attendeeEmails: attendees.map((a) => a.email).filter(Boolean),
        hostName: reminder.meeting.user.name || 'Meeting Host',
        hostEmail: reminder.meeting.user.email,
      };
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting upcoming reminders:`, error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Safely parse attendees JSON string.
 */
function safeParseAttendees(attendeesStr: string | null): Array<{ email: string; name?: string; status?: string }> {
  if (!attendeesStr) return [];
  try {
    return JSON.parse(attendeesStr) as Array<{ email: string; name?: string; status?: string }>;
  } catch {
    return [];
  }
}

/**
 * Build HTML email for user reminder.
 */
function buildUserReminderHtml(
  meeting: {
    id: string;
    title: string;
    startDateTime: Date;
    endDateTime: Date;
    timezone: string;
    durationMinutes: number;
    platform: string;
    meetingUrl: string | null;
    location: string | null;
    lead?: { businessName: string } | null;
  },
  user: { name: string | null; email: string },
  minutesBefore: number
): string {
  const BRAND_COLOR = '#0d9488';
  const BRAND_DARK = '#0f766e';
  const TEXT_PRIMARY = '#1e293b';
  const TEXT_SECONDARY = '#64748b';

  const timeUntil = minutesBefore >= 60
    ? `${Math.floor(minutesBefore / 60)} hour${Math.floor(minutesBefore / 60) > 1 ? 's' : ''}`
    : `${minutesBefore} minute${minutesBefore > 1 ? 's' : ''}`;

  const formatDate = (d: Date) => new Intl.DateTimeFormat('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }).format(d);

  const formatTime = (d: Date, tz: string) => new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: tz
  }).format(d);

  const joinLink = meeting.meetingUrl
    ? `<p style="margin:8px 0 0 0; font-size:14px;"><a href="${meeting.meetingUrl}" style="color:${BRAND_COLOR};">Join Meeting</a></p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0; padding:0; background-color:#f0fdfa; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:${TEXT_PRIMARY};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdfa; padding:32px 0;">
    <tr><td align="center" style="padding:0 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,${BRAND_COLOR},${BRAND_DARK}); padding:24px 40px; text-align:center;">
          <h1 style="margin:0; font-size:20px; font-weight:700; color:#fff;">AcquisitionOS</h1>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <p style="margin:0 0 16px 0; font-size:16px;">Hi <strong>${user.name || 'there'}</strong>,</p>
          <p style="margin:0 0 16px 0; font-size:15px;">Your meeting <strong>"${meeting.title}"</strong> starts in <strong style="color:${BRAND_DARK};">${timeUntil}</strong>.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 4px; font-size:14px;"><strong style="color:${BRAND_DARK};">Date:</strong> ${formatDate(meeting.startDateTime)}</p>
              <p style="margin:0 0 4px; font-size:14px;"><strong style="color:${BRAND_DARK};">Time:</strong> ${formatTime(meeting.startDateTime, meeting.timezone)} – ${formatTime(meeting.endDateTime, meeting.timezone)} (${meeting.timezone})</p>
              <p style="margin:0 0 4px; font-size:14px;"><strong style="color:${BRAND_DARK};">Duration:</strong> ${meeting.durationMinutes} minutes</p>
              <p style="margin:0 0 4px; font-size:14px;"><strong style="color:${BRAND_DARK};">Platform:</strong> ${meeting.platform}</p>
              ${meeting.lead?.businessName ? `<p style="margin:0; font-size:14px;"><strong style="color:${BRAND_DARK};">Lead:</strong> ${meeting.lead.businessName}</p>` : ''}
              ${joinLink}
            </td></tr>
          </table>
          <p style="margin:16px 0 0; font-size:14px; color:${TEXT_SECONDARY};">— The AcquisitionOS Team</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Build text email for user reminder.
 */
function buildUserReminderText(
  meeting: {
    id: string;
    title: string;
    startDateTime: Date;
    endDateTime: Date;
    timezone: string;
    durationMinutes: number;
    platform: string;
    meetingUrl: string | null;
    location: string | null;
    lead?: { businessName: string } | null;
  },
  user: { name: string | null; email: string },
  minutesBefore: number
): string {
  const timeUntil = minutesBefore >= 60
    ? `${Math.floor(minutesBefore / 60)} hour${Math.floor(minutesBefore / 60) > 1 ? 's' : ''}`
    : `${minutesBefore} minute${minutesBefore > 1 ? 's' : ''}`;

  const formatDate = (d: Date) => new Intl.DateTimeFormat('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }).format(d);

  const formatTime = (d: Date, tz: string) => new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: tz
  }).format(d);

  return `Hi ${user.name || 'there'},

Your meeting "${meeting.title}" starts in ${timeUntil}.

Date: ${formatDate(meeting.startDateTime)}
Time: ${formatTime(meeting.startDateTime, meeting.timezone)} – ${formatTime(meeting.endDateTime, meeting.timezone)} (${meeting.timezone})
Duration: ${meeting.durationMinutes} minutes
Platform: ${meeting.platform}
${meeting.meetingUrl ? `Join: ${meeting.meetingUrl}` : ''}
${meeting.lead?.businessName ? `Lead: ${meeting.lead.businessName}` : ''}

— The AcquisitionOS Team`;
}
