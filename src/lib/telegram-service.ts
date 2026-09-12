// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Telegram Bot Service
// Phase 10: Telegram Bot Integration
// Handles ALL Telegram Bot API integration: connect, message,
// webhook, health, reconnect, link codes, delivery tracking
// ═══════════════════════════════════════════════════════════════════

import * as crypto from 'crypto';
import { db } from '@/lib/db';

// ===== ENCRYPTION (AES-256-GCM) =====

const ENCRYPTION_KEY = process.env.GMAIL_ENCRYPTION_KEY || 'default-dev-key-change-in-production-32b!';
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns format: iv:authTag:encrypted (all hex-encoded)
 */
function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * Expects format: iv:authTag:encrypted (all hex-encoded)
 */
function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format');
  }
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ===== TYPES =====

/** Telegram Bot API getMe response */
interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
}

/** Telegram Bot API sendMessage response */
interface TelegramSendMessageResponse {
  ok: boolean;
  result?: {
    message_id: number;
    from?: { id: number; is_bot: boolean; first_name: string; username?: string };
    chat: { id: number; type: string; title?: string; username?: string; first_name?: string; last_name?: string };
    date: number;
    text?: string;
  };
  description?: string;
  error_code?: number;
}

/** Telegram Bot API getWebhookInfo response */
interface TelegramWebhookInfo {
  ok: boolean;
  result?: {
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
    max_connections?: number;
    ip_address?: string;
  };
  description?: string;
}

/** Telegram Bot API setWebhook response */
interface TelegramSetWebhookResponse {
  ok: boolean;
  description?: string;
  result?: boolean;
}

/** Telegram Bot API Update payload */
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  video?: TelegramVideo;
  audio?: TelegramAudio;
  reply_to_message?: TelegramMessage;
  contact?: unknown;
  location?: unknown;
  sticker?: unknown;
  voice?: unknown;
  animation?: unknown;
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramChat {
  id: number;
  type: string; // private, group, supergroup, channel
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramVideo {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  duration: number;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  performer?: string;
  title?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  chat_instance?: string;
  data?: string;
}

/** Options for sendMessage */
export interface SendMessageOptions {
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  disableNotification?: boolean;
  replyToMessageId?: number;
  leadId?: string;
  conversationId?: string;
  templateId?: string;
  templateName?: string;
}

/** Media types for sendMedia */
export type TelegramMediaType = 'photo' | 'document' | 'video' | 'audio';

/** Bot status return type */
export interface BotStatus {
  isConnected: boolean;
  isPaused: boolean;
  healthStatus: string;
  botUsername: string | null;
  botId: string | null;
  chatId: string | null;
  username: string | null;
  mode: string;
  webhookUrl: string | null;
  webhookVerified: boolean;
  lastHealthCheckAt: Date | null;
  lastWebhookAt: Date | null;
  reconnectAttempts: number;
  errorMessage: string | null;
  webhookInfo?: {
    url: string;
    pendingUpdateCount: number;
    lastErrorMessage?: string;
    ipAddress?: string;
  };
}

/** Connect result type */
export interface ConnectBotResult {
  success: boolean;
  botInfo: {
    id: string;
    username: string;
    firstName: string;
  };
  configId: string;
}

// ===== CUSTOM ERROR =====

export class TelegramServiceError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string = 'TELEGRAM_ERROR', statusCode: number = 400) {
    super(message);
    this.name = 'TelegramServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ===== RATE LIMITER (30 messages/second per bot) =====

const rateLimiterBuckets: Map<string, number[]> = new Map();
const RATE_LIMIT_PER_SECOND = 30;
const RATE_LIMIT_WINDOW_MS = 1000;

function checkRateLimit(botId: string): void {
  const now = Date.now();
  const timestamps = rateLimiterBuckets.get(botId) || [];
  const recentTimestamps = timestamps.filter((t: number) => now - t < RATE_LIMIT_WINDOW_MS);

  if (recentTimestamps.length >= RATE_LIMIT_PER_SECOND) {
    throw new TelegramServiceError(
      'Telegram rate limit exceeded (30 msgs/sec). Please retry shortly.',
      'RATE_LIMITED',
      429
    );
  }

  recentTimestamps.push(now);
  rateLimiterBuckets.set(botId, recentTimestamps);
}

// Clean up stale rate limit entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(rateLimiterBuckets.entries());
  for (const [key, timestamps] of entries) {
    const recent = timestamps.filter((t: number) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) {
      rateLimiterBuckets.delete(key);
    } else {
      rateLimiterBuckets.set(key, recent);
    }
  }
}, 60_000).unref();

// ===== MESSAGE DEDUPLICATION CACHE =====

const dedupeCache: Set<string> = new Set();
const MAX_DEDUPE_CACHE_SIZE = 10_000;

function addToDedupeCache(messageId: string): void {
  if (dedupeCache.size >= MAX_DEDUPE_CACHE_SIZE) {
    // Evict oldest entries by clearing ~20% of the cache
    const entries = Array.from(dedupeCache);
    const toKeep = entries.slice(Math.floor(entries.length * 0.2));
    dedupeCache.clear();
    toKeep.forEach((id: string) => dedupeCache.add(id));
  }
  dedupeCache.add(messageId);
}

function isDuplicate(messageId: string): boolean {
  return dedupeCache.has(messageId);
}

// ===== HELPER: Call Telegram Bot API =====

const TELEGRAM_API_BASE = 'https://api.telegram.org';

async function callTelegramApi<T>(
  botToken: string,
  method: string,
  body?: Record<string, unknown>
): Promise<T> {
  const url = `${TELEGRAM_API_BASE}/bot${botToken}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json() as T & { ok?: boolean; description?: string; error_code?: number };

  if (!response.ok || data.ok === false) {
    const errorMsg = data.description || `Telegram API error: ${response.status}`;
    const errorCode = data.error_code || response.status;
    throw new TelegramServiceError(
      errorMsg,
      'TELEGRAM_API_ERROR',
      typeof errorCode === 'number' ? errorCode : 500
    );
  }

  return data;
}

// ===== HELPER: Get decrypted bot token from DB =====

interface DecryptedTokenResult {
  token: string;
  config: {
    id: string;
    botId: string | null;
    botUsername: string | null;
    isConnected: boolean;
    isPaused: boolean;
    mode: string;
    webhookUrl: string | null;
    webhookSecret: string | null;
    chatId: string | null;
    username: string | null;
    linkCode: string | null;
    linkCodeExpiresAt: Date | null;
    reconnectAttempts: number;
    healthStatus: string;
  };
}

async function getDecryptedToken(userId: string): Promise<DecryptedTokenResult> {
  const config = await db.telegramConfig.findUnique({
    where: { userId },
  });

  if (!config) {
    throw new TelegramServiceError(
      'Telegram bot not configured for this user',
      'NOT_CONFIGURED',
      404
    );
  }

  if (!config.botToken) {
    throw new TelegramServiceError(
      'Bot token not found. Please reconnect your bot.',
      'NO_TOKEN',
      400
    );
  }

  let token: string;
  try {
    token = decrypt(config.botToken);
  } catch {
    throw new TelegramServiceError(
      'Failed to decrypt bot token. Please reconnect your bot.',
      'DECRYPTION_FAILED',
      500
    );
  }

  return {
    token,
    config: {
      id: config.id,
      botId: config.botId,
      botUsername: config.username,
      isConnected: config.isConnected,
      isPaused: config.isPaused,
      mode: config.mode ?? 'polling',
      webhookUrl: config.webhookUrl,
      webhookSecret: config.webhookSecret,
      chatId: config.chatId,
      username: config.username,
      linkCode: config.linkCode,
      linkCodeExpiresAt: config.linkCodeExpiresAt,
      reconnectAttempts: config.reconnectAttempts,
      healthStatus: config.healthStatus ?? 'unknown',
    },
  };
}

// ===== HELPER: Log audit event (never blocks) =====

async function logAudit(
  userId: string,
  action: string,
  details?: Record<string, unknown>,
  resourceId?: string
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId,
        action,
        details: details ? JSON.stringify(details) : null,
        resource: 'telegram',
        resourceId: resourceId || null,
      },
    });
  } catch (error) {
    console.error('[TelegramService] Failed to log audit event:', error);
  }
}

// ===== HELPER: Create MessageDelivery record (non-blocking) =====

interface CreateDeliveryParams {
  userId: string;
  conversationId?: string;
  leadId?: string;
  providerMessageId?: string;
  direction: string;
  status: string;
  content?: string;
  contentMetadata?: string;
  recipientId?: string;
  recipientName?: string;
  senderId?: string;
  templateId?: string;
  templateName?: string;
  errorMessage?: string;
}

async function createMessageDeliveryRecord(params: CreateDeliveryParams): Promise<string | null> {
  try {
    const delivery = await db.messageDelivery.create({
      data: {
        userId: params.userId,
        conversationId: params.conversationId ?? null,
        leadId: params.leadId ?? null,
        channel: 'telegram',
        provider: 'telegram_bot',
        providerMessageId: params.providerMessageId ?? null,
        direction: params.direction,
        status: params.status,
        content: params.content ?? null,
        contentMetadata: params.contentMetadata ?? null,
        recipientId: params.recipientId ?? null,
        recipientName: params.recipientName ?? null,
        senderId: params.senderId ?? null,
        templateId: params.templateId ?? null,
        templateName: params.templateName ?? null,
        errorMessage: params.errorMessage ?? null,
        sentAt: params.status === 'sent' ? new Date() : null,
      },
    });
    return delivery.id;
  } catch (error) {
    console.error('[TelegramService] Failed to create MessageDelivery record:', error);
    return null;
  }
}

// ===== 1. connectBot =====

/**
 * Validate a bot token via Telegram getMe API, encrypt and store it,
 * create/update TelegramConfig, set up webhook, and return bot info.
 */
export async function connectBot(
  userId: string,
  botToken: string
): Promise<ConnectBotResult> {
  // 1. Validate the token with Telegram
  const botInfo = await validateToken(botToken);

  // 2. Encrypt the token
  const encryptedToken = encrypt(botToken);

  // 3. Upsert the TelegramConfig
  const config = await db.telegramConfig.upsert({
    where: { userId },
    update: {
      botToken: encryptedToken,
      username: botInfo.username,
      botId: String(botInfo.id),
      isConnected: true,
      isPaused: false,
      healthStatus: 'healthy',
      lastHealthCheckAt: new Date(),
      reconnectAttempts: 0,
    },
    create: {
      userId,
      botToken: encryptedToken,
      username: botInfo.username,
      botId: String(botInfo.id),
      isConnected: true,
      isPaused: false,
      mode: 'webhook',
      healthStatus: 'healthy',
      lastHealthCheckAt: new Date(),
      reconnectAttempts: 0,
    },
  });

  // 4. Set up webhook if configured
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const webhookSecret = crypto.randomBytes(32).toString('hex');
      await setWebhook(userId, `${webhookUrl}/api/telegram/webhook`, webhookSecret);
    } catch (error) {
      // Log but don't fail — webhook can be set later
      console.warn('[TelegramService] Failed to set webhook during connect:', error);
    }
  }

  // 5. Audit log
  await logAudit(userId, 'telegram_bot_connected', {
    botUsername: botInfo.username,
    botId: String(botInfo.id),
  }, config.id);

  console.log(`[TelegramService] Bot connected: @${botInfo.username} for user: ${userId}`);

  return {
    success: true,
    botInfo: {
      id: String(botInfo.id),
      username: botInfo.username,
      firstName: botInfo.first_name,
    },
    configId: config.id,
  };
}

// ===== 2. disconnectBot =====

/**
 * Remove webhook from Telegram and mark config as disconnected.
 */
export async function disconnectBot(userId: string): Promise<void> {
  const { token, config } = await getDecryptedToken(userId);

  // Remove webhook from Telegram
  try {
    await callTelegramApi(token, 'deleteWebhook', { drop_pending_updates: true });
  } catch (error) {
    // Log but don't fail — the bot token may already be revoked
    console.warn('[TelegramService] Failed to remove webhook during disconnect:', error);
  }

  // Update config
  await db.telegramConfig.update({
    where: { userId },
    data: {
      isConnected: false,
      isPaused: false,
      healthStatus: 'down',
      webhookUrl: null,
      webhookSecret: null,
      webhookVerified: false,
      mode: 'webhook',
      reconnectAttempts: 0,
    },
  });

  // Audit log
  await logAudit(userId, 'telegram_bot_disconnected', {
    botUsername: config.username,
  }, config.id);

  console.log(`[TelegramService] Bot disconnected for user: ${userId}`);
}

// ===== 3. setWebhook =====

/**
 * Set a webhook on the Telegram Bot API and store config.
 */
export async function setWebhook(
  userId: string,
  webhookUrl: string,
  secret: string
): Promise<void> {
  const { token } = await getDecryptedToken(userId);

  const response = await callTelegramApi<TelegramSetWebhookResponse>(token, 'setWebhook', {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ['message', 'edited_message', 'callback_query'],
    drop_pending_updates: false,
  });

  if (!response.ok) {
    throw new TelegramServiceError(
      `Failed to set webhook: ${response.description || 'Unknown error'}`,
      'WEBHOOK_SET_FAILED',
      500
    );
  }

  // Update config
  await db.telegramConfig.update({
    where: { userId },
    data: {
      mode: 'webhook',
      webhookUrl,
      webhookSecret: encrypt(secret),
      webhookVerified: true,
      lastWebhookAt: new Date(),
    },
  });

  // Audit log
  await logAudit(userId, 'telegram_webhook_set', { webhookUrl });

  console.log(`[TelegramService] Webhook set for user: ${userId} → ${webhookUrl}`);
}

// ===== 4. removeWebhook =====

/**
 * Remove the webhook from Telegram Bot API.
 */
export async function removeWebhook(userId: string): Promise<void> {
  const { token } = await getDecryptedToken(userId);

  await callTelegramApi(token, 'deleteWebhook', { drop_pending_updates: true });

  // Update config
  await db.telegramConfig.update({
    where: { userId },
    data: {
      webhookUrl: null,
      webhookSecret: null,
      webhookVerified: false,
      mode: 'polling',
    },
  });

  // Audit log
  await logAudit(userId, 'telegram_webhook_removed');

  console.log(`[TelegramService] Webhook removed for user: ${userId}`);
}

// ===== 5. sendMessage =====

/**
 * Send a text message via Telegram Bot API.
 * Creates a MessageDelivery record and is queue-based (non-blocking).
 */
export async function sendMessage(
  userId: string,
  chatId: string,
  content: string,
  options?: SendMessageOptions
): Promise<{ deliveryId: string | null; telegramMessageId: number | null }> {
  const { token, config } = await getDecryptedToken(userId);

  if (!config.isConnected) {
    throw new TelegramServiceError(
      'Bot is not connected. Please connect your bot first.',
      'NOT_CONNECTED',
      400
    );
  }

  if (config.isPaused) {
    throw new TelegramServiceError(
      'Bot is paused. Resume it before sending messages.',
      'BOT_PAUSED',
      400
    );
  }

  // Rate limit check
  const botId = config.botId || 'unknown';
  checkRateLimit(botId);

  // Create initial delivery record (pending)
  const contentMetadata = options ? JSON.stringify({
    parseMode: options.parseMode,
    replyToMessageId: options.replyToMessageId,
  }) : undefined;

  const deliveryId = await createMessageDeliveryRecord({
    userId,
    conversationId: options?.conversationId,
    leadId: options?.leadId,
    direction: 'outbound',
    status: 'pending',
    content,
    contentMetadata,
    recipientId: chatId,
    senderId: botId,
    templateId: options?.templateId,
    templateName: options?.templateName,
  });

  // Capture for closure
  const finalDeliveryId = deliveryId;

  // Fire-and-forget the actual send (queue-based, non-blocking)
  const sendPromise = (async () => {
    try {
      const body: Record<string, unknown> = {
        chat_id: chatId,
        text: content,
      };

      if (options?.parseMode) {
        body.parse_mode = options.parseMode;
      }
      if (options?.disableNotification) {
        body.disable_notification = true;
      }
      if (options?.replyToMessageId) {
        body.reply_to_message_id = options.replyToMessageId;
      }

      const response = await callTelegramApi<TelegramSendMessageResponse>(token, 'sendMessage', body);

      if (response.result) {
        const telegramMessageId = response.result.message_id;

        // Update delivery record to sent
        if (finalDeliveryId) {
          await db.messageDelivery.update({
            where: { id: finalDeliveryId },
            data: {
              status: 'sent',
              providerMessageId: String(telegramMessageId),
              sentAt: new Date(),
            },
          }).catch(() => {});
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      // Update delivery record to failed
      if (finalDeliveryId) {
        await db.messageDelivery.update({
          where: { id: finalDeliveryId },
          data: {
            status: 'failed',
            errorMessage: errorMsg,
            failedAt: new Date(),
          },
        }).catch(() => {});
      }

      console.error('[TelegramService] Failed to send message:', errorMsg);
    }
  })();

  // Don't await the send — return immediately (queue-based)
  sendPromise.catch(() => {});

  return { deliveryId: finalDeliveryId, telegramMessageId: null };
}

// ===== 6. sendMarkdown =====

/**
 * Send a message with MarkdownV2 parse mode.
 */
export async function sendMarkdown(
  userId: string,
  chatId: string,
  content: string
): Promise<{ deliveryId: string | null; telegramMessageId: number | null }> {
  return sendMessage(userId, chatId, content, {
    parseMode: 'MarkdownV2',
  });
}

// ===== 7. sendMedia =====

/**
 * Foundation for sending media (photo, document, video, audio).
 * Uses the appropriate Telegram Bot API method per media type.
 */
export async function sendMedia(
  userId: string,
  chatId: string,
  mediaType: TelegramMediaType,
  mediaUrl: string,
  caption?: string
): Promise<{ deliveryId: string | null; telegramMessageId: number | null }> {
  const { token, config } = await getDecryptedToken(userId);

  if (!config.isConnected) {
    throw new TelegramServiceError(
      'Bot is not connected. Please connect your bot first.',
      'NOT_CONNECTED',
      400
    );
  }

  if (config.isPaused) {
    throw new TelegramServiceError(
      'Bot is paused. Resume it before sending media.',
      'BOT_PAUSED',
      400
    );
  }

  // Rate limit check
  const botId = config.botId || 'unknown';
  checkRateLimit(botId);

  // Map media type to Telegram API method
  const methodMap: Record<TelegramMediaType, string> = {
    photo: 'sendPhoto',
    document: 'sendDocument',
    video: 'sendVideo',
    audio: 'sendAudio',
  };

  const method = methodMap[mediaType];

  // Create delivery record
  const contentMetadata = JSON.stringify({
    mediaType,
    mediaUrl,
    caption: caption ?? null,
  });

  const deliveryId = await createMessageDeliveryRecord({
    userId,
    direction: 'outbound',
    status: 'pending',
    content: caption ?? `[${mediaType}]`,
    contentMetadata,
    recipientId: chatId,
    senderId: botId,
  });

  // Capture for closure
  const finalDeliveryId = deliveryId;

  // Send asynchronously (non-blocking)
  const sendPromise = (async () => {
    try {
      const body: Record<string, unknown> = {
        chat_id: chatId,
      };

      // Set the appropriate field for the media type
      switch (mediaType) {
        case 'photo':
          body.photo = mediaUrl;
          break;
        case 'document':
          body.document = mediaUrl;
          break;
        case 'video':
          body.video = mediaUrl;
          break;
        case 'audio':
          body.audio = mediaUrl;
          break;
      }

      if (caption) {
        body.caption = caption;
        body.parse_mode = 'MarkdownV2';
      }

      const response = await callTelegramApi<TelegramSendMessageResponse>(token, method, body);

      if (response.result) {
        const telegramMessageId = response.result.message_id;

        if (finalDeliveryId) {
          await db.messageDelivery.update({
            where: { id: finalDeliveryId },
            data: {
              status: 'sent',
              providerMessageId: String(telegramMessageId),
              sentAt: new Date(),
            },
          }).catch(() => {});
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      if (finalDeliveryId) {
        await db.messageDelivery.update({
          where: { id: finalDeliveryId },
          data: {
            status: 'failed',
            errorMessage: errorMsg,
            failedAt: new Date(),
          },
        }).catch(() => {});
      }

      console.error('[TelegramService] Failed to send media:', errorMsg);
    }
  })();

  sendPromise.catch(() => {});

  return { deliveryId: finalDeliveryId, telegramMessageId: null };
}

// ===== 8. replyToMessage =====

/**
 * Reply to a specific Telegram message.
 */
export async function replyToMessage(
  userId: string,
  chatId: string,
  content: string,
  replyToMessageId: number
): Promise<{ deliveryId: string | null; telegramMessageId: number | null }> {
  return sendMessage(userId, chatId, content, {
    replyToMessageId,
  });
}

// ===== 9. checkHealth =====

/**
 * Verify bot token validity, check webhook info, and update healthStatus.
 */
export async function checkHealth(userId: string): Promise<{
  healthStatus: string;
  tokenValid: boolean;
  webhookInfo: TelegramWebhookInfo['result'] | null;
}> {
  const config = await db.telegramConfig.findUnique({
    where: { userId },
  });

  if (!config) {
    throw new TelegramServiceError(
      'Telegram bot not configured for this user',
      'NOT_CONFIGURED',
      404
    );
  }

  let tokenValid = false;
  let webhookInfo: TelegramWebhookInfo['result'] | null = null;
  let healthStatus: string = 'unknown';

  try {
    // Decrypt token
    if (!config.botToken) {
      throw new Error('No bot token');
    }
    const token = decrypt(config.botToken);

    // Check token validity with getMe
    const botInfo = await callTelegramApi<{ ok: boolean; result: TelegramBotInfo }>(token, 'getMe');
    tokenValid = botInfo.ok === true;

    // Get webhook info
    const webhookResponse = await callTelegramApi<TelegramWebhookInfo>(token, 'getWebhookInfo');
    webhookInfo = webhookResponse.result || null;

    // Determine health status
    if (tokenValid) {
      if (webhookInfo) {
        if (webhookInfo.url && webhookInfo.url.length > 0) {
          healthStatus = 'healthy';
        } else if (config.mode === 'polling') {
          healthStatus = 'healthy';
        } else {
          healthStatus = 'degraded'; // webhook mode but no URL set
        }

        // Check for pending errors
        if (webhookInfo.last_error_message) {
          healthStatus = 'degraded';
        }
        if (webhookInfo.pending_update_count > 100) {
          healthStatus = 'degraded';
        }
      } else {
        healthStatus = 'degraded';
      }
    } else {
      healthStatus = 'down';
    }
  } catch (error) {
    tokenValid = false;
    healthStatus = 'down';
    console.error('[TelegramService] Health check failed:', error);
  }

  // Update config
  await db.telegramConfig.update({
    where: { userId },
    data: {
      healthStatus,
      lastHealthCheckAt: new Date(),
      isConnected: tokenValid && healthStatus !== 'down',
    },
  });

  // Audit log
  await logAudit(userId, 'telegram_health_check', {
    healthStatus,
    tokenValid,
    webhookUrl: webhookInfo?.url,
    pendingUpdates: webhookInfo?.pending_update_count,
  });

  return { healthStatus, tokenValid, webhookInfo };
}

// ===== 10. handleReconnect =====

/**
 * Reconnect logic with exponential backoff.
 * Max 5 attempts, then mark as down.
 */
export async function handleReconnect(userId: string): Promise<{
  success: boolean;
  attempts: number;
  nextRetryAt: Date | null;
}> {
  const config = await db.telegramConfig.findUnique({
    where: { userId },
  });

  if (!config) {
    throw new TelegramServiceError(
      'Telegram bot not configured for this user',
      'NOT_CONFIGURED',
      404
    );
  }

  const MAX_RECONNECT_ATTEMPTS = 5;
  const currentAttempts = (config.reconnectAttempts || 0) + 1;

  // Check if max attempts exceeded
  if (currentAttempts > MAX_RECONNECT_ATTEMPTS) {
    await db.telegramConfig.update({
      where: { userId },
      data: {
        healthStatus: 'down',
        isConnected: false,
      },
    });

    await logAudit(userId, 'telegram_reconnect_failed', {
      attempts: currentAttempts,
      reason: 'max_attempts_exceeded',
    });

    return { success: false, attempts: currentAttempts, nextRetryAt: null };
  }

  // Exponential backoff: 2^attempt * 5 seconds (5s, 10s, 20s, 40s, 80s)
  const backoffMs = Math.pow(2, currentAttempts) * 5 * 1000;
  const nextRetryAt = new Date(Date.now() + backoffMs);

  try {
    // Try to validate the token
    if (!config.botToken) {
      throw new Error('No bot token');
    }
    const token = decrypt(config.botToken);
    const botInfo = await callTelegramApi<{ ok: boolean; result: TelegramBotInfo }>(token, 'getMe');

    if (botInfo.ok) {
      // Reconnected successfully
      await db.telegramConfig.update({
        where: { userId },
        data: {
          isConnected: true,
          healthStatus: 'healthy',
          reconnectAttempts: 0,
        },
      });

      await logAudit(userId, 'telegram_reconnected', {
        attempts: currentAttempts,
      });

      console.log(`[TelegramService] Bot reconnected for user: ${userId} after ${currentAttempts} attempts`);

      return { success: true, attempts: currentAttempts, nextRetryAt: null };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';

    await db.telegramConfig.update({
      where: { userId },
      data: {
        reconnectAttempts: currentAttempts,
        healthStatus: 'degraded',
      },
    });

    await logAudit(userId, 'telegram_reconnect_attempt', {
      attempt: currentAttempts,
      error: errorMsg,
      nextRetryAt: nextRetryAt.toISOString(),
    });

    console.warn(`[TelegramService] Reconnect attempt ${currentAttempts} failed for user: ${userId}`);
  }

  return { success: false, attempts: currentAttempts, nextRetryAt };
}

// ===== 11. validateToken =====

/**
 * Validate a bot token by calling the Telegram getMe API.
 */
export async function validateToken(botToken: string): Promise<TelegramBotInfo> {
  try {
    const response = await callTelegramApi<{ ok: boolean; result: TelegramBotInfo }>(
      botToken,
      'getMe'
    );

    if (!response.ok || !response.result) {
      throw new TelegramServiceError(
        'Invalid bot token. Please check your token and try again.',
        'INVALID_TOKEN',
        401
      );
    }

    const botInfo = response.result;

    if (!botInfo.is_bot) {
      throw new TelegramServiceError(
        'The provided token is not a bot token. Please use a bot token from @BotFather.',
        'NOT_BOT_TOKEN',
        400
      );
    }

    return botInfo;
  } catch (error) {
    if (error instanceof TelegramServiceError) throw error;
    throw new TelegramServiceError(
      `Failed to validate bot token: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'VALIDATION_FAILED',
      500
    );
  }
}

// ===== 12. getBotStatus =====

/**
 * Get the connection status, health, and webhook info for a user's bot.
 */
export async function getBotStatus(userId: string): Promise<BotStatus> {
  const config = await db.telegramConfig.findUnique({
    where: { userId },
  });

  if (!config) {
    return {
      isConnected: false,
      isPaused: false,
      healthStatus: 'unknown',
      botUsername: null,
      botId: null,
      chatId: null,
      username: null,
      mode: 'webhook',
      webhookUrl: null,
      webhookVerified: false,
      lastHealthCheckAt: null,
      lastWebhookAt: null,
      reconnectAttempts: 0,
      errorMessage: null,
    };
  }

  // If connected, also fetch live webhook info
  let webhookInfo: BotStatus['webhookInfo'] | undefined;

  if (config.isConnected && config.botToken) {
    try {
      const token = decrypt(config.botToken);
      const webhookResponse = await callTelegramApi<TelegramWebhookInfo>(token, 'getWebhookInfo');
      if (webhookResponse.result) {
        webhookInfo = {
          url: webhookResponse.result.url,
          pendingUpdateCount: webhookResponse.result.pending_update_count,
          lastErrorMessage: webhookResponse.result.last_error_message,
          ipAddress: webhookResponse.result.ip_address,
        };
      }
    } catch {
      // Don't fail the status check if webhook info can't be fetched
    }
  }

  return {
    isConnected: config.isConnected,
    isPaused: config.isPaused,
    healthStatus: config.healthStatus ?? 'unknown',
    botUsername: config.username,
    botId: config.botId,
    chatId: config.chatId,
    username: config.username,
    mode: config.mode ?? 'polling',
    webhookUrl: config.webhookUrl,
    webhookVerified: config.webhookVerified,
    lastHealthCheckAt: config.lastHealthCheckAt,
    lastWebhookAt: config.lastWebhookAt,
    reconnectAttempts: config.reconnectAttempts,
    errorMessage: null,
    webhookInfo,
  };
}

// ===== 13. processWebhookUpdate =====

/**
 * Process an incoming webhook update from Telegram.
 * Creates ConversationMessage and deduplicates messages.
 */
export async function processWebhookUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message || update.edited_message || update.channel_post || update.edited_channel_post;

  if (!message) {
    // Could be a callback_query or other update type we don't process yet
    return;
  }

  const chatId = String(message.chat.id);
  const messageId = String(message.message_id);
  const updateId = String(update.update_id);

  // Dedupe check using both update_id and message_id
  const dedupeKey = `${chatId}:${messageId}:${updateId}`;
  if (isDuplicate(dedupeKey)) {
    console.log(`[TelegramService] Duplicate message skipped: ${dedupeKey}`);
    return;
  }
  addToDedupeCache(dedupeKey);

  // Check MessageDelivery for dedup by providerMessageId
  const existingDelivery = await db.messageDelivery.findFirst({
    where: {
      channel: 'telegram',
      providerMessageId: messageId,
    },
  });

  if (existingDelivery) {
    console.log(`[TelegramService] Duplicate message (DB) skipped: ${messageId}`);
    return;
  }

  // Find the TelegramConfig that owns this chat
  const config = await db.telegramConfig.findFirst({
    where: {
      chatId,
      isConnected: true,
    },
  });

  if (!config) {
    // No config found for this chatId — log and skip
    console.log(`[TelegramService] No config found for chatId: ${chatId}`);
    return;
  }

  const userId = config.userId;
  const content = message.text || message.caption || '';
  const senderUsername = message.from?.username || null;
  const senderFirstName = message.from?.first_name || 'Unknown';
  const chatType = message.chat.type;
  const chatTitle = message.chat.title || message.chat.username || senderFirstName;

  // Build metadata
  const metadata: Record<string, unknown> = {
    chatType,
    chatTitle,
    messageId,
    updateId,
    isEdited: !!(update.edited_message || update.edited_channel_post),
  };

  if (message.from) {
    metadata.senderId = String(message.from.id);
    metadata.senderFirstName = message.from.first_name;
    metadata.senderLastName = message.from.last_name || null;
    metadata.senderUsername = message.from.username || null;
    metadata.senderIsBot = message.from.is_bot;
    metadata.senderLanguageCode = message.from.language_code || null;
  }

  if (message.reply_to_message) {
    metadata.replyToMessageId = String(message.reply_to_message.message_id);
  }

  if (message.photo && message.photo.length > 0) {
    metadata.mediaType = 'photo';
    metadata.photoSizes = message.photo.length;
    metadata.mediaFileId = message.photo[message.photo.length - 1].file_id;
  }

  if (message.document) {
    metadata.mediaType = 'document';
    metadata.fileName = message.document.file_name;
    metadata.mimeType = message.document.mime_type;
    metadata.mediaFileId = message.document.file_id;
  }

  if (message.video) {
    metadata.mediaType = 'video';
    metadata.fileName = message.video.file_name;
    metadata.mimeType = message.video.mime_type;
    metadata.mediaFileId = message.video.file_id;
  }

  if (message.audio) {
    metadata.mediaType = 'audio';
    metadata.fileName = message.audio.file_name;
    metadata.mimeType = message.audio.mime_type;
    metadata.mediaFileId = message.audio.file_id;
  }

  // Find or create a Conversation for this chat
  let conversationId: string | null = null;

  try {
    // Try to find existing conversation for this telegram chat
    const existingConversation = await db.conversation.findFirst({
      where: {
        channel: 'telegram',
        status: 'active',
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    if (existingConversation) {
      conversationId = existingConversation.id;
    }
  } catch {
    // Conversation lookup is best-effort
  }

  // NOTE: Conversation now requires a leadId (schema constraint) and this webhook
  // has no lead context, so conversation creation is skipped — the inbound message
  // is still delivered without a conversation home (conversationId stays null).

  // Create ConversationMessage
  if (conversationId) {
    try {
      await db.conversationMessage.create({
        data: {
          conversationId,
          userId,
          senderType: message.from?.is_bot ? 'ai' : 'lead',
          content,
          channel: 'telegram',
          direction: 'inbound',
          metadata: JSON.stringify(metadata),
        },
      });
    } catch (error) {
      console.error('[TelegramService] Failed to create ConversationMessage:', error);
    }
  }

  // Create MessageDelivery record for the inbound message
  await createMessageDeliveryRecord({
    userId,
    conversationId: conversationId ?? undefined,
    providerMessageId: messageId,
    direction: 'inbound',
    status: 'delivered',
    content,
    contentMetadata: JSON.stringify(metadata),
    recipientId: chatId,
    recipientName: chatTitle,
    senderId: message.from ? String(message.from.id) : undefined,
  });

  // Update config last webhook timestamp
  await db.telegramConfig.update({
    where: { userId },
    data: {
      lastWebhookAt: new Date(),
    },
  }).catch(() => {});

  // Audit log
  await logAudit(userId, 'telegram_message_received', {
    chatId,
    chatType,
    messageId,
    senderUsername,
    hasMedia: !!(message.photo || message.document || message.video || message.audio),
  });

  console.log(`[TelegramService] Processed webhook update ${updateId} from chat ${chatId}`);
}

// ===== 14. generateLinkCode =====

/**
 * Generate a unique link code for connecting a Telegram chat to the user's bot config.
 * The user sends this code to the bot in Telegram to link their chat.
 */
export async function generateLinkCode(userId: string): Promise<{
  linkCode: string;
  expiresAt: Date;
}> {
  const config = await db.telegramConfig.findUnique({
    where: { userId },
  });

  if (!config) {
    throw new TelegramServiceError(
      'Telegram bot not configured for this user',
      'NOT_CONFIGURED',
      404
    );
  }

  // Generate a 6-digit link code
  const linkCode = String(crypto.randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Store in config
  await db.telegramConfig.update({
    where: { userId },
    data: {
      linkCode,
      linkCodeExpiresAt: expiresAt,
    },
  });

  // Audit log
  await logAudit(userId, 'telegram_link_code_generated', {
    expiresAt: expiresAt.toISOString(),
  });

  console.log(`[TelegramService] Link code generated for user: ${userId}`);

  return { linkCode, expiresAt };
}

// ===== 15. linkChat =====

/**
 * Link a Telegram chat to the user's config using the link code.
 */
export async function linkChat(
  userId: string,
  linkCode: string,
  chatId: string,
  username?: string
): Promise<{
  success: boolean;
  chatId: string;
}> {
  const config = await db.telegramConfig.findUnique({
    where: { userId },
  });

  if (!config) {
    throw new TelegramServiceError(
      'Telegram bot not configured for this user',
      'NOT_CONFIGURED',
      404
    );
  }

  // Validate link code
  if (config.linkCode !== linkCode) {
    throw new TelegramServiceError(
      'Invalid link code. Please try generating a new code.',
      'INVALID_LINK_CODE',
      400
    );
  }

  // Check expiration
  if (!config.linkCodeExpiresAt || config.linkCodeExpiresAt < new Date()) {
    throw new TelegramServiceError(
      'Link code has expired. Please generate a new one.',
      'LINK_CODE_EXPIRED',
      400
    );
  }

  // Link the chat
  await db.telegramConfig.update({
    where: { userId },
    data: {
      chatId,
      username: username ?? null,
      linkCode: null,
      linkCodeExpiresAt: null,
    },
  });

  // Audit log
  await logAudit(userId, 'telegram_chat_linked', {
    chatId,
    username: username ?? null,
  });

  console.log(`[TelegramService] Chat linked: ${chatId} for user: ${userId}`);

  return { success: true, chatId };
}

// ===== UTILITY: Get decrypted token (public for webhook verification) =====

/**
 * Get the decrypted bot token for a user.
 * Used internally for webhook verification and API calls.
 */
export async function getBotToken(userId: string): Promise<string | null> {
  try {
    const { token } = await getDecryptedToken(userId);
    return token;
  } catch {
    return null;
  }
}

// ===== UTILITY: Verify webhook secret =====

/**
 * Verify the secret_token from an incoming Telegram webhook request.
 * Telegram includes the secret_token in the X-Telegram-Bot-Api-Secret-Token header.
 */
export async function verifyWebhookSecret(userId: string, providedSecret: string): Promise<boolean> {
  const config = await db.telegramConfig.findUnique({
    where: { userId },
  });

  if (!config || !config.webhookSecret) {
    return false;
  }

  try {
    const storedSecret = decrypt(config.webhookSecret);
    // Constant-time comparison to prevent timing attacks
    const storedBuf = Buffer.from(storedSecret, 'utf8');
    const providedBuf = Buffer.from(providedSecret, 'utf8');
    if (storedBuf.length !== providedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(storedBuf, providedBuf);
  } catch {
    return false;
  }
}

// ===== UTILITY: Mark delivery as read =====

/**
 * Update a MessageDelivery record to 'read' status.
 */
export async function markDeliveryRead(deliveryId: string): Promise<void> {
  try {
    await db.messageDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'read',
        readAt: new Date(),
      },
    });
  } catch (error) {
    console.error('[TelegramService] Failed to mark delivery as read:', error);
  }
}

// ===== UTILITY: Retry failed deliveries =====

/**
 * Retry a failed message delivery.
 * Increments retryCount and resends via Telegram API.
 */
export async function retryDelivery(deliveryId: string): Promise<{
  success: boolean;
  retryCount: number;
}> {
  const delivery = await db.messageDelivery.findUnique({
    where: { id: deliveryId },
  });

  if (!delivery) {
    throw new TelegramServiceError(
      'Delivery record not found',
      'DELIVERY_NOT_FOUND',
      404
    );
  }

  if (delivery.channel !== 'telegram') {
    throw new TelegramServiceError(
      'Delivery record is not a Telegram message',
      'INVALID_CHANNEL',
      400
    );
  }

  if (delivery.retryCount >= delivery.maxRetries) {
    throw new TelegramServiceError(
      `Max retries (${delivery.maxRetries}) exceeded for this delivery`,
      'MAX_RETRIES_EXCEEDED',
      400
    );
  }

  if (delivery.status !== 'failed') {
    throw new TelegramServiceError(
      'Only failed deliveries can be retried',
      'NOT_FAILED',
      400
    );
  }

  const userId = delivery.userId;
  const chatId = delivery.recipientId;

  if (!chatId) {
    throw new TelegramServiceError(
      'No recipient chat ID found for delivery',
      'NO_RECIPIENT',
      400
    );
  }

  // Increment retry count
  const newRetryCount = delivery.retryCount + 1;
  const nextRetryAt = new Date(Date.now() + Math.pow(2, newRetryCount) * 60 * 1000); // Exponential backoff in minutes

  await db.messageDelivery.update({
    where: { id: deliveryId },
    data: {
      retryCount: newRetryCount,
      lastRetryAt: new Date(),
      nextRetryAt,
      status: 'pending',
      errorMessage: null,
    },
  });

  // Re-send the message
  if (delivery.content) {
    await sendMessage(userId, chatId, delivery.content, {
      conversationId: delivery.conversationId ?? undefined,
      leadId: delivery.leadId ?? undefined,
      templateId: delivery.templateId ?? undefined,
      templateName: delivery.templateName ?? undefined,
    });
  }

  return { success: true, retryCount: newRetryCount };
}

// ===== UTILITY: Pause/Resume bot =====

/**
 * Pause or resume the bot for a user.
 */
export async function setBotPaused(userId: string, paused: boolean): Promise<void> {
  const config = await db.telegramConfig.findUnique({
    where: { userId },
  });

  if (!config) {
    throw new TelegramServiceError(
      'Telegram bot not configured for this user',
      'NOT_CONFIGURED',
      404
    );
  }

  await db.telegramConfig.update({
    where: { userId },
    data: { isPaused: paused },
  });

  await logAudit(userId, paused ? 'telegram_bot_paused' : 'telegram_bot_resumed');

  console.log(`[TelegramService] Bot ${paused ? 'paused' : 'resumed'} for user: ${userId}`);
}
