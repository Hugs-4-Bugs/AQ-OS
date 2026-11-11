// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Phase 7B Fail-Closed Nonce Protection Tests
//
// Verifies that validateSecureState fails CLOSED when the durable
// nonce-consumption operation fails. Production code MUST NOT fall back
// to process-local replay protection.
//
// Coverage:
//   - Valid state is accepted only after successful durable consumption.
//   - Replaying a consumed state is rejected.
//   - Database failure rejects validation (fail-closed).
//   - A process restart (simulated via _resetConsumedNonces no-op) does
//     NOT restore the ability to reuse a consumed state.
//   - Two concurrent requests cannot both consume the same nonce.
//   - Tampered, expired, wrong-provider, wrong-flow, malformed states
//     are rejected.
//   - No local-memory fallback can produce a successful validation
//     when the database is unavailable.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/lib/db';
import {
  createSecureState,
  validateSecureState,
  _resetConsumedNonces,
} from '@/lib/security/oauth-state';

async function createTestUser() {
  return db.user.create({
    data: {
      email: `nonce-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      name: 'Nonce Test User',
      passwordHash: '$2a$12$testhash',
      plan: 'free',
      isActive: true,
      emailVerified: true,
    },
  });
}

describe('Phase 7B Fail-Closed Nonce Protection — durable replay protection', () => {
  let user: { id: string };

  beforeEach(async () => {
    _resetConsumedNonces();
    const u = await createTestUser();
    user = { id: u.id };
  });

  afterEach(async () => {
    await db.auditLog.deleteMany({ where: { action: 'oauth_state_consumed' } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
    _resetConsumedNonces();
  });

  it('valid state is accepted only after successful durable consumption', async () => {
    const state = createSecureState(user.id, 'google', 'integration');
    const result = await validateSecureState(state, 'google', 'integration');
    expect(result.valid).toBe(true);
    expect(result.userId).toBe(user.id);

    // Verify consumption record exists in the database (durable)
    const records = await db.auditLog.findMany({
      where: { action: 'oauth_state_consumed', resource: 'oauth_state', userId: user.id },
    });
    expect(records.length).toBeGreaterThan(0);
  });

  it('replaying a consumed state is rejected', async () => {
    const state = createSecureState(user.id, 'google', 'integration');
    const r1 = await validateSecureState(state, 'google', 'integration');
    expect(r1.valid).toBe(true);

    const r2 = await validateSecureState(state, 'google', 'integration');
    expect(r2.valid).toBe(false);
    expect(r2.error).toContain('replay');
  });

  it('database failure rejects validation (fail-closed — no local fallback)', async () => {
    const state = createSecureState(user.id, 'google', 'integration');

    // Force the database $executeRaw to throw by spying on it
    const executeSpy = vi.spyOn(db, '$executeRaw').mockRejectedValueOnce(
      new Error('Simulated database connection failure')
    );

    const result = await validateSecureState(state, 'google', 'integration');
    expect(result.valid).toBe(false);
    // Fail-closed error — must NOT be 'replay' (which would mean DB was consulted)
    // and must NOT be 'valid' (which would mean fail-open)
    expect(result.error).toBe('State validation unavailable');

    executeSpy.mockRestore();

    // CRITICAL: Verify NO consumption record was written (DB was unavailable)
    // and the state was NOT consumed — so a subsequent call with a working DB
    // can still consume it.
    const records = await db.auditLog.findMany({
      where: { action: 'oauth_state_consumed', resource: 'oauth_state', userId: user.id },
    });
    expect(records.length).toBe(0);

    // Now restore the DB and verify the same state can still be consumed
    const resultAfterRecovery = await validateSecureState(state, 'google', 'integration');
    expect(resultAfterRecovery.valid).toBe(true);
  });

  it('process restart (no-op _resetConsumedNonces) does NOT restore reuse of consumed state', async () => {
    const state = createSecureState(user.id, 'google', 'integration');
    const r1 = await validateSecureState(state, 'google', 'integration');
    expect(r1.valid).toBe(true);

    // Simulate process restart — _resetConsumedNonces is now a no-op
    // (production no longer maintains any process-local store).
    _resetConsumedNonces();

    // Replay must still be rejected — durable DB check is the source of truth.
    const r2 = await validateSecureState(state, 'google', 'integration');
    expect(r2.valid).toBe(false);
    expect(r2.error).toContain('replay');
  });

  it('two concurrent requests cannot both consume the same nonce', async () => {
    const state = createSecureState(user.id, 'google', 'integration');
    const [result1, result2] = await Promise.all([
      validateSecureState(state, 'google', 'integration'),
      validateSecureState(state, 'google', 'integration'),
    ]);

    const successCount = [result1, result2].filter((r) => r.valid).length;
    expect(successCount).toBe(1);

    const replayCount = [result1, result2].filter((r) => !r.valid && r.error?.includes('replay')).length;
    expect(replayCount).toBe(1);
  });

  it('tampered state is rejected', async () => {
    const state = createSecureState(user.id, 'google', 'integration');
    const [payload, hmac] = state.split('.');
    const tampered = `${payload.slice(0, -2)}XX.${hmac}`;
    const result = await validateSecureState(tampered, 'google', 'integration');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('tampered');
  });

  it('expired state is rejected', async () => {
    // Create a state with an old timestamp by directly manipulating the payload
    const state = createSecureState(user.id, 'google', 'integration');
    const [payloadB64, hmac] = state.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    // Set timestamp to 30 minutes ago (expiry is 10 minutes)
    payload.ts = Date.now() - 30 * 60 * 1000;
    const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    // Re-sign with the correct HMAC (we have access to the secret via env)
    const crypto = await import('crypto');
    const secret = process.env.OAUTH_STATE_SECRET || process.env.JWT_SECRET || '';
    const newHmac = crypto.createHmac('sha256', secret).update(tamperedPayload).digest('base64url');
    const expiredState = `${tamperedPayload}.${newHmac}`;

    const result = await validateSecureState(expiredState, 'google', 'integration');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired');
  });

  it('wrong-provider state is rejected', async () => {
    const state = createSecureState(user.id, 'google', 'integration');
    const result = await validateSecureState(state, 'facebook', 'integration');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('provider mismatch');
  });

  it('wrong-flow state is rejected', async () => {
    const state = createSecureState(user.id, 'google', 'calendar');
    const result = await validateSecureState(state, 'google', 'integration');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('flow mismatch');
  });

  it('malformed state is rejected', async () => {
    const result = await validateSecureState('not-a-valid-state', 'google', 'integration');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Malformed');
  });

  it('missing state is rejected', async () => {
    const result = await validateSecureState('', 'google', 'integration');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Missing');
  });

  it('no local-memory fallback can produce a successful production validation when DB fails', async () => {
    // This is the CRITICAL fail-closed test: even if we call validateSecureState
    // many times with the same state while the DB is down, NONE of them should
    // ever return valid:true. The old code would have fallen back to a local Set
    // and accepted the first call; the fix must NOT do that.
    const state = createSecureState(user.id, 'google', 'integration');

    // Force DB failure for ALL calls in this test
    const executeSpy = vi.spyOn(db, '$executeRaw').mockRejectedValue(
      new Error('Persistent database failure')
    );

    try {
      // First call — must fail (NOT fall back to local store)
      const r1 = await validateSecureState(state, 'google', 'integration');
      expect(r1.valid).toBe(false);
      expect(r1.error).toBe('State validation unavailable');

      // Second call with same state — must also fail (no local "consumed" tracking)
      const r2 = await validateSecureState(state, 'google', 'integration');
      expect(r2.valid).toBe(false);
      expect(r2.error).toBe('State validation unavailable');

      // Third call with a FRESH state — must also fail (DB is the source of truth)
      const freshState = createSecureState(user.id, 'google', 'integration');
      const r3 = await validateSecureState(freshState, 'google', 'integration');
      expect(r3.valid).toBe(false);
      expect(r3.error).toBe('State validation unavailable');

      // Verify NO consumption records exist (DB was never successfully written)
      const records = await db.auditLog.findMany({
        where: { action: 'oauth_state_consumed', resource: 'oauth_state', userId: user.id },
      });
      expect(records.length).toBe(0);
    } finally {
      executeSpy.mockRestore();
    }
  });
});
