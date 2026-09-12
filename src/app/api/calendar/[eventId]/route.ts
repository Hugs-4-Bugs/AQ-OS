// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Calendar Event Management
// PATCH /api/calendar/[eventId] — Update event
// DELETE /api/calendar/[eventId] — Delete event
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { getValidCalendarAccessToken } from '@/lib/google-oauth';

// ── PATCH: Update an event ──────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { eventId } = await params;
      const body = await request.json();
      const { summary, description, startDateTime, endDateTime, attendees } = body;

      const { accessToken, calendarToken } = await getValidCalendarAccessToken(user.id);

      // Build patch payload (only include provided fields)
      const patchPayload: Record<string, unknown> = {};

      if (summary) patchPayload.summary = summary;
      if (description !== undefined) patchPayload.description = description;

      if (startDateTime && endDateTime) {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        patchPayload.start = { dateTime: startDateTime, timeZone: tz };
        patchPayload.end = { dateTime: endDateTime, timeZone: tz };
      }

      if (attendees && attendees.length > 0) {
        patchPayload.attendees = attendees.map((a: { email: string }) => ({ email: a.email }));
      }

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(patchPayload),
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }
        if (response.status === 401) {
          await db.googleCalendarToken.update({
            where: { id: calendarToken.id },
            data: { isConnected: false },
          });
          return NextResponse.json({ error: 'Calendar token expired' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Failed to update event' }, { status: 502 });
      }

      const event = await response.json();

      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'calendar_event_updated',
          details: `Updated calendar event: ${summary || eventId}`,
          resource: 'calendar',
          resourceId: eventId,
        },
      });

      return NextResponse.json({ success: true, event });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('No active Google Calendar')) {
        return NextResponse.json({ error: errorMessage }, { status: 404 });
      }
      console.error('[Calendar Event] PATCH Error:', error);
      return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
    }
  });
}

// ── DELETE: Delete an event ─────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { eventId } = await params;
      const { accessToken, calendarToken } = await getValidCalendarAccessToken(user.id);

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }
        if (response.status === 401) {
          await db.googleCalendarToken.update({
            where: { id: calendarToken.id },
            data: { isConnected: false },
          });
          return NextResponse.json({ error: 'Calendar token expired' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Failed to delete event' }, { status: 502 });
      }

      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'calendar_event_deleted',
          details: `Deleted calendar event: ${eventId}`,
          resource: 'calendar',
          resourceId: eventId,
        },
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('No active Google Calendar')) {
        return NextResponse.json({ error: errorMessage }, { status: 404 });
      }
      console.error('[Calendar Event] DELETE Error:', error);
      return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
    }
  });
}
