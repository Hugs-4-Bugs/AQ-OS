// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Workflow Execution Fixes 
// Covers the three root causes of "workflow created but execution fails":
//   1. move_to_stage failing when the lead is already in the target stage
//      (pipeline-service.moveLeadToStage) — must be an idempotent success.
//   2. send_email requiring a "to" that the builder/templates/AI generator
//      never set — the recipient must resolve from the lead's email.
//   3. update_tags/add_tag referencing an undefined `action` identifier
//      (ReferenceError) — must read config.action with 'add' default.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted) ────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  db: {
    lead: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    leadActivity: { create: vi.fn() },
    leadNote: { create: vi.fn() },
    leadScore: { create: vi.fn() },
    notification: { create: vi.fn() },
    outreachMessage: { create: vi.fn() },
    emailAccount: { findFirst: vi.fn() },
    telegramConfig: { findFirst: vi.fn() },
    whatsappConfig: { findFirst: vi.fn() },
    dataExport: { create: vi.fn() },
  },
  sendEmail: vi.fn(),
  resolveLeadForExecution: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/email', () => ({ sendEmail: mocks.sendEmail }));
// Part 2 — the daily outreach quota is enforced inside the send actions;
// these suites test OTHER action concerns, so the quota gate is a
// pass-through here (its own dedicated suite covers the limit behavior).
vi.mock('@/lib/daily-outreach-quota', () => ({
  reserveDailyOutreachSend: vi.fn(async () => ({
    allowed: true, used: 0, limit: 500, remaining: 500, dateKey: '2026-10-21', timezone: 'UTC',
  })),
  DAILY_OUTREACH_LIMIT_EXCEEDED: 'DAILY_OUTREACH_LIMIT_EXCEEDED',
}));
vi.mock('@/lib/lead-audit', () => ({ logAuditEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/lead-score-recalc', () => ({ recalcLeadScores: vi.fn(async () => {}) }));
vi.mock('@/lib/ai/sender-signature', () => ({
  buildSenderSignatureBlock: vi.fn(() => ''),
  applySenderSignature: vi.fn((x: string) => x),
}));
vi.mock('@/lib/ai/outreach-generator', () => ({ loadSenderProfile: vi.fn(async () => null) }));
vi.mock('@/lib/personal-context', () => ({ buildPersonalContextBlockForUser: vi.fn(async () => '') }));
vi.mock('@/lib/lead-resolution', () => ({ resolveLeadForExecution: mocks.resolveLeadForExecution }));

import { moveLeadToStage } from '@/lib/pipeline-service';
import { executeAction } from '@/lib/workflow-actions';

const CTX = {
  userId: 'user_1',
  workflowId: 'wf_1',
  executionId: 'exec_1',
  leadId: 'lead_1',
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendEmail.mockResolvedValue({ sent: true, messageId: 'msg_test' });
});

// ── 1. move_to_stage idempotency ───────────────────────────────────

describe('moveLeadToStage — idempotent stage moves (workflow move_to_stage step)', () => {
  it('succeeds (no spurious failure) when the lead is already in the target stage', async () => {
    mocks.db.lead.findFirst.mockResolvedValue({ id: 'lead_1', stage: 'contacted', businessName: 'Acme' });

    const res = await moveLeadToStage('lead_1', 'contacted', 'user_1');

    expect(res.success).toBe(true);
    expect(res.leadId).toBe('lead_1');
    expect(res.fromStage).toBe('contacted');
    expect(res.toStage).toBe('contacted');
    expect(res.error).toBeUndefined();
    // Nothing changed → no writes
    expect(mocks.db.lead.update).not.toHaveBeenCalled();
    expect(mocks.db.leadActivity.create).not.toHaveBeenCalled();
  });

  it('performs the stage change (update + activity) when the stage differs', async () => {
    mocks.db.lead.findFirst.mockResolvedValue({ id: 'lead_1', stage: 'discovered', businessName: 'Acme' });

    const res = await moveLeadToStage('lead_1', 'contacted', 'user_1');

    expect(res.success).toBe(true);
    expect(res.fromStage).toBe('discovered');
    expect(res.toStage).toBe('contacted');
    expect(mocks.db.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead_1' },
      data: { stage: 'contacted' },
    });
    expect(mocks.db.leadActivity.create).toHaveBeenCalledTimes(1);
  });

  it('fails honestly when the lead does not exist', async () => {
    mocks.db.lead.findFirst.mockResolvedValue(null);

    const res = await moveLeadToStage('missing', 'contacted', 'user_1');

    expect(res.success).toBe(false);
    expect(res.error).toBe('Lead not found');
  });
});

// ── 2. send_email recipient resolution ─────────────────────────────

describe('executeAction send_email — recipient resolution', () => {
  it('resolves the recipient from the lead email when config has no "to" (builder/template/AI shape)', async () => {
    mocks.resolveLeadForExecution.mockResolvedValue({ ok: true, lead: { email: 'lead@acme.test' } });

    const res = await executeAction('send_email', { subject: 'Hello', body: 'World' }, { ...CTX });

    expect(res.success).toBe(true);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'lead@acme.test', subject: 'Hello' })
    );
  });

  it('uses an explicit "to" when the step config provides one', async () => {
    const res = await executeAction(
      'send_email',
      { to: 'explicit@acme.test', subject: 'Hello', body: 'World' },
      { ...CTX }
    );

    expect(res.success).toBe(true);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'explicit@acme.test' })
    );
    // No lead lookup needed — the explicit recipient wins
    expect(mocks.resolveLeadForExecution).not.toHaveBeenCalled();
  });

  it('treats an unresolved {{...}} placeholder recipient as needing lead resolution', async () => {
    mocks.resolveLeadForExecution.mockResolvedValue({ ok: true, lead: { email: 'lead@acme.test' } });

    const res = await executeAction(
      'send_email',
      { to: '{{lead.email}}', subject: 'Hello', body: 'World' },
      { ...CTX }
    );

    expect(res.success).toBe(true);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'lead@acme.test' })
    );
  });

  it('fails honestly when neither config.to nor a lead email exists', async () => {
    mocks.resolveLeadForExecution.mockResolvedValue({ ok: true, lead: { email: null } });

    const res = await executeAction('send_email', { subject: 'Hello', body: 'World' }, { ...CTX });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/recipient/i);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('fails honestly when there is no lead context and no "to"', async () => {
    const res = await executeAction('send_email', { subject: 'Hello', body: 'World' }, {
      userId: 'user_1',
      workflowId: 'wf_1',
      executionId: 'exec_1',
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/recipient/i);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('creates an approval draft instead of sending when the workflow requires approval', async () => {
    mocks.resolveLeadForExecution.mockResolvedValue({ ok: true, lead: { email: 'lead@acme.test' } });
    mocks.db.outreachMessage.create.mockResolvedValue({ id: 'draft_1' });
    mocks.db.notification.create.mockResolvedValue({ id: 'notif_1' });

    const res = await executeAction(
      'send_email',
      { subject: 'Hello', body: 'World' },
      { ...CTX, requiresApproval: true }
    );

    expect(res.success).toBe(true);
    expect(res.output).toMatchObject({ approvalRequired: true, draftId: 'draft_1', to: 'lead@acme.test' });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.db.outreachMessage.create).toHaveBeenCalledTimes(1);
  });
});

// ── 3. update_tags / add_tag undefined-identifier regression ───────

describe('executeAction update_tags / add_tag — no undefined `action` ReferenceError', () => {
  it('adds a single tag from config.tag (regression: previously threw "action is not defined")', async () => {
    mocks.resolveLeadForExecution.mockResolvedValue({ ok: true, lead: { tags: '[]' } });

    const res = await executeAction('add_tag', { tag: 'vip' }, { ...CTX });

    expect(res.success).toBe(true);
    expect(res.error).toBeUndefined();
    expect(mocks.db.lead.update).toHaveBeenCalledTimes(1);
    const updateArg = mocks.db.lead.update.mock.calls[0][0];
    expect(JSON.parse(updateArg.data.tags)).toEqual(['vip']);
  });

  it('accepts a tags array and merges (dedup) with existing tags', async () => {
    mocks.resolveLeadForExecution.mockResolvedValue({ ok: true, lead: { tags: '["vip"]' } });

    const res = await executeAction('update_tags', { tags: ['vip', 'warm'] }, { ...CTX });

    expect(res.success).toBe(true);
    const updateArg = mocks.db.lead.update.mock.calls[0][0];
    expect(JSON.parse(updateArg.data.tags)).toEqual(['vip', 'warm']);
  });

  it('re-running the same tag add is a no-op (idempotent tag set)', async () => {
    mocks.resolveLeadForExecution.mockResolvedValue({ ok: true, lead: { tags: '["vip"]' } });

    const res = await executeAction('add_tag', { tag: 'vip' }, { ...CTX });

    expect(res.success).toBe(true);
    const updateArg = mocks.db.lead.update.mock.calls[0][0];
    expect(JSON.parse(updateArg.data.tags)).toEqual(['vip']);
  });
});
