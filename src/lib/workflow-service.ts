// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow CRUD Service
// Phase 12: Real DB-backed workflow management (replaces in-memory store)
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logWorkflowEvent } from '@/lib/workflow-audit';
import { checkWorkflowLimit } from '@/lib/workflow-credits';

// ===== TYPES =====

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  triggerType: string;
  triggerConfig?: Record<string, unknown>;
  nodes?: unknown[];
  edges?: unknown[];
  steps?: CreateWorkflowStepInput[];
  status?: string;
  orgId?: string;
}

export interface CreateWorkflowStepInput {
  type: string;
  name: string;
  config: Record<string, unknown>;
  order: number;
  nextStepId?: string;
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  triggerType?: string;
  triggerConfig?: Record<string, unknown>;
  nodes?: unknown[];
  edges?: unknown[];
  steps?: CreateWorkflowStepInput[];
  status?: string;
}

export interface WorkflowListFilters {
  status?: string;
  triggerType?: string;
  search?: string;
  page?: number;
  limit?: number;
  orgId?: string;
}

// ===== VALIDATION =====

const VALID_TRIGGER_TYPES = [
  'lead_discovered',
  'lead_moved',
  'lead_reply',
  'score_change',
  'manual',
  'scheduled',
  'payment_received',
  'gmail_connected',
  'email_received',
  'telegram_received',
  'whatsapp_received',
  'payment_success',
  'trial_ending',
  'credits_low',
  'ai_completed',
  'webhook',
];

const VALID_STATUSES = ['draft', 'active', 'paused', 'archived'];

function validateCreateInput(data: CreateWorkflowInput): string | null {
  if (!data.name || data.name.trim().length === 0) {
    return 'Workflow name is required';
  }
  if (data.name.length > 200) {
    return 'Workflow name must be under 200 characters';
  }
  if (!data.triggerType || !VALID_TRIGGER_TYPES.includes(data.triggerType)) {
    return `Invalid trigger type. Must be one of: ${VALID_TRIGGER_TYPES.join(', ')}`;
  }
  if (data.steps && data.steps.length > 50) {
    return 'Workflow cannot have more than 50 steps';
  }
  return null;
}

function validateUpdateInput(data: UpdateWorkflowInput): string | null {
  if (data.name !== undefined && data.name.trim().length === 0) {
    return 'Workflow name cannot be empty';
  }
  if (data.name && data.name.length > 200) {
    return 'Workflow name must be under 200 characters';
  }
  if (data.triggerType && !VALID_TRIGGER_TYPES.includes(data.triggerType)) {
    return `Invalid trigger type. Must be one of: ${VALID_TRIGGER_TYPES.join(', ')}`;
  }
  if (data.status && !VALID_STATUSES.includes(data.status)) {
    return `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`;
  }
  if (data.steps && data.steps.length > 50) {
    return 'Workflow cannot have more than 50 steps';
  }
  return null;
}

// ===== CREATE WORKFLOW =====

export async function createWorkflow(
  userId: string,
  data: CreateWorkflowInput
): Promise<{ success: boolean; workflow?: Record<string, unknown>; error?: string }> {
  try {
    // Validate
    const validationError = validateCreateInput(data);
    if (validationError) {
      return { success: false, error: validationError };
    }

    // Check plan limits
    const limitCheck = await checkWorkflowLimit(userId);
    if (!limitCheck.allowed) {
      return {
        success: false,
        error: `Workflow limit reached (${limitCheck.current}/${limitCheck.limit}). Upgrade your plan to create more workflows.`,
      };
    }

    // Create workflow
    const workflow = await db.workflowDefinition.create({
      data: {
        userId,
        ...(data.orgId ? { orgId: data.orgId } : {}),
        name: data.name.trim(),
        description: data.description || null,
        triggerType: data.triggerType,
        triggerConfig: data.triggerConfig ? JSON.stringify(data.triggerConfig) : null,
        nodes: JSON.stringify(data.nodes || []),
        edges: JSON.stringify(data.edges || []),
        status: data.status || 'draft',
        version: 1,
      },
    });

    // Create steps if provided
    if (data.steps && data.steps.length > 0) {
      await db.workflowStep.createMany({
        data: data.steps.map((step, index) => ({
          workflowId: workflow.id,
          type: step.type,
          name: step.name,
          config: JSON.stringify(step.config),
          order: step.order || index,
          nextStepId: step.nextStepId || null,
        })),
      });
    }

    // Fetch with steps
    const fullWorkflow = await db.workflowDefinition.findUnique({
      where: { id: workflow.id },
      include: { workflowSteps: { orderBy: { order: 'asc' } } },
    });

    // Audit log
    await logWorkflowEvent(userId, 'workflow_created', {
      workflowId: workflow.id,
      name: data.name,
      triggerType: data.triggerType,
    });

    return { success: true, workflow: serializeWorkflow(fullWorkflow) };
  } catch (error) {
    console.error('[WorkflowService] Failed to create workflow:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create workflow',
    };
  }
}

// ===== GET WORKFLOW =====

export async function getWorkflow(
  workflowId: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  try {
    const workflow = await db.workflowDefinition.findFirst({
      where: { id: workflowId, userId, status: { not: 'archived' } },
      include: {
        workflowSteps: { orderBy: { order: 'asc' } },
        executions: {
          take: 10,
          orderBy: { startedAt: 'desc' },
        },
      },
    });

    if (!workflow) return null;

    return serializeWorkflow(workflow);
  } catch (error) {
    console.error('[WorkflowService] Failed to get workflow:', error);
    return null;
  }
}

// ===== LIST WORKFLOWS =====

export async function listWorkflows(
  userId: string,
  filters?: WorkflowListFilters
): Promise<{ workflows: Record<string, unknown>[]; total: number; page: number; totalPages: number }> {
  try {
    const page = filters?.page || 1;
    const limit = Math.min(filters?.limit || 20, 100);
    const offset = (page - 1) * limit;

    const where: Record<string, unknown> = {
      userId,
      status: { not: 'archived' },
    };

    if (filters?.orgId) where.orgId = filters.orgId;
    if (filters?.status) where.status = filters.status;
    if (filters?.triggerType) where.triggerType = filters.triggerType;
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { description: { contains: filters.search } },
      ];
    }

    const [workflows, total] = await Promise.all([
      db.workflowDefinition.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          _count: { select: { executions: true } },
        },
      }),
      db.workflowDefinition.count({ where }),
    ]);

    return {
      workflows: workflows.map(serializeWorkflow),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  } catch (error) {
    console.error('[WorkflowService] Failed to list workflows:', error);
    return { workflows: [], total: 0, page: 1, totalPages: 0 };
  }
}

// ===== UPDATE WORKFLOW =====

export async function updateWorkflow(
  workflowId: string,
  userId: string,
  data: UpdateWorkflowInput
): Promise<{ success: boolean; workflow?: Record<string, unknown>; error?: string }> {
  try {
    // Validate
    const validationError = validateUpdateInput(data);
    if (validationError) {
      return { success: false, error: validationError };
    }

    // Check ownership
    const existing = await db.workflowDefinition.findFirst({
      where: { id: workflowId, userId },
    });

    if (!existing) {
      return { success: false, error: 'Workflow not found' };
    }

    if (existing.status === 'archived') {
      return { success: false, error: 'Cannot update an archived workflow' };
    }

    // Subscription-retention guard: if the workflow was auto-paused by the
    // system (disabledBySubscription=true) because the user's subscription
    // expired, the user cannot manually re-enable it from the UI. They must
    // renew their subscription; the system will then auto-resume it.
    if (existing.disabledBySubscription && data.status === 'active') {
      return {
        success: false,
        error:
          'Cannot enable this workflow — your subscription is paused. Please renew your subscription to resume automated workflows.',
      };
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.description !== undefined) updateData.description = data.description;
    if (data.triggerType !== undefined) updateData.triggerType = data.triggerType;
    if (data.triggerConfig !== undefined) updateData.triggerConfig = JSON.stringify(data.triggerConfig);
    if (data.nodes !== undefined) updateData.nodes = JSON.stringify(data.nodes);
    if (data.edges !== undefined) updateData.edges = JSON.stringify(data.edges);
    if (data.status !== undefined) {
      updateData.status = data.status;
      // User manually changing status clears the system-disabled flag so that
      // user intent is preserved (a user-paused workflow stays paused on renewal,
      // a user-activated workflow no longer carries the subscription-paused tag).
      updateData.disabledBySubscription = false;
    }

    // Bump version if meaningful changes
    const versionBumpFields = ['name', 'triggerType', 'triggerConfig', 'nodes', 'edges'];
    const hasVersionBump = versionBumpFields.some(f => f in updateData);
    if (hasVersionBump) {
      updateData.version = existing.version + 1;
    }

    // Update workflow
    await db.workflowDefinition.update({
      where: { id: workflowId },
      data: updateData,
    });

    // Replace steps if provided
    if (data.steps) {
      await db.workflowStep.deleteMany({ where: { workflowId } });
      if (data.steps.length > 0) {
        await db.workflowStep.createMany({
          data: data.steps.map((step, index) => ({
            workflowId,
            type: step.type,
            name: step.name,
            config: JSON.stringify(step.config),
            order: step.order || index,
            nextStepId: step.nextStepId || null,
          })),
        });
      }
    }

    // Fetch updated
    const updated = await db.workflowDefinition.findUnique({
      where: { id: workflowId },
      include: { workflowSteps: { orderBy: { order: 'asc' } } },
    });

    // Audit log
    await logWorkflowEvent(userId, 'workflow_updated', {
      workflowId,
      changes: Object.keys(updateData),
      version: updateData.version || existing.version,
    });

    return { success: true, workflow: serializeWorkflow(updated) };
  } catch (error) {
    console.error('[WorkflowService] Failed to update workflow:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update workflow',
    };
  }
}

// ===== DELETE WORKFLOW (Soft delete — archive) =====

export async function deleteWorkflow(
  workflowId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await db.workflowDefinition.findFirst({
      where: { id: workflowId, userId },
    });

    if (!existing) {
      return { success: false, error: 'Workflow not found' };
    }

    // Soft delete: set status to archived
    await db.workflowDefinition.update({
      where: { id: workflowId },
      data: { status: 'archived' },
    });

    // Audit log
    await logWorkflowEvent(userId, 'workflow_deleted', {
      workflowId,
      name: existing.name,
    });

    return { success: true };
  } catch (error) {
    console.error('[WorkflowService] Failed to delete workflow:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete workflow',
    };
  }
}

// ===== DUPLICATE WORKFLOW =====

export async function duplicateWorkflow(
  workflowId: string,
  userId: string
): Promise<{ success: boolean; workflow?: Record<string, unknown>; error?: string }> {
  try {
    const existing = await db.workflowDefinition.findFirst({
      where: { id: workflowId, userId },
      include: { workflowSteps: { orderBy: { order: 'asc' } } },
    });

    if (!existing) {
      return { success: false, error: 'Workflow not found' };
    }

    // Check plan limits
    const limitCheck = await checkWorkflowLimit(userId);
    if (!limitCheck.allowed) {
      return {
        success: false,
        error: `Workflow limit reached. Upgrade your plan to create more workflows.`,
      };
    }

    // Create duplicate
    const duplicated = await db.workflowDefinition.create({
      data: {
        userId,
        name: `${existing.name} (Copy)`,
        description: existing.description,
        triggerType: existing.triggerType,
        triggerConfig: existing.triggerConfig,
        nodes: existing.nodes,
        edges: existing.edges,
        status: 'draft',
        version: 1,
      },
    });

    // Duplicate steps
    if (existing.workflowSteps.length > 0) {
      await db.workflowStep.createMany({
        data: existing.workflowSteps.map((step) => ({
          workflowId: duplicated.id,
          type: step.type,
          name: step.name,
          config: step.config,
          order: step.order,
          nextStepId: step.nextStepId,
        })),
      });
    }

    // Fetch with steps
    const fullWorkflow = await db.workflowDefinition.findUnique({
      where: { id: duplicated.id },
      include: { workflowSteps: { orderBy: { order: 'asc' } } },
    });

    // Audit log
    await logWorkflowEvent(userId, 'workflow_duplicated', {
      sourceWorkflowId: workflowId,
      newWorkflowId: duplicated.id,
      name: `${existing.name} (Copy)`,
    });

    return { success: true, workflow: serializeWorkflow(fullWorkflow) };
  } catch (error) {
    console.error('[WorkflowService] Failed to duplicate workflow:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to duplicate workflow',
    };
  }
}

// ===== ACTIVATE WORKFLOW =====

export async function activateWorkflow(
  workflowId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await db.workflowDefinition.findFirst({
      where: { id: workflowId, userId },
    });

    if (!existing) {
      return { success: false, error: 'Workflow not found' };
    }

    if (existing.status === 'active') {
      return { success: false, error: 'Workflow is already active' };
    }

    if (existing.status === 'archived') {
      return { success: false, error: 'Cannot activate an archived workflow' };
    }

    // Subscription-retention guard: cannot manually activate a workflow that
    // was auto-paused by the system due to subscription expiry. The user must
    // renew their subscription; the system will then auto-resume the workflow.
    if (existing.disabledBySubscription) {
      return {
        success: false,
        error:
          'Cannot enable this workflow — your subscription is paused. Please renew your subscription to resume automated workflows.',
      };
    }

    await db.workflowDefinition.update({
      where: { id: workflowId },
      data: { status: 'active' },
    });

    // Audit log
    await logWorkflowEvent(userId, 'workflow_activated', {
      workflowId,
      name: existing.name,
    });

    return { success: true };
  } catch (error) {
    console.error('[WorkflowService] Failed to activate workflow:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to activate workflow',
    };
  }
}

// ===== DEACTIVATE WORKFLOW =====

export async function deactivateWorkflow(
  workflowId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await db.workflowDefinition.findFirst({
      where: { id: workflowId, userId },
    });

    if (!existing) {
      return { success: false, error: 'Workflow not found' };
    }

    if (existing.status !== 'active') {
      return { success: false, error: 'Only active workflows can be deactivated' };
    }

    await db.workflowDefinition.update({
      where: { id: workflowId },
      data: { status: 'paused' },
    });

    // Audit log
    await logWorkflowEvent(userId, 'workflow_deactivated', {
      workflowId,
      name: existing.name,
    });

    return { success: true };
  } catch (error) {
    console.error('[WorkflowService] Failed to deactivate workflow:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to deactivate workflow',
    };
  }
}

// ===== GET EXECUTION =====

/**
 * Get a single workflow execution by ID, including step logs.
 * Only returns executions belonging to the user's workflows.
 */
export async function getExecution(
  executionId: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  try {
    const execution = await db.workflowExecution.findFirst({
      where: {
        id: executionId,
        workflow: { userId },
      },
      include: {
        stepLogs: { orderBy: { createdAt: 'asc' } },
        workflow: {
          select: { id: true, name: true, triggerType: true },
        },
      },
    });

    if (!execution) return null;

    return serializeExecution(execution);
  } catch (error) {
    console.error('[WorkflowService] Failed to get execution:', error);
    return null;
  }
}

// ===== GET EXECUTION LOGS =====

/**
 * Get step logs for a specific workflow execution.
 * Only returns logs for executions belonging to the user's workflows.
 */
export async function getExecutionLogs(
  executionId: string,
  userId: string
): Promise<Record<string, unknown>[] | null> {
  try {
    // First verify the execution belongs to the user
    const execution = await db.workflowExecution.findFirst({
      where: {
        id: executionId,
        workflow: { userId },
      },
      select: { id: true },
    });

    if (!execution) return null;

    const logs = await db.workflowLog.findMany({
      where: { executionId },
      orderBy: { createdAt: 'asc' },
    });

    return logs.map(serializeLog);
  } catch (error) {
    console.error('[WorkflowService] Failed to get execution logs:', error);
    return null;
  }
}

// ===== SERIALIZE HELPERS =====

function serializeExecution(execution: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...execution };

  // Parse JSON fields
  if (typeof result.triggerData === 'string') {
    try { result.triggerData = JSON.parse(result.triggerData as string); } catch { result.triggerData = null; }
  }
  if (typeof result.logs === 'string') {
    try { result.logs = JSON.parse(result.logs as string); } catch { result.logs = []; }
  }
  if (typeof result.triggerEvent === 'string') {
    try { result.triggerEvent = JSON.parse(result.triggerEvent as string); } catch { result.triggerEvent = null; }
  }

  // Serialize step logs
  if (Array.isArray(result.stepLogs)) {
    result.stepLogs = (result.stepLogs as Record<string, unknown>[]).map(serializeLog);
  }

  return result;
}

function serializeLog(log: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...log };

  // Parse JSON fields
  if (typeof result.input === 'string') {
    try { result.input = JSON.parse(result.input as string); } catch { result.input = null; }
  }
  if (typeof result.output === 'string') {
    try { result.output = JSON.parse(result.output as string); } catch { result.output = null; }
  }

  return result;
}

// ===== SERIALIZE WORKFLOW HELPER =====

function serializeWorkflow(workflow: Record<string, unknown> | null): Record<string, unknown> {
  if (!workflow) return {};

  const result: Record<string, unknown> = { ...workflow };

  // Parse JSON fields
  if (typeof result.nodes === 'string') {
    try { result.nodes = JSON.parse(result.nodes as string); } catch { result.nodes = []; }
  }
  if (typeof result.edges === 'string') {
    try { result.edges = JSON.parse(result.edges as string); } catch { result.edges = []; }
  }
  if (typeof result.triggerConfig === 'string') {
    try { result.triggerConfig = JSON.parse(result.triggerConfig as string); } catch { result.triggerConfig = null; }
  }

  // Parse steps' config
  if (Array.isArray(result.workflowSteps)) {
    result.workflowSteps = (result.workflowSteps as Record<string, unknown>[]).map((step) => {
      const s = { ...step };
      if (typeof s.config === 'string') {
        try { s.config = JSON.parse(s.config as string); } catch { s.config = {}; }
      }
      return s;
    });
  }

  // Parse executions' triggerData
  if (Array.isArray(result.executions)) {
    result.executions = (result.executions as Record<string, unknown>[]).map((exec) => {
      const e = { ...exec };
      if (typeof e.triggerData === 'string') {
        try { e.triggerData = JSON.parse(e.triggerData as string); } catch { e.triggerData = null; }
      }
      return e;
    });
  }

  return result;
}
