// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Calendar OAuth Callback (fixed)
// GET /api/calendar/callback — Handle Google Calendar OAuth redirect
//
// Fixes:
//   1. userInfo now declared via getGoogleUserInfo (was undefined)
//   2. Uses /api/calendar/callback redirect URI for token exchange
//   3. Only creates Calendar tokens — does NOT activate Gmail
//   4. Validates flow=calendar in OAuth state
//   5. Validates Calendar scopes before persisting
//   6. Application user identity from signed state, NOT Google email
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { exchangeCodeForTokens, getGoogleUserInfo } from '@/lib/google-oauth';
import { getAppUrl } from '@/lib/app-url';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      console.error('[Calendar Callback] OAuth error:', error);
      const appUrl = getAppUrl();
      return NextResponse.redirect(`${appUrl}/dashboard?calendar_error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      const appUrl = getAppUrl();
      return NextResponse.redirect(`${appUrl}/dashboard?calendar_error=No authorization code received`);
    }

    // Phase 7B — Validate secure OAuth state (HMAC-signed, flow=calendar)
    const appUrl = getAppUrl();

    if (!state) {
      return NextResponse.redirect(`${appUrl}/dashboard?calendar_error=${encodeURIComponent('Missing state parameter')}`);
    }

    const { validateSecureState } = await import('@/lib/security/oauth-state');
    const stateResult = await validateSecureState(state, 'google', 'calendar');
    if (!stateResult.valid || !stateResult.userId) {
      return NextResponse.redirect(`${appUrl}/dashboard?calendar_error=${encodeURIComponent(stateResult.error || 'Invalid state parameter')}`);
    }

    const userId = stateResult.userId;

    // Verify user exists
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.redirect(`${appUrl}/dashboard?calendar_error=${encodeURIComponent('User not found')}`);
    }

    // Exchange code for tokens using the CALENDAR callback redirect URI
    // (must match the redirect URI used in buildGoogleCalendarAuthUrl)
    const tokenData = await exchangeCodeForTokens(code, appUrl, '/api/calendar/callback');

    if (!tokenData.access_token) {
      return NextResponse.redirect(`${appUrl}/dashboard?calendar_error=Failed to exchange code for tokens`);
    }

    // Validate that granted scopes include Calendar scopes
    const grantedScopes = tokenData.scope || '';
    const hasCalendarScope = grantedScopes.includes('calendar') || grantedScopes.includes('calendar.events');
    if (!hasCalendarScope) {
      console.error('[Calendar Callback] Granted scopes do not include Calendar:', grantedScopes);
      return NextResponse.redirect(`${appUrl}/dashboard?calendar_error=${encodeURIComponent('Granted scopes do not include Calendar access')}`);
    }

    // Phase 7B — Recheck consent before persisting tokens
    try {
      const { hasConsent } = await import('@/lib/compliance/consent-enforcement');
      if (!(await hasConsent(userId, 'third_party_integrations'))) {
        return NextResponse.redirect(`${appUrl}/dashboard?calendar_error=${encodeURIComponent('Third-party integration consent was withdrawn')}`);
      }
    } catch {
      return NextResponse.redirect(`${appUrl}/dashboard?calendar_error=${encodeURIComponent('Unable to verify integration consent')}`);
    }

    // Get Google account info for metadata (calendarEmail field)
    // This is NOT used for user resolution — userId comes from signed state
    const userInfo = await getGoogleUserInfo(tokenData.access_token);
    if (!userInfo || !userInfo.email) {
      return NextResponse.redirect(`${appUrl}/dashboard?calendar_error=${encodeURIComponent('Could not retrieve Google account information')}`);
    }

    // Calculate token expiry
    const tokenExpiry = new Date(Date.now() + tokenData.expires_in * 1000);

    // Store or update Google Calendar token — Calendar flow ONLY
    // Does NOT create EmailAccount or set Gmail-connected flags
    const existing = await db.googleCalendarToken.findFirst({
      where: { userId: user.id },
    });

    if (existing) {
      await db.googleCalendarToken.update({
        where: { id: existing.id },
        data: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || existing.refreshToken,
          tokenExpiry,
          calendarEmail: userInfo.email,
          scope: grantedScopes,
          status: 'active',
          isConnected: true,
        },
      });
    } else {
      await db.googleCalendarToken.create({
        data: {
          userId: user.id,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || '',
          tokenExpiry,
          calendarEmail: userInfo.email,
          scope: grantedScopes,
          status: 'active',
          isConnected: true,
        },
      });
    }

    // Audit log
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'calendar_connected',
        details: `Connected Google Calendar: ${userInfo.email}`,
        resource: 'calendar',
      },
    });

    console.log(`[Calendar Callback] Successfully connected calendar for: ${userInfo.email}`);

    return NextResponse.redirect(`${appUrl}/dashboard?calendar_connected=true`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Calendar Callback] Error:', error);

    try {
      const { getAppUrl } = await import('@/lib/app-url');
      const appUrl = getAppUrl();
      return NextResponse.redirect(`${appUrl}/dashboard?calendar_error=${encodeURIComponent(errorMessage)}`);
    } catch {
      return NextResponse.redirect('/dashboard?calendar_error=Calendar connection failed');
    }
  }
}
