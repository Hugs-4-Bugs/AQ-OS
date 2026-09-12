// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Execute API Route
// Phase 12: Execute a workflow (returns 202 with executionId)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { executeWorkflow } from '@/lib/workflow-engine';
import { db } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const body = await request.json().catch(() => ({}));

      // Verify ownership
      const workflow = await db.workflowDefinition.findFirst({
        where: { id, userId: user.id },
      });

      if (!workflow) {
        return NextResponse.json(
          { error: 'Workflow not found' },
          { status: 404 }
        );
      }

      // Subscription-retention gate (3-layer defense: UI disabled → API 400 → execute 403)
      // A workflow flagged disabledBySubscription cannot be executed until the
      // user renews their subscription (which auto-resumes the workflow).
      if (workflow.disabledBySubscription) {
        return NextResponse.json(
          {
            success: false,
            error: 'Workflow execution blocked — subscription is paused. Please renew your subscription.',
            code: 'SUBSCRIPTION_PAUSED',
          },
          { status: 403 }
        );
      }

      // Execute the workflow
      const result = await executeWorkflow(
        id,
        user.id,
        body.triggerData || body,
        body.idempotencyKey
      );

      if (result.status === 'failed' && !result.executionId) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      // Return 202 Accepted with execution ID
      return NextResponse.json(
        {
          executionId: result.executionId,
          status: result.status,
          error: result.error,
        },
        { status: 202 }
      );
    } catch (error) {
      console.error('[WorkflowExecuteAPI] POST error:', error);
      return NextResponse.json(
        { error: 'Failed to execute workflow' },
        { status: 500 }
      );
    }
  });
}
