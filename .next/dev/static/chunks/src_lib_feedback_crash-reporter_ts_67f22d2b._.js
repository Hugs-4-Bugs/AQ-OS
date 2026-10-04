(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/lib/feedback/crash-reporter.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "initCrashReporter",
    ()=>initCrashReporter,
    "reportManualCrash",
    ()=>reportManualCrash,
    "setCrashReporterUser",
    ()=>setCrashReporterUser
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
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
        pageUrl: ("TURBOPACK compile-time truthy", 1) ? window.location.href : "TURBOPACK unreachable",
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
    if (("TURBOPACK compile-time value", "object") === 'undefined' || !window.localStorage) return;
    try {
        const existing = JSON.parse(localStorage.getItem(RETRY_KEY) || '[]');
        existing.push({
            payload,
            queuedAt: Date.now()
        });
        // Cap queue size
        const trimmed = existing.slice(-MAX_RETRY_QUEUE);
        localStorage.setItem(RETRY_KEY, JSON.stringify(trimmed));
    } catch  {
    // localStorage may be full — drop silently
    }
}
async function flushRetryQueue() {
    if (("TURBOPACK compile-time value", "object") === 'undefined' || !window.localStorage) return;
    let queue = [];
    try {
        queue = JSON.parse(localStorage.getItem(RETRY_KEY) || '[]');
        if (queue.length === 0) return;
        localStorage.removeItem(RETRY_KEY);
    } catch  {
        return;
    }
    for (const item of queue){
        // Don't respect cooldown when flushing old items
        const now = Date.now();
        if (now - item.queuedAt > 24 * 60 * 60 * 1000) continue; // skip items older than 24h
        try {
            const res = await fetch(CRASH_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(item.payload),
                keepalive: true
            });
            if (!res.ok) {
                // Re-queue on failure
                queueForRetry(item.payload);
                break; // stop flushing if backend is down
            }
        } catch  {
            queueForRetry(item.payload);
            break;
        }
    }
}
function initCrashReporter(userId) {
    if (initialized) {
        if (userId) currentUserId = userId;
        return;
    }
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    initialized = true;
    currentUserId = userId || null;
    try {
        // window.onerror
        window.onerror = function(message, source, line, col, error) {
            const msg = typeof message === 'string' ? message : 'Unknown error';
            // FIX: skip errors originating from browser extension frames so the
            // crash API only receives real application errors.
            if (isExtensionNoise({
                message: msg,
                source,
                stack: error?.stack || error?.message
            })) {
                return false;
            }
            reportCrash({
                message: msg,
                source: source || undefined,
                line: line || undefined,
                col: col || undefined,
                stack: error?.stack || error?.message
            });
            return false; // Let default handler also run
        };
        // unhandledrejection
        window.addEventListener('unhandledrejection', (event)=>{
            const reason = event.reason;
            const message = reason && typeof reason === 'object' && 'message' in reason ? String(reason.message) : String(reason || 'Unhandled rejection');
            const stack = reason && typeof reason === 'object' && 'stack' in reason ? String(reason.stack) : undefined;
            if (isExtensionNoise({
                message,
                stack
            })) return;
            reportCrash({
                message,
                stack
            });
        });
        // Flush any retry queue after a short delay
        setTimeout(()=>{
            flushRetryQueue().catch(()=>{
            /* ignore */ });
        }, 3000);
        // Attempt to flush on page hide
        window.addEventListener('pagehide', ()=>{
            flushRetryQueue().catch(()=>{
            /* ignore */ });
        });
        // eslint-disable-next-line no-console
        console.debug('[CrashReporter] Initialized');
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[CrashReporter] Init failed:', err);
    }
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_lib_feedback_crash-reporter_ts_67f22d2b._.js.map