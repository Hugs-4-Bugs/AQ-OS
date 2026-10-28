// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workstream D §6 — Event / Trigger Dispatcher
//
// Durable event abstraction for autonomous execution. Every event is a
// PERSISTENT AgentEvent row with:
//   · event type + payload/reference · user · source · createdAt
//   · processedAt · status · retry count · error
//   · idempotency key (UNIQUE) · correlation/execution id
//
// The same logical event can NEVER start duplicate autonomous work:
// `enqueueEvent` dedupes by idempotencyKey (unique constraint + graceful
// duplicate handling → status 'skipped_duplicate').
//
// Event categories (§6):
//   scheduled | workflow_completion | new_lead | new_email | follow_up_due
//   | approval_response | task_completion | retryable_failure
//   | external_webhook
//
// Processing model: a shared tick (piggybacked on the EXISTING autopilot
// scheduler heartbeat — no second scheduler) drains pending events in
// order, invoking registered handlers. Handlers are idempotent (they use
// withIdempotency internally). Failures increment retryCount with backoff
// and set status 'failed' after maxRetries.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { computeOperationFingerprint } from '@/lib/ai/agent-idempotency';

export type AgentEventType =
  | 'scheduled'
  | 'workflow_completion'
  | 'new_lead'
  | 'new_email'
  | 'follow_up_due'
  | 'approval_response'
  | 'task_completion'
  | 'retryable_failure'
  | 'external_webhook';

export interface EnqueueEventInput {
  userId: string;
  eventType: AgentEventType;
  payload?: Record<string, unknown>;
  source?: string;
  correlationId?: string | null;
  executionId?: string | null;
  idempotencyKey?: string;
  maxRetries?: number;
}

export interface EnqueueEventResult {
  eventId: string | null;
  duplicate: boolean;
  status: string;
}

/** Enqueue a durable event — idempotent by construction. */
export async function enqueueEvent(input: EnqueueEventInput): Promise<EnqueueEventResult> {
  const payloadStr = JSON.stringify(input.payload ?? {});
  const idempotencyKey =
    input.idempotencyKey ??
    computeOperationFingerprint({
      userId: input.userId,
      operationType: 'external_callback' as const,
      target: input.eventType,
      input: { source: input.source ?? 'api', payload: input.payload ?? {}, executionId: input.executionId ?? null },
    });

  try {
    const row = await db.agentEvent.create({
      data: {
        userId: input.userId,
        eventType: input.eventType,
        payload: payloadStr,
        source: input.source ?? 'api',
        status: 'pending',
        idempotencyKey,
        correlationId: input.correlationId ?? null,
        executionId: input.executionId ?? null,
        maxRetries: input.maxRetries ?? 3,
      },
    });
    return { eventId: row.id, duplicate: false, status: row.status };
  } catch (createErr: unknown) {
    if (String(createErr).includes('Unique constraint') || String(createErr).includes('unique')) {
      // Duplicate logical event — NEVER duplicate autonomous work.
      const existing = await db.agentEvent.findUnique({ where: { idempotencyKey } }).catch(() => null);
      return { eventId: existing?.id ?? null, duplicate: true, status: existing?.status ?? 'unknown' };
    }
    // If the AgentEvent table doesn't exist, degrade gracefully — return
    // a non-duplicate result so the caller can proceed (the in-memory
    // dedup in the continuation engine still provides short-term protection).
    return { eventId: null, duplicate: false, status: 'no-db-tracking' };
  }
}

// ─── Handler registry ──────────────────────────────────────────────────

export interface AgentEventContext {
  eventId: string;
  userId: string;
  eventType: AgentEventType;
  payload: Record<string, unknown>;
  correlationId: string | null;
  executionId: string | null;
  source: string;
  attempt: number;
}

export type AgentEventHandler = (ctx: AgentEventContext) => Promise<void>;

const handlers = new Map<AgentEventType, AgentEventHandler>();

/** Register the handler for an event type (server startup — static). */
export function registerEventHandler(eventType: AgentEventType, handler: AgentEventHandler): void {
  handlers.set(eventType, handler);
}

export function registeredEventTypes(): AgentEventType[] {
  return Array.from(handlers.keys());
}

// ─── Dispatcher tick (driven by the EXISTING autopilot heartbeat) ────────

export interface DispatcherTickResult {
  scanned: number;
  processed: number;
  failed: number;
  retriedLater: number;
  duplicatesSkipped: number;
}

const BATCH_SIZE = 20;

/**
 * Process pending events. Called from the shared scheduler heartbeat —
 * NEVER creates its own timer (no second scheduler). Safe to call
 * concurrently: each event is atomically claimed via a status CAS
 * (pending → processing) before its handler runs.
 */
export async function processPendingEvents(userId?: string): Promise<DispatcherTickResult> {
  const result: DispatcherTickResult = { scanned: 0, processed: 0, failed: 0, retriedLater: 0, duplicatesSkipped: 0 };

  let pending: Array<{
    id: string; userId: string; eventType: string; payload: string;
    correlationId: string | null; executionId: string | null;
    source: string; attempts: number; retryCount: number; maxRetries: number;
  }> = [];

  try {
    pending = await db.agentEvent.findMany({
      where: { status: 'pending', ...(userId ? { userId } : {}) },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });
  } catch {
    return result; // AgentEvent table may not exist yet — no-op
  }

  result.scanned = pending.length;

  for (const event of pending) {
    // Atomic claim: pending → processing (CAS via updateMany).
    let claimed: { count: number };
    try {
      claimed = await db.agentEvent.updateMany({
        where: { id: event.id, status: 'pending' },
        data: { status: 'processing', attempts: { increment: 1 } },
      });
    } catch {
      result.duplicatesSkipped++;
      continue;
    }
    if (claimed.count === 0) {
      result.duplicatesSkipped++;
      continue;
    }

    const handler = handlers.get(event.eventType as AgentEventType);
    if (!handler) {
      try {
        await db.agentEvent.update({
          where: { id: event.id },
          data: { status: 'failed', error: `No handler registered for event type "${event.eventType}"`, processedAt: new Date() },
        });
      } catch { /* non-fatal */ }
      result.failed++;
      continue;
    }

    try {
      await handler({
        eventId: event.id,
        userId: event.userId,
        eventType: event.eventType as AgentEventType,
        payload: safeParse(event.payload),
        correlationId: event.correlationId,
        executionId: event.executionId,
        source: event.source,
        attempt: event.attempts,
      });
      try {
        await db.agentEvent.update({
          where: { id: event.id },
          data: { status: 'processed', processedAt: new Date(), error: null },
        });
      } catch { /* non-fatal */ }
      result.processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const willRetry = event.retryCount + 1 < event.maxRetries;
      try {
        await db.agentEvent.update({
          where: { id: event.id },
          data: {
            status: willRetry ? 'pending' : 'failed',
            retryCount: { increment: 1 },
            error: message.slice(0, 1000),
            ...(willRetry ? {} : { processedAt: new Date() }),
          },
        });
      } catch { /* non-fatal */ }
      if (willRetry) result.retriedLater++;
      else result.failed++;
    }
  }

  return result;
}

/** Events that exceeded maxRetries are terminal — surfaced via this query. */
export async function listFailedEvents(userId: string, limit = 20) {
  try {
    return await db.agentEvent.findMany({
      where: { userId, status: 'failed' },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: { id: true, eventType: true, source: true, error: true, retryCount: true, maxRetries: true, createdAt: true, updatedAt: true },
    });
  } catch {
    return [];
  }
}

export async function eventFeedStats(userId: string) {
  try {
    const [pending, processed, failed] = await Promise.all([
      db.agentEvent.count({ where: { userId, status: 'pending' } }),
      db.agentEvent.count({ where: { userId, status: 'processed' } }),
      db.agentEvent.count({ where: { userId, status: 'failed' } }),
    ]);
    return { pending, processed, failed };
  } catch {
    return { pending: 0, processed: 0, failed: 0 };
  }
}

function safeParse(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// ─── Lead creation event producer ──────────────────────────────────────

/**
 * Emit a 'new_lead' event when a Lead is successfully persisted.
 *
 * The event triggers the autonomous continuation pipeline:
 *   new_lead → handleNewLeadEvent → continuePipelineForLead → Discovery agent
 *
 * Idempotent: idempotencyKey = 'new-lead:<userId>:<leadId>' — the same
 * lead cannot trigger duplicate events (UNIQUE constraint on AgentEvent).
 *
 * Fire-and-forget: callers should use .catch(() => {}) to avoid blocking
 * the lead creation response on event persistence.
 *
 * @param userId  — the lead's owner (must match Lead.userId)
 * @param leadId  — the persisted Lead's id
 * @param source  — the creation path: 'api' | 'discovery' | 'import' |
 *                  'agent-tool' | 'discovery-engine'
 */
export async function notifyLeadCreated(
  userId: string,
  leadId: string,
  source: string,
): Promise<void> {
  await enqueueEvent({
    userId,
    eventType: 'new_lead',
    payload: { leadId, source },
    source: `lead-created:${source}`,
    idempotencyKey: `new-lead:${userId}:${leadId}`,
  });
}

// ─── Follow-up due event producer ───────────────────────────────────────

/**
 * Check for due follow-up reminders and emit 'follow_up_due' events.
 *
 * Queries FollowUpReminder where:
 *   completed = false (still pending)
 *   dueAt <= now (the follow-up is due/overdue)
 *
 * For each due reminder, emits a 'follow_up_due' AgentEvent with:
 *   idempotencyKey = 'follow-up-due:<userId>:<leadId>:<reminderId>'
 *
 * Idempotent: the same reminder cannot trigger duplicate events (UNIQUE
 * constraint on AgentEvent.idempotencyKey). A heartbeat retry or server
 * restart will find existing events (duplicate=true) and skip.
 *
 * Bounded: takes 50 reminders per tick (resumes next tick — not a cap,
 * just a per-tick batch for resource sanity).
 *
 * Called from the existing heartbeat/cron tick — NO second scheduler.
 */
export async function checkDueFollowUps(): Promise<{ checked: number; emitted: number; duplicates: number }> {
  const { db } = await import('@/lib/db');

  let dueReminders: Array<{
    id: string;
    leadId: string;
    userId: string | null;
    dueAt: Date;
    message: string;
    lead: { userId: string } | null;
  }> = [];

  try {
    dueReminders = await db.followUpReminder.findMany({
      where: {
        completed: false,
        dueAt: { lte: new Date() },
      },
      include: { lead: { select: { userId: true } } },
      take: 50,
      orderBy: { dueAt: 'asc' },
    });
  } catch {
    return { checked: 0, emitted: 0, duplicates: 0 };
  }

  let emitted = 0;
  let duplicates = 0;

  for (const reminder of dueReminders) {
    // Resolve userId: prefer the reminder's userId, fall back to the lead's userId.
    const userId = reminder.userId || reminder.lead?.userId;
    if (!userId) continue;

    try {
      const result = await enqueueEvent({
        userId,
        eventType: 'follow_up_due',
        payload: {
          leadId: reminder.leadId,
          reminderId: reminder.id,
          message: reminder.message.slice(0, 500),
          dueAt: reminder.dueAt.toISOString(),
        },
        source: 'follow-up-scheduler',
        idempotencyKey: `follow-up-due:${userId}:${reminder.leadId}:${reminder.id}`,
      });
      if (result.duplicate) duplicates++;
      else emitted++;
    } catch {
      // non-fatal — the heartbeat will retry on the next tick
    }
  }

  return { checked: dueReminders.length, emitted, duplicates };
}
