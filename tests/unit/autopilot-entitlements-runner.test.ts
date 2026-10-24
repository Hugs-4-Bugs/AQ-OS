// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Phase 23 runAutopilot Defense-in-Depth Gate Tests
//
// This file imports the REAL `@/lib/autopilot/runner` module (NOT mocked)
// so the defense-in-depth entitlement gate inside `runAutopilot` is
// exercised directly. External dependencies (DB, lead-discovery,
// workflow-batch, credit-service, workflow-credits, lead-intelligence)
// are mocked so the test can assert the gate's behavior without the full
// run pipeline.
//
// Tested surface:
//   · Free plan manual run → blocked with code PLAN_INELIGIBLE
//   · Starter plan manual run → blocked with code PLAN_INELIGIBLE
//   · Pro plan manual run → passes the gate
//   · Elite plan manual run → passes the gate
//   · Blocked run never mutates autopilot state (no ACTIVE→RUNNING)
//   · Blocked run = 0 credits (no chargeWorkflowExecutionFee call)
//   · Cross-user isolation: User B cannot run User A's autopilot → NOT_FOUND
//   · Existing 5-credit execution invariant preserved (gate doesn't double-bill)
//   · Blocked run NEVER mutates profile data (no destructive delete)
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pacing/poll constants are read at module-load — zero them out BEFORE
// the runner module is imported so tests run instantly.
vi.hoisted(() => {
  process.env.AUTOPILOT_EXECUTION_PACING_MS = '0';
  process.env.AUTOPILOT_NICHE_PACING_MS = '0';
  process.env.AUTOPILOT_JOB_POLL_MS = '10';
  process.env.AUTOPILOT_EXECUTION_SETTLE_POLL_MS = '1';
  process.env.AUTOPILOT_EXECUTION_SETTLE_TIMEOUT_MS = '150';
});

// ── Mock DB (Prisma-shaped subset that Phase 23 runner code touches). ──
const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  autopilotWorkflow: {
    findFirst: vi.fn(), findMany: vi.fn(),
    create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), count: vi.fn(),
  },
  autopilotRun: {
    findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(),
    create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn(),
  },
  autopilotLead: {
    create: vi.fn(), updateMany: vi.fn(),
    deleteMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(),
  },
  workflowDefinition: { findFirst: vi.fn(), findMany: vi.fn() },
  discoveryJob: { findUnique: vi.fn(), create: vi.fn() },
  lead: { findFirst: vi.fn() },
  workflowExecution: { findUnique: vi.fn(), update: vi.fn() },
  workflowExecutionLead: { findMany: vi.fn() },
  businessProfile: { findFirst: vi.fn(), count: vi.fn(), delete: vi.fn(), update: vi.fn() },
  __ledger: new Set<string>(),
}));
vi.mock('@/lib/db', () => ({ db: mockPrisma }));

// ── Mock the external execution layers — the runner must integrate with
//    (not reimplement) the discovery pipeline and the batch execution
//    engine. The credit layer is mocked so blocked-execution-is-zero-
//    credits is directly observable. ──
const mockResolveBusinessProfileForUser = vi.hoisted(() => vi.fn());
vi.mock('@/lib/lead-intelligence', () => ({
  resolveBusinessProfileForUser: mockResolveBusinessProfileForUser,
}));
const mockStartDiscoveryJob = vi.hoisted(() => vi.fn());
const mockExecuteWorkflowBatch = vi.hoisted(() => vi.fn());
const mockCheckCreditSufficiency = vi.hoisted(() => vi.fn());
vi.mock('@/lib/lead-discovery-service', () => ({ startDiscoveryJob: mockStartDiscoveryJob }));
vi.mock('@/lib/workflow-batch', () => ({ executeWorkflowBatch: mockExecuteWorkflowBatch }));
vi.mock('@/lib/credit-service', () => ({
  checkCreditSufficiency: mockCheckCreditSufficiency,
  CREDIT_COSTS: { lead_discovery: 1 },
}));
const mockChargeWorkflowExecutionFee = vi.hoisted(() => vi.fn());
const mockRefundWorkflowExecutionFee = vi.hoisted(() => vi.fn());
vi.mock('@/lib/workflow-credits', () => ({
  chargeWorkflowExecutionFee: mockChargeWorkflowExecutionFee,
  refundWorkflowExecutionFee: mockRefundWorkflowExecutionFee,
  WORKFLOW_EXECUTION_FEE_CREDITS: 5,
  checkExecutionLimit: vi.fn(async () => ({ allowed: true, current: 0, limit: 500 })),
}));

// ── Import the REAL runner module. The defense-in-depth entitlement gate
//    at the top of runAutopilot is the surface under test. ──
import { runAutopilot } from '@/lib/autopilot/runner';
import { serializeSchedule, type ScheduleConfig } from '@/lib/autopilot/schedule';

const CANONICAL: ScheduleConfig = {
  every: 1, unit: 'DAYS', timezone: 'Asia/Kolkata', startAt: '09:30',
  anchorDate: '2026-10-24', enabled: true,
};
const CANONICAL_JSON = serializeSchedule(CANONICAL);

function autopilotRowForRun(over: Record<string, unknown> = {}) {
  return {
    id: 'ap1',
    userId: 'u1',
    orgId: null,
    name: 'Test Autopilot',
    status: 'ACTIVE',
    niches: JSON.stringify(['Dental']),
    geography: JSON.stringify({ country: 'India', city: 'Mumbai' }),
    profileMappings: '{}',
    workflowId: 'wf1',
    schedule: CANONICAL_JSON,
    nextRunAt: new Date(),
    lastRunAt: null,
    lastError: null,
    runCount: 0,
    totalDiscovered: 0, totalSaved: 0, totalProcessed: 0, totalExecutions: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (mockPrisma.__ledger as Set<string>).clear();
  // Default mocks — most tests override per-case.
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'pro', subscriptions: [] });
  mockPrisma.workflowDefinition.findFirst.mockResolvedValue({ id: 'wf1', userId: 'u1', status: 'active', name: 'WF', profileId: 'bp1' });
  mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(autopilotRowForRun());
  mockPrisma.autopilotWorkflow.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.autopilotWorkflow.update.mockResolvedValue({});
  mockPrisma.autopilotRun.findFirst.mockResolvedValue(null);
  mockPrisma.autopilotRun.findUnique.mockImplementation(async ({ where }: { where: { id?: string; runKey?: string } }) => {
    if (where && typeof where.runKey === 'string') return null;
    return { id: where?.id || 'run1', status: 'RUNNING', runKey: 'rk-1', executionId: null };
  });
  mockPrisma.autopilotRun.create.mockResolvedValue({ id: 'run1', duplicate: false });
  mockPrisma.autopilotRun.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.workflowExecution.findUnique.mockResolvedValue({ status: 'completed' });
  mockPrisma.workflowExecution.update.mockResolvedValue({});
  mockPrisma.workflowExecutionLead.findMany.mockResolvedValue([]);
  mockPrisma.autopilotLead.create.mockResolvedValue({});
  mockPrisma.autopilotLead.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.discoveryJob.findUnique.mockResolvedValue({ status: 'completed', result: { leads: [] } });
  mockPrisma.lead.findFirst.mockResolvedValue(null);
  mockResolveBusinessProfileForUser.mockResolvedValue({
    profile: { id: 'bp1', name: 'P', preferredTone: 'professional', preferredLanguage: 'English', cta: 'Book' },
    source: 'workflow',
  });
  mockCheckCreditSufficiency.mockResolvedValue({ sufficient: true, balance: 1000, shortfall: 0 });
  mockChargeWorkflowExecutionFee.mockResolvedValue({ ok: true, newBalance: 745 });
  mockExecuteWorkflowBatch.mockResolvedValue({ executionId: 'exec1', started: 0 });
});

// ═══════════════════════════════════════════════════════════════════
// Group 1: Defense-in-depth entitlement gate — plan eligibility
// ═══════════════════════════════════════════════════════════════════

describe('Phase 23 — runAutopilot defense-in-depth gate (plan eligibility)', () => {
  it('Free plan: manual run is BLOCKED with code PLAN_INELIGIBLE', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'free', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(autopilotRowForRun({ status: 'ACTIVE' }));
    const result = await runAutopilot('ap1', 'u1', 'manual');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PLAN_INELIGIBLE');
    expect(result.error).toMatch(/Pro\/Elite only/i);
  });

  it('Starter plan: manual run is BLOCKED with code PLAN_INELIGIBLE', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'starter', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(autopilotRowForRun({ status: 'ACTIVE' }));
    const result = await runAutopilot('ap1', 'u1', 'manual');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PLAN_INELIGIBLE');
  });

  it('Malformed plan values (enterprise, unknown, empty) → safe-deny to free → BLOCKED', async () => {
    // Note: 'PRO' (uppercase) is NOT malformed — normalizePlan lowercases
    // it to 'pro' (eligible). Only values that don't lowercase-match a
    // canonical plan map to free.
    for (const rawPlan of ['enterprise', 'super-pro', 'unknown-plan', '', null]) {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: rawPlan, subscriptions: [] });
      mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(autopilotRowForRun({ status: 'ACTIVE' }));
      const result = await runAutopilot('ap1', 'u1', 'manual');
      expect(result.ok).toBe(false);
      expect(result.code).toBe('PLAN_INELIGIBLE');
    }
  });

  it('Case-insensitive legacy plan: PRO (uppercase) → eligible (Pro plan)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'PRO', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(autopilotRowForRun({ status: 'ACTIVE' }));
    const result = await runAutopilot('ap1', 'u1', 'manual');
    expect(result.code).not.toBe('PLAN_INELIGIBLE');
  });

  it('Pro plan: manual run PASSES the entitlement gate (code != PLAN_INELIGIBLE)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'pro', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(autopilotRowForRun({ status: 'ACTIVE' }));
    const result = await runAutopilot('ap1', 'u1', 'manual');
    expect(result.code).not.toBe('PLAN_INELIGIBLE');
  });

  it('Elite plan: manual run PASSES the entitlement gate (code != PLAN_INELIGIBLE)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'elite', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(autopilotRowForRun({ status: 'ACTIVE' }));
    const result = await runAutopilot('ap1', 'u1', 'manual');
    expect(result.code).not.toBe('PLAN_INELIGIBLE');
  });

  it('Active subscription plan overrides user.plan at run time (sub wins)', async () => {
    // user.plan = 'free' but they have an active 'pro' subscription → eligible.
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u1', plan: 'free',
      subscriptions: [{ plan: 'pro' }],
    });
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(autopilotRowForRun({ status: 'ACTIVE' }));
    const result = await runAutopilot('ap1', 'u1', 'manual');
    expect(result.code).not.toBe('PLAN_INELIGIBLE');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Group 2: Blocked run is non-mutating + zero-credit
// ═══════════════════════════════════════════════════════════════════

describe('Phase 23 — blocked run is non-mutating + zero-credit', () => {
  it('Blocked run NEVER mutates autopilot state (no ACTIVE→RUNNING claim)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'free', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(autopilotRowForRun({ status: 'ACTIVE' }));
    await runAutopilot('ap1', 'u1', 'manual');
    expect(mockPrisma.autopilotWorkflow.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RUNNING' }) })
    );
    expect(mockPrisma.autopilotRun.create).not.toHaveBeenCalled();
  });

  it('Blocked run NEVER charges credits (chargeWorkflowExecutionFee not called)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'free', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(autopilotRowForRun({ status: 'ACTIVE' }));
    await runAutopilot('ap1', 'u1', 'manual');
    expect(mockChargeWorkflowExecutionFee).not.toHaveBeenCalled();
    expect(mockRefundWorkflowExecutionFee).not.toHaveBeenCalled();
  });

  it('Blocked run NEVER deletes/updates BusinessProfile (no destructive profile mutation)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'free', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(autopilotRowForRun({ status: 'ACTIVE' }));
    await runAutopilot('ap1', 'u1', 'manual');
    expect(mockPrisma.businessProfile.delete).not.toHaveBeenCalled();
    expect(mockPrisma.businessProfile.update).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Group 3: Cross-user isolation (ownership scoping inside runAutopilot)
// ═══════════════════════════════════════════════════════════════════

describe('Phase 23 — cross-user isolation (runAutopilot ownership)', () => {
  it('User B cannot run User A\'s autopilot: scoped findFirst returns null → NOT_FOUND (before plan check)', async () => {
    // User B is pro (so the entitlement gate would have passed if the
    // autopilot existed). The scoped query `{ id: 'apA', userId: 'uB' }`
    // returns null because the autopilot belongs to User A.
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'uB', plan: 'pro', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(null); // not owned by uB
    const result = await runAutopilot('apA', 'uB', 'manual');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('NOT_FOUND'); // ownership checked BEFORE plan
    // No state mutation on autopilot A (it doesn't belong to uB).
    expect(mockPrisma.autopilotWorkflow.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.autopilotRun.create).not.toHaveBeenCalled();
    // No charge either.
    expect(mockChargeWorkflowExecutionFee).not.toHaveBeenCalled();
  });

  it('NOT_FOUND happens BEFORE PLAN_INELIGIBLE — ownership check is the first gate', async () => {
    // User B is free AND doesn't own the autopilot. The NOT_FOUND check
    // fires FIRST (autopilot.findFirst returns null), so the user never
    // even reaches the plan check. The two outcomes are distinguishable.
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'uB', plan: 'free', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(null);
    const result = await runAutopilot('apA', 'uB', 'manual');
    expect(result.code).toBe('NOT_FOUND'); // not PLAN_INELIGIBLE
  });
});

// ═══════════════════════════════════════════════════════════════════
// Group 4: 5-credit execution invariant preserved (eligible plan)
// ═══════════════════════════════════════════════════════════════════

describe('Phase 23 — 5-credit execution invariant (eligible Pro run)', () => {
  it('A Pro-plan eligible run goes through the canonical charge path (gate does not double-bill)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'pro', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(autopilotRowForRun({ status: 'ACTIVE' }));
    await runAutopilot('ap1', 'u1', 'manual');
    // The Phase 23 gate itself adds ZERO charges. The canonical 5-credit
    // charge happens inside executeAutopilotRun via chargeWorkflowExecutionFee
    // — covered by autopilot-runner.test.ts. Here we assert the gate
    // doesn't ADD an extra charge on top of the canonical one.
    const chargeCalls = mockChargeWorkflowExecutionFee.mock.calls;
    expect(chargeCalls.length).toBeLessThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Group 5: Upgrade scenario — previously-blocked manual run now proceeds
// ═══════════════════════════════════════════════════════════════════

describe('Phase 23 — upgrade scenario (manual run after plan upgrade)', () => {
  it('First call blocked (free), second call proceeds after upgrade to Pro', async () => {
    // First call — free plan.
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'u1', plan: 'free', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(autopilotRowForRun({ status: 'ACTIVE' }));
    const r1 = await runAutopilot('ap1', 'u1', 'manual');
    expect(r1.code).toBe('PLAN_INELIGIBLE');
    // Second call — user upgraded to pro.
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'u1', plan: 'pro', subscriptions: [] });
    const r2 = await runAutopilot('ap1', 'u1', 'manual');
    expect(r2.code).not.toBe('PLAN_INELIGIBLE');
  });
});
