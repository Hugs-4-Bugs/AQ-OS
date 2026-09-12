// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Telegram Notification Channel
// Sends notifications via Telegram Bot API
//
// Rules:
// - NEVER throw unhandled — always try/catch
// - Rate limited: max 20 messages per hour per user
// - Format message with Telegram MarkdownV2
// - Include action URL as inline link
// - Respects DND schedule
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ── Rate Limiting: 20 messages per hour per user ────────────────────

const MAX_MESSAGES_PER_HOUR = 20;
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

// ── MarkdownV2 escaping ─────────────────────────────────────────────

function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// ── Public interface ────────────────────────────────────────────────

export interface TelegramChannelParams {
  userId: string;
  title: string;
  message: string;
  type: string;
  actionUrl?: string;
  leadName?: string;
  telegramData?: { chatId: string; text: string };
}

export interface TelegramChannelResult {
  sent: boolean;
  error?: string;
}

/**
 * Send a notification via Telegram Bot.
 * Checks connection status, rate limits, then dispatches
 * using the existing telegram-service.
 */
export async function sendTelegramNotification(
  params: TelegramChannelParams,
): Promise<TelegramChannelResult> {
  const { userId, title, message, type, actionUrl, leadName, telegramData } = params;

  try {
    // Rate limit check
    if (!checkChannelRateLimit(userId)) {
      console.warn(`[TelegramChannel] Rate limit exceeded for user ${userId} (max ${MAX_MESSAGES_PER_HOUR}/hr)`);
      return { sent: false, error: 'Rate limit exceeded' };
    }

    // Get Telegram config for this user
    const config = await db.telegramConfig.findUnique({
      where: { userId },
      select: { id: true, isConnected: true, chatId: true, isPaused: true },
    });

    if (!config || !config.isConnected || config.isPaused) {
      return { sent: false, error: 'Telegram not connected or paused' };
    }

    const chatId = telegramData?.chatId || config.chatId;
    if (!chatId) {
      return { sent: false, error: 'No chat ID available' };
    }

    // Build message with Telegram markdown
    const escapedTitle = escapeMarkdownV2(title);
    const escapedMessage = escapeMarkdownV2(message);

    let telegramText = `🔔 *${escapedTitle}*\n\n${escapedMessage}`;

    if (leadName) {
      telegramText += `\n\n📌 ${escapeMarkdownV2('Lead: ' + leadName)}`;
    }

    if (actionUrl) {
      telegramText += `\n\n👉 [Take Action](${escapeMarkdownV2(actionUrl)})`;
    }

    // Use override text if provided
    const finalText = telegramData?.text || telegramText;

    // Use the existing telegram-service sendMessage
    const { sendMessage } = await import('@/lib/telegram-service');
    await sendMessage(userId, chatId, finalText, {
      parseMode: 'MarkdownV2',
      disableNotification: false,
    });

    console.log(`[TelegramChannel] Sent notification to user ${userId}, chat ${chatId}`);
    return { sent: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[TelegramChannel] Failed for user ${userId}:`, errorMsg);
    return { sent: false, error: errorMsg };
  }
}
