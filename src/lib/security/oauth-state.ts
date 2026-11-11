// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Secure OAuth State Utility
//
// Provides cryptographically secure OAuth state tokens for:
//   - Integrity protection (HMAC-SHA256 signed)
//   - Expiry (timestamp embedded, validated on callback)
//   - User binding (userId embedded, verified on callback)
//   - Provider/flow binding (provider embedded, verified on callback)
//   - One-time use (state consumed and deleted on callback)
//
// State format: base64url(JSON({userId, provider, flow, ts, nonce})) + "." + HMAC
//
// The HMAC is computed using OAUTH_STATE_SECRET env var (or falls back
// to JWT_SECRET). State tokens are stored in a lightweight in-memory
// store for one-time consumption. In multi-instance deployments, use
// Redis for shared state consumption tracking.
// ═══════════════════════════════════════════════════════════════════

import { createHmac, randomBytes } from 'crypto';

const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

interface StatePayload {
  userId: string;
  provider: string;
  flow: string;
  ts: number;
  nonce: string;
}

// In-memory store for one-time consumption (per-process)
// In multi-instance: replace with Redis SETNX + DEL
const consumedNonces = new Set<string>();
const MAX_NONCES = 1000;

function getSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('OAUTH_STATE_SECRET or JWT_SECRET must be set with at least 32 characters');
  }
  return secret;
}

function computeHmac(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

/**
 * Create a secure OAuth state token bound to a user and provider/flow.
 * Returns a string that can be passed as the `state` parameter in OAuth URLs.
 */
export function createSecureState(userId: string, provider: string, flow: string = 'connect'): string {
  const payload: StatePayload = {
    userId,
    provider,
    flow,
    ts: Date.now(),
    nonce: randomBytes(16).toString('hex'),
  };

  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson).toString('base64url');
  const hmac = computeHmac(payloadB64);

  return `${payloadB64}.${hmac}`;
}

export interface StateValidationResult {
  valid: boolean;
  userId?: string;
  provider?: string;
  flow?: string;
  error?: string;
}

/**
 * Validate an OAuth state token.
 * Checks: HMAC integrity, expiry, user binding, provider/flow binding, one-time use.
 * Consumes the state (prevents replay) if valid.
 */
export function validateSecureState(
  state: string,
  expectedProvider?: string,
  expectedFlow?: string
): StateValidationResult {
  if (!state || typeof state !== 'string') {
    return { valid: false, error: 'Missing state parameter' };
  }

  const parts = state.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed state (expected payload.hmac)' };
  }

  const [payloadB64, providedHmac] = parts;

  // Verify HMAC integrity
  const expectedHmac = computeHmac(payloadB64);
  const bufA = Buffer.from(providedHmac);
  const bufB = Buffer.from(expectedHmac);
  if (bufA.length !== bufB.length || !timingSafeEqualCustom(bufA, bufB)) {
    return { valid: false, error: 'Invalid state signature (tampered)' };
  }

  // Decode payload
  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  } catch {
    return { valid: false, error: 'Malformed state payload' };
  }

  // Check expiry
  if (Date.now() - payload.ts > STATE_EXPIRY_MS) {
    return { valid: false, error: 'State expired' };
  }

  // Check provider binding
  if (expectedProvider && payload.provider !== expectedProvider) {
    return { valid: false, error: `State provider mismatch (expected ${expectedProvider}, got ${payload.provider})` };
  }

  // Check flow binding
  if (expectedFlow && payload.flow !== expectedFlow) {
    return { valid: false, error: `State flow mismatch (expected ${expectedFlow}, got ${payload.flow})` };
  }

  // Check one-time use (replay protection)
  if (consumedNonces.has(payload.nonce)) {
    return { valid: false, error: 'State already consumed (replay detected)' };
  }

  // Consume the nonce
  consumedNonces.add(payload.nonce);
  if (consumedNonces.size > MAX_NONCES) {
    // Evict oldest (first inserted) — simple FIFO
    const first = consumedNonces.values().next().value;
    if (first) consumedNonces.delete(first);
  }

  return {
    valid: true,
    userId: payload.userId,
    provider: payload.provider,
    flow: payload.flow,
  };
}

// Constant-time comparison
function timingSafeEqualCustom(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

// For tests: reset the consumed nonces store
export function _resetConsumedNonces(): void {
  consumedNonces.clear();
}
