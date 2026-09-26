// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/prospecting/research-batch
// Start an async batch deep-research job over many leads.
// Body: { leadIds: string[], depth?: 'quick'|'deep' }
// The client shows the credit estimate BEFORE calling this (Section 18).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { startBatchResearch } from '@/lib/prospecting/batch-research';
import { PIPELINE_CREDIT_COSTS, type ResearchDepth } from '@/lib/prospecting/types';

export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json().catch(() => ({}));
      const leadIds: string[] = Array.isArray(body?.leadIds)
        ? body.leadIds.filter((id: unknown): id is string => typeof id === 'string')
        : [];
      const depth: ResearchDepth = body?.depth === 'quick' ? 'quick' : 'deep';

      if (leadIds.length === 0) {
        return NextResponse.json({ error: 'leadIds array is required' }, { status: 400 });
      }

      const result = await startBatchResearch(user.id, leadIds, depth);
      if (!result.success) {
        const status = result.errorCode === 'ALREADY_RUNNING' ? 409 : 400;
        return NextResponse.json(
          { error: result.error, errorCode: result.errorCode },
          { status }
        );
      }

      return NextResponse.json({
        success: true,
        jobId: result.jobId,
        total: result.total,
        depth,
        estimatedCostPerLead: PIPELINE_CREDIT_COSTS[depth],
      });
    } catch (err) {
      console.error('[ResearchBatch:start] Unexpected error:', err);
      return NextResponse.json({ error: 'Failed to start research batch' }, { status: 500 });
    }
  });
}, 'prospecting/research-batch');
