import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getAppUrl } from '@/lib/app-url';

// GET - Generate Google OAuth URL for Gmail connection
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
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const appUrl = getAppUrl();

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 500 });
    }

    const redirectUri = `${appUrl}/api/integrations/gmail/callback`;
    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent',
      state: user.id,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return NextResponse.json({ authUrl });
  });
}
