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
// 4. Redirects to / so the user lands on their home page, authenticated
//
// This enables Google OAuth to work across unlimited deployment domains
// while only requiring ONE redirect_uri to be registered in Google Console.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { setAuthCookies } from '@/lib/auth';
import { verifyRelayToken } from '@/lib/oauth-relay';
import { buildRedirectUrl } from '@/lib/app-url';

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

    // Security check: verify the origin in the token matches the current domain.
    // This prevents a token intended for domain A from being used on domain B.
    const currentOrigin = new URL(request.url).origin;
    const expectedOrigin = payload.origin.replace(/\/+$/, '');

    // Allow the relay if the current domain matches the token's origin.
    // Also allow if the token's origin is the canonical redirect_uri domain
    // (which is where the callback runs).
    if (currentOrigin !== expectedOrigin) {
      // The token was meant for a different domain. This can happen if the
      // user manually navigates to the relay URL on the wrong domain.
      // Redirect them to the correct domain's relay endpoint.
      console.warn(`[Google Relay] Origin mismatch: current=${currentOrigin}, expected=${expectedOrigin}. Redirecting to correct domain.`);
      const correctRelayUrl = `${expectedOrigin}/api/auth/google/relay?token=${encodeURIComponent(token)}`;
      return NextResponse.redirect(correctRelayUrl);
    }

    console.log(`[Google Relay] ✓ Token verified. Setting cookies on ${currentOrigin}. nonce=${payload.nonce}`);

    // Set auth cookies on THIS domain and redirect to home
    const response = NextResponse.redirect(buildRedirectUrl('/', request));
    return setAuthCookies(response, payload.accessToken, payload.refreshToken);
  } catch (error) {
    console.error('[Google Relay] Error:', error);
    return NextResponse.redirect(buildRedirectUrl('/?auth_error=relay_failed', request));
  }
}
