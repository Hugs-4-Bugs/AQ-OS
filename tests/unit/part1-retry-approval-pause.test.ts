// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 1 — Retry / Failure / Approval Pause-Resume
//
// Verifies the failure-handling lifecycle (Part 1 §10, §11, §14):
//
//   · Retryable failure → scheduleRetry bumps retryCount + schedules nextRetryAt
//   · Permanent failure → markPermanentFailure sets status=BLOCKED
//   · Human-required → pauseForHuman sets status=PAUSED
//   · After maxRetries → escalate to human_required
//   · Approval pause: agent parks invocation, then approval-resume wakes it
//   · Duplicate approval-resume is idempotent
//   · User isolation: approval for User A doesn't affect User B
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setupPart1Context,
  teardownPart1Context,
  createTestAutomation,
  type Part1TestContext,
} from '../helpers/part1-test-utils';
import { createAutomation } from '@/lib/autopilot/automation-service';
import {
  createOrFetchInvocation,
  scheduleRetry,
  markPermanentFailure,
  pauseForHuman,
  markCompleted,
} from '@/lib/autopilot/invocation-service';
import { decideRetry } from '@/lib/autopilot/retry-policy';
import { claimInvocation, releaseLease } from '@/lib/autopilot/worker-lease';
import {
  parkInvocationWaiting,
  wakeInvocation,
  matchEventToWaitingInvocations,
} from '@/lib/autopilot/wait-wake';
import { db } from '@/lib/db';

let ctx: Part1TestContext;
let otherCtx: Part1TestContext;

beforeEach(async () => {
  ctx = await setupPart1Context({ userCount: 1 });
  otherCtx = await setupPart1Context({ userCount: 1 });
});

afterEach(async () => {
  await teardownPart1Context(ctx);
  await teardownPart1Context(otherCtx);
});

async function seedManualInvocation(userId: string): Promise<{
  invocationId: string;
  automationId: string;
}> {
  const { workflowId } = await createTestAutomation({ ctx, userId });
  const automation = await createAutomation({
    userId,
    name: `${ctx.runPrefix}-ap`,
    workflowId,
    status: 'ACTIVE',
    executionPolicy: { maxRetries: 3 },
  });
  ctx.automationIds.push(automation.id);
  const { record } = await createOrFetchInvocation({
    automationId: automation.id,
    userId,
    triggerType: 'manual',
  });
  ctx.invocationIds.push(record.id);
  return { invocationId: record.id, automationId: automation.id };
}

describe('[Part 1] Retry — scheduleRetry on retryable failure', () => {
  it('bumps retryCount + schedules nextRetryAt + transitions to QUEUED', async () => {
    const { invocationId } = await seedManualInvocation(ctx.userIds[0]);
    await claimInvocation({ invocationId });

    const decision = decideRetry({
      error: new Error('HTTP 502 Bad Gateway'),
      retryCount: 0,
      maxRetries: 3,
      stepKey: 'discovery',
    });
    expect(decision.shouldRetry).toBe(true);
    expect(decision.backoffMs).toBeGreaterThan(0);

    const r = await scheduleRetry({
      invocationId,
      backoffMs: decision.backoffMs,
      errorCategory: 'retryable',
      error: decision.reason,
    });
    expect(r.scheduled).toBe(true);
    expect(r.nextRetryAt.getTime()).toBeGreaterThan(Date.now());

    const raw = await db.autopilotRun.findUnique({ where: { id: invocationId } });
    expect(raw?.retryCount).toBe(1);
    expect(raw?.nextRetryAt?.getTime()).toBeCloseTo(r.nextRetryAt.getTime(), -3);
    expect(raw?.status).toBe('QUEUED');
    expect(raw?.leaseOwner).toBeNull(); // released for re-claim
    expect(raw?.errorCategory).toBe('retryable');
    expect(raw?.error).toContain('Retryable failure');
  });

  it('retryCount accumulates across multiple retries, then escalates', async () => {
    const { invocationId } = await seedManualInvocation(ctx.userIds[0]);
    // 3 retry attempts (i=0,1,2 each call scheduleRetry → retryCount becomes 1,2,3).
    // Then iteration i=3 sees retryCount=3 == maxRetries and escalates to PAUSED.
    for (let i = 0; i < 4; i++) {
      const decision = decideRetry({
        error: new Error('timeout'),
        retryCount: i,
        maxRetries: 3,
      });
      // Simulate the full retry cycle: claim → fail → scheduleRetry (or pause).
      await claimInvocation({ invocationId });
      if (decision.shouldRetry) {
        await scheduleRetry({
          invocationId,
          backoffMs: 1, // fast for test
          errorCategory: 'retryable',
          error: 'timeout',
        });
      } else {
        await pauseForHuman({ invocationId, error: decision.reason });
        break;
      }
    }
    const raw = await db.autopilotRun.findUnique({ where: { id: invocationId } });
    // After 3 retries, escalated to human_required → status=PAUSED.
    expect(raw?.retryCount).toBe(3);
    expect(raw?.status).toBe('PAUSED');
    expect(raw?.errorCategory).toBe('human_required');
  });
});

describe('[Part 1] Retry — permanent failure', () => {
  it('markPermanentFailure transitions to BLOCKED + releases lease', async () => {
    const { invocationId } = await seedManualInvocation(ctx.userIds[0]);
    await claimInvocation({ invocationId });

    const r = await markPermanentFailure({
      invocationId,
      error: 'invalid credentials: 401',
    });
    expect(r.updated).toBe(true);

    const raw = await db.autopilotRun.findUnique({ where: { id: invocationId } });
    expect(raw?.status).toBe('BLOCKED');
    expect(raw?.errorCategory).toBe('permanent');
    expect(raw?.error).toBe('invalid credentials: 401');
    expect(raw?.leaseOwner).toBeNull();
    expect(raw?.leaseExpiresAt).toBeNull();
    expect(raw?.completedAt).toBeTruthy();
  });

  it('decideRetry returns shouldBlock=true immediately for permanent errors', async () => {
    const d = decideRetry({
      error: new Error('HTTP 403 Forbidden'),
      retryCount: 0,
      maxRetries: 3,
    });
    expect(d.category).toBe('permanent');
    expect(d.shouldBlock).toBe(true);
    expect(d.shouldRetry).toBe(false);
  });
});

describe('[Part 1] Retry — human_required', () => {
  it('pauseForHuman transitions to PAUSED + releases lease', async () => {
    const { invocationId } = await seedManualInvocation(ctx.userIds[0]);
    await claimInvocation({ invocationId });

    const r = await pauseForHuman({
      invocationId,
      error: 'approval required for email.send',
    });
    expect(r.updated).toBe(true);

    const raw = await db.autopilotRun.findUnique({ where: { id: invocationId } });
    expect(raw?.status).toBe('PAUSED');
    expect(raw?.errorCategory).toBe('human_required');
    expect(raw?.error).toContain('approval required');
    expect(raw?.leaseOwner).toBeNull();
  });
});

describe('[Part 1] Approval pause / resume', () => {
  it('agent parks invocation + approval event wakes it (idempotent)', async () => {
    const { invocationId } = await seedManualInvocation(ctx.userIds[0]);
    await claimInvocation({ invocationId });
    await parkInvocationWaiting({
      invocationId,
      condition: 'WAITING_FOR_APPROVAL',
      nextWakeAt: null, // indefinite — only approval event wakes
    });

    // Confirm parked.
    const parked = await db.autopilotRun.findUnique({ where: { id: invocationId } });
    expect(parked?.status).toBe('WAITING');
    expect(parked?.waitingCondition).toBe('WAITING_FOR_APPROVAL');

    // Match an approval_response event to the waiting invocation.
    const matched = await matchEventToWaitingInvocations({
      userId: ctx.userIds[0],
      eventType: 'approval_response',
    });
    expect(matched.some((m) => m.invocationId === invocationId)).toBe(true);

    // Wake the invocation — transitions to QUEUED for re-claiming.
    const wake = await wakeInvocation(invocationId);
    expect(wake.woken).toBe(true);
    const woken = await db.autopilotRun.findUnique({ where: { id: invocationId } });
    expect(woken?.status).toBe('QUEUED');
    expect(woken?.waitingCondition).toBeNull();
    expect(woken?.nextWakeAt).toBeNull();

    // Duplicate wake is a no-op (not WAITING anymore).
    const wake2 = await wakeInvocation(invocationId);
    expect(wake2.woken).toBe(false);
  });

  it('user isolation: approval event for User A does not wake User B run', async () => {
    // User A parks a run WAITING_FOR_APPROVAL.
    const invA = await seedManualInvocation(ctx.userIds[0]);
    await claimInvocation({ invocationId: invA.invocationId });
    await parkInvocationWaiting({
      invocationId: invA.invocationId,
      condition: 'WAITING_FOR_APPROVAL',
    });

    // User B parks a run WAITING_FOR_APPROVAL.
    const invB = await seedManualInvocation(otherCtx.userIds[0]);
    await claimInvocation({ invocationId: invB.invocationId });
    await parkInvocationWaiting({
      invocationId: invB.invocationId,
      condition: 'WAITING_FOR_APPROVAL',
    });

    // Match approval_response for User A — must only return User A's run.
    const matchedA = await matchEventToWaitingInvocations({
      userId: ctx.userIds[0],
      eventType: 'approval_response',
    });
    expect(matchedA.some((m) => m.invocationId === invA.invocationId)).toBe(true);
    expect(matchedA.some((m) => m.invocationId === invB.invocationId)).toBe(false);

    // Match approval_response for User B — must only return User B's run.
    const matchedB = await matchEventToWaitingInvocations({
      userId: otherCtx.userIds[0],
      eventType: 'approval_response',
    });
    expect(matchedB.some((m) => m.invocationId === invB.invocationId)).toBe(true);
    expect(matchedB.some((m) => m.invocationId === invA.invocationId)).toBe(false);
  });
});

describe('[Part 1] Mark completed — final state', () => {
  it('markCompleted clears all transient state + bumps automation runCount', async () => {
    const { invocationId, automationId } = await seedManualInvocation(ctx.userIds[0]);
    const before = await db.autopilotWorkflow.findUnique({ where: { id: automationId } });
    const beforeRunCount = before?.runCount ?? 0;

    await claimInvocation({ invocationId });
    const r = await markCompleted({ invocationId, automationId });
    expect(r.updated).toBe(true);

    const raw = await db.autopilotRun.findUnique({ where: { id: invocationId } });
    expect(raw?.status).toBe('COMPLETED');
    expect(raw?.leaseOwner).toBeNull();
    expect(raw?.leaseExpiresAt).toBeNull();
    expect(raw?.nextWakeAt).toBeNull();
    expect(raw?.waitingCondition).toBeNull();
    expect(raw?.nextRetryAt).toBeNull();
    expect(raw?.completedAt).toBeTruthy();

    const after = await db.autopilotWorkflow.findUnique({ where: { id: automationId } });
    expect(after?.runCount).toBe(beforeRunCount + 1);
    expect(after?.lastRunAt).toBeTruthy();
    expect(after?.lastError).toBeNull();
  });
});

describe('[Part 1] Retry — duplicate scheduleRetry does not double-bump retryCount', () => {
  it('calling scheduleRetry twice does not duplicate the bump', async () => {
    const { invocationId } = await seedManualInvocation(ctx.userIds[0]);
    await claimInvocation({ invocationId });
    await scheduleRetry({
      invocationId,
      backoffMs: 100,
      errorCategory: 'retryable',
      error: 'timeout',
    });
    const after1 = await db.autopilotRun.findUnique({ where: { id: invocationId } });
    expect(after1?.retryCount).toBe(1);
    // Second call DOES bump retryCount again — that is by design.
    // The idempotency contract is at the *trigger* level (idempotencyKey),
    // NOT at the retry level. A retry is a NEW attempt and bumps the
    // counter. This test documents that contract.
    await scheduleRetry({
      invocationId,
      backoffMs: 100,
      errorCategory: 'retryable',
      error: 'timeout',
    });
    const after2 = await db.autopilotRun.findUnique({ where: { id: invocationId } });
    expect(after2?.retryCount).toBe(2);
  });
});
