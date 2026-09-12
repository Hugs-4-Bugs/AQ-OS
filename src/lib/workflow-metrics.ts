// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Metrics
// Workflow metrics and dead letter stats
// Only imported by metrics and DLQ routes
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

/** Get real workflow metrics from DB */
export async function getWorkflowMetrics(userId: string) {
  const userWorkflows = await db.workflowDefinition.findMany({
    where: { userId, isTemplate: false },
    select: { id: true, status: true, runCount: true, successCount: true, failureCount: true, avgRuntimeMs: true },
  });

  const workflowIds = userWorkflows.map((w) => w.id);

  const totalWorkflows = userWorkflows.length;
  const activeWorkflows = userWorkflows.filter((w) => w.status === 'active').length;

  const totalExecutions = userWorkflows.reduce((sum, w) => sum + w.runCount, 0);
  const totalSuccesses = userWorkflows.reduce((sum, w) => sum + w.successCount, 0);
  const totalFailures = userWorkflows.reduce((sum, w) => sum + w.failureCount, 0);

  const successRate = totalExecutions > 0
    ? Math.round((totalSuccesses / totalExecutions) * 100)
    : 0;

  const avgRuntimeMs = totalWorkflows > 0
    ? Math.round(userWorkflows.reduce((sum, w) => sum + (w.avgRuntimeMs ?? 0), 0) / totalWorkflows)
    : 0;

  // Executions by status
  const statusCounts = await db.workflowExecution.groupBy({
    by: ['status'],
    where: { workflowId: { in: workflowIds } },
    _count: { status: true },
  });

  const executionsByStatus: Record<string, number> = {};
  for (const sc of statusCounts) {
    executionsByStatus[sc.status] = sc._count.status;
  }

  // Recent failures (last 24h)
  const recentFailures = await db.workflowExecution.count({
    where: {
      workflowId: { in: workflowIds },
      status: 'failed',
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });

  // Queue depth
  const queueDepth = await db.workflowExecution.count({
    where: {
      workflowId: { in: workflowIds },
      status: { in: ['queued', 'running'] },
    },
  });

  // Throughput: executions in last 24h
  const throughputLast24h = await db.workflowExecution.count({
    where: {
      workflowId: { in: workflowIds },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });

  return {
    totalWorkflows,
    activeWorkflows,
    totalExecutions,
    successRate,
    avgRuntimeMs,
    executionsByStatus,
    recentFailures,
    queueDepth,
    throughputLast24h,
  };
}

/** Get dead letter stats */
export async function getDeadLetterStats(userId: string) {
  const userWorkflows = await db.workflowDefinition.findMany({
    where: { userId },
    select: { id: true },
  });
  const userWorkflowIds = userWorkflows.map((w) => w.id);

  const [total, recentCount] = await Promise.all([
    db.workflowExecution.count({
      where: { isDeadLetter: true, workflowId: { in: userWorkflowIds } },
    }),
    db.workflowExecution.count({
      where: {
        isDeadLetter: true,
        workflowId: { in: userWorkflowIds },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  return { total, recentCount: recentCount };
}
