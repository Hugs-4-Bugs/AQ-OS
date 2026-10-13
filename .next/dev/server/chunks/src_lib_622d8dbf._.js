module.exports = [
"[project]/src/lib/auth.ts [app-route] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "server/chunks/src_lib_email_ts_fc00ea3f._.js",
  "server/chunks/[root-of-the-server]__442fbafb._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[project]/src/lib/auth.ts [app-route] (ecmascript)");
    });
});
}),
"[project]/src/lib/db.ts [app-route] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "server/chunks/[root-of-the-server]__94d28299._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[project]/src/lib/db.ts [app-route] (ecmascript)");
    });
});
}),
];