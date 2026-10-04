module.exports = [
"[project]/src/lib/observability/metrics-collector.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/src/lib/logger.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/src/lib/observability/logger.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/logger.ts [app-route] (ecmascript)");
;
const debug = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__.debug;
const info = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__.info;
const warn = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__.warn;
const error = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__.error;
const fatal = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__.fatal;
const createLogger = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__.createLogger;
const withDuration = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__.withDuration;
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
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__.info(`${this.label} completed`, {
            service: 'observability'
        }, {
            durationMs,
            ...extra
        });
        return durationMs;
    }
    /** Stop the timer and log the duration at error level. */ stopError(message, extra) {
        const durationMs = Math.round(performance.now() - this.startTime);
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__.error(message, {
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
        debug: (message, metadata)=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__.debug(message, baseOptions, {
                ...defaultContext,
                ...metadata
            }),
        info: (message, metadata)=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__.info(message, baseOptions, {
                ...defaultContext,
                ...metadata
            }),
        warn: (message, metadata)=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__.warn(message, baseOptions, {
                ...defaultContext,
                ...metadata
            }),
        error: (message, metadata)=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__.error(message, baseOptions, {
                ...defaultContext,
                ...metadata
            }),
        fatal: (message, metadata)=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__.fatal(message, baseOptions, {
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
            __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__[level](`API ${method} ${path} → ${status} (${durationMs}ms)`, baseOptions, {
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
    __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__[level](`${params.method} ${params.path} → ${params.statusCode}`, {
        service: params.module || 'api',
        userId: params.userId,
        requestId: params.requestId || params.traceId
    }, metadata);
}
function logBusinessEvent(params) {
    __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__.info(`Business event: ${params.event}`, {
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
"[externals]/fs [external] (fs, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("fs", () => require("fs"));

module.exports = mod;
}),
"[externals]/path [external] (path, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("path", () => require("path"));

module.exports = mod;
}),
"[project]/src/lib/db.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$observability$2f$metrics$2d$collector$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/observability/metrics-collector.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$observability$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/observability/logger.ts [app-route] (ecmascript)");
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
            __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$observability$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logger"].warn(`Slow DB query detected (${durationMs.toFixed(2)}ms)`, undefined, {
                operation,
                duration: durationMs,
                queryPreview: query.substring(0, 100)
            });
        }
        // Record to Prometheus metrics
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$observability$2f$metrics$2d$collector$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["metricsCollector"].observeHistogram('db_query_duration_seconds', {
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
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$observability$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logger"].error('Prisma error event', undefined, {
            error: new Error(e.message)
        });
    });
    db.$on('warn', (e)=>{
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$observability$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logger"].warn('Prisma warning', undefined, {
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
"[project]/src/lib/billing-audit.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
;
async function logBillingEvent(params) {
    try {
        const details = params.metadata ? JSON.stringify({
            ...params.details ? {
                description: params.details
            } : {},
            ...params.metadata
        }) : params.details || null;
        const auditLog = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].auditLog.create({
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
            __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].auditLog.findMany({
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
            __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].auditLog.count({
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
"[project]/src/lib/realtime-event-bus.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/src/lib/notification-service.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$realtime$2d$event$2d$bus$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/realtime-event-bus.ts [app-route] (ecmascript)");
;
;
function publishNotificationCreated(notification) {
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$realtime$2d$event$2d$bus$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["publishEvent"])({
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
        const notification = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].notification.create({
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
            const existing = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].notification.findFirst({
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
    return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].notification.count({
        where: {
            userId,
            read: false
        }
    });
}
async function markAllRead(userId) {
    const result = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].notification.updateMany({
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
    const result = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].notification.deleteMany({
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
"[project]/src/lib/plan-feature-limits.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Client-Safe Plan Limit Constants
//
// Plan Eligibility Correction (Oct 2026):
//   • Autonomous workflows and the complete AI Business Growth Agent
//     automation are available EXCLUSIVELY to Pro and Elite subscribers.
//     Free and Starter subscribers have no access — enforced in the UI
//     (PlanGate) AND on the backend (workflow_access entitlement).
//   • Active business profiles / niches per plan:
//       Free 1 · Starter 1 · Pro 3 · Elite 7
//     The limits apply to PROFILES/NICHES, never to the number of leads
//     a workflow processes.
//
// This module is intentionally dependency-free (no `@/lib/db`, no server
// modules) so both client components and the server-side entitlement
// service can import the SAME single source of truth.
// ═══════════════════════════════════════════════════════════════════
__turbopack_context__.s([
    "AUTOMATION_MIN_PLAN",
    ()=>AUTOMATION_MIN_PLAN,
    "AUTOMATION_PLAN_TIERS",
    ()=>AUTOMATION_PLAN_TIERS,
    "BUSINESS_PROFILE_LIMITS",
    ()=>BUSINESS_PROFILE_LIMITS,
    "PLAN_TIER_LABELS",
    ()=>PLAN_TIER_LABELS,
    "PLAN_TIER_ORDER",
    ()=>PLAN_TIER_ORDER,
    "nextProfileLimitPlan",
    ()=>nextProfileLimitPlan,
    "toPlanTier",
    ()=>toPlanTier
]);
const PLAN_TIER_ORDER = [
    'free',
    'starter',
    'pro',
    'elite'
];
const PLAN_TIER_LABELS = {
    free: 'Free',
    starter: 'Starter',
    pro: 'Pro',
    elite: 'Elite'
};
const BUSINESS_PROFILE_LIMITS = {
    free: 1,
    starter: 1,
    pro: 3,
    elite: 7
};
const AUTOMATION_MIN_PLAN = 'pro';
const AUTOMATION_PLAN_TIERS = [
    'pro',
    'elite'
];
function toPlanTier(plan) {
    const normalized = (plan ?? '').toLowerCase().trim();
    return PLAN_TIER_ORDER.includes(normalized) ? normalized : 'free';
}
function nextProfileLimitPlan(plan) {
    const current = BUSINESS_PROFILE_LIMITS[plan] ?? BUSINESS_PROFILE_LIMITS.free;
    for (const tier of PLAN_TIER_ORDER){
        if (BUSINESS_PROFILE_LIMITS[tier] > current) return tier;
    }
    return null;
}
}),
"[project]/src/lib/entitlement-service.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/billing-audit.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$plan$2d$feature$2d$limits$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/plan-feature-limits.ts [app-route] (ecmascript)");
;
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
        // Plan Eligibility Correction: active business profiles/niches per plan.
        business_profiles: {
            limit: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$plan$2d$feature$2d$limits$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["BUSINESS_PROFILE_LIMITS"].free,
            enabled: true
        },
        white_label: {
            limit: 0,
            enabled: false
        },
        custom_integrations: {
            limit: 0,
            enabled: false
        }
    },
    // Starter — basic features only (final pricing/plan update, Sep 2026).
    // Same feature set as Free except the monthly lead limit is 25.
    // Plan Eligibility Correction: workflow_access stays DISABLED for Starter.
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
        business_profiles: {
            limit: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$plan$2d$feature$2d$limits$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["BUSINESS_PROFILE_LIMITS"].starter,
            enabled: true
        },
        white_label: {
            limit: 0,
            enabled: false
        },
        custom_integrations: {
            limit: 0,
            enabled: false
        }
    },
    // Plan Eligibility Correction: autonomous workflows + the AI Business
    // Growth Agent automation are exclusive to Pro and Elite (workflow_access).
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
        business_profiles: {
            limit: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$plan$2d$feature$2d$limits$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["BUSINESS_PROFILE_LIMITS"].pro,
            enabled: true
        },
        white_label: {
            limit: 0,
            enabled: false
        },
        custom_integrations: {
            limit: 0,
            enabled: false
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
        business_profiles: {
            limit: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$plan$2d$feature$2d$limits$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["BUSINESS_PROFILE_LIMITS"].elite,
            enabled: true
        },
        white_label: {
            limit: null,
            enabled: true
        },
        custom_integrations: {
            limit: null,
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
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logEntitlementEvent"])(userId, 'feature_blocked', {
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
                await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].planEntitlement.upsert({
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
        const records = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].planEntitlement.findMany({
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
"[project]/src/lib/credit-service.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CREDIT_COSTS",
    ()=>CREDIT_COSTS,
    "SIGNUP_GRANT_ACTION",
    ()=>SIGNUP_GRANT_ACTION,
    "SIGNUP_GRANT_CREDITS",
    ()=>SIGNUP_GRANT_CREDITS,
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
    ()=>rolloverCredits,
    "writeSignupGrantLedger",
    ()=>writeSignupGrantLedger
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
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/billing-audit.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$notification$2d$service$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/notification-service.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$entitlement$2d$service$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/entitlement-service.ts [app-route] (ecmascript)");
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
const SIGNUP_GRANT_CREDITS = 50;
const SIGNUP_GRANT_ACTION = 'signup_grant';
async function writeSignupGrantLedger(tx, userId) {
    await tx.creditsLedger.create({
        data: {
            userId,
            action: SIGNUP_GRANT_ACTION,
            credits: SIGNUP_GRANT_CREDITS,
            balance: SIGNUP_GRANT_CREDITS,
            description: 'Signup reward credits (initial grant)',
            referenceId: userId
        }
    });
}
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
        // Check idempotency key if provided — the key is stored on the ledger
        // row itself, so a retried/replayed request can never double-charge.
        if (idempotencyKey) {
            const existingLedger = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].creditsLedger.findFirst({
                where: {
                    userId,
                    idempotencyKey
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
        const result = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].$transaction(async (tx)=>{
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
            // Create ledger entry. The idempotency key (when provided) is stored
            // on the row and checked above, making keyed deductions retry-safe.
            // The public `action` stays clean for analytics/aggregation.
            const ledgerEntry = await tx.creditsLedger.create({
                data: {
                    userId,
                    action,
                    credits: -cost,
                    balance: newBalance,
                    description: `Deducted ${cost} credits for ${action}`,
                    referenceId: referenceId || null,
                    idempotencyKey: idempotencyKey || null
                }
            });
            return {
                newBalance,
                ledgerEntryId: ledgerEntry.id,
                plan: user.plan
            };
        });
        // Log audit event
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logCreditEvent"])(userId, 'credits_deducted', {
            amount: cost,
            balance: result.newBalance,
            action_type: action,
            referenceId
        });
        // Check for low credit warnings
        if (result.newBalance <= 0) {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logCreditEvent"])(userId, 'credit_zero', {
                amount: 0,
                balance: 0,
                action_type: action
            });
            // User-facing notification — deduped to one per 12h window so the
            // per-action cadence of deductCredits cannot spam the bell.
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$notification$2d$service$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createNotificationOnce"])({
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
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logCreditEvent"])(userId, 'credit_warning', {
                amount: cost,
                balance: result.newBalance,
                action_type: action
            });
            // User-facing notification — deduped to one per 12h window.
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$notification$2d$service$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createNotificationOnce"])({
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
            const duplicate = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].creditsLedger.findFirst({
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
        const result = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].$transaction(async (tx)=>{
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
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logCreditEvent"])(userId, 'credits_added', {
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
        const result = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].$transaction(async (tx)=>{
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
            const planMonthly = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$entitlement$2d$service$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["PLAN_CREDITS"][plan] || __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$entitlement$2d$service$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["PLAN_CREDITS"].free;
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
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logCreditEvent"])(userId, 'rollover_processed', {
                amount: result.rolloverAmount,
                balance: result.newCredits,
                source: 'monthly_rollover'
            });
        }
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logCreditEvent"])(userId, 'monthly_reset', {
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
        const planCredits = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$entitlement$2d$service$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["PLAN_CREDITS"][plan] || __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$entitlement$2d$service$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["PLAN_CREDITS"].free;
        const result = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].$transaction(async (tx)=>{
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
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logCreditEvent"])(userId, 'monthly_reset', {
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
        const user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].user.findUnique({
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
        const activeAddons = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].creditAddon.findMany({
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
        const user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].user.findUnique({
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
        const { userId, amount, originalAction, referenceId } = params;
        if (amount <= 0) {
            return {
                success: false,
                newBalance: 0,
                error: 'Refund amount must be greater than 0'
            };
        }
        const result = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].$transaction(async (tx)=>{
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
            // Create refund ledger entry
            const ledgerEntry = await tx.creditsLedger.create({
                data: {
                    userId,
                    action: `${originalAction}_refund`,
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
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logCreditEvent"])(userId, 'credits_refunded', {
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
        const result = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].$transaction(async (tx)=>{
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
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$billing$2d$audit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logCreditEvent"])(params.userId, 'credits_added', {
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
];

//# sourceMappingURL=%5Broot-of-the-server%5D__72096eed._.js.map