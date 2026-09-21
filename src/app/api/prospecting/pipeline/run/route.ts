// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Prospecting Pipeline: start a 5-step run
// POST /api/prospecting/pipeline/run   body: { leadId }
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { startProspectPipeline } from '@/lib/prospecting/pipeline';
import { PIPELINE_CREDIT_COST } from '@/lib/prospecting/types';

export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json().catch(() => ({}));
      const leadId = typeof body?.leadId === 'string' ? body.leadId : '';
      if (!leadId) {
        return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
      }

      const result = await startProspectPipeline(user.id, leadId);
      if (!result.success) {
        const status =
          result.errorCode === 'LEAD_NOT_FOUND'
            ? 404
            : result.errorCode === 'ALREADY_RUNNING'
              ? 409
              : result.errorCode === 'INSUFFICIENT_CREDITS'
                ? 402
                : 400;
        return NextResponse.json(
          { error: result.error, errorCode: result.errorCode, creditCost: PIPELINE_CREDIT_COST },
          { status }
        );
      }

      return NextResponse.json({
        success: true,
        pipelineId: result.pipelineId,
        creditCost: PIPELINE_CREDIT_COST,
        totalSteps: 5,
      });
    } catch (err) {
      console.error('[ProspectPipeline:run] Unexpected error:', err);
      return NextResponse.json({ error: 'Failed to start pipeline' }, { status: 500 });
    }
  });
}, 'prospecting/pipeline/run');
