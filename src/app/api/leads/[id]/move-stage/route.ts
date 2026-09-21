// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/leads/[id]/move-stage
// Phase 7: Move lead to different pipeline stage
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { canUserAccessLead } from '@/lib/lead-resolution';
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

      // ACCOUNT ISOLATION: pipeline-service's moveLeadToStage does not
      // verify ownership itself — enforce the owner / same non-null org
      // rule here before mutating another tenant's pipeline state.
      const lead = await db.lead.findUnique({
        where: { id },
        select: { id: true, userId: true, orgId: true },
      });
      if (!lead) {
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      }
      if (!canUserAccessLead(lead, user)) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
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
