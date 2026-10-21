// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Part 1 — Scheduler Consecutive-Failure Circuit Breaker
//
// Covers processScheduledTriggers (workflow-triggers.ts):
//   1. A scheduled workflow whose last 3 executions ALL failed (or
//      exhausted) is NOT fired again — one honest attention
//      notification (deduped per workflow), executeWorkflow never
//      called. This is the source-level fix for the notification
//      storm (one failure notification per scheduled run, 100+ total).
//   2. Any non-failed recent execution (completed/cancelled/running)
//      breaks the streak — scheduling re-enables naturally.
//   3. Fewer than 3 recent executions never trips the breaker.
//   4. 'exhausted' counts as a failure for the streak.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    workflowDefinition: { findMany: vi.fn() },
    workflowExecution: { findMany: vi.fn() },
  },
  executeWorkflow: vi.fn(),
  createNotificationOnce: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/workflow-engine', () => ({ executeWorkflow: mocks.executeWorkflow }));
vi.mock('@/lib/notification-service', () => ({
  createNotificationOnce: mocks.createNotificationOnce,
}));

import {
  processScheduledTriggers,
  CONSECUTIVE_FAILURE_BREAKER,
} from '@/lib/workflow-triggers';

// The SCHEDULED workflow under test. frequency 'interval' with
// intervalMinutes 1 fires on every tick (minute-of-day % 1 === 0), so the
// schedule evaluator is deterministic in tests.
const SCHEDULED_WF = {
  id: 'wf_s',
  userId: 'user_1',
  name: 'Nightly Outreach',
  triggerConfig: JSON.stringify({ frequency: 'interval', intervalMinutes: 1 }),
};

function primeRecentExecutions(statuses: string[]) {
  mocks.db.workflowExecution.findMany.mockImplementation(
    async ({ take }: { take?: number }) =>
      statuses.slice(0, take ?? statuses.length).map((status) => ({ status })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.workflowDefinition.findMany.mockResolvedValue([SCHEDULED_WF]);
  mocks.executeWorkflow.mockResolvedValue({ executionId: 'exec_new', status: 'running' });
  mocks.createNotificationOnce.mockResolvedValue({ id: 'notif_1', duplicate: false });
});

describe('Part 1 — scheduler consecutive-failure circuit breaker', () => {
  it('does NOT fire a workflow whose last runs all failed, and sends exactly ONE deduped notification', async () => {
    primeRecentExecutions(['failed', 'failed', 'failed']);

    const fired = await processScheduledTriggers();

    expect(fired).toEqual([]);
    expect(mocks.executeWorkflow).not.toHaveBeenCalled();

    // Exactly one attention notification — deduped per workflow, so
    // subsequent ticks add NOTHING (the dedupeKey has no time window).
    expect(mocks.createNotificationOnce).toHaveBeenCalledTimes(1);
    const call = mocks.createNotificationOnce.mock.calls[0][0] as {
      userId: string;
      dedupeKey: string;
      metadata: { workflowId: string; schedulerPaused: boolean };
    };
    expect(call.userId).toBe('user_1');
    expect(call.dedupeKey).toBe(`wfsched:wf_s:consecutive-failures`);
    expect(call.metadata.workflowId).toBe('wf_s');
    expect(call.metadata.schedulerPaused).toBe(true);
  });

  it('repeated ticks do not multiply the pause notification (same dedupeKey)', async () => {
    primeRecentExecutions(['failed', 'failed', 'failed']);

    await processScheduledTriggers();
    await processScheduledTriggers();
    await processScheduledTriggers();

    // The engine emits the same logical event each tick; the persistence
    // layer collapses it — asserted here as one call per tick with the
    // IDENTICAL dedupeKey (the layer's dedup contract).
    expect(mocks.createNotificationOnce).toHaveBeenCalledTimes(3);
    const keys = mocks.createNotificationOnce.mock.calls.map(
      (c: unknown[]) => (c[0] as { dedupeKey: string }).dedupeKey,
    );
    expect(new Set(keys).size).toBe(1);
    expect(mocks.executeWorkflow).not.toHaveBeenCalled();
  });

  it('a completed run breaks the streak — scheduling re-enables naturally', async () => {
    // Most recent run completed (user fixed it manually) → fire again.
    primeRecentExecutions(['completed', 'failed', 'failed']);

    const fired = await processScheduledTriggers();

    expect(fired).toEqual(['exec_new']);
    expect(mocks.executeWorkflow).toHaveBeenCalledTimes(1);
    expect(mocks.createNotificationOnce).not.toHaveBeenCalled();
  });

  it('fewer than CONSECUTIVE_FAILURE_BREAKER recent executions never trips the breaker', async () => {
    expect(CONSECUTIVE_FAILURE_BREAKER).toBe(3);
    primeRecentExecutions(['failed', 'failed']);

    const fired = await processScheduledTriggers();

    expect(fired).toEqual(['exec_new']);
    expect(mocks.executeWorkflow).toHaveBeenCalledTimes(1);
  });

  it("'exhausted' executions count toward the failure streak", async () => {
    primeRecentExecutions(['exhausted', 'exhausted', 'exhausted']);

    const fired = await processScheduledTriggers();

    expect(fired).toEqual([]);
    expect(mocks.executeWorkflow).not.toHaveBeenCalled();
    expect(mocks.createNotificationOnce).toHaveBeenCalledTimes(1);
  });
});
