// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Google Integration Connect
// GET /api/integrations/google/connect
// Initiates Google OAuth for Gmail + Calendar integration (NOT sign-in)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { buildGoogleIntegrationAuthUrl } from '@/lib/google-oauth';
import { getAppUrl } from '@/lib/app-url';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    // Phase 7B — Consent enforcement for third-party integrations
    try {
      const { hasConsent } = await import('@/lib/compliance/consent-enforcement');
      if (!(await hasConsent(user.id, 'third_party_integrations'))) {
        return NextResponse.json(
          { error: 'Third-party integration consent is not granted. Please grant consent in Privacy Settings to connect new integrations.' },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Unable to verify integration consent. Please try again.' },
        { status: 500 }
      );
    }

    // Verify Google OAuth is configured
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return NextResponse.json(
        { error: 'Google integration is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' },
        { status: 500 }
      );
    }

    // Determine origin — use getAppUrl(), never request.url
    const origin =
      getAppUrl(request) ||
      request.headers.get('origin') ||
      '';

    // Build the Google OAuth consent URL
    const authUrl = buildGoogleIntegrationAuthUrl(user.id, origin);

    // Redirect user to Google consent screen
    return NextResponse.redirect(authUrl);
  });
}
