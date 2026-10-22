// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Phase 6 — Workflow Targeting
//
// Covers:
//   1. Niche resolution pages through the FULL matching set — no
//      arbitrary take(500) truncation (chunked queries).
//   2. Custom query resolution — same chunked pagination.
//   3. Entitlement gate applies to niche/custom targets (previously
//      bypassed — a free plan with a 400-lead niche ran 400 executions).
//   4. TARGET_TOO_LARGE: oversized targets are rejected honestly
//      (never silently truncated).
//   5. Exact target snapshot: mode + runBatchId + verbatim inputs
//      (selectedLeadIds / niche / customTarget) + leadCount persisted
//      on every per-lead execution.
//   6. Large batches respond immediately (async, honest running
//      statuses) — no giant synchronous settle request.
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
// Part 2 — the route charges the flat execution fee via the central
// workflow-credits service; mocked so these suites keep testing their own
// concerns (the dedicated part2 suites cover the fee behavior).
vi.mock('@/lib/workflow-credits', () => ({
  chargeWorkflowExecutionFee: vi.fn(async () => ({ ok: true, alreadyProcessed: false, newBalance: 745 })),
  refundWorkflowExecutionFee: vi.fn(async () => ({ refunded: true, newBalance: 750 })),
  WORKFLOW_EXECUTION_FEE_CREDITS: 5,
}));

import { POST as executeRoute } from '@/app/api/workflows/[id]/execute/route';

const WORKFLOW = {
  id: 'wf_1', userId: 'user_1', name: 'Targeting', status: 'active', disabledBySubscription: false,
  nodes: JSON.stringify([
    { id: 'n_trigger', type: 'trigger', title: 'Trigger', config: {} },
    { id: 'n_note', type: 'action', title: 'Record activity', config: { actionType: 'add_note', content: 'Contacted' } },
  ]),
  workflowSteps: [],
};

function makeLead(i: number, niche = 'Dental') {
  return { id: `lead_${i}`, businessName: `Business ${i}`, niche, city: 'City', stage: 'discovered' };
}

function makeExecuteRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/workflows/wf_1/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function callExecuteRoute(body: unknown) {
  const res = await executeRoute(makeExecuteRequest(body), { params: Promise.resolve({ id: 'wf_1' }) });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.user.plan = 'pro';
  mocks.db.workflowDefinition.findFirst.mockResolvedValue({ ...WORKFLOW });
  mocks.executeWorkflow.mockImplementation(async (_wf: string, _user: string, triggerData: Record<string, unknown>) => ({
    executionId: `exec_${String(triggerData.leadId)}`,
    status: 'running',
  }));
  // Multi-lead model: ONE grouped execution per run.
  mocks.executeWorkflowBatch.mockImplementation(
    async (_wf: string, _user: string, opts: { leads: { id: string }[] }) => ({
      executionId: 'exec_batch_1',
      status: 'running',
      leadCount: opts.leads.length,
      stepsCompleted: 0,
    }),
  );
  mocks.isZaiProviderConfigured.mockReturnValue(true);
  mocks.executeNicheRunWithDiscovery.mockResolvedValue({ executionId: 'exec_disc_1', status: 'discovering' });
  mocks.db.workflowExecution.findMany.mockResolvedValue([]);
  mocks.db.workflowExecution.findUnique.mockResolvedValue({ id: 'exec_batch_1', status: 'completed', error: null, currentStep: 4 });
  mocks.db.workflowExecutionLead.findMany.mockImplementation(
    async ({ where }: { where: { executionId: string } }) => {
      if (where.executionId !== 'exec_batch_1') return [];
      const leads = mocks.executeWorkflowBatch.mock.calls[0]?.[2]?.leads ?? [];
      return leads.map((l: { id: string }) => ({ leadId: l.id, leadName: `Business ${l.id}`, status: 'completed', error: null }));
    },
  );
  mocks.getLeadCounts.mockImplementation(async () => {
    const n = mocks.executeWorkflowBatch.mock.calls[0]?.[2]?.leads?.length ?? 0;
    return { total: n, pending: 0, running: 0, completed: n, failed: 0, skipped: 0 };
  });
  process.env.WORKFLOW_BATCH_SETTLE_MS = '2000';
  process.env.WORKFLOW_BATCH_POLL_MS = '1';
  process.env.WORKFLOW_KICK_STAGGER_MS = '0';
});

afterEach(() => {
  delete process.env.WORKFLOW_BATCH_SETTLE_MS;
  delete process.env.WORKFLOW_BATCH_POLL_MS;
  delete process.env.WORKFLOW_KICK_STAGGER_MS;
  delete process.env.WORKFLOW_MAX_TARGET_LEADS;
  delete process.env.WORKFLOW_BATCH_SETTLE_MAX_LEADS;
});

// ═══════════════════════════════════════════════════════════════════
// 1–2. Chunked resolution — no arbitrary take(500) truncation
// ═══════════════════════════════════════════════════════════════════

describe('Phase 6 — uncapped niche/custom resolution', () => {
  it('niche resolution pages through 2 full pages + a short page (1200 leads, pro plan)', async () => {
    process.env.WORKFLOW_MAX_TARGET_LEADS = '2000';
    // 1200 matching leads across three query pages
    mocks.db.lead.findMany.mockImplementation(async ({ skip }: { skip?: number } = {}) => {
      const s = skip ?? 0;
      if (s === 0) return Array.from({ length: 500 }, (_, i) => makeLead(i));
      if (s === 500) return Array.from({ length: 500 }, (_, i) => makeLead(500 + i));
      if (s === 1000) return Array.from({ length: 200 }, (_, i) => makeLead(1000 + i));
      return [];
    });
    mocks.db.workflowExecution.findMany.mockResolvedValue([]);

    const { status, json } = await callExecuteRoute({ target: { mode: 'niche', niche: 'Dental' } });

    expect(status).toBe(202);
    expect(json.target.leadCount).toBe(1200); // ALL resolved — no 500 truncation
    // ONE grouped execution carries all 1200 leads.
    expect(mocks.executeWorkflowBatch).toHaveBeenCalledTimes(1);
    expect((mocks.executeWorkflowBatch.mock.calls[0][2] as { leads: unknown[] }).leads).toHaveLength(1200);
  }, 30000);

  it('custom resolution pages through the full matching set', async () => {
    process.env.WORKFLOW_MAX_TARGET_LEADS = '2000';
    mocks.db.lead.findMany.mockImplementation(async ({ skip }: { skip?: number } = {}) => {
      const s = skip ?? 0;
      if (s === 0) return Array.from({ length: 500 }, (_, i) => makeLead(i, 'Real Estate'));
      if (s === 500) return Array.from({ length: 60 }, (_, i) => makeLead(500 + i, 'Real Estate'));
      return [];
    });
    mocks.db.workflowExecution.findMany.mockResolvedValue([]);

    const { status, json } = await callExecuteRoute({ target: { mode: 'custom', customQuery: 'Business' } });

    expect(status).toBe(202);
    expect(json.target.leadCount).toBe(560);
    expect(mocks.executeWorkflowBatch).toHaveBeenCalledTimes(1);
    expect((mocks.executeWorkflowBatch.mock.calls[0][2] as { leads: unknown[] }).leads).toHaveLength(560);
  }, 30000);
});

// ═══════════════════════════════════════════════════════════════════
// 3–4. Entitlement gate + honest size guard for every mode
// ═══════════════════════════════════════════════════════════════════

describe('Phase 6 — backend validation of the resolved target', () => {
  it('a niche resolving beyond the FREE plan limit is rejected (gate previously bypassed)', async () => {
    mocks.state.user.plan = 'free'; // free = 10 leads
    mocks.db.lead.findMany.mockImplementation(async () => Array.from({ length: 40 }, (_, i) => makeLead(i)));

    const { status, json } = await callExecuteRoute({ target: { mode: 'niche', niche: 'Dental' } });

    expect(status).toBe(400);
    expect(json.code).toBe('PLAN_LEAD_LIMIT_EXCEEDED');
    expect(json.limit).toBe(10);
    expect(json.resolved).toBe(40);
    expect(mocks.executeWorkflow).not.toHaveBeenCalled();
  });

  it('a custom query resolving beyond the plan limit is rejected', async () => {
    mocks.state.user.plan = 'starter'; // starter = 25 leads
    mocks.db.lead.findMany.mockImplementation(async () => Array.from({ length: 30 }, (_, i) => makeLead(i)));

    const { status, json } = await callExecuteRoute({ target: { mode: 'custom', customQuery: 'Business' } });

    expect(status).toBe(400);
    expect(json.code).toBe('PLAN_LEAD_LIMIT_EXCEEDED');
    expect(mocks.executeWorkflow).not.toHaveBeenCalled();
  });

  it('an oversized target is rejected honestly (TARGET_TOO_LARGE), never silently truncated', async () => {
    process.env.WORKFLOW_MAX_TARGET_LEADS = '25';
    mocks.db.lead.findMany.mockImplementation(async () => Array.from({ length: 500 }, (_, i) => makeLead(i)));

    const { status, json } = await callExecuteRoute({ target: { mode: 'niche', niche: 'Dental' } });

    expect(status).toBe(400);
    expect(json.code).toBe('TARGET_TOO_LARGE');
    expect(json.max).toBe(25);
    expect(mocks.executeWorkflow).not.toHaveBeenCalled();
  });

  it('selected_leads beyond the request-size guard is rejected', async () => {
    process.env.WORKFLOW_MAX_TARGET_LEADS = '2';
    const { status, json } = await callExecuteRoute({
      target: { mode: 'selected_leads', leadIds: ['lead_a', 'lead_b', 'lead_c'] },
    });
    expect(status).toBe(400);
    expect(json.code).toBe('REQUEST_TOO_LARGE');
    expect(mocks.executeWorkflow).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Exact target snapshot
// ═══════════════════════════════════════════════════════════════════

describe('Phase 6 — exact target snapshot', () => {
  it('selected_leads snapshot carries the verbatim selectedLeadIds + mode + batch + count', async () => {
    mocks.resolveLeadForExecution.mockImplementation(async (_u: string, leadId: string) => ({
      ok: true, lead: makeLead(Number(leadId.split('_')[1]) || 0),
    }));
    mocks.db.workflowExecution.findMany.mockResolvedValue([]);

    await callExecuteRoute({ target: { mode: 'selected_leads', leadIds: ['lead_1', 'lead_2'] } });

    // ONE grouped execution snapshots the verbatim selection.
    expect(mocks.executeWorkflowBatch).toHaveBeenCalledTimes(1);
    const opts = mocks.executeWorkflowBatch.mock.calls[0][2] as {
      leads: { id: string }[];
      targetSnapshot: Record<string, unknown>;
    };
    expect(opts.leads.map((l) => l.id)).toEqual(['lead_1', 'lead_2']);
    expect(opts.targetSnapshot.mode).toBe('selected_leads');
    expect(opts.targetSnapshot.selectedLeadIds).toEqual(['lead_1', 'lead_2']);
    expect(opts.targetSnapshot.leadCount).toBe(2);
    expect(typeof opts.targetSnapshot.runBatchId).toBe('string');
  });

  it('niche snapshot carries the verbatim niche', async () => {
    mocks.db.lead.findMany.mockImplementation(async () => [makeLead(0), makeLead(1)]);
    mocks.db.workflowExecution.findMany.mockResolvedValue([]);

    await callExecuteRoute({ target: { mode: 'niche', niche: 'Dental' } });

    const snapshot = (mocks.executeWorkflowBatch.mock.calls[0][2] as { targetSnapshot: Record<string, unknown> }).targetSnapshot;
    expect(snapshot.niche).toBe('Dental');
    expect(snapshot.mode).toBe('niche');
    expect(snapshot.leadCount).toBe(2);
  });

  it('custom snapshot carries the verbatim customTarget', async () => {
    mocks.db.lead.findMany.mockImplementation(async () => [makeLead(0)]);
    mocks.db.workflowExecution.findMany.mockResolvedValue([]);

    await callExecuteRoute({ target: { mode: 'custom', customQuery: 'Business' } });

    const snapshot = (mocks.executeWorkflowBatch.mock.calls[0][2] as { targetSnapshot: Record<string, unknown> }).targetSnapshot;
    expect(snapshot.customTarget).toBe('Business');
    expect(snapshot.mode).toBe('custom');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Large batches are async — no giant synchronous request
// ═══════════════════════════════════════════════════════════════════

describe('Phase 6 — scalable batch execution', () => {
  it('a batch larger than the settle threshold responds immediately with honest running statuses', async () => {
    process.env.WORKFLOW_BATCH_SETTLE_MAX_LEADS = '2';
    mocks.db.lead.findMany.mockImplementation(async () => [makeLead(0), makeLead(1), makeLead(2)]);

    const { status, json } = await callExecuteRoute({ target: { mode: 'niche', niche: 'Dental' } });

    expect(status).toBe(202);
    expect(json.status).toBe('running');
    expect(json.async).toBe(true);
    expect(json.target.leadCount).toBe(3);
    // ONE grouped execution for the 3 leads (never 3 history rows).
    expect(json.executionId).toBe('exec_batch_1');
    expect(mocks.executeWorkflowBatch).toHaveBeenCalledTimes(1);
    expect((mocks.executeWorkflowBatch.mock.calls[0][2] as { leads: unknown[] }).leads).toHaveLength(3);
    // The response is immediate — no SYNCHRONOUS settle waiting (if the
    // route polled inline, this test would hang for the settle timeout).
    expect(json.message).toContain('background');
  });

  it('a small batch still settles and reports final per-lead outcomes (verified Task 1 behavior)', async () => {
    mocks.db.lead.findMany.mockImplementation(async () => [makeLead(0), makeLead(1)]);
    mocks.db.workflowExecution.findMany.mockResolvedValue([
      { id: 'exec_batch_1', status: 'partial', error: null, currentStep: 2 },
    ]);
    mocks.db.workflowExecution.findUnique.mockResolvedValue({ id: 'exec_batch_1', status: 'partial', error: '1 of 2 leads failed', currentStep: 2 });
    mocks.db.workflowExecutionLead.findMany.mockResolvedValue([
      { leadId: 'lead_0', leadName: 'Business 0', status: 'completed', error: null },
      { leadId: 'lead_1', leadName: 'Business 1', status: 'failed', error: 'boom' },
    ]);
    mocks.getLeadCounts.mockResolvedValue({ total: 2, pending: 0, running: 0, completed: 1, failed: 1, skipped: 0 });

    const { status, json } = await callExecuteRoute({ target: { mode: 'niche', niche: 'Dental' } });

    expect(status).toBe(202);
    expect(json.status).toBe('partial');
    expect(json.leads.find((e: { leadId: string }) => e.leadId === 'lead_1').status).toBe('failed');
    expect(json.leads.find((e: { leadId: string }) => e.leadId === 'lead_0').status).toBe('completed');
    expect(json.executionId).toBe('exec_batch_1'); // ONE history row for the run
  });
});
