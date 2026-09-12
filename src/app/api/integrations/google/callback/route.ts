// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Google Integration OAuth Callback
// GET /api/integrations/google/callback
// Handles the OAuth callback after user grants Gmail + Calendar access
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { exchangeCodeForTokens, getGoogleUserInfo } from '@/lib/google-oauth';
import { getAppUrl } from '@/lib/app-url';
import { encrypt } from '@/lib/encryption';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const stateParam = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle user denial or OAuth errors
    if (error) {
      console.warn('[Google Integration] User denied access:', error);
      let origin = process.env.NEXT_PUBLIC_APP_URL || getAppUrl();
      if (stateParam) {
        try {
          const decoded = JSON.parse(Buffer.from(stateParam, 'base64').toString());
          origin = decoded.origin || origin;
        } catch { /* ignore decode errors */ }
      }
      return NextResponse.redirect(
        `${origin}/?integration_error=${encodeURIComponent('Google integration was cancelled or failed')}`
      );
    }

    if (!code) {
      console.error('[Google Integration] No authorization code in callback');
      const origin = process.env.NEXT_PUBLIC_APP_URL || getAppUrl();
      return NextResponse.redirect(
        `${origin}/?integration_error=${encodeURIComponent('No authorization code received from Google')}`
      );
    }

    // Decode state to get userId and origin
    let userId = '';
    let origin = process.env.NEXT_PUBLIC_APP_URL || getAppUrl();

    if (stateParam) {
      try {
        const decoded = JSON.parse(Buffer.from(stateParam, 'base64').toString());
        userId = decoded.userId || '';
        origin = decoded.origin || origin;
      } catch {
        console.error('[Google Integration] Could not decode state parameter');
        return NextResponse.redirect(
          `${origin}/?integration_error=${encodeURIComponent('Invalid state parameter')}`
        );
      }
    }

    if (!userId) {
      console.error('[Google Integration] No userId in state parameter');
      return NextResponse.redirect(
        `${origin}/?integration_error=${encodeURIComponent('Authentication required for Google integration')}`
      );
    }

    // Verify user exists
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      console.error('[Google Integration] User not found:', userId);
      return NextResponse.redirect(
        `${origin}/?integration_error=${encodeURIComponent('User not found')}`
      );
    }

    // Exchange code for tokens
    const tokenData = await exchangeCodeForTokens(code, origin);

    if (!tokenData.access_token) {
      console.error('[Google Integration] No access token in response');
      return NextResponse.redirect(
        `${origin}/?integration_error=${encodeURIComponent('Failed to obtain Google access token')}`
      );
    }

    // Get user info from Google
    const googleUser = await getGoogleUserInfo(tokenData.access_token);

    if (!googleUser.email) {
      return NextResponse.redirect(
        `${origin}/?integration_error=${encodeURIComponent('Google account does not have an email address')}`
      );
    }

    const tokenExpiry = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000);

    // Save tokens to EmailAccount model (for Gmail)
    // Revoke any existing active accounts for this user first
    await db.emailAccount.updateMany({
      where: { userId, status: 'active' },
      data: { status: 'revoked' },
    });

    // Also check if there's already an account for this Gmail address (possibly revoked)
    const existingAccount = await db.emailAccount.findFirst({
      where: { userId, gmailEmail: googleUser.email },
    });

    if (existingAccount) {
      await db.emailAccount.update({
        where: { id: existingAccount.id },
        data: {
          // Security: Encrypt tokens before storing (AES-256-GCM at rest)
          accessToken: encrypt(tokenData.access_token),
          refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : existingAccount.refreshToken,
          tokenExpiry,
          status: 'active',
          consentGiven: true,
          consentGivenAt: new Date(),
        },
      });
    } else {
      await db.emailAccount.create({
        data: {
          userId,
          gmailEmail: googleUser.email,
          // Security: Encrypt tokens before storing (AES-256-GCM at rest)
          accessToken: encrypt(tokenData.access_token),
          refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : '',
          tokenExpiry,
          consentGiven: true,
          consentGivenAt: new Date(),
          status: 'active',
          mode: 'manual',
        },
      });
    }

    // Save tokens to GoogleCalendarToken model (for Calendar)
    // Delete any existing calendar tokens for this user + email combo
    await db.googleCalendarToken.deleteMany({
      where: { userId, calendarEmail: googleUser.email },
    });

    await db.googleCalendarToken.create({
      data: {
        userId,
        calendarEmail: googleUser.email,
        // Security: Encrypt tokens before storing (AES-256-GCM at rest)
        accessToken: encrypt(tokenData.access_token),
        refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : '',
        tokenExpiry,
        scope: tokenData.scope || '',
        status: 'active',
      },
    });

    // Update UserSettings
    await db.userSettings.upsert({
      where: { userId },
      update: {
        gmailConnected: true,
        gmailEmail: googleUser.email,
        googleCalendarConnected: true,
      },
      create: {
        userId,
        gmailConnected: true,
        gmailEmail: googleUser.email,
        googleCalendarConnected: true,
      },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        userId,
        action: 'integration_connect',
        details: `Connected Gmail and Google Calendar for ${googleUser.email}`,
        resource: 'integration',
        resourceId: 'google',
      },
    });

    console.log('[Google Integration] Successfully connected for user:', userId, 'email:', googleUser.email);

    // Redirect to the app with success indicator
    return NextResponse.redirect(`${origin}/?integration=google_connected`);
  } catch (error) {
    console.error('[Google Integration] Callback error:', error);
    const forwardedHost = request.headers.get('x-forwarded-host');
    const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
    const origin = process.env.NEXT_PUBLIC_APP_URL || (forwardedHost ? `${forwardedProto}://${forwardedHost}` : '') || getAppUrl();
    return NextResponse.redirect(
      `${origin}/?integration_error=${encodeURIComponent('An unexpected error occurred during Google integration')}`
    );
  }
}
