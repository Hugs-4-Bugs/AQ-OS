// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Redis PubSub Service
// Phase 11: Cross-process event distribution via Redis pub/sub
//
// DESIGN:
//   - Entirely optional — if REDIS_URL is not set or connection fails,
//     all operations become no-ops and the in-memory EventBus carries
//     events within the Next.js process.
//   - Lazy connection on first use.
//   - Singleton pattern to share one connection across the process.
//   - Stats counter for monitoring.
// ═══════════════════════════════════════════════════════════════════

// ── Types ──────────────────────────────────────────────────────────

export type PubSubCallback = (channel: string, message: string) => void;

export interface RedisPubSubStats {
  publishedCount: number;
  subscribedChannels: number;
  connected: boolean;
  available: boolean;
}

// ── Lazy Redis loader ──────────────────────────────────────────────

let _redisConstructor: any = null;
let _loadAttempted = false;

/**
 * Lazily attempt to load ioredis.  Returns the Redis class if available,
 * or null if the package is not installed.
 */
async function loadRedisConstructor(): Promise<any> {
  if (_loadAttempted) return _redisConstructor;
  _loadAttempted = true;

  try {
    // @ts-expect-error ioredis is an optional peer dependency — may not be installed
    const mod = await import('ioredis');
    _redisConstructor = mod.default || mod;
  } catch {
    // ioredis not installed — Redis features will be disabled
    console.warn(
      '[RedisPubSub] ioredis not available. Redis pub/sub is disabled. ' +
      'Install ioredis or set REDIS_URL to enable cross-process event distribution.'
    );
  }
  return _redisConstructor;
}

// ── RedisPubSubService ─────────────────────────────────────────────

class RedisPubSubService {
  private publisher: any = null;
  private subscriber: any = null;
  private connected = false;
  private available = false;       // true once we successfully connect
  private permanentlyDisabled = false; // true if connect() ever fails
  private warnedOnce = false;
  private publishedCount = 0;
  private subscriptions = new Map<string, Set<PubSubCallback>>();
  private connectionPromise: Promise<boolean> | null = null;

  // ── Connection ─────────────────────────────────────────────────

  /**
   * Connect to Redis.  Idempotent — safe to call multiple times.
   * Returns true if connected, false if Redis is unavailable.
   */
  async connect(): Promise<boolean> {
    // Already decided Redis is not available
    if (this.permanentlyDisabled) return false;
    if (this.connected) return true;

    // Coalesce concurrent connect() calls
    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = this._doConnect();
    try {
      return await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  private async _doConnect(): Promise<boolean> {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      this._warn('REDIS_URL not set — Redis pub/sub disabled.');
      this.permanentlyDisabled = true;
      return false;
    }

    const RedisCtor = await loadRedisConstructor();
    if (!RedisCtor) {
      this.permanentlyDisabled = true;
      return false;
    }

    try {
      // Create publisher and subscriber connections
      const opts = {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
          if (times > 5) {
            this._warn('Redis retry limit reached — giving up.');
            this.permanentlyDisabled = true;
            return null; // stop retrying
          }
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
        connectTimeout: 5000,
      };

      this.publisher = new RedisCtor(redisUrl, { ...opts });
      this.subscriber = new RedisCtor(redisUrl, { ...opts });

      // Attempt connection
      await Promise.all([
        this.publisher.connect(),
        this.subscriber.connect(),
      ]);

      // Handle disconnects gracefully
      this.publisher.on('error', (err: Error) => {
        this._warn(`Redis publisher error: ${err.message}`);
        this.connected = false;
      });

      this.subscriber.on('error', (err: Error) => {
        this._warn(`Redis subscriber error: ${err.message}`);
        this.connected = false;
      });

      this.publisher.on('close', () => {
        this.connected = false;
      });

      this.subscriber.on('close', () => {
        this.connected = false;
      });

      this.connected = true;
      this.available = true;
      console.info('[RedisPubSub] Connected to Redis successfully.');
      return true;
    } catch (error) {
      this._warn(
        `Failed to connect to Redis at ${redisUrl}: ${
          error instanceof Error ? error.message : String(error)
        } — Redis pub/sub disabled.`
      );
      this.permanentlyDisabled = true;
      this.connected = false;
      this.available = false;

      // Clean up partial connections
      this._cleanupConnections();
      return false;
    }
  }

  /**
   * Graceful disconnect from Redis.
   */
  async disconnect(): Promise<void> {
    if (!this.publisher && !this.subscriber) return;

    try {
      const disconnects: Promise<void>[] = [];
      if (this.publisher) {
        disconnects.push(this.publisher.quit().then(() => {}));
      }
      if (this.subscriber) {
        disconnects.push(this.subscriber.quit().then(() => {}));
      }
      await Promise.allSettled(disconnects);
    } catch {
      // Force close on error
    } finally {
      this._cleanupConnections();
      this.connected = false;
      this.available = false;
    }
  }

  private _cleanupConnections(): void {
    try { this.publisher?.disconnect?.(); } catch { /* noop */ }
    try { this.subscriber?.disconnect?.(); } catch { /* noop */ }
    this.publisher = null;
    this.subscriber = null;
  }

  // ── Publish ────────────────────────────────────────────────────

  /**
   * Publish a message to a Redis channel.
   * No-op if Redis is not connected.
   */
  async publish(channel: string, message: string): Promise<number> {
    if (this.permanentlyDisabled) return 0;

    // Lazy-connect on first publish
    if (!this.connected) {
      const ok = await this.connect();
      if (!ok) return 0;
    }

    try {
      const receivers = await this.publisher.publish(channel, message);
      this.publishedCount++;
      return receivers;
    } catch (error) {
      this._warn(`Publish failed on channel "${channel}": ${
        error instanceof Error ? error.message : String(error)
      }`);
      return 0;
    }
  }

  // ── Subscribe ──────────────────────────────────────────────────

  /**
   * Subscribe to a Redis channel with a callback.
   * Multiple callbacks per channel are supported.
   */
  async subscribe(channel: string, callback: PubSubCallback): Promise<void> {
    if (this.permanentlyDisabled) return;

    // Lazy-connect on first subscribe
    if (!this.connected) {
      const ok = await this.connect();
      if (!ok) return;
    }

    // Track callback
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel)!.add(callback);

    // Tell Redis to subscribe (only once per channel)
    try {
      await this.subscriber.subscribe(channel);

      // Set up message handler (once per subscriber)
      if (!this.subscriber._acqHandlerAttached) {
        this.subscriber.on('message', (ch: string, msg: string) => {
          const cbs = this.subscriptions.get(ch);
          if (cbs) {
            for (const cb of cbs) {
              try { cb(ch, msg); } catch { /* swallow callback errors */ }
            }
          }
        });
        this.subscriber._acqHandlerAttached = true;
      }
    } catch (error) {
      this._warn(`Subscribe failed on channel "${channel}": ${
        error instanceof Error ? error.message : String(error)
      }`);
    }
  }

  /**
   * Unsubscribe from a Redis channel.
   * If no callback is provided, removes all callbacks for the channel.
   */
  async unsubscribe(channel: string, callback?: PubSubCallback): Promise<void> {
    if (!this.connected) return;

    const cbs = this.subscriptions.get(channel);
    if (!cbs) return;

    if (callback) {
      cbs.delete(callback);
      if (cbs.size > 0) return; // still have listeners on this channel
    }

    // No more listeners — unsubscribe from Redis
    this.subscriptions.delete(channel);
    try {
      await this.subscriber.unsubscribe(channel);
    } catch (error) {
      this._warn(`Unsubscribe failed on channel "${channel}": ${
        error instanceof Error ? error.message : String(error)
      }`);
    }
  }

  // ── Status ─────────────────────────────────────────────────────

  /** Check if currently connected to Redis */
  isConnected(): boolean {
    return this.connected && !this.permanentlyDisabled;
  }

  /** Check if Redis is available (ever connected successfully) */
  isAvailable(): boolean {
    return this.available;
  }

  /** Get operational stats */
  getStats(): RedisPubSubStats {
    return {
      publishedCount: this.publishedCount,
      subscribedChannels: this.subscriptions.size,
      connected: this.connected,
      available: this.available,
    };
  }

  /** Get the total number of published messages */
  getPublishedCount(): number {
    return this.publishedCount;
  }

  // ── Internal ───────────────────────────────────────────────────

  private _warn(msg: string): void {
    if (!this.warnedOnce) {
      console.warn(`[RedisPubSub] ${msg}`);
      this.warnedOnce = true;
    } else {
      // Subsequent warnings at debug level
      console.debug?.(`[RedisPubSub] ${msg}`);
    }
  }
}

// ── Singleton export ───────────────────────────────────────────────

/** Global Redis PubSub service singleton */
export const redisPubSub = new RedisPubSubService();

export default redisPubSub;
