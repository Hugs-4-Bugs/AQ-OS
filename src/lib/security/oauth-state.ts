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
// shared state consumption across instances. The current AuditLog model
// does NOT have a database-enforced unique constraint on the consumed
// nonce — see Phase 7B Part 3 report for the proposed schema change.
// The INSERT...WHERE NOT EXISTS pattern provides application-level
// replay protection within a single statement, but database-enforced
// uniqueness requires a separate schema authorization.
//
// FAIL-CLOSED BEHAVIOR (Phase 7B Part 2):
//   If the durable nonce-consumption operation fails (database
//   unavailable, connection error, etc.), validation MUST fail closed.
//   We never return valid:true when durable consumption could not be
//   established. There is NO process-local fallback — production OAuth
//   replay protection must be durable and shared across instances.
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

/**
 * Atomically consume a nonce using the database.
 * Uses an INSERT...WHERE NOT EXISTS pattern via AuditLog.
 * Returns true if this call successfully consumed the nonce (first use),
 * false if it was already consumed (replay).
 *
 * FAIL-CLOSED: If the database operation fails (connection error,
 * unavailable, etc.), this function throws. The caller
 * (validateSecureState) catches the throw and returns
 * { valid: false, error: 'State validation unavailable' }.
 * Production code MUST NOT fall back to process-local storage —
 * replay protection must be durable and shared across instances.
 */
async function consumeNonceDb(nonce: string, userId: string): Promise<boolean> {
  const { db } = await import('@/lib/db');
  const { randomUUID } = await import('crypto');
  const insertId = randomUUID();
  // INSERT ... WHERE NOT EXISTS — application-level replay protection.
  // NOTE: This is a single SQL statement, but without a database-enforced
  // unique constraint on (action, resourceId), concurrent requests on
  // different connections COULD both pass the NOT EXISTS check under
  // READ COMMITTED isolation (PostgreSQL) or even with SQLite under
  // specific timing. A unique constraint is required for true
  // database-enforced uniqueness — see Phase 7B Part 3 report.
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
}

/**
 * Validate an OAuth state token.
 * Checks: HMAC integrity, expiry, user binding, provider/flow binding, one-time use.
 * Consumes the state (prevents replay) if valid — using durable database storage.
 *
 * FAIL-CLOSED: If durable nonce consumption cannot be established (database
 * error), validation fails closed with a safe error message. We NEVER return
 * valid:true when durable consumption could not be verified. There is no
 * process-local fallback — production replay protection must be durable.
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

  // Check one-time use (replay protection) — durable database-backed.
  // FAIL-CLOSED: if the database operation throws, we reject the state
  // rather than silently falling back to process-local storage.
  let consumed: boolean;
  try {
    consumed = await consumeNonceDb(payload.nonce, payload.userId);
  } catch (error) {
    // Durable nonce consumption could not be established.
    // Fail closed — do NOT fall back to process-local replay protection.
    // Log a safe (non-sensitive) message; do not expose DB internals.
    console.error(
      '[OAuth State] Durable nonce consumption failed — rejecting state (fail-closed):',
      error instanceof Error ? error.message : 'unknown error'
    );
    return { valid: false, error: 'State validation unavailable' };
  }
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

/**
 * Test helper — kept as a no-op for backward compatibility with existing
 * test suites that call it. Production code no longer maintains any
 * process-local nonce store; replay protection is exclusively durable
 * (database-backed). Clearing the local store is therefore a no-op.
 */
export function _resetConsumedNonces(): void {
  // No-op — durable DB-only replay protection. There is no local store.
}
