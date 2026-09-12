// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Calendar Reminders
// GET /api/calendar/reminders
// Returns upcoming calendar events that are follow-up reminders
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { getValidCalendarAccessToken } from '@/lib/google-oauth';

interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{ email: string; displayName?: string }>;
  location?: string;
  status?: string;
  htmlLink?: string;
}

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Get valid Calendar access token (refreshes if expired)
      const { accessToken, calendarToken } = await getValidCalendarAccessToken(user.id);

      const timeMin = new Date().toISOString();

      // Fetch upcoming events from Google Calendar API
      const eventsResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=50&orderBy=startTime&singleEvents=true&timeMin=${encodeURIComponent(timeMin)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!eventsResponse.ok) {
        const errorText = await eventsResponse.text();
        console.error('[Calendar Reminders] Failed to fetch events:', errorText);

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
          { error: 'Failed to fetch calendar reminders' },
          { status: 502 }
        );
      }

      const eventsData = await eventsResponse.json();
      const allEvents: CalendarEvent[] = eventsData.items || [];

      // Filter for follow-up reminder events (where summary contains "Follow-up")
      const reminderEvents = allEvents.filter((event) => {
        const summary = (event.summary || '').toLowerCase();
        return summary.includes('follow-up') || summary.includes('follow up');
      });

      // Update lastSyncAt
      await db.googleCalendarToken.update({
        where: { id: calendarToken.id },
        data: { lastSyncAt: new Date() },
      });

      return NextResponse.json({
        reminders: reminderEvents,
        total: reminderEvents.length,
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

      console.error('[Calendar Reminders] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch calendar reminders' },
        { status: 500 }
      );
    }
  });
}
