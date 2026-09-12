// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting by ID API
// GET    /api/meetings/[id] — Get meeting by ID
// PUT    /api/meetings/[id] — Update meeting
// DELETE /api/meetings/[id] — Cancel meeting
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { getMeetingById, updateMeeting, cancelMeeting } from '@/lib/meeting-orchestration-service';

// ── GET: Get meeting by ID ────────────────────────────────────────

export const GET = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const id = request.nextUrl.pathname.split('/').at(-1);

      if (!id) {
        return NextResponse.json(
          { error: 'Meeting ID is required' },
          { status: 400 }
        );
      }

      const meeting = await getMeetingById(user.id, id);

      if (!meeting) {
        return NextResponse.json(
          { error: 'Meeting not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ meeting });
    } catch (error) {
      console.error('[Meeting API] GET Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch meeting' },
        { status: 500 }
      );
    }
  });
}, 'meetings/[id]');

// ── PUT: Update meeting ───────────────────────────────────────────

export const PUT = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const id = request.nextUrl.pathname.split('/').at(-1);

      if (!id) {
        return NextResponse.json(
          { error: 'Meeting ID is required' },
          { status: 400 }
        );
      }

      const body = await request.json();

      const meeting = await updateMeeting(user.id, id, {
        title: body.title,
        description: body.description,
        meetingType: body.meetingType,
        startDateTime: body.startDateTime,
        endDateTime: body.endDateTime,
        durationMinutes: body.durationMinutes,
        timezone: body.timezone,
        agenda: body.agenda,
        attendees: body.attendees,
        location: body.location,
        status: body.status,
        notes: body.notes,
        followUpActions: body.followUpActions,
        recordingUrl: body.recordingUrl,
      });

      return NextResponse.json({ meeting });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Meeting not found')) {
        return NextResponse.json(
          { error: errorMessage },
          { status: 404 }
        );
      }

      console.error('[Meeting API] PUT Error:', error);
      return NextResponse.json(
        { error: 'Failed to update meeting' },
        { status: 500 }
      );
    }
  });
}, 'meetings/[id]');

// ── DELETE: Cancel meeting ────────────────────────────────────────

export const DELETE = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const id = request.nextUrl.pathname.split('/').at(-1);

      if (!id) {
        return NextResponse.json(
          { error: 'Meeting ID is required' },
          { status: 400 }
        );
      }

      const { searchParams } = new URL(request.url);
      const reason = searchParams.get('reason') || undefined;

      const meeting = await cancelMeeting(user.id, id, reason);

      return NextResponse.json({ meeting });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Meeting not found')) {
        return NextResponse.json(
          { error: errorMessage },
          { status: 404 }
        );
      }

      if (errorMessage.includes('already cancelled')) {
        return NextResponse.json(
          { error: errorMessage },
          { status: 400 }
        );
      }

      console.error('[Meeting API] DELETE Error:', error);
      return NextResponse.json(
        { error: 'Failed to cancel meeting' },
        { status: 500 }
      );
    }
  });
}, 'meetings/[id]');
