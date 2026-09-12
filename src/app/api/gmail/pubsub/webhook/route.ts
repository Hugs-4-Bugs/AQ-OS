// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/gmail/pubsub/webhook
// Phase 9: Gmail Integration — Google PubSub Push Webhook
// NO withAuth — Google calls this endpoint
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { handlePubSubMessage, verifyPubSubToken } from '@/lib/gmail-pubsub-service';

interface PubSubPushMessage {
  message: {
    data: string;
    messageId: string;
    publishTime: string;
    attributes?: Record<string, string>;
  };
  subscription: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as PubSubPushMessage;

    // Handle subscription verification (Google sends this when setting up push subscription)
    // The verification is done via a GET request with a challenge parameter
    // But we also accept the token in the message attributes for added security
    if (body.message?.attributes?.token) {
      const isValid = verifyPubSubToken(body.message.attributes.token);
      if (!isValid) {
        console.warn('[Gmail PubSub Webhook] Invalid verification token');
        // Still return 200 to avoid Google retrying
        return NextResponse.json({ error: 'Invalid token' }, { status: 200 });
      }
    }

    // Decode and process the PubSub message
    if (!body.message?.data) {
      console.warn('[Gmail PubSub Webhook] No message data');
      return NextResponse.json({ error: 'No message data' }, { status: 200 });
    }

    // Process the message asynchronously (don't block the response)
    // Return 200 immediately to acknowledge receipt
    handlePubSubMessage(body.message.data).catch(err => {
      console.error('[Gmail PubSub Webhook] Error processing message:', err);
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Gmail PubSub Webhook] Error:', error);
    // Always return 200 to prevent Google from retrying
    return NextResponse.json({ error: 'Webhook processing error' }, { status: 200 });
  }
}

/**
 * Handle subscription verification from Google.
 * Google sends a GET request with a challenge parameter when setting up
 * a push subscription. We must respond with the challenge to verify ownership.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get('hub.challenge');
  const verifyToken = searchParams.get('hub.verify_token');
  const mode = searchParams.get('hub.mode');

  if (mode === 'subscribe' && challenge) {
    // Verify the token if provided
    if (verifyToken && !verifyPubSubToken(verifyToken)) {
      console.warn('[Gmail PubSub Webhook] Subscription verification with invalid token');
      return NextResponse.json({ error: 'Invalid verify token' }, { status: 403 });
    }

    console.log('[Gmail PubSub Webhook] Subscription verified');
    // Return the challenge to confirm subscription
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json({ status: 'ok' });
}
