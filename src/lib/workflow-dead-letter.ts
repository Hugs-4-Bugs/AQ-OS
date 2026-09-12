// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Dead Letter Queue
// Phase 12: Handle failed executions that exceed max retries
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logWorkflowEvent } from '@/lib/workflow-audit';

// ===== SEND TO DEAD LETTER =====

/**
 * Move an execution to the dead letter queue.
 * Sets deadLettered=true and records the reason.
 */
export async function sendToDeadLetter(
  executionId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const execution = await db.workflowExecution.findUnique({
      where: { id: executionId },
      include: { workflow: { select: { userId: true, name: true } } },
    });

    if (!execution) {
      return { success: false, error: 'Execution not found' };
    }

    await db.workflowExecution.update({
      where: { id: executionId },
      data: {
        deadLettered: true,
        deadLetterReason: reason,
        status: 'failed',
        completedAt: new Date(),
      },
    });

    // Audit log
    await logWorkflowEvent(execution.workflow.userId, 'workflow_dead_lettered', {
      executionId,
      workflowId: execution.workflowId,
      workflowName: execution.workflow.name,
      reason,
    });

    return { success: true };
  } catch (error) {
    console.error('[WorkflowDLQ] Failed to send to dead letter:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send to dead letter queue',
    };
  }
}

// ===== GET DEAD LETTER QUEUE =====

export async function getDeadLetterQueue(
  userId: string,
  filters?: {
    workflowId?: string;
    reason?: string;
    page?: number;
    limit?: number;
  }
): Promise<{ items: Record<string, unknown>[]; total: number; page: number; totalPages: number }> {
  try {
    const page = filters?.page || 1;
    const limit = Math.min(filters?.limit || 20, 100);
    const offset = (page - 1) * limit;

    const where: Record<string, unknown> = {
      deadLettered: true,
      workflow: { userId },
    };

    if (filters?.workflowId) where.workflowId = filters.workflowId;
    if (filters?.reason) where.deadLetterReason = { contains: filters.reason };

    const [items, total] = await Promise.all([
      db.workflowExecution.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          workflow: { select: { name: true, triggerType: true } },
        },
      }),
      db.workflowExecution.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        workflowId: item.workflowId,
        workflowName: item.workflow.name,
        triggerType: item.workflow.triggerType,
        status: item.status,
        deadLetterReason: item.deadLetterReason,
        retryCount: item.retryCount,
        maxRetries: item.maxRetries,
        startedAt: item.startedAt,
        completedAt: item.completedAt,
        error: item.error,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  } catch (error) {
    console.error('[WorkflowDLQ] Failed to get dead letter queue:', error);
    return { items: [], total: 0, page: 1, totalPages: 0 };
  }
}

// ===== RETRY FROM DEAD LETTER =====

export async function retryFromDeadLetter(
  executionId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const execution = await db.workflowExecution.findFirst({
      where: { id: executionId, deadLettered: true },
      include: { workflow: { select: { userId: true } } },
    });

    if (!execution) {
      return { success: false, error: 'Dead-lettered execution not found' };
    }

    if (execution.workflow.userId !== userId) {
      return { success: false, error: 'Not authorized' };
    }

    // Reset dead letter state and retry
    await db.workflowExecution.update({
      where: { id: executionId },
      data: {
        deadLettered: false,
        deadLetterReason: null,
        status: 'running',
        error: null,
        completedAt: null,
        retryCount: 0,
      },
    });

    // Re-execute from the beginning
    const { retryExecution } = await import('@/lib/workflow-engine');
    const result = await retryExecution(executionId, userId);

    await logWorkflowEvent(userId, 'workflow_dead_letter_retried', { executionId });

    return { success: result.success, error: result.error };
  } catch (error) {
    console.error('[WorkflowDLQ] Failed to retry from dead letter:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retry from dead letter',
    };
  }
}

// ===== PURGE DEAD LETTER QUEUE =====

export async function purgeDeadLetterQueue(
  userId: string
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  try {
    const result = await db.workflowExecution.deleteMany({
      where: {
        deadLettered: true,
        workflow: { userId },
      },
    });

    await logWorkflowEvent(userId, 'workflow_dead_letter_purged', {
      deletedCount: result.count,
    });

    return { success: true, deletedCount: result.count };
  } catch (error) {
    console.error('[WorkflowDLQ] Failed to purge dead letter queue:', error);
    return {
      success: false,
      deletedCount: 0,
      error: error instanceof Error ? error.message : 'Failed to purge dead letter queue',
    };
  }
}

// ===== GET DEAD LETTER STATS =====

export async function getDeadLetterStats(
  userId: string
): Promise<{ total: number; byReason: { reason: string; count: number }[]; byWorkflow: { workflowId: string; workflowName: string; count: number }[] }> {
  try {
    const total = await db.workflowExecution.count({
      where: { deadLettered: true, workflow: { userId } },
    });

    // By reason — manual grouping since SQLite groupBy on text
    const deadLettered = await db.workflowExecution.findMany({
      where: { deadLettered: true, workflow: { userId } },
      select: { deadLetterReason: true, workflowId: true, workflow: { select: { name: true } } },
    });

    const reasonCounts: Record<string, number> = {};
    const workflowCounts: Record<string, { name: string; count: number }> = {};

    for (const item of deadLettered) {
      const reason = item.deadLetterReason || 'Unknown';
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;

      if (!workflowCounts[item.workflowId]) {
        workflowCounts[item.workflowId] = { name: item.workflow.name, count: 0 };
      }
      workflowCounts[item.workflowId].count++;
    }

    return {
      total,
      byReason: Object.entries(reasonCounts).map(([reason, count]) => ({ reason, count })),
      byWorkflow: Object.entries(workflowCounts).map(([workflowId, data]) => ({
        workflowId,
        workflowName: data.name,
        count: data.count,
      })),
    };
  } catch (error) {
    console.error('[WorkflowDLQ] Failed to get dead letter stats:', error);
    return { total: 0, byReason: [], byWorkflow: [] };
  }
}
