// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Realtime Engine
// Phase 11: Server-side event publishing, notification creation,
//           in-memory EventBus, deduplication, history & rate limiting
//
// ARCHITECTURE:
//   1. EventBus (extends EventEmitter) — in-process pub/sub for
//      SSE routes and other in-process consumers.
//   2. Redis PubSub — cross-process distribution (optional).
//      Falls back gracefully when Redis is unavailable.
//   3. Notification creation — persists to DB and publishes events.
//   4. Event dedup — prevents double-processing via in-memory set.
//   5. Event history — per-user buffer for replay support.
//   6. Rate limiting — per-user throttle for event publishing.
//   7. Audit logging — key events logged to AuditLog table.
// ═══════════════════════════════════════════════════════════════════

import { EventEmitter } from 'events';
import { db } from '@/lib/db';
import { redisPubSub } from '@/lib/redis-pubsub-service';

// ── Channel definitions ────────────────────────────────────────────

export type EventChannel =
  | 'lead_events'
  | 'payment_events'
  | 'notification_events'
  | 'message_events'
  | 'workflow_events'
  | 'ai_events';

export const EVENT_CHANNELS: readonly EventChannel[] = [
  'lead_events',
  'payment_events',
  'notification_events',
  'message_events',
  'workflow_events',
  'ai_events',
] as const;

// ── Event type definitions ─────────────────────────────────────────

export type LeadEventType =
  | 'discovered'
  | 'stage_changed'
  | 'analysis_complete'
  | 'score_updated'
  | 'import_progress'
  | 'export_progress'
  | 'screenshot_progress';

export type PaymentEventType =
  | 'payment_success'
  | 'payment_failed'
  | 'invoice_created'
  | 'subscription_changed'
  | 'credits_updated'
  | 'trial_ending';

export type MessageEventType =
  | 'gmail_sync'
  | 'gmail_thread_update'
  | 'telegram_delivery'
  | 'telegram_incoming'
  | 'whatsapp_sent'
  | 'whatsapp_delivered'
  | 'whatsapp_read'
  | 'whatsapp_failed';

export type AIEventType =
  | 'stream_token'
  | 'analysis_complete'
  | 'scoring_complete'
  | 'outreach_generated'
  | 'chat_response'
  | 'cancel';

export type WorkflowEventType =
  | 'step_completed'
  | 'execution_completed'
  | 'step_failed';

// ── Core event interface ───────────────────────────────────────────

export interface RealtimeEvent {
  eventId: string;
  type: string;
  userId: string;
  orgId?: string;
  payload: Record<string, unknown>;
  timestamp: number;
  channel: EventChannel;
}

// ── Notification creation params ───────────────────────────────────

export interface CreateNotificationParams {
  userId: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  deliveredVia?: string; // in_app, telegram, whatsapp, email
}

// ── Deduplication entry ────────────────────────────────────────────

interface DedupEntry {
  timestamp: number;
}

// ── Rate-limit entry ──────────────────────────────────────────────

interface RateLimitEntry {
  timestamps: number[];
}

// ── Constants ──────────────────────────────────────────────────────

const DEDUP_MAX_ENTRIES = 10_000;
const DEDUP_TTL_MS = 60 * 60 * 1000; // 1 hour
const HISTORY_MAX_PER_USER = 100;
const HISTORY_TTL_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_PER_SECOND = 100;
const RATE_LIMIT_WINDOW_MS = 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ── EventBus Singleton ─────────────────────────────────────────────

/**
 * In-process event bus extending EventEmitter.
 * Used by SSE routes and other in-process consumers.
 * Also attempts to publish to Redis for cross-process distribution.
 */
class EventBus extends EventEmitter {
  private dedupMap = new Map<string, DedupEntry>();
  private historyMap = new Map<string, RealtimeEvent[]>(); // key = userId
  private historyTimestamps = new Map<string, number>();   // key = userId → last activity
  private rateLimitMap = new Map<string, RateLimitEntry>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private totalPublished = 0;

  constructor() {
    super();
    // Allow many listeners (SSE routes, debug listeners, etc.)
    this.setMaxListeners(200);

    // Periodic cleanup of dedup, history, and rate-limit entries
    this.cleanupTimer = setInterval(() => this._cleanup(), CLEANUP_INTERVAL_MS);
    // Don't prevent process exit
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      (this.cleanupTimer as ReturnType<typeof setInterval> & { unref: () => void }).unref();
    }
  }

  // ── Publish ─────────────────────────────────────────────────────

  /**
   * Publish an event to the EventBus (in-process) and optionally to Redis.
   * Skips if event is a duplicate or user is rate-limited.
   */
  async publishEvent(channel: EventChannel, event: RealtimeEvent): Promise<{
    published: boolean;
    reason?: string;
  }> {
    // 1. Dedup check
    if (this.deduplicateEvent(event.eventId)) {
      return { published: false, reason: 'duplicate' };
    }

    // 2. Rate limit check
    const rateCheck = this._checkRateLimit(event.userId);
    if (!rateCheck.allowed) {
      return { published: false, reason: 'rate_limited' };
    }

    // 3. Emit locally
    this.emit(channel, event);
    this.emit('*', event); // wildcard channel for global listeners

    // 4. Store in history
    this._storeHistory(event);

    // 5. Try to publish to Redis
    try {
      const message = JSON.stringify(event);
      await redisPubSub.publish(channel, message);
    } catch {
      // Redis failure is non-blocking — the in-process bus already delivered
    }

    this.totalPublished++;
    return { published: true };
  }

  // ── Deduplication ───────────────────────────────────────────────

  /**
   * Check if an event ID has already been processed.
   * Returns true if it was a duplicate (already seen).
   */
  deduplicateEvent(eventId: string): boolean {
    if (this.dedupMap.has(eventId)) {
      return true; // duplicate
    }
    this.dedupMap.set(eventId, { timestamp: Date.now() });

    // Evict oldest entries if over limit
    if (this.dedupMap.size > DEDUP_MAX_ENTRIES) {
      const keysIter = this.dedupMap.keys();
      const toDelete = Math.floor(DEDUP_MAX_ENTRIES * 0.2); // remove 20%
      let deleted = 0;
      for (const key of keysIter) {
        this.dedupMap.delete(key);
        deleted++;
        if (deleted >= toDelete) break;
      }
    }

    return false;
  }

  // ── Event History ───────────────────────────────────────────────

  /**
   * Get recent events for a user, supporting replay.
   * @param userId    The user ID
   * @param afterEventId  Only return events after this event ID (exclusive)
   * @param limit     Max events to return (default 50)
   */
  getEventHistory(
    userId: string,
    afterEventId?: string,
    limit: number = 50
  ): RealtimeEvent[] {
    const events = this.historyMap.get(userId) || [];

    if (afterEventId) {
      const idx = events.findIndex((e) => e.eventId === afterEventId);
      if (idx === -1) {
        // afterEventId not found — return all up to limit
        return events.slice(0, limit);
      }
      return events.slice(idx + 1, idx + 1 + limit);
    }

    return events.slice(0, limit);
  }

  // ── Rate Limiting ───────────────────────────────────────────────

  /**
   * Check if the user is within rate limits.
   * Max RATE_LIMIT_MAX_PER_SECOND events per second per user.
   */
  private _checkRateLimit(userId: string): { allowed: boolean } {
    const now = Date.now();
    const entry = this.rateLimitMap.get(userId);

    if (!entry) {
      this.rateLimitMap.set(userId, { timestamps: [now] });
      return { allowed: true };
    }

    // Filter to only timestamps within the window
    entry.timestamps = entry.timestamps.filter(
      (ts) => now - ts < RATE_LIMIT_WINDOW_MS
    );

    if (entry.timestamps.length >= RATE_LIMIT_MAX_PER_SECOND) {
      return { allowed: false };
    }

    entry.timestamps.push(now);
    return { allowed: true };
  }

  // ── History Storage ─────────────────────────────────────────────

  private _storeHistory(event: RealtimeEvent): void {
    const userId = event.userId;
    let events = this.historyMap.get(userId);

    if (!events) {
      events = [];
      this.historyMap.set(userId, events);
    }

    events.unshift(event); // newest first

    // Enforce per-user limit
    if (events.length > HISTORY_MAX_PER_USER) {
      events.length = HISTORY_MAX_PER_USER;
    }

    this.historyTimestamps.set(userId, Date.now());
  }

  // ── Periodic Cleanup ────────────────────────────────────────────

  private _cleanup(): void {
    const now = Date.now();

    // Clean expired dedup entries
    for (const [key, entry] of this.dedupMap) {
      if (now - entry.timestamp > DEDUP_TTL_MS) {
        this.dedupMap.delete(key);
      }
    }

    // Clean expired history
    for (const [userId, lastTs] of this.historyTimestamps) {
      if (now - lastTs > HISTORY_TTL_MS) {
        this.historyMap.delete(userId);
        this.historyTimestamps.delete(userId);
      }
    }

    // Clean stale rate limit entries (no activity in last 10 seconds)
    for (const [userId, entry] of this.rateLimitMap) {
      const recentTs = entry.timestamps.filter((ts) => now - ts < 10_000);
      if (recentTs.length === 0) {
        this.rateLimitMap.delete(userId);
      } else {
        entry.timestamps = recentTs;
      }
    }
  }

  // ── Stats ───────────────────────────────────────────────────────

  getStats(): {
    totalPublished: number;
    dedupSize: number;
    historyUsers: number;
    rateLimitEntries: number;
    listenerCounts: Record<string, number>;
  } {
    const listenerCounts: Record<string, number> = {};
    for (const channel of EVENT_CHANNELS) {
      listenerCounts[channel] = this.listenerCount(channel);
    }
    listenerCounts['*'] = this.listenerCount('*');

    return {
      totalPublished: this.totalPublished,
      dedupSize: this.dedupMap.size,
      historyUsers: this.historyMap.size,
      rateLimitEntries: this.rateLimitMap.size,
      listenerCounts,
    };
  }

  // ── Graceful Shutdown ───────────────────────────────────────────

  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.removeAllListeners();
    this.dedupMap.clear();
    this.historyMap.clear();
    this.historyTimestamps.clear();
    this.rateLimitMap.clear();
  }
}

// ── Singleton instance ─────────────────────────────────────────────

export const eventBus = new EventBus();

// ── Helper: generate unique event ID ──────────────────────────────

function generateEventId(): string {
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ── Audit logging helper ──────────────────────────────────────────

async function logRealtimeAudit(
  userId: string,
  action: string,
  metadata?: Record<string, unknown>,
  resourceId?: string
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId,
        action,
        details: metadata ? JSON.stringify(metadata) : null,
        resource: 'realtime',
        resourceId: resourceId || null,
      },
    });
  } catch (error) {
    // Never block main flow for audit failures
    console.error('[RealtimeEngine] Audit log failed:', error);
  }
}

// ── Notification preference check ──────────────────────────────────

async function shouldDeliverNotification(
  userId: string,
  type: string,
  channel: string
): Promise<boolean> {
  try {
    const prefs = await db.notificationPreferences.findUnique({
      where: { userId },
    });

    if (!prefs) return true; // no preferences set = deliver by default

    // Check DND schedule
    if (prefs.dndStartTime && prefs.dndEndTime) {
      const now = new Date();
      const tz = prefs.dndTimezone || 'UTC';
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        const currentTime = formatter.format(now);
        if (currentTime >= prefs.dndStartTime && currentTime <= prefs.dndEndTime) {
          return false; // In DND window
        }
      } catch {
        // Invalid timezone — allow delivery
      }
    }

    // Check type-specific preferences
    if (prefs.typePreferences) {
      try {
        const typePrefs = JSON.parse(prefs.typePreferences) as Record<string, Record<string, boolean>>;
        const channelPref = typePrefs[type]?.[channel];
        if (channelPref === false) return false;
      } catch {
        // Invalid JSON — allow delivery
      }
    }

    // Check global channel preferences
    const channelMap: Record<string, boolean | undefined> = {
      in_app: prefs.inAppEnabled,
      email: prefs.emailEnabled,
      telegram: prefs.telegramEnabled,
      whatsapp: prefs.whatsappEnabled,
    };

    const enabled = channelMap[channel];
    if (enabled === false) return false;

    return true;
  } catch {
    return true; // On error, default to delivering
  }
}

// ═══════════════════════════════════════════════════════════════════
// PUBLIC API — Domain-specific event publishers
// ═══════════════════════════════════════════════════════════════════

/**
 * Publish a lead event.
 */
export async function publishLeadEvent(
  userId: string,
  type: LeadEventType,
  payload: Record<string, unknown>
): Promise<{ published: boolean; reason?: string }> {
  const event: RealtimeEvent = {
    eventId: generateEventId(),
    type,
    userId,
    orgId: payload.orgId as string | undefined,
    payload,
    timestamp: Date.now(),
    channel: 'lead_events',
  };

  const result = await eventBus.publishEvent('lead_events', event);

  // Audit log for significant lead events
  if (result.published && (type === 'discovered' || type === 'stage_changed' || type === 'analysis_complete')) {
    await logRealtimeAudit(userId, `lead_event_${type}`, {
      eventId: event.eventId,
      leadId: payload.leadId,
      ...payload,
    }, payload.leadId as string);
  }

  return result;
}

/**
 * Publish a payment event.
 */
export async function publishPaymentEvent(
  userId: string,
  type: PaymentEventType,
  payload: Record<string, unknown>
): Promise<{ published: boolean; reason?: string }> {
  const event: RealtimeEvent = {
    eventId: generateEventId(),
    type,
    userId,
    orgId: payload.orgId as string | undefined,
    payload,
    timestamp: Date.now(),
    channel: 'payment_events',
  };

  const result = await eventBus.publishEvent('payment_events', event);

  // Audit log for all payment events
  if (result.published) {
    await logRealtimeAudit(userId, `payment_event_${type}`, {
      eventId: event.eventId,
      ...payload,
    }, payload.paymentOrderId as string);
  }

  return result;
}

/**
 * Publish a message event.
 */
export async function publishMessageEvent(
  userId: string,
  type: MessageEventType,
  payload: Record<string, unknown>
): Promise<{ published: boolean; reason?: string }> {
  const event: RealtimeEvent = {
    eventId: generateEventId(),
    type,
    userId,
    orgId: payload.orgId as string | undefined,
    payload,
    timestamp: Date.now(),
    channel: 'message_events',
  };

  const result = await eventBus.publishEvent('message_events', event);

  // Audit for delivery failures
  if (result.published && (type === 'whatsapp_failed' || type === 'telegram_delivery')) {
    await logRealtimeAudit(userId, `message_event_${type}`, {
      eventId: event.eventId,
      channel: payload.channel,
      ...payload,
    }, payload.messageId as string);
  }

  return result;
}

/**
 * Publish an AI event.
 */
export async function publishAIEvent(
  userId: string,
  type: AIEventType,
  payload: Record<string, unknown>
): Promise<{ published: boolean; reason?: string }> {
  const event: RealtimeEvent = {
    eventId: generateEventId(),
    type,
    userId,
    orgId: payload.orgId as string | undefined,
    payload,
    timestamp: Date.now(),
    channel: 'ai_events',
  };

  // AI events are typically high-frequency (stream_token), skip audit logging for those
  const result = await eventBus.publishEvent('ai_events', event);

  if (result.published && type !== 'stream_token' && type !== 'cancel') {
    await logRealtimeAudit(userId, `ai_event_${type}`, {
      eventId: event.eventId,
      ...payload,
    }, payload.sessionId as string);
  }

  return result;
}

/**
 * Publish a workflow event.
 */
export async function publishWorkflowEvent(
  userId: string,
  type: WorkflowEventType,
  payload: Record<string, unknown>
): Promise<{ published: boolean; reason?: string }> {
  const event: RealtimeEvent = {
    eventId: generateEventId(),
    type,
    userId,
    orgId: payload.orgId as string | undefined,
    payload,
    timestamp: Date.now(),
    channel: 'workflow_events',
  };

  const result = await eventBus.publishEvent('workflow_events', event);

  // Audit for all workflow events
  if (result.published) {
    await logRealtimeAudit(userId, `workflow_event_${type}`, {
      eventId: event.eventId,
      workflowId: payload.workflowId,
      executionId: payload.executionId,
      ...payload,
    }, payload.executionId as string);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// NOTIFICATION CREATION + PUBLISHING
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a Notification record in DB, check preferences, then publish
 * a notification event to the EventBus and optionally Redis.
 *
 * Returns the created notification ID, or null if suppressed by prefs.
 */
export async function createAndPublishNotification(
  params: CreateNotificationParams
): Promise<{
  notificationId: string | null;
  published: boolean;
  reason?: string;
}> {
  const { userId, type, title, message, actionUrl, metadata, deliveredVia } = params;
  const via = deliveredVia || 'in_app';

  // 1. Check notification preferences
  const shouldDeliver = await shouldDeliverNotification(userId, type, via);
  if (!shouldDeliver) {
    return { notificationId: null, published: false, reason: 'suppressed_by_preferences' };
  }

  // 2. Create notification in DB
  let notificationId: string;
  try {
    const notification = await db.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        actionUrl: actionUrl || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        deliveredVia: via,
      },
    });
    notificationId = notification.id;
  } catch (error) {
    console.error('[RealtimeEngine] Failed to create notification:', error);
    return { notificationId: null, published: false, reason: 'db_error' };
  }

  // 3. Publish notification event
  const event: RealtimeEvent = {
    eventId: generateEventId(),
    type: 'notification_created',
    userId,
    payload: {
      notificationId,
      notificationType: type,
      title,
      message,
      actionUrl: actionUrl || null,
      deliveredVia: via,
      ...metadata,
    },
    timestamp: Date.now(),
    channel: 'notification_events',
  };

  const result = await eventBus.publishEvent('notification_events', event);

  // 4. Audit log
  await logRealtimeAudit(userId, 'notification_created', {
    notificationId,
    type,
    deliveredVia: via,
  });

  return { notificationId, published: result.published, reason: result.reason };
}

// ═══════════════════════════════════════════════════════════════════
// CONVENIENCE: Subscribe to event channels (for SSE routes, etc.)
// ═══════════════════════════════════════════════════════════════════

/**
 * Subscribe to events on a specific channel.
 * Returns an unsubscribe function.
 */
export function subscribeToChannel(
  channel: EventChannel | '*',
  callback: (event: RealtimeEvent) => void
): () => void {
  eventBus.on(channel, callback);
  return () => {
    eventBus.off(channel, callback);
  };
}

/**
 * Subscribe to events for a specific user across all channels.
 * Filters the wildcard events by userId.
 * Returns an unsubscribe function.
 */
export function subscribeToUserEvents(
  userId: string,
  callback: (event: RealtimeEvent) => void
): () => void {
  const handler = (event: RealtimeEvent) => {
    if (event.userId === userId) {
      callback(event);
    }
  };
  eventBus.on('*', handler);
  return () => {
    eventBus.off('*', handler);
  };
}

/**
 * Subscribe to events for a specific user on a specific channel.
 * Returns an unsubscribe function.
 */
export function subscribeToUserChannel(
  userId: string,
  channel: EventChannel,
  callback: (event: RealtimeEvent) => void
): () => void {
  const handler = (event: RealtimeEvent) => {
    if (event.userId === userId) {
      callback(event);
    }
  };
  eventBus.on(channel, handler);
  return () => {
    eventBus.off(channel, handler);
  };
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

export { eventBus as _eventBus }; // internal access if needed

/** Named export for event history retrieval (used by SSE routes) */
export function getEventHistory(
  userId: string,
  afterEventId?: string,
  limit: number = 50
): RealtimeEvent[] {
  return eventBus.getEventHistory(userId, afterEventId, limit);
}

const realtimeEngine = {
  publishEvent: eventBus.publishEvent.bind(eventBus),
  createAndPublishNotification,
  publishLeadEvent,
  publishPaymentEvent,
  publishMessageEvent,
  publishAIEvent,
  publishWorkflowEvent,
  getEventHistory: eventBus.getEventHistory.bind(eventBus),
  deduplicateEvent: eventBus.deduplicateEvent.bind(eventBus),
  subscribeToChannel,
  subscribeToUserEvents,
  subscribeToUserChannel,
  getStats: eventBus.getStats.bind(eventBus),
  shutdown: eventBus.shutdown.bind(eventBus),
};

export default realtimeEngine;
