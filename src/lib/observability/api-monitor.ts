// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — API Performance Monitor
// Phase 11: Observability Infrastructure
//
// Tracks API request performance metrics:
// - Request duration tracking
// - Response status code tracking
// - Error rate monitoring
// - Slow query/endpoint detection
// - Endpoint-specific metrics
// ═══════════════════════════════════════════════════════════════════

import { metricsCollector } from './metrics-collector';
import { logger } from './logger';

// ===== TYPES =====

export interface ApiRequestMetrics {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  userId?: string;
  error?: string;
  traceId?: string;
}

interface EndpointStats {
  route: string;
  method: string;
  totalRequests: number;
  totalErrors: number;
  totalDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  last5ResponseTimes: number[];
  errorRate: number;
  avgResponseTimeMs: number;
  p50ResponseTimeMs: number;
  p95ResponseTimeMs: number;
  p99ResponseTimeMs: number;
}

interface StatusCodeDistribution {
  '1xx': number;
  '2xx': number;
  '3xx': number;
  '4xx': number;
  '5xx': number;
}

// ===== SLIDING WINDOW FOR PERCENTILE CALCULATIONS =====

class SlidingWindow {
  private values: number[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  add(value: number): void {
    this.values.push(value);
    if (this.values.length > this.maxSize) {
      this.values.shift();
    }
  }

  getPercentile(p: number): number {
    if (this.values.length === 0) return 0;
    const sorted = [...this.values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  getAverage(): number {
    if (this.values.length === 0) return 0;
    return this.values.reduce((sum, v) => sum + v, 0) / this.values.length;
  }

  getValues(): number[] {
    return [...this.values];
  }

  get length(): number {
    return this.values.length;
  }
}

// ===== API MONITOR CLASS =====

class ApiMonitor {
  private endpointWindows: Map<string, SlidingWindow> = new Map();
  private statusCodeCounts: StatusCodeDistribution = { '1xx': 0, '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  private totalRequests = 0;
  private totalErrors = 0;
  private slowThresholdMs: number;
  private startTime: number;

  // Track request rate over time (1-minute buckets)
  private requestBuckets: Map<number, number> = new Map();
  private readonly bucketSizeMs = 60000; // 1 minute

  constructor(slowThresholdMs: number = 2000) {
    this.slowThresholdMs = slowThresholdMs;
    this.startTime = Date.now();
  }

  /**
   * Record an API request and update all metrics.
   */
  recordRequest(metrics: ApiRequestMetrics): void {
    const { method, route, statusCode, durationMs, userId, error, traceId } = metrics;

    // Update global counters
    this.totalRequests++;
    const statusCategory = this.getStatusCategory(statusCode);
    this.statusCodeCounts[statusCategory]++;

    if (statusCode >= 400) {
      this.totalErrors++;
    }

    // Update endpoint-specific sliding window
    const endpointKey = `${method}:${route}`;
    let window = this.endpointWindows.get(endpointKey);
    if (!window) {
      window = new SlidingWindow(500); // Keep last 500 response times per endpoint
      this.endpointWindows.set(endpointKey, window);
    }
    window.add(durationMs);

    // Update request rate bucket
    const bucketKey = Math.floor(Date.now() / this.bucketSizeMs);
    this.requestBuckets.set(bucketKey, (this.requestBuckets.get(bucketKey) || 0) + 1);

    // Record to Prometheus metrics collector
    metricsCollector.incrementCounter('api_requests_total', {
      method,
      route: this.sanitizeRoute(route),
      status: String(statusCode),
    });
    metricsCollector.observeHistogram('api_request_duration_seconds', {
      method,
      route: this.sanitizeRoute(route),
    }, durationMs / 1000);

    // Log slow requests
    if (durationMs > this.slowThresholdMs) {
      logger.warn(`Slow API request detected`, undefined, {
        method,
        route,
        statusCode,
        duration: durationMs,
        userId,
        traceId,
      });
    }

    // Log errors with context
    if (statusCode >= 500) {
      logger.error(`API server error: ${method} ${route} → ${statusCode}`, undefined, {
        error: error ? new Error(String(error)) : undefined,
        method,
        route,
        statusCode,
        duration: durationMs,
        userId,
        traceId,
      });
    }

    // Clean up old request buckets (keep last 10 minutes)
    this.cleanupOldBuckets();
  }

  /**
   * Get statistics for a specific endpoint.
   */
  getEndpointStats(method: string, route: string): EndpointStats | null {
    const key = `${method}:${route}`;
    const window = this.endpointWindows.get(key);
    if (!window || window.length === 0) return null;

    const values = window.getValues();
    const errors = values.filter((_, i) => {
      // We don't track errors per-value in the window, use aggregate
      return false;
    });

    return {
      route,
      method,
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      totalDurationMs: values.reduce((sum, v) => sum + v, 0),
      minDurationMs: Math.min(...values),
      maxDurationMs: Math.max(...values),
      last5ResponseTimes: values.slice(-5),
      errorRate: this.totalRequests > 0 ? this.totalErrors / this.totalRequests : 0,
      avgResponseTimeMs: window.getAverage(),
      p50ResponseTimeMs: window.getPercentile(50),
      p95ResponseTimeMs: window.getPercentile(95),
      p99ResponseTimeMs: window.getPercentile(99),
    };
  }

  /**
   * Get statistics for all endpoints.
   */
  getAllEndpointStats(): EndpointStats[] {
    const stats: EndpointStats[] = [];
    for (const [key, window] of this.endpointWindows) {
      if (window.length === 0) continue;
      const [method, ...routeParts] = key.split(':');
      const route = routeParts.join(':');
      const values = window.getValues();

      stats.push({
        route,
        method,
        totalRequests: this.totalRequests,
        totalErrors: this.totalErrors,
        totalDurationMs: values.reduce((sum, v) => sum + v, 0),
        minDurationMs: Math.min(...values),
        maxDurationMs: Math.max(...values),
        last5ResponseTimes: values.slice(-5),
        errorRate: this.totalRequests > 0 ? this.totalErrors / this.totalRequests : 0,
        avgResponseTimeMs: window.getAverage(),
        p50ResponseTimeMs: window.getPercentile(50),
        p95ResponseTimeMs: window.getPercentile(95),
        p99ResponseTimeMs: window.getPercentile(99),
      });
    }
    return stats;
  }

  /**
   * Get overall API metrics summary.
   */
  getSummary(): {
    totalRequests: number;
    totalErrors: number;
    errorRate: number;
    statusCodeDistribution: StatusCodeDistribution;
    requestsPerMinute: number;
    avgResponseTimeMs: number;
    slowEndpoints: Array<{ route: string; method: string; avgMs: number; p95Ms: number }>;
    uptime: number;
  } {
    // Calculate requests per minute from last 5 minutes
    const now = Date.now();
    let recentRequests = 0;
    for (let i = 0; i < 5; i++) {
      const bucketKey = Math.floor((now - i * this.bucketSizeMs) / this.bucketSizeMs);
      recentRequests += this.requestBuckets.get(bucketKey) || 0;
    }
    const requestsPerMinute = recentRequests / 5;

    // Find slow endpoints (p95 > 1s)
    const slowEndpoints: Array<{ route: string; method: string; avgMs: number; p95Ms: number }> = [];
    for (const [key, window] of this.endpointWindows) {
      if (window.length < 5) continue;
      const p95 = window.getPercentile(95);
      if (p95 > 1000) {
        const [method, ...routeParts] = key.split(':');
        slowEndpoints.push({
          route: routeParts.join(':'),
          method,
          avgMs: Math.round(window.getAverage()),
          p95Ms: Math.round(p95),
        });
      }
    }

    // Global average response time
    let globalAvg = 0;
    let totalValues = 0;
    let totalSum = 0;
    for (const window of this.endpointWindows.values()) {
      const values = window.getValues();
      totalSum += values.reduce((s, v) => s + v, 0);
      totalValues += values.length;
    }
    if (totalValues > 0) {
      globalAvg = totalSum / totalValues;
    }

    return {
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      errorRate: this.totalRequests > 0 ? this.totalErrors / this.totalRequests : 0,
      statusCodeDistribution: { ...this.statusCodeCounts },
      requestsPerMinute: Math.round(requestsPerMinute * 100) / 100,
      avgResponseTimeMs: Math.round(globalAvg * 100) / 100,
      slowEndpoints,
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Get response time history for charting.
   * Returns last 20 data points per endpoint.
   */
  getResponseTimeHistory(): Record<string, number[]> {
    const result: Record<string, number[]> = {};
    for (const [key, window] of this.endpointWindows) {
      const values = window.getValues();
      result[key] = values.slice(-20);
    }
    return result;
  }

  /**
   * Get request volume over time (last 10 minutes).
   */
  getRequestVolumeTimeline(): Array<{ timestamp: number; count: number }> {
    const now = Date.now();
    const timeline: Array<{ timestamp: number; count: number }> = [];
    for (let i = 9; i >= 0; i--) {
      const bucketKey = Math.floor((now - i * this.bucketSizeMs) / this.bucketSizeMs);
      timeline.push({
        timestamp: bucketKey * this.bucketSizeMs,
        count: this.requestBuckets.get(bucketKey) || 0,
      });
    }
    return timeline;
  }

  // ── Internal Helpers ────────────────────────────────────────

  private getStatusCategory(code: number): keyof StatusCodeDistribution {
    if (code < 200) return '1xx';
    if (code < 300) return '2xx';
    if (code < 400) return '3xx';
    if (code < 500) return '4xx';
    return '5xx';
  }

  private sanitizeRoute(route: string): string {
    // Replace dynamic segments like [id] with :id for metric labels
    return route
      .replace(/\[([^\]]+)\]/g, ':$1')
      .replace(/\/[a-zA-Z0-9_-]{20,}/g, '/:id');
  }

  private cleanupOldBuckets(): void {
    const now = Date.now();
    const cutoff = now - 10 * this.bucketSizeMs;
    for (const [key] of this.requestBuckets) {
      if (key * this.bucketSizeMs < cutoff) {
        this.requestBuckets.delete(key);
      }
    }
  }
}

// ===== SINGLETON EXPORT =====

const globalForApiMonitor = globalThis as unknown as {
  __apiMonitor: ApiMonitor | undefined;
};

export const apiMonitor = globalForApiMonitor.__apiMonitor ?? new ApiMonitor();

if (process.env.NODE_ENV !== 'production') {
  globalForApiMonitor.__apiMonitor = apiMonitor;
}

/**
 * Helper to wrap an API route handler with monitoring.
 * Usage:
 *   export const GET = withApiMonitoring(async (request) => { ... });
 */
export function withApiMonitoring(
  handler: (request: Request) => Promise<Response>,
  routeLabel?: string
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const startTime = performance.now();
    const url = new URL(request.url);
    const route = routeLabel || url.pathname;
    const method = request.method;

    try {
      const response = await handler(request);
      const durationMs = performance.now() - startTime;

      apiMonitor.recordRequest({
        method,
        route,
        statusCode: response.status,
        durationMs,
      });

      return response;
    } catch (error) {
      const durationMs = performance.now() - startTime;

      apiMonitor.recordRequest({
        method,
        route,
        statusCode: 500,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  };
}

export { ApiMonitor };
