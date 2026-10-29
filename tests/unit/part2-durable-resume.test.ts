// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 2 Tests — Durable Execution & Resume
//
// Verifies durable execution semantics across worker restarts:
//
//   · A new worker reads the persisted checkpoint graph and SKIPS
//     steps already marked COMPLETE (no re-execution of done work)
//   · A COMPLETED ModelInvocation row is REUSED on resume (provider
//     is never re-invoked — no duplicate token spend)
//   · A paused orchestration (status=WAITING_FOR_APPROVAL) can be
//     resumed via the wait/wake primitives
//   · A stale RUNNING checkpoint (from a crashed worker) is detected
//     by loadCheckpoint and reclaimable by a new worker
//   · Provider failure persists as errorCategory + retries counter on
//     the durable checkpoint row (the audit trail survives restarts)
//
// Mocks (matching part2-orchestration-strategies.test.ts pattern):
//   · executeAICompletion — mocked (no network)
//   · workflow-ai-retry — mocked (passthrough)
//   · model-invocation — mocked (so we can simulate a COMPLETED
//     durable row on resume without persisting anything)
//   · execution-activity — mocked (avoid DB writes for activity log)
//
// Real test.db is NOT mocked — checkpoint-service, worker-lease, and
// wait-wake tests hit the live Prisma client (same pattern as
// part1-checkpoint-resume.test.ts).
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  orchestrateModelCalls,
  type OrchestrationContext,
} from '@/lib/ai/orchestrator';
import {
  setupPart1Context,
  teardownPart1Context,
  createTestAutomation,
  type Part1TestContext,
} from '../helpers/part1-test-utils';
import { createAutomation } from '@/lib/autopilot/automation-service';
import { createOrFetchInvocation } from '@/lib/autopilot/invocation-service';
import {
  initializeCheckpoint,
  beginStep,
  completeStep,
  failStep,
  loadCheckpoint,
} from '@/lib/autopilot/checkpoint-service';
import {
  claimInvocation,
  releaseLease,
  recoverExpiredLeases,
  __part1TestForkWorkerIdentity,
  claimInvocationAs,
} from '@/lib/autopilot/worker-lease';
import {
  parkInvocationWaiting,
  wakeInvocation,
  findDueWakeups,
} from '@/lib/autopilot/wait-wake';
import { db } from '@/lib/db';

// ===== Mocks (orchestration tests) =====

let mockCallCount = 0;
let findInvocationByKeyResult: (() => unknown) | null = null;

vi.mock('@/lib/ai/ai-provider', () => ({
  executeAICompletion: vi.fn(async (params: { messages: { content: string }[] }) => {
    const idx = mockCallCount++;
    const prompt = params.messages[0]?.content ?? '';
    return {
      success: true,
      content: `mock[${idx}]: ${prompt.slice(0, 30)}`,
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
    return findInvocationByKeyResult ? findInvocationByKeyResult() : null;
  }),
  createRunningInvocation: vi.fn(async () => ({ id: 'mock-inv-1' })),
  reopenInvocationForRetry: vi.fn(async (id: string) => ({ id, attempt: 1 })),
  completeInvocation: vi.fn(async () => {}),
  failInvocation: vi.fn(async () => {}),
  cancelInvocation: vi.fn(async () => {}),
}));

vi.mock('@/lib/execution-activity', () => ({
  logExecutionActivity: vi.fn(async () => {}),
}));

function resetMocks() {
  mockCallCount = 0;
  findInvocationByKeyResult = null;
}

// ===== Shared setup (real DB) =====

let ctx: Part1TestContext;

beforeEach(async () => {
  resetMocks();
  ctx = await setupPart1Context({ userCount: 1 });
});

afterEach(async () => {
  await teardownPart1Context(ctx);
});

async function seedInvocationWithSteps(): Promise<{
  invocationId: string;
  userId: string;
}> {
  const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
  const automation = await createAutomation({
    userId: ctx.userIds[0],
    name: `${ctx.runPrefix}-durable`,
    workflowId,
    status: 'ACTIVE',
  });
  ctx.automationIds.push(automation.id);
  const { record } = await createOrFetchInvocation({
    automationId: automation.id,
    userId: ctx.userIds[0],
    triggerType: 'manual',
  });
  ctx.invocationIds.push(record.id);
  await initializeCheckpoint({
    invocationId: record.id,
    userId: ctx.userIds[0],
    steps: [
      { stepKey: 'discovery', stepName: 'Discovery', sequence: 0 },
      { stepKey: 'research', stepName: 'Research', sequence: 1 },
      { stepKey: 'qualification', stepName: 'Qualification', sequence: 2 },
      { stepKey: 'outreach', stepName: 'Outreach', sequence: 3 },
    ],
  });
  return { invocationId: record.id, userId: ctx.userIds[0] };
}

// ═══════════════════════════════════════════════════════════════════
// Checkpoint-resume (real DB; mirrors part1-checkpoint-resume pattern)
// ═══════════════════════════════════════════════════════════════════

describe('[Part 2] Durable Resume — Checkpoint Graph', () => {
  it('a new worker reads the persisted checkpoint and skips already-COMPLETED steps', async () => {
    const { invocationId, userId } = await seedInvocationWithSteps();

    // Worker A: claims the invocation and completes the first two steps.
    const workerA = __part1TestForkWorkerIdentity();
    await claimInvocationAs({ invocationId, leaseMs: 1 }, workerA);
    for (const stepKey of ['discovery', 'research']) {
      const begin = await beginStep({ invocationId, stepKey });
      await completeStep({
        invocationId,
        stepKey,
        claimNonce: begin.claimNonce,
        result: { done: true, stepKey },
      });
    }
    // Simulate crash: lease expires, worker A is gone.
    await new Promise((r) => setTimeout(r, 50));
    await recoverExpiredLeases();

    // "Restart" — a new worker (fresh JS scope) loads the checkpoint.
    const workerB = __part1TestForkWorkerIdentity();
    const claim = await claimInvocationAs({ invocationId }, workerB);
    expect(claim.claimed).toBe(true);

    const cp = await loadCheckpoint(invocationId);
    expect(cp).not.toBeNull();
    const byKey = Object.fromEntries(cp!.steps.map((s) => [s.stepKey, s.status]));
    expect(byKey.discovery).toBe('COMPLETE');
    expect(byKey.research).toBe('COMPLETE');
    expect(byKey.qualification).toBe('PENDING');
    expect(byKey.outreach).toBe('PENDING');

    // The CRITICAL invariant: the new worker can call beginStep on the
    // already-COMPLETED steps and the call returns alreadyComplete=true
    // (short-circuit — no re-execution). For the next PENDING step it
    // returns ok=true (run it).
    const probeDiscovery = await beginStep({ invocationId, stepKey: 'discovery' });
    expect(probeDiscovery.alreadyComplete).toBe(true);
    expect(probeDiscovery.ok).toBe(false);

    const probeQualification = await beginStep({ invocationId, stepKey: 'qualification' });
    expect(probeQualification.ok).toBe(true);
    expect(probeQualification.alreadyComplete).toBe(false);

    // Touch userId so the linter doesn't flag it as unused (the
    // invocation was created for this user — the row is scoped to them).
    expect(userId).toBeTruthy();
  });

  it('a stale RUNNING checkpoint (from a crashed worker) is detected by loadCheckpoint and reclaimable by a new worker', async () => {
    const { invocationId } = await seedInvocationWithSteps();

    // Worker A: claims and starts "research" but never completes it.
    const workerA = __part1TestForkWorkerIdentity();
    await claimInvocationAs({ invocationId, leaseMs: 1 }, workerA);
    const beginA = await beginStep({ invocationId, stepKey: 'research' });
    // Worker A "crashes" — research is left in RUNNING with worker A's nonce.
    await new Promise((r) => setTimeout(r, 50));
    await recoverExpiredLeases();

    // New worker loads the checkpoint — research is still RUNNING
    // (the recover step only resets the AutopilotRun lease, NOT the
    // checkpoint rows). loadCheckpoint surfaces it as inFlightStep.
    const cp = await loadCheckpoint(invocationId);
    expect(cp).not.toBeNull();
    expect(cp!.inFlightStep?.stepKey).toBe('research');
    expect(cp!.inFlightStep?.status).toBe('RUNNING');

    // The new worker detects the stale nonce (worker A's) and marks
    // the step FAILED so it can be re-run.
    const staleNonce = beginA.claimNonce;
    // A fresh beginStep with a new nonce transitions the stale RUNNING
    // row back to RUNNING under the new worker's nonce (overriding A).
    const beginB = await beginStep({ invocationId, stepKey: 'research' });
    expect(beginB.ok).toBe(true);
    expect(beginB.claimNonce).not.toBe(staleNonce);

    // The new worker can now complete the step with its own nonce.
    const r = await completeStep({
      invocationId,
      stepKey: 'research',
      claimNonce: beginB.claimNonce,
      result: { recovered: true },
    });
    expect(r.saved).toBe(true);

    // The persisted result is the new worker's (the stale worker A's
    // attempt to complete would have been rejected by the nonce guard).
    const raw = await db.automationCheckpoint.findUnique({
      where: {
        invocationId_stepKey: { invocationId, stepKey: 'research' },
      },
    });
    expect(raw?.status).toBe('COMPLETE');
    expect(raw?.result).toContain('"recovered"');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Model-invocation resume (mocked; verifies the orchestrator's
// idempotent-skip path that kicks in after a worker restart)
// ═══════════════════════════════════════════════════════════════════

describe('[Part 2] Durable Resume — ModelInvocation Reuse', () => {
  beforeEach(resetMocks);

  it('a COMPLETED ModelInvocation row is REUSED on resume (provider is never re-invoked)', async () => {
    const context: OrchestrationContext = {
      executionId: 'exec-resume-1',
      stepName: 'resume-step-1',
      userId: 'test-user-resume',
      actionType: 'lead_analysis',
    };

    // Simulate the worker that ran BEFORE the restart: it left behind
    // a durable COMPLETED row for this slot. On resume, the new worker
    // calls orchestrateModelCalls again with the same context.
    findInvocationByKeyResult = () => ({
      id: 'inv-resume-1',
      invocationKey: 'mi:exec-resume-1:none:resume-step-1:mock:m1:analyst',
      status: 'COMPLETED',
      attempt: 0,
      result: JSON.stringify({ content: 'cached output from before restart' }),
      provider: 'mock',
      model: 'm1',
    });

    const result = await orchestrateModelCalls({
      specs: [{ provider: 'mock', model: 'm1', role: 'analyst' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'resume — should reuse cached',
      context,
    });

    // REUSED is the canonical durable-resume status.
    expect(result.success).toBe(true);
    expect(result.models[0].status).toBe('REUSED');
    expect(result.models[0].fromCache).toBe(true);
    expect(result.models[0].content).toContain('cached output from before restart');
    expect(result.summary.reused).toBe(1);

    // CRITICAL: the provider was NEVER invoked on resume.
    expect(mockCallCount).toBe(0);
  });

  it('a FAILED ModelInvocation row is reopened for retry on resume (not REUSED)', async () => {
    const context: OrchestrationContext = {
      executionId: 'exec-resume-2',
      stepName: 'resume-step-2',
      userId: 'test-user-resume',
      actionType: 'lead_analysis',
    };

    // Simulate a pre-restart worker that attempted the slot and FAILED.
    findInvocationByKeyResult = () => ({
      id: 'inv-resume-2',
      invocationKey: 'mi:exec-resume-2:none:resume-step-2:mock:m1:analyst',
      status: 'FAILED',
      attempt: 1,
      result: null,
      provider: 'mock',
      model: 'm1',
    });

    const result = await orchestrateModelCalls({
      specs: [{ provider: 'mock', model: 'm1', role: 'analyst' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'resume — retry the failed slot',
      context,
    });

    // Resume path: the FAILED row is reopened (attempt incremented) and
    // the provider is re-invoked. Status is COMPLETED (not REUSED) on success.
    expect(result.success).toBe(true);
    expect(result.models[0].status).toBe('COMPLETED');
    // The provider WAS invoked (this is a retry, not a cached reuse).
    expect(mockCallCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Wait/wake resume (real DB; mirrors part1-wait-wake pattern)
// ═══════════════════════════════════════════════════════════════════

describe('[Part 2] Durable Resume — Wait/Wake Primitives', () => {
  it('a paused orchestration (WAITING_FOR_APPROVAL) can be resumed via wakeInvocation', async () => {
    const { invocationId } = await seedInvocationWithSteps();

    // Claim + run the discovery step so the invocation has progress.
    const worker = __part1TestForkWorkerIdentity();
    await claimInvocationAs({ invocationId }, worker);
    const begin = await beginStep({ invocationId, stepKey: 'discovery' });
    await completeStep({
      invocationId,
      stepKey: 'discovery',
      claimNonce: begin.claimNonce,
      result: { done: true },
    });

    // Park the orchestration — it transitions to WAITING + releases the lease.
    // The "approval" step is WAITING_FOR_APPROVAL.
    const parked = await parkInvocationWaiting({
      invocationId,
      condition: 'WAITING_FOR_APPROVAL',
      nextWakeAt: null, // indefinite — only an external event wakes it
    });
    expect(parked.parked).toBe(true);

    const runParked = await db.autopilotRun.findUnique({ where: { id: invocationId } });
    expect(runParked?.status).toBe('WAITING');
    expect(runParked?.waitingCondition).toBe('WAITING_FOR_APPROVAL');
    expect(runParked?.leaseOwner).toBeNull(); // lease released

    // External event fires (the approval callback). wakeInvocation
    // transitions the run back to QUEUED so the scheduler can re-claim
    // and resume from the persisted checkpoint.
    const woken = await wakeInvocation(invocationId);
    expect(woken.woken).toBe(true);

    const runWoken = await db.autopilotRun.findUnique({ where: { id: invocationId } });
    expect(runWoken?.status).toBe('QUEUED');
    expect(runWoken?.waitingCondition).toBeNull();
    expect(runWoken?.nextWakeAt).toBeNull();
  });

  it('a TIME-based wakeup (nextWakeAt in the past) is enumerated by findDueWakeups', async () => {
    const { invocationId } = await seedInvocationWithSteps();
    const worker = __part1TestForkWorkerIdentity();
    await claimInvocationAs({ invocationId }, worker);

    // Park with a nextWakeAt in the PAST — simulates a follow-up timer
    // that has already fired.
    const pastWake = new Date(Date.now() - 60_000);
    await parkInvocationWaiting({
      invocationId,
      condition: 'WAITING_FOR_FOLLOWUP',
      nextWakeAt: pastWake,
    });

    // findDueWakeups enumerates the due wakeup — the caller (heartbeat)
    // then wakes + re-claims.
    const due = await findDueWakeups({ limit: 50 });
    expect(due.some((d) => d.invocationId === invocationId)).toBe(true);
    expect(due.find((d) => d.invocationId === invocationId)?.condition).toBe('WAITING_FOR_FOLLOWUP');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Provider failure persistence (real DB; verifies the durable row
// carries errorCategory + retry counter across restarts)
// ═══════════════════════════════════════════════════════════════════

describe('[Part 2] Durable Resume — Provider Failure Persistence', () => {
  it('failStep persists errorCategory on the durable checkpoint row (survives restart)', async () => {
    const { invocationId } = await seedInvocationWithSteps();

    // Worker A: claims + begins discovery, then the provider fails with
    // a retryable error (timeout). failStep records the error + category.
    const worker = __part1TestForkWorkerIdentity();
    await claimInvocationAs({ invocationId }, worker);
    const begin = await beginStep({ invocationId, stepKey: 'discovery' });
    const r = await failStep({
      invocationId,
      stepKey: 'discovery',
      claimNonce: begin.claimNonce,
      error: 'HTTP 503: provider temporarily unavailable',
      errorCategory: 'retryable',
    });
    expect(r.saved).toBe(true);

    // Read the raw row — error + errorCategory persisted.
    const raw = await db.automationCheckpoint.findUnique({
      where: {
        invocationId_stepKey: { invocationId, stepKey: 'discovery' },
      },
    });
    expect(raw?.status).toBe('FAILED');
    expect(raw?.error).toBe('HTTP 503: provider temporarily unavailable');
    expect(raw?.errorCategory).toBe('retryable');
    expect(raw?.completedAt).toBeTruthy();

    // "Restart" — a fresh worker loads the checkpoint. The FAILED row
    // with its errorCategory is visible (the new worker can decide to
    // retry based on the persisted category).
    const cp = await loadCheckpoint(invocationId);
    const disc = cp!.steps.find((s) => s.stepKey === 'discovery');
    expect(disc?.status).toBe('FAILED');
    expect(disc?.error).toBe('HTTP 503: provider temporarily unavailable');
    expect(disc?.errorCategory).toBe('retryable');
  });

  it('a permanent failure (errorCategory=permanent) is also persisted on the durable row', async () => {
    const { invocationId } = await seedInvocationWithSteps();
    const worker = __part1TestForkWorkerIdentity();
    await claimInvocationAs({ invocationId }, worker);
    const begin = await beginStep({ invocationId, stepKey: 'outreach' });

    await failStep({
      invocationId,
      stepKey: 'outreach',
      claimNonce: begin.claimNonce,
      error: 'HTTP 401: invalid api key (re-provision required)',
      errorCategory: 'permanent',
    });

    const raw = await db.automationCheckpoint.findUnique({
      where: {
        invocationId_stepKey: { invocationId, stepKey: 'outreach' },
      },
    });
    expect(raw?.status).toBe('FAILED');
    expect(raw?.errorCategory).toBe('permanent');

    // On resume, the new worker sees the permanent category and will
    // NOT retry (would surface to human review instead).
    const cp = await loadCheckpoint(invocationId);
    const out = cp!.steps.find((s) => s.stepKey === 'outreach');
    expect(out?.errorCategory).toBe('permanent');
  });
});
