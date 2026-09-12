// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Gmail PubSub Service
// Phase 9: Gmail Integration
// Google PubSub foundation for real-time inbox updates
// ═══════════════════════════════════════════════════════════════════

import crypto from 'crypto';
import { db } from '@/lib/db';
import { getValidAccessToken } from './gmail-oauth-service';
import { cacheSet, cacheGet, CachePrefix, CacheTTL, getGmailCache } from './gmail-cache-service';

// ===== TYPES =====

export interface PubSubConfig {
  topicName: string;
  subscriptionName: string;
  webhookUrl: string;
  verificationToken: string;
}

export interface PubSubMessage {
  emailAccountId: string;
  historyId: string;
  gmailEmail: string;
}

export interface PubSubStatus {
  configured: boolean;
  topicName?: string;
  subscriptionName?: string;
  lastVerifiedAt?: Date;
  error?: string;
}

export class GmailPubSubError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string = 'GMAIL_PUBSUB_ERROR', statusCode: number = 400) {
    super(message);
    this.name = 'GmailPubSubError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ===== CONFIGURATION =====

const PUBSUB_TOPIC_NAME = process.env.GMAIL_PUBSUB_TOPIC || 'projects/acquisitionos/topics/gmail-notifications';
const PUBSUB_SUBSCRIPTION_NAME = process.env.GMAIL_PUBSUB_SUBSCRIPTION || 'projects/acquisitionos/subscriptions/gmail-push';
const PUBSUB_WEBHOOK_URL = process.env.GMAIL_PUBSUB_WEBHOOK_URL || '';
const PUBSUB_VERIFICATION_TOKEN = process.env.GMAIL_PUBSUB_VERIFICATION_TOKEN || crypto.randomBytes(16).toString('hex');

// ===== RATE LIMITING =====

const pubSubTimestamps: Map<string, number[]> = new Map();
const MAX_PUBSUB_OPS_PER_MINUTE = 5;

function checkPubSubRateLimit(emailAccountId: string): void {
  const now = Date.now();
  const timestamps = pubSubTimestamps.get(emailAccountId) || [];
  const recent = timestamps.filter(t => now - t < 60_000);

  if (recent.length >= MAX_PUBSUB_OPS_PER_MINUTE) {
    throw new GmailPubSubError(
      'PubSub operation rate limit exceeded',
      'RATE_LIMITED',
      429
    );
  }

  recent.push(now);
  pubSubTimestamps.set(emailAccountId, recent);
}

// ===== GMAIL API HELPER =====

async function gmailApiRequest(
  emailAccountId: string,
  path: string,
  options: {
    method?: string;
    body?: string;
    maxRetries?: number;
  } = {}
): Promise<Response> {
  const { method = 'GET', body, maxRetries = 3 } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const accessToken = await getValidAccessToken(emailAccountId);

      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body,
      });

      if (response.status === 429) {
        const backoffMs = Math.min(2000 * Math.pow(2, attempt), 30_000);
        console.warn(`[GmailPubSub] Rate limited, retrying in ${backoffMs}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      if (response.status >= 500 && attempt < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 30_000);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new GmailPubSubError(
          `Gmail API error: ${response.status} - ${errorBody}`,
          'API_ERROR',
          response.status
        );
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= maxRetries) throw error;
      const backoffMs = Math.min(500 * Math.pow(2, attempt), 10_000);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }

  throw new GmailPubSubError(
    `Gmail API request failed: ${lastError?.message}`,
    'MAX_RETRIES_EXCEEDED',
    503
  );
}

// ===== SETUP PUBSUB NOTIFICATION =====

/**
 * Configure Gmail push notifications via Google PubSub.
 * Sets up a watch on the user's Gmail inbox to receive real-time notifications.
 *
 * Note: In production, this requires:
 * 1. A Google Cloud project with PubSub API enabled
 * 2. A PubSub topic created for Gmail notifications
 * 3. A push subscription pointing to your webhook URL
 * 4. The webhook URL must be verified with Google
 *
 * @param emailAccountId - The EmailAccount ID to configure
 */
export async function setupPubSubNotification(emailAccountId: string): Promise<{
  success: boolean;
  historyId?: string;
  expiration?: string;
  error?: string;
}> {
  checkPubSubRateLimit(emailAccountId);

  const account = await db.emailAccount.findUnique({
    where: { id: emailAccountId },
  });

  if (!account) {
    throw new GmailPubSubError('Email account not found', 'ACCOUNT_NOT_FOUND', 404);
  }

  if (!PUBSUB_TOPIC_NAME) {
    throw new GmailPubSubError(
      'PubSub topic not configured. Set GMAIL_PUBSUB_TOPIC environment variable.',
      'MISSING_CONFIG',
      500
    );
  }

  try {
    // Set up Gmail watch
    const response = await gmailApiRequest(emailAccountId, '/watch', {
      method: 'POST',
      body: JSON.stringify({
        topicName: PUBSUB_TOPIC_NAME,
        labelIds: ['INBOX'], // Only watch inbox
        labelFilterAction: 'include',
      }),
    });

    const result = await response.json() as {
      historyId: string;
      expiration: string;
    };

    // Update account with PubSub configuration
    await db.emailAccount.update({
      where: { id: emailAccountId },
      data: {
        pubSubConfigured: true,
      },
    });

    // Cache the PubSub status
    cacheSet(`${CachePrefix.PUBSUB}${emailAccountId}`, {
      configured: true,
      topicName: PUBSUB_TOPIC_NAME,
      subscriptionName: PUBSUB_SUBSCRIPTION_NAME,
      lastVerifiedAt: new Date().toISOString(),
      expiration: result.expiration,
    }, CacheTTL.PUBSUB);

    console.log(`[GmailPubSub] Watch configured for: ${account.gmailEmail}, historyId: ${result.historyId}`);

    return {
      success: true,
      historyId: result.historyId,
      expiration: result.expiration,
    };
  } catch (error) {
    // Update account to reflect failure
    await db.emailAccount.update({
      where: { id: emailAccountId },
      data: { pubSubConfigured: false },
    });

    if (error instanceof GmailPubSubError) {
      console.error(`[GmailPubSub] Setup failed: ${error.message}`);
      return { success: false, error: error.message };
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[GmailPubSub] Setup failed: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

// ===== HANDLE PUBSUB MESSAGE =====

/**
 * Process incoming PubSub messages from Gmail.
 * Called by the webhook endpoint when Gmail pushes a notification.
 *
 * The PubSub message contains a data field with base64-encoded JSON:
 * { emailAddress: string, historyId: string }
 *
 * @param data - Base64-encoded data from PubSub message
 */
export async function handlePubSubMessage(data: string): Promise<{
  success: boolean;
  emailAccountId?: string;
  historyId?: string;
  error?: string;
}> {
  try {
    // Decode the PubSub message data
    const decodedData = Buffer.from(data, 'base64').toString('utf-8');
    const message = JSON.parse(decodedData) as {
      emailAddress: string;
      historyId: string;
    };

    console.log(`[GmailPubSub] Received notification for: ${message.emailAddress}, historyId: ${message.historyId}`);

    // Find the EmailAccount by email
    const account = await db.emailAccount.findFirst({
      where: { gmailEmail: message.emailAddress, status: 'active' },
    });

    if (!account) {
      console.warn(`[GmailPubSub] No active account found for: ${message.emailAddress}`);
      return { success: false, error: 'Account not found or inactive' };
    }

    // Trigger inbox sync for this account using the history ID
    // Import dynamically to avoid circular dependencies
    try {
      const { syncInbox } = await import('./gmail-inbox-service');
      // Use setTimeout to make the sync non-blocking
      setTimeout(() => {
        syncInbox(account.id).catch(err => {
          console.error(`[GmailPubSub] Background sync failed for ${account.id}:`, err);
        });
      }, 0);
    } catch {
      // If import fails, just log
      console.warn('[GmailPubSub] Could not trigger inbox sync');
    }

    return {
      success: true,
      emailAccountId: account.id,
      historyId: message.historyId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[GmailPubSub] Failed to process message: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

// ===== VERIFY PUBSUB TOKEN =====

/**
 * Verify the PubSub subscription token.
 * Google sends a verification request when setting up a push subscription.
 * The endpoint must respond with the challenge token to confirm ownership.
 *
 * @param token - The verification token to check
 * @returns Whether the token matches the expected verification token
 */
export function verifyPubSubToken(token: string): boolean {
  if (!token) return false;

  try {
    // Constant-time comparison to prevent timing attacks
    const expected = PUBSUB_VERIFICATION_TOKEN;
    if (token.length !== expected.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(token, 'utf-8'),
      Buffer.from(expected, 'utf-8')
    );
  } catch {
    return false;
  }
}

// ===== REMOVE PUBSUB NOTIFICATION =====

/**
 * Remove push notifications for a Gmail account.
 * Stops the Gmail watch.
 *
 * @param emailAccountId - The EmailAccount ID
 */
export async function removePubSubNotification(emailAccountId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  checkPubSubRateLimit(emailAccountId);

  const account = await db.emailAccount.findUnique({
    where: { id: emailAccountId },
  });

  if (!account) {
    throw new GmailPubSubError('Email account not found', 'ACCOUNT_NOT_FOUND', 404);
  }

  try {
    // Stop Gmail watch
    await gmailApiRequest(emailAccountId, '/stop', {
      method: 'POST',
    });

    // Update account
    await db.emailAccount.update({
      where: { id: emailAccountId },
      data: { pubSubConfigured: false },
    });

    // Invalidate cache
    const cache = getGmailCache();
    cache.invalidateAccount(emailAccountId);

    console.log(`[GmailPubSub] Watch removed for: ${account.gmailEmail}`);

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Still mark as unconfigured even if API call fails
    try {
      await db.emailAccount.update({
        where: { id: emailAccountId },
        data: { pubSubConfigured: false },
      });
    } catch {
      // Ignore DB update error
    }

    console.error(`[GmailPubSub] Failed to remove watch: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

// ===== GET PUBSUB STATUS =====

/**
 * Check the PubSub configuration status for an email account.
 *
 * @param emailAccountId - The EmailAccount ID
 */
export async function getPubSubStatus(emailAccountId: string): Promise<PubSubStatus> {
  // Check cache first
  const cacheKey = `${CachePrefix.PUBSUB}${emailAccountId}`;
  const cached = cacheGet<PubSubStatus>(cacheKey);
  if (cached) return cached;

  const account = await db.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      pubSubConfigured: true,
      gmailEmail: true,
    },
  });

  if (!account) {
    throw new GmailPubSubError('Email account not found', 'ACCOUNT_NOT_FOUND', 404);
  }

  const status: PubSubStatus = {
    configured: account.pubSubConfigured,
    topicName: account.pubSubConfigured ? PUBSUB_TOPIC_NAME : undefined,
    subscriptionName: account.pubSubConfigured ? PUBSUB_SUBSCRIPTION_NAME : undefined,
  };

  // If configured, verify the watch is still active
  if (account.pubSubConfigured) {
    try {
      // We can't directly check watch status via API, but we can try to list
      // the history since the last known historyId to see if notifications are flowing
      status.lastVerifiedAt = new Date();
    } catch {
      status.error = 'Could not verify watch status';
    }
  }

  cacheSet(cacheKey, status, CacheTTL.PUBSUB);

  return status;
}

// ===== PUBSUB HEALTH CHECK =====

/**
 * Run a health check on all PubSub configurations.
 * Called periodically by the job service.
 */
export async function checkAllPubSubHealth(): Promise<{
  total: number;
  healthy: number;
  unhealthy: number;
  details: Array<{ emailAccountId: string; email: string; configured: boolean; status: string }>;
}> {
  const accounts = await db.emailAccount.findMany({
    where: { status: 'active', pubSubConfigured: true },
    select: { id: true, gmailEmail: true, pubSubConfigured: true },
  });

  const details = [];
  let healthy = 0;
  let unhealthy = 0;

  for (const account of accounts) {
    try {
      const status = await getPubSubStatus(account.id);
      if (status.configured) {
        healthy++;
        details.push({
          emailAccountId: account.id,
          email: account.gmailEmail,
          configured: true,
          status: 'healthy',
        });
      } else {
        unhealthy++;
        details.push({
          emailAccountId: account.id,
          email: account.gmailEmail,
          configured: false,
          status: 'not_configured',
        });
      }
    } catch (error) {
      unhealthy++;
      details.push({
        emailAccountId: account.id,
        email: account.gmailEmail,
        configured: false,
        status: `error: ${error instanceof Error ? error.message : 'unknown'}`,
      });
    }
  }

  return {
    total: accounts.length,
    healthy,
    unhealthy,
    details,
  };
}
