// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Gmail Delivery Service
// Phase 9: Gmail Integration
// Email delivery, drafts, replies — all via Gmail API
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { getValidAccessToken } from './gmail-oauth-service';
import { logEmailSent, logEmailFailed, logEmailDrafted } from './gmail-audit-service';
import { cacheDelete, CachePrefix, getGmailCache } from './gmail-cache-service';

// ===== TYPES =====

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  html?: string;
  cc?: string[];
  bcc?: string[];
  replyToMessageId?: string;
}

export interface CreateDraftParams {
  to: string;
  subject: string;
  body: string;
  html?: string;
}

export interface ReplyToEmailParams {
  body: string;
  html?: string;
  replyAll?: boolean;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  threadId?: string;
  gmailMessageId?: string;
  error?: string;
}

export interface DraftResult {
  success: boolean;
  draftId?: string;
  message?: GmailDraftMessage;
  error?: string;
}

interface GmailDraftMessage {
  id: string;
  threadId: string;
}

export class GmailDeliveryError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string = 'GMAIL_DELIVERY_ERROR', statusCode: number = 400) {
    super(message);
    this.name = 'GmailDeliveryError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ===== RATE LIMITING =====

const sendTimestamps: Map<string, number[]> = new Map();
const MAX_SENDS_PER_MINUTE = 20;

function checkSendRateLimit(emailAccountId: string): void {
  const now = Date.now();
  const timestamps = sendTimestamps.get(emailAccountId) || [];
  const recent = timestamps.filter(t => now - t < 60_000);

  if (recent.length >= MAX_SENDS_PER_MINUTE) {
    throw new GmailDeliveryError(
      'Email send rate limit exceeded. Please try again later.',
      'SEND_RATE_LIMITED',
      429
    );
  }

  recent.push(now);
  sendTimestamps.set(emailAccountId, recent);
}

// ===== EMAIL CONSTRUCTION =====

/**
 * Build a raw RFC 2822 email message.
 * Encoded as base64url for the Gmail API.
 */
function buildRawEmail(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
  html?: string;
  cc?: string[];
  bcc?: string[];
  replyToMessageId?: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const lines: string[] = [];

  lines.push(`From: ${params.from}`);
  lines.push(`To: ${params.to}`);

  if (params.cc && params.cc.length > 0) {
    lines.push(`Cc: ${params.cc.join(', ')}`);
  }

  if (params.bcc && params.bcc.length > 0) {
    lines.push(`Bcc: ${params.bcc.join(', ')}`);
  }

  lines.push(`Subject: =?utf-8?B?${Buffer.from(params.subject).toString('base64')}?=`);
  lines.push('MIME-Version: 1.0');

  if (params.inReplyTo) {
    lines.push(`In-Reply-To: ${params.inReplyTo}`);
  }

  if (params.references) {
    lines.push(`References: ${params.references}`);
  }

  if (params.html) {
    const boundary = 'boundary_' + Date.now() + '_' + Math.random().toString(36).substring(2);
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push('');

    // Plain text part
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push('Content-Transfer-Encoding: quoted-printable');
    lines.push('');
    lines.push(params.body);
    lines.push('');

    // HTML part
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/html; charset="UTF-8"');
    lines.push('Content-Transfer-Encoding: quoted-printable');
    lines.push('');
    lines.push(params.html);
    lines.push('');

    lines.push(`--${boundary}--`);
  } else {
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push('Content-Transfer-Encoding: quoted-printable');
    lines.push('');
    lines.push(params.body);
  }

  return lines.join('\r\n');
}

/**
 * Encode a raw email for Gmail API (base64url).
 */
function encodeRawEmail(raw: string): string {
  return Buffer.from(raw, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Make an authenticated request to Gmail API with retry.
 */
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
        const retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10);
        const backoffMs = Math.min(retryAfter * 1000 * Math.pow(2, attempt), 30_000);
        console.warn(`[GmailDelivery] Rate limited, retrying in ${backoffMs}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      if (response.status >= 500 && attempt < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 30_000);
        console.warn(`[GmailDelivery] Server error, retrying in ${backoffMs}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new GmailDeliveryError(
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

  throw new GmailDeliveryError(
    `Gmail API request failed: ${lastError?.message}`,
    'MAX_RETRIES_EXCEEDED',
    503
  );
}

// ===== BOUNCE DETECTION =====

interface BounceInfo {
  isBounce: boolean;
  bounceType?: 'hard' | 'soft';
  bounceReason?: string;
  recipientEmail?: string;
}

/**
 * Detect if a send error indicates a bounce.
 */
function detectBounceFromError(error: GmailDeliveryError): BounceInfo {
  const message = error.message.toLowerCase();

  if (message.includes('bounce') || message.includes('rejected') || message.includes('recipient not found')) {
    return {
      isBounce: true,
      bounceType: 'hard',
      bounceReason: error.message,
    };
  }

  if (message.includes('quota exceeded') || message.includes('temporarily rejected')) {
    return {
      isBounce: true,
      bounceType: 'soft',
      bounceReason: error.message,
    };
  }

  return { isBounce: false };
}

/**
 * Record a bounce in the database.
 */
async function recordBounce(params: {
  userId: string;
  email: string;
  bounceType: 'hard' | 'soft';
  bounceReason: string;
  messageId?: string;
  leadId?: string;
}): Promise<void> {
  try {
    await db.emailBounce.create({
      data: {
        userId: params.userId,
        leadId: params.leadId || null,
        email: params.email,
        bounceType: params.bounceType,
        bounceReason: params.bounceReason,
        messageId: params.messageId || null,
      },
    });
  } catch (error) {
    console.error('[GmailDelivery] Failed to record bounce:', error);
  }
}

// ===== SEND EMAIL =====

/**
 * Send an email via Gmail API.
 * Records in EmailMessage and OutreachMessage tables.
 */
export async function sendEmail(
  emailAccountId: string,
  params: SendEmailParams
): Promise<SendResult> {
  checkSendRateLimit(emailAccountId);

  const account = await db.emailAccount.findUnique({
    where: { id: emailAccountId },
  });

  if (!account) {
    throw new GmailDeliveryError('Email account not found', 'ACCOUNT_NOT_FOUND', 404);
  }

  if (account.status !== 'active') {
    throw new GmailDeliveryError('Email account is not active. Please reconnect.', 'ACCOUNT_NOT_ACTIVE', 403);
  }

  try {
    // Build the raw email
    const rawEmail = buildRawEmail({
      from: account.gmailEmail,
      to: params.to,
      subject: params.subject,
      body: params.body,
      html: params.html,
      cc: params.cc,
      bcc: params.bcc,
    });

    const encodedRaw = encodeRawEmail(rawEmail);

    // Send via Gmail API
    const response = await gmailApiRequest(emailAccountId, '/messages/send', {
      method: 'POST',
      body: JSON.stringify({ raw: encodedRaw }),
    });

    const result = await response.json() as { id: string; threadId: string };

    // Find or create thread
    let threadId: string | null = null;

    if (result.threadId) {
      const existingThread = await db.emailThread.findFirst({
        where: { gmailThreadId: result.threadId, emailAccountId },
      });

      if (existingThread) {
        threadId = existingThread.id;
      } else {
        const newThread = await db.emailThread.create({
          data: {
            emailAccountId,
            gmailThreadId: result.threadId,
            subject: params.subject,
            lastMessageAt: new Date(),
            messageCount: 1,
            isRead: true,
          },
        });
        threadId = newThread.id;
      }
    }

    // Record in EmailMessage table
    if (threadId) {
      await db.emailMessage.create({
        data: {
          threadId,
          gmailMessageId: result.id,
          fromEmail: account.gmailEmail,
          toEmail: params.to,
          subject: params.subject,
          bodyPlain: params.body,
          bodyHtml: params.html || null,
          direction: 'outbound',
          isRead: true,
        },
      });
    }

    // Find lead by email for OutreachMessage
    const lead = await db.lead.findFirst({
      where: { email: params.to, isActive: true },
    });

    if (lead) {
      await db.outreachMessage.create({
        data: {
          leadId: lead.id,
          userId: account.userId,
          channel: 'email',
          direction: 'outbound',
          subject: params.subject,
          content: params.body,
          status: 'sent',
          sentAt: new Date(),
        },
      });

      // Update lead email status
      await db.lead.update({
        where: { id: lead.id },
        data: { emailStatus: 'sent', lastContactedAt: new Date() },
      });
    }

    // Audit log
    await logEmailSent(account.userId, params.to, params.subject, result.id);

    // Invalidate cache
    getGmailCache().invalidateAccount(emailAccountId);

    console.log(`[GmailDelivery] Email sent to: ${params.to}, subject: "${params.subject}", messageId: ${result.id}`);

    return {
      success: true,
      messageId: result.id,
      threadId: result.threadId,
      gmailMessageId: result.id,
    };
  } catch (error) {
    // Check for bounce
    if (error instanceof GmailDeliveryError) {
      const bounceInfo = detectBounceFromError(error);
      if (bounceInfo.isBounce && bounceInfo.bounceType) {
        await recordBounce({
          userId: account.userId,
          email: params.to,
          bounceType: bounceInfo.bounceType,
          bounceReason: bounceInfo.bounceReason || error.message,
        });
      }
    }

    // Audit log for failure
    await logEmailFailed(
      account.userId,
      params.to,
      params.subject,
      error instanceof Error ? error.message : 'Unknown error'
    );

    if (error instanceof GmailDeliveryError) throw error;

    throw new GmailDeliveryError(
      `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'SEND_FAILED',
      500
    );
  }
}

// ===== DRAFT OPERATIONS =====

/**
 * Create a Gmail draft.
 */
export async function createDraft(
  emailAccountId: string,
  params: CreateDraftParams
): Promise<DraftResult> {
  const account = await db.emailAccount.findUnique({
    where: { id: emailAccountId },
  });

  if (!account) {
    throw new GmailDeliveryError('Email account not found', 'ACCOUNT_NOT_FOUND', 404);
  }

  try {
    const rawEmail = buildRawEmail({
      from: account.gmailEmail,
      to: params.to,
      subject: params.subject,
      body: params.body,
      html: params.html,
    });

    const encodedRaw = encodeRawEmail(rawEmail);

    const response = await gmailApiRequest(emailAccountId, '/drafts', {
      method: 'POST',
      body: JSON.stringify({
        message: { raw: encodedRaw },
      }),
    });

    const result = await response.json() as { id: string; message: GmailDraftMessage };

    // Audit log
    await logEmailDrafted(account.userId, params.to, params.subject);

    // Invalidate drafts cache
    cacheDelete(`${CachePrefix.DRAFTS}${emailAccountId}`);

    console.log(`[GmailDelivery] Draft created: ${result.id}`);

    return {
      success: true,
      draftId: result.id,
      message: result.message,
    };
  } catch (error) {
    if (error instanceof GmailDeliveryError) throw error;
    throw new GmailDeliveryError(
      `Failed to create draft: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'DRAFT_CREATE_FAILED',
      500
    );
  }
}

/**
 * Send an existing draft.
 */
export async function sendDraft(
  emailAccountId: string,
  draftId: string
): Promise<SendResult> {
  checkSendRateLimit(emailAccountId);

  const account = await db.emailAccount.findUnique({
    where: { id: emailAccountId },
  });

  if (!account) {
    throw new GmailDeliveryError('Email account not found', 'ACCOUNT_NOT_FOUND', 404);
  }

  try {
    const response = await gmailApiRequest(emailAccountId, `/drafts/send`, {
      method: 'POST',
      body: JSON.stringify({ id: draftId }),
    });

    const result = await response.json() as { id: string; threadId: string };

    // Audit log
    await logEmailSent(account.userId, '(draft)', 'Draft sent', result.id);

    // Invalidate caches
    cacheDelete(`${CachePrefix.DRAFTS}${emailAccountId}`);
    getGmailCache().invalidateAccount(emailAccountId);

    console.log(`[GmailDelivery] Draft sent: ${draftId}, messageId: ${result.id}`);

    return {
      success: true,
      messageId: result.id,
      threadId: result.threadId,
      gmailMessageId: result.id,
    };
  } catch (error) {
    if (error instanceof GmailDeliveryError) throw error;
    throw new GmailDeliveryError(
      `Failed to send draft: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'DRAFT_SEND_FAILED',
      500
    );
  }
}

/**
 * Delete a draft.
 */
export async function deleteDraft(
  emailAccountId: string,
  draftId: string
): Promise<void> {
  try {
    await gmailApiRequest(emailAccountId, `/drafts/${draftId}`, {
      method: 'DELETE',
    });

    cacheDelete(`${CachePrefix.DRAFTS}${emailAccountId}`);

    console.log(`[GmailDelivery] Draft deleted: ${draftId}`);
  } catch (error) {
    if (error instanceof GmailDeliveryError) throw error;
    throw new GmailDeliveryError(
      `Failed to delete draft: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'DRAFT_DELETE_FAILED',
      500
    );
  }
}

/**
 * List drafts for an email account.
 */
export async function listDrafts(emailAccountId: string): Promise<Array<{
  id: string;
  message: { id: string; threadId: string; snippet?: string };
}>> {
  const response = await gmailApiRequest(emailAccountId, '/drafts', {
    params: { maxResults: '50' },
  });

  const data = await response.json() as { drafts?: Array<{ id: string; message: { id: string; threadId: string; snippet?: string } }> };
  return data.drafts || [];
}

// ===== REPLY =====

/**
 * Reply to an email thread.
 * @param emailAccountId - The EmailAccount ID
 * @param messageId - The Gmail message ID to reply to
 * @param params - Reply parameters
 */
export async function replyToEmail(
  emailAccountId: string,
  messageId: string,
  params: ReplyToEmailParams
): Promise<SendResult> {
  checkSendRateLimit(emailAccountId);

  const account = await db.emailAccount.findUnique({
    where: { id: emailAccountId },
  });

  if (!account) {
    throw new GmailDeliveryError('Email account not found', 'ACCOUNT_NOT_FOUND', 404);
  }

  try {
    // Get the original message to extract headers
    const msgResponse = await gmailApiRequest(emailAccountId, `/messages/${messageId}`, {
      params: { format: 'metadata', metadataHeaders: ['Subject', 'From', 'To', 'Message-Id', 'References'] },
    });

    const originalMessage = await msgResponse.json() as {
      threadId: string;
      payload?: {
        headers?: Array<{ name: string; value: string }>;
      };
    };

    // Extract headers
    const headers = originalMessage.payload?.headers || [];
    const getHeader = (name: string): string | null => {
      const h = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
      return h?.value || null;
    };

    const originalSubject = getHeader('Subject') || '';
    const originalFrom = getHeader('From') || '';
    const originalTo = getHeader('To') || '';
    const originalMessageId = getHeader('Message-Id') || '';
    const originalReferences = getHeader('References') || '';

    // Build reply subject
    const replySubject = originalSubject.toLowerCase().startsWith('re:')
      ? originalSubject
      : `Re: ${originalSubject}`;

    // Determine reply-to address
    const replyTo = params.replyAll ? originalTo : originalFrom;

    // Build raw email with threading headers
    const rawEmail = buildRawEmail({
      from: account.gmailEmail,
      to: replyTo,
      subject: replySubject,
      body: params.body,
      html: params.html,
      inReplyTo: originalMessageId,
      references: originalReferences
        ? `${originalReferences} ${originalMessageId}`
        : originalMessageId,
    });

    const encodedRaw = encodeRawEmail(rawEmail);

    // Send as a reply in the thread
    const response = await gmailApiRequest(emailAccountId, '/messages/send', {
      method: 'POST',
      body: JSON.stringify({
        raw: encodedRaw,
        threadId: originalMessage.threadId,
      }),
    });

    const result = await response.json() as { id: string; threadId: string };

    // Record in EmailMessage
    const thread = await db.emailThread.findFirst({
      where: { gmailThreadId: result.threadId, emailAccountId },
    });

    if (thread) {
      await db.emailMessage.create({
        data: {
          threadId: thread.id,
          gmailMessageId: result.id,
          fromEmail: account.gmailEmail,
          toEmail: replyTo,
          subject: replySubject,
          bodyPlain: params.body,
          bodyHtml: params.html || null,
          direction: 'outbound',
          isRead: true,
        },
      });

      // Update thread
      await db.emailThread.update({
        where: { id: thread.id },
        data: {
          lastMessageAt: new Date(),
          messageCount: { increment: 1 },
        },
      });
    }

    // Find lead and create OutreachMessage
    const lead = await db.lead.findFirst({
      where: { email: originalFrom, isActive: true },
    });

    if (lead) {
      await db.outreachMessage.create({
        data: {
          leadId: lead.id,
          userId: account.userId,
          channel: 'email',
          direction: 'outbound',
          subject: replySubject,
          content: params.body,
          status: 'sent',
          sentAt: new Date(),
        },
      });

      await db.lead.update({
        where: { id: lead.id },
        data: { emailStatus: 'sent' },
      });
    }

    // Audit log
    await logEmailSent(account.userId, replyTo, replySubject, result.id);

    // Invalidate cache
    getGmailCache().invalidateAccount(emailAccountId);

    console.log(`[GmailDelivery] Reply sent to: ${replyTo}, subject: "${replySubject}"`);

    return {
      success: true,
      messageId: result.id,
      threadId: result.threadId,
      gmailMessageId: result.id,
    };
  } catch (error) {
    if (error instanceof GmailDeliveryError) throw error;
    throw new GmailDeliveryError(
      `Failed to reply to email: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'REPLY_FAILED',
      500
    );
  }
}
