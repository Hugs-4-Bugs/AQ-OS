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
