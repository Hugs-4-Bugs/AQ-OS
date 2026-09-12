// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Google Calendar Event by ID
// PATCH /api/calendar/events/[id] — Update a calendar event
// DELETE /api/calendar/events/[id] — Cancel/delete a calendar event
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';
import { getValidCalendarAccessToken } from '@/lib/google-oauth';
import { sendMeetingCancellationToClient } from '@/lib/meetings/meeting-email';
import { cancelReminders } from '@/lib/meetings/meeting-reminders';
import { onMeetingCancelled } from '@/lib/meetings/crm-sync';

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary';

// ── PATCH: Update a calendar event ─────────────────────────────────

interface UpdateEventBody {
  title?: string;
  description?: string;
  startDateTime?: string; // ISO 8601
  endDateTime?: string;   // ISO 8601
  attendees?: Array<{ email: string; name?: string }>;
  timezone?: string;
}

export const PATCH = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const id = request.nextUrl.pathname.split('/').at(-1);
      if (!id) {
        return NextResponse.json(
          { error: 'Event ID is required' },
          { status: 400 }
        );
      }

      const body: UpdateEventBody = await request.json();
      const { title, description, startDateTime, endDateTime, attendees, timezone } = body;

      // Find the corresponding Meeting record by calendarEventId
      const meeting = await db.meeting.findFirst({
        where: { calendarEventId: id, userId: user.id },
      });

      if (!meeting) {
        return NextResponse.json(
          { error: 'Meeting not found for this calendar event' },
          { status: 404 }
        );
      }

      // Get stored timezone from UserSettings if not provided
      let tz = timezone || meeting.timezone;
      if (!tz) {
        try {
          const settings = await db.userSettings.findUnique({
            where: { userId: user.id },
            select: { meetingTimezone: true },
          });
          tz = settings?.meetingTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        } catch {
          tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        }
      }

      // Get valid Calendar access token
      const { accessToken } = await getValidCalendarAccessToken(user.id);

      // Build the update payload for Google Calendar
      const updatePayload: Record<string, unknown> = {};

      if (title !== undefined) updatePayload.summary = title;
      if (description !== undefined) updatePayload.description = description;

      if (startDateTime) {
        updatePayload.start = {
          dateTime: startDateTime,
          timeZone: tz,
        };
      }
      if (endDateTime) {
        updatePayload.end = {
          dateTime: endDateTime,
          timeZone: tz,
        };
      }

      // Handle attendees: merge with existing attendees (append, don't replace)
      if (attendees && attendees.length > 0) {
        // Get existing attendees from the meeting record
        let existingAttendees: Array<{ email: string; name?: string; status?: string }> = [];
        try {
          existingAttendees = JSON.parse(meeting.attendees || '[]');
        } catch {
          existingAttendees = [];
        }

        // Merge: add new attendees that don't already exist
        const existingEmails = new Set(existingAttendees.map((a) => a.email.toLowerCase()));
        const newAttendees = attendees.filter(
          (a) => !existingEmails.has(a.email.toLowerCase())
        );
        const mergedAttendees = [...existingAttendees, ...newAttendees];

        updatePayload.attendees = mergedAttendees.map((a) => ({
          email: a.email,
          displayName: a.name || undefined,
        }));
      }

      // Update event via Google Calendar API with PATCH
      const updateResponse = await fetch(
        `${GOOGLE_CALENDAR_API}/events/${encodeURIComponent(id)}?conferenceDataVersion=1&sendUpdates=all`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatePayload),
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error('[Calendar Events] Failed to update event:', errorText);

        if (updateResponse.status === 401) {
          return NextResponse.json(
            { error: 'Calendar token expired. Please reconnect your Google Calendar.' },
            { status: 401 }
          );
        }

        return NextResponse.json(
          { error: 'Failed to update calendar event' },
          { status: 502 }
        );
      }

      const updatedEvent = await updateResponse.json();

      // Update the corresponding Meeting record
      const meetingUpdateData: Record<string, unknown> = {};
      if (title !== undefined) meetingUpdateData.title = title;
      if (description !== undefined) meetingUpdateData.description = description;
      if (startDateTime) meetingUpdateData.startDateTime = new Date(startDateTime);
      if (endDateTime) meetingUpdateData.endDateTime = new Date(endDateTime);
      if (tz) meetingUpdateData.timezone = tz;

      // Update attendees in the Meeting record (merged)
      if (attendees && attendees.length > 0) {
        let existingAttendees: Array<{ email: string; name?: string; status?: string }> = [];
        try {
          existingAttendees = JSON.parse(meeting.attendees || '[]');
        } catch {
          existingAttendees = [];
        }
        const existingEmails = new Set(existingAttendees.map((a) => a.email.toLowerCase()));
        const newAttendees = attendees.filter(
          (a) => !existingEmails.has(a.email.toLowerCase())
        );
        meetingUpdateData.attendees = JSON.stringify([...existingAttendees, ...newAttendees]);
      }

      // Update meeting URL if new conference data is returned
      if (updatedEvent.hangoutLink) {
        meetingUpdateData.meetingUrl = updatedEvent.hangoutLink;
      } else if (updatedEvent.conferenceData?.entryPoints) {
        const videoEntry = updatedEvent.conferenceData.entryPoints.find(
          (ep: { entryPointType: string; uri: string }) => ep.entryPointType === 'video'
        );
        if (videoEntry?.uri) {
          meetingUpdateData.meetingUrl = videoEntry.uri;
        }
      }

      if (updatedEvent.conferenceData) {
        meetingUpdateData.conferenceData = JSON.stringify(updatedEvent.conferenceData);
      }

      // Recalculate duration if times changed
      if (startDateTime || endDateTime) {
        const newStart = new Date(startDateTime || meeting.startDateTime);
        const newEnd = new Date(endDateTime || meeting.endDateTime);
        meetingUpdateData.durationMinutes = Math.round(
          (newEnd.getTime() - newStart.getTime()) / 60000
        );
      }

      await db.meeting.update({
        where: { id: meeting.id },
        data: meetingUpdateData,
      });

      // Create audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'calendar_event_updated',
          details: `Updated calendar event: "${title || meeting.title}"`,
          resource: 'calendar',
          resourceId: id,
        },
      });

      console.log('[Calendar Events] Event updated:', id);

      return NextResponse.json({
        success: true,
        event: updatedEvent,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('No active Google Calendar')) {
        return NextResponse.json(
          { error: 'No active Google Calendar connection found. Please connect your Google Calendar first.' },
          { status: 404 }
        );
      }

      console.error('[Calendar Events] PATCH Error:', error);
      return NextResponse.json(
        { error: 'Failed to update calendar event' },
        { status: 500 }
      );
    }
  });
}, 'calendar/events/[id]');

// ── DELETE: Cancel/delete a calendar event ──────────────────────────

export const DELETE = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const id = request.nextUrl.pathname.split('/').at(-1);
      if (!id) {
        return NextResponse.json(
          { error: 'Event ID is required' },
          { status: 400 }
        );
      }

      const { searchParams } = new URL(request.url);
      const reason = searchParams.get('reason') || undefined;

      // Find the corresponding Meeting record by calendarEventId
      const meeting = await db.meeting.findFirst({
        where: { calendarEventId: id, userId: user.id },
        include: { lead: true },
      });

      if (!meeting) {
        return NextResponse.json(
          { error: 'Meeting not found for this calendar event' },
          { status: 404 }
        );
      }

      // Get valid Calendar access token
      const { accessToken } = await getValidCalendarAccessToken(user.id);

      // Delete the event from Google Calendar (this cancels it for all attendees)
      const deleteResponse = await fetch(
        `${GOOGLE_CALENDAR_API}/events/${encodeURIComponent(id)}?sendUpdates=all`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!deleteResponse.ok && deleteResponse.status !== 410) {
        // 410 means the event was already deleted
        const errorText = await deleteResponse.text();
        console.error('[Calendar Events] Failed to delete event:', errorText);

        if (deleteResponse.status === 401) {
          return NextResponse.json(
            { error: 'Calendar token expired. Please reconnect your Google Calendar.' },
            { status: 401 }
          );
        }

        return NextResponse.json(
          { error: 'Failed to cancel calendar event' },
          { status: 502 }
        );
      }

      // Update the Meeting record status to CANCELLED
      const cancelledMeeting = await db.meeting.update({
        where: { id: meeting.id },
        data: {
          status: 'cancelled',
          cancellationReason: reason || 'Cancelled via calendar event deletion',
        },
      });

      // CRM sync: Handle cancellation (creates LeadActivity, notification, deal update)
      try {
        await onMeetingCancelled(meeting.id, reason || 'Cancelled via calendar event deletion');
        console.log('[Calendar Events] CRM cancellation sync completed for meeting:', meeting.id);
      } catch (crmError) {
        console.error('[Calendar Events] CRM cancellation sync failed (non-blocking):', crmError);
      }

      // Create audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'calendar_event_cancelled',
          details: `Cancelled calendar event: "${meeting.title}"${reason ? ` Reason: ${reason}` : ''}`,
          resource: 'calendar',
          resourceId: id,
        },
      });

      // Phase 4: Send cancellation email to client/lead
      try {
        if (meeting.lead?.email) {
          await sendMeetingCancellationToClient(cancelledMeeting, meeting.lead);
          console.log('[Calendar Events] Cancellation email sent to client for meeting:', meeting.id);
        }
      } catch (emailError) {
        console.error('[Calendar Events] Cancellation email to client failed (non-blocking):', emailError);
      }

      // Phase 4: Cancel scheduled reminders
      try {
        const cancelledCount = await cancelReminders(meeting.id);
        console.log(`[Calendar Events] Cancelled ${cancelledCount} reminders for meeting:`, meeting.id);
      } catch (reminderError) {
        console.error('[Calendar Events] Reminder cancellation failed (non-blocking):', reminderError);
      }

      console.log('[Calendar Events] Event cancelled:', id, 'meeting:', meeting.id);

      return NextResponse.json({
        success: true,
        meetingId: meeting.id,
        status: 'cancelled',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('No active Google Calendar')) {
        return NextResponse.json(
          { error: 'No active Google Calendar connection found. Please connect your Google Calendar first.' },
          { status: 404 }
        );
      }

      console.error('[Calendar Events] DELETE Error:', error);
      return NextResponse.json(
        { error: 'Failed to cancel calendar event' },
        { status: 500 }
      );
    }
  });
}, 'calendar/events/[id]');
