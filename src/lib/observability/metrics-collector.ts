// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Metrics Collector (Prometheus-compatible)
// Phase 14.2: Observability Infrastructure
// ═══════════════════════════════════════════════════════════════════

// ===== TYPES =====

interface CounterEntry {
  name: string;
  help: string;
  type: 'counter';
  value: number;
  labels: Record<string, string>;
}

interface HistogramEntry {
  name: string;
  help: string;
  type: 'histogram';
  buckets: number[];
  bucketCounts: Map<string, number>; // bucket boundary → count
  sum: number;
  count: number;
  labels: Record<string, string>;
}

interface GaugeEntry {
  name: string;
  help: string;
  type: 'gauge';
  value: number;
  labels: Record<string, string>;
}

type MetricEntry = CounterEntry | HistogramEntry | GaugeEntry;

// ===== METRIC DEFINITIONS =====

const COUNTER_DEFINITIONS: Record<string, string> = {
  api_requests_total: 'Total number of API requests',
  credits_consumed_total: 'Total credits consumed',
  workflow_executions_total: 'Total workflow executions',
  ai_requests_total: 'Total AI API requests',
  ai_cost_total: 'Total AI cost in USD',
  payment_failures_total: 'Total payment failures',
  payment_success_total: 'Total successful payments',
  anomaly_alerts_total: 'Total anomaly alerts triggered',
  competitor_scans_total: 'Total competitor scans performed',
};

const HISTOGRAM_DEFINITIONS: Record<string, { help: string; buckets: number[] }> = {
  api_request_duration_seconds: {
    help: 'API request duration in seconds',
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  },
  workflow_duration_seconds: {
    help: 'Workflow execution duration in seconds',
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600],
  },
  db_query_duration_seconds: {
    help: 'Database query duration in seconds',
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  },
  redis_operation_duration_seconds: {
    help: 'Redis operation duration in seconds',
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
  },
};

const GAUGE_DEFINITIONS: Record<string, string> = {
  active_users: 'Number of active users',
  credits_remaining: 'Credits remaining across all users',
  queue_depth: 'Current queue depth',
  websocket_connections: 'Current WebSocket connections',
};

// ===== HELPER: Label key =====

function labelKey(labels: Record<string, string>): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
}

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return '';
  return '{' + entries.map(([k, v]) => `${k}="${v}"`).join(',') + '}';
}

// ===== METRICS COLLECTOR CLASS =====

class MetricsCollector {
  private counters: Map<string, CounterEntry> = new Map();
  private histograms: Map<string, HistogramEntry> = new Map();
  private gauges: Map<string, GaugeEntry> = new Map();
  private startTime: number;

  constructor() {
    this.startTime = Date.now();

    // Initialize counter definitions
    for (const [name, help] of Object.entries(COUNTER_DEFINITIONS)) {
      this.counters.set(name, {
        name,
        help,
        type: 'counter',
        value: 0,
        labels: {},
      });
    }

    // Initialize histogram definitions
    for (const [name, def] of Object.entries(HISTOGRAM_DEFINITIONS)) {
      this.histograms.set(name, {
        name,
        help: def.help,
        type: 'histogram',
        buckets: def.buckets,
        bucketCounts: new Map(),
        sum: 0,
        count: 0,
        labels: {},
      });
    }

    // Initialize gauge definitions
    for (const [name, help] of Object.entries(GAUGE_DEFINITIONS)) {
      this.gauges.set(name, {
        name,
        help,
        type: 'gauge',
        value: 0,
        labels: {},
      });
    }
  }

  // ── Counter Methods ────────────────────────────────────────────

  /**
   * Increment a counter metric by a value (default 1).
   * Creates a new labeled entry if labels are provided.
   */
  incrementCounter(name: string, labels?: Record<string, string>, value: number = 1): void {
    if (!COUNTER_DEFINITIONS[name]) {
      console.warn(`Unknown counter metric: ${name}`);
      return;
    }

    const key = labels && Object.keys(labels).length > 0
      ? `${name}|${labelKey(labels)}`
      : name;

    const existing = this.counters.get(key);
    if (existing) {
      existing.value += value;
    } else {
      this.counters.set(key, {
        name,
        help: COUNTER_DEFINITIONS[name],
        type: 'counter',
        value,
        labels: labels || {},
      });
    }
  }

  // ── Histogram Methods ──────────────────────────────────────────

  /**
   * Observe a value for a histogram metric.
   * Increments the appropriate buckets, sum, and count.
   */
  observeHistogram(name: string, labels?: Record<string, string>, value: number = 0): void {
    if (!HISTOGRAM_DEFINITIONS[name]) {
      console.warn(`Unknown histogram metric: ${name}`);
      return;
    }

    const key = labels && Object.keys(labels).length > 0
      ? `${name}|${labelKey(labels)}`
      : name;

    const def = HISTOGRAM_DEFINITIONS[name];
    const existing = this.histograms.get(key);
    if (existing) {
      existing.sum += value;
      existing.count += 1;
      for (const boundary of def.buckets) {
        if (value <= boundary) {
          const bk = String(boundary);
          existing.bucketCounts.set(bk, (existing.bucketCounts.get(bk) || 0) + 1);
        }
      }
      // +Inf bucket always gets incremented
      existing.bucketCounts.set('+Inf', (existing.bucketCounts.get('+Inf') || 0) + 1);
    } else {
      const entry: HistogramEntry = {
        name,
        help: def.help,
        type: 'histogram',
        buckets: def.buckets,
        bucketCounts: new Map(),
        sum: value,
        count: 1,
        labels: labels || {},
      };
      for (const boundary of def.buckets) {
        if (value <= boundary) {
          entry.bucketCounts.set(String(boundary), 1);
        }
      }
      entry.bucketCounts.set('+Inf', 1);
      this.histograms.set(key, entry);
    }
  }

  // ── Gauge Methods ──────────────────────────────────────────────

  /**
   * Set a gauge metric to a specific value.
   */
  setGauge(name: string, labels?: Record<string, string>, value: number = 0): void {
    if (!GAUGE_DEFINITIONS[name]) {
      console.warn(`Unknown gauge metric: ${name}`);
      return;
    }

    const key = labels && Object.keys(labels).length > 0
      ? `${name}|${labelKey(labels)}`
      : name;

    this.gauges.set(key, {
      name,
      help: GAUGE_DEFINITIONS[name],
      type: 'gauge',
      value,
      labels: labels || {},
    });
  }

  // ── Get Metrics (Internal) ─────────────────────────────────────

  /**
   * Get all metric entries for programmatic access.
   */
  getMetrics(): {
    counters: CounterEntry[];
    histograms: HistogramEntry[];
    gauges: GaugeEntry[];
    uptime: number;
  } {
    return {
      counters: Array.from(this.counters.values()),
      histograms: Array.from(this.histograms.values()),
      gauges: Array.from(this.gauges.values()),
      uptime: Date.now() - this.startTime,
    };
  }

  // ── Prometheus Format Output ───────────────────────────────────

  /**
   * Generate Prometheus text format output.
   * See: https://prometheus.io/docs/instrumenting/exposition_formats/
   */
  toPrometheusFormat(): string {
    const lines: string[] = [];

    // Process counters (group by metric name to avoid duplicate HELP/TYPE)
    const counterNames = new Set<string>();
    for (const entry of this.counters.values()) {
      if (!counterNames.has(entry.name)) {
        counterNames.add(entry.name);
        lines.push(`# HELP ${entry.name} ${entry.help}`);
        lines.push(`# TYPE ${entry.name} counter`);
      }
      const lbl = formatLabels(entry.labels);
      lines.push(`${entry.name}${lbl} ${entry.value}`);
    }

    // Process histograms (group by metric name)
    const histogramNames = new Set<string>();
    for (const entry of this.histograms.values()) {
      if (!histogramNames.has(entry.name)) {
        histogramNames.add(entry.name);
        lines.push(`# HELP ${entry.name} ${entry.help}`);
        lines.push(`# TYPE ${entry.name} histogram`);
      }
      const lbl = formatLabels(entry.labels);
      const lblPrefix = Object.keys(entry.labels).length > 0
        ? lbl.slice(0, -1) + ','
        : '{';

      // Bucket lines
      for (const boundary of entry.buckets) {
        const count = entry.bucketCounts.get(String(boundary)) || 0;
        lines.push(`${entry.name}_bucket{le="${boundary}"} ${count}`);
      }
      const infCount = entry.bucketCounts.get('+Inf') || 0;
      lines.push(`${entry.name}_bucket{le="+Inf"} ${infCount}`);

      lines.push(`${entry.name}_sum ${entry.sum}`);
      lines.push(`${entry.name}_count ${entry.count}`);
    }

    // Process gauges (group by metric name)
    const gaugeNames = new Set<string>();
    for (const entry of this.gauges.values()) {
      if (!gaugeNames.has(entry.name)) {
        gaugeNames.add(entry.name);
        lines.push(`# HELP ${entry.name} ${entry.help}`);
        lines.push(`# TYPE ${entry.name} gauge`);
      }
      const lbl = formatLabels(entry.labels);
      lines.push(`${entry.name}${lbl} ${entry.value}`);
    }

    // Process info metric
    lines.push('# HELP acquisitionos_info Application metadata');
    lines.push('# TYPE acquisitionos_info gauge');
    lines.push(`acquisitionos_info{version="2.0.0",node="${process.version}"} 1`);

    // Process uptime
    const uptimeSeconds = (Date.now() - this.startTime) / 1000;
    lines.push('# HELP process_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${uptimeSeconds.toFixed(2)}`);

    return lines.join('\n') + '\n';
  }

  // ── Reset ──────────────────────────────────────────────────────

  /**
   * Reset all metrics. Useful for testing.
   */
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
    this.startTime = Date.now();

    // Re-initialize base definitions
    for (const [name, help] of Object.entries(COUNTER_DEFINITIONS)) {
      this.counters.set(name, { name, help, type: 'counter', value: 0, labels: {} });
    }
    for (const [name, def] of Object.entries(HISTOGRAM_DEFINITIONS)) {
      this.histograms.set(name, {
        name, help: def.help, type: 'histogram',
        buckets: def.buckets, bucketCounts: new Map(), sum: 0, count: 0, labels: {},
      });
    }
    for (const [name, help] of Object.entries(GAUGE_DEFINITIONS)) {
      this.gauges.set(name, { name, help, type: 'gauge', value: 0, labels: {} });
    }
  }
}

// ===== SINGLETON EXPORT =====

const globalForMetrics = globalThis as unknown as {
  __metricsCollector: MetricsCollector | undefined;
};

export const metricsCollector =
  globalForMetrics.__metricsCollector ?? new MetricsCollector();

if (process.env.NODE_ENV !== 'production') {
  globalForMetrics.__metricsCollector = metricsCollector;
}

export { MetricsCollector };
export type { CounterEntry, HistogramEntry, GaugeEntry };
