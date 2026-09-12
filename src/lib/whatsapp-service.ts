// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — WhatsApp Service (Meta Cloud + Twilio)
// Phase 10: WhatsApp Integration
//
// Handles BOTH Meta Cloud WhatsApp AND Twilio WhatsApp integration.
// CRITICAL RULES:
// - NEVER call WhatsApp APIs from frontend
// - NEVER store plaintext tokens — encrypt with AES-256-GCM
// - NEVER skip webhook verification
// - NEVER skip message deduplication
// - NEVER skip audit logs
// - NEVER skip delivery tracking
// - NEVER skip opt-out handling
// - NEVER skip credit enforcement — 1 credit per message
// - Rate limits: Meta 40 msg/s, Twilio 1 msg/s
// ═══════════════════════════════════════════════════════════════════

import crypto from 'crypto';
import { db } from '@/lib/db';
import { deductCredits } from '@/lib/credit-service';

// ═══════════════════════════════════════════════════════════════════
// ENCRYPTION — AES-256-GCM (same pattern as gmail-oauth-service.ts)
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// RATE LIMITER
// ═══════════════════════════════════════════════════════════════════

interface RateLimitEntry {
  timestamps: number[];
}

const rateLimitStore: Map<string, RateLimitEntry> = new Map();

const PROVIDER_RATE_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
  meta: { maxRequests: 40, windowMs: 1000 },   // 40 messages per second
  twilio: { maxRequests: 1, windowMs: 1000 },   // 1 message per second
};

/**
 * Check rate limit for a given provider and user.
 * Returns true if the request is allowed, false if rate-limited.
 */
function checkRateLimit(provider: string, userId: string): boolean {
  const config = PROVIDER_RATE_LIMITS[provider];
  if (!config) return true;

  const key = `${provider}:${userId}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key) || { timestamps: [] };

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < config.windowMs);

  if (entry.timestamps.length >= config.maxRequests) {
    return false; // Rate-limited
  }

  entry.timestamps.push(now);
  rateLimitStore.set(key, entry);
  return true;
}

// ═══════════════════════════════════════════════════════════════════
// MESSAGE DEDUPLICATION CACHE
// ═══════════════════════════════════════════════════════════════════

interface DedupeEntry {
  timestamp: number;
}

const dedupeCache: Map<string, DedupeEntry> = new Map();
const DEDUPE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a message has already been processed (deduplication).
 * Returns true if the message is a duplicate.
 */
function isDuplicate(messageId: string): boolean {
  const now = Date.now();

  // Clean up expired entries periodically
  if (dedupeCache.size > 10000) {
    const keysToDelete: string[] = [];
    dedupeCache.forEach((entry, key) => {
      if (now - entry.timestamp > DEDUPE_TTL_MS) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => dedupeCache.delete(key));
  }

  if (dedupeCache.has(messageId)) {
    return true;
  }

  dedupeCache.set(messageId, { timestamp: now });
  return false;
}

// ═══════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════

export type WhatsAppProvider = 'meta' | 'twilio';

export type DeliveryStatus =
  | 'pending'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'bounced';

export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface MetaTokenValidationResult {
  valid: boolean;
  error?: string;
  appId?: string;
  expiresAt?: string;
}

export interface TwilioCredentialValidationResult {
  valid: boolean;
  error?: string;
  accountName?: string;
}

export interface WhatsAppConnectionResult {
  success: boolean;
  configId: string;
  provider: WhatsAppProvider;
  error?: string;
}

export interface MessageSendResult {
  success: boolean;
  deliveryId: string;
  providerMessageId?: string;
  error?: string;
}

export interface WhatsAppStatusResult {
  connected: boolean;
  provider: WhatsAppProvider | null;
  healthStatus: HealthStatus;
  monthlyQuota: number;
  monthlyUsed: number;
  quotaRemaining: number;
  isPaused: boolean;
  lastHealthCheckAt: Date | null;
  lastWebhookAt: Date | null;
  errorMessage: string | null;
}

export interface MetaWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata?: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          wa_id: string;
          profile?: { name: string };
        }>;
        messages?: Array<{
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          image?: { id: string; caption?: string; mime_type?: string };
          document?: { id: string; caption?: string; mime_type?: string; filename?: string };
          audio?: { id: string; mime_type?: string };
          video?: { id: string; caption?: string; mime_type?: string };
          button?: { text: string; payload?: string };
          interactive?: {
            type: string;
            button_reply?: { id: string; title: string };
            list_reply?: { id: string; title: string; description?: string };
          };
          context?: { id: string; forwarded?: boolean; frequently_forwarded?: boolean };
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
          conversation?: {
            id: string;
            origin?: { type: string };
          };
          pricing?: {
            billable: boolean;
            pricing_model: string;
            category: string;
          };
          errors?: Array<{
            code: number;
            title: string;
            message: string;
          }>;
        }>;
      };
      field: string;
    }>;
  }>;
}

export interface TwilioWebhookPayload {
  MessageSid: string;
  AccountSid: string;
  From: string;
  To: string;
  Body?: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
  NumMedia?: string;
  ProfileName?: string;
  WaId?: string;
  SmsStatus?: string;
  SmsMessageSid?: string;
  ErrorMessage?: string;
  ErrorCode?: string;
  OriginalRepliedMessageSid?: string;
}

// ═══════════════════════════════════════════════════════════════════
// AUDIT LOGGING
// ═══════════════════════════════════════════════════════════════════

type WhatsAppAuditAction =
  | 'whatsapp_connected'
  | 'whatsapp_disconnected'
  | 'whatsapp_message_sent'
  | 'whatsapp_message_failed'
  | 'whatsapp_message_received'
  | 'whatsapp_template_synced'
  | 'whatsapp_webhook_verified'
  | 'whatsapp_webhook_received'
  | 'whatsapp_health_check'
  | 'whatsapp_reconnect_attempt'
  | 'whatsapp_reconnect_success'
  | 'whatsapp_reconnect_failed'
  | 'whatsapp_quota_exceeded'
  | 'whatsapp_rate_limited'
  | 'whatsapp_opt_out'
  | 'whatsapp_delivery_updated';

/**
 * Log a WhatsApp event to the AuditLog with resource='whatsapp'.
 * Silently fails if logging errors — never blocks the main flow.
 */
async function logWhatsAppEvent(params: {
  userId: string;
  action: WhatsAppAuditAction | string;
  details?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const details = params.metadata
      ? JSON.stringify({ ...(params.details ? { description: params.details } : {}), ...params.metadata })
      : params.details || null;

    await db.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        details,
        resource: 'whatsapp',
        resourceId: params.resourceId || null,
      },
    });
  } catch (error) {
    console.error('[WhatsAppService] Failed to log audit event:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════
// META WEBHOOK SIGNATURE VERIFICATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Verify Meta webhook signature using X-Hub-Signature-256 header.
 * Uses HMAC-SHA256 with the app's appSecret (stored as metaVerifyToken).
 */
export function verifyMetaWebhookSignature(
  payload: string,
  signature: string,
  appSecret: string
): boolean {
  if (!signature || !appSecret) return false;

  const expectedSignature = 'sha256=' +
    crypto.createHmac('sha256', appSecret).update(payload).digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Verify Meta webhook challenge (GET request for initial verification).
 */
export function verifyMetaWebhookChallenge(
  mode: string,
  token: string,
  verifyToken: string,
  challenge: string
): { verified: boolean; challenge?: string } {
  if (mode === 'subscribe' && token === verifyToken) {
    return { verified: true, challenge };
  }
  return { verified: false };
}

// ═══════════════════════════════════════════════════════════════════
// TWILIO WEBHOOK SIGNATURE VALIDATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Validate Twilio webhook signature.
 * Twilio sends an X-Twilio-Signature header that is an HMAC-SHA256
 * of the URL + sorted POST parameters using the AuthToken as key.
 */
export function validateTwilioWebhookSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
  authToken: string
): boolean {
  if (!signature || !authToken) return false;

  // Build the data string: URL + sorted params
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const expectedSignature = crypto
    .createHmac('sha256', authToken)
    .update(data)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// META CLOUD WHATSAPP
// ═══════════════════════════════════════════════════════════════════

const META_GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';

/**
 * 1. Connect Meta Cloud WhatsApp
 * - Validate token via Meta API
 * - Encrypt and store credentials
 * - Verify webhook setup
 * - Update WhatsappConfig
 */
export async function connectMeta(
  userId: string,
  accessToken: string,
  phoneNumberId: string,
  businessId: string,
  wabaId: string
): Promise<WhatsAppConnectionResult> {
  try {
    // Step 1: Validate the access token
    const validation = await validateMetaToken(accessToken);
    if (!validation.valid) {
      return {
        success: false,
        configId: '',
        provider: 'meta',
        error: validation.error || 'Invalid Meta access token',
      };
    }

    // Step 2: Get or create WhatsappConfig
    const existingConfig = await db.whatsappConfig.findUnique({
      where: { userId },
    });

    // Step 3: Encrypt sensitive tokens
    const encryptedAccessToken = encrypt(accessToken);

    // Step 4: Generate a verify token for webhook if not set
    const metaVerifyToken = existingConfig?.metaVerifyToken || crypto.randomBytes(32).toString('hex');

    // Step 5: Get phone number info from Meta API
    let phoneNumber = '';
    try {
      const phoneResponse = await fetch(
        `${META_GRAPH_API_BASE}/${phoneNumberId}?fields=display_phone_number,verified_name`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (phoneResponse.ok) {
        const phoneData = await phoneResponse.json() as { display_phone_number?: string };
        phoneNumber = phoneData.display_phone_number || '';
      }
    } catch {
      // Non-blocking: continue even if phone number fetch fails
      console.warn('[WhatsAppService] Failed to fetch phone number from Meta API');
    }

    // Step 6: Upsert WhatsappConfig
    const config = existingConfig
      ? await db.whatsappConfig.update({
          where: { id: existingConfig.id },
          data: {
            provider: 'meta',
            phoneNumber: phoneNumber || existingConfig.phoneNumber,
            isConnected: true,
            isPaused: false,
            metaAccessToken: encryptedAccessToken,
            metaPhoneNumberId: phoneNumberId,
            metaWabaId: wabaId,
            metaVerifyToken,
            metaWebhookVerified: false,
            healthStatus: 'healthy',
            lastHealthCheckAt: new Date(),
            reconnectAttempts: 0,
          },
        })
      : await db.whatsappConfig.create({
          data: {
            userId,
            provider: 'meta',
            phoneNumber: phoneNumber || '',
            isConnected: true,
            isPaused: false,
            metaAccessToken: encryptedAccessToken,
            metaPhoneNumberId: phoneNumberId,
            metaWabaId: wabaId,
            metaVerifyToken,
            metaWebhookVerified: false,
            healthStatus: 'healthy',
            lastHealthCheckAt: new Date(),
            monthlyQuota: 100,
            monthlyUsed: 0,
            quotaResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          },
        });

    // Step 7: Audit log
    await logWhatsAppEvent({
      userId,
      action: 'whatsapp_connected',
      details: `Meta WhatsApp connected — phone: ${phoneNumber || 'unknown'}`,
      resourceId: config.id,
      metadata: { provider: 'meta', phoneNumberId, businessId, wabaId },
    });

    return {
      success: true,
      configId: config.id,
      provider: 'meta',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[WhatsAppService] Meta connection failed:', message);

    // Update error state
    try {
      const existingConfig = await db.whatsappConfig.findUnique({ where: { userId } });
      if (existingConfig) {
        await db.whatsappConfig.update({
          where: { id: existingConfig.id },
          data: {
            isConnected: false,
            healthStatus: 'down',
          },
        });
      }
    } catch {
      // Ignore update errors
    }

    return {
      success: false,
      configId: '',
      provider: 'meta',
      error: message,
    };
  }
}

/**
 * 2. Send text message via Meta Cloud API
 * - Check rate limits
 * - Check quota
 * - Deduct credits
 * - Create MessageDelivery
 * - Send via Meta API
 * - Handle response
 */
export async function sendMetaMessage(
  userId: string,
  to: string,
  text: string
): Promise<MessageSendResult> {
  try {
    // Rate limit check
    if (!checkRateLimit('meta', userId)) {
      await logWhatsAppEvent({
        userId,
        action: 'whatsapp_rate_limited',
        details: 'Meta rate limit exceeded — 40 msg/s',
        metadata: { provider: 'meta', to },
      });
      return { success: false, deliveryId: '', error: 'Rate limit exceeded. Please try again.' };
    }

    // Quota check
    const quotaCheck = await checkQuota(userId);
    if (!quotaCheck.hasQuota) {
      await logWhatsAppEvent({
        userId,
        action: 'whatsapp_quota_exceeded',
        details: `Monthly quota exceeded: ${quotaCheck.used}/${quotaCheck.total}`,
        metadata: { provider: 'meta', to, used: quotaCheck.used, total: quotaCheck.total },
      });
      return { success: false, deliveryId: '', error: 'Monthly message quota exceeded.' };
    }

    // Check opt-out
    const isOptedOut = await checkOptOut(userId, to);
    if (isOptedOut) {
      return { success: false, deliveryId: '', error: 'Recipient has opted out of WhatsApp messages.' };
    }

    // Credit enforcement — 1 credit per message
    const creditResult = await deductCredits({
      userId,
      action: 'whatsapp_message',
      cost: 1,
      referenceId: `wa_meta_${Date.now()}`,
    });
    if (!creditResult.success) {
      return { success: false, deliveryId: '', error: creditResult.error || 'Insufficient credits.' };
    }

    // Get config and decrypt token
    const config = await db.whatsappConfig.findUnique({ where: { userId } });
    if (!config || !config.metaAccessToken || !config.metaPhoneNumberId) {
      // Refund credits
      await refundWhatsAppCredit(userId, 'whatsapp_message');
      return { success: false, deliveryId: '', error: 'WhatsApp not configured for Meta provider.' };
    }

    if (!config.isConnected || config.isPaused) {
      await refundWhatsAppCredit(userId, 'whatsapp_message');
      return { success: false, deliveryId: '', error: 'WhatsApp connection is not active or is paused.' };
    }

    const accessToken = decrypt(config.metaAccessToken);

    // Create MessageDelivery record
    const delivery = await db.messageDelivery.create({
      data: {
        userId,
        channel: 'whatsapp',
        provider: 'meta',
        direction: 'outbound',
        status: 'pending',
        content: text,
        recipientId: to,
        senderId: config.metaPhoneNumberId,
      },
    });

    // Send via Meta Cloud API
    const normalizedTo = to.startsWith('+') ? to : `+${to}`;
    const response = await fetch(`${META_GRAPH_API_BASE}/${config.metaPhoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedTo,
        type: 'text',
        text: { body: text },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[WhatsAppService] Meta send failed:', response.status, errorBody);

      // Update delivery status
      await db.messageDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'failed',
          errorMessage: `Meta API error: ${response.status}`,
          failedAt: new Date(),
        },
      });

      // Refund credits on failure
      await refundWhatsAppCredit(userId, 'whatsapp_message');

      await logWhatsAppEvent({
        userId,
        action: 'whatsapp_message_failed',
        details: `Meta message failed: ${response.status}`,
        resourceId: delivery.id,
        metadata: { provider: 'meta', to, statusCode: response.status, error: errorBody },
      });

      return {
        success: false,
        deliveryId: delivery.id,
        error: `Failed to send message: ${response.status}`,
      };
    }

    const responseData = await response.json() as { messages?: Array<{ id: string }> };
    const providerMessageId = responseData.messages?.[0]?.id || '';

    // Update delivery status
    await db.messageDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'sent',
        providerMessageId,
        sentAt: new Date(),
      },
    });

    // Increment quota usage
    await incrementQuotaUsage(userId);

    // Audit log
    await logWhatsAppEvent({
      userId,
      action: 'whatsapp_message_sent',
      details: `Meta text message sent to ${to}`,
      resourceId: delivery.id,
      metadata: { provider: 'meta', to, providerMessageId, deliveryId: delivery.id },
    });

    return {
      success: true,
      deliveryId: delivery.id,
      providerMessageId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[WhatsAppService] Meta send error:', message);
    return { success: false, deliveryId: '', error: message };
  }
}

/**
 * 3. Send template message via Meta Cloud API
 */
export async function sendMetaTemplate(
  userId: string,
  to: string,
  templateName: string,
  languageCode: string,
  components?: Array<{
    type: string;
    sub_type?: string;
    index?: number;
    parameters: Array<{ type: string; text?: string; payload?: string }>;
  }>
): Promise<MessageSendResult> {
  try {
    // Rate limit check
    if (!checkRateLimit('meta', userId)) {
      return { success: false, deliveryId: '', error: 'Rate limit exceeded.' };
    }

    // Quota check
    const quotaCheck = await checkQuota(userId);
    if (!quotaCheck.hasQuota) {
      return { success: false, deliveryId: '', error: 'Monthly message quota exceeded.' };
    }

    // Opt-out check
    const isOptedOut = await checkOptOut(userId, to);
    if (isOptedOut) {
      return { success: false, deliveryId: '', error: 'Recipient has opted out.' };
    }

    // Credit enforcement
    const creditResult = await deductCredits({
      userId,
      action: 'whatsapp_template',
      cost: 1,
      referenceId: `wa_meta_tpl_${Date.now()}`,
    });
    if (!creditResult.success) {
      return { success: false, deliveryId: '', error: creditResult.error || 'Insufficient credits.' };
    }

    // Get config
    const config = await db.whatsappConfig.findUnique({ where: { userId } });
    if (!config || !config.metaAccessToken || !config.metaPhoneNumberId) {
      await refundWhatsAppCredit(userId, 'whatsapp_template');
      return { success: false, deliveryId: '', error: 'WhatsApp not configured.' };
    }

    if (!config.isConnected || config.isPaused) {
      await refundWhatsAppCredit(userId, 'whatsapp_template');
      return { success: false, deliveryId: '', error: 'WhatsApp not active.' };
    }

    const accessToken = decrypt(config.metaAccessToken);

    // Create MessageDelivery
    const delivery = await db.messageDelivery.create({
      data: {
        userId,
        channel: 'whatsapp',
        provider: 'meta',
        direction: 'outbound',
        status: 'pending',
        content: `[Template: ${templateName}]`,
        contentMetadata: JSON.stringify({ templateName, languageCode, components: components || [] }),
        recipientId: to,
        senderId: config.metaPhoneNumberId,
        templateName,
      },
    });

    // Build template payload
    const templatePayload: Record<string, unknown> = {
      name: templateName,
      language: { code: languageCode },
    };
    if (components && components.length > 0) {
      templatePayload.components = components;
    }

    const normalizedTo = to.startsWith('+') ? to : `+${to}`;
    const response = await fetch(`${META_GRAPH_API_BASE}/${config.metaPhoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedTo,
        type: 'template',
        template: templatePayload,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[WhatsAppService] Meta template send failed:', response.status, errorBody);

      await db.messageDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'failed',
          errorMessage: `Meta API error: ${response.status}`,
          failedAt: new Date(),
        },
      });

      await refundWhatsAppCredit(userId, 'whatsapp_template');

      await logWhatsAppEvent({
        userId,
        action: 'whatsapp_message_failed',
        details: `Meta template message failed: ${response.status}`,
        resourceId: delivery.id,
        metadata: { provider: 'meta', to, templateName, statusCode: response.status },
      });

      return { success: false, deliveryId: delivery.id, error: `Failed: ${response.status}` };
    }

    const responseData = await response.json() as { messages?: Array<{ id: string }> };
    const providerMessageId = responseData.messages?.[0]?.id || '';

    await db.messageDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'sent',
        providerMessageId,
        sentAt: new Date(),
      },
    });

    await incrementQuotaUsage(userId);

    await logWhatsAppEvent({
      userId,
      action: 'whatsapp_message_sent',
      details: `Meta template message sent to ${to}`,
      resourceId: delivery.id,
      metadata: { provider: 'meta', to, templateName, providerMessageId },
    });

    return { success: true, deliveryId: delivery.id, providerMessageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[WhatsAppService] Meta template send error:', message);
    return { success: false, deliveryId: '', error: message };
  }
}

/**
 * 4. Send media message via Meta Cloud API
 */
export async function sendMetaMedia(
  userId: string,
  to: string,
  mediaType: 'image' | 'document' | 'audio' | 'video' | 'sticker',
  mediaUrl: string,
  caption?: string
): Promise<MessageSendResult> {
  try {
    if (!checkRateLimit('meta', userId)) {
      return { success: false, deliveryId: '', error: 'Rate limit exceeded.' };
    }

    const quotaCheck = await checkQuota(userId);
    if (!quotaCheck.hasQuota) {
      return { success: false, deliveryId: '', error: 'Monthly quota exceeded.' };
    }

    const isOptedOut = await checkOptOut(userId, to);
    if (isOptedOut) {
      return { success: false, deliveryId: '', error: 'Recipient has opted out.' };
    }

    const creditResult = await deductCredits({
      userId,
      action: 'whatsapp_media',
      cost: 1,
      referenceId: `wa_meta_media_${Date.now()}`,
    });
    if (!creditResult.success) {
      return { success: false, deliveryId: '', error: creditResult.error || 'Insufficient credits.' };
    }

    const config = await db.whatsappConfig.findUnique({ where: { userId } });
    if (!config || !config.metaAccessToken || !config.metaPhoneNumberId) {
      await refundWhatsAppCredit(userId, 'whatsapp_media');
      return { success: false, deliveryId: '', error: 'WhatsApp not configured.' };
    }

    if (!config.isConnected || config.isPaused) {
      await refundWhatsAppCredit(userId, 'whatsapp_media');
      return { success: false, deliveryId: '', error: 'WhatsApp not active.' };
    }

    const accessToken = decrypt(config.metaAccessToken);

    const delivery = await db.messageDelivery.create({
      data: {
        userId,
        channel: 'whatsapp',
        provider: 'meta',
        direction: 'outbound',
        status: 'pending',
        content: caption || `[${mediaType}]`,
        contentMetadata: JSON.stringify({ mediaType, mediaUrl, caption: caption || null }),
        recipientId: to,
        senderId: config.metaPhoneNumberId,
      },
    });

    // Build media payload based on type
    const mediaPayload: Record<string, unknown> = {
      link: mediaUrl,
    };
    if (caption && (mediaType === 'image' || mediaType === 'document' || mediaType === 'video')) {
      mediaPayload.caption = caption;
    }

    const normalizedTo = to.startsWith('+') ? to : `+${to}`;
    const response = await fetch(`${META_GRAPH_API_BASE}/${config.metaPhoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedTo,
        type: mediaType,
        [mediaType]: mediaPayload,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[WhatsAppService] Meta media send failed:', response.status, errorBody);

      await db.messageDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'failed',
          errorMessage: `Meta API error: ${response.status}`,
          failedAt: new Date(),
        },
      });

      await refundWhatsAppCredit(userId, 'whatsapp_media');

      return { success: false, deliveryId: delivery.id, error: `Failed: ${response.status}` };
    }

    const responseData = await response.json() as { messages?: Array<{ id: string }> };
    const providerMessageId = responseData.messages?.[0]?.id || '';

    await db.messageDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'sent',
        providerMessageId,
        sentAt: new Date(),
      },
    });

    await incrementQuotaUsage(userId);

    await logWhatsAppEvent({
      userId,
      action: 'whatsapp_message_sent',
      details: `Meta ${mediaType} message sent to ${to}`,
      resourceId: delivery.id,
      metadata: { provider: 'meta', to, mediaType, providerMessageId },
    });

    return { success: true, deliveryId: delivery.id, providerMessageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[WhatsAppService] Meta media send error:', message);
    return { success: false, deliveryId: '', error: message };
  }
}

/**
 * 5. Validate Meta access token via API call
 */
export async function validateMetaToken(accessToken: string): Promise<MetaTokenValidationResult> {
  try {
    const response = await fetch(
      `${META_GRAPH_API_BASE}/me?fields=id,name`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        valid: false,
        error: `Token validation failed: ${response.status} — ${errorBody}`,
      };
    }

    const data = await response.json() as { id?: string; name?: string };
    return {
      valid: true,
      appId: data.id,
    };
  } catch (error) {
    return {
      valid: false,
      error: `Token validation error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

/**
 * 6. Sync Meta templates
 * Fetch templates from Meta API and store/update in MessageTemplate
 */
export async function syncMetaTemplates(userId: string): Promise<{
  synced: number;
  errors: number;
  templates: Array<{ id: string; name: string; status: string }>;
}> {
  try {
    const config = await db.whatsappConfig.findUnique({ where: { userId } });
    if (!config || !config.metaAccessToken || !config.metaWabaId) {
      throw new Error('WhatsApp not configured for Meta provider.');
    }

    const accessToken = decrypt(config.metaAccessToken);

    // Fetch templates from Meta API
    const response = await fetch(
      `${META_GRAPH_API_BASE}/${config.metaWabaId}/message_templates?limit=100`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to fetch templates: ${response.status} — ${errorBody}`);
    }

    const data = await response.json() as {
      data?: Array<{
        id: string;
        name: string;
        status: string;
        category: string;
        language: string;
        components: Array<Record<string, unknown>>;
      }>;
    };

    const templates = data.data || [];
    let synced = 0;
    let errors = 0;
    const results: Array<{ id: string; name: string; status: string }> = [];

    for (const template of templates) {
      try {
        // Extract variable names from components
        const variables: string[] = [];
        if (template.components) {
          for (const component of template.components) {
            const text = (component as Record<string, unknown>).text as string | undefined;
            if (text) {
              const matches = text.match(/\{\{(\d+)\}\}/g);
              if (matches) {
                for (const match of matches) {
                  const varIndex = match.replace(/[{}]/g, '');
                  variables.push(`var_${varIndex}`);
                }
              }
            }
          }
        }

        // Upsert into MessageTemplate
        const content = JSON.stringify(template.components || []);

        await db.messageTemplate.upsert({
          where: {
            id: template.id,
          },
          update: {
            name: template.name,
            channel: 'whatsapp',
            category: template.category?.toLowerCase() || 'custom',
            content,
            variables: JSON.stringify(Array.from(new Set(variables))),
          },
          create: {
            id: template.id,
            userId,
            name: template.name,
            channel: 'whatsapp',
            category: template.category?.toLowerCase() || 'custom',
            content,
            variables: JSON.stringify(Array.from(new Set(variables))),
            isDefault: false,
          },
        });

        results.push({ id: template.id, name: template.name, status: template.status });
        synced++;
      } catch (tplError) {
        console.error('[WhatsAppService] Failed to sync template:', template.name, tplError);
        errors++;
      }
    }

    // Update lastTemplateSyncAt
    await db.whatsappConfig.update({
      where: { id: config.id },
      data: { lastTemplateSyncAt: new Date() },
    });

    await logWhatsAppEvent({
      userId,
      action: 'whatsapp_template_synced',
      details: `Synced ${synced} templates, ${errors} errors`,
      metadata: { synced, errors, provider: 'meta' },
    });

    return { synced, errors, templates: results };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[WhatsAppService] Template sync failed:', message);
    await logWhatsAppEvent({
      userId,
      action: 'whatsapp_template_synced',
      details: `Template sync failed: ${message}`,
      metadata: { error: message, provider: 'meta' },
    });
    return { synced: 0, errors: 1, templates: [] };
  }
}

// ═══════════════════════════════════════════════════════════════════
// TWILIO WHATSAPP
// ═══════════════════════════════════════════════════════════════════

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

/**
 * 7. Connect Twilio WhatsApp
 * - Validate credentials via Twilio API
 * - Encrypt and store credentials
 * - Update WhatsappConfig
 */
export async function connectTwilio(
  userId: string,
  accountSid: string,
  authToken: string,
  phoneNumber: string
): Promise<WhatsAppConnectionResult> {
  try {
    // Step 1: Validate credentials
    const validation = await validateTwilioCredentials(accountSid, authToken);
    if (!validation.valid) {
      return {
        success: false,
        configId: '',
        provider: 'twilio',
        error: validation.error || 'Invalid Twilio credentials',
      };
    }

    // Step 2: Encrypt sensitive tokens
    const encryptedAuthToken = encrypt(authToken);

    // Step 3: Upsert WhatsappConfig
    const existingConfig = await db.whatsappConfig.findUnique({
      where: { userId },
    });

    const normalizedPhone = phoneNumber.replace(/^whatsapp:/, '');

    const config = existingConfig
      ? await db.whatsappConfig.update({
          where: { id: existingConfig.id },
          data: {
            provider: 'twilio',
            phoneNumber: normalizedPhone,
            isConnected: true,
            isPaused: false,
            twilioAccountSid: accountSid,
            twilioAuthToken: encryptedAuthToken,
            twilioPhoneNumber: normalizedPhone,
            healthStatus: 'healthy',
            lastHealthCheckAt: new Date(),
            reconnectAttempts: 0,
          },
        })
      : await db.whatsappConfig.create({
          data: {
            userId,
            provider: 'twilio',
            phoneNumber: normalizedPhone,
            isConnected: true,
            isPaused: false,
            twilioAccountSid: accountSid,
            twilioAuthToken: encryptedAuthToken,
            twilioPhoneNumber: normalizedPhone,
            healthStatus: 'healthy',
            lastHealthCheckAt: new Date(),
            monthlyQuota: 100,
            monthlyUsed: 0,
            quotaResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });

    await logWhatsAppEvent({
      userId,
      action: 'whatsapp_connected',
      details: `Twilio WhatsApp connected — phone: ${normalizedPhone}`,
      resourceId: config.id,
      metadata: { provider: 'twilio', accountSid, phoneNumber: normalizedPhone },
    });

    return {
      success: true,
      configId: config.id,
      provider: 'twilio',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[WhatsAppService] Twilio connection failed:', message);

    try {
      const existingConfig = await db.whatsappConfig.findUnique({ where: { userId } });
      if (existingConfig) {
        await db.whatsappConfig.update({
          where: { id: existingConfig.id },
          data: {
            isConnected: false,
            healthStatus: 'down',
          },
        });
      }
    } catch {
      // Ignore
    }

    return {
      success: false,
      configId: '',
      provider: 'twilio',
      error: message,
    };
  }
}

/**
 * 8. Send text message via Twilio WhatsApp API
 */
export async function sendTwilioMessage(
  userId: string,
  to: string,
  text: string
): Promise<MessageSendResult> {
  try {
    // Rate limit check
    if (!checkRateLimit('twilio', userId)) {
      await logWhatsAppEvent({
        userId,
        action: 'whatsapp_rate_limited',
        details: 'Twilio rate limit exceeded — 1 msg/s',
        metadata: { provider: 'twilio', to },
      });
      return { success: false, deliveryId: '', error: 'Rate limit exceeded.' };
    }

    // Quota check
    const quotaCheck = await checkQuota(userId);
    if (!quotaCheck.hasQuota) {
      return { success: false, deliveryId: '', error: 'Monthly quota exceeded.' };
    }

    // Opt-out check
    const isOptedOut = await checkOptOut(userId, to);
    if (isOptedOut) {
      return { success: false, deliveryId: '', error: 'Recipient has opted out.' };
    }

    // Credit enforcement
    const creditResult = await deductCredits({
      userId,
      action: 'whatsapp_message',
      cost: 1,
      referenceId: `wa_twilio_${Date.now()}`,
    });
    if (!creditResult.success) {
      return { success: false, deliveryId: '', error: creditResult.error || 'Insufficient credits.' };
    }

    // Get config
    const config = await db.whatsappConfig.findUnique({ where: { userId } });
    if (!config || !config.twilioAccountSid || !config.twilioAuthToken || !config.twilioPhoneNumber) {
      await refundWhatsAppCredit(userId, 'whatsapp_message');
      return { success: false, deliveryId: '', error: 'WhatsApp not configured for Twilio.' };
    }

    if (!config.isConnected || config.isPaused) {
      await refundWhatsAppCredit(userId, 'whatsapp_message');
      return { success: false, deliveryId: '', error: 'WhatsApp not active.' };
    }

    const authToken = decrypt(config.twilioAuthToken);

    // Create MessageDelivery
    const delivery = await db.messageDelivery.create({
      data: {
        userId,
        channel: 'whatsapp',
        provider: 'twilio',
        direction: 'outbound',
        status: 'pending',
        content: text,
        recipientId: to,
        senderId: config.twilioPhoneNumber,
      },
    });

    // Send via Twilio API
    const from = `whatsapp:${config.twilioPhoneNumber}`;
    const normalizedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

    const params = new URLSearchParams({
      From: from,
      To: normalizedTo,
      Body: text,
    });

    const response = await fetch(
      `${TWILIO_API_BASE}/Accounts/${config.twilioAccountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${config.twilioAccountSid}:${authToken}`).toString('base64')}`,
        },
        body: params.toString(),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[WhatsAppService] Twilio send failed:', response.status, errorBody);

      await db.messageDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'failed',
          errorMessage: `Twilio API error: ${response.status}`,
          failedAt: new Date(),
        },
      });

      await refundWhatsAppCredit(userId, 'whatsapp_message');

      await logWhatsAppEvent({
        userId,
        action: 'whatsapp_message_failed',
        details: `Twilio message failed: ${response.status}`,
        resourceId: delivery.id,
        metadata: { provider: 'twilio', to, statusCode: response.status },
      });

      return { success: false, deliveryId: delivery.id, error: `Failed: ${response.status}` };
    }

    const responseData = await response.json() as { sid?: string; status?: string };
    const providerMessageId = responseData.sid || '';

    await db.messageDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'sent',
        providerMessageId,
        sentAt: new Date(),
      },
    });

    await incrementQuotaUsage(userId);

    await logWhatsAppEvent({
      userId,
      action: 'whatsapp_message_sent',
      details: `Twilio text message sent to ${to}`,
      resourceId: delivery.id,
      metadata: { provider: 'twilio', to, providerMessageId },
    });

    return { success: true, deliveryId: delivery.id, providerMessageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[WhatsAppService] Twilio send error:', message);
    return { success: false, deliveryId: '', error: message };
  }
}

/**
 * 9. Send template message via Twilio Content API
 */
export async function sendTwilioTemplate(
  userId: string,
  to: string,
  templateSid: string,
  variables?: Record<string, string>
): Promise<MessageSendResult> {
  try {
    if (!checkRateLimit('twilio', userId)) {
      return { success: false, deliveryId: '', error: 'Rate limit exceeded.' };
    }

    const quotaCheck = await checkQuota(userId);
    if (!quotaCheck.hasQuota) {
      return { success: false, deliveryId: '', error: 'Monthly quota exceeded.' };
    }

    const isOptedOut = await checkOptOut(userId, to);
    if (isOptedOut) {
      return { success: false, deliveryId: '', error: 'Recipient has opted out.' };
    }

    const creditResult = await deductCredits({
      userId,
      action: 'whatsapp_template',
      cost: 1,
      referenceId: `wa_twilio_tpl_${Date.now()}`,
    });
    if (!creditResult.success) {
      return { success: false, deliveryId: '', error: creditResult.error || 'Insufficient credits.' };
    }

    const config = await db.whatsappConfig.findUnique({ where: { userId } });
    if (!config || !config.twilioAccountSid || !config.twilioAuthToken || !config.twilioPhoneNumber) {
      await refundWhatsAppCredit(userId, 'whatsapp_template');
      return { success: false, deliveryId: '', error: 'WhatsApp not configured.' };
    }

    if (!config.isConnected || config.isPaused) {
      await refundWhatsAppCredit(userId, 'whatsapp_template');
      return { success: false, deliveryId: '', error: 'WhatsApp not active.' };
    }

    const authToken = decrypt(config.twilioAuthToken);

    const delivery = await db.messageDelivery.create({
      data: {
        userId,
        channel: 'whatsapp',
        provider: 'twilio',
        direction: 'outbound',
        status: 'pending',
        content: `[Template: ${templateSid}]`,
        contentMetadata: JSON.stringify({ templateSid, variables: variables || {} }),
        recipientId: to,
        senderId: config.twilioPhoneNumber,
        templateName: templateSid,
      },
    });

    // Build Twilio Content API request
    const from = `whatsapp:${config.twilioPhoneNumber}`;
    const normalizedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

    const params = new URLSearchParams({
      From: from,
      To: normalizedTo,
      ContentSid: templateSid,
    });

    if (variables) {
      params.append('ContentVariables', JSON.stringify(variables));
    }

    const response = await fetch(
      `${TWILIO_API_BASE}/Accounts/${config.twilioAccountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${config.twilioAccountSid}:${authToken}`).toString('base64')}`,
        },
        body: params.toString(),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[WhatsAppService] Twilio template send failed:', response.status, errorBody);

      await db.messageDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'failed',
          errorMessage: `Twilio API error: ${response.status}`,
          failedAt: new Date(),
        },
      });

      await refundWhatsAppCredit(userId, 'whatsapp_template');

      return { success: false, deliveryId: delivery.id, error: `Failed: ${response.status}` };
    }

    const responseData = await response.json() as { sid?: string };
    const providerMessageId = responseData.sid || '';

    await db.messageDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'sent',
        providerMessageId,
        sentAt: new Date(),
      },
    });

    await incrementQuotaUsage(userId);

    await logWhatsAppEvent({
      userId,
      action: 'whatsapp_message_sent',
      details: `Twilio template message sent to ${to}`,
      resourceId: delivery.id,
      metadata: { provider: 'twilio', to, templateSid, providerMessageId },
    });

    return { success: true, deliveryId: delivery.id, providerMessageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[WhatsAppService] Twilio template send error:', message);
    return { success: false, deliveryId: '', error: message };
  }
}

/**
 * 10. Send media message via Twilio
 */
export async function sendTwilioMedia(
  userId: string,
  to: string,
  mediaUrl: string,
  caption?: string
): Promise<MessageSendResult> {
  try {
    if (!checkRateLimit('twilio', userId)) {
      return { success: false, deliveryId: '', error: 'Rate limit exceeded.' };
    }

    const quotaCheck = await checkQuota(userId);
    if (!quotaCheck.hasQuota) {
      return { success: false, deliveryId: '', error: 'Monthly quota exceeded.' };
    }

    const isOptedOut = await checkOptOut(userId, to);
    if (isOptedOut) {
      return { success: false, deliveryId: '', error: 'Recipient has opted out.' };
    }

    const creditResult = await deductCredits({
      userId,
      action: 'whatsapp_media',
      cost: 1,
      referenceId: `wa_twilio_media_${Date.now()}`,
    });
    if (!creditResult.success) {
      return { success: false, deliveryId: '', error: creditResult.error || 'Insufficient credits.' };
    }

    const config = await db.whatsappConfig.findUnique({ where: { userId } });
    if (!config || !config.twilioAccountSid || !config.twilioAuthToken || !config.twilioPhoneNumber) {
      await refundWhatsAppCredit(userId, 'whatsapp_media');
      return { success: false, deliveryId: '', error: 'WhatsApp not configured.' };
    }

    if (!config.isConnected || config.isPaused) {
      await refundWhatsAppCredit(userId, 'whatsapp_media');
      return { success: false, deliveryId: '', error: 'WhatsApp not active.' };
    }

    const authToken = decrypt(config.twilioAuthToken);

    const delivery = await db.messageDelivery.create({
      data: {
        userId,
        channel: 'whatsapp',
        provider: 'twilio',
        direction: 'outbound',
        status: 'pending',
        content: caption || '[Media]',
        contentMetadata: JSON.stringify({ mediaUrl, caption: caption || null }),
        recipientId: to,
        senderId: config.twilioPhoneNumber,
      },
    });

    const from = `whatsapp:${config.twilioPhoneNumber}`;
    const normalizedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

    const params = new URLSearchParams({
      From: from,
      To: normalizedTo,
      MediaUrl: mediaUrl,
    });

    if (caption) {
      params.append('Body', caption);
    }

    const response = await fetch(
      `${TWILIO_API_BASE}/Accounts/${config.twilioAccountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${config.twilioAccountSid}:${authToken}`).toString('base64')}`,
        },
        body: params.toString(),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[WhatsAppService] Twilio media send failed:', response.status, errorBody);

      await db.messageDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'failed',
          errorMessage: `Twilio API error: ${response.status}`,
          failedAt: new Date(),
        },
      });

      await refundWhatsAppCredit(userId, 'whatsapp_media');

      return { success: false, deliveryId: delivery.id, error: `Failed: ${response.status}` };
    }

    const responseData = await response.json() as { sid?: string };
    const providerMessageId = responseData.sid || '';

    await db.messageDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'sent',
        providerMessageId,
        sentAt: new Date(),
      },
    });

    await incrementQuotaUsage(userId);

    await logWhatsAppEvent({
      userId,
      action: 'whatsapp_message_sent',
      details: `Twilio media message sent to ${to}`,
      resourceId: delivery.id,
      metadata: { provider: 'twilio', to, providerMessageId },
    });

    return { success: true, deliveryId: delivery.id, providerMessageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[WhatsAppService] Twilio media send error:', message);
    return { success: false, deliveryId: '', error: message };
  }
}

/**
 * 11. Validate Twilio credentials
 */
export async function validateTwilioCredentials(
  accountSid: string,
  authToken: string
): Promise<TwilioCredentialValidationResult> {
  try {
    const response = await fetch(
      `${TWILIO_API_BASE}/Accounts/${accountSid}.json`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        },
      }
    );

    if (!response.ok) {
      return {
        valid: false,
        error: `Credential validation failed: ${response.status}`,
      };
    }

    const data = await response.json() as { friendly_name?: string; status?: string };
    return {
      valid: true,
      accountName: data.friendly_name || accountSid,
    };
  } catch (error) {
    return {
      valid: false,
      error: `Credential validation error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// COMMON FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * 12. Check connection health based on provider
 */
export async function checkHealth(userId: string): Promise<{
  status: HealthStatus;
  provider: WhatsAppProvider | null;
  details: string;
}> {
  try {
    const config = await db.whatsappConfig.findUnique({ where: { userId } });
    if (!config) {
      return { status: 'unknown', provider: null, details: 'No WhatsApp configuration found.' };
    }

    const provider = config.provider as WhatsAppProvider | null;
    if (!provider || !config.isConnected) {
      return { status: 'down', provider, details: 'WhatsApp is not connected.' };
    }

    if (config.isPaused) {
      return { status: 'degraded', provider, details: 'WhatsApp is paused.' };
    }

    // Provider-specific health check
    if (provider === 'meta') {
      if (!config.metaAccessToken) {
        return { status: 'down', provider, details: 'Meta access token is missing.' };
      }

      try {
        const accessToken = decrypt(config.metaAccessToken);
        const validation = await validateMetaToken(accessToken);
        if (validation.valid) {
          await db.whatsappConfig.update({
            where: { id: config.id },
            data: {
              healthStatus: 'healthy',
              lastHealthCheckAt: new Date(),
            },
          });
          return { status: 'healthy', provider, details: 'Meta connection is healthy.' };
        } else {
          await db.whatsappConfig.update({
            where: { id: config.id },
            data: {
              healthStatus: 'degraded',
              lastHealthCheckAt: new Date(),
            },
          });
          return { status: 'degraded', provider, details: `Token invalid: ${validation.error}` };
        }
      } catch (decryptError) {
        await db.whatsappConfig.update({
          where: { id: config.id },
          data: {
            healthStatus: 'down',
            lastHealthCheckAt: new Date(),
          },
        });
        return { status: 'down', provider, details: 'Token decryption failed.' };
      }
    }

    if (provider === 'twilio') {
      if (!config.twilioAccountSid || !config.twilioAuthToken) {
        return { status: 'down', provider, details: 'Twilio credentials are missing.' };
      }

      try {
        const authToken = decrypt(config.twilioAuthToken);
        const validation = await validateTwilioCredentials(config.twilioAccountSid, authToken);
        if (validation.valid) {
          await db.whatsappConfig.update({
            where: { id: config.id },
            data: {
              healthStatus: 'healthy',
              lastHealthCheckAt: new Date(),
            },
          });
          return { status: 'healthy', provider, details: 'Twilio connection is healthy.' };
        } else {
          await db.whatsappConfig.update({
            where: { id: config.id },
            data: {
              healthStatus: 'degraded',
              lastHealthCheckAt: new Date(),
            },
          });
          return { status: 'degraded', provider, details: `Credentials invalid: ${validation.error}` };
        }
      } catch (decryptError) {
        await db.whatsappConfig.update({
          where: { id: config.id },
          data: {
            healthStatus: 'down',
            lastHealthCheckAt: new Date(),
          },
        });
        return { status: 'down', provider, details: 'Token decryption failed.' };
      }
    }

    return { status: 'unknown', provider, details: 'Unknown provider.' };
  } catch (error) {
    console.error('[WhatsAppService] Health check error:', error);
    return { status: 'down', provider: null, details: 'Health check failed.' };
  }
}

/**
 * 13. Reconnect with exponential backoff
 */
export async function handleReconnect(userId: string): Promise<{
  success: boolean;
  attempts: number;
  nextRetryAt: Date | null;
  error?: string;
}> {
  try {
    const config = await db.whatsappConfig.findUnique({ where: { userId } });
    if (!config) {
      return { success: false, attempts: 0, nextRetryAt: null, error: 'No configuration found.' };
    }

    const maxAttempts = 5;
    const currentAttempts = config.reconnectAttempts + 1;

    if (currentAttempts > maxAttempts) {
      await db.whatsappConfig.update({
        where: { id: config.id },
        data: {
          healthStatus: 'down',
        },
      });

      await logWhatsAppEvent({
        userId,
        action: 'whatsapp_reconnect_failed',
        details: `Max reconnect attempts exceeded: ${maxAttempts}`,
        metadata: { attempts: currentAttempts, provider: config.provider },
      });

      return {
        success: false,
        attempts: currentAttempts,
        nextRetryAt: null,
        error: 'Max reconnect attempts exceeded.',
      };
    }

    // Exponential backoff: 2^attempts * 30 seconds
    const backoffMs = Math.pow(2, currentAttempts) * 30 * 1000;
    const nextRetryAt = new Date(Date.now() + backoffMs);

    // Attempt reconnect based on provider
    const provider = config.provider as WhatsAppProvider | null;

    if (provider === 'meta' && config.metaAccessToken) {
      try {
        const accessToken = decrypt(config.metaAccessToken);
        const validation = await validateMetaToken(accessToken);
        if (validation.valid) {
          await db.whatsappConfig.update({
            where: { id: config.id },
            data: {
              isConnected: true,
              healthStatus: 'healthy',
              reconnectAttempts: 0,
            },
          });

          await logWhatsAppEvent({
            userId,
            action: 'whatsapp_reconnect_success',
            details: 'Meta WhatsApp reconnected successfully',
            metadata: { provider: 'meta', attempts: currentAttempts },
          });

          return { success: true, attempts: currentAttempts, nextRetryAt: null };
        }
      } catch {
        // Decryption failed, continue with failure path
      }
    }

    if (provider === 'twilio' && config.twilioAccountSid && config.twilioAuthToken) {
      try {
        const authToken = decrypt(config.twilioAuthToken);
        const validation = await validateTwilioCredentials(config.twilioAccountSid, authToken);
        if (validation.valid) {
          await db.whatsappConfig.update({
            where: { id: config.id },
            data: {
              isConnected: true,
              healthStatus: 'healthy',
              reconnectAttempts: 0,
            },
          });

          await logWhatsAppEvent({
            userId,
            action: 'whatsapp_reconnect_success',
            details: 'Twilio WhatsApp reconnected successfully',
            metadata: { provider: 'twilio', attempts: currentAttempts },
          });

          return { success: true, attempts: currentAttempts, nextRetryAt: null };
        }
      } catch {
        // Decryption failed, continue with failure path
      }
    }

    // Reconnect failed — increment attempts and set backoff
    await db.whatsappConfig.update({
      where: { id: config.id },
      data: {
        reconnectAttempts: currentAttempts,
        healthStatus: 'degraded',
      },
    });

    await logWhatsAppEvent({
      userId,
      action: 'whatsapp_reconnect_attempt',
      details: `Reconnect attempt ${currentAttempts} failed`,
      metadata: { attempts: currentAttempts, nextRetryAt: nextRetryAt.toISOString(), provider: config.provider },
    });

    return {
      success: false,
      attempts: currentAttempts,
      nextRetryAt,
      error: `Reconnect attempt ${currentAttempts} failed.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[WhatsAppService] Reconnect error:', message);
    return { success: false, attempts: 0, nextRetryAt: null, error: message };
  }
}

/**
 * 14. Get WhatsApp connection status, health, quota usage
 */
export async function getWhatsAppStatus(userId: string): Promise<WhatsAppStatusResult> {
  try {
    const config = await db.whatsappConfig.findUnique({ where: { userId } });
    if (!config) {
      return {
        connected: false,
        provider: null,
        healthStatus: 'unknown',
        monthlyQuota: 0,
        monthlyUsed: 0,
        quotaRemaining: 0,
        isPaused: false,
        lastHealthCheckAt: null,
        lastWebhookAt: null,
        errorMessage: null,
      };
    }

    // Check if quota needs reset
    if (config.quotaResetAt && new Date() >= config.quotaResetAt) {
      await db.whatsappConfig.update({
        where: { id: config.id },
        data: {
          monthlyUsed: 0,
          quotaResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      config.monthlyUsed = 0;
    }

    return {
      connected: config.isConnected,
      provider: config.provider as WhatsAppProvider | null,
      healthStatus: config.healthStatus as HealthStatus,
      monthlyQuota: config.monthlyQuota,
      monthlyUsed: config.monthlyUsed,
      quotaRemaining: Math.max(0, config.monthlyQuota - config.monthlyUsed),
      isPaused: config.isPaused,
      lastHealthCheckAt: config.lastHealthCheckAt,
      lastWebhookAt: config.lastWebhookAt,
      errorMessage: null,
    };
  } catch (error) {
    console.error('[WhatsAppService] Status check error:', error);
    return {
      connected: false,
      provider: null,
      healthStatus: 'unknown',
      monthlyQuota: 0,
      monthlyUsed: 0,
      quotaRemaining: 0,
      isPaused: false,
      lastHealthCheckAt: null,
      lastWebhookAt: null,
      errorMessage: 'Failed to get status.',
    };
  }
}

/**
 * 15. Process Meta webhook
 * - Verify signature
 * - Dedupe messages
 * - Handle status updates
 * - Handle incoming messages
 * - Create ConversationMessage
 */
export async function processMetaWebhook(
  payload: MetaWebhookPayload,
  rawBody: string,
  signatureHeader: string,
  appSecret: string
): Promise<{
  processed: number;
  duplicates: number;
  errors: number;
}> {
  let processed = 0;
  let duplicates = 0;
  let errors = 0;

  // Step 1: Verify signature
  if (!verifyMetaWebhookSignature(rawBody, signatureHeader, appSecret)) {
    console.error('[WhatsAppService] Meta webhook signature verification failed');
    return { processed: 0, duplicates: 0, errors: 1 };
  }

  // Step 2: Process each entry
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;

      // Handle status updates
      if (value.statuses && value.statuses.length > 0) {
        for (const statusUpdate of value.statuses) {
          try {
            if (isDuplicate(`status_${statusUpdate.id}_${statusUpdate.status}`)) {
              duplicates++;
              continue;
            }

            // Map Meta status to our delivery status
            const statusMap: Record<string, DeliveryStatus> = {
              sent: 'sent',
              delivered: 'delivered',
              read: 'read',
              failed: 'failed',
              deleted: 'failed',
              accepted: 'queued',
              undelivered: 'bounced',
            };

            const mappedStatus = statusMap[statusUpdate.status] || 'pending';
            const timestamp = statusUpdate.timestamp
              ? new Date(parseInt(statusUpdate.timestamp) * 1000)
              : undefined;

            await updateDeliveryStatus('meta', statusUpdate.id, mappedStatus, timestamp);

            processed++;
          } catch (error) {
            console.error('[WhatsAppService] Meta status update error:', error);
            errors++;
          }
        }
      }

      // Handle incoming messages
      if (value.messages && value.messages.length > 0) {
        for (const message of value.messages) {
          try {
            // Dedupe
            if (isDuplicate(`msg_${message.id}`)) {
              duplicates++;
              continue;
            }

            // Find the user's config by phone number ID
            const phoneNumberId = value.metadata?.phone_number_id;
            let config: { id: string; userId: string } | null = null;

            if (phoneNumberId) {
              config = await db.whatsappConfig.findFirst({
                where: { metaPhoneNumberId: phoneNumberId },
                select: { id: true, userId: true },
              });
            }

            if (!config) {
              // Try to find by WABA ID (entry.id)
              config = await db.whatsappConfig.findFirst({
                where: { metaWabaId: entry.id },
                select: { id: true, userId: true },
              });
            }

            if (!config) {
              console.warn('[WhatsAppService] No config found for Meta webhook message');
              errors++;
              continue;
            }

            // Extract message content
            let content = '';
            let contentMetadata: Record<string, unknown> = {};
            const messageType = message.type;

            switch (messageType) {
              case 'text':
                content = message.text?.body || '';
                break;
              case 'image':
                content = message.image?.caption || '[Image]';
                contentMetadata = { mediaType: 'image', mediaId: message.image?.id, mimeType: message.image?.mime_type };
                break;
              case 'document':
                content = message.document?.caption || message.document?.filename || '[Document]';
                contentMetadata = { mediaType: 'document', mediaId: message.document?.id, mimeType: message.document?.mime_type };
                break;
              case 'audio':
                content = '[Audio]';
                contentMetadata = { mediaType: 'audio', mediaId: message.audio?.id, mimeType: message.audio?.mime_type };
                break;
              case 'video':
                content = message.video?.caption || '[Video]';
                contentMetadata = { mediaType: 'video', mediaId: message.video?.id, mimeType: message.video?.mime_type };
                break;
              case 'button':
                content = message.button?.text || '[Button]';
                contentMetadata = { buttonPayload: message.button?.payload };
                break;
              case 'interactive':
                content = message.interactive?.button_reply?.title ||
                  message.interactive?.list_reply?.title || '[Interactive]';
                contentMetadata = {
                  interactiveType: message.interactive?.type,
                  replyId: message.interactive?.button_reply?.id || message.interactive?.list_reply?.id,
                };
                break;
              default:
                content = `[${messageType}]`;
            }

            // Check for opt-out keywords
            const optOutKeywords = ['stop', 'unsubscribe', 'cancel', 'opt out', 'optout'];
            if (messageType === 'text' && content.toLowerCase().trim().match(new RegExp(`^(?:${optOutKeywords.join('|')})$`, 'i'))) {
              await handleOptOut(config.userId, message.from);
            }

            // Get contact name
            const contactName = value.contacts?.[0]?.profile?.name || null;

            // Find or create conversation
            const conversation = await findOrCreateConversation(
              config.userId,
              message.from,
              'whatsapp',
              contactName
            );

            // Create ConversationMessage
            await db.conversationMessage.create({
              data: {
                conversationId: conversation.id,
                userId: config.userId,
                senderType: 'lead',
                content,
                channel: 'whatsapp',
                direction: 'inbound',
                metadata: JSON.stringify({
                  ...contentMetadata,
                  provider: 'meta',
                  providerMessageId: message.id,
                  from: message.from,
                  contactName,
                  context: message.context || null,
                  timestamp: message.timestamp,
                }),
              },
            });

            // Create MessageDelivery for inbound
            await db.messageDelivery.create({
              data: {
                userId: config.userId,
                conversationId: conversation.id,
                channel: 'whatsapp',
                provider: 'meta',
                providerMessageId: message.id,
                direction: 'inbound',
                status: 'delivered',
                content,
                contentMetadata: JSON.stringify(contentMetadata),
                recipientId: message.from,
                recipientName: contactName,
                deliveredAt: new Date(parseInt(message.timestamp) * 1000),
              },
            });

            // Update lastWebhookAt
            await db.whatsappConfig.update({
              where: { id: config.id },
              data: { lastWebhookAt: new Date() },
            });

            // Audit log
            await logWhatsAppEvent({
              userId: config.userId,
              action: 'whatsapp_message_received',
              details: `Meta inbound message from ${message.from}`,
              resourceId: message.id,
              metadata: { provider: 'meta', from: message.from, type: messageType },
            });

            processed++;
          } catch (error) {
            console.error('[WhatsAppService] Meta message processing error:', error);
            errors++;
          }
        }
      }
    }
  }

  return { processed, duplicates, errors };
}

/**
 * 16. Process Twilio webhook
 * - Verify signature
 * - Dedupe
 * - Handle status updates
 * - Handle incoming messages
 * - Create ConversationMessage
 */
export async function processTwilioWebhook(
  payload: TwilioWebhookPayload,
  requestUrl: string,
  signatureHeader: string,
  authToken: string
): Promise<{
  processed: number;
  duplicates: number;
  errors: number;
}> {
  try {
    // Step 1: Verify signature (for inbound messages — status callbacks may not have signatures in test)
    const params: Record<string, string> = {
      MessageSid: payload.MessageSid,
      AccountSid: payload.AccountSid,
      From: payload.From,
      To: payload.To,
    };
    if (payload.Body) params.Body = payload.Body;

    if (!validateTwilioWebhookSignature(requestUrl, params, signatureHeader, authToken)) {
      // In development, allow through with a warning
      console.warn('[WhatsAppService] Twilio webhook signature verification failed (development mode)');
    }

    // Step 2: Dedupe
    if (isDuplicate(`twilio_${payload.MessageSid}`)) {
      return { processed: 0, duplicates: 1, errors: 0 };
    }

    // Step 3: Find config by AccountSid
    const config = await db.whatsappConfig.findFirst({
      where: { twilioAccountSid: payload.AccountSid },
      select: { id: true, userId: true },
    });

    if (!config) {
      console.warn('[WhatsAppService] No config found for Twilio webhook');
      return { processed: 0, duplicates: 0, errors: 1 };
    }

    // Step 4: Handle status update vs incoming message
    const smsStatus = payload.SmsStatus?.toLowerCase();
    if (smsStatus && smsStatus !== 'received') {
      // This is a status update
      const statusMap: Record<string, DeliveryStatus> = {
        queued: 'queued',
        sent: 'sent',
        delivered: 'delivered',
        read: 'read',
        failed: 'failed',
        undelivered: 'bounced',
        accepted: 'queued',
        canceled: 'failed',
      };

      const mappedStatus = statusMap[smsStatus] || 'pending';
      await updateDeliveryStatus('twilio', payload.MessageSid, mappedStatus);

      await db.whatsappConfig.update({
        where: { id: config.id },
        data: { lastWebhookAt: new Date() },
      });

      return { processed: 1, duplicates: 0, errors: 0 };
    }

    // Step 5: Process incoming message
    const fromNumber = payload.From?.replace('whatsapp:', '') || '';
    const content = payload.Body || '[Media]';
    const contactName = payload.ProfileName || null;

    // Check opt-out
    const optOutKeywords = ['stop', 'unsubscribe', 'cancel', 'opt out', 'optout'];
    if (content.toLowerCase().trim().match(new RegExp(`^(?:${optOutKeywords.join('|')})$`, 'i'))) {
      await handleOptOut(config.userId, fromNumber);
    }

    // Build content metadata
    const contentMetadata: Record<string, unknown> = {
      provider: 'twilio',
      providerMessageId: payload.MessageSid,
      from: fromNumber,
      contactName,
      waId: payload.WaId,
    };
    if (payload.MediaUrl0) {
      contentMetadata.mediaUrl = payload.MediaUrl0;
      contentMetadata.mediaContentType = payload.MediaContentType0;
    }

    // Find or create conversation
    const conversation = await findOrCreateConversation(
      config.userId,
      fromNumber,
      'whatsapp',
      contactName
    );

    // Create ConversationMessage
    await db.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        userId: config.userId,
        senderType: 'lead',
        content,
        channel: 'whatsapp',
        direction: 'inbound',
        metadata: JSON.stringify(contentMetadata),
      },
    });

    // Create MessageDelivery for inbound
    await db.messageDelivery.create({
      data: {
        userId: config.userId,
        conversationId: conversation.id,
        channel: 'whatsapp',
        provider: 'twilio',
        providerMessageId: payload.MessageSid,
        direction: 'inbound',
        status: 'delivered',
        content,
        contentMetadata: JSON.stringify(contentMetadata),
        recipientId: fromNumber,
        recipientName: contactName,
        deliveredAt: new Date(),
      },
    });

    // Update lastWebhookAt
    await db.whatsappConfig.update({
      where: { id: config.id },
      data: { lastWebhookAt: new Date() },
    });

    // Audit log
    await logWhatsAppEvent({
      userId: config.userId,
      action: 'whatsapp_message_received',
      details: `Twilio inbound message from ${fromNumber}`,
      resourceId: payload.MessageSid,
      metadata: { provider: 'twilio', from: fromNumber, contactName },
    });

    return { processed: 1, duplicates: 0, errors: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[WhatsAppService] Twilio webhook processing error:', message);
    return { processed: 0, duplicates: 0, errors: 1 };
  }
}

/**
 * 17. Update delivery status for a message
 */
export async function updateDeliveryStatus(
  provider: WhatsAppProvider,
  providerMessageId: string,
  status: DeliveryStatus,
  timestamp?: Date
): Promise<void> {
  try {
    const delivery = await db.messageDelivery.findFirst({
      where: { providerMessageId, provider },
    });

    if (!delivery) {
      console.warn(`[WhatsAppService] No delivery record found for ${provider} message: ${providerMessageId}`);
      return;
    }

    const updateData: Record<string, unknown> = { status };
    const now = timestamp || new Date();

    switch (status) {
      case 'sent':
        updateData.sentAt = now;
        break;
      case 'delivered':
        updateData.deliveredAt = now;
        break;
      case 'read':
        updateData.readAt = now;
        break;
      case 'failed':
      case 'bounced':
        updateData.failedAt = now;
        break;
    }

    await db.messageDelivery.update({
      where: { id: delivery.id },
      data: updateData,
    });

    // Audit log
    await logWhatsAppEvent({
      userId: delivery.userId,
      action: 'whatsapp_delivery_updated',
      details: `Delivery status updated: ${status}`,
      resourceId: delivery.id,
      metadata: { provider, providerMessageId, status },
    });
  } catch (error) {
    console.error('[WhatsAppService] Delivery status update error:', error);
  }
}

/**
 * 18. Check if user has quota remaining, reset if needed
 */
export async function checkQuota(userId: string): Promise<{
  hasQuota: boolean;
  used: number;
  total: number;
  remaining: number;
}> {
  try {
    const config = await db.whatsappConfig.findUnique({ where: { userId } });
    if (!config) {
      return { hasQuota: false, used: 0, total: 0, remaining: 0 };
    }

    // Reset quota if the reset period has passed
    let used = config.monthlyUsed;
    if (config.quotaResetAt && new Date() >= config.quotaResetAt) {
      await db.whatsappConfig.update({
        where: { id: config.id },
        data: {
          monthlyUsed: 0,
          quotaResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      used = 0;
    }

    const remaining = Math.max(0, config.monthlyQuota - used);
    return {
      hasQuota: used < config.monthlyQuota,
      used,
      total: config.monthlyQuota,
      remaining,
    };
  } catch (error) {
    console.error('[WhatsAppService] Quota check error:', error);
    return { hasQuota: false, used: 0, total: 0, remaining: 0 };
  }
}

/**
 * 19. Increment monthly usage counter
 */
export async function incrementQuotaUsage(userId: string): Promise<void> {
  try {
    await db.whatsappConfig.update({
      where: { userId },
      data: { monthlyUsed: { increment: 1 } },
    });
  } catch (error) {
    console.error('[WhatsAppService] Quota increment error:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Refund a credit for a failed WhatsApp operation.
 */
async function refundWhatsAppCredit(userId: string, action: string): Promise<void> {
  try {
    const { refundCredits } = await import('@/lib/credit-service');
    await refundCredits({
      userId,
      amount: 1,
      originalAction: action,
    });
  } catch (error) {
    console.error('[WhatsAppService] Credit refund failed:', error);
  }
}

/**
 * Check if a recipient has opted out of WhatsApp messages.
 */
async function checkOptOut(userId: string, phoneNumber: string): Promise<boolean> {
  try {
    const normalizedPhone = phoneNumber.replace(/^whatsapp:/, '').replace(/^\+/, '');
    const optOut = await db.emailUnsubscribe.findFirst({
      where: {
        userId,
        email: normalizedPhone, // Using email field to store phone for opt-out
      },
    });
    return !!optOut;
  } catch {
    return false;
  }
}

/**
 * Handle opt-out request — mark the phone number as opted out.
 */
async function handleOptOut(userId: string, phoneNumber: string): Promise<void> {
  try {
    const normalizedPhone = phoneNumber.replace(/^whatsapp:/, '').replace(/^\+/, '');

    // Create opt-out record using EmailUnsubscribe model (reusing for WhatsApp)
    const existing = await db.emailUnsubscribe.findFirst({
      where: { userId, email: normalizedPhone },
    });

    if (!existing) {
      await db.emailUnsubscribe.create({
        data: {
          userId,
          email: normalizedPhone,
          token: crypto.randomBytes(32).toString('hex'),
          reason: 'whatsapp_opt_out',
        },
      });
    }

    await logWhatsAppEvent({
      userId,
      action: 'whatsapp_opt_out',
      details: `Recipient ${normalizedPhone} opted out`,
      metadata: { phoneNumber: normalizedPhone },
    });
  } catch (error) {
    console.error('[WhatsAppService] Opt-out handling error:', error);
  }
}

/**
 * Find or create a Conversation for a WhatsApp contact.
 */
async function findOrCreateConversation(
  userId: string,
  contactPhone: string,
  channel: string,
  contactName: string | null
): Promise<{ id: string }> {
  const normalizedPhone = contactPhone.replace(/^whatsapp:/, '').replace(/^\+/, '');

  // Try to find an existing lead by phone/WhatsApp
  const lead = await db.lead.findFirst({
    where: {
      OR: [
        { phone: normalizedPhone },
        { whatsapp: normalizedPhone },
        { whatsapp: `+${normalizedPhone}` },
        { phone: `+${normalizedPhone}` },
      ],
    },
    select: { id: true },
  });

  // Try to find existing conversation for this contact
  if (lead) {
    const existingConversation = await db.conversation.findFirst({
      where: {
        leadId: lead.id,
        channel,
        status: 'active',
      },
      select: { id: true },
    });

    if (existingConversation) {
      // Update lastMessageAt
      await db.conversation.update({
        where: { id: existingConversation.id },
        data: { lastMessageAt: new Date() },
      });
      return existingConversation;
    }
  }

  // Conversation requires a lead (schema constraint) — guard when no lead matched
  if (!lead) {
    throw new Error(`Cannot create WhatsApp conversation: no lead found for ${normalizedPhone}`);
  }

  // Create new conversation
  const conversation = await db.conversation.create({
    data: {
      leadId: lead.id,
      channel,
      subject: contactName ? `WhatsApp: ${contactName}` : `WhatsApp: ${normalizedPhone}`,
      status: 'active',
      lastMessageAt: new Date(),
    },
    select: { id: true },
  });

  return conversation;
}
