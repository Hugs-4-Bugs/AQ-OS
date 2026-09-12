// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Reminders API
// GET /api/meetings/reminders — Get upcoming reminders for user
// POST /api/meetings/reminders — Process due reminders for user
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { getUpcomingReminders, sendMeetingReminder } from '@/lib/meeting/meeting-reminders';
import { db } from '@/lib/db';
import { sendNotification } from '@/lib/notification-engine';

export const GET = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const limit = parseInt(searchParams.get('limit') || '20', 10);

      // Validate limit
      const validLimit = Math.max(1, Math.min(limit, 100));

      const reminders = await getUpcomingReminders(user.id, validLimit);

      return NextResponse.json({ reminders });
    } catch (error) {
      console.error('[Meeting Reminders API] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch upcoming reminders' },
        { status: 500 }
      );
    }
  });
}, 'meetings/reminders');

// POST — Process due reminders for the authenticated user
export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const now = new Date();

      // Find all unsent reminders that are due for this user
      const dueReminders = await db.meetingReminder.findMany({
        where: {
          userId: user.id,
          sent: false,
          remindAt: { lte: now },
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
              leadId: true,
              status: true,
              lead: {
                select: { businessName: true },
              },
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
        take: 50,
      });

      let processed = 0;
      let failed = 0;

      for (const reminder of dueReminders) {
        try {
          // Send the reminder (in-app notification + email)
          await sendMeetingReminder(reminder.id);
          processed++;
        } catch (err) {
          console.error('[Meeting Reminders API] Failed to send reminder:', reminder.id, err);
          failed++;
        }
      }

      // Also send a summary notification if any were processed
      if (processed > 0) {
        try {
          await sendNotification({
            userId: user.id,
            type: 'meeting_reminder',
            title: 'Meeting Reminders Processed',
            message: `${processed} meeting reminder${processed > 1 ? 's were' : ' was'} processed.`,
          });
        } catch {
          // Non-critical — don't fail the request
        }
      }

      return NextResponse.json({
        success: true,
        processed,
        failed,
        total: dueReminders.length,
      });
    } catch (error) {
      console.error('[Meeting Reminders API] POST Error:', error);
      return NextResponse.json(
        { error: 'Failed to process meeting reminders' },
        { status: 500 }
      );
    }
  });
}, 'meetings/reminders');

// PATCH — Dismiss or snooze a single meeting reminder
export const PATCH = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { reminderId, action: patchAction, snoozeMinutes } = body;

      if (!reminderId) {
        return NextResponse.json({ error: 'reminderId is required' }, { status: 400 });
      }

      // Verify ownership
      const reminder = await db.meetingReminder.findFirst({
        where: { id: reminderId, userId: user.id },
      });

      if (!reminder) {
        return NextResponse.json({ error: 'Reminder not found' }, { status: 404 });
      }

      if (patchAction === 'dismiss') {
        // Mark as sent (dismissed)
        await db.meetingReminder.update({
          where: { id: reminderId },
          data: { sent: true, sentAt: new Date() },
        });
        return NextResponse.json({ success: true, action: 'dismissed' });
      }

      if (patchAction === 'snooze') {
        const minutes = snoozeMinutes || 10;
        const newRemindAt = new Date(reminder.remindAt.getTime() + minutes * 60 * 1000);
        await db.meetingReminder.update({
          where: { id: reminderId },
          data: { remindAt: newRemindAt },
        });
        return NextResponse.json({ success: true, action: 'snoozed', newRemindAt: newRemindAt.toISOString() });
      }

      return NextResponse.json({ error: 'Invalid action. Use: dismiss or snooze' }, { status: 400 });
    } catch (error) {
      console.error('[Meeting Reminders API] PATCH Error:', error);
      return NextResponse.json(
        { error: 'Failed to update meeting reminder' },
        { status: 500 }
      );
    }
  });
}, 'meetings/reminders');
