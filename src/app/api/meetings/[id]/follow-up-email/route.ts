// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Follow-Up Email Generation API
// POST /api/meetings/[id]/follow-up — Generate AI post-meeting follow-up draft
//
// Phase 5: Uses meeting-assistant with executeAICompletion + credit deduction
// Does NOT send the email — returns draft for user review.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';
import { generatePostMeetingFollowUp, type ActionItem } from '@/lib/meetings/meeting-assistant';

export const POST = withApiLogging(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return withAuth(request, async (user) => {
    try {
      const { id: meetingId } = await params;

      // Validate the meeting belongs to the authenticated user
      const meeting = await db.meeting.findFirst({
        where: { id: meetingId, userId: user.id },
        include: {
          lead: {
            select: {
              businessName: true,
              ownerName: true,
              email: true,
            },
          },
        },
      });

      if (!meeting) {
        return NextResponse.json(
          { error: 'Meeting not found or you do not have access.' },
          { status: 404 }
        );
      }

      // Parse optional action items from request body
      let bodyActionItems: ActionItem[] | undefined;
      try {
        const body = await request.json();
        if (Array.isArray(body.actionItems)) {
          bodyActionItems = body.actionItems;
        }
      } catch { /* no body or invalid JSON, use meeting's stored items */ }

      // Generate follow-up email draft using AI with credit deduction
      const result = await generatePostMeetingFollowUp(
        {
          ...meeting,
          actionItems: typeof meeting.actionItems === 'string' ? meeting.actionItems : null,
        },
        meeting.lead,
        bodyActionItems
      );

      if (!result.success) {
        const status = result.error?.includes('Insufficient credits') ? 402 : 422;
        return NextResponse.json(
          { error: result.error || 'Failed to generate follow-up email' },
          { status }
        );
      }

      return NextResponse.json({
        meetingId,
        email: result.data,
        creditsDeducted: result.creditsDeducted,
        newBalance: result.newBalance,
      });
    } catch (error) {
      console.error('[Meeting Follow-Up API] POST Error:', error);
      return NextResponse.json(
        { error: 'Failed to generate follow-up email' },
        { status: 500 }
      );
    }
  });
}, 'meetings/[id]/follow-up');
