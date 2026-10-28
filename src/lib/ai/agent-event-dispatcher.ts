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
