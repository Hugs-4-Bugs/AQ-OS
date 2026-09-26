// ═══════════════════════════════════════════════════════════════════
// Permanent-auth-fix unit tests (P3/P4/P9, Sep 2026)
// Covers the pieces that cannot be exercised over live HTTP:
//   - subscription 503 mapping (getSubscriptionStatus.unavailable)
//   - subscription store sync-state machine (never Free on failure)
//   - rate-limiter bucket isolation + infra refund + email key
// ═══════════════════════════════════════════════════════════════════
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock @/lib/db BEFORE importing anything that pulls it in ──────
vi.mock('@/lib/db', () => ({
  db: {
    subscription: { findFirst: vi.fn(), findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    $disconnect: vi.fn(),
  },
}));
vi.mock('@/lib/billing-audit', () => ({ logSubscriptionEvent: vi.fn() }));
vi.mock('@/lib/credit-service', () => ({
  resetMonthlyCredits: vi.fn(),
  getCreditBalance: vi.fn().mockResolvedValue({ total: 0, monthly: 0, rollover: 0, addons: 0, plan: 'free' }),
}));
vi.mock('@/lib/observability/metrics-collector', () => ({
  metricsCollector: { observeHistogram: vi.fn(), incrementCounter: vi.fn() },
}));
vi.mock('@/lib/observability/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { getSubscriptionStatus } from '@/lib/subscription-service';
import { useSubscriptionStore, type BackendSubscriptionData } from '@/lib/subscription-store';
import {
  checkRateLimit,
  withRateLimit,
  refundRateLimit,
  authRateKeySuffix,
  RATE_LIMITERS,
} from '@/lib/security/rate-limiter';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';

const prismaError = Object.assign(new Error('Invalid `prisma.user.findUnique()` invocation: unable to open the database file'), { code: 'P2021' });

// ═══════════════════ P3: subscription never falsely Free ═══════════

describe('getSubscriptionStatus — infrastructure failure (P3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks result unavailable (NOT plan free) when the DB is down', async () => {
    (db.subscription.findFirst as ReturnType<typeof vi.fn>).mockRejectedValue(prismaError);
    const result = await getSubscriptionStatus('user-1');
    expect(result.unavailable).toBe(true);
  });

  it('still returns authoritative data on success', async () => {
    (db.subscription.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      credits: 10,
      creditsMonthly: 10,
      plan: 'pro',
      isTrial: false,
      trialEndsAt: null,
    });
    const result = await getSubscriptionStatus('user-1');
    expect(result.unavailable).toBeFalsy();
    expect(result.planDetails.plan).toBe('pro');
  });
});

// ═══════════════ store state machine (tests 13–18 semantics) ══════

function backendData(plan: string): BackendSubscriptionData {
  return {
    subscription: {
      id: 'sub-1',
      plan: plan as never,
      status: 'active',
      currentPeriodStart: new Date(Date.now() - 5 * 86400000).toISOString(),
      currentPeriodEnd: new Date(Date.now() + 25 * 86400000).toISOString(),
      cancelAtPeriodEnd: false,
      scheduledPlanChange: null,
    },
    planDetails: {
      name: plan,
      plan: plan as never,
      priceINR: 1599,
      priceUSD: 19,
      yearlyINR: 14999,
      yearlyUSD: 180,
      creditsMonthly: 750,
      maxLeads: null,
      features: [],
      disabledFeatures: [],
    },
    trialInfo: { isTrial: false, trialEndsAt: null, daysRemaining: 0 },
    creditBalance: { total: 500, monthly: 750, rollover: 0, addons: 0, plan: plan as never, percentage: 66 },
  };
}

describe('subscription store sync-state machine (P3)', () => {
  beforeEach(() => {
    useSubscriptionStore.getState().reset();
  });

  it('initial state is idle + hasEverVerified=false (never treated as verified Free)', () => {
    const s = useSubscriptionStore.getState();
    expect(s.syncState).toBe('idle');
    expect(s.hasEverVerified).toBe(false);
  });

  it('verified sync sets syncState=verified and plan', () => {
    useSubscriptionStore.getState().syncFromBackend(backendData('pro'));
    const s = useSubscriptionStore.getState();
    expect(s.currentPlan).toBe('pro');
    expect(s.syncState).toBe('verified');
    expect(s.hasEverVerified).toBe(true);
  });

  it('13: Pro user + successful lookup → Pro', () => {
    useSubscriptionStore.getState().syncFromBackend(backendData('pro'));
    expect(useSubscriptionStore.getState().currentPlan).toBe('pro');
  });

  it('14–16: temporary failure (markUnavailable) does NOT downgrade Pro/Elite/Starter', () => {
    for (const plan of ['pro', 'elite', 'starter'] as const) {
      useSubscriptionStore.getState().reset();
      useSubscriptionStore.getState().syncFromBackend(backendData(plan));
      useSubscriptionStore.getState().markUnavailable();
      const s = useSubscriptionStore.getState();
      expect(s.currentPlan).toBe(plan);            // preserved
      expect(s.syncState).toBe('unavailable');
      expect(s.hasEverVerified).toBe(true);        // last-known-good still trusted
    }
  });

  it('17: re-verification after transient failure restores verified state', () => {
    useSubscriptionStore.getState().syncFromBackend(backendData('pro'));
    useSubscriptionStore.getState().markUnavailable();
    useSubscriptionStore.getState().syncFromBackend(backendData('pro'));
    const s = useSubscriptionStore.getState();
    expect(s.syncState).toBe('verified');
    expect(s.currentPlan).toBe('pro');
  });

  it('reset() (real logout) returns to idle defaults', () => {
    useSubscriptionStore.getState().syncFromBackend(backendData('elite'));
    useSubscriptionStore.getState().reset();
    const s = useSubscriptionStore.getState();
    expect(s.syncState).toBe('idle');
    expect(s.hasEverVerified).toBe(false);
    expect(s.currentPlan).toBe('free');
  });
});

// ═══════════════════ P9: rate-limit buckets ═══════════════════════

function reqFromIp(ip: string, body?: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/otp/request', {
    method: 'POST',
    headers: {
      'x-forwarded-for': ip,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('rate limiter bucket isolation (P9, tests 31–33)', () => {
  const cfg = { limit: 3, windowSeconds: 60 };

  it('different buckets never share counters', () => {
    const req = reqFromIp('10.0.0.1');
    // consume 'otp' bucket fully
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit('rl:otp:test-user', { ...cfg, windowMs: 60000 } as never).allowed).toBe(true);
    }
    // simulate via withRateLimit for distinct limiter names instead
    expect(withRateLimit(req, 'otp', { keySuffix: ':em:x' })).toBeNull(); // otp unused for this suffix
    expect(withRateLimit(req, 'magic_link', { keySuffix: ':em:x' })).toBeNull();
    expect(withRateLimit(req, 'refresh')).toBeNull();
    expect(withRateLimit(req, 'signin', { keySuffix: ':em:x' })).toBeNull();
  });

  it('same bucket + same suffix enforces the limit', () => {
    const req = reqFromIp('10.0.0.2');
    const suffix = authRateKeySuffix('User@Example.com ');
    expect(suffix).not.toBe('');
    for (let i = 0; i < RATE_LIMITERS.otp.limit; i++) {
      expect(withRateLimit(req, 'otp', { keySuffix: suffix })).toBeNull();
    }
    const blocked = withRateLimit(req, 'otp', { keySuffix: suffix });
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
  });

  it('31: another user behind the SAME gateway IP is a DIFFERENT bucket', () => {
    const req = reqFromIp('10.0.0.3');
    const userA = authRateKeySuffix('a@example.com');
    const userB = authRateKeySuffix('b@example.com');
    for (let i = 0; i < 5; i++) {
      expect(withRateLimit(req, 'otp', { keySuffix: userA })).toBeNull();
    }
    expect(withRateLimit(req, 'otp', { keySuffix: userA })).not.toBeNull(); // A blocked
    expect(withRateLimit(req, 'otp', { keySuffix: userB })).toBeNull();     // B fine
  });

  it('32: abuse still blocked (per-bucket limit holds)', () => {
    const req = reqFromIp('10.0.0.4');
    const suffix = authRateKeySuffix('abuse@test.invalid');
    for (let i = 0; i < RATE_LIMITERS.otp.limit; i++) {
      expect(withRateLimit(req, 'otp', { keySuffix: suffix })).toBeNull();
    }
    expect(withRateLimit(req, 'otp', { keySuffix: suffix })).not.toBeNull();
  });

  it('refundRateLimit returns an infra-consumed slot (no 429 on retry)', () => {
    const req = reqFromIp('10.0.0.5');
    const suffix = authRateKeySuffix('refund@test.invalid');
    for (let i = 0; i < RATE_LIMITERS.otp.limit; i++) {
      withRateLimit(req, 'otp', { keySuffix: suffix });
    }
    expect(withRateLimit(req, 'otp', { keySuffix: suffix })).not.toBeNull(); // exhausted
    refundRateLimit(req, 'otp', { keySuffix: suffix });
    expect(withRateLimit(req, 'otp', { keySuffix: suffix })).toBeNull();     // refunded
  });

  it('authRateKeySuffix normalizes case/whitespace; empty for missing email', () => {
    expect(authRateKeySuffix('A@B.com')).toBe(authRateKeySuffix('  a@B.COM '));
    expect(authRateKeySuffix(undefined)).toBe('');
    expect(authRateKeySuffix('')).toBe('');
    expect(authRateKeySuffix(null)).toBe('');
  });

  it('refresh bucket is bigger than the legacy auth bucket', () => {
    expect(RATE_LIMITERS.refresh.limit).toBeGreaterThan(RATE_LIMITERS.auth.limit);
    expect(RATE_LIMITERS.otp.limit).toBe(RATE_LIMITERS.auth.limit); // same strictness, own bucket
  });
});
