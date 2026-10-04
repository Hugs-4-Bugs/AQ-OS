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
"[externals]/@prisma/client [external] (@prisma/client, cjs, [project]/node_modules/@prisma/client)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("@prisma/client-2c3a283f134fdcb6", () => require("@prisma/client-2c3a283f134fdcb6"));

module.exports = mod;
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__94d28299._.js.map