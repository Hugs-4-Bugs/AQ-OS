// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Preparation API
// POST /api/meetings/[id]/prep — Generate AI-powered meeting prep briefing
//
// Phase 5: Uses meeting-assistant with executeAICompletion + credit deduction
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';
import { generateMeetingPrep } from '@/lib/meetings/meeting-assistant';

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
              website: true,
              niche: true,
              city: true,
              country: true,
              stage: true,
              replyScore: true,
              conversionScore: true,
              urgencyScore: true,
              revenuePotentialScore: true,
              tags: true,
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

      // Generate meeting prep using AI with credit deduction
      const result = await generateMeetingPrep(meeting, meeting.lead);

      if (!result.success) {
        const status = result.error?.includes('Insufficient credits') ? 402 : 422;
        return NextResponse.json(
          { error: result.error || 'Failed to generate meeting prep' },
          { status }
        );
      }

      return NextResponse.json({
        meetingId,
        prep: result.data,
        creditsDeducted: result.creditsDeducted,
        newBalance: result.newBalance,
      });
    } catch (error) {
      console.error('[Meeting Prep API] POST Error:', error);
      return NextResponse.json(
        { error: 'Failed to generate meeting preparation' },
        { status: 500 }
      );
    }
  });
}, 'meetings/[id]/prep');
