// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Part 1 — Execute Route (multi-niche targeting +
// missing-niche discovery bridge)
//
// Covers POST /api/workflows/[id]/execute:
//   1. Multi-niche resolution — "hospital, dentist" matches leads whose
//      OWN niche is either value (per-lead attribution preserved; the
//      comma-joined string never matches) — resolved into ONE grouped
//      execution.
//   2. A niche with zero matching leads no longer hard-fails: with the
//      discovery provider configured, the run transitions into the
//      discovery bridge (ONE execution, discovering → running); without
//      the provider, an actionable configuration error is returned.
//   3. Nothing executes without a target resolution — no charges, no
//      execution records.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
// The shared niche resolver runs REAL against the mocked db (owner-scope
// semantics stay under test); workflow-targeting imports only db + retry.
vi.mock('@/lib/workflow-credits', () => ({
  chargeWorkflowExecutionFee: mocks.chargeWorkflowExecutionFee,
  refundWorkflowExecutionFee: mocks.refundWorkflowExecutionFee,
  WORKFLOW_EXECUTION_FEE_CREDITS: 5,
}));

import { POST as executeRoute } from '@/app/api/workflows/[id]/execute/route';

const WORKFLOW = {
  id: 'wf_1', userId: 'user_1', name: 'Lead Qualification Outreach', status: 'active', disabledBySubscription: false,
  nodes: JSON.stringify([
    { id: 'n_trigger', type: 'trigger', title: 'Trigger', config: {} },
    { id: 'n_note', type: 'action', title: 'Record activity', config: { actionType: 'add_note', content: 'Contacted' } },
  ]),
  workflowSteps: [
    { id: 'n_note', type: 'action', name: 'Record activity', order: 0, config: JSON.stringify({ actionType: 'add_note', content: 'Contacted' }) },
  ],
};

function makeLead(id: string, niche: string) {
  return { id, businessName: `Business ${id}`, niche, city: 'City', stage: 'discovered' };
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
  mocks.db.workflowDefinition.findFirst.mockResolvedValue({ ...WORKFLOW });
  // Multi-lead model: the route kicks ONE grouped batch execution.
  mocks.executeWorkflowBatch.mockImplementation(
    async (_wf: string, _user: string, opts: { leads: unknown[] }) => ({
      executionId: 'exec_batch_1',
      status: 'running',
      leadCount: opts.leads.length,
      stepsCompleted: 0,
    }),
  );
  // Settle path reads the ONE execution + its lead items.
  mocks.db.workflowExecution.findUnique.mockResolvedValue({
    id: 'exec_batch_1', status: 'completed', error: null, currentStep: 6,
  });
  mocks.db.workflowExecution.findMany.mockImplementation(
    async ({ where }: { where: { id: { in: string[] } } }) =>
      (where.id.in ?? []).map((id) => ({ id, status: 'completed', error: null })),
  );
  mocks.db.workflowExecutionLead.findMany.mockImplementation(
    async ({ where }: { where: { executionId: string } }) =>
      where.executionId === 'exec_batch_1'
        ? [
            { leadId: 'lead_h', leadName: 'Business lead_h', status: 'completed', error: null },
            { leadId: 'lead_d', leadName: 'Business lead_d', status: 'completed', error: null },
          ]
        : [],
  );
  mocks.getLeadCounts.mockResolvedValue({ total: 2, pending: 0, running: 0, completed: 2, failed: 0, skipped: 0 });
  mocks.isZaiProviderConfigured.mockReturnValue(true);
  mocks.executeNicheRunWithDiscovery.mockResolvedValue({ executionId: 'exec_disc_1', status: 'discovering' });
  mocks.chargeWorkflowExecutionFee.mockResolvedValue({ ok: true, alreadyProcessed: false, newBalance: 745 });
  mocks.refundWorkflowExecutionFee.mockResolvedValue({ refunded: true, newBalance: 750 });
  process.env.WORKFLOW_BATCH_SETTLE_MS = '2000';
  process.env.WORKFLOW_BATCH_POLL_MS = '1';
});

// ═══════════════════════════════════════════════════════════════════
// 1. Multi-niche resolution → ONE grouped execution
// ═══════════════════════════════════════════════════════════════════

describe('Part 1 — multi-niche targeting resolution', () => {
  it('"hospital, dentist" matches leads carrying EITHER niche exactly — ONE grouped execution over both', async () => {
    mocks.db.lead.findMany.mockResolvedValue([
      makeLead('lead_h', 'hospital'),
      makeLead('lead_d', 'dentist'),
      makeLead('lead_j', 'hospital, dentist'), // the joined string — NOT a match
      makeLead('lead_x', 'stationery'),
    ]);

    const { status, json } = await callExecuteRoute({
      target: { mode: 'niche', niche: 'hospital, dentist' },
    });

    expect(status).toBe(202);
    expect(json.target.leadCount).toBe(2);
    // ONE grouped execution — never one execution record per lead.
    expect(mocks.executeWorkflowBatch).toHaveBeenCalledTimes(1);
    const batchCall = mocks.executeWorkflowBatch.mock.calls[0];
    expect(batchCall[0]).toBe('wf_1');
    expect(batchCall[1]).toBe('user_1');
    expect((batchCall[2] as { leads: { id: string }[] }).leads.map((l) => l.id)).toEqual(['lead_h', 'lead_d']);

    // The single execution snapshots the verbatim niche AND the split list.
    const snapshot = (batchCall[2] as { targetSnapshot: Record<string, unknown> }).targetSnapshot;
    expect(snapshot.niche).toBe('hospital, dentist');
    expect(snapshot.requestedNiches).toEqual(['hospital', 'dentist']);
    expect(snapshot.mode).toBe('niche');
    expect(snapshot.leadCount).toBe(2);
  });

  it('the multi-niche query is owner-scoped and only fetches matching candidates', async () => {
    mocks.db.lead.findMany.mockResolvedValue([]);

    await callExecuteRoute({ target: { mode: 'niche', niche: 'hospital, dentist' } });

    const where = mocks.db.lead.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe('user_1');
    expect(where.isActive).toBe(true);
    expect(where.OR).toEqual([
      { niche: { contains: 'hospital' } },
      { niche: { contains: 'dentist' } },
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Missing niche → discovery bridge (replaces NO_MATCHING_LEADS)
// ═══════════════════════════════════════════════════════════════════

describe('Part 1 — missing-niche discovery bridge', () => {
  it('niche with zero matching leads + provider configured → 202 discovering, ONE execution, no upfront charge', async () => {
    mocks.db.lead.findMany.mockResolvedValue([]);

    const { status, json } = await callExecuteRoute({
      target: { mode: 'niche', niche: 'agency, real estate, restaurants' },
    });

    expect(status).toBe(202);
    expect(json.status).toBe('discovering');
    expect(json.executionId).toBe('exec_disc_1');
    expect(json.async).toBe(true);
    expect(json.creditsCharged).toBe(0); // the fee lands only when leads exist
    expect(json.error).toBeUndefined();
    // The discovery bridge received the structured niche target.
    expect(mocks.executeNicheRunWithDiscovery).toHaveBeenCalledTimes(1);
    const bridgeCall = mocks.executeNicheRunWithDiscovery.mock.calls[0][0];
    expect(bridgeCall.workflowId).toBe('wf_1');
    expect(bridgeCall.userId).toBe('user_1');
    expect(bridgeCall.niche).toBe('agency, real estate, restaurants');
    expect(bridgeCall.targetSnapshot.requestedNiches).toEqual(['agency', 'real estate', 'restaurants']);
    // No batch execution was kicked yet; nothing was charged.
    expect(mocks.executeWorkflowBatch).not.toHaveBeenCalled();
    expect(mocks.chargeWorkflowExecutionFee).not.toHaveBeenCalled();
  });

  it('niche with zero matching leads + provider NOT configured → actionable 422, nothing executed', async () => {
    mocks.db.lead.findMany.mockResolvedValue([]);
    mocks.isZaiProviderConfigured.mockReturnValue(false);

    const { status, json } = await callExecuteRoute({
      target: { mode: 'niche', niche: 'agency' },
    });

    expect(status).toBe(422);
    expect(json.code).toBe('DISCOVERY_PROVIDER_NOT_CONFIGURED');
    expect(json.requestedNiche).toBe('agency');
    expect(json.requestedNiches).toEqual(['agency']);
    expect(json.matchingLeadCount).toBe(0);
    expect(json.error).toContain('.z-ai-config');
    expect(mocks.executeNicheRunWithDiscovery).not.toHaveBeenCalled();
    expect(mocks.executeWorkflowBatch).not.toHaveBeenCalled();
    expect(mocks.chargeWorkflowExecutionFee).not.toHaveBeenCalled();
  });

  it('a partially-matching multi-niche target still runs (only full misses enter the discovery bridge)', async () => {
    mocks.db.lead.findMany.mockResolvedValue([makeLead('lead_d', 'dentist')]);

    const { status } = await callExecuteRoute({
      target: { mode: 'niche', niche: 'hospital, dentist' },
    });

    expect(status).toBe(202);
    expect(mocks.executeNicheRunWithDiscovery).not.toHaveBeenCalled();
    expect(mocks.executeWorkflowBatch).toHaveBeenCalledTimes(1);
    expect((mocks.executeWorkflowBatch.mock.calls[0][2] as { leads: unknown[] }).leads).toHaveLength(1);
  });
});
