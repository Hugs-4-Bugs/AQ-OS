// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Never-Started Workflow Execution Billing (Part 2 §21 amended)
//
// THE BILLING BUG this suite locks down (Oct 2026): a workflow run that
// fails at its FIRST step — "Webhook call failed: fetch failed", 0/6
// steps — still consumed the flat 5-credit execution fee. Product rule:
//   • A run that terminates with ZERO steps completed NEVER actually
//     started → 0 credits (the acceptance-time fee is released).
//   • Only an actually-started execution (≥1 step completed) may keep the
//     flat fee. (Original Part 2 rule preserved.)
//   • A retry after a pre-start failure stays free UNTIL execution
//     actually starts; the first completed step re-incurs the fee exactly
//     once per execution.
//   • Duplicate requests / duplicate failure callbacks never double-charge
//     or double-refund.
//
// Runs the REAL engine (executeWorkflow/runSteps/retryExecution) + REAL
// workflow-credits against a simulated ledger that faithfully implements
// the credit-service idempotency contract (charge/refund keyed rows,
// never-negative balance) — the same contract part2-execution-billing
// asserts on the service boundary.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Simulated ledger + balances (the credit-service contract) ──────
const sim = vi.hoisted(() => {
  const state = {
    balance: {} as Record<string, number>,
    rows: [] as Array<{ userId: string; action: string; credits: number; balance: number; description: string | null; referenceId: string | null }>,
    executions: new Map<string, Record<string, unknown>>(),
    execCounter: 0,
  };

  const deductCredits = vi.fn(async (p: {
    userId: string; action: string; cost: number; referenceId?: string; idempotencyKey?: string; description?: string;
  }) => {
    const label = p.idempotencyKey ? `${p.action}_idempotent_${p.idempotencyKey}` : p.action;
    const existing = state.rows.find((r) => r.userId === p.userId && r.action === label);
    if (existing) {
      return { success: true, newBalance: existing.balance, ledgerEntryId: 'led_dup', alreadyProcessed: true };
    }
    const current = state.balance[p.userId] ?? 0;
    if (current < p.cost) {
      return { success: false, newBalance: 0, error: `Insufficient credits: have ${current}, need ${p.cost}` };
    }
    const newBalance = current - p.cost;
    state.balance[p.userId] = newBalance;
    state.rows.push({
      userId: p.userId, action: label, credits: -p.cost, balance: newBalance,
      description: p.description || `Deducted ${p.cost} credits for ${p.action}`,
      referenceId: p.referenceId ?? null,
    });
    return { success: true, newBalance, ledgerEntryId: `led_${state.rows.length}` };
  });

  const refundCredits = vi.fn(async (p: {
    userId: string; amount: number; originalAction: string; referenceId?: string; idempotencyKey?: string; description?: string;
  }) => {
    const label = p.idempotencyKey
      ? `${p.originalAction}_refund_idempotent_${p.idempotencyKey}`
      : `${p.originalAction}_refund`;
    const existing = state.rows.find((r) => r.userId === p.userId && r.action === label);
    if (existing) {
      return { success: true, newBalance: existing.balance, ledgerEntryId: 'led_dup', alreadyProcessed: true };
    }
    const newBalance = (state.balance[p.userId] ?? 0) + p.amount;
    state.balance[p.userId] = newBalance;
    state.rows.push({
      userId: p.userId, action: label, credits: p.amount, balance: newBalance,
      description: p.description || `Refund: ${p.amount} credits returned for failed ${p.originalAction}`,
      referenceId: p.referenceId ?? null,
    });
    return { success: true, newBalance, ledgerEntryId: `led_${state.rows.length}` };
  });

  const checkCreditSufficiency = vi.fn(async (userId: string, amount: number) => {
    const balance = state.balance[userId] ?? 0;
    return { sufficient: balance >= amount, balance, shortfall: Math.max(0, amount - balance) };
  });

  const creditsLedgerFindFirst = vi.fn(async ({ where }: {
    where: { userId: string; action?: { startsWith?: string }; referenceId?: { in?: string[] } };
  }) => {
    return state.rows.find((r) => {
      if (r.userId !== where.userId) return false;
      if (where.action?.startsWith && !r.action.startsWith(where.action.startsWith)) return false;
      if (where.referenceId?.in && !where.referenceId.in.includes(r.referenceId ?? '')) return false;
      return true;
    }) ?? null;
  });

  return { state, deductCredits, refundCredits, checkCreditSufficiency, creditsLedgerFindFirst };
});

const mocks = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn((fn: (tx?: unknown) => Promise<unknown>) => fn()),
    workflowDefinition: { findFirst: vi.fn(), findUnique: vi.fn() },
    workflowExecution: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(async () => 0),
    },
    workflowLog: { create: vi.fn(async () => ({})) },
    creditsLedger: { findFirst: sim.creditsLedgerFindFirst },
    user: { findUnique: vi.fn(async () => ({ plan: 'pro', credits: 100 })) },
  },
  executeAction: vi.fn(),
  sendToDeadLetter: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/credit-service', () => ({
  deductCredits: sim.deductCredits,
  refundCredits: sim.refundCredits,
  checkCreditSufficiency: sim.checkCreditSufficiency,
}));
vi.mock('@/lib/workflow-actions', () => ({ executeAction: mocks.executeAction }));
vi.mock('@/lib/workflow-dead-letter', () => ({ sendToDeadLetter: mocks.sendToDeadLetter }));
vi.mock('@/lib/workflow-audit', () => ({ logWorkflowEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/realtime-event-bus', () => ({ publishEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/notification-service', () => ({ createNotificationOnce: vi.fn(async () => ({})) }));
vi.mock('@/lib/billing-audit', () => ({ logCreditEvent: vi.fn(async () => {}) }));

// REAL engine + REAL workflow-credits (only the storage/service boundary is simulated)
import {
  executeWorkflow,
  retryExecution,
} from '@/lib/workflow-engine';
import {
  chargeWorkflowExecutionFee,
  refundNeverStartedWorkflowExecutionFee,
} from '@/lib/workflow-credits';

const USER = 'user_1';
const START_BALANCE = 100;

// ── Step / workflow fixtures ───────────────────────────────────────
function makeStep(id: string, name: string, actionType: string, config: Record<string, unknown> = {}) {
  return { id, type: 'action', name, config: JSON.stringify({ actionType, ...config }), order: 0, nextStepId: null };
}

const WEBHOOK_STEP = makeStep('s1', 'Search dental clinics in Varanasi', 'webhook_call', {
  url: 'https://api.example.com/search/dental_clinics',
  method: 'POST',
});
const NOTE_STEP = makeStep('s2', 'Record outcome', 'add_note', { content: 'run done' });

function primeWorkflow(steps: unknown[]) {
  const wf = {
    id: 'wf_1', userId: USER, name: 'Dental Clinic Outreach', status: 'active',
    triggerType: 'manual', requiresApproval: false, profileId: null,
    nodes: '[]', workflowSteps: steps,
  };
  mocks.db.workflowDefinition.findFirst.mockResolvedValue(wf);
  mocks.db.workflowDefinition.findUnique.mockResolvedValue(wf);
  return wf;
}

/** Stateful execution-row doubles so the engine sees real final states. */
function primeExecutionStore() {
  mocks.db.workflowExecution.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const id = `exec_${++sim.state.execCounter}`;
    const row: Record<string, unknown> = {
      id,
      workflowId: data.workflowId,
      userId: data.userId,
      status: data.status ?? 'running',
      currentStep: 0,
      totalSteps: data.totalSteps ?? 0,
      error: data.error ?? null,
      retryCount: 0,
      maxRetries: data.maxRetries ?? 3,
      timeoutMs: data.timeoutMs ?? 300000,
      idempotencyKey: data.idempotencyKey ?? null,
      triggerData: data.triggerData ?? null,
      workflow: { id: data.workflowId, userId: data.userId },
    };
    sim.state.executions.set(id, row);
    return { id, status: row.status };
  });
  mocks.db.workflowExecution.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => sim.state.executions.get(where.id) ?? null,
  );
  mocks.db.workflowExecution.findFirst.mockImplementation(
    async ({ where }: { where: { id?: string; idempotencyKey?: string; workflowId?: string } }) => {
      if (where.id) return sim.state.executions.get(where.id) ?? null;
      if (where.idempotencyKey && where.workflowId) {
        for (const row of sim.state.executions.values()) {
          if (row.idempotencyKey === where.idempotencyKey && row.workflowId === where.workflowId) return row;
        }
      }
      return null;
    },
  );
  mocks.db.workflowExecution.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = sim.state.executions.get(where.id);
      if (row) Object.assign(row, data);
      return row ?? {};
    },
  );
  mocks.db.workflowExecution.updateMany.mockImplementation(
    async ({ where, data }: { where: { id: string; status?: unknown }; data: Record<string, unknown> }) => {
      const row = sim.state.executions.get(where.id);
      if (!row) return { count: 0 };
      // Simulate the atomic status claim: only succeed if current status is retriable
      const retriable = ['failed', 'cancelled', 'exhausted'];
      if (retriable.includes(row.status as string)) {
        Object.assign(row, data);
        return { count: 1 };
      }
      return { count: 0 };
    },
  );
}

/** The caller-side acceptance sequence every charging entry point uses. */
async function acceptRun(chargeKey: string) {
  const charge = await chargeWorkflowExecutionFee({
    userId: USER, workflowId: 'wf_1', chargeKey, source: 'MANUAL_WORKFLOW', referenceId: chargeKey,
  });
  expect(charge.ok).toBe(true);
  return charge;
}

function balance(): number {
  return sim.state.balance[USER] ?? START_BALANCE;
}
function ledgerRows(): typeof sim.state.rows {
  return sim.state.rows;
}
function refundRows() {
  return ledgerRows().filter((r) => r.action.startsWith('workflow_execution_refund_idempotent_'));
}
function chargeRows() {
  return ledgerRows().filter((r) => r.action.startsWith('workflow_execution_idempotent_'));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WORKFLOW_TIMEOUT = '10000';
  process.env.WORKFLOW_MAX_RETRIES = '3';
  process.env.WORKFLOW_RETRY_BACKOFF_BASE_MS = '1';
  sim.state.balance = { [USER]: START_BALANCE };
  sim.state.rows = [];
  sim.state.executions = new Map();
  sim.state.execCounter = 0;
  mocks.executeAction.mockResolvedValue({ success: true, output: { done: true } });
  mocks.sendToDeadLetter.mockResolvedValue(undefined);
  primeWorkflow([WEBHOOK_STEP, NOTE_STEP]);
  primeExecutionStore();
});

// ═══════════════════════════════════════════════════════════════════
// Test 1 — successful workflow → exactly 5 credits
// ═══════════════════════════════════════════════════════════════════

describe('Test 1 — successful workflow charges exactly 5 credits', () => {
  it('both steps complete → one 5-credit charge, no refund, balance 100 → 95', async () => {
    await acceptRun('wfexec-run:run_success');
    const result = await executeWorkflow('wf_1', USER, {}, 'run_success', {
      neverStartedAutoRefund: true,
    });

    expect(result.executionId).not.toBe('');
    expect(result.status).toBe('completed');
    expect(result.stepsCompleted).toBe(2);
    expect(mocks.executeAction).toHaveBeenCalledTimes(2);

    // Exactly one deduction of 5 — nothing else touched the balance.
    expect(balance()).toBe(95);
    expect(chargeRows()).toHaveLength(1);
    expect(chargeRows()[0].credits).toBe(-5);
    expect(refundRows()).toHaveLength(0);
    expect(sim.refundCredits).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Test 2 — webhook failure BEFORE any step executes → 0 credits
// ═══════════════════════════════════════════════════════════════════

describe('Test 2 — webhook failure before execution → 0 credits', () => {
  it('first step fails with "Webhook call failed: fetch failed" → charge refunded atomically, net 0', async () => {
    mocks.executeAction.mockResolvedValue({
      success: false,
      error: 'Webhook call failed: fetch failed',
    });

    await acceptRun('wfexec-run:run_webhook_down');
    const result = await executeWorkflow('wf_1', USER, {}, 'run_webhook_down', {
      neverStartedAutoRefund: true,
    });

    // The run failed honestly at step 0 — 0 steps completed.
    expect(result.status).toBe('failed');
    expect(result.stepsCompleted).toBe(0);
    expect(result.error).toContain('Webhook call failed');

    // ONE charge and ONE idempotent never-started refund → net 0 credits.
    expect(balance()).toBe(100);
    expect(chargeRows()).toHaveLength(1);
    expect(refundRows()).toHaveLength(1);
    expect(refundRows()[0].action).toBe('workflow_execution_refund_idempotent_wfexec-neverstarted:exec_1');
    expect(refundRows()[0].referenceId).toBe('exec_1');
    expect(refundRows()[0].description).toContain('Never-started workflow execution fee refunded');
  });

  it('the second step of the ledger shows the reconciled balance (audit trail preserved)', async () => {
    mocks.executeAction.mockResolvedValue({ success: false, error: 'Webhook call failed: fetch failed' });
    await acceptRun('wfexec-run:run_audit');
    await executeWorkflow('wf_1', USER, {}, 'run_audit', { neverStartedAutoRefund: true });

    const [charge, refund] = ledgerRows();
    expect(charge.credits).toBe(-5);
    expect(charge.balance).toBe(95);
    expect(refund.credits).toBe(5);
    expect(refund.balance).toBe(100); // fully reconciled
  });
});

// ═══════════════════════════════════════════════════════════════════
// Test 3 — retry after pre-start failure → still 0 credits
// ═══════════════════════════════════════════════════════════════════

describe('Test 3 — retry after pre-start failure stays free until execution actually starts', () => {
  it('webhook still down → the retried run fails pre-start again, balance unchanged (net 0)', async () => {
    mocks.executeAction.mockResolvedValue({ success: false, error: 'Webhook call failed: fetch failed' });
    await acceptRun('wfexec-run:run_retry_fail');
    const first = await executeWorkflow('wf_1', USER, {}, 'run_retry_fail', {
      neverStartedAutoRefund: true,
    });
    expect(balance()).toBe(100); // refunded after the first pre-start failure

    const retry = await retryExecution(first.executionId, USER);
    expect(retry.success).toBe(true); // the retry itself ran and failed honestly
    expect(mocks.executeAction).toHaveBeenCalledTimes(2); // step 1 re-attempted once per run

    // The refund idempotency key absorbed the duplicate release: still net 0.
    expect(balance()).toBe(100);
    expect(refundRows()).toHaveLength(1);
    expect(chargeRows()).toHaveLength(1);
    // No actual-start re-charge ever fired — no step ever completed.
    expect(ledgerRows().some((r) => r.action.includes('wfexec-started:'))).toBe(false);
  });

  it('webhook recovered → the retried run ACTUALLY starts and re-incurs exactly 5 (net 5 total)', async () => {
    // First attempt: webhook down → failed at step 0 → refunded (balance 100).
    mocks.executeAction.mockResolvedValue({ success: false, error: 'Webhook call failed: fetch failed' });
    await acceptRun('wfexec-run:run_retry_ok');
    const first = await executeWorkflow('wf_1', USER, {}, 'run_retry_ok', {
      neverStartedAutoRefund: true,
    });
    expect(balance()).toBe(100);

    // Provider recovered: the retry now completes both steps.
    mocks.executeAction.mockResolvedValue({ success: true, output: { done: true } });
    const retry = await retryExecution(first.executionId, USER);
    expect(retry.success).toBe(true);

    const row = sim.state.executions.get(first.executionId);
    expect(row?.status).toBe('completed');

    // Reconciled ledger: -5 (charge) +5 (never-started refund) -5 (actual-start
    // re-charge, exactly once) → the successful run cost exactly 5 credits.
    expect(balance()).toBe(95);
    const started = ledgerRows().filter((r) => r.action.includes('wfexec-started:'));
    expect(started).toHaveLength(1);
    expect(started[0].credits).toBe(-5);
  });

  it('a second retry after a successful recharged run never charges again (one fee per execution)', async () => {
    mocks.executeAction.mockResolvedValue({ success: false, error: 'Webhook call failed: fetch failed' });
    await acceptRun('wfexec-run:run_once_only');
    const first = await executeWorkflow('wf_1', USER, {}, 'run_once_only', {
      neverStartedAutoRefund: true,
    });

    mocks.executeAction.mockResolvedValue({ success: true, output: {} });
    await retryExecution(first.executionId, USER); // actually starts → recharged
    expect(balance()).toBe(95);

    // The completed execution cannot be retried — the engine refuses.
    const again = await retryExecution(first.executionId, USER);
    expect(again.success).toBe(false);
    expect(balance()).toBe(95); // unchanged
  });

  it('insufficient balance for the re-charge → honest rejection BEFORE anything re-runs', async () => {
    mocks.executeAction.mockResolvedValue({ success: false, error: 'Webhook call failed: fetch failed' });
    await acceptRun('wfexec-run:run_poor');
    const first = await executeWorkflow('wf_1', USER, {}, 'run_poor', {
      neverStartedAutoRefund: true,
    });

    sim.state.balance[USER] = 3; // top-up drained: cannot cover the 5-credit fee
    const actionCallsBefore = mocks.executeAction.mock.calls.length;
    const retry = await retryExecution(first.executionId, USER);

    expect(retry.success).toBe(false);
    expect(retry.error).toContain('Insufficient credits');
    expect(mocks.executeAction.mock.calls.length).toBe(actionCallsBefore); // nothing executed
    expect(ledgerRows().some((r) => r.action.includes('wfexec-started:'))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Test 4 — duplicate execution request → no double charge
// ═══════════════════════════════════════════════════════════════════

describe('Test 4 — duplicate execution requests never double-charge', () => {
  it('double-click replays the SAME run key → ONE 5-credit deduction', async () => {
    const first = await acceptRun('wfexec-run:run_double') as { ok: true; alreadyProcessed: boolean };
    const replay = await acceptRun('wfexec-run:run_double') as { ok: true; alreadyProcessed: boolean };

    expect(first.alreadyProcessed).toBe(false);
    expect(replay.alreadyProcessed).toBe(true);
    expect(balance()).toBe(95); // 100 − 5, exactly once
  });

  it('engine idempotency: the replayed run returns the SAME execution without new billing', async () => {
    await acceptRun('wfexec-run:run_dup_engine');
    const first = await executeWorkflow('wf_1', USER, {}, 'run_dup_engine', {
      neverStartedAutoRefund: true,
    });
    const replay = await executeWorkflow('wf_1', USER, {}, 'run_dup_engine', {
      neverStartedAutoRefund: true,
    });

    expect(replay.executionId).toBe(first.executionId);
    expect(chargeRows()).toHaveLength(1);
    expect(refundRows()).toHaveLength(0); // successful run, replay refunded nothing
    expect(balance()).toBe(95);
  });

  it('duplicate failure callbacks can never double-refund (idempotent release)', async () => {
    mocks.executeAction.mockResolvedValue({ success: false, error: 'Webhook call failed: fetch failed' });
    await acceptRun('wfexec-run:run_dup_refund');
    const result = await executeWorkflow('wf_1', USER, {}, 'run_dup_refund', {
      neverStartedAutoRefund: true,
    });

    // A duplicate failure event replays the release directly:
    const dup = await refundNeverStartedWorkflowExecutionFee({
      userId: USER, workflowId: 'wf_1', executionId: result.executionId,
    });
    expect(dup.refunded).toBe(false); // already applied — never twice

    expect(refundRows()).toHaveLength(1);
    expect(balance()).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Part 2 rule preservation — actually-started runs keep the fee
// ═══════════════════════════════════════════════════════════════════

describe('Part 2 preserved — a run that started and failed keeps its fee', () => {
  it('step 1 succeeds, step 2 fails → fee stands (balance 95), honest partial run', async () => {
    mocks.executeAction.mockImplementation(async (type: string) => {
      if (type === 'webhook_call') return { success: true, output: { statusCode: 200 } };
      return { success: false, error: 'Note step exploded' };
    });

    await acceptRun('wfexec-run:run_partial');
    const result = await executeWorkflow('wf_1', USER, {}, 'run_partial', {
      neverStartedAutoRefund: true,
    });

    expect(result.status).toBe('failed');
    expect(result.stepsCompleted).toBe(1); // the webhook step completed → actually started
    expect(balance()).toBe(95);
    expect(refundRows()).toHaveLength(0);
    expect(sim.refundCredits).not.toHaveBeenCalled();
  });

  it('auto-refund is opt-in: unflagged callers (batch members) are never auto-refunded by the engine', async () => {
    mocks.executeAction.mockResolvedValue({ success: false, error: 'Webhook call failed: fetch failed' });
    await acceptRun('wfexec-run:run_batch_member');
    // Batch kicks deliberately omit neverStartedAutoRefund — the ROUTE
    // reconciles the shared fee after the whole batch settles.
    const result = await executeWorkflow('wf_1', USER, {}, 'run_batch_member');

    expect(result.status).toBe('failed');
    expect(result.stepsCompleted).toBe(0);
    expect(sim.refundCredits).not.toHaveBeenCalled(); // engine stayed out of it
    expect(balance()).toBe(95); // the shared fee is still held
  });
});
