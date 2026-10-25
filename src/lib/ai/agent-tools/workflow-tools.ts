// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow + Task Tools (Phase 26 v2 agent tool layer)
// ═══════════════════════════════════════════════════════════════════

import { registerTool } from './registry';
import { type ToolContext, type ToolResult } from './types';

// ─── workflow.status ────────────────────────────────────────────────

registerTool({
  name: 'workflow.status',
  description: 'Look up the status of a workflow execution owned by the authenticated user. Returns executionId, status, startedAt, finishedAt, leadId, runId.',
  category: 'workflow',
  readOnly: true,
  idempotent: true,
  requiredFeature: 'workflow_access',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      executionId: { type: 'string', description: 'Required. Workflow execution ID.' },
    },
    required: ['executionId'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      execution: { type: 'object', description: 'Execution record (null if not found).' },
    },
  },
  async execute(input: { executionId: string }, ctx: ToolContext): Promise<ToolResult> {
    const { db } = await import('@/lib/db');
    const execution = await db.workflowExecution.findFirst({
      where: { id: input.executionId, userId: ctx.userId },
      select: {
        id: true, status: true, startedAt: true, finishedAt: true,
        leadId: true, autopilotRunId: true, creditsUsed: true,
      },
    });
    if (!execution) {
      return {
        status: 'not_found',
        toolInvocationId: '',
        durationMs: 0,
        error: 'Workflow execution not found or not owned by caller',
      };
    }
    return {
      status: 'success',
      toolInvocationId: '',
      durationMs: 0,
      output: { execution },
    };
  },
});

// ─── task.create ──────────────────────────────────────────────────────

registerTool({
  name: 'task.create',
  description: 'Create a task owned by the authenticated user. Required: title. Optional: leadId, dueAt (ISO), priority.',
  category: 'task',
  readOnly: false,
  idempotent: true,
  requiredFeature: 'workflow_access',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string', description: 'Required. Task title.' },
      leadId: { type: 'string', description: 'Optional. Associated lead ID.' },
      dueAt: { type: 'string', description: 'Optional. ISO 8601 due date.' },
      priority: { type: 'string', description: 'Optional. low|medium|high|urgent.', enum: ['low', 'medium', 'high', 'urgent'] },
    },
    required: ['title'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'Created task ID.' },
    },
  },
  async execute(input: {
    title: string; leadId?: string; dueAt?: string; priority?: string;
  }, ctx: ToolContext): Promise<ToolResult> {
    const { db } = await import('@/lib/db');
    // If leadId provided, verify ownership before linking.
    if (input.leadId) {
      const lead = await db.lead.findFirst({
        where: { id: input.leadId, userId: ctx.userId },
        select: { id: true },
      });
      if (!lead) {
        return {
          status: 'not_found',
          toolInvocationId: '',
          durationMs: 0,
          error: 'Lead not found or not owned by caller; cannot attach task',
        };
      }
    }
    // Use the Task table if it exists; otherwise return a typed error
    // (the agent layer must NOT crash if downstream schema is missing).
    try {
      const task = await db.task.create({
        data: {
          userId: ctx.userId,
          orgId: ctx.orgId || null,
          title: input.title.trim(),
          leadId: input.leadId || null,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          priority: input.priority || 'medium',
        },
        select: { id: true },
      });
      return {
        status: 'success',
        toolInvocationId: '',
        durationMs: 0,
        output: { taskId: task.id },
      };
    } catch (err) {
      // Schema drift — additive migration may not be applied yet.
      return {
        status: 'error',
        toolInvocationId: '',
        durationMs: 0,
        error: `Task table not available: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
});
