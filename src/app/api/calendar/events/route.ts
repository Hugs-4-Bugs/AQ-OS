// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Google Calendar Events
// GET /api/calendar/events — List upcoming calendar events
// POST /api/calendar/events — Create a new calendar event with Google Meet link
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';
import { getValidCalendarAccessToken } from '@/lib/google-oauth';
import { randomUUID } from 'crypto';

// ── GET: List upcoming calendar events ────────────────────────────

export const GET = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      // Get valid Calendar access token (refreshes if expired)
      const { accessToken, calendarToken } = await getValidCalendarAccessToken(user.id);

      const timeMin = new Date().toISOString();

      // Fetch upcoming events from Google Calendar API
      const eventsResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=25&orderBy=startTime&singleEvents=true&timeMin=${encodeURIComponent(timeMin)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!eventsResponse.ok) {
        const errorText = await eventsResponse.text();
        console.error('[Calendar Events] Failed to fetch events:', errorText);

        if (eventsResponse.status === 401) {
          await db.googleCalendarToken.update({
            where: { id: calendarToken.id },
            data: { status: 'expired' },
          });
          return NextResponse.json(
            { error: 'Calendar token expired. Please reconnect your Google Calendar.' },
            { status: 401 }
          );
        }

        return NextResponse.json(
          { error: 'Failed to fetch calendar events' },
          { status: 502 }
        );
      }

      const eventsData = await eventsResponse.json();

      // Update lastSyncAt
      await db.googleCalendarToken.update({
        where: { id: calendarToken.id },
        data: { lastSyncAt: new Date() },
      });

      return NextResponse.json({
        events: eventsData.items || [],
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('No active Google Calendar')) {
        return NextResponse.json(
          { error: 'No active Google Calendar connection found. Please connect your Google Calendar first.' },
          { status: 404 }
        );
      }

      if (errorMessage.includes('Token refresh failed')) {
        return NextResponse.json(
          { error: 'Calendar token expired and refresh failed. Please reconnect your Google Calendar.' },
          { status: 401 }
        );
      }

      console.error('[Calendar Events] GET Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch calendar events' },
        { status: 500 }
      );
    }
  });
}, 'calendar/events');

// ── POST: Create a new calendar event with Google Meet link ────────

interface CreateEventBody {
  summary: string;
  description?: string;
  startDateTime: string; // ISO 8601
  endDateTime: string;   // ISO 8601
  attendees?: Array<{ email: string; name?: string }>;
  leadId?: string;
  dealId?: string;
  timezone?: string;
}

export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body: CreateEventBody = await request.json();
      const { summary, description, startDateTime, endDateTime, attendees, leadId, dealId } = body;

      // Validate required fields
      if (!summary || !startDateTime || !endDateTime) {
        return NextResponse.json(
          { error: 'Missing required fields: summary, startDateTime, endDateTime' },
          { status: 400 }
        );
      }

      // Validate date formats
      const startDate = new Date(startDateTime);
      const endDate = new Date(endDateTime);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format. Use ISO 8601 format.' },
          { status: 400 }
        );
      }

      if (startDate >= endDate) {
        return NextResponse.json(
          { error: 'End date must be after start date.' },
          { status: 400 }
        );
      }

      // Get stored timezone from UserSettings, fallback to Intl
      let timezone = body.timezone;
      if (!timezone) {
        try {
          const settings = await db.userSettings.findUnique({
            where: { userId: user.id },
            select: { meetingTimezone: true },
          });
          timezone = settings?.meetingTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        } catch {
          timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        }
      }

      // Get valid Calendar access token (refreshes if expired)
      const { accessToken, calendarToken } = await getValidCalendarAccessToken(user.id);

      // Build event payload with conferenceData for Google Meet link generation
      const requestId = `acqos-${randomUUID()}`;
      const eventPayload: Record<string, unknown> = {
        summary,
        description: description || '',
        start: {
          dateTime: startDateTime,
          timeZone: timezone,
        },
        end: {
          dateTime: endDateTime,
          timeZone: timezone,
        },
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: {
              type: 'hangoutsMeet',
            },
          },
        },
      };

      if (attendees && attendees.length > 0) {
        eventPayload.attendees = attendees.map((a) => ({
          email: a.email,
          displayName: a.name || undefined,
        }));
      }

      // Create event via Google Calendar API with conferenceDataVersion=1
      // This is required for Google Meet link generation
      const createResponse = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(eventPayload),
        }
      );

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error('[Calendar Events] Failed to create event:', errorText);

        if (createResponse.status === 401) {
          await db.googleCalendarToken.update({
            where: { id: calendarToken.id },
            data: { status: 'expired' },
          });
          return NextResponse.json(
            { error: 'Calendar token expired. Please reconnect your Google Calendar.' },
            { status: 401 }
          );
        }

        return NextResponse.json(
          { error: 'Failed to create calendar event' },
          { status: 502 }
        );
      }

      const event = await createResponse.json();

      // Extract Google Meet link from the response
      let googleMeetLink = event.hangoutLink || '';

      // Also try conferenceData.entryPoints as fallback
      if (!googleMeetLink && event.conferenceData?.entryPoints) {
        const videoEntry = event.conferenceData.entryPoints.find(
          (ep: { entryPointType: string; uri: string }) => ep.entryPointType === 'video'
        );
        googleMeetLink = videoEntry?.uri || '';
      }

      const googleCalendarEventId = event.id || '';

      // Calculate duration
      const durationMs = endDate.getTime() - startDate.getTime();
      const durationMinutes = Math.round(durationMs / 60000);

      // Create or update a Meeting record with the Google Calendar event data
      const meeting = await db.meeting.create({
        data: {
          userId: user.id,
          leadId: leadId || null,
          dealId: dealId || null,
          title: summary,
          description: description || null,
          meetingType: 'video',
          platform: 'google_meet',
          meetingUrl: googleMeetLink || null,
          calendarEventId: googleCalendarEventId,
          status: 'scheduled',
          startDateTime: startDate,
          endDateTime: endDate,
          durationMinutes,
          timezone,
          attendees: JSON.stringify(
            (attendees || []).map((a) => ({
              email: a.email,
              name: a.name || null,
              status: 'pending',
            }))
          ),
          conferenceData: event.conferenceData
            ? JSON.stringify(event.conferenceData)
            : null,
          createdBy: 'user',
          approvalStatus: 'approved',
        },
      });

      // Create LeadActivity if linked to a lead
      if (leadId) {
        try {
          await db.leadActivity.create({
            data: {
              leadId,
              type: 'meeting_scheduled',
              description: `Meeting "${summary}" scheduled for ${startDate.toLocaleString()}`,
              metadata: JSON.stringify({
                meetingId: meeting.id,
                meetingUrl: googleMeetLink,
                calendarEventId: googleCalendarEventId,
                platform: 'google_meet',
              }),
            },
          });
        } catch (activityError) {
          console.warn('[Calendar Events] Failed to create lead activity:', activityError);
        }
      }

      // Create audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'calendar_event_created',
          details: `Created calendar event: "${summary}" with Meet link: ${googleMeetLink || 'pending'}`,
          resource: 'calendar',
          resourceId: googleCalendarEventId,
        },
      });

      console.log('[Calendar Events] Event created:', googleCalendarEventId, 'summary:', summary, 'meetLink:', googleMeetLink || 'pending');

      return NextResponse.json({
        success: true,
        event,
        meetingId: meeting.id,
        googleMeetLink,
        googleCalendarEventId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('No active Google Calendar')) {
        return NextResponse.json(
          { error: 'No active Google Calendar connection found. Please connect your Google Calendar first.' },
          { status: 404 }
        );
      }

      if (errorMessage.includes('Token refresh failed')) {
        return NextResponse.json(
          { error: 'Calendar token expired and refresh failed. Please reconnect your Google Calendar.' },
          { status: 401 }
        );
      }

      console.error('[Calendar Events] POST Error:', error);
      return NextResponse.json(
        { error: 'Failed to create calendar event' },
        { status: 500 }
      );
    }
  });
}, 'calendar/events');
