// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Pre-Meeting Research API
// POST /api/leads/[id]/research — Generate AI pre-meeting research
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';
import { generatePreMeetingResearch } from '@/lib/ai/meeting-assistant';

export const POST = withApiLogging(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return withAuth(request, async (user) => {
    try {
      const { id: leadId } = await params;

      // Validate the lead belongs to the authenticated user
      const lead = await db.lead.findFirst({
        where: {
          id: leadId,
          userId: user.id,
        },
      });

      if (!lead) {
        return NextResponse.json(
          { error: 'Lead not found or you do not have access.' },
          { status: 404 }
        );
      }

      // Generate pre-meeting research using AI
      const research = await generatePreMeetingResearch(leadId);

      if (!research) {
        return NextResponse.json(
          { error: 'Failed to generate research. Ensure the lead has sufficient profile data.' },
          { status: 422 }
        );
      }

      return NextResponse.json({
        leadId,
        research,
      });
    } catch (error) {
      console.error('[Lead Research API] POST Error:', error);
      return NextResponse.json(
        { error: 'Failed to generate pre-meeting research' },
        { status: 500 }
      );
    }
  });
}, 'leads/[id]/research');
