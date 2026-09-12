// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Check Meeting Availability API
// POST /api/meetings/check-availability — Check calendar availability
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { checkAvailability } from '@/lib/meeting-orchestration-service';

export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();

      // Validate required fields
      if (!body.start) {
        return NextResponse.json(
          { error: 'Missing required field: start (date)' },
          { status: 400 }
        );
      }
      if (!body.end) {
        return NextResponse.json(
          { error: 'Missing required field: end (date)' },
          { status: 400 }
        );
      }

      const startDate = new Date(body.start);
      const endDate = new Date(body.end);
      const durationMinutes = body.durationMinutes || 30;

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

      const slots = await checkAvailability(
        user.id,
        { start: startDate, end: endDate },
        durationMinutes
      );

      // Count available vs total
      const availableCount = slots.filter((s) => s.available).length;

      return NextResponse.json({
        slots,
        summary: {
          total: slots.length,
          available: availableCount,
          busy: slots.length - availableCount,
          dateRange: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          },
          durationMinutes,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Google Calendar is not connected')) {
        return NextResponse.json(
          { error: 'Google Calendar is not connected. Please connect your Google Calendar first.' },
          { status: 400 }
        );
      }

      console.error('[Check Availability API] POST Error:', error);
      return NextResponse.json(
        { error: 'Failed to check availability' },
        { status: 500 }
      );
    }
  });
}, 'meetings/check-availability');
