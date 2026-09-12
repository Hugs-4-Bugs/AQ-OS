// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Gmail Inbox Service
// Phase 9: Gmail Integration
// Full inbox sync, thread/message management, search, labels
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { getValidAccessToken } from './gmail-oauth-service';
import { logInboxSynced } from './gmail-audit-service';
import { cacheSet, cacheGet, CachePrefix, CacheTTL, getGmailCache } from './gmail-cache-service';
import { processNewReplies } from './gmail-reply-processor';

// ===== TYPES =====

export interface GmailThread {
  id: string;
  snippet: string;
  historyId: string;
  messages?: GmailMessage[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  historyId: string;
  labelIds?: string[];
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{ mimeType: string; body?: { data?: string }; headers?: Array<{ name: string; value: string }> }>;
  };
  internalDate?: string;
}

export interface GmailLabel {
  id: string;
  name: string;
  type: string;
}

export interface SyncResult {
  threadsSynced: number;
  messagesSynced: number;
  newThreads: number;
  newMessages: number;
  errors: number;
  nextPageToken?: string;
}

export interface PaginatedThreads {
  threads: Array<{
    id: string;
    gmailThreadId: string;
    subject: string | null;
    lastMessageAt: Date | null;
    messageCount: number;
    isRead: boolean;
  }>;
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export class GmailInboxError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string = 'GMAIL_INBOX_ERROR', statusCode: number = 400) {
    super(message);
    this.name = 'GmailInboxError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ===== RATE LIMITING =====

const apiCallTimestamps: Map<string, number[]> = new Map();
const MAX_API_CALLS_PER_SECOND = 8;
const MAX_API_CALLS_PER_MINUTE = 200;

function checkApiRateLimit(emailAccountId: string): void {
  const now = Date.now();
  const timestamps = apiCallTimestamps.get(emailAccountId) || [];

  // Per-second rate limit
  const recentSecond = timestamps.filter(t => now - t < 1000);
  if (recentSecond.length >= MAX_API_CALLS_PER_SECOND) {
    throw new GmailInboxError(
      'Gmail API rate limit: too many requests per second',
      'RATE_LIMITED_SECOND',
      429
    );
  }

  // Per-minute rate limit
  const recentMinute = timestamps.filter(t => now - t < 60_000);
  if (recentMinute.length >= MAX_API_CALLS_PER_MINUTE) {
    throw new GmailInboxError(
      'Gmail API rate limit: too many requests per minute',
      'RATE_LIMITED_MINUTE',
      429
    );
  }

  timestamps.push(now);
  apiCallTimestamps.set(emailAccountId, timestamps);
}

// ===== GMAIL API HELPER =====

/**
 * Make an authenticated request to the Gmail API with retry logic.
 */
async function gmailApiRequest(
  emailAccountId: string,
  path: string,
  options: {
    method?: string;
    body?: string;
    params?: Record<string, string>;
    maxRetries?: number;
  } = {}
): Promise<Response> {
  const { method = 'GET', body, params, maxRetries = 3 } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      checkApiRateLimit(emailAccountId);

      const accessToken = await getValidAccessToken(emailAccountId);

      const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me${path}`);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          url.searchParams.set(key, value);
        });
      }

      const response = await fetch(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body,
      });

      // Handle rate limiting from Gmail API
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
        const backoffMs = Math.min(retryAfter * 1000 * Math.pow(2, attempt), 30_000);
        console.warn(`[GmailInbox] Rate limited, retrying in ${backoffMs}ms (attempt ${attempt + 1})`);
        await sleep(backoffMs);
        continue;
      }

      // Handle auth errors
      if (response.status === 401) {
        // Try refreshing the token once
        if (attempt === 0) {
          console.log('[GmailInbox] Auth error, attempting token refresh');
          continue; // getValidAccessToken will handle refresh
        }
        throw new GmailInboxError(
          'Gmail API authentication failed after token refresh',
          'AUTH_FAILED',
          401
        );
      }

      // Handle server errors with retry
      if (response.status >= 500 && attempt < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 30_000);
        console.warn(`[GmailInbox] Server error ${response.status}, retrying in ${backoffMs}ms`);
        await sleep(backoffMs);
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new GmailInboxError(
          `Gmail API error: ${response.status} - ${errorBody}`,
          'API_ERROR',
          response.status
        );
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (error instanceof GmailInboxError && error.statusCode === 429) {
        // Rate limited — exponential backoff
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 30_000);
        console.warn(`[GmailInbox] Rate limited, backing off ${backoffMs}ms`);
        await sleep(backoffMs);
        continue;
      }

      if (attempt < maxRetries && !(error instanceof GmailInboxError && error.statusCode === 401)) {
        const backoffMs = Math.min(500 * Math.pow(2, attempt), 10_000);
        console.warn(`[GmailInbox] Request failed, retrying in ${backoffMs}ms:`, error);
        await sleep(backoffMs);
        continue;
      }

      throw error;
    }
  }

  throw new GmailInboxError(
    `Gmail API request failed after ${maxRetries + 1} attempts: ${lastError?.message}`,
    'MAX_RETRIES_EXCEEDED',
    503
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== HEADER EXTRACTION =====

function getHeader(headers: Array<{ name: string; value: string }> | undefined, name: string): string | null {
  if (!headers) return null;
  const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return header?.value || null;
}

function decodeBase64Url(data: string | undefined): string {
  if (!data) return '';
  // Gmail uses URL-safe base64
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

// ===== INBOX SYNC =====

/**
 * Full inbox sync from Gmail API.
 * Fetches all threads and messages, deduplicating by gmailMessageId/gmailThreadId.
 * @param emailAccountId - The EmailAccount ID to sync
 */
export async function syncInbox(emailAccountId: string): Promise<SyncResult> {
  // Check sync status cache to prevent concurrent syncs
  const syncKey = `${CachePrefix.SYNC_STATUS}${emailAccountId}`;
  const syncStatus = cacheGet<{ inProgress: boolean; startedAt: string }>(syncKey);

  if (syncStatus?.inProgress) {
    const elapsed = Date.now() - new Date(syncStatus.startedAt).getTime();
    if (elapsed < 5 * 60 * 1000) {
      // Another sync is in progress and less than 5 minutes old
      throw new GmailInboxError(
        'Inbox sync already in progress for this account',
        'SYNC_IN_PROGRESS',
        409
      );
    }
  }

  // Mark sync as in progress
  cacheSet(syncKey, { inProgress: true, startedAt: new Date().toISOString() }, 5 * 60 * 1000);

  const result: SyncResult = {
    threadsSynced: 0,
    messagesSynced: 0,
    newThreads: 0,
    newMessages: 0,
    errors: 0,
  };

  try {
    const account = await db.emailAccount.findUnique({
      where: { id: emailAccountId },
    });

    if (!account) {
      throw new GmailInboxError('Email account not found', 'ACCOUNT_NOT_FOUND', 404);
    }

    let pageToken: string | undefined;

    // Fetch all threads page by page
    do {
      const params: Record<string, string> = {
        maxResults: '100',
      };

      if (pageToken) {
        params.pageToken = pageToken;
      }

      const response = await gmailApiRequest(emailAccountId, '/threads', { params });
      const data = await response.json() as { threads?: GmailThread[]; nextPageToken?: string };

      if (!data.threads || data.threads.length === 0) {
        break;
      }

      // Process each thread
      for (const thread of data.threads) {
        try {
          await syncThread(emailAccountId, thread.id);
          result.threadsSynced++;
        } catch (error) {
          console.error(`[GmailInbox] Error syncing thread ${thread.id}:`, error);
          result.errors++;
        }
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    // Update last poll time
    await db.emailAccount.update({
      where: { id: emailAccountId },
      data: { lastPollAt: new Date() },
    });

    // Audit log
    await logInboxSynced(account.userId, emailAccountId, result.messagesSynced);

    // Invalidate inbox cache
    getGmailCache().invalidateAccount(emailAccountId);

    // Mark sync complete
    cacheSet(syncKey, { inProgress: false, startedAt: new Date().toISOString() }, CacheTTL.SYNC_STATUS);

    console.log(`[GmailInbox] Sync complete: ${result.threadsSynced} threads, ${result.messagesSynced} messages, ${result.errors} errors`);

    // ── Phase 3: Trigger reply intelligence pipeline after sync ──
    // Non-blocking: inbox sync still completes even if reply processing fails.
    // For each new inbound email from a known lead, processGmailReply
    // will classify intent, update lead stage, and trigger workflows.
    if (result.threadsSynced > 0 && account.userId) {
      processNewReplies(account.userId)
        .then((replyResult) => {
          console.log(`[GmailInbox] Reply processing triggered: ${replyResult.matchedCount} matched, ${replyResult.classifiedCount} classified, ${replyResult.errors.length} errors`);
        })
        .catch((err) => {
          console.error('[GmailInbox] Reply processing failed (non-blocking):', err);
        });
    }

    return result;
  } catch (error) {
    // Mark sync as failed
    cacheSet(syncKey, { inProgress: false, startedAt: new Date().toISOString() }, CacheTTL.SYNC_STATUS);

    if (error instanceof GmailInboxError) throw error;
    throw new GmailInboxError(
      `Inbox sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'SYNC_FAILED',
      500
    );
  }
}

/**
 * Sync an individual thread from Gmail.
 * @param emailAccountId - The EmailAccount ID
 * @param gmailThreadId - The Gmail thread ID to sync
 */
export async function syncThread(
  emailAccountId: string,
  gmailThreadId: string
): Promise<{ threadId: string; messagesSynced: number }> {
  // Get full thread with messages
  const response = await gmailApiRequest(emailAccountId, `/threads/${gmailThreadId}`, {
    params: { format: 'full' },
  });

  const gmailThread = await response.json() as GmailThread;

  if (!gmailThread.messages || gmailThread.messages.length === 0) {
    return { threadId: gmailThreadId, messagesSynced: 0 };
  }

  // Extract subject from first message
  const firstMessage = gmailThread.messages[0];
  const subject = getHeader(firstMessage.payload?.headers, 'Subject') || '(No Subject)';

  // Find last message date
  const lastMessageDate = gmailThread.messages
    .map(m => m.internalDate ? new Date(parseInt(m.internalDate)) : new Date())
    .sort((a, b) => b.getTime() - a.getTime())[0];

  // Check if thread already exists
  const existingThread = await db.emailThread.findFirst({
    where: { gmailThreadId, emailAccountId },
  });

  let threadId: string;

  if (existingThread) {
    // Update existing thread
    await db.emailThread.update({
      where: { id: existingThread.id },
      data: {
        subject,
        lastMessageAt: lastMessageDate,
        messageCount: gmailThread.messages.length,
        isRead: !gmailThread.messages.some(m => m.labelIds?.includes('UNREAD')),
      },
    });
    threadId = existingThread.id;
  } else {
    // Create new thread
    const created = await db.emailThread.create({
      data: {
        emailAccountId,
        gmailThreadId,
        subject,
        lastMessageAt: lastMessageDate,
        messageCount: gmailThread.messages.length,
        isRead: !gmailThread.messages.some(m => m.labelIds?.includes('UNREAD')),
      },
    });
    threadId = created.id;
  }

  // Sync individual messages
  let messagesSynced = 0;

  for (const message of gmailThread.messages) {
    try {
      // Dedup by gmailMessageId
      const existing = await db.emailMessage.findUnique({
        where: { gmailMessageId: message.id },
      });

      if (existing) continue; // Skip duplicate

      const fromEmail = getHeader(message.payload?.headers, 'From') || '';
      const toEmail = getHeader(message.payload?.headers, 'To') || '';
      const msgSubject = getHeader(message.payload?.headers, 'Subject') || subject;

      // Extract body
      let bodyPlain = '';
      let bodyHtml = '';

      if (message.payload?.body?.data) {
        bodyPlain = decodeBase64Url(message.payload.body.data);
      }

      if (message.payload?.parts) {
        for (const part of message.payload.parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            bodyPlain = decodeBase64Url(part.body.data);
          }
          if (part.mimeType === 'text/html' && part.body?.data) {
            bodyHtml = decodeBase64Url(part.body.data);
          }
        }
      }

      // Determine direction (inbound vs outbound)
      const account = await db.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: { gmailEmail: true },
      });

      const direction = fromEmail.includes(account?.gmailEmail || '') ? 'outbound' : 'inbound';

      await db.emailMessage.create({
        data: {
          threadId,
          gmailMessageId: message.id,
          fromEmail,
          toEmail,
          subject: msgSubject,
          bodyPlain: bodyPlain.substring(0, 50000) || null, // Limit size
          bodyHtml: bodyHtml.substring(0, 500000) || null,   // Limit size
          direction,
          isRead: !message.labelIds?.includes('UNREAD'),
          labels: message.labelIds ? JSON.stringify(message.labelIds) : null,
        },
      });

      messagesSynced++;
    } catch (error) {
      console.error(`[GmailInbox] Error syncing message ${message.id}:`, error);
    }
  }

  return { threadId, messagesSynced };
}

// ===== GET THREADS =====

/**
 * Get paginated threads for an email account.
 * Uses cache when available.
 */
export async function getThreads(
  emailAccountId: string,
  params: {
    page?: number;
    limit?: number;
    query?: string;
    labelIds?: string[];
  } = {}
): Promise<PaginatedThreads> {
  const { page = 1, limit = 20, query, labelIds } = params;

  // Check cache
  const cacheKey = `${CachePrefix.INBOX_LIST}${emailAccountId}:${page}:${limit}:${query || ''}:${(labelIds || []).join(',')}`;
  const cached = cacheGet<PaginatedThreads>(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = { emailAccountId };

  // Search by subject if query provided
  if (query) {
    where.subject = { contains: query };
  }

  const [threads, total] = await Promise.all([
    db.emailThread.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        gmailThreadId: true,
        subject: true,
        lastMessageAt: true,
        messageCount: true,
        isRead: true,
      },
    }),
    db.emailThread.count({ where }),
  ]);

  const result: PaginatedThreads = {
    threads,
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };

  cacheSet(cacheKey, result, CacheTTL.INBOX_LIST);

  return result;
}

// ===== GET THREAD MESSAGES =====

/**
 * Get all messages in a thread.
 */
export async function getThreadMessages(threadId: string): Promise<Array<{
  id: string;
  gmailMessageId: string | null;
  fromEmail: string;
  toEmail: string;
  subject: string | null;
  bodyPlain: string | null;
  bodyHtml: string | null;
  direction: string;
  isRead: boolean;
  labels: string | null;
  createdAt: Date;
}>> {
  const cacheKey = `${CachePrefix.THREAD_DATA}${threadId}`;
  const cached = cacheGet<Array<{
    id: string;
    gmailMessageId: string | null;
    fromEmail: string;
    toEmail: string;
    subject: string | null;
    bodyPlain: string | null;
    bodyHtml: string | null;
    direction: string;
    isRead: boolean;
    labels: string | null;
    createdAt: Date;
  }>>(cacheKey);
  if (cached) return cached;

  const messages = await db.emailMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      gmailMessageId: true,
      fromEmail: true,
      toEmail: true,
      subject: true,
      bodyPlain: true,
      bodyHtml: true,
      direction: true,
      isRead: true,
      labels: true,
      createdAt: true,
    },
  });

  cacheSet(cacheKey, messages, CacheTTL.THREAD_DATA);

  return messages;
}

// ===== MARK AS READ/UNREAD =====

/**
 * Mark a thread as read in both Gmail and local database.
 */
export async function markAsRead(threadId: string): Promise<void> {
  const thread = await db.emailThread.findUnique({
    where: { id: threadId },
    include: { emailAccount: { select: { id: true } } },
  });

  if (!thread) {
    throw new GmailInboxError('Thread not found', 'THREAD_NOT_FOUND', 404);
  }

  // Mark as read in Gmail
  try {
    await gmailApiRequest(thread.emailAccount.id, `/threads/${thread.gmailThreadId}/modify`, {
      method: 'POST',
      body: JSON.stringify({
        removeLabelIds: ['UNREAD'],
      }),
    });
  } catch (error) {
    console.error('[GmailInbox] Failed to mark as read in Gmail:', error);
    // Continue with local update even if Gmail API fails
  }

  // Update local database
  await db.emailThread.update({
    where: { id: threadId },
    data: { isRead: true },
  });

  await db.emailMessage.updateMany({
    where: { threadId },
    data: { isRead: true },
  });

  // Invalidate cache
  cacheDelete(`${CachePrefix.THREAD_DATA}${threadId}`);
  getGmailCache().invalidateAccount(thread.emailAccountId);
}

/**
 * Mark a thread as unread in both Gmail and local database.
 */
export async function markAsUnread(threadId: string): Promise<void> {
  const thread = await db.emailThread.findUnique({
    where: { id: threadId },
    include: { emailAccount: { select: { id: true } } },
  });

  if (!thread) {
    throw new GmailInboxError('Thread not found', 'THREAD_NOT_FOUND', 404);
  }

  // Mark as unread in Gmail
  try {
    await gmailApiRequest(thread.emailAccount.id, `/threads/${thread.gmailThreadId}/modify`, {
      method: 'POST',
      body: JSON.stringify({
        addLabelIds: ['UNREAD'],
      }),
    });
  } catch (error) {
    console.error('[GmailInbox] Failed to mark as unread in Gmail:', error);
  }

  // Update local database
  await db.emailThread.update({
    where: { id: threadId },
    data: { isRead: false },
  });

  await db.emailMessage.updateMany({
    where: { threadId },
    data: { isRead: false },
  });

  // Invalidate cache
  cacheDelete(`${CachePrefix.THREAD_DATA}${threadId}`);
  getGmailCache().invalidateAccount(thread.emailAccountId);
}

// ===== SEARCH =====

/**
 * Search emails using Gmail query syntax.
 * Falls back to database search if Gmail API is unavailable.
 */
export async function searchEmails(
  emailAccountId: string,
  query: string
): Promise<PaginatedThreads> {
  // Use Gmail API search
  try {
    const response = await gmailApiRequest(emailAccountId, '/threads', {
      params: {
        q: query,
        maxResults: '50',
      },
    });

    const data = await response.json() as { threads?: GmailThread[]; resultSizeEstimate?: number };

    // Sync found threads to local DB
    if (data.threads) {
      for (const thread of data.threads) {
        try {
          await syncThread(emailAccountId, thread.id);
        } catch {
          // Continue even if individual thread sync fails
        }
      }
    }

    // Return from local DB after sync
    return getThreads(emailAccountId, { query, limit: 50 });
  } catch (error) {
    console.warn('[GmailInbox] Gmail API search failed, using local search:', error);
    // Fall back to local database search
    return getThreads(emailAccountId, { query, limit: 50 });
  }
}

// ===== LABELS =====

/**
 * Get Gmail labels for an email account.
 * Results are cached for 1 hour.
 */
export async function getEmailLabels(emailAccountId: string): Promise<GmailLabel[]> {
  const cacheKey = `${CachePrefix.LABELS}${emailAccountId}`;
  const cached = cacheGet<GmailLabel[]>(cacheKey);
  if (cached) return cached;

  const response = await gmailApiRequest(emailAccountId, '/labels');
  const data = await response.json() as { labels?: GmailLabel[] };

  const labels = data.labels || [];
  cacheSet(cacheKey, labels, CacheTTL.LABELS);

  return labels;
}
