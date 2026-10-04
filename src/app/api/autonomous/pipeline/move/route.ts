// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autonomous Pipeline Move API
// POST: Auto-move lead pipeline stage
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { autoMovePipelineStage, type PipelineTrigger } from '@/lib/autonomous-outreach-engine';

const VALID_TRIGGERS: PipelineTrigger[] = [
  'email_sent',
  'email_opened',
  'email_replied',
  'reply_classified',
  'meeting_booked',
  'proposal_sent',
];

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { leadId, trigger } = body;

      // Validate leadId
      if (!leadId || typeof leadId !== 'string') {
        return NextResponse.json(
          { error: 'Missing required field: leadId' },
          { status: 400 }
        );
      }

      // Validate trigger
      if (!trigger || !VALID_TRIGGERS.includes(trigger)) {
        return NextResponse.json(
          {
            error: `Invalid trigger. Must be one of: ${VALID_TRIGGERS.join(', ')}`,
          },
          { status: 400 }
        );
      }

      // Execute pipeline stage move
      const result = await autoMovePipelineStage(leadId, user.id, trigger);

      if (!result.moved) {
        return NextResponse.json({
          success: false,
          moved: false,
          fromStage: result.fromStage,
          toStage: result.toStage,
          reason: result.reason || 'No stage change needed',
          trigger,
          leadId,
        });
      }

      return NextResponse.json({
        success: true,
        moved: true,
        fromStage: result.fromStage,
        toStage: result.toStage,
        trigger,
        leadId,
      });
    } catch (error) {
      console.error('[PipelineMoveAPI] POST error:', error);
      return NextResponse.json(
        { error: 'Failed to move pipeline stage' },
        { status: 500 }
      );
    }
  });
}
