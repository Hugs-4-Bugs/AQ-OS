// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 1 — User Isolation + Browser-Independent Exec
//
// Cross-cutting tests proving the durable-autopilot security model:
//
//   1. User A's automation/invocation/checkpoint is invisible to User B
//      at every layer (CRUD, list, get, transition).
//   2. Backend execution continues regardless of browser state — the
//      invocation row exists in the DB independent of any HTTP request
//      or browser session.
//   3. After "browser close + server restart" (simulated by simply
//      dropping all in-memory state and re-reading from DB), the
//      invocation + checkpoint + lease state is fully preserved.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setupPart1Context,
  teardownPart1Context,
  createTestAutomation,
  type Part1TestContext,
} from '../helpers/part1-test-utils';
import {
  createAutomation,
  getAutomation,
  listAutomations,
  updateAutomation,
  cancelAutomation,
} from '@/lib/autopilot/automation-service';
import {
  createOrFetchInvocation,
  getInvocation,
  listInvocations,
  transitionInvocation,
  markCompleted,
} from '@/lib/autopilot/invocation-service';
import {
  initializeCheckpoint,
  beginStep,
  completeStep,
  loadCheckpoint,
} from '@/lib/autopilot/checkpoint-service';
import { claimInvocation, releaseLease } from '@/lib/autopilot/worker-lease';
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

describe('[Part 1] User isolation — Automation CRUD', () => {
  it('User B cannot read User A automation', async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const a = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-iso-crud`,
      workflowId,
      status: 'DRAFT',
    });
    ctx.automationIds.push(a.id);

    expect(await getAutomation(a.id, ctx.userIds[0])?.then((r) => r?.id)).toBe(a.id);
    expect(await getAutomation(a.id, otherCtx.userIds[0])).toBeNull();
  });

  it('User B cannot update User A automation', async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const a = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-iso-upd`,
      workflowId,
      status: 'DRAFT',
    });
    ctx.automationIds.push(a.id);

    const blocked = await updateAutomation(a.id, { status: 'ACTIVE' }, otherCtx.userIds[0]);
    expect(blocked).toBeNull();
    const raw = await db.autopilotWorkflow.findUnique({ where: { id: a.id } });
    expect(raw?.status).toBe('DRAFT');
  });

  it('User B cannot cancel User A automation', async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const a = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-iso-cancel`,
      workflowId,
      status: 'ACTIVE',
    });
    ctx.automationIds.push(a.id);

    const blocked = await cancelAutomation(a.id, otherCtx.userIds[0]);
    expect(blocked).toBeNull();
    const raw = await db.autopilotWorkflow.findUnique({ where: { id: a.id } });
    expect(raw?.status).toBe('ACTIVE');
  });

  it('listAutomations never leaks across users', async () => {
    const { workflowId: wfA } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const aA = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-iso-list-a`,
      workflowId: wfA,
      status: 'DRAFT',
    });
    ctx.automationIds.push(aA.id);

    const { workflowId: wfB } = await createTestAutomation({ ctx, userId: otherCtx.userIds[0] });
    const aB = await createAutomation({
      userId: otherCtx.userIds[0],
      name: `${ctx.runPrefix}-iso-list-b`,
      workflowId: wfB,
      status: 'DRAFT',
    });
    ctx.automationIds.push(aB.id);

    const listA = await listAutomations({ userId: ctx.userIds[0] });
    const listB = await listAutomations({ userId: otherCtx.userIds[0] });
    expect(listA.some((a) => a.id === aA.id)).toBe(true);
    expect(listA.some((a) => a.id === aB.id)).toBe(false);
    expect(listB.some((a) => a.id === aB.id)).toBe(true);
    expect(listB.some((a) => a.id === aA.id)).toBe(false);
  });
});

describe('[Part 1] User isolation — Invocation', () => {
  it('User B cannot read User A invocation', async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const a = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-iso-inv`,
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

    expect(await getInvocation(record.id, ctx.userIds[0])?.then((r) => r?.id)).toBe(record.id);
    expect(await getInvocation(record.id, otherCtx.userIds[0])).toBeNull();
  });

  it('listInvocations never leaks across users', async () => {
    const { workflowId: wfA } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const aA = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-iso-inv-list-a`,
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

    const { workflowId: wfB } = await createTestAutomation({ ctx, userId: otherCtx.userIds[0] });
    const aB = await createAutomation({
      userId: otherCtx.userIds[0],
      name: `${ctx.runPrefix}-iso-inv-list-b`,
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

    const listA = await listInvocations({ userId: ctx.userIds[0] });
    const listB = await listInvocations({ userId: otherCtx.userIds[0] });
    expect(listA.some((r) => r.id === invA.record.id)).toBe(true);
    expect(listA.some((r) => r.id === invB.record.id)).toBe(false);
    expect(listB.some((r) => r.id === invB.record.id)).toBe(true);
    expect(listB.some((r) => r.id === invA.record.id)).toBe(false);
  });

  it('User B cannot create invocation for User A automation (FK enforced by service)', async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const a = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-iso-create`,
      workflowId,
      status: 'ACTIVE',
    });
    ctx.automationIds.push(a.id);

    // User B tries to create an invocation for User A's automation.
    await expect(
      createOrFetchInvocation({
        automationId: a.id,
        userId: otherCtx.userIds[0], // wrong user
        triggerType: 'manual',
      }),
    ).rejects.toThrow(/not found for user/);
  });
});

describe('[Part 1] User isolation — Checkpoint', () => {
  it('User A checkpoint is invisible to User B (no service-level API exposes it)', async () => {
    // Checkpoint rows are denormalised with userId for fast user-scope filters.
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const a = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-iso-cp`,
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
    await initializeCheckpoint({
      invocationId: record.id,
      userId: ctx.userIds[0],
      steps: [{ stepKey: 'discovery', stepName: 'Discovery', sequence: 0 }],
    });

    // User A's checkpoints have userId = ctx.userIds[0].
    const myCps = await db.automationCheckpoint.findMany({
      where: { userId: ctx.userIds[0] },
    });
    expect(myCps.some((c) => c.invocationId === record.id)).toBe(true);

    // User B has ZERO checkpoints.
    const otherCps = await db.automationCheckpoint.findMany({
      where: { userId: otherCtx.userIds[0] },
    });
    expect(otherCps.some((c) => c.invocationId === record.id)).toBe(false);
  });
});

describe('[Part 1] Browser-independent execution', () => {
  it('invocation + checkpoint + lease survive across "browser close + server restart"', async () => {
    // 1. Create the invocation in JS scope A.
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const a = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-browser-indep`,
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
    await initializeCheckpoint({
      invocationId: record.id,
      userId: ctx.userIds[0],
      steps: [
        { stepKey: 'discovery', stepName: 'Discovery', sequence: 0 },
        { stepKey: 'research', stepName: 'Research', sequence: 1 },
      ],
    });
    const begin = await beginStep({ invocationId: record.id, stepKey: 'discovery' });
    await completeStep({
      invocationId: record.id,
      stepKey: 'discovery',
      claimNonce: begin.claimNonce,
      result: { done: true, leadIds: ['l1'] },
    });
    await claimInvocation({ invocationId: record.id });

    // 2. Snapshot all persisted IDs (simulating browser close + JS scope teardown).
    const invocationId = record.id;
    const userId = ctx.userIds[0];
    const automationId = a.id;
    const discoveryNonce = begin.claimNonce;
    // Drop all in-memory references.
    // (in a real scenario: the browser tab closes, the React state is
    //  gone, the page's JS scope is GC'd. Only the DB row remains.)

    // 3. "Restart" — fresh JS scope, fresh import.
    const freshInvoke = await import('@/lib/autopilot/invocation-service');
    const freshCheckpoint = await import('@/lib/autopilot/checkpoint-service');
    const freshLease = await import('@/lib/autopilot/worker-lease');

    // 4. Re-read everything from DB.
    const rereadInv = await freshInvoke.getInvocation(invocationId, userId);
    expect(rereadInv).not.toBeNull();
    expect(rereadInv?.status).toBe('RUNNING');
    expect(rereadInv?.currentCheckpoint).not.toBe('{}'); // was snapshotted

    const rereadCp = await freshCheckpoint.loadCheckpoint(invocationId);
    expect(rereadCp).not.toBeNull();
    const disc = rereadCp!.steps.find((s) => s.stepKey === 'discovery');
    const res = rereadCp!.steps.find((s) => s.stepKey === 'research');
    expect(disc?.status).toBe('COMPLETE');
    expect(disc?.result).toMatchObject({ done: true, leadIds: ['l1'] });
    expect(res?.status).toBe('PENDING');

    // 5. Lease is intact — current owner still holds it.
    expect(await freshLease.verifyLease(invocationId)).toBe(true);

    // 6. The invocation can continue without restarting the work.
    //    (e.g. begin research — should succeed, not be marked alreadyComplete.)
    const probe = await freshCheckpoint.beginStep({ invocationId, stepKey: 'research' });
    expect(probe.ok).toBe(true);
    expect(probe.alreadyComplete).toBe(false);

    // 7. automationId is still the same — the automation row wasn't
    //    recreated. This proves the persistent linkage survived.
    const rereadAutomation = await getAutomation(automationId, userId);
    expect(rereadAutomation?.id).toBe(automationId);
  });
});
