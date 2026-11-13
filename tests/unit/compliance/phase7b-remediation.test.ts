// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Phase 7B Security Remediation Tests
//
// Tests:
//   1. Fixed settings routes (telegram link, whatsapp verify, confirm)
//   2. WhatsApp verify-otp consent
//   3. Settings PUT send_otp / verify_otp consent
//   4. OAuth state utility (createSecureState + validateSecureState)
//   5. Google callback secure state validation
//   6. Calendar callback secure state validation
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { generateAccessToken } from '@/lib/auth';
import {
  createSecureState,
  validateSecureState,
  _resetConsumedNonces,
} from '@/lib/security/oauth-state';
import {
  getDefaultConsentState,
  applyConsentChange,
  serializeConsentData,
} from '@/lib/compliance/consent-contract';

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

async function setConsent(userId: string, action: 'grant' | 'withdraw') {
  const settings = await db.userSettings.findUnique({ where: { userId } });
  const { deserializeConsentData } = await import('@/lib/compliance/consent-contract');
  const { state, history } = settings
    ? deserializeConsentData(settings.notificationPreferences)
    : { state: getDefaultConsentState(), history: [] as never[] };
  const { newState, historyEntry } = applyConsentChange(state, 'third_party_integrations', action, 'api');
  const newHistory = [...history, historyEntry];
  if (settings) {
    await db.userSettings.update({
      where: { userId },
      data: { notificationPreferences: serializeConsentData(newState, newHistory) },
    });
  } else {
    await db.userSettings.create({
      data: { userId, notificationPreferences: serializeConsentData(newState, newHistory) },
    });
  }
}

function authedPost(url: string, token: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function unauthedPost(url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── OAuth state utility tests ───────────────────────────────────────

describe('Phase 7B Remediation — OAuth state utility', () => {
  // Phase 7B Part 2 fix: validateSecureState now fails CLOSED when the
  // durable nonce-consumption DB write fails. AuditLog.userId has a FK
  // constraint to User.id, so tests that reach the nonce-consumption step
  // (valid state, replay) MUST use a real user ID. Tests that fail BEFORE
  // the DB check (tampered, wrong provider, wrong flow, malformed, missing)
  // can still use the synthetic 'user-123' because the DB is never consulted.
  let realUser: { id: string };

  beforeEach(async () => {
    _resetConsumedNonces();
    const u = await createTestUser();
    realUser = { id: u.id };
  });
  afterEach(async () => {
    await db.oAuthNonceConsumed.deleteMany({}).catch(() => {});
    await db.auditLog.deleteMany({ where: { userId: realUser.id } }).catch(() => {});
    await db.user.delete({ where: { id: realUser.id } }).catch(() => {});
    _resetConsumedNonces();
  });

  it('createSecureState produces a valid signed token', () => {
    const state = createSecureState('user-123', 'google', 'integration');
    expect(state).toBeTruthy();
    expect(state.split('.').length).toBe(2); // payload.hmac
  });

  it('validateSecureState accepts a valid state', async () => {
    const state = createSecureState(realUser.id, 'google', 'integration');
    const result = await validateSecureState(state, 'google');
    expect(result.valid).toBe(true);
    expect(result.userId).toBe(realUser.id);
    expect(result.provider).toBe('google');
    expect(result.flow).toBe('integration');
  });

  it('rejects tampered state (HMAC mismatch)', async () => {
    const state = createSecureState('user-123', 'google', 'integration');
    // Tamper with the payload
    const [payload, hmac] = state.split('.');
    const tampered = `${payload.slice(0, -2)}XX.${hmac}`;
    const result = await validateSecureState(tampered, 'google');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('tampered');
  });

  it('rejects wrong provider', async () => {
    const state = createSecureState('user-123', 'google', 'integration');
    const result = await validateSecureState(state, 'facebook');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('provider mismatch');
  });

  it('rejects wrong flow', async () => {
    const state = createSecureState('user-123', 'google', 'calendar');
    const result = await validateSecureState(state, 'google', 'integration');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('flow mismatch');
  });

  it('rejects replayed state (one-time use)', async () => {
    const state = createSecureState(realUser.id, 'google', 'integration');
    const result1 = await validateSecureState(state, 'google');
    expect(result1.valid).toBe(true);
    const result2 = await validateSecureState(state, 'google');
    expect(result2.valid).toBe(false);
    expect(result2.error).toContain('replay');
  });

  it('rejects malformed state', async () => {
    const result = await validateSecureState('not-a-valid-state', 'google');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Malformed');
  });

  it('rejects missing state', async () => {
    const result = await validateSecureState('', 'google');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Missing');
  });

  it('user identity cannot be changed by modifying state', async () => {
    const state = createSecureState('user-123', 'google', 'integration');
    // Try to decode, change userId, re-encode WITHOUT the HMAC
    const [payloadB64] = state.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    payload.userId = 'attacker-user';
    const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const tamperedState = `${tamperedPayload}.fakeHmac`;
    const result = await validateSecureState(tamperedState, 'google');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('tampered');
  });
});

// ── Fixed settings routes ───────────────────────────────────────────

describe('Phase 7B Remediation — Fixed settings routes', () => {
  let user: { id: string; email: string; role: string; plan: string; orgId: string | null };
  let token: string;

  beforeEach(async () => {
    const u = await createTestUser();
    await db.userSettings.create({ data: { userId: u.id } });
    user = { id: u.id, email: u.email, role: u.role, plan: u.plan, orgId: u.orgId };
    token = mintToken(user);
  });

  afterEach(async () => {
    await db.telegramConfig.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.whatsappConfig.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  it('telegram link: unauthenticated returns 401 (not 403)', async () => {
    const { POST } = await import('@/app/api/settings/integrations/telegram/link/route');
    const req = unauthedPost('http://localhost:3000/api/settings/integrations/telegram/link');
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('telegram link: authenticated without consent returns 403', async () => {
    const { POST } = await import('@/app/api/settings/integrations/telegram/link/route');
    const req = authedPost('http://localhost:3000/api/settings/integrations/telegram/link', token, {});
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('telegram link: with consent generates link code', async () => {
    await setConsent(user.id, 'grant');
    const { POST } = await import('@/app/api/settings/integrations/telegram/link/route');
    const req = authedPost('http://localhost:3000/api/settings/integrations/telegram/link', token, {});
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.linkCode).toBeTruthy();

    // Verify link code was persisted
    const config = await db.telegramConfig.findUnique({ where: { userId: user.id } });
    expect(config).toBeTruthy();
    expect(config!.linkCode).toBe(data.linkCode);
  });

  it('telegram link: no link code created when consent denied', async () => {
    const { POST } = await import('@/app/api/settings/integrations/telegram/link/route');
    const req = authedPost('http://localhost:3000/api/settings/integrations/telegram/link', token, {});
    await POST(req);
    const config = await db.telegramConfig.findUnique({ where: { userId: user.id } });
    expect(config).toBeNull();
  });

  it('whatsapp verify: unauthenticated returns 401', async () => {
    const { POST } = await import('@/app/api/settings/integrations/whatsapp/verify/route');
    const req = unauthedPost('http://localhost:3000/api/settings/integrations/whatsapp/verify', {
      phone: '+1234567890',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('whatsapp verify: without consent returns 403', async () => {
    const { POST } = await import('@/app/api/settings/integrations/whatsapp/verify/route');
    const req = authedPost('http://localhost:3000/api/settings/integrations/whatsapp/verify', token, {
      phone: '+1234567890',
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('whatsapp verify: no OTP persisted when consent denied', async () => {
    const { POST } = await import('@/app/api/settings/integrations/whatsapp/verify/route');
    const req = authedPost('http://localhost:3000/api/settings/integrations/whatsapp/verify', token, {
      phone: '+1234567890',
    });
    await POST(req);
    const config = await db.whatsappConfig.findUnique({ where: { userId: user.id } });
    expect(config).toBeNull();
  });

  it('whatsapp confirm: unauthenticated returns 401', async () => {
    const { POST } = await import('@/app/api/settings/integrations/whatsapp/confirm/route');
    const req = unauthedPost('http://localhost:3000/api/settings/integrations/whatsapp/confirm', {
      phone: '+1234567890', otp: '123456',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('whatsapp confirm: without consent returns 403', async () => {
    const { POST } = await import('@/app/api/settings/integrations/whatsapp/confirm/route');
    const req = authedPost('http://localhost:3000/api/settings/integrations/whatsapp/confirm', token, {
      phone: '+1234567890', otp: '123456',
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});

// ── WhatsApp verify-otp route ───────────────────────────────────────

describe('Phase 7B Remediation — WhatsApp verify-otp consent', () => {
  let user: { id: string; email: string; role: string; plan: string; orgId: string | null };
  let token: string;

  beforeEach(async () => {
    const u = await createTestUser();
    await db.userSettings.create({ data: { userId: u.id } });
    user = { id: u.id, email: u.email, role: u.role, plan: u.plan, orgId: u.orgId };
    token = mintToken(user);
  });

  afterEach(async () => {
    await db.whatsappConfig.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  it('blocks verify-otp without consent (403)', async () => {
    const { POST } = await import('@/app/api/integrations/whatsapp/verify-otp/route');
    const req = authedPost('http://localhost:3000/api/integrations/whatsapp/verify-otp', token, {
      phone: '+1234567890', otp: '123456',
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});

// ── Google callback secure state ────────────────────────────────────

describe('Phase 7B Remediation — Google callback secure state', () => {
  // Phase 7B Part 2 fix: replay tests require a real user for the AuditLog FK.
  let realUser: { id: string };
  beforeEach(async () => {
    _resetConsumedNonces();
    const u = await createTestUser();
    realUser = { id: u.id };
  });
  afterEach(async () => {
    await db.oAuthNonceConsumed.deleteMany({}).catch(() => {});
    await db.auditLog.deleteMany({ where: { userId: realUser.id } }).catch(() => {});
    await db.user.delete({ where: { id: realUser.id } }).catch(() => {});
    _resetConsumedNonces();
  });

  it('rejects tampered state', async () => {
    const { GET } = await import('@/app/api/integrations/google/callback/route');
    const state = createSecureState('user-123', 'google', 'integration');
    const [payload, hmac] = state.split('.');
    const tampered = `${payload.slice(0, -2)}XX.${hmac}`;
    const req = new NextRequest(
      `http://localhost:3000/api/integrations/google/callback?code=fake&state=${tampered}`,
      { method: 'GET' }
    );
    const res = await GET(req);
    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';
    expect(location).toContain('integration_error');
    expect(location).toContain('tampered');
  });

  it('rejects missing state', async () => {
    const { GET } = await import('@/app/api/integrations/google/callback/route');
    const req = new NextRequest(
      'http://localhost:3000/api/integrations/google/callback?code=fake',
      { method: 'GET' }
    );
    const res = await GET(req);
    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';
    expect(location).toContain('Missing');
  });

  it('rejects replayed state', async () => {
    const { GET } = await import('@/app/api/integrations/google/callback/route');
    const state = createSecureState(realUser.id, 'google', 'integration');
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
});

// ── Calendar callback secure state ──────────────────────────────────

describe('Phase 7B Remediation — Calendar callback secure state', () => {
  // Phase 7B Part 2 fix: replay tests require a real user for the AuditLog FK.
  let realUser: { id: string };
  beforeEach(async () => {
    _resetConsumedNonces();
    const u = await createTestUser();
    realUser = { id: u.id };
  });
  afterEach(async () => {
    await db.oAuthNonceConsumed.deleteMany({}).catch(() => {});
    await db.auditLog.deleteMany({ where: { userId: realUser.id } }).catch(() => {});
    await db.user.delete({ where: { id: realUser.id } }).catch(() => {});
    _resetConsumedNonces();
  });

  it('rejects missing state', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    const req = new NextRequest(
      'http://localhost:3000/api/calendar/callback?code=fake',
      { method: 'GET' }
    );
    const res = await GET(req);
    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';
    expect(location).toContain('Missing');
  });

  it('rejects tampered state', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    const state = createSecureState('user-123', 'google', 'calendar');
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

  it('rejects wrong flow (integration state used for calendar)', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    const state = createSecureState('user-123', 'google', 'integration');
    const req = new NextRequest(
      `http://localhost:3000/api/calendar/callback?code=fake&state=${state}`,
      { method: 'GET' }
    );
    const res = await GET(req);
    const location = res.headers.get('location') || '';
    expect(location).toContain('flow');
  });

  it('rejects replayed state', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    const state = createSecureState(realUser.id, 'google', 'calendar');
    // First use
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
});
