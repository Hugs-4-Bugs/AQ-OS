(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/lib/observability/sentry.ts [app-client] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "static/chunks/src_lib_observability_sentry_ts_c092a9ef._.js",
  "static/chunks/src_lib_observability_sentry_ts_90111ebb._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[project]/src/lib/observability/sentry.ts [app-client] (ecmascript)");
    });
});
}),
"[project]/src/lib/feedback/auto-capture.ts [app-client] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.resolve().then(() => {
        return parentImport("[project]/src/lib/feedback/auto-capture.ts [app-client] (ecmascript)");
    });
});
}),
"[project]/src/lib/feedback/crash-reporter.ts [app-client] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "static/chunks/src_lib_feedback_crash-reporter_ts_67f22d2b._.js",
  "static/chunks/src_lib_feedback_crash-reporter_ts_90111ebb._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[project]/src/lib/feedback/crash-reporter.ts [app-client] (ecmascript)");
    });
});
}),
]);