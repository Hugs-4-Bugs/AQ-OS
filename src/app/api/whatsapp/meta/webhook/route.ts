// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET/POST /api/whatsapp/meta/webhook
// Phase 10: WhatsApp Integration — Meta Webhook Endpoint
//
// GET:  Handle Meta webhook verification (hub.mode=subscribe)
// POST: Process Meta webhook events (messages, status updates)
//
// NO withAuth — Meta calls this endpoint directly
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
  processMetaWebhook,
} from '@/lib/whatsapp-service';
import type { MetaWebhookPayload } from '@/lib/whatsapp-service';

/**
 * GET handler — Meta webhook verification
 * Meta sends a GET request with hub.mode=subscribe, hub.verify_token,
 * and hub.challenge when initially configuring the webhook.
 * We must verify the token and return the challenge.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (!mode || !token || !challenge) {
      return NextResponse.json(
        { error: 'Missing hub.mode, hub.verify_token, or hub.challenge' },
        { status: 400 }
      );
    }

    // Find the WhatsappConfig that has this verify token
    // We need to look up all Meta configs and find one with matching metaVerifyToken
    const configs = await db.whatsappConfig.findMany({
      where: {
        provider: 'meta',
        metaVerifyToken: { not: null },
      },
      select: {
        id: true,
        userId: true,
        metaVerifyToken: true,
      },
    });

    let matchedConfig: { id: string; userId: string } | null = null;

    for (const config of configs) {
      if (config.metaVerifyToken && config.metaVerifyToken === token) {
        matchedConfig = config;
        break;
      }
    }

    if (!matchedConfig) {
      console.warn('[WhatsApp Meta Webhook] Verification failed — no matching verify token');
      return NextResponse.json(
        { error: 'Invalid verify token' },
        { status: 403 }
      );
    }

    // Verify the challenge
    const verification = verifyMetaWebhookChallenge(
      mode,
      token,
      matchedConfig.metaVerifyToken!,
      challenge
    );

    if (!verification.verified || !verification.challenge) {
      return NextResponse.json(
        { error: 'Webhook verification failed' },
        { status: 403 }
      );
    }

    // Mark webhook as verified
    await db.whatsappConfig.update({
      where: { id: matchedConfig.id },
      data: { metaWebhookVerified: true },
    });

    console.log('[WhatsApp Meta Webhook] Verification successful for user:', matchedConfig.userId);

    // Return the challenge as plain text (Meta requires this)
    return new NextResponse(verification.challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (error) {
    console.error('[WhatsApp Meta Webhook] GET error:', error);
    return NextResponse.json(
      { error: 'Webhook verification error' },
      { status: 500 }
    );
  }
}

/**
 * POST handler — Process Meta webhook events
 * Meta sends POST requests for incoming messages and status updates.
 * We must verify the X-Hub-Signature-256 header and process events.
 * Always return 200 OK to acknowledge receipt.
 */
export async function POST(request: NextRequest) {
  try {
    // Get the raw body for signature verification
    const rawBody = await request.text();
    const signatureHeader = request.headers.get('X-Hub-Signature-256') || '';

    // Parse the JSON payload
    let payload: MetaWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as MetaWebhookPayload;
    } catch {
      console.warn('[WhatsApp Meta Webhook] Invalid JSON payload');
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 200 });
    }

    // Validate it's a WhatsApp webhook
    if (payload.object !== 'whatsapp_business_account') {
      // Not a WhatsApp webhook — acknowledge but skip
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Find the app secret from the user's config.
    // The metaVerifyToken field is repurposed to store the App Secret for
    // webhook signature verification (as documented in the service).
    // We need to find which config this webhook belongs to by looking at
    // the phone_number_id in the entry metadata.
    const phoneNumberId = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    const wabaId = payload.entry?.[0]?.id;

    let appSecret = '';

    if (phoneNumberId) {
      const config = await db.whatsappConfig.findFirst({
        where: {
          provider: 'meta',
          metaPhoneNumberId: phoneNumberId,
        },
        select: { metaVerifyToken: true },
      });
      if (config?.metaVerifyToken) {
        appSecret = config.metaVerifyToken;
      }
    }

    if (!appSecret && wabaId) {
      const config = await db.whatsappConfig.findFirst({
        where: {
          provider: 'meta',
          metaWabaId: wabaId,
        },
        select: { metaVerifyToken: true },
      });
      if (config?.metaVerifyToken) {
        appSecret = config.metaVerifyToken;
      }
    }

    // If we still don't have the app secret, try any Meta config
    if (!appSecret) {
      const config = await db.whatsappConfig.findFirst({
        where: { provider: 'meta', metaVerifyToken: { not: null } },
        select: { metaVerifyToken: true },
      });
      if (config?.metaVerifyToken) {
        appSecret = config.metaVerifyToken;
      }
    }

    // Process the webhook (handles signature verification internally)
    const result = await processMetaWebhook(
      payload,
      rawBody,
      signatureHeader,
      appSecret
    );

    console.log('[WhatsApp Meta Webhook] Processed:', result);

    // Always return 200 OK — Meta requires acknowledgement
    return NextResponse.json({ received: true, ...result }, { status: 200 });
  } catch (error) {
    console.error('[WhatsApp Meta Webhook] POST error:', error);
    // Always return 200 OK to prevent Meta from retrying
    return NextResponse.json({ received: true, error: 'Processing error' }, { status: 200 });
  }
}
