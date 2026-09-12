// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Sentiment Analysis API
// POST /api/meetings/[id]/sentiment — Analyze meeting sentiment with AI
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';
import { analyzeMeetingSentiment } from '@/lib/ai/meeting-assistant';

export const POST = withApiLogging(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return withAuth(request, async (user) => {
    try {
      const { id: meetingId } = await params;

      // Validate the meeting belongs to the authenticated user
      const meeting = await db.meeting.findFirst({
        where: {
          id: meetingId,
          userId: user.id,
        },
      });

      if (!meeting) {
        return NextResponse.json(
          { error: 'Meeting not found or you do not have access.' },
          { status: 404 }
        );
      }

      // Analyze sentiment using AI
      const sentiment = await analyzeMeetingSentiment(meetingId);

      if (!sentiment) {
        return NextResponse.json(
          { error: 'Failed to analyze sentiment. Ensure the meeting has sufficient notes or description content.' },
          { status: 422 }
        );
      }

      return NextResponse.json({
        meetingId,
        sentiment,
      });
    } catch (error) {
      console.error('[Meeting Sentiment API] POST Error:', error);
      return NextResponse.json(
        { error: 'Failed to analyze meeting sentiment' },
        { status: 500 }
      );
    }
  });
}, 'meetings/[id]/sentiment');
