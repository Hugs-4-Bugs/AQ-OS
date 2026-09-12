// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Google OAuth Callback Route (/api/auth/google/callback)
//
// This is the LEGACY callback route. It performs the same logic as
// /api/auth/callback/google but uses /api/auth/google/callback as the
// redirect_uri.
//
// BULLETPROOF DESIGN (same as /api/auth/callback/google):
//   - ALL heavy modules loaded LAZILY via dynamic import.
//   - EVERY operation wrapped in its own try-catch (Causes A-F).
//   - Dynamic origin detection from request.url.
//   - Every step logged with console.log for visibility.
//   - On ANY error: redirect to /?auth_error=description
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ───────────────────────────────────────────────────────────────────
// Dynamic origin helper — same implementation as the primary callback
//
// CRITICAL: `localhost` MUST be in the rejected list — at deploy time
// on GLM platform, request.url can resolve to http://localhost:3000/...
// because the platform's load balancer terminates TLS and forwards
// internally. If we don't reject `localhost`, error redirects go to
// localhost:3000/?auth_error=... which the user's browser cannot reach.
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

  // 4. Origin header
  const originHeader = request.headers.get('origin');
  if (originHeader) {
    try {
      const u = new URL(originHeader);
      if (!isBadHost(u.hostname.toLowerCase())) return u.origin;
    } catch {}
  }

  // 5. Referer header — accounts.google.com rejected via isBadHost
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const u = new URL(referer);
      if (!isBadHost(u.hostname.toLowerCase())) return u.origin;
    } catch {}
  }

  // 6. Env-var fallback
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
    } catch {}
  }

  // 7. Last resort: active preview workspace deployment
  return 'https://preview-chat-ab88c1b0-d6fd-4199-b9d5-ec3a018502fc.space-z.ai';
}

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
// Token-exchange error classification (mirrors the primary callback).
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
 * Handle the Google OAuth callback for the /api/auth/google/callback path.
 * Returns either the tokens+user on success, or `{ failureCode }` for a
 * classified failure (so the GET handler can redirect with the most
 * helpful auth_error code), or `null` for hard failures.
 */
async function handleGoogleOAuthCallback(
  code: string,
  request: NextRequest,
  stateFromQuery: string | undefined,
  requestId: string
): Promise<
  | { accessToken: string; refreshToken: string; user: any }
  | { failureCode: GoogleFailureCode }
  | null
> {
  // ── Credentials ──────────────────────────────────────────────
  let clientId: string | undefined;
  let clientSecret: string | undefined;
  try {
    clientId = process.env.GOOGLE_CLIENT_ID;
    clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    console.log(`[Google CB2 ${requestId}] clientId=${clientId ? 'SET' : 'MISSING'}, clientSecret=${clientSecret ? 'SET' : 'MISSING'}`);
  } catch (err) {
    console.error(`[Google CB2 ${requestId}] Failed to read env:`, err);
    return null;
  }

  if (!clientId || !clientSecret) {
    console.error(`[Google CB2 ${requestId}] Missing credentials`);
    return null;
  }

  // ── CAUSE A: State parameter decoding ────────────────────────
  let redirectUri: string;
  try {
    if (stateFromQuery) {
      const decoded = JSON.parse(
        Buffer.from(stateFromQuery, 'base64url').toString('utf-8')
      );
      if (decoded.redirectUri) {
        redirectUri = decoded.redirectUri;
        console.log(`[Google CB2 ${requestId}] redirect_uri from state: ${redirectUri}`);
      } else {
        throw new Error('No redirectUri in state');
      }
    } else {
      throw new Error('No state parameter');
    }
  } catch (stateErr) {
    console.error(`[Google CB2 ${requestId}] State decode failed:`, stateErr instanceof Error ? stateErr.message : stateErr);
    // CAUSE C — fallback: derive from dynamic origin
    try {
      const origin = getDynamicOrigin(request);
      redirectUri = `${origin}/api/auth/google/callback`;
      console.log(`[Google CB2 ${requestId}] redirect_uri from fallback: ${redirectUri}`);
    } catch {
      return null;
    }
  }

  // ── Lazy-load auth + db ──────────────────────────────────────
  let authLib: any;
  let db: any;
  try {
    authLib = await import('@/lib/auth');
    const dbMod = await import('@/lib/db');
    db = dbMod.db;
    console.log(`[Google CB2 ${requestId}] Auth + DB modules loaded`);
  } catch (modErr) {
    console.error(`[Google CB2 ${requestId}] FATAL: Module load failed:`, modErr instanceof Error ? modErr.message : modErr);
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

  const ip = getClientIp?.(request) || 'unknown';
  const ua = getUserAgent?.(request) || 'unknown';

  // ── CAUSE B: Token exchange ──────────────────────────────────
  let tokenData: GoogleTokenResponse;
  try {
    console.log(`[Google CB2 ${requestId}] Exchanging code for tokens...`);
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
      console.error(`[Google CB2 ${requestId}] ✗ Token exchange FAILED (${tokenResponse.status}):`, errorData);
      return { failureCode: classifyTokenExchangeFailure(tokenResponse.status, errorData) };
    }

    tokenData = await tokenResponse.json();
    console.log(`[Google CB2 ${requestId}] ✓ Token exchange successful`);
  } catch (tokenErr) {
    console.error(`[Google CB2 ${requestId}] Token exchange crashed:`, tokenErr instanceof Error ? tokenErr.message : tokenErr);
    return null;
  }

  // ── CAUSE D: Profile fetch ───────────────────────────────────
  let googleUser: GoogleUserInfo;
  try {
    console.log(`[Google CB2 ${requestId}] Fetching user profile...`);
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileResponse.ok) {
      console.error(`[Google CB2 ${requestId}] ✗ Profile fetch failed (${profileResponse.status})`);
      return null;
    }

    googleUser = await profileResponse.json();
    console.log(`[Google CB2 ${requestId}] ✓ Profile fetched: ${googleUser.email}`);
  } catch (profileErr) {
    console.error(`[Google CB2 ${requestId}] Profile fetch crashed:`, profileErr instanceof Error ? profileErr.message : profileErr);
    return null;
  }

  if (!googleUser.email) {
    console.error(`[Google CB2 ${requestId}] No email in profile`);
    return null;
  }

  const normalizedEmail = googleUser.email.toLowerCase().trim();

  // ── CAUSE E: DB find/create user ─────────────────────────────
  let user: any;
  try {
    console.log(`[Google CB2 ${requestId}] Looking up user: ${normalizedEmail}`);
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
      console.log(`[Google CB2 ${requestId}] Existing user: id=${user.id}, active=${user.isActive}, authProvider=${user.authProvider}, plan=${user.plan}, role=${user.role}`);
      if (!user.googleId && googleUser.sub) {
        await db.user.update({
          where: { id: user.id },
          data: { googleId: googleUser.sub },
        });
      }
      // FIX (2026-09-09): Same backfill/reactivate logic as the primary
      // callback at /api/auth/callback/google — reactivates inactive
      // accounts and backfills missing plan/role/trial fields so
      // already-registered email/password users can sign in with Google.
      const backfillData: Record<string, unknown> = {};
      if (!user.isActive) {
        console.warn(`[Google CB2 ${requestId}] User inactive — reactivating for Google sign-in`);
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
        backfillData.authProvider = 'google';
      }
      if (Object.keys(backfillData).length > 0) {
        try {
          await db.user.update({
            where: { id: user.id },
            data: backfillData,
          });
          user = { ...user, ...backfillData } as typeof user;
          console.log(`[Google CB2 ${requestId}] ✓ Backfilled: ${Object.keys(backfillData).join(', ')}`);
        } catch (backfillErr) {
          console.error(`[Google CB2 ${requestId}] Backfill failed:`, backfillErr instanceof Error ? backfillErr.message : backfillErr);
        }
      }
    } else {
      console.log(`[Google CB2 ${requestId}] Creating new user`);
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
      console.log(`[Google CB2 ${requestId}] ✓ New user: id=${user.id}`);

      try {
        await logAuthEvent({
          userId: user.id,
          action: 'signup',
          details: `New account via Google OAuth for ${normalizedEmail}`,
          ipAddress: ip,
          userAgent: ua,
        });
      } catch (logErr) {
        console.warn(`[Google CB2 ${requestId}] Signup log failed (non-fatal):`, logErr);
      }
    }
  } catch (dbErr) {
    console.error(`[Google CB2 ${requestId}] DB operation failed:`, dbErr instanceof Error ? dbErr.message : dbErr);
    return null;
  }

  // ── Generate tokens ──────────────────────────────────────────
  let accessToken: string;
  let refreshToken: string;
  try {
    accessToken = generateAccessToken({
      id: user.id, email: user.email, role: user.role,
      plan: user.plan, orgId: user.orgId,
      isTrial: user.isTrial, trialEndsAt: user.trialEndsAt,
    });
    refreshToken = generateRefreshToken({
      id: user.id, email: user.email, role: user.role,
      plan: user.plan, orgId: user.orgId,
      isTrial: user.isTrial, trialEndsAt: user.trialEndsAt,
    });
    console.log(`[Google CB2 ${requestId}] ✓ Tokens generated`);
  } catch (tokenGenErr) {
    console.error(`[Google CB2 ${requestId}] Token generation failed:`, tokenGenErr);
    return null;
  }

  // ── CAUSE F: Session creation ────────────────────────────────
  try {
    console.log(`[Google CB2 ${requestId}] Creating session...`);
    await createSession({
      userId: user.id,
      refreshToken,
      deviceInfo: ua.substring(0, 255),
      ipAddress: ip,
      userAgent: ua,
    });
    console.log(`[Google CB2 ${requestId}] ✓ Session created`);
  } catch (sessionErr) {
    console.error(`[Google CB2 ${requestId}] Session creation failed:`, sessionErr instanceof Error ? sessionErr.message : sessionErr);
    return null;
  }

  // ── Update last login ────────────────────────────────────────
  try {
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
  } catch (updateErr) {
    console.warn(`[Google CB2 ${requestId}] lastLoginAt update failed (non-fatal):`, updateErr);
  }

  // ── Audit logs ───────────────────────────────────────────────
  try {
    await recordLoginAttempt({ userId: user.id, ip, userAgent: ua, success: true });
  } catch (recordErr) {
    console.warn(`[Google CB2 ${requestId}] recordLoginAttempt failed (non-fatal):`, recordErr);
  }

  try {
    await logAuthEvent({
      userId: user.id, action: 'google_oauth_login',
      details: 'Successful Google OAuth login', ipAddress: ip, userAgent: ua,
    });
    await logAuthEvent({
      userId: user.id, action: 'signin',
      details: 'Successful login via Google OAuth', ipAddress: ip, userAgent: ua,
    });
  } catch (logErr) {
    console.warn(`[Google CB2 ${requestId}] Auth event logging failed (non-fatal):`, logErr);
  }

  console.log(`[Google CB2 ${requestId}] ✓ All steps complete`);
  return { accessToken, refreshToken, user };
}

// ───────────────────────────────────────────────────────────────────
// GET handler
// ───────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const requestId = `gcb2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.log(`[Google CB2 ${requestId}] ===== CALLBACK REACHED =====`);

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state') || undefined;
    const error = searchParams.get('error');

    console.log(`[Google CB2 ${requestId}] code=${code ? 'PRESENT' : 'MISSING'}, state=${state ? 'PRESENT' : 'MISSING'}, error=${error || 'none'}`);

    if (error) {
      console.error(`[Google CB2 ${requestId}] OAuth error:`, error);
      return NextResponse.redirect(dynamicRedirect('/?auth_error=oauth_failed', request));
    }

    if (!code) {
      return NextResponse.redirect(dynamicRedirect('/?auth_error=no_code', request));
    }

    const result = await handleGoogleOAuthCallback(code, request, state, requestId);

    if (!result) {
      console.error(`[Google CB2 ${requestId}] handleGoogleOAuthCallback returned null`);
      return NextResponse.redirect(dynamicRedirect('/?auth_error=google_failed', request));
    }

    if ('failureCode' in result && result.failureCode) {
      console.error(`[Google CB2 ${requestId}] failureCode: ${result.failureCode}`);
      return NextResponse.redirect(
        dynamicRedirect(`/?auth_error=${result.failureCode}`, request)
      );
    }

    if (!('accessToken' in result)) {
      console.error(`[Google CB2 ${requestId}] unexpected result shape`);
      return NextResponse.redirect(dynamicRedirect('/?auth_error=google_failed', request));
    }

    const { accessToken, refreshToken } = result;
    console.log(`[Google CB2 ${requestId}] ✓ SUCCESS — redirecting to home`);

    const response = NextResponse.redirect(dynamicRedirect('/', request));

    try {
      const authLib = await import('@/lib/auth');
      return authLib.setAuthCookies(response, accessToken, refreshToken);
    } catch (cookieErr) {
      console.error(`[Google CB2 ${requestId}] setAuthCookies failed:`, cookieErr);
      return response;
    }
  } catch (error) {
    console.error(`[Google CB2 ${requestId}] ✗ FATAL unhandled error:`, error instanceof Error ? `${error.message}\n${error.stack}` : String(error));
    try {
      return NextResponse.redirect(dynamicRedirect('/?auth_error=google_failed', request));
    } catch (redirectErr) {
      console.error(`[Google CB2 ${requestId}] Even redirect failed:`, redirectErr);
      const origin = getDynamicOrigin(request);
      const html = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=${origin}/?auth_error=google_failed"><title>Redirecting…</title></head><body><p>Redirecting…</p></body></html>`;
      return new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html', Location: `${origin}/?auth_error=google_failed` },
      });
    }
  }
}
