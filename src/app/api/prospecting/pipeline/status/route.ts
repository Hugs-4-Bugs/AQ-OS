// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Prospecting Pipeline: live status for polling
// GET /api/prospecting/pipeline/status?leadId=<id>
// Returns the latest pipeline state for the lead (null when never run).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { getLatestPipelineForLead } from '@/lib/prospecting/pipeline';

export const GET = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const leadId = request.nextUrl.searchParams.get('leadId');
      if (!leadId) {
        return NextResponse.json({ error: 'leadId query parameter is required' }, { status: 400 });
      }

      const state = await getLatestPipelineForLead(leadId, user.id);
      return NextResponse.json({ pipeline: state });
    } catch (err) {
      console.error('[ProspectPipeline:status] Unexpected error:', err);
      return NextResponse.json({ error: 'Failed to load pipeline status' }, { status: 500 });
    }
  });
}, 'prospecting/pipeline/status');
