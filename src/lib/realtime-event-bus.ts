/**
 * AcquisitionOS — Realtime Event Bus Service
 * Central event bus for all realtime events with pub/sub, deduplication, and replay support.
 * Phase 11: Realtime Remediation
 */

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export type EventChannel =
  | 'lead_events'
  | 'payment_events'
  | 'notification_events'
  | 'message_events'
  | 'workflow_events'
  | 'ai_events';

export interface RealtimeEvent {
  id: string;
  channel: EventChannel;
  eventType: string;
  payload: Record<string, unknown>;
  userId?: string;
  orgId?: string;
  timestamp: number;
  critical?: boolean; // critical events have longer retention
}

export type EventHandler = (event: RealtimeEvent) => void | Promise<void>;

export interface Subscription {
  id: string;
  channel: EventChannel;
  handler: EventHandler;
  filter?: (event: RealtimeEvent) => boolean;
}

// ═══════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════

const MAX_REPLAY_STORE_PER_CHANNEL = 500;
const MAX_QUEUE_SIZE = 10000;
const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes dedup window

// ═══════════════════════════════════════════════════════════════════
// Event Bus State
// ═══════════════════════════════════════════════════════════════════

const subscriptions = new Map<string, Subscription>();
const replayStore = new Map<EventChannel, RealtimeEvent[]>();
const dedupCache = new Map<string, number>(); // eventId -> timestamp
const pendingQueue: RealtimeEvent[] = [];
let subscriptionCounter = 0;

// Initialize replay store for each channel
const CHANNELS: EventChannel[] = [
  'lead_events',
  'payment_events',
  'notification_events',
  'message_events',
  'workflow_events',
  'ai_events',
];

for (const ch of CHANNELS) {
  replayStore.set(ch, []);
}

// ═══════════════════════════════════════════════════════════════════
// Deduplication
// ═══════════════════════════════════════════════════════════════════

/**
 * Check if an event has already been processed (deduplication).
 * Returns true if the event is a duplicate (should be dropped).
 */
export function deduplicateEvent(eventId: string): boolean {
  const now = Date.now();

  // Clean up expired entries
  for (const [id, ts] of dedupCache.entries()) {
    if (now - ts > DEDUP_TTL_MS) {
      dedupCache.delete(id);
    }
  }

  if (dedupCache.has(eventId)) {
    return true; // duplicate
  }

  dedupCache.set(eventId, now);
  return false;
}

// ═══════════════════════════════════════════════════════════════════
// Publish
// ═══════════════════════════════════════════════════════════════════

/**
 * Publish an event to the event bus.
 * Deduplicates, stores for replay, and delivers to subscribers.
 * Handles backpressure by dropping oldest events if queue is full.
 */
export async function publishEvent(event: Omit<RealtimeEvent, 'id' | 'timestamp'> & { id?: string }): Promise<{
  published: boolean;
  reason?: string;
  eventId: string;
}> {
  const fullEvent: RealtimeEvent = {
    ...event,
    id: event.id || generateEventId(),
    timestamp: Date.now(),
  };

  // Deduplicate
  if (deduplicateEvent(fullEvent.id)) {
    return { published: false, reason: 'duplicate', eventId: fullEvent.id };
  }

  // Backpressure: check queue overflow
  if (pendingQueue.length >= MAX_QUEUE_SIZE) {
    // Drop oldest non-critical event
    const oldestIdx = pendingQueue.findIndex(e => !e.critical);
    if (oldestIdx >= 0) {
      pendingQueue.splice(oldestIdx, 1);
    } else {
      return { published: false, reason: 'queue_full', eventId: fullEvent.id };
    }
  }

  // Store for replay
  const channelEvents = replayStore.get(fullEvent.channel);
  if (channelEvents) {
    channelEvents.push(fullEvent);
    // Trim to max size
    if (channelEvents.length > MAX_REPLAY_STORE_PER_CHANNEL) {
      channelEvents.splice(0, channelEvents.length - MAX_REPLAY_STORE_PER_CHANNEL);
    }
  }

  // Queue for delivery
  pendingQueue.push(fullEvent);

  // Deliver to subscribers synchronously (non-blocking)
  deliverToSubscribers(fullEvent);

  return { published: true, eventId: fullEvent.id };
}

// ═══════════════════════════════════════════════════════════════════
// Subscribe / Unsubscribe
// ═══════════════════════════════════════════════════════════════════

/**
 * Subscribe to events on a specific channel.
 * Returns subscription ID for later unsubscription.
 */
export function subscribeToChannel(
  channel: EventChannel,
  handler: EventHandler,
  filter?: (event: RealtimeEvent) => boolean,
): string {
  const subId = `sub_${++subscriptionCounter}_${Date.now()}`;
  subscriptions.set(subId, { id: subId, channel, handler, filter });
  return subId;
}

/**
 * Unsubscribe from a channel using the subscription ID.
 */
export function unsubscribeFromChannel(subscriptionId: string): boolean {
  return subscriptions.delete(subscriptionId);
}

// ═══════════════════════════════════════════════════════════════════
// Replay & History
// ═══════════════════════════════════════════════════════════════════

/**
 * Replay events for a specific channel, optionally from a given timestamp.
 * Returns events sorted by timestamp ascending.
 */
export function replayEvents(
  channel: EventChannel,
  options?: {
    sinceTimestamp?: number;
    limit?: number;
    userId?: string;
    orgId?: string;
  },
): RealtimeEvent[] {
  let events = replayStore.get(channel) || [];

  if (options?.sinceTimestamp) {
    events = events.filter(e => e.timestamp >= options.sinceTimestamp!);
  }
  if (options?.userId) {
    events = events.filter(e => e.userId === options.userId || !e.userId);
  }
  if (options?.orgId) {
    events = events.filter(e => e.orgId === options.orgId || !e.orgId);
  }
  if (options?.limit) {
    events = events.slice(-options.limit);
  }

  return events.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Get event history for a channel. Alias for replayEvents.
 */
export function getEventHistory(
  channel: EventChannel,
  limit?: number,
): RealtimeEvent[] {
  return replayEvents(channel, { limit });
}

// ═══════════════════════════════════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════════════════════════════════

function deliverToSubscribers(event: RealtimeEvent): void {
  for (const sub of subscriptions.values()) {
    if (sub.channel !== event.channel) continue;
    if (sub.filter && !sub.filter(event)) continue;

    // Fire and forget — errors caught internally
    try {
      const result = sub.handler(event);
      if (result instanceof Promise) {
        result.catch(err => {
          console.error(`[EventBus] Subscriber ${sub.id} error:`, err);
        });
      }
    } catch (err) {
      console.error(`[EventBus] Subscriber ${sub.id} sync error:`, err);
    }
  }

  // Remove from pending queue
  const idx = pendingQueue.indexOf(event);
  if (idx >= 0) {
    pendingQueue.splice(idx, 1);
  }
}

function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ═══════════════════════════════════════════════════════════════════
// Stats & Diagnostics
// ═══════════════════════════════════════════════════════════════════

export function getEventBusStats(): {
  totalSubscriptions: number;
  subscriptionsByChannel: Record<string, number>;
  replayStoreSizes: Record<string, number>;
  pendingQueueSize: number;
  dedupCacheSize: number;
} {
  const byChannel: Record<string, number> = {};
  for (const sub of subscriptions.values()) {
    byChannel[sub.channel] = (byChannel[sub.channel] || 0) + 1;
  }

  const storeSizes: Record<string, number> = {};
  for (const [ch, events] of replayStore.entries()) {
    storeSizes[ch] = events.length;
  }

  return {
    totalSubscriptions: subscriptions.size,
    subscriptionsByChannel: byChannel,
    replayStoreSizes: storeSizes,
    pendingQueueSize: pendingQueue.length,
    dedupCacheSize: dedupCache.size,
  };
}
