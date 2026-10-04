// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Replay Execution From Step API
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { processExecution } from '@/lib/workflow-executor';
import { auditLog } from '@/lib/workflow-utils';

/** POST /api/workflows/executions/[executionId]/replay — Replay execution from a specific step */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { executionId } = await params;
      const body = await request.json().catch(() => ({}));
      const fromStep = body.fromStep || 0;

      const execution = await db.workflowExecution.findUnique({
        where: { id: executionId },
      });

      if (!execution) {
        return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
      }

      // Verify user owns the workflow
      const workflow = await db.workflowDefinition.findUnique({
        where: { id: execution.workflowId },
      });
      if (!workflow || workflow.userId !== user.id) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      // Delete step logs from the fromStep onwards
      const logsToDelete = await db.workflowLog.findMany({
        where: { executionId },
        orderBy: { createdAt: 'asc' },
        skip: fromStep,
      });
      if (logsToDelete.length > 0) {
        await db.workflowLog.deleteMany({
          where: { id: { in: logsToDelete.map(l => l.id) } },
        });
      }

      // Reset execution
      await db.workflowExecution.update({
        where: { id: executionId },
        data: {
          status: 'queued',
          isDeadLetter: false,
          deadLetterReason: null,
          currentStep: fromStep,
          error: null,
          retryCount: execution.retryCount + 1,
          lastRetryAt: new Date(),
        },
      });

      await auditLog(user.id, 'workflow_replayed', execution.workflowId, {
        executionId,
        fromStep,
      });

      // Process again
      processExecution(executionId).catch((err) => {
        console.error('[WorkflowReplay] Error:', err);
      });

      return NextResponse.json({ id: executionId, status: 'queued', fromStep });
    } catch (error) {
      console.error('[WorkflowReplay API] Error:', error);
      return NextResponse.json({ error: 'Failed to replay' }, { status: 500 });
    }
  });
}
