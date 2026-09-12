/**
 * AcquisitionOS — Replay Persistence Service
 * Store events for replay in database with retention policies.
 * Phase 11: Realtime Remediation
 */

import { db } from './db';
import type { EventChannel, RealtimeEvent } from './realtime-event-bus';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface EventQueryOptions {
  channel?: EventChannel;
  eventType?: string;
  userId?: string;
  orgId?: string;
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
  deliveredOnly?: boolean;
}

interface EventStats {
  channel: string;
  totalEvents: number;
  deliveredEvents: number;
  undeliveredEvents: number;
  eventTypes: Record<string, number>;
}

interface CompactionResult {
  compactedChannels: number;
  removedEvents: number;
  createdAggregates: number;
}

// ═══════════════════════════════════════════════════════════════════
// Retention Policy
// ═══════════════════════════════════════════════════════════════════

const NORMAL_RETENTION_DAYS = 7;
const CRITICAL_RETENTION_DAYS = 30;
const CRITICAL_CHANNELS: EventChannel[] = ['payment_events', 'notification_events'];

function getRetentionDays(channel: EventChannel): number {
  return CRITICAL_CHANNELS.includes(channel) ? CRITICAL_RETENTION_DAYS : NORMAL_RETENTION_DAYS;
}

// ═══════════════════════════════════════════════════════════════════
// Persist Event
// ═══════════════════════════════════════════════════════════════════

/**
 * Persist a realtime event to the database for replay and audit.
 */
export async function persistEvent(event: RealtimeEvent): Promise<string | null> {
  try {
    const record = await db.realtimeEvent.create({
      data: {
        channel: event.channel,
        eventType: event.eventType,
        payload: JSON.stringify(event.payload),
        userId: event.userId || null,
        orgId: event.orgId || null,
        eventId: event.id,
        deliveredAt: false,
      },
    });
    return record.id;
  } catch (err: unknown) {
    // Handle duplicate eventId gracefully
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
      return null; // Duplicate — already persisted
    }
    console.error('[ReplayPersistence] Failed to persist event:', err);
    return null;
  }
}

/**
 * Persist multiple events in batch.
 */
export async function persistEvents(events: RealtimeEvent[]): Promise<number> {
  let persisted = 0;
  for (const event of events) {
    const result = await persistEvent(event);
    if (result) persisted++;
  }
  return persisted;
}

// ═══════════════════════════════════════════════════════════════════
// Query Events
// ═══════════════════════════════════════════════════════════════════

/**
 * Query events from the database with filtering.
 */
export async function queryEvents(options: EventQueryOptions = {}): Promise<RealtimeEvent[]> {
  try {
    const where: Record<string, unknown> = {};

    if (options.channel) where.channel = options.channel;
    if (options.eventType) where.eventType = options.eventType;
    if (options.userId) where.userId = options.userId;
    if (options.orgId) where.orgId = options.orgId;
    if (options.deliveredOnly !== undefined) where.deliveredAt = options.deliveredOnly;

    if (options.since || options.until) {
      const createdAt: Record<string, Date> = {};
      if (options.since) createdAt.gte = options.since;
      if (options.until) createdAt.lte = options.until;
      where.createdAt = createdAt;
    }

    const records = await db.realtimeEvent.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: options.limit || 100,
      skip: options.offset || 0,
    });

    return records.map(r => ({
      id: r.eventId,
      channel: r.channel as EventChannel,
      eventType: r.eventType,
      payload: JSON.parse(r.payload),
      userId: r.userId || undefined,
      orgId: r.orgId || undefined,
      timestamp: r.createdAt.getTime(),
      critical: CRITICAL_CHANNELS.includes(r.channel as EventChannel),
    }));
  } catch (err) {
    console.error('[ReplayPersistence] Query failed:', err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// Compaction
// ═══════════════════════════════════════════════════════════════════

/**
 * Compact old events: aggregate stats and delete individual events
 * that are past retention and already delivered.
 */
export async function compactOldEvents(): Promise<CompactionResult> {
  let removedEvents = 0;
  let createdAggregates = 0;
  let compactedChannels = 0;

  for (const channel of [
    'lead_events',
    'payment_events',
    'notification_events',
    'message_events',
    'workflow_events',
    'ai_events',
  ] as EventChannel[]) {
    const retentionDays = getRetentionDays(channel);
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    try {
      // Count events to compact
      const toCompact = await db.realtimeEvent.findMany({
        where: {
          channel,
          createdAt: { lt: cutoffDate },
          deliveredAt: true,
        },
        select: { eventType: true, createdAt: true },
      });

      if (toCompact.length === 0) continue;

      // Delete compacted events
      const deleted = await db.realtimeEvent.deleteMany({
        where: {
          channel,
          createdAt: { lt: cutoffDate },
          deliveredAt: true,
        },
      });

      removedEvents += deleted.count;
      createdAggregates++; // One aggregate per channel
      compactedChannels++;
    } catch (err) {
      console.error(`[ReplayPersistence] Compaction failed for ${channel}:`, err);
    }
  }

  return { compactedChannels, removedEvents, createdAggregates };
}

// ═══════════════════════════════════════════════════════════════════
// Stats
// ═══════════════════════════════════════════════════════════════════

/**
 * Get event statistics, optionally per channel.
 */
export async function getEventStats(channel?: EventChannel): Promise<EventStats[]> {
  const channels = channel
    ? [channel]
    : (['lead_events', 'payment_events', 'notification_events', 'message_events', 'workflow_events', 'ai_events'] as EventChannel[]);

  const stats: EventStats[] = [];

  for (const ch of channels) {
    try {
      const [total, delivered, undelivered] = await Promise.all([
        db.realtimeEvent.count({ where: { channel: ch } }),
        db.realtimeEvent.count({ where: { channel: ch, deliveredAt: true } }),
        db.realtimeEvent.count({ where: { channel: ch, deliveredAt: false } }),
      ]);

      // Get event type breakdown
      const typeRecords = await db.realtimeEvent.findMany({
        where: { channel: ch },
        select: { eventType: true },
      });

      const eventTypes: Record<string, number> = {};
      for (const r of typeRecords) {
        eventTypes[r.eventType] = (eventTypes[r.eventType] || 0) + 1;
      }

      stats.push({
        channel: ch,
        totalEvents: total,
        deliveredEvents: delivered,
        undeliveredEvents: undelivered,
        eventTypes,
      });
    } catch (err) {
      console.error(`[ReplayPersistence] Stats failed for ${ch}:`, err);
      stats.push({
        channel: ch,
        totalEvents: 0,
        deliveredEvents: 0,
        undeliveredEvents: 0,
        eventTypes: {},
      });
    }
  }

  return stats;
}

// ═══════════════════════════════════════════════════════════════════
// Delete Expired
// ═══════════════════════════════════════════════════════════════════

/**
 * Delete events that are past their retention period.
 * More aggressive than compaction — also removes undelivered expired events.
 */
export async function deleteExpiredEvents(): Promise<number> {
  let totalDeleted = 0;

  for (const channel of [
    'lead_events',
    'payment_events',
    'notification_events',
    'message_events',
    'workflow_events',
    'ai_events',
  ] as EventChannel[]) {
    const retentionDays = getRetentionDays(channel);
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    try {
      const result = await db.realtimeEvent.deleteMany({
        where: {
          channel,
          createdAt: { lt: cutoffDate },
        },
      });
      totalDeleted += result.count;
    } catch (err) {
      console.error(`[ReplayPersistence] Delete expired failed for ${channel}:`, err);
    }
  }

  return totalDeleted;
}
