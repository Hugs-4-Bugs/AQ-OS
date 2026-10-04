module.exports = [
"[project]/src/lib/email.ts [app-route] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "server/chunks/[root-of-the-server]__8c3bb1ed._.js",
  "server/chunks/src_lib_2a6d6370._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[project]/src/lib/email.ts [app-route] (ecmascript)");
    });
});
}),
"[project]/src/lib/email-ethereal.ts [app-route] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "server/chunks/src_lib_email-ethereal_ts_383950ac._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[project]/src/lib/email-ethereal.ts [app-route] (ecmascript)");
    });
});
}),
];