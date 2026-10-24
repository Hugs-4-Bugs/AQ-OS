// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Phase 22 Autopilot Schedule Unit Tests
//
// Canonical schedule module: validation (interval/unit/timezone/start),
// persistence round-trip + legacy compatibility, timezone-aware
// next-run computation (hourly · arbitrary intervals · daily · weekly
// · DST edge cases · fixed/half-hour zones), start-time anchoring,
// pause/resume/disable semantics, ownership scoping, and billing
// neutrality of schedule operations (0 credits).
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  autopilotWorkflow: {
    findFirst: vi.fn(), findMany: vi.fn(),
    create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), count: vi.fn(),
  },
  autopilotRun: {
    findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(),
    create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn(),
  },
  autopilotLead: { create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  workflowDefinition: { findFirst: vi.fn(), findMany: vi.fn() },
  discoveryJob: { findUnique: vi.fn(), create: vi.fn() },
  lead: { findFirst: vi.fn() },
  workflowExecution: { findUnique: vi.fn(), update: vi.fn() },
  workflowExecutionLead: { findMany: vi.fn() },
  businessProfile: { findFirst: vi.fn() },
  __ledger: new Set<string>(),
}));

vi.mock('@/lib/db', () => ({ db: mockPrisma }));
vi.mock('@/lib/lead-audit', () => ({ logAuditEvent: vi.fn() }));

// Billing audit must NEVER be called by schedule operations.
const mockLogCreditEvent = vi.hoisted(() => vi.fn());
vi.mock('@/lib/billing-audit', () => ({ logCreditEvent: mockLogCreditEvent }));

// Service dependencies (niche resolution + entitlements) mocked so the
// tests focus on SCHEDULE behavior.
vi.mock('@/lib/niches', () => ({
  resolveNicheSelection: vi.fn(async (_userId: string, niches: string[]) => ({ ok: true, niches })),
  parseProfileMappings: vi.fn((_raw: unknown, _niches: string[]) => ({ ok: true, value: {} })),
  validateProfileMappingsOwnership: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/entitlement-service', () => ({
  getEntitlements: vi.fn(() => ({ autopilot_access: { enabled: true, limit: 3 } })),
}));

import {
  parseScheduleInput,
  parsePersistedSchedule,
  serializeSchedule,
  computeNextRunAt,
  computeInitialRunAt,
  scheduleLabel,
  formatNextRunInScheduleTz,
  isValidTimezone,
  type ScheduleConfig,
} from '@/lib/autopilot/schedule';
import { computeNextRun } from '@/lib/autopilot/runner';
import {
  createAutopilot,
  updateAutopilotFields,
  transitionAutopilot,
  listAutopilots,
} from '@/lib/autopilot/service';

const at = (iso: string) => new Date(iso);

// ═══════════════════════════════════════════════════════════════════
// 1. Input validation (categories 3 · 19 · 20)
// ═══════════════════════════════════════════════════════════════════

describe('Phase 22 schedule validation', () => {
  it('accepts every legacy whitelist string with interval-mode equivalents', () => {
    expect(parseScheduleInput('hourly')).toEqual({
      ok: true, config: { every: 1, unit: 'HOURS', timezone: 'UTC', startAt: null, anchorDate: null, enabled: true },
    });
    expect(parseScheduleInput('every_6_hours').config?.every).toBe(6);
    expect(parseScheduleInput('every_6_hours').config?.unit).toBe('HOURS');
    expect(parseScheduleInput('every_12_hours').config?.every).toBe(12);
    expect(parseScheduleInput('daily').config).toMatchObject({ every: 1, unit: 'DAYS', timezone: 'UTC' });
    expect(parseScheduleInput('weekly').config).toMatchObject({ every: 1, unit: 'WEEKS' });
  });

  it('accepts the canonical object shape (category 1: schedule creation)', () => {
    const r = parseScheduleInput({ every: 3, unit: 'HOURS', timezone: 'Asia/Kolkata' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config).toEqual({
      every: 3, unit: 'HOURS', timezone: 'Asia/Kolkata', startAt: null, anchorDate: null, enabled: true,
    });
  });

  it('normalizes unit case and singular forms', () => {
    for (const unit of ['hours', 'Hours', 'HOUR', 'hour']) {
      expect(parseScheduleInput({ every: 2, unit, timezone: 'UTC' }).config?.unit).toBe('HOURS');
    }
    expect(parseScheduleInput({ every: 2, unit: 'Days', timezone: 'UTC' }).config?.unit).toBe('DAYS');
    expect(parseScheduleInput({ every: 2, unit: 'week', timezone: 'UTC' }).config?.unit).toBe('WEEKS');
  });

  it('accepts a string `every` and normalizes HH:mm:ss startAt to HH:mm', () => {
    const r = parseScheduleInput({ every: '5', unit: 'hours', timezone: 'UTC', startAt: '09:30:00' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.every).toBe(5);
    expect(r.config.startAt).toBe('09:30');
  });

  it('rejects invalid intervals (category 20)', () => {
    for (const bad of [0, -1, 1.5, 'abc', NaN, null, undefined, '']) {
      const r = parseScheduleInput({ every: bad, unit: 'HOURS', timezone: 'UTC' });
      expect(r.ok).toBe(false);
    }
    expect(parseScheduleInput({ every: 1.5, unit: 'HOURS', timezone: 'UTC' }).error).toContain('whole number');
  });

  it('enforces per-unit interval caps (169 hours / 366 days / 53 weeks rejected)', () => {
    expect(parseScheduleInput({ every: 169, unit: 'HOURS', timezone: 'UTC' }).ok).toBe(false);
    expect(parseScheduleInput({ every: 168, unit: 'HOURS', timezone: 'UTC' }).ok).toBe(true);
    expect(parseScheduleInput({ every: 366, unit: 'DAYS', timezone: 'UTC' }).ok).toBe(false);
    expect(parseScheduleInput({ every: 365, unit: 'DAYS', timezone: 'UTC' }).ok).toBe(true);
    expect(parseScheduleInput({ every: 53, unit: 'WEEKS', timezone: 'UTC' }).ok).toBe(false);
    expect(parseScheduleInput({ every: 52, unit: 'WEEKS', timezone: 'UTC' }).ok).toBe(true);
  });

  it('rejects non-whitelist units (no sub-hour granularity)', () => {
    expect(parseScheduleInput({ every: 30, unit: 'MINUTES', timezone: 'UTC' }).ok).toBe(false);
    expect(parseScheduleInput({ every: 1, unit: 'MONTHS', timezone: 'UTC' }).ok).toBe(false);
    expect(parseScheduleInput({ every: 1, timezone: 'UTC' }).ok).toBe(false);
  });

  it('rejects invalid timezones (category 19) and accepts valid IANA ids', () => {
    expect(parseScheduleInput({ every: 1, unit: 'HOURS', timezone: 'Mars/Olympus' }).ok).toBe(false);
    expect(parseScheduleInput({ every: 1, unit: 'HOURS', timezone: '' }).ok).toBe(false);
    expect(parseScheduleInput({ every: 1, unit: 'HOURS', timezone: 42 }).ok).toBe(false);
    expect(parseScheduleInput({ every: 1, unit: 'HOURS', timezone: 'Asia/Kolkata' }).ok).toBe(true);
    expect(parseScheduleInput({ every: 1, unit: 'HOURS', timezone: 'America/New_York' }).ok).toBe(true);
    expect(parseScheduleInput({ every: 1, unit: 'HOURS', timezone: 'Asia/Calcutta' }).ok).toBe(true);
    expect(isValidTimezone('Asia/Kathmandu')).toBe(true);
    expect(isValidTimezone('Not/AZone')).toBe(false);
  });

  it('rejects invalid start times', () => {
    for (const bad of ['25:00', '9:30', '09:5', '09-30', 'ab:cd', 123]) {
      expect(parseScheduleInput({ every: 1, unit: 'DAYS', timezone: 'UTC', startAt: bad }).ok).toBe(false);
    }
    expect(parseScheduleInput({ every: 1, unit: 'DAYS', timezone: 'UTC', startAt: '00:00' }).ok).toBe(true);
    expect(parseScheduleInput({ every: 1, unit: 'DAYS', timezone: 'UTC', startAt: '23:59' }).ok).toBe(true);
    expect(parseScheduleInput({ every: 1, unit: 'DAYS', timezone: 'UTC', startAt: '' }).config?.startAt).toBeNull();
    expect(parseScheduleInput({ every: 1, unit: 'DAYS', timezone: 'UTC', startAt: null }).config?.startAt).toBeNull();
  });

  it('defaults timezone to UTC and enabled to true; accepts enabled:false', () => {
    const r = parseScheduleInput({ every: 1, unit: 'HOURS' });
    expect(r.config?.timezone).toBe('UTC');
    expect(r.config?.enabled).toBe(true);
    expect(parseScheduleInput({ every: 1, unit: 'HOURS', enabled: false }).config?.enabled).toBe(false);
  });

  it('rejects non-object/non-string schedule inputs', () => {
    for (const bad of [null, 42, true, ['daily'], '*/5 * * * *', 'random']) {
      expect(parseScheduleInput(bad).ok).toBe(false);
    }
  });

  it('never trusts a client-provided anchorDate (server-authoritative)', () => {
    const r = parseScheduleInput({
      every: 1, unit: 'DAYS', timezone: 'UTC', startAt: '09:30', anchorDate: '1999-01-01',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.anchorDate).not.toBe('1999-01-01');
    expect(r.config.anchorDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Persistence round-trip + legacy reads (category 2 · 6)
// ═══════════════════════════════════════════════════════════════════

describe('Phase 22 schedule persistence', () => {
  it('round-trips a canonical config through serialize → parsePersistedSchedule', () => {
    const config: ScheduleConfig = {
      every: 3, unit: 'HOURS', timezone: 'Asia/Kolkata', startAt: '09:30',
      anchorDate: '2026-10-24', enabled: true,
    };
    const persisted = serializeSchedule(config);
    expect(persisted).toBe(
      '{"every":3,"unit":"HOURS","timezone":"Asia/Kolkata","startAt":"09:30","anchorDate":"2026-10-24","enabled":true}'
    );
    expect(parsePersistedSchedule(persisted)).toEqual(config);
  });

  it('parses legacy whitelist strings from the schedule column', () => {
    expect(parsePersistedSchedule('daily')).toEqual({
      every: 1, unit: 'DAYS', timezone: 'UTC', startAt: null, anchorDate: null, enabled: true,
    });
    expect(parsePersistedSchedule('hourly').unit).toBe('HOURS');
    expect(parsePersistedSchedule('weekly').unit).toBe('WEEKS');
  });

  it('falls back safely on garbage/missing values (never throws)', () => {
    expect(parsePersistedSchedule('banana')).toEqual(parsePersistedSchedule('daily'));
    expect(parsePersistedSchedule('')).toEqual(parsePersistedSchedule('daily'));
    expect(parsePersistedSchedule(null)).toEqual(parsePersistedSchedule('daily'));
    expect(parsePersistedSchedule('{"every":')).toEqual(parsePersistedSchedule('daily'));
    // Field-level fallbacks for corrupted JSON.
    const bad = parsePersistedSchedule('{"every":0,"unit":"MINUTES","timezone":"Nope","startAt":"99:99"}');
    expect(bad).toEqual({ every: 1, unit: 'DAYS', timezone: 'UTC', startAt: null, anchorDate: null, enabled: true });
    // Anchored row missing a valid anchorDate → deterministic fallback.
    const noAnchor = parsePersistedSchedule('{"every":1,"unit":"WEEKS","timezone":"UTC","startAt":"09:30"}');
    expect(noAnchor.anchorDate).toBe('1970-01-01');
    // enabled:false is honored.
    expect(parsePersistedSchedule('{"every":1,"unit":"DAYS","timezone":"UTC","enabled":false}').enabled).toBe(false);
  });

  it('delegates computeNextRun for legacy strings EXACTLY as before (compat)', () => {
    const from = at('2026-10-14T00:00:00.000Z');
    expect(computeNextRun('daily', from).toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(computeNextRun('hourly', from).toISOString()).toBe('2026-10-14T01:00:00.000Z');
    expect(computeNextRun('weekly', from).toISOString()).toBe('2026-10-21T00:00:00.000Z');
    expect(computeNextRun('bogus')).toBeNull();
    expect(computeNextRun('')).toBeNull();
  });

  it('routes canonical JSON strings through the timezone-aware engine', () => {
    const from = at('2026-10-14T00:00:00.000Z');
    const json = serializeSchedule({ every: 2, unit: 'HOURS', timezone: 'UTC', startAt: null, anchorDate: null, enabled: true });
    expect(computeNextRun(json, from).toISOString()).toBe('2026-10-14T02:00:00.000Z');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Next-run engine (categories 4 · 5 · 7 · 8 + DST edges)
// ═══════════════════════════════════════════════════════════════════

describe('Phase 22 next-run engine — interval mode (legacy semantics)', () => {
  it('hourly: next = from + 1h (category 4)', () => {
    const cfg: ScheduleConfig = { every: 1, unit: 'HOURS', timezone: 'UTC', startAt: null, anchorDate: null, enabled: true };
    expect(computeNextRunAt(cfg, at('2026-10-24T10:00:00Z')).toISOString()).toBe('2026-10-24T11:00:00.000Z');
  });

  it('arbitrary intervals: 5 hours / 5 days / 2 weeks (category 5)', () => {
    const base = at('2026-10-24T10:00:00Z');
    const h5: ScheduleConfig = { every: 5, unit: 'HOURS', timezone: 'Europe/Berlin', startAt: null, anchorDate: null, enabled: true };
    expect(computeNextRunAt(h5, base).toISOString()).toBe('2026-10-24T15:00:00.000Z');
    const d5: ScheduleConfig = { every: 5, unit: 'DAYS', timezone: 'UTC', startAt: null, anchorDate: null, enabled: true };
    expect(computeNextRunAt(d5, base).toISOString()).toBe('2026-10-29T10:00:00.000Z');
    const w2: ScheduleConfig = { every: 2, unit: 'WEEKS', timezone: 'UTC', startAt: null, anchorDate: null, enabled: true };
    expect(computeNextRunAt(w2, base).toISOString()).toBe('2026-11-07T10:00:00.000Z');
  });
});

describe('Phase 22 next-run engine — anchored mode (start time, category 8)', () => {
  // Asia/Kolkata = UTC+5:30 (no DST). 09:30 IST = 04:00Z.
  const ist = (over: Partial<ScheduleConfig> = {}): ScheduleConfig => ({
    every: 3, unit: 'HOURS', timezone: 'Asia/Kolkata', startAt: '09:30',
    anchorDate: '2026-10-24', enabled: true, ...over,
  });

  it('spec example: 09:30 Asia/Kolkata every 3h — 10:30 IST → next 12:30 IST (07:00Z)', () => {
    expect(computeNextRunAt(ist(), at('2026-10-24T05:00:00Z')).toISOString()).toBe('2026-10-24T07:00:00.000Z');
  });

  it('before today\'s anchor → the anchor itself is the first run', () => {
    expect(computeNextRunAt(ist(), at('2026-10-24T03:00:00Z')).toISOString()).toBe('2026-10-24T04:00:00.000Z');
  });

  it('exactly at the anchor → strictly after (the next grid point)', () => {
    expect(computeNextRunAt(ist(), at('2026-10-24T04:00:00Z')).toISOString()).toBe('2026-10-24T07:00:00.000Z');
  });

  it('the grid continues around the clock (21:30 IST → 00:30 IST next day)', () => {
    expect(computeNextRunAt(ist(), at('2026-10-24T16:30:00Z')).toISOString()).toBe('2026-10-24T19:00:00.000Z');
  });

  it('daily anchored: America/New_York 09:30 — afternoon → tomorrow 09:30 EDT (13:30Z)', () => {
    const cfg: ScheduleConfig = { every: 1, unit: 'DAYS', timezone: 'America/New_York', startAt: '09:30', anchorDate: '2026-10-24', enabled: true };
    expect(computeNextRunAt(cfg, at('2026-10-24T15:00:00Z')).toISOString()).toBe('2026-10-25T13:30:00.000Z');
    expect(computeNextRunAt(cfg, at('2026-10-24T12:00:00Z')).toISOString()).toBe('2026-10-24T13:30:00.000Z');
  });

  it('every 5 days anchored: from day 22 → next grid day is 26th 08:00 UTC', () => {
    const cfg: ScheduleConfig = { every: 5, unit: 'DAYS', timezone: 'UTC', startAt: '08:00', anchorDate: '2026-10-01', enabled: true };
    expect(computeNextRunAt(cfg, at('2026-10-23T12:00:00Z')).toISOString()).toBe('2026-10-26T08:00:00.000Z');
  });

  it('weekly anchored: stays on the anchor weekday (category 5)', () => {
    const cfg: ScheduleConfig = { every: 1, unit: 'WEEKS', timezone: 'UTC', startAt: '09:30', anchorDate: '2026-10-20', enabled: true };
    expect(computeNextRunAt(cfg, at('2026-10-24T00:00:00Z')).toISOString()).toBe('2026-10-27T09:30:00.000Z');
    expect(computeNextRunAt(cfg, at('2026-10-27T09:30:00Z')).toISOString()).toBe('2026-11-03T09:30:00.000Z');
  });

  it('missed occurrences while inactive are skipped (no catch-up storm)', () => {
    const cfg: ScheduleConfig = { every: 1, unit: 'DAYS', timezone: 'UTC', startAt: '09:30', anchorDate: '2026-10-01', enabled: true };
    // 20 days of missed slots → the NEXT future occurrence, not a replay.
    const next = computeNextRunAt(cfg, at('2026-10-21T10:00:00Z'));
    expect(next.toISOString()).toBe('2026-10-22T09:30:00.000Z');
    expect(next.getTime()).toBeGreaterThan(at('2026-10-21T10:00:00Z').getTime());
  });
});

describe('Phase 22 next-run engine — timezone differences (category 7)', () => {
  it('the same wall-clock start yields different UTC instants per timezone', () => {
    const kolkata: ScheduleConfig = { every: 1, unit: 'DAYS', timezone: 'Asia/Kolkata', startAt: '09:30', anchorDate: '2026-10-24', enabled: true };
    const newYork: ScheduleConfig = { every: 1, unit: 'DAYS', timezone: 'America/New_York', startAt: '09:30', anchorDate: '2026-10-24', enabled: true };
    expect(computeNextRunAt(kolkata, at('2026-10-24T00:00:00Z')).toISOString()).toBe('2026-10-24T04:00:00.000Z');
    expect(computeNextRunAt(newYork, at('2026-10-24T00:00:00Z')).toISOString()).toBe('2026-10-24T13:30:00.000Z');
    // 09:30 IST is NOT 09:30 UTC — the engine never treats startAt as UTC.
  });

  it('half-hour offset zone: Asia/Kathmandu (+05:45) 09:15 → 03:30Z', () => {
    const cfg: ScheduleConfig = { every: 1, unit: 'DAYS', timezone: 'Asia/Kathmandu', startAt: '09:15', anchorDate: '2026-10-24', enabled: true };
    expect(computeNextRunAt(cfg, at('2026-10-24T05:00:00Z')).toISOString()).toBe('2026-10-25T03:30:00.000Z');
  });
});

describe('Phase 22 next-run engine — DST edge cases', () => {
  it('fall-back (America/New_York 2026-11-01): daily 09:30 stays 09:30 local (UTC instant shifts +1h)', () => {
    const cfg: ScheduleConfig = { every: 1, unit: 'DAYS', timezone: 'America/New_York', startAt: '09:30', anchorDate: '2026-10-30', enabled: true };
    // 10-30 09:30 EDT = 13:30Z; 10-31 09:30 EDT = 13:30Z; 11-01 09:30 EST = 14:30Z.
    expect(computeNextRunAt(cfg, at('2026-10-30T15:00:00Z')).toISOString()).toBe('2026-10-31T13:30:00.000Z');
    expect(computeNextRunAt(cfg, at('2026-10-31T15:00:00Z')).toISOString()).toBe('2026-11-01T14:30:00.000Z');
  });

  it('spring-forward (America/New_York 2026-03-08): daily 02:30 in the gap resolves AFTER the gap (03:30 EDT)', () => {
    const cfg: ScheduleConfig = { every: 1, unit: 'DAYS', timezone: 'America/New_York', startAt: '02:30', anchorDate: '2026-03-07', enabled: true };
    expect(computeNextRunAt(cfg, at('2026-03-08T06:00:00Z')).toISOString()).toBe('2026-03-08T07:30:00.000Z');
  });

  it('fall-back ambiguity (01:30 exists twice) resolves to the FIRST (earlier) instant', () => {
    const cfg: ScheduleConfig = { every: 1, unit: 'DAYS', timezone: 'America/New_York', startAt: '01:30', anchorDate: '2026-11-01', enabled: true };
    // Configured before the transition: first run = the earlier 01:30 (EDT) = 05:30Z.
    expect(computeNextRunAt(cfg, at('2026-11-01T04:00:00Z')).toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });

  it('Europe/Berlin fall-back (2026-10-25): daily 09:30 stays 09:30 local', () => {
    const cfg: ScheduleConfig = { every: 1, unit: 'DAYS', timezone: 'Europe/Berlin', startAt: '09:30', anchorDate: '2026-10-24', enabled: true };
    // 10-24 09:30 CEST = 07:30Z; 10-25 09:30 CET = 08:30Z.
    expect(computeNextRunAt(cfg, at('2026-10-24T09:00:00Z')).toISOString()).toBe('2026-10-25T08:30:00.000Z');
  });

  it('anchored weekly grids cross DST keeping the local wall time', () => {
    const cfg: ScheduleConfig = { every: 1, unit: 'WEEKS', timezone: 'America/New_York', startAt: '09:30', anchorDate: '2026-10-25', enabled: true };
    // Anchor Sunday 10-25 09:30 EDT = 13:30Z; next Sunday 11-01 09:30 EST = 14:30Z.
    expect(computeNextRunAt(cfg, at('2026-10-25T15:00:00Z')).toISOString()).toBe('2026-11-01T14:30:00.000Z');
  });
});

describe('Phase 22 initial-run semantics (activation)', () => {
  it('interval mode keeps the Phase 18 ~60s activation grace', () => {
    const cfg: ScheduleConfig = { every: 6, unit: 'HOURS', timezone: 'UTC', startAt: null, anchorDate: null, enabled: true };
    const t0 = Date.now();
    const first = computeInitialRunAt(cfg, at('2026-10-24T10:00:00Z'));
    expect(first.toISOString()).toBe('2026-10-24T10:01:00.000Z');
    expect(t0).toBeGreaterThan(0);
  });

  it('anchored mode starts at the next wall-clock occurrence (possibly today)', () => {
    const cfg: ScheduleConfig = { every: 1, unit: 'DAYS', timezone: 'Asia/Kolkata', startAt: '18:00', anchorDate: '2026-10-24', enabled: true };
    // 12:00 IST (06:30Z) → first run today 18:00 IST = 12:30Z.
    expect(computeInitialRunAt(cfg, at('2026-10-24T06:30:00Z')).toISOString()).toBe('2026-10-24T12:30:00.000Z');
  });
});

describe('Phase 22 schedule labels + display', () => {
  it('labels interval and anchored configs', () => {
    expect(scheduleLabel({ every: 3, unit: 'HOURS', timezone: 'UTC', startAt: null, anchorDate: null, enabled: true })).toBe('Every 3 hours');
    expect(scheduleLabel({ every: 1, unit: 'DAYS', timezone: 'UTC', startAt: null, anchorDate: null, enabled: true })).toBe('Daily');
    expect(scheduleLabel({ every: 1, unit: 'WEEKS', timezone: 'UTC', startAt: null, anchorDate: null, enabled: true })).toBe('Weekly');
    expect(scheduleLabel({ every: 1, unit: 'DAYS', timezone: 'Asia/Kolkata', startAt: '09:30', anchorDate: null, enabled: true })).toBe('Daily at 09:30 (Asia/Kolkata)');
    expect(scheduleLabel('daily')).toBe('Daily');
  });

  it('formats the next run in the schedule timezone (category 7 display side)', () => {
    const cfg: ScheduleConfig = { every: 1, unit: 'DAYS', timezone: 'Asia/Kolkata', startAt: '09:30', anchorDate: '2026-10-24', enabled: true };
    const text = formatNextRunInScheduleTz(at('2026-10-25T04:00:00Z'), cfg);
    expect(text).toContain('Oct 25');
    expect(text).toContain('09:30');
    expect(text).toContain('GMT+5:30');
    expect(formatNextRunInScheduleTz(null, cfg)).toBe('—');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Service integration (categories 1 · 2 · 6 · 9 · 10 · 11 · 18 · 21 · 23)
// ═══════════════════════════════════════════════════════════════════

const CREATE_INPUT = {
  name: 'P22 Schedule Autopilot',
  niches: ['Dental'],
  geography: { countries: ['India'] },
  workflowId: 'wf1',
  activate: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.workflowDefinition.findFirst.mockResolvedValue({ id: 'wf1', userId: 'u1', status: 'active', name: 'Test WF', profileId: null });
  mockPrisma.autopilotWorkflow.count.mockResolvedValue(0);
  mockPrisma.autopilotWorkflow.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'ap_new', status: data.status, name: data.name,
  }));
  mockPrisma.autopilotWorkflow.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'ap1', name: 'AP', status: data.status ?? 'ACTIVE',
  }));
});

describe('Phase 22 service — createAutopilot schedule handling', () => {
  it('persists the canonical schedule JSON + timezone (categories 1 · 2 · 6)', async () => {
    const result = await createAutopilot('u1', null, 'pro', {
      ...CREATE_INPUT,
      schedule: { every: 3, unit: 'HOURS', timezone: 'Asia/Kolkata', startAt: '09:30' },
    });
    expect(result.success).toBe(true);
    const data = mockPrisma.autopilotWorkflow.create.mock.calls[0][0].data;
    const persisted = parsePersistedSchedule(data.schedule);
    expect(persisted).toMatchObject({ every: 3, unit: 'HOURS', timezone: 'Asia/Kolkata', startAt: '09:30', enabled: true });
    expect(persisted.anchorDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Anchored + ACTIVE → next run is a real future grid point.
    expect(data.nextRunAt instanceof Date).toBe(true);
    expect((data.nextRunAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it('legacy string schedules keep working (backward compatibility)', async () => {
    const result = await createAutopilot('u1', null, 'pro', { ...CREATE_INPUT, schedule: 'daily' });
    expect(result.success).toBe(true);
    const data = mockPrisma.autopilotWorkflow.create.mock.calls[0][0].data;
    expect(parsePersistedSchedule(data.schedule)).toMatchObject({ every: 1, unit: 'DAYS', timezone: 'UTC', enabled: true });
    // Interval mode keeps the ~60s first-run grace.
    const ms = (data.nextRunAt as Date).getTime() - Date.now();
    expect(ms).toBeGreaterThan(30_000);
    expect(ms).toBeLessThan(90_000);
  });

  it('rejects an invalid timezone BEFORE any row exists', async () => {
    const result = await createAutopilot('u1', null, 'pro', {
      ...CREATE_INPUT,
      schedule: { every: 1, unit: 'DAYS', timezone: 'Mars/Olympus' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('timezone');
    expect(result.code).toBe('VALIDATION');
    expect(mockPrisma.autopilotWorkflow.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid interval BEFORE any row exists', async () => {
    const result = await createAutopilot('u1', null, 'pro', {
      ...CREATE_INPUT,
      schedule: { every: 999, unit: 'DAYS', timezone: 'UTC' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('between 1 and 365');
    expect(mockPrisma.autopilotWorkflow.create).not.toHaveBeenCalled();
  });

  it('a disabled schedule on an ACTIVE row gets nextRunAt = null', async () => {
    await createAutopilot('u1', null, 'pro', {
      ...CREATE_INPUT,
      schedule: { every: 1, unit: 'DAYS', timezone: 'UTC', enabled: false },
    });
    const data = mockPrisma.autopilotWorkflow.create.mock.calls[0][0].data;
    expect(parsePersistedSchedule(data.schedule).enabled).toBe(false);
    expect(data.nextRunAt).toBeNull();
  });

  it('schedule operations never touch billing (category 21: 0 credits)', async () => {
    await createAutopilot('u1', null, 'pro', { ...CREATE_INPUT, schedule: 'daily' });
    expect(mockLogCreditEvent).not.toHaveBeenCalled();
  });
});

describe('Phase 22 service — updateAutopilotFields schedule handling', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'ap1', userId: 'u1', orgId: null, name: 'AP', status: 'ACTIVE',
    niches: JSON.stringify(['Dental']), geography: JSON.stringify({ countries: ['India'] }),
    profileMappings: '{}', workflowId: 'wf1',
    schedule: serializeSchedule({ every: 1, unit: 'DAYS', timezone: 'UTC', startAt: null, anchorDate: null, enabled: true }),
    nextRunAt: null, lastRunAt: null, lastError: null, runCount: 0,
    totalDiscovered: 0, totalSaved: 0, totalProcessed: 0, totalExecutions: 0,
    createdAt: new Date(), updatedAt: new Date(),
    ...over,
  });

  it('recomputes nextRunAt canonically when an ACTIVE row\'s schedule changes', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(row());
    const result = await updateAutopilotFields('u1', 'ap1', {
      schedule: { every: 2, unit: 'HOURS', timezone: 'Asia/Kolkata', startAt: '09:30' },
    });
    expect(result.success).toBe(true);
    const data = mockPrisma.autopilotWorkflow.update.mock.calls[0][0].data;
    expect(parsePersistedSchedule(data.schedule)).toMatchObject({ every: 2, unit: 'HOURS', timezone: 'Asia/Kolkata' });
    expect(data.nextRunAt instanceof Date).toBe(true);
  });

  it('a niches-only update NEVER touches the stored schedule or geography (category 23)', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(row());
    const result = await updateAutopilotFields('u1', 'ap1', { niches: ['Dental', 'Cafe'] });
    expect(result.success).toBe(true);
    const data = mockPrisma.autopilotWorkflow.update.mock.calls[0][0].data;
    expect(data.schedule).toBeUndefined();
    expect(data.geography).toBeUndefined();
    expect(data.nextRunAt).toBeUndefined();
  });

  it('disabling the schedule on an ACTIVE row clears nextRunAt and keeps the config (category 11)', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(row());
    const result = await updateAutopilotFields('u1', 'ap1', {
      schedule: { every: 1, unit: 'DAYS', timezone: 'Asia/Kolkata', startAt: '09:30', enabled: false },
    });
    expect(result.success).toBe(true);
    const data = mockPrisma.autopilotWorkflow.update.mock.calls[0][0].data;
    const persisted = parsePersistedSchedule(data.schedule);
    expect(persisted.enabled).toBe(false);
    expect(persisted.startAt).toBe('09:30');
    expect(persisted.timezone).toBe('Asia/Kolkata');
    expect(data.nextRunAt).toBeNull();
  });

  it('a PAUSED row keeps nextRunAt unset when its schedule is edited', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(row({ status: 'PAUSED' }));
    await updateAutopilotFields('u1', 'ap1', { schedule: { every: 1, unit: 'HOURS', timezone: 'UTC' } });
    const data = mockPrisma.autopilotWorkflow.update.mock.calls[0][0].data;
    expect(parsePersistedSchedule(data.schedule).every).toBe(1);
    expect(data.nextRunAt).toBeUndefined();
  });

  it('rejects an invalid schedule update with NO row mutation', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(row());
    const result = await updateAutopilotFields('u1', 'ap1', { schedule: { every: 0, unit: 'DAYS', timezone: 'UTC' } });
    expect(result.success).toBe(false);
    expect(mockPrisma.autopilotWorkflow.update).not.toHaveBeenCalled();
  });

  it('ownership: lookups are scoped { id, userId } — foreign rows are NOT_FOUND (category 18)', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(null);
    const result = await updateAutopilotFields('u2', 'ap1', { schedule: 'daily' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
    expect(mockPrisma.autopilotWorkflow.findFirst).toHaveBeenCalledWith({ where: { id: 'ap1', userId: 'u2' } });
    expect(mockPrisma.autopilotWorkflow.update).not.toHaveBeenCalled();
  });
});

describe('Phase 22 service — pause / resume / disable transitions (categories 9 · 10 · 11)', () => {
  const baseRow = (over: Record<string, unknown> = {}) => ({
    id: 'ap1', userId: 'u1', orgId: null, name: 'AP', status: 'ACTIVE',
    niches: JSON.stringify(['Dental']), geography: '{}', profileMappings: '{}', workflowId: 'wf1',
    schedule: serializeSchedule({ every: 1, unit: 'DAYS', timezone: 'Asia/Kolkata', startAt: '09:30', anchorDate: '2026-10-24', enabled: true }),
    nextRunAt: null, lastRunAt: null, lastError: null, runCount: 0,
    totalDiscovered: 0, totalSaved: 0, totalProcessed: 0, totalExecutions: 0,
    createdAt: new Date(), updatedAt: new Date(),
    ...over,
  });

  it('PAUSE stops scheduling: nextRunAt → null, schedule config kept (category 9)', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(baseRow({ nextRunAt: at('2027-01-01T00:00:00Z') }));
    const result = await transitionAutopilot('u1', 'pro', 'ap1', 'PAUSED');
    expect(result.success).toBe(true);
    const data = mockPrisma.autopilotWorkflow.update.mock.calls[0][0].data;
    expect(data.status).toBe('PAUSED');
    expect(data.nextRunAt).toBeNull();
    // The stored schedule string is NOT rewritten by a status transition.
    expect(data.schedule).toBeUndefined();
  });

  it('RESUME with a still-future nextRunAt keeps it (category 10)', async () => {
    const future = at('2027-06-01T00:00:00Z');
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(baseRow({ status: 'PAUSED', nextRunAt: future }));
    await transitionAutopilot('u1', 'pro', 'ap1', 'ACTIVE');
    const data = mockPrisma.autopilotWorkflow.update.mock.calls[0][0].data;
    expect(data.status).toBe('ACTIVE');
    expect((data.nextRunAt as Date).toISOString()).toBe(future.toISOString());
  });

  it('RESUME with a stale nextRunAt recalculates from the schedule config (timezone-aware)', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(baseRow({ status: 'PAUSED', nextRunAt: at('2020-01-01T00:00:00Z') }));
    await transitionAutopilot('u1', 'pro', 'ap1', 'ACTIVE');
    const data = mockPrisma.autopilotWorkflow.update.mock.calls[0][0].data;
    expect(data.status).toBe('ACTIVE');
    expect(data.nextRunAt instanceof Date).toBe(true);
    // Recomputed on the 09:30 IST grid — a future instant.
    expect((data.nextRunAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it('RESUME of a legacy daily schedule recalculates now + 24h (interval mode)', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(baseRow({ status: 'PAUSED', schedule: 'daily', nextRunAt: null }));
    await transitionAutopilot('u1', 'pro', 'ap1', 'ACTIVE');
    const data = mockPrisma.autopilotWorkflow.update.mock.calls[0][0].data;
    const ms = (data.nextRunAt as Date).getTime() - Date.now();
    expect(ms).toBeGreaterThan(23 * 60 * 60 * 1000 - 5000);
    expect(ms).toBeLessThan(25 * 60 * 60 * 1000);
  });

  it('activating a DISABLED-schedule row (enabled=false) gets nextRunAt = null', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(baseRow({
      status: 'PAUSED',
      schedule: serializeSchedule({ every: 1, unit: 'DAYS', timezone: 'UTC', startAt: null, anchorDate: null, enabled: false }),
    }));
    await transitionAutopilot('u1', 'pro', 'ap1', 'ACTIVE');
    const data = mockPrisma.autopilotWorkflow.update.mock.calls[0][0].data;
    expect(data.status).toBe('ACTIVE');
    expect(data.nextRunAt).toBeNull();
  });

  it('FAILED → ACTIVE re-activation recalculates the next run (failure recovery)', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(baseRow({ status: 'FAILED', nextRunAt: null, lastError: 'boom' }));
    await transitionAutopilot('u1', 'pro', 'ap1', 'ACTIVE');
    const data = mockPrisma.autopilotWorkflow.update.mock.calls[0][0].data;
    expect(data.status).toBe('ACTIVE');
    expect(data.lastError).toBeNull();
    expect(data.nextRunAt instanceof Date).toBe(true);
  });
});

describe('Phase 22 service — list serialization exposes the canonical config', () => {
  it('listAutopilots returns scheduleConfig + scheduleLabel (API surface)', async () => {
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([
      {
        id: 'ap1', userId: 'u1', orgId: null, name: 'AP', status: 'ACTIVE',
        niches: '["Dental"]', geography: '{"countries":["India"]}', profileMappings: '{}', workflowId: 'wf1',
        schedule: serializeSchedule({ every: 3, unit: 'HOURS', timezone: 'Asia/Kolkata', startAt: '09:30', anchorDate: '2026-10-24', enabled: true }),
        nextRunAt: at('2026-10-24T07:00:00Z'), lastRunAt: null, lastError: null, runCount: 0,
        totalDiscovered: 0, totalSaved: 0, totalProcessed: 0, totalExecutions: 0,
        createdAt: new Date(), updatedAt: new Date(),
      },
      {
        id: 'ap2', userId: 'u1', orgId: null, name: 'Legacy', status: 'PAUSED',
        niches: '["Cafe"]', geography: '{}', profileMappings: '{}', workflowId: 'wf1',
        schedule: 'daily', nextRunAt: null, lastRunAt: null, lastError: null, runCount: 0,
        totalDiscovered: 0, totalSaved: 0, totalProcessed: 0, totalExecutions: 0,
        createdAt: new Date(), updatedAt: new Date(),
      },
    ]);
    mockPrisma.workflowDefinition.findMany.mockResolvedValue([{ id: 'wf1', name: 'WF', status: 'active' }]);
    const items = await listAutopilots('u1');
    expect(items[0].scheduleConfig).toMatchObject({ every: 3, unit: 'HOURS', timezone: 'Asia/Kolkata', startAt: '09:30' });
    expect(items[0].scheduleLabel).toBe('Every 3 hours at 09:30 (Asia/Kolkata)');
    // Legacy rows serialize through the tolerant parse.
    expect(items[1].scheduleConfig).toMatchObject({ every: 1, unit: 'DAYS', timezone: 'UTC' });
    expect(items[1].scheduleLabel).toBe('Daily');
    // Phase 21 geography is untouched alongside the new fields.
    expect(items[0].geography).toEqual({ countries: ['India'] });
  });
});
