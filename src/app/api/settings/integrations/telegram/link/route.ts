import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import crypto from 'crypto';

// POST /api/settings/integrations/telegram/link - Generate a link code for Telegram bot connection
//
// ─────────────────────────────────────────────────────────────────────────────
// PENDING: Telegram Bot Webhook Endpoint
// ─────────────────────────────────────────────────────────────────────────────
// The link code is generated and stored in TelegramConfig, but the flow is
// INCOMPLETE: there is no webhook endpoint for the Telegram bot to receive the
// code and complete the link. A route like POST /api/webhooks/telegram is needed
// that:
//   1. Receives the /start <CODE> message from the Telegram Bot API
//   2. Looks up the link code in TelegramConfig (checking expiry)
//   3. Saves the chatId and username from the incoming update
//   4. Sets isConnected = true
//   5. Returns a confirmation message to the user via the bot
//
// Additionally, the TELEGRAM_BOT_TOKEN env var must be set, and the bot's
// webhook must be registered with the Telegram API:
//   curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
//        -d "url=https://your-domain.com/api/webhooks/telegram"
//
// The webhook-security.ts lib already has verifyTelegramSignature() ready.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = authUser.id;

    // Generate a 6-character random link code
    const linkCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    const linkCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Upsert TelegramConfig with the link code
    const telegramConfig = await db.telegramConfig.upsert({
      where: { userId },
      update: {
        linkCode,
        linkCodeExpiresAt,
      },
      create: {
        userId,
        chatId: '', // Will be filled when bot receives the link code
        linkCode,
        linkCodeExpiresAt,
        isConnected: false,
      },
    });

    return NextResponse.json({
      linkCode,
      expiresAt: linkCodeExpiresAt.toISOString(),
      instructions: 'Send this code to the AcquisitionOS Telegram bot to link your account. The code expires in 10 minutes.',
    });
  } catch (error) {
    console.error('Telegram link error:', error);
    return NextResponse.json(
      { error: 'Failed to generate Telegram link code' },
      { status: 500 }
    );
  }
}
