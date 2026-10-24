// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Runner Unit Tests
// Atomic run claiming · per-user mutex · ledger idempotency ·
// stuck-run recovery · honest failure propagation
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pacing/poll constants are read at module-load — zero them out BEFORE
// the runner module is imported so tests run instantly.
vi.hoisted(() => {
  process.env.AUTOPILOT_EXECUTION_PACING_MS = '0';
  process.env.AUTOPILOT_NICHE_PACING_MS = '0';
  process.env.AUTOPILOT_JOB_POLL_MS = '10';
  // Phase 18 — settle watcher must not hang the test worker.
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
  workflowDefinition: { findFirst: vi.fn() },
  discoveryJob: { findUnique: vi.fn(), create: vi.fn() },
  lead: { findFirst: vi.fn() },
  // Phase 18 — parent execution + per-lead items + profile resolution.
  workflowExecution: { findUnique: vi.fn(), update: vi.fn() },
  workflowExecutionLead: { findMany: vi.fn() },
  businessProfile: { findFirst: vi.fn() },
  // Phase 23 — defense-in-depth entitlement gate inside runAutopilot
  // calls resolveUserPlan(userId) → db.user.findUnique.
  user: { findUnique: vi.fn() },
  __ledger: new Set<string>(),
}));

vi.mock('@/lib/db', () => ({ db: mockPrisma }));

// Phase 18 — the runner snapshots the run's profile via the Phase 11–17
// resolution chain (workflow profile → user default). Mocked so tests can
// assert the snapshot without hitting the (mocked) DB.
const mockResolveBusinessProfileForUser = vi.hoisted(() => vi.fn());
vi.mock('@/lib/lead-intelligence', () => ({
  resolveBusinessProfileForUser: mockResolveBusinessProfileForUser,
}));

// Mock the external execution layers — the runner must integrate with
// (not reimplement) the discovery pipeline and the batch execution engine.
const mockStartDiscoveryJob = vi.hoisted(() => vi.fn());
const mockExecuteWorkflowBatch = vi.hoisted(() => vi.fn());
const mockCheckCreditSufficiency = vi.hoisted(() => vi.fn());

vi.mock('@/lib/lead-discovery-service', () => ({
  startDiscoveryJob: mockStartDiscoveryJob,
}));
vi.mock('@/lib/workflow-batch', () => ({
  executeWorkflowBatch: mockExecuteWorkflowBatch,
}));
vi.mock('@/lib/credit-service', () => ({
  checkCreditSufficiency: mockCheckCreditSufficiency,
  CREDIT_COSTS: { lead_discovery: 1 },
}));
// Part 2 — the runner charges the flat execution fee per actual workflow
// execution through the central service; mocked so these tests can assert
// charge counts and idempotency behavior.
const mockChargeWorkflowExecutionFee = vi.hoisted(() => vi.fn());
const mockRefundWorkflowExecutionFee = vi.hoisted(() => vi.fn());
vi.mock('@/lib/workflow-credits', () => ({
  chargeWorkflowExecutionFee: mockChargeWorkflowExecutionFee,
  refundWorkflowExecutionFee: mockRefundWorkflowExecutionFee,
  WORKFLOW_EXECUTION_FEE_CREDITS: 5,
  checkExecutionLimit: vi.fn(async () => ({ allowed: true, current: 0, limit: 500 })),
}));

import { executeAutopilotRun, runAutopilot, recoverStuckAutopilotRuns, cancelAutopilotRun, settleRunExecutionOutcome, withUserLock } from '@/lib/autopilot/runner';

const AUTOPILOT_ROW = {
  id: 'ap1',
  userId: 'u1',
  orgId: null,
  name: 'Test Autopilot',
  status: 'RUNNING',
  niches: JSON.stringify(['Dental', 'Hospital']),
  geography: JSON.stringify({ country: 'India', city: 'Mumbai' }),
  workflowId: 'wf1',
  schedule: 'daily',
};

function completedJob(over: Partial<{ id: string; imported: number; totalFound: number }> = {}) {
  return {
    id: over.id || 'job1',
    status: 'completed',
    totalFound: over.totalFound ?? 2,
    imported: over.imported ?? 2,
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
  mockPrisma.autopilotRun.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.autopilotRun.update.mockResolvedValue({});
  mockPrisma.autopilotWorkflow.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.autopilotWorkflow.update.mockResolvedValue({});
  // Phase 23 — default Pro plan so the runAutopilot defense-in-depth
  // entitlement gate passes and the existing Phase 18 run tests stay
  // focused on the run pipeline. Ineligible-plan scenarios are exercised
  // in tests/unit/autopilot-entitlements.test.ts.
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'pro', subscriptions: [] });
  // Phase 18 — findUnique by runKey → null (no replay); by id → the live
  // run row the runner reads while executing.
  mockPrisma.autopilotRun.findUnique.mockImplementation(async ({ where }: { where: { id?: string; runKey?: string } }) => {
    if (where && typeof where.runKey === 'string') return null;
    return { id: where?.id || 'run1', status: 'RUNNING', runKey: 'rk-1', executionId: null };
  });
  // Phase 18 — parent execution is terminal by default so the detached
  // settle watcher finishes instantly and never hangs the worker.
  mockPrisma.workflowExecution.findUnique.mockResolvedValue({ status: 'completed' });
  mockPrisma.workflowExecution.update.mockResolvedValue({});
  mockPrisma.workflowExecutionLead.findMany.mockResolvedValue([
    { leadId: 'lead-bright', status: 'completed', error: null },
    { leadId: 'lead-cityh', status: 'failed', error: 'send failed' },
  ]);
  // Phase 18 — profile resolution: workflow's own profile wins (Tier 2).
  mockResolveBusinessProfileForUser.mockResolvedValue({
    profile: { id: 'bp1', name: 'Profile A', preferredTone: 'professional', preferredLanguage: 'English', cta: 'Book a call' },
    source: 'workflow',
  });
  mockPrisma.autopilotLead.create.mockImplementation(async ({ data }: { data: { autopilotId: string; leadId: string } }) => {
    // Simulate the DB-level @@unique([autopilotId, leadId]) constraint:
    // the same lead can only ever be inserted once per autopilot.
    const seen = mockPrisma.__ledger as Set<string>;
    const key = `${data.autopilotId}:${data.leadId}`;
    if (seen.has(key)) {
      throw new Error('Unique constraint failed on the constraint: `AutopilotLead_autopilotId_leadId_key`');
    }
    seen.add(key);
    return {};
  });
  mockPrisma.autopilotLead.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.discoveryJob.findUnique.mockResolvedValue(completedJob());
  mockStartDiscoveryJob.mockResolvedValue({ jobId: 'job1', status: 'started', message: 'ok' });
  mockExecuteWorkflowBatch.mockImplementation(
    async (_wf: string, _user: string, opts: { leads: unknown[] }) => ({
      executionId: 'exec1',
      status: 'running',
      leadCount: opts.leads.length,
      stepsCompleted: 0,
    }),
  );
  // Part 2 — default: the flat execution fee charge succeeds.
  mockChargeWorkflowExecutionFee.mockResolvedValue({ ok: true, alreadyProcessed: false, newBalance: 995 });
  mockRefundWorkflowExecutionFee.mockResolvedValue({ refunded: true, newBalance: 1000 });
  // resolve payloads to leads by website
  mockPrisma.lead.findFirst.mockImplementation(async ({ where }) => {
    if (where.website === 'https://bright.example') return { id: 'lead-bright', businessName: 'Bright Smiles', niche: 'Dental' };
    if (where.website === 'https://cityh.example') return { id: 'lead-cityh', businessName: 'City Hospital', niche: 'Hospital' };
    return null;
  });
});

describe('executeAutopilotRun', () => {
  it('executes exactly ONE parent workflow execution for the WHOLE run (Phase 18 model)', async () => {
    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');
    expect(outcome.status).toBe('COMPLETED');
    // BOTH niches discover the SAME two leads; the AutopilotLead unique
    // guard dedupes them across niches, and the run creates exactly ONE
    // parent execution covering both — never one execution per lead and
    // never one per niche.
    expect(outcome.executionsCreated).toBe(1);
    expect(mockExecuteWorkflowBatch).toHaveBeenCalledTimes(1);
    const [wfId, userId, opts] = mockExecuteWorkflowBatch.mock.calls[0];
    expect(wfId).toBe('wf1');
    expect(userId).toBe('u1');
    expect(opts.leads.map((l: { id: string }) => l.id)).toEqual(['lead-bright', 'lead-cityh']);
    expect(opts.idempotencyKey).toBe('autopilot:ap1:run:run1');
    expect(opts.targetSnapshot.source).toBe('autopilot');
    expect(opts.targetSnapshot.mode).toBe('autopilot');
    // ONE flat fee for the ONE parent execution — never per lead, never
    // per niche.
    expect(mockChargeWorkflowExecutionFee).toHaveBeenCalledTimes(1);
    expect(mockChargeWorkflowExecutionFee.mock.calls[0][0].chargeKey).toBe('wfexec-run:autopilot-ap1-run-run1');
    expect(mockChargeWorkflowExecutionFee.mock.calls[0][0].leadCount).toBe(2);
    // The run links to its parent execution + reports the runKey.
    expect(outcome.executionId).toBe('exec1');
  });

  it('snapshots the resolved profile/context into the run config at run start', async () => {
    await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');
    expect(mockResolveBusinessProfileForUser).toHaveBeenCalledWith('u1', { workflowProfileId: 'bp1' });
    const configUpdate = mockPrisma.autopilotRun.update.mock.calls.find(
      (c: unknown[]) => typeof (c[0] as { data?: { config?: string } }).data?.config === 'string'
    );
    expect(configUpdate).toBeTruthy();
    const config = JSON.parse((configUpdate![0] as { data: { config: string } }).data.config);
    expect(config.profile.profileId).toBe('bp1');
    expect(config.profile.profileSource).toBe('workflow');
    expect(config.workflow.id).toBe('wf1');
    expect(config.niches).toEqual(['Dental', 'Hospital']);
  });

  it('never executes the same lead twice — ledger unique guard wins', async () => {
    // lead-cityh was already processed by an EARLIER run of this autopilot:
    // its ledger row exists, so the unique constraint blocks any re-insert.
    (mockPrisma.__ledger as Set<string>).add('ap1:lead-cityh');
    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');
    expect(outcome.status).toBe('COMPLETED');
    // Only lead-bright remains — it executes exactly once, even though
    // BOTH niches discovered it.
    expect(outcome.executionsCreated).toBe(1);
    expect(mockExecuteWorkflowBatch).toHaveBeenCalledTimes(1);
    const opts = mockExecuteWorkflowBatch.mock.calls[0][2];
    expect(opts.leads.map((l: { id: string }) => l.id)).toEqual(['lead-bright']);
    expect(opts.idempotencyKey).toBe('autopilot:ap1:run:run1');
  });

  it('marks EXEC_FAILED honestly when the batch engine rejects the run execution', async () => {
    mockExecuteWorkflowBatch.mockRejectedValueOnce(new Error('Workflow concurrency limit reached'));
    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');
    expect(outcome.status).toBe('COMPLETED'); // an execution-start failure doesn't kill the run's own lifecycle
    expect(outcome.executionsCreated).toBe(0);
    expect(mockPrisma.autopilotLead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          autopilotId: 'ap1',
          leadId: { in: ['lead-bright', 'lead-cityh'] },
        }),
        data: expect.objectContaining({ status: 'EXEC_FAILED' }),
      })
    );
    // The rejected run's fee was released idempotently.
    expect(mockRefundWorkflowExecutionFee).toHaveBeenCalledTimes(1);
  });

  it('discovery-only run (no eligible leads) charges 0 execution fees', async () => {
    // Every discovered lead is already in the ledger from earlier runs →
    // runLeads is empty → no charge, no execution.
    (mockPrisma.__ledger as Set<string>).add('ap1:lead-bright');
    (mockPrisma.__ledger as Set<string>).add('ap1:lead-cityh');
    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');
    expect(outcome.status).toBe('COMPLETED');
    expect(outcome.executionsCreated).toBe(0);
    expect(mockChargeWorkflowExecutionFee).not.toHaveBeenCalled();
    expect(mockExecuteWorkflowBatch).not.toHaveBeenCalled();
  });

  it('insufficient credits at the single charge point → EXEC_FAILED, no execution, honest error', async () => {
    mockChargeWorkflowExecutionFee.mockResolvedValueOnce({ ok: false, fee: 5, balance: 3 });
    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');
    expect(outcome.status).toBe('COMPLETED'); // discovery succeeded; the execution simply never started
    expect(outcome.executionsCreated).toBe(0);
    expect(mockExecuteWorkflowBatch).not.toHaveBeenCalled();
    expect(outcome.error).toContain('Insufficient credits');
    expect(mockPrisma.autopilotLead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'EXEC_FAILED', error: expect.stringContaining('Insufficient credits') }),
      })
    );
    // No refund — nothing was charged.
    expect(mockRefundWorkflowExecutionFee).not.toHaveBeenCalled();
  });

  it('claims the run atomically — a second claim cannot execute', async () => {
    mockPrisma.autopilotRun.updateMany.mockResolvedValue({ count: 0 }); // someone else claimed it
    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');
    expect(outcome.status).toBe('FAILED');
    expect(outcome.error).toContain('already claimed');
    expect(mockStartDiscoveryJob).not.toHaveBeenCalled();
    expect(mockExecuteWorkflowBatch).not.toHaveBeenCalled();
  });

  it('refuses to run when the linked workflow is not active (honest error)', async () => {
    mockPrisma.workflowDefinition.findFirst.mockResolvedValue({ id: 'wf1', userId: 'u1', status: 'draft', name: 'Draft WF' });
    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');
    expect(outcome.status).toBe('FAILED');
    expect(outcome.error).toContain('not active');
  });

  it('refuses to run on insufficient credits BEFORE any discovery', async () => {
    mockCheckCreditSufficiency.mockResolvedValue({ sufficient: false, balance: 3, shortfall: 37 });
    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');
    expect(outcome.status).toBe('FAILED');
    expect(outcome.error).toContain('Insufficient credits');
    expect(mockStartDiscoveryJob).not.toHaveBeenCalled();
  });

  it('records per-niche discovery failure and continues with the other niche', async () => {
    mockStartDiscoveryJob
      .mockResolvedValueOnce({ jobId: '', status: 'failed', message: 'No search API configured' })
      .mockResolvedValueOnce({ jobId: 'job2', status: 'started', message: 'ok' });
    mockPrisma.discoveryJob.findUnique.mockResolvedValue(completedJob({ id: 'job2' }));
    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');
    expect(outcome.perNiche[0].status).toBe('FAILED');
    expect(outcome.perNiche[0].error).toContain('No search API');
    expect(outcome.perNiche[1].status).toBe('COMPLETED');
    // ONE grouped execution for the surviving niche.
    expect(outcome.executionsCreated).toBe(1);
  });

  it('FAILED run when ALL niches fail and nothing was imported', async () => {
    mockStartDiscoveryJob.mockResolvedValue({ jobId: '', status: 'failed', message: 'provider down' });
    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');
    expect(outcome.status).toBe('FAILED');
    // Finalization is status-guarded (Phase 18): still-RUNNING → FAILED.
    expect(mockPrisma.autopilotRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run1', status: 'RUNNING' }, data: expect.objectContaining({ status: 'FAILED' }) })
    );
  });
});

describe('runAutopilot (manual path)', () => {
  it('rejects non-ACTIVE autopilots (DRAFT cannot run)', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue({ ...AUTOPILOT_ROW, status: 'DRAFT' });
    const result = await runAutopilot('ap1', 'u1', 'manual');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_STATE');
    expect(mockPrisma.autopilotRun.create).not.toHaveBeenCalled();
  });

  it('rejects a second run while one is queued/running', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue({ ...AUTOPILOT_ROW, status: 'ACTIVE' });
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({ id: 'openRun' });
    const result = await runAutopilot('ap1', 'u1', 'manual');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('RUN_IN_PROGRESS');
  });

  it('claims ACTIVE→RUNNING atomically; conflict aborts', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue({ ...AUTOPILOT_ROW, status: 'ACTIVE' });
    mockPrisma.autopilotRun.findFirst.mockResolvedValue(null);
    mockPrisma.autopilotWorkflow.updateMany.mockResolvedValue({ count: 0 }); // lost the race
    const result = await runAutopilot('ap1', 'u1', 'manual');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('STATE_CONFLICT');
  });

  it('scopes lookup by userId (ownership)', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(null);
    const result = await runAutopilot('ap1', 'u-other', 'manual');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
    expect(mockPrisma.autopilotWorkflow.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ap1', userId: 'u-other' } })
    );
  });
});

describe('per-user lock', () => {
  it('serializes concurrent work for the same user', async () => {
    const order: string[] = [];
    const job = (label: string, ms: number) => withUserLock('uX', async () => {
      order.push(`${label}:start`);
      await new Promise((r) => setTimeout(r, ms));
      order.push(`${label}:end`);
    });
    await Promise.all([job('a', 30), job('b', 5)]);
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('does not serialize different users', async () => {
    const events: string[] = [];
    const job = (user: string) => withUserLock(user, async () => {
      events.push(`${user}:start`);
      await new Promise((r) => setTimeout(r, 20));
      events.push(`${user}:end`);
    });
    await Promise.all([job('uA'), job('uB')]);
    // both started before either ended
    expect(events.filter((e) => e.endsWith(':start'))).toHaveLength(2);
    expect(events[0].endsWith(':start')).toBe(true);
    expect(events[1].endsWith(':start')).toBe(true);
  });
});

describe('recoverStuckAutopilotRuns', () => {
  it('recovers stuck runs and autopilots honestly', async () => {
    mockPrisma.autopilotRun.findMany.mockResolvedValue([{ id: 'run-stuck', autopilotId: 'ap1' }]);
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([{ id: 'ap-stuck' }]);
    const result = await recoverStuckAutopilotRuns();
    expect(result.recoveredRuns).toBe(1);
    expect(result.recoveredAutopilots).toBe(1);
    expect(mockPrisma.autopilotRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-stuck' },
        data: expect.objectContaining({ status: 'FAILED' }),
      })
    );
    expect(mockPrisma.autopilotWorkflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ap-stuck' },
        data: expect.objectContaining({ status: 'FAILED' }),
      })
    );
  });

  it('is a no-op when nothing is stuck', async () => {
    mockPrisma.autopilotRun.findMany.mockResolvedValue([]);
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([]);
    const result = await recoverStuckAutopilotRuns();
    expect(result.recoveredRuns).toBe(0);
    expect(result.recoveredAutopilots).toBe(0);
    expect(mockPrisma.autopilotRun.update).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Phase 18 — Autopilot Core: runKey idempotency, cancellation,
// settle finalizer, single-charge billing, failure isolation.
// ═══════════════════════════════════════════════════════════════════

describe('Phase 18: runKey idempotency (duplicate invocation protection)', () => {
  it('a replayed runKey returns the EXISTING run — no second run, no second execution', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue({ ...AUTOPILOT_ROW, status: 'ACTIVE' });
    mockPrisma.autopilotRun.findFirst.mockResolvedValue(null); // no open run
    mockPrisma.autopilotRun.findUnique.mockImplementation(async ({ where }: { where: { runKey?: string } }) => {
      // The replayed key already has a run row.
      if (where?.runKey === 'scheduled:ap1:1700000000000') {
        return { id: 'run-original' };
      }
      return null;
    });
    const result = await runAutopilot('ap1', 'u1', 'scheduler', { runKey: 'scheduled:ap1:1700000000000' });
    expect(result.ok).toBe(true);
    expect(result.duplicate).toBe(true);
    expect(result.runId).toBe('run-original');
    // No new run row, no ACTIVE→RUNNING claim consumed, no execution.
    expect(mockPrisma.autopilotRun.create).not.toHaveBeenCalled();
    expect(mockExecuteWorkflowBatch).not.toHaveBeenCalled();
    expect(mockChargeWorkflowExecutionFee).not.toHaveBeenCalled();
  });

  it('creates the run with the deterministic scheduler slot runKey', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue({ ...AUTOPILOT_ROW, status: 'ACTIVE' });
    mockPrisma.autopilotRun.findFirst.mockResolvedValue(null);
    mockPrisma.autopilotRun.create.mockResolvedValue({ id: 'run-new' });
    const result = await runAutopilot('ap1', 'u1', 'scheduler', { runKey: 'scheduled:ap1:1700000000000' });
    expect(result.ok).toBe(true);
    expect(result.duplicate).toBeUndefined();
    expect(mockPrisma.autopilotRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ runKey: 'scheduled:ap1:1700000000000', trigger: 'scheduler' }),
      })
    );
  });

  it('P2002 on runKey create (racing duplicate) converges on the existing run', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue({ ...AUTOPILOT_ROW, status: 'ACTIVE' });
    mockPrisma.autopilotRun.findFirst.mockResolvedValue(null);
    // Pre-check finds nothing; the create itself hits the unique index,
    // and the post-P2002 lookup finds the winner's run row.
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    mockPrisma.autopilotRun.create.mockRejectedValueOnce(p2002);
    mockPrisma.autopilotRun.findUnique.mockResolvedValueOnce(null); // pre-check
    mockPrisma.autopilotRun.findUnique.mockResolvedValueOnce({ id: 'run-winner' }); // post-P2002 lookup
    const result = await runAutopilot('ap1', 'u1', 'scheduler', { runKey: 'scheduled:ap1:1700000000000' });
    expect(result.ok).toBe(true);
    expect(result.duplicate).toBe(true);
    expect(result.runId).toBe('run-winner');
    expect(mockExecuteWorkflowBatch).not.toHaveBeenCalled();
  });
});

describe('Phase 18: run cancellation', () => {
  it('cancels a QUEUED run atomically — the runner claim then loses honestly', async () => {
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({ id: 'run-q', status: 'QUEUED', executionId: null, autopilotId: 'ap1' });
    mockPrisma.autopilotRun.updateMany.mockResolvedValue({ count: 1 }); // flip wins
    const result = await cancelAutopilotRun('u1', 'run-q');
    expect(result.ok).toBe(true);
    expect(result.run?.status).toBe('CANCELLED');
    expect(mockPrisma.autopilotRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run-q', status: 'QUEUED' }, data: expect.objectContaining({ status: 'CANCELLED' }) })
    );
  });

  it('a CANCELLED run reports cancellation honestly when the runner claim loses', async () => {
    // The run was cancelled BEFORE the runner's QUEUED→RUNNING claim.
    mockPrisma.autopilotRun.updateMany.mockResolvedValue({ count: 0 }); // claim loses
    mockPrisma.autopilotRun.findUnique.mockImplementation(async () => ({ status: 'CANCELLED' }));
    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run-c', 'manual');
    expect(outcome.status).toBe('CANCELLED');
    expect(outcome.error).toContain('cancelled');
    expect(mockStartDiscoveryJob).not.toHaveBeenCalled();
    expect(mockChargeWorkflowExecutionFee).not.toHaveBeenCalled();
  });

  it('a run cancelled DURING discovery creates NO execution and NO charge', async () => {
    // Discovery works, but the run row flips to CANCELLED before the
    // post-loop execution phase.
    mockPrisma.autopilotRun.findUnique.mockImplementation(async ({ where }: { where: { id?: string; runKey?: string } }) => {
      if (where && typeof where.runKey === 'string') return null;
      return { id: where?.id || 'run1', status: 'CANCELLED', runKey: 'rk-1' };
    });
    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run-x', 'manual');
    expect(outcome.status).toBe('CANCELLED');
    expect(outcome.executionsCreated).toBe(0);
    expect(mockChargeWorkflowExecutionFee).not.toHaveBeenCalled();
    expect(mockExecuteWorkflowBatch).not.toHaveBeenCalled();
  });

  it('cancels a RUNNING run and signals the parent execution to stop', async () => {
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({ id: 'run-r', status: 'RUNNING', executionId: 'exec9', autopilotId: 'ap1' });
    mockPrisma.autopilotRun.update.mockResolvedValue({});
    const result = await cancelAutopilotRun('u1', 'run-r');
    expect(result.ok).toBe(true);
    expect(mockPrisma.autopilotRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run-r' }, data: expect.objectContaining({ status: 'CANCELLED' }) })
    );
    expect(mockPrisma.workflowExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'exec9' }, data: expect.objectContaining({ status: 'cancelled' }) })
    );
  });

  it('rejects cancellation of terminal runs — history is never rewritten', async () => {
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({ id: 'run-t', status: 'COMPLETED', executionId: 'e', autopilotId: 'ap1' });
    const result = await cancelAutopilotRun('u1', 'run-t');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_STATE');
  });

  it('scopes run lookup by userId — cross-user cancel is NOT_FOUND', async () => {
    mockPrisma.autopilotRun.findFirst.mockResolvedValue(null);
    const result = await cancelAutopilotRun('u-attacker', 'run-q');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
    expect(mockPrisma.autopilotRun.updateMany).not.toHaveBeenCalled();
  });
});

describe('Phase 18: settleRunExecutionOutcome (per-lead tracking finalizer)', () => {
  it('settles ledger + run aggregates from the execution lead items', async () => {
    mockPrisma.workflowExecution.findUnique.mockResolvedValue({ status: 'partial' });
    mockPrisma.workflowExecutionLead.findMany.mockResolvedValue([
      { leadId: 'lead-bright', status: 'completed', error: null },
      { leadId: 'lead-cityh', status: 'failed', error: 'send failed' },
      { leadId: 'lead-third', status: 'pending', error: null },
    ]);
    await settleRunExecutionOutcome('run1', 'exec1');
    // Completed lead → EXEC_COMPLETED.
    expect(mockPrisma.autopilotLead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ runId: 'run1', executionId: 'exec1', leadId: { in: ['lead-bright'] } }),
        data: expect.objectContaining({ status: 'EXEC_COMPLETED' }),
      })
    );
    // Failed lead → EXEC_FAILED with its own error.
    expect(mockPrisma.autopilotLead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ runId: 'run1', executionId: 'exec1', leadId: 'lead-cityh', status: 'EXEC_QUEUED' }),
        data: expect.objectContaining({ status: 'EXEC_FAILED', error: 'send failed' }),
      })
    );
    // Run aggregates.
    expect(mockPrisma.autopilotRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run1' }, data: expect.objectContaining({ leadsCompleted: 1, leadsFailed: 2 }) })
    );
  });

  it('waits until the execution reaches a terminal state (non-terminal keeps polling)', async () => {
    let polls = 0;
    mockPrisma.workflowExecution.findUnique.mockImplementation(async () => {
      polls++;
      return { status: polls < 3 ? 'running' : 'completed' };
    });
    mockPrisma.workflowExecutionLead.findMany.mockResolvedValue([]);
    await settleRunExecutionOutcome('run1', 'exec1');
    expect(polls).toBe(3);
    expect(mockPrisma.autopilotRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run1' }, data: expect.objectContaining({ leadsCompleted: 0, leadsFailed: 0 }) })
    );
  });

  it('gives up honestly after the settle timeout — ledger stays EXEC_QUEUED', async () => {
    mockPrisma.workflowExecution.findUnique.mockResolvedValue({ status: 'running' }); // never terminal
    mockPrisma.workflowExecutionLead.findMany.mockResolvedValue([]);
    await settleRunExecutionOutcome('run1', 'exec1');
    expect(mockPrisma.autopilotLead.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.autopilotRun.update).not.toHaveBeenCalled();
  });
});

describe('Phase 18: single-charge billing for the ONE parent execution', () => {
  it('exactly ONE 5-credit charge for one run — regardless of lead count or niche count', async () => {
    // Two niches, TWO DIFFERENT leads each (4 unique leads total).
    mockPrisma.lead.findFirst.mockImplementation(async ({ where }: { where: { website?: string; businessName?: string } }) => {
      const map: Record<string, { id: string; businessName: string; niche: string | null }> = {
        'https://bright.example': { id: 'lead-bright', businessName: 'Bright Smiles', niche: 'Dental' },
        'https://cityh.example': { id: 'lead-cityh', businessName: 'City Hospital', niche: 'Hospital' },
        'https://a.example': { id: 'lead-a', businessName: 'A Clinic', niche: 'Dental' },
        'https://b.example': { id: 'lead-b', businessName: 'B Care', niche: 'Hospital' },
      };
      if (where?.website && map[where.website]) return map[where.website];
      if (where?.businessName) {
        for (const v of Object.values(map)) if (v.businessName === where.businessName) return v;
      }
      return null;
    });
    // Niche 1 discovers bright + a; niche 2 discovers cityh + b.
    mockPrisma.discoveryJob.findUnique.mockImplementation(async () => ({
      id: 'job-rot',
      status: 'completed',
      totalFound: 2,
      imported: 2,
      duplicates: 0,
      failed: 0,
      filteredOut: 0,
      errorMessage: null,
      resultData: JSON.stringify([
        { businessName: 'Bright Smiles', website: 'https://bright.example', city: 'Mumbai', country: 'India' },
        { businessName: 'A Clinic', website: 'https://a.example', city: 'Mumbai', country: 'India' },
      ]),
    }));
    let call = 0;
    mockStartDiscoveryJob.mockImplementation(async () => {
      call++;
      if (call === 2) {
        mockPrisma.discoveryJob.findUnique.mockResolvedValueOnce({
          id: 'job2',
          status: 'completed',
          totalFound: 2,
          imported: 2,
          duplicates: 0,
          failed: 0,
          filteredOut: 0,
          errorMessage: null,
          resultData: JSON.stringify([
            { businessName: 'City Hospital', website: 'https://cityh.example', city: 'Mumbai', country: 'India' },
            { businessName: 'B Care', website: 'https://b.example', city: 'Mumbai', country: 'India' },
          ]),
        });
      }
      return { jobId: `job-${call}`, status: 'started', message: 'ok' };
    });
    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run-multi', 'manual');
    expect(outcome.status).toBe('COMPLETED');
    expect(outcome.executionsCreated).toBe(1);
    // 4 leads under ONE execution — but still exactly ONE charge of 5.
    expect(mockExecuteWorkflowBatch).toHaveBeenCalledTimes(1);
    expect(mockExecuteWorkflowBatch.mock.calls[0][2].leads).toHaveLength(4);
    expect(mockChargeWorkflowExecutionFee).toHaveBeenCalledTimes(1);
    expect(mockChargeWorkflowExecutionFee.mock.calls[0][0].leadCount).toBe(4);
    // All 4 ledger rows link to the SAME parent execution.
    const linkCall = mockPrisma.autopilotLead.updateMany.mock.calls.find(
      (c: unknown[]) => (c[0] as { data?: { status?: string } }).data?.status === 'EXEC_QUEUED'
    );
    expect(linkCall).toBeTruthy();
    expect((linkCall![0] as { data: { executionId: string } }).data.executionId).toBe('exec1');
    expect((linkCall![0] as { where: { leadId: { in: string[] } } }).where.leadId.in).toHaveLength(4);
  });

  it('run finalization links executionId + runKey onto the run row', async () => {
    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run-link', 'manual');
    expect(outcome.executionId).toBe('exec1');
    const finalizeCall = mockPrisma.autopilotRun.updateMany.mock.calls.find(
      (c: unknown[]) => (c[0] as { where?: { status?: string } }).where?.status === 'RUNNING'
    );
    expect(finalizeCall).toBeTruthy();
    expect((finalizeCall![0] as { data?: { executionId?: string } }).data?.executionId).toBe('exec1');
    expect((finalizeCall![0] as { data?: { runKey?: string } }).data?.runKey).toBe('rk-1');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Phase 20 — Autopilot Niches: per-niche discovery attribution, niche →
// Business Profile mapping resolution, per-lead profile map for the
// batch engine, run-config snapshot, and unchanged billing for
// multi-niche runs.
// ═══════════════════════════════════════════════════════════════════

describe('Phase 20: niche attribution + profile mapping', () => {
  const MAPPED_ROW = {
    ...AUTOPILOT_ROW,
    profileMappings: JSON.stringify({ dental: 'bp-dental', hospital: 'bp-hosp' }),
  };

  // Niche 1 (Dental) discovers bright; niche 2 (Hospital) discovers cityh —
  // each lead keeps the attribution of the niche that produced it.
  function setupRotatingDiscovery() {
    mockPrisma.lead.findFirst.mockImplementation(async ({ where }: { where: { website?: string } }) => {
      if (where?.website === 'https://bright.example') return { id: 'lead-bright', businessName: 'Bright Smiles', niche: 'Dental' };
      if (where?.website === 'https://cityh.example') return { id: 'lead-cityh', businessName: 'City Hospital', niche: 'Hospital' };
      return null;
    });
    mockPrisma.discoveryJob.findUnique.mockResolvedValue({
      id: 'job-dental', status: 'completed', totalFound: 1, imported: 1, duplicates: 0, failed: 0, filteredOut: 0,
      errorMessage: null,
      resultData: JSON.stringify([
        { businessName: 'Bright Smiles', website: 'https://bright.example', city: 'Mumbai', country: 'India' },
      ]),
    });
    let call = 0;
    mockStartDiscoveryJob.mockImplementation(async (_userId: string, params: { niche: string }) => {
      call++;
      if (call === 2) {
        mockPrisma.discoveryJob.findUnique.mockResolvedValueOnce({
          id: 'job-hospital', status: 'completed', totalFound: 1, imported: 1, duplicates: 0, failed: 0, filteredOut: 0,
          errorMessage: null,
          resultData: JSON.stringify([
            { businessName: 'City Hospital', website: 'https://cityh.example', city: 'Mumbai', country: 'India' },
          ]),
        });
      }
      return { jobId: `job-${params.niche}`, status: 'started', message: 'ok' };
    });
  }

  it('starts ONE discovery job PER niche with the exact niche value (per-niche attribution preserved)', async () => {
    setupRotatingDiscovery();
    const outcome = await executeAutopilotRun(MAPPED_ROW, 'run-p20a', 'manual');
    expect(outcome.status).toBe('COMPLETED');
    expect(mockStartDiscoveryJob).toHaveBeenCalledTimes(2);
    const nicheArgs = mockStartDiscoveryJob.mock.calls.map((c: unknown[]) => (c[1] as { niche: string }).niche);
    expect(nicheArgs).toEqual(['Dental', 'Hospital']);
    // perNiche reporting keeps each niche's own numbers.
    expect(outcome.perNiche.map((n: { niche: string }) => n.niche)).toEqual(['Dental', 'Hospital']);
  });

  it('resolves EACH niche\'s profile via the canonical chain (explicit mapping → workflow → default) and snapshots it', async () => {
    setupRotatingDiscovery();
    mockResolveBusinessProfileForUser.mockImplementation(async (_u: string, opts: { explicitProfileId?: string | null; workflowProfileId?: string | null }) => {
      if (opts?.explicitProfileId === 'bp-dental') {
        return { profile: { id: 'bp-dental', name: 'Dental Services Profile' }, source: 'execution-setting' };
      }
      if (opts?.explicitProfileId === 'bp-hosp') {
        return { profile: { id: 'bp-hosp', name: 'Healthcare Profile' }, source: 'execution-setting' };
      }
      return { profile: { id: 'bp1', name: 'Workflow Profile' }, source: 'workflow' };
    });
    await executeAutopilotRun(MAPPED_ROW, 'run-p20b', 'manual');
    // The canonical resolver was used for the run-level resolution AND
    // once per DISTINCT mapped profile id.
    expect(mockResolveBusinessProfileForUser).toHaveBeenCalledWith('u1', { workflowProfileId: 'bp1' });
    expect(mockResolveBusinessProfileForUser).toHaveBeenCalledWith('u1', { explicitProfileId: 'bp-dental', workflowProfileId: 'bp1' });
    expect(mockResolveBusinessProfileForUser).toHaveBeenCalledWith('u1', { explicitProfileId: 'bp-hosp', workflowProfileId: 'bp1' });
    // Snapshot preserves the mapping + the per-niche resolutions.
    const configUpdate = mockPrisma.autopilotRun.update.mock.calls.find(
      (c: unknown[]) => typeof (c[0] as { data?: { config?: string } }).data?.config === 'string'
    );
    expect(configUpdate).toBeTruthy();
    const config = JSON.parse((configUpdate![0] as { data: { config: string } }).data.config);
    expect(config.profileMappings).toEqual({ dental: 'bp-dental', hospital: 'bp-hosp' });
    expect(config.nicheProfiles).toEqual([
      { niche: 'Dental', profileId: 'bp-dental', profileName: 'Dental Services Profile', profileSource: 'execution-setting' },
      { niche: 'Hospital', profileId: 'bp-hosp', profileName: 'Healthcare Profile', profileSource: 'execution-setting' },
    ]);
  });

  it('passes a per-lead profile resolution map to the batch engine — each lead gets its niche\'s profile', async () => {
    setupRotatingDiscovery();
    const dentalRes = { profile: { id: 'bp-dental', name: 'Dental Services Profile' }, source: 'execution-setting' as const };
    const hospRes = { profile: { id: 'bp-hosp', name: 'Healthcare Profile' }, source: 'execution-setting' as const };
    mockResolveBusinessProfileForUser.mockImplementation(async (_u: string, opts: { explicitProfileId?: string | null }) => {
      if (opts?.explicitProfileId === 'bp-dental') return dentalRes;
      if (opts?.explicitProfileId === 'bp-hosp') return hospRes;
      return { profile: { id: 'bp1', name: 'Workflow Profile' }, source: 'workflow' as const };
    });
    await executeAutopilotRun(MAPPED_ROW, 'run-p20c', 'manual');
    expect(mockExecuteWorkflowBatch).toHaveBeenCalledTimes(1);
    const opts = mockExecuteWorkflowBatch.mock.calls[0][2];
    expect(opts.profileResolutionsByLeadId).toEqual({
      'lead-bright': dentalRes,
      'lead-cityh': hospRes,
    });
  });

  it('LEGACY rows without profileMappings pass NO per-lead map (byte-identical Phase 18 behavior)', async () => {
    const legacyRow = { ...AUTOPILOT_ROW } as Record<string, unknown>;
    delete legacyRow.profileMappings;
    await executeAutopilotRun(legacyRow as typeof AUTOPILOT_ROW, 'run-p20d', 'manual');
    const opts = mockExecuteWorkflowBatch.mock.calls[0][2];
    expect(opts.profileResolutionsByLeadId).toBeUndefined();
  });

  it('an EMPTY mapping ({} stored) also passes NO per-lead map', async () => {
    await executeAutopilotRun({ ...AUTOPILOT_ROW, profileMappings: '{}' }, 'run-p20e', 'manual');
    const opts = mockExecuteWorkflowBatch.mock.calls[0][2];
    expect(opts.profileResolutionsByLeadId).toBeUndefined();
  });

  it('a mapped-profile lookup failure degrades safely — the run continues unpersonalized for that niche', async () => {
    setupRotatingDiscovery();
    mockResolveBusinessProfileForUser.mockRejectedValue(new Error('db down'));
    const outcome = await executeAutopilotRun(MAPPED_ROW, 'run-p20f', 'manual');
    expect(outcome.status).toBe('COMPLETED');
    expect(outcome.executionsCreated).toBe(1);
  });

  it('multi-niche WITH mappings still charges exactly ONE flat 5-credit fee (never per niche)', async () => {
    setupRotatingDiscovery();
    await executeAutopilotRun(MAPPED_ROW, 'run-p20g', 'manual');
    expect(mockChargeWorkflowExecutionFee).toHaveBeenCalledTimes(1);
    expect(mockChargeWorkflowExecutionFee.mock.calls[0][0].leadCount).toBe(2);
  });
});
