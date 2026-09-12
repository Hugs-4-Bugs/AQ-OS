// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Calendar OAuth Callback
// GET /api/calendar/callback — Handle Google Calendar OAuth redirect
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { refreshGoogleToken, exchangeCodeForTokens, getGoogleUserInfo } from '@/lib/google-oauth';
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

    // Exchange code for tokens
    const appUrl = getAppUrl();
    const tokenData = await exchangeCodeForTokens(code, appUrl);

    if (!tokenData.access_token) {
      return NextResponse.redirect(`${appUrl}/dashboard?calendar_error=Failed to exchange code for tokens`);
    }

    // Get user info to find the user
    const userInfo = await getGoogleUserInfo(tokenData.access_token);

    // Find user by email
    const user = await db.user.findUnique({
      where: { email: userInfo.email },
    });

    if (!user) {
      return NextResponse.redirect(`${appUrl}/dashboard?calendar_error=No user found for ${userInfo.email}`);
    }

    // Calculate token expiry
    const tokenExpiry = new Date(Date.now() + tokenData.expires_in * 1000);

    // Store or update Google Calendar token
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
