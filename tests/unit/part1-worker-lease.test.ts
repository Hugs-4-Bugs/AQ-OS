// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 1 — Worker Claim / Lease / Restart Recovery
//
// Verifies the atomic-claim + lease-expiry + safe-recovery invariants:
//
//   1. claimInvocation is atomic — two racing workers can't both win.
//   2. The winner sets leaseOwner + leaseExpiresAt; the loser sees
//      conflictReason='lease_held'.
//   3. recoverExpiredLeases reclaims rows whose leaseExpiresAt has
//      passed → status transitions RUNNING → QUEUED.
//   4. After lease recovery, a different worker can re-claim and
//      resume from the persisted checkpoint (no duplicate work).
//   5. leaseOwner survives across JS scope (persisted in DB).
//   6. releaseLease clears the lease on completion.
//
// These are the safety invariants that allow the system to survive
// worker crashes, server restarts, and race conditions without
// duplicating business actions.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setupPart1Context,
  teardownPart1Context,
  createTestAutomation,
  type Part1TestContext,
} from '../helpers/part1-test-utils';
import { createAutomation } from '@/lib/autopilot/automation-service';
import { createOrFetchInvocation, transitionInvocation } from '@/lib/autopilot/invocation-service';
import {
  claimInvocation,
  claimInvocationAs,
  renewLease,
  releaseLease,
  recoverExpiredLeases,
  verifyLease,
  __part1TestForkWorkerIdentity,
} from '@/lib/autopilot/worker-lease';
import { initializeCheckpoint, beginStep, completeStep } from '@/lib/autopilot/checkpoint-service';
import { db } from '@/lib/db';

let ctx: Part1TestContext;

beforeEach(async () => {
  ctx = await setupPart1Context({ userCount: 1 });
});

afterEach(async () => {
  await teardownPart1Context(ctx);
});

async function seedInvocation(
  userId: string,
  trigger: 'manual' | 'schedule' | 'event' = 'manual',
): Promise<{ invocationId: string; automationId: string }> {
  const { workflowId } = await createTestAutomation({ ctx, userId });
  const automation = await createAutomation({
    userId,
    name: `${ctx.runPrefix}-ap`,
    workflowId,
    status: 'ACTIVE',
  });
  ctx.automationIds.push(automation.id);
  const input =
    trigger === 'schedule'
      ? { triggerType: 'schedule' as const, slotEpochMs: Date.now() }
      : trigger === 'event'
        ? { triggerType: 'event' as const, triggerEventId: `evt-${Date.now()}` }
        : { triggerType: 'manual' as const };
  const { record } = await createOrFetchInvocation({
    automationId: automation.id,
    userId,
    ...input,
  });
  ctx.invocationIds.push(record.id);
  return { invocationId: record.id, automationId: automation.id };
}

describe('[Part 1] Worker lease — atomic claim', () => {
  it('claims a QUEUED invocation and sets leaseOwner + leaseExpiresAt', async () => {
    const { invocationId } = await seedInvocation(ctx.userIds[0]);
    const result = await claimInvocation({ invocationId, leaseMs: 60_000 });
    expect(result.claimed).toBe(true);
    expect(result.leaseOwner).toBeTruthy();
    expect(result.leaseExpiresAt).toBeTruthy();
    expect(result.leaseExpiresAt!.getTime()).toBeGreaterThan(Date.now());

    // Persisted to DB.
    const raw = await db.autopilotRun.findUnique({ where: { id: invocationId } });
    expect(raw?.status).toBe('RUNNING');
    expect(raw?.leaseOwner).toBe(result.leaseOwner);
    expect(raw?.leaseExpiresAt).toBeTruthy();
  });

  it('two racing workers — only one wins, the other sees lease_held', async () => {
    const { invocationId } = await seedInvocation(ctx.userIds[0]);
    const workerA = __part1TestForkWorkerIdentity();
    const workerB = __part1TestForkWorkerIdentity();
    expect(workerA.workerId).not.toBe(workerB.workerId);

    const claimA = await claimInvocationAs({ invocationId }, workerA);
    const claimB = await claimInvocationAs({ invocationId }, workerB);

    expect(claimA.claimed || claimB.claimed).toBe(true);
    expect(claimA.claimed && claimB.claimed).toBe(false); // not both
    const winner = claimA.claimed ? claimA : claimB;
    const loser = claimA.claimed ? claimB : claimA;
    expect(winner.leaseOwner).toBe(winner.workerId ?? workerA.workerId);
    expect(loser.claimed).toBe(false);
    expect(loser.conflictReason).toBe('lease_held');
  });

  it('re-claim by the same worker is idempotent (renewal)', async () => {
    const { invocationId } = await seedInvocation(ctx.userIds[0]);
    const w = __part1TestForkWorkerIdentity();
    const c1 = await claimInvocationAs({ invocationId, leaseMs: 1000 }, w);
    expect(c1.claimed).toBe(true);

    // Same worker claims again — should be treated as renewal.
    const c2 = await claimInvocationAs({ invocationId, leaseMs: 1000 }, w);
    expect(c2.claimed).toBe(true);
  });

  it('lease renewal extends the lease window', async () => {
    const { invocationId } = await seedInvocation(ctx.userIds[0]);
    const c1 = await claimInvocation({ invocationId, leaseMs: 1000 });
    expect(c1.claimed).toBe(true);
    const originalExpiry = c1.leaseExpiresAt!;

    // Wait briefly so the new expiry is strictly later.
    await new Promise((r) => setTimeout(r, 50));
    const c2 = await renewLease({ invocationId, leaseMs: 10_000 });
    expect(c2.claimed).toBe(true);
    expect(c2.leaseExpiresAt!.getTime()).toBeGreaterThan(originalExpiry.getTime());
  });

  it('verifyLease returns true for current owner, false otherwise', async () => {
    const { invocationId } = await seedInvocation(ctx.userIds[0]);
    const c = await claimInvocation({ invocationId });
    expect(c.claimed).toBe(true);
    expect(await verifyLease(invocationId)).toBe(true);

    // After release, verifyLease is false.
    await releaseLease(invocationId, 'COMPLETED');
    expect(await verifyLease(invocationId)).toBe(false);
  });
});

describe('[Part 1] Worker lease — releaseLease on terminal states', () => {
  it('releases the lease and marks invocation COMPLETED', async () => {
    const { invocationId } = await seedInvocation(ctx.userIds[0]);
    await claimInvocation({ invocationId });
    const r = await releaseLease(invocationId, 'COMPLETED');
    expect(r.released).toBe(true);

    const raw = await db.autopilotRun.findUnique({ where: { id: invocationId } });
    expect(raw?.status).toBe('COMPLETED');
    expect(raw?.leaseOwner).toBeNull();
    expect(raw?.leaseExpiresAt).toBeNull();
    expect(raw?.completedAt).toBeTruthy();
  });

  it('releases to WAITING — lease cleared, status=WAITING', async () => {
    const { invocationId } = await seedInvocation(ctx.userIds[0]);
    await claimInvocation({ invocationId });
    const r = await releaseLease(invocationId, 'WAITING', {
      waitingCondition: 'WAITING_FOR_EMAIL',
    });
    expect(r.released).toBe(true);
    const raw = await db.autopilotRun.findUnique({ where: { id: invocationId } });
    expect(raw?.status).toBe('WAITING');
    expect(raw?.leaseOwner).toBeNull();
    expect(raw?.waitingCondition).toBe('WAITING_FOR_EMAIL');
  });

  it('release by a different worker (stale) does not modify the row', async () => {
    const { invocationId } = await seedInvocation(ctx.userIds[0]);
    const w = __part1TestForkWorkerIdentity();
    await claimInvocationAs({ invocationId }, w);

    // Another worker (not the lease owner) tries to release — should no-op.
    const r = await releaseLease(invocationId, 'COMPLETED');
    expect(r.released).toBe(false);
    const raw = await db.autopilotRun.findUnique({ where: { id: invocationId } });
    expect(raw?.status).toBe('RUNNING'); // unchanged
  });
});

describe('[Part 1] Worker lease — recoverExpiredLeases (safe recovery)', () => {
  it('finds RUNNING invocations with expired leases and resets them to QUEUED', async () => {
    const { invocationId } = await seedInvocation(ctx.userIds[0]);
    await claimInvocation({ invocationId, leaseMs: 1 }); // expires immediately

    // Wait for the lease to expire.
    await new Promise((r) => setTimeout(r, 50));

    const result = await recoverExpiredLeases();
    expect(result.scanned).toBeGreaterThanOrEqual(1);
    expect(result.recovered).toBeGreaterThanOrEqual(1);
    expect(result.recoveredIds).toContain(invocationId);

    const raw = await db.autopilotRun.findUnique({ where: { id: invocationId } });
    expect(raw?.status).toBe('QUEUED');
    expect(raw?.leaseOwner).toBeNull();
    expect(raw?.leaseExpiresAt).toBeNull();
  });

  it('does not reclaim leases that are still live', async () => {
    const { invocationId } = await seedInvocation(ctx.userIds[0]);
    await claimInvocation({ invocationId, leaseMs: 60_000 }); // long lease

    const result = await recoverExpiredLeases();
    expect(result.recoveredIds).not.toContain(invocationId);

    const raw = await db.autopilotRun.findUnique({ where: { id: invocationId } });
    expect(raw?.status).toBe('RUNNING'); // untouched
  });

  it('does not reclaim invocations in terminal state', async () => {
    const { invocationId } = await seedInvocation(ctx.userIds[0]);
    await claimInvocation({ invocationId, leaseMs: 1 });
    await releaseLease(invocationId, 'COMPLETED');

    // Even though leaseExpiresAt < now, the status is COMPLETED — should not be reclaimed.
    const result = await recoverExpiredLeases();
    expect(result.recoveredIds).not.toContain(invocationId);
  });
});

describe('[Part 1] Worker lease — restart recovery resume', () => {
  it('after lease expiry + reclaim, the new worker reads the checkpoint and skips completed work', async () => {
    const { invocationId } = await seedInvocation(ctx.userIds[0]);

    // Worker A: claim, initialize checkpoint, complete step 1, "crash"
    // (we simulate crash by simply not releasing the lease).
    const workerA = __part1TestForkWorkerIdentity();
    const claimA = await claimInvocationAs({ invocationId, leaseMs: 1 }, workerA);
    expect(claimA.claimed).toBe(true);

    await initializeCheckpoint({
      invocationId,
      userId: ctx.userIds[0],
      steps: [
        { stepKey: 'discovery', stepName: 'Discovery', sequence: 0 },
        { stepKey: 'qualification', stepName: 'Qualification', sequence: 1 },
        { stepKey: 'outreach', stepName: 'Outreach', sequence: 2 },
      ],
    });
    const begin = await beginStep({ invocationId, stepKey: 'discovery' });
    await completeStep({
      invocationId,
      stepKey: 'discovery',
      claimNonce: begin.claimNonce,
      result: { leadIds: ['l1', 'l2'] },
    });

    // Wait for lease to expire.
    await new Promise((r) => setTimeout(r, 50));

    // Recovery sweep reclaims the invocation.
    await recoverExpiredLeases();
    const afterRecover = await db.autopilotRun.findUnique({ where: { id: invocationId } });
    expect(afterRecover?.status).toBe('QUEUED');
    expect(afterRecover?.leaseOwner).toBeNull();

    // Worker B now claims and reads the checkpoint.
    const workerB = __part1TestForkWorkerIdentity();
    const claimB = await claimInvocationAs({ invocationId }, workerB);
    expect(claimB.claimed).toBe(true);

    // Load checkpoint — discovery must be COMPLETE, qualification PENDING.
    const { loadCheckpoint } = await import('@/lib/autopilot/checkpoint-service');
    const cp = await loadCheckpoint(invocationId);
    expect(cp).not.toBeNull();
    const discoveryStep = cp!.steps.find((s) => s.stepKey === 'discovery');
    const qualificationStep = cp!.steps.find((s) => s.stepKey === 'qualification');
    expect(discoveryStep?.status).toBe('COMPLETE');
    expect(discoveryStep?.result).toMatchObject({ leadIds: ['l1', 'l2'] });
    expect(qualificationStep?.status).toBe('PENDING');

    // Worker B should NOT re-run discovery — call beginStep on discovery
    // and it should return alreadyComplete=true (so the worker reads
    // the cached result instead of re-executing).
    const probe = await beginStep({ invocationId, stepKey: 'discovery' });
    expect(probe.alreadyComplete).toBe(true);
  });
});

describe('[Part 1] Worker lease — process-local isolation', () => {
  it('two workers in the same process get distinct workerIds via __part1TestForkWorkerIdentity', () => {
    const a = __part1TestForkWorkerIdentity();
    const b = __part1TestForkWorkerIdentity();
    expect(a.workerId).not.toBe(b.workerId);
  });
});
