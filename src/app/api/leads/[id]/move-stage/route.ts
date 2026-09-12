// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/leads/[id]/move-stage
// Phase 7: Move lead to different pipeline stage
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { moveLeadToStage } from '@/lib/pipeline-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      const body = await request.json();
      const { stage } = body;

      if (!stage || typeof stage !== 'string') {
        return NextResponse.json({ error: 'stage is required' }, { status: 400 });
      }

      const result = await moveLeadToStage(id, stage.trim(), user.id);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        leadId: result.leadId,
        fromStage: result.fromStage,
        toStage: result.toStage,
      });
    } catch (error) {
      console.error('[API /leads/[id]/move-stage] Error:', error);
      return NextResponse.json({ error: 'Failed to move lead stage' }, { status: 500 });
    }
  });
}
