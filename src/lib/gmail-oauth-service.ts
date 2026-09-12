// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Gmail OAuth Service
// Phase 9: Gmail Integration
// Handles OAuth flow, token management, encryption, multi-account
// ═══════════════════════════════════════════════════════════════════

import crypto from 'crypto';
import { db } from '@/lib/db';
import { logGmailConnected, logGmailDisconnected, logTokenRefreshed } from './gmail-audit-service';
import { cacheSet, cacheGet, cacheDelete, CachePrefix, CacheTTL } from './gmail-cache-service';
import { encrypt as sharedEncrypt, decrypt as sharedDecrypt, isEncrypted } from './encryption';

// ===== ENCRYPTION =====
// Now uses the shared AES-256-GCM encryption from @/lib/encryption
// to maintain consistency with google-oauth.ts and the rest of the system.
// Previously, this file used its own GMAIL_ENCRYPTION_KEY — migration handled below.

/**
 * Encrypt a plaintext string using the shared AES-256-GCM implementation.
 * Delegates to the shared encryption module for consistency.
 */
function encrypt(text: string): string {
  return sharedEncrypt(text);
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * Handles both:
 *   - New format: encrypted by shared module (iv:authTag:ciphertext with 12-byte IV)
 *   - Legacy format: encrypted by old gmail-oauth-service (iv:authTag:ciphertext with 16-byte IV using GMAIL_ENCRYPTION_KEY)
 */
function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';

  // First, try the shared decrypt (handles modern format + plaintext fallback)
  const result = sharedDecrypt(encryptedText);
  if (result) return result;

  // If shared decrypt returned empty, try legacy decrypt with old GMAIL_ENCRYPTION_KEY
  // This handles tokens that were encrypted by the old gmail-oauth-service.ts
  try {
    return legacyDecrypt(encryptedText);
  } catch {
    // Both methods failed
    throw new Error('Failed to decrypt token. Please reconnect the account.');
  }
}

/**
 * Legacy decryption for tokens encrypted by the old gmail-oauth-service.ts
 * using GMAIL_ENCRYPTION_KEY with 16-byte IV.
 * This is kept for migration purposes and can be removed after all tokens
 * are re-encrypted through the normal refresh cycle.
 */
const LEGACY_ENCRYPTION_KEY = process.env.GMAIL_ENCRYPTION_KEY || 'default-dev-key-change-in-production-32b!';
const LEGACY_ALGORITHM = 'aes-256-gcm';

function legacyDecrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format');
  }
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  const key = Buffer.from(LEGACY_ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
  const decipher = crypto.createDecipheriv(LEGACY_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ===== OAUTH CONFIGURATION =====

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

// Build the full redirect URI with the correct callback path.
// GOOGLE_REDIRECT_URI env var can be either:
//   - A full URL (e.g. https://example.com/api/gmail/callback) — used as-is
//   - A base URL (e.g. https://example.com) — we append /api/gmail/callback
// If not set, falls back to NEXT_PUBLIC_APP_URL or NEXTAUTH_URL.
const _GOOGLE_REDIRECT_BASE =
  process.env.GOOGLE_REDIRECT_URI ||
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXTAUTH_URL ||
  '';
const GOOGLE_REDIRECT_URI = _GOOGLE_REDIRECT_BASE.includes('/api/')
  ? _GOOGLE_REDIRECT_BASE.replace(/\/+$/, '')
  : `${_GOOGLE_REDIRECT_BASE.replace(/\/+$/, '')}/api/gmail/callback`;

console.log(`[GmailOAuth] GOOGLE_CLIENT_ID is ${GOOGLE_CLIENT_ID ? 'SET' : 'MISSING'}, GOOGLE_CLIENT_SECRET is ${GOOGLE_CLIENT_SECRET ? 'SET' : 'MISSING'}`);
console.log(`[GmailOAuth] GOOGLE_REDIRECT_URI = ${GOOGLE_REDIRECT_URI}`);

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
];

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// ===== TYPES =====

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface UserInfoResponse {
  email: string;
  verified_email: boolean;
}

export interface ConnectedAccount {
  id: string;
  gmailEmail: string;
  status: string;
  consentGiven: boolean;
  consentGivenAt: Date | null;
  lastPollAt: Date | null;
  pubSubConfigured: boolean;
  isActive: boolean;
}

export class GmailOAuthError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string = 'GMAIL_OAUTH_ERROR', statusCode: number = 400) {
    super(message);
    this.name = 'GmailOAuthError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ===== RATE LIMITING FOR TOKEN OPERATIONS =====

const tokenOperationTimestamps: Map<string, number[]> = new Map();
const MAX_TOKEN_OPS_PER_MINUTE = 10;

function checkTokenRateLimit(key: string): void {
  const now = Date.now();
  const timestamps = tokenOperationTimestamps.get(key) || [];
  const recentTimestamps = timestamps.filter(t => now - t < 60_000);

  if (recentTimestamps.length >= MAX_TOKEN_OPS_PER_MINUTE) {
    throw new GmailOAuthError(
      'Token operation rate limit exceeded. Please try again later.',
      'RATE_LIMITED',
      429
    );
  }

  recentTimestamps.push(now);
  tokenOperationTimestamps.set(key, recentTimestamps);
}

// ===== CORE OAUTH FUNCTIONS =====

/**
 * Generate Google OAuth URL for Gmail authorization.
 * @param userId - The user's ID to associate with this OAuth flow
 * @returns Object containing the auth URL and state token
 */
export function generateAuthUrl(userId: string): { url: string; state: string } {
  if (!GOOGLE_CLIENT_ID) {
    throw new GmailOAuthError(
      'Google OAuth is not configured. Set GOOGLE_CLIENT_ID environment variable.',
      'MISSING_CONFIG',
      500
    );
  }

  // Generate a state token to prevent CSRF and link back to user
  const state = crypto.randomBytes(32).toString('hex');

  // Store state temporarily (valid for 10 minutes) with userId mapping
  cacheSet(`${CachePrefix.TOKEN_STATUS}state:${state}`, userId, 10 * 60 * 1000);

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: GMAIL_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent', // Always prompt for consent to ensure we get a refresh token
    state,
  });

  const url = `${GOOGLE_AUTH_URL}?${params.toString()}`;

  console.log(`[GmailOAuth] Auth URL generated for user: ${userId}`);

  return { url, state };
}

/**
 * Handle OAuth callback — exchange auth code for tokens.
 * Creates or updates EmailAccount in database.
 * @param code - The authorization code from Google
 * @returns The created/updated EmailAccount ID
 */
export async function handleOAuthCallback(code: string): Promise<{
  emailAccountId: string;
  email: string;
}> {
  checkTokenRateLimit('oauth_callback');

  try {
    // Exchange code for tokens
    const tokenResponse = await exchangeCodeForTokens(code);

    // Get user info with the access token
    const userInfo = await getUserInfo(tokenResponse.access_token);

    // Check if account already exists for this email
    const existingAccount = await db.emailAccount.findFirst({
      where: { gmailEmail: userInfo.email },
    });

    // Encrypt tokens before storage
    const encryptedAccessToken = encrypt(tokenResponse.access_token);
    const encryptedRefreshToken = tokenResponse.refresh_token
      ? encrypt(tokenResponse.refresh_token)
      : (existingAccount?.refreshToken || '');

    const tokenExpiry = new Date(Date.now() + tokenResponse.expires_in * 1000);

    // Find user by email (the Gmail email should match a user in the system)
    const user = await db.user.findFirst({
      where: { email: userInfo.email },
    });

    if (!user) {
      throw new GmailOAuthError(
        `No user account found for email: ${userInfo.email}`,
        'USER_NOT_FOUND',
        404
      );
    }

    let emailAccountId: string;

    if (existingAccount) {
      // Update existing account with new tokens
      const updated = await db.emailAccount.update({
        where: { id: existingAccount.id },
        data: {
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiry,
          consentGiven: true,
          consentGivenAt: new Date(),
          status: 'active',
        },
      });
      emailAccountId = updated.id;
      console.log(`[GmailOAuth] Updated existing account for: ${userInfo.email}`);
    } else {
      // Create new EmailAccount
      const created = await db.emailAccount.create({
        data: {
          userId: user.id,
          gmailEmail: userInfo.email,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiry,
          consentGiven: true,
          consentGivenAt: new Date(),
          status: 'active',
          mode: 'manual',
          pubSubConfigured: false,
        },
      });
      emailAccountId = created.id;
      console.log(`[GmailOAuth] Created new account for: ${userInfo.email}`);
    }

    // Audit log
    await logGmailConnected(user.id, userInfo.email);

    // Invalidate cache for this user's accounts
    const { getGmailCache } = await import('./gmail-cache-service');
    getGmailCache().invalidateAccount(emailAccountId);

    return { emailAccountId, email: userInfo.email };
  } catch (error) {
    if (error instanceof GmailOAuthError) throw error;
    throw new GmailOAuthError(
      `OAuth callback failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'OAUTH_CALLBACK_FAILED',
      500
    );
  }
}

/**
 * Exchange authorization code for tokens.
 */
async function exchangeCodeForTokens(code: string): Promise<OAuthTokenResponse> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new GmailOAuthError(
      'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      'MISSING_CONFIG',
      500
    );
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[GmailOAuth] Token exchange failed:', response.status, errorBody);
    throw new GmailOAuthError(
      `Token exchange failed: ${response.status}`,
      'TOKEN_EXCHANGE_FAILED',
      response.status
    );
  }

  return response.json() as Promise<OAuthTokenResponse>;
}

/**
 * Get user info from Google using access token.
 */
async function getUserInfo(accessToken: string): Promise<UserInfoResponse> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new GmailOAuthError(
      `Failed to get user info: ${response.status}`,
      'USER_INFO_FAILED',
      response.status
    );
  }

  return response.json() as Promise<UserInfoResponse>;
}

/**
 * Refresh an expired access token using the refresh token.
 * @param emailAccountId - The EmailAccount ID
 * @returns The new access token
 */
export async function refreshAccessToken(emailAccountId: string): Promise<string> {
  checkTokenRateLimit(`refresh:${emailAccountId}`);

  const account = await db.emailAccount.findUnique({
    where: { id: emailAccountId },
  });

  if (!account) {
    throw new GmailOAuthError(
      'Email account not found',
      'ACCOUNT_NOT_FOUND',
      404
    );
  }

  if (account.status === 'revoked') {
    throw new GmailOAuthError(
      'Account has been revoked. Please reconnect.',
      'ACCOUNT_REVOKED',
      403
    );
  }

  if (!account.refreshToken) {
    throw new GmailOAuthError(
      'No refresh token available. Please reconnect the account.',
      'NO_REFRESH_TOKEN',
      403
    );
  }

  // Decrypt refresh token
  let refreshToken: string;
  try {
    refreshToken = decrypt(account.refreshToken);
  } catch {
    throw new GmailOAuthError(
      'Failed to decrypt refresh token. Please reconnect the account.',
      'DECRYPTION_FAILED',
      500
    );
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new GmailOAuthError(
      'Google OAuth is not configured.',
      'MISSING_CONFIG',
      500
    );
  }

  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[GmailOAuth] Token refresh failed:', response.status, errorBody);

      // If refresh token is invalid, mark account as expired
      if (response.status === 400 || response.status === 401) {
        await db.emailAccount.update({
          where: { id: emailAccountId },
          data: { status: 'expired' },
        });
        throw new GmailOAuthError(
          'Refresh token is invalid or expired. Please reconnect the account.',
          'REFRESH_TOKEN_INVALID',
          401
        );
      }

      throw new GmailOAuthError(
        `Token refresh failed: ${response.status}`,
        'REFRESH_FAILED',
        response.status
      );
    }

    const tokenData = await response.json() as OAuthTokenResponse;

    // Encrypt and store new access token
    const encryptedAccessToken = encrypt(tokenData.access_token);
    const tokenExpiry = new Date(Date.now() + tokenData.expires_in * 1000);

    // If a new refresh token was provided, update it too
    const updateData: Record<string, unknown> = {
      accessToken: encryptedAccessToken,
      tokenExpiry,
      status: 'active',
    };

    if (tokenData.refresh_token) {
      updateData.refreshToken = encrypt(tokenData.refresh_token);
    }

    await db.emailAccount.update({
      where: { id: emailAccountId },
      data: updateData,
    });

    // Audit log
    await logTokenRefreshed(account.userId, emailAccountId);

    // Cache the new token status
    cacheSet(
      `${CachePrefix.TOKEN_STATUS}${emailAccountId}`,
      { valid: true, expiresAt: tokenExpiry.toISOString() },
      CacheTTL.TOKEN_STATUS
    );

    console.log(`[GmailOAuth] Token refreshed for account: ${emailAccountId}`);

    return tokenData.access_token;
  } catch (error) {
    if (error instanceof GmailOAuthError) throw error;
    throw new GmailOAuthError(
      `Token refresh error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'REFRESH_ERROR',
      500
    );
  }
}

/**
 * Disconnect a Gmail account — revoke tokens and update status.
 * @param emailAccountId - The EmailAccount ID
 * @param userId - The user ID (for authorization check)
 */
export async function disconnectAccount(
  emailAccountId: string,
  userId: string
): Promise<void> {
  const account = await db.emailAccount.findUnique({
    where: { id: emailAccountId },
  });

  if (!account) {
    throw new GmailOAuthError(
      'Email account not found',
      'ACCOUNT_NOT_FOUND',
      404
    );
  }

  if (account.userId !== userId) {
    throw new GmailOAuthError(
      'Not authorized to disconnect this account',
      'UNAUTHORIZED',
      403
    );
  }

  // Try to revoke the token with Google
  try {
    const accessToken = decrypt(account.accessToken);
    await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
      method: 'POST',
    });
    console.log(`[GmailOAuth] Token revoked with Google for: ${account.gmailEmail}`);
  } catch (error) {
    // Log but don't fail — the token may already be invalid
    console.warn('[GmailOAuth] Failed to revoke token with Google:', error);
  }

  // Update account status to revoked
  await db.emailAccount.update({
    where: { id: emailAccountId },
    data: {
      status: 'revoked',
      consentGiven: false,
    },
  });

  // Audit log
  await logGmailDisconnected(userId, account.gmailEmail);

  // Invalidate cache
  const { getGmailCache } = await import('./gmail-cache-service');
  getGmailCache().invalidateAccount(emailAccountId);

  console.log(`[GmailOAuth] Account disconnected: ${account.gmailEmail}`);
}

/**
 * Get a valid access token for an email account.
 * Automatically refreshes if the token is expired.
 * @param emailAccountId - The EmailAccount ID
 * @returns A valid access token
 */
export async function getValidAccessToken(emailAccountId: string): Promise<string> {
  const account = await db.emailAccount.findUnique({
    where: { id: emailAccountId },
  });

  if (!account) {
    throw new GmailOAuthError(
      'Email account not found',
      'ACCOUNT_NOT_FOUND',
      404
    );
  }

  if (account.status === 'revoked') {
    throw new GmailOAuthError(
      'Account has been revoked. Please reconnect.',
      'ACCOUNT_REVOKED',
      403
    );
  }

  // Check if token is still valid (with 5 minute buffer)
  const tokenExpiry = account.tokenExpiry;
  const bufferMs = 5 * 60 * 1000; // 5 minutes

  if (tokenExpiry && new Date(tokenExpiry.getTime() - bufferMs) > new Date()) {
    // Token is still valid — decrypt and return
    try {
      return decrypt(account.accessToken);
    } catch {
      // Decryption failed, try refresh
      console.warn('[GmailOAuth] Token decryption failed, attempting refresh');
    }
  }

  // Token is expired or about to expire — refresh it
  console.log(`[GmailOAuth] Token expired or nearing expiry, refreshing for account: ${emailAccountId}`);
  return refreshAccessToken(emailAccountId);
}

/**
 * Get all connected Gmail accounts for a user.
 * @param userId - The user ID
 * @returns Array of connected accounts (tokens NOT included)
 */
export async function getConnectedAccounts(userId: string): Promise<ConnectedAccount[]> {
  const cacheKey = `${CachePrefix.TOKEN_STATUS}accounts:${userId}`;
  const cached = cacheGet<ConnectedAccount[]>(cacheKey);
  if (cached) return cached;

  const accounts = await db.emailAccount.findMany({
    where: {
      userId,
      status: { in: ['active', 'expired'] },
    },
    select: {
      id: true,
      gmailEmail: true,
      status: true,
      consentGiven: true,
      consentGivenAt: true,
      lastPollAt: true,
      pubSubConfigured: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const result: ConnectedAccount[] = accounts.map(a => ({
    ...a,
    isActive: a.status === 'active',
  }));

  cacheSet(cacheKey, result, CacheTTL.TOKEN_STATUS);

  return result;
}

/**
 * Set the active Gmail account for a user.
 * Only one account can be "active" at a time for sending/receiving.
 * @param userId - The user ID
 * @param accountId - The EmailAccount ID to set as active
 */
export async function setActiveAccount(
  userId: string,
  accountId: string
): Promise<void> {
  const account = await db.emailAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw new GmailOAuthError(
      'Email account not found',
      'ACCOUNT_NOT_FOUND',
      404
    );
  }

  if (account.userId !== userId) {
    throw new GmailOAuthError(
      'Not authorized to access this account',
      'UNAUTHORIZED',
      403
    );
  }

  if (account.status !== 'active') {
    throw new GmailOAuthError(
      'Cannot set an inactive/revoked account as active. Please reconnect first.',
      'ACCOUNT_NOT_ACTIVE',
      400
    );
  }

  // In this implementation, we mark the most recently used account.
  // Update the lastPollAt to indicate this is the active account.
  await db.emailAccount.update({
    where: { id: accountId },
    data: { lastPollAt: new Date() },
  });

  // Invalidate accounts cache
  cacheDelete(`${CachePrefix.TOKEN_STATUS}accounts:${userId}`);

  console.log(`[GmailOAuth] Active account set: ${account.gmailEmail}`);
}

/**
 * Verify a state token from OAuth flow.
 * @param state - The state token to verify
 * @returns The userId associated with the state, or null
 */
export async function verifyOAuthState(state: string): Promise<string | null> {
  const userId = cacheGet<string>(`${CachePrefix.TOKEN_STATUS}state:${state}`);
  if (userId) {
    // Remove the state token (one-time use)
    cacheDelete(`${CachePrefix.TOKEN_STATUS}state:${state}`);
  }
  return userId;
}
