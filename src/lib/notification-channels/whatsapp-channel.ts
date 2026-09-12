// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — WhatsApp Notification Channel
// Sends notifications via WhatsApp (Meta Cloud or Twilio)
//
// Rules:
// - NEVER throw unhandled — always try/catch
// - Rate limited: max 15 messages per hour per user
// - Format concise message for WhatsApp
// - Respects DND schedule and monthly quota
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ── Rate Limiting: 15 messages per hour per user ────────────────────

const MAX_MESSAGES_PER_HOUR = 15;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const rateLimitBuckets: Map<string, number[]> = new Map();

function checkChannelRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitBuckets.get(userId) || [];

  const recent = timestamps.filter((t: number) => now - t < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= MAX_MESSAGES_PER_HOUR) {
    return false; // rate-limited
  }

  recent.push(now);
  rateLimitBuckets.set(userId, recent);
  return true;
}

// Clean up stale entries every 10 minutes
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of Array.from(rateLimitBuckets.entries())) {
    const recent = timestamps.filter((t: number) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) {
      rateLimitBuckets.delete(key);
    } else {
      rateLimitBuckets.set(key, recent);
    }
  }
}, 600_000);
if (cleanup && typeof cleanup.unref === 'function') cleanup.unref();

// ── Public interface ────────────────────────────────────────────────

export interface WhatsappChannelParams {
  userId: string;
  title: string;
  message: string;
  type: string;
  actionUrl?: string;
  leadName?: string;
  whatsappData?: { phone: string; text: string };
}

export interface WhatsappChannelResult {
  sent: boolean;
  provider?: 'meta' | 'twilio';
  error?: string;
}

/**
 * Send a notification via WhatsApp (Meta Cloud or Twilio).
 * Checks connection, rate limits, monthly quota, then dispatches.
 */
export async function sendWhatsappNotification(
  params: WhatsappChannelParams,
): Promise<WhatsappChannelResult> {
  const { userId, title, message, type, actionUrl, leadName, whatsappData } = params;

  try {
    // Rate limit check
    if (!checkChannelRateLimit(userId)) {
      console.warn(`[WhatsAppChannel] Rate limit exceeded for user ${userId} (max ${MAX_MESSAGES_PER_HOUR}/hr)`);
      return { sent: false, error: 'Rate limit exceeded' };
    }

    // Get WhatsApp config for this user
    const config = await db.whatsappConfig.findUnique({
      where: { userId },
      select: {
        isConnected: true,
        isPaused: true,
        provider: true,
        phoneNumber: true,
        monthlyQuota: true,
        monthlyUsed: true,
      },
    });

    if (!config || !config.isConnected || config.isPaused) {
      return { sent: false, error: 'WhatsApp not connected or paused' };
    }

    // Check monthly quota
    if (config.monthlyQuota && config.monthlyUsed >= config.monthlyQuota) {
      console.warn(`[WhatsAppChannel] Monthly quota exceeded for user ${userId}`);
      return { sent: false, error: 'Monthly message quota exceeded' };
    }

    const phone = whatsappData?.phone || config.phoneNumber;
    if (!phone) {
      return { sent: false, error: 'No phone number available' };
    }

    // Build concise WhatsApp message
    let textMessage = `🔔 ${title}\n\n${message}`;

    if (leadName) {
      textMessage += `\n\n📌 Lead: ${leadName}`;
    }

    if (actionUrl) {
      textMessage += `\n\n👉 Take action: ${actionUrl}`;
    }

    // Use override text if provided
    const finalText = whatsappData?.text || textMessage;

    // Dispatch based on provider
    if (config.provider === 'meta') {
      try {
        const { sendMetaMessage } = await import('@/lib/whatsapp-service');
        const result = await sendMetaMessage(userId, phone, finalText);

        if (result.success) {
          console.log(`[WhatsAppChannel] Sent via Meta to ${phone}`);
          return { sent: true, provider: 'meta' };
        }

        console.warn(`[WhatsAppChannel] Meta send failed: ${result.error}`);
        return { sent: false, provider: 'meta', error: result.error || 'Meta send failed' };
      } catch (metaErr) {
        const errorMsg = metaErr instanceof Error ? metaErr.message : 'Unknown error';
        console.error(`[WhatsAppChannel] Meta error:`, errorMsg);
        return { sent: false, provider: 'meta', error: errorMsg };
      }
    }

    if (config.provider === 'twilio') {
      try {
        const { sendTwilioMessage } = await import('@/lib/whatsapp-service');
        const result = await sendTwilioMessage(userId, phone, finalText);

        if (result.success) {
          console.log(`[WhatsAppChannel] Sent via Twilio to ${phone}`);
          return { sent: true, provider: 'twilio' };
        }

        console.warn(`[WhatsAppChannel] Twilio send failed: ${result.error}`);
        return { sent: false, provider: 'twilio', error: result.error || 'Twilio send failed' };
      } catch (twilioErr) {
        const errorMsg = twilioErr instanceof Error ? twilioErr.message : 'Unknown error';
        console.error(`[WhatsAppChannel] Twilio error:`, errorMsg);
        return { sent: false, provider: 'twilio', error: errorMsg };
      }
    }

    return { sent: false, error: `Unknown WhatsApp provider: ${config.provider}` };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[WhatsAppChannel] Fatal error for user ${userId}:`, errorMsg);
    return { sent: false, error: errorMsg };
  }
}
