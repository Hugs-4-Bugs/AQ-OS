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
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[project]/src/lib/email-ethereal.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Email & Auth Credential Helpers
 *
 * ALL Ethereal / preview-email code has been REMOVED.
 * The email service now ONLY uses real providers:
 *   1. Resend (if a real API key is configured)
 *   2. Nodemailer SMTP (Gmail SMTP via SMTP_USER / SMTP_PASSWORD)
 *
 * If neither is configured, sendEmail() throws a clear error.
 * There is ZERO fallback to any preview / test inbox.
 *
 * Env vars (read from Secrets panel):
 *   SMTP_HOST       = smtp.gmail.com
 *   SMTP_PORT       = 587
 *   SMTP_USER       = <real Gmail address>
 *   SMTP_PASSWORD   = <16-char Gmail App Password>
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 */ /**
 * Check whether REAL Resend is configured (non-placeholder API key).
 */ __turbopack_context__.s([
    "getGoogleClientId",
    ()=>getGoogleClientId,
    "getGoogleClientSecret",
    ()=>getGoogleClientSecret,
    "getSmtpFrom",
    ()=>getSmtpFrom,
    "getSmtpHost",
    ()=>getSmtpHost,
    "getSmtpPassword",
    ()=>getSmtpPassword,
    "getSmtpPort",
    ()=>getSmtpPort,
    "getSmtpUser",
    ()=>getSmtpUser,
    "isEmailProviderAvailable",
    ()=>isEmailProviderAvailable,
    "isEtherealMode",
    ()=>isEtherealMode,
    "isRealGoogleConfigured",
    ()=>isRealGoogleConfigured,
    "isRealResendConfigured",
    ()=>isRealResendConfigured,
    "isRealSmtpConfigured",
    ()=>isRealSmtpConfigured,
    "logSmtpEnvAliases",
    ()=>logSmtpEnvAliases
]);
function isRealResendConfigured() {
    const key = process.env.RESEND_API_KEY;
    return !!key && !key.startsWith('re_your-');
}
function getSmtpUser() {
    return process.env.SMTP_USER || process.env.SMTP_USERNAME || process.env.GMAIL_USER || process.env.EMAIL_USER || process.env.EMAIL_USERNAME || process.env.MAIL_USER || process.env.MAIL_USERNAME;
}
function getSmtpPassword() {
    return process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.SMTP_AUTH_PASSWORD || process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD || process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS || process.env.MAIL_PASSWORD || process.env.MAIL_PASS;
}
function logSmtpEnvAliases() {
    const userAliases = [
        'SMTP_USER',
        'SMTP_USERNAME',
        'GMAIL_USER',
        'EMAIL_USER',
        'EMAIL_USERNAME',
        'MAIL_USER',
        'MAIL_USERNAME'
    ];
    const passAliases = [
        'SMTP_PASSWORD',
        'SMTP_PASS',
        'SMTP_AUTH_PASSWORD',
        'GMAIL_APP_PASSWORD',
        'GMAIL_PASSWORD',
        'EMAIL_PASSWORD',
        'EMAIL_PASS',
        'MAIL_PASSWORD',
        'MAIL_PASS'
    ];
    const hostAliases = [
        'SMTP_HOST',
        'MAIL_HOST',
        'EMAIL_HOST'
    ];
    const portAliases = [
        'SMTP_PORT',
        'MAIL_PORT',
        'EMAIL_PORT'
    ];
    const fromAliases = [
        'SMTP_FROM',
        'EMAIL_FROM',
        'MAIL_FROM',
        'MAIL_FROM_ADDRESS'
    ];
    const summarize = (keys)=>keys.map((k)=>`${k}=${process.env[k] ? 'SET' : 'MISSING'}`).join(', ');
    console.log('[SMTP-Env-Diag] user    : ' + summarize(userAliases));
    console.log('[SMTP-Env-Diag] pass    : ' + summarize(passAliases));
    console.log('[SMTP-Env-Diag] host    : ' + summarize(hostAliases));
    console.log('[SMTP-Env-Diag] port    : ' + summarize(portAliases));
    console.log('[SMTP-Env-Diag] from    : ' + summarize(fromAliases));
    console.log('[SMTP-Env-Diag] resend  : RESEND_API_KEY=' + (process.env.RESEND_API_KEY ? 'SET' : 'MISSING'));
    console.log('[SMTP-Env-Diag] resolved: user=' + (getSmtpUser() ? 'SET' : 'MISSING') + ', pass=' + (getSmtpPassword() ? 'SET' : 'MISSING') + ', configured=' + (isRealSmtpConfigured() ? 'YES' : 'NO'));
}
/**
 * Detect placeholder credential values (e.g. "your-email@gmail.com",
 * "your-app-password", "placeholder", empty string).
 *
 * NOTE: We do NOT reject passwords starting with "test-" or "test_" because
 * real Gmail App Passwords are random lowercase letters and could theoretically
 * start with those characters. If the password is wrong, SMTP will return a
 * 535 auth error which is surfaced to the user as a clear delivery failure.
 */ function isPlaceholderValue(value) {
    if (!value) return true;
    if (value.startsWith('your-')) return true;
    if (value === 'placeholder') return true;
    if (value === 'test') return true;
    if (value.includes('example')) return true;
    if (value === 'password') return true;
    return false;
}
function getSmtpHost() {
    return process.env.SMTP_HOST || process.env.MAIL_HOST || process.env.EMAIL_HOST;
}
function getSmtpPort() {
    const raw = process.env.SMTP_PORT || process.env.MAIL_PORT || process.env.EMAIL_PORT;
    return Number(raw) || 587;
}
function getSmtpFrom() {
    return process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.MAIL_FROM || process.env.MAIL_FROM_ADDRESS || process.env.FROM_EMAIL;
}
function isRealSmtpConfigured() {
    const host = getSmtpHost();
    const port = getSmtpPort();
    const user = getSmtpUser();
    const pass = getSmtpPassword();
    return !!(host && port && user && !isPlaceholderValue(user) && pass && !isPlaceholderValue(pass));
}
function getGoogleClientId() {
    return process.env.GOOGLE_CLIENT_ID;
}
function getGoogleClientSecret() {
    return process.env.GOOGLE_CLIENT_SECRET;
}
function isRealGoogleConfigured() {
    const clientId = getGoogleClientId();
    const clientSecret = getGoogleClientSecret();
    if (!clientId || !clientSecret) return false;
    if (isPlaceholderValue(clientId)) return false;
    if (isPlaceholderValue(clientSecret)) return false;
    if (!clientId.includes('.apps.googleusercontent.com')) return false;
    return true;
}
// Backward-compatible aliases
const hasRealResend = isRealResendConfigured;
const hasRealSmtp = isRealSmtpConfigured;
function isEtherealMode() {
    return false;
}
function isEmailProviderAvailable() {
    return hasRealResend() || hasRealSmtp();
}
}),
"[project]/src/lib/dev-auth.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Development Authentication Delivery Guard
 *
 * When the server has NO real email provider (SMTP_USER/SMTP_PASSWORD or
 * RESEND_API_KEY) and NO real Google OAuth credentials (GOOGLE_CLIENT_ID),
 * every email-based auth flow (OTP login, magic link, forgot password,
 * email verification) and the Google sign-in button would be completely
 * unusable — the user sees "Email delivery is not configured" or
 * "Google sign-in could not start" with no way forward.
 *
 * This module gates a DEV-ONLY convenience: when enabled, auth routes
 * include the generated code / link directly in the API response
 * (`devDelivery` field) so the requesting user's own browser can display
 * it and continue the flow. The code is NEVER delivered to any external
 * mailbox or third party — it only travels back to the same client that
 * made the request.
 *
 * In a production build (NODE_ENV === 'production') this is ALWAYS
 * disabled, so real deployments behave exactly as before. It can also be
 * force-disabled in a dev environment by setting AUTH_DEV_MODE=false.
 */ __turbopack_context__.s([
    "devMagicLinkDelivery",
    ()=>devMagicLinkDelivery,
    "devOtpDelivery",
    ()=>devOtpDelivery,
    "isDevAuthDeliveryEnabled",
    ()=>isDevAuthDeliveryEnabled
]);
function isDevAuthDeliveryEnabled() {
    return ("TURBOPACK compile-time value", "development") !== 'production' && process.env.AUTH_DEV_MODE !== 'false';
}
function devOtpDelivery(code, what) {
    if (!isDevAuthDeliveryEnabled()) return undefined;
    return {
        type: 'otp',
        code,
        note: `Email delivery is not configured on this server, so the ${what} could not be emailed. Development mode: your ${what} was generated locally and is shown below so you can continue testing.`
    };
}
function devMagicLinkDelivery(url) {
    if (!isDevAuthDeliveryEnabled()) return undefined;
    return {
        type: 'magic-link',
        url,
        note: 'Email delivery is not configured on this server, so the sign-in link could not be emailed. Development mode: your sign-in link was generated locally and can be opened below.'
    };
}
}),
"[project]/src/app/api/auth/google/state/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/crypto [external] (crypto, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/email-ethereal.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$dev$2d$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/dev-auth.ts [app-route] (ecmascript)");
;
;
;
;
async function GET(request) {
    try {
        // Credentials are validated at token exchange time in the callback route.
        const clientId = process.env.GOOGLE_CLIENT_ID;
        // DEV-ONLY: when no real Google OAuth credentials exist (sandbox/preview),
        // route the button to an in-app simulated consent page instead of failing
        // with 503 ("Google sign-in could not start"). The callback route only
        // accepts the simulated profile when dev mode is active AND
        // GOOGLE_CLIENT_ID is still absent — with real credentials configured,
        // the normal OAuth flow runs exactly as before.
        const devMode = !clientId && (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$dev$2d$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["isDevAuthDeliveryEnabled"])();
        if (!clientId && !devMode) {
            console.error('[Google OAuth State] GOOGLE_CLIENT_ID is not set');
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'Google OAuth is not configured'
            }, {
                status: 503
            });
        }
        const clientSecret = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$email$2d$ethereal$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getGoogleClientSecret"])();
        // ── Dynamic domain detection ─────────────────────────────────
        // Read the domain from the incoming request so the SAME redirect_uri
        // works whether the user is on the preview workspace URL or the
        // production URL. We prefer, in order:
        //   1. The `origin` query param (explicit, from frontend)
        //   2. x-forwarded-host + x-forwarded-proto (proxy headers)
        //   3. host header
        //   4. The Origin / Referer request header (browser-supplied)
        // Whatever domain the request comes from, that same domain is used
        // for the Google OAuth redirect_uri — so the callback returns to the
        // same deployment the user is actually using.
        const isInternalHost = (host)=>{
            const h = host.toLowerCase();
            return !h || h === 'localhost' || h === '0.0.0.0' || h.startsWith('127.') || h.startsWith('10.') || h.startsWith('192.168.') || h.startsWith('172.') || h.includes('.fcapp.run') || h.includes('.aliyuncs.com') || h.includes('.functioncompute.com');
        };
        const resolvePublicOrigin = ()=>{
            // 1. Explicit `?origin=` query param (frontend passes window.location.origin)
            const queryOrigin = request.nextUrl.searchParams.get('origin');
            if (queryOrigin) {
                try {
                    const u = new URL(queryOrigin);
                    if (!isInternalHost(u.hostname)) return u.origin;
                } catch  {}
            }
            // 2. x-forwarded-host (set by Caddy / proxy gateways)
            const fwdHost = request.headers.get('x-forwarded-host');
            const fwdProto = request.headers.get('x-forwarded-proto') || 'https';
            if (fwdHost && !isInternalHost(fwdHost)) {
                return `${fwdProto}://${fwdHost}`;
            }
            // 3. host header
            const hostHeader = request.headers.get('host');
            if (hostHeader && !isInternalHost(hostHeader)) {
                return `https://${hostHeader}`;
            }
            // 4. Origin header (browser-supplied, survives gateways)
            const originHeader = request.headers.get('origin');
            if (originHeader) {
                try {
                    const u = new URL(originHeader);
                    if (!isInternalHost(u.hostname)) return u.origin;
                } catch  {}
            }
            // 5. Referer header
            const referer = request.headers.get('referer');
            if (referer) {
                try {
                    const u = new URL(referer);
                    if (!isInternalHost(u.hostname)) return u.origin;
                } catch  {}
            }
            // 6. Last resort — the active preview workspace deployment.
            //    NEVER fall back to APP_URL here: APP_URL points at the
            //    canonical production domain, and if that deployment is down
            //    the user's Google callback would land on a dead origin.
            return 'https://preview-chat-ab88c1b0-d6fd-4199-b9d5-ec3a018502fc.space-z.ai';
        };
        // Both redirect_uri and origin come from the SAME resolved public
        // origin — whatever domain the request actually came from. This keeps
        // the auth-URL / callback / final redirect all on one domain so the
        // browser session (cookies) stays intact end-to-end.
        const resolvedOrigin = resolvePublicOrigin();
        const redirectUri = `${resolvedOrigin}/api/auth/callback/google`;
        const origin = resolvedOrigin;
        // Encode the origin + redirect_uri into the state so the callback
        // route can reconstruct the EXACT same redirect_uri for token exchange.
        const statePayload = JSON.stringify({
            nonce: (0, __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["randomBytes"])(16).toString('base64url'),
            redirectUri,
            origin
        });
        const state = Buffer.from(statePayload).toString('base64url');
        // ── DEV-ONLY simulated consent flow ─────────────────────────
        // No real GOOGLE_CLIENT_ID on this server + dev mode active: point the
        // button at the in-app simulated Google consent page. It collects the
        // account email locally and redirects into the SAME callback route,
        // reusing the identical user-upsert / session / cookie logic.
        if (devMode) {
            const devAuthUrl = `${resolvedOrigin}/auth/dev/google-consent?state=${encodeURIComponent(state)}`;
            console.warn(`[Google OAuth State] DEV MODE: GOOGLE_CLIENT_ID missing — using in-app simulated consent page. origin=${resolvedOrigin}`);
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                authUrl: devAuthUrl,
                state,
                googleEnabled: true,
                devMode: true
            });
        }
        const scope = 'openid email profile';
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + `client_id=${clientId}` + `&redirect_uri=${encodeURIComponent(redirectUri)}` + `&response_type=code` + `&scope=${encodeURIComponent(scope)}` + `&state=${state}` + `&access_type=offline` + `&prompt=select_account consent`;
        console.warn(`[Google OAuth State] env vars: GOOGLE_CLIENT_ID=${clientId ? 'SET' : 'MISSING'}, GOOGLE_CLIENT_SECRET=${clientSecret ? 'SET' : 'MISSING'}`);
        console.warn(`[Google OAuth State] Generated auth URL. redirectUri=${redirectUri}, origin=${origin}`);
        console.warn(`[Google OAuth State] resolvedOrigin=${resolvedOrigin}, fwd-host=${request.headers.get('x-forwarded-host') || 'NONE'}, host=${request.headers.get('host') || 'NONE'}, origin-header=${request.headers.get('origin') || 'NONE'}`);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            authUrl,
            state,
            googleEnabled: true
        });
    } catch (error) {
        console.error('[Google OAuth State] Error generating state:', error);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Failed to generate OAuth state'
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__22c08418._.js.map