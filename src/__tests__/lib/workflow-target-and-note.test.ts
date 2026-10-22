// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Task 1 — Workflow Target Foundation + add_note content fix
//
// Covers:
//   1. executeAddNote contextual content derivation (the "Note content is
//      required" root cause of failing normal runs).
//   2. AI-generate defaulting add_note content (creation path fix).
//   3. POST /api/workflows/[id]/execute target modes:
//        • selected_leads — multi-lead, per-lead executions, target snapshot
//        • all-or-nothing ownership validation (foreign/unknown lead)
//        • PLAN ENTITLEMENT limit — Free=10, Starter=25, Pro/Elite unlimited
//          (NO arbitrary hard-coded cap; the regression test proves 30
//          selected leads are allowed on Pro).
//        • niche resolution — scoped to the caller's own leads, exact match
//        • custom resolution — scoped to the caller's own leads
//        • legacy single-lead + no-target body compatibility
//        • honest failure surfacing
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ── Shared mocks (hoisted) ────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const state = {
    user: { id: 'user_1', email: 't@t.test', name: 'T', role: 'owner', plan: 'pro', orgId: null },
  };
  return {
    state,
    db: {
      workflowDefinition: { findFirst: vi.fn(), findUnique: vi.fn() },
      workflowExecution: { findMany: vi.fn(), findUnique: vi.fn() },
      workflowExecutionLead: { findMany: vi.fn() },
      lead: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
      leadActivity: { create: vi.fn() },
      leadNote: { create: vi.fn() },
      leadScore: { create: vi.fn() },
      notification: { create: vi.fn() },
      outreachMessage: { create: vi.fn() },
      emailAccount: { findFirst: vi.fn() },
      telegramConfig: { findFirst: vi.fn() },
      whatsappConfig: { findFirst: vi.fn() },
      dataExport: { create: vi.fn() },
    },
    sendEmail: vi.fn(),
    resolveLeadForExecution: vi.fn(),
    executeWorkflow: vi.fn(),
    executeWorkflowBatch: vi.fn(),
    executeNicheRunWithDiscovery: vi.fn(),
    isZaiProviderConfigured: vi.fn(),
    getLeadCounts: vi.fn(),
    chargeWorkflowExecutionFee: vi.fn(),
    refundWorkflowExecutionFee: vi.fn(),
    deductCredits: vi.fn(),
    loadPersonalContextForAi: vi.fn(),
    zaiCreate: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/email', () => ({ sendEmail: mocks.sendEmail }));
// Part 2 — quota gate passthrough (dedicated part2-daily-quota suite covers
// the limit behavior; these suites test other action concerns).
vi.mock('@/lib/daily-outreach-quota', () => ({
  reserveDailyOutreachSend: vi.fn(async () => ({
    allowed: true, used: 0, limit: 500, remaining: 500, dateKey: '2026-10-21', timezone: 'UTC',
  })),
  DAILY_OUTREACH_LIMIT_EXCEEDED: 'DAILY_OUTREACH_LIMIT_EXCEEDED',
}));
vi.mock('@/lib/lead-audit', () => ({ logAuditEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/lead-score-recalc', () => ({ recalcLeadScores: vi.fn(async () => {}) }));
vi.mock('@/lib/ai/sender-signature', () => ({
  buildSenderSignatureBlock: vi.fn(() => ''),
  applySenderSignature: vi.fn((x: string) => x),
}));
vi.mock('@/lib/ai/outreach-generator', () => ({ loadSenderProfile: vi.fn(async () => null) }));
vi.mock('@/lib/personal-context', () => ({
  buildPersonalContextBlockForUser: vi.fn(async () => ''),
  loadPersonalContextForAi: mocks.loadPersonalContextForAi,
}));
vi.mock('@/lib/lead-resolution', () => ({ resolveLeadForExecution: mocks.resolveLeadForExecution }));
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: vi.fn(async (_req: unknown, handler: (u: unknown) => unknown) => handler(mocks.state.user)),
}));
vi.mock('@/lib/entitlement-middleware', () => ({
  checkPlanEntitlement: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/workflow-engine', () => ({
  executeWorkflow: mocks.executeWorkflow,
}));
vi.mock('@/lib/workflow-batch', () => ({
  executeWorkflowBatch: mocks.executeWorkflowBatch,
  executeNicheRunWithDiscovery: mocks.executeNicheRunWithDiscovery,
  isZaiProviderConfigured: mocks.isZaiProviderConfigured,
}));
vi.mock('@/lib/workflow-execution-leads', () => ({
  getLeadCounts: mocks.getLeadCounts,
  hasLeadItems: vi.fn(async () => false),
}));
vi.mock('@/lib/workflow-credits', () => ({
  chargeWorkflowExecutionFee: mocks.chargeWorkflowExecutionFee,
  refundWorkflowExecutionFee: mocks.refundWorkflowExecutionFee,
  WORKFLOW_EXECUTION_FEE_CREDITS: 5,
}));
vi.mock('@/lib/credit-service', () => ({
  deductCredits: vi.fn(async () => ({ success: true, balance: 100 })),
}));
vi.mock('@/lib/billing-audit', () => ({ logEntitlementEvent: vi.fn(async () => {}) }));
vi.mock('z-ai-web-dev-sdk', () => ({
  default: { create: mocks.zaiCreate },
}));

import { executeAction } from '@/lib/workflow-actions';
import { POST as executeRoute } from '@/app/api/workflows/[id]/execute/route';
import { POST as aiGenerateRoute } from '@/app/api/workflows/ai-generate/route';

const CTX = {
  userId: 'user_1',
  workflowId: 'wf_1',
  executionId: 'exec_1',
  leadId: 'lead_1',
} as const;

function makeExecuteRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/workflows/wf_1/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function callExecuteRoute(body: unknown) {
  const res = await executeRoute(makeExecuteRequest(body), {
    params: Promise.resolve({ id: 'wf_1' }),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const lead = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  businessName: name,
  niche: 'Stationery',
  city: 'Mumbai',
  stage: 'discovered',
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  // Fast tests: no stagger, quick settle, quick poll.
  process.env.WORKFLOW_KICK_STAGGER_MS = '0';
  process.env.WORKFLOW_BATCH_SETTLE_MS = '2000';
  process.env.WORKFLOW_BATCH_POLL_MS = '1';
  mocks.state.user.plan = 'pro';
  mocks.sendEmail.mockResolvedValue({ sent: true, messageId: 'msg_test' });
  mocks.db.workflowDefinition.findFirst.mockResolvedValue({
    id: 'wf_1', userId: 'user_1', name: 'Follow-up', status: 'active', disabledBySubscription: false,
    // Phase 3: Run Now now pre-flight-validates the persisted definition —
    // the mocked workflow carries a valid nodes-based definition.
    nodes: JSON.stringify([
      { id: 'n_trigger', type: 'trigger', title: 'Trigger', config: {} },
      { id: 'n_note', type: 'action', title: 'Record activity', config: { actionType: 'add_note', content: 'Contacted' } },
    ]),
    workflowSteps: [],
  });
  mocks.resolveLeadForExecution.mockImplementation(async (_userId: string, leadId: string) => {
    const known: Record<string, { id: string; businessName: string; niche: string; city: string; stage: string }> = {
      lead_a: lead('lead_a', 'Alpha'),
      lead_b: lead('lead_b', 'Bravo'),
      lead_c: lead('lead_c', 'Charlie'),
    };
    const l = known[leadId];
    return l
      ? { ok: true, lead: l }
      : { ok: false, reason: 'LEAD_NOT_FOUND', userMessage: 'Lead not found' };
  });
  mocks.executeWorkflow.mockImplementation(async () => ({
    executionId: `exec_${Math.random().toString(36).slice(2, 8)}`,
    status: 'running',
  }));
  // Multi-lead model: ONE grouped execution per run; the settle path
  // reads the execution row + its per-lead items.
  mocks.executeWorkflowBatch.mockImplementation(
    async (_wf: string, _user: string, opts: { leads: { id: string; businessName: string }[] }) => ({
      executionId: 'exec_batch_1',
      status: 'running',
      leadCount: opts.leads.length,
      stepsCompleted: 0,
    }),
  );
  mocks.isZaiProviderConfigured.mockReturnValue(true);
  mocks.executeNicheRunWithDiscovery.mockResolvedValue({ executionId: 'exec_disc_1', status: 'discovering' });
  mocks.chargeWorkflowExecutionFee.mockResolvedValue({ ok: true, alreadyProcessed: false, newBalance: 95 });
  mocks.refundWorkflowExecutionFee.mockResolvedValue({ refunded: true, newBalance: 100 });
  mocks.db.workflowExecution.findMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) => {
    const ids = args?.where?.id?.in || [];
    return ids.map((id: string) => ({ id, status: 'completed', error: null, currentStep: 4 }));
  });
  mocks.db.workflowExecution.findUnique.mockResolvedValue({ id: 'exec_batch_1', status: 'completed', error: null, currentStep: 4 });
  mocks.db.workflowExecutionLead.findMany.mockImplementation(
    async ({ where }: { where: { executionId: string } }) => {
      if (where.executionId !== 'exec_batch_1') return [];
      const leads = mocks.executeWorkflowBatch.mock.calls[0]?.[2]?.leads ?? [];
      return leads.map((l: { id: string; businessName: string }) => ({
        leadId: l.id, leadName: l.businessName, status: 'completed', error: null,
      }));
    },
  );
  mocks.getLeadCounts.mockImplementation(async () => {
    const n = mocks.executeWorkflowBatch.mock.calls[0]?.[2]?.leads?.length ?? 0;
    return { total: n, pending: 0, running: 0, completed: n, failed: 0, skipped: 0 };
  });
});

afterEach(() => {
  delete process.env.WORKFLOW_KICK_STAGGER_MS;
  delete process.env.WORKFLOW_BATCH_SETTLE_MS;
  delete process.env.WORKFLOW_BATCH_POLL_MS;
});

// ── 1. executeAddNote content policy ─────────────────────────────

describe('executeAction add_note — content policy', () => {
  it('derives an informative contextual note when config.content is missing (the reported bug)', async () => {
    mocks.resolveLeadForExecution.mockResolvedValue({
      ok: true, lead: { businessName: 'Read and Brew', stage: 'contacted' },
    });
    mocks.db.workflowDefinition.findUnique.mockResolvedValue({ name: 'Local Lead Follow-up Sequence' });
    mocks.db.leadNote.create.mockResolvedValue({ id: 'note_1' });

    const res = await executeAction('add_note', { actionType: 'add_note' }, { ...CTX });

    expect(res.success).toBe(true);
    expect(res.output).toEqual({ noteId: 'note_1' });
    const created = mocks.db.leadNote.create.mock.calls[0][0];
    expect(created.data.leadId).toBe('lead_1');
    expect(created.data.userId).toBe('user_1');
    expect(created.data.content).toContain('Local Lead Follow-up Sequence');
    expect(created.data.content).toContain('Read and Brew');
    expect(created.data.content).toContain('contacted');
    expect(created.data.content).toContain('exec_1');
  });

  it('uses explicit configured content (with {{templates}}) as-is', async () => {
    mocks.db.leadNote.create.mockResolvedValue({ id: 'note_2' });

    const res = await executeAction(
      'add_note',
      { content: 'Follow-up done for lead {{leadId}} by run {{executionId}}', pinned: true },
      { ...CTX }
    );

    expect(res.success).toBe(true);
    const created = mocks.db.leadNote.create.mock.calls[0][0];
    expect(created.data.content).toBe('Follow-up done for lead lead_1 by run exec_1');
    expect(created.data.pinned).toBe(true);
    // No contextual lookups — explicit content short-circuits them.
    expect(mocks.resolveLeadForExecution).not.toHaveBeenCalled();
  });

  it('fails honestly with no lead context', async () => {
    const res = await executeAction('add_note', { content: 'x' }, {
      userId: 'user_1', workflowId: 'wf_1', executionId: 'exec_1',
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/lead context/i);
    expect(mocks.db.leadNote.create).not.toHaveBeenCalled();
  });

  it('falls back to generic labels when the lead cannot be re-resolved', async () => {
    mocks.resolveLeadForExecution.mockResolvedValue({ ok: false, reason: 'LEAD_NOT_FOUND', userMessage: 'Lead not found' });
    mocks.db.workflowDefinition.findUnique.mockResolvedValue(null);
    mocks.db.leadNote.create.mockResolvedValue({ id: 'note_3' });

    const res = await executeAction('add_note', {}, { ...CTX });

    expect(res.success).toBe(true);
    const created = mocks.db.leadNote.create.mock.calls[0][0];
    expect(created.data.content).toContain('lead lead_1');
    expect(created.data.content).toContain('"workflow"');
  });
});

// ── 2. AI-generate defaulting ────────────────────────────────────

describe('POST /api/workflows/ai-generate — add_note content default', () => {
  it('defaults informative content for a model-omitted add_note step', async () => {
    mocks.loadPersonalContextForAi.mockResolvedValue({ block: '' });
    const generatedWorkflow = {
      name: 'AI Note Flow',
      description: 'd',
      triggerType: 'manual',
      steps: [
        { nodeType: 'action', actionType: 'add_note', title: 'Record activity', config: {} },
      ],
    };
    const createMock = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(generatedWorkflow) } }],
    });
    mocks.zaiCreate.mockResolvedValue({
      chat: { completions: { create: createMock } },
    });

    const req = new NextRequest('http://localhost/api/workflows/ai-generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'wait 2 hours then record an activity' }),
    });
    const res = await aiGenerateRoute(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    const noteStep = json.payload.steps.find(
      (s: { config: { actionType?: string } }) => s.config.actionType === 'add_note'
    );
    expect(noteStep).toBeDefined();
    expect(String(noteStep.config.content).trim().length).toBeGreaterThan(0);
  });
});

// ── 3. Execute route — selected_leads ────────────────────────────

describe('POST /api/workflows/[id]/execute — selected_leads target', () => {
  it('executes ONE grouped run over the selected leads and persists the target snapshot', async () => {
    const { status, json } = await callExecuteRoute({
      target: { mode: 'selected_leads', leadIds: ['lead_a', 'lead_b', 'lead_c'] },
    });

    expect(status).toBe(202);
    expect(json.status).toBe('completed');
    expect(json.target.mode).toBe('selected_leads');
    expect(json.target.leadCount).toBe(3);
    // ONE execution row for the whole run; per-lead outcomes ride on it.
    expect(json.executionId).toBe('exec_batch_1');
    expect(json.leads).toHaveLength(3);
    expect(mocks.executeWorkflowBatch).toHaveBeenCalledTimes(1);

    const batchCall = mocks.executeWorkflowBatch.mock.calls[0];
    expect(batchCall[0]).toBe('wf_1');
    expect(batchCall[1]).toBe('user_1');
    expect((batchCall[2] as { leads: { id: string }[] }).leads.map((l) => l.id)).toEqual([
      'lead_a', 'lead_b', 'lead_c',
    ]);
    const snapshot = (batchCall[2] as { targetSnapshot: Record<string, unknown> }).targetSnapshot;
    expect(snapshot.mode).toBe('selected_leads');
    expect(snapshot.selectedLeadIds).toEqual(['lead_a', 'lead_b', 'lead_c']);
    expect(typeof snapshot.runBatchId).toBe('string');
    // One stable batch idempotency key (replay → same execution).
    expect((batchCall[2] as { idempotencyKey: string }).idempotencyKey).toMatch(/^batch_run_/);
    // Background kick: the route settles by polling, never inline awaits.
    expect((batchCall[2] as { awaitCompletion?: boolean }).awaitCompletion).toBe(false);
  });

  it('rejects the whole request (all-or-nothing) when one selected lead is foreign', async () => {
    const before = mocks.executeWorkflow.mock.calls.length;
    const { status, json } = await callExecuteRoute({
      target: { mode: 'selected_leads', leadIds: ['lead_a', 'foreign_lead'] },
    });

    expect(status).toBe(400);
    expect(json.code).toBe('LEAD_NOT_FOUND');
    expect(json.error).toMatch(/1 of 2/);
    expect(json.error).toMatch(/Nothing was executed/i);
    expect(mocks.executeWorkflow.mock.calls.length).toBe(before);
  });

  it('deduplicates repeated lead ids in one request', async () => {
    const { json } = await callExecuteRoute({
      target: { mode: 'selected_leads', leadIds: ['lead_a', 'lead_a', 'lead_b'] },
    });
    expect(json.target.leadCount).toBe(2);
    expect(mocks.executeWorkflowBatch).toHaveBeenCalledTimes(1);
    expect((mocks.executeWorkflowBatch.mock.calls[0][2] as { leads: unknown[] }).leads).toHaveLength(2);
  });

  it('rejects an empty selection', async () => {
    const { status, json } = await callExecuteRoute({ target: { mode: 'selected_leads', leadIds: [] } });
    expect(status).toBe(400);
    expect(json.code).toBe('NO_LEADS_SELECTED');
  });
});

// ── 4. Execute route — PLAN ENTITLEMENT limit (no arbitrary cap) ──

describe('POST /api/workflows/[id]/execute — plan entitlement limit on selection size', () => {
  const manyIds = (n: number) => Array.from({ length: n }, (_, i) => `lead_${i}`);

  it('rejects 11 selected leads on the FREE plan (limit 10) with the plan-limit message', async () => {
    mocks.state.user.plan = 'free';
    const { status, json } = await callExecuteRoute({
      target: { mode: 'selected_leads', leadIds: manyIds(11) },
    });

    expect(status).toBe(400);
    expect(json.code).toBe('PLAN_LEAD_LIMIT_EXCEEDED');
    expect(json.plan).toBe('free');
    expect(json.limit).toBe(10);
    expect(json.selected).toBe(11);
    expect(json.error).toMatch(/free plan allows up to 10 leads/i);
    expect(mocks.executeWorkflow).not.toHaveBeenCalled();
  });

  it('rejects 26 selected leads on the STARTER plan (limit 25)', async () => {
    mocks.state.user.plan = 'starter';
    const { status, json } = await callExecuteRoute({
      target: { mode: 'selected_leads', leadIds: manyIds(26) },
    });

    expect(status).toBe(400);
    expect(json.code).toBe('PLAN_LEAD_LIMIT_EXCEEDED');
    expect(json.limit).toBe(25);
    expect(mocks.executeWorkflow).not.toHaveBeenCalled();
  });

  it('allows exactly the limit on the STARTER plan (25 selected → ONE grouped execution over 25 leads)', async () => {
    mocks.state.user.plan = 'starter';
    // All 25 ids resolve as owned leads.
    mocks.resolveLeadForExecution.mockImplementation(async (_u: string, id: string) => ({
      ok: true, lead: lead(id, `Lead ${id}`),
    }));
    const { status, json } = await callExecuteRoute({
      target: { mode: 'selected_leads', leadIds: manyIds(25) },
    });

    expect(status).toBe(202);
    expect(json.target.leadCount).toBe(25);
    expect(mocks.executeWorkflowBatch).toHaveBeenCalledTimes(1);
    expect((mocks.executeWorkflowBatch.mock.calls[0][2] as { leads: unknown[] }).leads).toHaveLength(25);
  });

  it('PRO plan: 30 selected leads are ALLOWED in ONE grouped execution (regression: the arbitrary 25 hard cap is gone)', async () => {
    mocks.resolveLeadForExecution.mockImplementation(async (_u: string, id: string) => ({
      ok: true, lead: lead(id, `Lead ${id}`),
    }));
    const { status, json } = await callExecuteRoute({
      target: { mode: 'selected_leads', leadIds: manyIds(30) },
    });

    expect(status).toBe(202);
    expect(json.target.leadCount).toBe(30);
    expect(mocks.executeWorkflowBatch).toHaveBeenCalledTimes(1);
    expect((mocks.executeWorkflowBatch.mock.calls[0][2] as { leads: unknown[] }).leads).toHaveLength(30);
  });

  it('ELITE plan (unlimited) rejects nothing for a large valid selection — ONE grouped execution', async () => {
    mocks.state.user.plan = 'elite';
    mocks.resolveLeadForExecution.mockImplementation(async (_u: string, id: string) => ({
      ok: true, lead: lead(id, `Lead ${id}`),
    }));
    const { status } = await callExecuteRoute({
      target: { mode: 'selected_leads', leadIds: manyIds(40) },
    });
    expect(status).toBe(202);
    expect(mocks.executeWorkflowBatch).toHaveBeenCalledTimes(1);
    expect((mocks.executeWorkflowBatch.mock.calls[0][2] as { leads: unknown[] }).leads).toHaveLength(40);
  });

  it('uses the entitlement config as the source of the limit (Free=10, Starter=25, Pro/Elite=null)', async () => {
    // Import the REAL entitlement config (not mocked) and assert the values
    // the route's limit check depends on.
    const { ENTITLEMENTS } = await import('@/lib/entitlement-service');
    expect(ENTITLEMENTS.free.lead_discovery.limit).toBe(10);
    expect(ENTITLEMENTS.starter.lead_discovery.limit).toBe(25);
    expect(ENTITLEMENTS.pro.lead_discovery.limit).toBeNull();
    expect(ENTITLEMENTS.elite.lead_discovery.limit).toBeNull();
  });
});

// ── 5. Execute route — niche / custom targets ────────────────────

describe('POST /api/workflows/[id]/execute — niche target', () => {
  it("resolves the niche against the caller's own leads only (exact, case-insensitive)", async () => {
    mocks.db.lead.findMany.mockResolvedValue([
      lead('lead_a', 'Alpha', { niche: 'stationery' }),
      lead('lead_b', 'Bravo', { niche: 'Stationery Design' }), // not an exact match
    ]);

    const { status, json } = await callExecuteRoute({
      target: { mode: 'niche', niche: 'Stationery' },
    });

    // Only lead_a is an exact (case-insensitive) niche match.
    expect(status).toBe(202);
    expect(json.target.leadCount).toBe(1);
    expect(json.executions[0].leadId).toBe('lead_a');
    const where = mocks.db.lead.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe('user_1');
    expect(where.isActive).toBe(true);
  });

  it('bridges to discovery when no own leads match the niche (structured, no upfront charge)', async () => {
    mocks.db.lead.findMany.mockResolvedValue([]);
    const { status, json } = await callExecuteRoute({ target: { mode: 'niche', niche: 'Dental' } });
    // Multi-lead model §4: a niche with no leads enters the discovery
    // bridge instead of failing — ONE execution in 'discovering' state.
    expect(status).toBe(202);
    expect(json.status).toBe('discovering');
    expect(json.executionId).toBe('exec_disc_1');
    expect(json.creditsCharged).toBe(0);
    expect(mocks.executeNicheRunWithDiscovery).toHaveBeenCalledTimes(1);
    const bridgeCall = mocks.executeNicheRunWithDiscovery.mock.calls[0][0];
    expect(bridgeCall.workflowId).toBe('wf_1');
    expect(bridgeCall.niche).toBe('Dental');
    expect(bridgeCall.targetSnapshot.requestedNiches).toEqual(['Dental']);
    // Nothing executed yet — no batch kick, no charge.
    expect(mocks.executeWorkflowBatch).not.toHaveBeenCalled();
    expect(mocks.chargeWorkflowExecutionFee).not.toHaveBeenCalled();
  });

  it('rejects an empty niche', async () => {
    const { status, json } = await callExecuteRoute({ target: { mode: 'niche', niche: '   ' } });
    expect(status).toBe(400);
    expect(json.code).toBe('NICHE_REQUIRED');
  });
});

describe('POST /api/workflows/[id]/execute — custom target', () => {
  it("resolves the custom query against the caller's own leads", async () => {
    mocks.db.lead.findMany.mockResolvedValue([
      lead('lead_b', 'Bravo Bakery'),
      lead('lead_c', 'Bakery Charlie'),
    ]);

    const { status, json } = await callExecuteRoute({
      target: { mode: 'custom', customQuery: 'bakery' },
    });

    expect(status).toBe(202);
    expect(json.target.leadCount).toBe(2);
    expect(mocks.executeWorkflowBatch).toHaveBeenCalledTimes(1);
    expect((mocks.executeWorkflowBatch.mock.calls[0][2] as { leads: unknown[] }).leads).toHaveLength(2);
    const where = mocks.db.lead.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe('user_1');
    expect(where.OR).toBeDefined();
  });

  it('rejects when nothing matches', async () => {
    mocks.db.lead.findMany.mockResolvedValue([]);
    const { status, json } = await callExecuteRoute({ target: { mode: 'custom', customQuery: 'zzz-no-match' } });
    expect(status).toBe(400);
    expect(json.code).toBe('NO_LEADS_FOR_QUERY');
  });
});

// ── 6. Execute route — legacy + failure honesty ──────────────────

describe('POST /api/workflows/[id]/execute — legacy compatibility + honesty', () => {
  it('keeps the legacy single-lead body shape working and reports the final status', async () => {
    mocks.executeWorkflow.mockResolvedValue({ executionId: 'exec_single', status: 'completed' });

    const { status, json } = await callExecuteRoute({
      triggerData: { leadId: 'lead_a', leadName: 'Alpha' },
    });

    expect(status).toBe(202);
    expect(json.executionId).toBe('exec_single');
    expect(json.status).toBe('completed');
    const call = mocks.executeWorkflow.mock.calls[0];
    expect(call[2]).toMatchObject({ leadId: 'lead_a' });
    // Legacy = inline await (awaitCompletion not set → default true), and
    // Part 2 §21 (amended): the engine auto-releases the fee if the legacy
    // run terminates with ZERO steps completed (never actually started).
    expect(call[4]).toEqual({ neverStartedAutoRefund: true });
  });

  it('surfaces a synchronous legacy failure honestly (no fake success)', async () => {
    mocks.executeWorkflow.mockResolvedValue({
      executionId: '', status: 'failed', error: 'Monthly execution limit reached (10/10)',
    });

    const { status, json } = await callExecuteRoute({ triggerData: { leadId: 'lead_a' } });

    expect(status).toBe(400);
    expect(json.error).toMatch(/execution limit/i);
  });

  it('reports a failed lead inside the grouped run honestly (partial, error surfaced)', async () => {
    mocks.db.workflowExecution.findMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) => {
      const ids = args?.where?.id?.in || [];
      return ids.map((id: string) => ({ id, status: 'partial', error: 'Email requires a recipient', currentStep: 2 }));
    });
    mocks.db.workflowExecution.findUnique.mockResolvedValue({
      id: 'exec_batch_1', status: 'partial', error: 'Email requires a recipient', currentStep: 2,
    });
    mocks.db.workflowExecutionLead.findMany.mockResolvedValue([
      { leadId: 'lead_a', leadName: 'Alpha', status: 'failed', error: 'Email requires a recipient' },
      { leadId: 'lead_b', leadName: 'Bravo', status: 'completed', error: null },
    ]);
    mocks.getLeadCounts.mockResolvedValue({ total: 2, pending: 0, running: 0, completed: 1, failed: 1, skipped: 0 });

    const { status, json } = await callExecuteRoute({
      target: { mode: 'selected_leads', leadIds: ['lead_a', 'lead_b'] },
    });

    expect(status).toBe(202);
    expect(json.status).toBe('partial');
    expect(json.error).toMatch(/recipient/i);
    expect(json.leads.filter((e: { status: string }) => e.status === 'failed')).toHaveLength(1);
    expect(json.executionId).toBe('exec_batch_1'); // ONE history row
  });

  it('returns 404 for a workflow owned by another user', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(null);
    const { status } = await callExecuteRoute({ target: { mode: 'selected_leads', leadIds: ['lead_a'] } });
    expect(status).toBe(404);
    expect(mocks.executeWorkflow).not.toHaveBeenCalled();
  });

  it('blocks execution when the plan gates workflow access (entitlement middleware)', async () => {
    const { checkPlanEntitlement } = await import('@/lib/entitlement-middleware');
    vi.mocked(checkPlanEntitlement).mockResolvedValueOnce({
      allowed: false,
      reason: "Feature 'workflow_access' requires pro plan",
      response: NextResponse.json(
        { error: 'This feature requires a pro plan. Please upgrade.', code: 'PLAN_REQUIRED' },
        { status: 403 }
      ) as never,
    });

    const { status, json } = await callExecuteRoute({ target: { mode: 'selected_leads', leadIds: ['lead_a'] } });

    expect(status).toBe(403);
    expect(json.code).toBe('PLAN_REQUIRED');
    expect(mocks.executeWorkflow).not.toHaveBeenCalled();
  });
});
