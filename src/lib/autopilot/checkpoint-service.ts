// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 1 — Checkpoint Service
//
// Per-step progress persistence for durable autonomous execution.
//
// One row per (invocation × step). Steps are:
//   PENDING → RUNNING → COMPLETE | FAILED | SKIPPED | WAITING
//
// Resume protocol:
//   1. Worker A processes step "discovery" → marks RUNNING → COMPLETE
//   2. Worker A processes step "qualification" → marks RUNNING →
//      crashes mid-step → row stays RUNNING with claimNonce=A
//   3. Worker B claims invocation (lease expired)
//   4. Worker B calls `loadCheckpoint` → sees discovery=COMPLETE,
//      qualification=RUNNING (stale) → marks qualification as FAILED
//      (stale) and re-runs it
//   5. Worker B processes outreach → marks COMPLETE
//
// Never restarts completed work. Never duplicates external actions
// because completed steps return their cached `result` for idempotent
// replay.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { randomUUID } from 'crypto';

export interface CheckpointStep {
  stepKey: string;
  stepName: string;
  sequence: number;
  status: 'PENDING' | 'RUNNING' | 'COMPLETE' | 'FAILED' | 'SKIPPED' | 'WAITING';
  result?: unknown;
  error?: string;
  errorCategory?: 'retryable' | 'permanent' | 'human_required';
  waitingCondition?: string;
  nextWakeAt?: Date;
  nextAction?: string;
  startedAt?: Date;
  completedAt?: Date;
  claimNonce?: string;
}

export interface InvocationCheckpoint {
  invocationId: string;
  steps: CheckpointStep[];
  /** Highest-sequence step that has reached a terminal/running state. */
  cursor: number;
  /** The next step that should run (or null if all complete). */
  pendingStep: CheckpointStep | null;
  /** The step currently marked RUNNING (caller should mark stale if found). */
  inFlightStep: CheckpointStep | null;
}

/**
 * Initialise an invocation's checkpoint graph from a list of declared
 * steps. Safe to call multiple times — uses upsert keyed on
 * (invocationId, stepKey) so re-runs converge.
 */
export async function initializeCheckpoint(input: {
  invocationId: string;
  userId: string;
  businessId?: string | null;
  steps: Array<{
    stepKey: string;
    stepName: string;
    sequence: number;
  }>;
}): Promise<{ created: number; reused: number }> {
  let created = 0;
  let reused = 0;
  for (const step of input.steps) {
    const r = await db.automationCheckpoint.upsert({
      where: {
        invocationId_stepKey: {
          invocationId: input.invocationId,
          stepKey: step.stepKey,
        },
      },
      create: {
        invocationId: input.invocationId,
        userId: input.userId,
        businessId: input.businessId ?? null,
        stepKey: step.stepKey,
        stepName: step.stepName,
        sequence: step.sequence,
        status: 'PENDING',
      },
      update: {
        // Leave existing rows alone — re-running the same step preserves
        // its status. This is the resume-from-checkpoint invariant.
        stepName: step.stepName,
        sequence: step.sequence,
      },
    });
    // Crude reuse detection — if the createdAt === updatedAt, the row was
    // just created. Otherwise it already existed. (Approximation — enough
    // for observability.)
    const justCreated =
      r.createdAt.getTime() === r.updatedAt.getTime() &&
      r.status === 'PENDING' &&
      !r.startedAt;
    if (justCreated) created++;
    else reused++;
  }
  return { created, reused };
}

/**
 * Mark a step as RUNNING, capturing the worker's claimNonce so a stale
 * worker's later writes can be rejected after resume.
 *
 * Returns false if the step was already COMPLETE (the caller should
 * short-circuit and read the cached result instead of re-executing).
 */
export async function beginStep(input: {
  invocationId: string;
  stepKey: string;
  claimNonce?: string;
}): Promise<{ ok: boolean; alreadyComplete: boolean; claimNonce: string }> {
  const nonce = input.claimNonce ?? randomUUID();

  // Find the row first.
  const existing = await db.automationCheckpoint.findUnique({
    where: {
      invocationId_stepKey: {
        invocationId: input.invocationId,
        stepKey: input.stepKey,
      },
    },
  });
  if (!existing) {
    // Step was never initialized — caller bug. Surface as not-ok.
    return { ok: false, alreadyComplete: false, claimNonce: nonce };
  }
  if (existing.status === 'COMPLETE') {
    return { ok: false, alreadyComplete: true, claimNonce: existing.claimNonce ?? nonce };
  }

  // Transition PENDING|FAILED|SKIPPED|WAITING → RUNNING. Stale RUNNING
  // (e.g. lease expired mid-step) is also overridden by the new owner.
  await db.automationCheckpoint.update({
    where: { id: existing.id },
    data: {
      status: 'RUNNING',
      claimNonce: nonce,
      startedAt: existing.startedAt ?? new Date(),
      error: null,
      errorCategory: null,
      waitingCondition: null,
      nextWakeAt: null,
      updatedAt: new Date(),
    },
  });

  // Mirror coarse state onto the AutopilotRun for top-level observability.
  await db.autopilotRun.update({
    where: { id: input.invocationId },
    data: {
      currentAction: input.stepKey,
      currentCheckpoint: JSON.stringify({
        runningStep: input.stepKey,
        nonce,
      }),
      updatedAt: new Date(),
    },
  });

  return { ok: true, alreadyComplete: false, claimNonce: nonce };
}

/**
 * Mark a step COMPLETE with its (JSON-serializable) result. The result
 * is persisted so future resume-from-checkpoint replays return the
 * cached value instead of re-executing the external action.
 */
export async function completeStep(input: {
  invocationId: string;
  stepKey: string;
  claimNonce: string;
  result: unknown;
  nextAction?: string;
}): Promise<{ saved: boolean; stale: boolean }> {
  const now = new Date();
  // Conditional update — only the worker holding the current nonce
  // may write the COMPLETE state. A stale worker (post-reclaim) sees
  // count=0 and learns it has been supplanted.
  const updated = await db.automationCheckpoint.updateMany({
    where: {
      invocationId: input.invocationId,
      stepKey: input.stepKey,
      claimNonce: input.claimNonce,
      // Refuse to mark COMPLETE if the row is already COMPLETE.
      status: { not: 'COMPLETE' },
    },
    data: {
      status: 'COMPLETE',
      result: JSON.stringify(input.result),
      error: null,
      errorCategory: null,
      waitingCondition: null,
      nextWakeAt: null,
      nextAction: input.nextAction ?? null,
      completedAt: now,
      updatedAt: now,
    },
  });

  if (updated.count === 0) {
    // Either the nonce doesn't match (stale) or the row is already
    // COMPLETE (idempotent re-complete). Distinguish by reading.
    const row = await db.automationCheckpoint.findUnique({
      where: {
        invocationId_stepKey: {
          invocationId: input.invocationId,
          stepKey: input.stepKey,
        },
      },
      select: { status: true, claimNonce: true },
    });
    if (!row) return { saved: false, stale: false };
    if (row.status === 'COMPLETE' && row.claimNonce === input.claimNonce) {
      return { saved: true, stale: false }; // idempotent
    }
    return { saved: false, stale: row.claimNonce !== input.claimNonce };
  }
  return { saved: true, stale: false };
}

/**
 * Mark a step FAILED. The caller is responsible for classifying the
 * error and deciding whether to retry, block, or pause.
 */
export async function failStep(input: {
  invocationId: string;
  stepKey: string;
  claimNonce: string;
  error: string;
  errorCategory: 'retryable' | 'permanent' | 'human_required';
}): Promise<{ saved: boolean; stale: boolean }> {
  const now = new Date();
  const updated = await db.automationCheckpoint.updateMany({
    where: {
      invocationId: input.invocationId,
      stepKey: input.stepKey,
      claimNonce: input.claimNonce,
      status: { not: 'COMPLETE' },
    },
    data: {
      status: 'FAILED',
      error: input.error,
      errorCategory: input.errorCategory,
      completedAt: now,
      updatedAt: now,
    },
  });
  if (updated.count === 0) {
    return { saved: false, stale: true };
  }
  return { saved: true, stale: false };
}

/**
 * Mark a step WAITING with a condition + alarm clock. Releases the
 * worker so other invocations can run on the same pool.
 */
export async function parkStepWaiting(input: {
  invocationId: string;
  stepKey: string;
  claimNonce: string;
  condition:
    | 'WAITING_FOR_EMAIL'
    | 'WAITING_FOR_APPROVAL'
    | 'WAITING_FOR_FOLLOWUP'
    | 'WAITING_FOR_SCHEDULE'
    | 'WAITING_FOR_EXTERNAL_EVENT'
    | 'WAITING_FOR_PROVIDER';
  nextWakeAt?: Date | null;
}): Promise<{ saved: boolean }> {
  const now = new Date();
  const updated = await db.automationCheckpoint.updateMany({
    where: {
      invocationId: input.invocationId,
      stepKey: input.stepKey,
      claimNonce: input.claimNonce,
    },
    data: {
      status: 'WAITING',
      waitingCondition: input.condition,
      nextWakeAt: input.nextWakeAt ?? null,
      updatedAt: now,
    },
  });
  return { saved: updated.count === 1 };
}

/**
 * Load the full checkpoint graph for an invocation.
 *
 * The returned object tells the worker exactly which step to run next
 * (or whether the invocation is already finished). Callers should also
 * mark any stale RUNNING step (claimNonce != current worker's) as
 * FAILED with errorCategory='retryable' so the next iteration re-runs
 * it.
 */
export async function loadCheckpoint(
  invocationId: string,
): Promise<InvocationCheckpoint | null> {
  const rows = await db.automationCheckpoint.findMany({
    where: { invocationId },
    orderBy: { sequence: 'asc' },
  });
  if (rows.length === 0) return null;

  const steps: CheckpointStep[] = rows.map((r) => ({
    stepKey: r.stepKey,
    stepName: r.stepName,
    sequence: r.sequence,
    status: r.status as CheckpointStep['status'],
    result: r.result ? safeParse(r.result) : undefined,
    error: r.error ?? undefined,
    errorCategory: r.errorCategory as CheckpointStep['errorCategory'],
    waitingCondition: r.waitingCondition ?? undefined,
    nextWakeAt: r.nextWakeAt ?? undefined,
    nextAction: r.nextAction ?? undefined,
    startedAt: r.startedAt ?? undefined,
    completedAt: r.completedAt ?? undefined,
    claimNonce: r.claimNonce ?? undefined,
  }));

  // Cursor = highest sequence among non-PENDING rows (i.e. where work has started).
  let cursor = -1;
  for (const s of steps) {
    if (s.status !== 'PENDING') cursor = Math.max(cursor, s.sequence);
  }
  if (cursor < 0) cursor = 0; // nothing started yet → cursor at first step

  // pendingStep = first PENDING or WAITING step (resumable). If only
  // FAILED/RUNNING remain, the caller should re-run/continue them.
  let pendingStep: CheckpointStep | null = null;
  let inFlightStep: CheckpointStep | null = null;
  for (const s of steps) {
    if (s.status === 'PENDING' && !pendingStep) {
      pendingStep = s;
    }
    if (s.status === 'WAITING' && !pendingStep) {
      pendingStep = s;
    }
    if (s.status === 'RUNNING') {
      inFlightStep = s; // stale (post-lease-reclaim) — caller should treat as FAILED
    }
    if (s.status === 'FAILED' && !pendingStep) {
      pendingStep = s; // retryable — caller may re-run
    }
  }

  return {
    invocationId,
    steps,
    cursor,
    pendingStep,
    inFlightStep,
  };
}

/**
 * Snapshot the high-level invocation checkpoint onto AutopilotRun.
 * Used after every checkpoint transition for cheap top-level observability.
 */
export async function snapshotInvocationCheckpoint(invocationId: string): Promise<void> {
  const cp = await loadCheckpoint(invocationId);
  if (!cp) return;
  const completedSteps = cp.steps
    .filter((s) => s.status === 'COMPLETE')
    .map((s) => s.stepKey);
  const running = cp.steps.find((s) => s.status === 'RUNNING');
  await db.autopilotRun.update({
    where: { id: invocationId },
    data: {
      currentCheckpoint: JSON.stringify({
        completedSteps,
        pendingStep: cp.pendingStep?.stepKey ?? null,
        inFlightStep: cp.inFlightStep?.stepKey ?? null,
        cursor: cp.cursor,
      }),
      currentAction: running?.stepKey ?? cp.pendingStep?.stepKey ?? null,
      currentAgentKey: running?.stepKey ?? cp.pendingStep?.stepKey ?? null,
      updatedAt: new Date(),
    },
  });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
