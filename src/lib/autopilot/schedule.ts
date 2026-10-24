// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Schedule (Phase 22)
//
// Canonical, server-side authority for Autopilot scheduling:
//   · persisted config representation (JSON in the EXISTING
//     AutopilotWorkflow.schedule String column — same pattern as
//     geography/niches; ZERO schema migration, full backward
//     compatibility with the Phase 18 whitelist strings)
//   · input validation (interval bounds · unit whitelist · IANA
//     timezone validity · HH:mm start time)
//   · timezone-aware, deterministic, DST-safe next-run computation —
//     NEVER browser time; the server is always authoritative
//
// Canonical persisted shape (JSON string):
//   { "every": 3, "unit": "HOURS", "timezone": "Asia/Kolkata",
//     "startAt": "09:30", "anchorDate": "2026-10-24", "enabled": true }
//
// Semantics:
//   every/unit  — the interval between scheduled runs.
//   timezone    — IANA zone the schedule's wall clock lives in.
//   startAt     — OPTIONAL 'HH:mm' anchor (time-of-day in `timezone`).
//                 Present  ⇒ occurrences form an ANCHORED wall-clock
//                 grid whose FIRST point is the anchor itself: "09:30
//                 every 3 hours in Asia/Kolkata" first runs at 09:30,
//                 then 12:30, 15:30, 18:30, 21:30, then 09:30 the next
//                 day — the next occurrence after any instant is
//                 deterministic (missed occurrences while paused are
//                 skipped, never replayed in a catch-up storm).
//                 Absent   ⇒ interval mode (legacy Phase 18 behavior:
//                 next = last + interval, absolute epoch arithmetic).
//   anchorDate  — the wall-clock DATE the grid is anchored to
//                 (server-set at configuration time; never client
//                 input). Makes weekly/multi-day grids stable: "weekly
//                 at 09:30" stays on the same weekday across DST.
//   enabled     — Phase 22 scheduling on/off switch (Disable keeps the
//                 whole config but stops scheduled execution).
//
// DST determinism (documented contract):
//   · Anchored DAYS/WEEKS grids keep the local wall time across DST
//     transitions (09:30 stays 09:30; the UTC instant shifts).
//   · HOURS grids use absolute epoch arithmetic (a DST transition
//     shifts the local wall hour by the DST delta — standard interval
//     semantics).
//   · Ambiguous local time (fall-back, e.g. 01:30 twice) resolves to
//     the FIRST (earlier) instant; nonexistent local time
//     (spring-forward gap) resolves to the first valid instant AFTER
//     the gap.
//
// Backward compatibility: the legacy whitelist strings
// ('hourly'|'every_6_hours'|'every_12_hours'|'daily'|'weekly') parse
// into equivalent canonical configs (UTC, interval mode, enabled) —
// existing rows and callers keep working unchanged.
// ═══════════════════════════════════════════════════════════════════

import {
  AUTOPILOT_SCHEDULE_EVERY_MAX,
  AUTOPILOT_SCHEDULE_EVERY_MIN,
  AUTOPILOT_SCHEDULE_UNITS,
  LEGACY_SCHEDULE_TO_UNIT_EVERY,
  isAutopilotSchedule,
  type AutopilotScheduleUnit,
} from './constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The canonical, validated schedule configuration. */
export interface ScheduleConfig {
  /** Interval multiplier (1..AUTOPILOT_SCHEDULE_EVERY_MAX[unit]). */
  every: number;
  /** Interval unit. */
  unit: AutopilotScheduleUnit;
  /** IANA timezone identifier the schedule's wall clock lives in. */
  timezone: string;
  /** Optional 'HH:mm' anchor (time-of-day in `timezone`); null = interval mode. */
  startAt: string | null;
  /** Wall-clock anchor date 'YYYY-MM-DD' (server-set; grid stability). */
  anchorDate: string | null;
  /** Scheduling enabled/disabled (Phase 22 Disable semantics). */
  enabled: boolean;
}

/** Default config — equivalent to the legacy 'daily' schedule. */
export const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  every: 1,
  unit: 'DAYS',
  timezone: 'UTC',
  startAt: null,
  anchorDate: null,
  enabled: true,
};

/** Deterministic fallback anchor for anchored rows missing a valid one. */
const FALLBACK_ANCHOR_DATE = '1970-01-01';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ---------------------------------------------------------------------------
// Timezone primitives (Intl-based — no external date library needed)
// ---------------------------------------------------------------------------

/**
 * Whether `tz` is a valid IANA timezone identifier accepted by this
 * runtime's Intl implementation. This is the server-side authority —
 * a client-supplied timezone is never trusted until it passes this.
 */
export function isValidTimezone(tz: unknown): boolean {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset (minutes east of UTC) of `tz` at the instant `at`. */
function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) % 24,
    Number(map.minute),
    Number(map.second)
  );
  return (asUtc - at.getTime()) / 60000;
}

/** The wall-clock (calendar) fields of the instant `at` in `tz`. */
function utcToWallClock(tz: string, at: Date): { y: number; m: number; d: number; hh: number; mm: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  return {
    y: Number(map.year),
    m: Number(map.month),
    d: Number(map.day),
    hh: Number(map.hour) % 24,
    mm: Number(map.minute),
  };
}

/** The wall-clock fields of an instant expressed as a naive UTC epoch (ms). */
function wallAsUtcMs(tz: string, atMs: number): number {
  const w = utcToWallClock(tz, new Date(atMs));
  return Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm);
}

/**
 * Resolve a wall-clock time in `tz` to its UTC instant. Deterministic
 * DST edge contract:
 *   · ambiguous local time (fall-back) → the FIRST (earlier) instant;
 *   · nonexistent local time (spring-forward gap) → the first valid
 *     instant AFTER the gap;
 *   · normal local times → the exact instant.
 * Two-candidate offset algorithm: evaluate the zone offset near the
 * wall time and at the first candidate; the pair of candidates covers
 * both DST branches around a transition.
 */
function wallClockToUtc(tz: string, y: number, m: number, d: number, hh: number, mm: number): Date {
  const target = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  const offA = tzOffsetMinutes(tz, new Date(target));
  const candA = target - offA * 60000;
  const offB = tzOffsetMinutes(tz, new Date(candA));
  if (offB === offA) {
    // Normal case (and fall-back ambiguity: candA uses the
    // pre-transition offset → the EARLIER of the two instants).
    return new Date(candA);
  }
  const candB = target - offB * 60000;
  const exactA = wallAsUtcMs(tz, candA) === target;
  const exactB = wallAsUtcMs(tz, candB) === target;
  if (exactA && exactB) return new Date(Math.min(candA, candB)); // ambiguous → earlier
  if (exactA) return new Date(candA);
  if (exactB) return new Date(candB);
  // Nonexistent local time (spring-forward gap) → first valid instant
  // AFTER the gap = the later candidate (post-transition offset).
  return new Date(Math.max(candA, candB));
}

/** Today's wall-clock date in `tz` as 'YYYY-MM-DD'. */
function wallDateToday(tz: string): string {
  const w = utcToWallClock(tz, new Date());
  return `${String(w.y).padStart(4, '0')}-${String(w.m).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
}

/** Parse a 'YYYY-MM-DD' string → {y,m,d} (null when invalid). */
function parseYmd(v: unknown): { y: number; m: number; d: number } | null {
  if (typeof v !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

// ---------------------------------------------------------------------------
// Input validation / canonicalization
// ---------------------------------------------------------------------------

const START_AT_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Normalize a unit input (case-insensitive, singular tolerated). */
function normalizeUnit(raw: unknown): AutopilotScheduleUnit | null {
  if (typeof raw !== 'string') return null;
  const u = raw.trim().toUpperCase();
  for (const unit of AUTOPILOT_SCHEDULE_UNITS) {
    // Accept 'HOURS'/'HOUR', 'DAYS'/'DAY', 'WEEKS'/'WEEK' (any case).
    if (u === unit || u === unit.slice(0, -1)) return unit;
  }
  return null;
}

/** Normalize a start-time input ('HH:mm[:ss]' → 'HH:mm'; '' → null). */
function normalizeStartAt(raw: unknown): string | null | { error: string } {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return { error: 'schedule.startAt must be a "HH:mm" string or null' };
  const v = raw.trim();
  if (!v) return null;
  const noSeconds = v.length > 5 ? v.slice(0, 5) : v;
  if (!START_AT_PATTERN.test(noSeconds)) {
    return { error: 'schedule.startAt must be "HH:mm" (00:00–23:59), e.g. "09:30"' };
  }
  return noSeconds;
}

/**
 * Validate + canonicalize schedule INPUT (create/update API payload).
 * Accepts BOTH shapes:
 *   · legacy whitelist string  ('daily', 'hourly', …)
 *   · Phase 22 object          { every, unit, timezone, startAt?, enabled? }
 * anchorDate is NEVER accepted from the client — the server sets it
 * (the wall-clock date in the schedule timezone at save time).
 * Rejects everything else deterministically with a clear error.
 */
export function parseScheduleInput(
  raw: unknown
): { ok: true; config: ScheduleConfig } | { ok: false; error: string } {
  // ── Legacy whitelist string → canonical config (UTC, interval mode) ──
  if (typeof raw === 'string') {
    if (isAutopilotSchedule(raw)) {
      const legacy = LEGACY_SCHEDULE_TO_UNIT_EVERY[raw];
      return {
        ok: true,
        config: { every: legacy.every, unit: legacy.unit, timezone: 'UTC', startAt: null, anchorDate: null, enabled: true },
      };
    }
    return {
      ok: false,
      error: 'Invalid schedule — use {"every","unit","timezone"} or a legacy option (hourly, every_6_hours, every_12_hours, daily, weekly)',
    };
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'schedule must be an object {"every","unit","timezone"} or a legacy option string' };
  }
  const input = raw as Record<string, unknown>;

  // every — positive integer within the per-unit bound.
  const everyRaw = input.every;
  const every = typeof everyRaw === 'string' && everyRaw.trim() !== '' ? Number(everyRaw) : everyRaw;
  if (typeof every !== 'number' || !Number.isFinite(every) || !Number.isInteger(every)) {
    return { ok: false, error: 'schedule.every must be a whole number of intervals (e.g. 3)' };
  }

  // unit — whitelist (validated against the per-unit bound for `every`).
  const unit = normalizeUnit(input.unit);
  if (!unit) {
    return { ok: false, error: `schedule.unit must be one of ${AUTOPILOT_SCHEDULE_UNITS.join(', ')}` };
  }
  const max = AUTOPILOT_SCHEDULE_EVERY_MAX[unit];
  if (every < AUTOPILOT_SCHEDULE_EVERY_MIN || every > max) {
    return {
      ok: false,
      error: `schedule.every must be between ${AUTOPILOT_SCHEDULE_EVERY_MIN} and ${max} for ${unit} intervals`,
    };
  }

  // timezone — server-side IANA validation (never trust the client).
  const timezoneRaw = input.timezone === undefined || input.timezone === null ? 'UTC' : input.timezone;
  if (!isValidTimezone(timezoneRaw)) {
    return { ok: false, error: 'schedule.timezone must be a valid IANA timezone (e.g. Asia/Kolkata, America/New_York, UTC)' };
  }
  const timezone = String(timezoneRaw).trim();

  // startAt — optional HH:mm anchor.
  const startAt = normalizeStartAt(input.startAt);
  if (startAt && typeof startAt === 'object') return { ok: false, error: startAt.error };

  // enabled — default true.
  const enabled = input.enabled === undefined ? true : input.enabled === true;

  // anchorDate — server-authoritative: today's wall date in the
  // schedule timezone (client-supplied values are deliberately ignored).
  const anchorDate = startAt ? wallDateToday(timezone) : null;

  return {
    ok: true,
    config: { every, unit, timezone, startAt: startAt as string | null, anchorDate, enabled },
  };
}

/**
 * Tolerant read of the PERSISTED schedule column (JSON or legacy
 * whitelist string). Never throws: unreadable values fall back to the
 * legacy default (daily) so a bad row can never take the scheduler
 * down. The WRITE path always stores canonical JSON.
 */
export function parsePersistedSchedule(raw: string | null | undefined): ScheduleConfig {
  if (raw === null || raw === undefined) return { ...DEFAULT_SCHEDULE_CONFIG };
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) return { ...DEFAULT_SCHEDULE_CONFIG };
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      // Re-validate through safe defaults (stored data is trusted LESS
      // than API input): field-by-field fallback, never a throw.
      const unit = normalizeUnit(parsed.unit) ?? DEFAULT_SCHEDULE_CONFIG.unit;
      const everyRaw = Number(parsed.every);
      const every = Number.isInteger(everyRaw) && everyRaw >= AUTOPILOT_SCHEDULE_EVERY_MIN
        ? Math.min(everyRaw, AUTOPILOT_SCHEDULE_EVERY_MAX[unit])
        : DEFAULT_SCHEDULE_CONFIG.every;
      const timezone = isValidTimezone(parsed.timezone) ? String(parsed.timezone) : 'UTC';
      const startAtRaw = typeof parsed.startAt === 'string' ? parsed.startAt.slice(0, 5) : null;
      const startAt = startAtRaw && START_AT_PATTERN.test(startAtRaw) ? startAtRaw : null;
      const anchorParsed = parseYmd(parsed.anchorDate);
      const anchorDate = startAt ? (anchorParsed ? parsed.anchorDate as string : FALLBACK_ANCHOR_DATE) : null;
      return { every, unit, timezone, startAt, anchorDate, enabled: parsed.enabled !== false };
    } catch {
      return { ...DEFAULT_SCHEDULE_CONFIG };
    }
  }
  // Legacy whitelist string.
  if (isAutopilotSchedule(trimmed)) {
    const legacy = LEGACY_SCHEDULE_TO_UNIT_EVERY[trimmed];
    return { every: legacy.every, unit: legacy.unit, timezone: 'UTC', startAt: null, anchorDate: null, enabled: true };
  }
  return { ...DEFAULT_SCHEDULE_CONFIG };
}

/** Deterministic JSON serialization of a canonical config (stable key order). */
export function serializeSchedule(config: ScheduleConfig): string {
  return JSON.stringify({
    every: config.every,
    unit: config.unit,
    timezone: config.timezone,
    startAt: config.startAt,
    anchorDate: config.anchorDate,
    enabled: config.enabled,
  });
}

// ---------------------------------------------------------------------------
// Next-run engine (timezone-aware · deterministic · DST-safe)
// ---------------------------------------------------------------------------

function intervalMs(config: ScheduleConfig): number {
  switch (config.unit) {
    case 'HOURS': return config.every * HOUR_MS;
    case 'DAYS': return config.every * DAY_MS;
    case 'WEEKS': return config.every * 7 * DAY_MS;
  }
}

/**
 * The FIRST scheduled occurrence STRICTLY after `from` (server-side
 * only; `from` defaults to the server's now).
 *
 *   startAt present (anchored grid mode):
 *     anchor0 = anchorDate @ startAt in `timezone` (the grid origin —
 *     the FIRST occurrence; the grid extends FORWARD only).
 *     HOURS  → occurrences at anchor0 + k·every hours (absolute epoch);
 *              k chosen so the result is the first grid point > from.
 *     DAYS/WEEKS → occurrences advance on the local wall-clock grid
 *              (same local hh:mm each step — DST-safe); the day-index
 *              is computed from the local calendar dates, then a
 *              bounded wall-clock walk fixes DST edge rounding.
 *
 *   startAt absent (interval mode — legacy Phase 18 semantics):
 *     next = from + interval (absolute epoch arithmetic, identical to
 *     the pre-Phase-22 computeNextRun for legacy schedules).
 */
export function computeNextRunAt(config: ScheduleConfig, from: Date = new Date()): Date {
  if (!config.startAt) {
    return new Date(from.getTime() + intervalMs(config));
  }

  const [hh, mm] = config.startAt.split(':').map(Number);
  const anchor = parseYmd(config.anchorDate) ?? parseYmd(FALLBACK_ANCHOR_DATE)!;
  const anchor0 = wallClockToUtc(config.timezone, anchor.y, anchor.m, anchor.d, hh, mm);
  const fromMs = from.getTime();

  if (config.unit === 'HOURS') {
    const step = config.every * HOUR_MS;
    const anchorMs = anchor0.getTime();
    if (anchorMs > fromMs) return anchor0;
    // First grid point strictly after `from` (grid extends backward).
    const k = Math.floor((fromMs - anchorMs) / step) + 1;
    return new Date(anchorMs + k * step);
  }

  // DAYS / WEEKS — local wall-clock grid.
  const daysPerStep = config.unit === 'DAYS' ? config.every : config.every * 7;
  const fromWall = utcToWallClock(config.timezone, from);
  const fromWallDayMs = Date.UTC(fromWall.y, fromWall.m - 1, fromWall.d);
  const anchorDayMs = Date.UTC(anchor.y, anchor.m - 1, anchor.d);
  // Whole local days between the anchor date and `from`'s local date.
  const diffDays = Math.floor((fromWallDayMs - anchorDayMs) / DAY_MS);
  // Grid day-index of the last occurrence on/before `from`'s date.
  let k = Math.max(0, Math.floor(diffDays / daysPerStep));
  let candidate = addWallClockDays(config.timezone, anchor0, k * daysPerStep);
  // Bounded DST-edge walk: land strictly after `from` (≤ 2 steps).
  let guard = 0;
  while (candidate.getTime() <= fromMs && guard < 8) {
    candidate = addWallClockDays(config.timezone, candidate, daysPerStep);
    guard++;
  }
  if (candidate.getTime() <= fromMs) {
    // Degenerate guard (unreachable in practice) — absolute fallback.
    candidate = new Date(fromMs + intervalMs(config));
  }
  return candidate;
}

/** Advance a UTC instant by `days` keeping the SAME local hh:mm in `tz` (DST-safe). */
function addWallClockDays(tz: string, at: Date, days: number): Date {
  const wall = utcToWallClock(tz, at);
  return wallClockToUtc(tz, wall.y, wall.m, wall.d + days, wall.hh, wall.mm);
}

/**
 * First-run instant on ACTIVATION (create/activate) for interval mode:
 * Phase 18 started the first run ~60s after activation; Phase 22
 * preserves that exact behavior for unanchored schedules (the interval
 * then applies from the first run). Anchored schedules use their
 * wall-clock grid (the next 09:30-style occurrence — possibly today).
 */
export function computeInitialRunAt(config: ScheduleConfig, from: Date = new Date()): Date {
  if (config.startAt) return computeNextRunAt(config, from);
  return new Date(from.getTime() + 60000);
}

// ---------------------------------------------------------------------------
// Display helpers (labels only — the runner NEVER uses these)
// ---------------------------------------------------------------------------

/** Human label for a config: "Every 3 hours", "Daily at 09:30 (Asia/Kolkata)". */
export function scheduleLabel(raw: string | ScheduleConfig): string {
  const config = typeof raw === 'string' ? parsePersistedSchedule(raw) : raw;
  const frequency =
    config.every === 1
      ? config.unit === 'HOURS' ? 'Hourly' : config.unit === 'DAYS' ? 'Daily' : 'Weekly'
      : `Every ${config.every} ${config.unit === 'HOURS' ? 'hour' : config.unit === 'DAYS' ? 'day' : 'week'}s`;
  if (!config.startAt) {
    return config.timezone === 'UTC' ? frequency : `${frequency} (${config.timezone})`;
  }
  return `${frequency} at ${config.startAt} (${config.timezone})`;
}

/** Format a next-run instant in the schedule's own timezone (UI display). */
export function formatNextRunInScheduleTz(
  nextRunAt: Date | string | null,
  raw: string | ScheduleConfig
): string {
  if (!nextRunAt) return '—';
  const config = typeof raw === 'string' ? parsePersistedSchedule(raw) : raw;
  const date = typeof nextRunAt === 'string' ? new Date(nextRunAt) : nextRunAt;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(date);
}
