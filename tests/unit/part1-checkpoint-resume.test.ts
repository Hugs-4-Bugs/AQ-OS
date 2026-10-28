// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 1 — Checkpoint Persistence + Resume
//
// Verifies:
//   · initializeCheckpoint is idempotent (re-runs converge on existing rows)
//   · beginStep transitions PENDING → RUNNING and sets claimNonce
//   · completeStep transitions RUNNING → COMPLETE and persists result
//   · completeStep is idempotent (re-complete with same nonce = no-op)
//   · completeStep is rejected for stale nonces (post-lease-reclaim)
//   · loadCheckpoint returns the full graph + pendingStep pointer
//   · alreadyComplete=true when calling beginStep on a COMPLETE step
//     (so the worker can read the cached result instead of re-running)
//   · resume skips completed work and continues at the next pending step
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  parkStepWaiting,
  loadCheckpoint,
  snapshotInvocationCheckpoint,
} from '@/lib/autopilot/checkpoint-service';
import { claimInvocation, releaseLease, recoverExpiredLeases, __part1TestForkWorkerIdentity, claimInvocationAs } from '@/lib/autopilot/worker-lease';
import { db } from '@/lib/db';

let ctx: Part1TestContext;

beforeEach(async () => {
  ctx = await setupPart1Context({ userCount: 1 });
});

afterEach(async () => {
  await teardownPart1Context(ctx);
});

async function seedInvocationWithSteps(): Promise<{
  invocationId: string;
  steps: Array<{ stepKey: string; stepName: string; sequence: number }>;
}> {
  const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
  const automation = await createAutomation({
    userId: ctx.userIds[0],
    name: `${ctx.runPrefix}-ap`,
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
  const steps = [
    { stepKey: 'discovery', stepName: 'Lead discovery', sequence: 0 },
    { stepKey: 'research', stepName: 'Lead research', sequence: 1 },
    { stepKey: 'qualification', stepName: 'Qualification', sequence: 2 },
    { stepKey: 'outreach', stepName: 'Outreach', sequence: 3 },
  ];
  await initializeCheckpoint({
    invocationId: record.id,
    userId: ctx.userIds[0],
    steps,
  });
  return { invocationId: record.id, steps };
}

describe('[Part 1] Checkpoint — initializeCheckpoint idempotency', () => {
  it('creates one row per (invocationId, stepKey)', async () => {
    const { invocationId, steps } = await seedInvocationWithSteps();
    // Count = 4 after first init.
    const first = await db.automationCheckpoint.count({ where: { invocationId } });
    expect(first).toBe(steps.length);

    // Re-initialise — count must not double.
    const secondInit = await initializeCheckpoint({
      invocationId,
      userId: ctx.userIds[0],
      steps,
    });
    const second = await db.automationCheckpoint.count({ where: { invocationId } });
    expect(second).toBe(steps.length);
    expect(secondInit.created + secondInit.reused).toBe(steps.length);
  });

  it('preserves existing step status across re-init', async () => {
    const { invocationId } = await seedInvocationWithSteps();
    const begin = await beginStep({ invocationId, stepKey: 'discovery' });
    await completeStep({
      invocationId,
      stepKey: 'discovery',
      claimNonce: begin.claimNonce,
      result: { count: 5 },
    });

    // Re-init — discovery should still be COMPLETE.
    await initializeCheckpoint({
      invocationId,
      userId: ctx.userIds[0],
      steps: [
        { stepKey: 'discovery', stepName: 'Discovery', sequence: 0 },
        { stepKey: 'research', stepName: 'Research', sequence: 1 },
      ],
    });
    const cp = await loadCheckpoint(invocationId);
    const disc = cp!.steps.find((s) => s.stepKey === 'discovery');
    expect(disc?.status).toBe('COMPLETE');
    expect(disc?.result).toMatchObject({ count: 5 });
  });
});

describe('[Part 1] Checkpoint — beginStep / completeStep lifecycle', () => {
  it('beginStep transitions PENDING → RUNNING + sets claimNonce', async () => {
    const { invocationId } = await seedInvocationWithSteps();
    const begin = await beginStep({ invocationId, stepKey: 'discovery' });
    expect(begin.ok).toBe(true);
    expect(begin.alreadyComplete).toBe(false);
    expect(begin.claimNonce).toBeTruthy();

    const raw = await db.automationCheckpoint.findUnique({
      where: {
        invocationId_stepKey: { invocationId, stepKey: 'discovery' },
      },
    });
    expect(raw?.status).toBe('RUNNING');
    expect(raw?.claimNonce).toBe(begin.claimNonce);
    expect(raw?.startedAt).toBeTruthy();
  });

  it('completeStep persists the result and sets status=COMPLETE', async () => {
    const { invocationId } = await seedInvocationWithSteps();
    const begin = await beginStep({ invocationId, stepKey: 'discovery' });
    const r = await completeStep({
      invocationId,
      stepKey: 'discovery',
      claimNonce: begin.claimNonce,
      result: { leads: ['l1', 'l2'], summary: 'OK' },
      nextAction: 'research',
    });
    expect(r.saved).toBe(true);
    expect(r.stale).toBe(false);

    const raw = await db.automationCheckpoint.findUnique({
      where: {
        invocationId_stepKey: { invocationId, stepKey: 'discovery' },
      },
    });
    expect(raw?.status).toBe('COMPLETE');
    expect(raw?.result).toContain('"leads"');
    expect(raw?.result).toContain('"l1"');
    expect(raw?.nextAction).toBe('research');
    expect(raw?.completedAt).toBeTruthy();
  });

  it('beginStep returns alreadyComplete=true for COMPLETE steps', async () => {
    const { invocationId } = await seedInvocationWithSteps();
    const begin = await beginStep({ invocationId, stepKey: 'discovery' });
    await completeStep({
      invocationId,
      stepKey: 'discovery',
      claimNonce: begin.claimNonce,
      result: { done: true },
    });

    // Subsequent beginStep on the same step — must short-circuit.
    const probe = await beginStep({ invocationId, stepKey: 'discovery' });
    expect(probe.ok).toBe(false);
    expect(probe.alreadyComplete).toBe(true);
  });

  it('completeStep is idempotent — re-complete with same nonce is a no-op', async () => {
    const { invocationId } = await seedInvocationWithSteps();
    const begin = await beginStep({ invocationId, stepKey: 'discovery' });
    await completeStep({
      invocationId,
      stepKey: 'discovery',
      claimNonce: begin.claimNonce,
      result: { first: true },
    });
    const second = await completeStep({
      invocationId,
      stepKey: 'discovery',
      claimNonce: begin.claimNonce,
      result: { second: true },
    });
    expect(second.saved).toBe(true); // saved=true but stale=false → treated as idempotent
    expect(second.stale).toBe(false);

    // The persisted result is the FIRST one (idempotent).
    const raw = await db.automationCheckpoint.findUnique({
      where: {
        invocationId_stepKey: { invocationId, stepKey: 'discovery' },
      },
    });
    expect(raw?.result).toContain('"first"');
    expect(raw?.result).not.toContain('"second"');
  });

  it('completeStep rejects stale nonce (post-lease-reclaim)', async () => {
    const { invocationId } = await seedInvocationWithSteps();
    const workerA = __part1TestForkWorkerIdentity();
    const claimA = await claimInvocationAs({ invocationId, leaseMs: 1 }, workerA);
    expect(claimA.claimed).toBe(true);

    const begin = await beginStep({ invocationId, stepKey: 'discovery' });
    // Crash simulation: do NOT complete; lease expires.
    await new Promise((r) => setTimeout(r, 50));
    await recoverExpiredLeases();

    // Worker B re-claims and re-runs discovery with a new nonce.
    const begin2 = await beginStep({ invocationId, stepKey: 'discovery' });
    // Stale worker A tries to complete with the OLD nonce — should be rejected.
    const staleComplete = await completeStep({
      invocationId,
      stepKey: 'discovery',
      claimNonce: begin.claimNonce, // old nonce
      result: { stale: true },
    });
    expect(staleComplete.saved).toBe(false);
    expect(staleComplete.stale).toBe(true);

    // Worker B's complete with the new nonce succeeds.
    const freshComplete = await completeStep({
      invocationId,
      stepKey: 'discovery',
      claimNonce: begin2.claimNonce,
      result: { fresh: true },
    });
    expect(freshComplete.saved).toBe(true);

    // Persisted result is the fresh one.
    const raw = await db.automationCheckpoint.findUnique({
      where: {
        invocationId_stepKey: { invocationId, stepKey: 'discovery' },
      },
    });
    expect(raw?.result).toContain('"fresh"');
    expect(raw?.result).not.toContain('"stale"');
  });
});

describe('[Part 1] Checkpoint — failStep + parkStepWaiting', () => {
  it('failStep records the error + category', async () => {
    const { invocationId } = await seedInvocationWithSteps();
    const begin = await beginStep({ invocationId, stepKey: 'discovery' });
    const r = await failStep({
      invocationId,
      stepKey: 'discovery',
      claimNonce: begin.claimNonce,
      error: 'HTTP 502 from upstream',
      errorCategory: 'retryable',
    });
    expect(r.saved).toBe(true);
    const raw = await db.automationCheckpoint.findUnique({
      where: {
        invocationId_stepKey: { invocationId, stepKey: 'discovery' },
      },
    });
    expect(raw?.status).toBe('FAILED');
    expect(raw?.error).toBe('HTTP 502 from upstream');
    expect(raw?.errorCategory).toBe('retryable');
  });

  it('parkStepWaiting sets status=WAITING + waitingCondition + nextWakeAt', async () => {
    const { invocationId } = await seedInvocationWithSteps();
    const begin = await beginStep({ invocationId, stepKey: 'outreach' });
    const wake = new Date(Date.now() + 60_000);
    const r = await parkStepWaiting({
      invocationId,
      stepKey: 'outreach',
      claimNonce: begin.claimNonce,
      condition: 'WAITING_FOR_APPROVAL',
      nextWakeAt: wake,
    });
    expect(r.saved).toBe(true);
    const raw = await db.automationCheckpoint.findUnique({
      where: {
        invocationId_stepKey: { invocationId, stepKey: 'outreach' },
      },
    });
    expect(raw?.status).toBe('WAITING');
    expect(raw?.waitingCondition).toBe('WAITING_FOR_APPROVAL');
    expect(raw?.nextWakeAt?.getTime()).toBeCloseTo(wake.getTime(), -3);
  });
});

describe('[Part 1] Checkpoint — loadCheckpoint pointer logic', () => {
  it('returns pendingStep = first non-complete step', async () => {
    const { invocationId } = await seedInvocationWithSteps();
    // Mark discovery + research as complete.
    for (const step of ['discovery', 'research']) {
      const begin = await beginStep({ invocationId, stepKey: step });
      await completeStep({
        invocationId,
        stepKey: step,
        claimNonce: begin.claimNonce,
        result: { done: true },
      });
    }
    const cp = await loadCheckpoint(invocationId);
    expect(cp).not.toBeNull();
    expect(cp!.pendingStep?.stepKey).toBe('qualification');
    expect(cp!.inFlightStep).toBeNull();
  });

  it('returns inFlightStep for a stale RUNNING step', async () => {
    const { invocationId } = await seedInvocationWithSteps();
    // Start discovery (don't complete) — it's now RUNNING.
    await beginStep({ invocationId, stepKey: 'discovery' });
    const cp = await loadCheckpoint(invocationId);
    expect(cp!.inFlightStep?.stepKey).toBe('discovery');
    expect(cp!.inFlightStep?.status).toBe('RUNNING');
  });

  it('returns cursor at highest sequence with non-PENDING status', async () => {
    const { invocationId } = await seedInvocationWithSteps();
    const begin = await beginStep({ invocationId, stepKey: 'research' });
    await completeStep({
      invocationId,
      stepKey: 'research',
      claimNonce: begin.claimNonce,
      result: { done: true },
    });
    const cp = await loadCheckpoint(invocationId);
    expect(cp!.cursor).toBe(1); // research.sequence = 1
  });
});

describe('[Part 1] Checkpoint — snapshotInvocationCheckpoint mirrors onto AutopilotRun', () => {
  it('denormalises completedSteps + pendingStep + currentAction onto the run', async () => {
    const { invocationId } = await seedInvocationWithSteps();
    const begin = await beginStep({ invocationId, stepKey: 'discovery' });
    await completeStep({
      invocationId,
      stepKey: 'discovery',
      claimNonce: begin.claimNonce,
      result: { done: true },
    });
    await snapshotInvocationCheckpoint(invocationId);

    const run = await db.autopilotRun.findUnique({ where: { id: invocationId } });
    const cp = JSON.parse(run!.currentCheckpoint);
    expect(cp.completedSteps).toContain('discovery');
    expect(cp.pendingStep).toBe('research');
    expect(run?.currentAction).toBe('research');
  });
});

describe('[Part 1] Checkpoint — restart-resume end-to-end', () => {
  it('a crashed invocation resumes from the persisted checkpoint after restart', async () => {
    const { invocationId } = await seedInvocationWithSteps();
    // Worker A completes 2 steps then "crashes" (no release).
    const w = __part1TestForkWorkerIdentity();
    await claimInvocationAs({ invocationId, leaseMs: 1 }, w);
    for (const step of ['discovery', 'research']) {
      const begin = await beginStep({ invocationId, stepKey: step });
      await completeStep({
        invocationId,
        stepKey: step,
        claimNonce: begin.claimNonce,
        result: { done: true },
      });
    }

    // Lease expires.
    await new Promise((r) => setTimeout(r, 50));
    await recoverExpiredLeases();

    // "Restart" — a fresh worker picks up the invocation.
    const w2 = __part1TestForkWorkerIdentity();
    const claim = await claimInvocationAs({ invocationId }, w2);
    expect(claim.claimed).toBe(true);

    // Load checkpoint — discovery + research = COMPLETE; qualification = PENDING.
    const cp = await loadCheckpoint(invocationId);
    const byKey = Object.fromEntries(cp!.steps.map((s) => [s.stepKey, s.status]));
    expect(byKey.discovery).toBe('COMPLETE');
    expect(byKey.research).toBe('COMPLETE');
    expect(byKey.qualification).toBe('PENDING');

    // Worker B continues from qualification (does NOT re-run discovery).
    const probeDiscovery = await beginStep({ invocationId, stepKey: 'discovery' });
    expect(probeDiscovery.alreadyComplete).toBe(true); // skip — use cached
    const probeQualification = await beginStep({ invocationId, stepKey: 'qualification' });
    expect(probeQualification.ok).toBe(true);
    expect(probeQualification.alreadyComplete).toBe(false);
  });
});
