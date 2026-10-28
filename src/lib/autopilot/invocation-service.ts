// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 1 — Invocation Service
//
// Creates a durable AutopilotRun row from a unified trigger, then
// drives it through the lease → checkpoint → wait/wake → retry →
// terminal lifecycle.
//
// Critical invariant:
//   · every invocation has a UNIQUE idempotencyKey
//   · duplicate ticks / events / webhooks converge on the SAME row
//     (no duplicate business action)
//   · every invocation row survives across request lifetimes / browser
//     closures / server restarts
//
// This service does NOT implement the agent execution itself — that
// belongs to the existing agent-runtime + scheduler-runner. Here we
// provide only the durable scaffolding: the "shell" of an invocation.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { randomUUID } from 'crypto';
import {
  manualIdempotencyKey,
  scheduleIdempotencyKey,
  eventIdempotencyKey,
  getAutomation,
  type AutomationRecord,
} from './automation-service';

export type TriggerType =
  | 'manual'
  | 'schedule'
  | 'event'
  | 'followup'
  | 'approval_resume'
  | 'restart_recovery';

export interface CreateInvocationInput {
  automationId: string;
  userId: string;
  triggerType: TriggerType;
  /** The slot epoch ms (for schedule) — for idempotency. */
  slotEpochMs?: number;
  /** The AgentEvent.id that woke this invocation (for event/approval_resume). */
  triggerEventId?: string;
  /** Manual override — if not provided, computed from the trigger type. */
  idempotencyKey?: string;
  /** Initial config snapshot (JSON-serialisable). */
  config?: Record<string, unknown>;
}

export interface InvocationRecord {
  id: string;
  automationId: string;
  userId: string;
  status: string;
  triggerType: TriggerType | null;
  triggerEventId: string | null;
  idempotencyKey: string | null;
  correlationId: string | null;
  executionId: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  currentAgentKey: string | null;
  currentAction: string | null;
  currentCheckpoint: string;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: Date | null;
  nextWakeAt: Date | null;
  waitingCondition: string | null;
  errorCategory: string | null;
  businessId: string | null;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
}

function toRecord(r: {
  id: string;
  autopilotId: string;
  userId: string;
  status: string;
  trigger: string;
  triggerType: string | null;
  triggerEventId: string | null;
  idempotencyKey: string | null;
  correlationId: string | null;
  executionId: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  currentAgentKey: string | null;
  currentAction: string | null;
  currentCheckpoint: string;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: Date | null;
  nextWakeAt: Date | null;
  waitingCondition: string | null;
  errorCategory: string | null;
  businessId: string | null;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
}): InvocationRecord {
  return {
    id: r.id,
    automationId: r.autopilotId,
    userId: r.userId,
    status: r.status,
    triggerType: (r.triggerType ?? r.trigger) as TriggerType | null,
    triggerEventId: r.triggerEventId,
    idempotencyKey: r.idempotencyKey,
    correlationId: r.correlationId,
    executionId: r.executionId,
    leaseOwner: r.leaseOwner,
    leaseExpiresAt: r.leaseExpiresAt,
    currentAgentKey: r.currentAgentKey,
    currentAction: r.currentAction,
    currentCheckpoint: r.currentCheckpoint,
    retryCount: r.retryCount,
    maxRetries: r.maxRetries,
    nextRetryAt: r.nextRetryAt,
    nextWakeAt: r.nextWakeAt,
    waitingCondition: r.waitingCondition,
    errorCategory: r.errorCategory,
    businessId: r.businessId,
    error: r.error,
    createdAt: r.createdAt,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    updatedAt: r.updatedAt,
  };
}

/**
 * Create or fetch a durable invocation. If the same idempotencyKey
 * already exists, return the existing row — duplicate triggers never
 * start a second run.
 *
 * Persists EVERY field needed for resume:
 *   · triggerType, triggerEventId (for audit)
 *   · idempotencyKey, correlationId (for dedup + log linking)
 *   · businessId denormalised from Automation (for user isolation
 *     without a join)
 *
 * The row exists in the database immediately after this call returns,
 * independent of any HTTP request, browser session, or process state.
 */
export async function createOrFetchInvocation(
  input: CreateInvocationInput,
): Promise<{ record: InvocationRecord; created: boolean }> {
  // Resolve the automation (also enforces user isolation by userId).
  const automation: AutomationRecord | null = await getAutomation(
    input.automationId,
    input.userId,
  );
  if (!automation) {
    throw new Error(
      `Automation ${input.automationId} not found for user ${input.userId}`,
    );
  }

  // Derive idempotencyKey from trigger type if not supplied.
  let idempotencyKey = input.idempotencyKey;
  if (!idempotencyKey) {
    switch (input.triggerType) {
      case 'schedule':
        if (!input.slotEpochMs) {
          throw new Error('schedule trigger requires slotEpochMs');
        }
        idempotencyKey = scheduleIdempotencyKey(input.automationId, input.slotEpochMs);
        break;
      case 'event':
      case 'approval_resume':
      case 'followup':
        if (!input.triggerEventId) {
          throw new Error(`${input.triggerType} trigger requires triggerEventId`);
        }
        idempotencyKey = eventIdempotencyKey(input.automationId, input.triggerEventId);
        break;
      case 'manual':
        idempotencyKey = manualIdempotencyKey(input.automationId);
        break;
      case 'restart_recovery':
        // restart_recovery means "the previous invocation existed; we're
        // re-claiming it, not creating a new one." This branch should never
        // hit createOrFetch — callers should use claimExistingInvocation.
        throw new Error(
          'restart_recovery should use claimExistingInvocation, not createOrFetch',
        );
    }
  }

  // Idempotency: try to find existing first.
  const existing = await db.autopilotRun.findFirst({
    where: { idempotencyKey },
  });
  if (existing) {
    return { record: toRecord(existing), created: false };
  }

  const correlationId = randomUUID();
  const now = new Date();
  try {
    const row = await db.autopilotRun.create({
      data: {
        autopilotId: input.automationId,
        userId: input.userId,
        businessId: automation.businessId ?? null,
        status: 'QUEUED',
        trigger:
          input.triggerType === 'schedule' ? 'scheduler'
          : input.triggerType === 'manual' ? 'manual'
          : 'manual',
        triggerType: input.triggerType,
        triggerEventId: input.triggerEventId ?? null,
        idempotencyKey,
        correlationId,
        config: JSON.stringify(input.config ?? {}),
        runKey: idempotencyKey, // mirror Phase 18 runKey for backwards-compat
        maxRetries: ((): number => {
          const p = automation.executionPolicy as { maxRetries?: number };
          return p?.maxRetries ?? 3;
        })(),
        currentCheckpoint: '{}',
        createdAt: now,
        updatedAt: now,
      },
    });
    return { record: toRecord(row), created: true };
  } catch (e: unknown) {
    // Race: another worker inserted the same idempotencyKey between our
    // findFirst and create. Re-read.
    const raced = await db.autopilotRun.findFirst({ where: { idempotencyKey } });
    if (raced) {
      return { record: toRecord(raced), created: false };
    }
    throw e;
  }
}

/**
 * Fetch an invocation by id. Enforces user isolation.
 */
export async function getInvocation(
  invocationId: string,
  callerUserId: string,
): Promise<InvocationRecord | null> {
  const row = await db.autopilotRun.findFirst({
    where: { id: invocationId, userId: callerUserId },
  });
  return row ? toRecord(row) : null;
}

/**
 * List a user's invocations. Filters by automationId / status.
 */
export async function listInvocations(input: {
  userId: string;
  automationId?: string;
  status?: string;
  businessId?: string;
  limit?: number;
}): Promise<InvocationRecord[]> {
  const rows = await db.autopilotRun.findMany({
    where: {
      userId: input.userId,
      ...(input.automationId ? { autopilotId: input.automationId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.businessId ? { businessId: input.businessId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: input.limit ?? 50,
  });
  return rows.map(toRecord);
}

/**
 * Persist a terminal/intermediate state transition on the invocation.
 * Used by the runner, approval-resume, retry, etc.
 *
 * Conditional on the current lease owner to prevent stale-worker writes.
 */
export async function transitionInvocation(input: {
  invocationId: string;
  to: 'QUEUED' | 'RUNNING' | 'WAITING' | 'PAUSED' | 'BLOCKED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  /** Optional caller workerId — must match the current leaseOwner. */
  leaseOwner?: string | null;
  patch?: Record<string, unknown>;
}): Promise<{ updated: boolean }> {
  const now = new Date();
  const where: Record<string, unknown> = { id: input.invocationId };
  if (input.leaseOwner !== undefined) where.leaseOwner = input.leaseOwner;

  const updated = await db.autopilotRun.updateMany({
    where,
    data: {
      status: input.to,
      ...(input.patch ?? {}),
      completedAt: ['COMPLETED', 'FAILED', 'CANCELLED'].includes(input.to) ? now : undefined,
      updatedAt: now,
    },
  });
  return { updated: updated.count === 1 };
}

/**
 * Persist a retry decision: bump retryCount, schedule nextRetryAt,
 * optionally set errorCategory + transition back to QUEUED for the
 * next tick to claim.
 */
export async function scheduleRetry(input: {
  invocationId: string;
  backoffMs: number;
  errorCategory: 'retryable' | 'permanent' | 'human_required';
  error: string;
  /** Max retries — used to assert ceiling in tests, not enforced here. */
  maxRetries?: number;
}): Promise<{ scheduled: boolean; nextRetryAt: Date }> {
  const now = new Date();
  const nextRetryAt = new Date(now.getTime() + input.backoffMs);
  const updated = await db.autopilotRun.updateMany({
    where: { id: input.invocationId },
    data: {
      status: 'QUEUED',
      leaseOwner: null,
      leaseExpiresAt: null,
      retryCount: { increment: 1 },
      nextRetryAt,
      error: input.error,
      errorCategory: input.errorCategory,
      updatedAt: now,
    },
  });
  return { scheduled: updated.count === 1, nextRetryAt };
}

/**
 * Persist a permanent failure. The invocation is set to BLOCKED +
 * lease released + error state captured. User must be notified
 * out-of-band (approval-escalation / in-app notification).
 */
export async function markPermanentFailure(input: {
  invocationId: string;
  error: string;
  errorCategory?: 'permanent';
}): Promise<{ updated: boolean }> {
  const now = new Date();
  const updated = await db.autopilotRun.updateMany({
    where: { id: input.invocationId },
    data: {
      status: 'BLOCKED',
      leaseOwner: null,
      leaseExpiresAt: null,
      error: input.error,
      errorCategory: input.errorCategory ?? 'permanent',
      completedAt: now,
      updatedAt: now,
    },
  });
  return { updated: updated.count === 1 };
}

/**
 * Persist a "needs human" pause. The invocation is set to PAUSED,
 * lease released, errorCategory = 'human_required'.
 */
export async function pauseForHuman(input: {
  invocationId: string;
  error: string;
}): Promise<{ updated: boolean }> {
  const now = new Date();
  const updated = await db.autopilotRun.updateMany({
    where: { id: input.invocationId },
    data: {
      status: 'PAUSED',
      leaseOwner: null,
      leaseExpiresAt: null,
      error: input.error,
      errorCategory: 'human_required',
      updatedAt: now,
    },
  });
  return { updated: updated.count === 1 };
}

/**
 * Final success — mark the invocation COMPLETED and bump the parent
 * automation's lastRunAt + runCount.
 */
export async function markCompleted(input: {
  invocationId: string;
  automationId: string;
}): Promise<{ updated: boolean }> {
  const now = new Date();
  const updated = await db.autopilotRun.updateMany({
    where: { id: input.invocationId },
    data: {
      status: 'COMPLETED',
      leaseOwner: null,
      leaseExpiresAt: null,
      completedAt: now,
      nextWakeAt: null,
      waitingCondition: null,
      nextRetryAt: null,
      updatedAt: now,
    },
  });
  // Bump automation lastRunAt + runCount.
  await db.autopilotWorkflow.update({
    where: { id: input.automationId },
    data: {
      lastRunAt: now,
      runCount: { increment: 1 },
      lastError: null,
    },
  });
  return { updated: updated.count === 1 };
}
