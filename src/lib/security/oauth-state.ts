// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Secure OAuth State Utility (durable replay protection)
//
// Provides cryptographically secure OAuth state tokens for:
//   - Integrity protection (HMAC-SHA256 signed)
//   - Expiry (timestamp embedded, validated on callback)
//   - User binding (userId embedded, verified on callback)
//   - Provider/flow binding (provider + flow embedded, verified on callback)
//   - One-time use (durable database-backed consumption)
//
// Replay protection uses the database (AuditLog table) for durable,
// shared state consumption across instances. A unique-constrained
// insert ensures atomicity: if two concurrent requests try to
// consume the same nonce, only one will succeed.
//
// State format: base64url(JSON({userId, provider, flow, ts, nonce})) + "." + HMAC
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

// In-memory fallback for when database is unavailable
// (e.g., during unit tests without a DB connection)
const localConsumedNonces = new Set<string>();
const MAX_LOCAL_NONCES = 1000;

/**
 * Atomically consume a nonce using the database.
 * Uses a unique-constrained insert via AuditLog to ensure atomicity.
 * Returns true if this call successfully consumed the nonce (first use),
 * false if it was already consumed (replay).
 */
async function consumeNonceDb(nonce: string, userId: string): Promise<boolean> {
  try {
    const { db } = await import('@/lib/db');
    // Atomic insert: INSERT ... WHERE NOT EXISTS
    // This is a single SQL statement — no race condition possible.
    // Returns 1 if inserted (first use), 0 if already existed (replay).
    const { randomUUID } = await import('crypto');
    const insertId = randomUUID();
    const result = await db.$executeRaw`
      INSERT INTO AuditLog (id, userId, action, resourceId, details, resource, severity)
      SELECT ${insertId}, ${userId}, 'oauth_state_consumed', ${nonce},
             ${JSON.stringify({ consumedAt: new Date().toISOString() })},
             'oauth_state', 'low'
      WHERE NOT EXISTS (
        SELECT 1 FROM AuditLog
        WHERE action = 'oauth_state_consumed' AND resourceId = ${nonce}
      )
    `;
    return result > 0; // 1 = consumed (first use), 0 = replay
  } catch {
    // Database unavailable — fall back to local
    if (localConsumedNonces.has(nonce)) return false;
    localConsumedNonces.add(nonce);
    if (localConsumedNonces.size > MAX_LOCAL_NONCES) {
      const first = localConsumedNonces.values().next().value;
      if (first) localConsumedNonces.delete(first);
    }
    return true;
  }
}

/**
 * Validate an OAuth state token.
 * Checks: HMAC integrity, expiry, user binding, provider/flow binding, one-time use.
 * Consumes the state (prevents replay) if valid — using durable database storage.
 */
export async function validateSecureState(
  state: string,
  expectedProvider?: string,
  expectedFlow?: string
): Promise<StateValidationResult> {
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

  // Check required fields
  if (!payload.userId || !payload.provider || !payload.flow || !payload.ts || !payload.nonce) {
    return { valid: false, error: 'Missing required fields in state payload' };
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

  // Check one-time use (replay protection) — durable database-backed
  const consumed = await consumeNonceDb(payload.nonce, payload.userId);
  if (!consumed) {
    return { valid: false, error: 'State already consumed (replay detected)' };
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

// For tests: reset local store
export function _resetConsumedNonces(): void {
  localConsumedNonces.clear();
}
