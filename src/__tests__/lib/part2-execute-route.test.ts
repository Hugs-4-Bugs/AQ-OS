// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Part 2 — Execute Route Flat-Fee Billing
//
// Covers POST /api/workflows/[id]/execute at the run-acceptance boundary:
//   • Test B — 1 lead  → ONE fee charge
//   • Test C — 50 leads → ONE fee charge (not 250)
//   • Test D — 100 leads → ONE fee charge
//   • Test E — 1000 leads → ONE fee charge (no external sends: the engine
//     is mocked — the credit accounting path is what is under test)
//   • Test F — same client run id submitted twice rapidly → SAME charge
//     key both times (combined with the billing-service idempotency proof
//     in part2-execution-billing.test.ts: one 5-credit charge total)
//   • Test I — NO_MATCHING_LEADS → ZERO charges (Part 1 UX intact)
//   • Test J — invalid workflow definition → 422, ZERO charges
//   • Test K — balance < fee → 402 INSUFFICIENT_CREDITS, no execution
//   • Test A — creation/edit/save paths never charge (route-level proof:
//     only the execute route charges; creation routes are separate —
//     asserted here by 0 charges on every non-execute rejection)
//   • §21 — zero executions created after a successful charge → refund
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  state: {
    user: { id: 'user_1', email: 't@t.test', name: 'T', role: 'owner', plan: 'pro', orgId: null },
  },
  db: {
    workflowDefinition: { findFirst: vi.fn(), findUnique: vi.fn() },
    workflowExecution: { findMany: vi.fn(), findUnique: vi.fn() },
    workflowExecutionLead: { findMany: vi.fn() },
    lead: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  },
  executeWorkflow: vi.fn(),
  executeWorkflowBatch: vi.fn(),
  executeNicheRunWithDiscovery: vi.fn(),
  isZaiProviderConfigured: vi.fn(),
  getLeadCounts: vi.fn(),
  chargeWorkflowExecutionFee: vi.fn(),
  refundWorkflowExecutionFee: vi.fn(),
  resolveLeadForExecution: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/lead-resolution', () => ({ resolveLeadForExecution: mocks.resolveLeadForExecution }));
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: vi.fn(async (_req: unknown, handler: (u: unknown) => unknown) => handler(mocks.state.user)),
}));
vi.mock('@/lib/entitlement-middleware', () => ({
  checkPlanEntitlement: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/workflow-engine', () => ({ executeWorkflow: mocks.executeWorkflow }));
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

import { POST as executeRoute } from '@/app/api/workflows/[id]/execute/route';

// A valid 2-step definition (passes Run Now validation).
const VALID_STEPS = [
  { id: 's1', type: 'action', name: 'Note', order: 1, config: JSON.stringify({ actionType: 'add_note', content: 'hello' }) },
  { id: 's2', type: 'action', name: 'Email', order: 2, config: JSON.stringify({ actionType: 'send_email', subject: 's', body: 'b' }) },
];
// An invalid definition (missing required note content → 422 pre-flight).
const INVALID_STEPS = [
  { id: 's1', type: 'action', name: 'Note', order: 1, config: JSON.stringify({ actionType: 'add_note' }) },
];

const WORKFLOW = {
  id: 'wf_1', userId: 'user_1', name: 'Fee Test WF', status: 'active', disabledBySubscription: false,
  nodes: JSON.stringify([
    { id: 't', type: 'trigger', title: 'Trigger' },
    ...VALID_STEPS.map((s) => ({ id: s.id, type: 'action', title: s.name, config: JSON.parse(s.config) })),
  ]),
  workflowSteps: VALID_STEPS,
};

function makeExecuteRequest(body: unknown): NextRequest {
  return new NextRequest('http://t.test/api/workflows/wf_1/execute', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

async function run(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await executeRoute(makeExecuteRequest(body), { params: Promise.resolve({ id: 'wf_1' }) });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

function primeSelectedLeads(count: number): string[] {
  const ids = Array.from({ length: count }, (_, i) => `lead_${i + 1}`);
  mocks.resolveLeadForExecution.mockImplementation(
    async (_userId: string, leadId: string) => ({
      ok: true,
      lead: { id: leadId, businessName: `Lead ${leadId}`, niche: 'dental', city: 'x', stage: 'new' },
    }),
  );
  return ids;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.workflowDefinition.findFirst.mockResolvedValue({ ...WORKFLOW });
  mocks.executeWorkflow.mockImplementation(
    async (_wf: string, _user: string, triggerData: Record<string, unknown>) => ({
      executionId: `exec_${String(triggerData.leadId)}`,
      status: 'running',
    }),
  );
  // Multi-lead model: the route kicks ONE grouped batch execution whose
  // per-lead items all complete.
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
  mocks.chargeWorkflowExecutionFee.mockResolvedValue({ ok: true, alreadyProcessed: false, newBalance: 745 });
  mocks.refundWorkflowExecutionFee.mockResolvedValue({ refunded: true, newBalance: 750 });
  // Small batches (≤50 leads) wait for the ONE grouped execution to
  // settle: the poll reads the execution row + its per-lead items.
  mocks.db.workflowExecution.findMany.mockImplementation(
    async ({ where }: { where: { id: { in: string[] } } }) =>
      (where.id.in ?? []).map((id) => ({ id, status: 'completed', error: null })),
  );
  mocks.db.workflowExecution.findUnique.mockResolvedValue({
    id: 'exec_batch_1', status: 'completed', error: null, currentStep: 4,
  });
  mocks.db.workflowExecutionLead.findMany.mockImplementation(
    async ({ where }: { where: { executionId: string } }) => {
      if (where.executionId !== 'exec_batch_1') return [];
      return (mocks.executeWorkflowBatch.mock.calls[0]?.[2]?.leads ?? []).map((l: { id: string; businessName: string }) => ({
        leadId: l.id, leadName: l.businessName, status: 'completed', error: null,
      }));
    },
  );
  mocks.getLeadCounts.mockImplementation(async () => {
    const n = mocks.executeWorkflowBatch.mock.calls[0]?.[2]?.leads?.length ?? 0;
    return { total: n, pending: 0, running: 0, completed: n, failed: 0, skipped: 0 };
  });
  process.env.WORKFLOW_BATCH_SETTLE_MS = '50';
  process.env.WORKFLOW_BATCH_POLL_MS = '1';
  process.env.WORKFLOW_KICK_STAGGER_MS = '0';
});

afterEach(() => {
  delete process.env.WORKFLOW_BATCH_SETTLE_MS;
  delete process.env.WORKFLOW_BATCH_POLL_MS;
  delete process.env.WORKFLOW_KICK_STAGGER_MS;
});

function chargeKeys(): string[] {
  return mocks.chargeWorkflowExecutionFee.mock.calls.map((c) => c[0].chargeKey as string);
}

describe('Part 2 — flat fee at the run-acceptance boundary (Tests B–E)', () => {
  it.each([
    { count: 1, label: 'Test B — one lead' },
    { count: 50, label: 'Test C — 50 leads, not 250 credits' },
    { count: 100, label: 'Test D — 100 leads' },
    { count: 1000, label: 'Test E — 1000 leads, mocked outreach, real accounting path' },
  ])('$label → exactly ONE fee charge for the whole run', async ({ count }) => {
    const ids = primeSelectedLeads(count);

    const { status, json } = await run({ target: { mode: 'selected_leads', leadIds: ids, runId: `run_${count}` } });

    expect(status).toBe(202);
    expect((json.target as { leadCount: number }).leadCount).toBe(count);
    // ONE charge for the whole run — the fee never multiplies with leads.
    expect(mocks.chargeWorkflowExecutionFee).toHaveBeenCalledTimes(1);
    const params = mocks.chargeWorkflowExecutionFee.mock.calls[0][0];
    expect(params.userId).toBe('user_1');
    expect(params.workflowId).toBe('wf_1');
    expect(params.source).toBe('MANUAL_WORKFLOW');
    expect(params.leadCount).toBe(count);
    expect(params.chargeKey).toBe(`wfexec-run:run_${count}`);
    // ONE grouped execution carries the whole lead set — the executions
    // history shows ONE row for this run, never one per lead.
    expect(mocks.executeWorkflowBatch).toHaveBeenCalledTimes(1);
    const batchOpts = mocks.executeWorkflowBatch.mock.calls[0][2] as { leads: unknown[]; idempotencyKey: string };
    expect(batchOpts.leads).toHaveLength(count);
    expect(batchOpts.idempotencyKey).toBe(`batch_run_${count}`);
  });
});

describe('Part 2 — Test F: rapid double-click replays the same run identity', () => {
  it('two rapid submissions with the same client runId use the IDENTICAL charge key (idempotent collapse)', async () => {
    const ids = primeSelectedLeads(3);
    const body = { target: { mode: 'selected_leads', leadIds: ids, runId: 'run_double_click' } };

    await run(body);
    await run(body);

    // Both requests charged through the SAME key; the billing service's
    // idempotency (proven in part2-execution-billing.test.ts) collapses
    // this into ONE 5-credit ledger deduction.
    expect(mocks.chargeWorkflowExecutionFee).toHaveBeenCalledTimes(2);
    expect(new Set(chargeKeys()).size).toBe(1);
    expect(chargeKeys()[0]).toBe('wfexec-run:run_double_click');
    // The batch idempotency key is identical across the replay — the
    // coordinator's own idempotency then returns the SAME execution.
    const batchKeys = mocks.executeWorkflowBatch.mock.calls.map(
      (c) => (c[2] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(batchKeys).toEqual(['batch_run_double_click', 'batch_run_double_click']);
  });
});

describe('Part 2 — Test I: a niche with no matching leads charges nothing upfront', () => {
  it('zero matching leads → the discovery bridge starts (202 discovering) with ZERO upfront charges', async () => {
    mocks.db.lead.findMany.mockResolvedValue([]);

    const { status, json } = await run({ target: { mode: 'niche', niche: 'nonexistent' } });

    expect(status).toBe(202);
    expect(json.status).toBe('discovering');
    expect(json.creditsCharged).toBe(0);
    expect(mocks.chargeWorkflowExecutionFee).not.toHaveBeenCalled();
    expect(mocks.executeWorkflowBatch).not.toHaveBeenCalled();
    expect(mocks.executeWorkflow).not.toHaveBeenCalled();
  });

  it('zero matching leads + unconfigured discovery provider → actionable 422, zero charges', async () => {
    mocks.db.lead.findMany.mockResolvedValue([]);
    mocks.isZaiProviderConfigured.mockReturnValue(false);

    const { status, json } = await run({ target: { mode: 'niche', niche: 'nonexistent' } });

    expect(status).toBe(422);
    expect(json.code).toBe('DISCOVERY_PROVIDER_NOT_CONFIGURED');
    expect(mocks.chargeWorkflowExecutionFee).not.toHaveBeenCalled();
    expect(mocks.executeNicheRunWithDiscovery).not.toHaveBeenCalled();
  });
});

describe('Part 2 — Test J: invalid workflow charges nothing', () => {
  it('an invalid definition is rejected 422 BEFORE the fee — zero charges, zero executions', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue({
      ...WORKFLOW,
      workflowSteps: INVALID_STEPS,
      nodes: JSON.stringify([
        { id: 't', type: 'trigger', title: 'Trigger' },
        { id: 's1', type: 'action', title: 'Note', config: { actionType: 'add_note' } },
      ]),
    });

    const { status, json } = await run({});

    expect(status).toBe(422);
    expect(json.code).toBe('WORKFLOW_INVALID');
    expect(mocks.chargeWorkflowExecutionFee).not.toHaveBeenCalled();
    expect(mocks.executeWorkflow).not.toHaveBeenCalled();
    expect(mocks.executeWorkflowBatch).not.toHaveBeenCalled();
  });
});

describe('Part 2 — Test K: insufficient credits rejects the run before it starts', () => {
  it('balance < 5 → 402 INSUFFICIENT_CREDITS, no execution created, no misleading running state', async () => {
    const ids = primeSelectedLeads(2);
    mocks.chargeWorkflowExecutionFee.mockResolvedValue({
      ok: false, code: 'INSUFFICIENT_CREDITS', fee: 5, balance: 4, shortfall: 1,
    });

    const { status, json } = await run({ target: { mode: 'selected_leads', leadIds: ids, runId: 'run_k' } });

    expect(status).toBe(402);
    expect(json.code).toBe('INSUFFICIENT_CREDITS');
    expect(json.balance).toBe(4);
    expect(json.fee).toBe(5);
    expect(mocks.executeWorkflow).not.toHaveBeenCalled();
    expect(mocks.executeWorkflowBatch).not.toHaveBeenCalled();
    expect(mocks.refundWorkflowExecutionFee).not.toHaveBeenCalled(); // nothing was charged → nothing to refund
  });
});

describe('Part 2 — §21: reservation release when NOTHING starts', () => {
  it('charge succeeds but the grouped execution cannot be created → idempotent refund + RUN_START_FAILED', async () => {
    const ids = primeSelectedLeads(2);
    mocks.executeWorkflowBatch.mockRejectedValue(new Error('batch preflight exploded'));

    const { status, json } = await run({ target: { mode: 'selected_leads', leadIds: ids, runId: 'run_refund' } });

    expect(status).toBe(500);
    expect(json.code).toBe('RUN_START_FAILED');
    expect(json.creditsRefunded).toBe(true);
    expect(mocks.chargeWorkflowExecutionFee).toHaveBeenCalledTimes(1);
    expect(mocks.refundWorkflowExecutionFee).toHaveBeenCalledTimes(1);
    expect(mocks.refundWorkflowExecutionFee.mock.calls[0][0].chargeKey).toBe('wfexec-run:run_refund');
  });

  it('legacy no-target run that never starts → fee refunded, honest 400', async () => {
    mocks.executeWorkflow.mockResolvedValue({ executionId: '', status: 'failed', error: 'Monthly execution limit reached (500/500)' });

    const { status, json } = await run({ idempotencyKey: 'run_legacy_fail' });

    expect(status).toBe(400);
    expect(json.code).toBe('RUN_START_FAILED');
    expect(json.creditsRefunded).toBe(true);
    expect(mocks.refundWorkflowExecutionFee).toHaveBeenCalledTimes(1);
  });

  it('legacy no-target run that starts (execution record exists) keeps its fee — a started-and-failed run consumed the execution', async () => {
    mocks.executeWorkflow.mockResolvedValue({ executionId: 'exec_1', status: 'failed', error: 'Step failed' });

    const { status, json } = await run({ idempotencyKey: 'run_legacy_ok' });

    expect(status).toBe(202);
    expect(json.executionId).toBe('exec_1');
    expect(json.creditsCharged).toBe(5);
    expect(mocks.refundWorkflowExecutionFee).not.toHaveBeenCalled();
  });
});

describe('Part 2 — charge ordering: every free rejection happens BEFORE the fee', () => {
  it('a too-large target is rejected for free (no charge) — TARGET_TOO_LARGE', async () => {
    const ids = primeSelectedLeads(3);
    process.env.WORKFLOW_MAX_TARGET_LEADS = '2';
    try {
      const { status, json } = await run({ target: { mode: 'selected_leads', leadIds: ids } });
      expect(status).toBe(400);
      expect(json.code).toBe('REQUEST_TOO_LARGE');
      expect(mocks.chargeWorkflowExecutionFee).not.toHaveBeenCalled();
    } finally {
      delete process.env.WORKFLOW_MAX_TARGET_LEADS;
    }
  });

  it('a foreign lead id rejects the whole request for free — LEAD_NOT_FOUND', async () => {
    mocks.resolveLeadForExecution.mockResolvedValue({ ok: false, reason: 'not found' });

    const { status, json } = await run({ target: { mode: 'selected_leads', leadIds: ['lead_foreign'] } });

    expect(status).toBe(400);
    expect(json.code).toBe('LEAD_NOT_FOUND');
    expect(mocks.chargeWorkflowExecutionFee).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Part 2 §21 (amended) — never-started BATCH fee release
//
// ONE flat fee covers the whole multi-lead batch. If EVERY kicked
// execution settles failed/exhausted at ZERO steps completed (the
// billing bug: "Webhook call failed: fetch failed", 0/6 steps), the run
// never actually started and the shared fee is released — ONE refund on
// the run's charge key. A batch where any execution did real work keeps
// its fee (original Part 2 rule preserved).
// ═══════════════════════════════════════════════════════════════════

describe('Part 2 §21 (amended) — never-started batch fee release', () => {
  it('the grouped run fails with ZERO steps completed (webhook down for every lead) → the runner released the fee; response reports creditsCharged 0', async () => {
    const ids = primeSelectedLeads(3);
    // The ONE execution settles as a 0-step pre-start failure — the exact
    // screenshot scenario ("Webhook call failed: fetch failed", 0/6 steps).
    mocks.db.workflowExecution.findMany.mockImplementation(
      async ({ where }: { where: { id: { in: string[] } } }) =>
        (where.id.in ?? []).map((id) => ({
          id,
          status: 'failed',
          error: 'Webhook call failed: fetch failed',
          currentStep: 0,
        })),
    );
    mocks.db.workflowExecution.findUnique.mockResolvedValue({
      id: 'exec_batch_1', status: 'failed', error: 'Webhook call failed: fetch failed', currentStep: 0,
    });
    mocks.db.workflowExecutionLead.findMany.mockResolvedValue(
      ids.map((id) => ({ leadId: id, leadName: `Lead ${id}`, status: 'failed', error: 'fetch failed' })),
    );
    mocks.getLeadCounts.mockResolvedValue({ total: 3, pending: 0, running: 0, completed: 0, failed: 3, skipped: 0 });

    const { status, json } = await run({ target: { mode: 'selected_leads', leadIds: ids, runId: 'run_never' } });

    expect(status).toBe(202);
    expect(json.status).toBe('failed');
    // The run never actually started → the batch runner released the fee
    // (idempotently, before writing the terminal status); the response
    // reports the reconciled state and the route does NOT issue a SECOND
    // refund on top of the runner's.
    expect(json.creditsCharged).toBe(0);
    expect(json.creditsRefunded).toBe(true);
    expect(mocks.chargeWorkflowExecutionFee).toHaveBeenCalledTimes(1);
    expect(mocks.refundWorkflowExecutionFee).not.toHaveBeenCalled();
  });

  it('a MIXED batch (some leads completed real steps) keeps its fee — no refund', async () => {
    const ids = primeSelectedLeads(2);
    mocks.db.workflowExecution.findMany.mockImplementation(
      async ({ where }: { where: { id: { in: string[] } } }) =>
        (where.id.in ?? []).map((id) => ({ id, status: 'partial', error: null, currentStep: 2 })),
    );
    mocks.db.workflowExecution.findUnique.mockResolvedValue({
      id: 'exec_batch_1', status: 'partial', error: '1 of 2 leads failed.', currentStep: 2,
    });
    mocks.db.workflowExecutionLead.findMany.mockResolvedValue([
      { leadId: ids[0], leadName: `Lead ${ids[0]}`, status: 'completed', error: null },
      { leadId: ids[1], leadName: `Lead ${ids[1]}`, status: 'failed', error: 'fetch failed' },
    ]);
    mocks.getLeadCounts.mockResolvedValue({ total: 2, pending: 0, running: 0, completed: 1, failed: 1, skipped: 0 });

    const { status, json } = await run({ target: { mode: 'selected_leads', leadIds: ids, runId: 'run_mixed' } });

    expect(status).toBe(202);
    expect(json.status).toBe('partial');
    expect(json.creditsCharged).toBe(5); // the run actually started — fee stands
    expect(json.creditsRefunded).toBeUndefined();
    expect(mocks.refundWorkflowExecutionFee).not.toHaveBeenCalled();
  });

  it('a still-running batch is NEVER refunded (conservative — the run may still start)', async () => {
    const ids = primeSelectedLeads(2);
    mocks.db.workflowExecution.findMany.mockImplementation(
      async ({ where }: { where: { id: { in: string[] } } }) =>
        (where.id.in ?? []).map((id) => ({ id, status: 'running', error: null, currentStep: 0 })),
    );
    mocks.db.workflowExecution.findUnique.mockResolvedValue({
      id: 'exec_batch_1', status: 'running', error: null, currentStep: 0,
    });
    mocks.db.workflowExecutionLead.findMany.mockResolvedValue(
      ids.map((id) => ({ leadId: id, leadName: `Lead ${id}`, status: 'running', error: null })),
    );
    mocks.getLeadCounts.mockResolvedValue({ total: 2, pending: 0, running: 2, completed: 0, failed: 0, skipped: 0 });

    const { json } = await run({ target: { mode: 'selected_leads', leadIds: ids, runId: 'run_pending' } });

    expect(json.creditsCharged).toBe(5);
    expect(mocks.refundWorkflowExecutionFee).not.toHaveBeenCalled();
  });

  it('legacy run that failed with ZERO completed steps reports the engine-side refund (stepsCompleted contract)', async () => {
    mocks.executeWorkflow.mockResolvedValue({
      executionId: 'exec_ns',
      status: 'failed',
      error: 'Webhook call failed: fetch failed',
      stepsCompleted: 0,
    });

    const { status, json } = await run({ idempotencyKey: 'run_legacy_ns' });

    expect(status).toBe(202);
    expect(json.creditsCharged).toBe(0);
    expect(json.creditsRefunded).toBe(true);
    // The ENGINE performed the release (neverStartedAutoRefund); the route
    // must not issue a SECOND refund on top of it.
    expect(mocks.refundWorkflowExecutionFee).not.toHaveBeenCalled();
  });

  it('legacy started-and-failed run (stepsCompleted > 0) keeps its fee — Part 2 rule preserved', async () => {
    mocks.executeWorkflow.mockResolvedValue({
      executionId: 'exec_sf',
      status: 'failed',
      error: 'Second step exploded',
      stepsCompleted: 1,
    });

    const { status, json } = await run({ idempotencyKey: 'run_legacy_sf' });

    expect(status).toBe(202);
    expect(json.creditsCharged).toBe(5);
    expect(json.creditsRefunded).toBeUndefined();
    expect(mocks.refundWorkflowExecutionFee).not.toHaveBeenCalled();
  });
});
