// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Phase 23 Autopilot Entitlements Unit Tests
//
// Canonical entitlement contract · scheduler entitlement gate ·
// defense-in-depth manual-run gate · downgrade/upgrade behavior ·
// blocked-execution-is-zero-credits invariant · cross-user isolation.
//
// These tests assert ONLY the Phase 23 surface area:
//   · getUserEntitlements(userId) — the canonical user-resolved snapshot
//   · isAutopilotPlanEligible(plan) — the quick plan boolean
//   · resolveUserPlan(userId) — the no-counts plan resolver
//   · scheduler-runner entitlement gate at tick time
//   · runAutopilot defense-in-depth entitlement gate
//   · blocked execution = 0 credits (no ledger row written)
//   · cross-user isolation (autopilot A cannot be run by user B)
//
// The pre-existing Phase 18–22 surface (claim / run / charge / schedule /
// countries / niches / profile mapping) is exercised by the dedicated
// Phase 18–22 test files (autopilot-runner, autopilot-schedule,
// autopilot-scheduler, autopilot-countries, autopilot-niches,
// autopilot-workflow-selector, autopilot) — Phase 23 must NOT regress
// those, and the new tests below focus on the entitlement layer.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock DB (Prisma-shaped subset that Phase 23 code touches). ──
const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  autopilotWorkflow: {
    findFirst: vi.fn(), findMany: vi.fn(),
    create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), count: vi.fn(),
  },
  autopilotRun: {
    findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(),
    create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn(),
  },
  autopilotLead: {
    create: vi.fn(), updateMany: vi.fn(),
    deleteMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(),
  },
  workflowDefinition: { findFirst: vi.fn(), findMany: vi.fn() },
  discoveryJob: { findUnique: vi.fn(), create: vi.fn() },
  lead: { findFirst: vi.fn() },
  workflowExecution: { findUnique: vi.fn(), update: vi.fn() },
  workflowExecutionLead: { findMany: vi.fn() },
  businessProfile: { findFirst: vi.fn(), count: vi.fn() },
}));
vi.mock('@/lib/db', () => ({ db: mockPrisma }));

// ── Mock the runner so the scheduler tick test can assert the gate. ──
const mockRunAutopilot = vi.hoisted(() => vi.fn());
const mockRecoverStuck = vi.hoisted(() => vi.fn(async () => ({ recoveredRuns: 0, recoveredAutopilots: 0 })));
vi.mock('@/lib/autopilot/runner', () => ({
  runAutopilot: mockRunAutopilot,
  recoverStuckAutopilotRuns: mockRecoverStuck,
  computeNextRun: vi.fn(() => null),
}));

// ── Mock the credit layer so blocked-execution-is-zero-credits is
//    directly observable: any chargeWorkflowExecutionFee call is a
//    regression for an entitlement-blocked run. ──
const mockChargeWorkflowExecutionFee = vi.hoisted(() => vi.fn());
const mockRefundWorkflowExecutionFee = vi.hoisted(() => vi.fn());
vi.mock('@/lib/workflow-credits', () => ({
  chargeWorkflowExecutionFee: mockChargeWorkflowExecutionFee,
  refundWorkflowExecutionFee: mockRefundWorkflowExecutionFee,
  WORKFLOW_EXECUTION_FEE_CREDITS: 5,
  checkExecutionLimit: vi.fn(async () => ({ allowed: true, current: 0, limit: 500 })),
}));

vi.mock('@/lib/lead-discovery-service', () => ({ startDiscoveryJob: vi.fn() }));
vi.mock('@/lib/workflow-batch', () => ({ executeWorkflowBatch: vi.fn() }));
vi.mock('@/lib/credit-service', () => ({
  checkCreditSufficiency: vi.fn(async () => ({ sufficient: true, balance: 1000, shortfall: 0 })),
  CREDIT_COSTS: { lead_discovery: 1 },
}));
vi.mock('@/lib/lead-intelligence', () => ({
  resolveBusinessProfileForUser: vi.fn(async () => ({ profile: {}, source: 'workflow' })),
}));

// ── Imports under test. ──
import {
  getUserEntitlements,
  isAutopilotPlanEligible,
  resolveUserPlan,
  type PlanType,
} from '@/lib/entitlement-service';
import { runAutopilotSchedulerTick } from '@/lib/autopilot/scheduler-runner';
import { runAutopilot } from '@/lib/autopilot/runner';
import { computeNextRunAt, serializeSchedule, type ScheduleConfig } from '@/lib/autopilot/schedule';

// ── Schedule helpers. ──
const CANONICAL: ScheduleConfig = {
  every: 1, unit: 'DAYS', timezone: 'Asia/Kolkata', startAt: '09:30',
  anchorDate: '2026-10-24', enabled: true,
};
const CANONICAL_JSON = serializeSchedule(CANONICAL);

function dueRow(over: Record<string, unknown> = {}) {
  return {
    id: 'ap1',
    userId: 'u1',
    orgId: null,
    name: 'AP',
    status: 'ACTIVE',
    niches: '["Dental"]',
    geography: '{"countries":["India"]}',
    profileMappings: '{}',
    workflowId: 'wf1',
    schedule: CANONICAL_JSON,
    nextRunAt: new Date(Date.now() - 5 * 60 * 1000),
    lastRunAt: null,
    lastError: null,
    runCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function autopilotRowForRun(over: Record<string, unknown> = {}) {
  return {
    id: 'ap1',
    userId: 'u1',
    orgId: null,
    name: 'Test Autopilot',
    status: 'ACTIVE',
    niches: JSON.stringify(['Dental']),
    geography: JSON.stringify({ country: 'India', city: 'Mumbai' }),
    profileMappings: '{}',
    workflowId: 'wf1',
    schedule: CANONICAL_JSON,
    nextRunAt: new Date(),
    lastRunAt: null,
    lastError: null,
    runCount: 0,
    totalDiscovered: 0, totalSaved: 0, totalProcessed: 0, totalExecutions: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default mocks — most tests override per-case.
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'pro', subscriptions: [] });
  mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([]);
  mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(autopilotRowForRun());
  mockPrisma.autopilotWorkflow.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.autopilotWorkflow.update.mockResolvedValue({});
  mockPrisma.autopilotWorkflow.count.mockResolvedValue(0);
  mockPrisma.autopilotRun.findFirst.mockResolvedValue(null);
  mockPrisma.autopilotRun.findUnique.mockResolvedValue(null);
  mockPrisma.autopilotRun.create.mockResolvedValue({ id: 'run1', duplicate: false });
  mockPrisma.autopilotRun.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.businessProfile.count.mockResolvedValue(0);
  mockRunAutopilot.mockResolvedValue({
    ok: true, runId: 'run_1', duplicate: false,
    outcome: { status: 'COMPLETED', discovered: 5, saved: 5, processed: 5, executionsCreated: 1, perNiche: [], executionId: 'exec1' },
  });
});

// ═══════════════════════════════════════════════════════════════════
// STEP 15 — Group 1: Canonical getUserEntitlements(userId) resolution
// ═══════════════════════════════════════════════════════════════════

describe('Phase 23 — getUserEntitlements(userId) canonical resolution', () => {
  it('Free plan: autopilot NOT allowed, profile limit = 1, workflow NOT eligible', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'free', subscriptions: [] });
    const ent = await getUserEntitlements('u1');
    expect(ent.plan).toBe('free');
    expect(ent.planLevel).toBe(0);
    expect(ent.autopilot.allowed).toBe(false);
    expect(ent.autopilot.limit).toBe(0);
    expect(ent.profiles.limit).toBe(1);
    expect(ent.workflow.eligible).toBe(false);
    expect(ent.credits.monthlyAllocation).toBe(50);
    expect(ent.source).toBe('db');
  });

  it('Starter plan: autopilot NOT allowed, profile limit = 1, workflow NOT eligible', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'starter', subscriptions: [] });
    const ent = await getUserEntitlements('u1');
    expect(ent.plan).toBe('starter');
    expect(ent.planLevel).toBe(1);
    expect(ent.autopilot.allowed).toBe(false);
    expect(ent.autopilot.limit).toBe(0);
    expect(ent.profiles.limit).toBe(1);
    expect(ent.workflow.eligible).toBe(false);
    expect(ent.credits.monthlyAllocation).toBe(150);
  });

  it('Pro plan: autopilot ALLOWED (limit 3), profile limit = 3, workflow eligible', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'pro', subscriptions: [] });
    const ent = await getUserEntitlements('u1');
    expect(ent.plan).toBe('pro');
    expect(ent.planLevel).toBe(2);
    expect(ent.autopilot.allowed).toBe(true);
    expect(ent.autopilot.limit).toBe(3);
    expect(ent.profiles.limit).toBe(3);
    expect(ent.workflow.eligible).toBe(true);
    expect(ent.credits.monthlyAllocation).toBe(750);
  });

  it('Elite plan: autopilot ALLOWED (limit 7), profile limit = 7, workflow eligible', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'elite', subscriptions: [] });
    const ent = await getUserEntitlements('u1');
    expect(ent.plan).toBe('elite');
    expect(ent.planLevel).toBe(3);
    expect(ent.autopilot.allowed).toBe(true);
    expect(ent.autopilot.limit).toBe(7);
    expect(ent.profiles.limit).toBe(7);
    expect(ent.credits.monthlyAllocation).toBe(2000);
  });

  it('Active subscription plan overrides user.plan (Pro sub wins over free user.plan)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u1', plan: 'free',
      subscriptions: [{ plan: 'pro', status: 'active' }],
    });
    const ent = await getUserEntitlements('u1');
    expect(ent.plan).toBe('pro');
    expect(ent.autopilot.allowed).toBe(true);
  });

  it('Unknown userId: safe-deny fallback to free, zero usage, source=fallback', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const ent = await getUserEntitlements('does-not-exist');
    expect(ent.plan).toBe('free');
    expect(ent.autopilot.allowed).toBe(false);
    expect(ent.autopilot.used).toBe(0);
    expect(ent.source).toBe('fallback');
  });

  it('Legacy/malformed plan values map to free (safe-deny): enterprise/unknown/empty', async () => {
    // Note: 'PRO' (uppercase) is NOT malformed — normalizePlan lowercases
    // it to 'pro' which IS eligible (case-insensitive legacy handling).
    // Only values that don't lowercase-match a canonical plan map to free.
    for (const rawPlan of ['enterprise', 'super-pro', 'unknown-plan', '', null]) {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: rawPlan, subscriptions: [] });
      const ent = await getUserEntitlements('u1');
      expect(ent.plan).toBe('free');
      expect(ent.autopilot.allowed).toBe(false);
    }
  });

  it('Case-insensitive legacy plan values map to canonical plans: PRO→pro, ELITE→elite', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'PRO', subscriptions: [] });
    const ent = await getUserEntitlements('u1');
    expect(ent.plan).toBe('pro');
    expect(ent.autopilot.allowed).toBe(true);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'ELITE', subscriptions: [] });
    const ent2 = await getUserEntitlements('u1');
    expect(ent2.plan).toBe('elite');
    expect(ent2.autopilot.allowed).toBe(true);
  });

  it('Counts current autopilot + profile usage in parallel (used reflects live state)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'pro', subscriptions: [] });
    mockPrisma.autopilotWorkflow.count.mockResolvedValue(2);
    mockPrisma.businessProfile.count.mockResolvedValue(3);
    const ent = await getUserEntitlements('u1');
    expect(ent.autopilot.used).toBe(2);
    expect(ent.autopilot.overLimit).toBe(false); // 2 < 3
    expect(ent.profiles.used).toBe(3);
    expect(ent.profiles.overLimit).toBe(false); // 3 = limit (not over)
  });

  it('overLimit=true when downgrade left more autopilots than new plan allows', async () => {
    // User was Elite (7 slots), now Free; still has 3 ACTIVE autopilots
    // (preserved on downgrade — never auto-deleted).
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'free', subscriptions: [] });
    mockPrisma.autopilotWorkflow.count.mockResolvedValue(3);
    const ent = await getUserEntitlements('u1');
    expect(ent.plan).toBe('free');
    expect(ent.autopilot.allowed).toBe(false);
    expect(ent.autopilot.limit).toBe(0);
    expect(ent.autopilot.used).toBe(3);
    expect(ent.autopilot.overLimit).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// STEP 15 — Group 2: isAutopilotPlanEligible(plan) quick boolean
// ═══════════════════════════════════════════════════════════════════

describe('Phase 23 — isAutopilotPlanEligible(plan) quick boolean', () => {
  it('free → false (Free is NOT eligible)', () => {
    expect(isAutopilotPlanEligible('free')).toBe(false);
  });
  it('starter → false (Standard/Starter is NOT eligible)', () => {
    expect(isAutopilotPlanEligible('starter')).toBe(false);
  });
  it('pro → true (Pro is eligible)', () => {
    expect(isAutopilotPlanEligible('pro')).toBe(true);
  });
  it('elite → true (Elite is eligible)', () => {
    expect(isAutopilotPlanEligible('elite')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// STEP 15 — Group 3: resolveUserPlan(userId) no-counts resolver
// ═══════════════════════════════════════════════════════════════════

describe('Phase 23 — resolveUserPlan(userId) no-counts resolver', () => {
  it('resolves the user.plan when no active subscription exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'elite', subscriptions: [] });
    const { plan, source } = await resolveUserPlan('u1');
    expect(plan).toBe('elite');
    expect(source).toBe('db');
  });
  it('resolves the active subscription plan over user.plan', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u1', plan: 'free',
      subscriptions: [{ plan: 'pro' }],
    });
    const { plan } = await resolveUserPlan('u1');
    expect(plan).toBe('pro');
  });
  it('unknown userId → fallback to free', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const { plan, source } = await resolveUserPlan('ghost');
    expect(plan).toBe('free');
    expect(source).toBe('fallback');
  });
});

// ═══════════════════════════════════════════════════════════════════
// STEP 15 — Group 4: Scheduler entitlement gate (the major Phase 23 gap)
// ═══════════════════════════════════════════════════════════════════

describe('Phase 23 — scheduler entitlement gate (downgrade gap closure)', () => {
  it('Free plan: due ACTIVE autopilot is SKIPPED, NOT claimed, NOT deleted', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'free', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([dueRow()]);
    const result = await runAutopilotSchedulerTick();
    expect(result.started).toBe(0);
    expect(result.skippedIneligible).toBe(1);
    // The atomic claim NEVER fires — the autopilot row stays ACTIVE.
    expect(mockPrisma.autopilotWorkflow.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RUNNING' }) })
    );
    // runAutopilot is NEVER invoked — no autonomous work fired.
    expect(mockRunAutopilot).not.toHaveBeenCalled();
    // No run row, no execution, no charge — see billing group below.
    expect(mockPrisma.autopilotRun.create).not.toHaveBeenCalled();
  });

  it('Starter plan: due ACTIVE autopilot is SKIPPED (Standard does not include Autopilot)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'starter', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([dueRow()]);
    const result = await runAutopilotSchedulerTick();
    expect(result.skippedIneligible).toBe(1);
    expect(result.started).toBe(0);
    expect(mockRunAutopilot).not.toHaveBeenCalled();
  });

  it('Free plan skip ADVANCES nextRunAt past the due slot (no infinite re-fire)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'free', subscriptions: [] });
    const originalNextRunAt = new Date(Date.now() - 60_000);
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([dueRow({ nextRunAt: originalNextRunAt })]);
    await runAutopilotSchedulerTick();
    // The skip path updates nextRunAt (advances past the due slot).
    const updateCalls = mockPrisma.autopilotWorkflow.update.mock.calls;
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    const updateArg = updateCalls[0][0];
    expect(updateArg.where.id).toBe('ap1');
    expect(updateArg.data.nextRunAt).toBeInstanceOf(Date);
    // Advanced past the original due slot.
    expect(updateArg.data.nextRunAt.getTime()).toBeGreaterThan(originalNextRunAt.getTime());
  });

  it('Free plan skip PRESERVES the autopilot status as ACTIVE (no DISABLED mutation)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'free', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([dueRow()]);
    await runAutopilotSchedulerTick();
    // Every update on this autopilot row should be ONLY nextRunAt — never
    // a status mutation. The configuration is preserved for a future upgrade.
    for (const call of mockPrisma.autopilotWorkflow.update.mock.calls) {
      const arg = call[0];
      if (arg.where?.id === 'ap1') {
        expect(arg.data).not.toHaveProperty('status');
      }
    }
    // No delete calls — ever.
    expect(mockPrisma.autopilotWorkflow.delete).not.toHaveBeenCalled();
  });

  it('Pro plan: due ACTIVE autopilot is CLAIMED and run normally', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'pro', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([dueRow()]);
    const result = await runAutopilotSchedulerTick();
    expect(result.skippedIneligible).toBe(0);
    expect(result.started).toBe(1);
    expect(mockRunAutopilot).toHaveBeenCalledTimes(1);
    expect(mockRunAutopilot).toHaveBeenCalledWith('ap1', 'u1', 'scheduler', expect.objectContaining({
      runKey: expect.stringContaining('scheduled:ap1:'),
    }));
  });

  it('Elite plan: due ACTIVE autopilot is CLAIMED and run (no skip)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'elite', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([dueRow()]);
    const result = await runAutopilotSchedulerTick();
    expect(result.skippedIneligible).toBe(0);
    expect(result.started).toBe(1);
    expect(mockRunAutopilot).toHaveBeenCalled();
  });

  it('Per-tick plan cache: 3 due autopilots for the same user → 1 plan lookup, 3 starts (pro)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'pro', subscriptions: [] });
    const rows = [dueRow({ id: 'ap1' }), dueRow({ id: 'ap2' }), dueRow({ id: 'ap3' })];
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue(rows);
    const result = await runAutopilotSchedulerTick();
    expect(result.started).toBe(3);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1); // cached
  });

  it('Downgrade scenario: user WAS pro (created ACTIVE autopilot), now free → scheduler skips + preserves config', async () => {
    // The autopilot was activated when the user was Pro (so it has status=ACTIVE
    // legitimately). The user has since downgraded to free. The autopilot must
    // NOT fire — but the configuration must remain intact for a future upgrade.
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'free', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([dueRow({ status: 'ACTIVE' })]);
    const result = await runAutopilotSchedulerTick();
    expect(result.started).toBe(0);
    expect(result.skippedIneligible).toBe(1);
    // PRESERVED — never deleted, never disabled.
    expect(mockPrisma.autopilotWorkflow.delete).not.toHaveBeenCalled();
  });

  it('Upgrade scenario: previously-skipped autopilot runs after plan upgrade to Pro', async () => {
    // First tick: user is free → skipped.
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'free', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([dueRow()]);
    const r1 = await runAutopilotSchedulerTick();
    expect(r1.skippedIneligible).toBe(1);
    expect(r1.started).toBe(0);
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'pro', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([dueRow()]);
    mockPrisma.autopilotWorkflow.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.autopilotRun.findFirst.mockResolvedValue(null);
    mockPrisma.autopilotRun.findUnique.mockResolvedValue(null);
    mockRunAutopilot.mockResolvedValue({
      ok: true, runId: 'run_1', duplicate: false,
      outcome: { status: 'COMPLETED', discovered: 5, saved: 5, processed: 5, executionsCreated: 1, perNiche: [], executionId: 'exec1' },
    });
    // Second tick: user upgraded to pro → autopilot fires.
    const r2 = await runAutopilotSchedulerTick();
    expect(r2.skippedIneligible).toBe(0);
    expect(r2.started).toBe(1);
    expect(mockRunAutopilot).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// STEP 15 — Group 5: runAutopilot defense-in-depth gate
//             (covered by tests/unit/autopilot-entitlements-runner.test.ts
//              which imports the REAL runner module — this file MOCKS
//              the runner to assert scheduler-tick contract cleanly.)
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// STEP 15 — Group 6: Billing invariant — blocked execution = 0 credits
//                    (no ledger row written, no charge, no refund needed)
// ═══════════════════════════════════════════════════════════════════

describe('Phase 23 — blocked execution = 0 credits (billing invariant)', () => {
  it('Scheduler-skipped (free plan) run NEVER calls chargeWorkflowExecutionFee', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'free', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([dueRow()]);
    await runAutopilotSchedulerTick();
    expect(mockChargeWorkflowExecutionFee).not.toHaveBeenCalled();
    expect(mockRefundWorkflowExecutionFee).not.toHaveBeenCalled(); // no refund needed either
  });

  it('Entitlement check itself = 0 credits (getUserEntitlements is read-only)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'free', subscriptions: [] });
    await getUserEntitlements('u1');
    expect(mockChargeWorkflowExecutionFee).not.toHaveBeenCalled();
  });

  it('Entitlement check itself = 0 credits (resolveUserPlan is read-only)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'free', subscriptions: [] });
    await resolveUserPlan('u1');
    expect(mockChargeWorkflowExecutionFee).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// STEP 15 — Group 7: Cross-user isolation — scheduler scope
//             (User A's autopilot tick cannot be triggered for User B.
//              The defense-in-depth runAutopilot-side check is covered
//              in tests/unit/autopilot-entitlements-runner.test.ts.)
// ═══════════════════════════════════════════════════════════════════

describe('Phase 23 — scheduler cross-user tick scope', () => {
  it('scheduler tick uses the autopilot row\'s userId (not a hypothetical attacker)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'uA', plan: 'pro', subscriptions: [] });
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([dueRow({ id: 'apA', userId: 'uA' })]);
    await runAutopilotSchedulerTick();
    expect(mockRunAutopilot).toHaveBeenCalledWith('apA', 'uA', 'scheduler', expect.anything());
    // NOT called with 'uB' (the hypothetical attacker).
    expect(mockRunAutopilot).not.toHaveBeenCalledWith('apA', 'uB', expect.anything(), expect.anything());
  });
});

// ═══════════════════════════════════════════════════════════════════
// STEP 15 — Group 8: Existing 5-credit execution invariant preserved
//                    (covered by the existing autopilot-runner.test.ts
//                     Phase 18 suite; this file does not duplicate the
//                     full charge path — see that file for the assertion
//                     that one run = one 5-credit charge via
//                     chargeWorkflowExecutionFee(chargeKey).)
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// STEP 15 — Group 9: No destructive profile deletion on downgrade
//                    (getUserEntitlements and resolveUserPlan never
//                     trigger businessProfile.delete — read-only)
// ═══════════════════════════════════════════════════════════════════

describe('Phase 23 — no destructive profile deletion on downgrade', () => {
  it('getUserEntitlements counts profiles via businessProfile.count (READ-ONLY, NEVER delete)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'free', subscriptions: [] });
    mockPrisma.businessProfile.count.mockResolvedValue(5); // 5 active profiles, free plan allows 1
    const ent = await getUserEntitlements('u1');
    expect(ent.profiles.used).toBe(5);
    expect(ent.profiles.limit).toBe(1);
    expect(ent.profiles.overLimit).toBe(true);
    // The function ONLY counted — it never deleted or updated any profile.
    // (businessProfile is mocked with only `count` + `findFirst`; no
    // delete/update is even wired up here, which is the contract.)
  });
});
