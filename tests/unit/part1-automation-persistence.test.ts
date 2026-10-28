// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 1 — Automation (Objective) Persistence
//
// Verifies the durable Automation model:
//   · createAutomation persists all fields (incl. Part 1 extensions)
//   · getAutomation enforces user isolation (returns null for other user)
//   · updateAutomation transitions status + recomputes nextRunAt
//   · listAutomations filters by user/businessId/status
//   · cancelAutomation soft-purges (status=CANCELLED + clears nextRunAt)
//   · JSON policy documents round-trip through serialize/parse
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
  updateAutomation,
  listAutomations,
  cancelAutomation,
} from '@/lib/autopilot/automation-service';
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

describe('[Part 1] Automation persistence — createAutomation', () => {
  it('persists all Part 1 extension fields', async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const record = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-ext-fields`,
      workflowId,
      schedule: 'daily',
      timezone: 'Asia/Kolkata',
      niches: ['Dental', 'Plumbing'],
      geography: { country: 'IN', city: 'Hyderabad' },
      eventTriggers: [
        { eventType: 'new_lead', enabled: true },
        { eventType: 'new_email', enabled: false, filter: { from: 'vip@x' } },
      ],
      executionPolicy: { autoResume: true, maxRetries: 5, leaseTimeoutMs: 600_000 },
      approvalPolicy: { mode: 'escalate_high_risk', escalationChannel: 'in_app' },
      permissionsPolicy: {
        allowedTools: ['lead.search'],
        deniedTools: ['telegram.notify'],
      },
      modelStrategyConfig: {
        strategy: 'parallel',
        models: [{ provider: 'z-ai', model: 'glm-4.6', role: 'fit_scorer' }],
        concurrency: 3,
      },
      status: 'ACTIVE',
      businessId: null,
    });

    expect(record.id).toBeTruthy();
    expect(record.userId).toBe(ctx.userIds[0]);
    expect(record.status).toBe('ACTIVE');
    expect(record.timezone).toBe('Asia/Kolkata');
    expect(record.niches).toEqual(['Dental', 'Plumbing']);
    expect(record.geography).toEqual({ country: 'IN', city: 'Hyderabad' });
    expect(record.eventTriggers).toHaveLength(2);
    expect(record.eventTriggers[0]).toMatchObject({
      eventType: 'new_lead',
      enabled: true,
    });
    expect(record.executionPolicy).toMatchObject({ autoResume: true, maxRetries: 5 });
    expect(record.approvalPolicy).toMatchObject({
      mode: 'escalate_high_risk',
      escalationChannel: 'in_app',
    });
    expect(record.permissionsPolicy).toMatchObject({
      allowedTools: ['lead.search'],
      deniedTools: ['telegram.notify'],
    });
    expect(record.modelStrategyConfig?.strategy).toBe('parallel');
    expect(record.modelStrategyConfig?.models?.[0].role).toBe('fit_scorer');
    expect(record.nextRunAt).not.toBeNull(); // ACTIVE → fires
    ctx.automationIds.push(record.id);
  });

  it('DRAFT status leaves nextRunAt null', async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const record = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-draft`,
      workflowId,
      status: 'DRAFT',
    });
    expect(record.status).toBe('DRAFT');
    expect(record.nextRunAt).toBeNull();
    ctx.automationIds.push(record.id);
  });

  it('persists directly to the DB (survives beyond the JS scope)', async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const created = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-persisted`,
      workflowId,
      status: 'DRAFT',
    });
    ctx.automationIds.push(created.id);

    // Read directly from the DB to prove the row exists independently
    // of the createAutomation() return value.
    const raw = await db.autopilotWorkflow.findUnique({ where: { id: created.id } });
    expect(raw).not.toBeNull();
    expect(raw?.timezone).toBeNull(); // not set
    expect(raw?.eventTriggers).toBe('[]');
    expect(raw?.executionPolicy).toBe('{}');
    expect(raw?.modelStrategyConfig).toBeNull();
  });
});

describe('[Part 1] Automation persistence — getAutomation user isolation', () => {
  it("returns null when caller is not the automation's owner", async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const created = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-isolated`,
      workflowId,
      status: 'DRAFT',
    });
    ctx.automationIds.push(created.id);

    // Owner sees it.
    const asOwner = await getAutomation(created.id, ctx.userIds[0]);
    expect(asOwner?.id).toBe(created.id);

    // Other user gets null (no leakage).
    const asOther = await getAutomation(created.id, otherCtx.userIds[0]);
    expect(asOther).toBeNull();
  });
});

describe('[Part 1] Automation persistence — updateAutomation', () => {
  it('recomputes nextRunAt when transitioning DRAFT → ACTIVE', async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const created = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-to-active`,
      workflowId,
      status: 'DRAFT',
    });
    ctx.automationIds.push(created.id);
    expect(created.nextRunAt).toBeNull();

    const updated = await updateAutomation(created.id, { status: 'ACTIVE' }, ctx.userIds[0]);
    expect(updated?.status).toBe('ACTIVE');
    expect(updated?.nextRunAt).not.toBeNull();
    expect(updated!.nextRunAt!.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('clears nextRunAt when transitioning ACTIVE → PAUSED', async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const created = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-to-paused`,
      workflowId,
      status: 'ACTIVE',
    });
    ctx.automationIds.push(created.id);
    expect(created.nextRunAt).not.toBeNull();

    const updated = await updateAutomation(created.id, { status: 'PAUSED' }, ctx.userIds[0]);
    expect(updated?.status).toBe('PAUSED');
    expect(updated?.nextRunAt).toBeNull();
  });

  it('updates JSON policy documents', async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const created = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-policy-update`,
      workflowId,
      status: 'DRAFT',
    });
    ctx.automationIds.push(created.id);

    const updated = await updateAutomation(
      created.id,
      {
        executionPolicy: { maxRetries: 7, backoffMs: 10_000 },
        permissionsPolicy: { allowedTools: ['lead.search', 'email.send'] },
        modelStrategyConfig: { strategy: 'single' },
      },
      ctx.userIds[0],
    );
    expect(updated?.executionPolicy).toMatchObject({ maxRetries: 7 });
    expect(updated?.permissionsPolicy).toMatchObject({
      allowedTools: ['lead.search', 'email.send'],
    });
    expect(updated?.modelStrategyConfig?.strategy).toBe('single');
  });

  it('returns null when caller is not the owner (no update)', async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const created = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-no-leak`,
      workflowId,
      status: 'DRAFT',
    });
    ctx.automationIds.push(created.id);

    // Other user attempts update — must not modify and must return null.
    const blocked = await updateAutomation(
      created.id,
      { status: 'ACTIVE' },
      otherCtx.userIds[0],
    );
    expect(blocked).toBeNull();
    // Confirm underlying row is unchanged.
    const raw = await db.autopilotWorkflow.findUnique({ where: { id: created.id } });
    expect(raw?.status).toBe('DRAFT');
  });
});

describe('[Part 1] Automation persistence — listAutomations', () => {
  it('filters by status', async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const a1 = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-active`,
      workflowId,
      status: 'ACTIVE',
    });
    const a2 = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-draft`,
      workflowId,
      status: 'DRAFT',
    });
    ctx.automationIds.push(a1.id, a2.id);

    const active = await listAutomations({ userId: ctx.userIds[0], status: 'ACTIVE' });
    expect(active.some((a) => a.id === a1.id)).toBe(true);
    expect(active.some((a) => a.id === a2.id)).toBe(false);

    const drafts = await listAutomations({ userId: ctx.userIds[0], status: 'DRAFT' });
    expect(drafts.some((a) => a.id === a2.id)).toBe(true);
    expect(drafts.some((a) => a.id === a1.id)).toBe(false);
  });

  it('never returns automations owned by another user', async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const a = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-mine`,
      workflowId,
      status: 'DRAFT',
    });
    ctx.automationIds.push(a.id);

    // Other user lists their own — must not see ctx's automation.
    const otherList = await listAutomations({ userId: otherCtx.userIds[0] });
    expect(otherList.some((x) => x.id === a.id)).toBe(false);
  });
});

describe('[Part 1] Automation persistence — cancelAutomation', () => {
  it('marks CANCELLED + clears nextRunAt (soft purge)', async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const a = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-to-cancel`,
      workflowId,
      status: 'ACTIVE',
    });
    ctx.automationIds.push(a.id);
    expect(a.nextRunAt).not.toBeNull();

    const cancelled = await cancelAutomation(a.id, ctx.userIds[0]);
    expect(cancelled?.status).toBe('CANCELLED');
    expect(cancelled?.nextRunAt).toBeNull();
    // Confirm row still exists (soft purge — not deleted).
    const raw = await db.autopilotWorkflow.findUnique({ where: { id: a.id } });
    expect(raw).not.toBeNull();
    expect(raw?.status).toBe('CANCELLED');
    expect(raw?.nextRunAt).toBeNull();
  });

  it('returns null when caller is not the owner', async () => {
    const { workflowId } = await createTestAutomation({ ctx, userId: ctx.userIds[0] });
    const a = await createAutomation({
      userId: ctx.userIds[0],
      name: `${ctx.runPrefix}-no-cancel-others`,
      workflowId,
      status: 'ACTIVE',
    });
    ctx.automationIds.push(a.id);

    const blocked = await cancelAutomation(a.id, otherCtx.userIds[0]);
    expect(blocked).toBeNull();
    // Underlying row unchanged.
    const raw = await db.autopilotWorkflow.findUnique({ where: { id: a.id } });
    expect(raw?.status).toBe('ACTIVE');
  });
});
