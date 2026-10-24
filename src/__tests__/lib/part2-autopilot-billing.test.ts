// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Part 2 — Autopilot Billing (Test N, grouped model)
//
// Covers src/lib/autopilot/runner.ts through the Part 2 central fee path:
//   • Every niche GROUP is ONE WorkflowExecution (multi-lead model) and
//     charges the flat fee ONCE through the SAME central service (no
//     separate Autopilot billing loophole, no per-lead charging).
//   • Charge keys mirror the batch coordinator's stable (autopilot, run,
//     niche) identity — duplicate scheduler execution / worker retry can
//     never double-charge.
//   • Discovery ALONE never triggers workflow charges.
//   • Insufficient credits mid-run: the niche's leads are honestly
//     EXEC_FAILED with nothing executed, and remaining niches are skipped
//     without re-attempting a doomed charge.
//   • A group whose execution record could not be created gets its fee
//     refunded (§21).
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pacing/poll constants are read at module-load — zero them BEFORE import.
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
  // Phase 18 — the detached settle watcher polls the parent execution.
  workflowExecution: { findUnique: vi.fn(), update: vi.fn() },
  workflowExecutionLead: { findMany: vi.fn() },
  __ledger: new Set<string>(),
}));

vi.mock('@/lib/db', () => ({ db: mockPrisma }));

const mockStartDiscoveryJob = vi.hoisted(() => vi.fn());
const mockExecuteWorkflowBatch = vi.hoisted(() => vi.fn());
const mockCheckCreditSufficiency = vi.hoisted(() => vi.fn());
const mockChargeWorkflowExecutionFee = vi.hoisted(() => vi.fn());
const mockRefundWorkflowExecutionFee = vi.hoisted(() => vi.fn());

vi.mock('@/lib/lead-discovery-service', () => ({ startDiscoveryJob: mockStartDiscoveryJob }));
vi.mock('@/lib/workflow-batch', () => ({ executeWorkflowBatch: mockExecuteWorkflowBatch }));
vi.mock('@/lib/credit-service', () => ({
  checkCreditSufficiency: mockCheckCreditSufficiency,
  CREDIT_COSTS: { lead_discovery: 1 },
}));
vi.mock('@/lib/workflow-credits', () => ({
  chargeWorkflowExecutionFee: mockChargeWorkflowExecutionFee,
  refundWorkflowExecutionFee: mockRefundWorkflowExecutionFee,
  WORKFLOW_EXECUTION_FEE_CREDITS: 5,
}));

import { executeAutopilotRun } from '@/lib/autopilot/runner';

const AUTOPILOT_ROW = {
  id: 'ap1',
  userId: 'u1',
  orgId: null,
  name: 'Billing Test Autopilot',
  status: 'RUNNING',
  niches: JSON.stringify(['Dental']),
  geography: JSON.stringify({ country: 'India', city: 'Mumbai' }),
  workflowId: 'wf1',
  schedule: 'daily',
};

function completedJob(over: Partial<{ resultData: string; imported: number; totalFound: number }> = {}) {
  return {
    id: 'job1',
    status: 'completed',
    totalFound: over.totalFound ?? 2,
    imported: over.imported ?? 2,
    duplicates: 0,
    failed: 0,
    filteredOut: 0,
    errorMessage: null,
    resultData:
      over.resultData ??
      JSON.stringify([
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
  // Phase 21 test repair — the runner reads the live run row (runKey/
  // status) while executing; this mock predated Phase 18 and lacked it.
  mockPrisma.autopilotRun.findUnique.mockImplementation(async ({ where }: { where: { id?: string; runKey?: string } }) => {
    if (where && typeof where.runKey === 'string') return null;
    return { id: where?.id || 'run1', status: 'RUNNING', runKey: 'rk-1', executionId: null };
  });
  mockPrisma.autopilotWorkflow.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.autopilotWorkflow.update.mockResolvedValue({});
  mockPrisma.autopilotLead.create.mockImplementation(async ({ data }: { data: { autopilotId: string; leadId: string } }) => {
    const seen = mockPrisma.__ledger as Set<string>;
    const key = `${data.autopilotId}:${data.leadId}`;
    if (seen.has(key)) {
      throw new Error('Unique constraint failed on the constraint: `AutopilotLead_autopilotId_leadId_key`');
    }
    seen.add(key);
    return {};
  });
  mockPrisma.autopilotLead.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.workflowExecution.findUnique.mockResolvedValue({ status: 'completed' });
  mockPrisma.workflowExecution.update.mockResolvedValue({});
  mockPrisma.workflowExecutionLead.findMany.mockResolvedValue([]);
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
  mockChargeWorkflowExecutionFee.mockResolvedValue({ ok: true, alreadyProcessed: false, newBalance: 995 });
  mockRefundWorkflowExecutionFee.mockResolvedValue({ refunded: true, newBalance: 1000 });
  mockPrisma.lead.findFirst.mockImplementation(async ({ where }) => {
    if (where.website === 'https://bright.example') return { id: 'lead-bright', businessName: 'Bright Smiles', niche: 'Dental' };
    if (where.website === 'https://cityh.example') return { id: 'lead-cityh', businessName: 'City Hospital', niche: 'Dental' };
    return null;
  });
});

function chargeKeys(): string[] {
  return mockChargeWorkflowExecutionFee.mock.calls.map((c) => c[0].chargeKey as string);
}

describe('Test N — Autopilot uses the SAME central fee path', () => {
  it('every niche group charges the flat fee ONCE for the whole group — never per lead', async () => {
    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');

    expect(outcome.status).toBe('COMPLETED');
    // ONE grouped execution covers BOTH leads (multi-lead model).
    expect(outcome.executionsCreated).toBe(1);
    expect(mockExecuteWorkflowBatch).toHaveBeenCalledTimes(1);
    const batchOpts = mockExecuteWorkflowBatch.mock.calls[0][2];
    expect(batchOpts.leads.map((l: { id: string }) => l.id)).toEqual(['lead-bright', 'lead-cityh']);
    // ONE charge for the WHOLE niche group (2 leads → 1 × flat 5, not 2×5).
    expect(mockChargeWorkflowExecutionFee).toHaveBeenCalledTimes(1);
    expect(mockChargeWorkflowExecutionFee.mock.calls[0][0]).toMatchObject({
      userId: 'u1',
      workflowId: 'wf1',
      source: 'AUTOPILOT',
      leadCount: 2,
    });
    // Phase 18+ — ONE flat charge for the WHOLE run (keyed by run id;
    // the country/niche fan-out never multiplies it).
    expect(chargeKeys()).toEqual(['wfexec-run:autopilot-ap1-run-run1']);
  });

  it('duplicate scheduler execution cannot double-charge — the AutopilotLead unique guard stops re-execution', async () => {
    // First run processes both leads as ONE grouped execution (1 charge).
    await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');
    expect(mockChargeWorkflowExecutionFee).toHaveBeenCalledTimes(1);

    // Scheduler replay / overlapping worker runs the SAME autopilot again:
    // the AutopilotLead unique guard already marks both leads processed, so
    // nothing re-executes and NOTHING re-charges.
    await executeAutopilotRun(AUTOPILOT_ROW, 'run2', 'scheduler');

    expect(mockExecuteWorkflowBatch).toHaveBeenCalledTimes(1); // unchanged
    expect(mockChargeWorkflowExecutionFee).toHaveBeenCalledTimes(1); // unchanged — no double charge
  });

  it('discovery ALONE creates zero workflow charges', async () => {
    // The discovery job completes but yields no actionable payloads.
    mockPrisma.discoveryJob.findUnique.mockResolvedValue(
      completedJob({ resultData: JSON.stringify([]), imported: 0, totalFound: 5 }),
    );

    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');

    expect(outcome.status).toBe('COMPLETED');
    expect(outcome.discovered).toBe(5);
    expect(outcome.executionsCreated).toBe(0);
    expect(mockChargeWorkflowExecutionFee).not.toHaveBeenCalled();
    expect(mockExecuteWorkflowBatch).not.toHaveBeenCalled();
  });

  it('insufficient credits for the fee: the niche group is honestly EXEC_FAILED, nothing executes, nothing re-charges', async () => {
    // The group's single charge attempt fails; BOTH of the niche's leads
    // are marked EXEC_FAILED (never partially processed).
    mockChargeWorkflowExecutionFee.mockResolvedValue({
      ok: false, code: 'INSUFFICIENT_CREDITS', fee: 5, balance: 3, shortfall: 2,
    });

    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');

    expect(outcome.executionsCreated).toBe(0);
    expect(mockExecuteWorkflowBatch).not.toHaveBeenCalled();
    // Exactly ONE charge ATTEMPT (the niche group).
    expect(mockChargeWorkflowExecutionFee).toHaveBeenCalledTimes(1);
    // Phase 18+ — ONE flat charge for the WHOLE run (keyed by run id;
    // the country/niche fan-out never multiplies it).
    expect(chargeKeys()).toEqual(['wfexec-run:autopilot-ap1-run-run1']);
    // BOTH lead rows record the refusal reason.
    expect(mockPrisma.autopilotLead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          autopilotId: 'ap1',
          leadId: { in: ['lead-bright', 'lead-cityh'] },
        }),
        data: expect.objectContaining({
          status: 'EXEC_FAILED',
          error: expect.stringContaining('Insufficient credits'),
        }),
      })
    );
    // The run's own error summary carries the honest reason.
    expect(outcome.error).toContain('Insufficient credits');
  });

  it('a group whose execution record could not be created gets its fee refunded idempotently (§21)', async () => {
    mockExecuteWorkflowBatch.mockRejectedValueOnce(new Error('Execution record could not be created'));

    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');

    expect(outcome.executionsCreated).toBe(0);
    expect(mockChargeWorkflowExecutionFee).toHaveBeenCalledTimes(1);
    expect(mockRefundWorkflowExecutionFee).toHaveBeenCalledTimes(1);
    expect(mockRefundWorkflowExecutionFee.mock.calls[0][0].chargeKey).toBe(
      'wfexec-run:autopilot-ap1-run-run1'
    );
    // BOTH of the group's leads are honestly EXEC_FAILED.
    expect(mockPrisma.autopilotLead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          autopilotId: 'ap1',
          leadId: { in: ['lead-bright', 'lead-cityh'] },
        }),
        data: expect.objectContaining({ status: 'EXEC_FAILED' }),
      })
    );
  });

  it('the run refuses BEFORE discovery when credits cannot cover the workflow fee', async () => {
    mockCheckCreditSufficiency.mockResolvedValue({ sufficient: false, balance: 3, shortfall: 2 });

    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');

    expect(outcome.status).toBe('FAILED');
    expect(outcome.error).toContain('Insufficient credits');
    expect(mockStartDiscoveryJob).not.toHaveBeenCalled();
    expect(mockChargeWorkflowExecutionFee).not.toHaveBeenCalled();
    expect(mockExecuteWorkflowBatch).not.toHaveBeenCalled();
  });
});
