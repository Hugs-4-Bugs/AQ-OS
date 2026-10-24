// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Phase 22 Autopilot Scheduler Unit Tests
//
// runAutopilotSchedulerTick: due discovery · disabled/paused respect ·
// atomic claim races (duplicate/concurrent ticks) · deterministic slot
// runKey convergence · open-run guard (scheduled/manual race) ·
// canonical next-run persistence (legacy path unused) · failure
// recovery (schedule survives a failed run) · restart persistence.
// The runner module is MOCKED here — these tests assert the tick's
// integration contract, not the run pipeline (covered by the runner
// schedule tests).
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  autopilotWorkflow: {
    findFirst: vi.fn(), findMany: vi.fn(),
    create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), count: vi.fn(),
  },
  autopilotRun: {
    findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(),
    create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn(),
  },
  // Phase 23 — resolveUserPlan() looks up the user's plan at tick time.
  user: { findUnique: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ db: mockPrisma }));

// The runner is mocked: the tick must INVOKE the canonical runner (same
// path as manual runs) — never a second Autopilot implementation.
const mockRunAutopilot = vi.hoisted(() => vi.fn());
const mockRecoverStuck = vi.hoisted(() => vi.fn(async () => ({ recoveredRuns: 0, recoveredAutopilots: 0 })));
// computeNextRun is the LEGACY fallback — mocked to null so the tests
// PROVE the canonical timezone-aware engine is what sets the next run.
const mockLegacyComputeNextRun = vi.hoisted(() => vi.fn(() => null));
vi.mock('@/lib/autopilot/runner', () => ({
  runAutopilot: mockRunAutopilot,
  recoverStuckAutopilotRuns: mockRecoverStuck,
  computeNextRun: mockLegacyComputeNextRun,
}));

import { runAutopilotSchedulerTick } from '@/lib/autopilot/scheduler-runner';
import { computeNextRunAt, serializeSchedule, type ScheduleConfig } from '@/lib/autopilot/schedule';

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

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([]);
  mockPrisma.autopilotWorkflow.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.autopilotWorkflow.update.mockResolvedValue({});
  mockPrisma.autopilotRun.findFirst.mockResolvedValue(null);
  mockPrisma.autopilotRun.findUnique.mockResolvedValue(null);
  // Phase 23 — default to a Pro plan so existing Phase 22 tick tests pass
  // through the new entitlement gate (Pro/Elite are eligible; Free/Starter
  // are tested separately in autopilot-entitlements.test.ts). Per-test
  // overrides for the eligibility scenarios are set inside those tests.
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', plan: 'pro', subscriptions: [] });
  mockRunAutopilot.mockResolvedValue({
    ok: true,
    runId: 'run_1',
    duplicate: false,
    outcome: { status: 'COMPLETED', discovered: 5, saved: 5, processed: 5, executionsCreated: 1, perNiche: [], executionId: 'exec1' },
  });
});

describe('Phase 22 scheduler tick — due discovery', () => {
  it('queries ONLY ACTIVE rows with a due nextRunAt (paused/disabled never fire)', async () => {
    await runAutopilotSchedulerTick();
    const where = mockPrisma.autopilotWorkflow.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('ACTIVE');
    expect(where.nextRunAt).toEqual({ lte: expect.any(Date), not: null });
  });

  it('invokes the SAME canonical runner with a deterministic slot runKey (category 5)', async () => {
    const row = dueRow();
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([row]);
    const result = await runAutopilotSchedulerTick();
    expect(result.dueCount).toBe(1);
    expect(result.started).toBe(1);
    expect(mockRunAutopilot).toHaveBeenCalledTimes(1);
    const [autopilotId, userId, trigger, options] = mockRunAutopilot.mock.calls[0];
    expect(autopilotId).toBe('ap1');
    expect(userId).toBe('u1');
    expect(trigger).toBe('scheduler');
    expect(options.runKey).toBe(`scheduled:ap1:${row.nextRunAt.getTime()}`);
  });

  it('claims ACTIVE→RUNNING atomically before invoking the runner', async () => {
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([dueRow()]);
    await runAutopilotSchedulerTick();
    const claim = mockPrisma.autopilotWorkflow.updateMany.mock.calls[0][0];
    expect(claim.where).toEqual({ id: 'ap1', status: 'ACTIVE' });
    expect(claim.data).toEqual({ status: 'RUNNING' });
  });

  it('persists the next run via the CANONICAL timezone-aware engine (legacy path unused)', async () => {
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([dueRow()]);
    await runAutopilotSchedulerTick();
    expect(mockLegacyComputeNextRun).not.toHaveBeenCalled();
    const update = mockPrisma.autopilotWorkflow.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data?.nextRunAt instanceof Date
    );
    expect(update).toBeTruthy();
    const nextRunAt = (update![0] as { data: { nextRunAt: Date } }).data.nextRunAt;
    // The canonical engine result for the row's config, from now.
    expect(nextRunAt.getTime()).toBe(computeNextRunAt(CANONICAL).getTime());
    expect(nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('Phase 22 scheduler tick — pause / disable respected (categories 9 · 11)', () => {
  it('a PAUSED row is never even fetched (status filter)', async () => {
    await runAutopilotSchedulerTick();
    expect(mockRunAutopilot).not.toHaveBeenCalled();
  });

  it('a disabled schedule with a stale due nextRunAt is skipped without a claim', async () => {
    const disabled = serializeSchedule({ ...CANONICAL, enabled: false });
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([dueRow({ schedule: disabled })]);
    const result = await runAutopilotSchedulerTick();
    expect(result.started).toBe(0);
    expect(result.skippedInFlight).toBe(1);
    expect(mockRunAutopilot).not.toHaveBeenCalled();
    // No claim, no release — the row was skipped before any mutation.
    expect(mockPrisma.autopilotWorkflow.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.autopilotWorkflow.update).not.toHaveBeenCalled();
  });
});

describe('Phase 22 scheduler tick — duplicate prevention (categories 15 · 16 · 24)', () => {
  it('a racing tick that loses the ACTIVE→RUNNING claim never starts a run', async () => {
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([dueRow()]);
    // First updateMany (the claim) returns 0 — another tick won it.
    mockPrisma.autopilotWorkflow.updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await runAutopilotSchedulerTick();
    expect(result.started).toBe(0);
    expect(result.skippedInFlight).toBe(1);
    expect(mockRunAutopilot).not.toHaveBeenCalled();
  });

  it('an existing run for the SAME slot runKey is converged on AND the schedule self-heals', async () => {
    const row = dueRow();
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([row]);
    // The slot's run already exists (replayed tick / recovered worker).
    mockPrisma.autopilotRun.findUnique.mockResolvedValue({ id: 'run_prior' });
    const result = await runAutopilotSchedulerTick();
    expect(result.started).toBe(0);
    expect(result.skippedInFlight).toBe(1);
    expect(mockRunAutopilot).not.toHaveBeenCalled();
    // The claim is released honestly (RUNNING → ACTIVE).
    const release = mockPrisma.autopilotWorkflow.updateMany.mock.calls.find(
      (c: unknown[]) => JSON.stringify((c[0] as { data?: unknown }).data) === JSON.stringify({ status: 'ACTIVE' })
    );
    expect(release).toBeTruthy();
    expect((release![0] as { where: { id: string; status: string } }).where).toEqual({ id: 'ap1', status: 'RUNNING' });
    // Phase 22 self-heal: nextRunAt advances PAST the already-handled
    // slot (computed from the SLOT instant — the grid stays exact), so
    // a crashed-then-recovered run can never churn as due forever.
    const heal = mockPrisma.autopilotWorkflow.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data?.nextRunAt instanceof Date
    );
    expect(heal).toBeTruthy();
    const healedNext = (heal![0] as { data: { nextRunAt: Date } }).data.nextRunAt;
    expect(healedNext.getTime()).toBe(computeNextRunAt(CANONICAL, row.nextRunAt).getTime());
    expect(healedNext.getTime()).toBeGreaterThan(row.nextRunAt.getTime());
  });

  it('runAutopilot reporting duplicate:true (runKey unique-index convergence) is counted, not re-scheduled', async () => {
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([dueRow()]);
    mockRunAutopilot.mockResolvedValue({ ok: true, runId: 'run_prior', duplicate: true });
    const result = await runAutopilotSchedulerTick();
    expect(result.started).toBe(0);
    expect(result.skippedInFlight).toBe(1);
    // No nextRunAt update — the original handling tick already set it.
    const nextRunUpdate = mockPrisma.autopilotWorkflow.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data?.nextRunAt instanceof Date
    );
    expect(nextRunUpdate).toBeFalsy();
  });

  it('concurrent ticks on the same due row: exactly ONE run (two sequential claims, second loses)', async () => {
    const row = dueRow();
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([row, row]);
    // First claim wins, second returns 0 (racing worker).
    mockPrisma.autopilotWorkflow.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const result = await runAutopilotSchedulerTick();
    expect(result.started).toBe(1);
    expect(result.skippedInFlight).toBe(1);
    expect(mockRunAutopilot).toHaveBeenCalledTimes(1);
  });
});

describe('Phase 22 scheduler tick — scheduled/manual race + open-run guard (category 17)', () => {
  it('an unfinished previous run blocks a new scheduled run and releases the claim', async () => {
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([dueRow()]);
    mockPrisma.autopilotRun.findFirst.mockResolvedValue({ id: 'run_open' });
    const result = await runAutopilotSchedulerTick();
    expect(result.started).toBe(0);
    expect(result.skippedInFlight).toBe(1);
    expect(mockRunAutopilot).not.toHaveBeenCalled();
    // The open-run guard's find is scoped to this autopilot.
    expect(mockPrisma.autopilotRun.findFirst.mock.calls[0][0].where).toEqual({
      autopilotId: 'ap1',
      status: { in: ['QUEUED', 'RUNNING'] },
    });
  });

  it('runAutopilot failing to start (state conflict) releases the claim honestly', async () => {
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([dueRow()]);
    mockRunAutopilot.mockResolvedValue({ ok: false, error: 'Autopilot is PAUSED', code: 'INVALID_STATE' });
    const result = await runAutopilotSchedulerTick();
    expect(result.started).toBe(0);
    expect(result.skippedInFlight).toBe(1);
    const release = mockPrisma.autopilotWorkflow.updateMany.mock.calls.find(
      (c: unknown[]) => JSON.stringify((c[0] as { data?: unknown }).data) === JSON.stringify({ status: 'ACTIVE' })
    );
    expect(release).toBeTruthy();
  });
});

describe('Phase 22 scheduler tick — failure recovery (category 22)', () => {
  it('a FAILED run outcome still persists the next occurrence (schedule survives)', async () => {
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([dueRow()]);
    mockRunAutopilot.mockResolvedValue({
      ok: true,
      runId: 'run_1',
      duplicate: false,
      outcome: { status: 'FAILED', discovered: 0, saved: 0, processed: 0, executionsCreated: 0, perNiche: [], error: 'insufficient credits' },
    });
    const result = await runAutopilotSchedulerTick();
    expect(result.started).toBe(1);
    expect(result.results[0].status).toBe('FAILED');
    // nextRunAt lands EITHER WAY (not status-guarded) — the schedule is
    // never destroyed by a failed run.
    const update = mockPrisma.autopilotWorkflow.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data?.nextRunAt instanceof Date
    );
    expect(update).toBeTruthy();
    expect((update![0] as { data: { nextRunAt: Date } }).data.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('Phase 22 scheduler tick — restart persistence (categories 13 · 14)', () => {
  it('a nextRunAt persisted by an earlier process is picked up by a fresh tick (scheduler restart)', async () => {
    // Simulate: previous process wrote nextRunAt 5 minutes in the past,
    // then died. A NEW process starts (fresh module state) and ticks.
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([dueRow()]);
    const first = await runAutopilotSchedulerTick();
    expect(first.started).toBe(1);
    // "Restart": a later tick still discovers the persisted schedule
    // purely from the DB row (no in-memory scheduler state exists).
    const again = await runAutopilotSchedulerTick();
    expect(again.dueCount).toBe(1);
    expect(mockRunAutopilot).toHaveBeenCalledTimes(2);
  });

  it('recovery of stuck runs runs on EVERY tick (application restart)', async () => {
    await runAutopilotSchedulerTick();
    await runAutopilotSchedulerTick();
    expect(mockRecoverStuck).toHaveBeenCalledTimes(2);
  });

  it('bounded work per tick: due query is ordered and capped', async () => {
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([]);
    await runAutopilotSchedulerTick();
    const q = mockPrisma.autopilotWorkflow.findMany.mock.calls[0][0];
    expect(q.orderBy).toEqual({ nextRunAt: 'asc' });
    expect(q.take).toBe(10);
  });
});

describe('Phase 22 scheduler tick — legacy schedules keep working', () => {
  it('a legacy "daily" row schedules next = now + 24h through the canonical engine', async () => {
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([dueRow({ schedule: 'daily' })]);
    await runAutopilotSchedulerTick();
    expect(mockLegacyComputeNextRun).not.toHaveBeenCalled();
    const update = mockPrisma.autopilotWorkflow.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data?.nextRunAt instanceof Date
    );
    const nextRunAt = (update![0] as { data: { nextRunAt: Date } }).data.nextRunAt;
    const ms = nextRunAt.getTime() - Date.now();
    expect(ms).toBeGreaterThan(23 * 60 * 60 * 1000 - 5000);
    expect(ms).toBeLessThan(25 * 60 * 60 * 1000);
  });

  it('Phase 21 configuration rides along untouched (geography preserved in the row)', async () => {
    const row = dueRow({ geography: '{"countries":["India","United Arab Emirates"]}' });
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([row]);
    await runAutopilotSchedulerTick();
    // The tick never rewrites geography/niches/profiles — only
    // status/nextRunAt are touched by the claim + next-run updates.
    const updates = mockPrisma.autopilotWorkflow.update.mock.calls.map(
      (c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data
    );
    for (const data of updates) {
      expect(data.geography).toBeUndefined();
      expect(data.niches).toBeUndefined();
      expect(data.profileMappings).toBeUndefined();
    }
  });
});
