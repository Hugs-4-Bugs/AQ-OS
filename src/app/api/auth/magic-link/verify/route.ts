// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Magic Link Verification Route
//
// Handles GET requests when a user clicks a magic link from their email.
// Verifies the token, creates a session, and redirects to the app.
//
// BULLETPROOF DESIGN:
//   - Heavy modules (db, auth) loaded LAZILY via dynamic import inside
//     the handler. If a lazy import fails, we catch it and redirect.
//   - EVERY operation wrapped in its own try-catch:
//       1. Token/email extraction
//       2. Auth module loading
//       3. DB module loading
//       4. User lookup
//       5. Token verification
//       6. Token clearing
//       7. Token generation
//       8. Session creation
//       9. Audit logging
//   - Dynamic origin detection from request.url (rejects FC internal hostnames).
//   - 3-layer error fallback: redirect → HTML meta-refresh → plain text.
//   - NEVER produces a bare "Internal Server Error" page.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ───────────────────────────────────────────────────────────────────
// Dynamic origin helper — extracts origin from request.url, rejects
// internal cloud hostnames, falls back to headers.
// ───────────────────────────────────────────────────────────────────
function getDynamicOrigin(request: NextRequest): string {
  // 0. HIGHEST PRIORITY: explicit public APP_URL env var.
  // This guarantees post-login redirects always land on the public
  // preview domain even when the verify route is reached through an
  // internal/cloud hostname (where request.url origin would be
  // something like 0.0.0.0:3000 or *.fcapp.run).
  const APP_URL = process.env.APP_URL;
  if (APP_URL && /^https?:\/\//.test(APP_URL)) {
    try {
      const u = new URL(APP_URL);
      const h = u.hostname.toLowerCase();
      const isInternalHost =
        h === 'localhost' ||
        h.startsWith('127.') ||
        h.startsWith('0.0.0.0') ||
        h.startsWith('10.') ||
        h.startsWith('192.168.') ||
        h.startsWith('172.') ||
        h.includes('.fcapp.run') ||
        h.includes('.aliyuncs.com') ||
        h.includes('.functioncompute.com');
      if (!isInternalHost) {
        return u.origin;
      }
    } catch { /* fall through */ }
  }

  // 1. Try new URL(request.url).origin — preferred dynamic method
  try {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const isInternal =
      host.includes('.fcapp.run') ||
      host.includes('.aliyuncs.com') ||
      host.includes('.functioncompute.com') ||
      host.startsWith('0.0.0.0') ||
      host.startsWith('127.0.0.1') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('172.');
    if (!isInternal) {
      return url.origin;
    }
  } catch {
    // fall through
  }

  // 2. Origin header — NOT stripped by FC gateway
  const originHeader = request.headers.get('origin');
  if (originHeader) {
    try {
      const u = new URL(originHeader);
      const h = u.hostname.toLowerCase();
      if (h && !h.includes('.fcapp.run') && !h.includes('.aliyuncs.com')) {
        return u.origin;
      }
    } catch {}
  }

  // 3. Referer header — also not stripped by FC gateway
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const u = new URL(referer);
      const h = u.hostname.toLowerCase();
      if (h && !h.includes('.fcapp.run') && !h.includes('.aliyuncs.com')) {
        return u.origin;
      }
    } catch {}
  }

  // 4. X-Forwarded-Host
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  if (forwardedHost) {
    const h = forwardedHost.toLowerCase();
    if (!h.includes('.fcapp.run') && !h.includes('.aliyuncs.com')) {
      return `${forwardedProto}://${forwardedHost}`;
    }
  }

  // 5. Last resort: return raw origin from request.url even if internal
  try {
    return new URL(request.url).origin;
  } catch {
    return 'https://acquisition.space-z.ai';
  }
}

/** Build a redirect URL using dynamic origin */
function dynamicRedirect(path: string, request: NextRequest): URL {
  const origin = getDynamicOrigin(request);
  try {
    return new URL(path, origin);
  } catch {
    return new URL(path, 'https://acquisition.space-z.ai');
  }
}

/**
 * Build a minimal HTML response that redirects the user to a URL.
 * Used as a last-resort fallback if NextResponse.redirect fails.
 */
function htmlRedirectResponse(targetUrl: string, status: 302 | 307 = 302): NextResponse {
  const safeUrl = targetUrl.replace(/"/g, '&quot;');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=${safeUrl}">
  <title>Redirecting…</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fafafa; }
    .card { text-align: center; padding: 2rem; }
    a { color: #3b82f6; }
  </style>
</head>
<body>
  <div class="card">
    <p>Redirecting to AcquisitionOS…</p>
    <p>If you are not redirected automatically, <a href="${safeUrl}">click here</a>.</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Location': targetUrl,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

// ───────────────────────────────────────────────────────────────────
// GET handler — magic links are clicked from email (GET request)
// ───────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const requestId = `mlv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.log(`[Magic Link Verify ${requestId}] ===== GET request received =====`);
  console.log(`[Magic Link Verify ${requestId}] request.url=${request.url}`);
  console.log(`[Magic Link Verify ${requestId}] origin header=${request.headers.get('origin') || 'NONE'}`);
  console.log(`[Magic Link Verify ${requestId}] host header=${request.headers.get('host') || 'NONE'}`);
  console.log(`[Magic Link Verify ${requestId}] x-forwarded-host=${request.headers.get('x-forwarded-host') || 'NONE'}`);

  try {
    // ── Step 1: Extract token and email ──────────────────────
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const email = searchParams.get('email');

    console.log(`[Magic Link Verify ${requestId}] token=${token ? token.slice(0, 8) + '...' : 'MISSING'}, email=${email || 'MISSING'}`);

    if (!token || !email) {
      console.warn(`[Magic Link Verify ${requestId}] Missing token or email — redirecting to missing_params`);
      return NextResponse.redirect(dynamicRedirect('/?auth_error=missing_params', request));
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ── Step 2: Lazy-load auth utilities ─────────────────────
    console.log(`[Magic Link Verify ${requestId}] Lazy-loading auth modules...`);
    let authLib: any;
    try {
      authLib = await import('@/lib/auth');
    } catch (authErr) {
      console.error(`[Magic Link Verify ${requestId}] FATAL: Failed to load @/lib/auth:`, authErr instanceof Error ? authErr.message : authErr);
      return NextResponse.redirect(dynamicRedirect('/?auth_error=server_error', request));
    }

    const { validateEmail, generateAccessToken, generateRefreshToken, createSession, recordLoginAttempt, logAuthEvent, getClientIp, getUserAgent, setAuthCookies, secureCompare } = authLib;

    if (!validateEmail(normalizedEmail)) {
      console.warn(`[Magic Link Verify ${requestId}] Invalid email format — redirecting to invalid_email`);
      return NextResponse.redirect(dynamicRedirect('/?auth_error=invalid_email', request));
    }

    // ── Step 3: Lazy-load DB ─────────────────────────────────
    console.log(`[Magic Link Verify ${requestId}] Lazy-loading db module...`);
    let db: any;
    try {
      const dbMod = await import('@/lib/db');
      db = dbMod.db;
    } catch (dbErr) {
      console.error(`[Magic Link Verify ${requestId}] FATAL: Failed to load @/lib/db:`, dbErr instanceof Error ? dbErr.message : dbErr);
      return NextResponse.redirect(dynamicRedirect('/?auth_error=server_error', request));
    }

    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    // ── Step 4: Find user ────────────────────────────────────
    let user: any;
    try {
      console.log(`[Magic Link Verify ${requestId}] Looking up user by email: ${normalizedEmail}`);
      user = await db.user.findUnique({
        where: { email: normalizedEmail },
        include: { mfaConfig: true },
      });
      console.log(`[Magic Link Verify ${requestId}] User found: ${!!user}${user ? ` (id=${user.id}, active=${user.isActive})` : ''}`);
    } catch (dbErr) {
      console.error(`[Magic Link Verify ${requestId}] User lookup failed:`, dbErr instanceof Error ? dbErr.message : dbErr);
      return NextResponse.redirect(dynamicRedirect('/?auth_error=server_error', request));
    }

    if (!user) {
      console.warn(`[Magic Link Verify ${requestId}] No user found — redirecting to invalid_link`);
      return NextResponse.redirect(dynamicRedirect('/?auth_error=invalid_link', request));
    }

    // ── Step 5: Verify token matches ─────────────────────────
    console.log(`[Magic Link Verify ${requestId}] Stored token: ${user.magicLinkToken ? user.magicLinkToken.slice(0, 8) + '...' : 'NULL'}, Expiry: ${user.magicLinkTokenExpiry?.toISOString() || 'NULL'}`);
    try {
      if (!user.magicLinkToken || !secureCompare(user.magicLinkToken, token)) {
        console.warn(`[Magic Link Verify ${requestId}] Token mismatch — redirecting to invalid_link`);
        return NextResponse.redirect(dynamicRedirect('/?auth_error=invalid_link', request));
      }
    } catch (compareErr) {
      console.error(`[Magic Link Verify ${requestId}] secureCompare crashed:`, compareErr);
      return NextResponse.redirect(dynamicRedirect('/?auth_error=server_error', request));
    }

    // ── Step 6: Check expiry ─────────────────────────────────
    try {
      if (!user.magicLinkTokenExpiry || new Date() > user.magicLinkTokenExpiry) {
        console.warn(`[Magic Link Verify ${requestId}] Token expired — redirecting to expired_link`);
        return NextResponse.redirect(dynamicRedirect('/?auth_error=expired_link', request));
      }
    } catch (expiryErr) {
      console.error(`[Magic Link Verify ${requestId}] Expiry check crashed:`, expiryErr);
      return NextResponse.redirect(dynamicRedirect('/?auth_error=server_error', request));
    }

    console.log(`[Magic Link Verify ${requestId}] Token valid — proceeding with login`);

    // ── Step 7: Clear token fields ───────────────────────────
    try {
      await db.user.update({
        where: { id: user.id },
        data: {
          magicLinkToken: null,
          magicLinkTokenExpiry: null,
        },
      });
    } catch (clearErr) {
      console.error(`[Magic Link Verify ${requestId}] Token clear failed:`, clearErr instanceof Error ? clearErr.message : clearErr);
      // Non-fatal — continue with login
    }

    // ── Step 8: Auto-verify email ────────────────────────────
    if (!user.emailVerified) {
      try {
        await db.user.update({
          where: { id: user.id },
          data: { emailVerified: true },
        });
      } catch (verifyErr) {
        console.warn(`[Magic Link Verify ${requestId}] Email verification update failed (non-fatal):`, verifyErr);
      }
    }

    // ── Step 9: Check if account is active ───────────────────
    if (!user.isActive) {
      // Anti-enumeration: don't reveal that account exists but is deactivated
      return NextResponse.redirect(dynamicRedirect('/?auth_error=invalid_link', request));
    }

    // ── Step 10: Generate tokens ─────────────────────────────
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
    } catch (tokenGenErr) {
      console.error(`[Magic Link Verify ${requestId}] Token generation failed:`, tokenGenErr instanceof Error ? tokenGenErr.message : tokenGenErr);
      return NextResponse.redirect(dynamicRedirect('/?auth_error=server_error', request));
    }

    // ── Step 11: Create session ──────────────────────────────
    try {
      await createSession({
        userId: user.id,
        refreshToken,
        deviceInfo: ua.substring(0, 255),
        ipAddress: ip,
        userAgent: ua,
      });
    } catch (sessionErr) {
      console.error(`[Magic Link Verify ${requestId}] Session creation failed:`, sessionErr instanceof Error ? sessionErr.message : sessionErr);
      return NextResponse.redirect(dynamicRedirect('/?auth_error=session_failed', request));
    }

    // ── Step 12: Update last login ───────────────────────────
    try {
      await db.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    } catch (updateErr) {
      console.warn(`[Magic Link Verify ${requestId}] lastLoginAt update failed (non-fatal):`, updateErr);
    }

    // ── Step 13: Record successful login & audit ─────────────
    try {
      await recordLoginAttempt({
        userId: user.id,
        ip,
        userAgent: ua,
        success: true,
      });
    } catch (recordErr) {
      console.warn(`[Magic Link Verify ${requestId}] recordLoginAttempt failed (non-fatal):`, recordErr);
    }

    try {
      await logAuthEvent({
        userId: user.id,
        action: 'magic_link_used',
        details: 'Successful magic link login',
        ipAddress: ip,
        userAgent: ua,
      });
      await logAuthEvent({
        userId: user.id,
        action: 'signin',
        details: 'Successful login via magic link',
        ipAddress: ip,
        userAgent: ua,
      });
    } catch (logErr) {
      console.warn(`[Magic Link Verify ${requestId}] Auth event logging failed (non-fatal):`, logErr);
    }

    // ── Step 14: Redirect to home with auth cookies ──────────
    console.log(`[Magic Link Verify ${requestId}] ✓ Login successful — redirecting to home with auth cookies`);
    const response = NextResponse.redirect(dynamicRedirect('/', request));
    return setAuthCookies(response, accessToken, refreshToken);
  } catch (error) {
    // CRITICAL: This catch block must NEVER throw. We log the error
    // and return a redirect. If the redirect somehow fails, we return
    // an HTML meta-refresh page. There is NO path that produces a bare
    // "Internal Server Error" response.
    const errMsg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const errStack = error instanceof Error ? error.stack : '';
    console.warn(`[Magic Link Verify ${requestId}] ✗ GET error: ${errMsg}`);
    if (errStack) console.warn(`[Magic Link Verify ${requestId}] Stack: ${errStack}`);

    // Try to redirect to the app with an error flag
    try {
      const errorUrl = dynamicRedirect('/?auth_error=server_error', request);
      console.warn(`[Magic Link Verify ${requestId}] Redirecting to ${errorUrl.toString()}`);
      return NextResponse.redirect(errorUrl);
    } catch (redirectErr) {
      console.warn(`[Magic Link Verify ${requestId}] NextResponse.redirect failed: ${redirectErr}`);
      // Fall back to HTML meta-refresh redirect
      try {
        const fallbackUrl = getDynamicOrigin(request) + '/?auth_error=server_error';
        return htmlRedirectResponse(fallbackUrl);
      } catch (htmlErr) {
        console.warn(`[Magic Link Verify ${requestId}] HTML redirect also failed: ${htmlErr}`);
        // Absolute last resort — return a simple text response
        return new NextResponse(
          'Authentication error. Please return to the app and try again.',
          { status: 200, headers: { 'Content-Type': 'text/plain' } }
        );
      }
    }
  }
}

// ───────────────────────────────────────────────────────────────────
// POST handler — for API-based verification
// ───────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const requestId = `mlv-post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const body = await request.json();
    const { email, token } = body;

    // ── Validation ──────────────────────────────────────────────
    if (!email || !token) {
      return NextResponse.json(
        { error: 'Email and token are required' },
        { status: 400 }
      );
    }

    // ── Lazy-load auth + db ─────────────────────────────────────
    const authLib = await import('@/lib/auth');
    const { validateEmail, generateAccessToken, generateRefreshToken, createSession, recordLoginAttempt, logAuthEvent, getClientIp, getUserAgent, setAuthCookies, secureCompare } = authLib;
    const dbMod = await import('@/lib/db');
    const { db } = dbMod;

    if (typeof email !== 'string' || !validateEmail(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    if (typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    // ── Find user ───────────────────────────────────────────────
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      include: { mfaConfig: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or expired magic link' },
        { status: 401 }
      );
    }

    // ── Verify token matches ──
    if (!user.magicLinkToken || !secureCompare(user.magicLinkToken, token)) {
      return NextResponse.json(
        { error: 'Invalid or expired magic link' },
        { status: 401 }
      );
    }

    // ── Check expiry ──
    if (!user.magicLinkTokenExpiry || new Date() > user.magicLinkTokenExpiry) {
      return NextResponse.json(
        { error: 'Magic link has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    // ── Clear token fields ──────────────────────────────────────
    await db.user.update({
      where: { id: user.id },
      data: {
        magicLinkToken: null,
        magicLinkTokenExpiry: null,
      },
    });

    // ── Auto-verify email ──
    if (!user.emailVerified) {
      await db.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
    }

    // ── Check if account is active ──────────────────────────────
    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Invalid or expired magic link' },
        { status: 401 }
      );
    }

    // ── Generate tokens ─────────────────────────────────────────
    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      orgId: user.orgId,
      isTrial: user.isTrial,
      trialEndsAt: user.trialEndsAt,
    });

    const refreshToken = generateRefreshToken({
      id: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      orgId: user.orgId,
      isTrial: user.isTrial,
      trialEndsAt: user.trialEndsAt,
    });

    // ── Create session ──────────────────────────────────────────
    await createSession({
      userId: user.id,
      refreshToken,
      deviceInfo: ua.substring(0, 255),
      ipAddress: ip,
      userAgent: ua,
    });

    // ── Update last login ───────────────────────────────────────
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // ── Record successful login & audit ─────────────────────────
    await recordLoginAttempt({
      userId: user.id,
      ip,
      userAgent: ua,
      success: true,
    });

    await logAuthEvent({
      userId: user.id,
      action: 'magic_link_used',
      details: 'Successful magic link login',
      ipAddress: ip,
      userAgent: ua,
    });

    await logAuthEvent({
      userId: user.id,
      action: 'signin',
      details: 'Successful login via magic link',
      ipAddress: ip,
      userAgent: ua,
    });

    // ── Build response ──────────────────────────────────────────
    const mfaEnabled = user.mfaConfig?.isEnabled ?? false;

    const response = NextResponse.json({
      message: 'Signed in successfully via magic link',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        plan: user.plan || 'free',
        orgId: user.orgId,
        emailVerified: true,
        mfaEnabled,
        avatarUrl: user.avatar,
      },
    });

    return setAuthCookies(response, accessToken, refreshToken);
  } catch (error) {
    console.warn(`[Magic Link Verify ${requestId}] POST error:`, error instanceof Error ? `${error.message}\n${error.stack}` : String(error));
    return NextResponse.json(
      { error: 'Internal server error', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}
