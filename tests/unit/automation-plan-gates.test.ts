/**
 * Automation plan gates (Plan Eligibility Correction) — route-level tests
 *
 * Verifies that autonomous/workflow automation endpoints enforce the
 * workflow_access entitlement (Pro/Elite only) server-side, returning a
 * structured 403 PLAN_REQUIRED for Free/Starter users BEFORE touching any
 * automation engine, and that outreach sequence automation follows the
 * existing outreach_sequences entitlement. Also covers the meetings
 * autonomy-mode field gate (assisted/autonomous = Pro/Elite; 'approval'
 * stays available to every plan).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  plan: 'free' as string,
  db: {
    userSettings: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({ db: state.db }));

vi.mock('@/lib/billing-audit', () => ({
  logEntitlementEvent: vi.fn().mockResolvedValue(undefined),
  logBillingEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth-middleware', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth-middleware')>();
  const user = () => ({ id: 'u1', email: 'u1@test.com', plan: state.plan });
  return {
    ...actual,
    withAuth: vi.fn((_req: unknown, fn: (u: unknown) => unknown) => fn(user())),
    withDualAuthPermission: vi.fn(
      (_req: unknown, _perm: string, fn: (u: unknown, k: unknown) => unknown) => fn(user(), null),
    ),
  };
});

vi.mock('@/lib/observability/middleware', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/observability/middleware')>();
  return { ...actual, withMonitoring: vi.fn((fn: unknown) => fn) };
});

vi.mock('@/lib/observability/api-logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/observability/api-logger')>();
  return { ...actual, withApiLogging: vi.fn((fn: unknown) => fn) };
});

vi.mock('@/lib/workflow-service', () => ({
  listWorkflows: vi.fn().mockResolvedValue({ workflows: [], total: 0 }),
  createWorkflow: vi.fn().mockResolvedValue({ success: true, workflow: { id: 'wf-1' } }),
}));

vi.mock('@/lib/autonomous-outreach-engine', () => ({
  startAutonomousCampaign: vi.fn(),
  getCampaignStatus: vi.fn(),
}));

vi.mock('@/lib/credit-service', () => ({
  checkCreditSufficiency: vi.fn().mockResolvedValue({ sufficient: true, balance: 100, shortfall: 0 }),
  CREDIT_COSTS: {},
}));

vi.mock('@/lib/sequence-execution-engine', () => ({
  enrollLeadInSequence: vi.fn(),
  enrollMultipleLeads: vi.fn(),
  getSequenceAnalytics: vi.fn(),
}));

import { GET as listWorkflowsRoute, POST as createWorkflowRoute } from '@/app/api/workflows/route';
import { POST as startCampaignRoute } from '@/app/api/autonomous/campaign/route';
import { POST as enrollRoute } from '@/app/api/outreach/enroll/route';
import { PUT as updateMeetingSettings } from '@/app/api/meetings/settings/route';
import { listWorkflows, createWorkflow } from '@/lib/workflow-service';
import { startAutonomousCampaign } from '@/lib/autonomous-outreach-engine';
import { enrollLeadInSequence } from '@/lib/sequence-execution-engine';

function req(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
}

async function expectPlanRequired(res: Response, requiredPlan = 'pro') {
  expect(res.status).toBe(403);
  const body = await res.json();
  expect(body.code).toBe('PLAN_REQUIRED');
  expect(body.requiredPlan).toBe(requiredPlan);
  return body;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.plan = 'free';
  state.db.userSettings.upsert.mockReset();
  state.db.auditLog.create.mockReset();
});

describe('GET /api/workflows — automation is Pro/Elite only', () => {
  it('403 PLAN_REQUIRED for a Free user and never lists workflows', async () => {
    state.plan = 'free';
    const res = await listWorkflowsRoute(req('http://x/api/workflows', 'GET'));
    await expectPlanRequired(res);
    expect(listWorkflows).not.toHaveBeenCalled();
  });

  it('403 PLAN_REQUIRED for a Starter user', async () => {
    state.plan = 'starter';
    const res = await listWorkflowsRoute(req('http://x/api/workflows', 'GET'));
    await expectPlanRequired(res);
    expect(listWorkflows).not.toHaveBeenCalled();
  });

  it('200 for a Pro user (gate passes through to the service)', async () => {
    state.plan = 'pro';
    const res = await listWorkflowsRoute(req('http://x/api/workflows', 'GET'));
    expect(res.status).toBe(200);
    expect(listWorkflows).toHaveBeenCalledTimes(1);
  });

  it('POST /api/workflows is denied for Free before the workflow service runs', async () => {
    state.plan = 'free';
    const res = await createWorkflowRoute(req('http://x/api/workflows', 'POST', { name: 'W', triggerType: 'manual' }));
    await expectPlanRequired(res);
    expect(createWorkflow).not.toHaveBeenCalled();
  });
});

describe('POST /api/autonomous/campaign — agent automation is Pro/Elite only', () => {
  it('403 PLAN_REQUIRED for a Starter user and the campaign engine never starts', async () => {
    state.plan = 'starter';
    const res = await startCampaignRoute(
      req('http://x/api/autonomous/campaign', 'POST', { niche: 'dentists', country: 'India' }),
    );
    await expectPlanRequired(res);
    expect(startAutonomousCampaign).not.toHaveBeenCalled();
  });

  it('403 PLAN_REQUIRED for a Free user', async () => {
    state.plan = 'free';
    const res = await startCampaignRoute(
      req('http://x/api/autonomous/campaign', 'POST', { niche: 'dentists', country: 'India' }),
    );
    await expectPlanRequired(res);
    expect(startAutonomousCampaign).not.toHaveBeenCalled();
  });
});

describe('POST /api/outreach/enroll — sequence automation follows outreach_sequences', () => {
  it('403 PLAN_REQUIRED for a Free user and no enrollment happens', async () => {
    state.plan = 'free';
    const res = await enrollRoute(
      req('http://x/api/outreach/enroll', 'POST', { leadId: 'lead-1', sequenceId: 'seq-1' }),
    );
    await expectPlanRequired(res);
    expect(enrollLeadInSequence).not.toHaveBeenCalled();
  });
});

describe('PUT /api/meetings/settings — autonomy-mode field gate', () => {
  const SETTINGS_ROW = {
    id: 'set-1', userId: 'u1', meetingPlatform: 'google_meet', meetingDurationDefault: 30,
    meetingBufferMinutes: 15, meetingWorkingHoursStart: '09:00', meetingWorkingHoursEnd: '18:00',
    meetingWorkingDays: '[1,2,3,4,5]', meetingTimezone: 'UTC', meetingAutoSchedule: false,
    meetingAutonomyMode: 'approval', meetingRemindersEnabled: true, meetingReminderMinutes: '[60]',
    meetingEmailConfirmation: true, meetingEmailReminder: true, calendarSyncEnabled: false,
    calendarWatchEnabled: false,
  };

  it('Free user cannot switch to autonomous mode (403 PLAN_REQUIRED)', async () => {
    state.plan = 'free';
    const res = await updateMeetingSettings(
      req('http://x/api/meetings/settings', 'PUT', { meetingAutonomyMode: 'autonomous' }),
    );
    await expectPlanRequired(res);
    expect(state.db.userSettings.upsert).not.toHaveBeenCalled();
  });

  it('Free user cannot switch to assisted mode either', async () => {
    state.plan = 'free';
    const res = await updateMeetingSettings(
      req('http://x/api/meetings/settings', 'PUT', { meetingAutonomyMode: 'assisted' }),
    );
    await expectPlanRequired(res);
  });

  it('Free user CAN keep/update manual approval mode (basic settings unaffected)', async () => {
    state.plan = 'free';
    state.db.userSettings.upsert.mockResolvedValue(SETTINGS_ROW);
    state.db.auditLog.create.mockResolvedValue({});

    const res = await updateMeetingSettings(
      req('http://x/api/meetings/settings', 'PUT', { meetingAutonomyMode: 'approval' }),
    );
    expect(res.status).toBe(200);
    expect(state.db.userSettings.upsert).toHaveBeenCalled();
  });

  it('Pro user can enable autonomous mode', async () => {
    state.plan = 'pro';
    state.db.userSettings.upsert.mockResolvedValue({ ...SETTINGS_ROW, meetingAutonomyMode: 'autonomous' });
    state.db.auditLog.create.mockResolvedValue({});

    const res = await updateMeetingSettings(
      req('http://x/api/meetings/settings', 'PUT', { meetingAutonomyMode: 'autonomous' }),
    );
    expect(res.status).toBe(200);
    expect(state.db.userSettings.upsert).toHaveBeenCalled();
  });

  it('invalid autonomy mode is still a 400 before the plan check', async () => {
    state.plan = 'free';
    const res = await updateMeetingSettings(
      req('http://x/api/meetings/settings', 'PUT', { meetingAutonomyMode: 'bogus' }),
    );
    expect(res.status).toBe(400);
  });
});
