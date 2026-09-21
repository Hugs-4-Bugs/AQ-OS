// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Execution Engine
// Phase 12: Full execution engine with retries, timeouts, DLQ
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logWorkflowEvent } from '@/lib/workflow-audit';
import { executeAction, type ActionContext, type ActionResult } from '@/lib/workflow-actions';
import { deductExecutionCredits, getActionCreditCost, checkExecutionLimit } from '@/lib/workflow-credits';
import { sendToDeadLetter } from '@/lib/workflow-dead-letter';
import { publishEvent } from '@/lib/realtime-event-bus';
import { createNotificationOnce } from '@/lib/notification-service';

// Helper to publish workflow SSE events safely
async function emitWorkflowEvent(
  eventType: string,
  userId: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await publishEvent({
      channel: 'workflow_events',
      eventType,
      payload,
      userId,
    });
  } catch {
    // Non-blocking: don't fail execution if event bus fails
  }
}

// ===== TYPES =====

export interface ExecuteWorkflowResult {
  executionId: string;
  status: string;
  error?: string;
}

interface StepDefinition {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  order: number;
  nextStepId?: string;
}

interface ProcessStepResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  shouldContinue: boolean;
  durationMs: number;
}

// ===== MAIN EXECUTION ENTRY POINT =====

/**
 * Execute a workflow. Creates a WorkflowExecution record and processes steps.
 * Returns the execution ID immediately (202 Accepted pattern).
 */
export async function executeWorkflow(
  workflowId: string,
  userId: string,
  triggerData?: Record<string, unknown>,
  idempotencyKey?: string
): Promise<ExecuteWorkflowResult> {
  try {
    // Load workflow definition — allow both 'draft' (for testing) and 'active' workflows.
    // Drafts can be executed to validate the workflow before publishing.
    const workflow = await db.workflowDefinition.findFirst({
      where: { id: workflowId, userId, status: { in: ['draft', 'active'] } },
      include: { workflowSteps: { orderBy: { order: 'asc' } } },
    });

    if (!workflow) {
      return { executionId: '', status: 'failed', error: 'Workflow not found or not active (drafts are executable for testing)' };
    }

    // Check execution limit
    const limitCheck = await checkExecutionLimit(userId);
    if (!limitCheck.allowed) {
      return {
        executionId: '',
        status: 'failed',
        error: `Monthly execution limit reached (${limitCheck.current}/${limitCheck.limit})`,
      };
    }

    // Idempotency check
    if (idempotencyKey) {
      const existing = await db.workflowExecution.findFirst({
        where: { idempotencyKey, workflowId },
      });
      if (existing) {
        return { executionId: existing.id, status: existing.status };
      }
    }

    // Parse steps from nodes/edges if no explicit steps
    let steps: StepDefinition[] = [];
    if (workflow.workflowSteps.length > 0) {
      steps = workflow.workflowSteps.map((s) => ({
        id: s.id,
        type: s.type,
        name: s.name,
        config: JSON.parse(s.config || '{}'),
        order: s.order,
        nextStepId: s.nextStepId || undefined,
      }));
    } else {
      // Parse nodes from JSON
      try {
        const nodes = JSON.parse(workflow.nodes || '[]');
        steps = nodes
          .filter((n: Record<string, unknown>) => n.type !== 'trigger')
          .map((n: Record<string, unknown>, i: number) => ({
            id: String(n.id || `step-${i}`),
            type: String(n.type || 'action'),
            name: String(n.title || n.name || `Step ${i + 1}`),
            config: (n.config as Record<string, unknown>) || {},
            order: i,
          }));
      } catch {
        steps = [];
      }
    }

    // Create execution record
    const maxRetries = Number(process.env.WORKFLOW_MAX_RETRIES) || 3;
    const timeoutMs = Number(process.env.WORKFLOW_TIMEOUT) || 300000;

    const execution = await db.workflowExecution.create({
      data: {
        workflowId,
        // Persist the execution owner. The trusted execution context (userId +
        // leadId) must survive on the execution record so that retries,
        // resumes, and audit trails all resolve leads against the SAME user
        // who started the run — never against a null/system owner.
        userId,
        status: 'running',
        triggerData: triggerData ? JSON.stringify(triggerData) : null,
        triggerEvent: triggerData ? JSON.stringify(triggerData) : null,
        currentStep: 0,
        totalSteps: steps.length,
        idempotencyKey: idempotencyKey || null,
        maxRetries,
        timeoutMs,
      },
    });

    // Execute steps (async but we process them sequentially)
    // We do NOT await the full execution to return 202 quickly
    // But in this single-process model, we run inline
    try {
      await runSteps(execution.id, steps, userId, workflowId, triggerData);
    } catch (error) {
      console.error('[WorkflowEngine] Step execution error:', error);
    }

    // Log audit event
    await logWorkflowEvent(userId, 'workflow_executed', {
      workflowId,
      executionId: execution.id,
      triggerType: workflow.triggerType,
    });

    // Emit realtime event
    await emitWorkflowEvent('workflow_started', userId, {
      workflowId,
      executionId: execution.id,
      workflowName: workflow.name,
      triggerType: workflow.triggerType,
    });

    // Fetch final state
    const finalExecution = await db.workflowExecution.findUnique({
      where: { id: execution.id },
      select: { id: true, status: true, error: true },
    });

    return {
      executionId: execution.id,
      status: finalExecution?.status || 'running',
      error: finalExecution?.error || undefined,
    };
  } catch (error) {
    console.error('[WorkflowEngine] Failed to execute workflow:', error);
    return {
      executionId: '',
      status: 'failed',
      error: error instanceof Error ? error.message : 'Execution failed',
    };
  }
}

// ===== STEP RUNNER =====

async function runSteps(
  executionId: string,
  steps: StepDefinition[],
  userId: string,
  workflowId: string,
  triggerData?: Record<string, unknown>
): Promise<void> {
  const previousOutputs: Record<string, unknown> = {};
  let shouldContinue = true;

  for (let i = 0; i < steps.length && shouldContinue; i++) {
    const step = steps[i];

    // Update current step
    await db.workflowExecution.update({
      where: { id: executionId },
      data: { currentStep: i },
    });

    // Process the step
    const result = await processStep(executionId, step, {
      userId,
      workflowId,
      executionId,
      leadId: triggerData?.leadId as string | undefined,
      triggerData,
      previousOutputs,
    });

    // Store output
    if (result.output) {
      previousOutputs[step.id] = result.output;
    }

    // Handle delay steps
    if (step.type === 'delay' || step.type === 'wait_delay') {
      const delayMs = result.output?.delayMs as number | undefined;
      if (delayMs && delayMs > 0 && delayMs <= 86400000) {
        // For short delays (< 24h), sleep inline
        // For longer delays, this should be handled by a queue
        await new Promise(resolve => setTimeout(resolve, Math.min(delayMs, 60000)));
      }
    }

    // Handle conditional branch — may skip subsequent steps
    if (step.type === 'condition' || step.type === 'conditional_branch') {
      const branch = result.output?.branch as string | undefined;
      if (branch === 'false' || branch === 'skip') {
        // Skip the next step if condition is false
        // (Simple linear branch model)
        i++; // Skip next step
      }
    }

    if (!result.success) {
      // Mark execution as failed
      await db.workflowExecution.update({
        where: { id: executionId },
        data: {
          status: 'failed',
          error: result.error || 'Step execution failed',
          completedAt: new Date(),
        },
      });

      // User-facing notification (safe message — raw errors stay in the
      // execution record, never in the notification text).
      await createNotificationOnce({
        userId,
        type: 'workflow_failed',
        title: 'Workflow execution failed',
        message: `A workflow run stopped at step "${step.name || 'unknown'}" and could not continue. You can retry it from the Workflows page.`,
        actionUrl: '/business-ai/workflows',
        metadata: { workflowId, executionId, failedStep: step.name },
        dedupeKey: `wfexec:${executionId}:failed`,
      }).catch(() => {
        // Never fail the execution path because of a notification problem
      });

      await logWorkflowEvent(userId, 'workflow_failed', {
        workflowId,
        executionId,
        failedStep: step.name,
        error: result.error,
      });

      // Emit realtime event
      await emitWorkflowEvent('workflow_failed', userId, {
        workflowId,
        executionId,
        failedStep: step.name,
        error: result.error,
      });

      // Check if we should retry
      const execution = await db.workflowExecution.findUnique({
        where: { id: executionId },
        select: { retryCount: true, maxRetries: true },
      });

      if (execution && execution.retryCount < execution.maxRetries) {
        await db.workflowExecution.update({
          where: { id: executionId },
          data: { retryCount: { increment: 1 } },
        });
      } else {
        // Max retries exceeded — dead letter
        await sendToDeadLetter(executionId, `Max retries exceeded. Last error: ${result.error || 'Unknown'}`);
      }

      return;
    }

    shouldContinue = result.shouldContinue;
  }

  // Mark execution as completed
  if (shouldContinue) {
    await db.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        currentStep: steps.length,
      },
    });

    // User-facing notification (deduped per execution — replay/retry of the
    // same execution id will not create a second notification).
    await createNotificationOnce({
      userId,
      type: 'workflow_completed',
      title: 'Workflow completed',
      message: `A workflow run finished successfully — all ${steps.length} step${steps.length === 1 ? '' : 's'} completed.`,
      actionUrl: '/business-ai/workflows',
      metadata: { workflowId, executionId, totalSteps: steps.length },
      dedupeKey: `wfexec:${executionId}:completed`,
    }).catch(() => {
      // Never fail the execution path because of a notification problem
    });

    // Emit realtime completion event
    await emitWorkflowEvent('workflow_completed', userId, {
      workflowId,
      executionId,
      totalSteps: steps.length,
    });
  }
}

// ===== PROCESS SINGLE STEP =====

export async function processStep(
  executionId: string,
  step: StepDefinition,
  context: ActionContext
): Promise<ProcessStepResult> {
  const startTime = Date.now();

  try {
    let result: ActionResult;

    // Deduct credits before execution
    const creditResult = await deductExecutionCredits(context.userId, step.type);

    if (!creditResult.success && creditResult.creditsUsed > 0) {
      // Only fail if the action actually costs credits and we can't afford them
      const durationMs = Date.now() - startTime;

      await db.workflowLog.create({
        data: {
          executionId,
          stepName: step.name,
          stepType: step.type,
          status: 'failed',
          input: JSON.stringify(step.config),
          error: `Insufficient credits: ${creditResult.error}`,
          durationMs,
          userId: context.userId,
        },
      });

      return {
        success: false,
        error: `Insufficient credits: ${creditResult.error}`,
        shouldContinue: false,
        durationMs,
      };
    }

    // Execute the action.
    // WorkflowStep.type stores the NODE type ('action' | 'delay' | 'condition' | 'ai_action'),
    // while executeAction dispatches on the ACTION type ('send_email' | 'wait_delay' | ...).
    // The action type always rides in config.actionType; fall back to step.type for
    // legacy steps that stored the action type directly.
    const actionType = String(step.config?.actionType || step.type);
    result = await executeAction(actionType, step.config, context);

    const durationMs = Date.now() - startTime;

    // Create workflow log entry
    await db.workflowLog.create({
      data: {
        executionId,
        stepName: step.name,
        stepType: step.type,
        status: result.success ? 'success' : 'failed',
        input: JSON.stringify(step.config),
        output: result.output ? JSON.stringify(result.output) : null,
        error: result.error || null,
        durationMs,
        userId: context.userId,
      },
    });

    // Emit step event
    await emitWorkflowEvent(
      result.success ? 'workflow_step_completed' : 'workflow_step_failed',
      context.userId,
      {
        executionId,
        stepName: step.name,
        stepType: step.type,
        durationMs,
        error: result.error,
      }
    );

    return {
      success: result.success,
      output: result.output,
      error: result.error,
      shouldContinue: result.success,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;

    await db.workflowLog.create({
      data: {
        executionId,
        stepName: step.name,
        stepType: step.type,
        status: 'failed',
        input: JSON.stringify(step.config),
        error: error instanceof Error ? error.message : 'Step execution failed',
        durationMs,
        userId: context.userId,
      },
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Step execution failed',
      shouldContinue: false,
      durationMs,
    };
  }
}

// ===== PAUSE EXECUTION =====

export async function pauseExecution(
  executionId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const execution = await db.workflowExecution.findFirst({
      where: { id: executionId },
      include: { workflow: { select: { userId: true } } },
    });

    if (!execution) {
      return { success: false, error: 'Execution not found' };
    }

    if (execution.workflow.userId !== userId) {
      return { success: false, error: 'Not authorized' };
    }

    if (execution.status !== 'running') {
      return { success: false, error: `Cannot pause execution in '${execution.status}' status` };
    }

    await db.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'paused', pausedAt: new Date() },
    });

    await logWorkflowEvent(userId, 'workflow_paused', { executionId });

    // Emit realtime event
    await emitWorkflowEvent('workflow_paused', userId, { executionId });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to pause execution',
    };
  }
}

// ===== RESUME EXECUTION =====

export async function resumeExecution(
  executionId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const execution = await db.workflowExecution.findFirst({
      where: { id: executionId },
      include: { workflow: { select: { userId: true } } },
    });

    if (!execution) {
      return { success: false, error: 'Execution not found' };
    }

    if (execution.workflow.userId !== userId) {
      return { success: false, error: 'Not authorized' };
    }

    if (execution.status !== 'paused') {
      return { success: false, error: `Cannot resume execution in '${execution.status}' status` };
    }

    await db.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'running', resumedAt: new Date() },
    });

    // Re-run remaining steps
    const workflow = await db.workflowDefinition.findUnique({
      where: { id: execution.workflowId },
      include: { workflowSteps: { orderBy: { order: 'asc' } } },
    });

    if (workflow) {
      const steps = workflow.workflowSteps.map((s) => ({
        id: s.id,
        type: s.type,
        name: s.name,
        config: JSON.parse(s.config || '{}'),
        order: s.order,
        nextStepId: s.nextStepId || undefined,
      }));

      const triggerData = execution.triggerData ? JSON.parse(execution.triggerData) : undefined;
      const remainingSteps = steps.slice(execution.currentStep);

      await runSteps(executionId, remainingSteps, userId, execution.workflowId, triggerData);
    }

    await logWorkflowEvent(userId, 'workflow_resumed', { executionId });

    // Emit realtime event
    await emitWorkflowEvent('workflow_resumed', userId, { executionId });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resume execution',
    };
  }
}

// ===== CANCEL EXECUTION =====

export async function cancelExecution(
  executionId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const execution = await db.workflowExecution.findFirst({
      where: { id: executionId },
      include: { workflow: { select: { userId: true } } },
    });

    if (!execution) {
      return { success: false, error: 'Execution not found' };
    }

    if (execution.workflow.userId !== userId) {
      return { success: false, error: 'Not authorized' };
    }

    if (!['running', 'paused'].includes(execution.status)) {
      return { success: false, error: `Cannot cancel execution in '${execution.status}' status` };
    }

    await db.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'cancelled', completedAt: new Date() },
    });

    await logWorkflowEvent(userId, 'workflow_cancelled', { executionId });

    // Emit realtime event
    await emitWorkflowEvent('workflow_cancelled', userId, { executionId });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel execution',
    };
  }
}

// ===== RETRY EXECUTION =====

export async function retryExecution(
  executionId: string,
  userId: string
): Promise<{ success: boolean; executionId?: string; error?: string }> {
  try {
    const execution = await db.workflowExecution.findFirst({
      where: { id: executionId },
      include: { workflow: { select: { userId: true, id: true } } },
    });

    if (!execution) {
      return { success: false, error: 'Execution not found' };
    }

    if (execution.workflow.userId !== userId) {
      return { success: false, error: 'Not authorized' };
    }

    if (!['failed', 'cancelled'].includes(execution.status)) {
      return { success: false, error: `Cannot retry execution in '${execution.status}' status` };
    }

    // Re-execute from the failed step
    const workflow = await db.workflowDefinition.findUnique({
      where: { id: execution.workflowId },
      include: { workflowSteps: { orderBy: { order: 'asc' } } },
    });

    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    const steps = workflow.workflowSteps.map((s) => ({
      id: s.id,
      type: s.type,
      name: s.name,
      config: JSON.parse(s.config || '{}'),
      order: s.order,
      nextStepId: s.nextStepId || undefined,
    }));

    // Reset execution state
    await db.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: 'running',
        error: null,
        completedAt: null,
        retryCount: { increment: 1 },
      },
    });

    const triggerData = execution.triggerData ? JSON.parse(execution.triggerData) : undefined;
    const remainingSteps = steps.slice(execution.currentStep);

    await runSteps(executionId, remainingSteps, userId, execution.workflowId, triggerData);

    await logWorkflowEvent(userId, 'workflow_retried', {
      executionId,
      workflowId: execution.workflowId,
    });

    // Emit realtime event
    await emitWorkflowEvent('workflow_retried', userId, {
      executionId,
      workflowId: execution.workflowId,
    });

    return { success: true, executionId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retry execution',
    };
  }
}

// ===== EXECUTION HISTORY =====

export async function getExecutionHistory(
  userId: string,
  filters?: {
    status?: string;
    workflowId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }
): Promise<{ executions: Record<string, unknown>[]; total: number; page: number; totalPages: number }> {
  try {
    const page = filters?.page || 1;
    const limit = Math.min(filters?.limit || 20, 100);
    const offset = (page - 1) * limit;

    const where: Record<string, unknown> = {
      workflow: { userId },
    };

    if (filters?.status) where.status = filters.status;
    if (filters?.workflowId) where.workflowId = filters.workflowId;
    if (filters?.dateFrom || filters?.dateTo) {
      const startedAt: Record<string, Date> = {};
      if (filters?.dateFrom) startedAt.gte = new Date(filters.dateFrom);
      if (filters?.dateTo) startedAt.lte = new Date(filters.dateTo);
      where.startedAt = startedAt;
    }

    const [executions, total] = await Promise.all([
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
      executions: executions.map((e) => ({
        id: e.id,
        workflowId: e.workflowId,
        workflowName: e.workflow.name,
        triggerType: e.workflow.triggerType,
        status: e.status,
        currentStep: e.currentStep,
        totalSteps: e.totalSteps,
        startedAt: e.startedAt,
        completedAt: e.completedAt,
        error: e.error,
        retryCount: e.retryCount,
        deadLettered: e.deadLettered,
        deadLetterReason: e.deadLetterReason,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  } catch (error) {
    console.error('[WorkflowEngine] Failed to get execution history:', error);
    return { executions: [], total: 0, page: 1, totalPages: 0 };
  }
}

// ===== EXECUTION DETAIL =====

export async function getExecutionDetail(
  executionId: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  try {
    const execution = await db.workflowExecution.findFirst({
      where: { id: executionId },
      include: {
        workflow: { select: { name: true, triggerType: true, userId: true } },
        stepLogs: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!execution) return null;

    // Check ownership
    if (execution.workflow.userId !== userId) return null;

    return {
      id: execution.id,
      workflowId: execution.workflowId,
      workflowName: execution.workflow.name,
      triggerType: execution.workflow.triggerType,
      status: execution.status,
      currentStep: execution.currentStep,
      totalSteps: execution.totalSteps,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      error: execution.error,
      retryCount: execution.retryCount,
      maxRetries: execution.maxRetries,
      timeoutMs: execution.timeoutMs,
      deadLettered: execution.deadLettered,
      deadLetterReason: execution.deadLetterReason,
      pausedAt: execution.pausedAt,
      resumedAt: execution.resumedAt,
      triggerData: execution.triggerData ? JSON.parse(execution.triggerData) : null,
      triggerEvent: execution.triggerEvent ? JSON.parse(execution.triggerEvent) : null,
      stepLogs: execution.stepLogs.map((log) => ({
        id: log.id,
        stepName: log.stepName,
        stepType: log.stepType,
        status: log.status,
        input: log.input ? JSON.parse(log.input) : null,
        output: log.output ? JSON.parse(log.output) : null,
        error: log.error,
        durationMs: log.durationMs,
        createdAt: log.createdAt,
      })),
    };
  } catch (error) {
    console.error('[WorkflowEngine] Failed to get execution detail:', error);
    return null;
  }
}

// ===== EXECUTION METRICS =====

export async function getExecutionMetrics(
  userId: string
): Promise<Record<string, unknown>> {
  try {
    // Total executions
    const total = await db.workflowExecution.count({
      where: { workflow: { userId } },
    });

    // Success count
    const completed = await db.workflowExecution.count({
      where: { workflow: { userId }, status: 'completed' },
    });

    // Failed count
    const failed = await db.workflowExecution.count({
      where: { workflow: { userId }, status: 'failed' },
    });

    // Running count
    const running = await db.workflowExecution.count({
      where: { workflow: { userId }, status: 'running' },
    });

    // Dead lettered count
    const deadLettered = await db.workflowExecution.count({
      where: { workflow: { userId }, deadLettered: true },
    });

    // Success rate
    const successRate = total > 0 ? ((completed / total) * 100).toFixed(1) : '0';

    // Average duration (for completed executions)
    const completedExecutions = await db.workflowExecution.findMany({
      where: { workflow: { userId }, status: 'completed', completedAt: { not: null } },
      select: { startedAt: true, completedAt: true },
      take: 100,
    });

    const durations = completedExecutions
      .filter((e) => e.completedAt)
      .map((e) => e.completedAt!.getTime() - e.startedAt.getTime());

    const avgDurationMs = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

    // By trigger type
    const byTriggerType = await db.workflowExecution.groupBy({
      by: ['workflowId'],
      where: { workflow: { userId } },
      _count: { id: true },
    });

    // By status
    const byStatus = await db.workflowExecution.groupBy({
      by: ['status'],
      where: { workflow: { userId } },
      _count: { id: true },
    });

    // This month
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const thisMonth = await db.workflowExecution.count({
      where: { workflow: { userId }, startedAt: { gte: startOfMonth } },
    });

    return {
      total,
      completed,
      failed,
      running,
      deadLettered,
      successRate: `${successRate}%`,
      avgDurationMs,
      avgDurationFormatted: formatDuration(avgDurationMs),
      thisMonth,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.id })),
      byTriggerType: byTriggerType.map((t) => ({ workflowId: t.workflowId, count: t._count.id })),
    };
  } catch (error) {
    console.error('[WorkflowEngine] Failed to get execution metrics:', error);
    return {
      total: 0,
      completed: 0,
      failed: 0,
      running: 0,
      deadLettered: 0,
      successRate: '0%',
      avgDurationMs: 0,
      thisMonth: 0,
    };
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}
