module.exports = [
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
];

//# sourceMappingURL=src_lib_logger_ts_9efe2aca._.js.map