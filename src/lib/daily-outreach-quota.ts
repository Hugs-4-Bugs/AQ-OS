// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Daily Outreach Quota (Part 2)
//
// A plan-level DAILY limit on actual outbound outreach sends — a concept
// SEPARATE from credits (credits pay for workflow execution; the daily
// quota caps how many outbound messages may actually go out per local
// day, whatever started them: manual runs, scheduled triggers, Autopilot,
// retries, or additional executions).
//
// Design rules (Part 2 spec):
//   • ONE central configuration (PLAN_DAILY_OUTREACH_LIMITS) — no
//     scattered hardcoded limits in frontend or backend code.
//   • Server-side enforcement only; frontend checks are cosmetic UX.
//   • Race-safe: reservation uses a conditional atomic UPDATE
//     (`used < limit`) inside the DailyOutreachUsage row, so concurrent
//     workers/instances can never jointly exceed the limit.
//   • The quota period is the USER's local calendar day (persisted
//     account timezone via preferencesJson.timezone, UTC fallback),
//     computed with Intl — correct across midnight, timezone boundaries,
//     and DST. No historical records are deleted to "reset" anything:
//     a new local day is simply a new dateKey row.
//   • Blocked sends consume ZERO credits (the flat workflow execution
//     fee is charged per accepted run, not per send).
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import type { PlanType } from '@/lib/entitlement-service';

// ===== CONFIGURATION (single source of truth) =====

/**
 * Plan-level daily outreach send limits.
 *
 * The product had NO prior daily outreach limits (verified in the Part 2
 * inspection pass), so these are centrally-configured DEFAULTS for the
 * plan ladder — explicitly provisional, reported in the Part 2 report,
 * and overridable per deployment via env:
 *   DAILY_OUTREACH_LIMIT_FREE / _STARTER / _PRO / _ELITE
 * (`null` / "unlimited" = no daily cap for that plan — the same convention
 * entitlement-service uses for unlimited plan features.)
 */
const DEFAULT_DAILY_OUTREACH_LIMITS: Record<PlanType, number | null> = {
  free: 50,
  starter: 100,
  pro: 500,
  elite: null, // unlimited — Elite follows the codebase's unlimited convention
};

function envLimit(name: string): number | null | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === '' || v === 'null' || v === 'unlimited' || v === 'none') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

export function getDailyOutreachLimit(plan: string): number | null {
  const planType = (plan || 'free') as PlanType;
  const fromEnv = envLimit(`DAILY_OUTREACH_LIMIT_${planType.toUpperCase()}`);
  if (fromEnv !== undefined) return fromEnv;
  const limit = DEFAULT_DAILY_OUTREACH_LIMITS[planType];
  return limit === undefined ? DEFAULT_DAILY_OUTREACH_LIMITS.free : limit;
}

export const DAILY_OUTREACH_LIMIT_EXCEEDED = 'DAILY_OUTREACH_LIMIT_EXCEEDED';

// ===== LOCAL-DAY RESOLUTION (user timezone) =====

interface ZonedDateKeyParts {
  dateKey: string; // YYYY-MM-DD in the user's local calendar day
  timezone: string;
}

/**
 * Resolve the user's persisted timezone. The account's preferencesJson
 * carries { timezone } (same field the Gmail pipeline reads); anything
 * missing or invalid falls back to UTC. A SECOND source — the workflow's
 * own schedule timezone — is deliberately NOT used here: the quota is an
 * ACCOUNT-level limit, so the account's timezone is the right frame.
 */
export async function resolveUserTimezone(userId: string): Promise<string> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { preferencesJson: true },
    });
    if (user?.preferencesJson) {
      try {
        const prefs = JSON.parse(user.preferencesJson) as { timezone?: unknown };
        const tz = prefs.timezone;
        if (typeof tz === 'string' && tz.trim()) {
          // Validate: Intl throws on invalid timezones
          new Intl.DateTimeFormat('en-CA', { timeZone: tz });
          return tz.trim();
        }
      } catch {
        // malformed preferences JSON → fall through to UTC
      }
    }
  } catch {
    // user lookup failure → UTC (never throw from quota resolution)
  }
  return 'UTC';
}

/** Compute the local calendar date key for a moment in an IANA timezone. */
export function zonedDateKey(date: Date, timeZone: string): string {
  try {
    // en-CA gives YYYY-MM-DD directly
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}

/** The user's current local-day key + the timezone it was computed in. */
export async function dailyQuotaDayForUser(userId: string): Promise<ZonedDateKeyParts> {
  const timezone = await resolveUserTimezone(userId);
  return { dateKey: zonedDateKey(new Date(), timezone), timezone };
}

// ===== RACE-SAFE RESERVATION =====

export interface DailyOutreachReservation {
  allowed: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
  dateKey: string;
  timezone: string;
}

/**
 * Reserve ONE daily outreach send for the user, atomically.
 *
 * Concurrency contract: the increment is a single conditional UPDATE
 * (`UPDATE ... SET used = used + 1 WHERE userId = ? AND dateKey = ? AND
 * used < limit`). SQLite serializes write statements, so two concurrent
 * workers can never both pass the `used < limit` guard for the same final
 * slot — exactly one wins, the other sees the limit reached. For unlimited
 * plans the row is incremented unconditionally (usage stays observable for
 * the UI without ever blocking).
 *
 * Returns the reservation verdict INCLUDING an honest reason when blocked.
 */
export async function reserveDailyOutreachSend(userId: string): Promise<
  DailyOutreachReservation & { blockedReason?: string }
> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  const plan = (user?.plan || 'free') as PlanType;
  const limit = getDailyOutreachLimit(plan);

  const { dateKey, timezone } = await dailyQuotaDayForUser(userId);

  // Unlimited plan: still track usage (atomic unconditional increment).
  if (limit === null) {
    await ensureUsageRow(userId, dateKey);
    await db.dailyOutreachUsage.updateMany({
      where: { userId, dateKey },
      data: { used: { increment: 1 }, updatedAt: new Date() },
    });
    const used = await readUsed(userId, dateKey);
    return { allowed: true, used, limit: null, remaining: null, dateKey, timezone };
  }

  // Limited plan: create-once then conditional atomic increment.
  await ensureUsageRow(userId, dateKey);
  const incremented = await db.dailyOutreachUsage.updateMany({
    where: { userId, dateKey, used: { lt: limit } },
    data: { used: { increment: 1 }, updatedAt: new Date() },
  });

  const used = await readUsed(userId, dateKey);

  if (incremented.count === 1) {
    return {
      allowed: true,
      used,
      limit,
      remaining: Math.max(0, limit - used),
      dateKey,
      timezone,
    };
  }

  return {
    allowed: false,
    used,
    limit,
    remaining: 0,
    dateKey,
    timezone,
    blockedReason:
      `Daily outreach quota reached for today (${used}/${limit} sends used on the ${plan} plan). ` +
      'Sends resume at midnight in your account timezone. The daily quota is separate from credits — buying credits does not raise it; upgrading the plan does.',
  };
}

// ===== USAGE READ (UI / API) =====

export interface DailyOutreachUsageSnapshot {
  used: number;
  limit: number | null;
  remaining: number | null;
  dateKey: string;
  timezone: string;
  resetsAt: string | null; // ISO — next local midnight in the account tz
}

/** Read the user's current daily outreach usage (never mutates anything). */
export async function getDailyOutreachUsage(userId: string): Promise<DailyOutreachUsageSnapshot> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  const plan = (user?.plan || 'free') as PlanType;
  const limit = getDailyOutreachLimit(plan);
  const { dateKey, timezone } = await dailyQuotaDayForUser(userId);
  const used = await readUsed(userId, dateKey);

  // Next local midnight in the account's timezone (quota reset boundary).
  let resetsAt: string | null = null;
  try {
    const nowParts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date());
    const get = (t: string) => Number(nowParts.find((p) => p.type === t)?.value ?? 0);
    // Wall-clock offset of "now" in the target tz, in minutes:
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    const offsetMs = asUtc - (Math.floor(Date.now() / 1000) * 1000);
    // Next local midnight = today's local date + 1 day at 00:00 local
    const [y, m, d] = dateKey.split('-').map(Number);
    const nextMidnightLocal = Date.UTC(y, m - 1, d + 1, 0, 0, 0);
    resetsAt = new Date(nextMidnightLocal - offsetMs).toISOString();
  } catch {
    resetsAt = null;
  }

  return {
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    dateKey,
    timezone,
    resetsAt,
  };
}

// ===== INTERNALS =====

/** Create the day's usage row if absent (idempotent; unique-race safe). */
async function ensureUsageRow(userId: string, dateKey: string): Promise<void> {
  try {
    await db.dailyOutreachUsage.create({
      data: { userId, dateKey, used: 0 },
    });
  } catch {
    // Unique(userId, dateKey) race — another worker created it first.
  }
}

async function readUsed(userId: string, dateKey: string): Promise<number> {
  const row = await db.dailyOutreachUsage.findUnique({
    where: { userId_dateKey: { userId, dateKey } },
    select: { used: true },
  });
  return row?.used ?? 0;
}
