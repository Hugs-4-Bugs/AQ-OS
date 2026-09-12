// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Google Calendar Webhook Receiver
// POST /api/calendar/webhook — Receives push notifications from Google
//
// Google Calendar sends push notifications to this endpoint when
// events change on a watched calendar. We verify the channel ID,
// sync changed events with our Meeting records, and notify users.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getValidCalendarAccessToken } from '@/lib/google-oauth';

// ── POST: Receive Google Calendar push notification ────────────────
//
// Google sends a POST request with these headers:
//   X-Goog-Channel-ID    — The channel ID we registered
//   X-Goog-Resource-ID   — The resource ID for the watched calendar
//   X-Goog-Resource-State — "sync" (initial) or "exists" (change)
//   X-Goog-Message-Number — Monotonically increasing number
//   X-Goog-Resource-URI  — The URL to fetch the changed resource
//   X-Goog-Channel-Token — The verification token (if we set one)

export async function POST(request: NextRequest) {
  const startTime = performance.now();

  try {
    // Extract Google push notification headers
    const channelId = request.headers.get('x-goog-channel-id');
    const resourceId = request.headers.get('x-goog-resource-id');
    const resourceState = request.headers.get('x-goog-resource-state');
    const messageNumber = request.headers.get('x-goog-message-number');
    const channelToken = request.headers.get('x-goog-channel-token');

    console.log('[Calendar Webhook] Received notification:', {
      channelId,
      resourceId,
      resourceState,
      messageNumber,
    });

    // ── Validate the channel ID ──────────────────────────────────
    if (!channelId || !resourceId) {
      console.warn('[Calendar Webhook] Missing required headers');
      return NextResponse.json(
        { error: 'Missing required push notification headers' },
        { status: 400 }
      );
    }

    // Find the watch channel in our database
    const calendarWatch = await db.calendarWatch.findFirst({
      where: {
        channelId,
        status: 'active',
      },
      include: {
        user: true,
      },
    });

    if (!calendarWatch) {
      console.warn('[Calendar Webhook] No active watch found for channel:', channelId);
      // Return 200 so Google doesn't retry — but log the warning
      return NextResponse.json({ received: true, warning: 'Unknown channel' });
    }

    // Verify the resource ID matches what we registered
    if (calendarWatch.resourceId !== resourceId) {
      console.warn('[Calendar Webhook] Resource ID mismatch:', {
        expected: calendarWatch.resourceId,
        received: resourceId,
      });
      return NextResponse.json({ received: true, warning: 'Resource ID mismatch' });
    }

    // ── Handle the "sync" state (initial confirmation) ───────────
    if (resourceState === 'sync') {
      console.log('[Calendar Webhook] Initial sync confirmation for channel:', channelId);

      await db.auditLog.create({
        data: {
          userId: calendarWatch.userId,
          action: 'calendar_watch_synced',
          details: JSON.stringify({
            channelId,
            resourceId,
            resourceState,
            messageNumber,
          }),
          resource: 'calendar',
          resourceId: channelId,
        },
      });

      return NextResponse.json({ received: true, state: 'sync' });
    }

    // ── Handle "exists" state (calendar change notification) ─────
    if (resourceState === 'exists') {
      console.log('[Calendar Webhook] Calendar change detected for user:', calendarWatch.userId);

      // Sync changed events with our Meeting records
      await syncCalendarChanges(calendarWatch.userId, calendarWatch.calendarEmail);

      // Create audit log
      await db.auditLog.create({
        data: {
          userId: calendarWatch.userId,
          action: 'calendar_webhook_received',
          details: JSON.stringify({
            channelId,
            resourceId,
            resourceState,
            messageNumber,
            channelToken: channelToken ? 'present' : 'absent',
          }),
          resource: 'calendar',
          resourceId: channelId,
        },
      });
    }

    const durationMs = Math.round(performance.now() - startTime);
    console.log('[Calendar Webhook] Processed in', durationMs, 'ms');

    // Always return 200 to acknowledge receipt to Google
    return NextResponse.json({ received: true, state: resourceState });
  } catch (error) {
    console.error('[Calendar Webhook] POST Error:', error);
    // Return 200 even on error so Google doesn't keep retrying
    // We'll rely on our audit logs to detect processing failures
    return NextResponse.json({ received: true, error: 'Processing failed' });
  }
}

// ── Sync Calendar Changes with Meeting Records ────────────────────
//
// Fetches recent events from Google Calendar and syncs them with
// our Meeting records in the database. Handles:
// - New events created in Google Calendar → update existing meetings
// - Cancelled events → update meeting status to cancelled
// - Updated events (time/title changes) → update meeting details

async function syncCalendarChanges(userId: string, calendarEmail: string): Promise<void> {
  try {
    // Get a valid access token
    const { accessToken } = await getValidCalendarAccessToken(userId);

    // Fetch recently changed events from Google Calendar
    // Use a short lookback window (5 minutes) to catch recent changes
    const lookbackMs = 5 * 60 * 1000;
    const updatedMin = new Date(Date.now() - lookbackMs).toISOString();

    const eventsResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?updatedMin=${encodeURIComponent(updatedMin)}&showDeleted=true&singleEvents=true&maxResults=50`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!eventsResponse.ok) {
      const errorText = await eventsResponse.text();
      console.error('[Calendar Webhook] Failed to fetch changed events:', errorText);
      return;
    }

    const eventsData = await eventsResponse.json();
    const changedEvents = eventsData.items || [];

    console.log('[Calendar Webhook] Found', changedEvents.length, 'changed events');

    for (const event of changedEvents) {
      await syncSingleEvent(userId, event);
    }

    // Update lastSyncAt on the calendar token
    await db.googleCalendarToken.updateMany({
      where: { userId, calendarEmail, status: 'active' },
      data: { lastSyncAt: new Date() },
    });
  } catch (error) {
    console.error('[Calendar Webhook] syncCalendarChanges error:', error);
  }
}

// ── Sync a single Google Calendar event with our Meeting records ──

async function syncSingleEvent(
  userId: string,
  event: {
    id: string;
    status?: string;
    summary?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    description?: string;
    location?: string;
    attendees?: Array<{ email?: string; responseStatus?: string }>;
  }
): Promise<void> {
  try {
    // Find our Meeting record linked to this calendar event
    const meeting = await db.meeting.findFirst({
      where: {
        userId,
        calendarEventId: event.id,
      },
    });

    if (!meeting) {
      // This event isn't linked to any of our meetings — skip
      return;
    }

    // ── Handle cancelled events ─────────────────────────────────
    if (event.status === 'cancelled') {
      // Only update if meeting isn't already cancelled
      if (meeting.status !== 'cancelled') {
        await db.meeting.update({
          where: { id: meeting.id },
          data: {
            status: 'cancelled',
            cancellationReason: 'Event cancelled in Google Calendar (push notification)',
          },
        });

        // Create notification for the user
        await db.notification.create({
          data: {
            userId,
            type: 'meeting_cancelled',
            title: 'Meeting Cancelled in Google Calendar',
            message: `"${meeting.title}" was cancelled in Google Calendar and has been updated.`,
            actionUrl: `/dashboard/meetings/${meeting.id}`,
            metadata: JSON.stringify({
              meetingId: meeting.id,
              calendarEventId: event.id,
              source: 'google_calendar_webhook',
            }),
            deliveredVia: 'in_app',
          },
        });

        console.log('[Calendar Webhook] Meeting cancelled:', meeting.id, event.id);
      }
      return;
    }

    // ── Handle updated events ───────────────────────────────────
    const updateData: Record<string, unknown> = {};
    let hasChanges = false;

    // Check for title change
    if (event.summary && event.summary !== meeting.title) {
      updateData.title = event.summary;
      hasChanges = true;
    }

    // Check for time change
    if (event.start?.dateTime) {
      const newStart = new Date(event.start.dateTime);
      if (newStart.getTime() !== meeting.startDateTime.getTime()) {
        updateData.startDateTime = newStart;
        hasChanges = true;
      }
    }

    if (event.end?.dateTime) {
      const newEnd = new Date(event.end.dateTime);
      if (newEnd.getTime() !== meeting.endDateTime.getTime()) {
        updateData.endDateTime = newEnd;
        hasChanges = true;
      }
    }

    // Check for description change
    if (event.description !== undefined && event.description !== meeting.description) {
      updateData.description = event.description;
      hasChanges = true;
    }

    // Check for location change
    if (event.location !== undefined && event.location !== meeting.location) {
      updateData.location = event.location;
      hasChanges = true;
    }

    // Check for attendees change
    if (event.attendees) {
      const attendeesJson = JSON.stringify(
        event.attendees.map((a) => ({
          email: a.email || '',
          status: a.responseStatus || 'needsAction',
        }))
      );
      if (attendeesJson !== meeting.attendees) {
        updateData.attendees = attendeesJson;
        hasChanges = true;
      }
    }

    // If confirmed in Google, update our status
    if (meeting.status === 'scheduled' && event.status === 'confirmed') {
      updateData.status = 'confirmed';
      hasChanges = true;
    }

    if (hasChanges) {
      await db.meeting.update({
        where: { id: meeting.id },
        data: updateData,
      });

      // Create notification for the user about the change
      const changeDescriptions: string[] = [];
      if (updateData.title) changeDescriptions.push('title');
      if (updateData.startDateTime || updateData.endDateTime) changeDescriptions.push('time');
      if (updateData.description) changeDescriptions.push('description');
      if (updateData.location) changeDescriptions.push('location');
      if (updateData.attendees) changeDescriptions.push('attendees');
      if (updateData.status) changeDescriptions.push('status');

      await db.notification.create({
        data: {
          userId,
          type: 'calendar_event_updated',
          title: 'Meeting Updated in Google Calendar',
          message: `"${meeting.title}" was updated in Google Calendar. Changes: ${changeDescriptions.join(', ')}.`,
          actionUrl: `/dashboard/meetings/${meeting.id}`,
          metadata: JSON.stringify({
            meetingId: meeting.id,
            calendarEventId: event.id,
            changes: changeDescriptions,
            source: 'google_calendar_webhook',
          }),
          deliveredVia: 'in_app',
        },
      });

      console.log('[Calendar Webhook] Meeting updated:', meeting.id, 'changes:', changeDescriptions.join(', '));
    }
  } catch (error) {
    console.error('[Calendar Webhook] syncSingleEvent error for event:', event.id, error);
  }
}
