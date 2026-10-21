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
});

const mockPrisma = vi.hoisted(() => ({
  autopilotWorkflow: {
    findFirst: vi.fn(), findMany: vi.fn(),
    create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), count: vi.fn(),
  },
  autopilotRun: {
    findFirst: vi.fn(), findMany: vi.fn(),
    create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn(),
  },
  autopilotLead: {
    create: vi.fn(), updateMany: vi.fn(),
    deleteMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(),
  },
  workflowDefinition: { findFirst: vi.fn() },
  discoveryJob: { findUnique: vi.fn(), create: vi.fn() },
  lead: { findFirst: vi.fn() },
  __ledger: new Set<string>(),
}));

vi.mock('@/lib/db', () => ({ db: mockPrisma }));

// Mock the external execution layers — the runner must integrate with
// (not reimplement) the discovery pipeline and workflow engine.
const mockStartDiscoveryJob = vi.hoisted(() => vi.fn());
const mockExecuteWorkflow = vi.hoisted(() => vi.fn());
const mockCheckCreditSufficiency = vi.hoisted(() => vi.fn());

vi.mock('@/lib/lead-discovery-service', () => ({
  startDiscoveryJob: mockStartDiscoveryJob,
}));
vi.mock('@/lib/workflow-executor', () => ({
  executeWorkflow: mockExecuteWorkflow,
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
}));

import { executeAutopilotRun, runAutopilot, recoverStuckAutopilotRuns, withUserLock } from '@/lib/autopilot/runner';

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
  mockPrisma.workflowDefinition.findFirst.mockResolvedValue({ id: 'wf1', userId: 'u1', status: 'active', name: 'Test WF' });
  mockPrisma.autopilotRun.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.autopilotRun.update.mockResolvedValue({});
  mockPrisma.autopilotWorkflow.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.autopilotWorkflow.update.mockResolvedValue({});
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
  mockExecuteWorkflow.mockResolvedValue({ id: 'exec1' });
  // Part 2 — default: the flat execution fee charge succeeds.
  mockChargeWorkflowExecutionFee.mockResolvedValue({ ok: true, alreadyProcessed: false, newBalance: 995 });
  mockRefundWorkflowExecutionFee.mockResolvedValue({ refunded: true, newBalance: 1000 });
  // resolve payloads to leads by website
  mockPrisma.lead.findFirst.mockImplementation(async ({ where }) => {
    if (where.website === 'https://bright.example') return { id: 'lead-bright' };
    if (where.website === 'https://cityh.example') return { id: 'lead-cityh' };
    return null;
  });
});

describe('executeAutopilotRun', () => {
  it('executes the workflow for each NEW lead with a stable idempotency key', async () => {
    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');
    expect(outcome.status).toBe('COMPLETED');
    expect(outcome.executionsCreated).toBe(2);
    expect(mockExecuteWorkflow).toHaveBeenCalledTimes(2);
    const [wfId, userId, triggerData, key] = mockExecuteWorkflow.mock.calls[0];
    expect(wfId).toBe('wf1');
    expect(userId).toBe('u1');
    expect(triggerData.leadId).toBe('lead-bright');
    expect(triggerData.source).toBe('autopilot');
    expect(key).toBe('autopilot:ap1:lead:lead-bright');
  });

  it('never executes the same lead twice — ledger unique guard wins', async () => {
    // lead-cityh was already processed by an EARLIER run of this autopilot:
    // its ledger row exists, so the unique constraint blocks any re-insert.
    (mockPrisma.__ledger as Set<string>).add('ap1:lead-cityh');
    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');
    expect(outcome.status).toBe('COMPLETED');
    // Only lead-bright executes — exactly once, even though BOTH niches
    // returned it.
    expect(outcome.executionsCreated).toBe(1);
    expect(mockExecuteWorkflow).toHaveBeenCalledTimes(1);
    expect(mockExecuteWorkflow.mock.calls[0][3]).toBe('autopilot:ap1:lead:lead-bright');
  });

  it('marks EXEC_FAILED honestly when the workflow engine rejects a lead', async () => {
    mockExecuteWorkflow.mockRejectedValueOnce(new Error('Workflow concurrency limit reached'));
    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');
    expect(outcome.status).toBe('COMPLETED'); // one failure doesn't kill the run
    expect(outcome.executionsCreated).toBe(1);
    expect(mockPrisma.autopilotLead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { autopilotId: 'ap1', leadId: 'lead-bright' },
        data: expect.objectContaining({ status: 'EXEC_FAILED' }),
      })
    );
  });

  it('claims the run atomically — a second claim cannot execute', async () => {
    mockPrisma.autopilotRun.updateMany.mockResolvedValue({ count: 0 }); // someone else claimed it
    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');
    expect(outcome.status).toBe('FAILED');
    expect(outcome.error).toContain('already claimed');
    expect(mockStartDiscoveryJob).not.toHaveBeenCalled();
    expect(mockExecuteWorkflow).not.toHaveBeenCalled();
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
    expect(outcome.executionsCreated).toBe(2);
  });

  it('FAILED run when ALL niches fail and nothing was imported', async () => {
    mockStartDiscoveryJob.mockResolvedValue({ jobId: '', status: 'failed', message: 'provider down' });
    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');
    expect(outcome.status).toBe('FAILED');
    expect(mockPrisma.autopilotRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run1' }, data: expect.objectContaining({ status: 'FAILED' }) })
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
