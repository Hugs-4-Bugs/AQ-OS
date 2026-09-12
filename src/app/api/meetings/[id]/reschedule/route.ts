// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Reschedule API
// POST /api/meetings/[id]/reschedule — Reschedule a meeting
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { rescheduleMeeting } from '@/lib/meeting-orchestration-service';

export const POST = withApiLogging(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return withAuth(request, async (user) => {
    try {
      const { id: meetingId } = await params;
      const body = await request.json();

      // Validate required fields
      if (!body.newStartDateTime) {
        return NextResponse.json(
          { error: 'Missing required field: newStartDateTime' },
          { status: 400 }
        );
      }
      if (!body.newEndDateTime) {
        return NextResponse.json(
          { error: 'Missing required field: newEndDateTime' },
          { status: 400 }
        );
      }

      const result = await rescheduleMeeting(
        user.id,
        meetingId,
        body.newStartDateTime,
        body.newEndDateTime,
        body.reason
      );

      return NextResponse.json(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Meeting not found')) {
        return NextResponse.json(
          { error: errorMessage },
          { status: 404 }
        );
      }

      if (errorMessage.includes('Invalid date format') || errorMessage.includes('End date must be after') || errorMessage.includes('Cannot schedule meetings in the past')) {
        return NextResponse.json(
          { error: errorMessage },
          { status: 400 }
        );
      }

      if (errorMessage.includes('Cannot reschedule a cancelled')) {
        return NextResponse.json(
          { error: errorMessage },
          { status: 400 }
        );
      }

      console.error('[Meeting Reschedule API] Error:', error);
      return NextResponse.json(
        { error: 'Failed to reschedule meeting' },
        { status: 500 }
      );
    }
  });
}, 'meetings/[id]/reschedule');
