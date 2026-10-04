// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Duplicate Workflow API
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { duplicateWorkflow } from '@/lib/workflow-service';
import { checkPlanEntitlement } from '@/lib/entitlement-middleware';

/** POST /api/workflows/[id]/duplicate — Duplicate a workflow */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      // Entitlement check: workflow_access feature (Pro/Elite) — creating
      // copies of workflows is a plan-gated capability like creation itself.
      const entitlementCheck = await checkPlanEntitlement(user.id, user.plan, 'workflow_access');
      if (!entitlementCheck.allowed) return entitlementCheck.response!;

      const { id } = await params;
      const workflow = await duplicateWorkflow(id, user.id);

      if (!workflow) {
        return NextResponse.json(
          { error: 'Workflow not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(workflow, { status: 201 });
    } catch (error) {
      console.error('[Workflows API] Duplicate error:', error);
      return NextResponse.json(
        { error: 'Failed to duplicate workflow' },
        { status: 500 }
      );
    }
  });
}
