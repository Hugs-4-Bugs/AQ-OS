module.exports = [
"[project]/node_modules/resend/dist/index.mjs [app-route] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "server/chunks/node_modules_d5a81283._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[project]/node_modules/resend/dist/index.mjs [app-route] (ecmascript)");
    });
});
}),
"[externals]/nodemailer [external] (nodemailer, cjs, [project]/node_modules/nodemailer, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "server/chunks/[externals]_nodemailer_68491294._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[externals]/nodemailer [external] (nodemailer, cjs, [project]/node_modules/nodemailer)");
    });
});
}),
"[project]/node_modules/ioredis/built/index.js [app-route] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "server/chunks/node_modules_99bda915._.js",
  "server/chunks/[externals]__ca275661._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[project]/node_modules/ioredis/built/index.js [app-route] (ecmascript)");
    });
});
}),
"[project]/src/lib/email.ts [app-route] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.resolve().then(() => {
        return parentImport("[project]/src/lib/email.ts [app-route] (ecmascript)");
    });
});
}),
];