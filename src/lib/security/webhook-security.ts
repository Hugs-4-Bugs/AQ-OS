// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Webhook Security
// Phase 14.3: Security Hardening
//
// HMAC signature verification for Stripe, Razorpay, Telegram,
// Meta, and Twilio webhooks. Constant-time comparison, timestamp
// tolerance, and per-provider middleware.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// ===== TYPES =====

export type WebhookProvider = 'stripe' | 'razorpay' | 'telegram' | 'meta' | 'twilio';

interface WebhookConfig {
  /** Environment variable name containing the webhook secret */
  secretEnvVar: string;
  /** Header containing the signature */
  signatureHeader: string;
  /** Signature verification function */
  verify: (payload: string, signature: string, secret: string) => boolean;
  /** Timestamp tolerance in seconds (0 = no tolerance check) */
  timestampTolerance: number;
}

// ===== PROVIDER CONFIGURATIONS =====

const PROVIDER_CONFIGS: Record<WebhookProvider, WebhookConfig> = {
  stripe: {
    secretEnvVar: 'STRIPE_WEBHOOK_SECRET',
    signatureHeader: 'stripe-signature',
    verify: verifyStripeSignature,
    timestampTolerance: 300, // 5 minutes
  },
  razorpay: {
    secretEnvVar: 'RAZORPAY_WEBHOOK_SECRET',
    signatureHeader: 'x-razorpay-signature',
    verify: verifyRazorpaySignature,
    timestampTolerance: 300,
  },
  telegram: {
    secretEnvVar: 'TELEGRAM_BOT_TOKEN',
    signatureHeader: 'x-telegram-bot-api-secret-token',
    verify: verifyTelegramSignature,
    timestampTolerance: 0,
  },
  meta: {
    secretEnvVar: 'META_APP_SECRET',
    signatureHeader: 'x-hub-signature-256',
    verify: verifyMetaSignature,
    timestampTolerance: 0,
  },
  twilio: {
    secretEnvVar: 'TWILIO_AUTH_TOKEN',
    signatureHeader: 'x-twilio-signature',
    verify: verifyTwilioSignature,
    timestampTolerance: 0,
  },
};

// ===== SIGNATURE VERIFICATION FUNCTIONS =====

/**
 * Verify Stripe webhook signature.
 * Stripe uses a timestamp-based signature scheme:
 * t=<timestamp>,v1=<signature>
 */
function verifyStripeSignature(payload: string, signature: string, secret: string): boolean {
  try {
    const elements = signature.split(',');
    let timestamp = '';
    let v1Signature = '';

    for (const element of elements) {
      const [key, value] = element.split('=');
      if (key === 't') timestamp = value;
      if (key === 'v1') v1Signature = value;
    }

    if (!timestamp || !v1Signature) return false;

    // Check timestamp tolerance
    const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
    if (timestampAge > 300) return false; // 5 minute tolerance

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    return timingSafeCompare(expectedSignature, v1Signature);
  } catch {
    return false;
  }
}

/**
 * Verify Razorpay webhook signature.
 * Razorpay uses HMAC-SHA256 of the raw body.
 */
function verifyRazorpaySignature(payload: string, signature: string, secret: string): boolean {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return timingSafeCompare(expectedSignature, signature);
  } catch {
    return false;
  }
}

/**
 * Verify Telegram webhook signature.
 * Telegram sends a secret token in a header.
 */
function verifyTelegramSignature(_payload: string, signature: string, secret: string): boolean {
  try {
    // Telegram uses a simple secret token comparison
    return timingSafeCompare(signature, secret);
  } catch {
    return false;
  }
}

/**
 * Verify Meta (Facebook) webhook signature.
 * Meta uses HMAC-SHA256 with the app secret.
 */
function verifyMetaSignature(payload: string, signature: string, secret: string): boolean {
  try {
    // Meta sends: sha256=<hex>
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Remove 'sha256=' prefix if present
    const cleanSignature = signature.startsWith('sha256=')
      ? signature.slice(7)
      : signature;

    return timingSafeCompare(expectedSignature, cleanSignature);
  } catch {
    return false;
  }
}

/**
 * Verify Twilio webhook signature.
 * Twilio signs the URL + parameters with the auth token.
 */
function verifyTwilioSignature(payload: string, signature: string, secret: string): boolean {
  try {
    // Twilio signature is HMAC-SHA1 of URL + sorted parameters
    const expectedSignature = crypto
      .createHmac('sha1', secret)
      .update(payload)
      .digest('base64');

    return timingSafeCompare(expectedSignature, signature);
  } catch {
    return false;
  }
}

// ===== CONSTANT-TIME COMPARISON =====

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  // If lengths differ, still compare to avoid leaking length info
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');

  if (bufA.length !== bufB.length) {
    // Compare bufB with itself to consume the same time, then return false
    crypto.timingSafeEqual(bufB, bufB);
    return false;
  }

  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

// ===== WEBHOOK VERIFICATION =====

export interface WebhookVerificationResult {
  verified: boolean;
  error?: string;
  provider: WebhookProvider;
}

/**
 * Verify a webhook request's signature.
 */
export function verifyWebhook(
  request: NextRequest,
  provider: WebhookProvider,
  rawBody?: string
): WebhookVerificationResult {
  const config = PROVIDER_CONFIGS[provider];

  if (!config) {
    return { verified: false, error: `Unknown webhook provider: ${provider}`, provider };
  }

  // Get the secret from environment
  const secret = process.env[config.secretEnvVar];
  if (!secret) {
    return {
      verified: false,
      error: `Webhook secret not configured: ${config.secretEnvVar}`,
      provider,
    };
  }

  // Get the signature header
  const signature = request.headers.get(config.signatureHeader);
  if (!signature) {
    return {
      verified: false,
      error: `Missing signature header: ${config.signatureHeader}`,
      provider,
    };
  }

  // Verify the signature
  // Use provided raw body or fall back to empty string (caller should provide raw body)
  const payload = rawBody || '';
  if (!payload) {
    return {
      verified: false,
      error: 'No payload provided for signature verification',
      provider,
    };
  }

  const isValid = config.verify(payload, signature, secret);

  if (!isValid) {
    return {
      verified: false,
      error: 'Invalid webhook signature',
      provider,
    };
  }

  // Check timestamp tolerance
  if (config.timestampTolerance > 0 && provider === 'stripe') {
    const elements = signature.split(',');
    let timestamp = '';
    for (const element of elements) {
      const [key, value] = element.split('=');
      if (key === 't') timestamp = value;
    }
    if (timestamp) {
      const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
      if (age > config.timestampTolerance) {
        return {
          verified: false,
          error: `Webhook timestamp too old: ${age}s (tolerance: ${config.timestampTolerance}s)`,
          provider,
        };
      }
    }
  }

  return { verified: true, provider };
}

// ===== WEBHOOK MIDDLEWARE =====

/**
 * Webhook verification middleware for API routes.
 *
 * Usage:
 *   export async function POST(request: NextRequest) {
 *     const rawBody = await request.text();
 *     const verification = withWebhookVerification(request, 'stripe', rawBody);
 *     if (verification.error) return verification.error;
 *     const data = JSON.parse(rawBody);
 *     // ... process webhook
 *   }
 */
export function withWebhookVerification(
  request: NextRequest,
  provider: WebhookProvider,
  rawBody?: string
): { error: NextResponse | null; result: WebhookVerificationResult } {
  const result = verifyWebhook(request, provider, rawBody);

  if (!result.verified) {
    return {
      error: NextResponse.json(
        {
          error: 'Webhook verification failed',
          message: result.error,
          provider: result.provider,
        },
        { status: 401 }
      ),
      result,
    };
  }

  return { error: null, result };
}

/**
 * Get the raw body from a request for signature verification.
 * Must be called before any .json() calls on the request.
 */
export async function getRawBody(request: NextRequest): Promise<string> {
  return request.text();
}
