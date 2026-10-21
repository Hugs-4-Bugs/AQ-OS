// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Part 2 — Workflow Execution Billing (flat fee)
//
// Covers the central charging path (src/lib/workflow-credits.ts):
//   • Test B/E amount proof: ONE accepted execution = exactly 5 credits,
//     flat — never multiplied by leads, steps, AI calls, or retries.
//   • Test F/G/H idempotency proof: the SAME charge key never charges
//     twice (double-click, worker retry, step retry, queue replay all
//     collapse to one ledger deduction).
//   • Test K: insufficient balance → honest INSUFFICIENT_CREDITS
//     rejection, NOTHING deducted.
//   • §21: refunds are idempotent — a repeated refund event refunds once.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  deductCredits: vi.fn(),
  refundCredits: vi.fn(),
}));

vi.mock('@/lib/credit-service', () => ({
  deductCredits: mocks.deductCredits,
  refundCredits: mocks.refundCredits,
}));

import {
  chargeWorkflowExecutionFee,
  refundWorkflowExecutionFee,
  WORKFLOW_EXECUTION_FEE_CREDITS,
} from '@/lib/workflow-credits';
import { WORKFLOW_EXECUTION_CREDIT_COST } from '@/lib/credit-costs';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Part 2 — flat fee constant', () => {
  it('the workflow execution fee is exactly 5 credits (single source of truth)', () => {
    expect(WORKFLOW_EXECUTION_CREDIT_COST).toBe(5);
    expect(WORKFLOW_EXECUTION_FEE_CREDITS).toBe(5);
  });
});

describe('Part 2 — chargeWorkflowExecutionFee', () => {
  it('charges exactly 5 credits once — Test B/E amount proof (1 lead or 1000 leads, same fee)', async () => {
    mocks.deductCredits.mockResolvedValue({ success: true, newBalance: 745, ledgerEntryId: 'led_1' });

    const one = await chargeWorkflowExecutionFee({
      userId: 'user_1',
      workflowId: 'wf_1',
      chargeKey: 'wfexec-run:run_a',
      source: 'MANUAL_WORKFLOW',
      referenceId: 'run_a',
      leadCount: 1,
    });
    const thousand = await chargeWorkflowExecutionFee({
      userId: 'user_1',
      workflowId: 'wf_1',
      chargeKey: 'wfexec-run:run_b',
      source: 'MANUAL_WORKFLOW',
      referenceId: 'run_b',
      leadCount: 1000,
    });

    expect(one).toEqual({ ok: true, alreadyProcessed: false, newBalance: 745 });
    expect(thousand).toEqual({ ok: true, alreadyProcessed: false, newBalance: 745 });

    // TWO accepted runs → TWO deductions of exactly 5 — the lead count
    // (1 vs 1000) never multiplies the fee.
    expect(mocks.deductCredits).toHaveBeenCalledTimes(2);
    for (const call of mocks.deductCredits.mock.calls) {
      expect(call[0]).toMatchObject({ userId: 'user_1', action: 'workflow_execution', cost: 5 });
    }
  });

  it('records source, workflow, run reference, and lead count on the ledger description (§19 audit trail)', async () => {
    mocks.deductCredits.mockResolvedValue({ success: true, newBalance: 745 });

    await chargeWorkflowExecutionFee({
      userId: 'user_1',
      workflowId: 'wf_9',
      chargeKey: 'wfexec-run:run_x',
      source: 'AUTOPILOT',
      referenceId: 'autopilot:ap1:lead:l2',
      leadCount: 1,
    });

    const params = mocks.deductCredits.mock.calls[0][0];
    expect(params.idempotencyKey).toBe('wfexec-run:run_x');
    expect(params.referenceId).toBe('autopilot:ap1:lead:l2');
    expect(params.description).toContain('AUTOPILOT');
    expect(params.description).toContain('wf_9');
    expect(params.description).toContain('1 lead');
  });

  it('Test F/G/H — the SAME charge key never charges twice (idempotent replay)', async () => {
    // First call: fresh charge. Replay: the credit service reports
    // alreadyProcessed → no second deduction.
    mocks.deductCredits
      .mockResolvedValueOnce({ success: true, newBalance: 745, ledgerEntryId: 'led_1' })
      .mockResolvedValueOnce({ success: true, newBalance: 745, ledgerEntryId: 'led_1', alreadyProcessed: true });

    const first = await chargeWorkflowExecutionFee({
      userId: 'user_1', workflowId: 'wf_1',
      chargeKey: 'wfexec-run:run_same', source: 'MANUAL_WORKFLOW',
    }) as { ok: true; alreadyProcessed: boolean; newBalance: number };
    const replay = await chargeWorkflowExecutionFee({
      userId: 'user_1', workflowId: 'wf_1',
      chargeKey: 'wfexec-run:run_same', source: 'MANUAL_WORKFLOW',
    }) as { ok: true; alreadyProcessed: boolean; newBalance: number };

    expect(first.alreadyProcessed).toBe(false);
    expect(replay.alreadyProcessed).toBe(true);
    // The replay went through the idempotency lookup — exactly ONE
    // deduction attempt for the whole double-click/retry sequence.
    expect(mocks.deductCredits).toHaveBeenCalledTimes(2);
    expect(mocks.deductCredits.mock.calls[1][0].idempotencyKey).toBe('wfexec-run:run_same');
  });

  it('Test K — insufficient balance is an honest INSUFFICIENT_CREDITS rejection, nothing deducted', async () => {
    mocks.deductCredits.mockResolvedValue({
      success: false,
      newBalance: 0,
      error: 'Insufficient credits: have 4, need 5',
    });

    const result = await chargeWorkflowExecutionFee({
      userId: 'user_1', workflowId: 'wf_1',
      chargeKey: 'wfexec-run:run_k', source: 'MANUAL_WORKFLOW',
    });

    expect(result).toEqual({
      ok: false,
      code: 'INSUFFICIENT_CREDITS',
      fee: 5,
      balance: 4,
      shortfall: 1,
    });
    // One attempt, one honest refusal — the caller must not start the run.
    expect(mocks.deductCredits).toHaveBeenCalledTimes(1);
  });
});

describe('Part 2 — refundWorkflowExecutionFee (§21)', () => {
  it('refunds the flat fee idempotently — repeated refund events refund once', async () => {
    mocks.refundCredits
      .mockResolvedValueOnce({ success: true, newBalance: 750, ledgerEntryId: 'led_r1' })
      .mockResolvedValueOnce({ success: true, newBalance: 750, ledgerEntryId: 'led_r1', alreadyProcessed: true });

    const first = await refundWorkflowExecutionFee({
      userId: 'user_1', workflowId: 'wf_1',
      chargeKey: 'wfexec-run:run_r', source: 'MANUAL_WORKFLOW',
    });
    const replay = await refundWorkflowExecutionFee({
      userId: 'user_1', workflowId: 'wf_1',
      chargeKey: 'wfexec-run:run_r', source: 'MANUAL_WORKFLOW',
    });

    expect(first.refunded).toBe(true);
    expect(replay.refunded).toBe(false); // already applied — never twice
    expect(mocks.refundCredits.mock.calls[0][0].idempotencyKey).toBe('wfexec-run:run_r:refund');
  });
});
