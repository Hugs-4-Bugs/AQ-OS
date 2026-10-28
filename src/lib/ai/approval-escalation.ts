// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workstream D §8 — Human Approval / Escalation Runtime
//
// Extends Workstream C's approval foundation (AgentApproval + paused
// runs + checkpoints) into full runtime behavior:
//
//   1. pause execution          (agent-runtime already does this)
//   2. persist checkpoint       (agent-runtime already does this)
//   3. create approval request  (agent-runtime; HERE we enrich with the
//                                 §8 payload: reason, proposed action,
//                                 evidence, affected lead/account, exact
//                                 tool/action, risk level, expiration,
//                                 options, execution id, agent id)
//   4. notify human channel     (Telegram inline keyboard — §9 — or
//                                 in-app Notification fallback)
//   5. wait                      (durable — survives restarts; expiry
//                                 terminates deterministically)
//   6. process approve/reject   (API decide route / Telegram callback)
//   7. resume or terminate      (deterministic — no state lost)
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { enqueueEvent } from '@/lib/ai/agent-event-dispatcher';
import { withIdempotency } from '@/lib/ai/agent-idempotency';

const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h

/** Derive a risk level from the tool + input (defense-in-depth heuristic). */
export function deriveRiskLevel(toolName: string, input: Record<string, unknown>): 'low' | 'medium' | 'high' | 'critical' {
  if (toolName.includes('delete') || toolName.includes('lead.delete')) return 'critical';
  if (toolName === 'email.send' || toolName === 'email.reply' || toolName === 'businessEmail.send' || toolName === 'businessEmail.reply') {
    const recipients = String(input.to ?? '').split(',').filter(Boolean).length;
    return recipients > 5 ? 'high' : 'medium';
  }
  if (toolName.startsWith('workflow.')) return 'medium';
  return 'low';
}

/**
 * Step 3-5 — enrich a freshly-created approval with the §8 payload and
 * notify the configured human channel. Called by the agent runtime right
 * after it pauses a run (which has already persisted its checkpoint).
 */
export async function escalateApproval(params: {
  approvalId: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  expiresInMs?: number;
}): Promise<{ escalatedVia: 'telegram' | 'in_app' | 'none'; messageId: string | null }> {
  let approval: Awaited<ReturnType<typeof db.agentApproval.findUnique>> = null;
  try {
    approval = await db.agentApproval.findUnique({ where: { id: params.approvalId } });
  } catch {
    // Table may not exist yet — degrade gracefully
    return { escalatedVia: 'none', messageId: null };
  }
  if (!approval) throw new Error(`Approval ${params.approvalId} not found`);
  if (approval.status !== 'requested') throw new Error(`Approval ${params.approvalId} is already ${approval.status}`);

  let context: Record<string, unknown> = {};
  try { context = approval.context ? JSON.parse(approval.context) : {}; } catch { /* keep empty */ }
  let toolInput: Record<string, unknown> = {};
  try { toolInput = approval.input ? JSON.parse(approval.input) : {}; } catch { /* keep empty */ }

  const riskLevel = params.riskLevel ?? deriveRiskLevel(approval.toolName, toolInput);
  const expiresAt = new Date(Date.now() + (params.expiresInMs ?? DEFAULT_EXPIRY_MS));
  const proposedAction = buildProposedActionSummary(approval.toolName, toolInput);

  try {
    await db.agentApproval.update({
      where: { id: approval.id },
      data: { riskLevel, expiresAt, proposedAction, reason: approval.reason },
    });
  } catch { /* non-fatal */ }

  // ── Notify: Telegram first (configured human channel), in-app fallback ──
  let telegramConfig: { chatId?: string } | null = null;
  try {
    telegramConfig = await db.telegramConfig.findFirst({ where: { userId: approval.userId, isConnected: true } });
  } catch { /* non-fatal */ }

  if (telegramConfig?.chatId) {
    try {
      const { sendMessageWithKeyboard } = await import('@/lib/telegram-service');
      const text = `🔔 Agent needs approval: ${proposedAction} (risk: ${riskLevel})`;
      const buttons = [
        [{ text: '✅ Approve', callbackData: `appr:${approval.id}:approve` }],
        [{ text: '❌ Reject', callbackData: `appr:${approval.id}:reject` }],
      ];
      const sent = await sendMessageWithKeyboard(approval.userId, telegramConfig.chatId, text, buttons);
      try {
        await db.agentApproval.update({
          where: { id: approval.id },
          data: { escalationChannel: 'telegram', escalationMessageId: String(sent.telegramMessageId) },
        });
      } catch { /* non-fatal */ }
      return { escalatedVia: 'telegram', messageId: String(sent.telegramMessageId) };
    } catch {
      // Telegram failed → fall through to in-app
    }
  }

  // In-app fallback
  try {
    await db.notification.create({
      data: {
        userId: approval.userId,
        type: 'agent_approval',
        title: 'Agent approval required',
        message: `Agent needs approval: ${proposedAction} (risk: ${riskLevel})`.slice(0, 500),
        metadata: JSON.stringify({ approvalId: approval.id }),
      },
    });
    await db.agentApproval.update({ where: { id: approval.id }, data: { escalationChannel: 'in_app' } });
  } catch { /* non-fatal */ }
  return { escalatedVia: 'in_app', messageId: null };
}

/**
 * Steps 6-7 — process an approve/reject decision that arrived from ANY
 * channel (API decide route, Telegram callback, future channels).
 * Deterministic: the approval transitions exactly once; the paused run
 * resumes (approve) or terminates (reject) exactly once.
 */
export async function processApprovalDecisionFromChannel(params: {
  approvalId: string;
  action: 'approve' | 'reject' | 'view_evidence' | 'view_lead' | 'modify';
  userId: string;
  channel: 'telegram' | 'in_app' | 'api';
  channelMessageId?: string | null;
  note?: string;
}): Promise<{ decided: boolean; message: string; runStatus?: string }> {
  const { approvalId, action, userId } = params;

  // View actions don't transition the approval
  if (action === 'view_evidence' || action === 'view_lead' || action === 'modify') {
    return { decided: false, message: 'View/modify action — no decision recorded' };
  }

  // Idempotent per (approvalId, decision) — double-clicks or racing channels
  // can never double-execute.
  const op = await withIdempotency(
    { userId, operationType: 'approval_resume', target: approvalId, input: { action } },
    () => decideApproval(params),
    (result) => ({ resultType: `approval:${action}`, resultId: approvalId, resultRef: JSON.stringify(result) }),
  ).catch((err: unknown) => ({
    replayed: false,
    result: { decided: false, message: String(err), runStatus: undefined } as { decided: boolean; message: string; runStatus?: string },
    operationId: '',
    fingerprint: '',
  }));

  const result = (op.result ?? { decided: false, message: 'No result' }) as { decided: boolean; message: string; runStatus?: string };
  if (op.replayed && result) {
    return { ...result, message: `${result.message} (already processed)` };
  }
  return result;
}

async function decideApproval(params: {
  approvalId: string;
  action: 'approve' | 'reject';
  userId: string;
  channel: string;
  note?: string;
}): Promise<{ decided: boolean; message: string; runStatus?: string }> {
  const { approvalId, action, userId } = params;

  let approval: Awaited<ReturnType<typeof db.agentApproval.findFirst>> = null;
  try {
    approval = await db.agentApproval.findFirst({ where: { id: approvalId, userId } });
  } catch {
    return { decided: false, message: 'Approval table unavailable' };
  }
  if (!approval) throw new Error('Approval not found or not owned by this user');

  if (approval.status !== 'requested') {
    return { decided: false, message: `Approval is already ${approval.status}` };
  }

  // Expiry check
  if (approval.expiresAt && approval.expiresAt.getTime() < Date.now()) {
    try {
      await db.agentApproval.update({
        where: { id: approval.id },
        data: { status: 'expired', decidedAt: new Date(), decidedBy: userId },
      });
      await db.agentRun.updateMany({
        where: { id: approval.runId, status: 'paused_awaiting_approval' },
        data: { status: 'failed', error: `Approval ${approval.id} expired without a decision` },
      }).catch(() => {});
    } catch { /* non-fatal */ }
    return { decided: false, message: 'Approval expired — the paused run was terminated', runStatus: 'failed' };
  }

  // Transition the approval exactly once (CAS via updateMany)
  let transitioned: { count: number } = { count: 0 };
  try {
    transitioned = await db.agentApproval.updateMany({
      where: { id: approval.id, status: 'requested' },
      data: {
        status: action === 'approve' ? 'approved' : 'rejected',
        decidedAt: new Date(),
        decidedBy: userId,
        decisionNote: params.note ?? null,
      },
    });
  } catch {
    return { decided: false, message: 'Failed to transition approval' };
  }
  if (transitioned.count === 0) {
    return { decided: false, message: 'Approval is already processed' };
  }

  // Emit the approval_response event — the dispatcher's handler performs
  // the actual resume/terminate (single code path for ALL channels).
  await enqueueEvent({
    userId,
    eventType: 'approval_response',
    payload: { approvalId: approval.id, decision: action, toolName: approval.toolName, runId: approval.runId, agentId: approval.agentId, channel: params.channel },
    source: `approval-decision:${params.channel}`,
    correlationId: approval.runId,
    idempotencyKey: `approval-response:${approval.id}:${action}`,
  }).catch(() => {});

  const message = action === 'approve'
    ? 'Approved — the agent run is resuming from its checkpoint.'
    : 'Rejected — the paused run will follow the configured rejection policy.';
  return { decided: true, message, runStatus: action === 'approve' ? 'resuming' : 'terminating' };
}

/** Terminate approvals that expired without a decision (scheduled sweep). */
export async function expireStaleApprovals(): Promise<{ expired: number }> {
  let stale: Array<{ id: string; runId: string }> = [];
  try {
    stale = await db.agentApproval.findMany({ where: { status: 'requested', expiresAt: { lt: new Date() } }, take: 50, select: { id: true, runId: true } });
  } catch { return { expired: 0 }; }
  for (const approval of stale) {
    try {
      await db.agentApproval.update({ where: { id: approval.id }, data: { status: 'expired', decidedAt: new Date() } });
      await db.agentRun.updateMany({ where: { id: approval.runId, status: 'paused_awaiting_approval' }, data: { status: 'failed', error: `Approval ${approval.id} expired`, completedAt: new Date() } });
    } catch { /* non-fatal */ }
  }
  return { expired: stale.length };
}

function buildProposedActionSummary(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'email.send': case 'businessEmail.send':
      return `Send email to ${String(input.to ?? '?')} — "${String(input.subject ?? '').slice(0, 80)}"`;
    case 'email.reply': case 'businessEmail.reply':
      return `Reply to ${String(input.to ?? '?')} — "${String(input.subject ?? '').slice(0, 80)}"`;
    case 'lead.delete':
      return `Delete lead ${String(input.id ?? input.leadId ?? '?')}`;
    case 'workflow.start':
      return `Start workflow ${String(input.workflowId ?? '?')}`;
    default:
      return `Execute ${toolName}${Object.keys(input).length ? ` with ${Object.keys(input).slice(0, 5).join(', ')}` : ''}`;
  }
}

/**
 * The approval_response EVENT HANDLER (registered at startup).
 *
 * This handler is invoked by the event dispatcher when an approval_response
 * event is processed. It performs the ACTUAL resume/terminate:
 *
 *   Approve → execute the approved tool exactly once (persistent idempotency
 *     via authorizeAndInvokeTool which wraps withIdempotency) → resume the
 *     agent run from its checkpoint → update the run status.
 *
 *   Reject → terminate the paused run → record the rejection in agent memory
 *     so the agent learns the outcome on its next run.
 *
 * This runs inside the event dispatcher tick — idempotent. A duplicate event
 * (retry) finds the approval already transitioned + the tool already executed
 * (withIdempotency replay) → no double-execution.
 */
export async function handleApprovalResponseEvent(payload: Record<string, unknown>): Promise<void> {
  const approvalId = String(payload.approvalId ?? '');
  const decision = String(payload.decision ?? '');
  if (!approvalId || !decision) return;

  let approval: Awaited<ReturnType<typeof db.agentApproval.findUnique>> = null;
  try {
    approval = await db.agentApproval.findUnique({ where: { id: approvalId } });
  } catch {
    return; // table unavailable — nothing to do
  }
  if (!approval) return;

  if (decision === 'approve') {
    // Execute the approved tool exactly once through the full authorization
    // chain (agent-authz.ts). authorizeAndInvokeTool wraps the invocation in
    // withIdempotency (persistent AgentOperation fingerprint) — a retry of
    // this event returns the existing result without re-executing.
    let toolInput: Record<string, unknown> = {};
    try { toolInput = approval.input ? JSON.parse(approval.input) : {}; } catch { /* keep default */ }

    let agent: Awaited<ReturnType<typeof db.agent.findUnique>> = null;
    try {
      agent = await db.agent.findUnique({ where: { id: approval.agentId } });
    } catch { /* non-fatal */ }
    if (!agent) return;

    try {
      const { authorizeAndInvokeTool } = await import('@/lib/ai/agent-authz');
      const authzCtx = {
        userId: approval.userId,
        orgId: agent.orgId || null,
        agentId: approval.agentId,
        runId: approval.runId,
        executionId: null,
        leadId: typeof toolInput.leadId === 'string' ? toolInput.leadId : null,
        emailPermission: 'autonomous' as const,
        toolLevelPermission: 'autonomous',
        approvalPolicy: 'autonomous',
        permissionCategoriesJson: (agent as { permissionCategories?: string | null }).permissionCategories ?? null,
        invocationId: `approval:${approval.id}`,
        log: (event: string, details?: Record<string, unknown>) => console.log(`[ApprovalExec ${approval.id}] ${event}`, details || ''),
      };
      const toolResult = await authorizeAndInvokeTool(approval.toolName, toolInput, authzCtx);

      try {
        await db.agentApproval.update({
          where: { id: approval.id },
          data: { invocationResult: JSON.stringify(toolResult.output || toolResult.error) },
        });
      } catch { /* non-fatal */ }

      // Resume the agent run from its checkpoint (§8 step 7 — no state lost).
      const { runAgent } = await import('@/lib/ai/agent-runtime');
      const resume = await runAgent({
        agentId: approval.agentId,
        userId: approval.userId,
        triggerSource: `approval:${approval.id}`,
        resumeFromRunId: approval.runId,
        leadId: typeof toolInput.leadId === 'string' ? toolInput.leadId : undefined,
      });

      try {
        await db.agentRun.updateMany({
          where: { id: approval.runId, status: 'paused_awaiting_approval' },
          data: {
            status: resume.status,
            error: resume.error,
            completedAt: ['completed', 'failed', 'cancelled', 'timeout'].includes(resume.status) ? new Date() : null,
          },
        });
      } catch { /* non-fatal */ }
    } catch (err) {
      console.error(`[handleApprovalResponseEvent] approve execution failed for ${approvalId}:`, err);
      throw err; // re-throw so the event dispatcher can retry
    }
  }

  if (decision === 'reject') {
    // Rejection policy: terminate the paused run + record the reason in
    // agent memory so the agent learns the outcome on its next run.
    try {
      await db.agentRun.updateMany({
        where: { id: approval.runId, status: 'paused_awaiting_approval' },
        data: { status: 'cancelled', error: `Approval ${approval.id} rejected by human`, completedAt: new Date() },
      });
    } catch { /* non-fatal */ }

    try {
      const { appendMemoryScoped } = await import('@/lib/ai/agent-memory-service');
      await appendMemoryScoped({
        agentId: approval.agentId,
        runId: approval.runId,
        role: 'system',
        content: `HUMAN_REJECTED: tool=${approval.toolName} approvalId=${approval.id} note=${approval.decisionNote ?? '(none)'}`,
        tokensUsed: 0,
        scope: 'agent',
        source: 'human:rejection',
        freshness: 'real-time',
        confidence: 1.0,
      });
    } catch { /* non-fatal */ }

    // Notify the user that the rejection was processed.
    try {
      await db.notification.create({
        data: {
          userId: approval.userId,
          type: 'agent_approval',
          title: 'Agent approval rejected',
          message: `Rejected — agent run ${approval.runId.slice(-8)} terminated.`.slice(0, 500),
        },
      });
    } catch { /* non-fatal */ }
  }
}
