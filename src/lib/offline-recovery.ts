/**
 * AcquisitionOS — Offline Recovery Service
 * Track offline periods for users and deliver missed events on reconnect.
 * Phase 11: Realtime Remediation
 */

import { db } from './db';
import { replayEvents, type RealtimeEvent, type EventChannel } from './realtime-event-bus';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface OfflinePeriod {
  userId: string;
  wentOfflineAt: number;
  cameBackOnlineAt: number;
  recovered: boolean;
}

interface RecoveryResult {
  userId: string;
  totalMissed: number;
  recovered: number;
  criticalRecovered: number;
  batchesDelivered: number;
}

// ═══════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════

const MAX_EVENTS_PER_RECOVERY = 100;
const CRITICAL_CHANNELS: EventChannel[] = ['payment_events', 'notification_events'];
const OFFLINE_THRESHOLD_MS = 30 * 1000; // 30 seconds — consider user offline if no heartbeat for this long

// ═══════════════════════════════════════════════════════════════════
// Offline Tracking (in-memory)
// ═══════════════════════════════════════════════════════════════════

const lastSeenMap = new Map<string, number>(); // userId -> last activity timestamp
const offlinePeriods = new Map<string, OfflinePeriod>(); // userId -> current offline period

/**
 * Track when a user goes offline.
 * Called when a WebSocket/SSE connection drops.
 */
export function trackOfflinePeriod(userId: string, wentOfflineAt?: number): void {
  const ts = wentOfflineAt || Date.now();
  lastSeenMap.delete(userId);

  if (!offlinePeriods.has(userId)) {
    offlinePeriods.set(userId, {
      userId,
      wentOfflineAt: ts,
      cameBackOnlineAt: 0,
      recovered: false,
    });
  }
}

/**
 * Track user activity (heartbeat, API call, etc.).
 * If they were offline, trigger recovery.
 */
export function trackUserActivity(userId: string): void {
  const now = Date.now();
  const wasOffline = offlinePeriods.has(userId) && !offlinePeriods.get(userId)!.recovered;

  lastSeenMap.set(userId, now);

  if (wasOffline) {
    const period = offlinePeriods.get(userId)!;
    period.cameBackOnlineAt = now;
    // Recovery is triggered separately via recoverMissedEvents()
  }
}

/**
 * Get the last-seen timestamp for a user.
 */
export function getLastSeen(userId: string): number | undefined {
  return lastSeenMap.get(userId);
}

// ═══════════════════════════════════════════════════════════════════
// Event Recovery
// ═══════════════════════════════════════════════════════════════════

/**
 * Recover missed events for a user after an offline period.
 * Queries the replay store for events since the user went offline,
 * prioritizes critical events, and delivers in batches.
 */
export async function recoverMissedEvents(
  userId: string,
  options?: {
    orgId?: string;
    sinceTimestamp?: number;
    channels?: EventChannel[];
  },
): Promise<RecoveryResult> {
  const period = offlinePeriods.get(userId);
  const sinceTs = options?.sinceTimestamp
    || period?.wentOfflineAt
    || (lastSeenMap.get(userId) || 0);

  const channels = options?.channels || [
    'lead_events',
    'payment_events',
    'notification_events',
    'message_events',
    'workflow_events',
    'ai_events',
  ];

  // Collect all missed events
  const allEvents: RealtimeEvent[] = [];
  for (const ch of channels) {
    const events = replayEvents(ch, {
      sinceTimestamp: sinceTs,
      userId,
      orgId: options?.orgId,
    });
    allEvents.push(...events);
  }

  // Sort by timestamp
  allEvents.sort((a, b) => a.timestamp - b.timestamp);

  // Prioritize critical events
  const prioritized = prioritizeCriticalEvents(allEvents);

  // Batch deliver
  const { delivered, batches } = await batchDeliverEvents(userId, prioritized);

  // Mark offline period as recovered
  if (period) {
    period.recovered = true;
  }

  // Mark events as delivered in database
  const eventIds = prioritized.slice(0, delivered).map(e => e.id);
  await markEventsDelivered(eventIds);

  return {
    userId,
    totalMissed: allEvents.length,
    recovered: delivered,
    criticalRecovered: prioritized.filter(
      (e, idx) => idx < delivered && (CRITICAL_CHANNELS.includes(e.channel) || e.critical)
    ).length,
    batchesDelivered: batches,
  };
}

/**
 * Prioritize critical events (payments, security) before normal events.
 */
export function prioritizeCriticalEvents(events: RealtimeEvent[]): RealtimeEvent[] {
  const critical: RealtimeEvent[] = [];
  const normal: RealtimeEvent[] = [];

  for (const event of events) {
    if (CRITICAL_CHANNELS.includes(event.channel) || event.critical) {
      critical.push(event);
    } else {
      normal.push(event);
    }
  }

  // Critical events first, then normal by timestamp
  return [
    ...critical.sort((a, b) => a.timestamp - b.timestamp),
    ...normal.sort((a, b) => a.timestamp - b.timestamp),
  ];
}

/**
 * Deliver events in batches to avoid overwhelming the client.
 * Max MAX_EVENTS_PER_RECOVERY per batch.
 */
export async function batchDeliverEvents(
  userId: string,
  events: RealtimeEvent[],
): Promise<{ delivered: number; batches: number }> {
  let delivered = 0;
  let batches = 0;

  for (let i = 0; i < events.length; i += MAX_EVENTS_PER_RECOVERY) {
    const batch = events.slice(i, i + MAX_EVENTS_PER_RECOVERY);

    // In a real implementation, this would push events via WebSocket/SSE
    // For now, we mark them as delivered in the database
    try {
      await markEventsDelivered(batch.map(e => e.id));
      delivered += batch.length;
      batches++;
    } catch (err) {
      console.error(`[OfflineRecovery] Batch delivery failed for user ${userId}:`, err);
      break;
    }

    // Small delay between batches to avoid overwhelming
    if (i + MAX_EVENTS_PER_RECOVERY < events.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return { delivered, batches };
}

/**
 * Mark events as delivered in the database.
 */
export async function markEventsDelivered(eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return;

  try {
    await db.realtimeEvent.updateMany({
      where: { eventId: { in: eventIds } },
      data: { deliveredAt: true },
    });
  } catch (err) {
    console.error('[OfflineRecovery] Failed to mark events as delivered:', err);
  }
}

/**
 * Check if a user is currently offline.
 */
export function isUserOffline(userId: string): boolean {
  const lastSeen = lastSeenMap.get(userId);
  if (!lastSeen) return true;
  return Date.now() - lastSeen > OFFLINE_THRESHOLD_MS;
}

/**
 * Get offline period info for a user.
 */
export function getOfflinePeriod(userId: string): OfflinePeriod | undefined {
  return offlinePeriods.get(userId);
}

/**
 * Clean up old offline periods.
 */
export function cleanupOfflinePeriods(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [userId, period] of offlinePeriods.entries()) {
    if (period.recovered && now - period.cameBackOnlineAt > maxAgeMs) {
      offlinePeriods.delete(userId);
      cleaned++;
    }
  }

  return cleaned;
}
