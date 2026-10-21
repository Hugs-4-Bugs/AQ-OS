// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Part 2 — Autopilot Billing (Test N)
//
// Covers src/lib/autopilot/runner.ts through the Part 2 central fee path:
//   • Every ACTUAL autopilot workflow execution charges the flat fee via
//     the SAME central service (no separate Autopilot billing loophole).
//   • Charge keys mirror the engine's stable (autopilot, lead) identity —
//     duplicate scheduler execution / worker retry can never double-charge.
//   • Discovery ALONE never triggers workflow charges.
//   • Insufficient credits mid-run: the lead is honestly EXEC_FAILED with
//     nothing executed, and remaining leads are skipped without
//     re-attempting a doomed charge.
//   • A lead whose execution never started gets its fee refunded (§21).
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

const mockStartDiscoveryJob = vi.hoisted(() => vi.fn());
const mockExecuteWorkflow = vi.hoisted(() => vi.fn());
const mockCheckCreditSufficiency = vi.hoisted(() => vi.fn());
const mockChargeWorkflowExecutionFee = vi.hoisted(() => vi.fn());
const mockRefundWorkflowExecutionFee = vi.hoisted(() => vi.fn());

vi.mock('@/lib/lead-discovery-service', () => ({ startDiscoveryJob: mockStartDiscoveryJob }));
vi.mock('@/lib/workflow-executor', () => ({ executeWorkflow: mockExecuteWorkflow }));
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
  mockPrisma.discoveryJob.findUnique.mockResolvedValue(completedJob());
  mockStartDiscoveryJob.mockResolvedValue({ jobId: 'job1', status: 'started', message: 'ok' });
  mockExecuteWorkflow.mockResolvedValue({ id: 'exec1' });
  mockChargeWorkflowExecutionFee.mockResolvedValue({ ok: true, alreadyProcessed: false, newBalance: 995 });
  mockRefundWorkflowExecutionFee.mockResolvedValue({ refunded: true, newBalance: 1000 });
  mockPrisma.lead.findFirst.mockImplementation(async ({ where }) => {
    if (where.website === 'https://bright.example') return { id: 'lead-bright' };
    if (where.website === 'https://cityh.example') return { id: 'lead-cityh' };
    return null;
  });
});

function chargeKeys(): string[] {
  return mockChargeWorkflowExecutionFee.mock.calls.map((c) => c[0].chargeKey as string);
}

describe('Test N — Autopilot uses the SAME central fee path', () => {
  it('every actual autopilot execution charges the flat fee once, through the central service', async () => {
    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');

    expect(outcome.status).toBe('COMPLETED');
    expect(outcome.executionsCreated).toBe(2);
    // ONE charge per ACTUAL execution (2 unique leads → 2 executions →
    // 2 × flat 5) — each via chargeWorkflowExecutionFee, never a custom
    // Autopilot deduction path.
    expect(mockChargeWorkflowExecutionFee).toHaveBeenCalledTimes(2);
    for (const call of mockChargeWorkflowExecutionFee.mock.calls) {
      expect(call[0]).toMatchObject({
        userId: 'u1',
        workflowId: 'wf1',
        source: 'AUTOPILOT',
        leadCount: 1,
      });
    }
    expect(chargeKeys()).toEqual([
      'wfexec-run:autopilot-ap1-lead-lead-bright',
      'wfexec-run:autopilot-ap1-lead-lead-cityh',
    ]);
  });

  it('charge keys MIRROR the engine idempotency keys — duplicate scheduler execution cannot double-charge', async () => {
    // First run processes both leads (2 charges).
    await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');
    expect(mockChargeWorkflowExecutionFee).toHaveBeenCalledTimes(2);

    // Scheduler replay / overlapping worker runs the SAME autopilot again:
    // the AutopilotLead unique guard already marks both leads processed, so
    // nothing re-executes and NOTHING re-charges.
    await executeAutopilotRun(AUTOPILOT_ROW, 'run2', 'scheduler');

    expect(mockExecuteWorkflow).toHaveBeenCalledTimes(2); // unchanged
    expect(mockChargeWorkflowExecutionFee).toHaveBeenCalledTimes(2); // unchanged — no double charge
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
    expect(mockExecuteWorkflow).not.toHaveBeenCalled();
  });

  it('insufficient credits for the fee: the lead is honestly EXEC_FAILED, nothing executes, remaining leads are skipped without re-charging', async () => {
    // First charge attempt fails; the second lead must be skipped rather
    // than pointlessly re-attempting a doomed charge.
    mockChargeWorkflowExecutionFee.mockResolvedValue({
      ok: false, code: 'INSUFFICIENT_CREDITS', fee: 5, balance: 3, shortfall: 2,
    });

    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');

    expect(outcome.executionsCreated).toBe(0);
    expect(mockExecuteWorkflow).not.toHaveBeenCalled();
    // Exactly ONE charge ATTEMPT (the first lead); the second lead was
    // short-circuited by the honest insufficient-credits flag.
    expect(mockChargeWorkflowExecutionFee).toHaveBeenCalledTimes(1);
    expect(chargeKeys()).toEqual(['wfexec-run:autopilot-ap1-lead-lead-bright']);
    // The lead row records the refusal reason.
    expect(mockPrisma.autopilotLead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { autopilotId: 'ap1', leadId: 'lead-bright' },
        data: expect.objectContaining({
          status: 'EXEC_FAILED',
          error: expect.stringContaining('Insufficient credits'),
        }),
      })
    );
    // The run's own error summary carries the honest reason.
    expect(outcome.error).toContain('Insufficient credits');
  });

  it('a lead whose execution never started gets its fee refunded idempotently (§21)', async () => {
    mockExecuteWorkflow.mockRejectedValueOnce(new Error('Execution record could not be created'));

    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');

    expect(outcome.executionsCreated).toBe(1); // the other lead succeeded
    expect(mockChargeWorkflowExecutionFee).toHaveBeenCalledTimes(2);
    expect(mockRefundWorkflowExecutionFee).toHaveBeenCalledTimes(1);
    expect(mockRefundWorkflowExecutionFee.mock.calls[0][0].chargeKey).toBe(
      'wfexec-run:autopilot-ap1-lead-lead-bright'
    );
  });

  it('the run refuses BEFORE discovery when credits cannot cover the workflow fee', async () => {
    mockCheckCreditSufficiency.mockResolvedValue({ sufficient: false, balance: 3, shortfall: 2 });

    const outcome = await executeAutopilotRun(AUTOPILOT_ROW, 'run1', 'manual');

    expect(outcome.status).toBe('FAILED');
    expect(outcome.error).toContain('Insufficient credits');
    expect(mockStartDiscoveryJob).not.toHaveBeenCalled();
    expect(mockChargeWorkflowExecutionFee).not.toHaveBeenCalled();
    expect(mockExecuteWorkflow).not.toHaveBeenCalled();
  });
});
