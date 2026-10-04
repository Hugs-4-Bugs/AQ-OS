(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push(["chunks/_96088014._.js",
"[project]/ [instrumentation-edge] (unsupported edge import 'fs', ecmascript)", ((__turbopack_context__, module, exports) => {

__turbopack_context__.n(__import_unsupported(`fs`));
}),
"[project]/ [instrumentation-edge] (unsupported edge import 'path', ecmascript)", ((__turbopack_context__, module, exports) => {

__turbopack_context__.n(__import_unsupported(`path`));
}),
"[project]/src/instrumentation.ts [instrumentation-edge] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "register",
    ()=>register
]);
/**
 * AcquisitionOS — Next.js Instrumentation (ROOT STARTUP HOOK)
 *
 * ═══════════════════════════════════════════════════════════════════
 * CRITICAL — THIS IS THE FILE NEXT.JS ACTUALLY LOADS AT STARTUP.
 *
 * Next.js looks for `instrumentation.ts` at the project root OR
 * `src/instrumentation.ts` (when srcDir is enabled). It does NOT load
 * `src/app/instrumentation.ts` — that file is dead code.
 *
 * This file is responsible for:
 *   1. Loading .env files into process.env (FC standalone does NOT
 *      auto-load .env — without this, ALL env vars are missing on FC,
 *      breaking Google OAuth, magic link, DB, email, everything).
 *   2. Detecting and restoring .env corruption.
 *   3. Validating all auth-critical environment variables.
 *   4. Logging a clear auth-provider startup summary.
 *   5. Initializing Sentry (if configured).
 *
 * WHY THIS MATTERS:
 *   On Aliyun Function Compute (standalone mode), the .env file is NOT
 *   automatically loaded. Without explicit loading here, process.env
 *   is empty for server-side vars → GOOGLE_CLIENT_ID is missing →
 *   Google auth shows "unavailable" → magic link DB queries fail →
 *   everything breaks. This single file fixes ALL of those issues.
 * ═══════════════════════════════════════════════════════════════════
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$__$5b$instrumentation$2d$edge$5d$__$28$unsupported__edge__import__$27$fs$272c$__ecmascript$29$__ = __turbopack_context__.i("[project]/ [instrumentation-edge] (unsupported edge import 'fs', ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$__$5b$instrumentation$2d$edge$5d$__$28$unsupported__edge__import__$27$path$272c$__ecmascript$29$__ = __turbopack_context__.i("[project]/ [instrumentation-edge] (unsupported edge import 'path', ecmascript)");
;
;
// ---------------------------------------------------------------------------
// .env file parser
// ---------------------------------------------------------------------------
/**
 * Parse a .env file and return a map of key→value pairs.
 * Supports:
 *   - KEY=value
 *   - KEY="value with spaces"
 *   - KEY='value'
 *   - # comments
 *   - empty lines
 *   - export KEY=value
 */ function parseEnvFile(filePath) {
    const result = {};
    try {
        const content = __TURBOPACK__imported__module__$5b$project$5d2f$__$5b$instrumentation$2d$edge$5d$__$28$unsupported__edge__import__$27$fs$272c$__ecmascript$29$__["readFileSync"](filePath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines){
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            let kv = trimmed;
            if (kv.startsWith('export ')) kv = kv.slice(7).trim();
            const eqIndex = kv.indexOf('=');
            if (eqIndex === -1) continue;
            const key = kv.slice(0, eqIndex).trim();
            let value = kv.slice(eqIndex + 1).trim();
            if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
                value = value.slice(1, -1);
            }
            if (key) result[key] = value;
        }
    } catch  {
    // File doesn't exist or can't be read — return empty
    }
    return result;
}
// ---------------------------------------------------------------------------
// .env loader
// ---------------------------------------------------------------------------
/**
 * Load .env files into process.env if they're not already set.
 *
 * Precedence (highest first):
 *   1. Existing process.env values (FC console / Docker env vars)
 *   2. .env.local (local overrides)
 *   3. .env.production (production-specific)
 *   4. .env (defaults)
 *
 * We only set vars that are NOT already in process.env, so explicit
 * environment configuration always wins over .env files.
 *
 * CRITICAL: On FC standalone, this is the ONLY way server-side env vars
 * (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DATABASE_URL, SMTP_*, etc.)
 * get loaded. Without this, all auth fails.
 */ function loadEnvFiles() {
    const cwd = process.cwd();
    const candidates = [
        __TURBOPACK__imported__module__$5b$project$5d2f$__$5b$instrumentation$2d$edge$5d$__$28$unsupported__edge__import__$27$path$272c$__ecmascript$29$__["join"](cwd, '.env.local'),
        __TURBOPACK__imported__module__$5b$project$5d2f$__$5b$instrumentation$2d$edge$5d$__$28$unsupported__edge__import__$27$path$272c$__ecmascript$29$__["join"](cwd, '.env.production'),
        __TURBOPACK__imported__module__$5b$project$5d2f$__$5b$instrumentation$2d$edge$5d$__$28$unsupported__edge__import__$27$path$272c$__ecmascript$29$__["join"](cwd, '.env'),
        // Also check the standalone directory (for FC deployments where
        // the .env file is bundled alongside server.js)
        __TURBOPACK__imported__module__$5b$project$5d2f$__$5b$instrumentation$2d$edge$5d$__$28$unsupported__edge__import__$27$path$272c$__ecmascript$29$__["join"](("TURBOPACK compile-time value", "/ROOT/src"), '..', '.env.local'),
        __TURBOPACK__imported__module__$5b$project$5d2f$__$5b$instrumentation$2d$edge$5d$__$28$unsupported__edge__import__$27$path$272c$__ecmascript$29$__["join"](("TURBOPACK compile-time value", "/ROOT/src"), '..', '.env.production'),
        __TURBOPACK__imported__module__$5b$project$5d2f$__$5b$instrumentation$2d$edge$5d$__$28$unsupported__edge__import__$27$path$272c$__ecmascript$29$__["join"](("TURBOPACK compile-time value", "/ROOT/src"), '..', '.env')
    ];
    // Collect all env vars from .env files (later files don't override
    // earlier ones — we process in reverse precedence order)
    const merged = {};
    for (const file of [
        ...candidates
    ].reverse()){
        const parsed = parseEnvFile(file);
        for (const [k, v] of Object.entries(parsed)){
            merged[k] = v;
        }
    }
    // Set vars that aren't already in process.env
    let loadedCount = 0;
    const loadedKeys = [];
    for (const [key, value] of Object.entries(merged)){
        if (process.env[key] === undefined || process.env[key] === '') {
            process.env[key] = value;
            loadedCount++;
            loadedKeys.push(key);
        }
    }
    if (loadedCount > 0) {
        console.warn(`[instrumentation] Loaded ${loadedCount} env var(s) from .env files into process.env`);
        console.warn(`[instrumentation] Keys loaded: ${loadedKeys.join(', ')}`);
    } else {
        console.warn('[instrumentation] No new env vars loaded from .env files (all already set in process.env)');
    }
}
// ---------------------------------------------------------------------------
// Startup validation — logs (never throws) missing critical auth vars
// ---------------------------------------------------------------------------
function logStartupAuthStatus() {
    const required = [
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
        'AUTH_SECRET',
        'NEXTAUTH_SECRET',
        'DATABASE_URL',
        'JWT_SECRET'
    ];
    const smtpKeys = [
        'SMTP_HOST',
        'SMTP_PORT',
        'SMTP_USER',
        'SMTP_PASSWORD'
    ];
    console.warn('');
    console.warn('═══════════════════════════════════════════════════════');
    console.warn('  AcquisitionOS — Auth Provider Startup Check');
    console.warn('═══════════════════════════════════════════════════════');
    for (const key of required){
        if (!process.env[key]) {
            console.error(`  STARTUP ERROR: ${key} is NOT SET in environment`);
        } else {
            console.warn(`  STARTUP OK: ${key} is configured`);
        }
    }
    for (const key of smtpKeys){
        const val = process.env[key] || process.env[key.replace('SMTP_', 'GMAIL_')] || null;
        if (!val) {
            console.error(`  SMTP ERROR: ${key} is NOT SET (magic link emails will fail)`);
        } else {
            console.warn(`  SMTP OK: ${key} is configured`);
        }
    }
    // Google OAuth specific check
    const googleId = process.env.GOOGLE_CLIENT_ID;
    const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
    const googleConfigured = !!googleId && !!googleSecret && !googleId.startsWith('your-') && !googleSecret.startsWith('your-') && googleId.includes('.apps.googleusercontent.com');
    console.warn(`  Google OAuth : ${googleConfigured ? 'AVAILABLE' : 'UNAVAILABLE'}`);
    console.warn(`  App URL      : ${process.env.APP_PUBLIC_URL || ("TURBOPACK compile-time value", "http://localhost:3000") || process.env.APP_URL || 'NOT SET'}`);
    console.warn(`  Database     : ${process.env.DATABASE_URL ? 'CONFIGURED' : 'MISSING'}`);
    console.warn('═══════════════════════════════════════════════════════');
    console.warn('');
    if (!googleConfigured) {
        console.warn('WARNING: Google OAuth credentials not properly configured. Check FC Secrets panel for GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
    }
}
async function register() {
    // Only run on the server (not during edge build)
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
}
}),
"[project]/node_modules/next/dist/esm/build/templates/edge-wrapper.js { MODULE => \"[project]/src/instrumentation.ts [instrumentation-edge] (ecmascript)\" } [instrumentation-edge] (ecmascript)", ((__turbopack_context__, module, exports) => {

// The wrapped module could be an async module, we handle that with the proxy
// here. The comma expression makes sure we don't call the function with the
// module as the "this" arg.
// Turn exports into functions that are also a thenable. This way you can await the whole object
// or  exports (e.g. for Components) or call them directly as though they are async functions
// (e.g. edge functions/middleware, this is what the Edge Runtime does).
// Catch promise to prevent UnhandledPromiseRejectionWarning, this will be propagated through
// the awaited export(s) anyway.
self._ENTRIES ||= {};
const modProm = Promise.resolve().then(()=>__turbopack_context__.i("[project]/src/instrumentation.ts [instrumentation-edge] (ecmascript)"));
modProm.catch(()=>{});
self._ENTRIES["middleware_instrumentation"] = new Proxy(modProm, {
    get (innerModProm, name) {
        if (name === 'then') {
            return (res, rej)=>innerModProm.then(res, rej);
        }
        let result = (...args)=>innerModProm.then((mod)=>(0, mod[name])(...args));
        result.then = (res, rej)=>innerModProm.then((mod)=>mod[name]).then(res, rej);
        return result;
    }
}); //# sourceMappingURL=edge-wrapper.js.map
}),
]);

//# sourceMappingURL=_96088014._.js.map