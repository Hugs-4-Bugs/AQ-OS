// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Dead Letter Queue
// DLQ listing, retry, and purge operations
// Only imported by DLQ routes
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { auditLog } from '@/lib/workflow-utils';

// NOTE: processExecution is NOT imported here to avoid pulling the heavy
// executor module into routes that only need DLQ listing/purge.
// The retry route must import processExecution from workflow-executor directly
// and call it after retryDeadLetter().

/** List dead letter executions */
export async function listDeadLetter(
  userId: string,
  filters?: { page?: number; limit?: number }
) {
  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  const userWorkflows = await db.workflowDefinition.findMany({
    where: { userId },
    select: { id: true },
  });
  const userWorkflowIds = userWorkflows.map((w) => w.id);

  const [executions, total] = await Promise.all([
    db.workflowExecution.findMany({
      where: {
        isDeadLetter: true,
        workflowId: { in: userWorkflowIds },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.workflowExecution.count({
      where: {
        isDeadLetter: true,
        workflowId: { in: userWorkflowIds },
      },
    }),
  ]);

  return { executions, total, page, limit };
}

/** Retry a dead letter execution */
export async function retryDeadLetter(executionId: string, userId: string) {
  const execution = await db.workflowExecution.findUnique({
    where: { id: executionId },
  });

  if (!execution) throw new Error('Execution not found');
  if (!execution.isDeadLetter) throw new Error('Execution is not in dead letter queue');

  await db.workflowExecution.update({
    where: { id: executionId },
    data: {
      status: 'queued',
      isDeadLetter: false,
      deadLetterReason: null,
      currentStep: 0,
      error: null,
      retryCount: execution.retryCount + 1,
      lastRetryAt: new Date(),
    },
  });

  // Clear old step logs
  await db.workflowLog.deleteMany({ where: { executionId } });

  await auditLog(userId, 'workflow_retried', execution.workflowId, {
    executionId,
    fromDeadLetter: true,
  });

  // NOTE: The caller (API route) must call processExecution() from
  // workflow-executor after this function returns, to actually re-run
  // the execution. This separation avoids pulling the heavy executor
  // module into routes that only need listing/purge.

  return { id: executionId, status: 'queued' };
}

/** Purge all dead letter executions for a user */
export async function purgeDeadLetter(userId: string) {
  const userWorkflows = await db.workflowDefinition.findMany({
    where: { userId },
    select: { id: true },
  });
  const userWorkflowIds = userWorkflows.map((w) => w.id);

  // Delete step logs first (cascade)
  const deadExecutions = await db.workflowExecution.findMany({
    where: {
      isDeadLetter: true,
      workflowId: { in: userWorkflowIds },
    },
    select: { id: true },
  });

  const deadIds = deadExecutions.map((e) => e.id);

  if (deadIds.length > 0) {
    await db.workflowLog.deleteMany({
      where: { executionId: { in: deadIds } },
    });
    await db.workflowExecution.deleteMany({
      where: { id: { in: deadIds } },
    });
  }

  await auditLog(userId, 'workflow_dead_letter_purged', 'dead_letter', {
    count: deadIds.length,
  });

  return { purged: deadIds.length };
}
