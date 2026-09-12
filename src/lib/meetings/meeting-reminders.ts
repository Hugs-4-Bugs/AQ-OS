// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Reminders
// Proactive reminder scheduling and dispatch
//
// Handles:
// - Scheduling reminders at configurable intervals before meetings
// - Sending reminders via email (client + user)
// - Tracking reminder delivery status via MeetingReminder Prisma model
// - Cron-compatible processing function for scheduled execution
//
// Phase 4: Full implementation — uses MeetingReminder Prisma model
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import {
  sendMeetingReminderToClient,
  sendMeetingReminderToUser,
} from './meeting-email';
import { sendNotification } from '@/lib/notification-engine';

// ===== TYPES =====

/** Reminder type */
export type ReminderType = 'email' | 'in_app' | 'telegram' | 'whatsapp' | 'push';

/** Reminder status */
export type ReminderStatus = 'scheduled' | 'sent' | 'delivered' | 'failed' | 'cancelled';

/** Reminder schedule configuration */
export interface ReminderSchedule {
  meetingId: string;
  userId: string;
  minutesBefore: number;
  channels: ReminderType[];
  status: ReminderStatus;
  scheduledFor: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  failureReason?: string;
}

/** Default reminder intervals (in minutes before meeting) */
export const DEFAULT_REMINDER_INTERVALS = [1440, 60]; // 24h before, 1h before

/** Reminder processing result */
export interface ReminderProcessingResult {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: Array<{ meetingId: string; error: string }>;
}

// ===== LOGGING =====

const LOG_PREFIX = '[MeetingReminders]';

// ===== REMINDER SCHEDULING =====

/**
 * Schedule reminders for a newly created meeting.
 * Creates MeetingReminder records in the database based on user preferences
 * and default intervals (24h and 1h before).
 *
 * @param meetingId - The meeting ID
 * @param userId - The user who owns the meeting
 * @param meetingStartTime - When the meeting starts
 * @param customIntervals - Optional custom intervals in minutes before meeting
 */
export async function scheduleReminders(
  meetingId: string,
  userId: string,
  meetingStartTime: Date,
  customIntervals?: number[]
): Promise<ReminderSchedule[]> {
  console.log(`${LOG_PREFIX} scheduleReminders called for meeting ${meetingId}`);

  // Check user's reminder preferences
  let intervals = customIntervals;
  if (!intervals) {
    try {
      const settings = await db.userSettings.findUnique({
        where: { userId },
        select: { meetingRemindersEnabled: true, meetingReminderMinutes: true },
      });

      if (settings && !settings.meetingRemindersEnabled) {
        console.log(`${LOG_PREFIX} Reminders disabled for user ${userId}`);
        return [];
      }

      if (settings?.meetingReminderMinutes) {
        try {
          intervals = JSON.parse(settings.meetingReminderMinutes);
          if (!Array.isArray(intervals) || intervals.length === 0) {
            intervals = DEFAULT_REMINDER_INTERVALS;
          }
        } catch {
          intervals = DEFAULT_REMINDER_INTERVALS;
        }
      } else {
        intervals = DEFAULT_REMINDER_INTERVALS;
      }
    } catch {
      intervals = DEFAULT_REMINDER_INTERVALS;
    }
  }

  // Create reminder records
  const schedules: ReminderSchedule[] = [];

  for (const minutesBefore of intervals) {
    const remindAt = new Date(meetingStartTime.getTime() - minutesBefore * 60 * 1000);

    // Don't schedule reminders in the past
    if (remindAt <= new Date()) {
      console.log(`${LOG_PREFIX} Skipping reminder ${minutesBefore}min before — already past`);
      continue;
    }

    try {
      const reminder = await db.meetingReminder.create({
        data: {
          meetingId,
          userId,
          remindAt,
          type: 'both', // email + popup
          minutesBefore,
          sent: false,
        },
      });

      schedules.push({
        meetingId,
        userId,
        minutesBefore,
        channels: ['email', 'in_app'],
        status: 'scheduled',
        scheduledFor: remindAt,
      });

      console.log(`${LOG_PREFIX} Scheduled reminder: ${minutesBefore}min before meeting ${meetingId} (at ${remindAt.toISOString()})`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to create reminder record:`, error);
    }
  }

  return schedules;
}

/**
 * Cancel all scheduled reminders for a meeting.
 * Used when a meeting is cancelled.
 */
export async function cancelReminders(meetingId: string): Promise<number> {
  console.log(`${LOG_PREFIX} cancelReminders called for meeting ${meetingId}`);

  try {
    // Delete unsent reminders (they'll be cascade-deleted with meeting,
    // but we also want to handle the case where meeting still exists)
    const result = await db.meetingReminder.deleteMany({
      where: {
        meetingId,
        sent: false,
      },
    });

    console.log(`${LOG_PREFIX} Cancelled ${result.count} reminders for meeting ${meetingId}`);
    return result.count;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to cancel reminders:`, error);
    return 0;
  }
}

/**
 * Reschedule reminders when a meeting time changes.
 * Cancels existing unsent reminders and creates new ones.
 */
export async function rescheduleReminders(
  meetingId: string,
  newStartTime: Date,
  customIntervals?: number[]
): Promise<ReminderSchedule[]> {
  console.log(`${LOG_PREFIX} rescheduleReminders for meeting ${meetingId}`);

  // Get the meeting to find userId
  const meeting = await db.meeting.findUnique({
    where: { id: meetingId },
    select: { userId: true },
  });

  if (!meeting) {
    console.warn(`${LOG_PREFIX} Meeting ${meetingId} not found for reschedule`);
    return [];
  }

  // Cancel existing unsent reminders
  await cancelReminders(meetingId);

  // Schedule new reminders
  return scheduleReminders(meetingId, meeting.userId, newStartTime, customIntervals);
}

// ===== REMINDER DISPATCH =====

/**
 * Process due reminders and dispatch them.
 * This function is designed to be called by a cron job.
 *
 * Queries MeetingReminder records where remindAt <= now and sent = false,
 * loads the meeting, calls the appropriate sendMeetingReminder function.
 */
export async function processDueReminders(): Promise<ReminderProcessingResult> {
  console.log(`${LOG_PREFIX} processDueReminders started`);

  const result: ReminderProcessingResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  try {
    // Find all due reminders that haven't been sent
    const dueReminders = await db.meetingReminder.findMany({
      where: {
        remindAt: { lte: new Date() },
        sent: false,
      },
      include: {
        meeting: {
          include: {
            lead: {
              select: { ownerName: true, email: true },
            },
            user: {
              select: { name: true, email: true, company: true },
            },
          },
        },
      },
    });

    console.log(`${LOG_PREFIX} Found ${dueReminders.length} due reminders`);

    for (const reminder of dueReminders) {
      result.processed++;
      const meeting = reminder.meeting;

      // Skip if meeting is no longer scheduled
      if (meeting.status !== 'scheduled') {
        console.log(`${LOG_PREFIX} Skipping reminder for meeting ${meeting.id} — status is ${meeting.status}`);

        // Mark as sent to prevent re-processing
        try {
          await db.meetingReminder.update({
            where: { id: reminder.id },
            data: { sent: true, sentAt: new Date() },
          });
        } catch { /* ignore */ }

        result.skipped++;
        continue;
      }

      try {
        // Send reminder to client (lead)
        if (meeting.lead?.email) {
          const clientResult = await sendMeetingReminderToClient(
            {
              id: meeting.id,
              title: meeting.title,
              description: meeting.description,
              startDateTime: meeting.startDateTime,
              endDateTime: meeting.endDateTime,
              timezone: meeting.timezone || 'UTC',
              meetingUrl: meeting.meetingUrl,
              platform: meeting.platform || 'google_meet',
              attendees: meeting.attendees,
              leadId: meeting.leadId,
              userId: meeting.userId,
            },
            meeting.lead,
            reminder.minutesBefore,
          );

          if (!clientResult.sent) {
            console.warn(`${LOG_PREFIX} Failed to send client reminder for meeting ${meeting.id}: ${clientResult.error}`);
          }
        }

        // Send reminder to user
        if (meeting.user?.email) {
          const userResult = await sendMeetingReminderToUser(
            {
              id: meeting.id,
              title: meeting.title,
              description: meeting.description,
              startDateTime: meeting.startDateTime,
              endDateTime: meeting.endDateTime,
              timezone: meeting.timezone || 'UTC',
              meetingUrl: meeting.meetingUrl,
              platform: meeting.platform || 'google_meet',
              attendees: meeting.attendees,
              leadId: meeting.leadId,
              userId: meeting.userId,
            },
            meeting.user,
            reminder.minutesBefore,
          );

          if (!userResult.sent) {
            console.warn(`${LOG_PREFIX} Failed to send user reminder for meeting ${meeting.id}: ${userResult.error}`);
          }
        }

        // Dispatch in-app notification with type 'meeting_reminder'
        try {
          const timeUntil = reminder.minutesBefore >= 60
            ? `${Math.floor(reminder.minutesBefore / 60)} hour${Math.floor(reminder.minutesBefore / 60) > 1 ? 's' : ''}`
            : `${reminder.minutesBefore} minute${reminder.minutesBefore > 1 ? 's' : ''}`;

          await db.notification.create({
            data: {
              userId: reminder.userId,
              type: 'meeting_reminder',
              title: 'Meeting Reminder',
              message: `"${meeting.title}" starts in ${timeUntil}`,
              actionUrl: meeting.meetingUrl || `/meetings/${meeting.id}`,
              deliveredVia: 'in_app',
              metadata: JSON.stringify({
                meetingId: meeting.id,
                reminderId: reminder.id,
                minutesBefore: reminder.minutesBefore,
              }),
            },
          });
        } catch (notifError) {
          console.warn(`${LOG_PREFIX} Failed to create in-app notification for reminder ${reminder.id}:`, notifError);
        }

        // Mark reminder as sent
        await db.meetingReminder.update({
          where: { id: reminder.id },
          data: { sent: true, sentAt: new Date() },
        });

        result.sent++;
        console.log(`${LOG_PREFIX} Reminder sent for meeting ${meeting.id} (${reminder.minutesBefore}min before)`);

        // Dispatch in-app notification for meeting reminder
        try {
          await sendNotification({
            userId: meeting.userId,
            type: 'meeting_reminder',
            title: `Meeting Reminder: ${meeting.title}`,
            message: `Your meeting "${meeting.title}" starts in ${reminder.minutesBefore} minute${reminder.minutesBefore > 1 ? 's' : ''}. ${meeting.meetingUrl ? `Join: ${meeting.meetingUrl}` : ''}`,
            actionUrl: `/meetings/${meeting.id}`,
            metadata: {
              meetingId: meeting.id,
              leadId: meeting.leadId,
              minutesBefore: reminder.minutesBefore,
              startDateTime: meeting.startDateTime.toISOString(),
            },
          });
        } catch (notifError) {
          console.error(`${LOG_PREFIX} Failed to dispatch meeting_reminder notification:`, notifError);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`${LOG_PREFIX} Failed to process reminder ${reminder.id}:`, errorMsg);

        result.failed++;
        result.errors.push({ meetingId: meeting.id, error: errorMsg });

        // Mark as sent to prevent infinite retry (failures are logged)
        try {
          await db.meetingReminder.update({
            where: { id: reminder.id },
            data: { sent: true, sentAt: new Date() },
          });
        } catch { /* ignore */ }
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`${LOG_PREFIX} processDueReminders failed:`, errorMsg);
    result.errors.push({ meetingId: 'system', error: errorMsg });
  }

  console.log(`${LOG_PREFIX} processDueReminders completed: processed=${result.processed}, sent=${result.sent}, failed=${result.failed}, skipped=${result.skipped}`);
  return result;
}

/**
 * Send a meeting reminder via a specific channel.
 * Primarily used for manual/one-off reminders.
 */
export async function sendReminder(
  meetingId: string,
  userId: string,
  channel: ReminderType,
  minutesBefore: number
): Promise<{ sent: boolean; error?: string }> {
  console.log(`${LOG_PREFIX} sendReminder called: meeting=${meetingId}, channel=${channel}, minutesBefore=${minutesBefore}`);

  try {
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      include: {
        lead: { select: { ownerName: true, email: true } },
        user: { select: { name: true, email: true, company: true } },
      },
    });

    if (!meeting) {
      return { sent: false, error: 'Meeting not found' };
    }

    if (meeting.status !== 'scheduled') {
      return { sent: false, error: `Meeting status is ${meeting.status}, not scheduled` };
    }

    if (channel === 'email' || channel === 'in_app' || channel === 'push') {
      // Send to client
      if (meeting.lead?.email) {
        await sendMeetingReminderToClient(
          {
            id: meeting.id,
            title: meeting.title,
            description: meeting.description,
            startDateTime: meeting.startDateTime,
            endDateTime: meeting.endDateTime,
            timezone: meeting.timezone || 'UTC',
            meetingUrl: meeting.meetingUrl,
            platform: meeting.platform || 'google_meet',
            attendees: meeting.attendees,
            leadId: meeting.leadId,
            userId: meeting.userId,
          },
          meeting.lead,
          minutesBefore,
        );
      }

      // Send to user
      if (meeting.user?.email) {
        await sendMeetingReminderToUser(
          {
            id: meeting.id,
            title: meeting.title,
            description: meeting.description,
            startDateTime: meeting.startDateTime,
            endDateTime: meeting.endDateTime,
            timezone: meeting.timezone || 'UTC',
            meetingUrl: meeting.meetingUrl,
            platform: meeting.platform || 'google_meet',
            attendees: meeting.attendees,
            leadId: meeting.leadId,
            userId: meeting.userId,
          },
          meeting.user,
          minutesBefore,
        );
      }
    }

    return { sent: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`${LOG_PREFIX} sendReminder failed:`, msg);
    return { sent: false, error: msg };
  }
}

// ===== REMINDER QUERIES =====

/**
 * Get upcoming reminders for a user.
 */
export async function getUpcomingReminders(
  userId: string,
  limit: number = 20
): Promise<ReminderSchedule[]> {
  try {
    const reminders = await db.meetingReminder.findMany({
      where: {
        userId,
        sent: false,
        remindAt: { gte: new Date() },
      },
      include: {
        meeting: {
          select: {
            title: true,
            startDateTime: true,
            endDateTime: true,
            timezone: true,
            meetingUrl: true,
            platform: true,
            lead: { select: { ownerName: true, email: true } },
          },
        },
      },
      orderBy: { remindAt: 'asc' },
      take: limit,
    });

    return reminders.map((r) => ({
      meetingId: r.meetingId,
      userId: r.userId,
      minutesBefore: r.minutesBefore,
      channels: ['email', 'in_app'] as ReminderType[],
      status: 'scheduled' as ReminderStatus,
      scheduledFor: r.remindAt,
    }));
  } catch (error) {
    console.error(`${LOG_PREFIX} getUpcomingReminders failed:`, error);
    return [];
  }
}

/**
 * Get reminder delivery status for a meeting.
 */
export async function getReminderStatus(
  meetingId: string
): Promise<ReminderSchedule[]> {
  try {
    const reminders = await db.meetingReminder.findMany({
      where: { meetingId },
      orderBy: { remindAt: 'asc' },
    });

    return reminders.map((r) => ({
      meetingId: r.meetingId,
      userId: r.userId,
      minutesBefore: r.minutesBefore,
      channels: ['email', 'in_app'] as ReminderType[],
      status: (r.sent ? 'sent' : 'scheduled') as ReminderStatus,
      scheduledFor: r.remindAt,
      sentAt: r.sentAt || undefined,
    }));
  } catch (error) {
    console.error(`${LOG_PREFIX} getReminderStatus failed:`, error);
    return [];
  }
}
