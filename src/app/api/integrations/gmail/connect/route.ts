import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getAppUrl } from '@/lib/app-url';

// GET - Generate Google OAuth URL for Gmail connection
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
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
