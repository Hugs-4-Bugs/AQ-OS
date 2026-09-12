// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Shared Utilities
// Shared helpers used by multiple workflow sub-modules
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ── Types (shared across all workflow modules) ──────────────────────

export interface WorkflowNode {
  id: string;
  type: string; // action, condition, delay, ai_action, trigger
  title: string;
  description?: string;
  config: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface CreateWorkflowData {
  name: string;
  description?: string;
  triggerType: string;
  triggerConfig?: Record<string, unknown>;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  status?: string;
  isTemplate?: boolean;
  templateCategory?: string;
  maxConcurrency?: number;
  timeoutMs?: number;
  maxRetries?: number;
  orgId?: string;
  scheduleCron?: string;
}

export interface UpdateWorkflowData {
  name?: string;
  description?: string;
  triggerType?: string;
  triggerConfig?: Record<string, unknown>;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  status?: string;
  isTemplate?: boolean;
  templateCategory?: string;
  maxConcurrency?: number;
  timeoutMs?: number;
  maxRetries?: number;
  scheduleCron?: string;
}

export interface ListFilters {
  status?: string;
  triggerType?: string;
  includeTemplates?: boolean;
  page?: number;
  limit?: number;
}

export interface ExecutionFilters {
  status?: string;
  workflowId?: string;
  includeDeadLetter?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

export function generateWebhookPath(): string {
  return `wh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function generateIdempotencyKey(): string {
  return `wf_exec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Log an audit event */
export async function auditLog(
  userId: string,
  action: string,
  resourceId: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId,
        action,
        resource: 'workflow',
        resourceId,
        details: details ? JSON.stringify(details) : null,
      },
    });
  } catch (error) {
    console.error('[WorkflowService] Audit log failed:', error);
  }
}

/** Sync WorkflowStep records from the nodes JSON. Returns the count of steps created. */
export async function syncSteps(
  workflowId: string,
  nodes: WorkflowNode[]
): Promise<number> {
  // Delete existing steps
  await db.workflowStep.deleteMany({ where: { workflowId } });

  // Create new steps
  if (nodes.length > 0) {
    const sortedNodes = nodes
      .filter((n) => n.type !== 'trigger') // Don't create DB steps for trigger nodes
      .map((n, idx) => ({
        workflowId,
        type: n.type,
        name: n.title,
        config: JSON.stringify(n.config),
        order: idx,
        nextStepId: null as string | null,
      }));

    if (sortedNodes.length > 0) {
      await db.workflowStep.createMany({ data: sortedNodes });
    }

    return sortedNodes.length;
  }

  return 0;
}

/** Get single workflow with steps (shared across modules) */
export async function getWorkflow(workflowId: string, userId: string) {
  const workflow = await db.workflowDefinition.findFirst({
    where: { id: workflowId, userId },
    include: { workflowSteps: { orderBy: { order: 'asc' } } },
  });

  if (!workflow) return null;

  return {
    ...workflow,
    nodes: JSON.parse(workflow.nodes),
    edges: JSON.parse(workflow.edges),
    triggerConfig: workflow.triggerConfig ? JSON.parse(workflow.triggerConfig) : null,
    workflowSteps: workflow.workflowSteps.map((s) => ({
      ...s,
      config: JSON.parse(s.config),
    })),
  };
}
