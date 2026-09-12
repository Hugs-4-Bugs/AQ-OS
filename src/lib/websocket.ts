// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Real-Time Connection Manager (SSE + WebSocket)
// Phase 7: Real-Time Updates for Leads, Deals, Notifications
//
// Uses Server-Sent Events (SSE) as the primary transport since
// Next.js App Router doesn't natively support WebSocket upgrades.
// Falls back to polling when SSE is unavailable.
// ═══════════════════════════════════════════════════════════════════

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
type EventCallback = (data: any) => void;

interface SSEEvent {
  event: string;
  data: any;
}

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const MAX_RECONNECT_DELAY = 30000;
const HEARTBEAT_TIMEOUT = 45000; // 15s ping + 30s buffer

class RealTimeManager {
  private eventSource: EventSource | null = null;
  private status: ConnectionStatus = 'disconnected';
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEventId: string = '';
  private url: string = '';
  private messageBuffer: SSEEvent[] = [];
  private connectedAt: Date | null = null;

  // ── Singleton Pattern ─────────────────────────────────────────
  private static instance: RealTimeManager | null = null;

  static getInstance(): RealTimeManager {
    if (!RealTimeManager.instance) {
      RealTimeManager.instance = new RealTimeManager();
    }
    return RealTimeManager.instance;
  }

  // ── Connection ────────────────────────────────────────────────
  connect(url?: string): void {
    if (this.status === 'connected' || this.status === 'connecting') {
      return; // Already connected or connecting
    }

    this.url = url || '/api/ws';
    this.setStatus('connecting');
    this.reconnectAttempts = 0;

    try {
      this.eventSource = new EventSource(this.url, {
        withCredentials: true,
      });

      this.eventSource.onopen = () => {
        this.setStatus('connected');
        this.connectedAt = new Date();
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.flushBuffer();
      };

      this.eventSource.onmessage = (event) => {
        this.resetHeartbeat();
        try {
          const data = JSON.parse(event.data);
          if (event.lastEventId) {
            this.lastEventId = event.lastEventId;
          }
          // Dispatch to specific event listeners
          if (data.type) {
            this.emit(data.type, data);
          }
          // Also emit on wildcard
          this.emit('*', data);
        } catch {
          // Ignore parse errors for heartbeat pings
        }
      };

      this.eventSource.onerror = () => {
        this.cleanup();
        if (this.status === 'connected') {
          this.setStatus('reconnecting');
          this.scheduleReconnect();
        } else if (this.status === 'connecting') {
          this.setStatus('reconnecting');
          this.scheduleReconnect();
        }
      };

      // Listen for named SSE events
      this.setupNamedListeners();

    } catch {
      this.setStatus('disconnected');
      this.scheduleReconnect();
    }
  }

  private setupNamedListeners(): void {
    if (!this.eventSource) return;

    const eventTypes = ['lead:updated', 'deal:updated', 'notification:new', 'ping'];
    eventTypes.forEach((type) => {
      this.eventSource!.addEventListener(type, ((event: MessageEvent) => {
        this.resetHeartbeat();
        try {
          const data = JSON.parse(event.data);
          this.emit(type, data);
          this.emit('*', data);
        } catch {
          // Ignore parse errors
        }
      }) as EventListener);
    });
  }

  // ── Disconnection ─────────────────────────────────────────────
  disconnect(): void {
    this.cleanup();
    this.setStatus('disconnected');
    this.connectedAt = null;
    this.reconnectAttempts = 0;
    this.lastEventId = '';
    this.messageBuffer = [];
  }

  private cleanup(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ── Reconnection with Exponential Backoff ────────────────────
  private scheduleReconnect(): void {
    const delay = this.reconnectAttempts < RECONNECT_DELAYS.length
      ? RECONNECT_DELAYS[this.reconnectAttempts]
      : MAX_RECONNECT_DELAY;

    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      if (this.status === 'reconnecting' || this.status === 'disconnected') {
        this.connect(this.url);
      }
    }, delay);
  }

  // ── Heartbeat ────────────────────────────────────────────────
  private startHeartbeat(): void {
    this.resetHeartbeat();
  }

  private resetHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
    }
    this.heartbeatTimer = setTimeout(() => {
      // Heartbeat timeout — connection is likely dead
      if (this.status === 'connected') {
        this.cleanup();
        this.setStatus('reconnecting');
        this.scheduleReconnect();
      }
    }, HEARTBEAT_TIMEOUT);
  }

  // ── Event System ─────────────────────────────────────────────
  on(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  off(event: string, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(data);
        } catch {
          // Silently handle listener errors
        }
      });
    }
  }

  // ── Message Buffer ───────────────────────────────────────────
  private flushBuffer(): void {
    if (this.messageBuffer.length === 0) return;

    // Replay buffered messages that weren't sent during disconnection
    const buffered = [...this.messageBuffer];
    this.messageBuffer = [];

    buffered.forEach(({ event, data }) => {
      this.emit(event, data);
    });
  }

  // ── Status ───────────────────────────────────────────────────
  private setStatus(status: ConnectionStatus): void {
    const prev = this.status;
    this.status = status;
    if (prev !== status) {
      this.emit('connection:status', { status, previousStatus: prev });
    }
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  isConnected(): boolean {
    return this.status === 'connected';
  }

  getConnectedAt(): Date | null {
    return this.connectedAt;
  }

  getConnectedDuration(): string {
    if (!this.connectedAt) return '0s';
    const diff = Math.floor((Date.now() - this.connectedAt.getTime()) / 1000);
    if (diff < 60) return `${diff}s`;
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hours}h ${remainMins}m`;
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }
}

// ── React Hook ──────────────────────────────────────────────────
export function useRealTime() {
  const manager = RealTimeManager.getInstance();
  return {
    isConnected: manager.isConnected(),
    status: manager.getStatus(),
    connectedDuration: manager.getConnectedDuration(),
    connect: (url?: string) => manager.connect(url),
    disconnect: () => manager.disconnect(),
    subscribe: (event: string, callback: EventCallback) => manager.on(event, callback),
    unsubscribe: (event: string, callback: EventCallback) => manager.off(event, callback),
    reconnectAttempts: manager.getReconnectAttempts(),
  };
}

export { RealTimeManager };
export type { ConnectionStatus, SSEEvent, EventCallback };
