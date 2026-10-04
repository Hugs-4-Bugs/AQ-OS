module.exports = [
"[project]/src/lib/observability/sentry.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Sentry Integration
// Phase 14.2: Observability Infrastructure
//
// Provides captureException, captureMessage, user context enrichment,
// and breadcrumb management. Works as a no-op fallback when Sentry
// DSN is not configured.
// ═══════════════════════════════════════════════════════════════════
// ===== TYPES =====
__turbopack_context__.s([
    "addBreadcrumb",
    ()=>addBreadcrumb,
    "captureException",
    ()=>captureException,
    "captureMessage",
    ()=>captureMessage,
    "clearBreadcrumbs",
    ()=>clearBreadcrumbs,
    "getBreadcrumbs",
    ()=>getBreadcrumbs,
    "getSentryExtra",
    ()=>getSentryExtra,
    "getSentryTags",
    ()=>getSentryTags,
    "getSentryUser",
    ()=>getSentryUser,
    "initSentry",
    ()=>initSentry,
    "isSentryInitialized",
    ()=>isSentryInitialized,
    "setSentryExtra",
    ()=>setSentryExtra,
    "setSentryTag",
    ()=>setSentryTag,
    "setSentryUser",
    ()=>setSentryUser,
    "withSentryContext",
    ()=>withSentryContext
]);
// ===== SENTRY STATE =====
let sentryInitialized = false;
let breadcrumbs = [];
const MAX_BREADCRUMBS = 100;
let currentUser = null;
const noOpResult = {
    eventId: null
};
function initSentry() {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) {
        console.info('[Sentry] No NEXT_PUBLIC_SENTRY_DSN configured — Sentry is in no-op mode');
        sentryInitialized = false;
        return;
    }
    // In a full Sentry SDK integration, we would call Sentry.init() here.
    // Since we're implementing a lightweight integration that works without
    // the @sentry/nextjs package, we store the DSN and prepare the client.
    sentryInitialized = true;
    console.info('[Sentry] Initialized with DSN:', dsn.substring(0, 20) + '...');
    // Set default tags
    setSentryTag('environment', ("TURBOPACK compile-time value", "development") || 'development');
    setSentryTag('version', '2.0.0');
    setSentryTag('runtime', 'node');
}
function captureException(error, context) {
    if (!sentryInitialized) {
        // Still log the error for local development
        console.error('[Sentry] Exception (no-op):', error);
        if (context?.extra) {
            console.error('[Sentry] Extra context:', context.extra);
        }
        return noOpResult;
    }
    const eventId = generateEventId();
    // In production with @sentry/nextjs, this would call:
    // Sentry.captureException(error, { tags, extra, user, fingerprint });
    console.error(`[Sentry] Exception captured (event: ${eventId}):`, error);
    if (context?.tags) {
        console.error('[Sentry] Tags:', context.tags);
    }
    if (context?.extra) {
        console.error('[Sentry] Extra:', context.extra);
    }
    if (context?.user || currentUser) {
        console.error('[Sentry] User:', context?.user || currentUser);
    }
    return {
        eventId
    };
}
function captureMessage(message, level = 'info', context) {
    if (!sentryInitialized) {
        console.log(`[Sentry] Message (${level}, no-op):`, message);
        return noOpResult;
    }
    const eventId = generateEventId();
    // In production with @sentry/nextjs, this would call:
    // Sentry.captureMessage(message, level, { tags, extra, user });
    console.log(`[Sentry] Message captured (${level}, event: ${eventId}):`, message);
    return {
        eventId
    };
}
function setSentryUser(user) {
    currentUser = user;
    if (!sentryInitialized) return;
    // In production with @sentry/nextjs:
    // Sentry.setUser(user ? { id: user.id, email: user.email, username: user.username } : null);
    if (user) {
        console.info(`[Sentry] User context set: ${user.id} (${user.email})`);
    } else {
        console.info('[Sentry] User context cleared');
    }
}
function getSentryUser() {
    return currentUser;
}
function addBreadcrumb(breadcrumb) {
    const entry = {
        ...breadcrumb,
        timestamp: breadcrumb.timestamp || Date.now() / 1000,
        level: breadcrumb.level || 'info'
    };
    breadcrumbs.push(entry);
    // Keep only the most recent breadcrumbs
    if (breadcrumbs.length > MAX_BREADCRUMBS) {
        breadcrumbs = breadcrumbs.slice(-MAX_BREADCRUMBS);
    }
    if (sentryInitialized) {
    // In production with @sentry/nextjs:
    // Sentry.addBreadcrumb(entry);
    }
}
function getBreadcrumbs() {
    return [
        ...breadcrumbs
    ];
}
function clearBreadcrumbs() {
    breadcrumbs = [];
}
// ===== TAG MANAGEMENT =====
const tags = {};
function setSentryTag(key, value) {
    tags[key] = value;
    if (sentryInitialized) {
    // In production with @sentry/nextjs:
    // Sentry.setTag(key, value);
    }
}
function getSentryTags() {
    return {
        ...tags
    };
}
// ===== EXTRA CONTEXT =====
const extraContext = {};
function setSentryExtra(key, value) {
    extraContext[key] = value;
    if (sentryInitialized) {
    // In production with @sentry/nextjs:
    // Sentry.setExtra(key, value);
    }
}
function getSentryExtra() {
    return {
        ...extraContext
    };
}
// ===== HELPERS =====
function generateEventId() {
    const bytes = new Uint8Array(16);
    // Use crypto if available
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID().replace(/-/g, '');
    }
    // Fallback to timestamp + random
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}
function isSentryInitialized() {
    return sentryInitialized;
}
function withSentryContext(context, fn) {
    // Set context before running
    if (context.tags) {
        for (const [key, value] of Object.entries(context.tags)){
            setSentryTag(key, value);
        }
    }
    if (context.extra) {
        for (const [key, value] of Object.entries(context.extra)){
            setSentryExtra(key, value);
        }
    }
    if (context.user) {
        setSentryUser(context.user);
    }
    return fn().catch((error)=>{
        captureException(error, context);
        throw error;
    });
}
}),
];

//# sourceMappingURL=src_lib_observability_sentry_ts_390e216e._.js.map