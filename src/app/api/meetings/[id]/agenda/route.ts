// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Agenda Generation API
// POST /api/meetings/[id]/agenda — Generate AI-powered meeting agenda
//
// Phase 5: Uses meeting-assistant with executeAICompletion + credit deduction
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';
import { generateAgenda } from '@/lib/meetings/meeting-assistant';

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

      // Fetch reply history (last 5 emails from lead)
      let replyHistory: string | undefined;
      if (meeting.leadId) {
        try {
          const activities = await db.leadActivity.findMany({
            where: {
              leadId: meeting.leadId,
              type: { in: ['email_sent', 'email_received', 'reply_received'] },
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
          });
          if (activities.length > 0) {
            replyHistory = activities.map(a => a.description).join('\n---\n');
          }
        } catch { /* non-blocking */ }
      }

      // Generate agenda using AI with credit deduction
      const result = await generateAgenda(meeting, meeting.lead, replyHistory);

      if (!result.success) {
        const status = result.error?.includes('Insufficient credits') ? 402 : 422;
        return NextResponse.json(
          { error: result.error || 'Failed to generate agenda' },
          { status }
        );
      }

      return NextResponse.json({
        meetingId,
        agenda: result.data,
        creditsDeducted: result.creditsDeducted,
        newBalance: result.newBalance,
      });
    } catch (error) {
      console.error('[Meeting Agenda API] POST Error:', error);
      return NextResponse.json(
        { error: 'Failed to generate meeting agenda' },
        { status: 500 }
      );
    }
  });
}, 'meetings/[id]/agenda');
