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
"[project]/src/app/api/auth/config/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
;
async function GET() {
    // Honest runtime capability check (safe booleans only — no secret values).
    const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    // Legacy field name kept for existing consumers — now carries the HONEST
    // value instead of a permanent true.
    const googleAvailable = googleConfigured;
    // Lazy-load email config check — MUST NOT throw.
    // If the import fails (e.g. nodemailer not available on FC), we default
    // to emailConfigured=false rather than crashing the entire endpoint.
    let emailConfigured = false;
    try {
        const emailMod = await __turbopack_context__.A("[project]/src/lib/email.ts [app-route] (ecmascript, async loader)");
        emailConfigured = !!emailMod.isEmailServiceConfigured?.();
    } catch (err) {
        console.warn('[Auth Config] Failed to check email config (non-fatal):', err instanceof Error ? err.message : err);
    }
    // Log presence (not values) for debugging — helps confirm which env vars
    // the runtime actually received. Also lazy-loaded to prevent crash.
    try {
        const etherealMod = await __turbopack_context__.A("[project]/src/lib/email-ethereal.ts [app-route] (ecmascript, async loader)");
        const clientId = etherealMod.getGoogleClientId?.();
        const clientSecret = etherealMod.getGoogleClientSecret?.();
        console.warn(`[AUTH-CONFIG] GOOGLE_CLIENT_ID set: ${!!clientId}, GOOGLE_CLIENT_SECRET set: ${!!clientSecret}, ` + `emailConfigured: ${emailConfigured}, ` + `SMTP_HOST: ${process.env.SMTP_HOST || 'MISSING'}, SMTP_USER: ${process.env.SMTP_USER || 'MISSING'}, ` + `SMTP_PASSWORD: ${process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD ? 'SET' : 'MISSING'}, ` + `APP_URL: ${process.env.APP_URL || ("TURBOPACK compile-time value", "http://localhost:3000") || 'MISSING'}`);
    } catch (err) {
        // Logging failed — non-fatal. The response is still correct.
        console.warn('[Auth Config] Failed to log credential status (non-fatal):', err instanceof Error ? err.message : err);
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        googleAvailable,
        googleConfigured,
        emailConfigured
    });
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__d242b66c._.js.map