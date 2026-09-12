// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meetings API
// GET  /api/meetings — List user's meetings with filters
// POST /api/meetings — Create a new meeting (with Google Meet link)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { getUserMeetings, createGoogleMeetMeeting } from '@/lib/meeting-orchestration-service';

// ── GET: List user's meetings ─────────────────────────────────────

export const GET = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);

      const filters: {
        status?: string;
        startDate?: string;
        endDate?: string;
        leadId?: string;
      } = {};

      const status = searchParams.get('status');
      if (status) filters.status = status;

      const startDate = searchParams.get('startDate');
      if (startDate) filters.startDate = startDate;

      const endDate = searchParams.get('endDate');
      if (endDate) filters.endDate = endDate;

      const leadId = searchParams.get('leadId');
      if (leadId) filters.leadId = leadId;

      const meetings = await getUserMeetings(user.id, filters);

      return NextResponse.json({ meetings });
    } catch (error) {
      console.error('[Meetings API] GET Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch meetings' },
        { status: 500 }
      );
    }
  });
}, 'meetings');

// ── POST: Create a new meeting ────────────────────────────────────

export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();

      // Validate required fields
      if (!body.title) {
        return NextResponse.json(
          { error: 'Missing required field: title' },
          { status: 400 }
        );
      }
      if (!body.startDateTime) {
        return NextResponse.json(
          { error: 'Missing required field: startDateTime' },
          { status: 400 }
        );
      }
      if (!body.endDateTime) {
        return NextResponse.json(
          { error: 'Missing required field: endDateTime' },
          { status: 400 }
        );
      }

      const meeting = await createGoogleMeetMeeting(user.id, {
        title: body.title,
        description: body.description,
        meetingType: body.meetingType || 'video',
        platform: body.platform || 'google_meet',
        startDateTime: body.startDateTime,
        endDateTime: body.endDateTime,
        durationMinutes: body.durationMinutes,
        timezone: body.timezone,
        agenda: body.agenda,
        attendees: body.attendees,
        location: body.location,
        leadId: body.leadId,
        dealId: body.dealId,
        createdBy: body.createdBy || 'user',
        reminders: body.reminders,
      });

      return NextResponse.json({ meeting }, { status: 201 });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Google Calendar is not connected')) {
        return NextResponse.json(
          { error: 'Google Calendar is not connected. Please connect your Google Calendar to create Google Meet meetings.' },
          { status: 400 }
        );
      }

      if (errorMessage.includes('Invalid date format')) {
        return NextResponse.json(
          { error: errorMessage },
          { status: 400 }
        );
      }

      if (errorMessage.includes('End date must be after')) {
        return NextResponse.json(
          { error: errorMessage },
          { status: 400 }
        );
      }

      if (errorMessage.includes('Cannot schedule meetings in the past')) {
        return NextResponse.json(
          { error: errorMessage },
          { status: 400 }
        );
      }

      // FIX (2026-09-09): Real-time Google Calendar availability conflict —
      // the requested time overlaps an existing calendar event.
      if (errorMessage.includes('TIME_SLOT_UNAVAILABLE')) {
        return NextResponse.json(
          {
            error: 'That time slot is not available in your Google Calendar — it conflicts with an existing event. Please choose a different time.',
            code: 'TIME_SLOT_UNAVAILABLE',
          },
          { status: 409 }
        );
      }

      console.error('[Meetings API] POST Error:', error);
      return NextResponse.json(
        { error: 'Failed to create meeting' },
        { status: 500 }
      );
    }
  });
}, 'meetings');
