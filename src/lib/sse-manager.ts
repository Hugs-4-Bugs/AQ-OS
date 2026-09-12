/**
 * AcquisitionOS — SSE Manager Service
 * Server-Sent Events endpoint manager for Next.js API routes.
 * Phase 11: Realtime Remediation
 */

import type { EventChannel } from './realtime-event-bus';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface SSEConnection {
  id: string;
  userId: string;
  channel: EventChannel;
  writer: WritableStreamDefaultWriter;
  encoder: TextEncoder;
  connectedAt: number;
  lastActivity: number;
  lastEventId?: string;
  closed: boolean;
}

interface SSEEvent {
  id: string;
  event?: string;
  data: unknown;
}

// ═══════════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════════

const activeConnections = new Map<string, SSEConnection>();
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds
let connectionCounter = 0;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

// ═══════════════════════════════════════════════════════════════════
// SSE Connection Management
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a new SSE connection for a user and channel.
 * Returns the connection object for use in API routes.
 */
export function createSSEConnection(
  userId: string,
  channel: EventChannel,
  writer: WritableStreamDefaultWriter,
  lastEventId?: string,
): SSEConnection {
  const connId = `sse_${++connectionCounter}_${Date.now()}`;
  const encoder = new TextEncoder();

  const connection: SSEConnection = {
    id: connId,
    userId,
    channel,
    writer,
    encoder,
    connectedAt: Date.now(),
    lastActivity: Date.now(),
    lastEventId,
    closed: false,
  };

  activeConnections.set(connId, connection);

  // Start heartbeat if not already running
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(sendHeartbeats, HEARTBEAT_INTERVAL_MS);
  }

  return connection;
}

/**
 * Send an SSE event to a specific connection.
 * Format: id: <id>\nevent: <type>\ndata: <json>\n\n
 */
export async function sendSSEEvent(
  connection: SSEConnection,
  sseEvent: SSEEvent,
): Promise<boolean> {
  if (connection.closed) return false;

  try {
    const lines: string[] = [];
    if (sseEvent.id) {
      lines.push(`id: ${sseEvent.id}`);
    }
    if (sseEvent.event) {
      lines.push(`event: ${sseEvent.event}`);
    }

    const dataStr = typeof sseEvent.data === 'string'
      ? sseEvent.data
      : JSON.stringify(sseEvent.data);

    // SSE spec: data lines prefixed with "data: "
    for (const line of dataStr.split('\n')) {
      lines.push(`data: ${line}`);
    }
    lines.push('', ''); // Two newlines to end event

    const encoded = connection.encoder.encode(lines.join('\n'));
    await connection.writer.write(encoded);

    connection.lastActivity = Date.now();
    connection.lastEventId = sseEvent.id;
    return true;
  } catch (err) {
    console.error(`[SSE] Write error for ${connection.id}:`, err);
    closeSSEConnection(connection.id);
    return false;
  }
}

/**
 * Close an SSE connection and remove it from tracking.
 */
export function closeSSEConnection(connectionId: string): boolean {
  const conn = activeConnections.get(connectionId);
  if (!conn) return false;

  conn.closed = true;
  try {
    conn.writer.close();
  } catch {
    // Writer may already be closed
  }

  activeConnections.delete(connectionId);

  // Stop heartbeat if no connections remain
  if (activeConnections.size === 0 && heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  return true;
}

/**
 * Handle Last-Event-ID header for resume support.
 * Returns events that were missed since the given event ID.
 */
export function handleLastEventId(
  _connection: SSEConnection,
  _lastEventId: string,
): void {
  // The actual replay logic is handled by the caller
  // using the replayEvents function from the event bus.
  // This function validates and stores the lastEventId.
  _connection.lastEventId = _lastEventId;
  _connection.lastActivity = Date.now();
}

/**
 * Clean up stale SSE connections (no activity for 5 minutes).
 * Should be called periodically.
 */
export function cleanupStaleConnections(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [connId, conn] of activeConnections.entries()) {
    if (now - conn.lastActivity > INACTIVITY_TIMEOUT_MS) {
      closeSSEConnection(connId);
      cleaned++;
    }
  }

  return cleaned;
}

// ═══════════════════════════════════════════════════════════════════
// Broadcast Helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Broadcast an event to all SSE connections on a specific channel.
 * Optionally filter by userId.
 */
export async function broadcastToChannel(
  channel: EventChannel,
  sseEvent: SSEEvent,
  userId?: string,
): Promise<number> {
  let delivered = 0;

  for (const conn of activeConnections.values()) {
    if (conn.channel !== channel) continue;
    if (userId && conn.userId !== userId) continue;

    const sent = await sendSSEEvent(conn, sseEvent);
    if (sent) delivered++;
  }

  return delivered;
}

/**
 * Send an event to all SSE connections for a specific user.
 */
export async function sendToUser(
  userId: string,
  sseEvent: SSEEvent,
): Promise<number> {
  let delivered = 0;

  for (const conn of activeConnections.values()) {
    if (conn.userId !== userId) continue;

    const sent = await sendSSEEvent(conn, sseEvent);
    if (sent) delivered++;
  }

  return delivered;
}

// ═══════════════════════════════════════════════════════════════════
// Heartbeat
// ═══════════════════════════════════════════════════════════════════

async function sendHeartbeats(): Promise<void> {
  for (const conn of activeConnections.values()) {
    if (conn.closed) continue;

    try {
      const comment = conn.encoder.encode(': heartbeat\n\n');
      await conn.writer.write(comment);
    } catch {
      closeSSEConnection(conn.id);
    }
  }

  // Also clean up stale connections on heartbeat tick
  cleanupStaleConnections();
}

// ═══════════════════════════════════════════════════════════════════
// Stats
// ═══════════════════════════════════════════════════════════════════

export function getSSEStats(): {
  totalConnections: number;
  connectionsByChannel: Record<string, number>;
  connectionsByUser: Record<string, number>;
  oldestConnection: number | null;
} {
  const byChannel: Record<string, number> = {};
  const byUser: Record<string, number> = {};
  let oldest: number | null = null;

  for (const conn of activeConnections.values()) {
    byChannel[conn.channel] = (byChannel[conn.channel] || 0) + 1;
    byUser[conn.userId] = (byUser[conn.userId] || 0) + 1;
    if (oldest === null || conn.connectedAt < oldest) {
      oldest = conn.connectedAt;
    }
  }

  return {
    totalConnections: activeConnections.size,
    connectionsByChannel: byChannel,
    connectionsByUser: byUser,
    oldestConnection: oldest,
  };
}

/**
 * Get all active SSE connections (for internal use).
 */
export function getActiveConnections(): SSEConnection[] {
  return Array.from(activeConnections.values()).filter(c => !c.closed);
}
