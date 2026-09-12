// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Shared Google OAuth Helpers
// Used by integration connect/callback routes and Gmail/Calendar APIs
// OAuth tokens are encrypted at rest using AES-256-GCM
// ═══════════════════════════════════════════════════════════════════

import { encrypt, decrypt } from '@/lib/encryption';

/** Scopes required for Gmail + Calendar integration */
export const GOOGLE_INTEGRATION_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

/**
 * Refresh a Google OAuth access token using a refresh token.
 * Returns the new access_token and expires_in seconds.
 */
export async function refreshGoogleToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Google OAuth] Token refresh failed:', errorText);
    throw new Error('Token refresh failed');
  }

  return res.json();
}

/**
 * Get a valid Google access token for a user, refreshing if necessary.
 * Updates the stored token in the database if it was refreshed.
 */
export async function getValidGmailAccessToken(userId: string): Promise<{
  accessToken: string;
  emailAccount: NonNullable<Awaited<ReturnType<typeof import('@/lib/db').db.emailAccount.findFirst>>>;
}> {
  const { db } = await import('@/lib/db');

  const emailAccount = await db.emailAccount.findFirst({
    where: { userId, status: 'active' },
  });

  if (!emailAccount) {
    throw new Error('No active Gmail account found. Please connect your Gmail account first.');
  }

  // Check if token is still valid (with 5 minute buffer)
  const tokenExpiry = emailAccount.tokenExpiry;
  const isExpired = !tokenExpiry || new Date(tokenExpiry.getTime() - 5 * 60 * 1000) < new Date();

  if (!isExpired) {
    // Decrypt the access token before returning
    const decryptedAccessToken = decrypt(emailAccount.accessToken);
    return { accessToken: decryptedAccessToken, emailAccount };
  }

  // Token expired — refresh it
  // Decrypt refresh token for the API call
  const refreshToken = emailAccount.refreshToken ? decrypt(emailAccount.refreshToken) : null;
  if (!refreshToken) {
    throw new Error('Gmail token expired and no refresh token available. Please reconnect your Gmail account.');
  }

  const tokenData = await refreshGoogleToken(refreshToken);
  const newExpiry = new Date(Date.now() + tokenData.expires_in * 1000);

  // Encrypt tokens before storing
  await db.emailAccount.update({
    where: { id: emailAccount.id },
    data: {
      accessToken: encrypt(tokenData.access_token),
      tokenExpiry: newExpiry,
    },
  });

  return { accessToken: tokenData.access_token, emailAccount };
}

/**
 * Get a valid Google Calendar access token for a user, refreshing if necessary.
 * Updates the stored token in the database if it was refreshed.
 */
export async function getValidCalendarAccessToken(userId: string): Promise<{
  accessToken: string;
  calendarToken: NonNullable<Awaited<ReturnType<typeof import('@/lib/db').db.googleCalendarToken.findFirst>>>;
}> {
  const { db } = await import('@/lib/db');

  const calendarToken = await db.googleCalendarToken.findFirst({
    where: { userId, status: 'active' },
  });

  if (!calendarToken) {
    throw new Error('No active Google Calendar connection found. Please connect your Google Calendar first.');
  }

  // Check if token is still valid (with 5 minute buffer)
  const tokenExpiry = calendarToken.tokenExpiry;
  const isExpired = !tokenExpiry || new Date(tokenExpiry.getTime() - 5 * 60 * 1000) < new Date();

  if (!isExpired) {
    // Decrypt the access token before returning
    const decryptedAccessToken = decrypt(calendarToken.accessToken);
    return { accessToken: decryptedAccessToken, calendarToken };
  }

  // Token expired — refresh it
  // Decrypt refresh token for the API call
  const refreshToken = calendarToken.refreshToken ? decrypt(calendarToken.refreshToken) : null;
  if (!refreshToken) {
    throw new Error('Calendar token expired and no refresh token available. Please reconnect your Google Calendar.');
  }

  const tokenData = await refreshGoogleToken(refreshToken);
  const newExpiry = new Date(Date.now() + tokenData.expires_in * 1000);

  // Encrypt tokens before storing
  await db.googleCalendarToken.update({
    where: { id: calendarToken.id },
    data: {
      accessToken: encrypt(tokenData.access_token),
      tokenExpiry: newExpiry,
    },
  });

  return { accessToken: tokenData.access_token, calendarToken };
}

/**
 * Build the Google OAuth consent screen URL for integration (NOT sign-in).
 */
export function buildGoogleIntegrationAuthUrl(userId: string, origin: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${origin || process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google/callback`;

  console.log(`[Google Integration Auth] clientId=${clientId ? 'SET' : 'MISSING'}, redirectUri=${redirectUri}`);

  // Encode state as base64 JSON
  const state = Buffer.from(JSON.stringify({ userId, origin })).toString('base64');

  const params = new URLSearchParams({
    client_id: clientId!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_INTEGRATION_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCodeForTokens(code: string, origin: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}> {
  const redirectUri = `${origin || process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google/callback`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Google Integration] Token exchange failed:', errorText);
    throw new Error('Failed to exchange authorization code for tokens');
  }

  return res.json();
}

/**
 * Get user info from Google using an access token.
 */
export async function getGoogleUserInfo(accessToken: string): Promise<{
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch Google user info');
  }

  return res.json();
}

/**
 * Encode a string as base64url (RFC 4648 §5) — used for Gmail API raw messages.
 */
export function base64urlEncode(str: string): string {
  return Buffer.from(str, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── Google Calendar + Meet Scopes ──────────────────────────────────

/** Scopes required for Google Calendar + Meet integration (separate from Gmail) */
export const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

/**
 * Build the Google OAuth consent screen URL specifically for Calendar + Meet scopes.
 * Uses a different redirect path than the general integration flow.
 */
export function buildGoogleCalendarAuthUrl(userId: string, origin: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${origin || process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google/callback`;

  // Encode state as base64 JSON
  const state = Buffer.from(JSON.stringify({ userId, origin, purpose: 'calendar' })).toString('base64');

  const params = new URLSearchParams({
    client_id: clientId!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_CALENDAR_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Disconnect Google Calendar for a user.
 * Revokes the Google OAuth token and updates the database status.
 */
export async function disconnectGoogleCalendar(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { db } = await import('@/lib/db');

    // Find active calendar tokens
    const calendarTokens = await db.googleCalendarToken.findMany({
      where: { userId, status: 'active' },
    });

    for (const token of calendarTokens) {
      // Revoke the token with Google
      // Security: Decrypt the access token before sending to Google's revoke endpoint
      try {
        const decryptedAccessToken = decrypt(token.accessToken);
        await fetch(`https://oauth2.googleapis.com/revoke?token=${decryptedAccessToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
      } catch (revokeError) {
        console.warn('[Google OAuth] Failed to revoke calendar token:', revokeError);
        // Continue even if revoke fails — we still mark as revoked locally
      }

      // Update token status to revoked
      await db.googleCalendarToken.update({
        where: { id: token.id },
        data: { status: 'revoked' },
      });
    }

    // Update user settings
    await db.userSettings.updateMany({
      where: { userId },
      data: { googleCalendarConnected: false },
    });

    return { success: true };
  } catch (error) {
    console.error('[Google OAuth] Error disconnecting Google Calendar:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to disconnect Google Calendar',
    };
  }
}
