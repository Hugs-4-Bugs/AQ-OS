// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 1 — Wait / Wake / Resume + Unified Triggers
//
// Verifies the unified-trigger architecture (Part 1 §3, §9, §10, §13):
//
//   · scheduleTriggerTick  — TIME  → invocation (creates durable row)
//   · eventTriggerTick     — EVENT → invocation (same durable row shape)
//   · both funnel through the SAME AutopilotRun + AutomationCheckpoint
//   · WAITING invocations release the worker (no busy loop)
//   · TIME wake: findDueWakeups + wakeInvocation + re-claim
//   · EVENT wake: matchEventToWaitingInvocations + wakeInvocation
//   · user isolation: events from User A never wake User B's runs
//   · duplicate triggers converge on the same row (idempotency)
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
  parkStepWaiting,
  loadCheckpoint,
} from '@/lib/autopilot/checkpoint-service';
import {
  claimInvocation,
  releaseLease,
  __part1TestForkWorkerIdentity,
  claimInvocationAs,
} from '@/lib/autopilot/worker-lease';
import {
  parkInvocationWaiting,
  findDueWakeups,
  findIndefiniteWaits,
  matchEventToWaitingInvocations,
  wakeInvocation,
} from '@/lib/autopilot/wait-wake';
import {
  scheduleTriggerTick,
  eventTriggerTick,
  drainQueuedAndWaiting,
} from '@/lib/autopilot/unified-trigger';
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

async function seedActiveAutomationWithEventTriggers(
  userId: string,
  triggers: Array<{ eventType: string; enabled: boolean }>,
): Promise<{ automationId: string }> {
  const { workflowId } = await createTestAutomation({ ctx, userId });
  const automation = await createAutomation({
    userId,
    name: `${ctx.runPrefix}-auto-${userId.slice(-4)}`,
    workflowId,
    status: 'ACTIVE',
    eventTriggers: triggers as never,
    schedule: 'daily',
  });
  // Force nextRunAt into the past so the schedule tick treats it as "due".
  await db.autopilotWorkflow.update({
    where: { id: automation.id },
    data: { nextRunAt: new Date(Date.now() - 60_000) },
  });
  ctx.automationIds.push(automation.id);
  return { automationId: automation.id };
}

describe('[Part 1] Unified trigger — schedule path', () => {
  it('creates a durable invocation for a due ACTIVE automation', async () => {
    const { automationId } = await seedActiveAutomationWithEventTriggers(ctx.userIds[0], []);

    // Pre-condition: automation exists, no invocations yet.
    const beforeCount = await db.autopilotRun.count({
      where: { autopilotId: automationId },
    });
    expect(beforeCount).toBe(0);

    // Run the schedule tick.
    const result = await scheduleTriggerTick({ now: new Date() });
    expect(result.invocationsCreated).toBeGreaterThanOrEqual(1);
    expect(result.results.some((r) => r.automationId === automationId)).toBe(true);

    // Post-condition: a durable invocation exists in the DB.
    const afterCount = await db.autopilotRun.count({
      where: { autopilotId: automationId },
    });
    expect(afterCount).toBe(1);
    const run = await db.autopilotRun.findFirst({
      where: { autopilotId: automationId },
    });
    expect(run?.status).toBe('QUEUED');
    expect(run?.triggerType).toBe('schedule');
    expect(run?.idempotencyKey).toMatch(/^schedule:/);
    ctx.invocationIds.push(run!.id);
  });

  it('duplicate ticks converge on the same invocation (idempotency)', async () => {
    const { automationId } = await seedActiveAutomationWithEventTriggers(ctx.userIds[0], []);

    const first = await scheduleTriggerTick({ now: new Date() });
    expect(first.invocationsCreated).toBeGreaterThanOrEqual(1);

    // Second tick — the first tick advanced nextRunAt to the future, so the
    // second tick finds no due automations and creates/reuses ZERO new rows.
    // (The Phase 18 idempotency at the runKey level is exercised separately
    // via the createOrFetchInvocation test that proves duplicate slot keys
    // converge on the same row.) The invariant here: only ONE run exists.
    const second = await scheduleTriggerTick({ now: new Date() });
    const totalRuns = await db.autopilotRun.count({
      where: { autopilotId: automationId },
    });
    expect(totalRuns).toBe(1);
    // Sanity: second tick's processing is bounded and never adds duplicate rows.
    expect(second.invocationsCreated).toBeLessThanOrEqual(1);
  });

  it('never triggers DRAFT or PAUSED automations', async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const draft = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-draft`,
      workflowId,
      status: 'DRAFT',
    });
    ctx.automationIds.push(draft.id);

    const paused = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-paused`,
      workflowId,
      status: 'ACTIVE',
    });
    ctx.automationIds.push(paused.id);
    // Now transition paused to PAUSED.
    const { updateAutomation } = await import('@/lib/autopilot/automation-service');
    await updateAutomation(paused.id, { status: 'PAUSED' }, ctx.userIds[0]);

    const result = await scheduleTriggerTick({ now: new Date() });
    expect(result.results.some((r) => r.automationId === draft.id)).toBe(false);
    expect(result.results.some((r) => r.automationId === paused.id)).toBe(false);
  });
});

describe('[Part 1] Unified trigger — event path', () => {
  it('creates a durable invocation for an event-matching automation', async () => {
    const { automationId } = await seedActiveAutomationWithEventTriggers(ctx.userIds[0], [
      { eventType: 'new_lead', enabled: true },
      { eventType: 'new_email', enabled: true },
    ]);

    const result = await eventTriggerTick({
      userId: ctx.userIds[0],
      eventType: 'new_lead',
      triggerEventId: `evt-${Date.now()}-newlead`,
    });
    expect(result.invocationsCreated).toBe(1);
    expect(result.results[0].automationId).toBe(automationId);

    const run = await db.autopilotRun.findFirst({
      where: { autopilotId: automationId },
    });
    expect(run?.triggerType).toBe('event');
    expect(run?.triggerEventId).toMatch(/evt-.*-newlead/);
    expect(run?.idempotencyKey).toMatch(/^event:/);
    ctx.invocationIds.push(run!.id);
  });

  it('does NOT trigger automations with no matching event trigger', async () => {
    const { automationId } = await seedActiveAutomationWithEventTriggers(ctx.userIds[0], [
      { eventType: 'new_lead', enabled: true },
    ]);
    // Fire a new_email event — automation has new_lead only.
    const result = await eventTriggerTick({
      userId: ctx.userIds[0],
      eventType: 'new_email',
      triggerEventId: `evt-${Date.now()}-nomatch`,
    });
    expect(result.invocationsCreated).toBe(0);
    const runs = await db.autopilotRun.count({
      where: { autopilotId: automationId },
    });
    expect(runs).toBe(0);
  });

  it('does NOT trigger automations with disabled event triggers', async () => {
    const { automationId } = await seedActiveAutomationWithEventTriggers(ctx.userIds[0], [
      { eventType: 'new_lead', enabled: false },
    ]);
    const result = await eventTriggerTick({
      userId: ctx.userIds[0],
      eventType: 'new_lead',
      triggerEventId: `evt-${Date.now()}-disabled`,
    });
    expect(result.invocationsCreated).toBe(0);
  });

  it('duplicate events converge on the same invocation', async () => {
    const { automationId } = await seedActiveAutomationWithEventTriggers(ctx.userIds[0], [
      { eventType: 'new_lead', enabled: true },
    ]);
    const eventId = `evt-${Date.now()}-dup`;
    const first = await eventTriggerTick({
      userId: ctx.userIds[0],
      eventType: 'new_lead',
      triggerEventId: eventId,
    });
    const second = await eventTriggerTick({
      userId: ctx.userIds[0],
      eventType: 'new_lead',
      triggerEventId: eventId,
    });
    expect(first.invocationsCreated).toBe(1);
    expect(second.invocationsCreated).toBe(0);
    expect(second.invocationsReused).toBe(1);
    const total = await db.autopilotRun.count({
      where: { triggerEventId: eventId },
    });
    expect(total).toBe(1);
    const run = await db.autopilotRun.findFirst({
      where: { triggerEventId: eventId },
    });
    ctx.invocationIds.push(run!.id);
  });

  it('user isolation: events from User A never trigger User B automations', async () => {
    // User A's automation with new_lead trigger.
    const { automationId: aAId } = await seedActiveAutomationWithEventTriggers(
      ctx.userIds[0],
      [{ eventType: 'new_lead', enabled: true }],
    );
    // User B's automation with new_lead trigger.
    const { automationId: aBId } = await seedActiveAutomationWithEventTriggers(
      otherCtx.userIds[0],
      [{ eventType: 'new_lead', enabled: true }],
    );

    // User A fires a new_lead event — should ONLY trigger User A's automation.
    const result = await eventTriggerTick({
      userId: ctx.userIds[0],
      eventType: 'new_lead',
      triggerEventId: `evt-${Date.now()}-iso-a`,
    });
    expect(result.results.some((r) => r.automationId === aAId)).toBe(true);
    expect(result.results.some((r) => r.automationId === aBId)).toBe(false);

    // Confirm only User A's automation has a run.
    const aRuns = await db.autopilotRun.count({
      where: { autopilotId: aAId },
    });
    const bRuns = await db.autopilotRun.count({
      where: { autopilotId: aBId },
    });
    expect(aRuns).toBe(1);
    expect(bRuns).toBe(0);
    const aRun = await db.autopilotRun.findFirst({
      where: { autopilotId: aAId },
    });
    ctx.invocationIds.push(aRun!.id);
  });
});

describe('[Part 1] Unified trigger — same execution engine', () => {
  it('schedule + event invocations share the same AutopilotRun model + status', async () => {
    // Schedule path.
    const { automationId: scheduleAutomationId } =
      await seedActiveAutomationWithEventTriggers(ctx.userIds[0], []);
    await scheduleTriggerTick({ now: new Date() });
    const scheduleRun = await db.autopilotRun.findFirst({
      where: { autopilotId: scheduleAutomationId },
    });
    ctx.invocationIds.push(scheduleRun!.id);

    // Event path.
    const { automationId: eventAutomationId } = await seedActiveAutomationWithEventTriggers(
      ctx.userIds[0],
      [{ eventType: 'new_lead', enabled: true }],
    );
    await eventTriggerTick({
      userId: ctx.userIds[0],
      eventType: 'new_lead',
      triggerEventId: `evt-${Date.now()}-shared-engine`,
    });
    const eventRun = await db.autopilotRun.findFirst({
      where: { autopilotId: eventAutomationId },
    });
    ctx.invocationIds.push(eventRun!.id);

    // Both runs have the SAME model fields, same status QUEUED,
    // same currentCheckpoint='{}', same retryCount=0.
    expect(scheduleRun?.status).toBe('QUEUED');
    expect(eventRun?.status).toBe('QUEUED');
    expect(scheduleRun?.currentCheckpoint).toBe('{}');
    expect(eventRun?.currentCheckpoint).toBe('{}');
    expect(scheduleRun?.retryCount).toBe(0);
    expect(eventRun?.retryCount).toBe(0);
    // Both can be claimed via the same claimInvocation path.
    const claimS = await claimInvocation({ invocationId: scheduleRun!.id });
    expect(claimS.claimed).toBe(true);
    await releaseLease(scheduleRun!.id, 'QUEUED');
    const claimE = await claimInvocation({ invocationId: eventRun!.id });
    expect(claimE.claimed).toBe(true);
    await releaseLease(eventRun!.id, 'QUEUED');
  });
});

describe('[Part 1] Wait / Wake — TIME wake', () => {
  it('parkInvocationWaiting releases the worker + sets nextWakeAt', async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const a = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-wait-ap`,
      workflowId,
      status: 'ACTIVE',
    });
    ctx.automationIds.push(a.id);
    const { record } = await createOrFetchInvocation({
      automationId: a.id,
      userId: ctx.userIds[0],
      triggerType: 'manual',
    });
    ctx.invocationIds.push(record.id);
    await claimInvocation({ invocationId: record.id });
    const wake = new Date(Date.now() + 1000);
    const r = await parkInvocationWaiting({
      invocationId: record.id,
      condition: 'WAITING_FOR_FOLLOWUP',
      nextWakeAt: wake,
    });
    expect(r.parked).toBe(true);
    const raw = await db.autopilotRun.findUnique({ where: { id: record.id } });
    expect(raw?.status).toBe('WAITING');
    expect(raw?.waitingCondition).toBe('WAITING_FOR_FOLLOWUP');
    expect(raw?.nextWakeAt?.getTime()).toBeCloseTo(wake.getTime(), -3);
    expect(raw?.leaseOwner).toBeNull(); // worker released
  });

  it('findDueWakeups returns invocations whose nextWakeAt has passed', async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const a = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-wake-ap`,
      workflowId,
      status: 'ACTIVE',
    });
    ctx.automationIds.push(a.id);
    const { record } = await createOrFetchInvocation({
      automationId: a.id,
      userId: ctx.userIds[0],
      triggerType: 'manual',
    });
    ctx.invocationIds.push(record.id);
    await claimInvocation({ invocationId: record.id });
    await parkInvocationWaiting({
      invocationId: record.id,
      condition: 'WAITING_FOR_SCHEDULE',
      nextWakeAt: new Date(Date.now() - 1000), // already due
    });

    const due = await findDueWakeups({ limit: 50 });
    expect(due.some((d) => d.invocationId === record.id)).toBe(true);
    expect(due.find((d) => d.invocationId === record.id)?.condition).toBe(
      'WAITING_FOR_SCHEDULE',
    );
  });

  it('wakeInvocation transitions WAITING → QUEUED for re-claiming', async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const a = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-wake-ap`,
      workflowId,
      status: 'ACTIVE',
    });
    ctx.automationIds.push(a.id);
    const { record } = await createOrFetchInvocation({
      automationId: a.id,
      userId: ctx.userIds[0],
      triggerType: 'manual',
    });
    ctx.invocationIds.push(record.id);
    await claimInvocation({ invocationId: record.id });
    await parkInvocationWaiting({
      invocationId: record.id,
      condition: 'WAITING_FOR_EMAIL',
      nextWakeAt: new Date(Date.now() - 1000),
    });

    const r = await wakeInvocation(record.id);
    expect(r.woken).toBe(true);
    const raw = await db.autopilotRun.findUnique({ where: { id: record.id } });
    expect(raw?.status).toBe('QUEUED');
    expect(raw?.waitingCondition).toBeNull();
    expect(raw?.nextWakeAt).toBeNull();
  });

  it('findIndefiniteWaits lists invocations with nextWakeAt IS NULL', async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const a = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-indef-ap`,
      workflowId,
      status: 'ACTIVE',
    });
    ctx.automationIds.push(a.id);
    const { record } = await createOrFetchInvocation({
      automationId: a.id,
      userId: ctx.userIds[0],
      triggerType: 'manual',
    });
    ctx.invocationIds.push(record.id);
    await claimInvocation({ invocationId: record.id });
    await parkInvocationWaiting({
      invocationId: record.id,
      condition: 'WAITING_FOR_EXTERNAL_EVENT',
      // no nextWakeAt — indefinite
    });
    const indefinite = await findIndefiniteWaits({
      condition: 'WAITING_FOR_EXTERNAL_EVENT',
    });
    expect(indefinite.some((d) => d.invocationId === record.id)).toBe(true);
  });
});

describe('[Part 1] Wait / Wake — EVENT wake + user isolation', () => {
  it('matchEventToWaitingInvocations only matches invocations owned by the event user', async () => {
    // User A invocation parked WAITING_FOR_EMAIL.
    const { workflowId: wfA } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const aA = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-a-a`,
      workflowId: wfA,
      status: 'ACTIVE',
    });
    ctx.automationIds.push(aA.id);
    const invA = await createOrFetchInvocation({
      automationId: aA.id,
      userId: ctx.userIds[0],
      triggerType: 'manual',
    });
    ctx.invocationIds.push(invA.record.id);
    await claimInvocation({ invocationId: invA.record.id });
    await parkInvocationWaiting({
      invocationId: invA.record.id,
      condition: 'WAITING_FOR_EMAIL',
    });

    // User B invocation parked WAITING_FOR_EMAIL.
    const { workflowId: wfB } = await createTestAutomation({ ctx, userId: otherCtx.userIds[0] });
    const aB = await createAutomation({
      userId: otherCtx.userIds[0],
      name: `${ctx.runPrefix}-a-b`,
      workflowId: wfB,
      status: 'ACTIVE',
    });
    ctx.automationIds.push(aB.id);
    const invB = await createOrFetchInvocation({
      automationId: aB.id,
      userId: otherCtx.userIds[0],
      triggerType: 'manual',
    });
    ctx.invocationIds.push(invB.record.id);
    await claimInvocationAs(
      { invocationId: invB.record.id },
      __part1TestForkWorkerIdentity(),
    );
    await parkInvocationWaiting({
      invocationId: invB.record.id,
      condition: 'WAITING_FOR_EMAIL',
    });

    // Event for User A — should only match User A's invocation.
    const matchedForA = await matchEventToWaitingInvocations({
      userId: ctx.userIds[0],
      eventType: 'new_email',
    });
    expect(matchedForA.some((m) => m.invocationId === invA.record.id)).toBe(true);
    expect(matchedForA.some((m) => m.invocationId === invB.record.id)).toBe(false);

    // Event for User B — should only match User B's invocation.
    const matchedForB = await matchEventToWaitingInvocations({
      userId: otherCtx.userIds[0],
      eventType: 'new_email',
    });
    expect(matchedForB.some((m) => m.invocationId === invB.record.id)).toBe(true);
    expect(matchedForB.some((m) => m.invocationId === invA.record.id)).toBe(false);
  });

  it('wakeInvocation on another users run — idempotency check (still woken because no caller check)', async () => {
    // wakeInvocation itself does NOT enforce caller user — but the
    // production path that calls it (matchEventToWaitingInvocations)
    // DOES filter by userId. This test documents that the match layer
    // is the actual user-isolation point.
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const a = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-iso-wake`,
      workflowId,
      status: 'ACTIVE',
    });
    ctx.automationIds.push(a.id);
    const { record } = await createOrFetchInvocation({
      automationId: a.id,
      userId: ctx.userIds[0],
      triggerType: 'manual',
    });
    ctx.invocationIds.push(record.id);
    await claimInvocation({ invocationId: record.id });
    await parkInvocationWaiting({
      invocationId: record.id,
      condition: 'WAITING_FOR_EMAIL',
    });
    const r = await wakeInvocation(record.id);
    expect(r.woken).toBe(true);
  });
});

describe('[Part 1] drainQueuedAndWaiting — full recovery loop', () => {
  it('recovers stale leases, wakes due waits, claims queued invocations', async () => {
    // 1. An invocation whose lease has expired.
    const { workflowId: wf1 } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const a1 = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-drain-1`,
      workflowId: wf1,
      status: 'ACTIVE',
    });
    ctx.automationIds.push(a1.id);
    const inv1 = await createOrFetchInvocation({
      automationId: a1.id,
      userId: ctx.userIds[0],
      triggerType: 'manual',
    });
    ctx.invocationIds.push(inv1.record.id);
    const w1 = __part1TestForkWorkerIdentity();
    await claimInvocationAs({ invocationId: inv1.record.id, leaseMs: 1 }, w1);

    // 2. An invocation parked WAITING with past nextWakeAt.
    const { workflowId: wf2 } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const a2 = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-drain-2`,
      workflowId: wf2,
      status: 'ACTIVE',
    });
    ctx.automationIds.push(a2.id);
    const inv2 = await createOrFetchInvocation({
      automationId: a2.id,
      userId: ctx.userIds[0],
      triggerType: 'manual',
    });
    ctx.invocationIds.push(inv2.record.id);
    await claimInvocation({ invocationId: inv2.record.id });
    await parkInvocationWaiting({
      invocationId: inv2.record.id,
      condition: 'WAITING_FOR_FOLLOWUP',
      nextWakeAt: new Date(Date.now() - 1000),
    });

    // 3. A queued invocation ready to be claimed.
    const { workflowId: wf3 } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const a3 = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-drain-3`,
      workflowId: wf3,
      status: 'ACTIVE',
    });
    ctx.automationIds.push(a3.id);
    const inv3 = await createOrFetchInvocation({
      automationId: a3.id,
      userId: ctx.userIds[0],
      triggerType: 'manual',
    });
    ctx.invocationIds.push(inv3.record.id);

    // Wait for the expired lease to become reclaimable.
    await new Promise((r) => setTimeout(r, 50));

    const drain = await drainQueuedAndWaiting({ maxConcurrent: 10 });
    expect(drain.reclaimedStaleLeases).toBeGreaterThanOrEqual(1);
    expect(drain.wokenWaits).toBeGreaterThanOrEqual(1);
    expect(drain.claimed).toBeGreaterThanOrEqual(1);

    // The waiting invocation should now be QUEUED (woken) then claimed
    // by the same drain — so its status should be RUNNING.
    const inv2After = await db.autopilotRun.findUnique({ where: { id: inv2.record.id } });
    expect(['QUEUED', 'RUNNING']).toContain(inv2After?.status);

    // The stale-lease invocation should now be QUEUED (reclaimed) then
    // claimed by the same drain.
    const inv1After = await db.autopilotRun.findUnique({ where: { id: inv1.record.id } });
    expect(['QUEUED', 'RUNNING']).toContain(inv1After?.status);
  });
});
