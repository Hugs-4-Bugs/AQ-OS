import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getAppUrl } from '@/lib/app-url';
import { withRateLimit } from '@/lib/security/rate-limiter';

export async function GET(request: NextRequest) {
  // Rate limit: 10 Google auth initiations per minute per IP
  const rateLimitResult = withRateLimit(request, 'auth');
  if (rateLimitResult) return rateLimitResult;

  try {
    // Credentials are validated at token exchange time in the callback route.
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error('[Google Auth] GOOGLE_CLIENT_ID is not set');
      return NextResponse.redirect(new URL('/auth/signin?error=google_auth_failed', getAppUrl(request)));
    }

    // getAppUrl() now uses dynamic origin detection from request headers
    // (origin / referer / x-forwarded-host). When user is on preview domain,
    // this returns the preview domain URL; when on production, returns
    // production URL. CRITICAL: redirect_uri must match the domain the user
    // is currently on, otherwise Google will redirect them to a different
    // domain after authentication, losing their session.
    const appUrl = getAppUrl(request);
    const redirectUri = `${appUrl}/api/auth/google/callback`;

    // Build a state containing nonce + redirectUri + origin so the callback
    // can reconstruct the EXACT same redirect_uri for token exchange.
    const origin = appUrl;
    const statePayload = JSON.stringify({
      nonce: randomBytes(16).toString('base64url'),
      redirectUri,
      origin,
    });
    const state = Buffer.from(statePayload).toString('base64url');

    const scope = 'openid email profile';

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${state}` +
      `&access_type=offline` +
      `&prompt=select_account consent`;

    console.warn(`[Google Auth] Redirecting to Google. redirectUri=${redirectUri}, appUrl=${appUrl}, host=${request.headers.get('host') || 'NONE'}, origin-header=${request.headers.get('origin') || 'NONE'}`);

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('[Google Auth] Error creating auth URL:', error);
    return NextResponse.redirect(new URL('/auth/signin?error=google_auth_failed', getAppUrl(request)));
  }
}
