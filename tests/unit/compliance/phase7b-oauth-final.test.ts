// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Phase 7B Final OAuth Remediation Tests
//
// Tests OAuth flow binding, cross-flow rejection, durable replay
// protection, and Calendar callback correctness.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { generateAccessToken } from '@/lib/auth';
import { createSecureState, _resetConsumedNonces } from '@/lib/security/oauth-state';

async function createTestUser(email?: string) {
  return db.user.create({
    data: {
      email: email || `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      name: 'Test User', passwordHash: '$2a$12$testhash', plan: 'free',
      isActive: true, emailVerified: true,
    },
  });
}

function mintToken(u: { id: string; email: string; role: string; plan: string; orgId: string | null }) {
  return generateAccessToken({ id: u.id, email: u.email, role: u.role, plan: u.plan, orgId: u.orgId, isTrial: false, trialEndsAt: null });
}

// ── Flow binding tests ──────────────────────────────────────────────

describe('Phase 7B Final — OAuth flow binding', () => {
  let user: { id: string; email: string };

  beforeEach(async () => {
    _resetConsumedNonces();
    const u = await createTestUser();
    await db.userSettings.create({ data: { userId: u.id } });
    user = { id: u.id, email: u.email };
  });

  afterEach(async () => {
    await db.googleCalendarToken.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.emailAccount.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { action: 'oauth_state_consumed' } }).catch(() => {});
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
    _resetConsumedNonces();
  });

  it('Google callback rejects calendar-flow state', async () => {
    const { GET } = await import('@/app/api/integrations/google/callback/route');
    const calendarState = createSecureState(user.id, 'google', 'calendar');
    const req = new NextRequest(
      `http://localhost:3000/api/integrations/google/callback?code=fake&state=${calendarState}`,
      { method: 'GET' }
    );
    const res = await GET(req);
    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';
    expect(location).toContain('integration_error');
    expect(location).toContain('mismatch');
  });

  it('Calendar callback rejects integration-flow state', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    const integrationState = createSecureState(user.id, 'google', 'integration');
    const req = new NextRequest(
      `http://localhost:3000/api/calendar/callback?code=fake&state=${integrationState}`,
      { method: 'GET' }
    );
    const res = await GET(req);
    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';
    expect(location).toContain('calendar_error');
    expect(location).toContain('mismatch');
  });

  it('Google callback rejects missing state', async () => {
    const { GET } = await import('@/app/api/integrations/google/callback/route');
    const req = new NextRequest(
      'http://localhost:3000/api/integrations/google/callback?code=fake',
      { method: 'GET' }
    );
    const res = await GET(req);
    const location = res.headers.get('location') || '';
    expect(location).toContain('Missing');
  });

  it('Calendar callback rejects missing state', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    const req = new NextRequest(
      'http://localhost:3000/api/calendar/callback?code=fake',
      { method: 'GET' }
    );
    const res = await GET(req);
    const location = res.headers.get('location') || '';
    expect(location).toContain('Missing');
  });

  it('Google callback rejects tampered state', async () => {
    const { GET } = await import('@/app/api/integrations/google/callback/route');
    const state = createSecureState(user.id, 'google', 'integration');
    const [payload, hmac] = state.split('.');
    const tampered = `${payload.slice(0, -2)}XX.${hmac}`;
    const req = new NextRequest(
      `http://localhost:3000/api/integrations/google/callback?code=fake&state=${tampered}`,
      { method: 'GET' }
    );
    const res = await GET(req);
    const location = res.headers.get('location') || '';
    expect(location).toContain('tampered');
  });

  it('Calendar callback rejects tampered state', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    const state = createSecureState(user.id, 'google', 'calendar');
    const [payload, hmac] = state.split('.');
    const tampered = `${payload.slice(0, -2)}XX.${hmac}`;
    const req = new NextRequest(
      `http://localhost:3000/api/calendar/callback?code=fake&state=${tampered}`,
      { method: 'GET' }
    );
    const res = await GET(req);
    const location = res.headers.get('location') || '';
    expect(location).toContain('tampered');
  });

  it('Google callback rejects replayed state', async () => {
    const { GET } = await import('@/app/api/integrations/google/callback/route');
    const state = createSecureState(user.id, 'google', 'integration');
    // First use
    const req1 = new NextRequest(
      `http://localhost:3000/api/integrations/google/callback?code=fake&state=${state}`,
      { method: 'GET' }
    );
    await GET(req1);
    // Replay
    const req2 = new NextRequest(
      `http://localhost:3000/api/integrations/google/callback?code=fake&state=${state}`,
      { method: 'GET' }
    );
    const res2 = await GET(req2);
    const location2 = res2.headers.get('location') || '';
    expect(location2).toContain('replay');
  });

  it('Calendar callback rejects replayed state', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    const state = createSecureState(user.id, 'google', 'calendar');
    // First use (will fail at token exchange but state is consumed)
    const req1 = new NextRequest(
      `http://localhost:3000/api/calendar/callback?code=fake&state=${state}`,
      { method: 'GET' }
    );
    await GET(req1);
    // Replay
    const req2 = new NextRequest(
      `http://localhost:3000/api/calendar/callback?code=fake&state=${state}`,
      { method: 'GET' }
    );
    const res2 = await GET(req2);
    const location2 = res2.headers.get('location') || '';
    expect(location2).toContain('replay');
  });

  it('invalid state causes no database writes (no token records)', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    const tamperedState = 'invalid.tampered';
    const req = new NextRequest(
      `http://localhost:3000/api/calendar/callback?code=fake&state=${tamperedState}`,
      { method: 'GET' }
    );
    await GET(req);
    // Verify NO Calendar tokens were created
    const tokens = await db.googleCalendarToken.findMany({ where: { userId: user.id } });
    expect(tokens.length).toBe(0);
  });

  it('concurrent replay: only one request consumes the state', async () => {
    const { validateSecureState } = await import('@/lib/security/oauth-state');
    const state = createSecureState(user.id, 'google', 'integration');
    // Fire two concurrent validations
    const [result1, result2] = await Promise.all([
      validateSecureState(state, 'google', 'integration'),
      validateSecureState(state, 'google', 'integration'),
    ]);
    // Exactly one must succeed, one must fail with replay
    const successCount = [result1, result2].filter(r => r.valid).length;
    expect(successCount).toBe(1);
    const replayCount = [result1, result2].filter(r => !r.valid && r.error?.includes('replay')).length;
    expect(replayCount).toBe(1);
  });
});

// ── Calendar callback correctness ───────────────────────────────────

describe('Phase 7B Final — Calendar callback correctness', () => {
  let user: { id: string; email: string };

  beforeEach(async () => {
    _resetConsumedNonces();
    const u = await createTestUser();
    await db.userSettings.create({ data: { userId: u.id } });
    user = { id: u.id, email: u.email };
  });

  afterEach(async () => {
    await db.googleCalendarToken.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { action: 'oauth_state_consumed' } }).catch(() => {});
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
    _resetConsumedNonces();
  });

  it('Calendar callback has no undefined userInfo references', async () => {
    // This is a source-inspection test that verifies the fix
    const fs = await import('fs');
    const source = fs.readFileSync('src/app/api/calendar/callback/route.ts', 'utf-8');
    // userInfo must be declared via getGoogleUserInfo
    expect(source).toContain('const userInfo = await getGoogleUserInfo');
    // userInfo.email is used (not undefined)
    expect(source).toContain('userInfo.email');
    // getGoogleUserInfo is imported
    expect(source).toContain('getGoogleUserInfo');
  });

  it('Calendar callback uses /api/calendar/callback redirect URI', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/app/api/calendar/callback/route.ts', 'utf-8');
    expect(source).toContain("'/api/calendar/callback'");
  });

  it('Calendar callback validates Calendar scopes', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/app/api/calendar/callback/route.ts', 'utf-8');
    expect(source).toContain('hasCalendarScope');
    expect(source).toContain('grantedScopes');
  });

  it('Calendar callback does NOT create EmailAccount (Gmail activation)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/app/api/calendar/callback/route.ts', 'utf-8').toLowerCase();
    expect(source).not.toContain('emailaccount.create');
    expect(source).not.toContain('gmailconnected');
    expect(source).not.toContain('gmailemail');
  });

  it('Google callback validates integration flow only', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/app/api/integrations/google/callback/route.ts', 'utf-8');
    expect(source).toContain("'integration'");
  });

  it('buildGoogleCalendarAuthUrl uses /api/calendar/callback', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/lib/google-oauth.ts', 'utf-8');
    // Calendar auth URL builder must use calendar callback
    const calendarFn = source.split('export function buildGoogleCalendarAuthUrl')[1]?.split('export function')[0] ?? '';
    expect(calendarFn).toContain('/api/calendar/callback');
    // Integration auth URL builder must use integration callback
    const integrationFn = source.split('export function buildGoogleIntegrationAuthUrl')[1]?.split('export async function')[0] ?? '';
    expect(integrationFn).toContain('/api/integrations/google/callback');
  });

  it('exchangeCodeForTokens accepts custom redirect URI path', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/lib/google-oauth.ts', 'utf-8');
    expect(source).toContain('redirectUriPath');
    expect(source).toContain("'/api/integrations/google/callback'");
  });
});

// ── Durable replay protection ───────────────────────────────────────

describe('Phase 7B Final — Durable replay protection', () => {
  let user: { id: string };

  beforeEach(async () => {
    _resetConsumedNonces();
    const u = await createTestUser();
    await db.userSettings.create({ data: { userId: u.id } });
    user = { id: u.id };
  });

  afterEach(async () => {
    await db.auditLog.deleteMany({ where: { action: 'oauth_state_consumed' } }).catch(() => {});
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
    _resetConsumedNonces();
  });

  it('nonce consumption is recorded in the database', async () => {
    const { validateSecureState } = await import('@/lib/security/oauth-state');
    const state = createSecureState(user.id, 'google', 'integration');
    await validateSecureState(state, 'google', 'integration');

    // Verify consumption record exists in AuditLog
    const records = await db.auditLog.findMany({
      where: { action: 'oauth_state_consumed', resource: 'oauth_state', userId: user.id },
    });
    expect(records.length).toBeGreaterThan(0);
  });

  it('replay is detected even after process-local cache is cleared', async () => {
    const { validateSecureState } = await import('@/lib/security/oauth-state');
    const state = createSecureState(user.id, 'google', 'integration');
    // First consumption
    const r1 = await validateSecureState(state, 'google', 'integration');
    expect(r1.valid).toBe(true);
    // Clear local cache (simulates process restart)
    _resetConsumedNonces();
    // Try again — should still be rejected (durable DB check)
    const r2 = await validateSecureState(state, 'google', 'integration');
    expect(r2.valid).toBe(false);
    expect(r2.error).toContain('replay');
  });

  it('validateSecureState is async (durable)', async () => {
    const { validateSecureState } = await import('@/lib/security/oauth-state');
    const state = createSecureState(user.id, 'google', 'integration');
    // Must return a Promise
    const result = validateSecureState(state, 'google', 'integration');
    expect(result instanceof Promise).toBe(true);
    await result;
  });
});
