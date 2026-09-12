// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/telegram/webhook
// Phase 10: Receive Telegram webhook updates
// Public endpoint — verified via x-telegram-bot-api-secret-token header
// Always returns 200 OK to prevent Telegram retry loops
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processWebhookUpdate, type TelegramUpdate } from '@/lib/telegram-service';

/**
 * Decrypt an AES-256-GCM encrypted webhook secret.
 * Mirrors the decrypt function in telegram-service.ts.
 */
function decryptSecret(encryptedText: string): string {
  const ENCRYPTION_KEY = process.env.GMAIL_ENCRYPTION_KEY || 'default-dev-key-change-in-production-32b!';
  const ALGORITHM = 'aes-256-gcm';

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

import * as crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    // 1. Extract the secret token from the Telegram header
    const secret = request.headers.get('x-telegram-bot-api-secret-token');

    if (!secret) {
      console.warn('[API /telegram/webhook] Missing x-telegram-bot-api-secret-token header');
      // Still return 200 to prevent retries
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // 2. Parse the update payload
    let update: TelegramUpdate;
    try {
      update = await request.json() as TelegramUpdate;
    } catch {
      console.warn('[API /telegram/webhook] Invalid JSON payload');
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Basic sanity check on the payload
    if (!update || typeof update.update_id !== 'number') {
      console.warn('[API /telegram/webhook] Invalid update payload: missing update_id');
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // 3. Find the TelegramConfig where the decrypted webhookSecret matches the provided secret
    // We need to check all connected configs since we don't know which bot this update is for yet
    const configs = await db.telegramConfig.findMany({
      where: {
        isConnected: true,
        webhookSecret: { not: null },
      },
      select: {
        id: true,
        userId: true,
        webhookSecret: true,
      },
    });

    let matchedUserId: string | null = null;

    for (const config of configs) {
      if (!config.webhookSecret) continue;

      try {
        const decryptedSecret = decryptSecret(config.webhookSecret);
        if (decryptedSecret === secret) {
          matchedUserId = config.userId;
          break;
        }
      } catch {
        // Decryption failed for this config — skip it
        console.warn(`[API /telegram/webhook] Failed to decrypt webhookSecret for config: ${config.id}`);
      }
    }

    if (!matchedUserId) {
      console.warn('[API /telegram/webhook] No matching TelegramConfig found for the provided secret');
      // Return 200 anyway — Telegram must not retry
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // 4. Process the update (non-blocking — fire and forget)
    // We process in the background so we can return 200 immediately
    processWebhookUpdate(update).catch((err) => {
      console.error('[API /telegram/webhook] Error processing update:', err);
    });

    // Update lastWebhookAt timestamp (non-blocking)
    db.telegramConfig.update({
      where: { userId: matchedUserId },
      data: { lastWebhookAt: new Date() },
    }).catch((err) => {
      console.error('[API /telegram/webhook] Failed to update lastWebhookAt:', err);
    });

    // 5. Always return 200 OK to Telegram immediately
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    // Log the error but ALWAYS return 200 to prevent Telegram retries
    console.error('[API /telegram/webhook] Unhandled error:', error);
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
