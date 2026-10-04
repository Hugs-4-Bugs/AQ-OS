module.exports = [
"[project]/src/lib/feedback/crash-reporter.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "initCrashReporter",
    ()=>initCrashReporter,
    "reportManualCrash",
    ()=>reportManualCrash,
    "setCrashReporterUser",
    ()=>setCrashReporterUser
]);
'use client';
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Crash Reporter
// Captures uncaught errors and unhandled promise rejections, then
// reports them to the backend (fire-and-forget). Uses a 1-second
// cooldown and localStorage retry queue for failed reports.
//
// SECURITY: Stack traces are sanitized (absolute paths stripped).
// ═══════════════════════════════════════════════════════════════════
const CRASH_ENDPOINT = '/api/feedback/crash';
const COOLDOWN_MS = 1000;
const MAX_STACK_LENGTH = 2000;
const RETRY_KEY = '__aos_crash_retry';
const MAX_RETRY_QUEUE = 20;
let lastReportTime = 0;
let initialized = false;
let currentUserId = null;
// ─── Noise filtering (FIX: M_ID crash flood) ───────────────────────
// Browser extensions (Chrome/Edge/Firefox/Safari) inject scripts into the
// page and throw errors like "Cannot read properties of undefined (reading
// 'M_ID')" from chrome-extension:// frames. These are NOT app bugs, but
// window.onerror forwards everything, which flooded the CrashReport table
// (62 of 65 rows were extension errors) and polluted crash analytics.
const EXTENSION_SOURCE_PATTERN = /(chrome-extension|moz-extension|safari-extension|safari-web-extension|edge-extension|extensions::)/i;
const EXTENSION_URL_PATTERN = /^((chrome|moz|safari|edge|opera)-extension|chrome|about|res):/i;
function isExtensionNoise(input) {
    if (input.source && EXTENSION_SOURCE_PATTERN.test(input.source)) return true;
    const haystack = `${input.stack || ''}`;
    if (EXTENSION_SOURCE_PATTERN.test(haystack)) return true;
    // window.onerror passes the script URL as `source`; also catch bare
    // "chrome-extension:200.js" style sources without the full scheme.
    if (input.source && EXTENSION_URL_PATTERN.test(input.source)) return true;
    return false;
}
// ─── Stack sanitization ────────────────────────────────────────────
function sanitizeStackTrace(stack) {
    if (!stack) return '';
    let s = stack;
    // Truncate
    if (s.length > MAX_STACK_LENGTH) {
        s = s.slice(0, MAX_STACK_LENGTH) + '\n...[truncated]';
    }
    // Strip absolute file paths (keep relative). Handles both unix /abs/path and Windows C:\path
    s = s.replace(/\(?((?:file|https?):\/\/)?(?:\/|[A-Za-z]:\\)[^\s)]+\)?/g, (match)=>{
        // Keep only the basename portion if we can extract it
        const parts = match.split(/[/\\]/);
        const basename = parts[parts.length - 1].replace(/[)]$/, '');
        return basename || '[path]';
    });
    return s;
}
async function reportCrash(payload) {
    // Drop browser-extension noise — it is not an application bug.
    if (isExtensionNoise(payload)) {
        if ("TURBOPACK compile-time truthy", 1) {
            // eslint-disable-next-line no-console
            console.debug('[CrashReporter] Ignored extension error:', payload.message);
        }
        return;
    }
    // Cooldown check
    const now = Date.now();
    if (now - lastReportTime < COOLDOWN_MS) return;
    lastReportTime = now;
    const enrichedPayload = {
        ...payload,
        stack: sanitizeStackTrace(payload.stack),
        userId: currentUserId || undefined,
        pageUrl: ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined
    };
    try {
        const res = await fetch(CRASH_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(enrichedPayload),
            // fire-and-forget — keepalive lets the request finish even if page unloads
            keepalive: true
        });
        if (!res.ok) {
            queueForRetry(enrichedPayload);
        }
    } catch  {
        queueForRetry(enrichedPayload);
    }
}
function queueForRetry(payload) {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
}
async function flushRetryQueue() {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
    let queue;
    const item = undefined;
}
function initCrashReporter(userId) {
    if (initialized) {
        if (userId) currentUserId = userId;
        return;
    }
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
}
function setCrashReporterUser(userId) {
    currentUserId = userId;
}
function reportManualCrash(error, componentName) {
    const message = typeof error === 'string' ? error : error.message || 'Manual crash report';
    const stack = typeof error === 'string' ? undefined : error.stack;
    reportCrash({
        message,
        stack,
        componentName
    });
}
}),
];

//# sourceMappingURL=src_lib_feedback_crash-reporter_ts_e18b8d3f._.js.map