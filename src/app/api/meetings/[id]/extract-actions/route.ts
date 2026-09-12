// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Action Items Extraction API
// POST /api/meetings/[id]/extract-actions — Extract action items from transcript
//
// Phase 5: Uses meeting-assistant with executeAICompletion + credit deduction
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';
import { extractActionItems } from '@/lib/meetings/meeting-assistant';

export const POST = withApiLogging(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return withAuth(request, async (user) => {
    try {
      const { id: meetingId } = await params;

      // Validate the meeting belongs to the authenticated user
      const meeting = await db.meeting.findFirst({
        where: { id: meetingId, userId: user.id },
      });

      if (!meeting) {
        return NextResponse.json(
          { error: 'Meeting not found or you do not have access.' },
          { status: 404 }
        );
      }

      // Get transcript from request body
      const body = await request.json();
      const transcript: string = body.transcript || body.notes || meeting.notes || meeting.description || '';

      if (!transcript || transcript.trim().length < 20) {
        return NextResponse.json(
          { error: 'Transcript is required and must be at least 20 characters. Provide it in the body as { "transcript": "..." }' },
          { status: 400 }
        );
      }

      // Extract action items using AI with credit deduction
      const result = await extractActionItems(meetingId, transcript, user.id);

      if (!result.success) {
        const status = result.error?.includes('Insufficient credits') ? 402 : 422;
        return NextResponse.json(
          { error: result.error || 'Failed to extract action items' },
          { status }
        );
      }

      return NextResponse.json({
        meetingId,
        actionItems: result.data,
        creditsDeducted: result.creditsDeducted,
        newBalance: result.newBalance,
      });
    } catch (error) {
      console.error('[Meeting Extract Actions API] POST Error:', error);
      return NextResponse.json(
        { error: 'Failed to extract action items' },
        { status: 500 }
      );
    }
  });
}, 'meetings/[id]/extract-actions');
