# AcquisitionOS — Webhook Setup Guide

Complete guide for setting up and securing webhooks for all payment and messaging providers integrated with AcquisitionOS.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Stripe Webhooks](#2-stripe-webhooks)
3. [Razorpay Webhooks](#3-razorpay-webhooks)
4. [Gmail PubSub Push Notifications](#4-gmail-pubsub-push-notifications)
5. [Telegram Webhooks](#5-telegram-webhooks)
6. [WhatsApp Webhooks (Meta/Twilio)](#6-whatsapp-webhooks-metatwilio)
7. [Webhook Security](#7-webhook-security)
8. [Webhook Testing Tools](#8-webhook-testing-tools)

---

## 1. Overview

AcquisitionOS receives webhook events from multiple providers. Each webhook endpoint must:

1. **Verify the signature** — Ensure the event is from the genuine provider
2. **Handle idempotently** — Process each event exactly once
3. **Respond quickly** — Return 200 within the provider's timeout
4. **Log for audit** — Record all webhook events for debugging and compliance

### Webhook Endpoints Summary

| Provider | Endpoint | Method | Signature Header |
|---|---|---|---|
| Stripe | `/api/webhooks/stripe` | POST | `Stripe-Signature` |
| Razorpay | `/api/webhooks/razorpay` | POST | `X-Razorpay-Signature` |
| Gmail | `/api/integrations/gmail/push` | POST | (Pub/Sub token) |
| Telegram | `/api/webhooks/telegram` | POST | `X-Telegram-Bot-Api-Secret-Token` |
| WhatsApp (Meta) | `/api/webhooks/whatsapp` | GET/POST | `X-Hub-Signature-256` |

---

## 2. Stripe Webhooks

### Creating the Webhook Endpoint

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/) → **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Enter endpoint URL: `https://your-domain.com/api/webhooks/stripe`
4. Select events to listen for (see below)
5. Click **Add endpoint**
6. Copy the **Signing secret** (starts with `whsec_...`) — this is your `STRIPE_WEBHOOK_SECRET`

### Required Events to Listen For

| Event | Description | AcquisitionOS Action |
|---|---|---|
| `checkout.session.completed` | Payment checkout succeeded | Confirm payment order, add credits |
| `customer.subscription.created` | New subscription created | Create subscription record |
| `customer.subscription.updated` | Subscription changed | Update plan, credits, entitlements |
| `customer.subscription.deleted` | Subscription cancelled | Downgrade to free plan |
| `invoice.payment_succeeded` | Invoice paid | Record invoice, reset monthly credits |
| `invoice.payment_failed` | Payment failed | Mark subscription as past_due |
| `payment_intent.succeeded` | Payment confirmed | Update payment order status |
| `payment_intent.payment_failed` | Payment failed | Update payment order, notify user |
| `charge.refunded` | Refund issued | Reverse credits, update records |
| `customer.created` | New Stripe customer | Link to user account |

### Signature Verification

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export async function verifyStripeWebhook(
  body: string,
  signature: string
): Promise<Stripe.Event> {
  try {
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
    return event;
  } catch (err) {
    throw new Error(`Stripe webhook signature verification failed: ${err.message}`);
  }
}
```

### Webhook Handler

```typescript
// /api/webhooks/stripe/route.ts
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('Stripe-Signature')!;

  let event: Stripe.Event;
  try {
    event = verifyStripeWebhook(body, signature);
  } catch (err) {
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Process idempotently using event.id
  const existingWebhook = await db.paymentWebhook.findUnique({
    where: { eventId: event.id },
  });

  if (existingWebhook?.processed) {
    return Response.json({ received: true }); // Already processed
  }

  // Store the webhook event
  await db.paymentWebhook.create({
    data: {
      eventId: event.id,
      eventType: event.type,
      provider: 'stripe',
      payload: JSON.stringify(event),
      signature: signature,
    },
  });

  // Process based on event type
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutComplete(event.data.object);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdate(event.data.object);
      break;
    // ... other event types
  }

  return Response.json({ received: true });
}
```

### Testing with Stripe CLI

```bash
# Install Stripe CLI
# https://stripe.com/docs/stripe-cli

# Login to Stripe
stripe login

# Forward webhook events to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Trigger specific test events
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger invoice.payment_failed

# Or trigger all events
stripe trigger --all
```

### Idempotency Handling

Stripe may send the same event multiple times. Your handler must:

1. **Check `eventId`** — Look up in `PaymentWebhook` table
2. **Mark as processing** — Use a database transaction to prevent race conditions
3. **Process the event** — Perform the business logic
4. **Mark as processed** — Update `processed = true` and `processedAt`
5. **Return 200** — Even if already processed, return success

### Replay Tools

Stripe Dashboard allows replaying webhook events:

1. Go to **Developers** → **Webhooks** → [Your Endpoint]
2. Find the event you want to replay
3. Click **Send test webhook** or **Resend**

For programmatic replay:

```bash
# List recent webhook events
stripe events list --limit 10

# Resend a specific event
stripe events resend evt_1234567890
```

---

## 3. Razorpay Webhooks

### Creating the Webhook Endpoint

1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com/) → **Settings** → **Webhooks**
2. Click **Add New Webhook**
3. Enter:
   - Webhook URL: `https://your-domain.com/api/webhooks/razorpay`
   - Webhook Secret: Generate a strong secret — this is your `RAZORPAY_WEBHOOK_SECRET`
4. Select events (see below)
5. Click **Create Webhook**

### Required Events

| Event | Description | AcquisitionOS Action |
|---|---|---|
| `payment.authorized` | Payment authorized (not yet captured) | Update order status |
| `payment.captured` | Payment captured successfully | Confirm order, add credits/plan |
| `payment.failed` | Payment failed | Mark order as failed, notify user |
| `subscription.activated` | Subscription activated | Create subscription record |
| `subscription.charged` | Subscription renewal charged | Reset monthly credits |
| `subscription.cancelled` | Subscription cancelled | Downgrade to free plan |
| `subscription.paused` | Subscription paused | Suspend features |
| `subscription.resumed` | Subscription resumed | Restore features |
| `refund.processed` | Refund completed | Reverse credits |
| `order.paid` | Order paid | Confirm payment order |

### Signature Verification

Razorpay signs webhooks using HMAC-SHA256 with the webhook secret:

```typescript
import crypto from 'crypto';

export function verifyRazorpayWebhook(
  body: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}
```

### Webhook Handler

```typescript
// /api/webhooks/razorpay/route.ts
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('X-Razorpay-Signature')!;

  if (!verifyRazorpayWebhook(body, signature, process.env.RAZORPAY_WEBHOOK_SECRET!)) {
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const payload = JSON.parse(body);
  const event = payload.event;

  // Idempotency check using Razorpay payment/entity ID
  const entityId = payload.payload?.payment?.entity?.id ||
                   payload.payload?.subscription?.entity?.id ||
                   payload.payload?.order?.entity?.id;

  // Store and process...
  switch (event) {
    case 'payment.captured':
      await handlePaymentCaptured(payload.payload.payment.entity);
      break;
    case 'subscription.activated':
      await handleSubscriptionActivated(payload.payload.subscription.entity);
      break;
    // ... other events
  }

  return Response.json({ status: 'ok' });
}
```

### Testing

#### Razorpay Test Mode

1. Switch to **Test Mode** in Razorpay Dashboard
2. Create a test webhook with your local endpoint (use ngrok for local testing)
3. Use Razorpay test card numbers to trigger payment events

#### Test Card Numbers

| Card Number | Result |
|---|---|
| `4111 1111 1111 1111` | Success |
| `4000 0000 0000 0002` | Decline |
| `4000 0000 0000 3220` | 3DS required |

---

## 4. Gmail PubSub Push Notifications

### Setting Up the Push Endpoint

Gmail uses Google Cloud Pub/Sub to deliver push notifications when new emails arrive.

1. Create a Pub/Sub topic and subscription (see [OAuth Setup Guide](./OAUTH_SETUP_GUIDE.md))
2. Configure the push subscription to deliver to your endpoint
3. Set up IAM permissions for Gmail to publish to the topic

### Push Endpoint

```typescript
// /api/integrations/gmail/push/route.ts
export async function POST(request: Request) {
  // Verify the push came from Google Pub/Sub
  const body = await request.json();

  // Pub/Sub push format:
  // {
  //   "message": {
  //     "data": base64EncodedData,
  //     "attributes": {},
  //     "messageId": "123",
  //     "publishTime": "2024-01-01T00:00:00.000Z"
  //   },
  //   "subscription": "projects/.../subscriptions/..."
  // }

  const message = body.message;
  if (!message) {
    return Response.json({ error: 'Invalid push format' }, { status: 400 });
  }

  // Decode the message data
  const data = JSON.parse(
    Buffer.from(message.data, 'base64').toString()
  );

  // Gmail push notification data:
  // {
  //   "emailAddress": "user@gmail.com",
  //   "historyId": "123456"
  // }

  // Process the notification
  await processGmailNotification(data.emailAddress, data.historyId);

  return Response.json({ status: 'ok' });
}
```

### Verifying Push Signature

For production push subscriptions with authentication:

```typescript
import { OAuth2Client } from 'google-auth-library';

const oauth2Client = new OAuth2Client();

export async function verifyPubSubPush(request: Request): Promise<boolean> {
  const bearerToken = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!bearerToken) return false;

  try {
    const ticket = await oauth2Client.verifyIdToken({
      idToken: bearerToken,
      audience: 'your-project-id',
    });
    const payload = ticket.getPayload();
    // Verify the token was issued for your project's service account
    return payload?.email?.endsWith('@your-project-id.iam.gserviceaccount.com') ?? false;
  } catch {
    return false;
  }
}
```

### Handling Notifications

```typescript
async function processGmailNotification(emailAddress: string, historyId: string) {
  // 1. Find the EmailAccount by email
  const emailAccount = await db.emailAccount.findFirst({
    where: { gmailEmail: emailAddress, status: 'active' },
  });

  if (!emailAccount) return;

  // 2. Get the last processed historyId
  const lastHistoryId = emailAccount.lastPollAt?.getTime() ?? 0;

  // 3. Fetch new messages since lastHistoryId using Gmail API
  //    Use the Gmail API history.list() method
  // 4. Process each new message:
  //    - Check if it matches a lead
  //    - Create/update EmailMessage and EmailThread
  //    - Update lead email status
  //    - Trigger any workflow automations
}
```

---

## 5. Telegram Webhooks

### Setting the Bot Webhook

```bash
# Set the webhook URL
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-domain.com/api/webhooks/telegram",
    "secret_token": "your-secret-token-here"
  }'
```

### Verifying Telegram Signature

Telegram sends a `X-Telegram-Bot-Api-Secret-Token` header that matches the `secret_token` you set during webhook registration:

```typescript
export function verifyTelegramWebhook(
  request: Request,
  expectedToken: string
): boolean {
  const secretToken = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!secretToken) return false;

  return crypto.timingSafeEqual(
    Buffer.from(secretToken),
    Buffer.from(expectedToken)
  );
}
```

### Webhook Handler

```typescript
// /api/webhooks/telegram/route.ts
export async function POST(request: Request) {
  const secretToken = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!verifyTelegramWebhook(request, process.env.TELEGRAM_WEBHOOK_SECRET!)) {
    return Response.json({ error: 'Invalid token' }, { status: 401 });
  }

  const update = await request.json();

  // Handle different update types
  if (update.message) {
    await handleTelegramMessage(update.message);
  } else if (update.callback_query) {
    await handleTelegramCallback(update.callback_query);
  } else if (update.my_chat_member) {
    await handleChatMemberUpdate(update.my_chat_member);
  }

  return Response.json({ ok: true });
}
```

### Handling Updates

```typescript
async function handleTelegramMessage(message: any) {
  const chatId = message.chat.id.toString();
  const text = message.text;

  // Find the TelegramConfig by chatId
  const config = await db.telegramConfig.findFirst({
    where: { chatId },
  });

  if (!config) {
    // Unknown chat — send help message
    await sendTelegramMessage(chatId, 
      'Welcome to AcquisitionOS! Please link your account from the Settings page.'
    );
    return;
  }

  // Process commands
  if (text?.startsWith('/start')) {
    await handleStartCommand(config, chatId);
  } else if (text?.startsWith('/help')) {
    await handleHelpCommand(chatId);
  } else {
    // Handle as a lead communication or notification response
    await handleUserMessage(config, message);
  }
}
```

### Testing Telegram Webhooks

```bash
# Get webhook info
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"

# Delete webhook (switch to polling)
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook"

# Send a test message to your bot via Telegram app
# Check your endpoint logs for the incoming update
```

---

## 6. WhatsApp Webhooks (Meta/Twilio)

### Meta WhatsApp Webhooks

#### Verification Handshake

When you first set up a Meta webhook, they send a GET request to verify your endpoint:

```typescript
// /api/webhooks/whatsapp/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  // Verify the token matches your META_WEBHOOK_VERIFY_TOKEN
  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return Response.json({ error: 'Verification failed' }, { status: 403 });
}
```

#### Message Status Webhooks

Meta sends POST requests for message status updates:

```typescript
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('X-Hub-Signature-256');

  // Verify signature
  if (!verifyMetaWebhookSignature(body, signature, process.env.META_APP_SECRET!)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(body);

  // Handle different entry types
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field === 'messages') {
        await handleWhatsAppMessage(change.value);
      } else if (change.field === 'message_status') {
        await handleWhatsAppStatus(change.value);
      }
    }
  }

  return Response.json({ status: 'ok' });
}
```

#### Incoming Message Webhooks

```typescript
async function handleWhatsAppMessage(value: any) {
  for (const message of value.messages || []) {
    const from = message.from; // WhatsApp phone number

    // Find the WhatsappConfig by phone number
    const config = await db.whatsappConfig.findFirst({
      where: { phoneNumber: from },
    });

    if (!config) continue;

    // Create conversation message
    await db.conversationMessage.create({
      data: {
        conversationId: '...', // Find or create conversation
        senderType: 'lead',
        content: message.text?.body || '[Media message]',
        channel: 'whatsapp',
        direction: 'inbound',
        metadata: JSON.stringify(message),
      },
    });
  }
}
```

#### Signature Verification

```typescript
import crypto from 'crypto';

export function verifyMetaWebhookSignature(
  body: string,
  signature: string,
  appSecret: string
): boolean {
  if (!signature) return false;

  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(body)
    .digest('hex');

  const signatureHash = signature.replace('sha256=', '');

  return crypto.timingSafeEqual(
    Buffer.from(signatureHash, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}
```

### Twilio WhatsApp Webhooks

If using Twilio as the WhatsApp provider:

```typescript
// /api/webhooks/twilio-whatsapp/route.ts
import twilio from 'twilio';

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('X-Twilio-Signature')!;
  const url = new URL(request.url).toString();

  // Verify Twilio signature
  const validator = new twilio.webhookValidation.TwilioWebRequestValidator(
    process.env.TWILIO_AUTH_TOKEN!
  );

  const params = Object.fromEntries(new URLSearchParams(body));
  if (!validator.validate(url, params, signature)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Process the message
  const from = params.From;  // 'whatsapp:+1234567890'
  const body_text = params.Body;

  // Handle the message...

  // Return empty TwiML (acknowledge receipt)
  return new Response('<Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  });
}
```

---

## 7. Webhook Security

### Signature Verification (All Providers)

Every webhook handler MUST verify the provider's signature before processing:

```typescript
// Signature verification pattern
function verifyWebhook(
  provider: string,
  body: string,
  headers: Headers
): boolean {
  switch (provider) {
    case 'stripe':
      return verifyStripeSignature(body, headers.get('Stripe-Signature')!);
    case 'razorpay':
      return verifyRazorpaySignature(body, headers.get('X-Razorpay-Signature')!);
    case 'meta':
      return verifyMetaSignature(body, headers.get('X-Hub-Signature-256')!);
    case 'telegram':
      return verifyTelegramToken(headers.get('X-Telegram-Bot-Api-Secret-Token')!);
    default:
      return false;
  }
}
```

### Idempotency

Webhooks may be delivered multiple times. Every handler MUST be idempotent:

```typescript
// Idempotency pattern using PaymentWebhook model
async function processWebhookIdempotently(
  eventId: string,
  provider: string,
  eventType: string,
  payload: string,
  handler: () => Promise<void>
) {
  // Check if already processed
  const existing = await db.paymentWebhook.findUnique({
    where: { eventId },
  });

  if (existing?.processed) {
    return; // Already processed, skip
  }

  // Create or update the webhook record
  const webhook = await db.paymentWebhook.upsert({
    where: { eventId },
    create: {
      eventId,
      provider,
      eventType,
      payload,
      processed: false,
    },
    update: {
      processingError: null,
    },
  });

  try {
    await handler();
    await db.paymentWebhook.update({
      where: { id: webhook.id },
      data: { processed: true, processedAt: new Date() },
    });
  } catch (error) {
    await db.paymentWebhook.update({
      where: { id: webhook.id },
      data: { processingError: error.message },
    });
    throw error;
  }
}
```

### Rate Limiting

Webhook endpoints should have their own rate limiting to prevent abuse:

```typescript
// Webhook-specific rate limits (bypass normal API rate limiting)
const WEBHOOK_RATE_LIMITS = {
  stripe: '100/minute',
  razorpay: '50/minute',
  gmail: '30/minute',
  telegram: '30/minute',
  whatsapp: '30/minute',
};
```

### Error Handling

```typescript
// Webhook error handling pattern
export async function handleWebhook(
  provider: string,
  request: Request
): Promise<Response> {
  try {
    // 1. Read raw body (needed for signature verification)
    const body = await request.text();

    // 2. Verify signature
    if (!verifyWebhook(provider, body, request.headers)) {
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 3. Parse payload
    const payload = JSON.parse(body);

    // 4. Process idempotently
    await processWebhookIdempotently(
      payload.id || payload.event_id,
      provider,
      payload.type || payload.event,
      body,
      async () => {
        // Business logic here
      }
    );

    // 5. Always return 200 quickly
    return Response.json({ received: true });
  } catch (error) {
    // Log the error but still return 200 to prevent retries
    console.error(`Webhook processing error (${provider}):`, error);

    // Return 200 to prevent provider from retrying
    // The error is logged in PaymentWebhook for later processing
    return Response.json({ received: true, error: 'Processing failed' });
  }
}
```

---

## 8. Webhook Testing Tools

### Local Development with ngrok

```bash
# Install ngrok
# https://ngrok.com/download

# Start your local server
bun run dev

# In another terminal, start ngrok
ngrok http 3000

# Use the ngrok URL as your webhook endpoint
# Example: https://abc123.ngrok.io/api/webhooks/stripe
```

### Stripe CLI Testing

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Trigger specific events
stripe trigger payment_intent.succeeded
stripe trigger customer.subscription.created
stripe trigger invoice.payment_failed
```

### Razorpay Webhook Testing

```bash
# Use Razorpay test mode
# Trigger events from Dashboard → Transactions → Test payments

# Or use curl to simulate webhooks
curl -X POST http://localhost:3000/api/webhooks/razorpay \
  -H "Content-Type: application/json" \
  -H "X-Razorpay-Signature: <computed-signature>" \
  -d '{
    "event": "payment.captured",
    "payload": {
      "payment": {
        "entity": {
          "id": "pay_test123",
          "amount": 50000,
          "currency": "INR",
          "status": "captured"
        }
      }
    }
  }'
```

### Telegram Webhook Testing

```bash
# Send a test update via curl
curl -X POST http://localhost:3000/api/webhooks/telegram \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: your-secret-token" \
  -d '{
    "update_id": 123456,
    "message": {
      "message_id": 1,
      "from": {"id": 12345, "first_name": "Test"},
      "chat": {"id": 12345, "type": "private"},
      "text": "/start"
    }
  }'
```

### WhatsApp Webhook Testing

```bash
# Test the verification handshake
curl "http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=your-verify-token&hub.challenge=test-challenge"

# Test incoming message
curl -X POST http://localhost:3000/api/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=<computed-signature>" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "12345",
      "changes": [{
        "field": "messages",
        "value": {
          "messages": [{
            "from": "1234567890",
            "id": "wamid.test",
            "text": {"body": "Hello!"},
            "timestamp": "1234567890",
            "type": "text"
          }]
        }
      }]
    }]
  }'
```

### General Webhook Debugging Tips

1. **Log all incoming webhooks** — Store full request (headers + body) for debugging
2. **Use the PaymentWebhook table** — Track all webhook events and processing status
3. **Monitor failed webhooks** — Set up alerts for `processed = false` records older than 5 minutes
4. **Test signature verification** — Always test with real signatures, not just payloads
5. **Check provider dashboards** — All providers show webhook delivery history and retry status
6. **Use provider CLI tools** — Stripe CLI and similar tools provide the most realistic test events

### Webhook Retry Configuration

| Provider | Max Retries | Retry Interval | Success Criteria |
|---|---|---|---|
| Stripe | Automatic (up to 3 days) | Exponential backoff | HTTP 2xx response |
| Razorpay | Automatic (up to 24 hours) | Exponential backoff | HTTP 2xx response |
| Gmail Pub/Sub | Automatic (configurable) | Exponential backoff | HTTP 200 + valid ack |
| Telegram | Automatic (up to 24 hours) | Exponential backoff | HTTP 200 response |
| Meta WhatsApp | Automatic (up to 7 days) | Exponential backoff | HTTP 200 response |

> **Important**: Always return HTTP 200 quickly, even if processing fails. Queue the event for async processing rather than making the provider wait.
