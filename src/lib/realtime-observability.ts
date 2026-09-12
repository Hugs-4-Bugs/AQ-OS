/**
 * AcquisitionOS — Realtime Observability Service
 * Track WebSocket/SSE connections, events, delivery latency, and health.
 * Phase 11: Realtime Remediation
 */

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export type ConnectionType = 'websocket' | 'sse';

interface ConnectionMetric {
  type: ConnectionType;
  userId: string;
  connectedAt: number;
  disconnectedAt?: number;
  errorCount: number;
}

interface EventMetric {
  channel: string;
  eventType: string;
  publishedAt: number;
  deliveredAt?: number;
  deliveryLatencyMs?: number;
  targetCount: number;
  deliveredCount: number;
  errorCount: number;
}

interface ChannelMetrics {
  channel: string;
  eventsPublished: number;
  eventsDelivered: number;
  eventsFailed: number;
  avgDeliveryLatencyMs: number;
  p95DeliveryLatencyMs: number;
  p99DeliveryLatencyMs: number;
}

interface ReconnectionMetric {
  userId: string;
  type: ConnectionType;
  disconnectedAt: number;
  reconnectedAt: number;
  offlineDurationMs: number;
}

interface RealtimeMetrics {
  wsConnections: number;
  sseConnections: number;
  totalConnections: number;
  eventsPerSecond: number;
  channels: Record<string, ChannelMetrics>;
  reconnectionRate: number; // reconnections per minute
  errorRate: number; // errors per minute
  health: 'healthy' | 'degraded' | 'unhealthy';
  healthDetails: string[];
}

// ═══════════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════════

const activeConnections = new Map<string, ConnectionMetric>();
const connectionHistory: ConnectionMetric[] = []; // last 1000
const recentEvents: EventMetric[] = []; // last 10000
const reconnectionEvents: ReconnectionMetric[] = []; // last 1000
const channelCounters = new Map<string, {
  published: number;
  delivered: number;
  failed: number;
  latencies: number[];
}>();

const MAX_CONNECTION_HISTORY = 1000;
const MAX_RECENT_EVENTS = 10000;
const MAX_RECONNECTION_EVENTS = 1000;
const LATENCY_SAMPLE_SIZE = 1000; // Keep last N latencies per channel
const ERROR_RATE_THRESHOLD = 0.1; // 10% error rate = degraded
const HIGH_ERROR_RATE_THRESHOLD = 0.25; // 25% = unhealthy

// ═══════════════════════════════════════════════════════════════════
// Connection Tracking
// ═══════════════════════════════════════════════════════════════════

/**
 * Track a new connection (WS or SSE).
 */
export function trackConnection(
  type: ConnectionType,
  userId: string,
  connectionId: string,
): void {
  activeConnections.set(connectionId, {
    type,
    userId,
    connectedAt: Date.now(),
    errorCount: 0,
  });
}

/**
 * Track a disconnection.
 */
export function trackDisconnection(connectionId: string): void {
  const conn = activeConnections.get(connectionId);
  if (!conn) return;

  conn.disconnectedAt = Date.now();
  connectionHistory.push(conn);
  if (connectionHistory.length > MAX_CONNECTION_HISTORY) {
    connectionHistory.shift();
  }

  activeConnections.delete(connectionId);
}

/**
 * Track a reconnection (user disconnected and reconnected within a window).
 */
export function trackReconnection(
  type: ConnectionType,
  userId: string,
  disconnectedAt: number,
): void {
  reconnectionEvents.push({
    userId,
    type,
    disconnectedAt,
    reconnectedAt: Date.now(),
    offlineDurationMs: Date.now() - disconnectedAt,
  });

  if (reconnectionEvents.length > MAX_RECONNECTION_EVENTS) {
    reconnectionEvents.shift();
  }
}

// ═══════════════════════════════════════════════════════════════════
// Event Tracking
// ═══════════════════════════════════════════════════════════════════

/**
 * Track an event being published.
 */
export function trackEvent(
  channel: string,
  eventType: string,
  targetCount: number = 0,
): string {
  const metricId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const metric: EventMetric = {
    channel,
    eventType,
    publishedAt: Date.now(),
    targetCount,
    deliveredCount: 0,
    errorCount: 0,
  };

  recentEvents.push(metric);
  if (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.shift();
  }

  // Update channel counter
  const counter = getOrCreateCounter(channel);
  counter.published++;

  return metricId;
}

/**
 * Track successful event delivery.
 */
export function trackDelivery(
  channel: string,
  latencyMs: number,
): void {
  const counter = getOrCreateCounter(channel);
  counter.delivered++;
  counter.latencies.push(latencyMs);
  if (counter.latencies.length > LATENCY_SAMPLE_SIZE) {
    counter.latencies.shift();
  }
}

/**
 * Track a delivery error.
 */
export function trackError(channel: string): void {
  const counter = getOrCreateCounter(channel);
  counter.failed++;
}

// ═══════════════════════════════════════════════════════════════════
// Metrics & Health
// ═══════════════════════════════════════════════════════════════════

/**
 * Get comprehensive realtime metrics.
 */
export function getRealtimeMetrics(): RealtimeMetrics {
  const wsConns = Array.from(activeConnections.values()).filter(c => c.type === 'websocket').length;
  const sseConns = Array.from(activeConnections.values()).filter(c => c.type === 'sse').length;

  // Events per second (from last 60 seconds)
  const oneMinuteAgo = Date.now() - 60_000;
  const recentEventCount = recentEvents.filter(e => e.publishedAt > oneMinuteAgo).length;
  const eventsPerSecond = recentEventCount / 60;

  // Channel metrics
  const channels: Record<string, ChannelMetrics> = {};
  for (const [ch, counter] of channelCounters.entries()) {
    const sortedLatencies = [...counter.latencies].sort((a, b) => a - b);
    const avg = sortedLatencies.length > 0
      ? sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length
      : 0;
    const p95 = sortedLatencies.length > 0
      ? sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0
      : 0;
    const p99 = sortedLatencies.length > 0
      ? sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0
      : 0;

    channels[ch] = {
      channel: ch,
      eventsPublished: counter.published,
      eventsDelivered: counter.delivered,
      eventsFailed: counter.failed,
      avgDeliveryLatencyMs: Math.round(avg),
      p95DeliveryLatencyMs: p95,
      p99DeliveryLatencyMs: p99,
    };
  }

  // Reconnection rate (last 5 minutes)
  const fiveMinAgo = Date.now() - 5 * 60_000;
  const recentReconnections = reconnectionEvents.filter(r => r.reconnectedAt > fiveMinAgo).length;
  const reconnectionRate = recentReconnections / 5; // per minute

  // Error rate (last 5 minutes)
  const recentMetrics = recentEvents.filter(e => e.publishedAt > fiveMinAgo);
  const totalRecent = recentMetrics.length;
  const totalErrors = recentMetrics.reduce((sum, e) => sum + e.errorCount, 0);
  const errorRate = totalRecent > 0 ? totalErrors / totalRecent : 0;

  // Health check
  const { health, details } = checkHealth(wsConns + sseConns, errorRate, eventsPerSecond);

  return {
    wsConnections: wsConns,
    sseConnections: sseConns,
    totalConnections: wsConns + sseConns,
    eventsPerSecond: Math.round(eventsPerSecond * 100) / 100,
    channels,
    reconnectionRate: Math.round(reconnectionRate * 100) / 100,
    errorRate: Math.round(errorRate * 10000) / 10000,
    health,
    healthDetails: details,
  };
}

/**
 * Check the health of the realtime system.
 */
export function checkHealth(
  totalConnections?: number,
  errorRate?: number,
  eventsPerSecond?: number,
): { health: 'healthy' | 'degraded' | 'unhealthy'; details: string[] } {
  const details: string[] = [];
  const conns = totalConnections ?? activeConnections.size;

  // Calculate error rate from recent events if not provided
  let errRate = errorRate ?? 0;
  if (errRate === 0) {
    const fiveMinAgo = Date.now() - 5 * 60_000;
    const recent = recentEvents.filter(e => e.publishedAt > fiveMinAgo);
    const errs = recent.reduce((sum, e) => sum + e.errorCount, 0);
    errRate = recent.length > 0 ? errs / recent.length : 0;
  }

  // Determine health
  let health: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  if (errRate >= HIGH_ERROR_RATE_THRESHOLD) {
    health = 'unhealthy';
    details.push(`High error rate: ${(errRate * 100).toFixed(1)}% (threshold: ${(HIGH_ERROR_RATE_THRESHOLD * 100).toFixed(0)}%)`);
  } else if (errRate >= ERROR_RATE_THRESHOLD) {
    health = 'degraded';
    details.push(`Elevated error rate: ${(errRate * 100).toFixed(1)}% (threshold: ${(ERROR_RATE_THRESHOLD * 100).toFixed(0)}%)`);
  }

  if (conns === 0) {
    details.push('No active connections');
  } else {
    details.push(`${conns} active connections`);
  }

  if (eventsPerSecond !== undefined && eventsPerSecond > 100) {
    if (health === 'healthy') health = 'degraded';
    details.push(`High event rate: ${eventsPerSecond.toFixed(0)} events/sec`);
  }

  if (health === 'healthy') {
    details.unshift('All systems operational');
  }

  return { health, details };
}

// ═══════════════════════════════════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════════════════════════════════

function getOrCreateCounter(channel: string) {
  let counter = channelCounters.get(channel);
  if (!counter) {
    counter = { published: 0, delivered: 0, failed: 0, latencies: [] };
    channelCounters.set(channel, counter);
  }
  return counter;
}

/**
 * Get a lightweight summary for monitoring dashboards.
 */
export function getHealthSummary(): {
  status: 'healthy' | 'degraded' | 'unhealthy';
  wsConnections: number;
  sseConnections: number;
  eventsLastMinute: number;
  errorRate: number;
} {
  const metrics = getRealtimeMetrics();
  return {
    status: metrics.health,
    wsConnections: metrics.wsConnections,
    sseConnections: metrics.sseConnections,
    eventsLastMinute: Math.round(metrics.eventsPerSecond * 60),
    errorRate: metrics.errorRate,
  };
}
