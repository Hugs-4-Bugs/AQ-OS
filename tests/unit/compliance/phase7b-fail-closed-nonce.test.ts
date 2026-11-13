// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Phase 7B Fail-Closed Nonce Protection Tests
//
// Verifies that validateSecureState fails CLOSED when the durable
// nonce-consumption operation fails. Production code MUST NOT fall back
// to process-local replay protection.
//
// Phase 7B Part 3 Update:
//   Nonce consumption now uses the dedicated OAuthNonceConsumed table
//   with a database-enforced UNIQUE constraint on `nonce`. Tests verify:
//   - P2002 unique constraint violation on `nonce` is treated as replay.
//   - P2002 on an unexpected target fails closed (not treated as replay).
//   - Other Prisma errors fail closed.
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
//   - Prisma P2002 on `nonce` column is handled as replay.
//   - Prisma P2002 on unexpected target fails closed.
//   - Unexpected database errors fail closed.
//
// BLOCKER: Tests that exercise the actual database UNIQUE constraint
// (valid state, replay, concurrent, process restart) require the
// OAuthNonceConsumed table to exist in the test database (test-schema.db).
// The migration has been created but NOT executed. These tests will
// pass once the migration is applied to the test schema under separate
// authorization. Mock-based tests (P2002 handling, DB failure) do not
// require the table and can run once dependencies are installed.
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
    // Cleanup: OAuthNonceConsumed table (Phase 7B Part 3)
    await db.oAuthNonceConsumed.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
    _resetConsumedNonces();
  });

  it('valid state is accepted only after successful durable consumption', async () => {
    const state = createSecureState(user.id, 'google', 'integration');
    const result = await validateSecureState(state, 'google', 'integration');
    expect(result.valid).toBe(true);
    expect(result.userId).toBe(user.id);

    // Verify consumption record exists in OAuthNonceConsumed table (durable)
    const records = await db.oAuthNonceConsumed.findMany({
      where: { userId: user.id },
    });
    expect(records.length).toBeGreaterThan(0);
    expect(records[0].nonce).toBeTruthy();
    expect(records[0].provider).toBe('google');
    expect(records[0].flow).toBe('integration');
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

    // Force db.oAuthNonceConsumed.create to throw (simulating DB unavailability)
    const createSpy = vi.spyOn(db.oAuthNonceConsumed, 'create').mockRejectedValueOnce(
      new Error('Simulated database connection failure')
    );

    const result = await validateSecureState(state, 'google', 'integration');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('State validation unavailable');

    createSpy.mockRestore();

    // CRITICAL: Verify NO consumption record was written (DB was unavailable)
    const records = await db.oAuthNonceConsumed.findMany({
      where: { userId: user.id },
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

    _resetConsumedNonces();

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
    const state = createSecureState(user.id, 'google', 'integration');
    const [payloadB64, hmac] = state.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    payload.ts = Date.now() - 30 * 60 * 1000;
    const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
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
    const state = createSecureState(user.id, 'google', 'integration');

    const createSpy = vi.spyOn(db.oAuthNonceConsumed, 'create').mockRejectedValue(
      new Error('Persistent database failure')
    );

    try {
      const r1 = await validateSecureState(state, 'google', 'integration');
      expect(r1.valid).toBe(false);
      expect(r1.error).toBe('State validation unavailable');

      const r2 = await validateSecureState(state, 'google', 'integration');
      expect(r2.valid).toBe(false);
      expect(r2.error).toBe('State validation unavailable');

      const freshState = createSecureState(user.id, 'google', 'integration');
      const r3 = await validateSecureState(freshState, 'google', 'integration');
      expect(r3.valid).toBe(false);
      expect(r3.error).toBe('State validation unavailable');

      const records = await db.oAuthNonceConsumed.findMany({
        where: { userId: user.id },
      });
      expect(records.length).toBe(0);
    } finally {
      createSpy.mockRestore();
    }
  });
});

// ── P2002 handling tests (mock-based) ───────────────────────────────

describe('Phase 7B Part 3 — P2002 unique constraint handling', () => {
  let user: { id: string };

  beforeEach(async () => {
    _resetConsumedNonces();
    const u = await createTestUser();
    user = { id: u.id };
  });

  afterEach(async () => {
    await db.oAuthNonceConsumed.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
    vi.restoreAllMocks();
    _resetConsumedNonces();
  });

  it('Prisma P2002 on `nonce` column is handled as replay', async () => {
    const { Prisma } = await import('@prisma/client');
    const state = createSecureState(user.id, 'google', 'integration');

    const p2002Error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`nonce`)',
      { code: 'P2002', clientVersion: '6.11.1', meta: { target: ['nonce'] } }
    );
    vi.spyOn(db.oAuthNonceConsumed, 'create').mockRejectedValueOnce(p2002Error);

    const result = await validateSecureState(state, 'google', 'integration');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('replay');
  });

  it('Prisma P2002 on unexpected target fails closed', async () => {
    const { Prisma } = await import('@prisma/client');
    const state = createSecureState(user.id, 'google', 'integration');

    const p2002Error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`userId`)',
      { code: 'P2002', clientVersion: '6.11.1', meta: { target: ['userId'] } }
    );
    vi.spyOn(db.oAuthNonceConsumed, 'create').mockRejectedValueOnce(p2002Error);

    const result = await validateSecureState(state, 'google', 'integration');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('State validation unavailable');
  });

  it('Prisma P2002 without meta.target fails closed', async () => {
    const { Prisma } = await import('@prisma/client');
    const state = createSecureState(user.id, 'google', 'integration');

    const p2002Error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '6.11.1' }
    );
    vi.spyOn(db.oAuthNonceConsumed, 'create').mockRejectedValueOnce(p2002Error);

    const result = await validateSecureState(state, 'google', 'integration');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('State validation unavailable');
  });

  it('unexpected Prisma error (non-P2002) fails closed', async () => {
    const { Prisma } = await import('@prisma/client');
    const state = createSecureState(user.id, 'google', 'integration');

    const fkError = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      { code: 'P2003', clientVersion: '6.11.1' }
    );
    vi.spyOn(db.oAuthNonceConsumed, 'create').mockRejectedValueOnce(fkError);

    const result = await validateSecureState(state, 'google', 'integration');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('State validation unavailable');
  });

  it('non-Prisma error fails closed', async () => {
    const state = createSecureState(user.id, 'google', 'integration');

    vi.spyOn(db.oAuthNonceConsumed, 'create').mockRejectedValueOnce(
      new Error('Network timeout')
    );

    const result = await validateSecureState(state, 'google', 'integration');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('State validation unavailable');
  });
});
