// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — /api/auth/google/relay
//
// Cross-domain OAuth relay endpoint.
//
// When Google OAuth completes on the canonical redirect_uri domain (which
// may differ from the domain the user started on), the callback signs a
// short-lived JWT containing the auth tokens and redirects here.
//
// This endpoint:
// 1. Verifies the relay JWT (signed with JWT_SECRET, expires in 60s)
// 2. Extracts the access_token and refresh_token
// 3. Sets them as httpOnly cookies on THIS domain (the user's origin)
// 4. Redirects to the user's origin so they land on their home page,
//    authenticated
//
// This enables Google OAuth to work across unlimited deployment domains
// while only requiring ONE redirect_uri to be registered in Google Console.
//
// LOOP-SAFETY FIX (2026-09-23):
// Behind gateways that strip/rewrite the Host header (e.g. the Aliyun-FC-
// style preview gateway), `new URL(request.url).origin` does NOT resolve to
// the public origin. The previous code compared that raw value with the
// token's origin and, on mismatch, redirected to the token-origin relay
// URL — which is the exact URL the browser is already on. Result: an
// infinite same-URL redirect loop (ERR_TOO_MANY_REDIRECTS).
//
// New behavior:
//  - If a public origin CAN be confidently derived from request headers and
//    it differs from the token origin, keep the original cross-domain
//    redirect (the replay genuinely landed on the wrong domain).
//  - If the public origin CANNOT be confidently determined, finish the flow
//    here: the token was minted seconds earlier by our own callback, the
//    browser is by construction on the origin the callback redirected it
//    to, so we set cookies on this response (cookies bind to the browser's
//    actual host) and land the user on the token's origin. No self-redirect.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { setAuthCookies, readRememberMeCookie } from '@/lib/auth';
import { verifyRelayToken, relayHopGuardValue } from '@/lib/oauth-relay';
import { buildRedirectUrl, getOriginFromRequest } from '@/lib/app-url';

/** Reject origins that must never be a relay landing target. */
function isSafeRelayOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    const h = u.hostname.toLowerCase();
    if (
      !u.origin ||
      u.protocol !== 'https:' ||
      !h ||
      h === 'localhost' ||
      h.startsWith('0.0.0.0') ||
      h.startsWith('127.') ||
      h.startsWith('10.') ||
      h.startsWith('192.168.') ||
      h.startsWith('172.') ||
      h.includes('.fcapp.run') ||
      h.includes('.aliyuncs.com') ||
      h.includes('.functioncompute.com') ||
      h.endsWith('.google.com')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      console.error('[Google Relay] No token provided');
      return NextResponse.redirect(buildRedirectUrl('/?auth_error=relay_no_token', request));
    }

    const payload = verifyRelayToken(token);

    if (!payload) {
      console.error('[Google Relay] Token verification failed (invalid or expired)');
      return NextResponse.redirect(buildRedirectUrl('/?auth_error=relay_invalid_token', request));
    }

    // Defense in depth: never land the user on a non-public origin, even if
    // a malformed token claimed one.
    const landingOrigin = payload.origin.replace(/\/+$/, '');
    if (!isSafeRelayOrigin(landingOrigin)) {
      console.error(`[Google Relay] Token origin is not a safe public origin — rejecting. nonce=${payload.nonce}`);
      return NextResponse.redirect(buildRedirectUrl('/?auth_error=relay_invalid_token', request));
    }

    // Security check: verify the origin in the token matches the current
    // domain. This prevents a token intended for domain A from being used
    // on domain B. ONLY trust this comparison when the current public origin
    // can be CONFIDENTLY derived from request headers (see LOOP-SAFETY note
    // above — raw request.url is unreliable behind stripping gateways).
    const confidentOrigin = getOriginFromRequest(request);
    const expectedOrigin = payload.origin.replace(/\/+$/, '');

    if (confidentOrigin && confidentOrigin.replace(/\/+$/, '') !== expectedOrigin) {
      // The token was meant for a different domain and we KNOW which domain
      // we are on. Redirect to the correct domain's relay endpoint — UNLESS
      // the browser has ALREADY followed that exact redirect once.
      //
      // SELF-LOOP GUARD (2026-09-23): when a gateway reports a STALE public
      // host (e.g. x-forwarded-host of a previous preview domain), the
      // redirect target below is the EXACT URL the browser is already on,
      // and redirecting again loops forever (ERR_TOO_MANY_REDIRECTS).
      // The one-hop marker cookie (HMAC of nonce+origin, server-keyed —
      // see relayHopGuardValue) proves this relay already redirected once
      // for THIS token; on the second pass we finish the flow here instead.
      // Cookies bind to the browser's real host, which by construction is
      // the token's expected origin, so landing here is correct.
      const correctRelayUrl = `${expectedOrigin}/api/auth/google/relay?token=${encodeURIComponent(token)}`;
      const expectedHop = relayHopGuardValue(payload.nonce, expectedOrigin);
      const hopCookie = request.cookies.get('g_relay_hop')?.value;

      if (hopCookie === expectedHop) {
        console.warn(`[Google Relay] Hop marker present — a previous redirect already targeted this URL. Finishing relay here to avoid a self-loop. nonce=${payload.nonce}`);
      } else {
        console.warn(`[Google Relay] Origin mismatch: current=${confidentOrigin}, expected=${expectedOrigin}. Redirecting to correct domain (one hop).`);
        const hopResponse = NextResponse.redirect(correctRelayUrl);
        hopResponse.cookies.set('g_relay_hop', expectedHop, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/api/auth/google/relay', // scoped to the relay endpoint only
          maxAge: 120, // relay tokens live 60s; cover one redirect + slack
        });
        return hopResponse;
      }
    }

    if (!confidentOrigin) {
      // Gateway stripped/rewrote the Host headers — the public origin cannot
      // be determined server-side. The browser IS on the token's origin (the
      // callback redirected it there moments ago), so finish the flow here
      // instead of redirecting to the same URL (which looped forever).
      console.warn(`[Google Relay] Public origin not derivable from headers (gateway strips Host). Finishing relay on browser origin. nonce=${payload.nonce}`);
    }

    console.log(`[Google Relay] ✓ Token verified. Setting cookies and landing on ${landingOrigin}. nonce=${payload.nonce}`);

    // Set auth cookies on the browser's current domain (cookies bind to
    // whatever host this response is delivered to) and redirect to the
    // token's (public) origin so the user lands on their home page.
    const response = NextResponse.redirect(new URL('/', landingOrigin));
    // P5: honor the remember-me choice made on the sign-in page (the
    // 10-minute choice cookie is still alive during the relay hop).
    return setAuthCookies(response, payload.accessToken, payload.refreshToken, {
      persist: readRememberMeCookie(request),
    });
  } catch (error) {
    console.error('[Google Relay] Error:', error);
    return NextResponse.redirect(buildRedirectUrl('/?auth_error=relay_failed', request));
  }
}
