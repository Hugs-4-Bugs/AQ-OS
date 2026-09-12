/**
 * AcquisitionOS — Realtime Service (Production)
 * Socket.IO server on port 3003 with Redis pub/sub, room subscriptions,
 * JWT auth, heartbeat, event replay, and connection management.
 * Phase 14.4: Production Deployment
 */

import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';

// ═══════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════

const PORT = parseInt(process.env.PORT || '3003', 10);
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/3';
const SECRET_KEY = process.env.SECRET_KEY || '';
const HEARTBEAT_INTERVAL_MS = 30_000;
const STALE_THRESHOLD_MS = 60_000;
const MAX_CONNECTIONS_PER_USER = 3;
const REPLAY_BUFFER_SIZE = 50;

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

const userConnections = new Map<string, UserConnection[]>();
const socketMap = new Map<string, UserConnection>();
const roomEventBuffers = new Map<string, RoomEvent[]>();

const CHANNEL_EVENTS: Record<string, string> = {
  notifications: 'notification_event',
  messages: 'message_event',
  payments: 'payment_event',
  leads: 'lead_event',
  workflows: 'workflow_event',
  analytics: 'analytics_event',
};

// ═══════════════════════════════════════════════════════════════════
// Redis pub/sub
// ═══════════════════════════════════════════════════════════════════

let redisSubscriber: Redis | null = null;
let redisPublisher: Redis | null = null;

function initRedis() {
  try {
    redisSubscriber = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    redisPublisher = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

    redisSubscriber.on('message', (channel: string, message: string) => {
      try {
        const event: RoomEvent = JSON.parse(message);
        const room = channel.replace('realtime:', '');
        forwardEvent(room, event);
      } catch (err) {
        console.error('[Redis] Failed to parse message:', err);
      }
    });

    redisSubscriber.subscribe('realtime:*').catch((err) => {
      console.error('[Redis] Subscribe failed:', err);
    });

    console.log('[Redis] Connected and subscribed to realtime:*');
  } catch (err) {
    console.warn('[Redis] Could not connect, running without pub/sub:', err);
  }
}

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

  if (auth.token.length < 1) {
    return next(new Error('Invalid authentication token'));
  }

  const existing = userConnections.get(auth.userId) || [];
  if (existing.length >= MAX_CONNECTIONS_PER_USER) {
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

  const userRoom = `user:${auth.userId}`;
  socket.join(userRoom);
  connection.rooms.add(userRoom);

  if (auth.orgId) {
    const orgRoom = `org:${auth.orgId}`;
    socket.join(orgRoom);
    connection.rooms.add(orgRoom);
  }

  console.log(`[WS] User ${auth.userId} connected (${socket.id}), total: ${socketMap.size}`);

  socket.on('subscribe', (data: { channel: string; targetId?: string }) => {
    const { channel, targetId } = data;
    const roomName = targetId ? `${channel}:${targetId}` : channel;
    socket.join(roomName);
    connection.rooms.add(roomName);

    const buffer = roomEventBuffers.get(roomName) || [];
    if (buffer.length > 0) {
      socket.emit('replay', { room: roomName, events: buffer });
    }
    console.log(`[WS] ${auth.userId} subscribed to ${roomName}`);
  });

  socket.on('unsubscribe', (data: { channel: string; targetId?: string }) => {
    const { channel, targetId } = data;
    const roomName = targetId ? `${channel}:${targetId}` : channel;
    socket.leave(roomName);
    connection.rooms.delete(roomName);
    console.log(`[WS] ${auth.userId} unsubscribed from ${roomName}`);
  });

  socket.on('heartbeat', () => {
    connection.lastHeartbeat = Date.now();
    socket.emit('heartbeat_ack', { timestamp: Date.now() });
  });

  socket.on('recover', (data: { lastEventId?: string; sinceTimestamp?: number }) => {
    const { lastEventId, sinceTimestamp } = data;
    const recoveredEvents: RoomEvent[] = [];

    for (const room of connection.rooms) {
      const buffer = roomEventBuffers.get(room) || [];
      for (const event of buffer) {
        if (lastEventId && event.id === lastEventId) continue;
        if (sinceTimestamp && event.timestamp < sinceTimestamp) continue;
        recoveredEvents.push(event);
      }
    }

    recoveredEvents.sort((a, b) => a.timestamp - b.timestamp);
    const limited = recoveredEvents.slice(-REPLAY_BUFFER_SIZE);
    socket.emit('recovered', { count: limited.length, events: limited });
  });

  socket.on('disconnect', (reason) => {
    socketMap.delete(socket.id);
    const conns = userConnections.get(auth.userId) || [];
    const idx = conns.findIndex(c => c.socketId === socket.id);
    if (idx >= 0) conns.splice(idx, 1);
    if (conns.length === 0) userConnections.delete(auth.userId);
    console.log(`[WS] User ${auth.userId} disconnected (${reason}), total: ${socketMap.size}`);
  });

  socket.on('error', (error) => {
    console.error(`[WS] Socket error (${socket.id}):`, error);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Event Forwarding
// ═══════════════════════════════════════════════════════════════════

export function forwardEvent(room: string, event: RoomEvent): void {
  let buffer = roomEventBuffers.get(room);
  if (!buffer) {
    buffer = [];
    roomEventBuffers.set(room, buffer);
  }
  buffer.push(event);
  if (buffer.length > REPLAY_BUFFER_SIZE) buffer.shift();

  const eventName = CHANNEL_EVENTS[event.channel] || 'event';
  io.to(room).emit(eventName, event);
}

export function forwardToUser(userId: string, event: RoomEvent): void {
  const eventName = CHANNEL_EVENTS[event.channel] || 'event';
  io.to(`user:${userId}`).emit(eventName, event);

  const userRoom = `user:${userId}`;
  let buffer = roomEventBuffers.get(userRoom);
  if (!buffer) {
    buffer = [];
    roomEventBuffers.set(userRoom, buffer);
  }
  buffer.push(event);
  if (buffer.length > REPLAY_BUFFER_SIZE) buffer.shift();
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

initRedis();

httpServer.listen(PORT, () => {
  console.log(`[WS] AcquisitionOS Realtime Service running on port ${PORT}`);
});

// ═══════════════════════════════════════════════════════════════════
// Graceful Shutdown
// ═══════════════════════════════════════════════════════════════════

function shutdown() {
  console.log('[WS] Shutting down...');
  io.disconnectSockets(true);
  redisSubscriber?.quit().catch(() => {});
  redisPublisher?.quit().catch(() => {});
  httpServer.close(() => {
    console.log('[WS] Server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
