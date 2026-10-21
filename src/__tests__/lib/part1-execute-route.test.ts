// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Part 1 — Execute Route (multi-niche targeting +
// structured NO_MATCHING_LEADS)
//
// Covers POST /api/workflows/[id]/execute:
//   1. Multi-niche resolution — "hospital, dentist" matches leads whose
//      OWN niche is either value (per-lead attribution preserved; the
//      comma-joined string never matches).
//   2. NO_MATCHING_LEADS for a multi-niche target carries the full
//      structured payload (requestedNiches split, matchingLeadCount 0).
//   3. Nothing executes for a no-leads run — no execution records, so
//      nothing retries or notifies in the background.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  state: {
    user: { id: 'user_1', email: 't@t.test', name: 'T', role: 'owner', plan: 'pro', orgId: null },
  },
  db: {
    workflowDefinition: { findFirst: vi.fn(), findUnique: vi.fn() },
    workflowExecution: { findMany: vi.fn() },
    lead: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  },
  executeWorkflow: vi.fn(),
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

import { POST as executeRoute } from '@/app/api/workflows/[id]/execute/route';

const WORKFLOW = {
  id: 'wf_1', userId: 'user_1', name: 'Lead Qualification Outreach', status: 'active', disabledBySubscription: false,
  nodes: JSON.stringify([
    { id: 'n_trigger', type: 'trigger', title: 'Trigger', config: {} },
    { id: 'n_note', type: 'action', title: 'Record activity', config: { actionType: 'add_note', content: 'Contacted' } },
  ]),
  workflowSteps: [],
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
  mocks.executeWorkflow.mockImplementation(async (_wf: string, _user: string, triggerData: Record<string, unknown>) => ({
    executionId: `exec_${String(triggerData.leadId)}`,
    status: 'running',
  }));
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
// 1. Multi-niche resolution
// ═══════════════════════════════════════════════════════════════════

describe('Part 1 — multi-niche targeting resolution', () => {
  it('"hospital, dentist" matches leads carrying EITHER niche exactly — one execution per lead', async () => {
    mocks.db.lead.findMany.mockResolvedValue([
      makeLead('lead_h', 'hospital'),
      makeLead('lead_d', 'dentist'),
      makeLead('lead_j', 'hospital, dentist'), // the joined string — NOT a match
      makeLead('lead_x', 'stationery'),
    ]);
    mocks.db.workflowExecution.findMany.mockResolvedValue([]);

    const { status, json } = await callExecuteRoute({
      target: { mode: 'niche', niche: 'hospital, dentist' },
    });

    expect(status).toBe(202);
    expect(json.target.leadCount).toBe(2);
    expect(mocks.executeWorkflow).toHaveBeenCalledTimes(2);
    const targetedIds = mocks.executeWorkflow.mock.calls.map(
      (c: unknown[]) => (c[2] as { leadId: string }).leadId,
    );
    expect(targetedIds).toEqual(['lead_h', 'lead_d']);

    // The per-lead executions snapshot the verbatim niche AND the split list.
    const triggerData = mocks.executeWorkflow.mock.calls[0][2] as {
      target: { niche: string; requestedNiches?: string[]; mode: string };
    };
    expect(triggerData.target.niche).toBe('hospital, dentist');
    expect(triggerData.target.requestedNiches).toEqual(['hospital', 'dentist']);
    expect(triggerData.target.mode).toBe('niche');
  });

  it('the multi-niche query is owner-scoped and only fetches matching candidates', async () => {
    mocks.db.lead.findMany.mockResolvedValue([]);
    mocks.db.workflowExecution.findMany.mockResolvedValue([]);

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
// 2. Structured NO_MATCHING_LEADS (multi-niche)
// ═══════════════════════════════════════════════════════════════════

describe('Part 1 — structured NO_MATCHING_LEADS for a multi-niche target', () => {
  it('returns the full structured business payload and executes nothing', async () => {
    mocks.db.lead.findMany.mockResolvedValue([]);

    const { status, json } = await callExecuteRoute({
      target: { mode: 'niche', niche: 'agency, real estate, restaurants' },
    });

    expect(status).toBe(400);
    // A structured BUSINESS result — distinct from engine crash (500),
    // provider failure, and invalid configuration (WORKFLOW_INVALID 422).
    expect(json.code).toBe('NO_MATCHING_LEADS');
    expect(json.workflowId).toBe('wf_1');
    expect(json.userId).toBe('user_1');
    expect(json.targetMode).toBe('niche');
    expect(json.requestedNiche).toBe('agency, real estate, restaurants');
    expect(json.requestedNiches).toEqual(['agency', 'real estate', 'restaurants']);
    expect(json.targetConfig).toEqual({ mode: 'niche', niche: 'agency, real estate, restaurants' });
    expect(json.matchingLeadCount).toBe(0);
    expect(json.error).toContain('Discover leads in that niche first');

    // No execution record was created: no retry loop, no notifications,
    // nothing for Cancel to clean up server-side.
    expect(mocks.executeWorkflow).not.toHaveBeenCalled();
  });

  it('a partially-matching multi-niche target still runs (only full misses are business results)', async () => {
    mocks.db.lead.findMany.mockResolvedValue([makeLead('lead_d', 'dentist')]);
    mocks.db.workflowExecution.findMany.mockResolvedValue([]);

    const { status } = await callExecuteRoute({
      target: { mode: 'niche', niche: 'hospital, dentist' },
    });

    expect(status).toBe(202);
    expect(mocks.executeWorkflow).toHaveBeenCalledTimes(1);
  });
});
