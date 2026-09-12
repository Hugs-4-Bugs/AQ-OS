import { NextRequest, NextResponse } from 'next/server';
import { getAppUrl } from '@/lib/app-url';
import { isRealGoogleConfigured, getGoogleClientId } from '@/lib/email-ethereal';

/**
 * GET /api/auth/google/redirect-uri
 *
 * Returns the EXACT redirect URI that this server sends to Google during
 * OAuth. This URL MUST be registered in the Google Cloud Console under:
 *
 *   APIs & Services → Credentials → OAuth 2.0 Client IDs
 *   → [Your Client ID] → Authorized redirect URIs
 *
 * If the redirect URI is NOT registered, Google returns:
 *   Error 400: redirect_uri_mismatch
 *
 * This endpoint is publicly readable (no auth) because it contains no
 * secrets — only the public callback URL. It exists so users can easily
 * discover the exact URL they need to whitelist in Google Cloud Console.
 */
export async function GET(request: NextRequest) {
  // The redirect_uri sent to Google is now derived from the incoming
  // request's domain (x-forwarded-host / host / origin) — see
  // /api/auth/google/state. This helper reports the SAME dynamic value
  // so the Google Cloud Console "Authorized redirect URIs" can be kept
  // in sync with whatever domain the request came from.
  const appUrl = getAppUrl(request);
  const redirectUri = `${appUrl}/api/auth/callback/google`;

  return NextResponse.json({
    // The exact redirect URI to register in Google Cloud Console
    redirectUri,

    // The base app URL (derived from the request's forwarded Host header)
    appUrl,

    // Whether Google OAuth credentials are configured
    googleConfigured: isRealGoogleConfigured(),
    googleClientId: getGoogleClientId()
      ? `${getGoogleClientId()!.slice(0, 12)}...${getGoogleClientId()!.slice(-6)}`
      : null,

    // Step-by-step instructions for the user
    instructions: {
      step1: 'Go to https://console.cloud.google.com/apis/credentials',
      step2: 'Click your OAuth 2.0 Client ID (the one starting with the client ID shown above)',
      step3: 'Under "Authorized redirect URIs", click "ADD URI"',
      step4: `Paste this exact URL: ${redirectUri}`,
      step5: 'Click "Save" and wait ~5 minutes for Google to propagate the change',
      step6: 'Try Google sign-in again — it should now work',
    },

    // Common error this fixes
    errorFixed: 'Error 400: redirect_uri_mismatch',

    // Note about preview URLs: each new preview session gets a new URL,
    // so the redirect URI must be re-registered for each new session.
    note: 'If you are using a preview/staging URL that changes per session, you must add the new redirect URI to Google Cloud Console each time the URL changes.',
  });
}
