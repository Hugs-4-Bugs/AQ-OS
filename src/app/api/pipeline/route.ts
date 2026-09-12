// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/pipeline
// Phase 7: Get pipeline view (leads grouped by stage)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getPipelineView, getLeadsByStage } from '@/lib/pipeline-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);

      const stage = searchParams.get('stage');
      const niche = searchParams.get('niche');
      const country = searchParams.get('country');
      const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

      // If a specific stage is requested, return leads for that stage
      if (stage) {
        const result = await getLeadsByStage(user.id, stage, {
          page,
          limit,
        });

        return NextResponse.json(result);
      }

      // Otherwise return full pipeline view
      const pipelineView = await getPipelineView(user.id, {
        niche: niche || undefined,
        country: country || undefined,
      });

      return NextResponse.json(pipelineView);
    } catch (error) {
      console.error('[API /pipeline] Error:', error);
      return NextResponse.json({ error: 'Failed to get pipeline view' }, { status: 500 });
    }
  });
}
