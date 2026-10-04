// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Pause API Route
// Phase 12: Pause a running execution
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { pauseExecution } from '@/lib/workflow-engine';
import { db } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const body = await request.json().catch(() => ({}));
      const executionId = body.executionId || id;

      // Verify ownership via execution
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

      const result = await pauseExecution(executionId, user.id);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({ success: true, status: 'paused' });
    } catch (error) {
      console.error('[WorkflowPauseAPI] POST error:', error);
      return NextResponse.json(
        { error: 'Failed to pause execution' },
        { status: 500 }
      );
    }
  });
}
