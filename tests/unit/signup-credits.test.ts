/**
 * Signup credit reward tests (Stage A)
 *
 * Policy under test: a newly registered account receives EXACTLY 50 credits
 * as its TOTAL signup reward:
 *  - signup writes the balance explicitly (credits: 50) + one `signup_grant`
 *    ledger row in the same transaction (atomic — user creation is the
 *    idempotency boundary);
 *  - onboarding completion AND skip no longer grant any credits (previously a
 *    +25 `onboarding_bonus` inflated new users to 75, observed as "60" after
 *    early usage), and repeated onboarding callbacks never duplicate grants;
 *  - the ledger's idempotency-key mechanism actually works (it was dead code:
 *    the lookup searched an action string that was never written).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mock the DB layer (vi.hoisted: factories below are hoisted above consts) ──
const { dbMock, txMock } = vi.hoisted(() => {
  const txMock = {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    onboardingProgress: {
      update: vi.fn(),
    },
    creditsLedger: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'tx-ledger-1', ...data })),
    },
  };
  const dbMock = {
    $transaction: vi.fn(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => fn(txMock)),
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    onboardingProgress: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(({ create }: { create: Record<string, unknown> }) => Promise.resolve(create)),
      update: vi.fn(),
    },
    userSettings: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(({ create }: { create: Record<string, unknown> }) => Promise.resolve(create)),
    },
    creditsLedger: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'ledger-1', ...data })),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
  return { dbMock, txMock };
});

vi.mock('@/lib/db', () => ({ db: dbMock }));

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    requireAuth: vi.fn().mockResolvedValue({ id: 'user-1', email: 'u1@test.com' }),
    logAuthEvent: vi.fn().mockResolvedValue(undefined),
    getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
    getUserAgent: vi.fn().mockReturnValue('vitest'),
    hashPassword: vi.fn().mockResolvedValue('$2a$12$hashedpassword'),
    validateEmail: vi.fn().mockReturnValue(true),
    validatePasswordStrength: vi.fn().mockReturnValue({ valid: true, errors: [] }),
    generateOTP: vi.fn().mockReturnValue('123456'),
  };
});

vi.mock('@/lib/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ sent: true, messageId: 'm1' }),
  isEmailServiceConfigured: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/dev-auth', () => ({
  devOtpDelivery: { push: vi.fn() },
}));

vi.mock('@/lib/security/rate-limiter', () => ({
  withRateLimit: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/billing-audit', () => ({
  logCreditEvent: vi.fn().mockResolvedValue(undefined),
  logBillingEvent: vi.fn().mockResolvedValue(undefined),
}));

import { writeSignupGrantLedger, SIGNUP_GRANT_CREDITS, deductCredits } from '@/lib/credit-service';
import { POST as signupPOST } from '@/app/api/auth/signup/route';
import { PUT as onboardingPUT } from '@/app/api/settings/onboarding/route';

function makeRequest(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.user.findUnique.mockResolvedValue(null); // email not taken
  dbMock.onboardingProgress.findUnique.mockResolvedValue(null);
  dbMock.userSettings.findUnique.mockResolvedValue(null);
  dbMock.creditsLedger.findFirst.mockResolvedValue(null);
});

describe('signup credit reward (exactly 50 total)', () => {
  it('creates the account with an explicit 50-credit balance and one signup_grant ledger row, atomically', async () => {
    txMock.user.create.mockResolvedValue({ id: 'new-user-1', email: 'fresh@test.com' });

    const res = await signupPOST(makeRequest('http://localhost/api/auth/signup', 'POST', {
      name: 'Fresh User',
      email: 'fresh@test.com',
      password: 'Str0ngPassw0rd!x',
    }));
    expect(res.status).toBe(201);
    expect(txMock.user.create).toHaveBeenCalledTimes(1);
    const createData = txMock.user.create.mock.calls[0][0].data;
    expect(createData.credits).toBe(50);
    expect(createData.creditsMonthly).toBe(50);

    // Exactly one ledger row, written in the SAME transaction as user create.
    expect(dbMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.creditsLedger.create).toHaveBeenCalledTimes(1);
    const ledger = txMock.creditsLedger.create.mock.calls[0][0].data;
    expect(ledger.action).toBe('signup_grant');
    expect(ledger.credits).toBe(50);
    expect(ledger.balance).toBe(50);
    expect(ledger.userId).toBe('new-user-1');
  });

  it('signup grant helper writes the 50-credit audit row (defense in depth)', async () => {
    txMock.creditsLedger.create.mockClear();
    await writeSignupGrantLedger(txMock as never, 'user-9');
    expect(txMock.creditsLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-9',
        action: 'signup_grant',
        credits: SIGNUP_GRANT_CREDITS,
        balance: SIGNUP_GRANT_CREDITS,
      }),
    });
  });
});

describe('onboarding grants no credits (completion, skip, or repeat)', () => {
  it.each([
    ['skip path (completed:true only)', { completed: true }],
    ['full completion path', { completed: true, profileCompleted: true, nichesSelected: true, countriesSelected: true, channelsSelected: true }],
  ])('does not add credits — %s', async (_label, body) => {
    const res = await onboardingPUT(makeRequest('http://localhost/api/settings/onboarding', 'PUT', body));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.bonusAwarded).toBe(false);

    // No credit mutation and no ledger write anywhere in the flow.
    expect(dbMock.user.update).not.toHaveBeenCalled();
    expect(txMock.user.update).not.toHaveBeenCalled();
    expect(dbMock.creditsLedger.create).not.toHaveBeenCalled();
    expect(txMock.creditsLedger.create).not.toHaveBeenCalled();
  });

  it('repeated onboarding callbacks never duplicate a credit grant', async () => {
    for (let i = 0; i < 3; i++) {
      await onboardingPUT(makeRequest('http://localhost/api/settings/onboarding', 'PUT', { completed: true }));
    }
    expect(dbMock.creditsLedger.create).not.toHaveBeenCalled();
    expect(dbMock.user.update).not.toHaveBeenCalled();
  });
});

describe('CreditsLedger idempotency (retry-safe deductions)', () => {
  it('stores the idempotency key on the created ledger row', async () => {
    txMock.user.findUnique.mockResolvedValueOnce({ credits: 40, plan: 'free' });
    txMock.user.update.mockResolvedValue({});

    const r1 = await deductCredits({ userId: 'user-1', action: 'lead_discovery', cost: 1, idempotencyKey: 'job1:lead:1' });
    expect(r1.success).toBe(true);

    // The ledger row must carry the key (this is what the pre-check matches).
    const created = txMock.creditsLedger.create.mock.calls[0][0].data;
    expect(created.idempotencyKey).toBe('job1:lead:1');
    expect(created.action).toBe('lead_discovery'); // action stays clean for analytics
  });

  it('a replayed request with the same key returns alreadyProcessed and does not deduct twice', async () => {
    // First call: no existing row → deduct.
    txMock.user.findUnique.mockResolvedValueOnce({ credits: 40, plan: 'free' });
    txMock.user.update.mockResolvedValue({});
    const first = await deductCredits({ userId: 'user-1', action: 'lead_discovery', cost: 1, idempotencyKey: 'job1:lead:2' });
    expect(first.success).toBe(true);

    // Replay: the pre-check now finds the stored key → no second deduction.
    dbMock.creditsLedger.findFirst.mockResolvedValueOnce({ id: 'ledger-1', balance: 39 });
    txMock.user.update.mockClear();
    txMock.creditsLedger.create.mockClear();

    const replay = await deductCredits({ userId: 'user-1', action: 'lead_discovery', cost: 1, idempotencyKey: 'job1:lead:2' });
    expect(replay.alreadyProcessed).toBe(true);
    expect(replay.newBalance).toBe(39);
    expect(txMock.user.update).not.toHaveBeenCalled();
    expect(txMock.creditsLedger.create).not.toHaveBeenCalled();
  });
});
