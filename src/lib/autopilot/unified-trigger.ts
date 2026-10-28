// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 1 — Unified Trigger Engine
//
// Single entry point for both time-based and event-based triggers.
// Both funnel into the SAME execution pipeline:
//
//                  AUTOPILOT (heartbeat tick)
//                          │
//               ┌──────────┴──────────┐
//               │                     │
//          TIME TRIGGER          EVENT TRIGGER
//               │                     │
//         daily schedule          new lead
//         hourly schedule          new email
//         follow-up time           webhook
//               │                     │
//               └──────────┬──────────┘
//                          ▼
//                     INVOCATION
//                          ▼
//                    AGENT SESSION
//                          ▼
//                    EXECUTION LOOP
//
// This module does NOT own a scheduler. It is consumed by the EXISTING
// heartbeat (instrumentation.ts → scheduler-runner.ts) so there is
// exactly one scheduler in the system. It exposes:
//
//   · scheduleTriggerTick()  — called from runAutopilotSchedulerTick
//   · eventTriggerTick()     — called from processPendingEvents
//   · claimQueuedInvocation() — called by worker loops (any process)
//
// Background execution is provided by the existing Next.js server
// process — the heartbeat in instrumentation.ts runs every 5 minutes
// via setInterval. The browser is NOT required.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import {
  createOrFetchInvocation,
  type InvocationRecord,
} from './invocation-service';
import { getAutomation, type AutomationRecord } from './automation-service';
import { claimInvocation, recoverExpiredLeases, type ClaimResult } from './worker-lease';
import { initializeCheckpoint, loadCheckpoint } from './checkpoint-service';
import { findDueWakeups, wakeInvocation } from './wait-wake';
import { computeNextRunAt, parsePersistedSchedule } from './schedule';

// ───────────────────────────────────────────────────────────────────
// Default pipeline steps for an invocation. The runner overrides this
// when a more specific step graph is known (e.g. from system-agents.ts).
// ───────────────────────────────────────────────────────────────────

export const DEFAULT_PIPELINE_STEPS = [
  { stepKey: 'discovery', stepName: 'Lead discovery', sequence: 0 },
  { stepKey: 'research', stepName: 'Lead research', sequence: 1 },
  { stepKey: 'qualification', stepName: 'Lead qualification', sequence: 2 },
  { stepKey: 'scoring', stepName: 'Lead scoring', sequence: 3 },
  { stepKey: 'outreach', stepName: 'Outreach composition', sequence: 4 },
  { stepKey: 'followup', stepName: 'Follow-up scheduling', sequence: 5 },
] as const;

// ───────────────────────────────────────────────────────────────────
// TIME TRIGGER  — invoked by the existing heartbeat
// ───────────────────────────────────────────────────────────────────

export interface ScheduleTickResult {
  dueAutomations: number;
  invocationsCreated: number;
  invocationsReused: number; // duplicate ticks (idempotency dedup)
  skippedIneligible: number;
  results: Array<{
    automationId: string;
    invocationId: string;
    triggerType: 'schedule';
    created: boolean;
    error?: string;
  }>;
}

/**
 * Time-based trigger entry point.
 *
 * For every ACTIVE Automation whose nextRunAt has passed, create or
 * fetch a durable invocation with idempotencyKey
 * `schedule:{automationId}:{slotEpochMs}`. Duplicate ticks converge on
 * the same row (idempotency).
 *
 * After creating/fetching, advance nextRunAt to the next slot so the
 * same slot doesn't re-fire on the next tick.
 */
export async function scheduleTriggerTick(input?: {
  /** Override the current time for tests. */
  now?: Date;
  /** Maximum automations per tick. Default 10. */
  limit?: number;
}): Promise<ScheduleTickResult> {
  const now = input?.now ?? new Date();
  const due = await db.autopilotWorkflow.findMany({
    where: {
      status: 'ACTIVE',
      nextRunAt: { lte: now, not: null },
    },
    orderBy: { nextRunAt: 'asc' },
    take: input?.limit ?? 10,
  });

  const results: ScheduleTickResult['results'] = [];
  let created = 0;
  let reused = 0;

  for (const automationRow of due) {
    const automation: AutomationRecord | null = await getAutomation(
      automationRow.id,
      automationRow.userId,
    );
    if (!automation) continue;

    const slotEpochMs = (automation.nextRunAt ?? now).getTime();

    try {
      const { record, created: didCreate } = await createOrFetchInvocation({
        automationId: automation.id,
        userId: automation.userId,
        triggerType: 'schedule',
        slotEpochMs,
      });

      if (didCreate) {
        created++;
        // Initialise the checkpoint graph for new invocations.
        await initializeCheckpoint({
          invocationId: record.id,
          userId: record.userId,
          businessId: record.businessId,
          steps: DEFAULT_PIPELINE_STEPS.map((s) => ({
            stepKey: s.stepKey,
            stepName: s.stepName,
            sequence: s.sequence,
          })),
        });
      } else {
        reused++;
      }

      results.push({
        automationId: automation.id,
        invocationId: record.id,
        triggerType: 'schedule',
        created: didCreate,
      });
    } catch (e: unknown) {
      results.push({
        automationId: automation.id,
        invocationId: '',
        triggerType: 'schedule',
        created: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // Advance nextRunAt to the next slot (anchored wall-clock grid).
    try {
      const parsed = parsePersistedSchedule({
        kind: 'interval',
        interval: automation.schedule as
          | 'hourly'
          | 'every_6_hours'
          | 'every_12_hours'
          | 'daily'
          | 'weekly',
      });
      const next = computeNextRunAt(parsed, now);
      await db.autopilotWorkflow.update({
        where: { id: automation.id },
        data: { nextRunAt: next, lastRunAt: now },
      });
    } catch {
      // If schedule parsing fails, advance by 1 hour to avoid hot-loop.
      await db.autopilotWorkflow.update({
        where: { id: automation.id },
        data: {
          nextRunAt: new Date(now.getTime() + 60 * 60 * 1000),
          lastRunAt: now,
        },
      });
    }
  }

  return {
    dueAutomations: due.length,
    invocationsCreated: created,
    invocationsReused: reused,
    skippedIneligible: 0,
    results,
  };
}

// ───────────────────────────────────────────────────────────────────
// EVENT TRIGGER  — invoked by processPendingEvents in the heartbeat
// ───────────────────────────────────────────────────────────────────

export interface EventTriggerInput {
  userId: string;
  eventType:
    | 'new_lead'
    | 'new_email'
    | 'follow_up_due'
    | 'approval_response'
    | 'external_webhook'
    | 'workflow_completion'
    | 'task_completion';
  /** The AgentEvent row that triggered this. */
  triggerEventId: string;
  /** The matching automationId, if any. */
  automationId?: string;
  /** Optional filter override — usually derived from automation.eventTriggers. */
  businessId?: string;
}

export interface EventTriggerResult {
  matched: number;
  invocationsCreated: number;
  invocationsReused: number;
  results: Array<{
    automationId: string;
    invocationId: string;
    triggerType: 'event';
    created: boolean;
  }>;
}

/**
 * Event-based trigger entry point.
 *
 * For a given AgentEvent, find all ACTIVE Automations that have an
 * enabled eventTrigger matching the event type, then create or fetch
 * an invocation for each with idempotencyKey
 * `event:{automationId}:{triggerEventId}`.
 *
 * Duplicate events (same AgentEvent.id) collapse onto the same row.
 */
export async function eventTriggerTick(input: EventTriggerInput): Promise<EventTriggerResult> {
  // Find automations owned by this user that match this event type.
  // (User isolation: filter userId in the query itself.)
  const candidates = await db.autopilotWorkflow.findMany({
    where: {
      userId: input.userId,
      status: 'ACTIVE',
      ...(input.automationId ? { id: input.automationId } : {}),
      ...(input.businessId ? { businessId: input.businessId } : {}),
    },
    select: {
      id: true,
      userId: true,
      businessId: true,
      eventTriggers: true,
      executionPolicy: true,
    },
  });

  const results: EventTriggerResult['results'] = [];
  let created = 0;
  let reused = 0;

  for (const row of candidates) {
    // Parse the eventTriggers JSON and check if this event type is enabled.
    let triggers: Array<{
      eventType: string;
      enabled: boolean;
    }> = [];
    try {
      const parsed = JSON.parse(row.eventTriggers);
      if (Array.isArray(parsed)) triggers = parsed;
    } catch {
      // malformed eventTriggers — treat as empty (no event triggers).
    }
    const matched = triggers.some(
      (t) => t.eventType === input.eventType && t.enabled,
    );
    if (!matched) continue;

    try {
      const { record, created: didCreate } = await createOrFetchInvocation({
        automationId: row.id,
        userId: row.userId,
        triggerType: 'event',
        triggerEventId: input.triggerEventId,
      });
      if (didCreate) {
        created++;
        await initializeCheckpoint({
          invocationId: record.id,
          userId: record.userId,
          businessId: record.businessId,
          steps: DEFAULT_PIPELINE_STEPS.map((s) => ({
            stepKey: s.stepKey,
            stepName: s.stepName,
            sequence: s.sequence,
          })),
        });
      } else {
        reused++;
      }
      results.push({
        automationId: row.id,
        invocationId: record.id,
        triggerType: 'event',
        created: didCreate,
      });
    } catch (e: unknown) {
      // swallow per-row error — one bad automation shouldn't abort the tick
      results.push({
        automationId: row.id,
        invocationId: '',
        triggerType: 'event',
        created: false,
      });
    }
  }

  return {
    matched: candidates.length,
    invocationsCreated: created,
    invocationsReused: reused,
    results,
  };
}

// ───────────────────────────────────────────────────────────────────
// WORKER POOL DRAIN  — called by the heartbeat to actually execute
// queued invocations. This is the "background execution" half.
// ───────────────────────────────────────────────────────────────────

export interface WorkerDrainResult {
  scanned: number;
  claimed: number;
  reclaimedStaleLeases: number;
  wokenWaits: number;
  results: Array<{
    invocationId: string;
    claimed: ClaimResult['claimed'];
    conflictReason?: ClaimResult['conflictReason'];
  }>;
}

/**
 * Drain the queue: claim QUEUED invocations whose nextRetryAt (if any)
 * has passed, and resume WAITING invocations whose nextWakeAt has fired.
 *
 * Returns the claimed invocation IDs; the caller is responsible for
 * actually executing them (loading checkpoint + driving the pipeline).
 * The execution itself happens in the existing agent-runtime /
 * scheduler-runner — this function only does the durable-claim half.
 *
 * Bounded by `maxConcurrent` to avoid blowing the worker pool.
 */
export async function drainQueuedAndWaiting(input: {
  /** Hard cap on invocations claimed per drain tick. Default 5. */
  maxConcurrent?: number;
  /** Override the current time for tests. */
  now?: Date;
} = {}): Promise<WorkerDrainResult> {
  const now = input?.now ?? new Date();
  const max = input?.maxConcurrent ?? 5;

  // 1. Recover stale leases (safe recovery — crashed workers).
  const leaseRecovery = await recoverExpiredLeases();

  // 2. Wake due invocations (nextWakeAt <= now) back to QUEUED.
  const dueWakeups = await findDueWakeups({ limit: max });
  for (const w of dueWakeups) {
    await wakeInvocation(w.invocationId);
  }

  // 3. Find QUEUED invocations whose nextRetryAt (if any) has passed.
  //    User-isolation is implicit: we never cross user data here, we just
  //    claim rows whose status = QUEUED and whose retry budget allows.
  const queued = await db.autopilotRun.findMany({
    where: {
      status: 'QUEUED',
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    orderBy: { createdAt: 'asc' },
    take: max,
    select: { id: true },
  });

  const results: WorkerDrainResult['results'] = [];
  let claimed = 0;

  for (const { id } of queued) {
    if (claimed >= max) break;
    const claim = await claimInvocation({ invocationId: id });
    results.push({
      invocationId: id,
      claimed: claim.claimed,
      conflictReason: claim.conflictReason,
    });
    if (claim.claimed) claimed++;
  }

  return {
    scanned: queued.length,
    claimed,
    reclaimedStaleLeases: leaseRecovery.recovered,
    wokenWaits: dueWakeups.length,
    results,
  };
}

/**
 * Load the persisted state needed to RESUME an invocation after a
 * restart / lease reclaim. Returns the checkpoint graph + the
 * invocation record. The caller uses the checkpoint to decide which
 * step to run next, then drives the agent-runtime.
 */
export async function resumeFromCheckpoint(input: {
  invocationId: string;
  callerUserId: string;
}): Promise<{
  invocation: InvocationRecord | null;
  checkpoint: Awaited<ReturnType<typeof loadCheckpoint>>;
}> {
  const { getInvocation } = await import('./invocation-service');
  const invocation = await getInvocation(input.invocationId, input.callerUserId);
  if (!invocation) {
    return { invocation: null, checkpoint: null };
  }
  const checkpoint = await loadCheckpoint(input.invocationId);
  return { invocation, checkpoint };
}
