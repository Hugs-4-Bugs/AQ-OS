// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Incoming Sync Validation Service
// Phase 10: Messaging Remediation — Dedup, format validation, rate limiting
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────

export interface IncomingMessage {
  channel: 'telegram' | 'whatsapp';
  externalId: string;       // Message ID from the provider
  userId: string;
  leadId?: string;
  senderId: string;         // Phone number or chat ID
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  isDuplicate?: boolean;
  isOutOfOrder?: boolean;
  rateLimited?: boolean;
}

export interface SyncStatus {
  channel: string;
  lastSyncAt: Date | null;
  messagesProcessed: number;
  duplicatesRejected: number;
  outOfOrderHandled: number;
  rateLimitsHit: number;
}

// ─── Constants ────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_MESSAGES = 30; // Max messages per user per window
const OUT_OF_ORDER_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// In-memory rate limit tracking (per user per channel)
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

// In-memory sync status tracking
const syncStatusMap = new Map<string, SyncStatus>();

// ─── Core Service Functions ───────────────────────────────────────

/**
 * Validate an incoming message from Telegram or WhatsApp
 */
export async function validateIncomingMessage(
  message: IncomingMessage
): Promise<ValidationResult> {
  // 1. Validate message format for the channel
  const formatResult = validateMessageFormat(message);
  if (!formatResult.valid) {
    return formatResult;
  }

  // 2. Check for duplicates
  const isDuplicate = await deduplicateMessage(message.channel, message.externalId);
  if (isDuplicate) {
    return {
      valid: false,
      error: 'Duplicate message',
      isDuplicate: true,
    };
  }

  // 3. Check rate limits
  const rateLimitResult = checkIncomingRateLimit(message.userId, message.channel);
  if (rateLimitResult.rateLimited) {
    return {
      valid: false,
      error: 'Rate limit exceeded',
      rateLimited: true,
    };
  }

  // 4. Handle out-of-order delivery
  const outOfOrder = await handleOutOfOrderMessage(message);
  if (outOfOrder.isOutOfOrder) {
    // Still valid, just flagged — we process it but note the ordering issue
    return {
      valid: true,
      isOutOfOrder: true,
    };
  }

  return { valid: true };
}

/**
 * Deduplicate incoming messages by external ID
 * Checks the ConversationMessage table for existing messages with the same external ID
 */
export async function deduplicateMessage(
  channel: string,
  externalId: string
): Promise<boolean> {
  try {
    // Check metadata field which stores externalId as JSON
    const existing = await db.conversationMessage.findFirst({
      where: {
        channel,
        metadata: { contains: externalId },
      },
    });

    return !!existing;
  } catch (error) {
    console.error('Dedup check failed:', error);
    // On error, allow the message through (fail open)
    return false;
  }
}

/**
 * Validate message format per channel
 */
export function validateMessageFormat(message: IncomingMessage): ValidationResult {
  // Basic required fields check
  if (!message.externalId) {
    return { valid: false, error: 'Missing external ID' };
  }

  if (!message.senderId) {
    return { valid: false, error: 'Missing sender ID' };
  }

  if (!message.content && !message.metadata) {
    return { valid: false, error: 'Message must have content or metadata' };
  }

  if (!message.userId) {
    return { valid: false, error: 'Missing user ID' };
  }

  // Channel-specific validation
  switch (message.channel) {
    case 'telegram':
      return validateTelegramFormat(message);
    case 'whatsapp':
      return validateWhatsappFormat(message);
    default:
      return { valid: false, error: `Unsupported channel: ${message.channel}` };
  }
}

/**
 * Validate Telegram message format
 */
function validateTelegramFormat(message: IncomingMessage): ValidationResult {
  // Telegram chat IDs are numeric strings
  if (!/^-?\d+$/.test(message.senderId) && !message.senderId.startsWith('@')) {
    return {
      valid: false,
      error: 'Invalid Telegram sender ID format — expected numeric chat ID or @username',
    };
  }

  // Telegram message IDs are numeric
  if (!/^\d+$/.test(message.externalId)) {
    return {
      valid: false,
      error: 'Invalid Telegram message ID format — expected numeric ID',
    };
  }

  // Telegram messages can be up to 4096 characters
  if (message.content && message.content.length > 4096) {
    return {
      valid: false,
      error: 'Telegram message exceeds 4096 character limit',
    };
  }

  return { valid: true };
}

/**
 * Validate WhatsApp message format
 */
function validateWhatsappFormat(message: IncomingMessage): ValidationResult {
  // WhatsApp phone numbers should start with + or be numeric
  if (!/^[\d+\-() ]+$/.test(message.senderId)) {
    return {
      valid: false,
      error: 'Invalid WhatsApp sender ID format — expected phone number',
    };
  }

  // WhatsApp message IDs start with "wamid." 
  if (!message.externalId.startsWith('wamid.') && !/^[a-zA-Z0-9=+/]+$/.test(message.externalId)) {
    // Be lenient — different providers may format IDs differently
  }

  // WhatsApp messages can be up to 65536 characters
  if (message.content && message.content.length > 65536) {
    return {
      valid: false,
      error: 'WhatsApp message exceeds 65536 character limit',
    };
  }

  return { valid: true };
}

/**
 * Check incoming message rate limit per user per channel
 */
export function checkIncomingRateLimit(
  userId: string,
  channel: string
): { rateLimited: boolean; remaining: number; resetIn: number } {
  const key = `${userId}:${channel}`;
  const now = Date.now();

  let entry = rateLimitMap.get(key);

  if (!entry || (now - entry.windowStart) > RATE_LIMIT_WINDOW_MS) {
    // Reset window
    entry = { count: 0, windowStart: now };
    rateLimitMap.set(key, entry);
  }

  entry.count++;

  const isRateLimited = entry.count > RATE_LIMIT_MAX_MESSAGES;
  const remaining = Math.max(0, RATE_LIMIT_MAX_MESSAGES - entry.count);
  const resetIn = Math.max(0, RATE_LIMIT_WINDOW_MS - (now - entry.windowStart));

  if (isRateLimited) {
    // Update sync status
    updateSyncStatusOnRateLimit(channel);
  }

  return {
    rateLimited: isRateLimited,
    remaining,
    resetIn,
  };
}

/**
 * Handle out-of-order message delivery
 * Compares message timestamp with the latest message in the conversation
 */
export async function handleOutOfOrderMessage(
  message: IncomingMessage
): Promise<{ isOutOfOrder: boolean; latestMessageAt: Date | null }> {
  try {
    // Find the latest message for this lead on this channel
    const latestMessage = await db.conversationMessage.findFirst({
      where: {
        channel: message.channel,
        createdAt: { lt: message.timestamp },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestMessage) {
      return { isOutOfOrder: false, latestMessageAt: null };
    }

    // Check if this message is significantly older than the latest
    const timeDiff = latestMessage.createdAt.getTime() - message.timestamp.getTime();

    if (timeDiff > OUT_OF_ORDER_THRESHOLD_MS) {
      // Message arrived more than 5 minutes after a newer message
      updateSyncStatusOnOutOfOrder(message.channel);
      return { isOutOfOrder: true, latestMessageAt: latestMessage.createdAt };
    }

    return { isOutOfOrder: false, latestMessageAt: latestMessage.createdAt };
  } catch (error) {
    console.error('Out-of-order check failed:', error);
    return { isOutOfOrder: false, latestMessageAt: null };
  }
}

/**
 * Get sync status for a channel
 */
export function getSyncStatus(channel: string): SyncStatus {
  const status = syncStatusMap.get(channel);
  if (!status) {
    return {
      channel,
      lastSyncAt: null,
      messagesProcessed: 0,
      duplicatesRejected: 0,
      outOfOrderHandled: 0,
      rateLimitsHit: 0,
    };
  }
  return status;
}

/**
 * Record a successfully processed message in sync status
 */
export function recordSyncSuccess(channel: string): void {
  const status = syncStatusMap.get(channel) || {
    channel,
    lastSyncAt: null,
    messagesProcessed: 0,
    duplicatesRejected: 0,
    outOfOrderHandled: 0,
    rateLimitsHit: 0,
  };

  status.lastSyncAt = new Date();
  status.messagesProcessed++;
  syncStatusMap.set(channel, status);
}

/**
 * Record a rejected duplicate in sync status
 */
export function recordSyncDuplicate(channel: string): void {
  const status = syncStatusMap.get(channel) || {
    channel,
    lastSyncAt: null,
    messagesProcessed: 0,
    duplicatesRejected: 0,
    outOfOrderHandled: 0,
    rateLimitsHit: 0,
  };

  status.duplicatesRejected++;
  syncStatusMap.set(channel, status);
}

// ─── Internal helpers ─────────────────────────────────────────────

function updateSyncStatusOnRateLimit(channel: string): void {
  const status = syncStatusMap.get(channel) || {
    channel,
    lastSyncAt: null,
    messagesProcessed: 0,
    duplicatesRejected: 0,
    outOfOrderHandled: 0,
    rateLimitsHit: 0,
  };

  status.rateLimitsHit++;
  syncStatusMap.set(channel, status);
}

function updateSyncStatusOnOutOfOrder(channel: string): void {
  const status = syncStatusMap.get(channel) || {
    channel,
    lastSyncAt: null,
    messagesProcessed: 0,
    duplicatesRejected: 0,
    outOfOrderHandled: 0,
    rateLimitsHit: 0,
  };

  status.outOfOrderHandled++;
  syncStatusMap.set(channel, status);
}

/**
 * Get all sync statuses
 */
export function getAllSyncStatuses(): SyncStatus[] {
  return Array.from(syncStatusMap.values());
}

/**
 * Reset rate limit for a user/channel (for testing or admin use)
 */
export function resetRateLimit(userId: string, channel: string): void {
  const key = `${userId}:${channel}`;
  rateLimitMap.delete(key);
}
