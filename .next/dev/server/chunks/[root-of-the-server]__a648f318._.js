module.exports = [
"[project]/src/lib/observability/metrics-collector.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Metrics Collector (Prometheus-compatible)
// Phase 14.2: Observability Infrastructure
// ═══════════════════════════════════════════════════════════════════
// ===== TYPES =====
__turbopack_context__.s([
    "MetricsCollector",
    ()=>MetricsCollector,
    "metricsCollector",
    ()=>metricsCollector
]);
// ===== METRIC DEFINITIONS =====
const COUNTER_DEFINITIONS = {
    api_requests_total: 'Total number of API requests',
    credits_consumed_total: 'Total credits consumed',
    workflow_executions_total: 'Total workflow executions',
    ai_requests_total: 'Total AI API requests',
    ai_cost_total: 'Total AI cost in USD',
    payment_failures_total: 'Total payment failures',
    payment_success_total: 'Total successful payments',
    anomaly_alerts_total: 'Total anomaly alerts triggered',
    competitor_scans_total: 'Total competitor scans performed'
};
const HISTOGRAM_DEFINITIONS = {
    api_request_duration_seconds: {
        help: 'API request duration in seconds',
        buckets: [
            0.005,
            0.01,
            0.025,
            0.05,
            0.1,
            0.25,
            0.5,
            1,
            2.5,
            5,
            10
        ]
    },
    workflow_duration_seconds: {
        help: 'Workflow execution duration in seconds',
        buckets: [
            0.1,
            0.5,
            1,
            2,
            5,
            10,
            30,
            60,
            120,
            300,
            600
        ]
    },
    db_query_duration_seconds: {
        help: 'Database query duration in seconds',
        buckets: [
            0.001,
            0.005,
            0.01,
            0.025,
            0.05,
            0.1,
            0.25,
            0.5,
            1
        ]
    },
    redis_operation_duration_seconds: {
        help: 'Redis operation duration in seconds',
        buckets: [
            0.001,
            0.005,
            0.01,
            0.025,
            0.05,
            0.1,
            0.25,
            0.5
        ]
    }
};
const GAUGE_DEFINITIONS = {
    active_users: 'Number of active users',
    credits_remaining: 'Credits remaining across all users',
    queue_depth: 'Current queue depth',
    websocket_connections: 'Current WebSocket connections'
};
// ===== HELPER: Label key =====
function labelKey(labels) {
    return Object.entries(labels).sort(([a], [b])=>a.localeCompare(b)).map(([k, v])=>`${k}="${v}"`).join(',');
}
function formatLabels(labels) {
    const entries = Object.entries(labels).sort(([a], [b])=>a.localeCompare(b));
    if (entries.length === 0) return '';
    return '{' + entries.map(([k, v])=>`${k}="${v}"`).join(',') + '}';
}
// ===== METRICS COLLECTOR CLASS =====
class MetricsCollector {
    counters = new Map();
    histograms = new Map();
    gauges = new Map();
    startTime;
    constructor(){
        this.startTime = Date.now();
        // Initialize counter definitions
        for (const [name, help] of Object.entries(COUNTER_DEFINITIONS)){
            this.counters.set(name, {
                name,
                help,
                type: 'counter',
                value: 0,
                labels: {}
            });
        }
        // Initialize histogram definitions
        for (const [name, def] of Object.entries(HISTOGRAM_DEFINITIONS)){
            this.histograms.set(name, {
                name,
                help: def.help,
                type: 'histogram',
                buckets: def.buckets,
                bucketCounts: new Map(),
                sum: 0,
                count: 0,
                labels: {}
            });
        }
        // Initialize gauge definitions
        for (const [name, help] of Object.entries(GAUGE_DEFINITIONS)){
            this.gauges.set(name, {
                name,
                help,
                type: 'gauge',
                value: 0,
                labels: {}
            });
        }
    }
    // ── Counter Methods ────────────────────────────────────────────
    /**
   * Increment a counter metric by a value (default 1).
   * Creates a new labeled entry if labels are provided.
   */ incrementCounter(name, labels, value = 1) {
        if (!COUNTER_DEFINITIONS[name]) {
            console.warn(`Unknown counter metric: ${name}`);
            return;
        }
        const key = labels && Object.keys(labels).length > 0 ? `${name}|${labelKey(labels)}` : name;
        const existing = this.counters.get(key);
        if (existing) {
            existing.value += value;
        } else {
            this.counters.set(key, {
                name,
                help: COUNTER_DEFINITIONS[name],
                type: 'counter',
                value,
                labels: labels || {}
            });
        }
    }
    // ── Histogram Methods ──────────────────────────────────────────
    /**
   * Observe a value for a histogram metric.
   * Increments the appropriate buckets, sum, and count.
   */ observeHistogram(name, labels, value = 0) {
        if (!HISTOGRAM_DEFINITIONS[name]) {
            console.warn(`Unknown histogram metric: ${name}`);
            return;
        }
        const key = labels && Object.keys(labels).length > 0 ? `${name}|${labelKey(labels)}` : name;
        const def = HISTOGRAM_DEFINITIONS[name];
        const existing = this.histograms.get(key);
        if (existing) {
            existing.sum += value;
            existing.count += 1;
            for (const boundary of def.buckets){
                if (value <= boundary) {
                    const bk = String(boundary);
                    existing.bucketCounts.set(bk, (existing.bucketCounts.get(bk) || 0) + 1);
                }
            }
            // +Inf bucket always gets incremented
            existing.bucketCounts.set('+Inf', (existing.bucketCounts.get('+Inf') || 0) + 1);
        } else {
            const entry = {
                name,
                help: def.help,
                type: 'histogram',
                buckets: def.buckets,
                bucketCounts: new Map(),
                sum: value,
                count: 1,
                labels: labels || {}
            };
            for (const boundary of def.buckets){
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
   */ setGauge(name, labels, value = 0) {
        if (!GAUGE_DEFINITIONS[name]) {
            console.warn(`Unknown gauge metric: ${name}`);
            return;
        }
        const key = labels && Object.keys(labels).length > 0 ? `${name}|${labelKey(labels)}` : name;
        this.gauges.set(key, {
            name,
            help: GAUGE_DEFINITIONS[name],
            type: 'gauge',
            value,
            labels: labels || {}
        });
    }
    // ── Get Metrics (Internal) ─────────────────────────────────────
    /**
   * Get all metric entries for programmatic access.
   */ getMetrics() {
        return {
            counters: Array.from(this.counters.values()),
            histograms: Array.from(this.histograms.values()),
            gauges: Array.from(this.gauges.values()),
            uptime: Date.now() - this.startTime
        };
    }
    // ── Prometheus Format Output ───────────────────────────────────
    /**
   * Generate Prometheus text format output.
   * See: https://prometheus.io/docs/instrumenting/exposition_formats/
   */ toPrometheusFormat() {
        const lines = [];
        // Process counters (group by metric name to avoid duplicate HELP/TYPE)
        const counterNames = new Set();
        for (const entry of this.counters.values()){
            if (!counterNames.has(entry.name)) {
                counterNames.add(entry.name);
                lines.push(`# HELP ${entry.name} ${entry.help}`);
                lines.push(`# TYPE ${entry.name} counter`);
            }
            const lbl = formatLabels(entry.labels);
            lines.push(`${entry.name}${lbl} ${entry.value}`);
        }
        // Process histograms (group by metric name)
        const histogramNames = new Set();
        for (const entry of this.histograms.values()){
            if (!histogramNames.has(entry.name)) {
                histogramNames.add(entry.name);
                lines.push(`# HELP ${entry.name} ${entry.help}`);
                lines.push(`# TYPE ${entry.name} histogram`);
            }
            const lbl = formatLabels(entry.labels);
            const lblPrefix = Object.keys(entry.labels).length > 0 ? lbl.slice(0, -1) + ',' : '{';
            // Bucket lines
            for (const boundary of entry.buckets){
                const count = entry.bucketCounts.get(String(boundary)) || 0;
                lines.push(`${entry.name}_bucket{le="${boundary}"} ${count}`);
            }
            const infCount = entry.bucketCounts.get('+Inf') || 0;
            lines.push(`${entry.name}_bucket{le="+Inf"} ${infCount}`);
            lines.push(`${entry.name}_sum ${entry.sum}`);
            lines.push(`${entry.name}_count ${entry.count}`);
        }
        // Process gauges (group by metric name)
        const gaugeNames = new Set();
        for (const entry of this.gauges.values()){
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
   */ reset() {
        this.counters.clear();
        this.histograms.clear();
        this.gauges.clear();
        this.startTime = Date.now();
        // Re-initialize base definitions
        for (const [name, help] of Object.entries(COUNTER_DEFINITIONS)){
            this.counters.set(name, {
                name,
                help,
                type: 'counter',
                value: 0,
                labels: {}
            });
        }
        for (const [name, def] of Object.entries(HISTOGRAM_DEFINITIONS)){
            this.histograms.set(name, {
                name,
                help: def.help,
                type: 'histogram',
                buckets: def.buckets,
                bucketCounts: new Map(),
                sum: 0,
                count: 0,
                labels: {}
            });
        }
        for (const [name, help] of Object.entries(GAUGE_DEFINITIONS)){
            this.gauges.set(name, {
                name,
                help,
                type: 'gauge',
                value: 0,
                labels: {}
            });
        }
    }
}
// ===== SINGLETON EXPORT =====
const globalForMetrics = globalThis;
const metricsCollector = globalForMetrics.__metricsCollector ?? new MetricsCollector();
if ("TURBOPACK compile-time truthy", 1) {
    globalForMetrics.__metricsCollector = metricsCollector;
}
;
}),
"[project]/src/lib/logger.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Structured Logger
// Phase 11: Observability
//
// Provides structured JSON logging with levels, request tracking,
// and environment-aware formatting (pretty in dev, JSON in prod).
// ═══════════════════════════════════════════════════════════════════
// ===== TYPES =====
__turbopack_context__.s([
    "createLogger",
    ()=>createLogger,
    "debug",
    ()=>debug,
    "default",
    ()=>__TURBOPACK__default__export__,
    "error",
    ()=>error,
    "fatal",
    ()=>fatal,
    "info",
    ()=>info,
    "warn",
    ()=>warn,
    "withDuration",
    ()=>withDuration
]);
// ===== CONSTANTS =====
const LOG_LEVEL_PRIORITY = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4
};
const DEFAULT_SERVICE = 'acquisitionos';
const MIN_LOG_LEVEL = process.env.LOG_LEVEL || (("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : 'debug');
// ===== COLOR HELPERS (development pretty-print) =====
const COLORS = {
    debug: '\x1b[36m',
    info: '\x1b[32m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
    fatal: '\x1b[35m'
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
function formatPretty(entry) {
    const color = COLORS[entry.level];
    const timestamp = DIM + entry.timestamp + RESET;
    const level = `${color}${BOLD}${entry.level.toUpperCase().padEnd(5)}${RESET}`;
    const service = DIM + `[${entry.service}]` + RESET;
    let line = `${timestamp} ${level} ${service} ${entry.message}`;
    // Append structured fields
    const extra = {};
    for (const [key, value] of Object.entries(entry)){
        if (![
            'timestamp',
            'level',
            'message',
            'service'
        ].includes(key)) {
            extra[key] = value;
        }
    }
    if (Object.keys(extra).length > 0) {
        line += ` ${DIM}${JSON.stringify(extra)}${RESET}`;
    }
    return line;
}
function formatJson(entry) {
    // In production, remove undefined values for clean JSON
    const clean = {};
    for (const [key, value] of Object.entries(entry)){
        if (value !== undefined) {
            clean[key] = value;
        }
    }
    return JSON.stringify(clean);
}
// ===== CORE LOGGER =====
function shouldLog(level) {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[MIN_LOG_LEVEL];
}
function createEntry(level, message, options, extra) {
    return {
        timestamp: new Date().toISOString(),
        level,
        message,
        service: options?.service || DEFAULT_SERVICE,
        userId: options?.userId,
        requestId: options?.requestId,
        ...extra
    };
}
function emit(entry) {
    const isProduction = ("TURBOPACK compile-time value", "development") === 'production';
    const formatted = ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : formatPretty(entry);
    switch(entry.level){
        case 'debug':
            // Only log debug in non-production or when explicitly set
            if ("TURBOPACK compile-time truthy", 1) {
                process.stdout.write(formatted + '\n');
            }
            break;
        case 'info':
            process.stdout.write(formatted + '\n');
            break;
        case 'warn':
            process.stderr.write(formatted + '\n');
            break;
        case 'error':
            process.stderr.write(formatted + '\n');
            break;
        case 'fatal':
            process.stderr.write(formatted + '\n');
            break;
    }
}
function debug(message, options, extra) {
    if (!shouldLog('debug')) return;
    emit(createEntry('debug', message, options, extra));
}
function info(message, options, extra) {
    if (!shouldLog('info')) return;
    emit(createEntry('info', message, options, extra));
}
function warn(message, options, extra) {
    if (!shouldLog('warn')) return;
    emit(createEntry('warn', message, options, extra));
}
function error(message, options, extra) {
    if (!shouldLog('error')) return;
    const entry = createEntry('error', message, options, extra);
    // If an Error object is passed in extra, extract stack trace
    if (extra?.error instanceof Error) {
        entry.stack = extra.error.stack;
        entry.errorName = extra.error.name;
        entry.errorMessage = extra.error.message;
        // Remove the raw error object to keep JSON serializable
        delete entry.error;
    }
    emit(entry);
}
function fatal(message, options, extra) {
    if (!shouldLog('fatal')) return;
    const entry = createEntry('fatal', message, options, extra);
    if (extra?.error instanceof Error) {
        entry.stack = extra.error.stack;
        entry.errorName = extra.error.name;
        entry.errorMessage = extra.error.message;
        delete entry.error;
    }
    emit(entry);
}
function createLogger(options) {
    return {
        debug: (message, extra)=>debug(message, options, extra),
        info: (message, extra)=>info(message, options, extra),
        warn: (message, extra)=>warn(message, options, extra),
        error: (message, extra)=>error(message, options, extra),
        fatal: (message, extra)=>fatal(message, options, extra),
        withRequestId: (requestId)=>createLogger({
                ...options,
                requestId
            }),
        withUserId: (userId)=>createLogger({
                ...options,
                userId
            })
    };
}
async function withDuration(label, fn, options) {
    const start = performance.now();
    try {
        const result = await fn();
        const duration = Math.round(performance.now() - start);
        info(`${label} completed`, options, {
            duration
        });
        return result;
    } catch (err) {
        const duration = Math.round(performance.now() - start);
        error(`${label} failed`, options, {
            duration,
            error: err instanceof Error ? err : new Error(String(err))
        });
        throw err;
    }
}
// ===== DEFAULT EXPORT =====
const logger = {
    debug,
    info,
    warn,
    error,
    fatal,
    createLogger,
    withDuration
};
const __TURBOPACK__default__export__ = logger;
}),
"[project]/src/lib/observability/logger.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Structured Logging Utility (Observability Module)
// Phase L10: Observability (Enhanced)
//
// Provides structured logging with:
// - JSON output in production, pretty-print in development
// - Module-scoped loggers via createModuleLogger()
// - Request tracing support (requestId / traceId)
// - userId correlation for audit trails
// - Metadata enrichment for structured analysis
// - Default context propagation for request-scoped loggers
// - PerfTimer for easy duration tracking
//
// This module wraps the core logger at @/lib/logger and adds:
// - Module-scoped convenience (no need to pass service on every call)
// - Typed metadata support
// - Integration with the observability stack
// ═══════════════════════════════════════════════════════════════════
__turbopack_context__.s([
    "PerfTimer",
    ()=>PerfTimer,
    "clearDefaultContext",
    ()=>clearDefaultContext,
    "createLogger",
    ()=>createLogger,
    "createModuleLogger",
    ()=>createModuleLogger,
    "debug",
    ()=>debug,
    "default",
    ()=>__TURBOPACK__default__export__,
    "error",
    ()=>error,
    "fatal",
    ()=>fatal,
    "getDefaultContext",
    ()=>getDefaultContext,
    "info",
    ()=>info,
    "logApiRequest",
    ()=>logApiRequest,
    "logBusinessEvent",
    ()=>logBusinessEvent,
    "logger",
    ()=>logger,
    "setDefaultContext",
    ()=>setDefaultContext,
    "warn",
    ()=>warn,
    "withDuration",
    ()=>withDuration
]);
// ===== IMPORT CORE LOGGER =====
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/logger.ts [instrumentation] (ecmascript)");
;
const debug = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__.debug;
const info = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__.info;
const warn = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__.warn;
const error = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__.error;
const fatal = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__.fatal;
const createLogger = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__.createLogger;
const withDuration = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__.withDuration;
// ===== DEFAULT CONTEXT (request-scoped) =====
// Used by the monitoring middleware to inject trace/request context
// into all log entries for the duration of a request.
let defaultContext = {};
function setDefaultContext(ctx) {
    defaultContext = {
        ...ctx
    };
}
function clearDefaultContext() {
    defaultContext = {};
}
function getDefaultContext() {
    return {
        ...defaultContext
    };
}
class PerfTimer {
    startTime;
    label;
    constructor(label){
        this.label = label;
        this.startTime = performance.now();
    }
    /** Stop the timer and log the duration at info level. Returns ms. */ stop(extra) {
        const durationMs = Math.round(performance.now() - this.startTime);
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__.info(`${this.label} completed`, {
            service: 'observability'
        }, {
            durationMs,
            ...extra
        });
        return durationMs;
    }
    /** Stop the timer and log the duration at error level. */ stopError(message, extra) {
        const durationMs = Math.round(performance.now() - this.startTime);
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__.error(message, {
            service: 'observability'
        }, {
            durationMs,
            ...extra
        });
        return durationMs;
    }
    /** Get elapsed ms without stopping. */ elapsed() {
        return Math.round(performance.now() - this.startTime);
    }
}
function createModuleLogger(options) {
    const baseOptions = {
        service: options.module,
        userId: options.userId,
        requestId: options.requestId || options.traceId
    };
    return {
        debug: (message, metadata)=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__.debug(message, baseOptions, {
                ...defaultContext,
                ...metadata
            }),
        info: (message, metadata)=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__.info(message, baseOptions, {
                ...defaultContext,
                ...metadata
            }),
        warn: (message, metadata)=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__.warn(message, baseOptions, {
                ...defaultContext,
                ...metadata
            }),
        error: (message, metadata)=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__.error(message, baseOptions, {
                ...defaultContext,
                ...metadata
            }),
        fatal: (message, metadata)=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__.fatal(message, baseOptions, {
                ...defaultContext,
                ...metadata
            }),
        withRequestId: (requestId)=>createModuleLogger({
                ...options,
                requestId
            }),
        withUserId: (userId)=>createModuleLogger({
                ...options,
                userId
            }),
        withTraceId: (traceId)=>createModuleLogger({
                ...options,
                traceId
            }),
        withMetadata: (extra)=>createModuleLogger({
                ...options
            }),
        setDefaultContext: (ctx)=>{
            defaultContext = {
                ...ctx
            };
        },
        clearDefaultContext: ()=>{
            defaultContext = {};
        },
        apiRequest: (method, path, status, durationMs, extra)=>{
            const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
            __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__[level](`API ${method} ${path} → ${status} (${durationMs}ms)`, baseOptions, {
                method,
                path,
                status,
                durationMs,
                ...defaultContext,
                ...extra
            });
        }
    };
}
function logApiRequest(params) {
    const level = params.statusCode >= 500 ? 'error' : params.statusCode >= 400 ? 'warn' : 'info';
    const metadata = {
        method: params.method,
        path: params.path,
        statusCode: params.statusCode,
        durationMs: params.durationMs
    };
    if (params.error) {
        metadata.error = params.error;
    }
    __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__[level](`${params.method} ${params.path} → ${params.statusCode}`, {
        service: params.module || 'api',
        userId: params.userId,
        requestId: params.requestId || params.traceId
    }, metadata);
}
function logBusinessEvent(params) {
    __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__.info(`Business event: ${params.event}`, {
        service: params.module,
        userId: params.userId,
        requestId: params.requestId || params.traceId
    }, {
        event: params.event,
        ...defaultContext,
        ...params.metadata
    });
}
// ===== DEFAULT EXPORT =====
const observabilityLogger = {
    debug,
    info,
    warn,
    error,
    fatal,
    createLogger,
    createModuleLogger,
    logApiRequest,
    logBusinessEvent,
    withDuration,
    PerfTimer,
    setDefaultContext,
    clearDefaultContext,
    getDefaultContext
};
const logger = observabilityLogger;
const __TURBOPACK__default__export__ = observabilityLogger;
}),
"[project]/src/lib/db.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SLOW_QUERY_THRESHOLD_MS",
    ()=>SLOW_QUERY_THRESHOLD_MS,
    "db",
    ()=>db,
    "dbMonitor",
    ()=>dbMonitor,
    "getConnectionPoolStats",
    ()=>getConnectionPoolStats
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Prisma Client with Query Monitoring
// Phase 11: Observability Infrastructure
//
// Extends the Prisma client with:
// - Slow query logging (>100ms)
// - Query count tracking per request
// - Query timing metrics
// - Connection pool monitoring
//
// FC (Aliyun Function Compute) SUPPORT:
//   FC has a READ-ONLY filesystem except for /tmp. SQLite needs write
//   access to the DB file AND its directory (for journal/WAL files).
//   On startup, if the configured DB path is not writable, we copy the
//   bundled DB file to /tmp/custom.db and redirect DATABASE_URL there.
//   This preserves existing users/sessions across requests within the
//   same FC instance lifecycle.
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client__$5b$external$5d$__$2840$prisma$2f$client$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__ = __turbopack_context__.i("[externals]/@prisma/client [external] (@prisma/client, cjs, [project]/node_modules/@prisma/client)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$observability$2f$metrics$2d$collector$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/observability/metrics-collector.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$observability$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/observability/logger.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/fs [external] (fs, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/path [external] (path, cjs)");
;
;
;
;
;
// ===== FC READ-ONLY FILESYSTEM WORKAROUND =====
/**
 * Ensure the SQLite database is on a writable filesystem.
 *
 * On Aliyun FC, the deployment directory is read-only. SQLite needs
 * write access to the DB file AND its directory (for journal files).
 * If the configured DB path is not writable, copy the bundled DB to
 * /tmp/custom.db and redirect DATABASE_URL there.
 *
 * This runs once at module load time, BEFORE PrismaClient is created.
 */ function ensureWritableDatabasePath() {
    const rawUrl = process.env.DATABASE_URL || 'file:/home/z/my-project/db/custom.db';
    // Only handle SQLite file: URLs
    if (!rawUrl.startsWith('file:')) {
        return;
    }
    // Extract the file path from the file: URL
    // file:/home/z/my-project/db/custom.db → /home/z/my-project/db/custom.db
    let dbPath = rawUrl.replace(/^file:/, '');
    // Handle file:./relative paths
    if (dbPath.startsWith('./')) {
        dbPath = __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["resolve"](process.cwd(), dbPath);
    }
    const dbDir = __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["dirname"](dbPath);
    // ROOT-CAUSE FIX (Sep 2026): a missing db/ DIRECTORY (workspace restore
    // artifact) used to be treated as "read-only filesystem" and silently
    // redirected the app to an empty /tmp/custom.db → Prisma P2021 → OTP 500,
    // sessions invalidated, subscription "Free". Only fall back to /tmp when
    // the filesystem is GENUINELY read-only; if the directory is merely
    // missing on a writable FS, recreate it and keep the real DB path.
    try {
        if (!__TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["existsSync"](dbDir)) {
            __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["mkdirSync"](dbDir, {
                recursive: true
            });
            console.log(`[DB] Recreated missing database directory: ${dbDir}`);
        }
    } catch  {
    // Directory creation failed — likely a genuinely read-only filesystem
    // (e.g. Aliyun FC). The probe below will redirect to /tmp as before.
    }
    // Check if the DB directory is writable by trying to write a temp file
    let dirWritable = false;
    try {
        const probeFile = __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["join"](dbDir, `.probe-${Date.now()}.tmp`);
        __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["writeFileSync"](probeFile, '1');
        __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["unlinkSync"](probeFile);
        dirWritable = true;
    } catch  {
        dirWritable = false;
    }
    if (dirWritable) {
        // Original path is writable — nothing to do
        return;
    }
    // Directory is NOT writable (FC read-only filesystem).
    // Copy the DB file to /tmp (writable on FC) and redirect DATABASE_URL.
    const tmpDir = '/tmp';
    const tmpDbPath = __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["join"](tmpDir, 'custom.db');
    try {
        // Ensure /tmp exists
        if (!__TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["existsSync"](tmpDir)) {
            __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["mkdirSync"](tmpDir, {
                recursive: true
            });
        }
        // If /tmp/custom.db already exists (from a previous warm invocation
        // of this FC instance), reuse it — it has the latest data.
        if (__TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["existsSync"](tmpDbPath)) {
            process.env.DATABASE_URL = `file:${tmpDbPath}`;
            // Only log once per process
            if (!process.env.__DB_REDIRECTED_TO_TMP) {
                process.env.__DB_REDIRECTED_TO_TMP = '1';
                console.log(`[DB] Reusing existing /tmp DB: ${tmpDbPath}`);
            }
            return;
        }
        // First cold start: copy bundled DB to /tmp
        if (__TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["existsSync"](dbPath)) {
            __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["copyFileSync"](dbPath, tmpDbPath);
            process.env.DATABASE_URL = `file:${tmpDbPath}`;
            console.log(`[DB] Copied bundled DB from ${dbPath} to ${tmpDbPath} (FC read-only workaround)`);
        } else {
            // Bundled DB doesn't exist — /tmp/custom.db will be created by Prisma
            // on first query. Tables must be created via `prisma db push`.
            process.env.DATABASE_URL = `file:${tmpDbPath}`;
            console.log(`[DB] Bundled DB not found at ${dbPath}. Using fresh DB at ${tmpDbPath}.`);
            console.log(`[DB] WARNING: DB will be empty. Run prisma db push to create tables.`);
        }
    } catch (err) {
        console.error(`[DB] Failed to set up writable DB path:`, err);
    // Keep original DATABASE_URL — Prisma will fail with a clear error
    }
}
// Run the FC workaround BEFORE creating PrismaClient
ensureWritableDatabasePath();
const MAX_SLOW_QUERY_LOG = 50;
const SLOW_QUERY_THRESHOLD_MS = 100;
// Per-request query tracking (using AsyncLocalStorage pattern via global state)
let currentRequestQueryCount = 0;
class DbMonitor {
    stats = {
        totalQueries: 0,
        slowQueries: 0,
        totalDurationMs: 0,
        queriesByOperation: new Map(),
        recentSlowQueries: []
    };
    startTime;
    constructor(){
        this.startTime = Date.now();
    }
    recordQuery(durationMs, query) {
        this.stats.totalQueries++;
        this.stats.totalDurationMs += durationMs;
        // Extract operation type from query (e.g., "SELECT", "INSERT", "UPDATE", "DELETE")
        const operation = this.extractOperation(query);
        const opStats = this.stats.queriesByOperation.get(operation) || {
            count: 0,
            totalDurationMs: 0
        };
        opStats.count++;
        opStats.totalDurationMs += durationMs;
        this.stats.queriesByOperation.set(operation, opStats);
        // Track slow queries
        if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
            this.stats.slowQueries++;
            this.stats.recentSlowQueries.push({
                query: query.substring(0, 200),
                durationMs: Math.round(durationMs * 100) / 100,
                timestamp: new Date().toISOString()
            });
            if (this.stats.recentSlowQueries.length > MAX_SLOW_QUERY_LOG) {
                this.stats.recentSlowQueries.shift();
            }
            __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$observability$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["logger"].warn(`Slow DB query detected (${durationMs.toFixed(2)}ms)`, undefined, {
                operation,
                duration: durationMs,
                queryPreview: query.substring(0, 100)
            });
        }
        // Record to Prometheus metrics
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$observability$2f$metrics$2d$collector$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["metricsCollector"].observeHistogram('db_query_duration_seconds', {
            operation
        }, durationMs / 1000);
    }
    incrementRequestQueryCount() {
        currentRequestQueryCount++;
    }
    getRequestQueryCount() {
        return currentRequestQueryCount;
    }
    resetRequestQueryCount() {
        currentRequestQueryCount = 0;
    }
    getStats() {
        return {
            ...this.stats,
            avgQueryTimeMs: this.stats.totalQueries > 0 ? this.stats.totalDurationMs / this.stats.totalQueries : 0,
            uptime: Date.now() - this.startTime,
            queriesByOperation: new Map(this.stats.queriesByOperation)
        };
    }
    getRecentSlowQueries(count = 20) {
        return this.stats.recentSlowQueries.slice(-count);
    }
    getQueryCountByOperation() {
        const result = {};
        for (const [op, stats] of this.stats.queriesByOperation){
            result[op] = {
                count: stats.count,
                avgMs: stats.count > 0 ? stats.totalDurationMs / stats.count : 0
            };
        }
        return result;
    }
    extractOperation(query) {
        const trimmed = query.trim().toUpperCase();
        if (trimmed.startsWith('SELECT')) return 'SELECT';
        if (trimmed.startsWith('INSERT')) return 'INSERT';
        if (trimmed.startsWith('UPDATE')) return 'UPDATE';
        if (trimmed.startsWith('DELETE')) return 'DELETE';
        if (trimmed.startsWith('CREATE')) return 'CREATE';
        if (trimmed.startsWith('ALTER')) return 'ALTER';
        if (trimmed.startsWith('PRAGMA')) return 'PRAGMA';
        return 'OTHER';
    }
}
const dbMonitor = new DbMonitor();
// ===== PRISMA CLIENT SETUP =====
const globalForPrisma = globalThis;
// Bump this version when schema changes to force new Prisma client
const PRISMA_VERSION = 9;
// Force new client if version mismatch (schema changes)
if (globalForPrisma.__prismaVersion !== PRISMA_VERSION) {
    if (globalForPrisma.prisma) {
        globalForPrisma.prisma.$disconnect().catch(()=>{});
    }
    globalForPrisma.prisma = undefined;
    globalForPrisma.__prismaVersion = PRISMA_VERSION;
}
const db = globalForPrisma.prisma ?? new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client__$5b$external$5d$__$2840$prisma$2f$client$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["PrismaClient"]({
    log: [
        {
            emit: 'event',
            level: 'query'
        },
        {
            emit: 'event',
            level: 'error'
        },
        {
            emit: 'event',
            level: 'warn'
        }
    ]
});
// Set up query event listeners for monitoring
if (!globalForPrisma.prisma) {
    db.$on('query', (e)=>{
        const durationMs = e.duration;
        dbMonitor.recordQuery(durationMs, e.query);
        dbMonitor.incrementRequestQueryCount();
    });
    db.$on('error', (e)=>{
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$observability$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["logger"].error('Prisma error event', undefined, {
            error: new Error(e.message)
        });
    });
    db.$on('warn', (e)=>{
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$observability$2f$logger$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["logger"].warn('Prisma warning', undefined, {
            message: e.message
        });
    });
}
if ("TURBOPACK compile-time truthy", 1) globalForPrisma.prisma = db;
if ("TURBOPACK compile-time truthy", 1) globalForPrisma.__dbMonitor = dbMonitor;
function getConnectionPoolStats() {
    // For SQLite, we report basic stats
    // In production with PostgreSQL/MySQL, this would use $queryRaw
    return {
        activeConnections: 1,
        idleConnections: 0,
        totalConnections: 1,
        waitingCount: 0
    };
}
;
}),
"[project]/src/lib/billing-audit.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getBillingAuditHistory",
    ()=>getBillingAuditHistory,
    "logBillingEvent",
    ()=>logBillingEvent,
    "logCouponEvent",
    ()=>logCouponEvent,
    "logCreditEvent",
    ()=>logCreditEvent,
    "logEntitlementEvent",
    ()=>logEntitlementEvent,
    "logPaymentEvent",
    ()=>logPaymentEvent,
    "logSubscriptionEvent",
    ()=>logSubscriptionEvent,
    "logTrialEvent",
    ()=>logTrialEvent
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Dedicated Billing Audit Logging
// Phase 4: Subscription System + Credits Engine + Plan Gates + Billing
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [instrumentation] (ecmascript)");
;
async function logBillingEvent(params) {
    try {
        const details = params.metadata ? JSON.stringify({
            ...params.details ? {
                description: params.details
            } : {},
            ...params.metadata
        }) : params.details || null;
        const auditLog = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].auditLog.create({
            data: {
                userId: params.userId,
                action: params.action,
                details,
                ipAddress: params.ipAddress || null,
                userAgent: params.userAgent || null,
                resource: 'billing',
                resourceId: params.resourceId || null
            }
        });
        return {
            success: true,
            auditLogId: auditLog.id
        };
    } catch (error) {
        // Never fail the main flow due to audit logging failure
        console.error('[BillingAudit] Failed to log billing event:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
async function logTrialEvent(userId, action, metadata) {
    await logBillingEvent({
        userId,
        action,
        details: `Trial event: ${action}`,
        metadata
    });
}
async function logCreditEvent(userId, action, metadata) {
    await logBillingEvent({
        userId,
        action,
        details: `Credit operation: ${action} — amount: ${metadata.amount}`,
        resourceId: metadata.referenceId,
        metadata
    });
}
async function logSubscriptionEvent(userId, action, metadata) {
    await logBillingEvent({
        userId,
        action,
        details: `Subscription event: ${action}`,
        metadata
    });
}
async function logEntitlementEvent(userId, action, metadata) {
    await logBillingEvent({
        userId,
        action,
        details: `Entitlement event: ${action} — feature: ${metadata.feature}`,
        metadata
    });
}
async function logCouponEvent(userId, action, metadata) {
    await logBillingEvent({
        userId,
        action,
        details: `Coupon event: ${action} — code: ${metadata.code}`,
        metadata
    });
}
async function logPaymentEvent(userId, action, metadata) {
    await logBillingEvent({
        userId,
        action,
        resourceId: metadata.paymentOrderId,
        details: `Payment event: ${action} — amount: ${metadata.amount} ${metadata.currency}`,
        metadata
    });
}
async function getBillingAuditHistory(userId, options) {
    try {
        const where = {
            userId,
            resource: 'billing'
        };
        if (options?.action) {
            where.action = options.action;
        }
        if (options?.startDate || options?.endDate) {
            const createdAt = {};
            if (options.startDate) createdAt.gte = options.startDate;
            if (options.endDate) createdAt.lte = options.endDate;
            where.createdAt = createdAt;
        }
        const [events, total] = await Promise.all([
            __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].auditLog.findMany({
                where,
                orderBy: {
                    createdAt: 'desc'
                },
                take: options?.limit || 50,
                skip: options?.offset || 0,
                select: {
                    id: true,
                    action: true,
                    details: true,
                    createdAt: true,
                    resourceId: true
                }
            }),
            __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].auditLog.count({
                where
            })
        ]);
        return {
            events,
            total
        };
    } catch (error) {
        console.error('[BillingAudit] Failed to get billing audit history:', error);
        return {
            events: [],
            total: 0
        };
    }
}
}),
"[project]/src/lib/realtime-event-bus.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * AcquisitionOS — Realtime Event Bus Service
 * Central event bus for all realtime events with pub/sub, deduplication, and replay support.
 * Phase 11: Realtime Remediation
 */ // ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════
__turbopack_context__.s([
    "deduplicateEvent",
    ()=>deduplicateEvent,
    "getEventBusStats",
    ()=>getEventBusStats,
    "getEventHistory",
    ()=>getEventHistory,
    "publishEvent",
    ()=>publishEvent,
    "replayEvents",
    ()=>replayEvents,
    "subscribeToChannel",
    ()=>subscribeToChannel,
    "unsubscribeFromChannel",
    ()=>unsubscribeFromChannel
]);
// ═══════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════
const MAX_REPLAY_STORE_PER_CHANNEL = 500;
const MAX_QUEUE_SIZE = 10000;
const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes dedup window
// ═══════════════════════════════════════════════════════════════════
// Event Bus State
// ═══════════════════════════════════════════════════════════════════
const subscriptions = new Map();
const replayStore = new Map();
const dedupCache = new Map(); // eventId -> timestamp
const pendingQueue = [];
let subscriptionCounter = 0;
// Initialize replay store for each channel
const CHANNELS = [
    'lead_events',
    'payment_events',
    'notification_events',
    'message_events',
    'workflow_events',
    'ai_events'
];
for (const ch of CHANNELS){
    replayStore.set(ch, []);
}
function deduplicateEvent(eventId) {
    const now = Date.now();
    // Clean up expired entries
    for (const [id, ts] of dedupCache.entries()){
        if (now - ts > DEDUP_TTL_MS) {
            dedupCache.delete(id);
        }
    }
    if (dedupCache.has(eventId)) {
        return true; // duplicate
    }
    dedupCache.set(eventId, now);
    return false;
}
async function publishEvent(event) {
    const fullEvent = {
        ...event,
        id: event.id || generateEventId(),
        timestamp: Date.now()
    };
    // Deduplicate
    if (deduplicateEvent(fullEvent.id)) {
        return {
            published: false,
            reason: 'duplicate',
            eventId: fullEvent.id
        };
    }
    // Backpressure: check queue overflow
    if (pendingQueue.length >= MAX_QUEUE_SIZE) {
        // Drop oldest non-critical event
        const oldestIdx = pendingQueue.findIndex((e)=>!e.critical);
        if (oldestIdx >= 0) {
            pendingQueue.splice(oldestIdx, 1);
        } else {
            return {
                published: false,
                reason: 'queue_full',
                eventId: fullEvent.id
            };
        }
    }
    // Store for replay
    const channelEvents = replayStore.get(fullEvent.channel);
    if (channelEvents) {
        channelEvents.push(fullEvent);
        // Trim to max size
        if (channelEvents.length > MAX_REPLAY_STORE_PER_CHANNEL) {
            channelEvents.splice(0, channelEvents.length - MAX_REPLAY_STORE_PER_CHANNEL);
        }
    }
    // Queue for delivery
    pendingQueue.push(fullEvent);
    // Deliver to subscribers synchronously (non-blocking)
    deliverToSubscribers(fullEvent);
    return {
        published: true,
        eventId: fullEvent.id
    };
}
function subscribeToChannel(channel, handler, filter) {
    const subId = `sub_${++subscriptionCounter}_${Date.now()}`;
    subscriptions.set(subId, {
        id: subId,
        channel,
        handler,
        filter
    });
    return subId;
}
function unsubscribeFromChannel(subscriptionId) {
    return subscriptions.delete(subscriptionId);
}
function replayEvents(channel, options) {
    let events = replayStore.get(channel) || [];
    if (options?.sinceTimestamp) {
        events = events.filter((e)=>e.timestamp >= options.sinceTimestamp);
    }
    if (options?.userId) {
        events = events.filter((e)=>e.userId === options.userId || !e.userId);
    }
    if (options?.orgId) {
        events = events.filter((e)=>e.orgId === options.orgId || !e.orgId);
    }
    if (options?.limit) {
        events = events.slice(-options.limit);
    }
    return events.sort((a, b)=>a.timestamp - b.timestamp);
}
function getEventHistory(channel, limit) {
    return replayEvents(channel, {
        limit
    });
}
// ═══════════════════════════════════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════════════════════════════════
function deliverToSubscribers(event) {
    for (const sub of subscriptions.values()){
        if (sub.channel !== event.channel) continue;
        if (sub.filter && !sub.filter(event)) continue;
        // Fire and forget — errors caught internally
        try {
            const result = sub.handler(event);
            if (result instanceof Promise) {
                result.catch((err)=>{
                    console.error(`[EventBus] Subscriber ${sub.id} error:`, err);
                });
            }
        } catch (err) {
            console.error(`[EventBus] Subscriber ${sub.id} sync error:`, err);
        }
    }
    // Remove from pending queue
    const idx = pendingQueue.indexOf(event);
    if (idx >= 0) {
        pendingQueue.splice(idx, 1);
    }
}
function generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
function getEventBusStats() {
    const byChannel = {};
    for (const sub of subscriptions.values()){
        byChannel[sub.channel] = (byChannel[sub.channel] || 0) + 1;
    }
    const storeSizes = {};
    for (const [ch, events] of replayStore.entries()){
        storeSizes[ch] = events.length;
    }
    return {
        totalSubscriptions: subscriptions.size,
        subscriptionsByChannel: byChannel,
        replayStoreSizes: storeSizes,
        pendingQueueSize: pendingQueue.length,
        dedupCacheSize: dedupCache.size
    };
}
}),
"[project]/src/lib/notification-service.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "cleanupOldNotifications",
    ()=>cleanupOldNotifications,
    "createNotification",
    ()=>createNotification,
    "createNotificationOnce",
    ()=>createNotificationOnce,
    "getUnreadCount",
    ()=>getUnreadCount,
    "markAllRead",
    ()=>markAllRead,
    "notifyChargebackReceived",
    ()=>notifyChargebackReceived,
    "notifyCreditAssigned",
    ()=>notifyCreditAssigned,
    "notifyCreditLow",
    ()=>notifyCreditLow,
    "notifyPaymentFailure",
    ()=>notifyPaymentFailure,
    "notifyPaymentSuccess",
    ()=>notifyPaymentSuccess,
    "notifyRefundProcessed",
    ()=>notifyRefundProcessed,
    "notifySubscriptionCancelling",
    ()=>notifySubscriptionCancelling,
    "notifySubscriptionExpired",
    ()=>notifySubscriptionExpired,
    "notifySubscriptionRenewed",
    ()=>notifySubscriptionRenewed,
    "notifyUser",
    ()=>notifyUser,
    "notifyUsers",
    ()=>notifyUsers,
    "publishNotificationCreated",
    ()=>publishNotificationCreated
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Notification Service
// Helper functions for creating notifications from other API routes
// and system processes.
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$realtime$2d$event$2d$bus$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/realtime-event-bus.ts [instrumentation] (ecmascript)");
;
;
function publishNotificationCreated(notification) {
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$realtime$2d$event$2d$bus$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["publishEvent"])({
        channel: 'notification_events',
        eventType: 'notification_created',
        payload: {
            id: notification.id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            read: notification.read,
            actionUrl: notification.actionUrl ?? null,
            metadata: notification.metadata ?? null,
            createdAt: notification.createdAt
        },
        userId: notification.userId
    }).catch(()=>{
    // Swallow — SSE delivery is best-effort; polling is the fallback.
    });
}
// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const VALID_NOTIFICATION_TYPES = new Set([
    // CRM & Lead
    'deal_won',
    'lead_reply',
    'analysis',
    'stage_advanced',
    // Payment
    'payment_success',
    'payment_failure',
    'refund_processed',
    'chargeback_received',
    // Subscription
    'subscription_renewed',
    'subscription_cancelling',
    'subscription_expired',
    // Credit
    'credit_assigned',
    'credit_low',
    // General
    'payment',
    'team_invite',
    'system'
]);
async function createNotification(params) {
    const { userId, type, title, message, actionUrl, metadata, deliveredVia } = params;
    // Validate notification type
    if (!VALID_NOTIFICATION_TYPES.has(type)) {
        console.warn(`[notification-service] Unknown notification type "${type}". ` + `Valid types: ${[
            ...VALID_NOTIFICATION_TYPES
        ].join(', ')}. Creating anyway.`);
    }
    try {
        const notification = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].notification.create({
            data: {
                userId,
                type,
                title,
                message,
                actionUrl: actionUrl || null,
                metadata: metadata ? JSON.stringify(metadata) : null,
                deliveredVia: deliveredVia || 'in_app'
            }
        });
        // Real-time: push to SSE subscribers (fire-and-forget, best-effort).
        publishNotificationCreated(notification);
        return {
            id: notification.id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            read: notification.read,
            actionUrl: notification.actionUrl,
            createdAt: notification.createdAt
        };
    } catch (error) {
        console.error('[notification-service] Failed to create notification:', error);
        // Don't throw — notification creation should never break the caller's flow
        return null;
    }
}
async function createNotificationOnce(params) {
    const { dedupeKey, dedupeWindowMinutes, ...rest } = params;
    if (dedupeKey) {
        try {
            const existing = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].notification.findFirst({
                where: {
                    userId: rest.userId,
                    metadata: {
                        contains: `"dedupeKey":"${dedupeKey}"`
                    },
                    ...dedupeWindowMinutes ? {
                        createdAt: {
                            gte: new Date(Date.now() - dedupeWindowMinutes * 60 * 1000)
                        }
                    } : {}
                },
                select: {
                    id: true
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });
            if (existing) {
                return {
                    id: existing.id,
                    duplicate: true
                };
            }
        } catch (error) {
            // Lookup failure must never block notification creation.
            console.error('[notification-service] dedupe lookup failed:', error);
        }
    }
    const metadata = {
        ...rest.metadata || {}
    };
    if (dedupeKey) metadata.dedupeKey = dedupeKey;
    const created = await createNotification({
        ...rest,
        metadata
    });
    return {
        id: created?.id ?? null,
        duplicate: false
    };
}
async function notifyUser(userId, type, title, message, actionUrl) {
    return createNotification({
        userId,
        type,
        title,
        message,
        actionUrl
    });
}
async function notifyUsers(userIds, type, title, message, actionUrl) {
    const results = await Promise.allSettled(userIds.map((userId)=>createNotification({
            userId,
            type,
            title,
            message,
            actionUrl
        })));
    const succeeded = results.filter((r)=>r.status === 'fulfilled' && r.value !== null).length;
    const failed = results.length - succeeded;
    if (failed > 0) {
        console.warn(`[notification-service] notifyUsers: ${failed}/${results.length} notifications failed`);
    }
    return {
        total: results.length,
        succeeded,
        failed
    };
}
async function getUnreadCount(userId) {
    return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].notification.count({
        where: {
            userId,
            read: false
        }
    });
}
async function markAllRead(userId) {
    const result = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].notification.updateMany({
        where: {
            userId,
            read: false
        },
        data: {
            read: true
        }
    });
    return result.count;
}
async function notifyPaymentSuccess(params) {
    const { userId, plan, amount, currency = 'usd', creditsAdded, invoiceNumber, isRenewal, orderId } = params;
    const formattedAmount = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency
    }).format(amount);
    const title = isRenewal ? 'Renewal Payment Successful' : 'Payment Successful';
    const message = isRenewal ? `Your ${plan} plan subscription has been renewed. ${formattedAmount} has been charged.${creditsAdded ? ` ${creditsAdded} credits reset for the new billing period.` : ''}` : `Your ${plan} plan subscription is now active! ${formattedAmount} charged.${creditsAdded ? ` ${creditsAdded} credits have been added.` : ''}`;
    return createNotification({
        userId,
        type: 'payment_success',
        title,
        message,
        actionUrl: '/dashboard',
        metadata: {
            amount,
            currency,
            plan,
            creditsAdded: creditsAdded ?? null,
            invoiceNumber: invoiceNumber ?? null,
            isRenewal: isRenewal ?? false,
            orderId: orderId ?? null
        }
    });
}
async function notifyPaymentFailure(params) {
    const { userId, plan, reason, amount, currency = 'usd', invoiceNumber } = params;
    const formattedAmount = amount ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency
    }).format(amount) : null;
    const message = reason === 'Checkout session expired' ? `Your checkout session for the ${plan} plan has expired. Please try again.` : `We were unable to process your ${plan} plan payment.${formattedAmount ? ` Amount: ${formattedAmount}.` : ''} Please update your payment method to avoid service interruption.`;
    return createNotification({
        userId,
        type: 'payment_failure',
        title: 'Payment Failed',
        message,
        actionUrl: '/dashboard',
        metadata: {
            plan,
            reason: reason ?? null,
            amount: amount ?? null,
            currency,
            invoiceNumber: invoiceNumber ?? null
        }
    });
}
async function notifySubscriptionRenewed(params) {
    const { userId, plan, amount, currency = 'usd', creditsReset, nextBillingDate, invoiceNumber } = params;
    const formattedAmount = amount ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency
    }).format(amount) : null;
    const message = `Your ${plan} plan subscription has been renewed.${formattedAmount ? ` ${formattedAmount} charged.` : ''}${creditsReset ? ` ${creditsReset} credits available for the new billing period.` : ''}${nextBillingDate ? ` Next billing date: ${nextBillingDate}.` : ''}`;
    return createNotification({
        userId,
        type: 'subscription_renewed',
        title: 'Subscription Renewed',
        message,
        actionUrl: '/dashboard',
        metadata: {
            plan,
            amount: amount ?? null,
            currency,
            creditsReset: creditsReset ?? null,
            nextBillingDate: nextBillingDate ?? null,
            invoiceNumber: invoiceNumber ?? null
        }
    });
}
async function notifyRefundProcessed(params) {
    const { userId, plan, refundAmount, currency = 'usd', isFullRefund, orderId } = params;
    const formattedAmount = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency
    }).format(refundAmount);
    const message = isFullRefund ? `A full refund of ${formattedAmount} has been processed for your ${plan} plan subscription. Your account has been downgraded to the free plan.` : `A partial refund of ${formattedAmount} has been processed for your ${plan} plan.`;
    return createNotification({
        userId,
        type: 'refund_processed',
        title: 'Refund Processed',
        message,
        actionUrl: '/dashboard',
        metadata: {
            plan,
            refundAmount,
            currency,
            isFullRefund,
            orderId: orderId ?? null
        }
    });
}
async function notifyChargebackReceived(params) {
    const { userId, plan, amount, currency = 'usd', reason, chargebackId } = params;
    const formattedAmount = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency
    }).format(amount);
    const message = `A chargeback of ${formattedAmount} has been received for your ${plan} plan subscription.${reason ? ` Reason: ${reason}.` : ''} Your account may be reviewed. Please contact support if you have questions.`;
    return createNotification({
        userId,
        type: 'chargeback_received',
        title: 'Chargeback Received',
        message,
        actionUrl: '/dashboard',
        metadata: {
            plan,
            amount,
            currency,
            reason: reason ?? null,
            chargebackId: chargebackId ?? null
        }
    });
}
async function notifyCreditAssigned(params) {
    const { userId, credits, newBalance, source, description } = params;
    const message = `${credits} credits have been added to your account from ${source}. Your new balance is ${newBalance} credits.${description ? ` ${description}` : ''}`;
    return createNotification({
        userId,
        type: 'credit_assigned',
        title: 'Credits Added',
        message,
        actionUrl: '/dashboard',
        metadata: {
            credits,
            newBalance,
            source,
            description: description ?? null
        }
    });
}
async function notifyCreditLow(params) {
    const { userId, currentCredits, monthlyCredits, plan, usagePercent } = params;
    const pct = usagePercent ?? Math.round((monthlyCredits - currentCredits) / monthlyCredits * 100);
    const message = `You're running low on credits. ${currentCredits} of ${monthlyCredits} credits remaining on your ${plan} plan (${pct}% used). Consider upgrading for more credits.`;
    return createNotification({
        userId,
        type: 'credit_low',
        title: 'Credits Running Low',
        message,
        actionUrl: '/dashboard',
        metadata: {
            currentCredits,
            monthlyCredits,
            plan,
            usagePercent: pct
        }
    });
}
async function notifySubscriptionCancelling(params) {
    const { userId, plan, endDate } = params;
    const message = `Your ${plan} plan subscription is scheduled to cancel on ${endDate}. You can reactivate it anytime before then to keep your current plan and data.`;
    return createNotification({
        userId,
        type: 'subscription_cancelling',
        title: 'Subscription Cancellation Scheduled',
        message,
        actionUrl: '/dashboard',
        metadata: {
            plan,
            endDate
        }
    });
}
async function notifySubscriptionExpired(params) {
    const { userId, previousPlan, reason } = params;
    const message = `Your ${previousPlan} plan subscription has expired. Your account has been downgraded to the free plan.${reason === 'chargeback' ? ' This was due to a chargeback.' : reason ? ` Reason: ${reason}.` : ''}`;
    return createNotification({
        userId,
        type: 'subscription_expired',
        title: 'Subscription Expired',
        message,
        actionUrl: '/dashboard',
        metadata: {
            previousPlan,
            reason: reason ?? null
        }
    });
}
async function cleanupOldNotifications(userId, olderThanDays = 90) {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].notification.deleteMany({
        where: {
            userId,
            read: true,
            createdAt: {
                lt: cutoffDate
            }
        }
    });
    return result.count;
}
}),
"[project]/src/lib/entitlement-service.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ENTITLEMENTS",
    ()=>ENTITLEMENTS,
    "PLAN_CREDITS",
    ()=>PLAN_CREDITS,
    "canPerformAction",
    ()=>canPerformAction,
    "checkEntitlement",
    ()=>checkEntitlement,
    "comparePlans",
    ()=>comparePlans,
    "getDisabledFeatures",
    ()=>getDisabledFeatures,
    "getEnabledFeatures",
    ()=>getEnabledFeatures,
    "getEntitlements",
    ()=>getEntitlements,
    "getEntitlementsFromDB",
    ()=>getEntitlementsFromDB,
    "getFeatureLimit",
    ()=>getFeatureLimit,
    "getPlanChangeDirection",
    ()=>getPlanChangeDirection,
    "getPlanLevel",
    ()=>getPlanLevel,
    "getUpgradeRequiredPlan",
    ()=>getUpgradeRequiredPlan,
    "hasFeatureAccess",
    ()=>hasFeatureAccess,
    "isValidPlanChange",
    ()=>isValidPlanChange,
    "requireFeatureAccess",
    ()=>requireFeatureAccess,
    "seedPlanEntitlements",
    ()=>seedPlanEntitlements
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Complete Plan Entitlement System
// Phase 4: Subscription System + Credits Engine + Plan Gates + Billing
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/billing-audit.ts [instrumentation] (ecmascript)");
;
;
const ENTITLEMENTS = {
    free: {
        lead_discovery: {
            limit: 10,
            enabled: true
        },
        deep_analysis: {
            limit: 0,
            enabled: false
        },
        outreach_messages: {
            limit: 50,
            enabled: true
        },
        outreach_sequences: {
            limit: 0,
            enabled: false
        },
        sales_coaching: {
            limit: 0,
            enabled: false
        },
        proposal_generation: {
            limit: 0,
            enabled: false
        },
        competitor_analysis: {
            limit: 0,
            enabled: false
        },
        data_export: {
            limit: 0,
            enabled: false
        },
        gmail_integration: {
            limit: 0,
            enabled: false
        },
        whatsapp_integration: {
            limit: 0,
            enabled: false
        },
        telegram_access: {
            limit: 0,
            enabled: false
        },
        workflow_access: {
            limit: 0,
            enabled: false
        },
        api_access: {
            limit: 0,
            enabled: false
        },
        chatbot_access: {
            limit: 0,
            enabled: false
        },
        team_members: {
            limit: 1,
            enabled: true
        },
        white_label: {
            limit: 0,
            enabled: false
        },
        custom_integrations: {
            limit: 0,
            enabled: false
        },
        // Active Business Profiles (limit applies to ACTIVE profiles only):
        // free=1, starter=1, pro=3, elite=7 — enforced server-side in the
        // profile CRUD routes. Downgrade never deletes profiles; archived and
        // over-limit profiles are preserved read-only.
        business_profiles: {
            limit: 1,
            enabled: true
        },
        // Autopilot (niche-based automated client acquisition): Pro/Elite only.
        // limit = max ACTIVE+RUNNING autopilot workflows (3 for Pro, 7 for Elite).
        // Enforced server-side in /api/autopilot routes — UI hiding is NOT
        // enforcement. Downgrade (DISABLED) never deletes autopilot history.
        autopilot_access: {
            limit: 0,
            enabled: false
        }
    },
    // Starter — basic features only (final pricing/plan update, Sep 2026).
    // Same feature set as Free except the monthly lead limit is 25.
    starter: {
        lead_discovery: {
            limit: 25,
            enabled: true
        },
        deep_analysis: {
            limit: 0,
            enabled: false
        },
        outreach_messages: {
            limit: 50,
            enabled: true
        },
        outreach_sequences: {
            limit: 0,
            enabled: false
        },
        sales_coaching: {
            limit: 0,
            enabled: false
        },
        proposal_generation: {
            limit: 0,
            enabled: false
        },
        competitor_analysis: {
            limit: 0,
            enabled: false
        },
        data_export: {
            limit: 0,
            enabled: false
        },
        gmail_integration: {
            limit: 0,
            enabled: false
        },
        whatsapp_integration: {
            limit: 0,
            enabled: false
        },
        telegram_access: {
            limit: 0,
            enabled: false
        },
        workflow_access: {
            limit: 0,
            enabled: false
        },
        api_access: {
            limit: 0,
            enabled: false
        },
        chatbot_access: {
            limit: 0,
            enabled: false
        },
        team_members: {
            limit: 1,
            enabled: true
        },
        white_label: {
            limit: 0,
            enabled: false
        },
        custom_integrations: {
            limit: 0,
            enabled: false
        },
        business_profiles: {
            limit: 1,
            enabled: true
        },
        autopilot_access: {
            limit: 0,
            enabled: false
        }
    },
    pro: {
        lead_discovery: {
            limit: null,
            enabled: true
        },
        deep_analysis: {
            limit: null,
            enabled: true
        },
        outreach_messages: {
            limit: null,
            enabled: true
        },
        outreach_sequences: {
            limit: null,
            enabled: true
        },
        sales_coaching: {
            limit: null,
            enabled: true
        },
        proposal_generation: {
            limit: null,
            enabled: true
        },
        competitor_analysis: {
            limit: null,
            enabled: true
        },
        data_export: {
            limit: null,
            enabled: true
        },
        gmail_integration: {
            limit: null,
            enabled: true
        },
        whatsapp_integration: {
            limit: 0,
            enabled: false
        },
        telegram_access: {
            limit: 0,
            enabled: false
        },
        workflow_access: {
            limit: null,
            enabled: true
        },
        api_access: {
            limit: null,
            enabled: true
        },
        chatbot_access: {
            limit: null,
            enabled: true
        },
        team_members: {
            limit: 3,
            enabled: true
        },
        white_label: {
            limit: 0,
            enabled: false
        },
        custom_integrations: {
            limit: 0,
            enabled: false
        },
        business_profiles: {
            limit: 3,
            enabled: true
        },
        autopilot_access: {
            limit: 3,
            enabled: true
        }
    },
    elite: {
        lead_discovery: {
            limit: null,
            enabled: true
        },
        deep_analysis: {
            limit: null,
            enabled: true
        },
        outreach_messages: {
            limit: null,
            enabled: true
        },
        outreach_sequences: {
            limit: null,
            enabled: true
        },
        sales_coaching: {
            limit: null,
            enabled: true
        },
        proposal_generation: {
            limit: null,
            enabled: true
        },
        competitor_analysis: {
            limit: null,
            enabled: true
        },
        data_export: {
            limit: null,
            enabled: true
        },
        gmail_integration: {
            limit: null,
            enabled: true
        },
        whatsapp_integration: {
            limit: null,
            enabled: true
        },
        telegram_access: {
            limit: null,
            enabled: true
        },
        workflow_access: {
            limit: null,
            enabled: true
        },
        api_access: {
            limit: null,
            enabled: true
        },
        chatbot_access: {
            limit: null,
            enabled: true
        },
        team_members: {
            limit: 10,
            enabled: true
        },
        white_label: {
            limit: null,
            enabled: true
        },
        custom_integrations: {
            limit: null,
            enabled: true
        },
        business_profiles: {
            limit: 7,
            enabled: true
        },
        autopilot_access: {
            limit: 7,
            enabled: true
        }
    }
};
// Plan hierarchy for comparison
const PLAN_LEVELS = {
    free: 0,
    starter: 1,
    pro: 2,
    elite: 3
};
const PLAN_CREDITS = {
    free: 50,
    starter: 150,
    pro: 750,
    elite: 2000
};
function getEntitlements(plan) {
    const entitlements = ENTITLEMENTS[plan];
    if (!entitlements) {
        return ENTITLEMENTS.free;
    }
    // Return a deep copy to prevent mutation
    return JSON.parse(JSON.stringify(entitlements));
}
function checkEntitlement(plan, feature) {
    const entitlements = ENTITLEMENTS[plan];
    if (!entitlements) return false;
    const entitlement = entitlements[feature];
    return entitlement?.enabled ?? false;
}
function getFeatureLimit(plan, feature) {
    const entitlements = ENTITLEMENTS[plan];
    if (!entitlements) return 0;
    const entitlement = entitlements[feature];
    if (!entitlement || !entitlement.enabled) return 0;
    return entitlement.limit;
}
function hasFeatureAccess(plan, feature) {
    return checkEntitlement(plan, feature);
}
function getPlanLevel(plan) {
    return PLAN_LEVELS[plan] ?? 0;
}
function canPerformAction(plan, action, currentUsage) {
    const entitlement = ENTITLEMENTS[plan]?.[action];
    if (!entitlement) {
        return {
            allowed: false,
            reason: 'Feature not found',
            limit: 0,
            used: currentUsage ?? 0
        };
    }
    if (!entitlement.enabled) {
        return {
            allowed: false,
            reason: `Feature '${action}' is not available on the ${plan} plan`,
            limit: 0,
            used: currentUsage ?? 0
        };
    }
    // If limit is null, it's unlimited
    if (entitlement.limit === null) {
        return {
            allowed: true,
            limit: null,
            used: currentUsage ?? 0
        };
    }
    const used = currentUsage ?? 0;
    if (used >= entitlement.limit) {
        return {
            allowed: false,
            reason: `Usage limit reached for '${action}' on the ${plan} plan (${entitlement.limit})`,
            limit: entitlement.limit,
            used
        };
    }
    return {
        allowed: true,
        limit: entitlement.limit,
        used
    };
}
function getUpgradeRequiredPlan(currentPlan, feature) {
    const planOrder = [
        'free',
        'starter',
        'pro',
        'elite'
    ];
    for (const plan of planOrder){
        if (PLAN_LEVELS[plan] > PLAN_LEVELS[currentPlan] && checkEntitlement(plan, feature)) {
            return plan;
        }
    }
    // Feature might not be available on any plan
    return null;
}
function getDisabledFeatures(plan) {
    const entitlements = ENTITLEMENTS[plan];
    if (!entitlements) return [];
    return Object.keys(entitlements).filter((feature)=>!entitlements[feature].enabled);
}
function getEnabledFeatures(plan) {
    const entitlements = ENTITLEMENTS[plan];
    if (!entitlements) return [];
    return Object.keys(entitlements).filter((feature)=>entitlements[feature].enabled);
}
function comparePlans(basePlan, targetPlan) {
    const baseEntitlements = ENTITLEMENTS[basePlan];
    const targetEntitlements = ENTITLEMENTS[targetPlan];
    const gained = [];
    const lost = [];
    const limitIncreases = [];
    const allFeatures = new Set([
        ...Object.keys(baseEntitlements),
        ...Object.keys(targetEntitlements)
    ]);
    for (const feature of allFeatures){
        const base = baseEntitlements[feature];
        const target = targetEntitlements[feature];
        if (!base?.enabled && target?.enabled) {
            gained.push(feature);
        } else if (base?.enabled && !target?.enabled) {
            lost.push(feature);
        } else if (base?.enabled && target?.enabled) {
            // Both enabled — check if limit increased
            if (target.limit === null && base.limit !== null) {
                limitIncreases.push({
                    feature,
                    from: base.limit,
                    to: null
                });
            } else if (typeof target.limit === 'number' && typeof base.limit === 'number' && target.limit > base.limit) {
                limitIncreases.push({
                    feature,
                    from: base.limit,
                    to: target.limit
                });
            }
        }
    }
    return {
        gained,
        lost,
        limitIncreases
    };
}
function isValidPlanChange(fromPlan, toPlan) {
    return PLAN_LEVELS[fromPlan] !== PLAN_LEVELS[toPlan];
}
function getPlanChangeDirection(fromPlan, toPlan) {
    const fromLevel = PLAN_LEVELS[fromPlan];
    const toLevel = PLAN_LEVELS[toPlan];
    if (toLevel > fromLevel) return 'upgrade';
    if (toLevel < fromLevel) return 'downgrade';
    return 'same';
}
async function requireFeatureAccess(userId, plan, feature, currentUsage) {
    const result = canPerformAction(plan, feature, currentUsage);
    if (!result.allowed) {
        const requiredPlan = getUpgradeRequiredPlan(plan, feature);
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["logEntitlementEvent"])(userId, 'feature_blocked', {
            feature,
            plan,
            reason: result.reason || 'Access denied',
            requiredPlan: requiredPlan || undefined
        });
        return {
            allowed: false,
            reason: result.reason,
            requiredPlan: requiredPlan || undefined
        };
    }
    return {
        allowed: true
    };
}
async function seedPlanEntitlements() {
    let seeded = 0;
    let errors = 0;
    const plans = [
        'free',
        'starter',
        'pro',
        'elite'
    ];
    for (const plan of plans){
        const entitlements = ENTITLEMENTS[plan];
        for (const [feature, config] of Object.entries(entitlements)){
            try {
                await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].planEntitlement.upsert({
                    where: {
                        plan_feature: {
                            plan,
                            feature
                        }
                    },
                    create: {
                        plan,
                        feature,
                        limit: config.limit,
                        enabled: config.enabled
                    },
                    update: {
                        limit: config.limit,
                        enabled: config.enabled
                    }
                });
                seeded++;
            } catch (error) {
                console.error(`[EntitlementService] Failed to seed ${plan}/${feature}:`, error);
                errors++;
            }
        }
    }
    return {
        seeded,
        errors
    };
}
async function getEntitlementsFromDB(plan) {
    try {
        const records = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].planEntitlement.findMany({
            where: {
                plan
            }
        });
        if (records.length === 0) {
            return getEntitlements(plan);
        }
        const result = {};
        for (const record of records){
            result[record.feature] = {
                limit: record.limit,
                enabled: record.enabled
            };
        }
        // Fill in any missing features from the in-memory config
        const defaults = ENTITLEMENTS[plan];
        for (const [feature, config] of Object.entries(defaults)){
            if (!result[feature]) {
                result[feature] = config;
            }
        }
        return result;
    } catch (error) {
        console.error('[EntitlementService] DB query failed, using in-memory config:', error);
        return getEntitlements(plan);
    }
}
}),
"[project]/src/lib/credit-service.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CREDIT_COSTS",
    ()=>CREDIT_COSTS,
    "SIGNUP_REWARD_CREDITS",
    ()=>SIGNUP_REWARD_CREDITS,
    "addCreditAddon",
    ()=>addCreditAddon,
    "addCredits",
    ()=>addCredits,
    "checkCreditSufficiency",
    ()=>checkCreditSufficiency,
    "deductCredits",
    ()=>deductCredits,
    "getActionCost",
    ()=>getActionCost,
    "getAllCreditCosts",
    ()=>getAllCreditCosts,
    "getCreditBalance",
    ()=>getCreditBalance,
    "refundCredits",
    ()=>refundCredits,
    "resetMonthlyCredits",
    ()=>resetMonthlyCredits,
    "rolloverCredits",
    ()=>rolloverCredits
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Complete Credits Engine with Atomic Operations
// Phase 4: Subscription System + Credits Engine + Plan Gates + Billing
//
// CRITICAL RULES:
// - NEVER allow negative credits
// - ALWAYS use Prisma $transaction for atomicity
// - ALWAYS create CreditsLedger entry for every operation
// - ALWAYS log audit event for every credit operation
// - Support idempotency keys to prevent double-deduction
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/billing-audit.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$notification$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/notification-service.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$entitlement$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/entitlement-service.ts [instrumentation] (ecmascript)");
;
;
;
;
const CREDIT_COSTS = {
    lead_discovery: 1,
    deep_analysis: 5,
    outreach_message: 2,
    outreach_sequence: 8,
    sales_coaching: 3,
    proposal_generation: 10,
    competitor_analysis: 8,
    data_export: 5
};
const SIGNUP_REWARD_CREDITS = 50;
async function deductCredits(params) {
    try {
        const { userId, action, cost, referenceId, idempotencyKey } = params;
        // Validate cost
        if (cost <= 0) {
            return {
                success: false,
                newBalance: 0,
                error: 'Cost must be greater than 0'
            };
        }
        // Check idempotency key if provided
        if (idempotencyKey) {
            const existingLedger = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].creditsLedger.findFirst({
                where: {
                    userId,
                    action: `${action}_idempotent_${idempotencyKey}`
                }
            });
            if (existingLedger) {
                // Already processed — return the existing result
                return {
                    success: true,
                    newBalance: existingLedger.balance,
                    ledgerEntryId: existingLedger.id,
                    alreadyProcessed: true
                };
            }
        }
        // Atomic transaction: check balance, deduct, create ledger entry
        const result = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].$transaction(async (tx)=>{
            // Get current user with lock-like behavior (read within transaction)
            const user = await tx.user.findUnique({
                where: {
                    id: userId
                },
                select: {
                    credits: true,
                    plan: true
                }
            });
            if (!user) {
                throw new Error('User not found');
            }
            // Balance check — NEVER allow negative
            if (user.credits < cost) {
                throw new Error(`Insufficient credits: have ${user.credits}, need ${cost}`);
            }
            const newBalance = user.credits - cost;
            // Update user credits
            await tx.user.update({
                where: {
                    id: userId
                },
                data: {
                    credits: newBalance
                }
            });
            // Create ledger entry.
            // NOTE: when an idempotencyKey is provided, the ledger row MUST be written
            // under the same composite action label that the pre-check above looks for
            // (`${action}_idempotent_${idempotencyKey}`). Writing the plain `action` here
            // was the root cause of a double-charge bug: the lookup could never match a
            // real row, so replays/retries deducted again.
            const ledgerAction = idempotencyKey ? `${action}_idempotent_${idempotencyKey}` : action;
            const ledgerEntry = await tx.creditsLedger.create({
                data: {
                    userId,
                    action: ledgerAction,
                    credits: -cost,
                    balance: newBalance,
                    description: `Deducted ${cost} credits for ${action}`,
                    referenceId: referenceId || null
                }
            });
            return {
                newBalance,
                ledgerEntryId: ledgerEntry.id,
                plan: user.plan
            };
        });
        // Log audit event
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["logCreditEvent"])(userId, 'credits_deducted', {
            amount: cost,
            balance: result.newBalance,
            action_type: action,
            referenceId
        });
        // Check for low credit warnings
        if (result.newBalance <= 0) {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["logCreditEvent"])(userId, 'credit_zero', {
                amount: 0,
                balance: 0,
                action_type: action
            });
            // User-facing notification — deduped to one per 12h window so the
            // per-action cadence of deductCredits cannot spam the bell.
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$notification$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["createNotificationOnce"])({
                userId,
                type: 'credit_critical',
                title: 'You are out of credits',
                message: 'Your credit balance has reached zero. Top up your credits or upgrade your plan to keep discovering leads and running workflows.',
                actionUrl: '/business-ai/settings',
                metadata: {
                    balance: 0,
                    action_type: action
                },
                dedupeKey: 'credit_critical',
                dedupeWindowMinutes: 12 * 60
            }).catch(()=>{
            // Never fail the deduction path because of a notification problem
            });
        } else if (result.newBalance <= 10) {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["logCreditEvent"])(userId, 'credit_warning', {
                amount: cost,
                balance: result.newBalance,
                action_type: action
            });
            // User-facing notification — deduped to one per 12h window.
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$notification$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["createNotificationOnce"])({
                userId,
                type: 'credit_low',
                title: 'Credits running low',
                message: `Only ${result.newBalance} credit${result.newBalance === 1 ? '' : 's'} left. Top up soon so your workflows and discovery runs keep going.`,
                actionUrl: '/business-ai/settings',
                metadata: {
                    balance: result.newBalance,
                    action_type: action
                },
                dedupeKey: 'credit_low',
                dedupeWindowMinutes: 12 * 60
            }).catch(()=>{
            // Never fail the deduction path because of a notification problem
            });
        }
        return {
            success: true,
            newBalance: result.newBalance,
            ledgerEntryId: result.ledgerEntryId
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to deduct credits';
        // If it's an insufficient credits error, return structured error
        if (message.includes('Insufficient credits')) {
            return {
                success: false,
                newBalance: 0,
                error: message
            };
        }
        console.error('[CreditService] Failed to deduct credits:', error);
        return {
            success: false,
            newBalance: 0,
            error: 'Failed to deduct credits'
        };
    }
}
async function addCredits(params) {
    try {
        const { userId, amount, source, description, referenceId } = params;
        // Validate amount
        if (amount <= 0) {
            return {
                success: false,
                newBalance: 0,
                error: 'Amount must be greater than 0'
            };
        }
        // Duplicate detection: check for same referenceId + source within 5 minutes
        if (referenceId && source) {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            const duplicate = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].creditsLedger.findFirst({
                where: {
                    userId,
                    action: source,
                    referenceId,
                    createdAt: {
                        gte: fiveMinutesAgo
                    }
                }
            });
            if (duplicate) {
                return {
                    success: true,
                    newBalance: duplicate.balance,
                    ledgerEntryId: duplicate.id,
                    duplicate: true
                };
            }
        }
        // Atomic transaction
        const result = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].$transaction(async (tx)=>{
            const user = await tx.user.findUnique({
                where: {
                    id: userId
                },
                select: {
                    credits: true
                }
            });
            if (!user) {
                throw new Error('User not found');
            }
            const newBalance = user.credits + amount;
            // Update user credits
            await tx.user.update({
                where: {
                    id: userId
                },
                data: {
                    credits: newBalance
                }
            });
            // Create ledger entry
            const ledgerEntry = await tx.creditsLedger.create({
                data: {
                    userId,
                    action: source,
                    credits: amount,
                    balance: newBalance,
                    description: description || `Added ${amount} credits from ${source}`,
                    referenceId: referenceId || null
                }
            });
            return {
                newBalance,
                ledgerEntryId: ledgerEntry.id
            };
        });
        // Log audit event
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["logCreditEvent"])(userId, 'credits_added', {
            amount,
            balance: result.newBalance,
            source,
            referenceId
        });
        return {
            success: true,
            newBalance: result.newBalance,
            ledgerEntryId: result.ledgerEntryId
        };
    } catch (error) {
        console.error('[CreditService] Failed to add credits:', error);
        return {
            success: false,
            newBalance: 0,
            error: 'Failed to add credits'
        };
    }
}
async function rolloverCredits(userId) {
    try {
        const result = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].$transaction(async (tx)=>{
            const user = await tx.user.findUnique({
                where: {
                    id: userId
                },
                select: {
                    credits: true,
                    creditsMonthly: true,
                    rolloverCredits: true,
                    plan: true
                }
            });
            if (!user) {
                throw new Error('User not found');
            }
            const plan = user.plan;
            const planMonthly = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$entitlement$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["PLAN_CREDITS"][plan] || __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$entitlement$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["PLAN_CREDITS"].free;
            // Calculate rollover: unused credits become rollover
            // The "unused" portion is: current credits (which may include old rollover)
            // We only rollover the monthly portion that wasn't used
            const previousBalance = user.credits;
            const rolloverAmount = Math.max(0, previousBalance);
            // Reset to plan's monthly allocation + rollover
            const newMonthly = planMonthly;
            const newCredits = planMonthly + rolloverAmount;
            // Update user
            await tx.user.update({
                where: {
                    id: userId
                },
                data: {
                    credits: newCredits,
                    creditsMonthly: newMonthly,
                    rolloverCredits: rolloverAmount
                }
            });
            // Create ledger entries
            // 1. Rollover credit entry
            if (rolloverAmount > 0) {
                await tx.creditsLedger.create({
                    data: {
                        userId,
                        action: 'rollover_processed',
                        credits: rolloverAmount,
                        balance: newCredits,
                        description: `Rolled over ${rolloverAmount} unused credits from previous period`
                    }
                });
            }
            // 2. Monthly reset entry
            await tx.creditsLedger.create({
                data: {
                    userId,
                    action: 'monthly_reset',
                    credits: newMonthly,
                    balance: newCredits,
                    description: `Monthly credits reset: ${newMonthly} credits for ${plan} plan`
                }
            });
            return {
                rolloverAmount,
                previousBalance,
                newMonthly,
                newCredits
            };
        });
        // Log audit events
        if (result.rolloverAmount > 0) {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["logCreditEvent"])(userId, 'rollover_processed', {
                amount: result.rolloverAmount,
                balance: result.newCredits,
                source: 'monthly_rollover'
            });
        }
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["logCreditEvent"])(userId, 'monthly_reset', {
            amount: result.newMonthly,
            balance: result.newCredits,
            source: 'monthly_reset'
        });
        return {
            success: true,
            rolloverAmount: result.rolloverAmount,
            previousBalance: result.previousBalance,
            newMonthly: result.newMonthly
        };
    } catch (error) {
        console.error('[CreditService] Failed to rollover credits:', error);
        return {
            success: false,
            rolloverAmount: 0,
            previousBalance: 0,
            newMonthly: 0,
            error: 'Failed to rollover credits'
        };
    }
}
async function resetMonthlyCredits(userId, plan) {
    try {
        const planCredits = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$entitlement$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["PLAN_CREDITS"][plan] || __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$entitlement$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["PLAN_CREDITS"].free;
        const result = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].$transaction(async (tx)=>{
            const user = await tx.user.findUnique({
                where: {
                    id: userId
                },
                select: {
                    credits: true,
                    rolloverCredits: true
                }
            });
            if (!user) {
                throw new Error('User not found');
            }
            const previousCredits = user.credits;
            // Preserve rollover credits, reset monthly portion
            const newCredits = planCredits + (user.rolloverCredits || 0);
            await tx.user.update({
                where: {
                    id: userId
                },
                data: {
                    credits: newCredits,
                    creditsMonthly: planCredits
                }
            });
            // Create ledger entry
            await tx.creditsLedger.create({
                data: {
                    userId,
                    action: 'monthly_reset',
                    credits: planCredits,
                    balance: newCredits,
                    description: `Monthly credits reset to ${planCredits} for ${plan} plan`
                }
            });
            return {
                previousCredits,
                newCredits
            };
        });
        // Log audit event
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["logCreditEvent"])(userId, 'monthly_reset', {
            amount: planCredits,
            balance: result.newCredits,
            source: 'plan_change'
        });
        return {
            success: true,
            newCredits: result.newCredits,
            previousCredits: result.previousCredits
        };
    } catch (error) {
        console.error('[CreditService] Failed to reset monthly credits:', error);
        return {
            success: false,
            newCredits: 0,
            previousCredits: 0,
            error: 'Failed to reset monthly credits'
        };
    }
}
async function getCreditBalance(userId) {
    try {
        const user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].user.findUnique({
            where: {
                id: userId
            },
            select: {
                credits: true,
                creditsMonthly: true,
                rolloverCredits: true,
                plan: true
            }
        });
        if (!user) {
            return {
                total: 0,
                monthly: 0,
                rollover: 0,
                addons: 0,
                plan: 'free'
            };
        }
        // Get active addon credits
        const activeAddons = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].creditAddon.findMany({
            where: {
                userId,
                expiresAt: {
                    gt: new Date()
                }
            }
        });
        const addonCredits = activeAddons.reduce((sum, addon)=>sum + addon.credits, 0);
        return {
            total: user.credits,
            monthly: user.creditsMonthly,
            rollover: user.rolloverCredits,
            addons: addonCredits,
            plan: user.plan || 'free'
        };
    } catch (error) {
        console.error('[CreditService] Failed to get credit balance:', error);
        return {
            total: 0,
            monthly: 0,
            rollover: 0,
            addons: 0,
            plan: 'free'
        };
    }
}
async function checkCreditSufficiency(userId, amount) {
    try {
        const user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].user.findUnique({
            where: {
                id: userId
            },
            select: {
                credits: true
            }
        });
        const balance = user?.credits ?? 0;
        const sufficient = balance >= amount;
        const shortfall = sufficient ? 0 : amount - balance;
        return {
            sufficient,
            balance,
            shortfall
        };
    } catch (error) {
        console.error('[CreditService] Failed to check credit sufficiency:', error);
        return {
            sufficient: false,
            balance: 0,
            shortfall: amount
        };
    }
}
async function refundCredits(params) {
    try {
        const { userId, amount, originalAction, referenceId, idempotencyKey } = params;
        if (amount <= 0) {
            return {
                success: false,
                newBalance: 0,
                error: 'Refund amount must be greater than 0'
            };
        }
        // Idempotency: when a key is provided, apply the refund at most once.
        // The ledger row is written under `${originalAction}_refund_idempotent_${key}`
        // and the pre-check looks for exactly that label (same pattern as deductCredits).
        const refundAction = idempotencyKey ? `${originalAction}_refund_idempotent_${idempotencyKey}` : `${originalAction}_refund`;
        if (idempotencyKey) {
            const existingRefund = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].creditsLedger.findFirst({
                where: {
                    userId,
                    action: refundAction
                }
            });
            if (existingRefund) {
                return {
                    success: true,
                    newBalance: existingRefund.balance,
                    ledgerEntryId: existingRefund.id,
                    alreadyProcessed: true
                };
            }
        }
        const result = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].$transaction(async (tx)=>{
            const user = await tx.user.findUnique({
                where: {
                    id: userId
                },
                select: {
                    credits: true
                }
            });
            if (!user) {
                throw new Error('User not found');
            }
            const newBalance = user.credits + amount;
            // Update user credits
            await tx.user.update({
                where: {
                    id: userId
                },
                data: {
                    credits: newBalance
                }
            });
            // Create refund ledger entry (composite action when idempotency key given,
            // so the pre-check above can match it on retries)
            const ledgerEntry = await tx.creditsLedger.create({
                data: {
                    userId,
                    action: refundAction,
                    credits: amount,
                    balance: newBalance,
                    description: `Refund: ${amount} credits returned for failed ${originalAction}`,
                    referenceId: referenceId || null
                }
            });
            return {
                newBalance,
                ledgerEntryId: ledgerEntry.id
            };
        });
        // Log audit event
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["logCreditEvent"])(userId, 'credits_refunded', {
            amount,
            balance: result.newBalance,
            action_type: originalAction,
            referenceId
        });
        return {
            success: true,
            newBalance: result.newBalance,
            ledgerEntryId: result.ledgerEntryId
        };
    } catch (error) {
        console.error('[CreditService] Failed to refund credits:', error);
        return {
            success: false,
            newBalance: 0,
            error: 'Failed to refund credits'
        };
    }
}
function getActionCost(action) {
    return CREDIT_COSTS[action] ?? 0;
}
function getAllCreditCosts() {
    return {
        ...CREDIT_COSTS
    };
}
async function addCreditAddon(params) {
    try {
        const result = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].$transaction(async (tx)=>{
            const user = await tx.user.findUnique({
                where: {
                    id: params.userId
                },
                select: {
                    credits: true
                }
            });
            if (!user) {
                throw new Error('User not found');
            }
            const newBalance = user.credits + params.credits;
            // Update user credits
            await tx.user.update({
                where: {
                    id: params.userId
                },
                data: {
                    credits: newBalance
                }
            });
            // Create addon record
            const addon = await tx.creditAddon.create({
                data: {
                    userId: params.userId,
                    credits: params.credits,
                    pricePaid: params.pricePaid,
                    currency: params.currency || 'USD',
                    paymentOrderId: params.paymentOrderId || null,
                    expiresAt: params.expiresAt || null
                }
            });
            // Create ledger entry
            await tx.creditsLedger.create({
                data: {
                    userId: params.userId,
                    action: 'credit_addon_purchase',
                    credits: params.credits,
                    balance: newBalance,
                    description: `Purchased ${params.credits} credits addon for ${params.pricePaid} ${params.currency || 'USD'}`,
                    referenceId: addon.id
                }
            });
            return {
                newBalance,
                addonId: addon.id
            };
        });
        // Log audit event
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["logCreditEvent"])(params.userId, 'credits_added', {
            amount: params.credits,
            balance: result.newBalance,
            source: 'addon_purchase'
        });
        return {
            success: true,
            newBalance: result.newBalance,
            addonId: result.addonId
        };
    } catch (error) {
        console.error('[CreditService] Failed to add credit addon:', error);
        return {
            success: false,
            newBalance: 0,
            error: 'Failed to add credit addon'
        };
    }
}
}),
"[project]/src/lib/lead-audit.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "logAuditEvent",
    ()=>logAuditEvent
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Audit Event Logger
// Phase 7: Centralized audit logging for lead operations
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [instrumentation] (ecmascript)");
;
async function logAuditEvent(userId, action, metadata, resourceId) {
    try {
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].auditLog.create({
            data: {
                userId,
                action,
                details: metadata ? JSON.stringify(metadata) : null,
                resource: 'lead',
                resourceId: resourceId || null
            }
        });
    } catch (error) {
        console.error('[LeadAudit] Failed to log audit event:', error);
    }
}
}),
"[project]/src/lib/lead-dedup-service.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "checkDuplicate",
    ()=>checkDuplicate,
    "mergeLeads",
    ()=>mergeLeads
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Deduplication Service
// Phase 7: Fuzzy matching, duplicate detection, lead merging
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/lead-audit.ts [instrumentation] (ecmascript)");
;
;
async function checkDuplicate(userId, leadData) {
    if (!leadData.businessName) {
        return {
            isDuplicate: false
        };
    }
    // Get user's org for org-level scoping
    const user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].user.findUnique({
        where: {
            id: userId
        },
        select: {
            orgId: true
        }
    });
    // Build where clause scoped to user or org
    const where = {
        isActive: true
    };
    if (user?.orgId) {
        where.orgId = user.orgId;
    } else {
        where.userId = userId;
    }
    // Check exact email match (highest priority)
    if (leadData.email && leadData.email.trim()) {
        const emailMatch = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.findFirst({
            where: {
                ...where,
                email: leadData.email.trim().toLowerCase()
            },
            select: {
                id: true,
                businessName: true,
                email: true,
                website: true
            }
        });
        if (emailMatch) {
            return {
                isDuplicate: true,
                duplicateOf: emailMatch.id,
                matchField: 'email',
                matchScore: 100,
                existingLead: emailMatch
            };
        }
    }
    // Check website domain match
    if (leadData.website && leadData.website.trim()) {
        const domain = extractDomain(leadData.website);
        if (domain) {
            const allLeads = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.findMany({
                where: {
                    ...where,
                    website: {
                        not: null
                    }
                },
                select: {
                    id: true,
                    businessName: true,
                    email: true,
                    website: true
                }
            });
            for (const existing of allLeads){
                if (existing.website) {
                    const existingDomain = extractDomain(existing.website);
                    if (existingDomain && existingDomain === domain) {
                        return {
                            isDuplicate: true,
                            duplicateOf: existing.id,
                            matchField: 'website',
                            matchScore: 90,
                            existingLead: existing
                        };
                    }
                }
            }
        }
    }
    // Check phone match
    if (leadData.phone && leadData.phone.trim()) {
        const normalizedPhone = normalizePhone(leadData.phone);
        if (normalizedPhone) {
            const allLeads = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.findMany({
                where: {
                    ...where,
                    phone: {
                        not: null
                    }
                },
                select: {
                    id: true,
                    businessName: true,
                    email: true,
                    website: true,
                    phone: true
                }
            });
            for (const existing of allLeads){
                if (existing.phone) {
                    const existingPhone = normalizePhone(existing.phone);
                    if (existingPhone && existingPhone === normalizedPhone) {
                        return {
                            isDuplicate: true,
                            duplicateOf: existing.id,
                            matchField: 'phone',
                            matchScore: 85,
                            existingLead: existing
                        };
                    }
                }
            }
        }
    }
    // Fuzzy business name match
    const allLeads = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.findMany({
        where,
        select: {
            id: true,
            businessName: true,
            email: true,
            website: true
        },
        take: 500
    });
    for (const existing of allLeads){
        const similarity = calculateStringSimilarity(leadData.businessName.toLowerCase().trim(), existing.businessName.toLowerCase().trim());
        if (similarity >= 0.85) {
            return {
                isDuplicate: true,
                duplicateOf: existing.id,
                matchField: 'businessName',
                matchScore: Math.round(similarity * 100),
                existingLead: existing
            };
        }
    }
    return {
        isDuplicate: false
    };
}
async function mergeLeads(sourceId, targetId, userId) {
    try {
        const [source, target] = await Promise.all([
            __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.findFirst({
                where: {
                    id: sourceId,
                    isActive: true
                }
            }),
            __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.findFirst({
                where: {
                    id: targetId,
                    isActive: true
                }
            })
        ]);
        if (!source || !target) {
            return {
                success: false,
                mergedLeadId: targetId,
                deletedLeadId: sourceId,
                fieldsMerged: [],
                error: 'Source or target lead not found'
            };
        }
        // Merge: non-empty source fields fill empty target fields
        const fieldsMerged = [];
        const updateData = {};
        const mergeFields = [
            'ownerName',
            'website',
            'email',
            'phone',
            'whatsapp',
            'linkedin',
            'instagram',
            'facebook',
            'googleMapsListing',
            'reviews',
            'city',
            'country',
            'niche',
            'notes',
            'bestContactPerson',
            'bestChannel',
            'bestTiming',
            'outreachStyle',
            'opportunityNotes',
            'digitalWeaknesses'
        ];
        for (const field of mergeFields){
            const sourceValue = source[field];
            const targetValue = target[field];
            if (sourceValue && !targetValue) {
                updateData[field] = sourceValue;
                fieldsMerged.push(field);
            }
        }
        // Handle numeric fields — take higher value
        if ((source.rating || 0) > (target.rating || 0)) {
            updateData.rating = source.rating;
            fieldsMerged.push('rating');
        }
        // Merge tags
        try {
            const sourceTags = JSON.parse(source.tags || '[]');
            const targetTags = JSON.parse(target.tags || '[]');
            const mergedTags = [
                ...new Set([
                    ...targetTags,
                    ...sourceTags
                ])
            ];
            if (mergedTags.length > targetTags.length) {
                updateData.tags = JSON.stringify(mergedTags);
                fieldsMerged.push('tags');
            }
        } catch  {
        // Tags merge failed, skip
        }
        // Take higher scores
        const scoreFields = [
            'replyScore',
            'conversionScore',
            'urgencyScore',
            'revenuePotentialScore'
        ];
        for (const field of scoreFields){
            if ((source[field] || 0) > (target[field] || 0)) {
                updateData[field] = source[field];
                fieldsMerged.push(field);
            }
        }
        // Update target with merged data
        if (fieldsMerged.length > 0) {
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.update({
                where: {
                    id: targetId
                },
                data: updateData
            });
        }
        // Soft-delete source lead
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.update({
            where: {
                id: sourceId
            },
            data: {
                isActive: false,
                deletedAt: new Date()
            }
        });
        // Reassign source lead's notes to target
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].leadNote.updateMany({
            where: {
                leadId: sourceId
            },
            data: {
                leadId: targetId
            }
        });
        // Reassign source lead's activities to target
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].leadActivity.updateMany({
            where: {
                leadId: sourceId
            },
            data: {
                leadId: targetId
            }
        });
        // Audit log
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["logAuditEvent"])(userId, 'leads_merged', {
            sourceId,
            targetId,
            fieldsMerged,
            sourceBusinessName: source.businessName,
            targetBusinessName: target.businessName
        });
        return {
            success: true,
            mergedLeadId: targetId,
            deletedLeadId: sourceId,
            fieldsMerged
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown merge error';
        return {
            success: false,
            mergedLeadId: targetId,
            deletedLeadId: sourceId,
            fieldsMerged: [],
            error: message
        };
    }
}
// ===== UTILITY FUNCTIONS =====
/**
 * Extract domain from URL.
 */ function extractDomain(url) {
    try {
        const normalized = url.startsWith('http') ? url : `https://${url}`;
        const parsed = new URL(normalized);
        return parsed.hostname.replace(/^www\./, '').toLowerCase();
    } catch  {
        return null;
    }
}
/**
 * Normalize phone number for comparison.
 * Removes all non-digit characters and leading country code zeros.
 */ function normalizePhone(phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) return null;
    // Remove leading country code indicators
    if (digits.startsWith('00')) return digits.substring(2);
    if (digits.startsWith('1') && digits.length === 11) return digits.substring(1);
    return digits;
}
/**
 * Calculate string similarity using Levenshtein distance ratio.
 * Returns value between 0 and 1 (1 = identical).
 */ function calculateStringSimilarity(a, b) {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;
    // Quick check: if one string contains the other
    if (a.includes(b) || b.includes(a)) {
        return Math.min(a.length, b.length) / Math.max(a.length, b.length);
    }
    const matrix = [];
    for(let i = 0; i <= b.length; i++){
        matrix[i] = [
            i
        ];
    }
    for(let j = 0; j <= a.length; j++){
        matrix[0][j] = j;
    }
    for(let i = 1; i <= b.length; i++){
        for(let j = 1; j <= a.length; j++){
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
            }
        }
    }
    const maxLength = Math.max(a.length, b.length);
    return 1 - matrix[b.length][a.length] / maxLength;
}
}),
"[externals]/fs/promises [external] (fs/promises, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("fs/promises", () => require("fs/promises"));

module.exports = mod;
}),
"[externals]/os [external] (os, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("os", () => require("os"));

module.exports = mod;
}),
"[project]/src/lib/lead-discovery/source-registry.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Discovery Source Registry
//
// Single source of truth for every lead-discovery source:
//   - What env vars / credentials it needs
//   - Whether it is currently usable (connected / not_configured / error)
//   - The exact user-facing configuration message to show when unusable
//
// PRINCIPLE: a source is only "usable" when its real credentials exist.
// Discovery NEVER runs against an unconfigured source and NEVER returns
// fake, mock, or placeholder leads.
// ═══════════════════════════════════════════════════════════════════
__turbopack_context__.s([
    "DISCOVERY_SOURCE_REGISTRY",
    ()=>DISCOVERY_SOURCE_REGISTRY,
    "getSourceConfigMessage",
    ()=>getSourceConfigMessage,
    "getSourceCoverage",
    ()=>getSourceCoverage,
    "getSourceStatusInfo",
    ()=>getSourceStatusInfo,
    "isSourceReady",
    ()=>isSourceReady,
    "listSourceStatuses",
    ()=>listSourceStatuses
]);
// ═══════════════════════════════════════════════════════════════════
// REGISTRY DEFINITION
// ═══════════════════════════════════════════════════════════════════
/** Check that at least one of the given env var names has a non-empty value. */ function anyEnvSet(names) {
    return names.some((n)=>{
        const v = process.env[n];
        return typeof v === 'string' && v.trim().length > 0;
    });
}
/** Check that ALL of the given env var names have non-empty values. */ function allEnvSet(names) {
    return names.every((n)=>{
        const v = process.env[n];
        return typeof v === 'string' && v.trim().length > 0;
    });
}
const DISCOVERY_SOURCE_REGISTRY = [
    {
        id: 'ai_search',
        label: 'AI Search',
        type: 'ai',
        description: 'AI-powered web search that finds real businesses from live search engine results. No API key setup required.',
        requiredEnvVars: [],
        optionalEnvVars: [],
        noSetupRequired: true
    },
    {
        id: 'google_maps',
        label: 'Google Maps',
        type: 'api',
        description: 'Real businesses from the official Google Places API: name, address, phone, website, rating and place ID.',
        requiredEnvVars: [
            {
                name: 'GOOGLE_MAPS_API_KEY',
                label: 'API Key',
                required: true
            }
        ],
        optionalEnvVars: [],
        signupUrl: 'https://console.cloud.google.com/apis/library/places-backend.googleapis.com',
        notes: 'Enable the Places API on a Google Cloud project and create an API key with Places restrictions.'
    },
    {
        id: 'google_business',
        label: 'Google Business',
        type: 'api',
        description: 'Business profiles via the official Google Places API (same key as Google Maps).',
        requiredEnvVars: [
            {
                name: 'GOOGLE_MAPS_API_KEY',
                label: 'API Key',
                required: true
            }
        ],
        optionalEnvVars: [],
        signupUrl: 'https://console.cloud.google.com/apis/library/places-backend.googleapis.com'
    },
    {
        id: 'yelp',
        label: 'Yelp',
        type: 'api',
        description: 'Real businesses from the Yelp Fusion API: name, phone, address, rating, categories and Yelp listing URL.',
        requiredEnvVars: [
            {
                name: 'YELP_API_KEY',
                label: 'API Key',
                required: true
            }
        ],
        optionalEnvVars: [],
        signupUrl: 'https://www.yelp.com/developers/v3/manage_app',
        notes: 'Free tier available. Create an app in the Yelp developer portal to get a Fusion API key.'
    },
    {
        id: 'linkedin',
        label: 'LinkedIn',
        type: 'api',
        description: 'Companies from the official LinkedIn Organization Search API.',
        requiredEnvVars: [
            {
                name: 'LINKEDIN_CLIENT_ID',
                label: 'Client ID',
                required: true
            },
            {
                name: 'LINKEDIN_CLIENT_SECRET',
                label: 'Client Secret',
                required: true
            }
        ],
        optionalEnvVars: [],
        signupUrl: 'https://www.linkedin.com/developers/apps',
        notes: 'Organization Search requires LinkedIn Marketing API partner approval. If LinkedIn rejects the call, the exact API error is shown — no substitute data is returned.'
    },
    {
        id: 'justdial',
        label: 'JustDial',
        type: 'api',
        description: 'Business listings via the JustDial partner API.',
        requiredEnvVars: [
            {
                name: 'JUSTDIAL_API_KEY',
                label: 'API Key',
                required: true
            }
        ],
        optionalEnvVars: [
            {
                name: 'JUSTDIAL_API_URL',
                label: 'Partner API Endpoint URL',
                required: false
            }
        ],
        notes: 'JustDial issues API access through partner onboarding. Set JUSTDIAL_API_KEY plus JUSTDIAL_API_URL (the endpoint URL provided by JustDial).'
    },
    {
        id: 'indiamart',
        label: 'IndiaMart',
        type: 'api',
        description: 'Real buyer enquiries from your own IndiaMart account via the official Lead Manager API.',
        requiredEnvVars: [
            {
                name: 'INDIAMART_API_KEY',
                label: 'Access Token',
                required: true
            }
        ],
        optionalEnvVars: [],
        signupUrl: 'https://crm.indiamart.com/',
        notes: 'Uses the IndiaMart Lead Manager API, which returns enquiries from YOUR IndiaMart seller account filtered by your niche keywords.'
    },
    {
        id: 'facebook',
        label: 'Facebook',
        type: 'api',
        description: 'Business Pages from the official Facebook Graph API Pages Search.',
        requiredEnvVars: [
            {
                name: 'FACEBOOK_APP_ID',
                label: 'App ID',
                required: true
            },
            {
                name: 'FACEBOOK_APP_SECRET',
                label: 'App Secret',
                required: true
            }
        ],
        optionalEnvVars: [],
        signupUrl: 'https://developers.facebook.com/apps',
        notes: 'Pages Search may require additional App Review permissions from Meta. If Meta rejects the call, the exact API error is shown.'
    },
    {
        id: 'instagram',
        label: 'Instagram',
        type: 'api',
        description: 'Business accounts via the Instagram / Meta Graph API.',
        requiredEnvVars: [
            {
                name: 'INSTAGRAM_APP_ID',
                label: 'App ID',
                required: true
            }
        ],
        optionalEnvVars: [
            {
                name: 'INSTAGRAM_APP_SECRET',
                label: 'App Secret',
                required: false
            }
        ],
        signupUrl: 'https://developers.facebook.com/apps',
        notes: 'Instagram restricts search to approved business tokens. If Meta rejects the call, the exact API error is shown — no substitute data is returned.'
    },
    {
        id: 'yellow_pages',
        label: 'Yellow Pages',
        type: 'scrape',
        description: 'Live results scraped from yellowpages.com search pages: business name, phone, address, website and category.',
        requiredEnvVars: [],
        optionalEnvVars: [],
        noSetupRequired: true,
        coverage: {
            countries: [
                'United States'
            ],
            note: 'yellowpages.com covers US businesses. Searches in other countries run against this source return no listings — that is a coverage limit, not a system failure.'
        }
    },
    {
        id: 'sulekha',
        label: 'Sulekha',
        type: 'scrape',
        description: 'Live results scraped from sulekha.com search pages: business name, phone, location and category.',
        requiredEnvVars: [],
        optionalEnvVars: [],
        noSetupRequired: true,
        coverage: {
            countries: [
                'India'
            ],
            note: 'sulekha.com covers Indian businesses. Searches in other countries run against this source return no listings — that is a coverage limit, not a system failure.'
        }
    }
];
// ═══════════════════════════════════════════════════════════════════
// STATUS RESOLUTION
// ═══════════════════════════════════════════════════════════════════
/** Env var groups: a source is connected when ALL required groups have at least one set var. */ const EXTRA_STATUS_RULES = {
    justdial: {
        requiresAny: [
            [
                'JUSTDIAL_API_KEY'
            ]
        ],
        errorMessage: (missing)=>`JustDial API key found, but ${missing} is not set. Add the JustDial partner endpoint URL to environment variables (Settings → Integrations → Discovery Sources shows the required names).`
    },
    instagram: {
        requiresAny: [
            [
                'INSTAGRAM_APP_ID'
            ]
        ]
    }
};
function getSourceStatusInfo(id) {
    const meta = DISCOVERY_SOURCE_REGISTRY.find((s)=>s.id === id);
    if (!meta) {
        return {
            id,
            label: id,
            type: 'api',
            description: '',
            requiredEnvVars: [],
            optionalEnvVars: [],
            status: 'error',
            configMessage: `Unknown discovery source: ${id}`
        };
    }
    // Free / no-setup sources (AI search, scrapers) are always ready.
    if (meta.noSetupRequired) {
        return {
            ...meta,
            status: 'connected',
            configMessage: ''
        };
    }
    const requiredNames = meta.requiredEnvVars.filter((v)=>v.required).map((v)=>v.name);
    const allRequiredSet = allEnvSet(requiredNames);
    if (!allRequiredSet) {
        const missing = requiredNames.filter((n)=>!anyEnvSet([
                n
            ]));
        return {
            ...meta,
            status: 'not_configured',
            configMessage: `${meta.label} requires API configuration. Go to Settings → Integrations to connect this source. Missing: ${missing.join(', ')}.`
        };
    }
    // Extra rules (e.g. JustDial needs the partner endpoint URL in addition to the key)
    const rule = EXTRA_STATUS_RULES[id];
    if (rule) {
        for (const group of rule.requiresAny){
            if (!anyEnvSet(group)) {
                return {
                    ...meta,
                    status: 'error',
                    configMessage: rule.errorMessage ? rule.errorMessage(group.join(' / ')) : `${meta.label} is not fully configured.`
                };
            }
        }
    }
    return {
        ...meta,
        status: 'connected',
        configMessage: ''
    };
}
function isSourceReady(id) {
    return getSourceStatusInfo(id).status === 'connected';
}
function getSourceConfigMessage(id) {
    return getSourceStatusInfo(id).configMessage;
}
function listSourceStatuses() {
    return DISCOVERY_SOURCE_REGISTRY.map((s)=>getSourceStatusInfo(s.id));
}
function getSourceCoverage(id) {
    return DISCOVERY_SOURCE_REGISTRY.find((s)=>s.id === id)?.coverage;
}
}),
"[project]/src/lib/countries.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Worldwide Country Dataset (ISO 3166-1)
//
// Complete, maintained country dataset for worldwide lead discovery:
//   - ISO 3166-1 alpha-2 code + common English name for every country
//   - Common alias resolution (USA → United States, UK → United Kingdom …)
//   - Canonical normalization so discovery, persistence, and filters all
//     use ONE canonical name (spec §5: "Normalize country names and codes
//     consistently", "Handle alternate spellings and common aliases")
//
// No network calls, no external dependency — a static snapshot of the
// ISO 3166-1 standard (249 officially assigned codes).
// ═══════════════════════════════════════════════════════════════════
__turbopack_context__.s([
    "COUNTRIES",
    ()=>COUNTRIES,
    "aliasesFor",
    ()=>aliasesFor,
    "countryCodeFor",
    ()=>countryCodeFor,
    "extractCountryFromLocation",
    ()=>extractCountryFromLocation,
    "normalizeCountryName",
    ()=>normalizeCountryName,
    "searchCountries",
    ()=>searchCountries
]);
// [alpha-2, canonical name] — ISO 3166-1 officially assigned codes.
const RAW_COUNTRIES = [
    [
        'AD',
        'Andorra'
    ],
    [
        'AE',
        'United Arab Emirates'
    ],
    [
        'AF',
        'Afghanistan'
    ],
    [
        'AG',
        'Antigua and Barbuda'
    ],
    [
        'AI',
        'Anguilla'
    ],
    [
        'AL',
        'Albania'
    ],
    [
        'AM',
        'Armenia'
    ],
    [
        'AO',
        'Angola'
    ],
    [
        'AQ',
        'Antarctica'
    ],
    [
        'AR',
        'Argentina'
    ],
    [
        'AS',
        'American Samoa'
    ],
    [
        'AT',
        'Austria'
    ],
    [
        'AU',
        'Australia'
    ],
    [
        'AW',
        'Aruba'
    ],
    [
        'AX',
        'Åland Islands'
    ],
    [
        'AZ',
        'Azerbaijan'
    ],
    [
        'BA',
        'Bosnia and Herzegovina'
    ],
    [
        'BB',
        'Barbados'
    ],
    [
        'BD',
        'Bangladesh'
    ],
    [
        'BE',
        'Belgium'
    ],
    [
        'BF',
        'Burkina Faso'
    ],
    [
        'BG',
        'Bulgaria'
    ],
    [
        'BH',
        'Bahrain'
    ],
    [
        'BI',
        'Burundi'
    ],
    [
        'BJ',
        'Benin'
    ],
    [
        'BL',
        'Saint Barthélemy'
    ],
    [
        'BM',
        'Bermuda'
    ],
    [
        'BN',
        'Brunei Darussalam'
    ],
    [
        'BO',
        'Bolivia'
    ],
    [
        'BQ',
        'Bonaire, Sint Eustatius and Saba'
    ],
    [
        'BR',
        'Brazil'
    ],
    [
        'BS',
        'Bahamas'
    ],
    [
        'BT',
        'Bhutan'
    ],
    [
        'BV',
        'Bouvet Island'
    ],
    [
        'BW',
        'Botswana'
    ],
    [
        'BY',
        'Belarus'
    ],
    [
        'BZ',
        'Belize'
    ],
    [
        'CA',
        'Canada'
    ],
    [
        'CC',
        'Cocos (Keeling) Islands'
    ],
    [
        'CD',
        'Congo, Democratic Republic of the'
    ],
    [
        'CF',
        'Central African Republic'
    ],
    [
        'CG',
        'Congo'
    ],
    [
        'CH',
        'Switzerland'
    ],
    [
        'CI',
        "Côte d'Ivoire"
    ],
    [
        'CK',
        'Cook Islands'
    ],
    [
        'CL',
        'Chile'
    ],
    [
        'CM',
        'Cameroon'
    ],
    [
        'CN',
        'China'
    ],
    [
        'CO',
        'Colombia'
    ],
    [
        'CR',
        'Costa Rica'
    ],
    [
        'CU',
        'Cuba'
    ],
    [
        'CV',
        'Cabo Verde'
    ],
    [
        'CW',
        'Curaçao'
    ],
    [
        'CX',
        'Christmas Island'
    ],
    [
        'CY',
        'Cyprus'
    ],
    [
        'CZ',
        'Czechia'
    ],
    [
        'DE',
        'Germany'
    ],
    [
        'DJ',
        'Djibouti'
    ],
    [
        'DK',
        'Denmark'
    ],
    [
        'DM',
        'Dominica'
    ],
    [
        'DO',
        'Dominican Republic'
    ],
    [
        'DZ',
        'Algeria'
    ],
    [
        'EC',
        'Ecuador'
    ],
    [
        'EE',
        'Estonia'
    ],
    [
        'EG',
        'Egypt'
    ],
    [
        'EH',
        'Western Sahara'
    ],
    [
        'ER',
        'Eritrea'
    ],
    [
        'ES',
        'Spain'
    ],
    [
        'ET',
        'Ethiopia'
    ],
    [
        'FI',
        'Finland'
    ],
    [
        'FJ',
        'Fiji'
    ],
    [
        'FK',
        'Falkland Islands (Malvinas)'
    ],
    [
        'FM',
        'Micronesia'
    ],
    [
        'FO',
        'Faroe Islands'
    ],
    [
        'FR',
        'France'
    ],
    [
        'GA',
        'Gabon'
    ],
    [
        'GB',
        'United Kingdom'
    ],
    [
        'GD',
        'Grenada'
    ],
    [
        'GE',
        'Georgia'
    ],
    [
        'GF',
        'French Guiana'
    ],
    [
        'GG',
        'Guernsey'
    ],
    [
        'GH',
        'Ghana'
    ],
    [
        'GI',
        'Gibraltar'
    ],
    [
        'GL',
        'Greenland'
    ],
    [
        'GM',
        'Gambia'
    ],
    [
        'GN',
        'Guinea'
    ],
    [
        'GP',
        'Guadeloupe'
    ],
    [
        'GQ',
        'Equatorial Guinea'
    ],
    [
        'GR',
        'Greece'
    ],
    [
        'GS',
        'South Georgia and the South Sandwich Islands'
    ],
    [
        'GT',
        'Guatemala'
    ],
    [
        'GU',
        'Guam'
    ],
    [
        'GW',
        'Guinea-Bissau'
    ],
    [
        'GY',
        'Guyana'
    ],
    [
        'HK',
        'Hong Kong'
    ],
    [
        'HM',
        'Heard Island and McDonald Islands'
    ],
    [
        'HN',
        'Honduras'
    ],
    [
        'HR',
        'Croatia'
    ],
    [
        'HT',
        'Haiti'
    ],
    [
        'HU',
        'Hungary'
    ],
    [
        'ID',
        'Indonesia'
    ],
    [
        'IE',
        'Ireland'
    ],
    [
        'IL',
        'Israel'
    ],
    [
        'IM',
        'Isle of Man'
    ],
    [
        'IN',
        'India'
    ],
    [
        'IO',
        'British Indian Ocean Territory'
    ],
    [
        'IQ',
        'Iraq'
    ],
    [
        'IR',
        'Iran'
    ],
    [
        'IS',
        'Iceland'
    ],
    [
        'IT',
        'Italy'
    ],
    [
        'JE',
        'Jersey'
    ],
    [
        'JM',
        'Jamaica'
    ],
    [
        'JO',
        'Jordan'
    ],
    [
        'JP',
        'Japan'
    ],
    [
        'KE',
        'Kenya'
    ],
    [
        'KG',
        'Kyrgyzstan'
    ],
    [
        'KH',
        'Cambodia'
    ],
    [
        'KI',
        'Kiribati'
    ],
    [
        'KM',
        'Comoros'
    ],
    [
        'KN',
        'Saint Kitts and Nevis'
    ],
    [
        'KP',
        "Korea, Democratic People's Republic of"
    ],
    [
        'KR',
        'Korea, Republic of'
    ],
    [
        'KW',
        'Kuwait'
    ],
    [
        'KY',
        'Cayman Islands'
    ],
    [
        'KZ',
        'Kazakhstan'
    ],
    [
        'LA',
        "Lao People's Democratic Republic"
    ],
    [
        'LB',
        'Lebanon'
    ],
    [
        'LC',
        'Saint Lucia'
    ],
    [
        'LI',
        'Liechtenstein'
    ],
    [
        'LK',
        'Sri Lanka'
    ],
    [
        'LR',
        'Liberia'
    ],
    [
        'LS',
        'Lesotho'
    ],
    [
        'LT',
        'Lithuania'
    ],
    [
        'LU',
        'Luxembourg'
    ],
    [
        'LV',
        'Latvia'
    ],
    [
        'LY',
        'Libya'
    ],
    [
        'MA',
        'Morocco'
    ],
    [
        'MC',
        'Monaco'
    ],
    [
        'MD',
        'Moldova'
    ],
    [
        'ME',
        'Montenegro'
    ],
    [
        'MF',
        'Saint Martin (French part)'
    ],
    [
        'MG',
        'Madagascar'
    ],
    [
        'MH',
        'Marshall Islands'
    ],
    [
        'MK',
        'North Macedonia'
    ],
    [
        'ML',
        'Mali'
    ],
    [
        'MM',
        'Myanmar'
    ],
    [
        'MN',
        'Mongolia'
    ],
    [
        'MO',
        'Macao'
    ],
    [
        'MP',
        'Northern Mariana Islands'
    ],
    [
        'MQ',
        'Martinique'
    ],
    [
        'MR',
        'Mauritania'
    ],
    [
        'MS',
        'Montserrat'
    ],
    [
        'MT',
        'Malta'
    ],
    [
        'MU',
        'Mauritius'
    ],
    [
        'MV',
        'Maldives'
    ],
    [
        'MW',
        'Malawi'
    ],
    [
        'MX',
        'Mexico'
    ],
    [
        'MY',
        'Malaysia'
    ],
    [
        'MZ',
        'Mozambique'
    ],
    [
        'NA',
        'Namibia'
    ],
    [
        'NC',
        'New Caledonia'
    ],
    [
        'NE',
        'Niger'
    ],
    [
        'NF',
        'Norfolk Island'
    ],
    [
        'NG',
        'Nigeria'
    ],
    [
        'NI',
        'Nicaragua'
    ],
    [
        'NL',
        'Netherlands'
    ],
    [
        'NO',
        'Norway'
    ],
    [
        'NP',
        'Nepal'
    ],
    [
        'NR',
        'Nauru'
    ],
    [
        'NU',
        'Niue'
    ],
    [
        'NZ',
        'New Zealand'
    ],
    [
        'OM',
        'Oman'
    ],
    [
        'PA',
        'Panama'
    ],
    [
        'PE',
        'Peru'
    ],
    [
        'PF',
        'French Polynesia'
    ],
    [
        'PG',
        'Papua New Guinea'
    ],
    [
        'PH',
        'Philippines'
    ],
    [
        'PK',
        'Pakistan'
    ],
    [
        'PL',
        'Poland'
    ],
    [
        'PM',
        'Saint Pierre and Miquelon'
    ],
    [
        'PN',
        'Pitcairn'
    ],
    [
        'PR',
        'Puerto Rico'
    ],
    [
        'PS',
        'Palestine, State of'
    ],
    [
        'PT',
        'Portugal'
    ],
    [
        'PW',
        'Palau'
    ],
    [
        'PY',
        'Paraguay'
    ],
    [
        'QA',
        'Qatar'
    ],
    [
        'RE',
        'Réunion'
    ],
    [
        'RO',
        'Romania'
    ],
    [
        'RS',
        'Serbia'
    ],
    [
        'RU',
        'Russian Federation'
    ],
    [
        'RW',
        'Rwanda'
    ],
    [
        'SA',
        'Saudi Arabia'
    ],
    [
        'SB',
        'Solomon Islands'
    ],
    [
        'SC',
        'Seychelles'
    ],
    [
        'SD',
        'Sudan'
    ],
    [
        'SE',
        'Sweden'
    ],
    [
        'SG',
        'Singapore'
    ],
    [
        'SH',
        'Saint Helena, Ascension and Tristan da Cunha'
    ],
    [
        'SI',
        'Slovenia'
    ],
    [
        'SJ',
        'Svalbard and Jan Mayen'
    ],
    [
        'SK',
        'Slovakia'
    ],
    [
        'SL',
        'Sierra Leone'
    ],
    [
        'SM',
        'San Marino'
    ],
    [
        'SN',
        'Senegal'
    ],
    [
        'SO',
        'Somalia'
    ],
    [
        'SR',
        'Suriname'
    ],
    [
        'SS',
        'South Sudan'
    ],
    [
        'ST',
        'Sao Tome and Principe'
    ],
    [
        'SV',
        'El Salvador'
    ],
    [
        'SX',
        'Sint Maarten (Dutch part)'
    ],
    [
        'SY',
        'Syrian Arab Republic'
    ],
    [
        'SZ',
        'Eswatini'
    ],
    [
        'TC',
        'Turks and Caicos Islands'
    ],
    [
        'TD',
        'Chad'
    ],
    [
        'TF',
        'French Southern Territories'
    ],
    [
        'TG',
        'Togo'
    ],
    [
        'TH',
        'Thailand'
    ],
    [
        'TJ',
        'Tajikistan'
    ],
    [
        'TK',
        'Tokelau'
    ],
    [
        'TL',
        'Timor-Leste'
    ],
    [
        'TM',
        'Turkmenistan'
    ],
    [
        'TN',
        'Tunisia'
    ],
    [
        'TO',
        'Tonga'
    ],
    [
        'TR',
        'Türkiye'
    ],
    [
        'TT',
        'Trinidad and Tobago'
    ],
    [
        'TV',
        'Tuvalu'
    ],
    [
        'TW',
        'Taiwan'
    ],
    [
        'TZ',
        'Tanzania, United Republic of'
    ],
    [
        'UA',
        'Ukraine'
    ],
    [
        'UG',
        'Uganda'
    ],
    [
        'UM',
        'United States Minor Outlying Islands'
    ],
    [
        'US',
        'United States'
    ],
    [
        'UY',
        'Uruguay'
    ],
    [
        'UZ',
        'Uzbekistan'
    ],
    [
        'VA',
        'Holy See (Vatican City State)'
    ],
    [
        'VC',
        'Saint Vincent and the Grenadines'
    ],
    [
        'VE',
        'Venezuela'
    ],
    [
        'VG',
        'Virgin Islands, British'
    ],
    [
        'VI',
        'Virgin Islands, U.S.'
    ],
    [
        'VN',
        'Viet Nam'
    ],
    [
        'VU',
        'Vanuatu'
    ],
    [
        'WF',
        'Wallis and Futuna'
    ],
    [
        'WS',
        'Samoa'
    ],
    [
        'YE',
        'Yemen'
    ],
    [
        'YT',
        'Mayotte'
    ],
    [
        'ZA',
        'South Africa'
    ],
    [
        'ZM',
        'Zambia'
    ],
    [
        'ZW',
        'Zimbabwe'
    ]
];
const COUNTRIES = RAW_COUNTRIES.map(([code, name])=>({
        code,
        name
    }));
/** Canonical name lookup set (lower-cased). */ const NAME_SET = new Set(COUNTRIES.map((c)=>c.name.toLowerCase()));
/**
 * Common aliases → canonical ISO name. Handles legacy values already
 * present in saved leads (e.g. "USA", "UK", "UAE") and frequent
 * alternate spellings, without duplicating leads (spec §5).
 */ const ALIASES = {
    usa: 'United States',
    'u s a': 'United States',
    'u s': 'United States',
    us: 'United States',
    america: 'United States',
    'united states of america': 'United States',
    'united states': 'United States',
    uk: 'United Kingdom',
    'u k': 'United Kingdom',
    britain: 'United Kingdom',
    'great britain': 'United Kingdom',
    england: 'United Kingdom',
    scotland: 'United Kingdom',
    wales: 'United Kingdom',
    'northern ireland': 'United Kingdom',
    uae: 'United Arab Emirates',
    'u a e': 'United Arab Emirates',
    emirates: 'United Arab Emirates',
    dubai: 'United Arab Emirates',
    'south korea': 'Korea, Republic of',
    korea: 'Korea, Republic of',
    'republic of korea': 'Korea, Republic of',
    'north korea': "Korea, Democratic People's Republic of",
    holland: 'Netherlands',
    'the netherlands': 'Netherlands',
    vietnam: 'Viet Nam',
    turkey: 'Türkiye',
    turkiye: 'Türkiye',
    czech: 'Czechia',
    'czech republic': 'Czechia',
    russia: 'Russian Federation',
    'russian federation': 'Russian Federation',
    iran: 'Iran',
    'islamic republic of iran': 'Iran',
    syria: 'Syrian Arab Republic',
    'syrian arab republic': 'Syrian Arab Republic',
    laos: "Lao People's Democratic Republic",
    bolivia: 'Bolivia',
    'plurinational state of bolivia': 'Bolivia',
    venezuela: 'Venezuela',
    'bolivarian republic of venezuela': 'Venezuela',
    tanzania: 'Tanzania, United Republic of',
    moldova: 'Moldova',
    'republic of moldova': 'Moldova',
    palestine: 'Palestine, State of',
    taiwan: 'Taiwan',
    'taiwan, province of china': 'Taiwan',
    macau: 'Macao',
    'cape verde': 'Cabo Verde',
    swaziland: 'Eswatini',
    macedonia: 'North Macedonia',
    burma: 'Myanmar',
    'ivory coast': "Côte d'Ivoire",
    'cape town': 'South Africa',
    'saudi': 'Saudi Arabia',
    'ksa': 'Saudi Arabia'
};
function normalizeCountryName(input) {
    if (!input || typeof input !== 'string') return null;
    const raw = input.trim();
    if (!raw) return null;
    // Punctuation/spaces collapse to single spaces so dotted forms
    // ("U.S.A.", "U.K.") resolve through the same alias table.
    const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    // Exact canonical name (case-insensitive)
    if (NAME_SET.has(key)) {
        return COUNTRIES.find((c)=>c.name.toLowerCase() === key).name;
    }
    // Known alias
    if (ALIASES[key]) return ALIASES[key];
    return null;
}
function countryCodeFor(input) {
    const canonical = normalizeCountryName(input);
    if (!canonical) return null;
    return COUNTRIES.find((c)=>c.name === canonical)?.code ?? null;
}
function extractCountryFromLocation(location) {
    if (!location) return null;
    const segments = location.split(',').map((s)=>s.trim()).filter(Boolean);
    // Try from the most specific (last segment) backwards
    for(let i = segments.length - 1; i >= 0; i--){
        const normalized = normalizeCountryName(segments[i]);
        if (normalized) return normalized;
    }
    return normalizeCountryName(location);
}
function aliasesFor(input) {
    const canonical = normalizeCountryName(input);
    if (!canonical) return input.trim() ? [
        input.trim()
    ] : [];
    const variants = new Set([
        canonical
    ]);
    for (const [alias, target] of Object.entries(ALIASES)){
        if (target === canonical) variants.add(alias);
    }
    // Capitalized alias forms (USA stays uppercase; "usa" → "Usa" is not used)
    return Array.from(variants);
}
function searchCountries(query, limit = 12) {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES.slice(0, limit);
    const starts = [];
    const contains = [];
    for (const c of COUNTRIES){
        const name = c.name.toLowerCase();
        const code = c.code.toLowerCase();
        if (name.startsWith(q) || code === q) starts.push(c);
        else if (name.includes(q)) contains.push(c);
        if (starts.length >= limit) break;
    }
    return [
        ...starts,
        ...contains
    ].slice(0, limit);
}
}),
"[project]/src/lib/lead-discovery/source-adapters.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Discovery Source Adapters (REAL DATA ONLY)
//
// Every adapter in this file performs a REAL network call to its
// provider (official API or public web page) and returns only what the
// provider actually sent. There is NO mock, sample, or placeholder data
// anywhere in this file. Failures are surfaced honestly via AdapterError.
//
// Universal result contract (enforced again in lead-discovery-service):
//   - every lead must carry at least a name and a location
//   - results missing both are discarded
//   - rate limiting is reported with a retry window, never silently
// ═══════════════════════════════════════════════════════════════════
__turbopack_context__.s([
    "runSourceAdapter",
    ()=>runSourceAdapter,
    "scrapeSulekha",
    ()=>scrapeSulekha,
    "scrapeYellowPages",
    ()=>scrapeYellowPages,
    "searchFacebookPages",
    ()=>searchFacebookPages,
    "searchGooglePlaces",
    ()=>searchGooglePlaces,
    "searchIndiaMart",
    ()=>searchIndiaMart,
    "searchInstagramBusinesses",
    ()=>searchInstagramBusinesses,
    "searchJustDial",
    ()=>searchJustDial,
    "searchLinkedIn",
    ()=>searchLinkedIn,
    "searchYelp",
    ()=>searchYelp
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$countries$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/countries.ts [instrumentation] (ecmascript)");
;
const DEFAULT_TIMEOUT_MS = 12000;
const SCRAPE_DELAY_MS = 1000; // 1s between scraping requests (anti-rate-limit)
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
/**
 * Scrape cap per job. Raised from 20 → 50 so a single Yellow Pages / Sulekha
 * run is not artificially capped below what the provider pages actually
 * return (spec §3.1: no tiny hardcoded result limits). Still a bounded,
 * rate-limit-respecting ceiling.
 */ const MAX_SCRAPE_RESULTS = 50;
/** Hard ceiling on provider pages fetched per adapter run (anti-runaway). */ const MAX_PROVIDER_PAGES = 5;
// ===== HELPERS =====
async function fetchJson(url, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs)
    });
    const text = await res.text();
    if (!res.ok) {
        // Surface rate limiting with a retry window when the provider signals it
        const retryAfter = res.headers.get('retry-after');
        if (res.status === 429 || res.status === 503) {
            const minutes = retryAfter ? Math.max(1, Math.ceil(parseInt(retryAfter, 10) / 60)) : 5;
            const err = new Error(`Rate limit reached (HTTP ${res.status})`);
            err.kind = 'rate_limited';
            err.retryAfterMinutes = minutes;
            throw err;
        }
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    try {
        return JSON.parse(text);
    } catch  {
        throw new Error(`Invalid JSON from provider: ${text.slice(0, 200)}`);
    }
}
function rateLimitError(minutes = 5) {
    return {
        kind: 'rate_limited',
        message: `Rate limit reached, try again in ${minutes} minutes`,
        retryAfterMinutes: minutes
    };
}
function apiError(message) {
    return {
        kind: 'api_error',
        message
    };
}
function normalizeUrl(url) {
    let normalized = String(url || '').trim();
    if (!normalized) return '';
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
        normalized = 'https://' + normalized;
    }
    return normalized;
}
/** Split "12 Main St, London, Greater London, UK" → { city, country, full }. */ function splitAddress(address) {
    const parts = address.split(',').map((p)=>p.trim()).filter(Boolean);
    if (parts.length === 0) return {
        full: address
    };
    if (parts.length === 1) return {
        city: parts[0],
        full: address
    };
    return {
        city: parts.length >= 2 ? parts[parts.length - 2] : undefined,
        country: parts.length >= 3 ? parts[parts.length - 1] : undefined,
        full: address
    };
}
function cleanText(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}
/**
 * Geographic coverage pre-flight (spec §4.5/§5): when a source is declared
 * to cover specific countries and the user explicitly searched a DIFFERENT
 * country, fail fast with an honest coverage explanation instead of a
 * misleading "no results" that implies the source was actually queried.
 * Unknown/unresolvable countries proceed — the source may still serve them.
 */ function coverageError(source, label, location, coverage) {
    const detected = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$countries$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["extractCountryFromLocation"])(location);
    if (!detected) return null;
    if (coverage.countries.some((c)=>c === detected)) return null;
    return {
        kind: 'no_results',
        message: `${label} only covers ${coverage.countries.join(' and ')}. Your search location "${location}" resolves to ${detected}, which this source does not list. ${coverage.note}`
    };
}
/** Discard anything without a business name; attach the search niche. */ function finalizeLeads(leads, source, niche, maxResults) {
    return leads.filter((l)=>l.businessName && l.businessName.trim().length > 1).slice(0, Math.max(1, maxResults)).map((l)=>({
            ...l,
            businessName: l.businessName.trim(),
            niche: l.niche || niche,
            source
        }));
}
async function fetchPlaceDetails(placeId, apiKey) {
    try {
        const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
        url.searchParams.set('place_id', placeId);
        url.searchParams.set('fields', 'name,formatted_address,formatted_phone_number,international_phone_number,website,rating');
        url.searchParams.set('key', apiKey);
        const data = await fetchJson(url.toString());
        if (data.status === 'OK' && data.result) {
            return data.result;
        }
        if (data.status === 'OVER_QUERY_LIMIT') {
            throw Object.assign(new Error('OVER_QUERY_LIMIT'), {
                kind: 'rate_limited'
            });
        }
        return null;
    } catch (err) {
        if (err.kind === 'rate_limited') throw err;
        return null; // details are enrichment-only — the text-search hit is still real
    }
}
async function searchGooglePlaces(niche, location, maxResults, _isBusinessProfile = false // google_business uses the same Places API
) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        return {
            leads: [],
            error: {
                kind: 'not_configured',
                message: 'GOOGLE_MAPS_API_KEY is not set'
            }
        };
    }
    try {
        const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
        url.searchParams.set('query', `${niche} in ${location}`);
        url.searchParams.set('key', apiKey);
        const firstPage = await fetchJson(url.toString());
        // Google Places Text Search paginates via next_page_token — 20 results
        // per page, up to ~60 total. Follow the token until maxResults is reached
        // or the provider is exhausted (spec §3.2).
        const results = [];
        let pageToken;
        let pagesFetched = 0;
        let pageData = firstPage;
        while(pagesFetched < MAX_PROVIDER_PAGES && results.length < Math.max(maxResults, 1)){
            if (pageData.status === 'REQUEST_DENIED') {
                return {
                    leads: [],
                    error: apiError(`Google Places API denied the request: ${cleanText(pageData.error_message) || 'check key restrictions and that the Places API is enabled'}`)
                };
            }
            if (pageData.status === 'OVER_QUERY_LIMIT' || pageData.status === 'RESOURCE_EXHAUSTED') {
                return {
                    leads: [],
                    error: rateLimitError(5)
                };
            }
            if (pagesFetched === 0 && (pageData.status === 'INVALID_REQUEST' || pageData.status === 'ZERO_RESULTS')) {
                return {
                    leads: [],
                    error: {
                        kind: 'no_results',
                        message: `Google Places returned no results for "${niche}" in "${location}"`
                    }
                };
            }
            const pageResults = Array.isArray(pageData.results) ? pageData.results : [];
            results.push(...pageResults);
            pagesFetched++;
            pageToken = typeof pageData.next_page_token === 'string' ? pageData.next_page_token : undefined;
            if (!pageToken) break;
            // Google requires a short delay before the pagination token becomes valid
            await new Promise((r)=>setTimeout(r, 1500));
            const nextUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
            nextUrl.searchParams.set('pagetoken', pageToken);
            nextUrl.searchParams.set('key', apiKey);
            pageData = await fetchJson(nextUrl.toString());
        }
        const capped = results.slice(0, Math.max(maxResults, 1));
        const leads = [];
        for (const place of capped){
            // Place Details adds phone + website (real fields, real API)
            let phone = '';
            let website = '';
            const details = place.place_id ? await fetchPlaceDetails(place.place_id, apiKey) : null;
            if (details) {
                phone = details.formatted_phone_number || details.international_phone_number || '';
                website = details.website || '';
            }
            const addr = cleanText(place.formatted_address);
            const parsed = addr ? splitAddress(addr) : {
                full: ''
            };
            leads.push({
                businessName: cleanText(place.name),
                website: website || undefined,
                phone: phone || undefined,
                rating: typeof place.rating === 'number' ? place.rating : undefined,
                reviews: place.user_ratings_total ? `${place.user_ratings_total} Google reviews` : undefined,
                googleMapsListing: place.place_id ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}` : undefined,
                city: parsed.city || undefined,
                country: parsed.country || undefined,
                address: parsed.full || undefined,
                source: 'google_maps'
            });
            // Gentle pacing between detail calls
            await new Promise((r)=>setTimeout(r, 200));
        }
        const valid = finalizeLeads(leads, 'google_maps', niche, maxResults);
        if (valid.length === 0) {
            return {
                leads: [],
                error: {
                    kind: 'no_results',
                    message: 'Google Places returned results but none had a usable business name and location'
                }
            };
        }
        return {
            leads: valid
        };
    } catch (err) {
        const e = err;
        if (e.kind === 'rate_limited') return {
            leads: [],
            error: rateLimitError(e.retryAfterMinutes ?? 5)
        };
        return {
            leads: [],
            error: apiError(`Google Maps API call failed: ${e.message}`)
        };
    }
}
async function searchYelp(niche, location, maxResults) {
    const apiKey = process.env.YELP_API_KEY;
    if (!apiKey) {
        return {
            leads: [],
            error: {
                kind: 'not_configured',
                message: 'YELP_API_KEY is not set'
            }
        };
    }
    try {
        // Yelp Fusion API supports offset pagination (limit ≤ 50 per request).
        // Fetch successive pages until maxResults is reached or Yelp is exhausted.
        const businesses = [];
        const pageSize = 50;
        let offset = 0;
        while(businesses.length < Math.max(maxResults, 1) && offset < pageSize * MAX_PROVIDER_PAGES){
            const url = new URL('https://api.yelp.com/v3/businesses/search');
            url.searchParams.set('term', niche);
            url.searchParams.set('location', location);
            url.searchParams.set('limit', String(pageSize));
            if (offset > 0) url.searchParams.set('offset', String(offset));
            const data = await fetchJson(url.toString(), {
                headers: {
                    Authorization: `Bearer ${apiKey}`
                }
            });
            const page = Array.isArray(data.businesses) ? data.businesses : [];
            if (page.length === 0) break; // provider exhausted
            businesses.push(...page);
            offset += page.length;
        }
        const leads = businesses.map((b)=>{
            const displayAddress = Array.isArray(b.location?.display_address) ? b.location.display_address.join(', ') : '';
            const categories = Array.isArray(b.categories) ? b.categories.map((c)=>cleanText(c.title)).filter(Boolean).join(', ') : '';
            return {
                businessName: cleanText(b.name),
                phone: cleanText(b.display_phone) || cleanText(b.phone) || undefined,
                // Yelp returns its own listing URL — kept as provenance + in notes,
                // never claimed as the business website
                sourceUrl: b.url || undefined,
                address: displayAddress || undefined,
                city: cleanText(b.location?.city) || undefined,
                country: cleanText(b.location?.country) || undefined,
                rating: typeof b.rating === 'number' ? b.rating : undefined,
                reviews: [
                    b.review_count ? `${b.review_count} Yelp reviews` : '',
                    categories ? `Categories: ${categories}` : '',
                    b.url ? `Yelp listing: ${b.url}` : ''
                ].filter(Boolean).join(' · ') || undefined,
                source: 'yelp'
            };
        });
        const valid = finalizeLeads(leads, 'yelp', niche, maxResults);
        if (valid.length === 0) {
            return {
                leads: [],
                error: {
                    kind: 'no_results',
                    message: `Yelp returned no businesses for "${niche}" in "${location}"`
                }
            };
        }
        return {
            leads: valid
        };
    } catch (err) {
        const e = err;
        if (e.kind === 'rate_limited') return {
            leads: [],
            error: rateLimitError(e.retryAfterMinutes ?? 5)
        };
        return {
            leads: [],
            error: apiError(`Yelp API call failed: ${e.message}`)
        };
    }
}
// ═══════════════════════════════════════════════════════════════════
// LINKEDIN — official Organization Search API
// (client-credentials token → /rest/organizationSearch)
// ═══════════════════════════════════════════════════════════════════
async function getLinkedInToken() {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw Object.assign(new Error('not_configured'), {
            code: 'NOT_CONFIGURED'
        });
    }
    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret
        }),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });
    if (!res.ok) {
        throw new Error(`LinkedIn token endpoint returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = await res.json();
    if (!data.access_token) throw new Error('LinkedIn token response contained no access_token');
    return data.access_token;
}
async function searchLinkedIn(niche, location, maxResults) {
    if (!process.env.LINKEDIN_CLIENT_ID || !process.env.LINKEDIN_CLIENT_SECRET) {
        return {
            leads: [],
            error: {
                kind: 'not_configured',
                message: 'LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET are not set'
            }
        };
    }
    try {
        const token = await getLinkedInToken();
        // Organization Search supports start-offset pagination — follow pages
        // until maxResults is reached or LinkedIn returns no more elements.
        const orgs = [];
        const pageSize = Math.min(Math.max(maxResults, 1), 50);
        let start = 0;
        while(orgs.length < Math.max(maxResults, 1) && start < pageSize * MAX_PROVIDER_PAGES){
            const url = new URL('https://api.linkedin.com/rest/organizationSearch');
            url.searchParams.set('q', 'search');
            url.searchParams.set('keywords', `${niche} ${location}`.trim());
            url.searchParams.set('pageSize', String(pageSize));
            if (start > 0) url.searchParams.set('start', String(start));
            const res = await fetch(url.toString(), {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'LinkedIn-Version': '202405',
                    'X-Restli-Protocol-Version': '2.0.0'
                },
                signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
            });
            const text = await res.text();
            if (res.status === 429) return {
                leads: [],
                error: rateLimitError(10)
            };
            if (!res.ok) {
                // LinkedIn partner-access rejections are common — surface the real error
                return {
                    leads: [],
                    error: apiError(`LinkedIn API rejected the search (HTTP ${res.status}): ${text.slice(0, 250)}. Organization Search usually requires LinkedIn Marketing API partner approval.`)
                };
            }
            let data;
            try {
                data = JSON.parse(text);
            } catch  {
                return {
                    leads: [],
                    error: apiError('LinkedIn API returned a non-JSON response')
                };
            }
            const page = Array.isArray(data.elements) ? data.elements : [];
            if (page.length === 0) break; // provider exhausted
            orgs.push(...page);
            start += page.length;
        }
        const leads = orgs.map((org)=>{
            const loc = org.locations?.[0]?.address;
            // Defensive: some LinkedIn projections include a staff count — keep it
            // when present; never invent one when absent (unknown stays unknown).
            const rawOrg = org;
            const staffRaw = rawOrg.staffCount ?? rawOrg.employeeCount;
            const staffCount = typeof staffRaw === 'number' && Number.isFinite(staffRaw) && staffRaw >= 0 ? Math.round(staffRaw) : null;
            return {
                businessName: cleanText(org.name) || cleanText(org.localizedName),
                website: org.websiteUrl ? normalizeUrl(org.websiteUrl) : undefined,
                linkedin: org.vanityName ? `https://www.linkedin.com/company/${org.vanityName}/` : undefined,
                city: cleanText(loc?.city) || undefined,
                country: cleanText(loc?.country) || undefined,
                reviews: org.description ? cleanText(org.description).slice(0, 300) : undefined,
                employeeCount: staffCount,
                source: 'linkedin'
            };
        });
        const valid = finalizeLeads(leads, 'linkedin', niche, maxResults);
        if (valid.length === 0) {
            return {
                leads: [],
                error: {
                    kind: 'no_results',
                    message: `LinkedIn returned no companies for "${niche}" in "${location}"`
                }
            };
        }
        return {
            leads: valid
        };
    } catch (err) {
        const e = err;
        if (e.code === 'NOT_CONFIGURED') {
            return {
                leads: [],
                error: {
                    kind: 'not_configured',
                    message: 'LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET are not set'
                }
            };
        }
        return {
            leads: [],
            error: apiError(`LinkedIn API call failed: ${e.message}`)
        };
    }
}
// ═══════════════════════════════════════════════════════════════════
// JUSTDIAL — partner API (endpoint URL issued by JustDial onboarding)
// ═══════════════════════════════════════════════════════════════════
/** Recursively pull the first array of object-like records out of a JSON payload. */ function extractRecordArray(data, depth = 0) {
    if (depth > 4 || data === null || typeof data !== 'object') return null;
    if (Array.isArray(data)) {
        return data.length > 0 && typeof data[0] === 'object' ? data : null;
    }
    const priorityKeys = [
        'results',
        'data',
        'listings',
        'businesses',
        'items',
        'records',
        'response'
    ];
    const obj = data;
    for (const key of priorityKeys){
        if (key in obj) {
            const found = extractRecordArray(obj[key], depth + 1);
            if (found) return found;
        }
    }
    for (const value of Object.values(obj)){
        const found = extractRecordArray(value, depth + 1);
        if (found) return found;
    }
    return null;
}
function pickString(record, candidates) {
    for (const key of Object.keys(record)){
        const lower = key.toLowerCase();
        if (candidates.some((c)=>lower === c || lower.includes(c))) {
            const value = cleanText(record[key]);
            if (value) return value;
        }
    }
    return '';
}
async function searchJustDial(niche, location, maxResults) {
    const apiKey = process.env.JUSTDIAL_API_KEY;
    const apiUrl = process.env.JUSTDIAL_API_URL;
    if (!apiKey) {
        return {
            leads: [],
            error: {
                kind: 'not_configured',
                message: 'JUSTDIAL_API_KEY is not set'
            }
        };
    }
    if (!apiUrl) {
        return {
            leads: [],
            error: {
                kind: 'not_configured',
                message: 'JUSTDIAL_API_URL is not set. JustDial issues its partner endpoint URL during API onboarding — add it to your environment variables.'
            }
        };
    }
    if (!/^https?:\/\//i.test(apiUrl)) {
        return {
            leads: [],
            error: {
                kind: 'not_configured',
                message: 'JUSTDIAL_API_URL must be a full https:// endpoint URL as provided by JustDial partner onboarding.'
            }
        };
    }
    try {
        const url = new URL(apiUrl);
        url.searchParams.set('query', `${niche} ${location}`.trim());
        url.searchParams.set('city', location);
        url.searchParams.set('category', niche);
        url.searchParams.set('page', '1');
        const data = await fetchJson(url.toString(), {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'X-Api-Key': apiKey,
                Accept: 'application/json'
            }
        });
        const records = extractRecordArray(data);
        if (!records || records.length === 0) {
            return {
                leads: [],
                error: {
                    kind: 'no_results',
                    message: `JustDial API returned no listings for "${niche}" in "${location}"`
                }
            };
        }
        const leads = records.map((record)=>({
                businessName: pickString(record, [
                    'business_name',
                    'businessname',
                    'name',
                    'title',
                    'company'
                ]),
                phone: pickString(record, [
                    'phone',
                    'mobile',
                    'contact',
                    'telephone'
                ]),
                city: pickString(record, [
                    'city',
                    'locality',
                    'area',
                    'region'
                ]),
                country: 'India',
                address: pickString(record, [
                    'address',
                    'location'
                ]),
                website: normalizeUrl(pickString(record, [
                    'website',
                    'url',
                    'site'
                ])) || undefined,
                rating: (()=>{
                    const raw = pickString(record, [
                        'rating',
                        'stars'
                    ]);
                    const num = parseFloat(raw);
                    return Number.isFinite(num) ? num : undefined;
                })(),
                source: 'justdial'
            }));
        const valid = finalizeLeads(leads, 'justdial', niche, maxResults).filter((l)=>l.city || l.address);
        if (valid.length === 0) {
            return {
                leads: [],
                error: {
                    kind: 'no_results',
                    message: 'JustDial API returned records but none had a usable name and location'
                }
            };
        }
        return {
            leads: valid
        };
    } catch (err) {
        const e = err;
        if (e.kind === 'rate_limited') return {
            leads: [],
            error: rateLimitError(e.retryAfterMinutes ?? 5)
        };
        return {
            leads: [],
            error: apiError(`JustDial API call failed: ${e.message}`)
        };
    }
}
async function searchIndiaMart(niche, location, maxResults) {
    const token = process.env.INDIAMART_API_KEY;
    if (!token) {
        return {
            leads: [],
            error: {
                kind: 'not_configured',
                message: 'INDIAMART_API_KEY is not set'
            }
        };
    }
    try {
        // The official Lead Manager API returns enquiries from the token's own
        // account for a date window (last 7 days) — this is REAL account data.
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
        const query = JSON.stringify({
            mode: 'view',
            q: since
        });
        const data = await fetchJson(`https://mapi.indiamart.com/wserv/crm/enquiry/list/v2/?query=${encodeURIComponent(query)}&access_token=${encodeURIComponent(token)}`, {}, 15000);
        // Error envelope: { Error: "...", CODE: "..." }
        if (typeof data.Error === 'string' && data.Error.trim()) {
            return {
                leads: [],
                error: apiError(`IndiaMart API error: ${data.Error}`)
            };
        }
        const records = extractRecordArray(data);
        if (!records || records.length === 0) {
            return {
                leads: [],
                error: {
                    kind: 'no_results',
                    message: `No IndiaMart enquiries in your account from the last 7 days${niche ? ` matching "${niche}"` : ''}`
                }
            };
        }
        const nicheLower = niche.toLowerCase();
        const nicheWords = nicheLower.split(/\s+/).filter((w)=>w.length > 2);
        const matchesNiche = (enquiry)=>{
            if (!nicheWords.length) return true;
            const haystack = [
                enquiry.QUERY_PRODUCT_NAME,
                enquiry.QUERY_MESSAGE,
                enquiry.QUERY_TYPE
            ].map((v)=>cleanText(v).toLowerCase()).join(' ');
            return nicheWords.some((w)=>haystack.includes(w));
        };
        const leads = records.filter(matchesNiche).map((enquiry)=>({
                businessName: cleanText(enquiry.SENDER_COMPANY) || cleanText(enquiry.SENDER_NAME),
                ownerName: cleanText(enquiry.SENDER_NAME) || undefined,
                email: cleanText(enquiry.SENDER_EMAIL) || undefined,
                phone: cleanText(enquiry.SENDER_MOBILE) || undefined,
                city: cleanText(enquiry.SENDER_CITY) || undefined,
                country: cleanText(enquiry.SENDER_COUNTRY) || 'India',
                address: cleanText(enquiry.SENDER_ADDRESS) || undefined,
                niche: cleanText(enquiry.QUERY_PRODUCT_NAME) || niche,
                reviews: [
                    enquiry.DATE_TIME ? `Enquiry date: ${enquiry.DATE_TIME}` : '',
                    enquiry.QUERY_MESSAGE ? `Message: ${cleanText(enquiry.QUERY_MESSAGE).slice(0, 250)}` : ''
                ].filter(Boolean).join(' · ') || undefined,
                source: 'indiamart'
            }));
        const valid = finalizeLeads(leads, 'indiamart', niche, maxResults);
        if (valid.length === 0) {
            return {
                leads: [],
                error: {
                    kind: 'no_results',
                    message: `Your IndiaMart account has enquiries, but none matched "${niche}" in the last 7 days`
                }
            };
        }
        return {
            leads: valid
        };
    } catch (err) {
        const e = err;
        if (e.kind === 'rate_limited') return {
            leads: [],
            error: rateLimitError(e.retryAfterMinutes ?? 5)
        };
        return {
            leads: [],
            error: apiError(`IndiaMart API call failed: ${e.message}`)
        };
    }
}
async function getFacebookAppToken() {
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const res = await fetch(`https://graph.facebook.com/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&grant_type=client_credentials`, {
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });
    if (!res.ok) {
        throw new Error(`Facebook token endpoint returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = await res.json();
    if (!data.access_token) throw new Error('Facebook token response contained no access_token');
    return data.access_token;
}
async function searchFacebookPages(niche, location, maxResults) {
    if (!process.env.FACEBOOK_APP_ID || !process.env.FACEBOOK_APP_SECRET) {
        return {
            leads: [],
            error: {
                kind: 'not_configured',
                message: 'FACEBOOK_APP_ID / FACEBOOK_APP_SECRET are not set'
            }
        };
    }
    try {
        const token = await getFacebookAppToken();
        // Graph API Pages Search supports cursor pagination (after) — follow it
        // until maxResults is reached or Meta returns no further pages.
        const pages = [];
        let after;
        let pagesFetched = 0;
        while(pages.length < Math.max(maxResults, 1) && pagesFetched < MAX_PROVIDER_PAGES){
            const url = new URL('https://graph.facebook.com/v19.0/pages/search');
            url.searchParams.set('q', `${niche} ${location}`.trim());
            url.searchParams.set('fields', 'name,link,phone,website,category,location');
            url.searchParams.set('limit', String(Math.min(Math.max(maxResults, 1), 100)));
            url.searchParams.set('access_token', token);
            if (after) url.searchParams.set('after', after);
            const data = await fetchJson(url.toString());
            pagesFetched++;
            if (data.error) {
                const err = data.error;
                if (err.code === 4 || err.code === 17 || err.code === 32) {
                    // Preserve earlier pages rather than discarding real results
                    if (pages.length > 0) break;
                    return {
                        leads: [],
                        error: rateLimitError(10)
                    };
                }
                if (pages.length > 0) break; // keep what we honestly fetched
                return {
                    leads: [],
                    error: apiError(`Facebook Graph API error: ${err.message || 'unknown error'}`)
                };
            }
            const page = Array.isArray(data.data) ? data.data : [];
            pages.push(...page);
            const paging = data.paging;
            after = paging?.cursors?.after;
            if (!after || page.length === 0) break; // provider exhausted
        }
        const leads = pages.map((page)=>({
                businessName: cleanText(page.name),
                website: page.website ? normalizeUrl(cleanText(page.website).split(/\s+/)[0]) : undefined,
                phone: cleanText(page.phone) || undefined,
                facebook: page.link ? normalizeUrl(page.link) : undefined,
                sourceUrl: page.link ? normalizeUrl(page.link) : undefined,
                city: cleanText(page.location?.city) || undefined,
                country: cleanText(page.location?.country) || undefined,
                address: cleanText(page.location?.street) || undefined,
                reviews: cleanText(page.category) ? `Category: ${cleanText(page.category)}` : undefined,
                source: 'facebook'
            }));
        const valid = finalizeLeads(leads, 'facebook', niche, maxResults);
        if (valid.length === 0) {
            return {
                leads: [],
                error: {
                    kind: 'no_results',
                    message: `Facebook Pages Search returned no pages for "${niche}" in "${location}"`
                }
            };
        }
        return {
            leads: valid
        };
    } catch (err) {
        const e = err;
        if (e.kind === 'rate_limited') return {
            leads: [],
            error: rateLimitError(e.retryAfterMinutes ?? 5)
        };
        return {
            leads: [],
            error: apiError(`Facebook API call failed: ${e.message}`)
        };
    }
}
async function searchInstagramBusinesses(niche, location, maxResults) {
    if (!process.env.INSTAGRAM_APP_ID) {
        return {
            leads: [],
            error: {
                kind: 'not_configured',
                message: 'INSTAGRAM_APP_ID is not set'
            }
        };
    }
    try {
        // App access token (app id + secret, or app_id|app_secret fallback)
        let token;
        if (process.env.INSTAGRAM_APP_SECRET) {
            const res = await fetch(`https://graph.facebook.com/oauth/access_token?client_id=${encodeURIComponent(process.env.INSTAGRAM_APP_ID)}&client_secret=${encodeURIComponent(process.env.INSTAGRAM_APP_SECRET)}&grant_type=client_credentials`, {
                signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
            });
            const data = await res.json();
            if (!data.access_token) {
                return {
                    leads: [],
                    error: apiError(`Instagram/Meta token error: ${data.error?.message || `HTTP ${res.status}`}`)
                };
            }
            token = data.access_token;
        } else {
            token = `${process.env.INSTAGRAM_APP_ID}|${process.env.INSTAGRAM_APP_SECRET || ''}`;
        }
        const url = new URL('https://graph.facebook.com/v19.0/pages/search');
        url.searchParams.set('q', `${niche} ${location}`.trim());
        url.searchParams.set('fields', 'name,link,username,category,location,instagram_business_account');
        url.searchParams.set('limit', String(Math.min(Math.max(maxResults, 1), 20)));
        url.searchParams.set('access_token', token);
        const data = await fetchJson(url.toString());
        if (data.error) {
            const err = data.error;
            if (err.code === 4 || err.code === 17 || err.code === 32) {
                return {
                    leads: [],
                    error: rateLimitError(10)
                };
            }
            return {
                leads: [],
                error: apiError(`Instagram search via Meta Graph API failed: ${err.message || 'unknown error'}. Business search on Instagram requires an approved Instagram Business token.`)
            };
        }
        const pages = Array.isArray(data.data) ? data.data : [];
        const igPages = pages.filter((p)=>p.instagram_business_account?.id || p.username);
        const leads = igPages.map((page)=>({
                businessName: cleanText(page.name),
                instagram: page.username ? `https://www.instagram.com/${page.username}/` : page.instagram_business_account?.id ? `https://www.instagram.com/${page.instagram_business_account.id}/` : undefined,
                city: cleanText(page.location?.city) || undefined,
                country: cleanText(page.location?.country) || undefined,
                address: cleanText(page.location?.street) || undefined,
                reviews: cleanText(page.category) ? `Category: ${cleanText(page.category)}` : undefined,
                source: 'instagram'
            }));
        const valid = finalizeLeads(leads, 'instagram', niche, maxResults);
        if (valid.length === 0) {
            return {
                leads: [],
                error: {
                    kind: 'no_results',
                    message: `No Instagram-linked business pages found for "${niche}" in "${location}"`
                }
            };
        }
        return {
            leads: valid
        };
    } catch (err) {
        const e = err;
        if (e.kind === 'rate_limited') return {
            leads: [],
            error: rateLimitError(e.retryAfterMinutes ?? 5)
        };
        return {
            leads: [],
            error: apiError(`Instagram API call failed: ${e.message}`)
        };
    }
}
async function scrapeYellowPages(niche, location, maxResults) {
    const coverageErr = coverageError('yellow_pages', 'Yellow Pages', location, {
        countries: [
            'United States'
        ],
        note: 'Try US cities/states, or use AI Search for other countries.'
    });
    if (coverageErr) return {
        leads: [],
        error: coverageErr
    };
    const cheerio = await __turbopack_context__.A("[project]/node_modules/cheerio/dist/esm/index.js [instrumentation] (ecmascript, async loader)");
    const leads = [];
    const target = Math.min(Math.max(maxResults, 1), MAX_SCRAPE_RESULTS);
    // yellowpages.com paginates ~15 per page — fetch as many pages as the
    // target requires (bounded by MAX_PROVIDER_PAGES), 1s apart (anti-rate-limit)
    const pagesToFetch = Math.min(MAX_PROVIDER_PAGES, Math.ceil(target / 15));
    for(let page = 1; page <= pagesToFetch; page++){
        if (leads.length >= target) break;
        const url = new URL('https://www.yellowpages.com/search');
        url.searchParams.set('search_terms', niche);
        url.searchParams.set('geo_location_terms', location);
        if (page > 1) url.searchParams.set('page', String(page));
        try {
            const res = await fetch(url.toString(), {
                headers: {
                    'User-Agent': BROWSER_UA,
                    Accept: 'text/html'
                },
                signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
            });
            if (res.status === 429 || res.status === 503) {
                if (leads.length > 0) break; // keep what we already honestly fetched
                return {
                    leads: [],
                    error: rateLimitError(5)
                };
            }
            if (res.status === 403 || res.status === 401) {
                if (leads.length > 0) break;
                return {
                    leads: [],
                    error: {
                        kind: 'scrape_failed',
                        message: `yellowpages.com blocked this request (HTTP ${res.status}) — the site refuses automated access from this server's IP. No results can be fetched, so no data is shown.`
                    }
                };
            }
            if (!res.ok) {
                if (leads.length > 0) break;
                return {
                    leads: [],
                    error: {
                        kind: 'scrape_failed',
                        message: `yellowpages.com returned HTTP ${res.status}`
                    }
                };
            }
            const html = await res.text();
            const $ = cheerio.load(html);
            $('.result .v-card, .result.v-card').each((_, el)=>{
                if (leads.length >= target) return;
                const card = $(el);
                const name = cleanText(card.find('.business-name').text()) || cleanText(card.find('a.business-name').attr('alt')) || cleanText(card.find('h2').text());
                const phone = cleanText(card.find('.phone').text()).replace(/[^\d()+\-\s]/g, '');
                const street = cleanText(card.find('.street-address').text());
                const locality = cleanText(card.find('.locality').text());
                const region = cleanText(card.find('.adr .region, .region').first().text());
                const website = card.find('a.website').attr('href') || card.find('.links a.track-visit-website').attr('href') || '';
                const categories = card.find('.categories a').map((_, c)=>cleanText($(c).text())).get().filter(Boolean);
                const city = locality || region || undefined;
                const country = 'United States';
                // Provenance: the listing's own detail URL on yellowpages.com
                const detailHref = card.find('a.business-name').attr('href') || card.find('h2 a').attr('href') || '';
                const sourceUrl = detailHref ? `https://www.yellowpages.com${detailHref.startsWith('/') ? detailHref : '/' + detailHref}` : undefined;
                if (name && (city || street)) {
                    leads.push({
                        businessName: name,
                        phone: phone || undefined,
                        website: website ? normalizeUrl(website) : undefined,
                        city,
                        country,
                        address: [
                            street,
                            locality,
                            region
                        ].filter(Boolean).join(', ') || undefined,
                        reviews: categories.length ? `Categories: ${categories.join(', ')}` : undefined,
                        sourceUrl,
                        source: 'yellow_pages'
                    });
                }
            });
            if (page < pagesToFetch) await new Promise((r)=>setTimeout(r, SCRAPE_DELAY_MS));
        } catch (err) {
            if (leads.length > 0) break; // partial real results are still real
            return {
                leads: [],
                error: {
                    kind: 'scrape_failed',
                    message: `Failed to fetch yellowpages.com: ${err.message}`
                }
            };
        }
    }
    const valid = finalizeLeads(leads, 'yellow_pages', niche, maxResults);
    if (valid.length === 0) {
        return {
            leads: [],
            error: {
                kind: 'no_results',
                message: `yellowpages.com scraping returned no usable listings for "${niche}" in "${location}" (the page layout may have changed or the location may not be US-based)`
            }
        };
    }
    return {
        leads: valid
    };
}
async function scrapeSulekha(niche, location, maxResults) {
    const coverageErr = coverageError('sulekha', 'Sulekha', location, {
        countries: [
            'India'
        ],
        note: 'Try Indian cities, or use AI Search for other countries.'
    });
    if (coverageErr) return {
        leads: [],
        error: coverageErr
    };
    const cheerio = await __turbopack_context__.A("[project]/node_modules/cheerio/dist/esm/index.js [instrumentation] (ecmascript, async loader)");
    const target = Math.min(Math.max(maxResults, 1), MAX_SCRAPE_RESULTS);
    // Sulekha listing URLs follow /{service}/{city} — build candidates and try in order
    const slug = (s)=>s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
    const citySlug = location.split(',')[0].trim();
    const candidates = [
        `https://www.sulekha.com/${slug(niche)}/${slug(citySlug)}`,
        `https://www.sulekha.com/${slug(niche)}-in-${slug(citySlug)}`
    ];
    for (const url of candidates){
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': BROWSER_UA,
                    Accept: 'text/html'
                },
                signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
            });
            if (res.status === 429 || res.status === 503) {
                return {
                    leads: [],
                    error: rateLimitError(5)
                };
            }
            if (res.status === 403 || res.status === 401) {
                return {
                    leads: [],
                    error: {
                        kind: 'scrape_failed',
                        message: `sulekha.com blocked this request (HTTP ${res.status}) — the site refuses automated access from this server's IP. No results can be fetched, so no data is shown.`
                    }
                };
            }
            if (!res.ok) continue; // try next URL pattern
            const html = await res.text();
            const $ = cheerio.load(html);
            const leads = [];
            // Listing cards vary — try several known containers
            const cards = $('.listing-item, .list-item, .vendor-card, .sk-card, [class*="listing"]').slice(0, target * 2);
            cards.each((_, el)=>{
                if (leads.length >= target) return;
                const card = $(el);
                const name = cleanText(card.find('h2 a').first().text()) || cleanText(card.find('h3 a').first().text()) || cleanText(card.find('h2, h3').first().text()) || cleanText(card.find('[class*="title"] a, [class*="name"] a').first().text());
                const phone = cleanText(card.find('[class*="phone"], [class*="contact-number"], a[href^="tel:"]').first().text()) || cleanText(card.find('a[href^="tel:"]').first().attr('href') || '').replace('tel:', '');
                const addressText = cleanText(card.find('[class*="address"], [class*="location"], [class*="locality"]').first().text());
                // Provenance: the listing card's own detail URL on sulekha.com
                const detailHref = card.find('h2 a').first().attr('href') || card.find('h3 a').first().attr('href') || card.find('[class*="title"] a').first().attr('href') || '';
                const sourceUrl = detailHref ? detailHref.startsWith('http') ? detailHref : `https://www.sulekha.com${detailHref.startsWith('/') ? detailHref : '/' + detailHref}` : undefined;
                if (name && (addressText || location)) {
                    leads.push({
                        businessName: name,
                        phone: phone.replace(/[^\d()+\-\s]/g, '') || undefined,
                        city: citySlug || undefined,
                        country: 'India',
                        address: addressText || undefined,
                        sourceUrl,
                        source: 'sulekha'
                    });
                }
            });
            if (leads.length > 0) {
                return {
                    leads: finalizeLeads(leads, 'sulekha', niche, maxResults)
                };
            }
        // Page fetched but selectors matched nothing → layout changed; try next candidate
        } catch  {
        // try next URL pattern
        }
    }
    return {
        leads: [],
        error: {
            kind: 'scrape_failed',
            message: `sulekha.com scraping returned no usable listings for "${niche}" in "${location}" (the page layout may have changed or the location was not recognised)`
        }
    };
}
async function runSourceAdapter(source, niche, location, maxResults) {
    switch(source){
        case 'google_maps':
        case 'google_business':
            return searchGooglePlaces(niche, location, maxResults);
        case 'yelp':
            return searchYelp(niche, location, maxResults);
        case 'linkedin':
            return searchLinkedIn(niche, location, maxResults);
        case 'justdial':
            return searchJustDial(niche, location, maxResults);
        case 'indiamart':
            return searchIndiaMart(niche, location, maxResults);
        case 'yellow_pages':
            return scrapeYellowPages(niche, location, maxResults);
        case 'sulekha':
            return scrapeSulekha(niche, location, maxResults);
        case 'facebook':
            return searchFacebookPages(niche, location, maxResults);
        case 'instagram':
            return searchInstagramBusinesses(niche, location, maxResults);
        default:
            return {
                leads: [],
                error: {
                    kind: 'api_error',
                    message: `No real-data adapter exists for source "${source}"`
                }
            };
    }
}
}),
"[project]/src/lib/lead-discovery/verification.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Evidence-Based Verification & Website Classification
//
// Spec §6.2 (website quality labels) and §7.2 (verification labels).
//
// HONESTY RULES (spec §7.2 — never a blanket "verified"):
//   - A website URL found in a business listing is DISCOVERED, not verified.
//   - A website that answered successfully was REACHABLE at check time —
//     that is not proof of ownership or of quality.
//   - A phone/email appearing in one listing is DISCOVERED, not confirmed.
//   - A business present in two independent sources has CORROBORATED
//     identity ("partially_verified") — still not field-level proof.
//   - "verified" is only ever set by an explicit verification workflow
//     (website-service probing with corroboration scoring), never inferred.
// ═══════════════════════════════════════════════════════════════════
// ===== VERIFICATION LABELS (spec §7.2) =====
__turbopack_context__.s([
    "VERIFICATION_LABELS",
    ()=>VERIFICATION_LABELS,
    "VERIFICATION_STATUSES",
    ()=>VERIFICATION_STATUSES,
    "WEBSITE_CATEGORY_LABELS",
    ()=>WEBSITE_CATEGORY_LABELS,
    "classifyWebsite",
    ()=>classifyWebsite,
    "deriveImportVerificationStatus",
    ()=>deriveImportVerificationStatus
]);
const VERIFICATION_STATUSES = [
    'verified',
    'partially_verified',
    'unverified',
    'verification_failed',
    'conflicting'
];
const VERIFICATION_LABELS = {
    verified: 'Verified',
    partially_verified: 'Partially Verified',
    unverified: 'Unverified',
    verification_failed: 'Verification Failed',
    conflicting: 'Conflicting Information'
};
function deriveImportVerificationStatus(corroborated) {
    return corroborated ? 'partially_verified' : 'unverified';
}
const WEBSITE_CATEGORY_LABELS = {
    no_website_found: 'No Website Found',
    website_unreachable: 'Website Unreachable',
    website_health_issue: 'Website Health Issue',
    potential_improvement_opportunity: 'Potential Improvement Opportunity',
    website_appears_functional: 'Website Appears Functional',
    not_yet_verified: 'Not Yet Verified'
};
function classifyWebsite(lead) {
    const evidence = [];
    const url = (lead.website || '').trim();
    const status = (lead.websiteStatus || '').toUpperCase();
    const quality = (lead.websiteQuality || 'none').toLowerCase();
    const score = typeof lead.websiteScore === 'number' ? lead.websiteScore : null;
    // 1. No website known at all
    if (!url && !lead.hasWebsite) {
        if (status === 'NOT_FOUND_AFTER_RESEARCH') {
            evidence.push('Research ran and found no website for this business');
            return {
                category: 'no_website_found',
                label: WEBSITE_CATEGORY_LABELS.no_website_found,
                evidence
            };
        }
        evidence.push('No website URL was discovered by any source');
        return {
            category: 'no_website_found',
            label: WEBSITE_CATEGORY_LABELS.no_website_found,
            evidence
        };
    }
    // 2. A URL exists but probing proved it unreachable/invalid
    if (status === 'INVALID' || status === 'NOT_FOUND_AFTER_RESEARCH') {
        evidence.push(`Website verification result: ${status.toLowerCase().replace(/_/g, ' ')}`);
        return {
            category: 'website_unreachable',
            label: WEBSITE_CATEGORY_LABELS.website_unreachable,
            evidence
        };
    }
    // 3. Website verified reachable — classify by measured evidence
    if (status === 'VERIFIED') {
        evidence.push('Website responded successfully to health checks');
        if (typeof score === 'number') {
            evidence.push(`Measured quality score: ${score}/100 (estimate from automated checks)`);
            if (score >= 70) {
                return {
                    category: 'website_appears_functional',
                    label: WEBSITE_CATEGORY_LABELS.website_appears_functional,
                    evidence
                };
            }
            if (score >= 45) {
                return {
                    category: 'potential_improvement_opportunity',
                    label: WEBSITE_CATEGORY_LABELS.potential_improvement_opportunity,
                    evidence
                };
            }
            return {
                category: 'website_health_issue',
                label: WEBSITE_CATEGORY_LABELS.website_health_issue,
                evidence
            };
        }
        // No measured score — fall back to the coarse quality bucket, labelled as estimate
        evidence.push('Quality bucket from analysis (estimate): ' + quality);
        if (quality === 'high') {
            return {
                category: 'website_appears_functional',
                label: WEBSITE_CATEGORY_LABELS.website_appears_functional,
                evidence
            };
        }
        if (quality === 'low' || quality === 'medium') {
            return {
                category: 'potential_improvement_opportunity',
                label: WEBSITE_CATEGORY_LABELS.potential_improvement_opportunity,
                evidence
            };
        }
        evidence.push('No detailed quality measurement available');
        return {
            category: 'not_yet_verified',
            label: WEBSITE_CATEGORY_LABELS.not_yet_verified,
            evidence
        };
    }
    // 4. Website URL present but never successfully probed
    evidence.push('Website URL discovered but reachability not yet confirmed');
    return {
        category: 'not_yet_verified',
        label: WEBSITE_CATEGORY_LABELS.not_yet_verified,
        evidence
    };
}
}),
"[project]/src/lib/discovery/hard-criteria.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Discovery Hard Criteria (deterministic, AI-independent)
//
// Explicit, objectively-verifiable constraints from a user's natural
// language discovery request (employee ranges, website presence,
// excluded company types) are HARD constraints — never soft preferences.
// This module:
//   1. extractHardCriteria()   — deterministically extracts them from text
//   2. matchHardCriteria()     — validates ONE candidate lead against them
//   3. mergeHardCriteria()     — intersects criteria from two sources
//   4. describeHardCriteria()  — human-readable summary for UI/messages
//
// NOTHING in this module calls an LLM. The validator runs AFTER provider
// results arrive and CANNOT be overridden by AI ranking/relevance scores.
// A company whose employee count is UNKNOWN is NOT a verified match when
// the user explicitly requested an employee range — it is rejected
// (honestly) rather than silently passed through.
// ═══════════════════════════════════════════════════════════════════
// ===== TYPES =====
/** Company types that can be excluded by a hard constraint. */ __turbopack_context__.s([
    "EMPTY_CRITERIA",
    ()=>EMPTY_CRITERIA,
    "describeHardCriteria",
    ()=>describeHardCriteria,
    "describeRejectReason",
    ()=>describeRejectReason,
    "extractEmployeeCriteria",
    ()=>extractEmployeeCriteria,
    "extractExclusions",
    ()=>extractExclusions,
    "extractHardCriteria",
    ()=>extractHardCriteria,
    "extractWebsiteRequirement",
    ()=>extractWebsiteRequirement,
    "hasEmployeeConstraint",
    ()=>hasEmployeeConstraint,
    "hasEnforceableCriteria",
    ()=>hasEnforceableCriteria,
    "matchHardCriteria",
    ()=>matchHardCriteria,
    "mergeHardCriteria",
    ()=>mergeHardCriteria,
    "normalizeCriteriaInput",
    ()=>normalizeCriteriaInput
]);
const EMPTY_CRITERIA = {
    website: 'any',
    excludeTypes: [],
    growthSignals: false,
    hiringSignals: false
};
// ===== EMPLOYEE-COUNT TEXT PARSING =====
/** Number token: "20", "1,000", "10k", "10K", "2.5k" */ const NUM = '(\\d+(?:,\\d{3})+|\\d+(?:\\.\\d+)?k|\\d+)';
const EMPLOYEE_WORDS = '(?:\\s*(?:full[- ]time\\s+)?(?:employees?|staff(?:\\s+members?)?|people|persons?|heads?|headcount|seats)\\b)';
function parseNum(raw) {
    const cleaned = raw.toLowerCase().replace(/,/g, '');
    if (cleaned.endsWith('k')) {
        const v = parseFloat(cleaned.slice(0, -1));
        return Number.isFinite(v) ? Math.round(v * 1000) : NaN;
    }
    const v = parseFloat(cleaned);
    return Number.isFinite(v) ? Math.round(v) : NaN;
}
function extractEmployeeCriteria(text) {
    if (!text) return {};
    // Normalize unicode dashes to hyphen so "20–200" and "20—200" work
    const t = text.replace(/[\u2010-\u2015\u2212]/g, '-');
    let employeeMin;
    let employeeMax;
    let exactEmployeeCount;
    // 1. Explicit ranges: "between 20 and 200", "20 to 200", "20-200"
    const between = new RegExp(`between\\s+${NUM}\\s+and\\s+${NUM}${EMPLOYEE_WORDS}`, 'i').exec(t);
    const toRange = new RegExp(`${NUM}\\s*(?:-|to|through|thru)\\s*${NUM}${EMPLOYEE_WORDS}`, 'i').exec(t);
    if (between) {
        const a = parseNum(between[1]);
        const b = parseNum(between[2]);
        if (Number.isFinite(a) && Number.isFinite(b)) {
            employeeMin = Math.min(a, b);
            employeeMax = Math.max(a, b);
        }
    } else if (toRange) {
        const a = parseNum(toRange[1]);
        const b = parseNum(toRange[2]);
        if (Number.isFinite(a) && Number.isFinite(b)) {
            employeeMin = Math.min(a, b);
            employeeMax = Math.max(a, b);
        }
    }
    // 2. Exact: "exactly 50 employees", "precisely 50 employees"
    if (exactEmployeeCount === undefined && employeeMin === undefined) {
        const exact = new RegExp(`(?:exactly|precisely)\\s+${NUM}${EMPLOYEE_WORDS}`, 'i').exec(t);
        if (exact) {
            const v = parseNum(exact[1]);
            if (Number.isFinite(v)) exactEmployeeCount = v;
        }
    }
    // 3. Upper bounds: "fewer than 100" → max 99; "up to 200" → max 200
    if (employeeMin === undefined && exactEmployeeCount === undefined) {
        const strictMax = new RegExp(`(?:fewer than|less than|under|below)\\s+${NUM}${EMPLOYEE_WORDS}`, 'i').exec(t);
        if (strictMax) {
            const v = parseNum(strictMax[1]);
            if (Number.isFinite(v) && v > 0) employeeMax = v - 1;
        } else {
            const looseMax = new RegExp(`(?:up to|no more than|at most|maximum of|max(?:imum)?)\\s+${NUM}${EMPLOYEE_WORDS}`, 'i').exec(t);
            if (looseMax) {
                const v = parseNum(looseMax[1]);
                if (Number.isFinite(v)) employeeMax = v;
            }
        }
    }
    // 4. Lower bounds: "more than 500" → min 501; "at least 20" → min 20; "500+ employees" → min 500
    if (employeeMax === undefined && exactEmployeeCount === undefined) {
        const strictMin = new RegExp(`(?:more than|over|above|greater than)\\s+${NUM}${EMPLOYEE_WORDS}`, 'i').exec(t);
        const looseMin = strictMin ? null : new RegExp(`(?:at least|minimum of|no fewer than)\\s+${NUM}${EMPLOYEE_WORDS}`, 'i').exec(t);
        const plusMin = strictMin || looseMin ? null : new RegExp(`${NUM}\\s*\\+${EMPLOYEE_WORDS}`, 'i').exec(t);
        if (strictMin) {
            const v = parseNum(strictMin[1]);
            if (Number.isFinite(v)) employeeMin = v + 1;
        } else if (looseMin) {
            const v = parseNum(looseMin[1]);
            if (Number.isFinite(v)) employeeMin = v;
        } else if (plusMin) {
            const v = parseNum(plusMin[1]);
            if (Number.isFinite(v)) employeeMin = v;
        }
    }
    // 5. Bare count: "companies with 50 employees" / "around 50 employees" → exact.
    //    Only used when no other pattern matched, so it can never hijack
    //    the request COUNT ("Find 20 restaurants..." — 20 is not followed
    //    by an employee word).
    if (employeeMin === undefined && employeeMax === undefined && exactEmployeeCount === undefined) {
        const bare = new RegExp(`\\b(?:with|of|around|about|approximately|roughly|sized)\\s+${NUM}${EMPLOYEE_WORDS}`, 'i').exec(t);
        if (bare) {
            const v = parseNum(bare[1]);
            if (Number.isFinite(v)) exactEmployeeCount = v;
        }
    }
    const out = {};
    if (employeeMin !== undefined) out.employeeMin = employeeMin;
    if (employeeMax !== undefined) out.employeeMax = employeeMax;
    if (exactEmployeeCount !== undefined) out.exactEmployeeCount = exactEmployeeCount;
    return out;
}
// ===== EXCLUSION EXTRACTION =====
const EXCLUDE_TYPE_STEMS = [
    {
        type: 'agency',
        stem: 'agenc',
        label: 'agencies'
    },
    {
        type: 'freelancer',
        stem: 'freelanc',
        label: 'freelancers'
    },
    {
        type: 'consultant',
        stem: 'consult',
        label: 'consultants'
    },
    {
        type: 'contractor',
        stem: 'contractor',
        label: 'contractors'
    },
    {
        type: 'reseller',
        stem: 'resell',
        label: 'resellers'
    },
    {
        type: 'distributor',
        stem: 'distribut',
        label: 'distributors'
    }
];
const EXCLUSION_TRIGGER = /\b(?:exclude[sd]?|excluding|exclusion|not|no|never|without|avoid|skip|other than|bar|prohibit)\b/i;
function isInExclusionClause(text, index, window = 60) {
    const start = Math.max(0, index - window);
    return EXCLUSION_TRIGGER.test(text.slice(start, index));
}
function extractExclusions(text) {
    if (!text) return [];
    const out = [];
    for (const { type, stem } of EXCLUDE_TYPE_STEMS){
        const re = new RegExp(`\\b${stem}`, 'gi');
        let m;
        while((m = re.exec(text)) !== null){
            if (isInExclusionClause(text, m.index)) {
                out.push(type);
                break;
            }
        }
    }
    return out;
}
// ===== WEBSITE REQUIREMENT EXTRACTION =====
const PRESENCE_WEBSITE = /\b(?:with|have|has|having|own(?:s|ing)?)\s+(?:a\s+|an\s+|any\s+|their\s+)?(?:professional\s+|modern\s+|working\s+|functional\s+|proper\s+|real\s+|active\s+|official\s+|good\s+|decent\s+)?websites?\b/gi;
const ABSENCE_WEBSITE = /\b(?:without\s+(?:a\s+|any\s+)?|(?:no|zero)\s+)websites?\b/gi;
function extractWebsiteRequirement(text) {
    if (!text) return 'any';
    let decision = 'any';
    const collect = (re, polarity)=>{
        let m;
        while((m = re.exec(text)) !== null){
            const excluded = isInExclusionClause(text, m.index, 70);
            if (polarity === 'presence') {
                decision = excluded ? 'absent' : 'required';
            } else {
                decision = excluded ? 'required' : 'absent';
            }
        }
    };
    collect(PRESENCE_WEBSITE, 'presence');
    collect(ABSENCE_WEBSITE, 'absence');
    return decision;
}
// ===== GROWTH / HIRING (soft) SIGNALS =====
const GROWTH_RE = /\b(?:actively\s+growing|growing|growth|expanding|expansion|scaling|momentum|recent growth)\b/i;
const HIRING_RE = /\b(?:hiring|recruiting|recruitment|job openings?|open roles?|vacanc|adding (?:staff|heads|team members))\b/i;
function extractHardCriteria(text) {
    const employees = extractEmployeeCriteria(text);
    return {
        ...employees,
        website: extractWebsiteRequirement(text),
        excludeTypes: extractExclusions(text),
        growthSignals: GROWTH_RE.test(text),
        hiringSignals: HIRING_RE.test(text)
    };
}
// ===== VALIDATION (the hard gate) =====
/**
 * Parse a provider/LLM employee RANGE string honestly:
 *   "51-100" → { min: 51, max: 100 }
 *   "10,000+" / "10000+" → { min: 10000, max: null }
 *   "1-10" → { min: 1, max: 10 }
 */ function parseEmployeeRange(raw) {
    if (!raw) return null;
    const t = String(raw).replace(/[\u2010-\u2015\u2212]/g, '-').trim();
    const plus = /^(\d[\d,]*)\s*\+/.exec(t);
    if (plus) {
        const v = parseNum(plus[1]);
        return Number.isFinite(v) ? {
            min: v,
            max: null
        } : null;
    }
    const range = /^(\d[\d,]*)\s*-\s*(\d[\d,]*)$/.exec(t);
    if (range) {
        const a = parseNum(range[1]);
        const b = parseNum(range[2]);
        if (Number.isFinite(a) && Number.isFinite(b)) return {
            min: Math.min(a, b),
            max: Math.max(a, b)
        };
    }
    const single = /^(\d[\d,]*)$/.exec(t.replace(/,/g, ''));
    if (single) {
        const v = parseNum(single[1]);
        if (Number.isFinite(v)) return {
            min: v,
            max: v
        };
    }
    return null;
}
function hasEnforceableEmployeeConstraint(c) {
    return c.exactEmployeeCount !== undefined || c.employeeMin !== undefined || c.employeeMax !== undefined;
}
function hasEmployeeConstraint(c) {
    return hasEnforceableEmployeeConstraint(c);
}
function matchHardCriteria(candidate, criteria) {
    if (!hasEnforceableCriteria(criteria)) return {
        match: true
    };
    // ── Employee count ────────────────────────────────────────────────
    if (hasEnforceableEmployeeConstraint(criteria)) {
        const exact = candidate.employeeCount;
        const range = exact === null || exact === undefined || !Number.isFinite(exact) ? parseEmployeeRange(candidate.employeeRange) : null;
        if (exact !== null && exact !== undefined && Number.isFinite(exact)) {
            if (criteria.exactEmployeeCount !== undefined && exact !== criteria.exactEmployeeCount) {
                return {
                    match: false,
                    reason: 'employee_count_mismatch',
                    detail: `employee count ${exact} ≠ requested ${criteria.exactEmployeeCount}`
                };
            }
            if (criteria.employeeMin !== undefined && exact < criteria.employeeMin) {
                return {
                    match: false,
                    reason: 'employee_count_out_of_range',
                    detail: `${exact} employees < minimum ${criteria.employeeMin}`
                };
            }
            if (criteria.employeeMax !== undefined && exact > criteria.employeeMax) {
                return {
                    match: false,
                    reason: 'employee_count_out_of_range',
                    detail: `${exact} employees > maximum ${criteria.employeeMax}`
                };
            }
        } else if (range) {
            const lo = range.min;
            const hi = range.max;
            const reqMin = criteria.exactEmployeeCount ?? criteria.employeeMin ?? 0;
            const reqMax = criteria.exactEmployeeCount ?? criteria.employeeMax ?? Number.POSITIVE_INFINITY;
            // Entirely outside → definite reject
            if (hi !== null && hi < reqMin) {
                return {
                    match: false,
                    reason: 'employee_count_out_of_range',
                    detail: `employee range ${candidate.employeeRange} is below requested minimum ${reqMin}`
                };
            }
            if (lo > reqMax) {
                return {
                    match: false,
                    reason: 'employee_count_out_of_range',
                    detail: `employee range ${candidate.employeeRange} starts above requested maximum ${reqMax}`
                };
            }
            // Fully inside → honest pass
            const fullyInside = lo >= reqMin && hi !== null && hi <= reqMax;
            if (!fullyInside) {
                return {
                    match: false,
                    reason: 'employee_count_unverified',
                    detail: `employee range ${candidate.employeeRange} cannot be verified against the requested bounds`
                };
            }
        } else {
            return {
                match: false,
                reason: 'employee_count_unverified',
                detail: 'employee count unknown — cannot verify against the requested range'
            };
        }
    }
    // ── Website presence ──────────────────────────────────────────────
    if (criteria.website === 'required') {
        const hasSite = Boolean(candidate.website && String(candidate.website).trim());
        if (!hasSite) {
            return {
                match: false,
                reason: 'website_required_missing',
                detail: 'no website found'
            };
        }
    } else if (criteria.website === 'absent') {
        if (candidate.website && String(candidate.website).trim()) {
            return {
                match: false,
                reason: 'website_absent_present',
                detail: 'has a website but none was requested'
            };
        }
    }
    // ── Excluded company types ────────────────────────────────────────
    if (criteria.excludeTypes.length > 0) {
        const haystack = `${candidate.businessName || ''} ${candidate.niche || ''}`.toLowerCase();
        for (const type of criteria.excludeTypes){
            const stem = EXCLUDE_TYPE_STEMS.find((s)=>s.type === type);
            if (stem && new RegExp(`\\b${stem.stem}`, 'i').test(haystack)) {
                return {
                    match: false,
                    reason: 'excluded_company_type',
                    detail: `matches excluded type "${type}"`
                };
            }
        }
    }
    return {
        match: true
    };
}
function hasEnforceableCriteria(c) {
    if (!c) return false;
    return c.exactEmployeeCount !== undefined || c.employeeMin !== undefined || c.employeeMax !== undefined || c.website === 'required' || c.website === 'absent' || Array.isArray(c.excludeTypes) && c.excludeTypes.length > 0;
}
const KNOWN_EXCLUDE_TYPES = new Set(EXCLUDE_TYPE_STEMS.map((s)=>s.type));
function sanitizeExcludeTypes(list) {
    if (!Array.isArray(list)) return [];
    return Array.from(new Set(list.map((v)=>String(v).trim().toLowerCase()).filter((v)=>KNOWN_EXCLUDE_TYPES.has(v))));
}
function sanitizePositiveInt(v, max = 5_000_000) {
    const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN;
    // 0 is never a meaningful employee constraint (a company with "exactly
    // 0 employees" or "0 minimum" would reject every candidate) — treat
    // zero as "no constraint", same as null/undefined/garbage.
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return Math.min(Math.round(n), max);
}
function normalizeCriteriaInput(raw) {
    const r = raw ?? {};
    const websiteRaw = String(r.website ?? 'any').toLowerCase();
    const website = websiteRaw === 'required' || websiteRaw === 'absent' ? websiteRaw : 'any';
    return {
        employeeMin: sanitizePositiveInt(r.employeeMin),
        employeeMax: sanitizePositiveInt(r.employeeMax),
        exactEmployeeCount: sanitizePositiveInt(r.exactEmployeeCount),
        website,
        excludeTypes: sanitizeExcludeTypes(r.excludeTypes),
        growthSignals: r.growthSignals === true,
        hiringSignals: r.hiringSignals === true
    };
}
function mergeHardCriteria(primary, secondary) {
    const employeeMin = primary.employeeMin !== undefined && secondary.employeeMin !== undefined ? Math.max(primary.employeeMin, secondary.employeeMin) : primary.employeeMin ?? secondary.employeeMin;
    const employeeMax = primary.employeeMax !== undefined && secondary.employeeMax !== undefined ? Math.min(primary.employeeMax, secondary.employeeMax) : primary.employeeMax ?? secondary.employeeMax;
    const exactEmployeeCount = primary.exactEmployeeCount ?? secondary.exactEmployeeCount;
    const website = primary.website !== 'any' ? primary.website : secondary.website;
    return {
        employeeMin,
        employeeMax,
        exactEmployeeCount,
        website,
        excludeTypes: Array.from(new Set([
            ...primary.excludeTypes,
            ...secondary.excludeTypes
        ])),
        growthSignals: primary.growthSignals || secondary.growthSignals,
        hiringSignals: primary.hiringSignals || secondary.hiringSignals
    };
}
function describeHardCriteria(c) {
    const parts = [];
    if (c.exactEmployeeCount !== undefined) {
        parts.push(`exactly ${c.exactEmployeeCount} employees`);
    } else if (c.employeeMin !== undefined && c.employeeMax !== undefined) {
        parts.push(`${c.employeeMin}–${c.employeeMax} employees`);
    } else if (c.employeeMin !== undefined) {
        parts.push(`≥ ${c.employeeMin} employees`);
    } else if (c.employeeMax !== undefined) {
        parts.push(`≤ ${c.employeeMax} employees`);
    }
    if (c.website === 'required') parts.push('website required');
    if (c.website === 'absent') parts.push('must have NO website');
    if (c.excludeTypes.length > 0) {
        const labels = c.excludeTypes.map((t)=>EXCLUDE_TYPE_STEMS.find((s)=>s.type === t)?.label ?? t);
        parts.push(`excludes: ${labels.join(', ')}`);
    }
    return parts.join(' · ');
}
function describeRejectReason(reason) {
    switch(reason){
        case 'employee_count_unverified':
            return 'employee count could not be verified';
        case 'employee_count_out_of_range':
            return 'employee count outside the requested range';
        case 'employee_count_mismatch':
            return 'employee count did not match the requested count';
        case 'website_required_missing':
            return 'no website';
        case 'website_absent_present':
            return 'has a website but none was requested';
        case 'excluded_company_type':
            return 'matches an excluded company type';
        default:
            return String(reason);
    }
}
}),
"[project]/src/lib/lead-discovery-service.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildDiscoveryCompletionMessage",
    ()=>buildDiscoveryCompletionMessage,
    "buildSearchQueries",
    ()=>buildSearchQueries,
    "getDiscoveryJobStatus",
    ()=>getDiscoveryJobStatus,
    "listDiscoveryJobs",
    ()=>listDiscoveryJobs,
    "processDiscoveryJob",
    ()=>processDiscoveryJob,
    "sanitizeDiscoveredLeads",
    ()=>sanitizeDiscoveredLeads,
    "startDiscoveryJob",
    ()=>startDiscoveryJob
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Discovery Service
// Phase 7: Lead Discovery Engine + Scraping + Enrichment
//
// Async job-based discovery using z-ai-web-dev-sdk
// Supports: ai_search, google_maps, justdial, indiamart, yelp, etc.
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$credit$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/credit-service.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/lead-audit.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$dedup$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/lead-dedup-service.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$notification$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/notification-service.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$z$2d$ai$2d$web$2d$dev$2d$sdk$2f$dist$2f$index$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/z-ai-web-dev-sdk/dist/index.js [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$discovery$2f$source$2d$registry$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/lead-discovery/source-registry.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$discovery$2f$source$2d$adapters$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/lead-discovery/source-adapters.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$countries$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/countries.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$discovery$2f$verification$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/lead-discovery/verification.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$discovery$2f$hard$2d$criteria$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/discovery/hard-criteria.ts [instrumentation] (ecmascript)");
;
;
;
;
;
;
;
;
;
;
;
// Sources fanned out (in parallel) when the user selects "all".
// Keep in sync with the client-side ALL_SOURCES_COUNT (7).
const ALL_DISCOVERY_SOURCES = [
    'ai_search',
    'google_maps',
    'linkedin',
    'justdial',
    'indiamart',
    'yellow_pages',
    'sulekha'
];
// ===== Z-AI API PACING =====
const sleep = (ms)=>new Promise((r)=>setTimeout(r, ms));
// The z-ai endpoints (web_search AND chat) rate-limit bursts with 429. All
// SDK calls across all jobs share one pacer: minimum spacing between calls
// + retry-with-backoff on 429. This turns burst-failures into slow-but-
// reliable jobs instead of silently-empty extractions.
// (Env-overridable for unit tests: DISCOVERY_ZAI_MIN_INTERVAL_MS=0 removes
// pacing in mocked-provider tests. Production default is unchanged at 4s.)
const ZAI_MIN_INTERVAL_MS = parseInt(process.env.DISCOVERY_ZAI_MIN_INTERVAL_MS || '4000', 10);
const ZAI_RETRY_BACKOFFS_MS = [
    8000,
    15000,
    25000
];
let lastZaiCallAt = 0;
async function pacedZaiCall(fn, retries = ZAI_RETRY_BACKOFFS_MS.length) {
    for(let attempt = 0;; attempt++){
        const now = Date.now();
        const wait = lastZaiCallAt + ZAI_MIN_INTERVAL_MS - now;
        if (wait > 0) await sleep(wait);
        lastZaiCallAt = Date.now();
        try {
            return await fn();
        } catch (err) {
            const retryable = err instanceof Error && /429|too many|rate/i.test(err.message);
            if (retryable && attempt < retries) {
                const backoff = ZAI_RETRY_BACKOFFS_MS[Math.min(attempt, ZAI_RETRY_BACKOFFS_MS.length - 1)];
                console.warn(`[DiscoveryService] z-ai API rate-limited — retrying in ${backoff / 1000}s (attempt ${attempt + 1}/${retries})`);
                await sleep(backoff);
                continue;
            }
            throw err;
        }
    }
}
// ===== CONSTANTS =====
const MAX_CONCURRENT_JOBS = parseInt(process.env.DISCOVERY_MAX_CONCURRENT_JOBS || '3', 10);
/**
 * Default per-job target. Raised 50 → 200 (spec §3.1: do not hardcode a
 * tiny global result limit when providers and the user's plan permit more;
 * still a bounded, rate-limit-respecting ceiling, env-overridable).
 */ const RESULTS_PER_JOB = parseInt(process.env.DISCOVERY_RESULTS_PER_JOB || '200', 10);
const CREDIT_COST_PER_LEAD = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$credit$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["CREDIT_COSTS"].lead_discovery;
/**
 * Error thrown by discoverFromSource carrying the provider's structured
 * error kind — so the job processor can distinguish a genuine zero-result
 * search (kind: 'no_results') from a provider failure / rate limit and
 * complete the job honestly instead of reporting a blanket failure (§3.4).
 */ class DiscoverySourceError extends Error {
    kind;
    retryAfterMinutes;
    constructor(message, kind, retryAfterMinutes){
        super(message);
        this.name = 'DiscoverySourceError';
        this.kind = kind;
        this.retryAfterMinutes = retryAfterMinutes;
    }
}
async function startDiscoveryJob(userId, params, orgId) {
    // Validate params — country is intentionally optional (worldwide search,
    // spec §5: "Support worldwide searches without requiring a country")
    if (!params.niche || !params.source) {
        return {
            jobId: '',
            status: 'failed',
            message: 'Missing required fields: niche, source'
        };
    }
    // ── PRE-FLIGHT SOURCE CHECK ────────────────────────────────────────
    // A source without its real credentials is NEVER run. We refuse the job
    // up-front with the exact configuration message instead of returning
    // fake, mock, or placeholder leads.
    if (params.source !== 'all' && params.source !== 'ai_search') {
        const sourceInfo = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$discovery$2f$source$2d$registry$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["getSourceStatusInfo"])(params.source);
        if (sourceInfo.status !== 'connected') {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["logAuditEvent"])(userId, 'discovery_source_not_configured', {
                source: params.source,
                status: sourceInfo.status,
                missing: sourceInfo.requiredEnvVars.map((v)=>v.name)
            });
            return {
                jobId: '',
                status: 'failed',
                message: sourceInfo.configMessage
            };
        }
    }
    // Check concurrent job limit
    const runningJobs = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].discoveryJob.count({
        where: {
            userId,
            status: {
                in: [
                    'pending',
                    'running'
                ]
            }
        }
    });
    if (runningJobs >= MAX_CONCURRENT_JOBS) {
        return {
            jobId: '',
            status: 'failed',
            message: `Maximum concurrent discovery jobs (${MAX_CONCURRENT_JOBS}) reached. Please wait for existing jobs to complete.`
        };
    }
    // Estimate credits needed (minimum 1)
    const estimatedResults = Math.min(params.maxResults || RESULTS_PER_JOB, RESULTS_PER_JOB);
    const creditsNeeded = estimatedResults * CREDIT_COST_PER_LEAD;
    // Create job record
    const job = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].discoveryJob.create({
        data: {
            userId,
            status: 'pending',
            source: params.source,
            niche: params.niche,
            country: params.country || '',
            city: params.city || null,
            totalFound: 0,
            imported: 0,
            duplicates: 0,
            failed: 0,
            // Persist the effective context/campaign override for explainability
            // (additive nullable column; legacy rows read as no context).
            contextJson: params.context ? JSON.stringify(params.context) : null
        }
    });
    // Audit log
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["logAuditEvent"])(userId, 'discovery_started', {
        jobId: job.id,
        source: params.source,
        niche: params.niche,
        country: params.country,
        city: params.city,
        estimatedResults,
        creditsNeeded
    });
    // Kick off async processing (non-blocking)
    processDiscoveryJob(job.id, userId, params, orgId).catch((err)=>{
        console.error(`[DiscoveryService] Job ${job.id} failed:`, err);
    });
    return {
        jobId: job.id,
        status: 'pending',
        message: `Discovery job started. Estimated ${estimatedResults} leads. Job ID: ${job.id}`
    };
}
async function getDiscoveryJobStatus(jobId, userId) {
    const job = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].discoveryJob.findFirst({
        where: {
            id: jobId,
            userId
        }
    });
    if (!job) return null;
    const resultData = job.resultData ? JSON.parse(job.resultData) : undefined;
    return {
        id: job.id,
        status: job.status,
        source: job.source,
        niche: job.niche,
        country: job.country,
        city: job.city,
        totalFound: job.totalFound,
        imported: job.imported,
        duplicates: job.duplicates,
        failed: job.failed,
        filteredOut: job.filteredOut,
        errorMessage: job.errorMessage,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        resultData
    };
}
async function listDiscoveryJobs(userId, options) {
    const where = {
        userId
    };
    if (options?.status) where.status = options.status;
    const [jobs, total] = await Promise.all([
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].discoveryJob.findMany({
            where,
            orderBy: {
                createdAt: 'desc'
            },
            take: options?.limit || 20,
            skip: options?.offset || 0
        }),
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].discoveryJob.count({
            where
        })
    ]);
    return {
        jobs: jobs.map((job)=>({
                id: job.id,
                status: job.status,
                source: job.source,
                niche: job.niche,
                country: job.country,
                city: job.city,
                totalFound: job.totalFound,
                imported: job.imported,
                duplicates: job.duplicates,
                failed: job.failed,
                filteredOut: job.filteredOut,
                errorMessage: job.errorMessage,
                startedAt: job.startedAt,
                completedAt: job.completedAt,
                createdAt: job.createdAt,
                updatedAt: job.updatedAt
            })),
        total
    };
}
async function processDiscoveryJob(jobId, userId, params, orgId) {
    // Mark as running
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].discoveryJob.update({
        where: {
            id: jobId
        },
        data: {
            status: 'running',
            startedAt: new Date()
        }
    });
    try {
        const maxResults = Math.min(params.maxResults || RESULTS_PER_JOB, RESULTS_PER_JOB);
        // Step 1: Use web search to find businesses
        let zai;
        try {
            zai = await __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$z$2d$ai$2d$web$2d$dev$2d$sdk$2f$dist$2f$index$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["default"].create();
        } catch  {
            throw new Error('Failed to initialize AI SDK. Check API configuration.');
        }
        // Step 1a: Gather discovered leads — single source, or parallel fan-out across
        // all configured sources when the user selected "all" (merged + deduplicated).
        let discoveredLeads = [];
        let skippedSourceNotes = [];
        if (params.source === 'all') {
            // Distribute the per-source quota across the configured sources
            const perSourceLimit = Math.min(Math.max(5, Math.ceil(maxResults / ALL_DISCOVERY_SOURCES.length)), RESULTS_PER_JOB);
            console.log(`[DiscoveryService] "all" mode: fanning out to ${ALL_DISCOVERY_SOURCES.length} sources in parallel (per-source limit ${perSourceLimit})`);
            const settled = await Promise.allSettled(ALL_DISCOVERY_SOURCES.map((src)=>discoverFromSource(zai, {
                    ...params,
                    source: src,
                    maxResults: perSourceLimit
                }, perSourceLimit)));
            // Merge fulfilled results; each lead keeps its own per-source tag.
            // Rejected sources are recorded as honest skip notes (config errors,
            // rate limits, API failures) — they never produce substitute data.
            for(let i = 0; i < settled.length; i++){
                const outcome = settled[i];
                if (outcome.status === 'fulfilled') {
                    discoveredLeads.push(...outcome.value);
                } else {
                    const src = ALL_DISCOVERY_SOURCES[i];
                    const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
                    console.error(`[DiscoveryService] "all" mode: source ${src} skipped:`, reason);
                    skippedSourceNotes.push(`${src}: ${reason}`);
                }
            }
            const beforeDedupe = discoveredLeads.length;
            discoveredLeads = dedupeDiscoveredLeads(discoveredLeads);
            // Keep the merged set bounded so credit usage stays predictable
            discoveredLeads = discoveredLeads.slice(0, Math.max(maxResults, perSourceLimit * 2));
            console.log(`[DiscoveryService] "all" mode: merged ${beforeDedupe} results → ${discoveredLeads.length} unique leads`);
        } else {
            discoveredLeads = await discoverFromSource(zai, params, maxResults);
        }
        // Step 1b: EMPLOYEE-COUNT ENRICHMENT (only when an employee constraint
        // is requested). Per-company targeted searches resolve missing sizes
        // from REAL evidence before validation — so the hard gate has real
        // data to verify instead of rejecting every candidate as unknown.
        const hardCriteria = params.criteria && (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$discovery$2f$hard$2d$criteria$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["hasEnforceableCriteria"])(params.criteria) ? params.criteria : null;
        let filteredOut = 0;
        const filterReasons = new Map();
        if (hardCriteria && (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$discovery$2f$hard$2d$criteria$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["hasEmployeeConstraint"])(hardCriteria)) {
            try {
                const { enriched, enrichedCount } = await enrichLeadEvidence(zai, discoveredLeads, params);
                discoveredLeads = enriched;
                console.log(`[DiscoveryService] enrichment resolved evidence for ${enrichedCount} candidates`);
            } catch (enrichErr) {
                console.error('[DiscoveryService] enrichment failed (continuing with unenriched candidates):', enrichErr);
            }
        }
        // Step 1c: HARD CRITERIA ENFORCEMENT (server-side, deterministic).
        // Runs AFTER provider results are received, BEFORE dedupe/credits/import.
        // This is INDEPENDENT of the AI extraction/ranking — a candidate that
        // violates an explicit hard constraint (or whose employee count cannot
        // be verified when an employee range was requested) is rejected here,
        // even if the AI scored it highly. Fewer verified results is honest;
        // padding the list with unverified companies is not acceptable.
        if (hardCriteria) {
            const beforeCount = discoveredLeads.length;
            const kept = [];
            for (const lead of discoveredLeads){
                const verdict = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$discovery$2f$hard$2d$criteria$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["matchHardCriteria"])(lead, hardCriteria);
                if (verdict.match) {
                    kept.push(lead);
                } else {
                    filteredOut++;
                    const reason = verdict.reason || 'employee_count_unverified';
                    filterReasons.set(reason, (filterReasons.get(reason) || 0) + 1);
                }
            }
            discoveredLeads = rankVerifiedLeads(kept);
            console.log(`[DiscoveryService] hard criteria (${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$discovery$2f$hard$2d$criteria$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["describeHardCriteria"])(hardCriteria)}): ${beforeCount} candidates → ${discoveredLeads.length} verified, ${filteredOut} rejected`);
        }
        // Step 2: Deduplicate and import leads
        let imported = 0;
        let duplicates = 0;
        let failedCount = 0;
        // Evidence-based verification tally (spec §7.2): the summary must state
        // HOW the stored verification labels were derived, never a blanket
        // "verified" claim. Corroboration by 2+ sources → partially_verified;
        // single-source imports stay unverified until a real verification
        // workflow assesses them.
        let partiallyVerifiedCount = 0;
        let unverifiedCount = 0;
        // Bounded, evidence-based website reachability checks (no AI, no
        // credits, fail-open). Findings are stored per lead as an evidence note
        // (+ websiteStatus on success) — a failed probe is recorded as an
        // observation that may be temporary, never as a permanent judgment.
        let websiteProbes = new Map();
        try {
            websiteProbes = await probeWebsitesForEvidence(discoveredLeads);
            if (websiteProbes.size > 0) {
                console.log(`[DiscoveryService] website reachability probes: ${websiteProbes.size} domain(s) checked`);
            }
        } catch (probeErr) {
            console.warn('[DiscoveryService] website probe step failed (continuing without probe evidence):', probeErr instanceof Error ? probeErr.message : probeErr);
        }
        for (const leadData of discoveredLeads){
            try {
                // Check for duplicates
                const dupCheck = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$dedup$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["checkDuplicate"])(userId, {
                    businessName: leadData.businessName,
                    website: leadData.website,
                    email: leadData.email,
                    phone: leadData.phone
                });
                if (dupCheck.isDuplicate) {
                    duplicates++;
                    // Preserve useful information from the duplicate listing instead of
                    // discarding it (spec §8): fill empty fields + provenance. Non-
                    // destructive, idempotent, never overwrites existing values.
                    if (dupCheck.duplicateOf) {
                        await mergeFillDuplicate(dupCheck.duplicateOf, leadData);
                    }
                    continue;
                }
                // Deduct credit for this lead. Idempotency key = job + position,
                // so a retried/replayed job can NEVER double-charge the same slot
                // (spec §12: usage accounting must be idempotent).
                const creditResult = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$credit$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["deductCredits"])({
                    userId,
                    action: 'lead_discovery',
                    cost: CREDIT_COST_PER_LEAD,
                    referenceId: jobId,
                    idempotencyKey: `${jobId}:lead:${imported}`
                });
                if (!creditResult.success) {
                    failedCount++;
                    continue;
                }
                // Canonical country (spec §5 normalization) — falls back to the raw
                // value when it cannot be confidently resolved, never guesses.
                const rawCountry = leadData.country || params.country;
                const canonicalCountry = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$countries$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["normalizeCountryName"])(rawCountry) || rawCountry;
                // Honest import-time verification label: corroboration by 2+
                // independent sources during this run → partially_verified;
                // everything else → unverified (discovered, not yet assessed).
                const importVerificationStatus = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$discovery$2f$verification$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["deriveImportVerificationStatus"])(!!leadData.corroborated);
                if (importVerificationStatus === 'partially_verified') partiallyVerifiedCount++;
                else unverifiedCount++;
                // Website probe evidence for THIS lead (when its domain was probed)
                let websiteStatus = null;
                let probeNote = '';
                if (leadData.website) {
                    let host = null;
                    try {
                        host = new URL(leadData.website).host.replace(/^www\./, '');
                    } catch  {
                        host = null;
                    }
                    const probe = host ? websiteProbes.get(host) : undefined;
                    if (probe?.reachable) {
                        // The site answered — that is real, time-stamped evidence.
                        websiteStatus = 'VERIFIED';
                        probeNote = `Website responded to discovery reachability check on ${new Date().toISOString().slice(0, 10)} (${probe.detail}).`;
                    } else if (probe) {
                        probeNote = `Website did not respond during discovery check on ${new Date().toISOString().slice(0, 10)} (${probe.detail}) — may be a temporary or regional issue, not yet verified.`;
                    }
                }
                try {
                    // Create lead — tag with the lead's own source so "all" mode shows the real origin
                    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.create({
                        data: {
                            userId,
                            orgId: orgId || null,
                            businessName: leadData.businessName,
                            ownerName: leadData.ownerName || null,
                            website: leadData.website || null,
                            email: leadData.email || null,
                            phone: leadData.phone || null,
                            whatsapp: leadData.whatsapp || null,
                            linkedin: leadData.linkedin || null,
                            instagram: leadData.instagram || null,
                            facebook: leadData.facebook || null,
                            googleMapsListing: leadData.googleMapsListing || null,
                            reviews: leadData.reviews || null,
                            rating: leadData.rating || null,
                            city: leadData.city || params.city || null,
                            country: canonicalCountry,
                            niche: leadData.niche || params.niche,
                            source: leadData.source || params.source,
                            stage: 'discovered',
                            hasWebsite: !!leadData.website,
                            employeeCount: typeof leadData.employeeCount === 'number' && Number.isFinite(leadData.employeeCount) ? Math.round(leadData.employeeCount) : null,
                            employeeRange: leadData.employeeRange || null,
                            sourceUrl: leadData.sourceUrl || null,
                            discoveredVia: leadData.discoveredVia || null,
                            verificationStatus: importVerificationStatus,
                            notes: [
                                leadData.address ? `Address: ${leadData.address}` : '',
                                probeNote
                            ].filter(Boolean).join(' ') || null,
                            websiteStatus
                        }
                    });
                } catch (createErr) {
                    // The lead was NOT saved — the credit must not be kept (spec §12:
                    // never charge for a failed operation). Idempotent deduction means
                    // the refund plus key makes retries safe.
                    failedCount++;
                    console.error(`[DiscoveryService] Failed to import lead — refunding credit:`, createErr);
                    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$credit$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["refundCredits"])({
                        userId,
                        amount: CREDIT_COST_PER_LEAD,
                        originalAction: 'lead_discovery',
                        referenceId: jobId,
                        // Same slot identity as the deduction — a retried/replayed job can
                        // never double-refund the same lead slot (one charge ↔ one refund).
                        idempotencyKey: `${jobId}:lead:${imported}:refund`
                    }).catch((refundErr)=>{
                        console.error('[DiscoveryService] Credit refund failed (ledger keeps reference):', refundErr);
                    });
                    continue;
                }
                imported++;
            } catch (leadErr) {
                failedCount++;
                console.error(`[DiscoveryService] Failed to import lead:`, leadErr);
            }
        }
        // Update job as completed — filteredOut records honest rejection counts
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].discoveryJob.update({
            where: {
                id: jobId
            },
            data: {
                status: 'completed',
                totalFound: discoveredLeads.length,
                imported,
                duplicates,
                failed: failedCount,
                filteredOut,
                resultData: JSON.stringify(discoveredLeads.slice(0, 100)),
                completedAt: new Date()
            }
        });
        // Audit log — includes the verification tally for traceability
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["logAuditEvent"])(userId, 'discovery_completed', {
            jobId,
            source: params.source,
            totalFound: discoveredLeads.length,
            imported,
            duplicates,
            failed: failedCount,
            verificationTally: {
                partially_verified: partiallyVerifiedCount,
                unverified: unverifiedCount
            }
        });
        // User-facing notification (deduped per discovery job) — HONEST counts:
        // the summary distinguishes corroboration-based "partially verified"
        // from single-source "not yet verified" and never calls AI-discovered
        // records "verified" (spec §7.2: verification requires a method).
        const summaryMessage = buildDiscoveryCompletionMessage({
            source: params.source || '',
            imported,
            partiallyVerified: partiallyVerifiedCount,
            unverified: unverifiedCount,
            duplicates,
            filteredOut,
            filterReasonFragments: hardCriteria && filterReasons.size > 0 ? Array.from(filterReasons.entries()).slice(0, 3).map(([r, n])=>`${n} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$discovery$2f$hard$2d$criteria$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["describeRejectReason"])(r)}`) : [],
            skippedSourceFragments: skippedSourceNotes.map((n)=>n.split(':')[0].trim()).filter(Boolean)
        });
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$notification$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["createNotificationOnce"])({
            userId,
            type: 'discovery_completed',
            title: 'Lead discovery completed',
            message: summaryMessage,
            actionUrl: imported > 0 ? '/business-ai/leads' : '/business-ai/discover',
            metadata: {
                jobId,
                source: params.source,
                totalFound: discoveredLeads.length,
                imported,
                duplicates,
                failed: failedCount,
                filteredOut,
                verificationTally: {
                    partially_verified: partiallyVerifiedCount,
                    unverified: unverifiedCount
                }
            },
            dedupeKey: `discovery:${jobId}:completed`
        }).catch(()=>{
        // Never fail the discovery path because of a notification problem
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        // ══ HONEST OUTCOME CLASSIFICATION (spec §3.4) ═════════════════
        // A provider that answered "no results" is NOT a failure. Blanket-
        // failing genuine zero-result searches is exactly what produced the
        // old misleading "No suitable leads found" behavior.
        if (error instanceof DiscoverySourceError && error.kind === 'no_results') {
            const reason = `No results: ${errorMessage}`;
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].discoveryJob.update({
                where: {
                    id: jobId
                },
                data: {
                    status: 'completed',
                    totalFound: 0,
                    imported: 0,
                    duplicates: 0,
                    failed: 0,
                    filteredOut: 0,
                    errorMessage: reason,
                    completedAt: new Date()
                }
            });
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["logAuditEvent"])(userId, 'discovery_completed_empty', {
                jobId,
                source: params.source,
                reason: errorMessage
            });
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$notification$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["createNotificationOnce"])({
                userId,
                type: 'discovery_completed',
                title: 'Lead discovery completed — no results',
                message: `No matching businesses were returned: ${errorMessage}`,
                actionUrl: '/business-ai/discover',
                metadata: {
                    jobId,
                    source: params.source,
                    totalFound: 0,
                    imported: 0
                },
                dedupeKey: `discovery:${jobId}:completed`
            }).catch(()=>{
            // Never fail the discovery path because of a notification problem
            });
            return;
        }
        // Provider failure / rate limit / infrastructure error — job failed,
        // with a truthful, actionable message (retry window when known).
        const friendlyMessage = error instanceof DiscoverySourceError && error.kind === 'rate_limited' ? `${errorMessage}${error.retryAfterMinutes ? ` (retry in ~${error.retryAfterMinutes} min)` : ''}` : errorMessage;
        // Update job as failed
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].discoveryJob.update({
            where: {
                id: jobId
            },
            data: {
                status: 'failed',
                errorMessage: friendlyMessage,
                completedAt: new Date()
            }
        });
        // Audit log
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["logAuditEvent"])(userId, 'discovery_failed', {
            jobId,
            source: params.source,
            error: errorMessage
        });
        // User-facing notification — safe message only (the raw error stays in
        // the job record / audit log, never in the notification text).
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$notification$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["createNotificationOnce"])({
            userId,
            type: 'discovery_failed',
            title: 'Lead discovery failed',
            message: `The discovery run for ${params.source || 'your sources'} could not be completed. Please try again from the Discover page.`,
            actionUrl: '/business-ai/discover',
            metadata: {
                jobId,
                source: params.source
            },
            dedupeKey: `discovery:${jobId}:failed`
        }).catch(()=>{
        // Never fail the discovery path because of a notification problem
        });
    }
}
// ===== SEARCH QUERY BUILDER =====
/**
 * REAL-DATA-ONLY dispatcher for one source.
 *  - ai_search        → built-in AI web search (existing z-ai flow, real results)
 *  - every other source → the source's real adapter (official API or live scraping)
 *
 * Throws on failure so single-source jobs fail with the exact provider error
 * (config missing / rate limited / API error) and "all"-mode fan-out records
 * the source as skipped. Fake or placeholder data is NEVER returned.
 */ async function discoverFromSource(zai, params, maxResults) {
    if (params.source === 'ai_search') {
        return sanitizeDiscoveredLeads(await searchSourceLeads(zai, params, maxResults), params, maxResults);
    }
    const searchLocation = [
        params.city,
        params.country
    ].filter(Boolean).join(', ');
    const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$discovery$2f$source$2d$adapters$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["runSourceAdapter"])(params.source, params.niche, searchLocation, maxResults);
    if (result.error) {
        // Surface the exact, honest reason — preserving the structured kind so
        // the job processor can distinguish "genuinely no results" from "provider
        // failed / rate limited" (spec §3.4) instead of a blanket failure.
        throw new DiscoverySourceError(result.error.message, result.error.kind, result.error.retryAfterMinutes);
    }
    return sanitizeDiscoveredLeads(result.leads, params, maxResults);
}
function sanitizeDiscoveredLeads(leads, params, maxResults) {
    const seen = new Set();
    const out = [];
    const requestedCountry = params.country ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$countries$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["normalizeCountryName"])(params.country)?.toLowerCase() || null : null;
    for (const lead of leads){
        const name = (lead.businessName || '').trim();
        if (!name || name.length < 2) continue;
        // Malformed identity guard: a "business name" that is actually a URL,
        // an email address, or a >120-char fragment is extraction noise, not a
        // real business. Conservative — only unambiguous junk is dropped.
        const lowered = name.toLowerCase();
        if (lowered.includes('http://') || lowered.includes('https://') || lowered.startsWith('www.') || lowered.includes('@') || name.length > 120) {
            continue;
        }
        // Geography contradiction: the candidate EXPLICITLY states a country
        // that is different from the requested one. When either side cannot be
        // confidently canonicalized, the check is skipped (never guesses).
        if (requestedCountry && lead.country) {
            const candidateCountry = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$countries$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["normalizeCountryName"])(lead.country)?.toLowerCase() || null;
            if (candidateCountry && candidateCountry !== requestedCountry) {
                continue;
            }
        }
        const key = `${name.toLowerCase()}|${(lead.phone || lead.website || lead.city || '').toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
            ...lead,
            businessName: name,
            source: lead.source || params.source
        });
        if (out.length >= maxResults) break;
    }
    return out;
}
/**
 * Deterministic ranking of VALIDATED leads (runs after hard-criteria
 * enforcement, before import):
 *   1. Leads with a verified exact employeeCount first, then range-only,
 *      then unknown — most verifiable evidence first.
 *   2. Within each tier: higher rating first, then leads with a website.
 * The ordering is stable, so results are reproducible for the same input.
 */ function rankVerifiedLeads(leads) {
    const evidenceTier = (lead)=>typeof lead.employeeCount === 'number' && Number.isFinite(lead.employeeCount) ? 0 : lead.employeeRange ? 1 : 2;
    return [
        ...leads
    ].sort((a, b)=>{
        const tier = evidenceTier(a) - evidenceTier(b);
        if (tier !== 0) return tier;
        const rating = (b.rating ?? 0) - (a.rating ?? 0);
        if (rating !== 0) return rating;
        return (b.website ? 1 : 0) - (a.website ? 1 : 0);
    });
}
// ===== DUPLICATE MERGE-FILL (spec §8) =====
/**
 * Fill ONLY empty fields on an existing lead from a duplicate discovery
 * result. Never overwrites existing (stronger) evidence with incoming
 * (weaker) evidence — non-conflicting merge only. Idempotent: running
 * again changes nothing. Preserves the duplicate listing's provenance in
 * notes and upgrades verification when the second sighting comes from a
 * DIFFERENT source (independent corroboration, spec §7.2).
 */ async function mergeFillDuplicate(leadId, incoming) {
    try {
        const existing = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.findUnique({
            where: {
                id: leadId
            }
        });
        if (!existing) return;
        const data = {};
        if (!existing.email && incoming.email) data.email = incoming.email;
        if (!existing.phone && incoming.phone) data.phone = incoming.phone;
        if (!existing.website && incoming.website) {
            data.website = incoming.website;
            data.hasWebsite = true;
        }
        if (!existing.sourceUrl && incoming.sourceUrl) data.sourceUrl = incoming.sourceUrl;
        if (incoming.employeeCount != null && Number.isFinite(incoming.employeeCount) && existing.employeeCount == null) {
            data.employeeCount = Math.round(incoming.employeeCount);
        }
        if (incoming.employeeRange && !existing.employeeRange) {
            data.employeeRange = incoming.employeeRange;
        }
        // Independent corroboration: same identity, different source
        if (existing.verificationStatus === 'unverified' && incoming.source && existing.source && existing.source !== incoming.source) {
            data.verificationStatus = 'partially_verified';
        }
        const mergedSomething = Object.keys(data).length > 0;
        if (!mergedSomething) return;
        // Bounded provenance note (never overwrite the user's own notes)
        const provenance = `Re-sighted via ${incoming.source}${incoming.sourceUrl ? ` — ${incoming.sourceUrl}` : ''}; merged non-conflicting fields only.`;
        const currentNotes = existing.notes || '';
        data.notes = (currentNotes ? `${currentNotes} | ` : '') + provenance;
        if (data.notes.length > 2000) {
            data.notes = data.notes.slice(-2000);
        }
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.update({
            where: {
                id: leadId
            },
            data
        });
    } catch (mergeErr) {
        // Merge-fill is best-effort: the duplicate is still counted, never fatal
        console.warn('[DiscoveryService] merge-fill skipped:', mergeErr instanceof Error ? mergeErr.message : mergeErr);
    }
}
// ===== WEBSITE REACHABILITY PROBE (spec §6: evidence-based, bounded) =====
const WEBSITE_PROBE_TIMEOUT_MS = 4000;
const WEBSITE_PROBE_MAX_PER_JOB = parseInt(process.env.DISCOVERY_WEBSITE_PROBE_MAX || '20', 10);
/**
 * Probe ONE website for network reachability. ANY HTTP response (including
 * 401/403 bot blocks and 5xx) counts as "reachable" — the server answered.
 * Only network-level failures (DNS, refused, TLS, timeout) are unreachable.
 * A temporary failure is never stored as a permanent judgment: the evidence
 * note explicitly says the site may be temporarily unavailable.
 */ async function probeWebsiteOnce(url) {
    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(WEBSITE_PROBE_TIMEOUT_MS),
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; AcquisitionOS-Bot/1.0; +https://acquisitionos.com)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            redirect: 'follow'
        });
        return {
            reachable: true,
            detail: `HTTP ${response.status}`
        };
    } catch (err) {
        const detail = err instanceof Error ? err.name === 'TimeoutError' || /timeout|abort/i.test(err.message) ? 'timed out' : err.message.slice(0, 120) : 'network error';
        return {
            reachable: false,
            detail
        };
    }
}
/**
 * Bounded reachability check for discovered leads that HAVE a website:
 * sequential, domain-deduplicated, capped per job (fail-open — any probe
 * problem never blocks the import). No AI calls, no credits.
 */ async function probeWebsitesForEvidence(leads, maxProbes = WEBSITE_PROBE_MAX_PER_JOB) {
    const byDomain = new Map();
    for (const lead of leads){
        const site = (lead.website || '').trim();
        if (!site) continue;
        try {
            const host = new URL(site).host.replace(/^www\./, '');
            if (!byDomain.has(host)) byDomain.set(host, site);
        } catch  {
        // Unparseable URL — skip probing; the lead keeps its raw website value
        }
    }
    const outcomes = new Map();
    let probed = 0;
    for (const [host, url] of byDomain){
        if (probed >= maxProbes) break;
        probed++;
        outcomes.set(host, await probeWebsiteOnce(url));
        await sleep(300); // small stagger between probes
    }
    return outcomes;
}
function buildDiscoveryCompletionMessage(s) {
    const source = s.source || 'your sources';
    if (s.imported <= 0) {
        let message = `Discovery finished for ${source} — no leads were imported this time.`;
        if (s.filteredOut > 0) {
            message += ` ${s.filteredOut} candidate${s.filteredOut === 1 ? '' : 's'} rejected by hard filters${s.filterReasonFragments.length ? ' — ' + s.filterReasonFragments.slice(0, 3).join(', ') : ''}.`;
        }
        if (s.skippedSourceFragments.length > 0) {
            message += ` Skipped: ${s.skippedSourceFragments.slice(0, 3).join(', ')}${s.skippedSourceFragments.length > 3 ? ` +${s.skippedSourceFragments.length - 3} more` : ''}.`;
        }
        return message;
    }
    const parts = [
        `Discovery finished: ${s.imported} lead${s.imported === 1 ? '' : 's'} imported from ${source}`
    ];
    if (s.partiallyVerified > 0 || s.unverified > 0) {
        parts.push(`${s.partiallyVerified} partially verified (same business seen in 2+ sources), ${s.unverified} not yet verified (single source — pending assessment)`);
    }
    if (s.duplicates > 0) parts.push(`${s.duplicates} duplicate${s.duplicates === 1 ? '' : 's'} skipped`);
    let message = parts.join(' — ') + '.';
    if (s.filteredOut > 0) {
        message += ` Hard filters rejected ${s.filteredOut} candidate${s.filteredOut === 1 ? '' : 's'}${s.filterReasonFragments.length ? ' — ' + s.filterReasonFragments.slice(0, 3).join(', ') : ''}.`;
    }
    if (s.skippedSourceFragments.length > 0) {
        message += ` Skipped: ${s.skippedSourceFragments.slice(0, 3).join(', ')}${s.skippedSourceFragments.length > 3 ? ` +${s.skippedSourceFragments.length - 3} more` : ''}.`;
    }
    return message;
}
// ===== LEAD EVIDENCE ENRICHMENT =====
/**
 * Resolve missing hard-constraint data (employee count, website) for
 * candidates via targeted per-company web searches.
 *
 * The generic provider (web search) has no native employee filter, and list
 * pages rarely expose each company's size or URL in its snippet. Without
 * this step nearly every candidate arrives with employeeCount = null and
 * website = null, and an explicit "20-200 employees + website" request
 * would (honestly) reject almost everything.
 *
 * Honesty guarantees:
 *   - values come ONLY from explicit statements in real search evidence;
 *   - the enrichment LLM is forbidden from estimating/averaging/guessing;
 *   - evidence that states nothing leaves the field UNKNOWN, which the
 *     hard validator then rejects — we never fabricate a passing value.
 */ async function enrichLeadEvidence(zai, leads, params, maxCandidates = 30, batchSize = 5) {
    const needIndexes = [];
    leads.forEach((lead, idx)=>{
        const needsSize = lead.employeeCount == null && !lead.employeeRange;
        const needsSite = !lead.website;
        if (needsSize || needsSite) needIndexes.push(idx);
    });
    if (needIndexes.length === 0) {
        return {
            enriched: leads,
            enrichedCount: 0
        };
    }
    const capped = needIndexes.slice(0, maxCandidates);
    const updates = new Map();
    const sleep = (ms)=>new Promise((r)=>setTimeout(r, ms));
    // One evidence search per candidate. All SDK calls go through the shared
    // job-wide pacer (pacedZaiCall), which spaces calls out and retries 429s.
    async function searchEvidence(lead) {
        const query = `"${lead.businessName}" ${params.niche} official website employees company size headcount`;
        try {
            const res = await pacedZaiCall(()=>zai.functions.invoke('web_search', {
                    query,
                    num: 5
                }));
            return Array.isArray(res) ? res : [];
        } catch (err) {
            console.error(`[DiscoveryService] evidence search failed for "${lead.businessName}":`, err instanceof Error ? err.message : err);
            return [];
        }
    }
    for(let i = 0; i < capped.length; i += batchSize){
        const batch = capped.slice(i, i + batchSize);
        // Gather REAL evidence for each company in the batch (staggered, retry-on-429)
        const evidences = [];
        for(let j = 0; j < batch.length; j++){
            const lead = leads[batch[j]];
            if (j > 0) await sleep(1200); // stagger to stay under the rate limit
            try {
                evidences.push({
                    status: 'fulfilled',
                    value: await searchEvidence(lead)
                });
            } catch  {
                evidences.push({
                    status: 'rejected'
                });
            }
        }
        const evidenceText = batch.map((leadIdx, j)=>{
            const lead = leads[leadIdx];
            const ev = evidences[j];
            if (ev.status !== 'fulfilled' || !Array.isArray(ev.value) || ev.value.length === 0) {
                return `[company ${j + 1}: ${lead.businessName}]\n(no search evidence found)`;
            }
            const rows = ev.value.slice(0, 5).map((r)=>`- ${(r.name || '').slice(0, 120)}: ${(r.snippet || '').slice(0, 300)} (${r.url || ''})`).join('\n');
            return `[company ${j + 1}: ${lead.businessName}]\n${rows}`;
        }).join('\n\n');
        try {
            const response = await pacedZaiCall(()=>zai.chat.completions.create({
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a precise data extraction assistant. Return only valid JSON arrays. NEVER invent, estimate, or average values — extract only what the evidence explicitly states.'
                        },
                        {
                            role: 'user',
                            content: `For each company below, extract its official website and current employee count from the search evidence ONLY.
Rules:
- website: the company's OWN official website URL (e.g. https://acme.io) if it is clearly identifiable from the evidence (its domain appearing as the company's site, a LinkedIn/company-directory entry linking to it). Otherwise null. Never return a marketplace, news article, or job-board URL.
- employeeCount/employeeRange: use ONLY explicit statements of employee count / headcount / company size (e.g. "85 employees", "51-200 employees", "10,000+ employees"). Exact number → employeeCount (employeeRange null). Only a range → employeeRange as that exact string (employeeCount null).
- NEVER estimate or guess. If the evidence does not state a value, return null for that field.
Return ONLY a JSON array with one object per company, in the same order as given: {"website": string|null, "employeeCount": number|null, "employeeRange": string|null}

${evidenceText}`
                        }
                    ],
                    model: 'auto',
                    // Deterministic evidence extraction — never creative
                    temperature: 0
                }));
            let cleaned = (response.choices?.[0]?.message?.content || '[]').trim();
            if (cleaned.startsWith('```')) {
                cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
            }
            const arr = JSON.parse(cleaned);
            if (Array.isArray(arr)) {
                batch.forEach((leadIdx, j)=>{
                    const item = arr[j];
                    if (!item) return;
                    const ec = typeof item.employeeCount === 'number' && Number.isFinite(item.employeeCount) && item.employeeCount > 0 ? Math.round(item.employeeCount) : null;
                    const er = typeof item.employeeRange === 'string' && item.employeeRange.trim() ? item.employeeRange.trim().slice(0, 40) : null;
                    const site = typeof item.website === 'string' && /^https?:\/\//i.test(item.website.trim()) ? item.website.trim() : null;
                    // Deterministic anti-misattribution guard: only accept a resolved
                    // website when the domain clearly corresponds to the company name
                    // ("Juro" → juro.com ✓, "Juro" → rfp.wiki ✗). Prevents enrichment
                    // from attaching a directory/news domain to a company.
                    let guardedSite = null;
                    if (site) {
                        try {
                            const host = new URL(site).hostname.replace(/^www\./, '');
                            const domainRoot = host.split('.').slice(-2).join('.');
                            const nameToken = leads[leadIdx].businessName.toLowerCase().replace(/[^a-z0-9]/g, '');
                            const domainToken = domainRoot.replace(/[^a-z0-9]/g, '');
                            if (nameToken.length >= 4 && domainToken.includes(nameToken)) {
                                guardedSite = site;
                            }
                        } catch  {
                            guardedSite = null;
                        }
                    }
                    if (ec !== null || er !== null || guardedSite !== null) {
                        updates.set(leadIdx, {
                            employeeCount: ec,
                            employeeRange: er,
                            website: guardedSite
                        });
                    }
                });
            }
        } catch (err) {
            console.error('[DiscoveryService] evidence enrichment batch failed:', err);
        }
    }
    const enriched = [
        ...leads
    ];
    let enrichedCount = 0;
    for (const [idx, data] of updates){
        const lead = enriched[idx];
        // Fill ONLY missing values — never overwrite data the provider gave us
        enriched[idx] = {
            ...lead,
            employeeCount: lead.employeeCount ?? data.employeeCount,
            employeeRange: lead.employeeRange ?? data.employeeRange,
            website: lead.website || data.website || undefined
        };
        enrichedCount++;
    }
    console.log(`[DiscoveryService] evidence enrichment: ${capped.length} candidates looked up, ${enrichedCount} resolved with evidence`);
    return {
        enriched,
        enrichedCount
    };
}
/**
 * Run web-search + LLM extraction for ONE source. Used directly for single-source
 * jobs and per-source inside the "all" parallel fan-out.
 */ async function searchSourceLeads(zai, params, maxResults) {
    const discoveredLeads = [];
    const searchQueries = buildSearchQueries(params);
    const sleep = (ms)=>new Promise((r)=>setTimeout(r, ms));
    // The web_search provider rate-limits bursts (429). Searches run with a
    // stagger and retry-with-backoff so a full job completes reliably.
    async function searchOnce(query, num) {
        return pacedZaiCall(()=>zai.functions.invoke('web_search', {
                query,
                num
            }));
    }
    for(let qi = 0; qi < searchQueries.length; qi++){
        const query = searchQueries[qi];
        if (discoveredLeads.length >= maxResults) break;
        try {
            // Web search
            const searchResults = await searchOnce(query, Math.min(20, maxResults - discoveredLeads.length));
            console.log(`[DiscoveryService] "${query}" → ${searchResults.length} search results`);
            if (searchResults.length === 0) continue;
            // Extract structured lead data from search results using LLM
            let leadsFromResults = await extractLeadsFromSearchResults(zai, searchResults, params, maxResults - discoveredLeads.length);
            // The extraction LLM is stochastic: for list/directory-style results it
            // sometimes over-excludes and returns []. One relaxed retry keeps
            // recall usable WITHOUT ever inventing data — the relaxed prompt still
            // reports unknown sizes/counts as null and the hard validator remains
            // the final gate.
            if (leadsFromResults.length === 0) {
                leadsFromResults = await extractLeadsFromSearchResults(zai, searchResults, params, maxResults - discoveredLeads.length, true);
            }
            // Record which search variation produced each lead (spec §3.3 provenance).
            // Leads extracted from this query keep the query text; never overwrite
            // a provenance tag set by a more specific inner step.
            discoveredLeads.push(...leadsFromResults.map((l)=>({
                    ...l,
                    discoveredVia: l.discoveredVia ?? query
                })));
        } catch (searchErr) {
            console.error(`[DiscoveryService] Search query failed: "${query}"`, searchErr);
        // Continue with next query
        }
    }
    return discoveredLeads;
}
/**
 * Cross-source deduplication for "all" mode — merges results from parallel
 * sources and removes duplicates by website, email or normalized business name.
 * ALSO records cross-source corroboration: when the same business identity is
 * returned by 2+ different sources, the lead is tagged `corroborated: true`
 * (spec §7.2 — corroboration is identity confidence, never field-level proof).
 */ function dedupeDiscoveredLeads(leads) {
    const seen = new Set();
    const unique = [];
    /** Key -> set of distinct sources that returned it (for corroboration). */ const keySources = new Map();
    const normalizeName = (name)=>name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizeSite = (site)=>site ? site.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') : '';
    const keysFor = (lead)=>[
            lead.website ? `site:${normalizeSite(lead.website)}` : '',
            lead.email ? `email:${lead.email.toLowerCase()}` : '',
            `name:${normalizeName(lead.businessName)}`
        ].filter(Boolean);
    for (const lead of leads){
        const keys = keysFor(lead);
        // Track which sources contributed to this identity
        for (const k of keys){
            if (!keySources.has(k)) keySources.set(k, new Set());
            keySources.get(k).add(lead.source);
        }
        // A lead is a duplicate if any of its keys was already seen
        if (keys.some((k)=>seen.has(k))) continue;
        keys.forEach((k)=>seen.add(k));
        unique.push(lead);
    }
    // Corroborated = identity surfaced from 2+ independent sources
    for (const lead of unique){
        const sources = new Set();
        for (const k of keysFor(lead)){
            for (const src of keySources.get(k) ?? [])sources.add(src);
        }
        if (sources.size >= 2) {
            lead.corroborated = true;
            // Provenance upgrade: record the independent sources explicitly
            lead.discoveredVia = `corroborated by: ${Array.from(sources).sort().join(' + ')}`;
        }
    }
    return unique;
}
/**
 * Bounded, intent-preserving query expansion (spec §3.3). Adds industry
 * synonyms and standard commercial phrasings — NEVER unrelated industries —
 * so a niche with thin first-query recall still fills the requested result
 * count without drifting from the user's intent. Hard-capped at 10 queries.
 */ const NICHE_SYNONYMS = {
    dental: [
        'dentist',
        'dental clinic',
        'orthodontist'
    ],
    healthcare: [
        'medical clinic',
        'doctor office',
        'health center'
    ],
    clinic: [
        'medical clinic',
        'health center'
    ],
    restaurant: [
        'restaurants',
        'dining',
        'eatery'
    ],
    cafe: [
        'coffee shop',
        'café'
    ],
    gym: [
        'fitness center',
        'fitness studio'
    ],
    fitness: [
        'gym',
        'personal trainer'
    ],
    salon: [
        'hair salon',
        'beauty salon'
    ],
    spa: [
        'day spa',
        'wellness center'
    ],
    hotel: [
        'hotels',
        'boutique hotel'
    ],
    'real estate': [
        'real estate agency',
        'realtor',
        'property agency'
    ],
    legal: [
        'law firm',
        'attorney office'
    ],
    lawyer: [
        'law firm',
        'attorney'
    ],
    accounting: [
        'accounting firm',
        'CPA firm'
    ],
    construction: [
        'construction company',
        'contractor'
    ],
    automotive: [
        'auto repair shop',
        'car dealership'
    ],
    'e-commerce': [
        'online store',
        'ecommerce company'
    ],
    manufacturing: [
        'manufacturer',
        'factory'
    ],
    logistics: [
        'logistics company',
        'freight company'
    ],
    education: [
        'training institute',
        'tutoring center'
    ],
    marketing: [
        'marketing agency',
        'digital marketing agency'
    ],
    software: [
        'software company',
        'SaaS company'
    ],
    it: [
        'IT services company',
        'IT company'
    ]
};
/**
 * Expand a niche into synonymous/commercial variants, preserving intent.
 * Returns at most 3 synonyms, only when known — no generic padding.
 *
 * REVERSE LOOKUP: the map is keyed by the canonical niche ("dental"), but
 * users type the variant ("dentist"). When the requested niche matches one
 * of the map's synonym VALUES, its key and sibling synonyms are returned —
 * otherwise niches like "dentist" or "restaurants" (a value of "restaurant")
 * expand to nothing and the job runs with only the 4 base queries, capping
 * real volume at ~40 raw results (the provider returns 10 per query).
 */ function nicheVariants(niche) {
    const key = niche.toLowerCase().trim();
    if (NICHE_SYNONYMS[key]) return NICHE_SYNONYMS[key];
    for (const [canonical, variants] of Object.entries(NICHE_SYNONYMS)){
        if (variants.includes(key)) {
            // Siblings first (same industry, different phrasing), then the
            // canonical key itself — bounded to 3 like the forward lookup.
            const siblings = variants.filter((v)=>v !== key);
            return [
                ...siblings,
                canonical
            ].slice(0, 3);
        }
    }
    return [];
}
function buildSearchQueries(params) {
    const { niche, country, city, source } = params;
    // Worldwide-safe location string (spec §5): pieces that exist are joined;
    // when neither is provided the queries run location-free.
    const location = [
        city,
        country
    ].filter(Boolean).join(', ');
    const queries = [];
    switch(source){
        case 'ai_search':
            {
                queries.push(`${niche} businesses${location ? ` in ${location}` : ''}`);
                queries.push(`${niche} companies ${location} contact details`.replace(/\s+/g, ' '));
                queries.push(`best ${niche} services${location ? ` in ${location}` : ''} reviews`);
                // Intent-preserving expansion (spec §3.3): synonyms of the SAME
                // industry, not unrelated industries. Each variant reaches provider
                // pages the primary phrasing misses, materially raising recall.
                for (const variant of nicheVariants(niche)){
                    queries.push(`${variant} businesses in ${location}`);
                    queries.push(`${variant} ${location} contact details`);
                }
                // Directory/list phrasing surfaces company-list pages that single-
                // result pages miss — still strictly on-niche and on-location.
                queries.push(`${niche} companies directory list ${location}`.replace(/\s+/g, ' '));
                break;
            }
        case 'google_maps':
            queries.push(`site:maps.google.com ${niche} ${location}`);
            queries.push(`${niche} near ${location} google maps`);
            break;
        case 'justdial':
            queries.push(`site:justdial.com ${niche} ${location}`);
            break;
        case 'indiamart':
            queries.push(`site:indiamart.com ${niche} ${location}`);
            break;
        case 'yelp':
            queries.push(`site:yelp.com ${niche} ${location}`);
            break;
        case 'yellow_pages':
            queries.push(`site:yellowpages.com ${niche} ${location}`);
            break;
        case 'sulekha':
            queries.push(`site:sulekha.com ${niche} ${location}`);
            break;
        case 'linkedin':
            queries.push(`site:linkedin.com/company ${niche} ${location}`);
            break;
        case 'instagram':
            queries.push(`site:instagram.com ${niche} business ${location}`);
            break;
        case 'facebook':
            queries.push(`site:facebook.com ${niche} business ${location}`);
            break;
        default:
            queries.push(`${niche} businesses in ${location}`);
    }
    // NOTE: requirements (e.g. "no website") are intentionally NOT appended to the
    // search queries — doing so pollutes the queries with marketing-agency pages and
    // kills recall. They are passed to the LLM extraction prompt instead, which
    // prioritizes/filters businesses matching the requirements.
    //
    // EXCEPTION — explicit EMPLOYEE-COUNT criteria: when the user requested an
    // employee range/count as a hard constraint, size-targeted queries ARE added
    // — and run FIRST, because they are the ones that surface pages stating
    // company sizes (directories, company lists, LinkedIn-size pages), which is
    // what makes the subsequent hard validation able to VERIFY employee counts
    // instead of rejecting everything as unknown. The provider rate-limits
    // bursts, so the most valuable queries must not be last.
    const c = params.criteria;
    if (c && (c.exactEmployeeCount !== undefined || c.employeeMin !== undefined || c.employeeMax !== undefined)) {
        const reqMin = c.exactEmployeeCount ?? c.employeeMin ?? 0;
        const reqMax = c.exactEmployeeCount ?? c.employeeMax ?? Number.POSITIVE_INFINITY;
        // Standard company-size buckets (the labels directories like LinkedIn/
        // Wellfound/gregslist actually print in their snippets). Quoting them
        // ("51-200 employees") surfaces pages whose snippets name companies
        // WITH sizes — the highest-yield search strategy for size-verified
        // discovery. Only buckets intersecting the requested range are used.
        const BUCKETS = [
            {
                label: '1-10',
                min: 1,
                max: 10
            },
            {
                label: '11-50',
                min: 11,
                max: 50
            },
            {
                label: '51-200',
                min: 51,
                max: 200
            },
            {
                label: '201-500',
                min: 201,
                max: 500
            },
            {
                label: '501-1,000',
                min: 501,
                max: 1000
            },
            {
                label: '1,001-5,000',
                min: 1001,
                max: 5000
            },
            {
                label: '5,001-10,000',
                min: 5001,
                max: 10000
            },
            {
                label: '10,000+',
                min: 10000,
                max: null
            }
        ];
        const overlapping = BUCKETS.filter((b)=>b.min <= reqMax && (b.max === null || b.max >= reqMin)).slice(0, 2);
        const sizeDesc = c.exactEmployeeCount !== undefined ? `exactly ${c.exactEmployeeCount} employees` : c.employeeMin !== undefined && c.employeeMax !== undefined ? `${c.employeeMin}-${c.employeeMax} employees` : c.employeeMin !== undefined ? `more than ${c.employeeMin} employees` : `fewer than ${c.employeeMax} employees`;
        const sizeQueries = overlapping.map((b)=>`${niche} companies in ${location} "${b.label} employees"`);
        sizeQueries.push(`mid-size ${niche} companies ${location} employee count ${sizeDesc}`);
        queries.unshift(...sizeQueries);
    }
    // Provider rate limits make every query cost ~4s of pacing — keep the
    // total bounded so a job cannot run unbounded, while still leaving room
    // for expansion. The most valuable (size-targeted) queries run first.
    return queries.slice(0, 10);
}
// ===== LLM EXTRACTION =====
async function extractLeadsFromSearchResults(zai, searchResults, params, maxLeads, relaxed = false) {
    if (searchResults.length === 0) return [];
    const resultsText = searchResults.slice(0, 20).map((r, i)=>`[${i + 1}] Name: ${r.name}\n    URL: ${r.url}\n    Snippet: ${r.snippet}`).join('\n\n');
    // Hard criteria make the extraction itself strict — but the FINAL gate is
    // the deterministic validator (matchHardCriteria), which the LLM cannot
    // influence. Unknown employee counts must be reported honestly as null.
    const c = params.criteria;
    const hardFilterLines = [];
    if (c) {
        if (c.exactEmployeeCount !== undefined) {
            hardFilterLines.push(`- Employee count: EXACTLY ${c.exactEmployeeCount} employees (inclusive). A company with any other employee count MUST NOT be included.`);
        } else if (c.employeeMin !== undefined && c.employeeMax !== undefined) {
            hardFilterLines.push(`- Employee count: between ${c.employeeMin} and ${c.employeeMax} (inclusive). A company with fewer than ${c.employeeMin} or more than ${c.employeeMax} employees MUST NOT be included.`);
        } else if (c.employeeMin !== undefined) {
            hardFilterLines.push(`- Employee count: at least ${c.employeeMin}. A company with fewer employees MUST NOT be included.`);
        } else if (c.employeeMax !== undefined) {
            hardFilterLines.push(`- Employee count: at most ${c.employeeMax}. A company with more employees MUST NOT be included.`);
        }
        if (c.excludeTypes.length > 0) {
            hardFilterLines.push(`- Excluded company types (MUST NOT be included under any circumstances): ${c.excludeTypes.join(', ')}.`);
        }
        if (c.website === 'required') {
            hardFilterLines.push('- Website: REQUIRED. Only include businesses that have a real website URL.');
        } else if (c.website === 'absent') {
            hardFilterLines.push('- Website: must be ABSENT. Only include businesses WITHOUT a website.');
        }
    }
    const hardFilterBlock = hardFilterLines.length > 0 ? `HARD FILTERS (a business that CONTRADICTS any of these MUST NOT appear in your output — e.g. evidence shows a clearly larger/smaller company size than the range, or the business IS an excluded type, or it clearly has no website):
${hardFilterLines.join('\n')}
IMPORTANT — do NOT over-exclude: if a business plausibly matches the niche and hard filters but its employee count or website is NOT VISIBLE in the snippets, still INCLUDE it with employeeCount: null / employeeRange: null / website: null. A later verification step looks up missing evidence. NEVER GUESS a value, and NEVER exclude a business merely because its size is unknown — exclude it ONLY when the evidence CONTRADICTS a filter.` : '';
    const softSignalBlock = c && (c.growthSignals || c.hiringSignals) ? `SOFT PREFERENCES (rank higher, never reject): ${[
        c.growthSignals ? 'recent growth / expansion signals' : '',
        c.hiringSignals ? 'hiring or recruiting activity' : ''
    ].filter(Boolean).join(', ')}.` : '';
    const strictnessBlock = relaxed ? `The previous extraction pass returned nothing. This is a SECOND, more inclusive pass:
- Extract EVERY concrete business/company named in the results that fits the NICHE and is not an obviously excluded type.
- Review/directory platforms (e.g. G2, Capterra) and media sites are NOT businesses of the niche — skip those.
- If a size or website is not visible, include the business with employeeCount: null / employeeRange: null / website: null.
- NEVER invent a value.` : `Enforce the HARD FILTERS strictly, but do NOT over-exclude: unknown size/website is NOT a reason to exclude — include with nulls and let the verification step decide.`;
    const prompt = `You are a business lead extraction assistant. Extract structured business lead data from the search results below.

NICHE: ${params.niche}
COUNTRY: ${params.country}
CITY: ${params.city || 'Not specified'}
TARGET SOURCE: ${params.source}
QUALIFYING REQUIREMENTS: ${params.requirements || 'None — accept all matching businesses'}
${hardFilterBlock ? `\n${hardFilterBlock}\n` : ''}${softSignalBlock ? `\n${softSignalBlock}\n` : ''}
${strictnessBlock}

SEARCH RESULTS:
${resultsText}

Extract each business as a JSON object with these fields:
- businessName (required): The business/company name
- ownerName: Owner or key contact person name if mentioned
- website: Business website URL if available
- email: Business email if found
- phone: Phone number if found
- whatsapp: WhatsApp number if different from phone
- linkedin: LinkedIn page URL
- instagram: Instagram page URL  
- facebook: Facebook page URL
- googleMapsListing: Google Maps URL if available
- reviews: Review count or summary if mentioned
- rating: Rating (number) if mentioned
- employeeCount: (number or null) The business's ACTUAL employee count, but ONLY if explicitly stated in the search results (e.g. "85 employees", "headcount: 120"). NEVER estimate or invent this number. If not stated, use null.
- employeeRange: (string or null) If the results only give an employee RANGE (e.g. "51-100", "201-500", "10,000+"), put that exact range string here and set employeeCount to null.
- city: City if different from search
- country: Country if different from search

${hardFilterBlock ? 'Enforce the HARD FILTERS strictly. ' : ''}Prioritize businesses that match the qualifying requirements and soft preferences when present.
Return ONLY a JSON array of objects. No explanation, no markdown.
If no businesses found, return empty array [].
Maximum ${maxLeads} results.`;
    try {
        const response = await pacedZaiCall(()=>zai.chat.completions.create({
                messages: [
                    {
                        role: 'system',
                        content: 'You are a precise data extraction assistant. Return only valid JSON arrays. No markdown, no explanations.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                model: 'auto',
                // Data extraction must be deterministic — sampling variance was
                // producing wildly different candidate yields between runs.
                temperature: 0
            }));
        const content = response.choices?.[0]?.message?.content || '[]';
        // Parse the LLM response - handle potential markdown wrapping
        let cleaned = content.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }
        const parsed = JSON.parse(cleaned);
        if (!Array.isArray(parsed)) return [];
        // Validate and normalize each lead
        const normalized = parsed.filter((lead)=>lead.businessName && typeof lead.businessName === 'string').slice(0, maxLeads).map((lead)=>({
                businessName: String(lead.businessName).trim(),
                ownerName: lead.ownerName ? String(lead.ownerName).trim() : undefined,
                website: lead.website ? normalizeUrl(String(lead.website)) : undefined,
                email: lead.email ? String(lead.email).trim().toLowerCase() : undefined,
                phone: lead.phone ? String(lead.phone).trim() : undefined,
                whatsapp: lead.whatsapp ? String(lead.whatsapp).trim() : undefined,
                linkedin: lead.linkedin ? normalizeUrl(String(lead.linkedin)) : undefined,
                instagram: lead.instagram ? normalizeUrl(String(lead.instagram)) : undefined,
                facebook: lead.facebook ? normalizeUrl(String(lead.facebook)) : undefined,
                googleMapsListing: lead.googleMapsListing ? normalizeUrl(String(lead.googleMapsListing)) : undefined,
                reviews: lead.reviews ? String(lead.reviews).trim() : undefined,
                rating: typeof lead.rating === 'number' ? lead.rating : undefined,
                employeeCount: typeof lead.employeeCount === 'number' && Number.isFinite(lead.employeeCount) && lead.employeeCount >= 0 ? Math.round(lead.employeeCount) : null,
                employeeRange: typeof lead.employeeRange === 'string' && lead.employeeRange.trim() ? lead.employeeRange.trim().slice(0, 40) : null,
                city: lead.city ? String(lead.city).trim() : undefined,
                country: lead.country ? String(lead.country).trim() : undefined,
                niche: params.niche,
                source: params.source
            }));
        console.log(`[DiscoveryService] LLM extraction: ${normalized.length} candidates (raw ${Array.isArray(parsed) ? parsed.length : 0}, cap ${maxLeads})`);
        if (normalized.length === 0) {
            // Observability: an empty extraction must be distinguishable from an
            // API failure or an unexpected response shape.
            console.log(`[DiscoveryService] extraction empty — raw content (${content.length} chars): ${content.slice(0, 300)}`);
        }
        return normalized;
    } catch (parseErr) {
        console.error('[DiscoveryService] LLM extraction failed:', parseErr);
        return [];
    }
}
// ===== UTILITIES =====
function normalizeUrl(url) {
    let normalized = url.trim();
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
        normalized = 'https://' + normalized;
    }
    return normalized;
}
}),
"[project]/src/lib/lead-resolution.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "canUserAccessLead",
    ()=>canUserAccessLead,
    "resolveLeadForExecution",
    ()=>resolveLeadForExecution,
    "userMessageForLeadFailure",
    ()=>userMessageForLeadFailure
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Single Reliable Lead Resolution Path (executions)
//
// Every AI / workflow execution that operates on a lead MUST resolve
// the lead through this module. Rules:
//
//   1. The lead identifier ALWAYS comes from the trusted execution
//      context (UI → API → workflow/pipeline context). It is never
//      generated, inferred, or chosen by an AI model.
//   2. Resolution is OWNER-SCOPED (userId) + active + not soft-deleted —
//      the same rule the prospect pipeline has always applied.
//      Execution paths never expand authorization to org-shared leads;
//      org sharing is a VIEW concern handled by /api/leads/[id].
//   3. Failures are distinguished SERVER-SIDE for diagnosis
//      (LEAD_ID_MISSING / LEAD_NOT_FOUND / LEAD_ACCESS_DENIED /
//      LEAD_LOOKUP_ERROR) but the user-facing message stays generic
//      ("Lead not found") — internal details are never exposed.
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [instrumentation] (ecmascript)");
;
function userMessageForLeadFailure(reason) {
    return 'Lead not found';
}
function canUserAccessLead(lead, user) {
    return lead.userId === user.id || !!user.orgId && !!lead.orgId && lead.orgId === user.orgId;
}
function isValidLeadId(leadId) {
    return typeof leadId === 'string' && leadId.trim().length > 0 && leadId.length <= 64;
}
async function resolveLeadForExecution(userId, leadId, opts) {
    // 1. Validate the lead id
    if (!isValidLeadId(leadId) || !userId) {
        console.warn(`[LeadResolution] LEAD_ID_MISSING: userId=${userId || 'NONE'} leadId=${String(leadId).slice(0, 64) || 'NONE'}`);
        return {
            ok: false,
            reason: 'LEAD_ID_MISSING',
            userMessage: userMessageForLeadFailure('LEAD_ID_MISSING')
        };
    }
    try {
        // 2. Owner-scoped lookup (id + userId + active + not deleted)
        const lead = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.findFirst({
            where: {
                id: leadId,
                userId,
                isActive: true,
                deletedAt: null
            },
            ...opts?.include ? {
                include: opts.include
            } : {},
            ...opts?.select ? {
                select: opts.select
            } : {}
        });
        if (lead) return {
            ok: true,
            lead: lead
        };
        // 3. Distinguish NOT_FOUND vs ACCESS_DENIED — server-side logs only
        const existing = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.findUnique({
            where: {
                id: leadId
            },
            select: {
                userId: true,
                isActive: true,
                deletedAt: true
            }
        });
        if (!existing) {
            console.warn(`[LeadResolution] LEAD_NOT_FOUND: no lead with id=${leadId} (requested by user=${userId})`);
            return {
                ok: false,
                reason: 'LEAD_NOT_FOUND',
                userMessage: userMessageForLeadFailure('LEAD_NOT_FOUND')
            };
        }
        if (existing.userId !== userId) {
            console.warn(`[LeadResolution] LEAD_ACCESS_DENIED: lead=${leadId} belongs to user=${existing.userId}, requester=${userId}`);
            return {
                ok: false,
                reason: 'LEAD_ACCESS_DENIED',
                userMessage: userMessageForLeadFailure('LEAD_ACCESS_DENIED')
            };
        }
        // Lead exists and is owned, but is inactive or soft-deleted
        console.warn(`[LeadResolution] LEAD_NOT_FOUND: lead=${leadId} is inactive or deleted (isActive=${existing.isActive}, deletedAt=${existing.deletedAt}) for user=${userId}`);
        return {
            ok: false,
            reason: 'LEAD_NOT_FOUND',
            userMessage: userMessageForLeadFailure('LEAD_NOT_FOUND')
        };
    } catch (err) {
        console.error(`[LeadResolution] LEAD_LOOKUP_ERROR: lead=${leadId} user=${userId}`, err);
        return {
            ok: false,
            reason: 'LEAD_LOOKUP_ERROR',
            userMessage: userMessageForLeadFailure('LEAD_LOOKUP_ERROR')
        };
    }
}
}),
"[project]/src/lib/email-ethereal.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Email & Auth Credential Helpers
 *
 * ALL Ethereal / preview-email code has been REMOVED.
 * The email service now ONLY uses real providers:
 *   1. Resend (if a real API key is configured)
 *   2. Nodemailer SMTP (Gmail SMTP via SMTP_USER / SMTP_PASSWORD)
 *
 * If neither is configured, sendEmail() throws a clear error.
 * There is ZERO fallback to any preview / test inbox.
 *
 * Env vars (read from Secrets panel):
 *   SMTP_HOST       = smtp.gmail.com
 *   SMTP_PORT       = 587
 *   SMTP_USER       = <real Gmail address>
 *   SMTP_PASSWORD   = <16-char Gmail App Password>
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 */ /**
 * Check whether REAL Resend is configured (non-placeholder API key).
 */ __turbopack_context__.s([
    "getGoogleClientId",
    ()=>getGoogleClientId,
    "getGoogleClientSecret",
    ()=>getGoogleClientSecret,
    "getSmtpFrom",
    ()=>getSmtpFrom,
    "getSmtpHost",
    ()=>getSmtpHost,
    "getSmtpPassword",
    ()=>getSmtpPassword,
    "getSmtpPort",
    ()=>getSmtpPort,
    "getSmtpUser",
    ()=>getSmtpUser,
    "isEmailProviderAvailable",
    ()=>isEmailProviderAvailable,
    "isEtherealMode",
    ()=>isEtherealMode,
    "isRealGoogleConfigured",
    ()=>isRealGoogleConfigured,
    "isRealResendConfigured",
    ()=>isRealResendConfigured,
    "isRealSmtpConfigured",
    ()=>isRealSmtpConfigured,
    "logSmtpEnvAliases",
    ()=>logSmtpEnvAliases
]);
function isRealResendConfigured() {
    const key = process.env.RESEND_API_KEY;
    return !!key && !key.startsWith('re_your-');
}
function getSmtpUser() {
    return process.env.SMTP_USER || process.env.SMTP_USERNAME || process.env.GMAIL_USER || process.env.EMAIL_USER || process.env.EMAIL_USERNAME || process.env.MAIL_USER || process.env.MAIL_USERNAME;
}
function getSmtpPassword() {
    return process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.SMTP_AUTH_PASSWORD || process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD || process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS || process.env.MAIL_PASSWORD || process.env.MAIL_PASS;
}
function logSmtpEnvAliases() {
    const userAliases = [
        'SMTP_USER',
        'SMTP_USERNAME',
        'GMAIL_USER',
        'EMAIL_USER',
        'EMAIL_USERNAME',
        'MAIL_USER',
        'MAIL_USERNAME'
    ];
    const passAliases = [
        'SMTP_PASSWORD',
        'SMTP_PASS',
        'SMTP_AUTH_PASSWORD',
        'GMAIL_APP_PASSWORD',
        'GMAIL_PASSWORD',
        'EMAIL_PASSWORD',
        'EMAIL_PASS',
        'MAIL_PASSWORD',
        'MAIL_PASS'
    ];
    const hostAliases = [
        'SMTP_HOST',
        'MAIL_HOST',
        'EMAIL_HOST'
    ];
    const portAliases = [
        'SMTP_PORT',
        'MAIL_PORT',
        'EMAIL_PORT'
    ];
    const fromAliases = [
        'SMTP_FROM',
        'EMAIL_FROM',
        'MAIL_FROM',
        'MAIL_FROM_ADDRESS'
    ];
    const summarize = (keys)=>keys.map((k)=>`${k}=${process.env[k] ? 'SET' : 'MISSING'}`).join(', ');
    console.log('[SMTP-Env-Diag] user    : ' + summarize(userAliases));
    console.log('[SMTP-Env-Diag] pass    : ' + summarize(passAliases));
    console.log('[SMTP-Env-Diag] host    : ' + summarize(hostAliases));
    console.log('[SMTP-Env-Diag] port    : ' + summarize(portAliases));
    console.log('[SMTP-Env-Diag] from    : ' + summarize(fromAliases));
    console.log('[SMTP-Env-Diag] resend  : RESEND_API_KEY=' + (process.env.RESEND_API_KEY ? 'SET' : 'MISSING'));
    console.log('[SMTP-Env-Diag] resolved: user=' + (getSmtpUser() ? 'SET' : 'MISSING') + ', pass=' + (getSmtpPassword() ? 'SET' : 'MISSING') + ', configured=' + (isRealSmtpConfigured() ? 'YES' : 'NO'));
}
/**
 * Detect placeholder credential values (e.g. "your-email@gmail.com",
 * "your-app-password", "placeholder", empty string).
 *
 * NOTE: We do NOT reject passwords starting with "test-" or "test_" because
 * real Gmail App Passwords are random lowercase letters and could theoretically
 * start with those characters. If the password is wrong, SMTP will return a
 * 535 auth error which is surfaced to the user as a clear delivery failure.
 */ function isPlaceholderValue(value) {
    if (!value) return true;
    if (value.startsWith('your-')) return true;
    if (value === 'placeholder') return true;
    if (value === 'test') return true;
    if (value.includes('example')) return true;
    if (value === 'password') return true;
    return false;
}
function getSmtpHost() {
    return process.env.SMTP_HOST || process.env.MAIL_HOST || process.env.EMAIL_HOST;
}
function getSmtpPort() {
    const raw = process.env.SMTP_PORT || process.env.MAIL_PORT || process.env.EMAIL_PORT;
    return Number(raw) || 587;
}
function getSmtpFrom() {
    return process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.MAIL_FROM || process.env.MAIL_FROM_ADDRESS || process.env.FROM_EMAIL;
}
function isRealSmtpConfigured() {
    const host = getSmtpHost();
    const port = getSmtpPort();
    const user = getSmtpUser();
    const pass = getSmtpPassword();
    return !!(host && port && user && !isPlaceholderValue(user) && pass && !isPlaceholderValue(pass));
}
function getGoogleClientId() {
    return process.env.GOOGLE_CLIENT_ID;
}
function getGoogleClientSecret() {
    return process.env.GOOGLE_CLIENT_SECRET;
}
function isRealGoogleConfigured() {
    const clientId = getGoogleClientId();
    const clientSecret = getGoogleClientSecret();
    if (!clientId || !clientSecret) return false;
    if (isPlaceholderValue(clientId)) return false;
    if (isPlaceholderValue(clientSecret)) return false;
    if (!clientId.includes('.apps.googleusercontent.com')) return false;
    return true;
}
// Backward-compatible aliases
const hasRealResend = isRealResendConfigured;
const hasRealSmtp = isRealSmtpConfigured;
function isEtherealMode() {
    return false;
}
function isEmailProviderAvailable() {
    return hasRealResend() || hasRealSmtp();
}
}),
"[project]/src/lib/email.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "activeEmailProvider",
    ()=>activeEmailProvider,
    "isEmailServiceConfigured",
    ()=>isEmailServiceConfigured,
    "sendCreditAddonConfirmationEmail",
    ()=>sendCreditAddonConfirmationEmail,
    "sendEmail",
    ()=>sendEmail,
    "sendMagicLinkEmail",
    ()=>sendMagicLinkEmail,
    "sendOtpLoginEmail",
    ()=>sendOtpLoginEmail,
    "sendPasswordResetEmail",
    ()=>sendPasswordResetEmail,
    "sendSecurityAlertEmail",
    ()=>sendSecurityAlertEmail,
    "sendTestEmail",
    ()=>sendTestEmail,
    "sendVerificationEmail",
    ()=>sendVerificationEmail,
    "sendWelcomeEmail",
    ()=>sendWelcomeEmail
]);
/**
 * AcquisitionOS Email Service
 *
 * REAL email delivery only — NO Ethereal / preview / test inbox fallback.
 * Provider chain:
 *   1. Resend (primary — modern email API, real key required)
 *   2. Nodemailer SMTP (Gmail SMTP via SMTP_USER / SMTP_PASSWORD)
 *
 * If neither provider is configured, sendEmail() returns a clear error.
 * Auth routes surface that error to the user. There is ZERO fallback to
 * any preview or test inbox — OTP / magic links must NEVER be delivered
 * to a publicly accessible test mailbox.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/email-ethereal.ts [instrumentation] (ecmascript)");
;
function isEmailServiceConfigured() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["isRealResendConfigured"])() || (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["isRealSmtpConfigured"])();
}
function activeEmailProvider() {
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["isRealResendConfigured"])()) return 'resend';
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["isRealSmtpConfigured"])()) return 'smtp';
    return 'none';
}
// ---------------------------------------------------------------------------
// Provider: Resend
// ---------------------------------------------------------------------------
async function sendViaResend(payload, from) {
    try {
        // Dynamic import so the app doesn't crash if `resend` is not installed.
        const { Resend } = await __turbopack_context__.A("[project]/node_modules/resend/dist/index.mjs [instrumentation] (ecmascript, async loader)");
        const resend = new Resend(process.env.RESEND_API_KEY);
        // Build email params — include attachments if provided
        const emailParams = {
            from,
            to: payload.to,
            subject: payload.subject,
            html: payload.html,
            text: payload.text
        };
        // Optional CC / BCC / Reply-To (Resend supports all three natively)
        if (payload.cc) {
            emailParams.cc = Array.isArray(payload.cc) ? payload.cc.join(', ') : payload.cc;
        }
        if (payload.bcc) {
            emailParams.bcc = Array.isArray(payload.bcc) ? payload.bcc.join(', ') : payload.bcc;
        }
        if (payload.replyTo) {
            emailParams.reply_to = payload.replyTo;
        }
        if (payload.attachments && payload.attachments.length > 0) {
            emailParams.attachments = payload.attachments.map((att)=>({
                    filename: att.filename,
                    content: typeof att.content === "string" ? att.content : att.content.toString("base64"),
                    ...att.contentType ? {
                        content_type: att.contentType
                    } : {}
                }));
        }
        const { data, error } = await resend.emails.send(emailParams);
        if (error) {
            console.error("[EmailService] Resend error:", error);
            return {
                sent: false,
                error: error.message
            };
        }
        return {
            sent: true,
            messageId: data?.id,
            provider: 'resend'
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to send via Resend";
        console.error("[EmailService] Resend exception:", message);
        return {
            sent: false,
            error: message
        };
    }
}
// ---------------------------------------------------------------------------
// Provider: Nodemailer SMTP
// ---------------------------------------------------------------------------
/**
 * Check if an SMTP error is a permanent failure that should NOT be retried.
 * - 550-5.4.5: Gmail daily sending limit exceeded (quota — won't reset today)
 * - 535: Authentication failure (wrong credentials)
 * - 553: Invalid from address
 * - 550: General permanent failure (mailbox unavailable, etc.)
 */ function isPermanentSmtpError(error) {
    const lower = error.toLowerCase();
    return lower.includes('5.4.5') || // Daily sending limit
    lower.includes('daily user sending') || // Gmail quota
    lower.includes('535') || // Auth failure
    lower.includes('authentication') || // Auth failure
    lower.includes('553') || // Invalid from
    lower.includes('mailbox unavailable') // Bad recipient
    ;
}
async function sendViaSmtp(payload) {
    try {
        const nodemailer = await __turbopack_context__.A("[externals]/nodemailer [external] (nodemailer, cjs, [project]/node_modules/nodemailer, async loader)");
        const smtpHost = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["getSmtpHost"])();
        const smtpPort = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["getSmtpPort"])();
        const smtpConfig = {
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: {
                user: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["getSmtpUser"])(),
                pass: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["getSmtpPassword"])()
            }
        };
        console.log(`[EmailService] SMTP connecting to ${smtpConfig.host}:${smtpConfig.port} (secure=${smtpConfig.secure}, user=${smtpConfig.auth.user ? 'SET' : 'MISSING'})`);
        const transporter = nodemailer.createTransport(smtpConfig);
        const smtpUser = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["getSmtpUser"])();
        const fromAddress = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["getSmtpFrom"])() || (smtpUser ? `AcquisitionOS <${smtpUser}>` : "AcquisitionOS <noreply@acquisitionos.com>");
        const mailOptions = {
            from: fromAddress,
            to: payload.to,
            subject: payload.subject,
            html: payload.html,
            text: payload.text
        };
        // Optional CC / BCC / Reply-To (Nodemailer supports all three natively)
        if (payload.cc) {
            mailOptions.cc = Array.isArray(payload.cc) ? payload.cc.join(', ') : payload.cc;
        }
        if (payload.bcc) {
            mailOptions.bcc = Array.isArray(payload.bcc) ? payload.bcc.join(', ') : payload.bcc;
        }
        if (payload.replyTo) {
            mailOptions.replyTo = payload.replyTo;
        }
        if (payload.attachments && payload.attachments.length > 0) {
            mailOptions.attachments = payload.attachments.map((att)=>({
                    filename: att.filename,
                    content: att.content,
                    ...att.contentType ? {
                        contentType: att.contentType
                    } : {}
                }));
        }
        // ── Retry with exponential backoff for transient errors ──
        // Permanent errors (quota exceeded, auth failure) are NOT retried.
        const MAX_RETRIES = 3;
        const BASE_DELAY_MS = 2000; // 2s, 4s, 8s
        for(let attempt = 1; attempt <= MAX_RETRIES; attempt++){
            try {
                const info = await transporter.sendMail(mailOptions);
                console.log(`[EmailService] ✓ SMTP mail sent (attempt ${attempt}/${MAX_RETRIES}): messageId=${info.messageId}, response=${info.response}`);
                return {
                    sent: true,
                    messageId: info.messageId,
                    provider: 'smtp'
                };
            } catch (sendErr) {
                const message = sendErr instanceof Error ? sendErr.message : String(sendErr);
                // If this is a permanent error, don't retry — return immediately
                if (isPermanentSmtpError(message)) {
                    console.error(`[EmailService] ✗ SMTP permanent error (no retry): ${message}`);
                    return {
                        sent: false,
                        error: message,
                        provider: 'smtp'
                    };
                }
                // Transient error — retry if we haven't exhausted attempts
                if (attempt < MAX_RETRIES) {
                    const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
                    console.warn(`[EmailService] ⚠ SMTP attempt ${attempt}/${MAX_RETRIES} failed (${message}). Retrying in ${delay}ms...`);
                    await new Promise((resolve)=>setTimeout(resolve, delay));
                } else {
                    // Last attempt failed
                    console.error(`[EmailService] ✗ SMTP failed after ${MAX_RETRIES} attempts: ${message}`);
                    return {
                        sent: false,
                        error: message,
                        provider: 'smtp'
                    };
                }
            }
        }
        // Shouldn't reach here, but just in case
        return {
            sent: false,
            error: "SMTP send exhausted retries",
            provider: 'smtp'
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to send via SMTP";
        console.error("[EmailService] SMTP exception:", message);
        return {
            sent: false,
            error: message
        };
    }
}
async function sendEmail(payload) {
    const provider = activeEmailProvider();
    console.log(`[EmailService] sendEmail called: to=${payload.to}, subject=${payload.subject}, activeProvider=${provider}`);
    // If NO real provider is configured, return a clear error immediately.
    // We do NOT fall back to Ethereal or console — the caller must surface
    // this error so the user knows email delivery is not possible.
    if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["isRealResendConfigured"])() && !(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["isRealSmtpConfigured"])()) {
        const errMsg = 'SMTP_USER and SMTP_PASSWORD must be set in environment (or RESEND_API_KEY). ' + 'No preview/test inbox fallback is available.';
        console.error(`[EmailService] ✗ No real email provider configured: ${errMsg}`);
        return {
            sent: false,
            error: errMsg
        };
    }
    // Default "from" address: prefer resolved SMTP_FROM aliases, then the
    // authenticated SMTP user (required for Gmail), then a generic noreply.
    const from = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["getSmtpFrom"])() || ((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["getSmtpUser"])() ? `AcquisitionOS <${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["getSmtpUser"])()}>` : "AcquisitionOS <noreply@acquisitionos.com>");
    let lastError;
    // 1. Try Resend (primary) — only when a REAL API key is configured.
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["isRealResendConfigured"])()) {
        console.log("[EmailService] Attempting Resend…");
        const result = await sendViaResend(payload, from);
        if (result.sent) {
            console.log(`[EmailService] ✓ Sent via Resend to ${payload.to} (id: ${result.messageId})`);
            return result;
        }
        lastError = result.error;
        console.warn("[EmailService] ✗ Resend failed:", lastError);
    }
    // 2. Try REAL SMTP — only when real credentials are configured.
    // Placeholders (`your-email@gmail.com`, `your-app-password`) are skipped so
    // we don't waste cycles failing Gmail auth.
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["isRealSmtpConfigured"])()) {
        console.log(`[EmailService] Attempting SMTP to ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["getSmtpHost"])()}:${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["getSmtpPort"])()}…`);
        const result = await sendViaSmtp(payload);
        if (result.sent) {
            console.log(`[EmailService] ✓ Sent via SMTP to ${payload.to} (id: ${result.messageId})`);
            return result;
        }
        lastError = result.error;
        console.warn("[EmailService] ✗ SMTP failed:", lastError);
    }
    // 3. If we reach here, a real provider WAS configured but delivery FAILED.
    //    Return the error — there is NO Ethereal / console fallback.
    console.error(`[EmailService] ✗ All real providers failed (lastError=${lastError || 'unknown'}). ` + `No preview/test inbox fallback available.`);
    return {
        sent: false,
        error: lastError || 'Email delivery failed. Please try again later.',
        provider: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["isRealSmtpConfigured"])() ? 'smtp' : 'resend'
    };
}
// ---------------------------------------------------------------------------
// HTML template helpers
// ---------------------------------------------------------------------------
const BRAND_COLOR = "#0d9488"; // teal-600
const BRAND_COLOR_LIGHT = "#14b8a6"; // teal-500
const BRAND_BG = "#f0fdfa"; // teal-50
const BRAND_DARK = "#0f766e"; // teal-700
const TEXT_PRIMARY = "#1e293b"; // slate-800
const TEXT_SECONDARY = "#64748b"; // slate-500
const BORDER_COLOR = "#e2e8f0"; // slate-200
function baseHtml(body, previewText) {
    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>AcquisitionOS</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; background-color: ${BRAND_BG}; }
    a { color: ${BRAND_COLOR}; text-decoration: underline; }
    a:hover { color: ${BRAND_DARK}; }
  </style>
</head>
<body style="margin:0; padding:0; background-color:${BRAND_BG}; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color:${TEXT_PRIMARY};">
  <!-- Preheader (hidden text for email clients) -->
  <div style="display:none; font-size:1px; color:${BRAND_BG}; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">
    ${previewText}
  </div>

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND_BG}; padding:32px 0;">
    <tr>
      <td align="center" style="padding:0 16px;">

        <!-- Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);">
          <!-- Brand header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%); padding:32px 40px; text-align:center;">
              <h1 style="margin:0; font-size:22px; font-weight:700; color:#ffffff; letter-spacing:-0.3px;">
                AcquisitionOS
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              ${body}
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; margin-top:16px;">
          <tr>
            <td style="padding:16px 24px; text-align:center; font-size:12px; line-height:18px; color:${TEXT_SECONDARY};">
              &copy; ${new Date().getFullYear()} AcquisitionOS, Inc. All rights reserved.<br />
              This is an automated message — please do not reply directly.
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}
function greeting(name) {
    return `<p style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:${TEXT_PRIMARY};">
    Hi <strong>${escapeHtml(name)}</strong>,
  </p>`;
}
function signOff() {
    return `<p style="margin:24px 0 0 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
    Cheers,<br />
    <strong style="color:${BRAND_COLOR};">The AcquisitionOS Team</strong>
  </p>`;
}
function otpBlock(otp) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND_BG}; border:2px dashed ${BRAND_COLOR_LIGHT}; border-radius:10px; padding:0;">
          <tr>
            <td style="padding:20px 40px; text-align:center;">
              <span style="font-size:32px; font-weight:800; letter-spacing:6px; color:${BRAND_DARK}; font-family:'Courier New', Courier, monospace;">
                ${escapeHtml(otp)}
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}
function securityNote() {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0 0;">
    <tr>
      <td style="background-color:#fffbeb; border-left:4px solid #f59e0b; border-radius:6px; padding:12px 16px;">
        <p style="margin:0; font-size:13px; line-height:20px; color:#92400e;">
          <strong>Didn't request this?</strong> You can safely ignore this email. If you keep receiving unexpected messages, please contact our support team.
        </p>
      </td>
    </tr>
  </table>`;
}
function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
async function sendVerificationEmail(email, name, otp) {
    const subject = "Verify your email — AcquisitionOS";
    const preview = `Your verification code is ${otp}`;
    const html = baseHtml(`${greeting(name)}
    <p style="margin:0 0 8px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Welcome to AcquisitionOS! To verify your email address, please use the following code:
    </p>
    ${otpBlock(otp)}
    <p style="margin:0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
      This code expires in 10 minutes.
    </p>
    ${securityNote()}
    ${signOff()}`, preview);
    const text = `Hi ${name},\n\nWelcome to AcquisitionOS! Your verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, you can safely ignore this email.\n\n— The AcquisitionOS Team`;
    return sendEmail({
        to: email,
        subject,
        html,
        text
    });
}
async function sendOtpLoginEmail(email, name, otp) {
    const subject = "Your login code — AcquisitionOS";
    const preview = `Your login code is ${otp}`;
    const html = baseHtml(`${greeting(name)}
    <p style="margin:0 0 8px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Someone requested a login code for your account. Use the following OTP to continue:
    </p>
    ${otpBlock(otp)}
    <p style="margin:0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
      This code expires in 10 minutes.
    </p>
    ${securityNote()}
    ${signOff()}`, preview);
    const text = `Hi ${name},\n\nYour login code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, you can safely ignore this email.\n\n— The AcquisitionOS Team`;
    return sendEmail({
        to: email,
        subject,
        html,
        text
    });
}
async function sendMagicLinkEmail(email, name, link) {
    const subject = "Your sign-in link — AcquisitionOS";
    const preview = "Click the link to sign in to your account";
    const html = baseHtml(`${greeting(name)}
    <p style="margin:0 0 20px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Click the button below to sign in to your AcquisitionOS account. This link is one-time use and expires in 15 minutes.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
      <tr>
        <td align="center">
          <a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block; background:linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%); color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:14px 36px; border-radius:8px; letter-spacing:0.3px;">
            Sign in to AcquisitionOS
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 4px 0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
      If the button doesn't work, copy and paste this URL into your browser:
    </p>
    <p style="margin:0; font-size:13px; line-height:20px; word-break:break-all;">
      <a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" style="color:${BRAND_COLOR};">${escapeHtml(link)}</a>
    </p>
    ${securityNote()}
    ${signOff()}`, preview);
    const text = `Hi ${name},\n\nSign in to AcquisitionOS by clicking this link:\n${link}\n\nThis link expires in 15 minutes.\n\nIf you didn't request this, you can safely ignore this email.\n\n— The AcquisitionOS Team`;
    return sendEmail({
        to: email,
        subject,
        html,
        text
    });
}
async function sendPasswordResetEmail(email, name, otp) {
    const subject = "Reset your password — AcquisitionOS";
    const preview = `Your password reset code is ${otp}`;
    const html = baseHtml(`${greeting(name)}
    <p style="margin:0 0 8px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      We received a request to reset the password for your account. Use the code below to proceed:
    </p>
    ${otpBlock(otp)}
    <p style="margin:0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
      This code expires in 10 minutes. If you didn't request a password reset, your account is safe — no changes will be made.
    </p>
    ${securityNote()}
    ${signOff()}`, preview);
    const text = `Hi ${name},\n\nYour password reset code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, your account is safe — no changes will be made.\n\n— The AcquisitionOS Team`;
    return sendEmail({
        to: email,
        subject,
        html,
        text
    });
}
async function sendSecurityAlertEmail(email, name, event, ip, userAgent) {
    const subject = "Security alert — AcquisitionOS";
    const preview = `Security activity detected on your account`;
    const html = baseHtml(`${greeting(name)}
    <p style="margin:0 0 16px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      We detected the following security activity on your account:
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0; background-color:#f8fafc; border:1px solid ${BORDER_COLOR}; border-radius:8px; overflow:hidden;">
      <tr>
        <td style="padding:16px 20px; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
          <strong style="color:${BRAND_DARK};">Event:</strong> ${escapeHtml(event)}<br />
          <strong style="color:${BRAND_DARK};">IP Address:</strong> ${escapeHtml(ip)}<br />
          <strong style="color:${BRAND_DARK};">Device / Browser:</strong> ${escapeHtml(userAgent)}
        </td>
      </tr>
    </table>

    <p style="margin:0 0 8px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      If this was you, no further action is needed.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0 0;">
      <tr>
        <td style="background-color:#fef2f2; border-left:4px solid #ef4444; border-radius:6px; padding:12px 16px;">
          <p style="margin:0; font-size:13px; line-height:20px; color:#991b1b;">
            <strong>Don't recognize this activity?</strong> Change your password immediately and enable two-factor authentication if you haven't already. Contact support if you need help securing your account.
          </p>
        </td>
      </tr>
    </table>
    ${signOff()}`, preview);
    const text = `Hi ${name},\n\nWe detected the following security activity on your account:\n\n  Event: ${event}\n  IP Address: ${ip}\n  Device / Browser: ${userAgent}\n\nIf this was you, no further action is needed.\n\nIf you don't recognize this activity, change your password immediately and enable two-factor authentication.\n\n— The AcquisitionOS Team`;
    return sendEmail({
        to: email,
        subject,
        html,
        text
    });
}
async function sendWelcomeEmail(email, name) {
    const subject = "Welcome to AcquisitionOS 🎉";
    const preview = "Your account is ready — let's get started!";
    const html = baseHtml(`${greeting(name)}
    <p style="margin:0 0 16px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Your email has been verified and your account is all set. Welcome aboard!
    </p>
    <p style="margin:0 0 24px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Here are a few things you can do to get started:
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
      <tr>
        <td style="padding:0 0 12px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
          <span style="display:inline-block; width:24px; height:24px; line-height:24px; text-align:center; background-color:${BRAND_BG}; color:${BRAND_COLOR}; border-radius:6px; font-size:13px; font-weight:700; margin-right:10px;">1</span>
          Complete your profile and company details
        </td>
      </tr>
      <tr>
        <td style="padding:0 0 12px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
          <span style="display:inline-block; width:24px; height:24px; line-height:24px; text-align:center; background-color:${BRAND_BG}; color:${BRAND_COLOR}; border-radius:6px; font-size:13px; font-weight:700; margin-right:10px;">2</span>
          Set up your first acquisition pipeline
        </td>
      </tr>
      <tr>
        <td style="padding:0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
          <span style="display:inline-block; width:24px; height:24px; line-height:24px; text-align:center; background-color:${BRAND_BG}; color:${BRAND_COLOR}; border-radius:6px; font-size:13px; font-weight:700; margin-right:10px;">3</span>
          Invite your team and start collaborating
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
      <tr>
        <td align="center">
          <a href="#" target="_blank" rel="noopener noreferrer"
             style="display:inline-block; background:linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%); color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:14px 36px; border-radius:8px; letter-spacing:0.3px;">
            Go to Dashboard
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
      Questions? Reply to this email or reach out to our support team anytime — we're here to help.
    </p>
    ${signOff()}`, preview);
    const text = `Hi ${name},\n\nYour email has been verified and your account is all set. Welcome aboard!\n\nHere are a few things you can do to get started:\n  1. Complete your profile and company details\n  2. Set up your first acquisition pipeline\n  3. Invite your team and start collaborating\n\nQuestions? Reply to this email or reach out to our support team anytime.\n\n— The AcquisitionOS Team`;
    return sendEmail({
        to: email,
        subject,
        html,
        text
    });
}
async function sendTestEmail(to) {
    const subject = `AcquisitionOS Email Diagnostic — ${new Date().toISOString()}`;
    const html = baseHtml(`<p style="margin:0 0 16px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      This is a diagnostic test email from AcquisitionOS. If you received this,
      your email delivery pipeline is working correctly.
    </p>
    <p style="margin:0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
      Timestamp: ${new Date().toISOString()}
    </p>`, 'AcquisitionOS diagnostic test email');
    const text = `AcquisitionOS Email Diagnostic\n\nThis is a test email. If you received this, your email delivery pipeline is working correctly.\n\nTimestamp: ${new Date().toISOString()}`;
    return sendEmail({
        to,
        subject,
        html,
        text
    });
}
async function sendCreditAddonConfirmationEmail(params) {
    const { to, name, credits, amount, currency, newBalance, orderId } = params;
    const currencySymbol = currency.toUpperCase() === 'INR' ? '₹' : '$';
    const formattedAmount = `${currencySymbol}${amount.toLocaleString('en-IN')}`;
    const subject = `AcquisitionOS — ${credits} credits added to your account`;
    const preview = `${credits} credits have been added. Your new balance is ${newBalance} credits.`;
    const html = baseHtml(`${greeting(name || undefined)}
    <p style="margin:0 0 16px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Your credit add-on purchase was successful. <strong>${credits} credits</strong>
      have been added to your account.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0; background-color:${BRAND_BG}; border-radius:8px;">
      <tr>
        <td style="padding:16px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-size:13px; color:${TEXT_SECONDARY}; padding:0 0 6px 0;">Amount paid</td>
              <td align="right" style="font-size:15px; font-weight:600; color:${TEXT_PRIMARY}; padding:0 0 6px 0;">${formattedAmount}</td>
            </tr>
            <tr>
              <td style="font-size:13px; color:${TEXT_SECONDARY}; padding:0 0 6px 0;">Credits added</td>
              <td align="right" style="font-size:15px; font-weight:600; color:${TEXT_PRIMARY}; padding:0 0 6px 0;">${credits.toLocaleString('en-IN')}</td>
            </tr>
            <tr>
              <td style="font-size:13px; color:${TEXT_SECONDARY}; padding:0;">New balance</td>
              <td align="right" style="font-size:15px; font-weight:600; color:${BRAND_COLOR}; padding:0;">${newBalance.toLocaleString('en-IN')} credits</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 24px 0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
      Order ID: <span style="font-family:monospace;">${orderId}</span><br/>
      Credits never expire. Use them anytime for lead discovery, outreach, analysis, and more.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
      <tr>
        <td align="center">
          <a href="#" target="_blank" rel="noopener noreferrer"
             style="display:inline-block; background:linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%); color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:14px 36px; border-radius:8px; letter-spacing:0.3px;">
            Go to Dashboard
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
      Questions about your purchase? Reply to this email or contact
      <a href="mailto:support@acquisitionos.com" style="color:${BRAND_COLOR}; text-decoration:none;">support@acquisitionos.com</a>.
    </p>
    ${signOff()}`, preview);
    const text = `Hi ${name || 'there'},\n\nYour credit add-on purchase was successful. ${credits} credits have been added to your account.\n\nAmount paid: ${formattedAmount}\nCredits added: ${credits.toLocaleString('en-IN')}\nNew balance: ${newBalance.toLocaleString('en-IN')} credits\nOrder ID: ${orderId}\n\nCredits never expire. Use them anytime for lead discovery, outreach, analysis, and more.\n\nQuestions? Reply to this email or contact support@acquisitionos.com.\n\n— The AcquisitionOS Team`;
    return sendEmail({
        to,
        subject,
        html,
        text
    });
}
}),
"[project]/src/lib/lead-score-recalc.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "recalcLeadScores",
    ()=>recalcLeadScores
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Score Recalculation Helper
// FIX 2: Recalculate a lead's conversionScore (and derive rating)
// whenever a LeadActivity is created or the lead's pipeline stage
// changes. The score is based on the lead's current pipeline stage
// plus the number of activities recorded against it, so the leads
// table always reflects live engagement rather than a stale 0.
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [instrumentation] (ecmascript)");
;
// Stage → base conversion weight (0–100). Mirrors STAGE_ORDER progression
// from src/lib/types.ts (discovered → analyzed → contacted → replied →
// discussion → proposal → negotiation → won, with lost as a terminal 0).
const STAGE_BASE_WEIGHT = {
    discovered: 10,
    analyzed: 20,
    contacted: 35,
    replied: 50,
    discussion: 60,
    proposal: 72,
    negotiation: 85,
    won: 100,
    lost: 0
};
async function recalcLeadScores(leadId) {
    try {
        const lead = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.findUnique({
            where: {
                id: leadId
            },
            select: {
                id: true,
                stage: true
            }
        });
        if (!lead) return;
        const activityCount = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].leadActivity.count({
            where: {
                leadId
            }
        });
        const base = STAGE_BASE_WEIGHT[lead.stage] ?? 10;
        const bonus = Math.min(20, activityCount * 2);
        const convScore = Math.max(0, Math.min(100, Math.round(base + bonus)));
        // Derive a 0–5 rating from the conv score (one decimal place).
        const rating = Math.round(convScore / 20 * 10) / 10;
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.update({
            where: {
                id: leadId
            },
            data: {
                conversionScore: convScore,
                rating
            }
        });
    } catch (error) {
        // Never block the caller — just log.
        console.error('[lead-score-recalc] Failed to recalc scores for lead', leadId, error);
    }
}
}),
"[project]/src/lib/pipeline-service.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getLeadsByStage",
    ()=>getLeadsByStage,
    "getPipelineStages",
    ()=>getPipelineStages,
    "getPipelineView",
    ()=>getPipelineView,
    "moveLeadToStage",
    ()=>moveLeadToStage,
    "seedDefaultStages",
    ()=>seedDefaultStages
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Pipeline Service
// Phase 7: Pipeline stage management, lead movement, kanban view
//
// Default stages: discovered → analyzed → contacted → replied →
//   interested → negotiation → proposal_sent → closed_won / closed_lost
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/lead-audit.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$score$2d$recalc$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/lead-score-recalc.ts [instrumentation] (ecmascript)");
;
;
;
// ===== DEFAULT STAGES =====
const DEFAULT_STAGES = [
    {
        name: 'discovered',
        order: 0,
        color: '#94a3b8'
    },
    {
        name: 'analyzed',
        order: 1,
        color: '#60a5fa'
    },
    {
        name: 'contacted',
        order: 2,
        color: '#f59e0b'
    },
    {
        name: 'replied',
        order: 3,
        color: '#10b981'
    },
    {
        name: 'interested',
        order: 4,
        color: '#8b5cf6'
    },
    {
        name: 'negotiation',
        order: 5,
        color: '#ec4899'
    },
    {
        name: 'proposal_sent',
        order: 6,
        color: '#f97316'
    },
    {
        name: 'closed_won',
        order: 7,
        color: '#22c55e'
    },
    {
        name: 'closed_lost',
        order: 8,
        color: '#ef4444'
    }
];
async function seedDefaultStages() {
    const existing = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].pipelineStage.count({
        where: {
            isDefault: true
        }
    });
    if (existing === 0) {
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].pipelineStage.createMany({
            data: DEFAULT_STAGES.map((stage)=>({
                    ...stage,
                    isDefault: true,
                    orgId: null
                }))
        });
    }
}
async function getPipelineStages(orgId) {
    // Ensure defaults exist
    await seedDefaultStages();
    // Get stages (default + org-specific)
    const where = {};
    if (orgId) {
        where.OR = [
            {
                isDefault: true,
                orgId: null
            },
            {
                orgId
            }
        ];
    } else {
        where.isDefault = true;
        where.orgId = null;
    }
    const stages = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].pipelineStage.findMany({
        where,
        orderBy: {
            order: 'asc'
        }
    });
    // Get lead counts per stage
    const stagesWithCounts = await Promise.all(stages.map(async (stage)=>{
        const leadWhere = {
            isActive: true,
            stage: stage.name
        };
        if (orgId) leadWhere.orgId = orgId;
        const leadCount = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.count({
            where: leadWhere
        });
        return {
            id: stage.id,
            name: stage.name,
            order: stage.order,
            color: stage.color,
            isDefault: stage.isDefault,
            orgId: stage.orgId,
            leadCount
        };
    }));
    return stagesWithCounts;
}
async function moveLeadToStage(leadId, newStage, userId) {
    try {
        const lead = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.findFirst({
            where: {
                id: leadId,
                isActive: true
            }
        });
        if (!lead) {
            return {
                success: false,
                leadId,
                fromStage: '',
                toStage: newStage,
                error: 'Lead not found'
            };
        }
        if (lead.stage === newStage) {
            return {
                success: false,
                leadId,
                fromStage: lead.stage,
                toStage: newStage,
                error: 'Lead is already in this stage'
            };
        }
        const fromStage = lead.stage;
        // Update lead stage
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.update({
            where: {
                id: leadId
            },
            data: {
                stage: newStage
            }
        });
        // Create lead activity record
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].leadActivity.create({
            data: {
                leadId,
                type: 'stage_change',
                description: `Stage changed from "${fromStage}" to "${newStage}"`,
                metadata: JSON.stringify({
                    fromStage,
                    toStage: newStage,
                    changedBy: userId
                })
            }
        });
        // FIX 2: Recalculate convScore + rating since the pipeline stage
        // (and therefore the base weight) changed and a new activity was
        // recorded. Fire-and-forget — never block the stage move.
        void (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$score$2d$recalc$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["recalcLeadScores"])(leadId).catch((err)=>{
            console.error('[pipeline-service] recalcLeadScores failed:', err);
        });
        // Audit log
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["logAuditEvent"])(userId, 'stage_changed', {
            leadId,
            fromStage,
            toStage: newStage,
            businessName: lead.businessName
        });
        return {
            success: true,
            leadId,
            fromStage,
            toStage: newStage
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
            success: false,
            leadId,
            fromStage: '',
            toStage: newStage,
            error: message
        };
    }
}
async function getPipelineView(userId, options) {
    // Ensure defaults exist
    await seedDefaultStages();
    // Get user's orgId if not provided
    let orgId = options?.orgId;
    if (!orgId) {
        const user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].user.findUnique({
            where: {
                id: userId
            },
            select: {
                orgId: true
            }
        });
        orgId = user?.orgId || undefined;
    }
    // Get stages with counts
    const stages = await getPipelineStages(orgId);
    // Build base where clause for leads
    const baseWhere = {
        isActive: true
    };
    if (orgId) {
        baseWhere.orgId = orgId;
    } else {
        baseWhere.userId = userId;
    }
    if (options?.niche) baseWhere.niche = options.niche;
    if (options?.country) baseWhere.country = options.country;
    // Get total count
    const totalLeads = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.count({
        where: baseWhere
    });
    return {
        stages,
        totalLeads
    };
}
async function getLeadsByStage(userId, stage, options) {
    const page = options?.page || 1;
    const limit = Math.min(options?.limit || 50, 100);
    const offset = (page - 1) * limit;
    let orgId = options?.orgId;
    if (!orgId) {
        const user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].user.findUnique({
            where: {
                id: userId
            },
            select: {
                orgId: true
            }
        });
        orgId = user?.orgId || undefined;
    }
    const where = {
        isActive: true,
        stage
    };
    if (orgId) {
        where.orgId = orgId;
    } else {
        where.userId = userId;
    }
    const sortBy = options?.sortBy || 'createdAt';
    const sortOrder = options?.sortOrder || 'desc';
    const [leads, total] = await Promise.all([
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.findMany({
            where,
            orderBy: {
                [sortBy]: sortOrder
            },
            take: limit,
            skip: offset,
            select: {
                id: true,
                businessName: true,
                ownerName: true,
                email: true,
                phone: true,
                city: true,
                country: true,
                niche: true,
                rating: true,
                replyScore: true,
                conversionScore: true,
                urgencyScore: true,
                revenuePotentialScore: true,
                stage: true,
                source: true,
                createdAt: true
            }
        }),
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.count({
            where
        })
    ]);
    return {
        leads,
        total,
        page,
        totalPages: Math.ceil(total / limit)
    };
}
}),
"[project]/src/lib/ai/sender-signature.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Sender signature personalization
//
// AI-generated outreach used to end with literal placeholders such as
// "Best regards, [Your Name]" because the generation prompt carries no
// sender identity. This module:
//   1. builds a sender-profile block for the generation prompt, and
//   2. deterministically replaces any placeholder signature tokens the
//      model still emitted with the AUTHENTICATED user's saved profile
//      values — omitting fields cleanly when they are missing.
//
// Pure functions (no DB, no I/O) so they are unit-testable. Never
// hardcodes any user data; an empty profile leaves no placeholders.
// ═══════════════════════════════════════════════════════════════════
__turbopack_context__.s([
    "applySenderSignature",
    ()=>applySenderSignature,
    "applySenderSignatureToFields",
    ()=>applySenderSignatureToFields,
    "buildSenderSignatureBlock",
    ()=>buildSenderSignatureBlock,
    "buildSignatureBlock",
    ()=>buildSignatureBlock,
    "buildSignatureLines",
    ()=>buildSignatureLines
]);
/** Placeholder tokens the model may emit, mapped to the profile field. */ const TOKEN_TO_FIELD = [
    {
        pattern: /\[Your\s+Name\]/gi,
        field: 'name'
    },
    {
        pattern: /\[Your\s+Full\s+Name\]/gi,
        field: 'name'
    },
    {
        pattern: /\[Your\s+Company(?:\s+Name)?\]/gi,
        field: 'company'
    },
    {
        pattern: /\[Your\s+Phone(?:\s+Number)?\]/gi,
        field: 'phone'
    },
    {
        pattern: /\[Your\s+Email(?:\s+Address)?\]/gi,
        field: 'email'
    },
    // No profile data exists for these — always omitted, never faked.
    {
        pattern: /\[Your\s+(?:Title|Position|Role)\]/gi,
        field: 'name'
    },
    {
        pattern: /\[Your\s+Contact\s+(?:Information|Details)\]/gi,
        field: 'name'
    }
];
function buildSenderSignatureBlock(profile) {
    const lines = [];
    if (profile.name?.trim()) lines.push(`- Name: ${profile.name.trim()}`);
    if (profile.company?.trim()) lines.push(`- Company: ${profile.company.trim()}`);
    if (profile.email?.trim()) lines.push(`- Email: ${profile.email.trim()}`);
    if (profile.phone?.trim()) lines.push(`- Phone: ${profile.phone.trim()}`);
    if (lines.length === 0) {
        return `SENDER (you are writing on behalf of the sender):
- The sender's profile has no contact details on file.
- Do NOT invent a sender name, company, email or phone.
- Do NOT use placeholders such as [Your Name] or [Your Company].
- End the message with a plain sign-off (e.g. "Best regards,") and nothing after it.`;
    }
    return `SENDER (you are writing on behalf of the sender):
${lines.join('\n')}
When signing the message, use ONLY these real sender details, each on its own line under the sign-off (e.g. "Best regards,"). Omit any detail not listed above. NEVER invent or use placeholder text such as [Your Name], [Your Company], undefined or null.`;
}
function applySenderSignature(body, profile) {
    if (!body) return body;
    const valueFor = (field)=>{
        const v = profile[field];
        return typeof v === 'string' ? v.trim() : '';
    };
    let out = body;
    for (const { pattern, field } of TOKEN_TO_FIELD){
        out = out.replace(pattern, ()=>valueFor(field));
    }
    // Collapse whitespace left behind by removed tokens: trailing blanks
    // and lines that became empty between the sign-off and the end.
    out = out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
    return out;
}
function applySenderSignatureToFields(fields, profile) {
    const out = {
        ...fields
    };
    for (const key of Object.keys(out)){
        const value = out[key];
        if (typeof value === 'string' && value) {
            out[key] = applySenderSignature(value, profile);
        }
    }
    return out;
}
function buildSignatureLines(profile, existingBody) {
    const haystack = existingBody ? existingBody.toLowerCase() : null;
    const seen = (value)=>haystack !== null && haystack.includes(value.toLowerCase());
    const lines = [];
    const name = profile.name?.trim();
    const company = profile.company?.trim();
    const email = profile.email?.trim();
    const phone = profile.phone?.trim();
    if (name && !seen(name)) lines.push(name);
    if (company && !seen(company)) lines.push(company);
    if (email && !seen(email)) lines.push(`Email: ${email}`);
    if (phone && !seen(phone)) lines.push(`Phone: ${phone}`);
    return lines;
}
function buildSignatureBlock(profile, existingBody) {
    return buildSignatureLines(profile, existingBody).join('\n');
}
}),
"[project]/src/lib/personal-context.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PERSONAL_CONTEXT_FIELDS",
    ()=>PERSONAL_CONTEXT_FIELDS,
    "PERSONAL_CONTEXT_FIELD_LIMITS",
    ()=>PERSONAL_CONTEXT_FIELD_LIMITS,
    "buildPersonalContextBlock",
    ()=>buildPersonalContextBlock,
    "buildPersonalContextBlockForUser",
    ()=>buildPersonalContextBlockForUser,
    "loadPersonalContextForAi",
    ()=>loadPersonalContextForAi,
    "parsePersonalContext",
    ()=>parsePersonalContext,
    "sanitizePersonalContext",
    ()=>sanitizePersonalContext
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — User Preference / Personal Business Context
//
// A DISTINCT user-context capability: a persistable self-description the
// user provides about THEMSELVES (what they do, their business/services,
// interests, expertise, goals, target audience, positioning, communication
// context). Consumed by AI features for personalization:
//   - AI workflow generation        (/api/workflows/ai-generate)
//   - Outreach message generation   (src/lib/ai/outreach-generator.ts)
//   - Lead analysis                 (/api/leads/[id]/analyze)
//   - Prospecting pipeline match    (src/lib/prospecting/pipeline-steps.ts)
//   - Discovery context selector    (/api/leads/discover — "business" mode)
//
// IMPORTANT: this is NOT the Business Profile system and NOT UserSettings
// servicesOffered (the Offer Profile). It is a separate, free-form
// self-description stored in UserSettings.personalContext (JSON string).
// Legacy rows (null/absent) are fully supported — all functions are
// null-safe and never throw.
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [instrumentation] (ecmascript)");
;
const PERSONAL_CONTEXT_FIELD_LIMITS = {
    whatYouDo: 300,
    business: 1000,
    services: 1000,
    interests: 500,
    expertise: 500,
    goals: 500,
    targetAudience: 500,
    positioning: 500,
    communicationContext: 500,
    notes: 1000
};
const PERSONAL_CONTEXT_FIELDS = Object.keys(PERSONAL_CONTEXT_FIELD_LIMITS);
function parsePersonalContext(raw) {
    if (!raw || typeof raw !== 'string') return {};
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const out = {};
        for (const field of PERSONAL_CONTEXT_FIELDS){
            const value = parsed[field];
            if (typeof value === 'string' && value.trim()) {
                out[field] = value.trim().slice(0, PERSONAL_CONTEXT_FIELD_LIMITS[field]);
            }
        }
        return out;
    } catch  {
        return {};
    }
}
function sanitizePersonalContext(input) {
    const errors = [];
    const context = {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return {
            context,
            errors: [
                'Personal context must be an object.'
            ]
        };
    }
    const record = input;
    for (const field of PERSONAL_CONTEXT_FIELDS){
        const value = record[field];
        if (value === undefined || value === null) continue;
        if (typeof value !== 'string') {
            errors.push(`"${field}" must be a string.`);
            continue;
        }
        const trimmed = value.trim();
        if (!trimmed) continue;
        const max = PERSONAL_CONTEXT_FIELD_LIMITS[field];
        if (trimmed.length > max) {
            errors.push(`"${field}" exceeds the maximum of ${max} characters.`);
            continue;
        }
        context[field] = trimmed;
    }
    return {
        context,
        errors
    };
}
function buildPersonalContextBlock(context) {
    if (!context) return '';
    const labels = {
        whatYouDo: 'What the user does',
        business: 'User business',
        services: 'Products & services offered',
        interests: 'Interests & focus areas',
        expertise: 'Expertise',
        goals: 'Current goals',
        targetAudience: 'Target audience',
        positioning: 'Positioning & differentiators',
        communicationContext: 'Communication preferences',
        notes: 'Additional context'
    };
    const lines = [];
    for (const field of PERSONAL_CONTEXT_FIELDS){
        const value = context[field];
        if (value) lines.push(`- ${labels[field]}: ${value}`);
    }
    if (lines.length === 0) return '';
    return [
        'ABOUT THE USER (self-provided personal/business context — use it to',
        'personalize output for THIS user; never invent facts beyond it):',
        ...lines
    ].join('\n');
}
async function loadPersonalContextForAi(userId) {
    try {
        const settings = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].userSettings.findUnique({
            where: {
                userId
            },
            select: {
                personalContext: true
            }
        });
        const context = parsePersonalContext(settings?.personalContext);
        return {
            context,
            block: buildPersonalContextBlock(context)
        };
    } catch  {
        return {
            context: {},
            block: ''
        };
    }
}
async function buildPersonalContextBlockForUser(userId) {
    const { block } = await loadPersonalContextForAi(userId);
    return block;
}
}),
"[project]/src/lib/ai/zai-gateway-config.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "readZaiGatewayConfigStatus",
    ()=>readZaiGatewayConfigStatus,
    "zaiConfigCandidatePaths",
    ()=>zaiConfigCandidatePaths
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Z-AI Gateway Credential Status (read-only pre-flight)
//
// WHY THIS EXISTS (2026-09-26, "missing X-Token header" RCA):
// The z-ai-web-dev-sdk attaches the REQUIRED `X-Token` header only when
// the resolved gateway config JSON contains a non-empty `token` field
// (SDK src: `if (token) { headers['X-Token'] = token; }`). When that
// field is missing, requests still go out (baseUrl+apiKey are enough for
// the SDK to accept the file) but the gateway rejects them with
// `401 {"error":"missing X-Token header"}` — a cryptic error that hides
// the actual fix. This module performs a read-only pre-flight check so
// the provider adapter can fail fast with an actionable message.
//
// SECURITY: this module NEVER returns credential values — only
// existence booleans and file paths. Same candidate resolution order as
// the SDK (project cwd → home dir → /etc), first VALID file wins.
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/fs [external] (fs, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/path [external] (path, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$os__$5b$external$5d$__$28$os$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/os [external] (os, cjs)");
;
;
;
function zaiConfigCandidatePaths() {
    return [
        __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["default"].join(process.cwd(), '.z-ai-config'),
        __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["default"].join(__TURBOPACK__imported__module__$5b$externals$5d2f$os__$5b$external$5d$__$28$os$2c$__cjs$29$__["default"].homedir(), '.z-ai-config'),
        '/etc/.z-ai-config'
    ];
}
function isNonBlankString(v) {
    return typeof v === 'string' && v.trim().length > 0;
}
function readZaiGatewayConfigStatus(pathsOverride) {
    const candidates = pathsOverride ?? zaiConfigCandidatePaths();
    for (const filePath of candidates){
        let raw;
        try {
            raw = __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["default"].readFileSync(filePath, 'utf-8');
        } catch  {
            continue; // ENOENT/EACCES — mirror SDK: silently try next candidate
        }
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch  {
            continue; // Invalid JSON — SDK skips to next candidate, so do we
        }
        const hasBaseUrl = isNonBlankString(parsed.baseUrl);
        const hasApiKey = isNonBlankString(parsed.apiKey);
        // SDK validity rule (loadConfig): `if (config.baseUrl && config.apiKey)`
        if (!hasBaseUrl || !hasApiKey) continue;
        return {
            resolved: true,
            path: filePath,
            hasBaseUrl,
            hasApiKey,
            hasToken: isNonBlankString(parsed.token),
            reason: null
        };
    }
    return {
        resolved: false,
        path: null,
        hasBaseUrl: false,
        hasApiKey: false,
        hasToken: false,
        reason: 'No valid z-ai gateway config found. Checked: ' + candidates.join(', ') + ". A candidate file must be valid JSON with non-empty 'baseUrl' and 'apiKey' fields."
    };
}
}),
"[project]/src/lib/ai/ai-provider.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AI_CONFIG",
    ()=>AI_CONFIG,
    "clearCancelToken",
    ()=>clearCancelToken,
    "executeAICompletion",
    ()=>executeAICompletion,
    "executeAIStream",
    ()=>executeAIStream,
    "getAIUsageHistory",
    ()=>getAIUsageHistory,
    "getAIUsageSummary",
    ()=>getAIUsageSummary,
    "initializeAIProviders",
    ()=>initializeAIProviders,
    "isCancelled",
    ()=>isCancelled,
    "setCancelToken",
    ()=>setCancelToken
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — AI Provider Architecture
// Phase 8: Provider Abstraction + Failover + Retries + Usage Tracking
//
// CRITICAL RULES:
// - NEVER expose API keys
// - NEVER call AI from frontend
// - ALWAYS track usage
// - ALWAYS handle timeouts
// - ALWAYS implement retries
//
// Providers: z-ai (primary), OpenAI, Anthropic, OpenRouter, Local
// Each provider checks its API key from process.env before use
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$z$2d$ai$2d$web$2d$dev$2d$sdk$2f$dist$2f$index$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/z-ai-web-dev-sdk/dist/index.js [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$zai$2d$gateway$2d$config$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/ai/zai-gateway-config.ts [instrumentation] (ecmascript)");
;
;
// ===== ENV-DRIVEN CONFIGURATION =====
function getEnvNumber(key, defaultValue) {
    const val = process.env[key];
    if (!val) return defaultValue;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? defaultValue : parsed;
}
function getEnvFloat(key, defaultValue) {
    const val = process.env[key];
    if (!val) return defaultValue;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? defaultValue : parsed;
}
const AI_CONFIG = {
    defaultTimeout: getEnvNumber('AI_DEFAULT_TIMEOUT_MS', 30000),
    maxRetries: getEnvNumber('AI_MAX_RETRIES', 2),
    maxTokens: getEnvNumber('AI_MAX_TOKENS', 4096),
    defaultTemperature: getEnvFloat('AI_DEFAULT_TEMPERATURE', 0.7),
    chatMaxMessages: getEnvNumber('AI_CHAT_MAX_MESSAGES_PER_SESSION', 50),
    chatCreditCost: getEnvNumber('AI_CHAT_CREDIT_COST', 1),
    analysisCreditCost: getEnvNumber('AI_ANALYSIS_CREDIT_COST', 5),
    analysisCacheHours: getEnvNumber('AI_ANALYSIS_CACHE_HOURS', 24),
    scoringCreditCost: getEnvNumber('AI_SCORING_CREDIT_COST', 3),
    scoringCacheHours: getEnvNumber('AI_SCORING_CACHE_HOURS', 12),
    outreachCreditCost: getEnvNumber('AI_OUTREACH_CREDIT_COST', 2),
    memoryMaxTokens: getEnvNumber('AI_MEMORY_MAX_TOKENS', 500),
    memoryMaxAgeHours: getEnvNumber('AI_MEMORY_MAX_AGE_HOURS', 72),
    memoryCacheSize: getEnvNumber('AI_MEMORY_CACHE_SIZE', 500),
    promptMaxInputLength: getEnvNumber('AI_PROMPT_MAX_INPUT_LENGTH', 10000)
};
;
// ===== PROVIDER FALLBACK CHAIN =====
function getFallbackChain() {
    const chain = [
        'z-ai'
    ];
    // Add providers based on available env keys — only add if key is actually set
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0) {
        chain.push('openai');
    }
    if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim().length > 0) {
        chain.push('anthropic');
    }
    if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim().length > 0) {
        chain.push('openrouter');
    }
    // Local provider uses a local LLM endpoint
    if (process.env.AI_LOCAL_ENDPOINT && process.env.AI_LOCAL_ENDPOINT.trim().length > 0) {
        chain.push('local');
    }
    return chain;
}
// ===== DEFAULT CONFIG =====
const DEFAULT_CONFIG = {
    provider: 'z-ai',
    maxTokens: AI_CONFIG.maxTokens,
    temperature: AI_CONFIG.defaultTemperature,
    timeout: AI_CONFIG.defaultTimeout,
    retries: AI_CONFIG.maxRetries
};
// ===== IN-MEMORY USAGE TRACKING (with DB persistence) =====
const usageStore = [];
const MAX_USAGE_ENTRIES = 10000;
async function recordUsage(params) {
    const entry = {
        id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date(),
        ...params
    };
    usageStore.unshift(entry);
    if (usageStore.length > MAX_USAGE_ENTRIES) {
        usageStore.length = MAX_USAGE_ENTRIES;
    }
    // Also persist to DB for long-term tracking
    // FIX (2026-09-09): Use upsert instead of create. The table has a unique
    // constraint on (userId, feature, periodStart), so a second AI call within
    // the same billing period would throw "Unique constraint failed". The
    // upsert atomically increments the count on the existing period row.
    try {
        const { db } = await __turbopack_context__.A("[project]/src/lib/db.ts [instrumentation] (ecmascript, async loader)");
        const periodStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const periodEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
        await db.usageTracking.upsert({
            where: {
                userId_feature_periodStart: {
                    userId: params.userId,
                    feature: 'ai_provider',
                    periodStart
                }
            },
            create: {
                userId: params.userId,
                feature: 'ai_provider',
                action: params.action,
                count: 1,
                periodStart,
                periodEnd
            },
            update: {
                count: {
                    increment: 1
                },
                periodEnd
            }
        });
    } catch (dbError) {
        // DB write is best-effort, don't break the flow
        console.warn('[AIProvider] Failed to persist usage to DB:', dbError);
    }
}
// ===== PROVIDER IMPLEMENTATIONS =====
async function callZAI(messages, config) {
    // Pre-flight credential check (RCA 2026-09-26: 401 "missing X-Token header").
    // The gateway requires the X-Token header on every request; the SDK only
    // attaches it when the resolved .z-ai-config contains a non-empty `token`
    // field. Fail fast with an actionable message instead of sending a doomed
    // request that surfaces as a cryptic 401. Read-only — no values are logged.
    const gatewayStatus = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$zai$2d$gateway$2d$config$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["readZaiGatewayConfigStatus"])();
    if (!gatewayStatus.resolved) {
        throw new Error('CONFIGURATION_ERROR: z-ai gateway is not configured. ' + (gatewayStatus.reason || 'No valid .z-ai-config found.') + " Required fields: 'baseUrl', 'apiKey', 'token' (token supplies the mandatory X-Token auth header).");
    }
    if (!gatewayStatus.hasToken) {
        throw new Error("CONFIGURATION_ERROR: z-ai gateway credentials are incomplete — the 'token' field is missing or blank in " + `${gatewayStatus.path}. The gateway rejects every request without the X-Token header (401). ` + 'Re-provision the gateway config file with the token field set.');
    }
    try {
        const zai = await __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$z$2d$ai$2d$web$2d$dev$2d$sdk$2f$dist$2f$index$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["default"].create();
        const zaiMessages = messages.map((m)=>({
                role: m.role === 'system' ? 'assistant' : m.role,
                content: m.content
            }));
        const completion = await zai.chat.completions.create({
            messages: zaiMessages,
            thinking: {
                type: 'disabled'
            }
        });
        const content = completion.choices?.[0]?.message?.content || '';
        const tokensUsed = completion.usage?.total_tokens || Math.ceil(content.length / 4);
        const model = completion.model || 'z-ai-default';
        return {
            content,
            tokensUsed,
            model
        };
    } catch (error) {
        // Translate gateway auth rejections (token present but invalid/expired)
        // into an actionable message. Never include credential values.
        const rawMessage = error instanceof Error ? error.message : String(error);
        if (/\bstatus 40[13]\b/.test(rawMessage)) {
            throw new Error(`AUTH_ERROR: the z-ai gateway rejected the configured credentials (${rawMessage.slice(0, 120)}). ` + `The 'token' field in ${gatewayStatus.path} is invalid or expired — re-provision it. ` + 'This is not a transient failure; retries will not help.');
        }
        throw error;
    }
}
/**
 * OpenAI provider — uses fetch directly against OpenAI API.
 * Requires process.env.OPENAI_API_KEY to be set.
 * Waiting for production secret injection.
 */ async function callOpenAI(messages, config) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.trim().length === 0) {
        // No API key — fall back to ZAI
        return callZAI(messages, config);
    }
    const model = config.model || process.env.OPENAI_MODEL || 'gpt-4o';
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages: messages.map((m)=>({
                    role: m.role,
                    content: m.content
                })),
            max_tokens: config.maxTokens || AI_CONFIG.maxTokens,
            temperature: config.temperature ?? AI_CONFIG.defaultTemperature
        }),
        signal: AbortSignal.timeout(config.timeout || AI_CONFIG.defaultTimeout)
    });
    if (!response.ok) {
        const errorText = await response.text().catch(()=>'Unknown error');
        throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const tokensUsed = data.usage?.total_tokens || Math.ceil(content.length / 4);
    return {
        content,
        tokensUsed,
        model: data.model || model
    };
}
/**
 * Anthropic provider — uses fetch directly against Anthropic API.
 * Requires process.env.ANTHROPIC_API_KEY to be set.
 * Waiting for production secret injection.
 */ async function callAnthropic(messages, config) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey.trim().length === 0) {
        return callZAI(messages, config);
    }
    const model = config.model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
    const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1';
    // Anthropic uses a different message format — system is a separate parameter
    const systemMessage = messages.find((m)=>m.role === 'system')?.content || '';
    const nonSystemMessages = messages.filter((m)=>m.role !== 'system').map((m)=>({
            role: m.role,
            content: m.content
        }));
    const response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model,
            max_tokens: config.maxTokens || AI_CONFIG.maxTokens,
            system: systemMessage,
            messages: nonSystemMessages
        }),
        signal: AbortSignal.timeout(config.timeout || AI_CONFIG.defaultTimeout)
    });
    if (!response.ok) {
        const errorText = await response.text().catch(()=>'Unknown error');
        throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
    }
    const data = await response.json();
    const content = data.content?.[0]?.text || '';
    const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0) || Math.ceil(content.length / 4);
    return {
        content,
        tokensUsed,
        model: data.model || model
    };
}
/**
 * OpenRouter provider — uses fetch against OpenRouter API.
 * Requires process.env.OPENROUTER_API_KEY to be set.
 * Waiting for production secret injection.
 */ async function callOpenRouter(messages, config) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey || apiKey.trim().length === 0) {
        return callZAI(messages, config);
    }
    const model = config.model || process.env.OPENROUTER_MODEL || 'openai/gpt-4o';
    const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': ("TURBOPACK compile-time value", "https://preview-chat-ab88c1b0-d6fd-4199-b9d5-ec3a018502fc.space-z.ai") || 'https://acquisitionos.com',
            'X-Title': 'AcquisitionOS'
        },
        body: JSON.stringify({
            model,
            messages: messages.map((m)=>({
                    role: m.role,
                    content: m.content
                })),
            max_tokens: config.maxTokens || AI_CONFIG.maxTokens,
            temperature: config.temperature ?? AI_CONFIG.defaultTemperature
        }),
        signal: AbortSignal.timeout(config.timeout || AI_CONFIG.defaultTimeout)
    });
    if (!response.ok) {
        const errorText = await response.text().catch(()=>'Unknown error');
        throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const tokensUsed = data.usage?.total_tokens || Math.ceil(content.length / 4);
    return {
        content,
        tokensUsed,
        model: data.model || model
    };
}
/**
 * Local provider — uses a local LLM endpoint (e.g., Ollama, LM Studio).
 * Requires process.env.AI_LOCAL_ENDPOINT to be set.
 * Waiting for production secret injection.
 */ async function callLocal(messages, config) {
    const endpoint = process.env.AI_LOCAL_ENDPOINT;
    if (!endpoint || endpoint.trim().length === 0) {
        return callZAI(messages, config);
    }
    const model = config.model || process.env.AI_LOCAL_MODEL || 'local-default';
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model,
            messages: messages.map((m)=>({
                    role: m.role,
                    content: m.content
                })),
            max_tokens: config.maxTokens || AI_CONFIG.maxTokens,
            temperature: config.temperature ?? AI_CONFIG.defaultTemperature,
            stream: false
        }),
        signal: AbortSignal.timeout(config.timeout || AI_CONFIG.defaultTimeout)
    });
    if (!response.ok) {
        const errorText = await response.text().catch(()=>'Unknown error');
        throw new Error(`Local LLM error ${response.status}: ${errorText}`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || data.content?.[0]?.text || data.response || '';
    const tokensUsed = data.usage?.total_tokens || Math.ceil(content.length / 4);
    return {
        content,
        tokensUsed,
        model
    };
}
const PROVIDER_CALL_MAP = {
    'z-ai': callZAI,
    openai: callOpenAI,
    anthropic: callAnthropic,
    openrouter: callOpenRouter,
    local: callLocal
};
async function executeAICompletion(request, userId, action) {
    const config = {
        ...DEFAULT_CONFIG,
        ...request.config
    };
    const chain = getFallbackChain();
    const maxRetries = config.retries || AI_CONFIG.maxRetries;
    let lastError = '';
    let totalRetries = 0;
    // Try each provider in the fallback chain
    for (const provider of chain){
        const caller = PROVIDER_CALL_MAP[provider];
        if (!caller) continue;
        // Retry logic for each provider
        for(let attempt = 0; attempt <= maxRetries; attempt++){
            const startTime = Date.now();
            try {
                // Execute with timeout
                const result = await Promise.race([
                    caller(request.messages, config),
                    new Promise((_, reject)=>setTimeout(()=>reject(new Error(`Provider ${provider} timed out after ${config.timeout}ms`)), config.timeout || AI_CONFIG.defaultTimeout))
                ]);
                const latencyMs = Date.now() - startTime;
                // Validate response
                if (!result.content || result.content.trim().length === 0) {
                    throw new Error(`Empty response from provider ${provider}`);
                }
                // Record successful usage
                await recordUsage({
                    userId,
                    provider,
                    model: result.model,
                    action,
                    tokensUsed: result.tokensUsed,
                    latencyMs,
                    success: true
                });
                return {
                    success: true,
                    content: result.content,
                    provider,
                    model: result.model,
                    tokensUsed: result.tokensUsed,
                    latencyMs,
                    retries: attempt
                };
            } catch (error) {
                totalRetries++;
                lastError = error instanceof Error ? error.message : 'Unknown error';
                const latencyMs = Date.now() - startTime;
                console.warn(`[AIProvider] ${provider} attempt ${attempt + 1}/${maxRetries + 1} failed: ${lastError} (${latencyMs}ms)`);
                // Record failed usage
                await recordUsage({
                    userId,
                    provider,
                    model: config.model || 'unknown',
                    action,
                    tokensUsed: 0,
                    latencyMs,
                    success: false
                });
                // Exponential backoff before retry (skip on last attempt)
                if (attempt < maxRetries) {
                    const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
                    await new Promise((resolve)=>setTimeout(resolve, backoffMs));
                }
            }
        }
    }
    // All providers failed
    return {
        success: false,
        content: '',
        provider: 'z-ai',
        model: 'unknown',
        tokensUsed: 0,
        latencyMs: 0,
        retries: totalRetries,
        error: `All AI providers failed. Last error: ${lastError}`
    };
}
function executeAIStream(request, userId, action) {
    const encoder = new TextEncoder();
    let cancelled = false;
    return new ReadableStream({
        async start (controller) {
            try {
                // Execute the completion
                const result = await executeAICompletion(request, userId, action);
                if (!result.success || !result.content) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        error: result.error || 'AI generation failed',
                        done: true
                    })}\n\n`));
                    controller.close();
                    return;
                }
                // Stream the response in chunks for real-time feel
                const content = result.content;
                const words = content.split(/(\s+)/);
                let accumulated = '';
                const chunkSize = 4;
                for(let i = 0; i < words.length; i++){
                    if (cancelled) break;
                    accumulated += words[i];
                    const isChunkBoundary = (i + 1) % chunkSize === 0;
                    const isLast = i === words.length - 1;
                    if (isChunkBoundary || isLast) {
                        const chunk = {
                            content: accumulated,
                            done: isLast,
                            provider: result.provider
                        };
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
                        accumulated = '';
                        // Small delay for natural streaming feel
                        await new Promise((resolve)=>setTimeout(resolve, 18));
                    }
                }
                // Send any remaining content
                if (accumulated.trim()) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        content: accumulated,
                        done: true,
                        provider: result.provider
                    })}\n\n`));
                }
                // Send final done event
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    done: true,
                    content: '',
                    provider: result.provider
                })}\n\n`));
                controller.close();
            } catch (error) {
                const errMsg = error instanceof Error ? error.message : 'Stream error';
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    error: errMsg,
                    done: true
                })}\n\n`));
                controller.close();
            }
        },
        cancel () {
            cancelled = true;
        }
    });
}
function getAIUsageHistory(params) {
    let results = [
        ...usageStore
    ];
    if (params.userId) {
        results = results.filter((e)=>e.userId === params.userId);
    }
    if (params.action) {
        results = results.filter((e)=>e.action === params.action);
    }
    const limit = params.limit || 50;
    const offset = params.offset || 0;
    return results.slice(offset, offset + limit);
}
function getAIUsageSummary(userId) {
    const userEntries = usageStore.filter((e)=>e.userId === userId);
    const totalCalls = userEntries.length;
    const successCalls = userEntries.filter((e)=>e.success).length;
    const totalTokens = userEntries.reduce((sum, e)=>sum + e.tokensUsed, 0);
    const avgLatencyMs = totalCalls > 0 ? Math.round(userEntries.reduce((sum, e)=>sum + e.latencyMs, 0) / totalCalls) : 0;
    const byAction = {};
    const byProvider = {};
    for (const entry of userEntries){
        // By action
        if (!byAction[entry.action]) {
            byAction[entry.action] = {
                calls: 0,
                tokens: 0,
                avgLatency: 0
            };
        }
        byAction[entry.action].calls++;
        byAction[entry.action].tokens += entry.tokensUsed;
        // By provider
        if (!byProvider[entry.provider]) {
            byProvider[entry.provider] = {
                calls: 0,
                tokens: 0
            };
        }
        byProvider[entry.provider].calls++;
        byProvider[entry.provider].tokens += entry.tokensUsed;
    }
    // Calculate average latencies
    for (const action of Object.keys(byAction)){
        const actionEntries = userEntries.filter((e)=>e.action === action);
        byAction[action].avgLatency = actionEntries.length > 0 ? Math.round(actionEntries.reduce((sum, e)=>sum + e.latencyMs, 0) / actionEntries.length) : 0;
    }
    return {
        totalCalls,
        totalTokens,
        avgLatencyMs,
        successRate: totalCalls > 0 ? Math.round(successCalls / totalCalls * 100) : 0,
        byAction,
        byProvider
    };
}
// ===== CANCELLATION TOKENS (in-memory) =====
const cancellationTokens = new Map();
function setCancelToken(sessionId) {
    cancellationTokens.set(sessionId, true);
}
function isCancelled(sessionId) {
    return cancellationTokens.get(sessionId) === true;
}
function clearCancelToken(sessionId) {
    cancellationTokens.delete(sessionId);
}
async function initializeAIProviders() {
    const chain = getFallbackChain();
    // Test primary provider
    try {
        const zai = await __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$z$2d$ai$2d$web$2d$dev$2d$sdk$2f$dist$2f$index$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["default"].create();
        if (zai) {
            console.log('[AIProvider] Primary provider (z-ai) available');
        }
    } catch (error) {
        console.error('[AIProvider] Primary provider test failed:', error);
    }
    // Log which providers are available
    const availableKeys = {
        openai: !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()),
        anthropic: !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim()),
        openrouter: !!(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim()),
        local: !!(process.env.AI_LOCAL_ENDPOINT && process.env.AI_LOCAL_ENDPOINT.trim())
    };
    console.log('[AIProvider] Provider availability:', {
        'z-ai': true,
        ...availableKeys
    });
    console.log('[AIProvider] Fallback chain:', chain.join(' → '));
    return {
        available: chain,
        primary: chain[0] || 'z-ai'
    };
}
}),
"[project]/src/lib/ai/prompt-manager.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getPrompt",
    ()=>getPrompt,
    "getPromptMeta",
    ()=>getPromptMeta,
    "listPrompts",
    ()=>listPrompts,
    "sanitizePromptInput",
    ()=>sanitizePromptInput,
    "savePrompt",
    ()=>savePrompt
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Prompt Management System
// Phase 8: System Prompts + Templates + Versioning + Storage + Audit
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$ai$2d$provider$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/ai/ai-provider.ts [instrumentation] (ecmascript)");
;
// ===== PROMPT STORE =====
const promptStore = new Map();
// ===== BUILT-IN PROMPTS =====
const BUILTIN_PROMPTS = [
    // Lead Analysis Prompt
    {
        id: 'lead-analysis',
        name: 'Lead Analysis',
        description: 'Comprehensive AI analysis of a lead including website, social, scores, and recommendations',
        category: 'analysis',
        currentVersion: 2,
        variables: [
            'leadContext',
            'businessName',
            'niche',
            'country',
            'stage',
            'scores'
        ],
        versions: [
            {
                version: 1,
                content: `You are an elite business analyst specializing in lead qualification and digital presence assessment. Analyze the given lead information and provide a comprehensive assessment.`,
                createdAt: '2024-01-01',
                description: 'Initial version'
            },
            {
                version: 2,
                content: `You are an elite business analyst and lead qualification expert for AcquisitionOS. Analyze the provided lead data and return a detailed JSON assessment.

Given Lead Information:
{{leadContext}}

Business: {{businessName}}
Niche: {{niche}}
Country: {{country}}
Pipeline Stage: {{stage}}
Current Scores: {{scores}}

Analyze this lead and return a JSON object with these EXACT fields:
{
  "leadScore": number (0-100, overall quality),
  "opportunityScore": number (0-100, how good an opportunity),
  "outreachStrategy": "string - recommended approach",
  "strengths": ["array of business strengths"],
  "weaknesses": ["array of weaknesses or pain points"],
  "websiteAnalysis": {
    "quality": "none|poor|average|good|excellent",
    "issues": ["array of specific issues"],
    "recommendations": ["array of improvements"]
  },
  "techAnalysis": {
    "stack": ["array of detected technologies"],
    "maturity": "none|basic|intermediate|advanced",
    "gaps": ["array of tech gaps"]
  },
  "recommendations": ["array of actionable next steps"],
  "purchaseProbability": number (0-100 — your qualitative confidence in FIT, not a claimed conversion metric),
  "outreachPriority": "low|medium|high|critical",
  "estimatedDealSize": "string - estimate ONLY if lead data supports a size band (e.g. staff count, site scale); otherwise exactly 'unknown — insufficient evidence'",
  "bestApproach": "string - how to approach this lead",
  "keyPainPoints": ["array of specific pain points to address, each grounded in the provided evidence"]
}

EVIDENCE & HONESTY RULES (binding):
- Ground every claim in the provided lead information. Do NOT fabricate revenue, profit, customer counts, percentages, conversion rates, ROI, payback periods, or money lost.
- If impact cannot be reliably quantified with the available evidence, say so explicitly (e.g. "impact cannot be reliably quantified with the available evidence") instead of inventing a number.
- Any estimate must be visibly qualified as an estimate with its basis.

Be specific, data-driven, and actionable. Return ONLY valid JSON.`,
                createdAt: '2025-01-15',
                description: 'Enhanced with structured output and more fields'
            }
        ]
    },
    // Lead Scoring Prompt
    {
        id: 'lead-scoring',
        name: 'Lead Scoring',
        description: 'Generate detailed scores for a lead with explainability',
        category: 'scoring',
        currentVersion: 2,
        variables: [
            'leadContext',
            'businessName',
            'niche'
        ],
        versions: [
            {
                version: 1,
                content: `Score this lead and explain your reasoning.`,
                createdAt: '2024-01-01',
                description: 'Initial version'
            },
            {
                version: 2,
                content: `You are a lead scoring expert for AcquisitionOS. Score the given lead across multiple dimensions with full explainability.

Lead Information:
{{leadContext}}

Business: {{businessName}}
Niche: {{niche}}

Return a JSON object with these EXACT fields:
{
  "leadQualityScore": number (0-100),
  "purchaseProbability": number (0-100),
  "outreachPriority": "low|medium|high|critical",
  "websiteQualityScore": number (0-100),
  "digitalMaturityScore": number (0-100),
  "aiConfidenceScore": number (0-100, how confident are you in these scores),
  "explanations": {
    "leadQuality": "string - why this quality score",
    "purchaseProbability": "string - why this purchase probability",
    "outreachPriority": "string - why this priority level",
    "websiteQuality": "string - why this website quality score",
    "digitalMaturity": "string - why this digital maturity score"
  },
  "scoringFactors": {
    "positive": ["array of factors that increase scores"],
    "negative": ["array of factors that decrease scores"],
    "neutral": ["array of factors with no significant impact"]
  },
  "refreshRecommendation": "string - when to re-score this lead"
}

Be analytical, evidence-based, and explain your reasoning. Return ONLY valid JSON.`,
                createdAt: '2025-01-15',
                description: 'Enhanced with multi-dimensional scoring and explainability'
            }
        ]
    },
    // Outreach Generation Prompt
    {
        id: 'outreach-generation',
        name: 'Outreach Generation',
        description: 'Generate personalized outreach messages for different channels',
        category: 'outreach',
        currentVersion: 3,
        variables: [
            'leadContext',
            'businessName',
            'ownerName',
            'niche',
            'channel',
            'tone',
            'language',
            'senderSignature'
        ],
        versions: [
            {
                version: 1,
                content: `Write a cold outreach message for this lead.`,
                createdAt: '2024-01-01',
                description: 'Initial version'
            },
            {
                version: 2,
                content: `You are an expert cold outreach writer for AcquisitionOS. Create compelling, personalized outreach messages.

Lead Information:
{{leadContext}}

Business: {{businessName}}
Owner: {{ownerName}}
Niche: {{niche}}
Channel: {{channel}}
Tone: {{tone}}
Language: {{language}}

Generate outreach content and return a JSON object:
{
  "subject": "string - email subject line (for email channel)",
  "body": "string - main message body",
  "callToAction": "string - specific CTA",
  "followUpSuggestion": "string - suggested follow-up approach",
  "personalizationPoints": ["array of what makes this personalized"],
  "toneAnalysis": "string - how the tone matches the target",
  "estimatedReplyRate": number (0-100 — your qualitative confidence in message quality based ONLY on the provided evidence; this is an internal heuristic, never a measured or guaranteed outcome),
  "alternativeVersions": {
    "formal": "string - formal version of the message",
    "casual": "string - casual version",
    "urgent": "string - urgency-driven version"
  }
}

Rules:
- NEVER use generic templates
- ALWAYS reference specific details about the business
- Make it feel personal, not automated
- Include a clear, specific CTA
- Keep it concise (under 150 words for email, under 100 for WhatsApp/LinkedIn)

Return ONLY valid JSON.`,
                createdAt: '2025-01-15',
                description: 'Enhanced with multi-version generation and personalization'
            },
            {
                version: 3,
                content: `You are an expert cold outreach writer for AcquisitionOS. Create compelling, personalized outreach messages.

Lead Information:
{{leadContext}}

Business: {{businessName}}
Owner: {{ownerName}}
Niche: {{niche}}
Channel: {{channel}}
Tone: {{tone}}
Language: {{language}}

{{senderSignature}}

Generate outreach content and return a JSON object:
{
  "subject": "string - email subject line (for email channel)",
  "body": "string - main message body",
  "callToAction": "string - specific CTA",
  "followUpSuggestion": "string - suggested follow-up approach",
  "personalizationPoints": ["array of what makes this personalized"],
  "toneAnalysis": "string - how the tone matches the target",
  "estimatedReplyRate": number (0-100 — your qualitative confidence in message quality based ONLY on the provided evidence; this is an internal heuristic, never a measured or guaranteed outcome),
  "alternativeVersions": {
    "formal": "string - formal version of the message",
    "casual": "string - casual version",
    "urgent": "string - urgency-driven version"
  }
}

Rules:
- NEVER use generic templates
- ALWAYS reference specific details about the business
- Make it feel personal, not automated
- Include a clear, specific CTA
- Keep it concise (under 150 words for email, under 100 for WhatsApp/LinkedIn)
- Sign the message ONLY with the real sender details given above; never use placeholders like [Your Name]

Return ONLY valid JSON.`,
                createdAt: '2026-10-02',
                description: 'Adds authenticated sender signature block (no more [Your Name] placeholders)'
            }
        ]
    },
    // Follow-up Generation Prompt
    {
        id: 'followup-generation',
        name: 'Follow-up Generation',
        description: 'Generate follow-up messages for leads that have gone silent',
        category: 'outreach',
        currentVersion: 2,
        variables: [
            'leadContext',
            'businessName',
            'previousMessage',
            'daysSinceLastContact',
            'channel',
            'senderSignature'
        ],
        versions: [
            {
                version: 1,
                content: `You are a follow-up message expert for AcquisitionOS. Generate compelling follow-up messages that re-engage silent leads.

Lead Information:
{{leadContext}}

Business: {{businessName}}
Previous Message Sent: {{previousMessage}}
Days Since Last Contact: {{daysSinceLastContact}}
Channel: {{channel}}

Return a JSON object:
{
  "subject": "string - follow-up subject (for email)",
  "body": "string - follow-up message body",
  "angle": "string - the psychological angle used",
  "urgencyLevel": "low|medium|high",
  "alternativeAngles": ["array of 2-3 alternative approaches"],
  "bestSendTime": "string - recommended send time"
}

Make it feel natural, not pushy. Reference specific value propositions. Return ONLY valid JSON.`,
                createdAt: '2025-01-15'
            },
            {
                version: 2,
                content: `You are a follow-up message expert for AcquisitionOS. Generate compelling follow-up messages that re-engage silent leads.

Lead Information:
{{leadContext}}

Business: {{businessName}}
Previous Message Sent: {{previousMessage}}
Days Since Last Contact: {{daysSinceLastContact}}
Channel: {{channel}}

{{senderSignature}}

Return a JSON object:
{
  "subject": "string - follow-up subject (for email)",
  "body": "string - follow-up message body",
  "angle": "string - the psychological angle used",
  "urgencyLevel": "low|medium|high",
  "alternativeAngles": ["array of 2-3 alternative approaches"],
  "bestSendTime": "string - recommended send time"
}

Make it feel natural, not pushy. Reference specific value propositions. Sign the message ONLY with the real sender details given above; never use placeholders like [Your Name]. Return ONLY valid JSON.`,
                createdAt: '2026-10-02',
                description: 'Adds authenticated sender signature block (no more [Your Name] placeholders)'
            }
        ]
    },
    // AI Chat System Prompt
    {
        id: 'ai-chat',
        name: 'AI Chat',
        description: 'General AI chat system prompt for the assistant',
        category: 'chat',
        currentVersion: 2,
        variables: [
            'leadContext',
            'currentPage',
            'userName',
            'orgName'
        ],
        versions: [
            {
                version: 1,
                content: `You are a helpful sales assistant.`,
                createdAt: '2024-01-01'
            },
            {
                version: 2,
                content: `You are AcquisitionOS AI — an elite sales strategist, deal-closing expert, and business acquisition assistant. You help users navigate complex B2B conversations, analyze leads, generate outreach, and close deals.

Current Context:
{{leadContext}}
Current Page: {{currentPage}}
User: {{userName}}
Organization: {{orgName}}

Capabilities:
- Lead analysis and scoring
- Outreach message generation
- Sales coaching and conversation analysis
- Pipeline strategy recommendations
- Deal closing guidance

Rules:
- Be specific and actionable — no generic advice
- Always reference specific data when available
- Suggest concrete next steps
- Use a professional but warm tone
- If you don't know something, say so honestly
- When generating messages, make them feel personal and authentic`,
                createdAt: '2025-01-15'
            }
        ]
    },
    // Sales Coach Prompt
    {
        id: 'sales-coach',
        name: 'Sales Coach',
        description: 'Sales coaching mode for conversation analysis',
        category: 'chat',
        currentVersion: 2,
        variables: [
            'leadContext',
            'currentPage'
        ],
        versions: [
            {
                version: 1,
                content: `You are a sales coach.`,
                createdAt: '2024-01-01'
            },
            {
                version: 2,
                content: `You are an elite Sales Coach AI for AcquisitionOS — a master at analyzing sales conversations, decoding buyer psychology, and crafting winning responses.

Current Context:
{{leadContext}}
Current Page: {{currentPage}}

When analyzing a conversation or message, provide your analysis in Markdown format:

## 🎯 Intent Analysis
[Classify as: Positive / Neutral / Negative / Objection — explain what the prospect means]

## 🟢 Buying Signals
- [Specific signals detected]

## 🔴 Hesitation Factors
- [Specific concerns or objections]

## 💬 Reply Options
### Professional
[Formal reply for C-suite]

### Casual
[Warm, conversational reply]

### Urgent
[Urgency-driven reply]

## 🏁 Closing Strategy
[Specific strategy, timing, and next milestone]

## 📊 Deal Probability: X%
[Percentage with explanation]

Be specific and actionable. Use EXACT format with emoji headers.`,
                createdAt: '2025-01-15'
            }
        ]
    }
];
// ===== INITIALIZE PROMPTS =====
function initializePrompts() {
    for (const prompt of BUILTIN_PROMPTS){
        promptStore.set(prompt.id, prompt);
    }
}
// Initialize on module load
initializePrompts();
function getPrompt(promptId, variables = {}, version) {
    const template = promptStore.get(promptId);
    if (!template) {
        throw new Error(`Prompt template "${promptId}" not found`);
    }
    const targetVersion = version || template.currentVersion;
    const versionData = template.versions.find((v)=>v.version === targetVersion);
    if (!versionData) {
        throw new Error(`Version ${targetVersion} not found for prompt "${promptId}"`);
    }
    // Replace variables in content
    let content = versionData.content;
    for (const [key, value] of Object.entries(variables)){
        const placeholder = `{{${key}}}`;
        content = content.replace(new RegExp(placeholder, 'g'), value || '');
    }
    return {
        content,
        version: targetVersion,
        variables: template.variables
    };
}
function listPrompts(category) {
    const all = Array.from(promptStore.values());
    if (category) {
        return all.filter((p)=>p.category === category);
    }
    return all;
}
function getPromptMeta(promptId) {
    return promptStore.get(promptId) || null;
}
function savePrompt(template) {
    const existing = promptStore.get(template.id);
    const newVersion = {
        version: existing ? existing.currentVersion + 1 : 1,
        content: template.content,
        createdAt: new Date().toISOString(),
        description: template.description
    };
    if (existing) {
        existing.versions.push(newVersion);
        existing.currentVersion = newVersion.version;
    } else {
        promptStore.set(template.id, {
            ...template,
            currentVersion: 1,
            versions: [
                newVersion
            ]
        });
    }
}
function sanitizePromptInput(input) {
    // Remove common injection patterns
    return input.replace(/ignore previous instructions/gi, '[filtered]').replace(/disregard above/gi, '[filtered]').replace(/you are now/gi, '[filtered]').replace(/new instructions/gi, '[filtered]').replace(/system:/gi, '[filtered]').slice(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$ai$2d$provider$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["AI_CONFIG"].promptMaxInputLength); // Limit input length
}
}),
"[project]/src/lib/ai/ai-audit.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "logAIAudit",
    ()=>logAIAudit,
    "logAnalysisGenerated",
    ()=>logAnalysisGenerated,
    "logChatEnded",
    ()=>logChatEnded,
    "logChatStarted",
    ()=>logChatStarted,
    "logCreditsDeducted",
    ()=>logCreditsDeducted,
    "logGenerationCancelled",
    ()=>logGenerationCancelled,
    "logOutreachGenerated",
    ()=>logOutreachGenerated,
    "logProviderSwitched",
    ()=>logProviderSwitched,
    "logScoreGenerated",
    ()=>logScoreGenerated
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — AI Audit Logging
// Phase 8: Mandatory audit events for all AI operations
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [instrumentation] (ecmascript)");
;
async function logAIAudit(entry) {
    try {
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].auditLog.create({
            data: {
                userId: entry.userId,
                action: entry.action,
                details: entry.details ? JSON.stringify(entry.details) : null,
                resource: entry.resource || 'ai',
                resourceId: entry.resourceId || null,
                ipAddress: entry.ipAddress || null,
                userAgent: entry.userAgent || null
            }
        });
    } catch (error) {
        console.error('[AIAudit] Failed to log audit event:', error);
    // Never throw — audit logging must not break the main flow
    }
}
async function logAnalysisGenerated(userId, leadId, details) {
    return logAIAudit({
        userId,
        action: 'ai_analysis_generated',
        resource: 'lead',
        resourceId: leadId,
        details
    });
}
async function logScoreGenerated(userId, leadId, details) {
    return logAIAudit({
        userId,
        action: 'ai_score_generated',
        resource: 'lead',
        resourceId: leadId,
        details
    });
}
async function logOutreachGenerated(userId, leadId, details) {
    return logAIAudit({
        userId,
        action: 'ai_outreach_generated',
        resource: 'lead',
        resourceId: leadId,
        details
    });
}
async function logChatStarted(userId, sessionId, details) {
    return logAIAudit({
        userId,
        action: 'ai_chat_started',
        resource: 'ai_chat_session',
        resourceId: sessionId,
        details
    });
}
async function logChatEnded(userId, sessionId, details) {
    return logAIAudit({
        userId,
        action: 'ai_chat_ended',
        resource: 'ai_chat_session',
        resourceId: sessionId,
        details
    });
}
async function logCreditsDeducted(userId, details) {
    return logAIAudit({
        userId,
        action: 'ai_credits_deducted',
        resource: 'credits',
        resourceId: details.referenceId,
        details
    });
}
async function logProviderSwitched(userId, details) {
    return logAIAudit({
        userId,
        action: 'ai_provider_switched',
        details
    });
}
async function logGenerationCancelled(userId, sessionId, details) {
    return logAIAudit({
        userId,
        action: 'ai_generation_cancelled',
        resource: 'ai_chat_session',
        resourceId: sessionId,
        details
    });
}
}),
"[project]/src/lib/ai/outreach-generator.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "generateOutreach",
    ()=>generateOutreach,
    "getOutreachHistory",
    ()=>getOutreachHistory,
    "loadSenderProfile",
    ()=>loadSenderProfile
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Outreach Generation Engine
// Phase 8: AI-powered outreach message generation
//
// Generates:
// - Cold emails
// - WhatsApp drafts
// - Telegram drafts
// - LinkedIn messages
// - Follow-ups
// - Sequence steps
//
// Requirements:
// - Tone selection
// - Personalization
// - Language support
// - Regeneration
// - Templates
//
// CRITICAL: ONLY generation. NEVER send messages.
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$personal$2d$context$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/personal-context.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$resolution$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/lead-resolution.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$ai$2d$provider$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/ai/ai-provider.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$prompt$2d$manager$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/ai/prompt-manager.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$ai$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/ai/ai-audit.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$credit$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/credit-service.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$sender$2d$signature$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/ai/sender-signature.ts [instrumentation] (ecmascript)");
;
;
;
;
;
;
;
;
// ===== CREDIT COST =====
const OUTREACH_CREDIT_COST = 2;
const OUTREACH_ACTION = 'outreach_message';
// ===== CHANNEL CONSTRAINTS =====
const CHANNEL_CONSTRAINTS = {
    email: {
        maxWords: 200,
        requiresSubject: true
    },
    whatsapp: {
        maxWords: 100,
        requiresSubject: false
    },
    telegram: {
        maxWords: 100,
        requiresSubject: false
    },
    linkedin: {
        maxWords: 150,
        requiresSubject: false
    },
    instagram: {
        maxWords: 80,
        requiresSubject: false
    }
};
async function loadSenderProfile(userId) {
    const user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].user.findUnique({
        where: {
            id: userId
        },
        select: {
            name: true,
            email: true,
            phone: true,
            company: true,
            settings: {
                select: {
                    companyName: true,
                    personalContext: true
                }
            },
            organizations: {
                take: 1,
                select: {
                    organization: {
                        select: {
                            name: true
                        }
                    }
                }
            }
        }
    });
    if (!user) return {};
    return {
        name: user.name,
        email: user.email,
        phone: user.phone,
        company: user.settings?.companyName ?? user.organizations[0]?.organization?.name ?? user.company,
        // User Preference / Personal Business Context (DISTINCT self-description;
        // parsed via the shared helper so malformed data can never throw here).
        personalContext: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$personal$2d$context$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["parsePersonalContext"])(user.settings?.personalContext)
    };
}
async function generateOutreach(input) {
    const { leadId, userId, channel, tone = 'professional', language = 'English', customInstructions, previousMessageId } = input;
    try {
        // 1. Get lead data — single reliable owner-scoped resolution path
        const resolution = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$resolution$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["resolveLeadForExecution"])(userId, leadId, {
            include: {
                outreachMessages: {
                    where: {
                        channel
                    },
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 3
                }
            }
        });
        if (!resolution.ok) {
            return {
                success: false,
                error: resolution.userMessage
            };
        }
        const lead = resolution.lead;
        // 2. Check credits
        const sufficiency = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$credit$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["checkCreditSufficiency"])(userId, OUTREACH_CREDIT_COST);
        if (!sufficiency.sufficient) {
            return {
                success: false,
                error: `Insufficient credits. Need ${OUTREACH_CREDIT_COST}, have ${sufficiency.balance}`
            };
        }
        // 3. Deduct credits
        const deduction = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$credit$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["deductCredits"])({
            userId,
            action: OUTREACH_ACTION,
            cost: OUTREACH_CREDIT_COST,
            referenceId: leadId
        });
        if (!deduction.success) {
            return {
                success: false,
                error: deduction.error || 'Failed to deduct credits'
            };
        }
        // 4. Build context
        const previousMessages = lead.outreachMessages.map((m)=>`[${m.channel}] ${m.content}`).join('\n');
        const leadContext = [
            `Business: ${lead.businessName}`,
            lead.ownerName ? `Owner: ${lead.ownerName}` : '',
            lead.niche ? `Niche: ${lead.niche}` : '',
            lead.country ? `Country: ${lead.country}` : '',
            lead.city ? `City: ${lead.city}` : '',
            `Stage: ${lead.stage}`,
            lead.website ? `Website: ${lead.website}` : '',
            lead.digitalWeaknesses ? `Weaknesses: ${lead.digitalWeaknesses}` : '',
            lead.opportunityNotes ? `Opportunity: ${lead.opportunityNotes}` : '',
            lead.bestContactPerson ? `Best Contact: ${lead.bestContactPerson}` : '',
            lead.outreachStyle ? `Preferred Style: ${lead.outreachStyle}` : '',
            previousMessages ? `Previous Outreach:\n${previousMessages}` : ''
        ].filter(Boolean).join('\n');
        // 5. Determine if follow-up or initial
        const isFollowUp = !!previousMessageId;
        const promptId = isFollowUp ? 'followup-generation' : 'outreach-generation';
        // Sender identity comes from the AUTHENTICATED user's saved profile so
        // the AI signs with real details instead of placeholders like
        // "[Your Name]". Never the lead's details, never hardcoded values.
        const senderProfile = await loadSenderProfile(userId);
        const prompt = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$prompt$2d$manager$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["getPrompt"])(promptId, {
            leadContext: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$prompt$2d$manager$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["sanitizePromptInput"])(leadContext),
            businessName: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$prompt$2d$manager$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["sanitizePromptInput"])(lead.businessName),
            ownerName: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$prompt$2d$manager$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["sanitizePromptInput"])(lead.ownerName || 'Business Owner'),
            niche: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$prompt$2d$manager$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["sanitizePromptInput"])(lead.niche || 'Unknown'),
            channel,
            tone,
            language,
            previousMessage: isFollowUp ? 'See context above' : '',
            daysSinceLastContact: lead.lastContactedAt ? String(Math.ceil((Date.now() - new Date(lead.lastContactedAt).getTime()) / (1000 * 60 * 60 * 24))) : 'Never contacted',
            senderSignature: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$sender$2d$signature$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["buildSenderSignatureBlock"])(senderProfile)
        });
        // 6. Execute AI completion. The user's self-provided personal/business
        // context (Settings → My Context) is appended so every outreach message
        // is personalized for THIS user, without touching the versioned
        // prompt templates.
        const userContextBlock = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$personal$2d$context$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["buildPersonalContextBlock"])(senderProfile.personalContext);
        const userMessage = (customInstructions ? `Generate a ${tone} ${channel} outreach message for ${lead.businessName}. Custom instructions: ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$prompt$2d$manager$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["sanitizePromptInput"])(customInstructions)}` : `Generate a ${tone} ${channel} outreach message for ${lead.businessName}.`) + (userContextBlock ? `\n\n${userContextBlock}` : '');
        const completionRequest = {
            messages: [
                {
                    role: 'system',
                    content: prompt.content
                },
                {
                    role: 'user',
                    content: userMessage
                }
            ],
            config: {
                provider: 'z-ai',
                maxTokens: 2048,
                temperature: 0.8,
                timeout: 30000,
                retries: 2
            }
        };
        const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$ai$2d$provider$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["executeAICompletion"])(completionRequest, userId, 'outreach_generation');
        if (!result.success || !result.content) {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$credit$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["refundCredits"])({
                userId,
                amount: OUTREACH_CREDIT_COST,
                originalAction: OUTREACH_ACTION,
                referenceId: leadId
            });
            return {
                success: false,
                error: result.error || 'AI generation failed'
            };
        }
        // 7. Parse response
        let outreachData;
        try {
            const jsonMatch = result.content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('No JSON in response');
            const parsed = JSON.parse(jsonMatch[0]);
            const constraints = CHANNEL_CONSTRAINTS[channel];
            // Signature personalization: replace any "[Your Name]"-style
            // placeholders the model still emitted with the authenticated
            // user's real saved profile values (missing fields are omitted
            // cleanly). Real signatures pass through unchanged; nothing is
            // ever appended, so existing contact details are not duplicated.
            const personalizedBody = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$sender$2d$signature$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["applySenderSignature"])(String(parsed.body || ''), senderProfile);
            outreachData = {
                subject: constraints.requiresSubject ? String(parsed.subject || `Re: ${lead.businessName}`) : undefined,
                body: personalizedBody,
                callToAction: String(parsed.callToAction || ''),
                followUpSuggestion: String(parsed.followUpSuggestion || ''),
                personalizationPoints: Array.isArray(parsed.personalizationPoints) ? parsed.personalizationPoints.map(String) : [],
                toneAnalysis: String(parsed.toneAnalysis || ''),
                estimatedReplyRate: Math.min(100, Math.max(0, Number(parsed.estimatedReplyRate) || 30)),
                alternativeVersions: parsed.alternativeVersions || {
                    formal: String(parsed.body || ''),
                    casual: String(parsed.body || ''),
                    urgent: String(parsed.body || '')
                },
                channel,
                tone,
                leadId,
                aiProvider: result.provider
            };
        } catch (parseError) {
            console.error('[OutreachGenerator] Failed to parse:', parseError);
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$credit$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["refundCredits"])({
                userId,
                amount: OUTREACH_CREDIT_COST,
                originalAction: OUTREACH_ACTION,
                referenceId: leadId
            });
            return {
                success: false,
                error: 'Failed to parse AI outreach response'
            };
        }
        // 8. Store as draft outreach message
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].outreachMessage.create({
            data: {
                leadId,
                userId,
                channel,
                subject: outreachData.subject,
                content: outreachData.body,
                status: 'draft',
                generatedByAI: true,
                metadata: JSON.stringify({
                    tone,
                    language,
                    callToAction: outreachData.callToAction,
                    followUpSuggestion: outreachData.followUpSuggestion,
                    personalizationPoints: outreachData.personalizationPoints,
                    estimatedReplyRate: outreachData.estimatedReplyRate,
                    alternativeVersions: outreachData.alternativeVersions,
                    toneAnalysis: outreachData.toneAnalysis,
                    aiProvider: result.provider
                })
            }
        });
        // 9. Log audit
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$ai$2d$audit$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["logOutreachGenerated"])(userId, leadId, {
            channel,
            tone,
            provider: result.provider
        });
        return {
            success: true,
            message: outreachData,
            creditsDeducted: OUTREACH_CREDIT_COST,
            newBalance: deduction.newBalance
        };
    } catch (error) {
        console.error('[OutreachGenerator] Error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Outreach generation failed'
        };
    }
}
async function getOutreachHistory(leadId, channel) {
    const where = {
        leadId,
        generatedByAI: true
    };
    if (channel) where.channel = channel;
    return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].outreachMessage.findMany({
        where,
        orderBy: {
            createdAt: 'desc'
        },
        take: 10
    });
}
}),
"[project]/src/lib/workflow-actions.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "executeAction",
    ()=>executeAction
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Action Execution Engine
// Phase 12: Execute each action type using existing services
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$resolution$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/lead-resolution.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/email.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$pipeline$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/pipeline-service.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$sender$2d$signature$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/ai/sender-signature.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$outreach$2d$generator$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/ai/outreach-generator.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$personal$2d$context$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/personal-context.ts [instrumentation] (ecmascript)");
;
;
;
;
;
;
;
async function executeAction(actionType, config, context) {
    try {
        switch(actionType){
            case 'send_email':
                return await executeSendEmail(config, context);
            case 'create_gmail_draft':
            case 'send_gmail_draft':
                return await executeCreateGmailDraft(config, context);
            case 'send_telegram':
                return await executeSendTelegram(config, context);
            case 'send_whatsapp':
                return await executeSendWhatsapp(config, context);
            case 'ai_analysis':
                return await executeAiAnalysis(config, context);
            case 'ai_outreach':
                return await executeAiOutreach(config, context);
            case 'move_lead_stage':
            case 'move_to_stage':
                return await executeMoveLeadStage(config, context);
            case 'update_tags':
            case 'add_tag':
                return await executeUpdateTags(config, context);
            case 'create_notification':
                return await executeCreateNotification(config, context);
            case 'wait_delay':
                return await executeWaitDelay(config, context);
            case 'conditional_branch':
                return await executeConditionalBranch(config, context);
            case 'webhook_call':
                return await executeWebhookCall(config, context);
            case 'export_data':
                return await executeExportData(config, context);
            case 'score_lead':
                return await executeScoreLead(config, context);
            case 'add_note':
                return await executeAddNote(config, context);
            case 'notify_low_credits':
                return await executeNotifyLowCredits(config, context);
            case 'notify_trial_ending':
                return await executeNotifyTrialEnding(config, context);
            default:
                return {
                    success: false,
                    error: `Unknown action type: ${actionType}`
                };
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Action execution failed'
        };
    }
}
// ===== ACTION IMPLEMENTATIONS =====
async function executeSendEmail(config, context) {
    const { to, subject, body } = config;
    if (!to || !subject || !body) {
        return {
            success: false,
            error: 'Email requires to, subject, and body'
        };
    }
    // Resolve template variables in subject/body
    const resolvedSubject = resolveTemplate(String(subject), context);
    const resolvedBody = resolveTemplate(String(body), context);
    // ── Human-approval gate (workflow.requiresApproval) ──
    // Outbound delivery is NEVER automatic when the workflow is configured to
    // require approval: the message is parked as a DRAFT (the existing approval
    // queue in Outreach) and the owner is notified. A human must send it from
    // the Outreach tab — AI can never approve its own outbound action.
    if (context.requiresApproval) {
        const draft = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].outreachMessage.create({
            data: {
                leadId: context.leadId || '',
                userId: context.userId,
                channel: 'email',
                direction: 'outbound',
                subject: resolvedSubject,
                content: resolvedBody,
                status: 'draft',
                generatedByAI: false
            }
        });
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].notification.create({
            data: {
                userId: context.userId,
                type: 'workflow',
                title: 'Approval required: outreach draft ready',
                message: `A workflow prepared an email${to ? ` to ${to}` : ''} and is waiting for your approval. Review and send it from the Outreach tab.`,
                actionUrl: '/business-ai/outreach',
                deliveredVia: 'in_app'
            }
        }).catch(()=>{
        // Notification is best-effort; the draft itself is the source of truth.
        });
        return {
            success: true,
            output: {
                approvalRequired: true,
                draftId: draft.id,
                to: String(to)
            },
            creditsUsed: 0
        };
    }
    const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["sendEmail"])({
        to: String(to),
        subject: resolvedSubject,
        html: resolvedBody,
        text: resolvedBody
    });
    return {
        success: result.sent,
        output: {
            messageId: result.messageId,
            devMode: result.devMode
        },
        error: result.error,
        creditsUsed: 2
    };
}
async function executeCreateGmailDraft(config, context) {
    const { to, subject, body } = config;
    if (!to || !subject || !body) {
        return {
            success: false,
            error: 'Gmail draft requires to, subject, and body'
        };
    }
    // Check if user has a connected Gmail account
    const emailAccount = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].emailAccount.findFirst({
        where: {
            userId: context.userId,
            status: 'active'
        }
    });
    if (!emailAccount) {
        return {
            success: false,
            error: 'No active Gmail account connected'
        };
    }
    // In production, this would call the Gmail API to create a draft
    // For now, create an outreach message as draft
    const message = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].outreachMessage.create({
        data: {
            leadId: context.leadId || '',
            userId: context.userId,
            channel: 'email',
            direction: 'outbound',
            subject: resolveTemplate(String(subject), context),
            content: resolveTemplate(String(body), context),
            status: 'draft',
            generatedByAI: false
        }
    });
    return {
        success: true,
        output: {
            draftId: message.id,
            to: String(to)
        },
        creditsUsed: 2
    };
}
async function executeSendTelegram(config, context) {
    const { message, chatId } = config;
    if (!message) {
        return {
            success: false,
            error: 'Telegram action requires a message'
        };
    }
    // Check if user has Telegram configured
    const telegramConfig = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].telegramConfig.findFirst({
        where: {
            userId: context.userId,
            isConnected: true
        }
    });
    if (!telegramConfig) {
        return {
            success: false,
            error: 'Telegram not connected'
        };
    }
    // In production, this would send via Telegram Bot API
    // Create an outreach message record
    if (context.leadId) {
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].outreachMessage.create({
            data: {
                leadId: context.leadId,
                userId: context.userId,
                channel: 'telegram',
                direction: 'outbound',
                content: resolveTemplate(String(message), context),
                status: 'sent',
                generatedByAI: false,
                metadata: JSON.stringify({
                    chatId: chatId || telegramConfig.chatId
                })
            }
        });
    }
    return {
        success: true,
        output: {
            chatId: chatId || telegramConfig.chatId
        },
        creditsUsed: 2
    };
}
async function executeSendWhatsapp(config, context) {
    const { message, phoneNumber } = config;
    if (!message) {
        return {
            success: false,
            error: 'WhatsApp action requires a message'
        };
    }
    // Check if user has WhatsApp configured
    const whatsappConfig = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].whatsappConfig.findFirst({
        where: {
            userId: context.userId,
            isConnected: true
        }
    });
    if (!whatsappConfig) {
        return {
            success: false,
            error: 'WhatsApp not connected'
        };
    }
    // Create outreach message record
    if (context.leadId) {
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].outreachMessage.create({
            data: {
                leadId: context.leadId,
                userId: context.userId,
                channel: 'whatsapp',
                direction: 'outbound',
                content: resolveTemplate(String(message), context),
                status: 'sent',
                generatedByAI: false,
                metadata: JSON.stringify({
                    phoneNumber: phoneNumber || ''
                })
            }
        });
    }
    return {
        success: true,
        output: {
            phoneNumber: phoneNumber || ''
        },
        creditsUsed: 2
    };
}
async function executeAiAnalysis(config, context) {
    const { prompt, model } = config;
    if (!context.leadId) {
        return {
            success: false,
            error: 'AI analysis requires a lead context'
        };
    }
    try {
        const chat = await createZaiChat();
        const resolution = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$resolution$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["resolveLeadForExecution"])(context.userId, context.leadId, {
            include: {
                leadAnalysis: true
            }
        });
        if (!resolution.ok) {
            return {
                success: false,
                error: 'Lead not found for AI analysis'
            };
        }
        const lead = resolution.lead;
        const analysisPrompt = prompt ? resolveTemplate(String(prompt), context) : `Analyze this lead for sales potential: ${lead.businessName}. 
         Current stage: ${lead.stage}. Reply score: ${lead.replyScore}. 
         Conversion score: ${lead.conversionScore}. Urgency: ${lead.urgencyScore}.
         Provide a brief analysis and recommendations.`;
        const response = await chat.sendMessage(analysisPrompt);
        return {
            success: true,
            output: {
                analysis: response.text || response.content || '',
                leadId: context.leadId,
                model: model || 'default'
            },
            creditsUsed: 5
        };
    } catch (error) {
        return {
            success: false,
            error: `AI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}
async function executeAiOutreach(config, context) {
    const { channel, style, tone } = config;
    if (!context.leadId) {
        return {
            success: false,
            error: 'AI outreach requires a lead context'
        };
    }
    try {
        const chat = await createZaiChat();
        const resolution = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$resolution$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["resolveLeadForExecution"])(context.userId, context.leadId);
        if (!resolution.ok) {
            return {
                success: false,
                error: 'Lead not found for AI outreach'
            };
        }
        const lead = resolution.lead;
        const outreachChannel = String(channel || 'email');
        const outreachStyle = style || 'professional';
        const outreachTone = tone || 'friendly';
        // SENDER IDENTITY: the workflow acts on behalf of the user who owns it.
        // Real profile goes into the prompt; placeholder tokens the model still
        // emits are replaced before the draft is stored.
        const senderProfile = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$outreach$2d$generator$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["loadSenderProfile"])(context.userId);
        const senderBlock = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$sender$2d$signature$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["buildSenderSignatureBlock"])(senderProfile);
        // USER PERSONAL CONTEXT: workflow-generated outreach must be personalized
        // exactly like the manual path — the user's own description of what they
        // do, their services, audience and positioning is authoritative and the
        // model may never invent facts beyond it.
        const personalContextBlock = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$personal$2d$context$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["buildPersonalContextBlockForUser"])(context.userId);
        const prompt = `Generate a ${outreachStyle} ${outreachChannel} outreach message for:
      Business: ${lead.businessName}
      Owner: ${lead.ownerName || 'Unknown'}
      Niche: ${lead.niche || 'Unknown'}
      City: ${lead.city || 'Unknown'}
      Tone: ${outreachTone}
      
      Create a compelling, personalized message that addresses their potential needs.

${senderBlock}${personalContextBlock}`;
        const response = await chat.sendMessage(prompt);
        const generatedMessage = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ai$2f$sender$2d$signature$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["applySenderSignature"])(response.text || response.content || '', senderProfile);
        // Create outreach message record
        const message = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].outreachMessage.create({
            data: {
                leadId: context.leadId,
                userId: context.userId,
                channel: outreachChannel,
                direction: 'outbound',
                subject: outreachChannel === 'email' ? `Re: ${lead.businessName}` : null,
                content: generatedMessage,
                status: 'draft',
                generatedByAI: true
            }
        });
        return {
            success: true,
            output: {
                messageId: message.id,
                channel: outreachChannel,
                generatedMessage
            },
            creditsUsed: 5
        };
    } catch (error) {
        return {
            success: false,
            error: `AI outreach failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}
async function executeMoveLeadStage(config, context) {
    // Accept both config shapes that legitimately exist in the system:
    // the workflow builder stores targetStage, the AI workflow generator
    // (and legacy steps) store stage. Same fallback the legacy executor uses.
    const targetStage = config.targetStage || config.stage;
    if (!context.leadId) {
        return {
            success: false,
            error: 'Move lead stage requires a lead context'
        };
    }
    if (!targetStage) {
        return {
            success: false,
            error: 'Target stage is required'
        };
    }
    const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$pipeline$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["moveLeadToStage"])(context.leadId, String(targetStage), context.userId);
    return {
        success: result.success,
        output: {
            leadId: result.leadId,
            fromStage: result.fromStage,
            toStage: result.toStage
        },
        error: result.error,
        creditsUsed: 1
    };
}
async function executeUpdateTags(config, context) {
    // Accept both config shapes that legitimately exist in the system:
    // the builder/AI generator may store `tags` (array), `tag` (single string)
    // or a comma-separated string — the saved definition is the truth.
    const rawTags = config.tags ?? config.tag;
    const tags = Array.isArray(rawTags) ? rawTags.map(String).map((t)=>t.trim()).filter(Boolean) : typeof rawTags === 'string' && rawTags.trim() ? rawTags.split(',').map((t)=>t.trim()).filter(Boolean) : [];
    if (!context.leadId) {
        return {
            success: false,
            error: 'Update tags requires a lead context'
        };
    }
    if (tags.length === 0) {
        return {
            success: false,
            error: 'Tags array is required'
        };
    }
    const tagsResolution = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$resolution$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["resolveLeadForExecution"])(context.userId, context.leadId, {
        select: {
            tags: true
        }
    });
    if (!tagsResolution.ok) {
        return {
            success: false,
            error: 'Lead not found'
        };
    }
    const lead = tagsResolution.lead;
    let currentTags = [];
    try {
        currentTags = JSON.parse(lead.tags || '[]');
    } catch  {
        currentTags = [];
    }
    const tagAction = action || 'add';
    let newTags;
    if (tagAction === 'add') {
        newTags = [
            ...new Set([
                ...currentTags,
                ...tags.map(String)
            ])
        ];
    } else if (tagAction === 'remove') {
        newTags = currentTags.filter((t)=>!tags.map(String).includes(t));
    } else {
        newTags = tags.map(String);
    }
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.update({
        where: {
            id: context.leadId
        },
        data: {
            tags: JSON.stringify(newTags)
        }
    });
    return {
        success: true,
        output: {
            previousTags: currentTags,
            newTags,
            action: tagAction
        },
        creditsUsed: 1
    };
}
async function executeCreateNotification(config, context) {
    const { title, message, type, actionUrl } = config;
    if (!title || !message) {
        return {
            success: false,
            error: 'Notification requires title and message'
        };
    }
    const notification = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].notification.create({
        data: {
            userId: context.userId,
            type: String(type || 'workflow'),
            title: resolveTemplate(String(title), context),
            message: resolveTemplate(String(message), context),
            actionUrl: actionUrl ? String(actionUrl) : null,
            deliveredVia: 'in_app'
        }
    });
    return {
        success: true,
        output: {
            notificationId: notification.id
        },
        creditsUsed: 1
    };
}
async function executeWaitDelay(config, _context) {
    const { duration, unit } = config;
    if (!duration) {
        return {
            success: false,
            error: 'Delay requires a duration'
        };
    }
    const durationNum = Number(duration);
    const delayUnit = String(unit || 'minutes');
    // Convert to milliseconds
    let delayMs;
    switch(delayUnit){
        case 'seconds':
            delayMs = durationNum * 1000;
            break;
        case 'minutes':
            delayMs = durationNum * 60 * 1000;
            break;
        case 'hours':
            delayMs = durationNum * 60 * 60 * 1000;
            break;
        case 'days':
            delayMs = durationNum * 24 * 60 * 60 * 1000;
            break;
        default:
            delayMs = durationNum * 60 * 1000;
            break;
    }
    return {
        success: true,
        output: {
            delayMs,
            duration: durationNum,
            unit: delayUnit
        },
        creditsUsed: 0
    };
}
async function executeConditionalBranch(config, context) {
    const { field, operator, value, trueBranch, falseBranch } = config;
    if (!field || !operator) {
        return {
            success: false,
            error: 'Conditional branch requires field and operator'
        };
    }
    // Get the field value from context
    let fieldValue;
    if (field === 'leadStage' && context.leadId) {
        const lead = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.findUnique({
            where: {
                id: context.leadId
            },
            select: {
                stage: true
            }
        });
        fieldValue = lead?.stage;
    } else if (field === 'leadScore' && context.leadId) {
        const lead = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.findUnique({
            where: {
                id: context.leadId
            },
            select: {
                conversionScore: true
            }
        });
        fieldValue = lead?.conversionScore;
    } else if (field === 'triggerData') {
        fieldValue = context.triggerData?.[String(field)];
    } else if (context.previousOutputs) {
        fieldValue = context.previousOutputs[String(field)];
    } else {
        fieldValue = context.triggerData?.[String(field)];
    }
    // Evaluate condition
    let conditionMet = false;
    const compareValue = value;
    switch(operator){
        case 'eq':
        case '==':
            conditionMet = fieldValue == compareValue;
            break;
        case 'neq':
        case '!=':
            conditionMet = fieldValue != compareValue;
            break;
        case 'gt':
        case '>':
            conditionMet = Number(fieldValue) > Number(compareValue);
            break;
        case 'gte':
        case '>=':
            conditionMet = Number(fieldValue) >= Number(compareValue);
            break;
        case 'lt':
        case '<':
            conditionMet = Number(fieldValue) < Number(compareValue);
            break;
        case 'lte':
        case '<=':
            conditionMet = Number(fieldValue) <= Number(compareValue);
            break;
        case 'contains':
            conditionMet = String(fieldValue).includes(String(compareValue));
            break;
        case 'not_contains':
            conditionMet = !String(fieldValue).includes(String(compareValue));
            break;
        case 'in':
            conditionMet = String(compareValue).split(',').map((s)=>s.trim()).includes(String(fieldValue));
            break;
        case 'not_in':
            conditionMet = !String(compareValue).split(',').map((s)=>s.trim()).includes(String(fieldValue));
            break;
        default:
            conditionMet = false;
    }
    return {
        success: true,
        output: {
            conditionMet,
            branch: conditionMet ? trueBranch || 'true' : falseBranch || 'false',
            fieldValue,
            operator,
            compareValue
        },
        creditsUsed: 0
    };
}
async function executeWebhookCall(config, context) {
    const { url, method, headers, body } = config;
    if (!url) {
        return {
            success: false,
            error: 'Webhook requires a URL'
        };
    }
    try {
        const response = await fetch(String(url), {
            method: String(method || 'POST'),
            headers: {
                'Content-Type': 'application/json',
                ...headers || {}
            },
            body: body ? JSON.stringify({
                ...typeof body === 'object' ? body : {},
                workflowId: context.workflowId,
                executionId: context.executionId,
                leadId: context.leadId,
                triggerData: context.triggerData
            }) : JSON.stringify({
                workflowId: context.workflowId,
                executionId: context.executionId,
                leadId: context.leadId,
                triggerData: context.triggerData
            })
        });
        let responseBody;
        try {
            responseBody = await response.json();
        } catch  {
            responseBody = await response.text();
        }
        return {
            success: response.ok,
            output: {
                statusCode: response.status,
                body: responseBody
            },
            error: response.ok ? undefined : `Webhook returned ${response.status}`,
            creditsUsed: 1
        };
    } catch (error) {
        return {
            success: false,
            error: `Webhook call failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}
async function executeExportData(config, context) {
    const { format, dataType, filters } = config;
    if (!dataType) {
        return {
            success: false,
            error: 'Export requires a data type'
        };
    }
    // For now, create a data export record
    const exportRecord = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].dataExport.create({
        data: {
            userId: context.userId,
            type: String(format || 'csv'),
            status: 'pending'
        }
    });
    return {
        success: true,
        output: {
            exportId: exportRecord.id,
            format: format || 'csv',
            dataType
        },
        creditsUsed: 3
    };
}
async function executeScoreLead(config, context) {
    if (!context.leadId) {
        return {
            success: false,
            error: 'Score lead requires a lead context'
        };
    }
    try {
        const chat = await createZaiChat();
        const resolution = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$resolution$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["resolveLeadForExecution"])(context.userId, context.leadId);
        if (!resolution.ok) {
            return {
                success: false,
                error: 'Lead not found'
            };
        }
        const lead = resolution.lead;
        const prompt = `Score this lead on a scale of 0-100 for sales conversion potential:
      Business: ${lead.businessName}
      Niche: ${lead.niche || 'Unknown'}
      Current stage: ${lead.stage}
      Reply score: ${lead.replyScore}
      Conversion score: ${lead.conversionScore}
      
      Return ONLY a number between 0-100.`;
        const response = await chat.sendMessage(prompt);
        const scoreText = (response.text || response.content || '0').trim();
        const score = Math.min(100, Math.max(0, parseInt(scoreText.replace(/[^0-9]/g, ''), 10) || 0));
        // Update lead scores
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.update({
            where: {
                id: context.leadId
            },
            data: {
                conversionScore: score
            }
        });
        // Create score record
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].leadScore.create({
            data: {
                leadId: context.leadId,
                scoreType: 'conversion',
                score,
                explanation: scoreText
            }
        });
        return {
            success: true,
            output: {
                leadId: context.leadId,
                score,
                explanation: scoreText
            },
            creditsUsed: 5
        };
    } catch (error) {
        return {
            success: false,
            error: `Score lead failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}
async function executeAddNote(config, context) {
    const { content, pinned } = config;
    if (!context.leadId) {
        return {
            success: false,
            error: 'Add note requires a lead context'
        };
    }
    if (!content) {
        return {
            success: false,
            error: 'Note content is required'
        };
    }
    const note = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].leadNote.create({
        data: {
            leadId: context.leadId,
            userId: context.userId,
            content: resolveTemplate(String(content), context),
            pinned: Boolean(pinned)
        }
    });
    return {
        success: true,
        output: {
            noteId: note.id
        },
        creditsUsed: 1
    };
}
async function executeNotifyLowCredits(config, context) {
    const user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].user.findUnique({
        where: {
            id: context.userId
        },
        select: {
            credits: true,
            name: true,
            email: true
        }
    });
    if (!user) {
        return {
            success: false,
            error: 'User not found'
        };
    }
    const threshold = Number(config.threshold) || 10;
    if (user.credits > threshold) {
        return {
            success: true,
            output: {
                skipped: true,
                reason: `Credits (${user.credits}) above threshold (${threshold})`
            },
            creditsUsed: 0
        };
    }
    // Create notification
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].notification.create({
        data: {
            userId: context.userId,
            type: 'credit_low',
            title: 'Low Credit Warning',
            message: `You have ${user.credits} credits remaining. Consider upgrading your plan or purchasing additional credits.`,
            deliveredVia: 'in_app',
            metadata: JSON.stringify({
                credits: user.credits,
                threshold
            })
        }
    });
    // Also send email if configured
    if (user.email) {
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["sendEmail"])({
            to: user.email,
            subject: 'Low Credit Warning — AcquisitionOS',
            html: `<p>Hi ${user.name || 'there'},</p><p>You have <strong>${user.credits}</strong> credits remaining.</p>`,
            text: `Hi ${user.name || 'there'}, You have ${user.credits} credits remaining.`
        });
    }
    return {
        success: true,
        output: {
            credits: user.credits,
            threshold
        },
        creditsUsed: 0
    };
}
async function executeNotifyTrialEnding(config, context) {
    const user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].user.findUnique({
        where: {
            id: context.userId
        },
        select: {
            isTrial: true,
            trialEndsAt: true,
            name: true,
            email: true,
            plan: true
        }
    });
    if (!user || !user.isTrial || !user.trialEndsAt) {
        return {
            success: true,
            output: {
                skipped: true,
                reason: 'Not on trial or no trial end date'
            },
            creditsUsed: 0
        };
    }
    const daysUntilExpiry = Math.ceil((user.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const notifyThreshold = Number(config.daysThreshold) || 3;
    if (daysUntilExpiry > notifyThreshold) {
        return {
            success: true,
            output: {
                skipped: true,
                reason: `Trial ends in ${daysUntilExpiry} days (threshold: ${notifyThreshold})`
            },
            creditsUsed: 0
        };
    }
    // Create notification
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].notification.create({
        data: {
            userId: context.userId,
            type: 'trial_ending',
            title: 'Trial Ending Soon',
            message: `Your ${user.plan} plan trial ends in ${daysUntilExpiry} day(s). Upgrade to keep access to all features.`,
            deliveredVia: 'in_app',
            metadata: JSON.stringify({
                daysUntilExpiry,
                trialEndsAt: user.trialEndsAt
            })
        }
    });
    return {
        success: true,
        output: {
            daysUntilExpiry,
            trialEndsAt: user.trialEndsAt
        },
        creditsUsed: 0
    };
}
// ===== TEMPLATE VARIABLE RESOLVER =====
function resolveTemplate(template, context) {
    let resolved = template;
    // Replace common variables
    const replacements = {
        '{{leadId}}': context.leadId || '',
        '{{workflowId}}': context.workflowId,
        '{{executionId}}': context.executionId,
        '{{userId}}': context.userId
    };
    // Add trigger data variables
    if (context.triggerData) {
        for (const [key, value] of Object.entries(context.triggerData)){
            replacements[`{{trigger.${key}}}`] = String(value ?? '');
        }
    }
    // Add previous output variables
    if (context.previousOutputs) {
        for (const [key, value] of Object.entries(context.previousOutputs)){
            replacements[`{{output.${key}}}`] = String(value ?? '');
        }
    }
    for (const [placeholder, value] of Object.entries(replacements)){
        resolved = resolved.replace(new RegExp(escapeRegExp(placeholder), 'g'), value);
    }
    return resolved;
}
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// ── Local adapter ─────────────────────────────────────────────────
// The z-ai-web-dev-sdk package does not export `createChat`; emulate the
// chat.sendMessage() interface used above via ZAI.create().
async function createZaiChat() {
    const { default: ZAI } = await __turbopack_context__.A("[project]/node_modules/z-ai-web-dev-sdk/dist/index.js [instrumentation] (ecmascript, async loader)");
    const zai = await ZAI.create();
    return {
        sendMessage: async (prompt)=>{
            const completion = await zai.chat.completions.create({
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            });
            const text = completion.choices?.[0]?.message?.content ?? '';
            return {
                text,
                content: text
            };
        }
    };
}
}),
"[externals]/events [external] (events, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("events", () => require("events"));

module.exports = mod;
}),
"[project]/src/lib/redis-pubsub-service.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

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
__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__,
    "redisPubSub",
    ()=>redisPubSub
]);
// ── Lazy Redis loader ──────────────────────────────────────────────
let _redisConstructor = null;
let _loadAttempted = false;
/**
 * Lazily attempt to load ioredis.  Returns the Redis class if available,
 * or null if the package is not installed.
 */ async function loadRedisConstructor() {
    if (_loadAttempted) return _redisConstructor;
    _loadAttempted = true;
    try {
        // @ts-expect-error ioredis is an optional peer dependency — may not be installed
        const mod = await __turbopack_context__.A("[project]/node_modules/ioredis/built/index.js [instrumentation] (ecmascript, async loader)");
        _redisConstructor = mod.default || mod;
    } catch  {
        // ioredis not installed — Redis features will be disabled
        console.warn('[RedisPubSub] ioredis not available. Redis pub/sub is disabled. ' + 'Install ioredis or set REDIS_URL to enable cross-process event distribution.');
    }
    return _redisConstructor;
}
// ── RedisPubSubService ─────────────────────────────────────────────
class RedisPubSubService {
    publisher = null;
    subscriber = null;
    connected = false;
    available = false;
    permanentlyDisabled = false;
    warnedOnce = false;
    publishedCount = 0;
    subscriptions = new Map();
    connectionPromise = null;
    // ── Connection ─────────────────────────────────────────────────
    /**
   * Connect to Redis.  Idempotent — safe to call multiple times.
   * Returns true if connected, false if Redis is unavailable.
   */ async connect() {
        // Already decided Redis is not available
        if (this.permanentlyDisabled) return false;
        if (this.connected) return true;
        // Coalesce concurrent connect() calls
        if (this.connectionPromise) return this.connectionPromise;
        this.connectionPromise = this._doConnect();
        try {
            return await this.connectionPromise;
        } finally{
            this.connectionPromise = null;
        }
    }
    async _doConnect() {
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
                retryStrategy: (times)=>{
                    if (times > 5) {
                        this._warn('Redis retry limit reached — giving up.');
                        this.permanentlyDisabled = true;
                        return null; // stop retrying
                    }
                    return Math.min(times * 200, 2000);
                },
                lazyConnect: true,
                connectTimeout: 5000
            };
            this.publisher = new RedisCtor(redisUrl, {
                ...opts
            });
            this.subscriber = new RedisCtor(redisUrl, {
                ...opts
            });
            // Attempt connection
            await Promise.all([
                this.publisher.connect(),
                this.subscriber.connect()
            ]);
            // Handle disconnects gracefully
            this.publisher.on('error', (err)=>{
                this._warn(`Redis publisher error: ${err.message}`);
                this.connected = false;
            });
            this.subscriber.on('error', (err)=>{
                this._warn(`Redis subscriber error: ${err.message}`);
                this.connected = false;
            });
            this.publisher.on('close', ()=>{
                this.connected = false;
            });
            this.subscriber.on('close', ()=>{
                this.connected = false;
            });
            this.connected = true;
            this.available = true;
            console.info('[RedisPubSub] Connected to Redis successfully.');
            return true;
        } catch (error) {
            this._warn(`Failed to connect to Redis at ${redisUrl}: ${error instanceof Error ? error.message : String(error)} — Redis pub/sub disabled.`);
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
   */ async disconnect() {
        if (!this.publisher && !this.subscriber) return;
        try {
            const disconnects = [];
            if (this.publisher) {
                disconnects.push(this.publisher.quit().then(()=>{}));
            }
            if (this.subscriber) {
                disconnects.push(this.subscriber.quit().then(()=>{}));
            }
            await Promise.allSettled(disconnects);
        } catch  {
        // Force close on error
        } finally{
            this._cleanupConnections();
            this.connected = false;
            this.available = false;
        }
    }
    _cleanupConnections() {
        try {
            this.publisher?.disconnect?.();
        } catch  {}
        try {
            this.subscriber?.disconnect?.();
        } catch  {}
        this.publisher = null;
        this.subscriber = null;
    }
    // ── Publish ────────────────────────────────────────────────────
    /**
   * Publish a message to a Redis channel.
   * No-op if Redis is not connected.
   */ async publish(channel, message) {
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
            this._warn(`Publish failed on channel "${channel}": ${error instanceof Error ? error.message : String(error)}`);
            return 0;
        }
    }
    // ── Subscribe ──────────────────────────────────────────────────
    /**
   * Subscribe to a Redis channel with a callback.
   * Multiple callbacks per channel are supported.
   */ async subscribe(channel, callback) {
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
        this.subscriptions.get(channel).add(callback);
        // Tell Redis to subscribe (only once per channel)
        try {
            await this.subscriber.subscribe(channel);
            // Set up message handler (once per subscriber)
            if (!this.subscriber._acqHandlerAttached) {
                this.subscriber.on('message', (ch, msg)=>{
                    const cbs = this.subscriptions.get(ch);
                    if (cbs) {
                        for (const cb of cbs){
                            try {
                                cb(ch, msg);
                            } catch  {}
                        }
                    }
                });
                this.subscriber._acqHandlerAttached = true;
            }
        } catch (error) {
            this._warn(`Subscribe failed on channel "${channel}": ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
   * Unsubscribe from a Redis channel.
   * If no callback is provided, removes all callbacks for the channel.
   */ async unsubscribe(channel, callback) {
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
            this._warn(`Unsubscribe failed on channel "${channel}": ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // ── Status ─────────────────────────────────────────────────────
    /** Check if currently connected to Redis */ isConnected() {
        return this.connected && !this.permanentlyDisabled;
    }
    /** Check if Redis is available (ever connected successfully) */ isAvailable() {
        return this.available;
    }
    /** Get operational stats */ getStats() {
        return {
            publishedCount: this.publishedCount,
            subscribedChannels: this.subscriptions.size,
            connected: this.connected,
            available: this.available
        };
    }
    /** Get the total number of published messages */ getPublishedCount() {
        return this.publishedCount;
    }
    // ── Internal ───────────────────────────────────────────────────
    _warn(msg) {
        if (!this.warnedOnce) {
            console.warn(`[RedisPubSub] ${msg}`);
            this.warnedOnce = true;
        } else {
            // Subsequent warnings at debug level
            console.debug?.(`[RedisPubSub] ${msg}`);
        }
    }
}
const redisPubSub = new RedisPubSubService();
const __TURBOPACK__default__export__ = redisPubSub;
}),
"[project]/src/lib/realtime-engine.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "EVENT_CHANNELS",
    ()=>EVENT_CHANNELS,
    "_eventBus",
    ()=>eventBus,
    "createAndPublishNotification",
    ()=>createAndPublishNotification,
    "default",
    ()=>__TURBOPACK__default__export__,
    "eventBus",
    ()=>eventBus,
    "getEventHistory",
    ()=>getEventHistory,
    "publishAIEvent",
    ()=>publishAIEvent,
    "publishLeadEvent",
    ()=>publishLeadEvent,
    "publishMessageEvent",
    ()=>publishMessageEvent,
    "publishPaymentEvent",
    ()=>publishPaymentEvent,
    "publishWorkflowEvent",
    ()=>publishWorkflowEvent,
    "subscribeToChannel",
    ()=>subscribeToChannel,
    "subscribeToUserChannel",
    ()=>subscribeToUserChannel,
    "subscribeToUserEvents",
    ()=>subscribeToUserEvents
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Realtime Engine
// Phase 11: Server-side event publishing, notification creation,
//           in-memory EventBus, deduplication, history & rate limiting
//
// ARCHITECTURE:
//   1. EventBus (extends EventEmitter) — in-process pub/sub for
//      SSE routes and other in-process consumers.
//   2. Redis PubSub — cross-process distribution (optional).
//      Falls back gracefully when Redis is unavailable.
//   3. Notification creation — persists to DB and publishes events.
//   4. Event dedup — prevents double-processing via in-memory set.
//   5. Event history — per-user buffer for replay support.
//   6. Rate limiting — per-user throttle for event publishing.
//   7. Audit logging — key events logged to AuditLog table.
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$externals$5d2f$events__$5b$external$5d$__$28$events$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/events [external] (events, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$redis$2d$pubsub$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/redis-pubsub-service.ts [instrumentation] (ecmascript)");
;
;
;
const EVENT_CHANNELS = [
    'lead_events',
    'payment_events',
    'notification_events',
    'message_events',
    'workflow_events',
    'ai_events'
];
// ── Constants ──────────────────────────────────────────────────────
const DEDUP_MAX_ENTRIES = 10_000;
const DEDUP_TTL_MS = 60 * 60 * 1000; // 1 hour
const HISTORY_MAX_PER_USER = 100;
const HISTORY_TTL_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_PER_SECOND = 100;
const RATE_LIMIT_WINDOW_MS = 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
// ── EventBus Singleton ─────────────────────────────────────────────
/**
 * In-process event bus extending EventEmitter.
 * Used by SSE routes and other in-process consumers.
 * Also attempts to publish to Redis for cross-process distribution.
 */ class EventBus extends __TURBOPACK__imported__module__$5b$externals$5d2f$events__$5b$external$5d$__$28$events$2c$__cjs$29$__["EventEmitter"] {
    dedupMap = new Map();
    historyMap = new Map();
    historyTimestamps = new Map();
    rateLimitMap = new Map();
    cleanupTimer = null;
    totalPublished = 0;
    constructor(){
        super();
        // Allow many listeners (SSE routes, debug listeners, etc.)
        this.setMaxListeners(200);
        // Periodic cleanup of dedup, history, and rate-limit entries
        this.cleanupTimer = setInterval(()=>this._cleanup(), CLEANUP_INTERVAL_MS);
        // Don't prevent process exit
        if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
            this.cleanupTimer.unref();
        }
    }
    // ── Publish ─────────────────────────────────────────────────────
    /**
   * Publish an event to the EventBus (in-process) and optionally to Redis.
   * Skips if event is a duplicate or user is rate-limited.
   */ async publishEvent(channel, event) {
        // 1. Dedup check
        if (this.deduplicateEvent(event.eventId)) {
            return {
                published: false,
                reason: 'duplicate'
            };
        }
        // 2. Rate limit check
        const rateCheck = this._checkRateLimit(event.userId);
        if (!rateCheck.allowed) {
            return {
                published: false,
                reason: 'rate_limited'
            };
        }
        // 3. Emit locally
        this.emit(channel, event);
        this.emit('*', event); // wildcard channel for global listeners
        // 4. Store in history
        this._storeHistory(event);
        // 5. Try to publish to Redis
        try {
            const message = JSON.stringify(event);
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$redis$2d$pubsub$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["redisPubSub"].publish(channel, message);
        } catch  {
        // Redis failure is non-blocking — the in-process bus already delivered
        }
        this.totalPublished++;
        return {
            published: true
        };
    }
    // ── Deduplication ───────────────────────────────────────────────
    /**
   * Check if an event ID has already been processed.
   * Returns true if it was a duplicate (already seen).
   */ deduplicateEvent(eventId) {
        if (this.dedupMap.has(eventId)) {
            return true; // duplicate
        }
        this.dedupMap.set(eventId, {
            timestamp: Date.now()
        });
        // Evict oldest entries if over limit
        if (this.dedupMap.size > DEDUP_MAX_ENTRIES) {
            const keysIter = this.dedupMap.keys();
            const toDelete = Math.floor(DEDUP_MAX_ENTRIES * 0.2); // remove 20%
            let deleted = 0;
            for (const key of keysIter){
                this.dedupMap.delete(key);
                deleted++;
                if (deleted >= toDelete) break;
            }
        }
        return false;
    }
    // ── Event History ───────────────────────────────────────────────
    /**
   * Get recent events for a user, supporting replay.
   * @param userId    The user ID
   * @param afterEventId  Only return events after this event ID (exclusive)
   * @param limit     Max events to return (default 50)
   */ getEventHistory(userId, afterEventId, limit = 50) {
        const events = this.historyMap.get(userId) || [];
        if (afterEventId) {
            const idx = events.findIndex((e)=>e.eventId === afterEventId);
            if (idx === -1) {
                // afterEventId not found — return all up to limit
                return events.slice(0, limit);
            }
            return events.slice(idx + 1, idx + 1 + limit);
        }
        return events.slice(0, limit);
    }
    // ── Rate Limiting ───────────────────────────────────────────────
    /**
   * Check if the user is within rate limits.
   * Max RATE_LIMIT_MAX_PER_SECOND events per second per user.
   */ _checkRateLimit(userId) {
        const now = Date.now();
        const entry = this.rateLimitMap.get(userId);
        if (!entry) {
            this.rateLimitMap.set(userId, {
                timestamps: [
                    now
                ]
            });
            return {
                allowed: true
            };
        }
        // Filter to only timestamps within the window
        entry.timestamps = entry.timestamps.filter((ts)=>now - ts < RATE_LIMIT_WINDOW_MS);
        if (entry.timestamps.length >= RATE_LIMIT_MAX_PER_SECOND) {
            return {
                allowed: false
            };
        }
        entry.timestamps.push(now);
        return {
            allowed: true
        };
    }
    // ── History Storage ─────────────────────────────────────────────
    _storeHistory(event) {
        const userId = event.userId;
        let events = this.historyMap.get(userId);
        if (!events) {
            events = [];
            this.historyMap.set(userId, events);
        }
        events.unshift(event); // newest first
        // Enforce per-user limit
        if (events.length > HISTORY_MAX_PER_USER) {
            events.length = HISTORY_MAX_PER_USER;
        }
        this.historyTimestamps.set(userId, Date.now());
    }
    // ── Periodic Cleanup ────────────────────────────────────────────
    _cleanup() {
        const now = Date.now();
        // Clean expired dedup entries
        for (const [key, entry] of this.dedupMap){
            if (now - entry.timestamp > DEDUP_TTL_MS) {
                this.dedupMap.delete(key);
            }
        }
        // Clean expired history
        for (const [userId, lastTs] of this.historyTimestamps){
            if (now - lastTs > HISTORY_TTL_MS) {
                this.historyMap.delete(userId);
                this.historyTimestamps.delete(userId);
            }
        }
        // Clean stale rate limit entries (no activity in last 10 seconds)
        for (const [userId, entry] of this.rateLimitMap){
            const recentTs = entry.timestamps.filter((ts)=>now - ts < 10_000);
            if (recentTs.length === 0) {
                this.rateLimitMap.delete(userId);
            } else {
                entry.timestamps = recentTs;
            }
        }
    }
    // ── Stats ───────────────────────────────────────────────────────
    getStats() {
        const listenerCounts = {};
        for (const channel of EVENT_CHANNELS){
            listenerCounts[channel] = this.listenerCount(channel);
        }
        listenerCounts['*'] = this.listenerCount('*');
        return {
            totalPublished: this.totalPublished,
            dedupSize: this.dedupMap.size,
            historyUsers: this.historyMap.size,
            rateLimitEntries: this.rateLimitMap.size,
            listenerCounts
        };
    }
    // ── Graceful Shutdown ───────────────────────────────────────────
    shutdown() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.removeAllListeners();
        this.dedupMap.clear();
        this.historyMap.clear();
        this.historyTimestamps.clear();
        this.rateLimitMap.clear();
    }
}
const eventBus = new EventBus();
// ── Helper: generate unique event ID ──────────────────────────────
function generateEventId() {
    return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
// ── Audit logging helper ──────────────────────────────────────────
async function logRealtimeAudit(userId, action, metadata, resourceId) {
    try {
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].auditLog.create({
            data: {
                userId,
                action,
                details: metadata ? JSON.stringify(metadata) : null,
                resource: 'realtime',
                resourceId: resourceId || null
            }
        });
    } catch (error) {
        // Never block main flow for audit failures
        console.error('[RealtimeEngine] Audit log failed:', error);
    }
}
// ── Notification preference check ──────────────────────────────────
async function shouldDeliverNotification(userId, type, channel) {
    try {
        const prefs = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].notificationPreferences.findUnique({
            where: {
                userId
            }
        });
        if (!prefs) return true; // no preferences set = deliver by default
        // Check DND schedule
        if (prefs.dndStartTime && prefs.dndEndTime) {
            const now = new Date();
            const tz = prefs.dndTimezone || 'UTC';
            try {
                const formatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: tz,
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
                const currentTime = formatter.format(now);
                if (currentTime >= prefs.dndStartTime && currentTime <= prefs.dndEndTime) {
                    return false; // In DND window
                }
            } catch  {
            // Invalid timezone — allow delivery
            }
        }
        // Check type-specific preferences
        if (prefs.typePreferences) {
            try {
                const typePrefs = JSON.parse(prefs.typePreferences);
                const channelPref = typePrefs[type]?.[channel];
                if (channelPref === false) return false;
            } catch  {
            // Invalid JSON — allow delivery
            }
        }
        // Check global channel preferences
        const channelMap = {
            in_app: prefs.inAppEnabled,
            email: prefs.emailEnabled,
            telegram: prefs.telegramEnabled,
            whatsapp: prefs.whatsappEnabled
        };
        const enabled = channelMap[channel];
        if (enabled === false) return false;
        return true;
    } catch  {
        return true; // On error, default to delivering
    }
}
async function publishLeadEvent(userId, type, payload) {
    const event = {
        eventId: generateEventId(),
        type,
        userId,
        orgId: payload.orgId,
        payload,
        timestamp: Date.now(),
        channel: 'lead_events'
    };
    const result = await eventBus.publishEvent('lead_events', event);
    // Audit log for significant lead events
    if (result.published && (type === 'discovered' || type === 'stage_changed' || type === 'analysis_complete')) {
        await logRealtimeAudit(userId, `lead_event_${type}`, {
            eventId: event.eventId,
            leadId: payload.leadId,
            ...payload
        }, payload.leadId);
    }
    return result;
}
async function publishPaymentEvent(userId, type, payload) {
    const event = {
        eventId: generateEventId(),
        type,
        userId,
        orgId: payload.orgId,
        payload,
        timestamp: Date.now(),
        channel: 'payment_events'
    };
    const result = await eventBus.publishEvent('payment_events', event);
    // Audit log for all payment events
    if (result.published) {
        await logRealtimeAudit(userId, `payment_event_${type}`, {
            eventId: event.eventId,
            ...payload
        }, payload.paymentOrderId);
    }
    return result;
}
async function publishMessageEvent(userId, type, payload) {
    const event = {
        eventId: generateEventId(),
        type,
        userId,
        orgId: payload.orgId,
        payload,
        timestamp: Date.now(),
        channel: 'message_events'
    };
    const result = await eventBus.publishEvent('message_events', event);
    // Audit for delivery failures
    if (result.published && (type === 'whatsapp_failed' || type === 'telegram_delivery')) {
        await logRealtimeAudit(userId, `message_event_${type}`, {
            eventId: event.eventId,
            channel: payload.channel,
            ...payload
        }, payload.messageId);
    }
    return result;
}
async function publishAIEvent(userId, type, payload) {
    const event = {
        eventId: generateEventId(),
        type,
        userId,
        orgId: payload.orgId,
        payload,
        timestamp: Date.now(),
        channel: 'ai_events'
    };
    // AI events are typically high-frequency (stream_token), skip audit logging for those
    const result = await eventBus.publishEvent('ai_events', event);
    if (result.published && type !== 'stream_token' && type !== 'cancel') {
        await logRealtimeAudit(userId, `ai_event_${type}`, {
            eventId: event.eventId,
            ...payload
        }, payload.sessionId);
    }
    return result;
}
async function publishWorkflowEvent(userId, type, payload) {
    const event = {
        eventId: generateEventId(),
        type,
        userId,
        orgId: payload.orgId,
        payload,
        timestamp: Date.now(),
        channel: 'workflow_events'
    };
    const result = await eventBus.publishEvent('workflow_events', event);
    // Audit for all workflow events
    if (result.published) {
        await logRealtimeAudit(userId, `workflow_event_${type}`, {
            eventId: event.eventId,
            workflowId: payload.workflowId,
            executionId: payload.executionId,
            ...payload
        }, payload.executionId);
    }
    return result;
}
async function createAndPublishNotification(params) {
    const { userId, type, title, message, actionUrl, metadata, deliveredVia } = params;
    const via = deliveredVia || 'in_app';
    // 1. Check notification preferences
    const shouldDeliver = await shouldDeliverNotification(userId, type, via);
    if (!shouldDeliver) {
        return {
            notificationId: null,
            published: false,
            reason: 'suppressed_by_preferences'
        };
    }
    // 2. Create notification in DB
    let notificationId;
    try {
        const notification = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].notification.create({
            data: {
                userId,
                type,
                title,
                message,
                actionUrl: actionUrl || null,
                metadata: metadata ? JSON.stringify(metadata) : null,
                deliveredVia: via
            }
        });
        notificationId = notification.id;
    } catch (error) {
        console.error('[RealtimeEngine] Failed to create notification:', error);
        return {
            notificationId: null,
            published: false,
            reason: 'db_error'
        };
    }
    // 3. Publish notification event
    const event = {
        eventId: generateEventId(),
        type: 'notification_created',
        userId,
        payload: {
            notificationId,
            notificationType: type,
            title,
            message,
            actionUrl: actionUrl || null,
            deliveredVia: via,
            ...metadata
        },
        timestamp: Date.now(),
        channel: 'notification_events'
    };
    const result = await eventBus.publishEvent('notification_events', event);
    // 4. Audit log
    await logRealtimeAudit(userId, 'notification_created', {
        notificationId,
        type,
        deliveredVia: via
    });
    return {
        notificationId,
        published: result.published,
        reason: result.reason
    };
}
function subscribeToChannel(channel, callback) {
    eventBus.on(channel, callback);
    return ()=>{
        eventBus.off(channel, callback);
    };
}
function subscribeToUserEvents(userId, callback) {
    const handler = (event)=>{
        if (event.userId === userId) {
            callback(event);
        }
    };
    eventBus.on('*', handler);
    return ()=>{
        eventBus.off('*', handler);
    };
}
function subscribeToUserChannel(userId, channel, callback) {
    const handler = (event)=>{
        if (event.userId === userId) {
            callback(event);
        }
    };
    eventBus.on(channel, handler);
    return ()=>{
        eventBus.off(channel, handler);
    };
}
;
function getEventHistory(userId, afterEventId, limit = 50) {
    return eventBus.getEventHistory(userId, afterEventId, limit);
}
const realtimeEngine = {
    publishEvent: eventBus.publishEvent.bind(eventBus),
    createAndPublishNotification,
    publishLeadEvent,
    publishPaymentEvent,
    publishMessageEvent,
    publishAIEvent,
    publishWorkflowEvent,
    getEventHistory: eventBus.getEventHistory.bind(eventBus),
    deduplicateEvent: eventBus.deduplicateEvent.bind(eventBus),
    subscribeToChannel,
    subscribeToUserEvents,
    subscribeToUserChannel,
    getStats: eventBus.getStats.bind(eventBus),
    shutdown: eventBus.shutdown.bind(eventBus)
};
const __TURBOPACK__default__export__ = realtimeEngine;
}),
"[project]/src/lib/workflow-utils.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "auditLog",
    ()=>auditLog,
    "generateIdempotencyKey",
    ()=>generateIdempotencyKey,
    "generateWebhookPath",
    ()=>generateWebhookPath,
    "getWorkflow",
    ()=>getWorkflow,
    "syncSteps",
    ()=>syncSteps
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Shared Utilities
// Shared helpers used by multiple workflow sub-modules
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [instrumentation] (ecmascript)");
;
function generateWebhookPath() {
    return `wh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
function generateIdempotencyKey() {
    return `wf_exec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
async function auditLog(userId, action, resourceId, details) {
    try {
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].auditLog.create({
            data: {
                userId,
                action,
                resource: 'workflow',
                resourceId,
                details: details ? JSON.stringify(details) : null
            }
        });
    } catch (error) {
        console.error('[WorkflowService] Audit log failed:', error);
    }
}
async function syncSteps(workflowId, nodes) {
    // Delete existing steps
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowStep.deleteMany({
        where: {
            workflowId
        }
    });
    // Create new steps
    if (nodes.length > 0) {
        const sortedNodes = nodes.filter((n)=>n.type !== 'trigger') // Don't create DB steps for trigger nodes
        .map((n, idx)=>({
                workflowId,
                type: n.type,
                name: n.title,
                config: JSON.stringify(n.config),
                order: idx,
                nextStepId: null
            }));
        if (sortedNodes.length > 0) {
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowStep.createMany({
                data: sortedNodes
            });
        }
        return sortedNodes.length;
    }
    return 0;
}
async function getWorkflow(workflowId, userId) {
    const workflow = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowDefinition.findFirst({
        where: {
            id: workflowId,
            userId
        },
        include: {
            workflowSteps: {
                orderBy: {
                    order: 'asc'
                }
            }
        }
    });
    if (!workflow) return null;
    return {
        ...workflow,
        nodes: JSON.parse(workflow.nodes),
        edges: JSON.parse(workflow.edges),
        triggerConfig: workflow.triggerConfig ? JSON.parse(workflow.triggerConfig) : null,
        workflowSteps: workflow.workflowSteps.map((s)=>({
                ...s,
                config: JSON.parse(s.config)
            }))
    };
}
}),
"[project]/src/lib/workflow-executor.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "cancelExecution",
    ()=>cancelExecution,
    "executeWorkflow",
    ()=>executeWorkflow,
    "handleWebhookTrigger",
    ()=>handleWebhookTrigger,
    "pauseExecution",
    ()=>pauseExecution,
    "processExecution",
    ()=>processExecution,
    "resumeExecution",
    ()=>resumeExecution,
    "retryExecution",
    ()=>retryExecution
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Executor
// Heavy module: execution engine, action executor, execution control
// Only imported by routes that need to execute/control workflows
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$resolution$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/lead-resolution.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$workflow$2d$actions$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/workflow-actions.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$realtime$2d$engine$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/realtime-engine.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$notification$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/notification-service.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$workflow$2d$utils$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/workflow-utils.ts [instrumentation] (ecmascript)");
;
;
;
;
;
;
/**
 * Single reliable lead resolution for executor steps: every lead access is
 * OWNER-SCOPED (same rule as the main engine + AI pipeline). A workflow step
 * may only operate on a lead that belongs to the user who started the run.
 */ async function requireOwnedLead(userId, leadId) {
    if (!userId) throw new Error('Lead not found');
    const resolution = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$resolution$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["resolveLeadForExecution"])(userId, leadId);
    if (!resolution.ok) throw new Error('Lead not found');
    return resolution.lead;
}
async function executeWorkflow(workflowId, userId, triggerData, idempotencyKey) {
    // Check workflow exists and is active
    const workflow = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowDefinition.findFirst({
        where: {
            id: workflowId,
            status: 'active'
        }
    });
    if (!workflow) {
        throw new Error('Workflow not found or not active');
    }
    // Check idempotency
    const key = idempotencyKey || (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$workflow$2d$utils$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["generateIdempotencyKey"])();
    if (idempotencyKey) {
        const existing = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowExecution.findFirst({
            where: {
                idempotencyKey: key
            }
        });
        if (existing) {
            return existing; // Already queued/running
        }
    }
    // Check concurrency limit
    const runningCount = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowExecution.count({
        where: {
            workflowId,
            status: {
                in: [
                    'queued',
                    'running'
                ]
            }
        }
    });
    if (workflow.maxConcurrency !== null && runningCount >= workflow.maxConcurrency) {
        throw new Error('Workflow concurrency limit reached');
    }
    const nodes = JSON.parse(workflow.nodes);
    const actionNodes = nodes.filter((n)=>n.type !== 'trigger');
    // Create execution record
    const execution = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowExecution.create({
        data: {
            workflowId,
            userId,
            status: 'queued',
            triggerData: triggerData ? JSON.stringify(triggerData) : null,
            currentStep: 0,
            totalSteps: actionNodes.length,
            maxRetries: workflow.maxRetries ?? undefined,
            idempotencyKey: key
        }
    });
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$workflow$2d$utils$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["auditLog"])(userId, 'workflow_executed', workflowId, {
        executionId: execution.id,
        triggerType: workflow.triggerType
    });
    // Process execution asynchronously (non-blocking)
    processExecution(execution.id).catch((err)=>{
        console.error('[WorkflowService] processExecution error:', err);
    });
    return execution;
}
async function processExecution(executionId) {
    const execution = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowExecution.findUnique({
        where: {
            id: executionId
        },
        include: {
            workflow: true
        }
    });
    if (!execution || execution.status === 'cancelled') return;
    const workflow = execution.workflow;
    const nodes = JSON.parse(workflow.nodes);
    const edges = JSON.parse(workflow.edges);
    const actionNodes = nodes.filter((n)=>n.type !== 'trigger');
    // Mark as running
    if (execution.status === 'queued') {
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowExecution.update({
            where: {
                id: executionId
            },
            data: {
                status: 'running',
                startedAt: new Date(),
                totalSteps: actionNodes.length
            }
        });
    }
    const startTime = Date.now();
    let currentStep = execution.currentStep;
    let lastError = null;
    // Build a map for edge traversal
    const edgeMap = new Map();
    for (const edge of edges){
        const existing = edgeMap.get(edge.source) || [];
        existing.push(edge);
        edgeMap.set(edge.source, existing);
    }
    // Get trigger data for context
    const triggerData = execution.triggerData ? JSON.parse(execution.triggerData) : {};
    const stepResults = {};
    const context = {
        triggerData,
        stepResults,
        executionId: execution.id,
        workflowId: execution.workflowId
    };
    // Find starting node (first non-trigger node connected from trigger)
    let currentNode = null;
    const triggerNode = nodes.find((n)=>n.type === 'trigger');
    if (triggerNode) {
        const triggerEdges = edgeMap.get(triggerNode.id) || [];
        if (triggerEdges.length > 0) {
            const firstTarget = triggerEdges[0].target;
            currentNode = actionNodes.find((n)=>n.id === firstTarget) || actionNodes[0] || null;
        }
    }
    if (!currentNode && actionNodes.length > 0) {
        currentNode = actionNodes[0];
    }
    // Execute steps sequentially
    let stepIndex = currentStep;
    const nodesToProcess = actionNodes.slice(stepIndex);
    for (const step of nodesToProcess){
        // Check if execution was paused or cancelled
        const currentExec = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowExecution.findUnique({
            where: {
                id: executionId
            }
        });
        if (!currentExec) break;
        if (currentExec.status === 'paused') return;
        if (currentExec.status === 'cancelled') return;
        const stepStartTime = Date.now();
        let attempt = 0;
        const maxRetries = workflow.maxRetries ?? 0;
        let stepSuccess = false;
        let stepOutput = {};
        let stepError = null;
        while(attempt <= maxRetries && !stepSuccess){
            try {
                const result = await executeStepAction(step, context, execution.userId || undefined);
                stepOutput = result;
                stepSuccess = true;
                stepResults[step.id] = result;
            } catch (error) {
                attempt++;
                stepError = error instanceof Error ? error.message : String(error);
                if (attempt <= maxRetries) {
                    // Wait before retry (exponential backoff)
                    const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
                    await new Promise((resolve)=>setTimeout(resolve, delayMs));
                }
            }
        }
        const durationMs = Date.now() - stepStartTime;
        // Create log entry
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowLog.create({
            data: {
                executionId,
                stepName: step.title,
                stepType: step.type,
                status: stepSuccess ? 'success' : 'failed',
                input: JSON.stringify(step.config),
                output: stepSuccess ? JSON.stringify(stepOutput) : null,
                error: stepError,
                durationMs,
                retryAttempt: attempt > 0 ? attempt - 1 : 0,
                userId: execution.userId
            }
        });
        // Update current step
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowExecution.update({
            where: {
                id: executionId
            },
            data: {
                currentStep: stepIndex + 1
            }
        });
        stepIndex++;
        if (!stepSuccess) {
            // Step failed after all retries
            lastError = stepError;
            // Check if this is a conditional branch — if so, follow failure path
            if (step.type === 'condition' || step.type === 'conditional_branch') {
                // Try to follow the failure/false branch
                const failEdges = (edgeMap.get(step.id) || []).filter((e)=>e.sourceHandle === 'false' || e.sourceHandle === 'failure');
                if (failEdges.length > 0) {
                    continue;
                }
            }
            // Mark execution as failed / dead letter
            const isDeadLetter = attempt > maxRetries;
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowExecution.update({
                where: {
                    id: executionId
                },
                data: {
                    status: 'failed',
                    error: lastError,
                    completedAt: new Date(),
                    durationMs: Date.now() - startTime,
                    isDeadLetter,
                    deadLetterReason: isDeadLetter ? `Step "${step.title}" failed after ${maxRetries} retries: ${lastError}` : null
                }
            });
            // Update workflow stats
            await updateWorkflowStats(workflow.id, false, Date.now() - startTime);
            // User-facing notification — only for real users (skip the synthetic
            // 'system' owner), safe message (raw error stays in the execution row).
            const failedOwner = execution.userId || 'system';
            if (failedOwner !== 'system') {
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$notification$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["createNotificationOnce"])({
                    userId: failedOwner,
                    type: 'workflow_failed',
                    title: 'Workflow execution failed',
                    message: `A workflow run stopped at step "${step.title || 'unknown'}" after ${maxRetries} retr${maxRetries === 1 ? 'y' : 'ies'}. You can retry it from the Workflows page.`,
                    actionUrl: '/business-ai/workflows',
                    metadata: {
                        workflowId: workflow.id,
                        executionId,
                        failedStep: step.title,
                        isDeadLetter
                    },
                    dedupeKey: `wfexec:${executionId}:failed`
                }).catch(()=>{
                // Never fail the execution path because of a notification problem
                });
            }
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$realtime$2d$engine$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["publishWorkflowEvent"])(execution.userId || 'system', 'step_failed', {
                workflowId: workflow.id,
                executionId,
                stepName: step.title,
                error: lastError
            });
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$workflow$2d$utils$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["auditLog"])(execution.userId || 'system', 'workflow_failed', workflow.id, {
                executionId,
                stepName: step.title,
                error: lastError,
                isDeadLetter
            });
            return;
        }
        // For conditional branches, determine the next node via edges
        if (step.type === 'condition' || step.type === 'conditional_branch') {
            const branchResult = stepOutput.branch || 'true';
            const handleKey = branchResult === 'true' ? 'true' : 'false';
            const branchEdges = (edgeMap.get(step.id) || []).filter((e)=>e.sourceHandle === handleKey);
            if (branchEdges.length > 0) {
                const nextNodeId = branchEdges[0].target;
                const nextIdx = actionNodes.findIndex((n)=>n.id === nextNodeId);
                if (nextIdx >= 0) {
                    // Skip to that step
                    stepIndex = nextIdx;
                }
            }
        }
    // For delay steps, we just record and continue (in real prod this would schedule)
    }
    // All steps completed successfully
    const totalDuration = Date.now() - startTime;
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowExecution.update({
        where: {
            id: executionId
        },
        data: {
            status: 'completed',
            completedAt: new Date(),
            durationMs: totalDuration
        }
    });
    // Update workflow stats
    await updateWorkflowStats(workflow.id, true, totalDuration);
    // Update lastRunAt
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowDefinition.update({
        where: {
            id: workflow.id
        },
        data: {
            lastRunAt: new Date()
        }
    });
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$realtime$2d$engine$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["publishWorkflowEvent"])(execution.userId || 'system', 'execution_completed', {
        workflowId: workflow.id,
        executionId,
        durationMs: totalDuration
    });
    // User-facing notification — only for real users (skip 'system' owner);
    // deduped per execution so replay/retry cannot double-notify.
    const completedOwner = execution.userId || 'system';
    if (completedOwner !== 'system') {
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$notification$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["createNotificationOnce"])({
            userId: completedOwner,
            type: 'workflow_completed',
            title: 'Workflow completed',
            message: `A workflow run finished successfully in ${totalDuration < 1000 ? `${totalDuration}ms` : `${Math.round(totalDuration / 1000)}s`}.`,
            actionUrl: '/business-ai/workflows',
            metadata: {
                workflowId: workflow.id,
                executionId,
                durationMs: totalDuration
            },
            dedupeKey: `wfexec:${executionId}:completed`
        }).catch(()=>{
        // Never fail the execution path because of a notification problem
        });
    }
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$workflow$2d$utils$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["auditLog"])(execution.userId || 'system', 'workflow_completed', workflow.id, {
        executionId,
        durationMs: totalDuration
    });
}
/** Execute a single step action based on its type and config */ async function executeStepAction(step, context, userId) {
    const config = step.config;
    const triggerData = context.triggerData || {};
    const leadId = config.leadId || triggerData.leadId || null;
    // Resolve the effective action type from config if step.type is a category
    const effectiveType = step.config?.actionType || step.type;
    switch(effectiveType){
        case 'send_email':
            {
                if (!leadId) throw new Error('No lead ID for send_email step');
                const lead = await requireOwnedLead(userId, leadId);
                const message = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].outreachMessage.create({
                    data: {
                        leadId,
                        userId: userId || null,
                        channel: 'email',
                        direction: 'outbound',
                        subject: config.subject || 'Outreach',
                        content: config.content || `Email to ${lead.businessName}`,
                        status: 'queued',
                        generatedByAI: false,
                        metadata: JSON.stringify({
                            workflowStepId: step.id
                        })
                    }
                });
                return {
                    messageId: message.id,
                    channel: 'email',
                    leadId
                };
            }
        case 'send_whatsapp':
            {
                if (!leadId) throw new Error('No lead ID for send_whatsapp step');
                const message = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].messageDelivery.create({
                    data: {
                        userId: userId || 'system',
                        leadId,
                        channel: 'whatsapp',
                        direction: 'outbound',
                        status: 'pending',
                        content: config.content || 'WhatsApp message',
                        recipientId: config.recipient || null
                    }
                });
                return {
                    deliveryId: message.id,
                    channel: 'whatsapp',
                    leadId
                };
            }
        case 'send_telegram':
            {
                const message = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].messageDelivery.create({
                    data: {
                        userId: userId || 'system',
                        leadId,
                        channel: 'telegram',
                        direction: 'outbound',
                        status: 'pending',
                        content: config.content || 'Telegram message',
                        recipientId: config.recipient || null
                    }
                });
                // Update with tracking info
                await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].messageDelivery.update({
                    where: {
                        id: message.id
                    },
                    data: {
                        providerMessageId: `tg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                        metadata: JSON.stringify({
                            workflowStepId: step.id,
                            trackingEnabled: true,
                            sentVia: 'workflow'
                        })
                    }
                });
                return {
                    deliveryId: message.id,
                    channel: 'telegram',
                    trackingEnabled: true
                };
            }
        case 'send_gmail_reply':
            {
                if (!leadId) throw new Error('No lead ID for send_gmail_reply step');
                const lead = await requireOwnedLead(userId, leadId);
                // Find the most recent email thread for this lead
                const lastEmail = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].outreachMessage.findFirst({
                    where: {
                        leadId,
                        channel: 'email',
                        direction: 'outbound'
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                });
                const message = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].outreachMessage.create({
                    data: {
                        leadId,
                        userId: userId || null,
                        channel: 'email',
                        direction: 'outbound',
                        subject: lastEmail ? `Re: ${lastEmail.subject}` : config.subject || 'Reply',
                        content: config.content || `Reply to ${lead.businessName}`,
                        status: 'queued',
                        generatedByAI: false,
                        metadata: JSON.stringify({
                            workflowStepId: step.id,
                            type: 'gmail_reply',
                            replyToId: lastEmail?.id || null
                        })
                    }
                });
                return {
                    messageId: message.id,
                    channel: 'gmail',
                    leadId,
                    status: 'reply',
                    replyToId: lastEmail?.id
                };
            }
        case 'move_to_stage':
        case 'move_lead_stage':
            {
                // 'move_lead_stage' is the workflow-builder vocabulary for the same
                // action — the saved definition must execute identically on either
                // engine (executor vs workflow-actions), so both spellings are honored.
                if (!leadId) throw new Error('No lead ID for move_to_stage step');
                const targetStage = config.targetStage || config.stage;
                if (!targetStage) throw new Error('No target stage specified');
                const lead = await requireOwnedLead(userId, leadId);
                await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.update({
                    where: {
                        id: leadId
                    },
                    data: {
                        stage: targetStage
                    }
                });
                await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].leadActivity.create({
                    data: {
                        leadId,
                        type: 'stage_change',
                        description: `Moved to ${targetStage} via workflow`,
                        metadata: JSON.stringify({
                            fromStage: lead.stage,
                            toStage: targetStage
                        })
                    }
                });
                return {
                    leadId,
                    previousStage: lead.stage,
                    newStage: targetStage
                };
            }
        case 'add_note':
            {
                if (!leadId) throw new Error('No lead ID for add_note step');
                const content = config.content || 'Note added by workflow';
                // ACCOUNT ISOLATION: notes are written onto the lead — it must be
                // owned by the workflow owner (previously unscoped).
                await requireOwnedLead(userId, leadId);
                const note = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].leadNote.create({
                    data: {
                        leadId,
                        userId: userId || 'system',
                        content
                    }
                });
                return {
                    noteId: note.id,
                    leadId
                };
            }
        case 'add_tag':
        case 'update_tags':
            {
                if (!leadId) throw new Error('No lead ID for add_tag step');
                // Builder stores `tag` (single) in some saved definitions and `tags`
                // (array) in others — both are legitimate saved shapes; comma-separated
                // strings are also accepted. Empty result stays an honest failure.
                const rawTags = config.tags ?? config.tag;
                const tagsToAdd = Array.isArray(rawTags) ? rawTags.map(String).map((t)=>t.trim()).filter(Boolean) : typeof rawTags === 'string' && rawTags.trim() ? rawTags.split(',').map((t)=>t.trim()).filter(Boolean) : [];
                if (tagsToAdd.length === 0) throw new Error('No tags specified');
                const lead = await requireOwnedLead(userId, leadId);
                const existingTags = JSON.parse(lead.tags || '[]');
                const merged = Array.from(new Set([
                    ...existingTags,
                    ...tagsToAdd
                ]));
                await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.update({
                    where: {
                        id: leadId
                    },
                    data: {
                        tags: JSON.stringify(merged)
                    }
                });
                return {
                    leadId,
                    tags: merged,
                    added: tagsToAdd
                };
            }
        case 'generate_ai_message':
            {
                const prompt = config.prompt || 'Generate a professional outreach message';
                const contextStr = config.context || '';
                try {
                    const ZAI = (await __turbopack_context__.A("[project]/node_modules/z-ai-web-dev-sdk/dist/index.js [instrumentation] (ecmascript, async loader)")).default;
                    const zai = await ZAI.create();
                    const response = await zai.chat.completions.create({
                        messages: [
                            {
                                role: 'system',
                                content: 'You are a professional outreach assistant. Generate concise, personalized messages.'
                            },
                            {
                                role: 'user',
                                content: `${prompt}\n\nContext: ${contextStr}`
                            }
                        ],
                        thinking: {
                            type: 'disabled'
                        }
                    });
                    const generatedMessage = response.choices?.[0]?.message?.content || 'Generated message';
                    return {
                        generatedMessage,
                        prompt
                    };
                } catch (error) {
                    // If AI SDK fails, return a fallback
                    console.error('[WorkflowService] AI message generation failed:', error);
                    return {
                        generatedMessage: 'AI message generation failed — manual review needed',
                        prompt,
                        error: String(error)
                    };
                }
            }
        case 'conditional_branch':
        case 'condition':
            {
                const field = config.field || 'score';
                const operator = config.operator || '>';
                const value = config.value || '0';
                // Get the actual value from trigger data or lead
                let actualValue = triggerData[field];
                if (leadId && actualValue === undefined) {
                    // ACCOUNT ISOLATION: read the field from the caller's OWN lead
                    // only (requireOwnedLead keeps condition evaluation owner-scoped).
                    const lead = await requireOwnedLead(userId, leadId);
                    if (lead) {
                        actualValue = lead[field];
                    }
                }
                let conditionMet = false;
                const numValue = Number(value);
                const numActual = Number(actualValue);
                if (!isNaN(numValue) && !isNaN(numActual)) {
                    switch(operator){
                        case '>':
                            conditionMet = numActual > numValue;
                            break;
                        case '>=':
                            conditionMet = numActual >= numValue;
                            break;
                        case '<':
                            conditionMet = numActual < numValue;
                            break;
                        case '<=':
                            conditionMet = numActual <= numValue;
                            break;
                        case '==':
                        case '===':
                            conditionMet = numActual === numValue;
                            break;
                        case '!=':
                        case '!==':
                            conditionMet = numActual !== numValue;
                            break;
                    }
                } else {
                    const strActual = String(actualValue || '');
                    switch(operator){
                        case '==':
                        case '===':
                            conditionMet = strActual === value;
                            break;
                        case '!=':
                        case '!==':
                            conditionMet = strActual !== value;
                            break;
                        case 'contains':
                            conditionMet = strActual.includes(value);
                            break;
                        case 'not_in':
                            conditionMet = !value.split(',').includes(strActual);
                            break;
                        case 'in':
                            conditionMet = value.split(',').includes(strActual);
                            break;
                    }
                }
                return {
                    branch: conditionMet ? 'true' : 'false',
                    field,
                    operator,
                    value,
                    actualValue
                };
            }
        case 'wait_delay':
        case 'delay':
            {
                const duration = Number(config.duration) || 1;
                const unit = config.unit || 'minutes';
                // In production, this would schedule continuation. For now, we record the delay.
                // We don't actually block the process — the delay is logged.
                let delayMs = duration * 60 * 1000; // default minutes
                if (unit === 'seconds') delayMs = duration * 1000;
                if (unit === 'hours') delayMs = duration * 60 * 60 * 1000;
                if (unit === 'days') delayMs = duration * 24 * 60 * 60 * 1000;
                return {
                    duration,
                    unit,
                    delayMs,
                    note: 'Delay recorded in workflow log'
                };
            }
        case 'webhook_call':
            {
                const url = config.url || '';
                const method = config.method || 'POST';
                const body = config.body || triggerData;
                if (!url) throw new Error('No URL specified for webhook call');
                try {
                    const response = await fetch(url, {
                        method,
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(body)
                    });
                    const responseText = await response.text();
                    return {
                        statusCode: response.status,
                        response: responseText.slice(0, 1000)
                    };
                } catch (error) {
                    throw new Error(`Webhook call failed: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        case 'send_gmail_draft':
            {
                if (!leadId) throw new Error('No lead ID for send_gmail_draft step');
                // ACCOUNT ISOLATION: the draft references the lead and stores its
                // business name — it must be owned by the workflow owner.
                const lead = await requireOwnedLead(userId, leadId);
                const message = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].outreachMessage.create({
                    data: {
                        leadId,
                        userId: userId || null,
                        channel: 'email',
                        direction: 'outbound',
                        subject: config.subject || 'Draft',
                        content: config.content || `Draft email to ${lead.businessName}`,
                        status: 'draft',
                        generatedByAI: false,
                        metadata: JSON.stringify({
                            workflowStepId: step.id,
                            type: 'gmail_draft'
                        })
                    }
                });
                return {
                    messageId: message.id,
                    channel: 'gmail',
                    leadId,
                    status: 'draft'
                };
            }
        case 'ai_analyze':
            {
                if (!leadId) throw new Error('No lead ID for ai_analyze step');
                // ACCOUNT ISOLATION: analysis is written onto the lead — owner only.
                const lead = await requireOwnedLead(userId, leadId);
                try {
                    const ZAI = (await __turbopack_context__.A("[project]/node_modules/z-ai-web-dev-sdk/dist/index.js [instrumentation] (ecmascript, async loader)")).default;
                    const zai = await ZAI.create();
                    const response = await zai.chat.completions.create({
                        messages: [
                            {
                                role: 'system',
                                content: 'You are a lead analysis AI. Analyze the lead and provide scores (0-100) for: replyScore, conversionScore, urgencyScore, revenuePotentialScore. Return JSON only.'
                            },
                            {
                                role: 'user',
                                content: `Analyze this lead: ${JSON.stringify({
                                    businessName: lead.businessName,
                                    niche: lead.niche,
                                    website: lead.website,
                                    city: lead.city,
                                    country: lead.country,
                                    stage: lead.stage
                                })}`
                            }
                        ],
                        thinking: {
                            type: 'disabled'
                        }
                    });
                    const content = response.choices?.[0]?.message?.content || '{}';
                    let scores = {};
                    try {
                        const parsed = JSON.parse(content);
                        scores = parsed;
                    } catch  {
                        // If AI didn't return valid JSON, use defaults
                        scores = {
                            replyScore: 50,
                            conversionScore: 50,
                            urgencyScore: 50,
                            revenuePotentialScore: 50
                        };
                    }
                    // Update lead scores
                    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.update({
                        where: {
                            id: leadId
                        },
                        data: {
                            replyScore: scores.replyScore || lead.replyScore,
                            conversionScore: scores.conversionScore || lead.conversionScore,
                            urgencyScore: scores.urgencyScore || lead.urgencyScore,
                            revenuePotentialScore: scores.revenuePotentialScore || lead.revenuePotentialScore
                        }
                    });
                    return {
                        leadId,
                        scores,
                        analysis: content
                    };
                } catch (error) {
                    console.error('[WorkflowService] AI analyze failed:', error);
                    return {
                        leadId,
                        error: String(error)
                    };
                }
            }
        case 'update_lead_field':
            {
                if (!leadId) throw new Error('No lead ID for update_lead_field step');
                const field = config.field || '';
                const value = config.value;
                if (!field) throw new Error('No field specified');
                const allowedFields = [
                    'stage',
                    'emailStatus',
                    'estimatedQuality',
                    'estimatedRevenue',
                    'websiteQuality',
                    'bestContactPerson',
                    'bestChannel',
                    'bestTiming',
                    'outreachStyle',
                    'niche',
                    'city',
                    'country',
                    'notes'
                ];
                if (!allowedFields.includes(field)) {
                    throw new Error(`Field "${field}" is not allowed to be updated via workflow`);
                }
                await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.update({
                    where: {
                        id: leadId
                    },
                    data: {
                        [field]: value
                    }
                });
                return {
                    leadId,
                    field,
                    value
                };
            }
        case 'credit_check':
            {
                if (!userId) throw new Error('No user ID for credit_check step');
                const threshold = Number(config.threshold) || 10;
                const user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].user.findUnique({
                    where: {
                        id: userId
                    }
                });
                if (!user) throw new Error(`User ${userId} not found`);
                const sufficient = user.credits >= threshold;
                return {
                    credits: user.credits,
                    threshold,
                    sufficient
                };
            }
        default:
            {
                // TRUTHFUL FAILURE (fix): an action the execution engine cannot
                // perform is a FAILED step, not a successful no-op. Returning a
                // fake success here marked executions "completed" while silently
                // skipping the user's configured actions — exactly the dishonest
                // behavior this engine must never exhibit.
                //
                // Builder-vocabulary coverage: action types this executor does not
                // natively implement (ai_analysis, ai_outreach, create_notification,
                // export_data, score_lead, notify_low_credits, …) are delegated to
                // the canonical executor in workflow-actions.ts, which implements the
                // full builder ACTION_TYPES set. The saved definition — not the
                // engine's subset — remains the source of execution truth. If BOTH
                // engines reject the type, the step still fails honestly.
                const canonical = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$workflow$2d$actions$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["executeAction"])(effectiveType, config, {
                    workflowId: context.workflowId || step.workflowId || '',
                    executionId: context.executionId || '',
                    userId: userId || '',
                    leadId: leadId || undefined,
                    triggerData
                });
                if (canonical.success || !/Unknown action type/i.test(canonical.error || '')) {
                    if (!canonical.success) throw new Error(canonical.error || 'Action failed');
                    return canonical.output ?? {
                        success: true
                    };
                }
                throw new Error(`Unknown step type: ${effectiveType}`);
            }
    }
}
/** Update workflow stats after execution */ async function updateWorkflowStats(workflowId, success, durationMs) {
    const workflow = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowDefinition.findUnique({
        where: {
            id: workflowId
        }
    });
    if (!workflow) return;
    const runCount = workflow.runCount + 1;
    const successCount = workflow.successCount + (success ? 1 : 0);
    const failureCount = workflow.failureCount + (success ? 0 : 1);
    const avgRuntimeMs = Math.round(((workflow.avgRuntimeMs ?? 0) * workflow.runCount + durationMs) / runCount);
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowDefinition.update({
        where: {
            id: workflowId
        },
        data: {
            runCount,
            successCount,
            failureCount,
            avgRuntimeMs
        }
    });
}
// ── Execution Control ──────────────────────────────────────────────
/** Ownership check shared by all execution-control operations.
 *  ACCOUNT ISOLATION: an execution must belong to the caller via its
 *  workflow's userId (WorkflowExecution.userId is untrustworthy for
 *  legacy rows; workflow.userId is the authoritative owner). */ async function assertExecutionOwnership(executionId, userId) {
    const execution = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowExecution.findUnique({
        where: {
            id: executionId
        },
        select: {
            id: true,
            status: true,
            workflowId: true,
            retryCount: true,
            workflow: {
                select: {
                    userId: true
                }
            }
        }
    });
    if (!execution) throw new Error('Execution not found');
    if (execution.workflow.userId !== userId) {
        // Same generic error as "not found" — never reveal existence.
        throw new Error('Execution not found');
    }
    return execution;
}
async function pauseExecution(executionId, userId) {
    const execution = await assertExecutionOwnership(executionId, userId);
    if (execution.status !== 'running') throw new Error('Execution is not running');
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowExecution.update({
        where: {
            id: executionId
        },
        data: {
            status: 'paused',
            pausedAt: new Date()
        }
    });
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$workflow$2d$utils$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["auditLog"])(userId, 'workflow_paused', execution.workflowId, {
        executionId
    });
    return {
        id: executionId,
        status: 'paused'
    };
}
async function resumeExecution(executionId, userId) {
    const execution = await assertExecutionOwnership(executionId, userId);
    if (execution.status !== 'paused') throw new Error('Execution is not paused');
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowExecution.update({
        where: {
            id: executionId
        },
        data: {
            status: 'running',
            resumedAt: new Date()
        }
    });
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$workflow$2d$utils$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["auditLog"])(userId, 'workflow_resumed', execution.workflowId, {
        executionId
    });
    // Continue processing
    processExecution(executionId).catch((err)=>{
        console.error('[WorkflowService] Resume processExecution error:', err);
    });
    return {
        id: executionId,
        status: 'running'
    };
}
async function cancelExecution(executionId, userId) {
    const execution = await assertExecutionOwnership(executionId, userId);
    if (![
        'queued',
        'running',
        'paused'
    ].includes(execution.status)) {
        throw new Error('Execution cannot be cancelled in current state');
    }
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowExecution.update({
        where: {
            id: executionId
        },
        data: {
            status: 'cancelled',
            completedAt: new Date()
        }
    });
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$workflow$2d$utils$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["auditLog"])(userId, 'workflow_cancelled', execution.workflowId, {
        executionId
    });
    return {
        id: executionId,
        status: 'cancelled'
    };
}
async function handleWebhookTrigger(webhookPath, body, options) {
    const workflow = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowDefinition.findFirst({
        where: {
            webhookPath,
            status: 'active'
        }
    });
    if (!workflow) {
        throw new Error('No active workflow found for this webhook path');
    }
    // ACCOUNT ISOLATION (SECURITY HARDENING): a webhook secret is now
    // MANDATORY for path-based webhook triggers. Every call must present a
    // valid HMAC-SHA256 signature over the raw request body. Without this,
    // anyone who guesses the path could execute another user's workflow and
    // consume their credits.
    let config = {};
    if (workflow.triggerConfig) {
        try {
            config = JSON.parse(workflow.triggerConfig);
        } catch  {
            config = {};
        }
    }
    if (!config.webhookSecret) {
        throw new Error('Webhook secret not configured');
    }
    {
        const { createHmac } = await __turbopack_context__.A("[externals]/crypto [external] (crypto, cjs, async loader)");
        const expected = createHmac('sha256', String(config.webhookSecret)).update(options?.rawBody ?? '').digest('hex');
        const provided = options?.signature || '';
        if (provided !== `sha256=${expected}` && provided !== expected) {
            throw new Error('Invalid webhook signature');
        }
    }
    return executeWorkflow(workflow.id, workflow.userId, body);
}
async function retryExecution(executionId, userId) {
    const execution = await assertExecutionOwnership(executionId, userId);
    if (![
        'failed',
        'dead_letter'
    ].includes(execution.status)) {
        throw new Error('Execution is not in a retryable state');
    }
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowExecution.update({
        where: {
            id: executionId
        },
        data: {
            status: 'queued',
            currentStep: 0,
            error: null,
            retryCount: execution.retryCount + 1,
            lastRetryAt: new Date()
        }
    });
    // Clear old step logs
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowLog.deleteMany({
        where: {
            executionId
        }
    });
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$workflow$2d$utils$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["auditLog"])(userId, 'workflow_retried', execution.workflowId, {
        executionId
    });
    // Process again
    processExecution(executionId).catch((err)=>{
        console.error('[WorkflowService] Retry processExecution error:', err);
    });
    return {
        id: executionId,
        status: 'queued'
    };
}
}),
"[project]/src/lib/autopilot/constants.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Constants & State Machine
//
// Autopilot = automated client acquisition: the user selects MULTIPLE
// niches (reusing the existing discovery vocabulary) + geography; on
// every scheduled (or manual) run the system discovers NEW leads via
// the existing production discovery pipeline, deduplicates them, and
// executes the user's configured WorkflowDefinition against each new
// lead. It is strictly SEPARATE from normal (lead-triggered) workflow
// execution and has its own UI tab — it never runs "against a
// manually selected lead".
//
// Entitlement (server-enforced in entitlement-service.ts):
//   free/starter → disabled · pro → 3 active · elite → 7 active
// ═══════════════════════════════════════════════════════════════════
/** AutopilotWorkflow lifecycle states. */ __turbopack_context__.s([
    "AUTOPILOT_DISCOVERY_BATCH",
    ()=>AUTOPILOT_DISCOVERY_BATCH,
    "AUTOPILOT_EXECUTION_PACING_MS",
    ()=>AUTOPILOT_EXECUTION_PACING_MS,
    "AUTOPILOT_JOB_POLL_MS",
    ()=>AUTOPILOT_JOB_POLL_MS,
    "AUTOPILOT_JOB_TIMEOUT_MS",
    ()=>AUTOPILOT_JOB_TIMEOUT_MS,
    "AUTOPILOT_MAX_NICHES",
    ()=>AUTOPILOT_MAX_NICHES,
    "AUTOPILOT_NICHE_MAX_LEN",
    ()=>AUTOPILOT_NICHE_MAX_LEN,
    "AUTOPILOT_NICHE_PACING_MS",
    ()=>AUTOPILOT_NICHE_PACING_MS,
    "AUTOPILOT_SCHEDULES",
    ()=>AUTOPILOT_SCHEDULES,
    "AUTOPILOT_STATUSES",
    ()=>AUTOPILOT_STATUSES,
    "AUTOPILOT_STUCK_MS",
    ()=>AUTOPILOT_STUCK_MS,
    "AUTOPILOT_TRANSITIONS",
    ()=>AUTOPILOT_TRANSITIONS,
    "SCHEDULE_INTERVAL_MS",
    ()=>SCHEDULE_INTERVAL_MS,
    "canTransitionAutopilot",
    ()=>canTransitionAutopilot,
    "isAutopilotSchedule",
    ()=>isAutopilotSchedule
]);
const AUTOPILOT_STATUSES = [
    'DRAFT',
    'ACTIVE',
    'PAUSED',
    'RUNNING',
    'COMPLETED',
    'FAILED',
    'DISABLED'
];
const AUTOPILOT_TRANSITIONS = {
    DRAFT: [
        'ACTIVE',
        'COMPLETED',
        'DISABLED'
    ],
    ACTIVE: [
        'PAUSED',
        'RUNNING',
        'COMPLETED',
        'DISABLED'
    ],
    PAUSED: [
        'ACTIVE',
        'COMPLETED',
        'DISABLED'
    ],
    RUNNING: [
        'ACTIVE',
        'FAILED'
    ],
    FAILED: [
        'ACTIVE',
        'DISABLED'
    ],
    COMPLETED: [
        'DISABLED'
    ],
    DISABLED: []
};
function canTransitionAutopilot(from, to) {
    const allowed = AUTOPILOT_TRANSITIONS[from];
    return !!allowed && allowed.includes(to);
}
const AUTOPILOT_SCHEDULES = [
    'hourly',
    'every_6_hours',
    'every_12_hours',
    'daily',
    'weekly'
];
const SCHEDULE_INTERVAL_MS = {
    hourly: 60 * 60 * 1000,
    every_6_hours: 6 * 60 * 60 * 1000,
    every_12_hours: 12 * 60 * 60 * 1000,
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000
};
function isAutopilotSchedule(v) {
    return typeof v === 'string' && AUTOPILOT_SCHEDULES.includes(v);
}
const AUTOPILOT_MAX_NICHES = 10;
const AUTOPILOT_NICHE_MAX_LEN = 200;
const AUTOPILOT_DISCOVERY_BATCH = 20;
const AUTOPILOT_EXECUTION_PACING_MS = parseInt(process.env.AUTOPILOT_EXECUTION_PACING_MS || '1500', 10);
const AUTOPILOT_NICHE_PACING_MS = parseInt(process.env.AUTOPILOT_NICHE_PACING_MS || '2000', 10);
const AUTOPILOT_JOB_POLL_MS = 3000;
const AUTOPILOT_JOB_TIMEOUT_MS = 15 * 60 * 1000;
const AUTOPILOT_STUCK_MS = 60 * 60 * 1000; // 60 minutes
}),
"[project]/src/lib/autopilot/runner.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "computeNextRun",
    ()=>computeNextRun,
    "executeAutopilotRun",
    ()=>executeAutopilotRun,
    "recoverStuckAutopilotRuns",
    ()=>recoverStuckAutopilotRuns,
    "runAutopilot",
    ()=>runAutopilot,
    "withUserLock",
    ()=>withUserLock
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Runner
//
// Executes one Autopilot run:
//   claim run (atomic) → for each niche:
//     startDiscoveryJob (EXISTING production pipeline, ≈20/batch)
//     → poll job to terminal state
//     → resolve discovered payloads to persisted Lead rows
//     → AutopilotLead ledger insert (DB-level unique guard)
//     → executeWorkflow (EXISTING engine) with stable idempotency key
//   → honest counters + errors → schedule next run
//
// Concurrency story (layered):
//   1. AutopilotWorkflow ACTIVE→RUNNING claim via updateMany count==1
//   2. AutopilotRun QUEUED→RUNNING claim via updateMany count==1
//   3. Per-user in-process async mutex (single Node runtime deployment)
//   4. AutopilotLead @@unique([autopilotId, leadId]) — DB-level
//      "one lead processed at most once per autopilot"
//   5. WorkflowExecution.idempotencyKey (stable per autopilot+lead)
//   6. Discovery credits: idempotency keys inside the pipeline itself
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$discovery$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/lead-discovery-service.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$workflow$2d$executor$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/workflow-executor.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$credit$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/credit-service.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$countries$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/countries.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$autopilot$2f$constants$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/autopilot/constants.ts [instrumentation] (ecmascript)");
;
;
;
;
;
;
// ===== per-user in-process mutex =====
const userLocks = new Map();
async function withUserLock(userId, fn) {
    const previous = userLocks.get(userId) || Promise.resolve();
    let release = ()=>{};
    const gate = new Promise((resolve)=>{
        release = resolve;
    });
    userLocks.set(userId, previous.then(()=>gate));
    try {
        await previous.catch(()=>{});
        return await fn();
    } finally{
        release();
        if (userLocks.get(userId) === gate) {
            // chain completed — clean up so the map does not grow forever
            userLocks.delete(userId);
        }
    }
}
function computeNextRun(schedule, from = new Date()) {
    if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$autopilot$2f$constants$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["isAutopilotSchedule"])(schedule)) return null;
    return new Date(from.getTime() + __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$autopilot$2f$constants$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["SCHEDULE_INTERVAL_MS"][schedule]);
}
async function pollDiscoveryJob(jobId) {
    const deadline = Date.now() + __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$autopilot$2f$constants$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["AUTOPILOT_JOB_TIMEOUT_MS"];
    for(;;){
        await new Promise((r)=>setTimeout(r, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$autopilot$2f$constants$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["AUTOPILOT_JOB_POLL_MS"]));
        const job = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].discoveryJob.findUnique({
            where: {
                id: jobId
            }
        });
        if (!job) throw new Error(`Discovery job ${jobId} disappeared`);
        if (job.status === 'completed' || job.status === 'failed') {
            return {
                id: job.id,
                status: job.status,
                totalFound: job.totalFound,
                imported: job.imported,
                duplicates: job.duplicates,
                failed: job.failed,
                filteredOut: job.filteredOut,
                errorMessage: job.errorMessage,
                resultData: job.resultData
            };
        }
        if (Date.now() > deadline) {
            throw new Error(`Discovery job ${jobId} timed out after ${Math.round(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$autopilot$2f$constants$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["AUTOPILOT_JOB_TIMEOUT_MS"] / 60000)} min`);
        }
    }
}
/**
 * Resolve a discovered payload to its PERSISTED lead row for this user.
 * The discovery pipeline already persisted + deduped everything in
 * resultData; matching is deterministic (website → email → phone →
 * name+location) — no guessing, no invented fields. Returns null when
 * the payload cannot be matched to a persisted lead.
 */ async function resolvePersistedLead(userId, payload) {
    const website = typeof payload.website === 'string' ? payload.website.trim() : '';
    if (website) {
        const bySite = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.findFirst({
            where: {
                userId,
                website,
                isActive: true
            },
            select: {
                id: true
            }
        });
        if (bySite) return bySite;
    }
    const email = typeof payload.email === 'string' ? payload.email.trim() : '';
    if (email) {
        const byEmail = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.findFirst({
            where: {
                userId,
                email,
                isActive: true
            },
            select: {
                id: true
            }
        });
        if (byEmail) return byEmail;
    }
    const phone = typeof payload.phone === 'string' ? payload.phone.trim() : '';
    if (phone) {
        const byPhone = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.findFirst({
            where: {
                userId,
                phone,
                isActive: true
            },
            select: {
                id: true
            }
        });
        if (byPhone) return byPhone;
    }
    const name = typeof payload.businessName === 'string' ? payload.businessName.trim() : '';
    if (name) {
        const city = typeof payload.city === 'string' ? payload.city.trim() : null;
        const countryRaw = typeof payload.country === 'string' ? payload.country.trim() : null;
        const country = countryRaw ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$countries$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["normalizeCountryName"])(countryRaw) || countryRaw : null;
        const byName = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.findFirst({
            where: {
                userId,
                businessName: name,
                isActive: true,
                ...city ? {
                    city
                } : {},
                ...country ? {
                    country
                } : {}
            },
            select: {
                id: true
            }
        });
        if (byName) return byName;
        // name-only fallback (dedup service treats name matches as duplicates too)
        const byNameOnly = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].lead.findFirst({
            where: {
                userId,
                businessName: name,
                isActive: true
            },
            select: {
                id: true
            }
        });
        if (byNameOnly) return byNameOnly;
    }
    return null;
}
function parseJson(raw, fallback) {
    try {
        return JSON.parse(raw);
    } catch  {
        return fallback;
    }
}
async function executeAutopilotRun(autopilot, runId, trigger) {
    // Atomic run claim: only one winner can flip QUEUED→RUNNING.
    const claimed = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotRun.updateMany({
        where: {
            id: runId,
            status: 'QUEUED'
        },
        data: {
            status: 'RUNNING',
            startedAt: new Date()
        }
    });
    if (claimed.count !== 1) {
        // Another worker already claimed this run — do not execute twice.
        return {
            runId,
            status: 'FAILED',
            discovered: 0,
            saved: 0,
            processed: 0,
            executionsCreated: 0,
            perNiche: [],
            error: 'Run was already claimed by another worker'
        };
    }
    const niches = parseJson(autopilot.niches, []);
    const geo = parseJson(autopilot.geography, {});
    const perNiche = [];
    let discovered = 0;
    let saved = 0;
    let processed = 0;
    let executionsCreated = 0;
    let hardFailures = 0;
    try {
        // Linked workflow must exist, belong to the user, and be ACTIVE.
        const workflow = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].workflowDefinition.findFirst({
            where: {
                id: autopilot.workflowId,
                userId: autopilot.userId
            },
            select: {
                id: true,
                status: true,
                name: true
            }
        });
        if (!workflow) throw new Error('Linked workflow not found for this account');
        if (workflow.status !== 'active') {
            throw new Error(`Linked workflow "${workflow.name}" is not active — activate it in Workflows first`);
        }
        // Pre-flight credit check for the discovery phase (honest refusal
        // BEFORE any work instead of mid-run starvation). Workflow action
        // credits are enforced by the execution engine per step.
        const planCredits = niches.length * __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$autopilot$2f$constants$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["AUTOPILOT_DISCOVERY_BATCH"] * __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$credit$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["CREDIT_COSTS"].lead_discovery;
        const sufficiency = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$credit$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["checkCreditSufficiency"])(autopilot.userId, planCredits);
        if (!sufficiency.sufficient) {
            throw new Error(`Insufficient credits for discovery: need ~${planCredits}, available ${sufficiency.balance}. Top up credits and run again.`);
        }
        for (const niche of niches){
            // ── 1. Start discovery via the EXISTING production pipeline ──
            let jobId = null;
            try {
                const job = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$lead$2d$discovery$2d$service$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["startDiscoveryJob"])(autopilot.userId, {
                    niche,
                    country: geo.country,
                    city: geo.city,
                    source: 'ai_search',
                    maxResults: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$autopilot$2f$constants$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["AUTOPILOT_DISCOVERY_BATCH"]
                }, autopilot.orgId || undefined);
                if (job.status === 'failed' || !job.jobId) {
                    hardFailures++;
                    perNiche.push({
                        niche,
                        jobId: null,
                        status: 'FAILED',
                        discovered: 0,
                        imported: 0,
                        duplicates: 0,
                        error: job.message || 'Discovery job failed to start'
                    });
                    continue;
                }
                jobId = job.jobId;
            } catch (startErr) {
                hardFailures++;
                perNiche.push({
                    niche,
                    jobId: null,
                    status: 'FAILED',
                    discovered: 0,
                    imported: 0,
                    duplicates: 0,
                    error: startErr instanceof Error ? startErr.message : 'Discovery start error'
                });
                continue;
            }
            // ── 2. Wait for the job to reach a terminal state ──
            let job;
            try {
                job = await pollDiscoveryJob(jobId);
            } catch (pollErr) {
                hardFailures++;
                perNiche.push({
                    niche,
                    jobId,
                    status: 'FAILED',
                    discovered: 0,
                    imported: 0,
                    duplicates: 0,
                    error: pollErr instanceof Error ? pollErr.message : 'Discovery poll error'
                });
                continue;
            }
            discovered += job.totalFound;
            saved += job.imported;
            const nicheError = job.status === 'failed' ? job.errorMessage || 'Discovery job failed' : undefined;
            if (job.status === 'failed') hardFailures++;
            // ── 3. Resolve discovered payloads → persisted leads → ledger → workflow ──
            const payloads = job.resultData ? parseJson(job.resultData, []) : [];
            for (const payload of payloads){
                const lead = await resolvePersistedLead(autopilot.userId, payload);
                if (!lead) continue; // payload could not be matched — skip honestly (counted via job counters)
                processed++;
                try {
                    // DB-level idempotency: unique(autopilotId, leadId). If this
                    // lead was already processed by ANY earlier run of this
                    // autopilot, the insert loses and we skip — a lead can never
                    // be executed twice.
                    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotLead.create({
                        data: {
                            autopilotId: autopilot.id,
                            runId,
                            leadId: lead.id,
                            userId: autopilot.userId,
                            status: 'DISCOVERED'
                        }
                    });
                } catch  {
                    continue;
                }
                // Execute the user's configured workflow against this lead via
                // the EXISTING execution engine. Stable idempotency key = one
                // execution per (autopilot, lead) even under retries/duplicates.
                const idempotencyKey = `autopilot:${autopilot.id}:lead:${lead.id}`;
                try {
                    const execution = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$workflow$2d$executor$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["executeWorkflow"])(autopilot.workflowId, autopilot.userId, {
                        leadId: lead.id,
                        source: 'autopilot',
                        autopilotId: autopilot.id,
                        runId,
                        niche,
                        trigger
                    }, idempotencyKey);
                    executionsCreated++;
                    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotLead.updateMany({
                        where: {
                            autopilotId: autopilot.id,
                            leadId: lead.id
                        },
                        data: {
                            status: 'EXEC_QUEUED',
                            executionId: execution.id
                        }
                    });
                } catch (execErr) {
                    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotLead.updateMany({
                        where: {
                            autopilotId: autopilot.id,
                            leadId: lead.id
                        },
                        data: {
                            status: 'EXEC_FAILED',
                            error: execErr instanceof Error ? execErr.message : 'Execution failed'
                        }
                    });
                }
                // Pacing between lead executions (provider-friendly).
                await new Promise((r)=>setTimeout(r, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$autopilot$2f$constants$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["AUTOPILOT_EXECUTION_PACING_MS"]));
            }
            perNiche.push({
                niche,
                jobId,
                status: job.status.toUpperCase(),
                discovered: job.totalFound,
                imported: job.imported,
                duplicates: job.duplicates,
                ...nicheError ? {
                    error: nicheError
                } : {}
            });
            // Pacing between niches.
            await new Promise((r)=>setTimeout(r, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$autopilot$2f$constants$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["AUTOPILOT_NICHE_PACING_MS"]));
        }
        // ── 4. Honest run finalization ──
        const status = hardFailures > 0 && saved === 0 && executionsCreated === 0 ? 'FAILED' : 'COMPLETED';
        const errorSummary = perNiche.filter((n)=>n.error).map((n)=>`${n.niche}: ${n.error}`).join(' | ');
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotRun.update({
            where: {
                id: runId
            },
            data: {
                status,
                discovered,
                saved,
                processed,
                executionsCreated,
                completedAt: new Date(),
                ...errorSummary ? {
                    error: errorSummary.substring(0, 2000)
                } : {},
                ...status === 'FAILED' && !errorSummary ? {
                    error: 'Run failed — no leads imported and no executions created'
                } : {}
            }
        });
        return {
            runId,
            status,
            discovered,
            saved,
            processed,
            executionsCreated,
            perNiche,
            ...errorSummary ? {
                error: errorSummary
            } : {}
        };
    } catch (fatal) {
        const message = fatal instanceof Error ? fatal.message : 'Autopilot run failed';
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotRun.update({
            where: {
                id: runId
            },
            data: {
                status: 'FAILED',
                error: message.substring(0, 2000),
                discovered,
                saved,
                processed,
                executionsCreated,
                completedAt: new Date()
            }
        });
        return {
            runId,
            status: 'FAILED',
            discovered,
            saved,
            processed,
            executionsCreated,
            perNiche,
            error: message
        };
    }
}
async function runAutopilot(autopilotId, userId, trigger) {
    return withUserLock(userId, async ()=>{
        const autopilot = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotWorkflow.findFirst({
            where: {
                id: autopilotId,
                userId
            }
        });
        if (!autopilot) {
            return {
                ok: false,
                error: 'Autopilot not found',
                code: 'NOT_FOUND'
            };
        }
        // Manual runs require ACTIVE. The scheduler path claims ACTIVE→RUNNING
        // before calling, so RUNNING is also acceptable there.
        const acceptable = trigger === 'manual' ? [
            'ACTIVE'
        ] : [
            'ACTIVE',
            'RUNNING'
        ];
        if (!acceptable.includes(autopilot.status)) {
            return {
                ok: false,
                error: `Autopilot is ${autopilot.status} — only ACTIVE autopilots can run`,
                code: 'INVALID_STATE'
            };
        }
        // Concurrent-run guard: no second run while one is QUEUED/RUNNING.
        const openRun = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotRun.findFirst({
            where: {
                autopilotId: autopilot.id,
                status: {
                    in: [
                        'QUEUED',
                        'RUNNING'
                    ]
                }
            },
            select: {
                id: true
            }
        });
        if (openRun) {
            return {
                ok: false,
                error: 'A run is already queued or running for this Autopilot',
                code: 'RUN_IN_PROGRESS'
            };
        }
        // Atomic state claim: ACTIVE→RUNNING. The scheduler path already
        // flipped ACTIVE→RUNNING before calling (count==1 winner); the manual
        // path claims here. Either way exactly one claim succeeds.
        if (autopilot.status === 'ACTIVE') {
            const claimed = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotWorkflow.updateMany({
                where: {
                    id: autopilot.id,
                    status: 'ACTIVE'
                },
                data: {
                    status: 'RUNNING'
                }
            });
            if (claimed.count !== 1) {
                return {
                    ok: false,
                    error: 'Autopilot state changed concurrently — run not started',
                    code: 'STATE_CONFLICT'
                };
            }
        }
        const run = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotRun.create({
            data: {
                autopilotId: autopilot.id,
                userId,
                status: 'QUEUED',
                trigger,
                config: JSON.stringify({
                    niches: parseJson(autopilot.niches, []),
                    geography: parseJson(autopilot.geography, {})
                })
            }
        });
        const outcome = await executeAutopilotRun(autopilot, run.id, trigger);
        // Finalize autopilot row: RUNNING → ACTIVE/FAILED + counters.
        const stillOurs = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotWorkflow.updateMany({
            where: {
                id: autopilot.id,
                status: 'RUNNING'
            },
            data: {
                status: outcome.status === 'FAILED' ? 'FAILED' : 'ACTIVE',
                lastRunAt: new Date(),
                lastError: outcome.error ? outcome.error.substring(0, 2000) : null,
                runCount: {
                    increment: 1
                },
                totalDiscovered: {
                    increment: outcome.discovered
                },
                totalSaved: {
                    increment: outcome.saved
                },
                totalProcessed: {
                    increment: outcome.processed
                },
                totalExecutions: {
                    increment: outcome.executionsCreated
                }
            }
        });
        if (stillOurs.count !== 1) {
            // Recovery path already flipped the state — make counters honest anyway.
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotWorkflow.update({
                where: {
                    id: autopilot.id
                },
                data: {
                    runCount: {
                        increment: 1
                    },
                    totalDiscovered: {
                        increment: outcome.discovered
                    },
                    totalSaved: {
                        increment: outcome.saved
                    },
                    totalProcessed: {
                        increment: outcome.processed
                    },
                    totalExecutions: {
                        increment: outcome.executionsCreated
                    }
                }
            });
        }
        return {
            ok: true,
            runId: run.id,
            outcome
        };
    });
}
async function recoverStuckAutopilotRuns() {
    const stuckBefore = new Date(Date.now() - __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$autopilot$2f$constants$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["AUTOPILOT_STUCK_MS"]);
    // 1. Stuck runs (startedAt in the past beyond the threshold).
    const stuckRuns = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotRun.findMany({
        where: {
            status: 'RUNNING',
            startedAt: {
                lt: stuckBefore
            }
        },
        select: {
            id: true,
            autopilotId: true
        }
    });
    for (const run of stuckRuns){
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotRun.update({
            where: {
                id: run.id
            },
            data: {
                status: 'FAILED',
                error: 'Recovered by scheduler: run stuck in RUNNING for over 60 minutes (process restart or timeout).',
                completedAt: new Date()
            }
        });
    }
    // 2. Autopilots stuck in RUNNING (process died mid-run).
    const stuckAutopilots = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotWorkflow.findMany({
        where: {
            status: 'RUNNING',
            lastRunAt: {
                lt: stuckBefore
            }
        },
        select: {
            id: true
        }
    });
    for (const ap of stuckAutopilots){
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotWorkflow.update({
            where: {
                id: ap.id
            },
            data: {
                status: 'FAILED',
                lastError: 'Recovered by scheduler: was stuck in RUNNING for over 60 minutes.'
            }
        });
    }
    return {
        recoveredRuns: stuckRuns.length,
        recoveredAutopilots: stuckAutopilots.length
    };
}
}),
"[project]/src/lib/autopilot/scheduler-runner.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "runAutopilotSchedulerTick",
    ()=>runAutopilotSchedulerTick
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Scheduler Runner
//
// Shared by POST /api/cron/autopilot-scheduler (CRON_SECRET protected).
// One tick:
//   1. Recover stuck runs / stuck autopilots (honest FAILED states).
//   2. Find ACTIVE autopilots whose nextRunAt is due.
//   3. For each: ATOMICALLY claim ACTIVE→RUNNING (updateMany count==1 —
//      two ticks can never start the same autopilot twice), run it,
//      then set status + nextRunAt.
//
// A run is started exactly once: the run row is claimed QUEUED→RUNNING
// inside executeAutopilotRun, and the AutopilotLead ledger unique
// constraint prevents any duplicate lead processing even if a retry
// ever raced past the claims.
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$autopilot$2f$runner$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/autopilot/runner.ts [instrumentation] (ecmascript)");
;
;
function safeParseArray(raw) {
    try {
        const v = JSON.parse(raw || '[]');
        return Array.isArray(v) ? v.map(String) : [];
    } catch  {
        return [];
    }
}
function safeParseObject(raw) {
    try {
        const v = JSON.parse(raw || '{}');
        return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch  {
        return {};
    }
}
async function runAutopilotSchedulerTick() {
    const recovery = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$autopilot$2f$runner$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["recoverStuckAutopilotRuns"])();
    const now = new Date();
    const due = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotWorkflow.findMany({
        where: {
            status: 'ACTIVE',
            nextRunAt: {
                lte: now,
                not: null
            }
        },
        orderBy: {
            nextRunAt: 'asc'
        },
        take: 10
    });
    const results = [];
    let started = 0;
    let skippedInFlight = 0;
    for (const autopilot of due){
        // ── Atomic claim: only one tick can flip ACTIVE→RUNNING. ──
        const claimed = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotWorkflow.updateMany({
            where: {
                id: autopilot.id,
                status: 'ACTIVE'
            },
            data: {
                status: 'RUNNING'
            }
        });
        if (claimed.count !== 1) {
            skippedInFlight++;
            continue; // another tick/worker got it — never double-run
        }
        // Open-run guard: an unfinished previous run blocks a new one.
        const openRun = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotRun.findFirst({
            where: {
                autopilotId: autopilot.id,
                status: {
                    in: [
                        'QUEUED',
                        'RUNNING'
                    ]
                }
            },
            select: {
                id: true
            }
        });
        if (openRun) {
            skippedInFlight++;
            // Release the claim — previous run still owns this autopilot.
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotWorkflow.updateMany({
                where: {
                    id: autopilot.id,
                    status: 'RUNNING'
                },
                data: {
                    status: 'ACTIVE'
                }
            });
            continue;
        }
        const run = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotRun.create({
            data: {
                autopilotId: autopilot.id,
                userId: autopilot.userId,
                status: 'QUEUED',
                trigger: 'scheduler',
                config: JSON.stringify({
                    niches: safeParseArray(autopilot.niches),
                    geography: safeParseObject(autopilot.geography)
                })
            }
        });
        started++;
        const outcome = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$autopilot$2f$runner$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["executeAutopilotRun"])(autopilot, run.id, 'scheduler');
        // Schedule the next run; autopilot returns to ACTIVE (or FAILED).
        const nextRunAt = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$autopilot$2f$runner$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["computeNextRun"])(autopilot.schedule) || new Date(Date.now() + 24 * 60 * 60 * 1000);
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["db"].autopilotWorkflow.updateMany({
            where: {
                id: autopilot.id,
                status: 'RUNNING'
            },
            data: {
                status: outcome.status === 'FAILED' ? 'FAILED' : 'ACTIVE',
                lastRunAt: new Date(),
                nextRunAt,
                lastError: outcome.error ? outcome.error.substring(0, 2000) : null,
                runCount: {
                    increment: 1
                },
                totalDiscovered: {
                    increment: outcome.discovered
                },
                totalSaved: {
                    increment: outcome.saved
                },
                totalProcessed: {
                    increment: outcome.processed
                },
                totalExecutions: {
                    increment: outcome.executionsCreated
                }
            }
        });
        results.push({
            autopilotId: autopilot.id,
            runId: run.id,
            status: outcome.status,
            nextRunAt: nextRunAt.toISOString(),
            ...outcome.error ? {
                error: outcome.error
            } : {}
        });
    }
    return {
        recoveredRuns: recovery.recoveredRuns,
        recoveredAutopilots: recovery.recoveredAutopilots,
        dueCount: due.length,
        started,
        skippedInFlight,
        results
    };
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__a648f318._.js.map