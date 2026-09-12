// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Suggest Meeting Slots API
// POST /api/meetings/suggest-slots — Get AI-suggested meeting times
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { suggestMeetingSlots } from '@/lib/meeting-orchestration-service';

export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json().catch(() => ({}));

      const leadId = body.leadId || undefined;
      const durationMinutes = body.durationMinutes || undefined;

      const suggestedSlots = await suggestMeetingSlots(
        user.id,
        leadId,
        durationMinutes
      );

      return NextResponse.json({
        suggestedSlots,
        count: suggestedSlots.length,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Google Calendar is not connected')) {
        return NextResponse.json(
          { error: 'Google Calendar is not connected. Please connect your Google Calendar first.' },
          { status: 400 }
        );
      }

      console.error('[Suggest Slots API] POST Error:', error);
      return NextResponse.json(
        { error: 'Failed to suggest meeting slots' },
        { status: 500 }
      );
    }
  });
}, 'meetings/suggest-slots');
