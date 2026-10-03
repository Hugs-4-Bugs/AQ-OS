// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Cancel API Route
// Phase 12: Cancel a running/paused execution
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { cancelExecution } from '@/lib/workflow-engine';
import { db } from '@/lib/db';
import { checkPlanEntitlement } from '@/lib/entitlement-middleware';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    const gate = await checkPlanEntitlement(user.id, user.plan, 'workflow_access');
    if (!gate.allowed) return gate.response!;
    try {
      const { id } = await params;
      const body = await request.json().catch(() => ({}));
      const executionId = body.executionId || id;

      // Verify ownership
      const execution = await db.workflowExecution.findFirst({
        where: { id: executionId },
        include: { workflow: { select: { userId: true } } },
      });

      if (!execution || execution.workflow.userId !== user.id) {
        return NextResponse.json(
          { error: 'Execution not found' },
          { status: 404 }
        );
      }

      const result = await cancelExecution(executionId, user.id);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({ success: true, status: 'cancelled' });
    } catch (error) {
      console.error('[WorkflowCancelAPI] POST error:', error);
      return NextResponse.json(
        { error: 'Failed to cancel execution' },
        { status: 500 }
      );
    }
  });
}
