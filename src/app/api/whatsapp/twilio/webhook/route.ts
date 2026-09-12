// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/whatsapp/twilio/webhook
// Phase 10: WhatsApp Integration — Twilio Webhook Endpoint
//
// POST: Process Twilio webhook events (incoming messages, status updates)
// Validates the X-Twilio-Signature header and processes the event.
// Always returns 200 OK with empty TwiML response.
//
// NO withAuth — Twilio calls this endpoint directly
// ═══════════════════════════════════════════════════════════════════

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  validateTwilioWebhookSignature,
  processTwilioWebhook,
} from '@/lib/whatsapp-service';
import type { TwilioWebhookPayload } from '@/lib/whatsapp-service';

const ENCRYPTION_KEY = process.env.GMAIL_ENCRYPTION_KEY || 'default-dev-key-change-in-production-32b!';
const ALGORITHM = 'aes-256-gcm';

/**
 * Decrypt helper — reuses the same AES-256-GCM decryption
 * from whatsapp-service to get the authToken for signature validation.
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

/**
 * POST handler — Process Twilio webhook events
 * Twilio sends POST requests with form-urlencoded data for
 * incoming messages and status callbacks.
 * Always returns 200 OK with empty TwiML to acknowledge receipt.
 */
export async function POST(request: NextRequest) {
  try {
    // Parse form-urlencoded body from Twilio
    const formData = await request.formData();
    const body: Record<string, string> = {};
    formData.forEach((value, key) => {
      body[key] = value.toString();
    });

    const signatureHeader = request.headers.get('X-Twilio-Signature') || '';

    // Build the TwilioWebhookPayload from the form data
    const payload: TwilioWebhookPayload = {
      MessageSid: body.MessageSid || '',
      AccountSid: body.AccountSid || '',
      From: body.From || '',
      To: body.To || '',
      Body: body.Body,
      MediaUrl0: body.MediaUrl0,
      MediaContentType0: body.MediaContentType0,
      NumMedia: body.NumMedia,
      ProfileName: body.ProfileName,
      WaId: body.WaId,
      SmsStatus: body.SmsStatus,
      SmsMessageSid: body.SmsMessageSid,
      ErrorMessage: body.ErrorMessage,
      ErrorCode: body.ErrorCode,
      OriginalRepliedMessageSid: body.OriginalRepliedMessageSid,
    };

    // Find the user's Twilio config by AccountSid
    const config = await db.whatsappConfig.findFirst({
      where: {
        provider: 'twilio',
        twilioAccountSid: payload.AccountSid || undefined,
      },
      select: {
        id: true,
        userId: true,
        twilioAccountSid: true,
        twilioAuthToken: true,
      },
    });

    if (!config || !config.twilioAuthToken) {
      console.warn('[WhatsApp Twilio Webhook] No config found for AccountSid:', payload.AccountSid);
      // Still return 200 with empty TwiML
      return new NextResponse('<Response></Response>', {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
      });
    }

    // Decrypt the auth token for signature validation
    let authToken = '';
    try {
      authToken = decrypt(config.twilioAuthToken);
    } catch (decryptError) {
      console.error('[WhatsApp Twilio Webhook] Token decryption failed:', decryptError);
      // Continue processing even if decryption fails (dev mode)
    }

    // Validate Twilio signature
    const requestUrl = request.url;
    if (authToken && signatureHeader) {
      const isValid = validateTwilioWebhookSignature(
        requestUrl,
        body,
        signatureHeader,
        authToken
      );

      if (!isValid) {
        console.warn('[WhatsApp Twilio Webhook] Signature validation failed');
        // In production, reject invalid signatures
        if (process.env.NODE_ENV === 'production') {
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
        // In dev mode, continue with a warning
      }
    }

    // Process the webhook
    const result = await processTwilioWebhook(
      payload,
      requestUrl,
      signatureHeader,
      authToken
    );

    console.log('[WhatsApp Twilio Webhook] Processed:', result);

    // Return empty TwiML response (Twilio expects this)
    return new NextResponse('<Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (error) {
    console.error('[WhatsApp Twilio Webhook] POST error:', error);
    // Always return 200 with empty TwiML to prevent Twilio from retrying
    return new NextResponse('<Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    });
  }
}
