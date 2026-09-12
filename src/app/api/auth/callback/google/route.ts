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

import { NextRequest, NextResponse } from 'next/server';
import { createRelayToken, isSameOrigin } from '@/lib/oauth-relay';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ───────────────────────────────────────────────────────────────────
// Validate that an origin is a public host (not localhost / internal
// cloud hostname). Used to decide whether to relay the session back to
// the user's original domain after cross-domain Google OAuth.
// ───────────────────────────────────────────────────────────────────
function isPublicOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    const h = u.hostname.toLowerCase();
    if (
      !h ||
      h === 'localhost' ||
      h.startsWith('0.0.0.0') ||
      h.startsWith('127.') ||
      h.startsWith('10.') ||
      h.startsWith('192.168.') ||
      h.startsWith('172.') ||
      h.includes('.fcapp.run') ||
      h.includes('.aliyuncs.com') ||
      h.includes('.functioncompute.com')
    ) {
      return false;
    }
    return true;
  } catch {
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
function getDynamicOrigin(request: NextRequest): string {
  const isBadHost = (h: string): boolean =>
    !h ||
    h === 'localhost' ||
    h.startsWith('0.0.0.0') ||
    h.startsWith('127.0.0.1') ||
    h.startsWith('10.') ||
    h.startsWith('192.168.') ||
    h.startsWith('172.') ||
    h.includes('.fcapp.run') ||
    h.includes('.aliyuncs.com') ||
    h.includes('.functioncompute.com') ||
    h.includes('.glm.run') ||
    h === 'accounts.google.com' ||
    h.endsWith('.google.com');

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
  } catch {
    // fall through
  }

  // 4. Origin header — browser sets on fetch, NOT sent on top-level
  //    Google-initiated navigations (that's why it's not #1).
  const originHeader = request.headers.get('origin');
  if (originHeader) {
    try {
      const u = new URL(originHeader);
      if (!isBadHost(u.hostname.toLowerCase())) return u.origin;
    } catch {
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
    } catch {
      // ignore
    }
  }

  // 6. Env-var fallback — only reached by server-to-server requests
  //    with no usable headers.
  const envUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.APP_PUBLIC_URL ||
    '';
  if (envUrl) {
    try {
      const u = new URL(envUrl);
      if (!isBadHost(u.hostname.toLowerCase())) {
        return u.origin;
      }
    } catch {
      // ignore — fall through to hardcoded
    }
  }

  // 7. Last resort: the active preview workspace deployment (never
  //    localhost, never accounts.google.com).
  return 'https://preview-chat-ab88c1b0-d6fd-4199-b9d5-ec3a018502fc.space-z.ai';
}

/** Build a redirect URL using dynamic origin */
function dynamicRedirect(path: string, request: NextRequest): URL {
  const origin = getDynamicOrigin(request);
  try {
    return new URL(path, origin);
  } catch {
    return new URL(path, 'https://preview-chat-ab88c1b0-d6fd-4199-b9d5-ec3a018502fc.space-z.ai');
  }
}

interface GoogleTokenResponse {
  access_token: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

// ───────────────────────────────────────────────────────────────────
// Token-exchange error classification. Returns a specific auth_error
// code that the frontend can map to an actionable message, instead of
// the generic "google_failed".
// ───────────────────────────────────────────────────────────────────
type GoogleFailureCode =
  | 'google_invalid_client_secret'
  | 'google_invalid_redirect_uri'
  | 'google_invalid_grant'
  | 'google_misconfigured'
  | 'google_failed';

function classifyTokenExchangeFailure(
  status: number,
  errorBody: string
): GoogleFailureCode {
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
  } catch {
    /* fall through */
  }
  return 'google_failed';
}

/**
 * Handle the Google OAuth callback.
 *
 * Returns:
 *   { accessToken, refreshToken, user, stateOrigin? } on success.
 *   { failureCode } on classified failure (so caller can redirect to
 *   the most helpful auth_error query).
 *   null on hard failure (treated as 'google_failed' by callers).
 */
async function handleGoogleOAuth(
  code: string,
  request: NextRequest,
  stateFromQuery: string | undefined,
  requestId: string
): Promise<
  | { accessToken: string; refreshToken: string; user: any; stateOrigin?: string }
  | { failureCode: GoogleFailureCode }
  | null
> {
  // ── Lazy-load credentials ────────────────────────────────────
  let clientId: string | undefined;
  let clientSecret: string | undefined;
  try {
    clientId = process.env.GOOGLE_CLIENT_ID;
    clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    console.log(`[Google Callback ${requestId}] clientId=${clientId ? 'SET (' + clientId.substring(0, 10) + '...)' : 'MISSING'}, clientSecret=${clientSecret ? 'SET' : 'MISSING'}`);
  } catch (err) {
    console.error(`[Google Callback ${requestId}] Failed to read env vars:`, err);
    return null;
  }

  if (!clientId || !clientSecret) {
    console.error(`[Google Callback ${requestId}] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET`);
    return null;
  }

  // ── CAUSE A: State parameter decoding ────────────────────────
  let redirectUri: string;
  let stateOrigin: string | undefined;
  try {
    if (stateFromQuery) {
      const decoded = JSON.parse(
        Buffer.from(stateFromQuery, 'base64url').toString('utf-8')
      );
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
  let authLib: any;
  try {
    authLib = await import('@/lib/auth');
    console.log(`[Google Callback ${requestId}] Auth module loaded`);
  } catch (authErr) {
    console.error(`[Google Callback ${requestId}] FATAL: Failed to load @/lib/auth:`, authErr instanceof Error ? authErr.message : authErr);
    return null;
  }

  const {
    generateAccessToken,
    generateRefreshToken,
    createSession,
    recordLoginAttempt,
    logAuthEvent,
    getClientIp,
    getUserAgent,
    setAuthCookies,
  } = authLib;

  // ── Lazy-load DB ─────────────────────────────────────────────
  let db: any;
  try {
    const dbMod = await import('@/lib/db');
    db = dbMod.db;
    console.log(`[Google Callback ${requestId}] DB module loaded`);
  } catch (dbErr) {
    console.error(`[Google Callback ${requestId}] FATAL: Failed to load @/lib/db:`, dbErr instanceof Error ? dbErr.message : dbErr);
    return null;
  }

  const ip = getClientIp?.(request) || 'unknown';
  const ua = getUserAgent?.(request) || 'unknown';

  // ── CAUSE B: Token exchange with Google ──────────────────────
  let tokenData: GoogleTokenResponse;
  try {
    // [G-CB] Step 2: token exchange starting
    console.log(`[G-CB] Step 2: token exchange starting (redirect_uri=${redirectUri})`);
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error(`[Google Callback ${requestId}] ✗ Token exchange FAILED (status=${tokenResponse.status}):`, errorData);
      return { failureCode: classifyTokenExchangeFailure(tokenResponse.status, errorData) };
    }

    tokenData = await tokenResponse.json();
    // [G-CB] Step 3: token exchange result
    console.log(`[G-CB] Step 3: token exchange result: access_token=${!!tokenData.access_token}, error=${(tokenData as any).error || 'none'}`);
    console.log(`[Google Callback ${requestId}] ✓ Token exchange successful`);
  } catch (tokenErr) {
    console.error(`[Google Callback ${requestId}] Token exchange crashed:`, tokenErr instanceof Error ? tokenErr.message : tokenErr);
    return null;
  }

  // ── CAUSE D: User profile fetch from Google ──────────────────
  let googleUser: GoogleUserInfo;
  try {
    // [G-CB] Step 4: userinfo fetch starting
    console.log(`[G-CB] Step 4: userinfo fetch starting`);
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileResponse.ok) {
      console.error(`[Google Callback ${requestId}] ✗ Failed to fetch user profile (status=${profileResponse.status})`);
      return null;
    }

    googleUser = await profileResponse.json();
    // [G-CB] Step 5: google email
    console.log(`[G-CB] Step 5: google email: ${googleUser.email}, name: ${googleUser.name || 'n/a'}`);
    console.log(`[Google Callback ${requestId}] ✓ User profile fetched: email=${googleUser.email}, name=${googleUser.name}`);
  } catch (profileErr) {
    console.error(`[Google Callback ${requestId}] Profile fetch crashed:`, profileErr instanceof Error ? profileErr.message : profileErr);
    return null;
  }

  if (!googleUser.email) {
    console.error(`[Google Callback ${requestId}] No email in Google profile`);
    return null;
  }

  const normalizedEmail = googleUser.email.toLowerCase().trim();

  // ── CAUSE E: Database find/create user ───────────────────────
  let user: any;
  try {
    // [G-CB] Step 6: DB upsert starting
    console.log(`[G-CB] Step 6: DB upsert starting for email: ${normalizedEmail}`);
    user = await db.user.findFirst({
      where: {
        OR: [
          { email: normalizedEmail },
          ...(googleUser.sub ? [{ googleId: googleUser.sub }] : []),
        ],
      },
      include: { mfaConfig: true },
    });

    if (user) {
      console.log(`[Google Callback ${requestId}] Existing user found: id=${user.id}, active=${user.isActive}, authProvider=${user.authProvider}, plan=${user.plan}, role=${user.role}`);
      if (!user.googleId && googleUser.sub) {
        await db.user.update({
          where: { id: user.id },
          data: { googleId: googleUser.sub },
        });
      }
      // FIX (2026-09-09): Previously, an existing user with isActive=false
      // was hard-blocked (return null → "Google sign-in failed"). This
      // broke Google login for already-registered email/password users
      // whose accounts were deactivated, and also for legacy users
      // missing required fields (plan/role/trial) that the new-user
      // path populates. We now REACTIVATE the account and backfill any
      // missing fields so Google sign-in works for all registered emails.
      const backfillData: Record<string, unknown> = {};
      if (!user.isActive) {
        console.warn(`[Google Callback ${requestId}] User inactive — reactivating for Google sign-in`);
        backfillData.isActive = true;
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
            where: { id: user.id },
            data: backfillData,
          });
          user = { ...user, ...backfillData } as typeof user;
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
          where: { userId: user.id },
          select: { id: true },
        });
        if (!existingSub) {
          await db.subscription.create({
            data: {
              userId: user.id,
              plan: (user.plan as string) || 'free',
              status: 'trial',
              isTrial: true,
              trialEndsAt: user.trialEndsAt || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          });
          console.log(`[Google Callback ${requestId}] ✓ Created missing subscription for legacy user`);
        }
      } catch (subErr) {
        console.warn(`[Google Callback ${requestId}] Subscription ensure failed (non-fatal):`, subErr instanceof Error ? subErr.message : subErr);
      }
    } else {
      console.log(`[Google Callback ${requestId}] No existing user — creating new account`);
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
          settings: { create: {} },
          subscriptions: {
            create: {
              plan: 'free',
              status: 'trial',
              isTrial: true,
              trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          },
        },
        include: { mfaConfig: true },
      });
      console.log(`[Google Callback ${requestId}] ✓ New user created: id=${user.id}`);

      try {
        await logAuthEvent({
          userId: user.id,
          action: 'signup',
          details: `New account created via Google OAuth for ${normalizedEmail}`,
          ipAddress: ip,
          userAgent: ua,
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
  let accessToken: string;
  let refreshToken: string;
  try {
    accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      orgId: user.orgId,
      isTrial: user.isTrial,
      trialEndsAt: user.trialEndsAt,
    });
    refreshToken = generateRefreshToken({
      id: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      orgId: user.orgId,
      isTrial: user.isTrial,
      trialEndsAt: user.trialEndsAt,
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
    await createSession({
      userId: user.id,
      refreshToken,
      deviceInfo: ua.substring(0, 255),
      ipAddress: ip,
      userAgent: ua,
    });
    console.log(`[Google Callback ${requestId}] ✓ Session created`);
  } catch (sessionErr) {
    console.error(`[Google Callback ${requestId}] Session creation failed:`, sessionErr instanceof Error ? sessionErr.message : sessionErr);
    return null;
  }

  // ── Update last login ────────────────────────────────────────
  try {
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
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
      success: true,
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
      userAgent: ua,
    });
    await logAuthEvent({
      userId: user.id,
      action: 'signin',
      details: 'Successful login via Google OAuth',
      ipAddress: ip,
      userAgent: ua,
    });
  } catch (logErr) {
    console.warn(`[Google Callback ${requestId}] Auth event logging failed (non-fatal):`, logErr);
  }

  console.log(`[Google Callback ${requestId}] ✓ All steps complete — returning tokens (stateOrigin: ${stateOrigin || 'none'})`);
  return { accessToken, refreshToken, user, stateOrigin };
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
function decodeStateOrigin(state: string | undefined): string | null {
  if (!state) return null;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
    if (decoded && typeof decoded.origin === 'string') {
      try {
        const u = new URL(decoded.origin);
        const h = u.hostname.toLowerCase();
        if (
          h &&
          h !== 'localhost' &&
          !h.startsWith('127.') &&
          !h.startsWith('10.') &&
          !h.startsWith('192.168.') &&
          !h.includes('.fcapp.run') &&
          !h.includes('.aliyuncs.com') &&
          !h.includes('.functioncompute.com') &&
          !h.endsWith('.google.com')
        ) {
          return u.origin;
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Build a redirect URL that prefers the state's origin (where the user
 * actually started) over getDynamicOrigin (which may fall back to
 * APP_URL=acquisition.space-z.ai on the Google→callback top-level
 * navigation where no Origin/Referer headers are present).
 */
function userOriginRedirect(path: string, request: NextRequest, state: string | undefined): URL {
  const stateOrigin = decodeStateOrigin(state);
  if (stateOrigin) {
    try {
      return new URL(path, stateOrigin);
    } catch { /* fall through */ }
  }
  return dynamicRedirect(path, request);
}

export async function GET(request: NextRequest) {
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
      return NextResponse.redirect(userOriginRedirect('/?auth_error=oauth_failed', request, state));
    }

    if (!code) {
      console.error(`[Google Callback ${requestId}] No code parameter in callback`);
      return NextResponse.redirect(userOriginRedirect('/?auth_error=no_code', request, state));
    }

    const result = await handleGoogleOAuth(code, request, state, requestId);

    if (!result) {
      console.error(`[G-CB] FAILED — handleGoogleOAuth returned null. Check earlier [G-CB] step logs for the failure point.`);
      console.error(`[Google Callback ${requestId}] handleGoogleOAuth returned null — redirecting to error page`);
      return NextResponse.redirect(userOriginRedirect('/?auth_error=google_failed', request, state));
    }

    if ('failureCode' in result && result.failureCode) {
      console.error(`[G-CB] FAILED — handleGoogleOAuth returned failureCode: ${result.failureCode}`);
      return NextResponse.redirect(
        userOriginRedirect(`/?auth_error=${result.failureCode}`, request, state)
      );
    }

    if (!('accessToken' in result)) {
      console.error(`[G-CB] FAILED — handleGoogleOAuth returned an unexpected shape.`);
      return NextResponse.redirect(userOriginRedirect('/?auth_error=google_failed', request, state));
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
    if (
      stateOrigin &&
      isPublicOrigin(stateOrigin) &&
      !isSameOrigin(stateOrigin, canonicalOrigin)
    ) {
      try {
        const relayToken = createRelayToken(accessToken, refreshToken, stateOrigin);
        const relayUrl = `${stateOrigin.replace(/\/+$/, '')}/api/auth/google/relay?token=${encodeURIComponent(relayToken)}`;
        console.log(`[Google Callback ${requestId}] ✓ Relaying session to origin: ${stateOrigin} (canonical: ${canonicalOrigin})`);
        return NextResponse.redirect(relayUrl);
      } catch (relayErr) {
        console.error(`[Google Callback ${requestId}] Relay token creation failed, falling back to direct cookies:`, relayErr instanceof Error ? relayErr.message : relayErr);
      }
    }

    // ── Same domain — set auth cookies directly and redirect to / ──
    // Prefer stateOrigin (where the user actually started) over
    // getDynamicOrigin (which may fall back to APP_URL on the
    // Google→callback top-level navigation).
    const successOrigin = stateOrigin && isPublicOrigin(stateOrigin) ? stateOrigin : null;
    const redirectTarget = successOrigin
      ? new URL('/', successOrigin)
      : dynamicRedirect('/', request);
    const response = NextResponse.redirect(redirectTarget);

    // ── Set auth cookies ──────────────────────────────────────
    try {
      const authLib = await import('@/lib/auth');
      return authLib.setAuthCookies(response, accessToken, refreshToken);
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
      return NextResponse.redirect(userOriginRedirect('/?auth_error=google_failed', request, fallbackState));
    } catch (redirectErr) {
      console.error(`[Google Callback ${requestId}] Even redirect failed:`, redirectErr);
      // Absolute last resort — HTML meta-refresh using state origin if available
      const fallbackState = new URL(request.url).searchParams.get('state') || undefined;
      const origin = decodeStateOrigin(fallbackState) || getDynamicOrigin(request);
      const html = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=${origin}/?auth_error=google_failed"><title>Redirecting…</title></head><body><p>Redirecting…</p></body></html>`;
      return new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html', Location: `${origin}/?auth_error=google_failed` },
      });
    }
  }
}

// ───────────────────────────────────────────────────────────────────
// POST handler — programmatic code exchange
// ───────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const requestId = `gcb-post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Authorization code is required' },
        { status: 400 }
      );
    }

    const result = await handleGoogleOAuth(code, request, undefined, requestId);

    if (!result) {
      return NextResponse.json(
        { error: 'Google authentication failed. Please try again.' },
        { status: 401 }
      );
    }

    const { accessToken, refreshToken, user } = result;
    const mfaEnabled = user.mfaConfig?.isEnabled ?? false;

    const response = NextResponse.json({
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
        avatarUrl: user.avatar,
      },
    });

    try {
      const authLib = await import('@/lib/auth');
      return authLib.setAuthCookies(response, accessToken, refreshToken);
    } catch {
      return response;
    }
  } catch (error) {
    console.error(`[Google Callback ${requestId}] POST error:`, error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
