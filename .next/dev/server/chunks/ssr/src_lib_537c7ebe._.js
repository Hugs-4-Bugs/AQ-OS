module.exports = [
"[project]/src/lib/observability/sentry.ts [app-ssr] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "server/chunks/ssr/src_lib_observability_sentry_ts_667534fa._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[project]/src/lib/observability/sentry.ts [app-ssr] (ecmascript)");
    });
});
}),
"[project]/src/lib/feedback/auto-capture.ts [app-ssr] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.resolve().then(() => {
        return parentImport("[project]/src/lib/feedback/auto-capture.ts [app-ssr] (ecmascript)");
    });
});
}),
"[project]/src/lib/feedback/crash-reporter.ts [app-ssr] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "server/chunks/ssr/src_lib_feedback_crash-reporter_ts_e18b8d3f._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[project]/src/lib/feedback/crash-reporter.ts [app-ssr] (ecmascript)");
    });
});
}),
];