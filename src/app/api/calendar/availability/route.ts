// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Calendar Availability
// POST /api/calendar/availability — Check free/busy slots
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getValidCalendarAccessToken } from '@/lib/google-oauth';
import { db } from '@/lib/db';

interface AvailabilityRequest {
  date: string; // ISO date, e.g. "2026-05-30"
  durationMinutes: number; // Required meeting duration
  startHour?: number; // Search window start (default 9)
  endHour?: number; // Search window end (default 18)
}

interface TimeSlot {
  start: string; // ISO 8601
  end: string;
  available: boolean;
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body: AvailabilityRequest = await request.json();
      const { date, durationMinutes, startHour = 9, endHour = 18 } = body;

      if (!date || !durationMinutes) {
        return NextResponse.json(
          { error: 'Missing required fields: date, durationMinutes' },
          { status: 400 }
        );
      }

      const durationMs = durationMinutes * 60 * 1000;
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
      }

      // Get valid access token
      const { accessToken, calendarToken } = await getValidCalendarAccessToken(user.id);

      // Query free/busy for the specified date
      const timeMin = new Date(dateObj);
      timeMin.setHours(startHour, 0, 0, 0);
      const timeMax = new Date(dateObj);
      timeMax.setHours(endHour, 0, 0, 0);

      const fbResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/freeBusy?key=${process.env.GOOGLE_API_KEY || ''}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            items: [{ id: 'primary' }],
          }),
        }
      );

      if (!fbResponse.ok) {
        if (fbResponse.status === 401) {
          await db.googleCalendarToken.update({
            where: { id: calendarToken.id },
            data: { isConnected: false },
          });
          return NextResponse.json(
            { error: 'Calendar token expired. Please reconnect.' },
            { status: 401 }
          );
        }
        return NextResponse.json({ error: 'Failed to check availability' }, { status: 502 });
      }

      const fbData = await fbResponse.json();
      const busyPeriods = fbData.calendars?.primary?.busy || [];

      // Generate available slots
      const slots: TimeSlot[] = [];
      const slotIntervalMinutes = 30; // 30-minute intervals

      const currentSlot = new Date(timeMin);
      while (currentSlot.getTime() + durationMs <= timeMax.getTime()) {
        const slotEnd = new Date(currentSlot.getTime() + durationMs);

        const isAvailable = !busyPeriods.some((busy: { start: string; end: string }) => {
          const busyStart = new Date(busy.start);
          const busyEnd = new Date(busy.end);
          return currentSlot.getTime() < busyEnd.getTime() && slotEnd.getTime() > busyStart.getTime();
        });

        slots.push({
          start: currentSlot.toISOString(),
          end: slotEnd.toISOString(),
          available: isAvailable,
        });

        currentSlot.setTime(currentSlot.getTime() + slotIntervalMinutes * 60 * 1000);
      }

      // Update last sync
      await db.googleCalendarToken.update({
        where: { id: calendarToken.id },
        data: { lastSyncedAt: new Date() },
      });

      const availableSlots = slots.filter((s) => s.available);

      return NextResponse.json({
        date,
        busyPeriods,
        availableSlots,
        totalSlots: slots.length,
        availableCount: availableSlots.length,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('No active Google Calendar')) {
        return NextResponse.json({ error: errorMessage }, { status: 404 });
      }
      console.error('[Calendar Availability] Error:', error);
      return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 });
    }
  });
}
