/**
 * AcquisitionOS — WebSocket Manager Service
 * Socket.IO server on port 3003 with room subscriptions, JWT auth,
 * heartbeat, event replay, and connection management.
 * Phase 11: Realtime Remediation
 */

import { createServer } from 'http';
import { Server, Socket } from 'socket.io';

// ═══════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════

const PORT = 3003;
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const STALE_THRESHOLD_MS = 60_000; // 60 seconds — no heartbeat = stale
const MAX_CONNECTIONS_PER_USER = 3;
const REPLAY_BUFFER_SIZE = 50; // last 50 events per room

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface AuthPayload {
  userId: string;
  orgId?: string;
  token: string;
}

interface RoomEvent {
  id: string;
  channel: string;
  eventType: string;
  payload: unknown;
  timestamp: number;
}

interface UserConnection {
  userId: string;
  orgId?: string;
  socketId: string;
  rooms: Set<string>;
  connectedAt: number;
  lastHeartbeat: number;
}

// ═══════════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════════

const userConnections = new Map<string, UserConnection[]>(); // userId -> connections
const socketMap = new Map<string, UserConnection>(); // socketId -> connection
const roomEventBuffers = new Map<string, RoomEvent[]>(); // room -> last N events

// Channel to Socket.IO event name mapping
const CHANNEL_EVENTS: Record<string, string> = {
  notifications: 'notification_event',
  messages: 'message_event',
  payments: 'payment_event',
  leads: 'lead_event',
  workflows: 'workflow_event',
  analytics: 'analytics_event',
};

// ═══════════════════════════════════════════════════════════════════
// Socket.IO Server Setup
// ═══════════════════════════════════════════════════════════════════

const httpServer = createServer();
const io = new Server(httpServer, {
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60_000,
  pingInterval: 25_000,
});

// ═══════════════════════════════════════════════════════════════════
// Authentication Middleware
// ═══════════════════════════════════════════════════════════════════

io.use((socket, next) => {
  const auth = socket.handshake.auth as AuthPayload;

  if (!auth || !auth.userId || !auth.token) {
    return next(new Error('Authentication required: userId and token must be provided'));
  }

  // In production, validate JWT token here
  // For now, accept any token with a valid userId
  if (auth.token.length < 1) {
    return next(new Error('Invalid authentication token'));
  }

  // Check concurrent connection limit
  const existing = userConnections.get(auth.userId) || [];
  if (existing.length >= MAX_CONNECTIONS_PER_USER) {
    // Disconnect the oldest connection for this user
    const oldest = existing[0];
    const oldSocket = io.sockets.sockets.get(oldest.socketId);
    if (oldSocket) {
      oldSocket.emit('error', { message: 'Connection replaced by new session' });
      oldSocket.disconnect(true);
    }
    existing.shift();
  }

  next();
});

// ═══════════════════════════════════════════════════════════════════
// Connection Handler
// ═══════════════════════════════════════════════════════════════════

io.on('connection', (socket: Socket) => {
  const auth = socket.handshake.auth as AuthPayload;
  const now = Date.now();

  // Register connection
  const connection: UserConnection = {
    userId: auth.userId,
    orgId: auth.orgId,
    socketId: socket.id,
    rooms: new Set(),
    connectedAt: now,
    lastHeartbeat: now,
  };

  socketMap.set(socket.id, connection);

  const userConns = userConnections.get(auth.userId) || [];
  userConns.push(connection);
  userConnections.set(auth.userId, userConns);

  // Auto-join user's personal room
  const userRoom = `user:${auth.userId}`;
  socket.join(userRoom);
  connection.rooms.add(userRoom);

  // Auto-join org room if orgId provided
  if (auth.orgId) {
    const orgRoom = `org:${auth.orgId}`;
    socket.join(orgRoom);
    connection.rooms.add(orgRoom);
  }

  console.log(`[WS] User ${auth.userId} connected (${socket.id}), total: ${socketMap.size}`);

  // ── Subscribe to a channel room ──────────────────────────────────

  socket.on('subscribe', (data: { channel: string; targetId?: string }) => {
    const { channel, targetId } = data;
    let roomName: string;

    if (targetId) {
      roomName = `${channel}:${targetId}`;
    } else {
      roomName = channel;
    }

    socket.join(roomName);
    connection.rooms.add(roomName);

    // Replay last events from buffer
    const buffer = roomEventBuffers.get(roomName) || [];
    if (buffer.length > 0) {
      socket.emit('replay', { room: roomName, events: buffer });
    }

    console.log(`[WS] ${auth.userId} subscribed to ${roomName}`);
  });

  // ── Unsubscribe from a channel room ──────────────────────────────

  socket.on('unsubscribe', (data: { channel: string; targetId?: string }) => {
    const { channel, targetId } = data;
    const roomName = targetId ? `${channel}:${targetId}` : channel;

    socket.leave(roomName);
    connection.rooms.delete(roomName);

    console.log(`[WS] ${auth.userId} unsubscribed from ${roomName}`);
  });

  // ── Heartbeat ────────────────────────────────────────────────────

  socket.on('heartbeat', () => {
    connection.lastHeartbeat = Date.now();
    socket.emit('heartbeat_ack', { timestamp: Date.now() });
  });

  // ── Reconnection: request missed events ──────────────────────────

  socket.on('recover', (data: { lastEventId?: string; sinceTimestamp?: number }) => {
    const { lastEventId, sinceTimestamp } = data;

    // Replay events from all subscribed rooms
    const recoveredEvents: RoomEvent[] = [];

    for (const room of connection.rooms) {
      const buffer = roomEventBuffers.get(room) || [];

      for (const event of buffer) {
        if (lastEventId && event.id === lastEventId) {
          // Skip events up to and including the last seen
          continue;
        }
        if (sinceTimestamp && event.timestamp < sinceTimestamp) {
          continue;
        }
        recoveredEvents.push(event);
      }
    }

    // Sort by timestamp
    recoveredEvents.sort((a, b) => a.timestamp - b.timestamp);

    // Limit to REPLAY_BUFFER_SIZE
    const limited = recoveredEvents.slice(-REPLAY_BUFFER_SIZE);

    socket.emit('recovered', {
      count: limited.length,
      events: limited,
    });
  });

  // ── Disconnect ───────────────────────────────────────────────────

  socket.on('disconnect', (reason) => {
    socketMap.delete(socket.id);

    const userConns = userConnections.get(auth.userId) || [];
    const idx = userConns.findIndex(c => c.socketId === socket.id);
    if (idx >= 0) {
      userConns.splice(idx, 1);
    }
    if (userConns.length === 0) {
      userConnections.delete(auth.userId);
    }

    console.log(`[WS] User ${auth.userId} disconnected (${reason}), total: ${socketMap.size}`);
  });

  // ── Error ────────────────────────────────────────────────────────

  socket.on('error', (error) => {
    console.error(`[WS] Socket error (${socket.id}):`, error);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Event Forwarding (from Redis pub/sub or direct publish)
// ═══════════════════════════════════════════════════════════════════

/**
 * Forward an event to all subscribers in a room.
 * Also stores in the replay buffer.
 */
export function forwardEvent(room: string, event: RoomEvent): void {
  // Store in buffer
  let buffer = roomEventBuffers.get(room);
  if (!buffer) {
    buffer = [];
    roomEventBuffers.set(room, buffer);
  }
  buffer.push(event);
  if (buffer.length > REPLAY_BUFFER_SIZE) {
    buffer.shift();
  }

  // Emit to room
  const eventName = CHANNEL_EVENTS[event.channel] || 'event';
  io.to(room).emit(eventName, event);
}

/**
 * Forward an event to a specific user.
 */
export function forwardToUser(userId: string, event: RoomEvent): void {
  const eventName = CHANNEL_EVENTS[event.channel] || 'event';
  io.to(`user:${userId}`).emit(eventName, event);

  // Also store in user room buffer
  const userRoom = `user:${userId}`;
  let buffer = roomEventBuffers.get(userRoom);
  if (!buffer) {
    buffer = [];
    roomEventBuffers.set(userRoom, buffer);
  }
  buffer.push(event);
  if (buffer.length > REPLAY_BUFFER_SIZE) {
    buffer.shift();
  }
}

// ═══════════════════════════════════════════════════════════════════
// Stale Connection Cleanup
// ═══════════════════════════════════════════════════════════════════

setInterval(() => {
  const now = Date.now();
  const staleSockets: string[] = [];

  for (const [socketId, conn] of socketMap.entries()) {
    if (now - conn.lastHeartbeat > STALE_THRESHOLD_MS) {
      staleSockets.push(socketId);
    }
  }

  for (const socketId of staleSockets) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('error', { message: 'Connection timed out due to inactivity' });
      socket.disconnect(true);
    }
  }

  if (staleSockets.length > 0) {
    console.log(`[WS] Cleaned up ${staleSockets.length} stale connections`);
  }
}, HEARTBEAT_INTERVAL_MS);

// ═══════════════════════════════════════════════════════════════════
// Health Endpoint
// ═══════════════════════════════════════════════════════════════════

httpServer.on('request', (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      connections: socketMap.size,
      uniqueUsers: userConnections.size,
      rooms: io.sockets.adapter.rooms.size,
      uptime: process.uptime(),
    }));
  }
});

// ═══════════════════════════════════════════════════════════════════
// Start Server
// ═══════════════════════════════════════════════════════════════════

httpServer.listen(PORT, () => {
  console.log(`[WS] AcquisitionOS WebSocket service running on port ${PORT}`);
});

// ═══════════════════════════════════════════════════════════════════
// Graceful Shutdown
// ═══════════════════════════════════════════════════════════════════

process.on('SIGTERM', () => {
  console.log('[WS] Received SIGTERM, shutting down...');
  io.disconnectSockets(true);
  httpServer.close(() => {
    console.log('[WS] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[WS] Received SIGINT, shutting down...');
  io.disconnectSockets(true);
  httpServer.close(() => {
    console.log('[WS] Server closed');
    process.exit(0);
  });
});
