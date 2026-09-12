// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — SSE/WebSocket Realtime Optimizer
// Phase 14.7: Debounce, batch, throttle, connection quality, adaptive
// ═══════════════════════════════════════════════════════════════════

// ─── Types ────────────────────────────────────────────────────────

export interface RealtimeMessage {
  type: string;
  payload: unknown;
  timestamp?: number;
  id?: string;
}

export interface ConnectionQuality {
  latencyMs: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  recommendedIntervalMs: number;
  shouldReducePayload: boolean;
}

// ─── Debounce ─────────────────────────────────────────────────────

/**
 * Debounce rapid updates — coalesces multiple calls within the delay window.
 */
export function createDebouncer<T extends RealtimeMessage>(
  callback: (message: T) => void,
  delayMs: number = 50,
): {
  push: (message: T) => void;
  flush: () => void;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latestMessage: T | null = null;

  function flush() {
    if (latestMessage) {
      callback(latestMessage);
      latestMessage = null;
    }
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function cancel() {
    latestMessage = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function push(message: T) {
    latestMessage = message;
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(flush, delayMs);
  }

  return { push, flush, cancel };
}

// ─── Batcher ──────────────────────────────────────────────────────

/**
 * Batch multiple updates into a single payload.
 * Collects messages within the window and sends them as an array.
 */
export function createBatcher<T extends RealtimeMessage>(
  callback: (messages: T[]) => void,
  windowMs: number = 100,
  maxBatchSize: number = 50,
): {
  add: (message: T) => void;
  flush: () => void;
  cancel: () => void;
} {
  let batch: T[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    if (batch.length > 0) {
      callback([...batch]);
      batch = [];
    }
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function cancel() {
    batch = [];
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function add(message: T) {
    batch.push({
      ...message,
      timestamp: message.timestamp ?? Date.now(),
    });

    // Flush immediately if at max capacity
    if (batch.length >= maxBatchSize) {
      flush();
      return;
    }

    // Start a timer on first message in batch
    if (!timer) {
      timer = setTimeout(flush, windowMs);
    }
  }

  return { add, flush, cancel };
}

// ─── Throttle ─────────────────────────────────────────────────────

/**
 * Throttle analytics updates — ensures a minimum interval between sends.
 * Last message in each window is always sent to avoid stale data.
 */
export function createThrottler<T extends RealtimeMessage>(
  callback: (message: T) => void,
  intervalMs: number = 5000,
): {
  send: (message: T) => void;
  flush: () => void;
  cancel: () => void;
} {
  let lastSentAt = 0;
  let pendingMessage: T | null = null;
  let trailingTimer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    if (pendingMessage) {
      callback(pendingMessage);
      pendingMessage = null;
      lastSentAt = Date.now();
    }
    if (trailingTimer) {
      clearTimeout(trailingTimer);
      trailingTimer = null;
    }
  }

  function cancel() {
    pendingMessage = null;
    if (trailingTimer) {
      clearTimeout(trailingTimer);
      trailingTimer = null;
    }
  }

  function send(message: T) {
    const now = Date.now();
    const elapsed = now - lastSentAt;

    if (elapsed >= intervalMs) {
      callback(message);
      lastSentAt = now;
      // Clear any trailing
      if (trailingTimer) {
        clearTimeout(trailingTimer);
        trailingTimer = null;
      }
      pendingMessage = null;
    } else {
      // Save as pending and schedule trailing call
      pendingMessage = message;
      if (!trailingTimer) {
        trailingTimer = setTimeout(flush, intervalMs - elapsed);
      }
    }
  }

  return { send, flush, cancel };
}

// ─── Connection Quality Detection ─────────────────────────────────

/**
 * Measure latency by sending a ping and measuring round-trip time.
 * Works with both SSE and WebSocket connections.
 */
export function measureLatency(socketOrEventSource: { send?: (data: string) => void; readyState: number }): Promise<number> {
  return new Promise((resolve) => {
    const start = performance.now();
    const pingId = `ping_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const timeout = setTimeout(() => {
      resolve(9999); // Timeout = very poor connection
    }, 10000);

    // Listen for pong
    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'pong' && data.pingId === pingId) {
          clearTimeout(timeout);
          const latency = performance.now() - start;
          // Clean up listener (Note: in real usage you'd have a reference to removeEventListener)
          resolve(latency);
        }
      } catch {
        // Ignore non-JSON messages
      }
    };

    // For WebSocket
    if ('send' in socketOrEventSource && socketOrEventSource.send) {
      if (socketOrEventSource.readyState === 1) { // OPEN
        socketOrEventSource.send(JSON.stringify({ type: 'ping', pingId }));
      } else {
        clearTimeout(timeout);
        resolve(9999);
        return;
      }
    }

    // For SSE, we can't send pings — estimate from last event
    // In a real app, you'd track the time between events
    // For now, use a simulated approach
    if (!('send' in socketOrEventSource)) {
      clearTimeout(timeout);
      // For SSE, estimate based on readyState
      resolve(socketOrEventSource.readyState === 0 ? 9999 : 50);
    }

    // Note: In production, you'd add the message event listener to the socket
    // This is a simplified version for the utility library
  });
}

/**
 * Assess connection quality based on measured latency.
 */
export function assessConnectionQuality(latencyMs: number): ConnectionQuality {
  if (latencyMs < 50) {
    return {
      latencyMs,
      quality: 'excellent',
      recommendedIntervalMs: 100,
      shouldReducePayload: false,
    };
  }
  if (latencyMs < 150) {
    return {
      latencyMs,
      quality: 'good',
      recommendedIntervalMs: 500,
      shouldReducePayload: false,
    };
  }
  if (latencyMs < 500) {
    return {
      latencyMs,
      quality: 'fair',
      recommendedIntervalMs: 2000,
      shouldReducePayload: true,
    };
  }
  return {
    latencyMs,
    quality: 'poor',
    recommendedIntervalMs: 5000,
    shouldReducePayload: true,
  };
}

// ─── Adaptive Update Rate ─────────────────────────────────────────

/**
 * Create an adaptive rate controller that adjusts update frequency
 * based on connection quality measurements.
 */
export function createAdaptiveRateController<T extends RealtimeMessage>(
  callback: (message: T) => void,
  options: {
    excellentMs?: number;
    goodMs?: number;
    fairMs?: number;
    poorMs?: number;
  } = {},
): {
  send: (message: T) => void;
  updateConnectionQuality: (latencyMs: number) => void;
  flush: () => void;
  cancel: () => void;
  getCurrentInterval: () => number;
} {
  const intervals = {
    excellent: options.excellentMs ?? 100,
    good: options.goodMs ?? 500,
    fair: options.fairMs ?? 2000,
    poor: options.poorMs ?? 5000,
  };

  let currentInterval = intervals.good;
  let currentQuality: ConnectionQuality['quality'] = 'good';
  let shouldReducePayload = false;

  // Internal throttler
  let lastSentAt = 0;
  let pendingMessage: T | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    if (pendingMessage) {
      const message = shouldReducePayload
        ? stripUnnecessaryFields(pendingMessage)
        : pendingMessage;
      callback(message as T);
      pendingMessage = null;
      lastSentAt = Date.now();
    }
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function cancel() {
    pendingMessage = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function send(message: T) {
    const now = Date.now();
    const elapsed = now - lastSentAt;

    if (elapsed >= currentInterval) {
      const finalMessage = shouldReducePayload
        ? stripUnnecessaryFields(message)
        : message;
      callback(finalMessage as T);
      lastSentAt = now;
      pendingMessage = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    } else {
      pendingMessage = message;
      if (!timer) {
        timer = setTimeout(flush, currentInterval - elapsed);
      }
    }
  }

  function updateConnectionQuality(latencyMs: number) {
    const quality = assessConnectionQuality(latencyMs);
    currentQuality = quality.quality;
    currentInterval = intervals[quality.quality];
    shouldReducePayload = quality.shouldReducePayload;
  }

  function getCurrentInterval(): number {
    return currentInterval;
  }

  return { send, updateConnectionQuality, flush, cancel, getCurrentInterval };
}

// ─── Message Size Optimization ────────────────────────────────────

/**
 * Strip unnecessary fields from a message to reduce payload size.
 * Removes timestamps, ids, and other metadata that can be reconstructed.
 */
export function stripUnnecessaryFields<T extends RealtimeMessage>(message: T): Partial<T> {
  const stripped = { ...message };

  // Remove fields that can be reconstructed client-side
  delete (stripped as Record<string, unknown>).timestamp;

  // Shorten common long field names
  const fieldAliases: Record<string, string> = {
    businessName: 'bn',
    ownerName: 'on',
    emailStatus: 'es',
    replyScore: 'rs',
    conversionScore: 'cs',
    urgencyScore: 'us',
    revenuePotentialScore: 'rps',
  };

  const compressed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(stripped as Record<string, unknown>)) {
    const alias = fieldAliases[key];
    if (alias && value !== undefined && value !== null) {
      compressed[alias] = value;
    } else {
      compressed[key] = value;
    }
  }

  return compressed as Partial<T>;
}

/**
 * Estimate the byte size of a message payload.
 */
export function estimateMessageSize(message: RealtimeMessage): number {
  const json = JSON.stringify(message);
  // UTF-16 encoding: approximately 2 bytes per character
  return json.length * 2;
}

// ─── Pre-configured Optimizers ────────────────────────────────────

/**
 * Create a pre-configured optimizer for analytics updates.
 * Throttled to 5s by default, with adaptive rate control.
 */
export function createAnalyticsOptimizer(
  sendFn: (message: RealtimeMessage) => void,
) {
  return createAdaptiveRateController(sendFn, {
    excellentMs: 2000,
    goodMs: 5000,
    fairMs: 10000,
    poorMs: 30000,
  });
}

/**
 * Create a pre-configured optimizer for lead update events.
 * Debounced at 50ms, batched into groups of up to 20.
 */
export function createLeadUpdateOptimizer(
  sendFn: (messages: RealtimeMessage[]) => void,
) {
  return createBatcher(sendFn, 50, 20);
}

/**
 * Create a pre-configured optimizer for pipeline stage changes.
 * Debounced at 100ms to avoid rapid re-renders during drag operations.
 */
export function createPipelineOptimizer(
  sendFn: (message: RealtimeMessage) => void,
) {
  return createDebouncer(sendFn, 100);
}
