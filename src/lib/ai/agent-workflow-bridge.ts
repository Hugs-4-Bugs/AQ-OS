// Agent ↔ Workflow Bridge — Workstream D §5
import { db } from '@/lib/db';
import { withIdempotency } from '@/lib/ai/agent-idempotency';
import { enqueueEvent } from '@/lib/ai/agent-event-dispatcher';
import { parseAgentCategories } from '@/lib/ai/agent-permission-policy';

export interface AgentStartWorkflowInput { userId: string; agentId: string; runId?: string | null; workflowId: string; leadIds?: string[]; context?: Record<string, unknown> }
export interface AgentStartWorkflowResult { started: boolean; replayed: boolean; executionId: string | null; status: string; error?: string }

export async function startWorkflowFromAgent(input: AgentStartWorkflowInput): Promise<AgentStartWorkflowResult> {
  let agent: Awaited<ReturnType<typeof db.agent.findFirst>> = null;
  try { agent = await db.agent.findFirst({ where: { id: input.agentId, userId: input.userId } }); } catch { /* non-fatal */ }
  if (!agent) return { started: false, replayed: false, executionId: null, status: 'denied', error: 'Agent not found or not owned by caller' };
  if (agent.status !== 'active') return { started: false, replayed: false, executionId: null, status: 'denied', error: `Agent status is "${agent.status}"` };
  const categories = parseAgentCategories(agent.permissionCategories);
  if (!categories.includes('TRIGGER_WORKFLOW')) return { started: false, replayed: false, executionId: null, status: 'denied', error: `Agent does not grant "TRIGGER_WORKFLOW"` };
  const leadIds = input.leadIds ?? [];
  if (leadIds.length > 0) { let owned = 0; try { owned = await db.lead.count({ where: { id: { in: leadIds }, userId: input.userId } }); } catch { /* non-fatal */ } if (owned !== leadIds.length) return { started: false, replayed: false, executionId: null, status: 'denied', error: 'One or more leads not owned by this user' }; }
  const op = await withIdempotency(
    { userId: input.userId, agentId: input.agentId, runId: input.runId ?? null, operationType: 'workflow_start', target: input.workflowId, input: { leadIds: [...leadIds].sort(), context: input.context ?? {} } },
    () => startViaExistingEngine(input),
    (result) => ({ resultType: 'workflow_execution', resultId: result.executionId ?? undefined, resultRef: JSON.stringify(result) }),
  );
  const result = op.result as AgentStartWorkflowResult | null;
  if (op.replayed && result) return { ...result, replayed: true };
  return result ?? { started: false, replayed: false, executionId: null, status: 'error', error: 'No result from engine' };
}

async function startViaExistingEngine(input: AgentStartWorkflowInput): Promise<AgentStartWorkflowResult> {
  try {
    const { executeWorkflow } = await import('@/lib/workflow-executor');
    const execution = await executeWorkflow(input.workflowId, input.userId, { source: 'agent', agentId: input.agentId, agentRunId: input.runId ?? undefined, leadIds: input.leadIds ?? [], context: input.context ?? {} }, `agent:${input.agentId}:${input.workflowId}:${(input.leadIds ?? []).slice().sort().join(',')}`);
    return { started: true, replayed: false, executionId: execution.id, status: execution.status };
  } catch (err) {
    return { started: false, replayed: false, executionId: null, status: 'engine_error', error: err instanceof Error ? err.message : String(err) };
  }
}

export async function emitWorkflowCompletion(params: { userId: string; executionId: string; workflowId: string; status: string; result?: Record<string, unknown>; originatingAgentId?: string | null; originatingRunId?: string | null; leadIds?: string[] }): Promise<void> {
  await enqueueEvent({ userId: params.userId, eventType: 'workflow_completion', payload: { executionId: params.executionId, workflowId: params.workflowId, status: params.status, result: params.result ?? {}, originatingAgentId: params.originatingAgentId ?? null, originatingRunId: params.originatingRunId ?? null, leadIds: params.leadIds ?? [] }, source: 'workflow-executor', correlationId: params.originatingRunId ?? params.executionId, executionId: params.executionId, idempotencyKey: `workflow-completion:${params.executionId}` });
}

export async function getWorkflowStatusForAgent(userId: string, executionId: string) {
  const execution = await db.workflowExecution.findFirst({ where: { id: executionId, userId }, select: { id: true, workflowId: true, status: true, currentStep: true, startedAt: true, completedAt: true, error: true, result: true } });
  if (!execution) throw new Error('Execution not found or not owned by caller');
  return execution;
}

export async function cancelWorkflowFromAgent(userId: string, agentId: string, executionId: string): Promise<{ cancelled: boolean; error?: string }> {
  let agent: Awaited<ReturnType<typeof db.agent.findFirst>> = null;
  try { agent = await db.agent.findFirst({ where: { id: agentId, userId } }); } catch { /* non-fatal */ }
  if (!agent) return { cancelled: false, error: 'Agent not found or not owned by caller' };
  const categories = parseAgentCategories(agent.permissionCategories);
  if (!categories.includes('MODIFY')) return { cancelled: false, error: 'Agent does not grant "MODIFY"' };
  try { const { cancelExecution } = await import('@/lib/workflow-executor'); await cancelExecution(executionId, userId); return { cancelled: true }; } catch (err) { return { cancelled: false, error: err instanceof Error ? err.message : String(err) }; }
}

export { parseAgentCategories };
