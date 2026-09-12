// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Gmail Tracking Service
// Phase 9: Gmail Integration
// Email open/click tracking, bounce handling, unsubscribe management
// ═══════════════════════════════════════════════════════════════════

import crypto from 'crypto';
import { db } from '@/lib/db';
import { logUnsubscribeDetected, logBounceDetected } from './gmail-audit-service';

// ===== TYPES =====

export interface TrackingEvent {
  messageId: string;
  eventType: 'open' | 'click' | 'bounce' | 'unsubscribe';
  timestamp: Date;
  ip: string;
  userAgent?: string;
  url?: string;
}

export interface BounceInfo {
  email: string;
  bounceType: 'hard' | 'soft';
  bounceReason: string;
  messageId?: string;
  leadId?: string;
}

export interface UnsubscribeResult {
  success: boolean;
  email: string;
  reason?: string;
  error?: string;
}

export class GmailTrackingError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string = 'GMAIL_TRACKING_ERROR', statusCode: number = 400) {
    super(message);
    this.name = 'GmailTrackingError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ===== CONFIGURATION =====

const TRACKING_BASE_URL = process.env.GMAIL_TRACKING_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
const UNSUBSCRIBE_SECRET = process.env.GMAIL_UNSUBSCRIBE_SECRET || 'default-unsubscribe-secret-change-in-production';

// ===== TRACKING PIXEL =====

/**
 * Generate a tracking pixel URL for open tracking.
 * This URL is embedded as a 1x1 transparent GIF in HTML emails.
 * When the email client loads the image, it triggers the open tracking.
 *
 * @param messageId - The OutreachMessage ID to track
 * @returns The tracking pixel URL to embed in the email
 */
export function generateTrackingPixel(messageId: string): string {
  // Generate a unique tracking ID that maps back to the message
  const trackingId = generateTrackingId(messageId, 'open');
  return `${TRACKING_BASE_URL}/api/gmail/track/open?id=${trackingId}`;
}

/**
 * Process an open tracking pixel hit.
 * Called when the tracking pixel URL is requested.
 *
 * @param messageId - The OutreachMessage ID (decoded from tracking ID)
 * @param ip - The IP address of the request
 * @param userAgent - The user agent of the request
 */
export async function handleTrackingPixelHit(
  messageId: string,
  ip: string,
  userAgent: string
): Promise<{ success: boolean; alreadyTracked: boolean }> {
  try {
    // Find the outreach message
    const message = await db.outreachMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      console.warn(`[GmailTracking] Open tracking: message not found: ${messageId}`);
      return { success: false, alreadyTracked: false };
    }

    // Check if already opened (idempotent)
    if (message.openedAt) {
      return { success: true, alreadyTracked: true };
    }

    // Mark as opened
    await db.outreachMessage.update({
      where: { id: messageId },
      data: {
        openedAt: new Date(),
        status: 'opened',
      },
    });

    // Update lead email status if applicable
    if (message.leadId) {
      await db.lead.update({
        where: { id: message.leadId },
        data: { emailStatus: 'opened' },
      });
    }

    console.log(`[GmailTracking] Open tracked: message ${messageId}, IP: ${ip}`);

    return { success: true, alreadyTracked: false };
  } catch (error) {
    console.error(`[GmailTracking] Failed to process open tracking: ${error}`);
    return { success: false, alreadyTracked: false };
  }
}

// ===== CLICK TRACKING =====

/**
 * Generate a click tracking redirect URL.
 * This URL is used instead of the original URL in emails.
 * When clicked, it records the click and redirects to the original URL.
 *
 * @param messageId - The OutreachMessage ID to track
 * @param url - The original URL to redirect to after tracking
 * @returns The tracking redirect URL
 */
export function generateClickTrackingUrl(messageId: string, url: string): string {
  const trackingId = generateTrackingId(messageId, 'click');
  const encodedUrl = Buffer.from(url).toString('base64url');
  return `${TRACKING_BASE_URL}/api/gmail/track/click?id=${trackingId}&url=${encodedUrl}`;
}

/**
 * Process a click tracking event.
 * Records the click and returns the original URL for redirection.
 *
 * @param messageId - The OutreachMessage ID (decoded from tracking ID)
 * @param url - The original URL to redirect to
 * @param ip - The IP address of the click
 */
export async function handleClickTracking(
  messageId: string,
  url: string,
  ip: string
): Promise<{ success: boolean; redirectUrl: string }> {
  try {
    // Find the outreach message
    const message = await db.outreachMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      console.warn(`[GmailTracking] Click tracking: message not found: ${messageId}`);
      // Still redirect even if message not found
      return { success: false, redirectUrl: url };
    }

    // Store click metadata on the message
    const existingMetadata = message.metadata ? JSON.parse(message.metadata) : {};
    const clicks = existingMetadata.clicks || [];
    clicks.push({
      url,
      ip,
      timestamp: new Date().toISOString(),
    });
    existingMetadata.clicks = clicks;

    await db.outreachMessage.update({
      where: { id: messageId },
      data: {
        metadata: JSON.stringify(existingMetadata),
        // If not already opened, mark as opened too (click implies open)
        openedAt: message.openedAt || new Date(),
        status: message.status === 'sent' ? 'opened' : message.status,
      },
    });

    console.log(`[GmailTracking] Click tracked: message ${messageId}, URL: ${url}, IP: ${ip}`);

    return { success: true, redirectUrl: url };
  } catch (error) {
    console.error(`[GmailTracking] Failed to process click tracking: ${error}`);
    // Still redirect even on error
    return { success: false, redirectUrl: url };
  }
}

// ===== BOUNCE HANDLING =====

/**
 * Process a bounced email.
 * Records the bounce in EmailBounce table and updates message/lead status.
 *
 * @param emailAccountId - The EmailAccount ID
 * @param message - The bounce message data (from Gmail API or notification)
 */
export async function handleBounce(
  emailAccountId: string,
  message: {
    from?: string;
    to?: string;
    subject?: string;
    body?: string;
    bounceType?: 'hard' | 'soft';
    bounceReason?: string;
    gmailMessageId?: string;
  }
): Promise<void> {
  try {
    const account = await db.emailAccount.findUnique({
      where: { id: emailAccountId },
    });

    if (!account) {
      console.warn(`[GmailTracking] Bounce: account not found: ${emailAccountId}`);
      return;
    }

    const bouncedEmail = message.to || extractEmailFromBounceBody(message.body || '') || '';
    if (!bouncedEmail) {
      console.warn('[GmailTracking] Bounce: could not extract bounced email');
      return;
    }

    // Determine bounce type
    const bounceType = message.bounceType || detectBounceType(message.body || '', message.subject || '');
    const bounceReason = message.bounceReason || message.subject || 'Bounce detected';

    // Find the lead by email
    const lead = await db.lead.findFirst({
      where: { email: bouncedEmail, isActive: true },
    });

    // Record bounce
    await db.emailBounce.create({
      data: {
        userId: account.userId,
        leadId: lead?.id || null,
        email: bouncedEmail,
        bounceType: bounceType || 'soft',
        bounceReason,
        messageId: message.gmailMessageId || null,
      },
    });

    // Update outreach message status
    if (lead) {
      const outreachMessage = await db.outreachMessage.findFirst({
        where: { leadId: lead.id, channel: 'email', status: { in: ['sent', 'delivered'] } },
        orderBy: { sentAt: 'desc' },
      });

      if (outreachMessage) {
        await db.outreachMessage.update({
          where: { id: outreachMessage.id },
          data: {
            bouncedAt: new Date(),
            status: 'bounced',
          },
        });
      }

      // Update lead email status
      await db.lead.update({
        where: { id: lead.id },
        data: { emailStatus: 'bounced' },
      });
    }

    // Audit log
    await logBounceDetected(account.userId, bouncedEmail, bounceType || 'soft');

    console.log(`[GmailTracking] Bounce recorded: ${bouncedEmail}, type: ${bounceType}`);
  } catch (error) {
    console.error(`[GmailTracking] Failed to handle bounce: ${error}`);
  }
}

// ===== UNSUBSCRIBE HANDLING =====

/**
 * Process an unsubscribe request.
 * Records in EmailUnsubscribe table and updates lead/message status.
 *
 * @param token - The unsubscribe token (encoded in the unsubscribe link)
 * @param ip - The IP address of the unsubscribe request
 */
export async function handleUnsubscribe(
  token: string,
  ip: string
): Promise<UnsubscribeResult> {
  try {
    // Decode the unsubscribe token
    const decoded = decodeUnsubscribeToken(token);
    if (!decoded) {
      return { success: false, email: '', error: 'Invalid unsubscribe token' };
    }

    const { email, userId } = decoded;

    // Check if already unsubscribed
    const existing = await db.emailUnsubscribe.findUnique({
      where: { email },
    });

    if (existing) {
      return { success: true, email, reason: existing.reason || undefined };
    }

    // Find lead by email
    const lead = await db.lead.findFirst({
      where: { email, isActive: true },
    });

    // Create unsubscribe record
    await db.emailUnsubscribe.create({
      data: {
        userId: userId || null,
        email,
        leadId: lead?.id || null,
        token,
        ipAddress: ip,
      },
    });

    // Update lead email status
    if (lead) {
      await db.lead.update({
        where: { id: lead.id },
        data: { emailStatus: 'unsubscribed' },
      });

      // Update latest outreach message
      const outreachMessage = await db.outreachMessage.findFirst({
        where: { leadId: lead.id, channel: 'email' },
        orderBy: { sentAt: 'desc' },
      });

      if (outreachMessage) {
        await db.outreachMessage.update({
          where: { id: outreachMessage.id },
          data: { status: 'bounced' },
        });
      }
    }

    // Audit log
    if (userId) {
      await logUnsubscribeDetected(userId, email);
    }

    console.log(`[GmailTracking] Unsubscribe processed: ${email}, IP: ${ip}`);

    return { success: true, email };
  } catch (error) {
    console.error(`[GmailTracking] Failed to handle unsubscribe: ${error}`);
    return {
      success: false,
      email: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if an email address is unsubscribed.
 * Must be checked before sending any outreach email.
 *
 * @param email - The email address to check
 * @param userId - The user ID (for scoping)
 */
export async function checkUnsubscribeStatus(
  email: string,
  userId: string
): Promise<{
  isUnsubscribed: boolean;
  unsubscribedAt?: Date;
  reason?: string;
}> {
  try {
    const unsubscribe = await db.emailUnsubscribe.findUnique({
      where: { email },
    });

    if (!unsubscribe) {
      return { isUnsubscribed: false };
    }

    // Check if the unsubscribe belongs to this user or their org
    if (unsubscribe.userId && unsubscribe.userId !== userId) {
      // Check if same org
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { orgId: true },
      });
      const unsubUser = await db.user.findUnique({
        where: { id: unsubscribe.userId },
        select: { orgId: true },
      });

      if (!user?.orgId || user.orgId !== unsubUser?.orgId) {
        // Different org/user — still respect the unsubscribe
        // but don't expose details
        return { isUnsubscribed: true };
      }
    }

    return {
      isUnsubscribed: true,
      unsubscribedAt: unsubscribe.createdAt,
      reason: unsubscribe.reason || undefined,
    };
  } catch (error) {
    console.error(`[GmailTracking] Failed to check unsubscribe status: ${error}`);
    // On error, be safe and don't block sending
    return { isUnsubscribed: false };
  }
}

/**
 * Get bounce history for a user.
 *
 * @param userId - The user ID
 */
export async function getBounceHistory(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    bounceType?: 'hard' | 'soft';
  }
): Promise<{
  bounces: Array<{
    id: string;
    email: string;
    bounceType: string | null;
    bounceReason: string | null;
    messageId: string | null;
    leadId: string | null;
    createdAt: Date;
  }>;
  total: number;
}> {
  try {
    const where: Record<string, unknown> = { userId };
    if (options?.bounceType) {
      where.bounceType = options.bounceType;
    }

    const [bounces, total] = await Promise.all([
      db.emailBounce.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
        select: {
          id: true,
          email: true,
          bounceType: true,
          bounceReason: true,
          messageId: true,
          leadId: true,
          createdAt: true,
        },
      }),
      db.emailBounce.count({ where }),
    ]);

    return { bounces, total };
  } catch (error) {
    console.error(`[GmailTracking] Failed to get bounce history: ${error}`);
    return { bounces: [], total: 0 };
  }
}

// ===== HELPER FUNCTIONS =====

/**
 * Generate a tracking ID that encodes the message ID and event type.
 * Uses HMAC for tamper resistance.
 */
function generateTrackingId(messageId: string, eventType: 'open' | 'click'): string {
  const payload = `${messageId}:${eventType}`;
  const signature = crypto
    .createHmac('sha256', UNSUBSCRIBE_SECRET)
    .update(payload)
    .digest('hex')
    .substring(0, 16);
  return Buffer.from(`${payload}:${signature}`).toString('base64url');
}

/**
 * Decode a tracking ID back to message ID and event type.
 * Verifies the signature to prevent tampering.
 */
export function decodeTrackingId(trackingId: string): { messageId: string; eventType: 'open' | 'click' } | null {
  try {
    const decoded = Buffer.from(trackingId, 'base64url').toString('utf-8');
    const parts = decoded.split(':');

    if (parts.length !== 3) return null;

    const [messageId, eventType, signature] = parts;

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', UNSUBSCRIBE_SECRET)
      .update(`${messageId}:${eventType}`)
      .digest('hex')
      .substring(0, 16);

    if (signature !== expectedSignature) return null;

    if (eventType !== 'open' && eventType !== 'click') return null;

    return { messageId, eventType };
  } catch {
    return null;
  }
}

/**
 * Generate an unsubscribe token for an email address.
 */
export function generateUnsubscribeToken(email: string, userId?: string): string {
  const payload = JSON.stringify({ email, userId: userId || '' });
  const signature = crypto
    .createHmac('sha256', UNSUBSCRIBE_SECRET)
    .update(payload)
    .digest('hex')
    .substring(0, 24);

  return Buffer.from(`${payload}:${signature}`).toString('base64url');
}

/**
 * Decode an unsubscribe token.
 */
function decodeUnsubscribeToken(token: string): { email: string; userId?: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');

    // Find the last colon that separates payload from signature
    const lastColonIndex = decoded.lastIndexOf(':');
    if (lastColonIndex === -1) return null;

    const payload = decoded.substring(0, lastColonIndex);
    const signature = decoded.substring(lastColonIndex + 1);

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', UNSUBSCRIBE_SECRET)
      .update(payload)
      .digest('hex')
      .substring(0, 24);

    if (signature !== expectedSignature) return null;

    const parsed = JSON.parse(payload);
    return {
      email: parsed.email,
      userId: parsed.userId || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Extract email address from a bounce notification body.
 * Tries common patterns like "delivery to the following recipient failed: user@example.com"
 */
function extractEmailFromBounceBody(body: string): string | null {
  const patterns = [
    /failed delivery to\s+([^\s@]+@[^\s@]+\.[^\s@]+)/i,
    /delivery to the following recipient failed[:\s]+([^\s@]+@[^\s@]+\.[^\s@]+)/i,
    /unable to deliver mail to\s+([^\s@]+@[^\s@]+\.[^\s@]+)/i,
    /recipient address:\s*([^\s@]+@[^\s@]+\.[^\s@]+)/i,
    /([^\s@]+@[^\s@]+\.[^\s@]+)[:\s]+(not found|doesn't exist|undeliverable|mailbox unavailable)/i,
    /Your message wasn't delivered to\s+([^\s@]+@[^\s@]+\.[^\s@]+)/i,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

/**
 * Detect bounce type from email subject/body.
 */
function detectBounceType(body: string, subject: string): 'hard' | 'soft' {
  const combined = `${subject} ${body}`.toLowerCase();

  // Hard bounce indicators
  const hardIndicators = [
    'user not found',
    'no such user',
    "doesn't exist",
    'mailbox unavailable',
    'recipient rejected',
    'invalid recipient',
    'addressee unknown',
    'recipient not found',
    'no mailbox here',
  ];

  // Soft bounce indicators
  const softIndicators = [
    'mailbox full',
    'quota exceeded',
    'temporarily rejected',
    'try again later',
    'greylisted',
    'rate limited',
    'too many recipients',
    'message too large',
  ];

  for (const indicator of hardIndicators) {
    if (combined.includes(indicator)) return 'hard';
  }

  for (const indicator of softIndicators) {
    if (combined.includes(indicator)) return 'soft';
  }

  // Default to soft (safer assumption — will retry)
  return 'soft';
}
