// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Status API
// PATCH /api/meetings/[id]/status — Update meeting status with CRM sync
//
// Accepts: { status: 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED' }
// Triggers CRM sync (lead stage, activity, deal notes, notifications)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';
import {
  onMeetingCompleted,
  onMeetingCancelled,
  syncMeetingToLead,
  syncMeetingToDeal,
} from '@/lib/meetings/crm-sync';
import { cancelReminders } from '@/lib/meetings/meeting-reminders';

type MeetingStatus = 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED';

const VALID_STATUSES: MeetingStatus[] = ['COMPLETED', 'CANCELLED', 'RESCHEDULED'];

export const PATCH = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const id = request.nextUrl.pathname.split('/').filter(Boolean).at(-2); // meetings/[id]/status → get [id]

      if (!id) {
        return NextResponse.json(
          { error: 'Meeting ID is required' },
          { status: 400 }
        );
      }

      const body = await request.json();
      const { status, reason } = body as { status: string; reason?: string };

      if (!status || !VALID_STATUSES.includes(status as MeetingStatus)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
          { status: 400 }
        );
      }

      // Find meeting and verify ownership
      const meeting = await db.meeting.findFirst({
        where: { id, userId: user.id },
      });

      if (!meeting) {
        return NextResponse.json(
          { error: 'Meeting not found' },
          { status: 404 }
        );
      }

      // Prevent status change if already in terminal state
      if (meeting.status === 'cancelled' || meeting.status === 'completed') {
        return NextResponse.json(
          { error: `Meeting is already ${meeting.status}. Cannot change status.` },
          { status: 400 }
        );
      }

      const previousStatus = meeting.status;
      const normalizedStatus = status.toLowerCase();

      // Handle each status change
      let crmResult;

      switch (normalizedStatus) {
        case 'completed': {
          crmResult = await onMeetingCompleted(id);
          break;
        }

        case 'cancelled': {
          // Cancel reminders first
          try {
            await cancelReminders(id);
          } catch {
            // Non-blocking
          }
          crmResult = await onMeetingCancelled(id, reason);
          break;
        }

        case 'rescheduled': {
          // Update status to rescheduled
          await db.meeting.update({
            where: { id },
            data: { status: 'rescheduled' },
          });
          // CRM sync for reschedule
          crmResult = await syncMeetingToLead(id);
          try {
            await syncMeetingToDeal(id);
          } catch {
            // Non-blocking
          }
          break;
        }

        default:
          return NextResponse.json(
            { error: 'Unsupported status change' },
            { status: 400 }
          );
      }

      // Create audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: `meeting_status_changed_to_${normalizedStatus}`,
          details: JSON.stringify({
            meetingId: id,
            previousStatus,
            newStatus: normalizedStatus,
            reason: reason || null,
            crmSyncResult: {
              leadUpdated: crmResult?.leadUpdated,
              dealUpdated: crmResult?.dealUpdated,
              activityCreated: crmResult?.activityCreated,
            },
          }),
          resource: 'meeting',
          resourceId: id,
        },
      });

      // Fetch updated meeting
      const updatedMeeting = await db.meeting.findUnique({
        where: { id },
      });

      return NextResponse.json({
        success: true,
        meeting: updatedMeeting,
        previousStatus,
        newStatus: normalizedStatus,
        crmSync: {
          leadUpdated: crmResult?.leadUpdated,
          dealUpdated: crmResult?.dealUpdated,
          activityCreated: crmResult?.activityCreated,
          errors: crmResult?.errors || [],
        },
      });
    } catch (error) {
      console.error('[Meeting Status API] PATCH Error:', error);
      return NextResponse.json(
        { error: 'Failed to update meeting status' },
        { status: 500 }
      );
    }
  });
}, 'meetings/[id]/status');
