// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 2 Tests — Idempotency Across the Orchestration
//
// Verifies idempotency at every layer of the orchestration stack:
//
//   · ModelInvocation — a durably COMPLETED slot is REUSED on retry,
//     never re-invoked (no duplicate generation, no duplicate token spend)
//   · Credits — duplicate orchestration event with the same logical key
//     never double-charges
//   · Worker retry — does NOT create a duplicate durable row; reopens
//     the existing FAILED row in place
//   · Scheduler tick — duplicate ticks computing the same key do not
//     double-charge
//   · Approval callback — duplicate network replays of the same
//     callback do not double-refund
//
// Mock pattern matches part2-orchestration-strategies.test.ts:
//   · executeAICompletion — mocked (no network)
//   · workflow-ai-retry — mocked (passthrough)
//   · model-invocation — mocked (so we can simulate COMPLETED/FAILED
//     durable rows on the second call without persisting anything)
//   · execution-activity — mocked (avoid DB writes for the activity log)
//
// Real test.db is NOT mocked — credit-charge tests hit the live
// Prisma client (same pattern as part2-credits.test.ts).
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  orchestrateModelCalls,
  type OrchestrationContext,
} from '@/lib/ai/orchestrator';
import {
  chargeOperationCredits,
  refundOperationCredits,
} from '@/lib/ai/credits-orchestrator';
import { getCreditBalance } from '@/lib/credit-service';
import {
  setupPart2Context,
  teardownPart2Context,
  type Part2TestContext,
} from '../helpers/part2-test-utils';

// ===== Mocks (matching part2-orchestration-strategies.test.ts pattern) =====

let mockCallCount = 0;
let mockResponses: string[] = [];
let mockFailOnCall: Record<number, string> = {};

// Track findInvocationByKey behavior — by default returns null (no
// existing row). Tests can swap in a canned COMPLETED/FAILED row to
// simulate the second-call idempotent read.
let findInvocationByKeyResult: (() => unknown) | null = null;

// Track the durable-row lifecycle calls so tests can assert on them.
const durableCalls = {
  findInvocationByKey: 0,
  createRunningInvocation: 0,
  reopenInvocationForRetry: 0,
  completeInvocation: 0,
  failInvocation: 0,
};

vi.mock('@/lib/ai/ai-provider', () => ({
  executeAICompletion: vi.fn(async (params: { messages: { content: string }[] }) => {
    const idx = mockCallCount++;
    if (mockFailOnCall[idx]) throw new Error(mockFailOnCall[idx]);
    const prompt = params.messages[0]?.content ?? '';
    const response = mockResponses[Math.min(idx, mockResponses.length - 1)] ?? '';
    return {
      success: true,
      content: response || `mock[${idx}]: ${prompt.slice(0, 30)}`,
      provider: 'mock',
      model: 'mock-model',
      tokensUsed: 5,
      latencyMs: 1,
      retries: 0,
    };
  }),
}));

vi.mock('@/lib/workflow-ai-retry', () => ({
  withAiRateLimitRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

vi.mock('@/lib/model-invocation', () => ({
  findInvocationByKey: vi.fn(async () => {
    durableCalls.findInvocationByKey++;
    return findInvocationByKeyResult ? findInvocationByKeyResult() : null;
  }),
  createRunningInvocation: vi.fn(async () => {
    durableCalls.createRunningInvocation++;
    return { id: 'mock-inv-1', invocationKey: 'mock-key' };
  }),
  reopenInvocationForRetry: vi.fn(async (id: string) => {
    durableCalls.reopenInvocationForRetry++;
    return { id, attempt: 1 };
  }),
  completeInvocation: vi.fn(async () => {
    durableCalls.completeInvocation++;
  }),
  failInvocation: vi.fn(async () => {
    durableCalls.failInvocation++;
  }),
  cancelInvocation: vi.fn(async () => {}),
}));

vi.mock('@/lib/execution-activity', () => ({
  logExecutionActivity: vi.fn(async () => {}),
}));

// NOTE: @/lib/db is NOT mocked. The credit-charge tests (below) use the
// real Prisma client via setupPart2Context + chargeOperationCredits.
// The orchestration tests' cancellation probe (db.workflowExecution.findUnique)
// hits the real DB and returns null (no WorkflowExecution row exists for
// our test executionIds) — treated as "not cancelled". This is the same
// pattern as part2-credits.test.ts.

function resetMocks() {
  mockCallCount = 0;
  mockResponses = [];
  mockFailOnCall = {};
  findInvocationByKeyResult = null;
  durableCalls.findInvocationByKey = 0;
  durableCalls.createRunningInvocation = 0;
  durableCalls.reopenInvocationForRetry = 0;
  durableCalls.completeInvocation = 0;
  durableCalls.failInvocation = 0;
}

const baseContext: OrchestrationContext = {
  executionId: 'test-exec-idem',
  stepName: 'idempotency-test-step',
  userId: 'test-user-idem',
  actionType: 'lead_analysis',
};

// ═══════════════════════════════════════════════════════════════════
// Model-invocation-layer idempotency (pure mock; no DB needed)
// ═══════════════════════════════════════════════════════════════════

describe('[Part 2] Idempotency — Model Invocation Layer', () => {
  beforeEach(resetMocks);

  it('returns REUSED (not re-run) when an invocation slot is already durably COMPLETED', async () => {
    // First call: findInvocationByKey returns null → create + execute + complete.
    const first = await orchestrateModelCalls({
      specs: [{ provider: 'mock', model: 'm1', role: 'analyst' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'first run',
      context: baseContext,
    });
    expect(first.success).toBe(true);
    expect(first.models[0].status).toBe('COMPLETED');
    expect(first.summary.completed).toBe(1);
    expect(durableCalls.createRunningInvocation).toBe(1);
    expect(mockCallCount).toBe(1); // executeAICompletion fired once

    // Second call: simulate the durable row already being COMPLETED.
    // The orchestrator must REUSE it (no second executeAICompletion).
    findInvocationByKeyResult = () => ({
      id: 'mock-inv-1',
      invocationKey: 'mi:test-exec-idem:none:idempotency-test-step:mock:m1:analyst',
      status: 'COMPLETED',
      attempt: 0,
      result: JSON.stringify({ content: 'cached content from first run' }),
      provider: 'mock',
      model: 'm1',
    });

    const second = await orchestrateModelCalls({
      specs: [{ provider: 'mock', model: 'm1', role: 'analyst' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'duplicate run — must be REUSED',
      context: baseContext,
    });

    // REUSED is the canonical idempotent skip status.
    expect(second.success).toBe(true);
    expect(second.models[0].status).toBe('REUSED');
    expect(second.models[0].fromCache).toBe(true);
    expect(second.models[0].content).toContain('cached content');
    expect(second.summary.reused).toBe(1);
    expect(second.summary.completed).toBe(1);

    // CRITICAL: executeAICompletion was NOT called the second time.
    expect(mockCallCount).toBe(1); // unchanged from after first call
    // No new durable row was created (no createRunningInvocation).
    expect(durableCalls.createRunningInvocation).toBe(1);
    // No reopen either (REUSED short-circuits before the reopen path).
    expect(durableCalls.reopenInvocationForRetry).toBe(0);
  });

  it('duplicate worker retry reopens the existing FAILED row (no duplicate durable row)', async () => {
    // First call: slot FAILED (provider error) → row persists as FAILED.
    mockFailOnCall = { 0: 'simulated transient provider error' };
    const first = await orchestrateModelCalls({
      specs: [{ provider: 'mock', model: 'm1', role: 'analyst' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'first attempt — fails',
      context: baseContext,
    });
    expect(first.success).toBe(false);
    expect(first.models[0].status).toBe('FAILED');
    expect(first.summary.failed).toBe(1);
    expect(durableCalls.createRunningInvocation).toBe(1);
    expect(durableCalls.failInvocation).toBe(1);
    expect(mockCallCount).toBe(1);

    // Second call (the retry): findInvocationByKey returns the FAILED
    // row. The orchestrator must reopen the SAME row, not create a new
    // one (audit trail of retry history is preserved).
    mockFailOnCall = {}; // retry succeeds this time
    mockResponses = ['retry succeeded'];
    findInvocationByKeyResult = () => ({
      id: 'mock-inv-1',
      invocationKey: 'mi:test-exec-idem:none:idempotency-test-step:mock:m1:analyst',
      status: 'FAILED',
      attempt: 0,
      result: null,
      provider: 'mock',
      model: 'm1',
    });

    const second = await orchestrateModelCalls({
      specs: [{ provider: 'mock', model: 'm1', role: 'analyst' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'retry — succeeds',
      context: baseContext,
    });

    expect(second.success).toBe(true);
    expect(second.models[0].status).toBe('COMPLETED');
    expect(second.models[0].content).toBe('retry succeeded');

    // CRITICAL: NO duplicate durable row was created. createRunningInvocation
    // stays at 1 (only the first attempt created). reopenInvocationForRetry
    // was called once (for the retry path).
    expect(durableCalls.createRunningInvocation).toBe(1);
    expect(durableCalls.reopenInvocationForRetry).toBe(1);
    // Provider WAS re-invoked (this is a retry, not a cached reuse).
    expect(mockCallCount).toBe(2);
  });

  it('duplicate orchestration event does not double-charge credits (model not re-invoked)', async () => {
    // The orchestrator never charges credits directly (workflow action
    // does), but the contract is: a duplicate orchestration event
    // (same executionId + leadId + stepName) maps to the same
    // invocationKey → REUSED → no second provider call → no second
    // token spend. We verify by asserting executeAICompletion is
    // called exactly ONCE across two orchestrateModelCalls.
    const ctxWithLead: OrchestrationContext = {
      ...baseContext,
      executionId: 'exec-event-1',
      leadId: 'lead-event-1',
      stepName: 'step-event-1',
    };

    // First event.
    const r1 = await orchestrateModelCalls({
      specs: [{ provider: 'mock', model: 'm1', role: 'analyst' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'event 1',
      context: ctxWithLead,
    });
    expect(r1.success).toBe(true);

    // Second event with the SAME (executionId, leadId, stepName).
    // The invocation key is derived from these three values, so the
    // durable row from the first call is found and reused.
    findInvocationByKeyResult = () => ({
      id: 'mock-inv-event',
      status: 'COMPLETED',
      attempt: 0,
      result: JSON.stringify({ content: 'first-event output' }),
      provider: 'mock',
      model: 'm1',
    });
    const r2 = await orchestrateModelCalls({
      specs: [{ provider: 'mock', model: 'm1', role: 'analyst' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'event 2 (duplicate)',
      context: ctxWithLead,
    });
    expect(r2.success).toBe(true);
    expect(r2.models[0].status).toBe('REUSED');

    // The provider was invoked exactly ONCE — no duplicate token
    // spend, no duplicate charge implication.
    expect(mockCallCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Credit-charge-layer idempotency (real test.db; same setup pattern
// as part2-credits.test.ts)
// ═══════════════════════════════════════════════════════════════════

describe('[Part 2] Idempotency — Credit Charge Layer', () => {
  let ctx: Part2TestContext;

  beforeEach(async () => {
    resetMocks();
    ctx = await setupPart2Context();
  });

  afterEach(async () => {
    await teardownPart2Context(ctx);
  });

  it('duplicate orchestration event does not double-charge (same logical key = one charge)', async () => {
    // The logical key for an orchestration event is derived from
    // (executionId, leadId, stepName, role). Two calls with the
    // same key MUST result in exactly one charge.
    const logicalKey = 'exec-idem-2:lead-idem-2:step-idem-2:analyst';
    const before = await getCreditBalance(ctx.userIds[0]);

    // First call: charges.
    const r1 = await chargeOperationCredits({
      userId: ctx.userIds[0],
      action: 'lead_analysis',
      logicalKey,
    });
    expect(r1.charged).toBe(true);
    expect(r1.deduplicated).toBe(false);

    // Second call (duplicate event): deduplicated.
    const r2 = await chargeOperationCredits({
      userId: ctx.userIds[0],
      action: 'lead_analysis',
      logicalKey,
    });
    expect(r2.charged).toBe(true);
    expect(r2.deduplicated).toBe(true);

    const after = await getCreditBalance(ctx.userIds[0]);
    // lead_analysis costs 5 credits. Only ONE charge.
    expect(before.total - after.total).toBe(5);
  });

  it('duplicate scheduler tick does not double-charge', async () => {
    // A scheduler tick fires for a slot. The slot's logical key is
    // derived from (automationId, slotEpochMs) — both stable. Five
    // duplicate ticks computing the same key MUST charge exactly once.
    const logicalKey = 'sched-tick-idem:automation-1:slot-9999';
    const before = await getCreditBalance(ctx.userIds[0]);

    for (let i = 0; i < 5; i++) {
      await chargeOperationCredits({
        userId: ctx.userIds[0],
        action: 'lead_scoring',
        logicalKey,
      });
    }
    const after = await getCreditBalance(ctx.userIds[0]);
    // lead_scoring costs 3 credits. Only ONE charge across 5 ticks.
    expect(before.total - after.total).toBe(3);
  });

  it('duplicate approval callback does not double-refund', async () => {
    // An approval callback fires for a logical operation. Network
    // replays can deliver it multiple times — the refund MUST be
    // applied exactly once.
    const logicalKey = 'approval-idem:approval-1:resume';
    const before = await getCreditBalance(ctx.userIds[0]);

    // Charge first (the original operation succeeded; the refund is
    // for a follow-up failure or rollback).
    await chargeOperationCredits({
      userId: ctx.userIds[0],
      action: 'outreach_generation',
      logicalKey,
    });
    const afterCharge = await getCreditBalance(ctx.userIds[0]);
    expect(before.total - afterCharge.total).toBe(2); // outreach_generation = 2

    // Simulate THREE duplicate approval callbacks (network replay).
    for (let i = 0; i < 3; i++) {
      await refundOperationCredits({
        userId: ctx.userIds[0],
        action: 'outreach_generation',
        logicalKey,
      });
    }
    const afterFinal = await getCreditBalance(ctx.userIds[0]);
    // Only ONE refund of 2 credits — back to the original balance.
    expect(afterFinal.total).toBe(before.total);
  });

  it('duplicate worker retry does not double-charge (same logical key across retries)', async () => {
    // A worker retrying a failed operation must NOT be charged again
    // for the same logical key — the original charge already happened
    // on the first attempt, and a retry only re-runs the model.
    const logicalKey = 'exec-retry-idem:lead-retry:step-retry:analyst';
    const before = await getCreditBalance(ctx.userIds[0]);

    // First attempt — charge.
    await chargeOperationCredits({
      userId: ctx.userIds[0],
      action: 'lead_analysis',
      logicalKey,
    });

    // Three retry attempts — all deduplicated.
    for (let i = 0; i < 3; i++) {
      await chargeOperationCredits({
        userId: ctx.userIds[0],
        action: 'lead_analysis',
        logicalKey,
      });
    }

    const after = await getCreditBalance(ctx.userIds[0]);
    // Only ONE charge for the whole retry chain.
    expect(before.total - after.total).toBe(5);
  });
});
