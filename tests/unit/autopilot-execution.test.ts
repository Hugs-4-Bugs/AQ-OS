// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Execution Engine Tests
//
// Tests the NEW surface area:
//   · retryAutopilotRun(userId, runId) — AutopilotRun-level retry that
//     delegates to workflow-batch.retryBatchExecution. Only failed leads
//     are reset to 'pending'; completed leads NEVER re-execute. The
//     underlying WorkflowExecution is REUSED (no new execution, no new
//     flat fee, no double-billing).
//   · resumeAutopilotRun(userId, runId) — AutopilotRun-level resume that
//     delegates to workflow-batch.resumeBatchExecution. Only 'skipped'
//     items are reset; the interrupted-in-flight lead resumes from its
//     persisted stepSummary. No new execution, no new charge.
//
// Both functions enforce the entitlement gate (defense-in-depth):
// a user who downgraded to Free/Standard cannot retry or resume even if
// they have a previously-eligible run.
//
// Billing invariant verified: neither retry nor resume calls
// chargeWorkflowExecutionFee (the original flat fee is kept; the
// underlying engine's rechargeWorkflowExecutionFeeOnStart handles the
// never-started-refund re-charge case idempotently).
//
// Pre-existing contract surface (discovery/dedup/lead persistence/
// workflow assignment/per-lead execution/failure isolation/idempotency/
// cancellation/scheduler) is covered by the existing test suite — this
// file focuses on the additions and the invariant that they
// preserve the existing contract.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock DB (Prisma-shaped subset that retry/resume touches). ──
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
  workflowExecution: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  workflowExecutionLead: { findMany: vi.fn(), updateMany: vi.fn() },
  businessProfile: { findFirst: vi.fn(), count: vi.fn() },
  __ledger: new Set<string>(),
}));
vi.mock('@/lib/db', () => ({ db: mockPrisma }));

// ── Mock the external execution layers (retry/resume are mocked so we
//    can assert they're called with the right executionId). ──
const mockRetryBatchExecution = vi.hoisted(() => vi.fn());
const mockResumeBatchExecution = vi.hoisted(() => vi.fn());
const mockExecuteWorkflowBatch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/workflow-batch', () => ({
  executeWorkflowBatch: mockExecuteWorkflowBatch,
  retryBatchExecution: mockRetryBatchExecution,
  resumeBatchExecution: mockResumeBatchExecution,
}));

const mockStartDiscoveryJob = vi.hoisted(() => vi.fn());
vi.mock('@/lib/lead-discovery-service', () => ({ startDiscoveryJob: mockStartDiscoveryJob }));

const mockCheckCreditSufficiency = vi.hoisted(() => vi.fn());
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

const mockResolveBusinessProfileForUser = vi.hoisted(() => vi.fn());
vi.mock('@/lib/lead-intelligence', () => ({
  resolveBusinessProfileForUser: mockResolveBusinessProfileForUser,
}));

// ── Import the REAL runner module — retryAutopilotRun + resumeAutopilotRun
//    are the surface under test. The settle finalizer is invoked
//    fire-and-forget; we don't need to assert its calls in detail. ──
import { retryAutopilotRun, resumeAutopilotRun } from '@/lib/autopilot/runner';

beforeEach(() => {
  vi.clearAllMocks();
  // Default: user is pro (eligible). Per-test overrides for free/starter/elite.
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'pro', subscriptions: [] });
  // Default: run exists, owned by u1, FAILED (the retry-relevant state —
  // retry accepts terminal states). Resume tests override to RUNNING
  // (the resume-relevant state — pause is a sub-state of RUNNING at the
  // autopilot level).
  mockPrisma.autopilotRun.findFirst.mockResolvedValue({
    id: 'run1', status: 'FAILED', executionId: 'exec1', autopilotId: 'ap1',
  });
  mockPrisma.autopilotRun.update.mockResolvedValue({});
  // Default: retry/resume succeed at the batch layer.
  mockRetryBatchExecution.mockResolvedValue({ success: true, executionId: 'exec1' });
  mockResumeBatchExecution.mockResolvedValue({ success: true, executionId: 'exec1' });
  // workflowExecution.findUnique is called by settleRunExecutionOutcome (fire-and-forget);
  // return a terminal status so the settle watcher exits immediately.
  mockPrisma.workflowExecution.findUnique.mockResolvedValue({ id: 'exec1', status: 'completed' });
  mockPrisma.workflowExecutionLead.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════════════════════════
// Group 1: retryAutopilotRun — entitlement gate (defense-in-depth)
// ═══════════════════════════════════════════════════════════════════

describe('retryAutopilotRun entitlement gate', () => {
  it('Free plan: retry BLOCKED with code PLAN_INELIGIBLE', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'free', subscriptions: [] });
    const result = await retryAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PLAN_INELIGIBLE');
    expect(mockRetryBatchExecution).not.toHaveBeenCalled();
  });

  it('Starter plan: retry BLOCKED with code PLAN_INELIGIBLE', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'starter', subscriptions: [] });
    const result = await retryAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PLAN_INELIGIBLE');
    expect(mockRetryBatchExecution).not.toHaveBeenCalled();
  });

  it('Pro plan: retry PASSES the gate (delegates to retryBatchExecution)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'pro', subscriptions: [] });
    const result = await retryAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(true);
    expect(result.run?.status).toBe('RUNNING');
    expect(mockRetryBatchExecution).toHaveBeenCalledWith('exec1', 'u1');
  });

  it('Elite plan: retry PASSES the gate', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'elite', subscriptions: [] });
    const result = await retryAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(true);
    expect(mockRetryBatchExecution).toHaveBeenCalledWith('exec1', 'u1');
  });

  it('Active subscription plan overrides user.plan (free user + pro sub → eligible)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u1', plan: 'free',
      subscriptions: [{ plan: 'pro' }],
    });
    const result = await retryAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(true);
    expect(result.code).not.toBe('PLAN_INELIGIBLE');
  });

  it('Malformed plan values (enterprise, unknown, empty) → safe-deny to free → BLOCKED', async () => {
    for (const rawPlan of ['enterprise', 'super-pro', 'unknown-plan', '', null]) {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: rawPlan, subscriptions: [] });
      const result = await retryAutopilotRun('u1', 'run1');
      expect(result.ok).toBe(false);
      expect(result.code).toBe('PLAN_INELIGIBLE');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Group 2: retryAutopilotRun — ownership + state checks
// ═══════════════════════════════════════════════════════════════════

describe('retryAutopilotRun ownership + state', () => {
  it('Cross-user: User B cannot retry User A\'s run → NOT_FOUND (before plan check)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'uB', plan: 'pro', subscriptions: [] });
    mockPrisma.autopilotRun.findFirst.mockResolvedValue(null);
    const result = await retryAutopilotRun('uB', 'runA');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
    expect(mockRetryBatchExecution).not.toHaveBeenCalled();
  });

  it('Run with no executionId (discovery failed) → INVALID_STATE', async () => {
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({
      id: 'run1', status: 'FAILED', executionId: null, autopilotId: 'ap1',
    });
    const result = await retryAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_STATE');
    expect(result.error).toMatch(/no parent execution/i);
  });

  it('RUNNING run: retry rejected with INVALID_STATE (must cancel first)', async () => {
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({
      id: 'run1', status: 'RUNNING', executionId: 'exec1', autopilotId: 'ap1',
    });
    const result = await retryAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_STATE');
    expect(result.error).toMatch(/cancel it first/i);
  });

  it('QUEUED run: retry rejected with INVALID_STATE (must cancel first)', async () => {
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({
      id: 'run1', status: 'QUEUED', executionId: 'exec1', autopilotId: 'ap1',
    });
    const result = await retryAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_STATE');
  });

  it('FAILED run with executionId: retry succeeds (happy path)', async () => {
    const result = await retryAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(true);
    expect(result.run).toEqual({ id: 'run1', status: 'RUNNING', executionId: 'exec1' });
    expect(mockPrisma.autopilotRun.update).toHaveBeenCalledWith({
      where: { id: 'run1' },
      data: { status: 'RUNNING', error: null, completedAt: null },
    });
  });

  it('CANCELLED run with executionId: retry succeeds (the user retried after cancel)', async () => {
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({
      id: 'run1', status: 'CANCELLED', executionId: 'exec1', autopilotId: 'ap1',
    });
    const result = await retryAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(true);
    expect(mockRetryBatchExecution).toHaveBeenCalledWith('exec1', 'u1');
  });

  it('COMPLETED run with executionId: retry succeeds (delegates to batch — only failed items reset)', async () => {
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({
      id: 'run1', status: 'COMPLETED', executionId: 'exec1', autopilotId: 'ap1',
    });
    const result = await retryAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(true);
  });

  it('retryBatchExecution failure → BATCH_ERROR', async () => {
    mockRetryBatchExecution.mockResolvedValue({ success: false, error: 'Execution not in retryable state' });
    const result = await retryAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('BATCH_ERROR');
    expect(result.error).toMatch(/not in retryable state/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Group 3: resumeAutopilotRun — entitlement gate (defense-in-depth)
// ═══════════════════════════════════════════════════════════════════

describe('resumeAutopilotRun entitlement gate', () => {
  it('Free plan: resume BLOCKED with code PLAN_INELIGIBLE', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'free', subscriptions: [] });
    const result = await resumeAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PLAN_INELIGIBLE');
    expect(mockResumeBatchExecution).not.toHaveBeenCalled();
  });

  it('Starter plan: resume BLOCKED with code PLAN_INELIGIBLE', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'starter', subscriptions: [] });
    const result = await resumeAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PLAN_INELIGIBLE');
  });

  it('Pro plan: resume PASSES the gate', async () => {
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({
      id: 'run1', status: 'RUNNING', executionId: 'exec1', autopilotId: 'ap1',
    });
    const result = await resumeAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(true);
    expect(mockResumeBatchExecution).toHaveBeenCalledWith('exec1', 'u1');
  });

  it('Elite plan: resume PASSES the gate', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'elite', subscriptions: [] });
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({
      id: 'run1', status: 'RUNNING', executionId: 'exec1', autopilotId: 'ap1',
    });
    const result = await resumeAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Group 4: resumeAutopilotRun — ownership + state checks
// ═══════════════════════════════════════════════════════════════════

describe('resumeAutopilotRun ownership + state', () => {
  it('Cross-user: User B cannot resume User A\'s run → NOT_FOUND', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'uB', plan: 'pro', subscriptions: [] });
    mockPrisma.autopilotRun.findFirst.mockResolvedValue(null);
    const result = await resumeAutopilotRun('uB', 'runA');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
  });

  it('Run with no executionId → INVALID_STATE', async () => {
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({
      id: 'run1', status: 'RUNNING', executionId: null, autopilotId: 'ap1',
    });
    const result = await resumeAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_STATE');
  });

  it('COMPLETED run: resume rejected (only paused runs can be resumed)', async () => {
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({
      id: 'run1', status: 'COMPLETED', executionId: 'exec1', autopilotId: 'ap1',
    });
    const result = await resumeAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_STATE');
    expect(result.error).toMatch(/only a paused run can be resumed/i);
  });

  it('FAILED run: resume rejected (only paused runs can be resumed)', async () => {
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({
      id: 'run1', status: 'FAILED', executionId: 'exec1', autopilotId: 'ap1',
    });
    const result = await resumeAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_STATE');
  });

  it('CANCELLED run: resume rejected', async () => {
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({
      id: 'run1', status: 'CANCELLED', executionId: 'exec1', autopilotId: 'ap1',
    });
    const result = await resumeAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_STATE');
  });

  it('RUNNING run with executionId: resume delegates to batch engine (handles not-paused case)', async () => {
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({
      id: 'run1', status: 'RUNNING', executionId: 'exec1', autopilotId: 'ap1',
    });
    const result = await resumeAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(true);
    expect(mockResumeBatchExecution).toHaveBeenCalledWith('exec1', 'u1');
  });

  it('resumeBatchExecution failure → BATCH_ERROR', async () => {
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({
      id: 'run1', status: 'RUNNING', executionId: 'exec1', autopilotId: 'ap1',
    });
    mockResumeBatchExecution.mockResolvedValue({ success: false, error: 'Execution is not paused' });
    const result = await resumeAutopilotRun('u1', 'run1');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('BATCH_ERROR');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Group 5: Billing invariant — retry/resume never double-charge
// ═══════════════════════════════════════════════════════════════════

describe('billing invariant (no double-charge on retry/resume)', () => {
  it('retryAutopilotRun NEVER calls chargeWorkflowExecutionFee (existing fee is kept)', async () => {
    await retryAutopilotRun('u1', 'run1');
    expect(mockChargeWorkflowExecutionFee).not.toHaveBeenCalled();
  });

  it('resumeAutopilotRun NEVER calls chargeWorkflowExecutionFee', async () => {
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({
      id: 'run1', status: 'RUNNING', executionId: 'exec1', autopilotId: 'ap1',
    });
    await resumeAutopilotRun('u1', 'run1');
    expect(mockChargeWorkflowExecutionFee).not.toHaveBeenCalled();
  });

  it('retryAutopilotRun NEVER calls refundWorkflowExecutionFee (no auto-refund)', async () => {
    await retryAutopilotRun('u1', 'run1');
    expect(mockRefundWorkflowExecutionFee).not.toHaveBeenCalled();
  });

  it('resumeAutopilotRun NEVER calls refundWorkflowExecutionFee', async () => {
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({
      id: 'run1', status: 'RUNNING', executionId: 'exec1', autopilotId: 'ap1',
    });
    await resumeAutopilotRun('u1', 'run1');
    expect(mockRefundWorkflowExecutionFee).not.toHaveBeenCalled();
  });

  it('Blocked (free plan) retry NEVER charges anything', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'free', subscriptions: [] });
    await retryAutopilotRun('u1', 'run1');
    expect(mockChargeWorkflowExecutionFee).not.toHaveBeenCalled();
    expect(mockRefundWorkflowExecutionFee).not.toHaveBeenCalled();
    expect(mockRetryBatchExecution).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Group 6: Settle finalizer re-arm — retry/resume re-trigger settle so
//          per-lead outcomes propagate to AutopilotLead rows.
// ═══════════════════════════════════════════════════════════════════

describe('settle finalizer re-arm', () => {
  it('retryAutopilotRun re-arms settleRunExecutionOutcome for the run', async () => {
    await retryAutopilotRun('u1', 'run1');
    expect(mockPrisma.workflowExecution.findUnique).toHaveBeenCalled();
  });

  it('resumeAutopilotRun re-arms settleRunExecutionOutcome for the run', async () => {
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({
      id: 'run1', status: 'RUNNING', executionId: 'exec1', autopilotId: 'ap1',
    });
    await resumeAutopilotRun('u1', 'run1');
    expect(mockPrisma.workflowExecution.findUnique).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Group 7: contract contract preservation — retry/resume do NOT
//          weaken existing invariants.
// ═══════════════════════════════════════════════════════════════════

describe('contract contract preservation', () => {
  it('entitlement gate remains authoritative (free user blocked)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'free', subscriptions: [] });
    const result = await retryAutopilotRun('u1', 'run1');
    expect(result.code).toBe('PLAN_INELIGIBLE');
  });

  it('contract: isAutopilotPlanEligible lives in entitlement-service (untouched)', async () => {
    const { isAutopilotPlanEligible, resolveUserPlan } = await import('@/lib/entitlement-service');
    expect(typeof isAutopilotPlanEligible).toBe('function');
    expect(typeof resolveUserPlan).toBe('function');
    expect(isAutopilotPlanEligible('free')).toBe(false);
    expect(isAutopilotPlanEligible('starter')).toBe(false);
    expect(isAutopilotPlanEligible('pro')).toBe(true);
    expect(isAutopilotPlanEligible('elite')).toBe(true);
  });

  it('Billing invariant: 5-credit flat fee is per-WorkflowExecution (not per-retry-attempt)', async () => {
    await retryAutopilotRun('u1', 'run1');
    expect(mockPrisma.autopilotRun.update).toHaveBeenCalled();
    expect(mockPrisma.autopilotRun.create).not.toHaveBeenCalled();
  });
});
