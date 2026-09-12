import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getGoogleClientSecret } from '@/lib/email-ethereal';

export async function GET(request: NextRequest) {
  try {
    // Credentials are validated at token exchange time in the callback route.
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error('[Google OAuth State] GOOGLE_CLIENT_ID is not set');
      return NextResponse.json(
        { error: 'Google OAuth is not configured' },
        { status: 503 }
      );
    }
    const clientSecret = getGoogleClientSecret();

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
    const isInternalHost = (host: string): boolean => {
      const h = host.toLowerCase();
      return (
        !h ||
        h === 'localhost' ||
        h === '0.0.0.0' ||
        h.startsWith('127.') ||
        h.startsWith('10.') ||
        h.startsWith('192.168.') ||
        h.startsWith('172.') ||
        h.includes('.fcapp.run') ||
        h.includes('.aliyuncs.com') ||
        h.includes('.functioncompute.com')
      );
    };

    const resolvePublicOrigin = (): string => {
      // 1. Explicit `?origin=` query param (frontend passes window.location.origin)
      const queryOrigin = request.nextUrl.searchParams.get('origin');
      if (queryOrigin) {
        try {
          const u = new URL(queryOrigin);
          if (!isInternalHost(u.hostname)) return u.origin;
        } catch { /* fall through */ }
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
        } catch { /* fall through */ }
      }
      // 5. Referer header
      const referer = request.headers.get('referer');
      if (referer) {
        try {
          const u = new URL(referer);
          if (!isInternalHost(u.hostname)) return u.origin;
        } catch { /* fall through */ }
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

    console.warn(`[Google OAuth State] env vars: GOOGLE_CLIENT_ID=${clientId ? 'SET' : 'MISSING'}, GOOGLE_CLIENT_SECRET=${clientSecret ? 'SET' : 'MISSING'}`);
    console.warn(`[Google OAuth State] Generated auth URL. redirectUri=${redirectUri}, origin=${origin}`);
    console.warn(`[Google OAuth State] resolvedOrigin=${resolvedOrigin}, fwd-host=${request.headers.get('x-forwarded-host') || 'NONE'}, host=${request.headers.get('host') || 'NONE'}, origin-header=${request.headers.get('origin') || 'NONE'}`);

    return NextResponse.json({
      authUrl,
      state,
      googleEnabled: true,
    });
  } catch (error) {
    console.error('[Google OAuth State] Error generating state:', error);
    return NextResponse.json(
      { error: 'Failed to generate OAuth state' },
      { status: 500 }
    );
  }
}
