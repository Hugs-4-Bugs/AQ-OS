// Agent Tool Authorization Chain — Workstream D §4
// The 9-check chain: user → agent → run → account → capability → permission → validation → idempotency → audit
import { db } from '@/lib/db';
import { invokeTool, getTool } from '@/lib/ai/agent-tools';
import type { ToolContext, ToolResult } from '@/lib/ai/agent-tools';
import { decideToolPermission, parseAgentCategories, requiresPreApproval, type PermissionCategory } from '@/lib/ai/agent-permission-policy';
import { withIdempotency } from '@/lib/ai/agent-idempotency';
import { resolveAccountForCapability, scopeGrantsCapability, scopeRequiresApproval } from '@/lib/connected-accounts/service';
import type { BusinessCapability } from '@/lib/connected-accounts/types';

const TOOL_TO_PROVIDER: Record<string, { provider: string; capability: BusinessCapability }> = {
  'businessEmail.send': { provider: 'hostinger-mail', capability: 'email.send' },
  'businessEmail.reply': { provider: 'hostinger-mail', capability: 'email.reply' },
};

export interface AgentToolAuthContext {
  userId: string; orgId?: string | null; agentId: string; runId: string;
  executionId?: string | null; leadId?: string | null;
  emailPermission: ToolContext['emailPermission']; toolLevelPermission: string | null;
  approvalPolicy: string; permissionCategoriesJson: string | null;
  invocationId?: string; log?: (event: string, details?: Record<string, unknown>) => void;
}

export interface AgentToolAuthOutcome { allowed: boolean; check: string; reason: string; approvalRequired?: boolean; category?: PermissionCategory | null }

export async function evaluateAuthorization(toolName: string, ctx: AgentToolAuthContext): Promise<AgentToolAuthOutcome> {
  const log = ctx.log ?? (() => {});
  if (!ctx.userId) return { allowed: false, check: '1_authenticated_user', reason: 'No authenticated user' };
  let agent: Awaited<ReturnType<typeof db.agent.findFirst>> = null;
  try { agent = await db.agent.findFirst({ where: { id: ctx.agentId, userId: ctx.userId } }); } catch { /* non-fatal */ }
  if (!agent) return { allowed: false, check: '2_agent_identity', reason: `Agent ${ctx.agentId} not found or not owned by user ${ctx.userId}` };
  if (agent.status !== 'active') return { allowed: false, check: '2_agent_identity', reason: `Agent status is "${agent.status}" — must be "active"` };
  let run: Awaited<ReturnType<typeof db.agentRun.findFirst>> = null;
  try { run = await db.agentRun.findFirst({ where: { id: ctx.runId, agentId: ctx.agentId, userId: ctx.userId } }); } catch { /* non-fatal */ }
  if (!run) return { allowed: false, check: '3_execution_identity', reason: `Run ${ctx.runId} not found for agent ${ctx.agentId}` };
  const routing = TOOL_TO_PROVIDER[toolName];
  if (routing) {
    try {
      const account = await resolveAccountForCapability(ctx.userId, routing.provider, routing.capability);
      if (!scopeGrantsCapability(account.scopes, routing.capability)) return { allowed: false, check: '5_requested_capability', reason: `Connected ${routing.provider} account does not grant scope "${routing.capability}"` };
    } catch (err) {
      return { allowed: false, check: '4_connected_account', reason: err instanceof Error ? err.message : String(err) };
    }
  }
  const categories = parseAgentCategories(ctx.permissionCategoriesJson);
  const decision = decideToolPermission({ toolName, agentCategories: categories });
  if (!decision.allowed) { log('authz_category_denied', { toolName, reason: decision.reason }); return { allowed: false, check: '6_permission_policy', reason: decision.reason, category: decision.category }; }
  const approvalRequired = requiresPreApproval({ toolName, agentCategories: categories, approvalPolicy: ctx.approvalPolicy, toolLevelPermission: ctx.toolLevelPermission });
  let scopeApproval = false;
  if (routing) { try { const account = await resolveAccountForCapability(ctx.userId, routing.provider, routing.capability); scopeApproval = scopeRequiresApproval(account.scopes, routing.capability); } catch { /* already validated */ } }
  log('authz_passed', { toolName, category: decision.category, approvalRequired: approvalRequired || scopeApproval });
  return { allowed: true, check: '6_permission_policy', reason: 'authorized', category: decision.category, approvalRequired: approvalRequired || scopeApproval };
}

export async function authorizeAndInvokeTool(toolName: string, input: unknown, ctx: AgentToolAuthContext): Promise<ToolResult> {
  const log = ctx.log ?? (() => {});
  const outcome = await evaluateAuthorization(toolName, ctx);
  if (!outcome.allowed) {
    log('authz_denied', { toolName, check: outcome.check, reason: outcome.reason });
    return { status: 'unauthorized', toolInvocationId: `toolinv-${toolName}-${ctx.runId}-denied`, durationMs: 0, error: `[authz:${outcome.check}] ${outcome.reason}` };
  }
  const tool = getTool(toolName);
  const idempotencyKey = `${ctx.runId}:${toolName}:${canonicalKey(input)}`;
  const buildContext = (): ToolContext => ({ userId: ctx.userId, orgId: ctx.orgId ?? null, emailPermission: ctx.emailPermission, invocationId: ctx.invocationId ?? ctx.runId, executionId: ctx.executionId ?? undefined, runId: ctx.runId, leadId: ctx.leadId ?? undefined, idempotencyKey, log: ctx.log ?? (() => {}) });
  const op = await withIdempotency(
    { userId: ctx.userId, agentId: ctx.agentId, runId: ctx.runId, operationType: 'tool_call', target: toolName, input: typeof input === 'object' ? input : String(input) },
    () => invokeTool(toolName, input, buildContext()),
    (result) => ({ resultType: `tool:${result.status}`, resultId: result.toolInvocationId, resultRef: JSON.stringify(result) }),
  );
  const result = op.result as ToolResult | null;
  if (op.replayed && result) { log('tool_idempotent_replay', { toolName, operationId: op.operationId }); return { ...result, fromCache: true }; }
  if (!result) return { status: 'error', toolInvocationId: `toolinv-${toolName}-${ctx.runId}-noop`, durationMs: 0, error: 'Idempotent execution produced no result' };
  return result;
}

function canonicalKey(input: unknown): string { try { return JSON.stringify(input ?? null); } catch { return 'unserializable'; } }
