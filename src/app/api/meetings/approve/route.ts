// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Approve Meeting API
// POST /api/meetings/approve — Approve a pending meeting
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';

export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();

      if (!body.meetingId || typeof body.meetingId !== 'string') {
        return NextResponse.json(
          { error: 'Missing required field: meetingId (string)' },
          { status: 400 }
        );
      }

      // Fetch the meeting (must belong to the user)
      const meeting = await db.meeting.findFirst({
        where: {
          id: body.meetingId,
          userId: user.id,
        },
      });

      if (!meeting) {
        return NextResponse.json(
          { error: 'Meeting not found or you do not have access.' },
          { status: 404 }
        );
      }

      if (meeting.approvalStatus !== 'pending') {
        return NextResponse.json(
          { error: `Meeting is not pending approval. Current approval status: ${meeting.approvalStatus}` },
          { status: 400 }
        );
      }

      if (meeting.status !== 'pending_approval') {
        return NextResponse.json(
          { error: `Meeting status is not pending_approval. Current status: ${meeting.status}` },
          { status: 400 }
        );
      }

      // Update approvalStatus and status
      const updatedMeeting = await db.meeting.update({
        where: { id: meeting.id },
        data: {
          approvalStatus: 'approved',
          status: 'scheduled',
        },
      });

      // Create audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'meeting_approved',
          details: JSON.stringify({
            meetingId: meeting.id,
            title: meeting.title,
            previousApprovalStatus: 'pending',
            newApprovalStatus: 'approved',
            previousStatus: 'pending_approval',
            newStatus: 'scheduled',
          }),
          resource: 'meeting',
          resourceId: meeting.id,
        },
      });

      // Send in-app notification
      try {
        await db.notification.create({
          data: {
            userId: user.id,
            type: 'meeting_approved',
            title: 'Meeting Approved',
            message: `"${meeting.title}" has been approved and is now scheduled`,
            actionUrl: `/meetings/${meeting.id}`,
            deliveredVia: 'in_app',
            metadata: JSON.stringify({ meetingId: meeting.id }),
          },
        });
      } catch (notifError) {
        console.error('[Meeting Approve API] Failed to create notification:', notifError);
      }

      return NextResponse.json({
        meeting: {
          id: updatedMeeting.id,
          title: updatedMeeting.title,
          status: updatedMeeting.status,
          approvalStatus: updatedMeeting.approvalStatus,
          startDateTime: updatedMeeting.startDateTime,
          endDateTime: updatedMeeting.endDateTime,
        },
      });
    } catch (error) {
      console.error('[Meeting Approve API] POST Error:', error);
      return NextResponse.json(
        { error: 'Failed to approve meeting' },
        { status: 500 }
      );
    }
  });
}, 'meetings/approve');
