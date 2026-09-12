// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Resume API Route
// Phase 12: Resume a paused execution
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { resumeExecution } from '@/lib/workflow-engine';
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

      const result = await resumeExecution(executionId, user.id);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({ success: true, status: 'running' });
    } catch (error) {
      console.error('[WorkflowResumeAPI] POST error:', error);
      return NextResponse.json(
        { error: 'Failed to resume execution' },
        { status: 500 }
      );
    }
  });
}
