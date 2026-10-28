// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workstream D §7 — Autonomous Continuation Engine
//
// Agents continue work after a successful step WITHOUT the user pressing
// another button. The canonical acquisition pipeline:
//
//   Discovery → Research → Enrichment → Qualification → Gap Analysis →
//   Opportunity Analysis → Solution Mapping → Lead Score →
//   Workflow Selection → Outreach → [wait] → Reply received →
//   Reply Analysis → Follow-up → CRM update → (Reporting)
//
// DEPENDENCIES determine what can run in parallel — we do NOT blindly
// execute every agent in parallel. The graph below encodes:
//   · strict dependencies (Research needs Discovery's lead to exist)
//   · the independent parallel group (Opportunity / Gap / Solution can
//     run together AFTER Qualification — bounded by the agent's own
//     modelStrategy concurrency, default 1..3)
//   · the WAIT state (Outreach waits for human approval / send window;
//     Reply Analysis waits for an actual reply event)
//
// Bounded execution: one continuation step per lead per tick; each step
// is an idempotent AgentOperation (a step never repeats for the same
// lead + evidence version). Uses the EXISTING runAgent + scheduler
// heartbeat — no second scheduler.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

export type PipelineSystemKey =
  | 'DISCOVERY' | 'RESEARCH' | 'ENRICHMENT' | 'QUALIFICATION'
  | 'GAP_ANALYSIS' | 'OPPORTUNITY' | 'SOLUTION_MAPPING' | 'LEAD_SCORING'
  | 'OUTREACH' | 'REPLY_ANALYSIS' | 'FOLLOW_UP' | 'CRM' | 'REPORTING';

export interface PipelineNode {
  key: PipelineSystemKey;
  dependsOn: PipelineSystemKey[];
  parallelGroup?: boolean;
  waitsForEvent?: 'new_email' | 'follow_up_due';
  prompt: (leadId: string) => string;
}

export const PIPELINE: PipelineNode[] = [
  { key: 'DISCOVERY', dependsOn: [], prompt: (leadId) => `Continue the acquisition pipeline for lead ${leadId}: verify this lead still matches the ICP and record any missing discovery facts as evidence with confidence ratings.` },
  { key: 'RESEARCH', dependsOn: ['DISCOVERY'], prompt: (leadId) => `Research lead ${leadId}: company context, contact role, recent news, pain points. Record findings as evidence with confidence ratings.` },
  { key: 'ENRICHMENT', dependsOn: ['RESEARCH'], prompt: (leadId) => `Enrich lead ${leadId}: fill missing fields, verify existing ones, mark each enriched field with source + confidence.` },
  { key: 'QUALIFICATION', dependsOn: ['ENRICHMENT'], prompt: (leadId) => `Qualify lead ${leadId} with BANT/MEDDIC. Rate each dimension with evidence and output a tier (P0-P3) with reasoning.` },
  { key: 'GAP_ANALYSIS', dependsOn: ['QUALIFICATION'], parallelGroup: true, prompt: (leadId) => `Gap analysis for lead ${leadId}: what data is missing for the next lifecycle step? Prioritize gaps by impact.` },
  { key: 'OPPORTUNITY', dependsOn: ['QUALIFICATION'], parallelGroup: true, prompt: (leadId) => `Opportunity analysis for lead ${leadId}: deal size, fit, timing, probability of close — each with written justification.` },
  { key: 'SOLUTION_MAPPING', dependsOn: ['QUALIFICATION'], parallelGroup: true, prompt: (leadId) => `Solution mapping for lead ${leadId}: map solution capabilities to the lead's pain points (painPoint → feature → valueProposition → evidence).` },
  { key: 'LEAD_SCORING', dependsOn: ['GAP_ANALYSIS', 'OPPORTUNITY', 'SOLUTION_MAPPING'], prompt: (leadId) => `Score lead ${leadId} on fit, engagement, intent, timing. Produce the composite score with weighted reasoning and confidence.` },
  { key: 'OUTREACH', dependsOn: ['LEAD_SCORING'], prompt: (leadId) => `Draft personalized outreach for lead ${leadId} using its research, pain points and the solution map. Save via message.draft — NEVER auto-send.` },
  { key: 'REPLY_ANALYSIS', dependsOn: ['OUTREACH'], waitsForEvent: 'new_email', prompt: (leadId) => `A reply arrived for lead ${leadId}. Classify the intent, extract key points, and recommend the next action. For interested replies, draft a response.` },
  { key: 'FOLLOW_UP', dependsOn: ['REPLY_ANALYSIS'], waitsForEvent: 'follow_up_due', prompt: (leadId) => `Follow-up decision for lead ${leadId}: if appropriate, draft a contextual follow-up; if unresponsive after N attempts, recommend archival.` },
  { key: 'CRM', dependsOn: ['REPLY_ANALYSIS'], prompt: (leadId) => `Update CRM fields for lead ${leadId} from the latest activity: stage, status, next-step, and a summary note. NEVER delete records.` },
  { key: 'REPORTING', dependsOn: ['CRM'], prompt: () => `Generate a read-only pipeline health report: lead distribution by stage and agent performance, with numeric evidence.` },
];

const KEY_TO_NODE = new Map<PipelineSystemKey, PipelineNode>(PIPELINE.map((n) => [n.key, n]));

/**
 * Which step is NEXT for a lead: the first node whose dependencies are
 * all complete (have lead-scoped agent memory evidence) and which hasn't
 * itself run. WaitsForEvent nodes additionally require evidence that the
 * awaited event happened (e.g. an inbound email exists for the lead).
 */
export async function planNextStep(userId: string, leadId: string): Promise<{
  next: PipelineNode | null;
  completed: PipelineSystemKey[];
  blockedOn: 'waiting_for_reply' | 'waiting_for_follow_up_due' | 'pipeline_complete' | null;
}> {
  const completed = new Set<PipelineSystemKey>();

  let memories: Array<{ agentId: string; agent?: { systemKey: string | null } | null }> = [];
  try {
    memories = await db.agentMemory.findMany({
      where: { scope: 'lead', leadId, agent: { userId, classification: 'system' } },
      select: { agentId: true, agent: { select: { systemKey: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  } catch {
    // AgentMemory table or agent relation may not exist — degrade to no memory
  }
  for (const m of memories) {
    const key = m.agent?.systemKey as PipelineSystemKey | null;
    if (key && KEY_TO_NODE.has(key)) completed.add(key);
  }

  for (const node of PIPELINE) {
    if (completed.has(node.key)) continue;
    const depsMet = node.dependsOn.every((d) => completed.has(d));
    if (!depsMet) continue;
    if (node.waitsForEvent === 'new_email') {
      let hasInbound = false;
      try {
        hasInbound = !!(await db.emailMessage.findFirst({ where: { leadId, direction: 'inbound' }, select: { id: true } }));
      } catch { /* non-fatal */ }
      if (!hasInbound) return { next: null, completed: [...completed], blockedOn: 'waiting_for_reply' };
    }
    if (node.waitsForEvent === 'follow_up_due') {
      return { next: null, completed: [...completed], blockedOn: 'waiting_for_follow_up_due' };
    }
    return { next: node, completed: [...completed], blockedOn: null };
  }
  return { next: null, completed: [...completed], blockedOn: 'pipeline_complete' };
}

/**
 * Execute the NEXT pipeline step for a lead — autonomously, idempotently,
 * bounded. Called by the event dispatcher (new_lead / workflow_completion /
 * new_email / scheduled events) and safe to call repeatedly: the step is
 * an AgentOperation keyed on (lead, step, evidenceVersion = memory count).
 */
export async function continuePipelineForLead(params: {
  userId: string;
  leadId: string;
  maxSteps?: number;
  correlationId?: string;
}): Promise<{ ran: string[]; paused: string | null; note: string }> {
  const maxSteps = Math.min(Math.max(params.maxSteps ?? 1, 1), 4);
  const ran: string[] = [];
  let stepsLeft = maxSteps;

  while (stepsLeft > 0) {
    const plan = await planNextStep(params.userId, params.leadId);
    if (!plan.next) {
      return {
        ran,
        paused: plan.blockedOn,
        note: plan.blockedOn === 'pipeline_complete'
          ? 'Pipeline complete for this lead.'
          : `Pipeline paused: ${plan.blockedOn}`,
      };
    }

    const node = plan.next;
    const groupKeys: PipelineSystemKey[] = node.parallelGroup
      ? PIPELINE.filter((n) => n.parallelGroup && !plan.completed.includes(n.key)).map((n) => n.key)
      : [node.key];

    let memoryCount = 0;
    try {
      memoryCount = await db.agentMemory.count({ where: { scope: 'lead', leadId } });
    } catch { /* non-fatal */ }
    const evidenceVersion = `${plan.completed.length}:${memoryCount}`;

    for (const key of groupKeys.slice(0, 3)) {
      let agent: { id: string; userId: string; status: string; systemKey: string | null } | null = null;
      try {
        agent = await db.agent.findFirst({ where: { userId: params.userId, systemKey: key, classification: 'system', status: 'active' } });
      } catch { /* non-fatal */ }
      if (!agent) continue;

      try {
        const { withIdempotency } = await import('@/lib/ai/agent-idempotency');
        const { runAgent } = await import('@/lib/ai/agent-runtime');
        const op = await withIdempotency(
          {
            userId: params.userId,
            agentId: agent.id,
            operationType: 'continuation_step',
            target: `${key}:${params.leadId}`,
            input: {},
            evidenceVersion,
          },
          () => runAgent({
            agentId: agent!.id,
            userId: params.userId,
            triggerSource: `continuation:${key.toLowerCase()}`,
            initialPrompt: KEY_TO_NODE.get(key)!.prompt(params.leadId),
            leadId: params.leadId,
          }),
          (result) => ({ resultType: `agent_run:${result.status}`, resultId: result.runId, resultRef: JSON.stringify(result) }),
        ).catch((err: unknown) => ({
          replayed: false,
          result: { runId: '', status: 'failed', iterationsUsed: 0, tokensUsed: 0, toolsCalled: 0, finalAnswer: null, error: String(err), durationMs: 0 },
          operationId: '',
          fingerprint: '',
        }));

        if (!op.replayed) {
          ran.push(key);
          if (op.result && (op.result as { status: string }).status === 'paused_awaiting_approval') {
            return { ran, paused: 'awaiting_approval', note: `Step ${key} paused for human approval — escalation sent.` };
          }
        }
      } catch {
        // Agent runtime or idempotency unavailable — skip this step honestly
        continue;
      }
    }

    stepsLeft -= 1;
  }

  return { ran, paused: null, note: `Executed ${ran.join(', ') || '(all steps were idempotent replays)'}` };
}

/**
 * Event handlers for the dispatcher (registered at server startup).
 * Each handler is idempotent by construction.
 */
export async function handleNewLeadEvent(payload: Record<string, unknown>): Promise<void> {
  const leadId = String(payload.leadId ?? '');
  const userId = String(payload.userId ?? '');
  if (!leadId || !userId) return;
  await continuePipelineForLead({ userId, leadId, maxSteps: 2 });
}

export async function handleNewEmailEvent(payload: Record<string, unknown>): Promise<void> {
  const leadId = String(payload.leadId ?? '');
  const userId = String(payload.userId ?? '');
  if (!leadId || !userId) return;
  const plan = await planNextStep(userId, leadId);
  if (plan.next?.key === 'REPLY_ANALYSIS') {
    await continuePipelineForLead({ userId, leadId, maxSteps: 3 });
  }
}

export async function handleFollowUpDueEvent(payload: Record<string, unknown>): Promise<void> {
  const leadId = String(payload.leadId ?? '');
  const userId = String(payload.userId ?? '');
  if (!leadId || !userId) return;
  const plan = await planNextStep(userId, leadId);
  if (plan.next?.key === 'FOLLOW_UP') {
    await continuePipelineForLead({ userId, leadId, maxSteps: 2 });
  }
}

export async function handleScheduledEvent(payload: Record<string, unknown>): Promise<void> {
  const userId = String(payload.userId ?? '');
  if (!userId) return;
  let leadIds: Array<{ id: string }> = [];
  try {
    leadIds = await db.lead.findMany({ where: { userId, deletedAt: null }, select: { id: true }, take: 25, orderBy: { updatedAt: 'asc' } });
  } catch { return; }
  for (const lead of leadIds) {
    const plan = await planNextStep(userId, lead.id);
    if (plan.next && !plan.next.waitsForEvent) {
      await continuePipelineForLead({ userId, leadId: lead.id, maxSteps: 1 });
    }
  }
}

export async function handleWorkflowCompletionEvent(payload: Record<string, unknown>): Promise<void> {
  const originatingAgentId = payload.originatingAgentId ? String(payload.originatingAgentId) : null;
  const userId = String(payload.userId ?? '');
  const leadIds = Array.isArray(payload.leadIds) ? payload.leadIds.map(String) : [];
  for (const leadId of leadIds.slice(0, 5)) {
    await continuePipelineForLead({ userId, leadId, maxSteps: 1 });
  }
}

/**
 * Periodic pipeline sweep — advances leads that have pending pipeline steps
 * but no specific event trigger (new_lead, new_email, follow_up_due,
 * workflow_completion). Without this sweep, leads are stuck after the
 * initial 2 steps (DISCOVERY + RESEARCH) because ENRICHMENT, QUALIFICATION,
 * GAP_ANALYSIS, OPPORTUNITY, SOLUTION_MAPPING, LEAD_SCORING, OUTREACH, CRM,
 * and REPORTING have no specific event producer.
 *
 * Called from the EXISTING heartbeat/cron — NOT a second scheduler. Same
 * pattern as runAgentSchedulerTick + processPendingEvents + expireStaleApprovals.
 *
 * Bounded: 25 leads per tick (resumes next tick — not a product cap).
 * Idempotent: continuePipelineForLead uses withIdempotency per
 * (lead, step, evidenceVersion) — a step never repeats for the same lead.
 */
export async function runPipelineSweep(): Promise<{ checked: number; advanced: number }> {
  let leads: Array<{ id: string; userId: string }> = [];
  try {
    leads = await db.lead.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, userId: true },
      take: 25,
      orderBy: { updatedAt: 'asc' },
    });
  } catch {
    return { checked: 0, advanced: 0 };
  }

  let advanced = 0;
  for (const lead of leads) {
    try {
      const plan = await planNextStep(lead.userId, lead.id);
      if (plan.next && !plan.next.waitsForEvent) {
        await continuePipelineForLead({ userId: lead.userId, leadId: lead.id, maxSteps: 1 });
        advanced++;
      }
    } catch {
      // non-fatal — skip this lead, try next on the next tick
    }
  }

  return { checked: leads.length, advanced };
}
