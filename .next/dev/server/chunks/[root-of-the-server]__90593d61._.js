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
"[externals]/buffer [external] (buffer, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("buffer", () => require("buffer"));

module.exports = mod;
}),
"[externals]/stream [external] (stream, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("stream", () => require("stream"));

module.exports = mod;
}),
"[externals]/util [external] (util, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("util", () => require("util"));

module.exports = mod;
}),
"[project]/src/lib/oauth-relay.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createRelayToken",
    ()=>createRelayToken,
    "isSameOrigin",
    ()=>isSameOrigin,
    "relayHopGuardValue",
    ()=>relayHopGuardValue,
    "verifyRelayToken",
    ()=>verifyRelayToken
]);
/**
 * Cross-Domain OAuth Relay — Short-lived signed JWT tokens
 *
 * When the app is deployed across multiple domains (e.g., preview domain
 * and production domain), Google OAuth can only redirect to ONE registered
 * redirect_uri. After auth completes on that canonical domain, we need to
 * relay the session back to the domain the user originally came from.
 *
 * Flow:
 * 1. User on domain A clicks "Sign in with Google"
 * 2. OAuth redirects to Google → Google redirects to canonical redirect_uri (domain B)
 * 3. Domain B exchanges code for tokens, creates session
 * 4. Domain B signs a short-lived JWT containing the tokens + origin (domain A)
 * 5. Domain B redirects to domain A's /api/auth/google/relay?token=<jwt>
 * 6. Domain A verifies the JWT, extracts tokens, sets cookies, redirects to /
 *
 * Security:
 * - JWT is signed with JWT_SECRET (same across all instances)
 * - JWT expires in 60 seconds
 * - JWT includes a nonce to prevent replay (stored in DB-checked set)
 * - The redirect happens immediately, so the token URL is replaced in history
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jsonwebtoken$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jsonwebtoken/index.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/crypto [external] (crypto, cjs)");
;
;
const RELAY_SECRET = process.env.JWT_SECRET || process.env.RELAY_SECRET || 'acquisitionos-relay-dev-secret';
const RELAY_EXPIRY_SECONDS = 60;
function createRelayToken(accessToken, refreshToken, origin) {
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jsonwebtoken$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].sign({
        type: 'google_oauth_relay',
        accessToken,
        refreshToken,
        origin,
        nonce
    }, RELAY_SECRET, {
        expiresIn: RELAY_EXPIRY_SECONDS
    });
}
function verifyRelayToken(token) {
    try {
        const decoded = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jsonwebtoken$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].verify(token, RELAY_SECRET);
        if (decoded.type !== 'google_oauth_relay') {
            console.error('[Relay] Invalid token type:', decoded.type);
            return null;
        }
        if (!decoded.accessToken || !decoded.refreshToken) {
            console.error('[Relay] Token missing required fields');
            return null;
        }
        return {
            type: 'google_oauth_relay',
            accessToken: decoded.accessToken,
            refreshToken: decoded.refreshToken,
            origin: decoded.origin,
            nonce: decoded.nonce,
            iat: decoded.iat,
            exp: decoded.exp
        };
    } catch (err) {
        console.error('[Relay] Token verification failed:', err instanceof Error ? err.message : String(err));
        return null;
    }
}
function isSameOrigin(url1, url2) {
    try {
        const u1 = new URL(url1);
        const u2 = new URL(url2);
        return u1.origin === u2.origin;
    } catch  {
        return false;
    }
}
function relayHopGuardValue(nonce, expectedOrigin) {
    return __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["default"].createHmac('sha256', RELAY_SECRET).update(`${nonce}|${expectedOrigin.replace(/\/+$/, '')}`).digest('hex');
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
"[project]/src/app/api/auth/callback/google/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "POST",
    ()=>POST,
    "dynamic",
    ()=>dynamic,
    "runtime",
    ()=>runtime
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Google OAuth Callback Route (/api/auth/callback/google)
//
// BULLETPROOF DESIGN:
//   - ALL heavy modules (db, auth) loaded LAZILY via dynamic import inside
//     the handler. If a module fails to load, we catch it and redirect —
//     NEVER a bare 500 "Internal Server Error".
//   - EVERY operation wrapped in its own try-catch:
//       A. State parameter decoding
//       B. Token exchange with Google
//       C. redirect_uri construction
//       D. User profile fetch from Google
//       E. Database find/create user
//       F. Session creation
//   - Dynamic origin detection from request.url (with fallback for FC
//     internal hostnames).
//   - Every step logged with console.log for visibility.
//   - On ANY error: redirect to /?auth_error=description
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/crypto [external] (crypto, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$oauth$2d$relay$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/oauth-relay.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$dev$2d$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/dev-auth.ts [app-route] (ecmascript)");
;
;
;
;
const dynamic = 'force-dynamic';
const runtime = 'nodejs';
// ───────────────────────────────────────────────────────────────────
// Validate that an origin is a public host (not localhost / internal
// cloud hostname). Used to decide whether to relay the session back to
// the user's original domain after cross-domain Google OAuth.
// ───────────────────────────────────────────────────────────────────
function isPublicOrigin(origin) {
    try {
        const u = new URL(origin);
        const h = u.hostname.toLowerCase();
        if (!h || h === 'localhost' || h.startsWith('0.0.0.0') || h.startsWith('127.') || h.startsWith('10.') || h.startsWith('192.168.') || h.startsWith('172.') || h.includes('.fcapp.run') || h.includes('.aliyuncs.com') || h.includes('.functioncompute.com')) {
            return false;
        }
        return true;
    } catch  {
        return false;
    }
}
// ───────────────────────────────────────────────────────────────────
// Dynamic origin helper — derives the public origin the request came
// in on. Priority (highest first):
//   1. x-forwarded-host + x-forwarded-proto (gateway headers)
//   2. host header
//   3. request.url origin
//   4. Origin header
//   5. Referer header (accounts.google.com explicitly rejected)
//   6. Env vars
//   7. Active preview workspace URL
//
// CRITICAL: the token-exchange redirect_uri uses the SAME resolution as
// the initiation route, so whatever domain the login started on is the
// domain Google returns the callback to — preview and production both
// work automatically. `localhost` / internal cloud hostnames /
// accounts.google.com are ALWAYS rejected.
// ───────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────
// Hosts that can never be trusted as the app's public origin.
// (Module-level so both getDynamicOrigin and hasConfidentRequestOrigin
// share the exact same rejection rules.)
// ───────────────────────────────────────────────────────────────────
function isBadOAuthHost(h) {
    return !h || h === 'localhost' || h.startsWith('0.0.0.0') || h.startsWith('127.0.0.1') || h.startsWith('10.') || h.startsWith('192.168.') || h.startsWith('172.') || h.includes('.fcapp.run') || h.includes('.aliyuncs.com') || h.includes('.functioncompute.com') || h.includes('.glm.run') || h === 'accounts.google.com' || h.endsWith('.google.com');
}
function getDynamicOrigin(request) {
    const isBadHost = isBadOAuthHost;
    // 1. x-forwarded-host + x-forwarded-proto (proxy/gateway headers)
    const forwardedHost = request.headers.get('x-forwarded-host');
    const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
    if (forwardedHost && !isBadHost(forwardedHost.toLowerCase())) {
        return `${forwardedProto}://${forwardedHost}`;
    }
    // 2. host header
    const hostHeader = request.headers.get('host');
    if (hostHeader && !isBadHost(hostHeader.toLowerCase()) && hostHeader.includes('.')) {
        return `${forwardedProto}://${hostHeader}`;
    }
    // 3. request.url origin
    try {
        const url = new URL(request.url);
        if (!isBadHost(url.hostname.toLowerCase())) {
            return url.origin;
        }
    } catch  {
    // fall through
    }
    // 4. Origin header — browser sets on fetch, NOT sent on top-level
    //    Google-initiated navigations (that's why it's not #1).
    const originHeader = request.headers.get('origin');
    if (originHeader) {
        try {
            const u = new URL(originHeader);
            if (!isBadHost(u.hostname.toLowerCase())) return u.origin;
        } catch  {
        // ignore
        }
    }
    // 5. Referer header — on the OAuth callback this is
    //    https://accounts.google.com/... which isBadHost rejects, so it
    //    can never hijack the app origin.
    const referer = request.headers.get('referer');
    if (referer) {
        try {
            const u = new URL(referer);
            if (!isBadHost(u.hostname.toLowerCase())) return u.origin;
        } catch  {
        // ignore
        }
    }
    // 6. Env-var fallback — only reached by server-to-server requests
    //    with no usable headers.
    const envUrl = process.env.APP_URL || ("TURBOPACK compile-time value", "http://localhost:3000") || process.env.NEXTAUTH_URL || process.env.APP_PUBLIC_URL || '';
    if ("TURBOPACK compile-time truthy", 1) {
        try {
            const u = new URL(envUrl);
            if (!isBadHost(u.hostname.toLowerCase())) {
                return u.origin;
            }
        } catch  {
        // ignore — fall through to hardcoded
        }
    }
    // 7. Last resort: the active preview workspace deployment (never
    //    localhost, never accounts.google.com).
    return 'https://preview-chat-ab88c1b0-d6fd-4199-b9d5-ec3a018502fc.space-z.ai';
}
/** Build a redirect URL using dynamic origin */ function dynamicRedirect(path, request) {
    const origin = getDynamicOrigin(request);
    try {
        return new URL(path, origin);
    } catch  {
        return new URL(path, 'https://preview-chat-ab88c1b0-d6fd-4199-b9d5-ec3a018502fc.space-z.ai');
    }
}
/**
 * TRUE only when the request's own public origin can be CONFIDENTLY derived
 * from genuine request headers (x-forwarded-host / host / request.url with a
 * public, non-internal hostname).
 *
 * On gateways that strip or rewrite the Host header (the Aliyun-FC-style
 * preview gateway does), getDynamicOrigin falls through to env vars / a
 * hardcoded fallback domain that may be STALE (a previous preview URL).
 * Comparing stateOrigin against such a fallback wrongly classifies a
 * same-domain callback as cross-domain, which engaged the relay endpoint
 * and — before the relay's loop-safety fix — caused ERR_TOO_MANY_REDIRECTS.
 *
 * When this returns false, the callback must treat the request as
 * same-origin and finish with direct cookies (the browser is, by
 * construction of the dynamic redirect_uri, on the state's origin).
 */ function hasConfidentRequestOrigin(request) {
    const forwardedHost = request.headers.get('x-forwarded-host');
    if (forwardedHost && !isBadOAuthHost(forwardedHost.toLowerCase())) return true;
    const hostHeader = request.headers.get('host');
    if (hostHeader && !isBadOAuthHost(hostHeader.toLowerCase()) && hostHeader.includes('.')) return true;
    try {
        const url = new URL(request.url);
        if (!isBadOAuthHost(url.hostname.toLowerCase())) return true;
    } catch  {
    // fall through
    }
    return false;
}
function classifyTokenExchangeFailure(status, errorBody) {
    try {
        const parsed = JSON.parse(errorBody);
        const err = typeof parsed.error === 'string' ? parsed.error : '';
        const desc = typeof parsed.error_description === 'string' ? parsed.error_description : '';
        if (err === 'invalid_client' || /client secret/i.test(desc)) {
            return 'google_invalid_client_secret';
        }
        if (err === 'invalid_grant' && /redirect_uri/i.test(desc)) {
            return 'google_invalid_redirect_uri';
        }
        if (err === 'invalid_grant') {
            return 'google_invalid_grant';
        }
        if (status === 401 || status === 403) {
            return 'google_misconfigured';
        }
    } catch  {
    /* fall through */ }
    return 'google_failed';
}
/**
 * Build a synthetic Google profile for the DEV-ONLY simulated consent flow.
 * The pseudo `sub` is a deterministic hash of the email so repeated dev
 * logins with the same email link to the same account (same behavior as a
 * real Google identity). Only used when GOOGLE_CLIENT_ID is absent and dev
 * mode is enabled — never in production or with real credentials.
 */ function buildDevGoogleProfile(email, name) {
    const normalized = email.toLowerCase().trim();
    const sub = 'dev-google-' + (0, __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["createHash"])('sha256').update(normalized).digest('hex').slice(0, 24);
    return {
        sub,
        email: normalized,
        email_verified: true,
        name: (name || '').trim() || 'Google User'
    };
}
/**
 * Handle the Google OAuth callback.
 *
 * Returns:
 *   { accessToken, refreshToken, user, stateOrigin? } on success.
 *   { failureCode } on classified failure (so caller can redirect to
 *   the most helpful auth_error query).
 *   null on hard failure (treated as 'google_failed' by callers).
 *
 * DEV-ONLY: when `devProfile` is provided (sandbox simulated consent), the
 * token exchange and userinfo fetch against Google are skipped entirely and
 * the provided profile is used instead — every later step (user upsert,
 * backfill, session creation, cookies) runs IDENTICALLY to the real flow.
 */ async function handleGoogleOAuth(code, request, stateFromQuery, requestId, devProfile) {
    // ── Lazy-load credentials ────────────────────────────────────
    let clientId;
    let clientSecret;
    try {
        clientId = process.env.GOOGLE_CLIENT_ID;
        clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        console.log(`[Google Callback ${requestId}] clientId=${clientId ? 'SET (' + clientId.substring(0, 10) + '...)' : 'MISSING'}, clientSecret=${clientSecret ? 'SET' : 'MISSING'}`);
    } catch (err) {
        console.error(`[Google Callback ${requestId}] Failed to read env vars:`, err);
        return null;
    }
    if (!devProfile && (!clientId || !clientSecret)) {
        console.error(`[Google Callback ${requestId}] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET`);
        return null;
    }
    if (devProfile) {
        console.warn(`[Google Callback ${requestId}] DEV MODE: using simulated profile for ${devProfile.email} (no token exchange)`);
    }
    // ── CAUSE A: State parameter decoding ────────────────────────
    let redirectUri;
    let stateOrigin;
    let rememberMeOut;
    try {
        if (stateFromQuery) {
            const decoded = JSON.parse(Buffer.from(stateFromQuery, 'base64url').toString('utf-8'));
            if (decoded.redirectUri) {
                redirectUri = decoded.redirectUri;
                if (decoded.origin && typeof decoded.origin === 'string') {
                    stateOrigin = decoded.origin;
                }
                console.log(`[Google Callback ${requestId}] redirect_uri from state: ${redirectUri}, origin: ${stateOrigin || 'none'}`);
            } else {
                throw new Error('No redirectUri in state');
            }
        } else {
            throw new Error('No state parameter');
        }
    } catch (stateErr) {
        // CAUSE A — state mismatch / decode failure
        console.error(`[Google Callback ${requestId}] State decode failed:`, stateErr instanceof Error ? stateErr.message : stateErr);
        // CAUSE C — fallback: derive redirect_uri from dynamic origin
        try {
            const origin = getDynamicOrigin(request);
            redirectUri = `${origin}/api/auth/callback/google`;
            console.log(`[Google Callback ${requestId}] redirect_uri from fallback (dynamic origin): ${redirectUri}`);
        } catch (originErr) {
            console.error(`[Google Callback ${requestId}] Dynamic origin fallback also failed:`, originErr);
            return null;
        }
    }
    console.log(`[Google Callback ${requestId}] Final redirect_uri for token exchange: ${redirectUri}`);
    // ── Lazy-load auth helpers ───────────────────────────────────
    let authLib;
    try {
        authLib = await __turbopack_context__.A("[project]/src/lib/auth.ts [app-route] (ecmascript, async loader)");
        console.log(`[Google Callback ${requestId}] Auth module loaded`);
    } catch (authErr) {
        console.error(`[Google Callback ${requestId}] FATAL: Failed to load @/lib/auth:`, authErr instanceof Error ? authErr.message : authErr);
        return null;
    }
    const { generateAccessToken, generateRefreshToken, createSession, recordLoginAttempt, logAuthEvent, getClientIp, getUserAgent, setAuthCookies } = authLib;
    // ── Lazy-load DB ─────────────────────────────────────────────
    let db;
    try {
        const dbMod = await __turbopack_context__.A("[project]/src/lib/db.ts [app-route] (ecmascript, async loader)");
        db = dbMod.db;
        console.log(`[Google Callback ${requestId}] DB module loaded`);
    } catch (dbErr) {
        console.error(`[Google Callback ${requestId}] FATAL: Failed to load @/lib/db:`, dbErr instanceof Error ? dbErr.message : dbErr);
        return null;
    }
    const ip = getClientIp?.(request) || 'unknown';
    const ua = getUserAgent?.(request) || 'unknown';
    // ── CAUSE B: Token exchange with Google ──────────────────────
    // DEV-ONLY shortcut: the simulated consent flow has no authorization code
    // to exchange — skip straight to the profile.
    let tokenData;
    if (!devProfile) {
        try {
            // [G-CB] Step 2: token exchange starting
            console.log(`[G-CB] Step 2: token exchange starting (redirect_uri=${redirectUri})`);
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    code,
                    client_id: clientId,
                    client_secret: clientSecret,
                    redirect_uri: redirectUri,
                    grant_type: 'authorization_code'
                })
            });
            if (!tokenResponse.ok) {
                const errorData = await tokenResponse.text();
                console.error(`[Google Callback ${requestId}] ✗ Token exchange FAILED (status=${tokenResponse.status}):`, errorData);
                return {
                    failureCode: classifyTokenExchangeFailure(tokenResponse.status, errorData)
                };
            }
            tokenData = await tokenResponse.json();
            // [G-CB] Step 3: token exchange result
            console.log(`[G-CB] Step 3: token exchange result: access_token=${!!tokenData.access_token}, error=${tokenData.error || 'none'}`);
            console.log(`[Google Callback ${requestId}] ✓ Token exchange successful`);
        } catch (tokenErr) {
            console.error(`[Google Callback ${requestId}] Token exchange crashed:`, tokenErr instanceof Error ? tokenErr.message : tokenErr);
            return null;
        }
    }
    // ── CAUSE D: User profile fetch from Google ──────────────────
    let googleUser;
    if (devProfile) {
        // DEV-ONLY: use the simulated profile from the in-app consent page.
        googleUser = devProfile;
        // Mask PII (email) in server logs.
        console.log(`[Google Callback ${requestId}] ✓ DEV profile used: email=${googleUser.email ? googleUser.email.slice(0, 2) + '***' : 'MISSING'}, name=${googleUser.name}`);
    } else {
        try {
            // [G-CB] Step 4: userinfo fetch starting
            console.log(`[G-CB] Step 4: userinfo fetch starting`);
            const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: {
                    Authorization: `Bearer ${tokenData.access_token}`
                }
            });
            if (!profileResponse.ok) {
                console.error(`[Google Callback ${requestId}] ✗ Failed to fetch user profile (status=${profileResponse.status})`);
                return null;
            }
            googleUser = await profileResponse.json();
            // [G-CB] Step 5: google email
            console.log(`[G-CB] Step 5: google profile fetched (email=${googleUser.email ? googleUser.email.slice(0, 2) + '***' : 'MISSING'}, name: ${googleUser.name || 'n/a'})`);
            console.log(`[Google Callback ${requestId}] ✓ User profile fetched`);
        } catch (profileErr) {
            console.error(`[Google Callback ${requestId}] Profile fetch crashed:`, profileErr instanceof Error ? profileErr.message : profileErr);
            return null;
        }
    }
    if (!googleUser.email) {
        console.error(`[Google Callback ${requestId}] No email in Google profile`);
        return null;
    }
    // ── SECURITY HARDENING: verified-email enforcement ──────────
    // Google must assert the email is verified before we allow it to
    // match or create a local account. Without this check, an attacker
    // controlling an UNVERIFIED Google address could take over the
    // existing local account with the same email.
    if (googleUser.email_verified !== true) {
        console.error(`[Google Callback ${requestId}] Google email is not verified — rejecting sign-in`);
        return null;
    }
    const normalizedEmail = googleUser.email.toLowerCase().trim();
    // ── CAUSE E: Database find/create user ───────────────────────
    let user;
    try {
        // [G-CB] Step 6: DB upsert starting
        console.log(`[G-CB] Step 6: DB upsert starting (email masked: ${normalizedEmail.slice(0, 2)}***)`);
        user = await db.user.findFirst({
            where: {
                OR: [
                    {
                        email: normalizedEmail
                    },
                    ...googleUser.sub ? [
                        {
                            googleId: googleUser.sub
                        }
                    ] : []
                ]
            },
            include: {
                mfaConfig: true
            }
        });
        if (user) {
            console.log(`[Google Callback ${requestId}] Existing user found: id=${user.id}, active=${user.isActive}, authProvider=${user.authProvider}, plan=${user.plan}, role=${user.role}`);
            // ACCOUNT-CONSISTENCY FIX (2026-09-24): link the real Google sub when
            // the record has none, AND replace a synthetic dev-consent sub
            // ('dev-google-…') with the real identity. A user first created via
            // the DEV simulated consent (sandbox without GOOGLE_CLIENT_ID) used
            // to keep the fake sub forever after real credentials returned, so
            // the account carried a wrong Google identity. Same account, same
            // email → same canonical User record with its TRUE Google identity.
            if (googleUser.sub && (!user.googleId || user.googleId.startsWith('dev-google-'))) {
                try {
                    await db.user.update({
                        where: {
                            id: user.id
                        },
                        data: {
                            googleId: googleUser.sub
                        }
                    });
                    user = {
                        ...user,
                        googleId: googleUser.sub
                    };
                    console.log(`[Google Callback ${requestId}] ✓ Google identity linked to existing user`);
                } catch (linkErr) {
                    // Non-fatal: login continues resolved by email. (googleId is
                    // @unique — a conflict means another record holds this sub.)
                    console.warn(`[Google Callback ${requestId}] googleId link failed (non-fatal):`, linkErr instanceof Error ? linkErr.message : linkErr);
                }
            }
            // FIX (2026-09-22, security hardening): admin-deactivated accounts
            // are NEVER auto-reactivated via Google sign-in. Reactivation used
            // to let banned users un-ban themselves by pressing "Sign in with
            // Google". Missing legacy fields (plan/role/trial) are still
            // backfilled so legitimate legacy accounts keep working.
            const backfillData = {};
            if (!user.isActive) {
                console.warn(`[Google Callback ${requestId}] User inactive — denying Google sign-in (account deactivated by admin)`);
                return null;
            }
            if (!user.plan) backfillData.plan = 'free';
            if (!user.role) backfillData.role = 'owner';
            if (user.isTrial === null || user.isTrial === undefined) {
                backfillData.isTrial = true;
            }
            if (!user.trialEndsAt) {
                backfillData.trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
            }
            if (!user.emailVerified) {
                backfillData.emailVerified = googleUser.email_verified ?? true;
            }
            if (!user.authProvider || user.authProvider === 'email') {
                // Link the Google identity onto the existing account.
                backfillData.authProvider = 'google';
            }
            if (Object.keys(backfillData).length > 0) {
                try {
                    await db.user.update({
                        where: {
                            id: user.id
                        },
                        data: backfillData
                    });
                    user = {
                        ...user,
                        ...backfillData
                    };
                    console.log(`[Google Callback ${requestId}] ✓ Backfilled fields: ${Object.keys(backfillData).join(', ')}`);
                } catch (backfillErr) {
                    console.error(`[Google Callback ${requestId}] Backfill update failed:`, backfillErr instanceof Error ? backfillErr.message : backfillErr);
                // Non-fatal: continue with the user object we have.
                }
            }
            // Ensure the user has a subscription row — some legacy email/password
            // users may not, which can cause downstream dashboard failures.
            try {
                const existingSub = await db.subscription.findFirst({
                    where: {
                        userId: user.id
                    },
                    select: {
                        id: true
                    }
                });
                if (!existingSub) {
                    await db.subscription.create({
                        data: {
                            userId: user.id,
                            plan: user.plan || 'free',
                            status: 'trial',
                            isTrial: true,
                            trialEndsAt: user.trialEndsAt || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                            currentPeriodStart: new Date(),
                            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                        }
                    });
                    console.log(`[Google Callback ${requestId}] ✓ Created missing subscription for legacy user`);
                }
            } catch (subErr) {
                console.warn(`[Google Callback ${requestId}] Subscription ensure failed (non-fatal):`, subErr instanceof Error ? subErr.message : subErr);
            }
        } else {
            console.log(`[Google Callback ${requestId}] No existing user — creating new account`);
            // SIGNUP REWARD: explicit 50-credit starting balance (the TOTAL signup
            // grant) + audit ledger row. Non-fatal ledger failure — the balance is
            // already exactly 50 via the explicit field.
            const creditMod = await __turbopack_context__.A("[project]/src/lib/credit-service.ts [app-route] (ecmascript, async loader)");
            const GRANT = creditMod.SIGNUP_GRANT_CREDITS;
            user = await db.user.create({
                data: {
                    email: normalizedEmail,
                    name: googleUser.name || googleUser.given_name || 'Google User',
                    avatar: googleUser.picture || null,
                    googleId: googleUser.sub,
                    emailVerified: googleUser.email_verified ?? true,
                    authProvider: 'google',
                    role: 'owner',
                    plan: 'free',
                    isTrial: true,
                    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                    credits: GRANT,
                    creditsMonthly: GRANT,
                    settings: {
                        create: {}
                    },
                    subscriptions: {
                        create: {
                            plan: 'free',
                            status: 'trial',
                            isTrial: true,
                            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                            currentPeriodStart: new Date(),
                            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                        }
                    }
                },
                include: {
                    mfaConfig: true
                }
            });
            console.log(`[Google Callback ${requestId}] ✓ New user created: id=${user.id}`);
            try {
                await db.$transaction((tx)=>creditMod.writeSignupGrantLedger(tx, user.id));
            } catch (grantErr) {
                console.warn(`[Google Callback ${requestId}] Signup grant ledger row failed (non-fatal, balance remains ${GRANT}):`, grantErr);
            }
            try {
                await logAuthEvent({
                    userId: user.id,
                    action: 'signup',
                    details: `New account created via Google OAuth for ${normalizedEmail}`,
                    ipAddress: ip,
                    userAgent: ua
                });
            } catch (logErr) {
                console.warn(`[Google Callback ${requestId}] Signup log event failed (non-fatal):`, logErr);
            }
        }
    } catch (dbErr) {
        console.error(`[Google Callback ${requestId}] DB user upsert failed:`, dbErr instanceof Error ? dbErr.message : dbErr);
        return null;
    }
    // ── Generate tokens ──────────────────────────────────────────
    let accessToken;
    let refreshToken;
    try {
        accessToken = generateAccessToken({
            id: user.id,
            email: user.email,
            role: user.role,
            plan: user.plan,
            orgId: user.orgId,
            isTrial: user.isTrial,
            trialEndsAt: user.trialEndsAt
        });
        refreshToken = generateRefreshToken({
            id: user.id,
            email: user.email,
            role: user.role,
            plan: user.plan,
            orgId: user.orgId,
            isTrial: user.isTrial,
            trialEndsAt: user.trialEndsAt
        });
        console.log(`[Google Callback ${requestId}] ✓ Tokens generated`);
    } catch (tokenGenErr) {
        console.error(`[Google Callback ${requestId}] Token generation failed:`, tokenGenErr instanceof Error ? tokenGenErr.message : tokenGenErr);
        return null;
    }
    // ── CAUSE F: Session creation ────────────────────────────────
    try {
        // [G-CB] Step 7: session creation starting
        console.log(`[G-CB] Step 7: session creation starting (userId=${user.id})`);
        // P5: honor the "Remember me for 30 days" choice (short-lived cookie
        // set by the sign-in page before the OAuth redirect).
        const rememberMe = authLib.readRememberMeCookie(request);
        await createSession({
            userId: user.id,
            refreshToken,
            deviceInfo: ua.substring(0, 255),
            ipAddress: ip,
            userAgent: ua,
            rememberMe
        });
        rememberMeOut = rememberMe;
        console.log(`[Google Callback ${requestId}] ✓ Session created`);
    } catch (sessionErr) {
        console.error(`[Google Callback ${requestId}] Session creation failed:`, sessionErr instanceof Error ? sessionErr.message : sessionErr);
        return null;
    }
    // ── Update last login ────────────────────────────────────────
    try {
        await db.user.update({
            where: {
                id: user.id
            },
            data: {
                lastLoginAt: new Date()
            }
        });
    } catch (updateErr) {
        console.warn(`[Google Callback ${requestId}] lastLoginAt update failed (non-fatal):`, updateErr);
    }
    // ── Record login & audit ─────────────────────────────────────
    try {
        await recordLoginAttempt({
            userId: user.id,
            ip,
            userAgent: ua,
            success: true
        });
    } catch (recordErr) {
        console.warn(`[Google Callback ${requestId}] recordLoginAttempt failed (non-fatal):`, recordErr);
    }
    try {
        await logAuthEvent({
            userId: user.id,
            action: 'google_oauth_login',
            details: 'Successful Google OAuth login',
            ipAddress: ip,
            userAgent: ua
        });
        await logAuthEvent({
            userId: user.id,
            action: 'signin',
            details: 'Successful login via Google OAuth',
            ipAddress: ip,
            userAgent: ua
        });
    } catch (logErr) {
        console.warn(`[Google Callback ${requestId}] Auth event logging failed (non-fatal):`, logErr);
    }
    console.log(`[Google Callback ${requestId}] ✓ All steps complete — returning tokens (stateOrigin: ${stateOrigin || 'none'})`);
    return {
        accessToken,
        refreshToken,
        user,
        stateOrigin,
        rememberMe: rememberMeOut
    };
}
// ───────────────────────────────────────────────────────────────────
// GET handler — Google redirects back with ?code=xxx&state=yyy
// ───────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────
// Decode the state param to extract the origin the user started on.
// Used for ERROR redirects so the user lands back on their actual
// domain (preview URL) instead of APP_URL which points at the dead
// production domain. Returns null if state is missing/invalid.
// ───────────────────────────────────────────────────────────────────
function decodeStateOrigin(state) {
    if (!state) return null;
    try {
        const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
        if (decoded && typeof decoded.origin === 'string') {
            try {
                const u = new URL(decoded.origin);
                const h = u.hostname.toLowerCase();
                if (h && h !== 'localhost' && !h.startsWith('127.') && !h.startsWith('10.') && !h.startsWith('192.168.') && !h.includes('.fcapp.run') && !h.includes('.aliyuncs.com') && !h.includes('.functioncompute.com') && !h.endsWith('.google.com')) {
                    return u.origin;
                }
            } catch  {}
        }
    } catch  {}
    return null;
}
/**
 * Build a redirect URL that prefers the state's origin (where the user
 * actually started) over getDynamicOrigin (which may fall back to
 * APP_URL=acquisition.space-z.ai on the Google→callback top-level
 * navigation where no Origin/Referer headers are present).
 */ function userOriginRedirect(path, request, state) {
    const stateOrigin = decodeStateOrigin(state);
    if (stateOrigin) {
        try {
            return new URL(path, stateOrigin);
        } catch  {}
    }
    return dynamicRedirect(path, request);
}
async function GET(request) {
    const requestId = `gcb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[G-CB] ===== CALLBACK REACHED ===== (id=${requestId})`);
    // [AUTH-CONFIG] Log Google credential presence at callback entry
    console.log(`[AUTH-CONFIG] GOOGLE_CLIENT_ID set: ${!!process.env.GOOGLE_CLIENT_ID}`);
    console.log(`[AUTH-CONFIG] GOOGLE_CLIENT_SECRET set: ${!!process.env.GOOGLE_CLIENT_SECRET}`);
    try {
        const { searchParams } = new URL(request.url);
        const code = searchParams.get('code');
        const state = searchParams.get('state') || undefined;
        const error = searchParams.get('error');
        // [G-CB] Step 1: code received
        console.log(`[G-CB] Step 1: code received: ${!!code}, state: ${!!state}, error: ${error || 'none'}`);
        console.log(`[G-CB] stateOrigin=${decodeStateOrigin(state) || 'NONE'}, fwd-host=${request.headers.get('x-forwarded-host') || 'NONE'}, host=${request.headers.get('host') || 'NONE'}`);
        if (error) {
            console.error(`[Google Callback ${requestId}] OAuth error from Google:`, error);
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].redirect(userOriginRedirect('/?auth_error=oauth_failed', request, state));
        }
        // ── DEV-ONLY simulated consent callback ─────────────────────
        // Activated ONLY when ALL of the following hold:
        //   1. ?dev=1&dev_email=... params are present (from the in-app
        //      simulated consent page /auth/dev/google-consent)
        //   2. No real GOOGLE_CLIENT_ID is configured on this server
        //   3. Dev-mode auth delivery is enabled (never in production)
        // With real credentials configured, dev params are ignored and the
        // genuine Google OAuth flow runs exactly as before.
        const devEmailParam = searchParams.get('dev_email');
        const devNameParam = searchParams.get('dev_name');
        const devAllowed = !process.env.GOOGLE_CLIENT_ID && (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$dev$2d$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["isDevAuthDeliveryEnabled"])();
        const devProfile = searchParams.get('dev') === '1' && devEmailParam && devAllowed ? buildDevGoogleProfile(devEmailParam, devNameParam) : undefined;
        if (searchParams.get('dev') === '1' && !devAllowed) {
            console.warn(`[Google Callback ${requestId}] dev=1 param ignored — dev mode not allowed (real credentials or production)`);
        }
        if (!code && !devProfile) {
            console.error(`[Google Callback ${requestId}] No code parameter in callback`);
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].redirect(userOriginRedirect('/?auth_error=no_code', request, state));
        }
        const result = await handleGoogleOAuth(code || 'dev-mock-code', request, state, requestId, devProfile);
        if (!result) {
            console.error(`[G-CB] FAILED — handleGoogleOAuth returned null. Check earlier [G-CB] step logs for the failure point.`);
            console.error(`[Google Callback ${requestId}] handleGoogleOAuth returned null — redirecting to error page`);
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].redirect(userOriginRedirect('/?auth_error=google_failed', request, state));
        }
        if ('failureCode' in result && result.failureCode) {
            console.error(`[G-CB] FAILED — handleGoogleOAuth returned failureCode: ${result.failureCode}`);
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].redirect(userOriginRedirect(`/?auth_error=${result.failureCode}`, request, state));
        }
        if (!('accessToken' in result)) {
            console.error(`[G-CB] FAILED — handleGoogleOAuth returned an unexpected shape.`);
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].redirect(userOriginRedirect('/?auth_error=google_failed', request, state));
        }
        const { accessToken, refreshToken, stateOrigin } = result;
        // [G-CB] Step 8: redirecting to dashboard
        console.log(`[G-CB] Step 8: redirecting to dashboard (SUCCESS)`);
        // ── Cross-domain relay ────────────────────────────────────
        // When the user started on a different origin (e.g. a preview
        // domain) than the canonical redirect_uri domain (where this
        // callback runs), relay the session back to their origin via a
        // short-lived signed JWT. The relay endpoint on their origin
        // sets the auth cookies and redirects to /. This keeps the user
        // authenticated on the domain they actually started on, instead
        // of leaving them stranded on the production domain.
        const canonicalOrigin = getDynamicOrigin(request);
        if (stateOrigin && isPublicOrigin(stateOrigin) && hasConfidentRequestOrigin(request) && !(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$oauth$2d$relay$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["isSameOrigin"])(stateOrigin, canonicalOrigin)) {
            try {
                const relayToken = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$oauth$2d$relay$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createRelayToken"])(accessToken, refreshToken, stateOrigin);
                const relayUrl = `${stateOrigin.replace(/\/+$/, '')}/api/auth/google/relay?token=${encodeURIComponent(relayToken)}`;
                console.log(`[Google Callback ${requestId}] ✓ Relaying session to origin: ${stateOrigin} (canonical: ${canonicalOrigin})`);
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].redirect(relayUrl);
            } catch (relayErr) {
                console.error(`[Google Callback ${requestId}] Relay token creation failed, falling back to direct cookies:`, relayErr instanceof Error ? relayErr.message : relayErr);
            }
        }
        // ── Same domain — set auth cookies directly and redirect to / ──
        // Prefer stateOrigin (where the user actually started) over
        // getDynamicOrigin (which may fall back to APP_URL on the
        // Google→callback top-level navigation).
        const successOrigin = stateOrigin && isPublicOrigin(stateOrigin) ? stateOrigin : null;
        const redirectTarget = successOrigin ? new URL('/', successOrigin) : dynamicRedirect('/', request);
        const response = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].redirect(redirectTarget);
        // ── Set auth cookies ──────────────────────────────────────
        try {
            const authLib = await __turbopack_context__.A("[project]/src/lib/auth.ts [app-route] (ecmascript, async loader)");
            // P5: non-remembered Google sessions get a browser-session cookie.
            return authLib.setAuthCookies(response, accessToken, refreshToken, {
                persist: result.rememberMe !== false
            });
        } catch (cookieErr) {
            console.error(`[Google Callback ${requestId}] setAuthCookies failed:`, cookieErr);
            // Return the redirect without cookies — user will need to sign in again
            return response;
        }
    } catch (error) {
        // ULTIMATE FALLBACK — this must NEVER produce a bare 500
        console.error(`[Google Callback ${requestId}] ✗ FATAL unhandled error:`, error instanceof Error ? `${error.message}\n${error.stack}` : String(error));
        try {
            // Re-extract state from URL for the fallback (outer catch doesn't have `state`)
            const fallbackState = new URL(request.url).searchParams.get('state') || undefined;
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].redirect(userOriginRedirect('/?auth_error=google_failed', request, fallbackState));
        } catch (redirectErr) {
            console.error(`[Google Callback ${requestId}] Even redirect failed:`, redirectErr);
            // Absolute last resort — HTML meta-refresh using state origin if available
            const fallbackState = new URL(request.url).searchParams.get('state') || undefined;
            const origin = decodeStateOrigin(fallbackState) || getDynamicOrigin(request);
            const html = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=${origin}/?auth_error=google_failed"><title>Redirecting…</title></head><body><p>Redirecting…</p></body></html>`;
            return new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"](html, {
                status: 200,
                headers: {
                    'Content-Type': 'text/html',
                    Location: `${origin}/?auth_error=google_failed`
                }
            });
        }
    }
}
async function POST(request) {
    const requestId = `gcb-post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
        const body = await request.json();
        const { code } = body;
        if (!code || typeof code !== 'string') {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'Authorization code is required'
            }, {
                status: 400
            });
        }
        const result = await handleGoogleOAuth(code, request, undefined, requestId);
        if (!result) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'Google authentication failed. Please try again.'
            }, {
                status: 401
            });
        }
        const { accessToken, refreshToken, user } = result;
        const mfaEnabled = user.mfaConfig?.isEnabled ?? false;
        const response = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            message: 'Signed in successfully via Google',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                plan: user.plan || 'free',
                orgId: user.orgId,
                emailVerified: user.emailVerified,
                mfaEnabled,
                avatarUrl: user.avatar
            }
        });
        try {
            const authLib = await __turbopack_context__.A("[project]/src/lib/auth.ts [app-route] (ecmascript, async loader)");
            // P5: non-remembered Google sessions get a browser-session cookie.
            return authLib.setAuthCookies(response, accessToken, refreshToken, {
                persist: result.rememberMe !== false
            });
        } catch  {
            return response;
        }
    } catch (error) {
        console.error(`[Google Callback ${requestId}] POST error:`, error);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Internal server error'
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__90593d61._.js.map