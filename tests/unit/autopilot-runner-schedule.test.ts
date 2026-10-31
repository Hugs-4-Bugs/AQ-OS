// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Runner/Schedule Integration Unit Tests
//
// runAutopilot × Phase 22: scheduler-trigger runs through the SAME
// canonical runner · deterministic slot runKey convergence (no second
// run / no second charge) · manual runs NEVER mutate the schedule ·
// manual-run permissions (ACTIVE-only) · insufficient credits → honest
// FAILED with the schedule untouched · immutable schedule snapshot in
// the run config · billing invariants (ONE flat fee per actual run,
// zero for scheduling).
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.AUTOPILOT_EXECUTION_PACING_MS = '0';
  process.env.AUTOPILOT_NICHE_PACING_MS = '0';
  process.env.AUTOPILOT_JOB_POLL_MS = '10';
  process.env.AUTOPILOT_EXECUTION_SETTLE_POLL_MS = '1';
  process.env.AUTOPILOT_EXECUTION_SETTLE_TIMEOUT_MS = '150';
});

const mockPrisma = vi.hoisted(() => ({
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
  businessProfile: { findFirst: vi.fn() },
  // defense-in-depth entitlement gate inside runAutopilot
  // calls resolveUserPlan(userId) → db.user.findUnique.
  user: { findUnique: vi.fn() },
  __ledger: new Set<string>(),
}));

vi.mock('@/lib/db', () => ({ db: mockPrisma }));

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

import { runAutopilot } from '@/lib/autopilot/runner';
import { parsePersistedSchedule, serializeSchedule } from '@/lib/autopilot/schedule';

const CANONICAL_JSON = serializeSchedule({
  every: 1, unit: 'DAYS', timezone: 'Asia/Kolkata', startAt: '09:30',
  anchorDate: '2026-10-24', enabled: true,
});

function autopilotRow(over: Record<string, unknown> = {}) {
  return {
    id: 'ap1',
    userId: 'u1',
    orgId: null,
    name: 'Test Autopilot',
    status: 'ACTIVE',
    niches: JSON.stringify(['Dental']),
    geography: JSON.stringify({ countries: ['India'] }),
    profileMappings: '{}',
    workflowId: 'wf1',
    schedule: CANONICAL_JSON,
    ...over,
  };
}

function completedJob() {
  return {
    id: 'job1',
    status: 'completed',
    totalFound: 2,
    imported: 2,
    duplicates: 0,
    failed: 0,
    filteredOut: 0,
    errorMessage: null,
    resultData: JSON.stringify([
      { businessName: 'Bright Smiles', website: 'https://bright.example', city: 'Mumbai', country: 'India' },
      { businessName: 'City Hospital', website: 'https://cityh.example', city: 'Mumbai', country: 'India' },
    ]),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (mockPrisma.__ledger as Set<string>).clear();
  mockCheckCreditSufficiency.mockResolvedValue({ sufficient: true, balance: 1000, shortfall: 0 });
  mockPrisma.workflowDefinition.findFirst.mockResolvedValue({ id: 'wf1', userId: 'u1', status: 'active', name: 'Test WF', profileId: 'bp1' });
  // default Pro plan so the runAutopilot defense-in-depth gate
  // passes; ineligible plans are exercised in autopilot-entitlements.test.ts.
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'pro', subscriptions: [] });
  mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(autopilotRow());
  mockPrisma.autopilotWorkflow.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.autopilotWorkflow.update.mockResolvedValue({});
  mockPrisma.autopilotRun.findFirst.mockResolvedValue(null); // no open run
  mockPrisma.autopilotRun.findUnique.mockImplementation(async ({ where }: { where: { id?: string; runKey?: string } }) => {
    if (where && typeof where.runKey === 'string') return null;
    return { id: where?.id || 'run_new', status: 'RUNNING', runKey: 'rk-1', executionId: 'exec1' };
  });
  mockPrisma.autopilotRun.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'run_new', ...data,
  }));
  mockPrisma.autopilotRun.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.autopilotRun.update.mockResolvedValue({});
  mockPrisma.workflowExecution.findUnique.mockResolvedValue({ status: 'completed' });
  mockPrisma.workflowExecution.update.mockResolvedValue({});
  mockPrisma.workflowExecutionLead.findMany.mockResolvedValue([]);
  mockResolveBusinessProfileForUser.mockResolvedValue({
    profile: { id: 'bp1', name: 'Profile A', preferredTone: 'professional', preferredLanguage: 'English', cta: 'Book a call' },
    source: 'workflow',
  });
  mockPrisma.autopilotLead.create.mockResolvedValue({});
  mockPrisma.autopilotLead.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.discoveryJob.findUnique.mockResolvedValue(completedJob());
  mockStartDiscoveryJob.mockResolvedValue({ jobId: 'job1', status: 'started', message: 'ok' });
  mockExecuteWorkflowBatch.mockImplementation(
    async (_wf: string, _user: string, opts: { leads: unknown[] }) => ({
      executionId: 'exec1',
      status: 'running',
      leadCount: opts.leads.length,
      stepsCompleted: 0,
    })
  );
  mockChargeWorkflowExecutionFee.mockResolvedValue({ ok: true, alreadyProcessed: false, newBalance: 995 });
  mockRefundWorkflowExecutionFee.mockResolvedValue({ refunded: true, newBalance: 1000 });
  mockPrisma.lead.findFirst.mockImplementation(async ({ where }: { where: { website?: string } }) => {
    if (where.website === 'https://bright.example') return { id: 'lead-bright', businessName: 'Bright Smiles', niche: 'Dental' };
    if (where.website === 'https://cityh.example') return { id: 'lead-cityh', businessName: 'City Hospital', niche: 'Dental' };
    return null;
  });
});

describe('runAutopilot — scheduler trigger (same canonical path)', () => {
  it('a scheduled run carries the deterministic slot runKey and ONE flat charge (category 21)', async () => {
    const slotKey = 'scheduled:ap1:1790000000000';
    const result = await runAutopilot('ap1', 'u1', 'scheduler', { runKey: slotKey });
    expect(result.ok).toBe(true);
    expect(result.duplicate).toBeFalsy();
    expect(result.outcome?.status).toBe('COMPLETED');
    // The run row is created with the scheduler's slot identity.
    const createData = mockPrisma.autopilotRun.create.mock.calls[0][0].data;
    expect(createData.runKey).toBe(slotKey);
    expect(createData.trigger).toBe('scheduler');
    // ONE parent execution + ONE -5 charge keyed to the run — never per
    // country, never per niche, never per scheduling event.
    expect(mockExecuteWorkflowBatch).toHaveBeenCalledTimes(1);
    expect(mockChargeWorkflowExecutionFee).toHaveBeenCalledTimes(1);
    expect(mockChargeWorkflowExecutionFee.mock.calls[0][0].chargeKey).toBe('wfexec-run:autopilot-ap1-run-run_new');
  });

  it('the run config snapshots the schedule config that fired it (immutable)', async () => {
    await runAutopilot('ap1', 'u1', 'scheduler', { runKey: 'scheduled:ap1:1790000000001' });
    const configUpdate = mockPrisma.autopilotRun.update.mock.calls.find(
      (c: unknown[]) => typeof (c[0] as { data?: { config?: string } }).data?.config === 'string'
    );
    expect(configUpdate).toBeTruthy();
    const config = JSON.parse((configUpdate![0] as { data: { config: string } }).data.config);
    expect(config.schedule).toEqual(parsePersistedSchedule(CANONICAL_JSON));
    expect(config.schedule).toMatchObject({ every: 1, unit: 'DAYS', timezone: 'Asia/Kolkata', startAt: '09:30' });
    // country snapshot still rides along.
    expect(config.countries).toEqual(['India']);
    expect(config.worldwide).toBe(false);
  });

  it('a legacy-schedule row snapshots the equivalent canonical config', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(autopilotRow({ schedule: 'daily' }));
    await runAutopilot('ap1', 'u1', 'scheduler', { runKey: 'scheduled:ap1:1790000000002' });
    const configUpdate = mockPrisma.autopilotRun.update.mock.calls.find(
      (c: unknown[]) => typeof (c[0] as { data?: { config?: string } }).data?.config === 'string'
    );
    const config = JSON.parse((configUpdate![0] as { data: { config: string } }).data.config);
    expect(config.schedule).toMatchObject({ every: 1, unit: 'DAYS', timezone: 'UTC', startAt: null, enabled: true });
  });
});

describe('runAutopilot — duplicate invocation convergence (categories 15 · 24)', () => {
  it('a replayed slot runKey returns the EXISTING run — no second run, no second charge', async () => {
    mockPrisma.autopilotRun.findUnique.mockImplementation(async ({ where }: { where: { id?: string; runKey?: string } }) => {
      if (where && where.runKey === 'scheduled:ap1:1790000000000') {
        return { id: 'run_prior' };
      }
      return { id: where?.id || 'run_new', status: 'RUNNING', runKey: 'rk-1', executionId: 'exec1' };
    });
    const result = await runAutopilot('ap1', 'u1', 'scheduler', { runKey: 'scheduled:ap1:1790000000000' });
    expect(result.ok).toBe(true);
    expect(result.duplicate).toBe(true);
    expect(result.runId).toBe('run_prior');
    expect(mockExecuteWorkflowBatch).not.toHaveBeenCalled();
    expect(mockChargeWorkflowExecutionFee).not.toHaveBeenCalled();
    expect(mockPrisma.autopilotRun.create).not.toHaveBeenCalled();
    // The pre-check returns BEFORE the ACTIVE→RUNNING claim — no state
    // was mutated at all (idempotent replay, zero side effects).
    expect(mockPrisma.autopilotWorkflow.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.autopilotWorkflow.update).not.toHaveBeenCalled();
  });
});

describe('runAutopilot — manual runs (categories 12 · 17)', () => {
  it('a manual run works on an ACTIVE autopilot and NEVER mutates nextRunAt', async () => {
    const result = await runAutopilot('ap1', 'u1', 'manual');
    expect(result.ok).toBe(true);
    expect(result.outcome?.status).toBe('COMPLETED');
    // Manual runKey identity (unique per invocation).
    const createData = mockPrisma.autopilotRun.create.mock.calls[0][0].data;
    expect(String(createData.runKey)).toMatch(/^manual:ap1:\d+$/);
    expect(createData.trigger).toBe('manual');
    // The workflow-row mutations from a manual run: claim + finalize —
    // NONE of them may touch the schedule's nextRunAt (the scheduler
    // alone advances it).
    for (const call of mockPrisma.autopilotWorkflow.updateMany.mock.calls) {
      expect((call[0] as { data: Record<string, unknown> }).data.nextRunAt).toBeUndefined();
    }
    for (const call of mockPrisma.autopilotWorkflow.update.mock.calls) {
      expect((call[0] as { data: Record<string, unknown> }).data.nextRunAt).toBeUndefined();
    }
    // Still exactly ONE charge — the manual run pays the same flat fee.
    expect(mockChargeWorkflowExecutionFee).toHaveBeenCalledTimes(1);
  });

  it('a manual run on a PAUSED autopilot is rejected (existing permission, category 12)', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(autopilotRow({ status: 'PAUSED' }));
    const result = await runAutopilot('ap1', 'u1', 'manual');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_STATE');
    expect(mockPrisma.autopilotRun.create).not.toHaveBeenCalled();
    expect(mockChargeWorkflowExecutionFee).not.toHaveBeenCalled();
  });

  it('a manual run on a schedule-DISABLED (but ACTIVE) autopilot still runs', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(
      autopilotRow({ schedule: serializeSchedule({ every: 1, unit: 'DAYS', timezone: 'UTC', startAt: null, anchorDate: null, enabled: false }) })
    );
    const result = await runAutopilot('ap1', 'u1', 'manual');
    expect(result.ok).toBe(true);
    expect(mockChargeWorkflowExecutionFee).toHaveBeenCalledTimes(1);
  });

  it('an in-flight run blocks a concurrent manual run (RUN_IN_PROGRESS — the scheduled/manual race)', async () => {
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({ id: 'run_open' });
    const result = await runAutopilot('ap1', 'u1', 'manual');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('RUN_IN_PROGRESS');
    expect(mockPrisma.autopilotRun.create).not.toHaveBeenCalled();
    expect(mockChargeWorkflowExecutionFee).not.toHaveBeenCalled();
  });
});

describe('runAutopilot — failure recovery (category 22)', () => {
  it('insufficient credits → honest FAILED outcome, schedule state untouched (no nextRunAt mutation)', async () => {
    mockCheckCreditSufficiency.mockResolvedValue({ sufficient: false, balance: 0, shortfall: 5 });
    const result = await runAutopilot('ap1', 'u1', 'scheduler', { runKey: 'scheduled:ap1:1790000000003' });
    expect(result.ok).toBe(true);
    expect(result.outcome?.status).toBe('FAILED');
    // Finalize: RUNNING → FAILED with an honest error + counters…
    const finalize = mockPrisma.autopilotWorkflow.updateMany.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data?.status === 'FAILED'
    );
    expect(finalize).toBeTruthy();
    expect((finalize![0] as { data: { lastError: string } }).data.lastError).toBeTruthy();
    // …but NO nextRunAt mutation — the schedule itself survives; the
    // scheduler-runner persists the next occurrence independently.
    for (const call of mockPrisma.autopilotWorkflow.updateMany.mock.calls) {
      expect((call[0] as { data: Record<string, unknown> }).data.nextRunAt).toBeUndefined();
    }
    // No execution was created → no charge for this failed run.
    expect(mockChargeWorkflowExecutionFee).not.toHaveBeenCalled();
  });
});
