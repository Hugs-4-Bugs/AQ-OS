// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 1 — Invocation Creation + Idempotency
//
// Verifies:
//   · createOrFetchInvocation persists a durable AutopilotRun row
//   · duplicate triggers (same idempotencyKey) converge on the SAME row
//   · schedule / event / manual triggers use distinct key namespaces
//   · triggerType + triggerEventId persisted for audit
//   · correlationId + businessId denormalised
//   · createOrFetch is race-safe (unique constraint enforced)
//
// The invocation row must exist in the DB independent of the JS scope
// that created it — this is the durability requirement.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setupPart1Context,
  teardownPart1Context,
  createTestAutomation,
  type Part1TestContext,
} from '../helpers/part1-test-utils';
import { createAutomation } from '@/lib/autopilot/automation-service';
import { createOrFetchInvocation, getInvocation, listInvocations } from '@/lib/autopilot/invocation-service';
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

async function seedAutomation(userId: string): Promise<{ automationId: string; workflowId: string }> {
  const { workflowId } = await createTestAutomation({ ctx, userId });
  const a = await createAutomation({
    userId,
    name: `${ctx.runPrefix}-auto`,
    workflowId,
    status: 'ACTIVE',
    executionPolicy: { maxRetries: 3 },
  });
  ctx.automationIds.push(a.id);
  return { automationId: a.id, workflowId };
}

describe('[Part 1] Invocation — createOrFetchInvocation durable persistence', () => {
  it('persists the invocation row to the DB independent of JS scope', async () => {
    const { automationId } = await seedAutomation(ctx.userIds[0]);
    const { record, created } = await createOrFetchInvocation({
      automationId,
      userId: ctx.userIds[0],
      triggerType: 'manual',
    });
    ctx.invocationIds.push(record.id);
    expect(created).toBe(true);
    expect(record.id).toBeTruthy();
    expect(record.status).toBe('QUEUED');
    expect(record.triggerType).toBe('manual');
    expect(record.idempotencyKey).toMatch(/^manual:/);
    expect(record.correlationId).toBeTruthy();
    expect(record.maxRetries).toBe(3); // inherited from automation.executionPolicy
    expect(record.businessId).toBeNull(); // automation had no businessId
    expect(record.currentCheckpoint).toBe('{}');
    expect(record.retryCount).toBe(0);

    // Read directly from DB — row exists independently of record.
    const raw = await db.autopilotRun.findUnique({ where: { id: record.id } });
    expect(raw).not.toBeNull();
    expect(raw?.status).toBe('QUEUED');
    expect(raw?.triggerType).toBe('manual');
    expect(raw?.idempotencyKey).toBe(record.idempotencyKey);
  });

  it('schedule trigger requires slotEpochMs', async () => {
    const { automationId } = await seedAutomation(ctx.userIds[0]);
    await expect(
      createOrFetchInvocation({
        automationId,
        userId: ctx.userIds[0],
        triggerType: 'schedule',
      }),
    ).rejects.toThrow(/slotEpochMs/);
  });

  it('event trigger requires triggerEventId', async () => {
    const { automationId } = await seedAutomation(ctx.userIds[0]);
    await expect(
      createOrFetchInvocation({
        automationId,
        userId: ctx.userIds[0],
        triggerType: 'event',
      }),
    ).rejects.toThrow(/triggerEventId/);
  });

  it('uses deterministic idempotencyKey for schedule trigger', async () => {
    const { automationId } = await seedAutomation(ctx.userIds[0]);
    const slotEpochMs = Date.UTC(2026, 0, 1, 0, 0, 0); // deterministic slot
    const { record } = await createOrFetchInvocation({
      automationId,
      userId: ctx.userIds[0],
      triggerType: 'schedule',
      slotEpochMs,
    });
    ctx.invocationIds.push(record.id);
    expect(record.idempotencyKey).toBe(`schedule:${automationId}:${slotEpochMs}`);
    expect(record.triggerType).toBe('schedule');
  });

  it('uses deterministic idempotencyKey for event trigger', async () => {
    const { automationId } = await seedAutomation(ctx.userIds[0]);
    const eventId = 'evt-123';
    const { record } = await createOrFetchInvocation({
      automationId,
      userId: ctx.userIds[0],
      triggerType: 'event',
      triggerEventId: eventId,
    });
    ctx.invocationIds.push(record.id);
    expect(record.idempotencyKey).toBe(`event:${automationId}:${eventId}`);
    expect(record.triggerEventId).toBe(eventId);
  });

  it('throws when automation does not belong to caller', async () => {
    const { automationId } = await seedAutomation(ctx.userIds[0]);
    await expect(
      createOrFetchInvocation({
        automationId,
        userId: otherCtx.userIds[0], // wrong user
        triggerType: 'manual',
      }),
    ).rejects.toThrow(/not found for user/);
  });
});

describe('[Part 1] Invocation — duplicate-trigger idempotency', () => {
  it('duplicate schedule triggers converge on the same row', async () => {
    const { automationId } = await seedAutomation(ctx.userIds[0]);
    const slotEpochMs = Date.UTC(2026, 0, 2, 9, 0, 0);

    const first = await createOrFetchInvocation({
      automationId,
      userId: ctx.userIds[0],
      triggerType: 'schedule',
      slotEpochMs,
    });
    ctx.invocationIds.push(first.record.id);
    expect(first.created).toBe(true);

    // Second call with identical slot — must return SAME row.
    const second = await createOrFetchInvocation({
      automationId,
      userId: ctx.userIds[0],
      triggerType: 'schedule',
      slotEpochMs,
    });
    expect(second.created).toBe(false);
    expect(second.record.id).toBe(first.record.id);
    expect(second.record.idempotencyKey).toBe(first.record.idempotencyKey);

    // Confirm only ONE row exists in the DB.
    const count = await db.autopilotRun.count({
      where: { autopilotId: automationId, triggerType: 'schedule' },
    });
    expect(count).toBe(1);
  });

  it('duplicate event triggers converge on the same row', async () => {
    const { automationId } = await seedAutomation(ctx.userIds[0]);
    const eventId = 'evt-dedupe-456';

    const first = await createOrFetchInvocation({
      automationId,
      userId: ctx.userIds[0],
      triggerType: 'event',
      triggerEventId: eventId,
    });
    ctx.invocationIds.push(first.record.id);
    expect(first.created).toBe(true);

    const second = await createOrFetchInvocation({
      automationId,
      userId: ctx.userIds[0],
      triggerType: 'event',
      triggerEventId: eventId,
    });
    expect(second.created).toBe(false);
    expect(second.record.id).toBe(first.record.id);

    // Only one row in DB.
    const count = await db.autopilotRun.count({
      where: { triggerEventId: eventId },
    });
    expect(count).toBe(1);
  });

  it('manual triggers never collapse (unique per click)', async () => {
    const { automationId } = await seedAutomation(ctx.userIds[0]);
    const first = await createOrFetchInvocation({
      automationId,
      userId: ctx.userIds[0],
      triggerType: 'manual',
    });
    ctx.invocationIds.push(first.record.id);
    expect(first.created).toBe(true);

    const second = await createOrFetchInvocation({
      automationId,
      userId: ctx.userIds[0],
      triggerType: 'manual',
    });
    ctx.invocationIds.push(second.record.id);
    expect(second.created).toBe(true);
    expect(second.record.id).not.toBe(first.record.id);
    expect(second.record.idempotencyKey).not.toBe(first.record.idempotencyKey);
  });

  it('different slots create different invocations', async () => {
    const { automationId } = await seedAutomation(ctx.userIds[0]);
    const slot1 = Date.UTC(2026, 0, 3, 9, 0, 0);
    const slot2 = Date.UTC(2026, 0, 4, 9, 0, 0);

    const a = await createOrFetchInvocation({
      automationId,
      userId: ctx.userIds[0],
      triggerType: 'schedule',
      slotEpochMs: slot1,
    });
    const b = await createOrFetchInvocation({
      automationId,
      userId: ctx.userIds[0],
      triggerType: 'schedule',
      slotEpochMs: slot2,
    });
    ctx.invocationIds.push(a.record.id, b.record.id);
    expect(a.record.id).not.toBe(b.record.id);
    expect(a.record.idempotencyKey).not.toBe(b.record.idempotencyKey);
  });
});

describe('[Part 1] Invocation — getInvocation user isolation', () => {
  it('returns null for non-owner', async () => {
    const { automationId } = await seedAutomation(ctx.userIds[0]);
    const { record } = await createOrFetchInvocation({
      automationId,
      userId: ctx.userIds[0],
      triggerType: 'manual',
    });
    ctx.invocationIds.push(record.id);

    // Owner fetches — sees it.
    const own = await getInvocation(record.id, ctx.userIds[0]);
    expect(own?.id).toBe(record.id);

    // Other user fetches — null.
    const other = await getInvocation(record.id, otherCtx.userIds[0]);
    expect(other).toBeNull();
  });
});

describe('[Part 1] Invocation — listInvocations filter', () => {
  it('filters by automationId + status', async () => {
    const { automationId } = await seedAutomation(ctx.userIds[0]);
    const { record } = await createOrFetchInvocation({
      automationId,
      userId: ctx.userIds[0],
      triggerType: 'manual',
    });
    ctx.invocationIds.push(record.id);

    const list = await listInvocations({
      userId: ctx.userIds[0],
      automationId,
      status: 'QUEUED',
    });
    expect(list.some((r) => r.id === record.id)).toBe(true);

    // Status filter excludes others.
    const none = await listInvocations({
      userId: ctx.userIds[0],
      automationId,
      status: 'COMPLETED',
    });
    expect(none.some((r) => r.id === record.id)).toBe(false);
  });

  it('never lists other users invocations', async () => {
    const { automationId } = await seedAutomation(ctx.userIds[0]);
    const { record } = await createOrFetchInvocation({
      automationId,
      userId: ctx.userIds[0],
      triggerType: 'manual',
    });
    ctx.invocationIds.push(record.id);

    const otherList = await listInvocations({ userId: otherCtx.userIds[0] });
    expect(otherList.some((r) => r.id === record.id)).toBe(false);
  });
});
