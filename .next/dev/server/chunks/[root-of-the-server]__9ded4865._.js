module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
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
"[externals]/buffer [external] (buffer, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("buffer", () => require("buffer"));

module.exports = mod;
}),
"[externals]/stream [external] (stream, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("stream", () => require("stream"));

module.exports = mod;
}),
"[externals]/util [external] (util, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("util", () => require("util"));

module.exports = mod;
}),
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[project]/src/lib/auth.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([
    "AuthError",
    ()=>AuthError,
    "BCRYPT_ROUNDS",
    ()=>BCRYPT_ROUNDS,
    "JWT_ACCESS_EXPIRY",
    ()=>JWT_ACCESS_EXPIRY,
    "JWT_REFRESH_EXPIRY",
    ()=>JWT_REFRESH_EXPIRY,
    "JWT_SECRET",
    ()=>JWT_SECRET,
    "LOCKOUT_MINUTES",
    ()=>LOCKOUT_MINUTES,
    "MAX_LOGIN_ATTEMPTS",
    ()=>MAX_LOGIN_ATTEMPTS,
    "OTP_EXPIRY_SECONDS",
    ()=>OTP_EXPIRY_SECONDS,
    "OTP_MAX_ATTEMPTS",
    ()=>OTP_MAX_ATTEMPTS,
    "SESSION_ACTIVITY_WRITE_THROTTLE_MS",
    ()=>SESSION_ACTIVITY_WRITE_THROTTLE_MS,
    "SESSION_IDLE_MAX_MS",
    ()=>SESSION_IDLE_MAX_MS,
    "SESSION_REMEMBER_ABSOLUTE_MS",
    ()=>SESSION_REMEMBER_ABSOLUTE_MS,
    "classifyAuthErrorCategory",
    ()=>classifyAuthErrorCategory,
    "clearAuthCookies",
    ()=>clearAuthCookies,
    "createSession",
    ()=>createSession,
    "detectSuspiciousLogin",
    ()=>detectSuspiciousLogin,
    "extractBearerToken",
    ()=>extractBearerToken,
    "generateAccessToken",
    ()=>generateAccessToken,
    "generateBackupCodes",
    ()=>generateBackupCodes,
    "generateMagicLinkToken",
    ()=>generateMagicLinkToken,
    "generateMfaSessionToken",
    ()=>generateMfaSessionToken,
    "generateOTP",
    ()=>generateOTP,
    "generateRefreshToken",
    ()=>generateRefreshToken,
    "generateTotpSecret",
    ()=>generateTotpSecret,
    "generateTotpUri",
    ()=>generateTotpUri,
    "getAuthUser",
    ()=>getAuthUser,
    "getClientIp",
    ()=>getClientIp,
    "getSessionState",
    ()=>getSessionState,
    "getUserActiveSessions",
    ()=>getUserActiveSessions,
    "getUserAgent",
    ()=>getUserAgent,
    "hasRole",
    ()=>hasRole,
    "hashPassword",
    ()=>hashPassword,
    "incrementOtpAttempts",
    ()=>incrementOtpAttempts,
    "isAccountLocked",
    ()=>isAccountLocked,
    "isAdmin",
    ()=>isAdmin,
    "isIpRateLimited",
    ()=>isIpRateLimited,
    "isMfaEnabled",
    ()=>isMfaEnabled,
    "isOtpLocked",
    ()=>isOtpLocked,
    "isSessionValid",
    ()=>isSessionValid,
    "logAuthEvent",
    ()=>logAuthEvent,
    "readRememberMeCookie",
    ()=>readRememberMeCookie,
    "recordLoginAttempt",
    ()=>recordLoginAttempt,
    "recordLoginAttemptByEmail",
    ()=>recordLoginAttemptByEmail,
    "requireAuth",
    ()=>requireAuth,
    "resetOtpAttempts",
    ()=>resetOtpAttempts,
    "revokeAllUserSessions",
    ()=>revokeAllUserSessions,
    "revokeSession",
    ()=>revokeSession,
    "secureCompare",
    ()=>secureCompare,
    "sendSecurityAlert",
    ()=>sendSecurityAlert,
    "setAuthCookies",
    ()=>setAuthCookies,
    "touchSessionActivity",
    ()=>touchSessionActivity,
    "validateEmail",
    ()=>validateEmail,
    "validatePasswordStrength",
    ()=>validatePasswordStrength,
    "verifyPassword",
    ()=>verifyPassword,
    "verifyToken",
    ()=>verifyToken,
    "verifyTotpCode",
    ()=>verifyTotpCode
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Centralized Authentication & Authorization Library
// Phase 3: Auth + Authorization + Session Security + RBAC
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jsonwebtoken$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jsonwebtoken/index.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$bcryptjs__$5b$external$5d$__$28$bcryptjs$2c$__esm_import$2c$__$5b$project$5d2f$node_modules$2f$bcryptjs$29$__ = __turbopack_context__.i("[externals]/bcryptjs [external] (bcryptjs, esm_import, [project]/node_modules/bcryptjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/crypto [external] (crypto, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$externals$5d2f$bcryptjs__$5b$external$5d$__$28$bcryptjs$2c$__esm_import$2c$__$5b$project$5d2f$node_modules$2f$bcryptjs$29$__
]);
[__TURBOPACK__imported__module__$5b$externals$5d2f$bcryptjs__$5b$external$5d$__$28$bcryptjs$2c$__esm_import$2c$__$5b$project$5d2f$node_modules$2f$bcryptjs$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
;
;
;
// ===== CONSTANTS =====
// JWT_SECRET: In production, this MUST be set via environment variable.
// Resolution order: JWT_SECRET → AUTH_SECRET → NEXTAUTH_SECRET. The dev
// fallback below is ONLY reachable when NODE_ENV !== 'production'; the
// ensureJwtSecret() runtime guard refuses to sign/verify with it in production.
const DEV_FALLBACK_JWT_SECRET = 'acquisitionos-dev-secret-change-in-production';
const JWT_SECRET = process.env.JWT_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || DEV_FALLBACK_JWT_SECRET;
/** Runtime guard: never sign or verify JWTs with the dev fallback in production */ function ensureJwtSecret() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
}
const JWT_ACCESS_EXPIRY = '15m';
const JWT_REFRESH_EXPIRY = '30d';
const BCRYPT_ROUNDS = 12;
const OTP_EXPIRY_SECONDS = 600; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const SESSION_IDLE_MAX_MS = 48 * 60 * 60 * 1000; // retained for legacy reference — no longer enforced
const SESSION_REMEMBER_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_ACTIVITY_WRITE_THROTTLE_MS = 5 * 60 * 1000; // avoid per-request writes
function generateAccessToken(user) {
    ensureJwtSecret();
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jsonwebtoken$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        plan: user.plan,
        orgId: user.orgId,
        isTrial: user.isTrial,
        trialEndsAt: user.trialEndsAt?.toISOString() || null,
        type: 'access'
    }, JWT_SECRET, {
        expiresIn: JWT_ACCESS_EXPIRY,
        issuer: 'acquisitionos',
        audience: 'acquisitionos-api'
    });
}
function generateRefreshToken(user) {
    ensureJwtSecret();
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jsonwebtoken$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        plan: user.plan,
        orgId: user.orgId,
        isTrial: user.isTrial,
        trialEndsAt: user.trialEndsAt?.toISOString() || null,
        type: 'refresh'
    }, JWT_SECRET, {
        expiresIn: JWT_REFRESH_EXPIRY,
        issuer: 'acquisitionos',
        audience: 'acquisitionos-api'
    });
}
function generateMfaSessionToken(user) {
    ensureJwtSecret();
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jsonwebtoken$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        plan: user.plan,
        orgId: user.orgId,
        isTrial: user.isTrial,
        trialEndsAt: user.trialEndsAt?.toISOString() || null,
        type: 'mfa'
    }, JWT_SECRET, {
        expiresIn: '5m',
        issuer: 'acquisitionos',
        audience: 'acquisitionos-api'
    });
}
function verifyToken(token) {
    try {
        ensureJwtSecret();
        const decoded = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jsonwebtoken$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].verify(token, JWT_SECRET, {
            issuer: 'acquisitionos',
            audience: 'acquisitionos-api'
        });
        return decoded;
    } catch  {
        return null;
    }
}
function extractBearerToken(request) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;
    return authHeader.substring(7);
}
function setAuthCookies(response, accessToken, refreshToken, opts) {
    const persist = opts?.persist !== false;
    response.cookies.set('access_token', accessToken, {
        httpOnly: true,
        secure: ("TURBOPACK compile-time value", "development") === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 15 * 60
    });
    response.cookies.set('refresh_token', refreshToken, {
        httpOnly: true,
        secure: ("TURBOPACK compile-time value", "development") === 'production',
        sameSite: 'strict',
        path: '/api/auth',
        ...persist ? {
            maxAge: 30 * 24 * 60 * 60
        } : {}
    });
    return response;
}
function clearAuthCookies(response) {
    response.cookies.set('access_token', '', {
        httpOnly: true,
        secure: ("TURBOPACK compile-time value", "development") === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 0
    });
    response.cookies.set('refresh_token', '', {
        httpOnly: true,
        secure: ("TURBOPACK compile-time value", "development") === 'production',
        sameSite: 'strict',
        path: '/api/auth',
        maxAge: 0
    });
    return response;
}
async function hashPassword(password) {
    return __TURBOPACK__imported__module__$5b$externals$5d2f$bcryptjs__$5b$external$5d$__$28$bcryptjs$2c$__esm_import$2c$__$5b$project$5d2f$node_modules$2f$bcryptjs$29$__["default"].hash(password, BCRYPT_ROUNDS);
}
async function verifyPassword(password, hash) {
    try {
        return await __TURBOPACK__imported__module__$5b$externals$5d2f$bcryptjs__$5b$external$5d$__$28$bcryptjs$2c$__esm_import$2c$__$5b$project$5d2f$node_modules$2f$bcryptjs$29$__["default"].compare(password, hash);
    } catch  {
        // Invalid hash format (e.g., timing-safe fake hash) — treat as non-match
        return false;
    }
}
function validatePasswordStrength(password) {
    const errors = [];
    if (password.length < 8) errors.push('Password must be at least 8 characters');
    if (password.length > 128) errors.push('Password must be less than 128 characters');
    if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter');
    if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number');
    if (!/[^A-Za-z0-9]/.test(password)) errors.push('Password must contain at least one special character');
    return {
        valid: errors.length === 0,
        errors
    };
}
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function generateOTP() {
    return __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["default"].randomInt(100000, 999999).toString();
}
function secureCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a, 'utf-8');
    const bufB = Buffer.from(b, 'utf-8');
    // If lengths differ, still compare bufB with itself to consume the same time,
    // then return false — this prevents leaking length information via timing
    if (bufA.length !== bufB.length) {
        __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["default"].timingSafeEqual(bufB, bufB);
        return false;
    }
    try {
        return __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["default"].timingSafeEqual(bufA, bufB);
    } catch  {
        return false;
    }
}
async function isOtpLocked(userId) {
    const user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].user.findUnique({
        where: {
            id: userId
        },
        select: {
            otpLockedUntil: true
        }
    });
    if (!user?.otpLockedUntil) return false;
    return new Date() < user.otpLockedUntil;
}
async function incrementOtpAttempts(userId) {
    const user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].user.findUnique({
        where: {
            id: userId
        },
        select: {
            otpAttemptCount: true
        }
    });
    const newCount = (user?.otpAttemptCount ?? 0) + 1;
    const locked = newCount >= OTP_MAX_ATTEMPTS;
    const lockUntil = locked ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].user.update({
        where: {
            id: userId
        },
        data: {
            otpAttemptCount: newCount,
            otpLockedUntil: lockUntil
        }
    });
    return {
        locked,
        attempts: newCount
    };
}
async function resetOtpAttempts(userId) {
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].user.update({
        where: {
            id: userId
        },
        data: {
            otpAttemptCount: 0,
            otpLockedUntil: null
        }
    });
}
function generateMagicLinkToken() {
    return __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["default"].randomBytes(32).toString('hex');
}
async function createSession(params) {
    const now = Date.now();
    // 30-day expiry for BOTH modes: for remembered sessions this IS the
    // absolute ceiling; for non-remembered sessions this is the normal
    // server-side lifetime (unchanged from current behavior).
    const expiresAt = new Date(now + 30 * 24 * 60 * 60 * 1000);
    const rememberMe = !!params.rememberMe;
    const data = {
        userId: params.userId,
        refreshToken: params.refreshToken,
        deviceInfo: params.deviceInfo || null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        expiresAt,
        isRevoked: false,
        rememberMe,
        lastActivityAt: new Date(now),
        absoluteExpiresAt: new Date(now + SESSION_REMEMBER_ABSOLUTE_MS)
    };
    // Pre-emptively delete any existing session with the same refreshToken
    // to avoid P2002 unique constraint errors on race conditions or re-logins.
    try {
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].userSession.deleteMany({
            where: {
                refreshToken: params.refreshToken
            }
        });
    } catch  {
    // Ignore errors — the session may not exist
    }
    try {
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].userSession.create({
            data
        });
    } catch (error) {
        // Handle P2002 (unique constraint violation) gracefully.
        // This can still happen in a race condition where another request
        // inserted the same refreshToken between our deleteMany and create.
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
            // Delete the conflicting session and retry once
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].userSession.deleteMany({
                where: {
                    refreshToken: params.refreshToken
                }
            });
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].userSession.create({
                data
            });
        } else {
            throw error;
        }
    }
}
async function revokeSession(refreshToken) {
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].userSession.updateMany({
        where: {
            refreshToken
        },
        data: {
            isRevoked: true
        }
    });
}
async function revokeAllUserSessions(userId) {
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].userSession.updateMany({
        where: {
            userId,
            isRevoked: false
        },
        data: {
            isRevoked: true
        }
    });
}
async function isSessionValid(refreshToken) {
    const session = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].userSession.findFirst({
        where: {
            refreshToken,
            isRevoked: false,
            expiresAt: {
                gt: new Date()
            }
        }
    });
    return !!session;
}
async function getSessionState(refreshToken) {
    const session = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].userSession.findFirst({
        where: {
            refreshToken
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
    if (!session) return {
        state: 'missing',
        session: null
    };
    if (session.isRevoked) return {
        state: 'revoked',
        session: null
    };
    const now = new Date();
    if (session.expiresAt <= now) return {
        state: 'expired',
        session: null
    };
    // Hard absolute ceiling (P5): 30 days regardless of activity.
    const absolute = session.absoluteExpiresAt ?? session.expiresAt;
    if (absolute <= now) return {
        state: 'expired',
        session: null
    };
    // NOTE (Sep 29, 2026): the remembered-session 48h idle-expiry rule was
    // REMOVED — it contradicted the advertised "remember me for 30 days"
    // persistence by logging users out after two inactive days. A remembered
    // session now lives until its absolute 30-day ceiling unless explicitly
    // revoked. lastActivityAt is still maintained for audit trails.
    return {
        state: 'valid',
        session: {
            id: session.id,
            userId: session.userId,
            rememberMe: session.rememberMe,
            lastActivityAt: session.lastActivityAt,
            expiresAt: session.expiresAt,
            absoluteExpiresAt: session.absoluteExpiresAt
        }
    };
}
async function touchSessionActivity(sessionId) {
    try {
        const session = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].userSession.findUnique({
            where: {
                id: sessionId
            },
            select: {
                lastActivityAt: true
            }
        });
        if (!session) return;
        if (Date.now() - new Date(session.lastActivityAt).getTime() < SESSION_ACTIVITY_WRITE_THROTTLE_MS) {
            return; // recent write — skip (reduces SQLite write pressure)
        }
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].userSession.update({
            where: {
                id: sessionId
            },
            data: {
                lastActivityAt: new Date()
            }
        });
    } catch (error) {
        // Activity tracking must never break authentication. Database failures
        // here are non-fatal — the session itself was already validated.
        console.warn('[Auth] touchSessionActivity failed (non-fatal):', error instanceof Error ? error.message : error);
    }
}
function readRememberMeCookie(request) {
    return request.cookies.get('aqos_remember_me')?.value === '1';
}
async function getUserActiveSessions(userId) {
    return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].userSession.findMany({
        where: {
            userId,
            isRevoked: false,
            expiresAt: {
                gt: new Date()
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
}
async function recordLoginAttempt(params) {
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].loginHistory.create({
        data: {
            userId: params.userId,
            ip: params.ip || null,
            userAgent: params.userAgent || null,
            country: params.country || null,
            city: params.city || null,
            success: params.success,
            failReason: params.failReason || null
        }
    });
}
async function recordLoginAttemptByEmail(params) {
    const user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].user.findUnique({
        where: {
            email: params.email
        }
    });
    if (!user) return null;
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].loginHistory.create({
        data: {
            userId: user.id,
            ip: params.ip || null,
            userAgent: params.userAgent || null,
            country: params.country || null,
            success: params.success,
            failReason: params.failReason || null
        }
    });
    return user.id;
}
async function isAccountLocked(email) {
    const recentFailedAttempts = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].loginHistory.count({
        where: {
            success: false,
            createdAt: {
                gt: new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000)
            },
            user: {
                email
            }
        }
    });
    return recentFailedAttempts >= MAX_LOGIN_ATTEMPTS;
}
function isIpRateLimited(failedAttempts) {
    return failedAttempts >= MAX_LOGIN_ATTEMPTS;
}
// ===== MFA / TOTP FUNCTIONS =====
const TOTP_PERIOD = 30; // seconds per time step
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1; // allow ±1 time step for clock drift
// Base32 alphabet (RFC 4648)
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** Encode a buffer as Base32 string */ function base32Encode(buffer) {
    let bits = '';
    for (const byte of buffer){
        bits += byte.toString(2).padStart(8, '0');
    }
    let result = '';
    for(let i = 0; i + 5 <= bits.length; i += 5){
        result += BASE32_CHARS[parseInt(bits.substring(i, i + 5), 2)];
    }
    return result;
}
/** Decode a Base32 string to a buffer */ function base32Decode(str) {
    const cleaned = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = '';
    for (const char of cleaned){
        const val = BASE32_CHARS.indexOf(char);
        if (val === -1) continue;
        bits += val.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for(let i = 0; i + 8 <= bits.length; i += 8){
        bytes.push(parseInt(bits.substring(i, i + 8), 2));
    }
    return Buffer.from(bytes);
}
function generateTotpSecret() {
    return base32Encode(__TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["default"].randomBytes(20));
}
function generateTotpUri(params) {
    const encodedLabel = encodeURIComponent(params.label);
    const encodedIssuer = encodeURIComponent(params.issuer);
    return `otpauth://totp/${encodedIssuer}:${encodedLabel}?secret=${params.secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}
/** Calculate TOTP code for a given secret and time */ function calculateTotp(secret, time) {
    const timeStep = Math.floor(time / TOTP_PERIOD);
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeUInt32BE(0, 0);
    timeBuffer.writeUInt32BE(timeStep, 4);
    const key = base32Decode(secret);
    const hmac = __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["default"].createHmac('sha1', key);
    hmac.update(timeBuffer);
    const hmacResult = hmac.digest();
    // Dynamic truncation
    const offset = hmacResult[hmacResult.length - 1] & 0x0f;
    const code = (hmacResult[offset] & 0x7f) << 24 | (hmacResult[offset + 1] & 0xff) << 16 | (hmacResult[offset + 2] & 0xff) << 8 | hmacResult[offset + 3] & 0xff;
    return (code % Math.pow(10, TOTP_DIGITS)).toString().padStart(TOTP_DIGITS, '0');
}
function verifyTotpCode(secret, token) {
    if (!/^\d{6}$/.test(token)) return false;
    const now = Math.floor(Date.now() / 1000);
    // Check current time step and ±window steps
    for(let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i++){
        const checkTime = now + i * TOTP_PERIOD;
        const expected = calculateTotp(secret, checkTime);
        if (__TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["default"].timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
            return true;
        }
    }
    return false;
}
function generateBackupCodes(count = 8) {
    return Array.from({
        length: count
    }, ()=>__TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["default"].randomBytes(4).toString('hex').toUpperCase());
}
async function isMfaEnabled(userId) {
    const mfaConfig = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].mfaConfig.findUnique({
        where: {
            userId
        }
    });
    return mfaConfig?.isEnabled ?? false;
}
async function logAuthEvent(params) {
    try {
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].auditLog.create({
            data: {
                userId: params.userId,
                action: params.action,
                details: params.details || null,
                ipAddress: params.ipAddress || null,
                userAgent: params.userAgent || null,
                resource: params.resource || 'auth',
                resourceId: params.resourceId || null
            }
        });
    } catch (error) {
        // Never fail the main flow due to audit logging failure
        console.error('Audit log error:', error);
    }
}
// ===== AUTH HELPER FOR API ROUTES =====
/**
 * Map a Prisma User record to an AuthUser.
 * Handles field name differences (e.g., `avatar` → `avatarUrl`)
 * and resolves MFA status from the MfaConfig relation.
 * Resolves plan from the active subscription if available, falling back
 * to the User.plan field, and ultimately to 'free'.
 */ async function mapUserToAuthUser(user) {
    // Resolve the plan from the active subscription (trialing or active),
    // falling back to the User.plan field, then to 'free'.
    const activeSubscription = user.subscriptions.find((s)=>s.status === 'active' || s.status === 'trialing');
    const resolvedPlan = activeSubscription?.plan || user.plan || 'free';
    return {
        id: user.id,
        email: user.email,
        name: user.name || '',
        role: user.role,
        plan: resolvedPlan,
        orgId: user.orgId,
        emailVerified: user.emailVerified,
        mfaEnabled: user.mfaConfig?.isEnabled ?? false,
        avatarUrl: user.avatar
    };
}
async function getAuthUser(request) {
    // ── P11 (error semantics): infrastructure failures are NOT "anonymous" ──
    // A database outage must surface as 503 (temporarily unavailable), never
    // as a silent 401 that client code maps to logged-out / Free.
    let bearerToken = null;
    let accessTokenCookie;
    try {
        bearerToken = extractBearerToken(request);
        accessTokenCookie = request.cookies.get('access_token')?.value;
        const resolveFromToken = async (token)=>{
            const payload = verifyToken(token);
            if (!payload || payload.type !== 'access') return null;
            const user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].user.findUnique({
                where: {
                    id: payload.sub
                },
                include: {
                    mfaConfig: {
                        select: {
                            isEnabled: true
                        }
                    },
                    subscriptions: {
                        where: {
                            status: {
                                in: [
                                    'active',
                                    'trialing'
                                ]
                            }
                        },
                        select: {
                            plan: true,
                            status: true
                        },
                        orderBy: {
                            createdAt: 'desc'
                        },
                        take: 1
                    }
                }
            });
            // SECURITY: deactivated/deleted accounts must never authenticate,
            // even with a still-valid (≤15 min) access token.
            if (user && user.isActive && !user.deletedAt) {
                return await mapUserToAuthUser(user);
            }
            return null;
        };
        if (bearerToken) {
            const user = await resolveFromToken(bearerToken);
            if (user) return user;
        }
        if (accessTokenCookie) {
            const user = await resolveFromToken(accessTokenCookie);
            if (user) return user;
        }
        return null;
    } catch (error) {
        if (classifyAuthErrorCategory(error) === 'database') {
            throw new AuthError('Authentication service temporarily unavailable', 503);
        }
        return null;
    }
}
async function requireAuth(request) {
    const user = await getAuthUser(request);
    if (!user) {
        throw new AuthError('Authentication required', 401);
    }
    return user;
}
function hasRole(user, ...roles) {
    return roles.includes(user.role);
}
function isAdmin(user) {
    return [
        'super_admin',
        'owner',
        'admin'
    ].includes(user.role);
}
class AuthError extends Error {
    statusCode;
    constructor(message, statusCode = 401){
        super(message);
        this.name = 'AuthError';
        this.statusCode = statusCode;
    }
}
function getClientIp(request) {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    const realIp = request.headers.get('x-real-ip');
    if (realIp) return realIp;
    return 'unknown';
}
function getUserAgent(request) {
    return request.headers.get('user-agent') || 'unknown';
}
async function detectSuspiciousLogin(params) {
    // Get recent login history for this user (last 30 days)
    const recentLogins = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].loginHistory.findMany({
        where: {
            userId: params.userId,
            success: true,
            createdAt: {
                gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            }
        },
        orderBy: {
            createdAt: 'desc'
        },
        take: 10
    });
    // Check for new IP
    const knownIps = new Set(recentLogins.map((l)=>l.ip).filter(Boolean));
    const isNewIp = !knownIps.has(params.ip) && knownIps.size > 0;
    // Check for new device (user agent)
    const knownUserAgents = new Set(recentLogins.map((l)=>l.userAgent).filter(Boolean));
    const isNewDevice = !knownUserAgents.has(params.userAgent) && knownUserAgents.size > 0;
    return isNewIp || isNewDevice;
}
async function sendSecurityAlert(params) {
    // In production, send an email to the user
    // Mask PII (email) in server logs; IP retained for security forensics only.
    const maskedEmail = params.email.length > 3 ? `${params.email.slice(0, 2)}***${params.email.slice(params.email.indexOf('@') > 0 ? params.email.indexOf('@') : 2)}` : '***';
    console.log(`[SECURITY ALERT] ${params.event} for ${maskedEmail} from IP ${params.ip}`);
    // Send security alert email (non-blocking)
    try {
        const { sendSecurityAlertEmail, isEmailServiceConfigured } = await __turbopack_context__.A("[project]/src/lib/email.ts [app-route] (ecmascript, async loader)");
        if (isEmailServiceConfigured()) {
            await sendSecurityAlertEmail(params.email, params.name, params.event, params.ip, params.userAgent);
        }
    } catch  {
    // Never block the main flow
    }
    await logAuthEvent({
        userId: params.userId,
        action: 'suspicious_login',
        details: `${params.event} from IP ${params.ip}`,
        ipAddress: params.ip,
        userAgent: params.userAgent
    });
}
function classifyAuthErrorCategory(error) {
    if (error instanceof Error) {
        const msg = error.message || '';
        if (/P1\d{3}|P2\d{3}|prisma/i.test(msg) || /unable to open the database file|SQLITE_|database file|Can't reach database/i.test(msg)) {
            return 'database';
        }
        if (/body|json|unexpected token/i.test(msg)) {
            return 'validation';
        }
    }
    return 'unexpected';
}
;
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
"[project]/src/lib/security/rate-limiter.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "RATE_LIMITERS",
    ()=>RATE_LIMITERS,
    "addRateLimitHeaders",
    ()=>addRateLimitHeaders,
    "authRateKeySuffix",
    ()=>authRateKeySuffix,
    "checkRateLimit",
    ()=>checkRateLimit,
    "getRateLimitStatus",
    ()=>getRateLimitStatus,
    "refundRateLimit",
    ()=>refundRateLimit,
    "withRateLimit",
    ()=>withRateLimit
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Sliding Window Rate Limiter
// Phase 14.3: Security Hardening
//
// In-memory sliding window rate limiter with pre-configured limiters
// for different endpoint categories. Returns 429 with Retry-After
// header and standard rate limit headers.
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
;
// ===== RATE LIMITER STORE =====
const store = new Map();
// Clean up expired entries every 60 seconds
setInterval(()=>{
    const now = Date.now();
    for (const [key, entry] of store.entries()){
        // Remove timestamps outside the window
        entry.timestamps = entry.timestamps.filter((ts)=>now - ts < entry.windowMs);
        // Remove empty entries
        if (entry.timestamps.length === 0) {
            store.delete(key);
        }
    }
}, 60_000).unref?.();
// ===== CLIENT IP (trusted-proxy model of this app, unchanged) =====
function getClientIp(request) {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    const realIp = request.headers.get('x-real-ip');
    if (realIp) return realIp;
    return 'unknown';
}
function authRateKeySuffix(email) {
    if (!email || typeof email !== 'string') return '';
    const normalized = email.toLowerCase().trim();
    if (!normalized) return '';
    return ':em:' + Buffer.from(normalized).toString('base64url').slice(0, 32);
}
const RATE_LIMITERS = {
    api: {
        limit: 100,
        windowSeconds: 60,
        keyGenerator: (req)=>{
            // SECURITY NOTE: x-user-id header is only trustworthy when set by the
            // Next.js Edge middleware after JWT verification. Since there is no active
            // middleware.ts, we fall back to IP-based rate limiting for safety.
            // TODO: Once src/middleware.ts is restored, the x-user-id header will be
            // verified and this fallback can safely use it.
            return `ip:${getClientIp(req)}`;
        }
    },
    // LEGACY shared 'auth' bucket — retained ONLY for the routes that were
    // not part of the P9 split (signup, password flows, etc.). The four
    // high-collision flows (signin / OTP / magic-link / refresh) now use
    // their own dedicated buckets below so unrelated users behind one
    // preview gateway can no longer exhaust each other's quota.
    auth: {
        limit: 5,
        windowSeconds: 60,
        keyGenerator: (req)=>`ip:${getClientIp(req)}`
    },
    // ── P9 dedicated authentication buckets (Sep 2026) ─────────────────
    // Password sign-in: 10/min per IP+email (brute-force protection stays
    // via account lockout + login history).
    signin: {
        limit: 10,
        windowSeconds: 60,
        keyGenerator: (req)=>`ip:${getClientIp(req)}`
    },
    // OTP request: 5/min per IP+email — a second user behind the same
    // gateway is a DIFFERENT bucket.
    otp: {
        limit: 5,
        windowSeconds: 60,
        keyGenerator: (req)=>`ip:${getClientIp(req)}`
    },
    // OTP verify: 10/min per IP+email (brute force also bounded by
    // otpAttemptCount/lockout on the user record).
    otp_verify: {
        limit: 10,
        windowSeconds: 60,
        keyGenerator: (req)=>`ip:${getClientIp(req)}`
    },
    // Magic-link request: 5/min per IP+email.
    magic_link: {
        limit: 5,
        windowSeconds: 60,
        keyGenerator: (req)=>`ip:${getClientIp(req)}`
    },
    // Refresh: automatic client behavior — generous, IP-only, isolated so
    // login storms can never starve token refresh (and vice versa).
    refresh: {
        limit: 30,
        windowSeconds: 60,
        keyGenerator: (req)=>`ip:${getClientIp(req)}`
    },
    // Stricter MFA rate limiter — 3 attempts per minute per IP
    mfa: {
        limit: 3,
        windowSeconds: 60,
        keyGenerator: (req)=>`ip:${getClientIp(req)}`
    },
    ai: {
        limit: 20,
        windowSeconds: 60,
        keyGenerator: (req)=>{
            // IP-based rate limiting only — see SECURITY NOTE in 'api' limiter.
            return `ip:${getClientIp(req)}`;
        }
    },
    webhook: {
        limit: 1000,
        windowSeconds: 60,
        keyGenerator: (req)=>`ip:${getClientIp(req)}`
    },
    upload: {
        limit: 10,
        windowSeconds: 60,
        keyGenerator: (req)=>{
            // IP-based rate limiting only — see SECURITY NOTE in 'api' limiter.
            return `ip:${getClientIp(req)}`;
        }
    },
    export: {
        limit: 5,
        windowSeconds: 60,
        keyGenerator: (req)=>{
            // IP-based rate limiting only — see SECURITY NOTE in 'api' limiter.
            return `ip:${getClientIp(req)}`;
        }
    },
    // Per-API-key burst limiter — 100 requests per minute burst
    api_key_burst: {
        limit: 100,
        windowSeconds: 60,
        keyGenerator: (req)=>{
            const authHeader = req.headers.get('authorization') || '';
            if (authHeader.startsWith('Bearer aq_')) {
                // Use a hash of the key as the rate limit key
                // (we don't have the full key here, just use prefix)
                // Hash the FULL key — the old 12-char prefix bucketed distinct keys together
                return `apikey:${Buffer.from(authHeader.slice(7)).toString('base64url').slice(0, 32)}`;
            }
            return `ip:${getClientIp(req)}`;
        }
    }
};
function checkRateLimit(key, config) {
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;
    const limit = config.limit;
    // Get or create entry
    let entry = store.get(key);
    if (!entry) {
        entry = {
            timestamps: [],
            limit,
            windowMs
        };
        store.set(key, entry);
    }
    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter((ts)=>now - ts < windowMs);
    const currentCount = entry.timestamps.length;
    const remaining = Math.max(0, limit - currentCount);
    if (currentCount >= limit) {
        // Find when the oldest request in the window will expire
        const oldestInWindow = entry.timestamps[0];
        const resetAt = Math.ceil((oldestInWindow + windowMs) / 1000);
        const retryAfter = Math.ceil((oldestInWindow + windowMs - now) / 1000);
        return {
            allowed: false,
            limit,
            remaining: 0,
            resetAt,
            retryAfter: Math.max(1, retryAfter)
        };
    }
    // Add current timestamp
    entry.timestamps.push(now);
    // Calculate reset time based on the newest entry in the window
    const newestInWindow = entry.timestamps[entry.timestamps.length - 1];
    const resetAt = Math.ceil((newestInWindow + windowMs) / 1000);
    return {
        allowed: true,
        limit,
        remaining: remaining - 1,
        resetAt
    };
}
function withRateLimit(request, limiterName, opts) {
    const config = RATE_LIMITERS[limiterName];
    if (!config) {
        console.warn(`Unknown rate limiter: ${limiterName}`);
        return null;
    }
    const key = (config.keyGenerator ? config.keyGenerator(request) : `ip:${getClientIp(request)}`) + (opts?.keySuffix || '');
    const prefix = `rl:${limiterName}:`;
    const result = checkRateLimit(prefix + key, config);
    // Set rate limit headers
    const headers = {
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.resetAt)
    };
    if (!result.allowed) {
        headers['Retry-After'] = String(result.retryAfter || 60);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Too many requests',
            message: `Rate limit exceeded. Try again in ${result.retryAfter || 60} seconds.`,
            retryAfter: result.retryAfter
        }, {
            status: 429,
            headers
        });
    }
    return null; // Request is allowed
}
function refundRateLimit(request, limiterName, opts) {
    const config = RATE_LIMITERS[limiterName];
    if (!config) return;
    const key = (config.keyGenerator ? config.keyGenerator(request) : `ip:${getClientIp(request)}`) + (opts?.keySuffix || '');
    const entry = store.get(`rl:${limiterName}:${key}`);
    if (!entry || entry.timestamps.length === 0) return;
    entry.timestamps.pop(); // drop the most recent (this request's) slot
    if (entry.timestamps.length === 0) store.delete(`rl:${limiterName}:${key}`);
}
function addRateLimitHeaders(response, result) {
    response.headers.set('X-RateLimit-Limit', String(result.limit));
    response.headers.set('X-RateLimit-Remaining', String(result.remaining));
    response.headers.set('X-RateLimit-Reset', String(result.resetAt));
    return response;
}
function getRateLimitStatus(limiterName, key) {
    const config = RATE_LIMITERS[limiterName];
    if (!config) return null;
    const prefix = `rl:${limiterName}:`;
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;
    const entry = store.get(prefix + key);
    if (!entry) {
        return {
            allowed: true,
            limit: config.limit,
            remaining: config.limit,
            resetAt: Math.ceil((now + windowMs) / 1000)
        };
    }
    const currentCount = entry.timestamps.filter((ts)=>now - ts < windowMs).length;
    const remaining = Math.max(0, config.limit - currentCount);
    return {
        allowed: currentCount < config.limit,
        limit: config.limit,
        remaining,
        resetAt: Math.ceil((now + windowMs) / 1000)
    };
}
}),
"[project]/src/app/api/auth/refresh/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([
    "POST",
    ()=>POST
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/auth.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$security$2f$rate$2d$limiter$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/security/rate-limiter.ts [app-route] (ecmascript)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__
]);
[__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
;
;
;
async function POST(request) {
    // Dedicated limiter bucket (P9): refresh is automatic client behavior —
    // it no longer shares the 5/min 'auth' bucket with OTP/magic-link/signin
    // and cannot be starved by them (or starve them).
    const rateLimitResult = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$security$2f$rate$2d$limiter$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["withRateLimit"])(request, 'refresh');
    if (rateLimitResult) return rateLimitResult;
    // ── Extract refresh token from cookie ───────────────────────────
    const refreshToken = request.cookies.get('refresh_token')?.value;
    if (!refreshToken) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'No refresh token provided',
            code: 'NO_TOKEN'
        }, {
            status: 401
        });
    }
    // ── Verify JWT ──────────────────────────────────────────────────
    const payload = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["verifyToken"])(refreshToken);
    if (!payload || payload.type !== 'refresh') {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Invalid refresh token',
            code: 'INVALID_TOKEN'
        }, {
            status: 401
        });
    }
    // ── Resolve session state (DB errors → 503, never 401) ──────────
    let sessionState;
    try {
        sessionState = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getSessionState"])(refreshToken);
    } catch (error) {
        // E. infrastructure failure — the client must NOT log the user out
        console.error(`[Auth Refresh] 503 category=${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["classifyAuthErrorCategory"])(error)}`, error instanceof Error ? error.message : error);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Session service temporarily unavailable. Your session is preserved.',
            code: 'INFRASTRUCTURE_ERROR'
        }, {
            status: 503
        });
    }
    // ── B/C/D. authoritative session-invalid states → 401 (real logout) ──
    if (sessionState.state !== 'valid' || !sessionState.session) {
        const codeMap = {
            expired: 'SESSION_EXPIRED',
            idle_expired: 'SESSION_IDLE_EXPIRED',
            revoked: 'SESSION_REVOKED',
            missing: 'SESSION_EXPIRED'
        };
        // Best-effort revoke for expired/idle sessions (cleanup, non-fatal)
        if (sessionState.state === 'expired' || sessionState.state === 'idle_expired') {
            try {
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["revokeSession"])(refreshToken);
            } catch  {}
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: sessionState.state === 'revoked' ? 'Session has been revoked' : sessionState.state === 'idle_expired' ? 'Session expired after 48 hours of inactivity' : 'Session has expired',
            code: codeMap[sessionState.state] || 'SESSION_EXPIRED'
        }, {
            status: 401
        });
    }
    const session = sessionState.session;
    // ── Find user ───────────────────────────────────────────────────
    let user = null;
    try {
        user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].user.findUnique({
            where: {
                id: payload.sub
            },
            include: {
                mfaConfig: {
                    select: {
                        isEnabled: true
                    }
                }
            }
        });
    } catch (error) {
        console.error(`[Auth Refresh] 503 category=${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["classifyAuthErrorCategory"])(error)}`, error instanceof Error ? error.message : error);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Session service temporarily unavailable. Your session is preserved.',
            code: 'INFRASTRUCTURE_ERROR'
        }, {
            status: 503
        });
    }
    if (!user || !user.isActive) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'User not found or deactivated',
            code: 'USER_UNAVAILABLE'
        }, {
            status: 401
        });
    }
    try {
        // ── P6 activity tracking: this refresh IS authenticated activity ──
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["touchSessionActivity"])(session.id);
        // ── Revoke old session (token rotation) ──────────────────────
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["revokeSession"])(refreshToken);
        // ── Generate new token pair ──────────────────────────────────
        const newAccessToken = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["generateAccessToken"])({
            id: user.id,
            email: user.email,
            role: user.role,
            plan: user.plan,
            orgId: user.orgId,
            isTrial: user.isTrial,
            trialEndsAt: user.trialEndsAt
        });
        const newRefreshToken = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["generateRefreshToken"])({
            id: user.id,
            email: user.email,
            role: user.role,
            plan: user.plan,
            orgId: user.orgId,
            isTrial: user.isTrial,
            trialEndsAt: user.trialEndsAt
        });
        // ── Create new session (preserving the session's rememberMe mode) ──
        const ip = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getClientIp"])(request);
        const ua = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getUserAgent"])(request);
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createSession"])({
            userId: user.id,
            refreshToken: newRefreshToken,
            deviceInfo: ua.substring(0, 255),
            ipAddress: ip,
            userAgent: ua,
            rememberMe: session.rememberMe
        });
        // ── Audit log ────────────────────────────────────────────────
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logAuthEvent"])({
            userId: user.id,
            action: 'refresh_token_rotated',
            details: 'Refresh token rotated successfully',
            ipAddress: ip,
            userAgent: ua
        });
        // ── Build response ───────────────────────────────────────────
        const response = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            message: 'Token refreshed successfully',
            code: 'OK',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                plan: user.plan || 'free',
                orgId: user.orgId,
                emailVerified: user.emailVerified,
                mfaEnabled: user.mfaConfig?.isEnabled ?? false,
                avatarUrl: user.avatar
            }
        });
        // persist=false only when the session is a non-remembered browser
        // session — remembered sessions keep the 30-day persistent cookie.
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["setAuthCookies"])(response, newAccessToken, newRefreshToken, {
            persist: session.rememberMe
        });
    } catch (error) {
        // Rotation/write failures are infrastructure errors → 503 (no logout).
        console.error(`[Auth Refresh] 503 category=${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["classifyAuthErrorCategory"])(error)}`, error instanceof Error ? error.message : error);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Session service temporarily unavailable. Your session is preserved.',
            code: 'INFRASTRUCTURE_ERROR'
        }, {
            status: 503
        });
    }
}
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__9ded4865._.js.map