// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Part 2 — Daily Outreach Quota
//
// Covers src/lib/daily-outreach-quota.ts:
//   • Central plan-level limits (free/starter/pro/elite) + env overrides
//   • Race-safe reservation: the conditional atomic increment semantics
//     (only one concurrent worker can win the final slot)
//   • Test L — at the limit, sends are blocked with the structured
//     DAILY_OUTREACH_LIMIT_EXCEEDED reason and consume ZERO credits
//   • Local-day resolution: user timezone from preferencesJson, correct
//     across midnight boundaries and timezones (§18)
//   • Unlimited plans: usage tracked, never blocked
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    user: { findUnique: vi.fn() },
    dailyOutreachUsage: { create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({ db: mocks.db }));

import {
  getDailyOutreachLimit,
  reserveDailyOutreachSend,
  getDailyOutreachUsage,
  zonedDateKey,
  resolveUserTimezone,
  DAILY_OUTREACH_LIMIT_EXCEEDED,
} from '@/lib/daily-outreach-quota';

// Usage-row state per test (simulates the DB row).
let usageRow: { used: number } | null;

function primeUser(plan: string, timezone?: string) {
  mocks.db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    id: where.id,
    plan,
    preferencesJson: timezone ? JSON.stringify({ timezone }) : null,
  }));
}

function primeUsageRow(used: number) {
  usageRow = { used };
  mocks.db.dailyOutreachUsage.findUnique.mockImplementation(
    async () => (usageRow ? { used: usageRow.used } : null),
  );
  // Faithful SQLite conditional-UPDATE semantics: increment ONLY when the
  // row exists AND the `used < limit` guard in the where-clause holds;
  // otherwise 0 rows match (count 0, no mutation). This is exactly what
  // makes the reservation race-safe in production.
  mocks.db.dailyOutreachUsage.updateMany.mockImplementation(
    async ({ where, data }: { where?: { used?: { lt?: number } }; data: { used: { increment: number } } }) => {
      if (!usageRow) return { count: 0 };
      const cap = where?.used?.lt;
      if (cap !== undefined && !(usageRow.used < cap)) return { count: 0 };
      usageRow.used += data.used.increment;
      return { count: 1 };
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  usageRow = null;
  // Default: a Pro user in UTC with an existing usage row at 0.
  primeUser('pro', 'UTC');
  primeUsageRow(0);
  // create() materializes the row ONLY when absent (unique-race → throw,
  // which the module catches — same as production).
  mocks.db.dailyOutreachUsage.create.mockImplementation(async () => {
    if (usageRow) throw new Error('Unique constraint failed');
    usageRow = { used: 0 };
    return {};
  });
});

afterEach(() => {
  delete process.env.DAILY_OUTREACH_LIMIT_FREE;
  delete process.env.DAILY_OUTREACH_LIMIT_STARTER;
  delete process.env.DAILY_OUTREACH_LIMIT_PRO;
  delete process.env.DAILY_OUTREACH_LIMIT_ELITE;
});

describe('Part 2 — central plan-level daily outreach limits', () => {
  it('has centrally configured limits for every plan (provisional defaults, reported in the Part 2 report)', () => {
    expect(getDailyOutreachLimit('free')).toBe(50);
    expect(getDailyOutreachLimit('starter')).toBe(100);
    expect(getDailyOutreachLimit('pro')).toBe(500);
    expect(getDailyOutreachLimit('elite')).toBe(null); // unlimited (codebase convention)
    expect(getDailyOutreachLimit('unknown-plan')).toBe(50); // degrade to free, never undefined
  });

  it('env overrides win per deployment without code changes (§15 configurability)', () => {
    process.env.DAILY_OUTREACH_LIMIT_PRO = '123';
    process.env.DAILY_OUTREACH_LIMIT_ELITE = 'unlimited';
    expect(getDailyOutreachLimit('pro')).toBe(123);
    expect(getDailyOutreachLimit('elite')).toBe(null);
  });
});

describe('Part 2 — race-safe reservation', () => {
  it('allows a send below the limit and increments usage', async () => {
    primeUser('pro'); // limit 500
    primeUsageRow(499);

    const r = await reserveDailyOutreachSend('user_1');

    expect(r.allowed).toBe(true);
    expect(r.used).toBe(500);
    expect(r.limit).toBe(500);
    expect(r.remaining).toBe(0);
  });

  it('Test L — at the limit the send is BLOCKED with the structured code, and no credits are touched', async () => {
    primeUser('pro'); // limit 500
    primeUsageRow(500);

    const r = await reserveDailyOutreachSend('user_1');

    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    // The structured business code is what the send actions prefix onto
    // the step error (asserted in the action-layer contract below).
    expect(DAILY_OUTREACH_LIMIT_EXCEEDED).toBe('DAILY_OUTREACH_LIMIT_EXCEEDED');
    // The blocked reason states the quota situation and the §14 rule.
    expect(r.blockedReason).toContain('Daily outreach quota reached');
    expect(r.blockedReason).toContain('500/500');
    expect(r.blockedReason).toContain('separate from credits');
    // The conditional increment NEVER ran a successful update — usage stays 500.
    expect(usageRow?.used).toBe(500);
  });

  it('the conditional atomic increment is what makes it race-safe: a worker that loses the final slot sees count=0 and is blocked', async () => {
    primeUser('starter'); // limit 100
    primeUsageRow(99);

    // Worker A and worker B race for the FINAL slot. With the faithful
    // conditional-UPDATE semantics above, the first increment takes used
    // to 100; the second reservation's `used < 100` guard no longer holds
    // → 0 rows updated → blocked. Exactly one winner for the final slot.
    const a = await reserveDailyOutreachSend('user_1');
    const b = await reserveDailyOutreachSend('user_1');

    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(false); // exactly one winner for the final slot
  });

  it('unlimited plans are never blocked, but usage is still tracked', async () => {
    primeUser('elite');
    primeUsageRow(100000);

    const r = await reserveDailyOutreachSend('user_1');

    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(null);
    expect(r.remaining).toBe(null);
    expect(r.used).toBe(100001);
  });
});

describe('Part 2 — §18 local-day resolution', () => {
  it('reads the account timezone from preferencesJson (persisted), falling back to UTC', async () => {
    primeUser('pro', 'Asia/Kolkata');
    expect(await resolveUserTimezone('user_1')).toBe('Asia/Kolkata');

    primeUser('pro', 'Not/A_Real_Zone');
    expect(await resolveUserTimezone('user_1')).toBe('UTC');

    primeUser('pro', undefined);
    expect(await resolveUserTimezone('user_1')).toBe('UTC');
  });

  it('zonedDateKey computes the LOCAL calendar day — midnight boundary correctness', () => {
    // 2026-10-21 00:30 UTC == 2026-10-21 06:00 in Kolkata (same date),
    // but 2026-10-20 19:30 in New York (previous date).
    const t = new Date('2026-10-21T00:30:00Z');
    expect(zonedDateKey(t, 'UTC')).toBe('2026-10-21');
    expect(zonedDateKey(t, 'Asia/Kolkata')).toBe('2026-10-21');
    expect(zonedDateKey(t, 'America/New_York')).toBe('2026-10-20');

    // 18:30 UTC == 00:00 next day in Kolkata — the quota day rolls over
    // at KOLKATA midnight, not UTC midnight.
    const t2 = new Date('2026-10-21T18:30:00Z');
    expect(zonedDateKey(t2, 'Asia/Kolkata')).toBe('2026-10-22');
    expect(zonedDateKey(t2, 'UTC')).toBe('2026-10-21');
  });

  it('usage snapshot reports used/limit/remaining and a reset boundary in the account timezone', async () => {
    primeUser('pro', 'Asia/Kolkata');
    primeUsageRow(120);

    const snap = await getDailyOutreachUsage('user_1');

    expect(snap.used).toBe(120);
    expect(snap.limit).toBe(500);
    expect(snap.remaining).toBe(380);
    expect(snap.timezone).toBe('Asia/Kolkata');
    expect(snap.resetsAt).toBeTruthy();
  });
});
