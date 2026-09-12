// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Simple Metrics Collection (Observability Module)
// Phase L10: Observability
//
// Provides in-memory metrics collection with:
// - API response time tracking (histogram buckets)
// - Error rate tracking per route
// - Custom counters and gauges
// - Periodic aggregation and snapshots
// - Integration with the existing metrics-collector
//
// This is a simpler, application-level metrics layer that complements
// the Prometheus-compatible metrics-collector at @/lib/observability/metrics-collector.
// ═══════════════════════════════════════════════════════════════════

import { metricsCollector } from './metrics-collector';

// ===== TYPES =====

export interface ApiMetricSnapshot {
  route: string;
  method: string;
  totalRequests: number;
  errorCount: number;
  errorRate: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
}

export interface MetricSnapshot {
  timestamp: string;
  uptime: number;
  apiMetrics: ApiMetricSnapshot[];
  customCounters: Record<string, number>;
  customGauges: Record<string, number>;
}

interface RouteMetric {
  route: string;
  method: string;
  totalRequests: number;
  errorCount: number;
  durations: number[]; // Last N durations for percentile calc
  totalDuration: number;
}

// ===== CONFIGURATION =====

const MAX_STORED_DURATIONS = 1000; // Keep last 1000 request durations per route
const DURATION_PERCENTILES = [0.5, 0.95, 0.99];

// ===== IN-MEMORY METRICS STORE =====

class SimpleMetricsStore {
  private routeMetrics: Map<string, RouteMetric> = new Map();
  private customCounters: Map<string, number> = new Map();
  private customGauges: Map<string, number> = new Map();
  private startTime: number = Date.now();

  /**
   * Record an API request metric.
   * Tracks response time, error rate, and request count per route.
   */
  recordApiRequest(params: {
    route: string;
    method: string;
    statusCode: number;
    durationMs: number;
  }): void {
    const key = `${params.method}:${params.route}`;
    let metric = this.routeMetrics.get(key);

    if (!metric) {
      metric = {
        route: params.route,
        method: params.method,
        totalRequests: 0,
        errorCount: 0,
        durations: [],
        totalDuration: 0,
      };
      this.routeMetrics.set(key, metric);
    }

    metric.totalRequests++;
    metric.totalDuration += params.durationMs;

    if (params.statusCode >= 400) {
      metric.errorCount++;
    }

    // Store duration for percentile calculations
    metric.durations.push(params.durationMs);
    if (metric.durations.length > MAX_STORED_DURATIONS) {
      metric.durations.shift(); // Remove oldest
    }

    // Also record in the Prometheus-compatible metrics collector
    metricsCollector.incrementCounter('api_requests_total', {
      method: params.method,
      route: params.route,
      status: String(params.statusCode),
    });

    metricsCollector.observeHistogram(
      'api_request_duration_seconds',
      { method: params.method, route: params.route },
      params.durationMs / 1000,
    );
  }

  /**
   * Increment a custom counter.
   */
  incrementCounter(name: string, value: number = 1): void {
    const current = this.customCounters.get(name) || 0;
    this.customCounters.set(name, current + value);
  }

  /**
   * Set a custom gauge value.
   */
  setGauge(name: string, value: number): void {
    this.customGauges.set(name, value);
  }

  /**
   * Get a snapshot of all metrics.
   */
  getSnapshot(): MetricSnapshot {
    const apiMetrics: ApiMetricSnapshot[] = [];

    for (const metric of this.routeMetrics.values()) {
      const sorted = [...metric.durations].sort((a, b) => a - b);
      const percentiles = this.calculatePercentiles(sorted);

      apiMetrics.push({
        route: metric.route,
        method: metric.method,
        totalRequests: metric.totalRequests,
        errorCount: metric.errorCount,
        errorRate: metric.totalRequests > 0
          ? metric.errorCount / metric.totalRequests
          : 0,
        avgDurationMs: metric.totalRequests > 0
          ? Math.round(metric.totalDuration / metric.totalRequests * 100) / 100
          : 0,
        p50DurationMs: percentiles.p50,
        p95DurationMs: percentiles.p95,
        p99DurationMs: percentiles.p99,
      });
    }

    return {
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      apiMetrics: apiMetrics.sort((a, b) => b.totalRequests - a.totalRequests),
      customCounters: Object.fromEntries(this.customCounters),
      customGauges: Object.fromEntries(this.customGauges),
    };
  }

  /**
   * Get top N routes by request count.
   */
  getTopRoutes(limit: number = 10): ApiMetricSnapshot[] {
    return this.getSnapshot().apiMetrics.slice(0, limit);
  }

  /**
   * Get error rates for all routes.
   */
  getErrorRates(): Array<{ route: string; method: string; errorRate: number; errorCount: number }> {
    return this.getSnapshot().apiMetrics.map(m => ({
      route: m.route,
      method: m.method,
      errorRate: m.errorRate,
      errorCount: m.errorCount,
    })).filter(m => m.errorCount > 0);
  }

  /**
   * Reset all metrics. Useful for testing.
   */
  reset(): void {
    this.routeMetrics.clear();
    this.customCounters.clear();
    this.customGauges.clear();
    this.startTime = Date.now();
  }

  // ===== INTERNAL HELPERS =====

  private calculatePercentiles(sortedDurations: number[]): {
    p50: number;
    p95: number;
    p99: number;
  } {
    if (sortedDurations.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    return {
      p50: this.percentile(sortedDurations, 0.5),
      p95: this.percentile(sortedDurations, 0.95),
      p99: this.percentile(sortedDurations, 0.99),
    };
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil(p * sorted.length) - 1;
    return Math.round(sorted[Math.max(0, index)] * 100) / 100;
  }
}

// ===== SINGLETON =====

const globalForMetrics = globalThis as unknown as {
  __simpleMetricsStore: SimpleMetricsStore | undefined;
};

export const simpleMetrics =
  globalForMetrics.__simpleMetricsStore ?? new SimpleMetricsStore();

if (process.env.NODE_ENV !== 'production') {
  globalForMetrics.__simpleMetricsStore = simpleMetrics;
}

export { SimpleMetricsStore };
export default simpleMetrics;
