// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 1 — Wait / Wake / Resume
//
// While an invocation is WAITING:
//   · the worker has been released (lease cleared)
//   · no busy-loop is consuming CPU or holding a slot
//   · the persisted condition + nextWakeAt is the "alarm clock"
//
// Two wake sources:
//   · TIME     — nextWakeAt passes → the heartbeat re-claims and resumes
//   · EVENT    — a registered AgentEvent matches the waiting condition
//                (e.g. WAITING_FOR_EMAIL + a new_email event) → resume
//
// This module owns no scheduler. It is consumed by the existing
// heartbeat (instrumentation.ts → scheduler-runner.ts) via
// `findDueWakeups()` and `matchEventToWaitingInvocations()`.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

export type WaitingCondition =
  | 'WAITING_FOR_EMAIL'
  | 'WAITING_FOR_APPROVAL'
  | 'WAITING_FOR_FOLLOWUP'
  | 'WAITING_FOR_SCHEDULE'
  | 'WAITING_FOR_EXTERNAL_EVENT'
  | 'WAITING_FOR_PROVIDER';

/**
 * Transition an invocation into WAITING. Releases the worker's lease
 * so the bounded worker pool is not consumed while waiting.
 *
 * Caller must have already parked the corresponding checkpoint step
 * via `parkStepWaiting` (checkpoint-service.ts).
 */
export async function parkInvocationWaiting(input: {
  invocationId: string;
  condition: WaitingCondition;
  nextWakeAt?: Date | null;
}): Promise<{ parked: boolean }> {
  const now = new Date();
  const updated = await db.autopilotRun.updateMany({
    where: {
      id: input.invocationId,
      status: 'RUNNING', // only an in-flight run can park
    },
    data: {
      status: 'WAITING',
      waitingCondition: input.condition,
      nextWakeAt: input.nextWakeAt ?? null,
      leaseOwner: null, // release the worker
      leaseExpiresAt: null,
      updatedAt: now,
    },
  });
  return { parked: updated.count === 1 };
}

/**
 * Find invocations whose WAITING alarm-clock has fired. Returns them
 * in (nextWakeAt ASC) order so older waits resume first.
 *
 * Does NOT claim them — the caller (heartbeat) must `claimInvocation`
 * before resuming. This separation lets the caller bound concurrency
 * (e.g. resume at most N invocations per tick).
 */
export async function findDueWakeups(input: {
  /** Maximum invocations returned per call. Default 20. */
  limit?: number;
} = {}): Promise<
  Array<{
    invocationId: string;
    automationId: string;
    userId: string;
    condition: WaitingCondition;
    nextWakeAt: Date | null;
  }>
> {
  const now = new Date();
  const rows = await db.autopilotRun.findMany({
    where: {
      status: 'WAITING',
      nextWakeAt: { lte: now, not: null },
    },
    orderBy: { nextWakeAt: 'asc' },
    take: input.limit ?? 20,
    select: {
      id: true,
      autopilotId: true,
      userId: true,
      waitingCondition: true,
      nextWakeAt: true,
    },
  });
  return rows.map((r) => ({
    invocationId: r.id,
    automationId: r.autopilotId,
    userId: r.userId,
    condition: r.waitingCondition as WaitingCondition,
    nextWakeAt: r.nextWakeAt,
  }));
}

/**
 * Find invocations WAITING indefinitely (nextWakeAt IS NULL).
 *
 * These can only be woken by an external event. Useful for the event
 * dispatcher to enumerate candidates without rescanning the whole
 * table.
 */
export async function findIndefiniteWaits(input: {
  condition?: WaitingCondition;
  limit?: number;
} = {}): Promise<
  Array<{
    invocationId: string;
    automationId: string;
    userId: string;
    condition: WaitingCondition;
  }>
> {
  const rows = await db.autopilotRun.findMany({
    where: {
      status: 'WAITING',
      nextWakeAt: null,
      ...(input.condition ? { waitingCondition: input.condition } : {}),
    },
    take: input.limit ?? 50,
    select: {
      id: true,
      autopilotId: true,
      userId: true,
      waitingCondition: true,
    },
  });
  return rows.map((r) => ({
    invocationId: r.id,
    automationId: r.autopilotId,
    userId: r.userId,
    condition: r.waitingCondition as WaitingCondition,
  }));
}

/**
 * Map an inbound AgentEvent to the invocations it should wake.
 *
 * Returns invocation IDs (with the automationId) that were transitioned
 * out of WAITING — caller should `claimInvocation` + `loadCheckpoint`
 * + continue from the parked step.
 *
 * Matching rules (simple + correct):
 *   new_email         → WAITING_FOR_EMAIL
 *   approval_response → WAITING_FOR_APPROVAL
 *   follow_up_due     → WAITING_FOR_FOLLOWUP
 *   scheduled         → WAITING_FOR_SCHEDULE
 *   external_webhook  → WAITING_FOR_EXTERNAL_EVENT
 *   * (provider)      → WAITING_FOR_PROVIDER
 *
 * User isolation: only invocations owned by the same userId as the
 * event are matched. An event from User A never wakes User B's run.
 */
export async function matchEventToWaitingInvocations(input: {
  userId: string;
  eventType:
    | 'new_email'
    | 'approval_response'
    | 'follow_up_due'
    | 'scheduled'
    | 'external_webhook'
    | 'retryable_failure'
    | 'workflow_completion'
    | 'new_lead'
    | 'task_completion';
  /** Optional filter — only match invocations of this automation. */
  automationId?: string;
}): Promise<
  Array<{
    invocationId: string;
    automationId: string;
  }>
> {
  const map: Record<string, WaitingCondition> = {
    new_email: 'WAITING_FOR_EMAIL',
    approval_response: 'WAITING_FOR_APPROVAL',
    follow_up_due: 'WAITING_FOR_FOLLOWUP',
    scheduled: 'WAITING_FOR_SCHEDULE',
    external_webhook: 'WAITING_FOR_EXTERNAL_EVENT',
  };
  const targetCondition = map[input.eventType];
  if (!targetCondition) return []; // events like new_lead/workflow_completion don't wake parked runs

  // For WAITING_FOR_PROVIDER, callers should explicitly pass
  // eventType='external_webhook' with a payload indicating provider
  // recovery, OR transition the run directly via wakeInvocation.
  const rows = await db.autopilotRun.findMany({
    where: {
      userId: input.userId,
      status: 'WAITING',
      waitingCondition: targetCondition,
      ...(input.automationId ? { autopilotId: input.automationId } : {}),
    },
    select: { id: true, autopilotId: true },
  });
  return rows.map((r) => ({ invocationId: r.id, automationId: r.autopilotId }));
}

/**
 * Force-wake a specific invocation (used by approval-resume and other
 * explicit wake paths). The caller must still `claimInvocation` and
 * `loadCheckpoint` to actually resume work.
 *
 * Clears the waiting state so the next heartbeat's `findDueWakeups`
 * doesn't redundantly list it.
 */
export async function wakeInvocation(
  invocationId: string,
): Promise<{ woken: boolean; reason?: string }> {
  const now = new Date();
  // Move from WAITING back to QUEUED so the unified scheduler picks it up.
  const updated = await db.autopilotRun.updateMany({
    where: {
      id: invocationId,
      status: 'WAITING',
    },
    data: {
      status: 'QUEUED',
      waitingCondition: null,
      nextWakeAt: null,
      nextRetryAt: null,
      // Lease intentionally left null — caller must claim before resuming.
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: now,
    },
  });
  if (updated.count === 1) return { woken: true };
  const run = await db.autopilotRun.findUnique({
    where: { id: invocationId },
    select: { status: true },
  });
  return {
    woken: false,
    reason: run ? `not WAITING (status=${run.status})` : 'not_found',
  };
}
