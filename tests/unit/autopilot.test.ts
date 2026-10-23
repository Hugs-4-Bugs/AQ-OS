// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Unit Tests
// Entitlement limits · state machine · config validation · scheduler
// · ledger idempotency · next-run computation
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock prisma (same pattern as workflows.test.ts) ──
const mockPrisma = vi.hoisted(() => ({
  autopilotWorkflow: {
    findFirst: vi.fn(), findMany: vi.fn(),
    create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), count: vi.fn(),
  },
  autopilotRun: {
    findFirst: vi.fn(), findMany: vi.fn(),
    create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn(),
  },
  autopilotLead: {
    create: vi.fn(), updateMany: vi.fn(),
    deleteMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(),
  },
  workflowDefinition: { findFirst: vi.fn(), findMany: vi.fn() },
  discoveryJob: { findUnique: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ db: mockPrisma }));
vi.mock('@/lib/lead-audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/billing-audit', () => ({ logCreditEvent: vi.fn() }));

import {
  canTransitionAutopilot,
  AUTOPILOT_TRANSITIONS,
  isAutopilotSchedule,
  SCHEDULE_INTERVAL_MS,
  AUTOPILOT_MAX_NICHES,
} from '@/lib/autopilot/constants';
import {
  normalizePlan,
  getAutopilotEntitlement,
  parseAutopilotConfig,
  checkAutopilotSlot,
  countActiveAutopilots,
} from '@/lib/autopilot/service';
import { computeNextRun } from '@/lib/autopilot/runner';

// ═══════════════════════════════════════════════════════════════════
// 1. Entitlement limits (server-side authority)
// ═══════════════════════════════════════════════════════════════════

describe('Autopilot entitlement', () => {
  it('free plan has autopilot disabled with limit 0', () => {
    const ent = getAutopilotEntitlement('free');
    expect(ent.enabled).toBe(false);
    expect(ent.limit).toBe(0);
  });

  it('starter plan has autopilot disabled with limit 0', () => {
    const ent = getAutopilotEntitlement('starter');
    expect(ent.enabled).toBe(false);
    expect(ent.limit).toBe(0);
  });

  it('pro plan has autopilot enabled with limit 3', () => {
    const ent = getAutopilotEntitlement('pro');
    expect(ent.enabled).toBe(true);
    expect(ent.limit).toBe(3);
  });

  it('elite plan has autopilot enabled with limit 7', () => {
    const ent = getAutopilotEntitlement('elite');
    expect(ent.enabled).toBe(true);
    expect(ent.limit).toBe(7);
  });

  it('normalizePlan lowercases known plans', () => {
    expect(normalizePlan('PRO')).toBe('pro');
    expect(normalizePlan('Elite')).toBe('elite');
    expect(normalizePlan('starter')).toBe('starter');
  });

  it('normalizePlan maps unknown plans to free (safe deny)', () => {
    expect(normalizePlan('enterprise')).toBe('free');
    expect(normalizePlan(undefined)).toBe('free');
    expect(normalizePlan(null)).toBe('free');
    expect(normalizePlan('PENDING')).toBe('free');
  });

  it('checkAutopilotSlot denies free/starter with PLAN_REQUIRED', async () => {
    mockPrisma.autopilotWorkflow.count.mockResolvedValue(0);
    const denied = await checkAutopilotSlot('u1', 'free');
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('PLAN_REQUIRED');
  });

  it('checkAutopilotSlot allows pro under the limit (3)', async () => {
    mockPrisma.autopilotWorkflow.count.mockResolvedValue(2);
    const ok = await checkAutopilotSlot('u1', 'pro');
    expect(ok.allowed).toBe(true);
    expect(ok.limit).toBe(3);
    expect(ok.used).toBe(2);
  });

  it('checkAutopilotSlot denies pro at the limit (3/3)', async () => {
    mockPrisma.autopilotWorkflow.count.mockResolvedValue(3);
    const denied = await checkAutopilotSlot('u1', 'pro');
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toContain('AUTOPILOT_LIMIT_REACHED');
  });

  it('checkAutopilotSlot allows elite up to 7', async () => {
    mockPrisma.autopilotWorkflow.count.mockResolvedValue(6);
    const ok = await checkAutopilotSlot('u1', 'elite');
    expect(ok.allowed).toBe(true);
    mockPrisma.autopilotWorkflow.count.mockResolvedValue(7);
    const denied = await checkAutopilotSlot('u1', 'elite');
    expect(denied.allowed).toBe(false);
  });

  it('countActiveAutopilots counts ACTIVE and RUNNING only', async () => {
    mockPrisma.autopilotWorkflow.count.mockImplementation(async ({ where }: { where: { status: { in: string[] } } }) => {
      // verify the where clause counts both ACTIVE and RUNNING
      expect(where.status.in).toEqual(expect.arrayContaining(['ACTIVE', 'RUNNING']));
      return 2;
    });
    const n = await countActiveAutopilots('u1');
    expect(n).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. State machine
// ═══════════════════════════════════════════════════════════════════

describe('Autopilot state machine', () => {
  it('allows DRAFT → ACTIVE', () => {
    expect(canTransitionAutopilot('DRAFT', 'ACTIVE')).toBe(true);
  });

  it('allows ACTIVE → RUNNING and RUNNING → ACTIVE', () => {
    expect(canTransitionAutopilot('ACTIVE', 'RUNNING')).toBe(true);
    expect(canTransitionAutopilot('RUNNING', 'ACTIVE')).toBe(true);
  });

  it('allows ACTIVE ↔ PAUSED', () => {
    expect(canTransitionAutopilot('ACTIVE', 'PAUSED')).toBe(true);
    expect(canTransitionAutopilot('PAUSED', 'ACTIVE')).toBe(true);
  });

  it('allows RUNNING → FAILED and FAILED → ACTIVE (recovery/re-activate)', () => {
    expect(canTransitionAutopilot('RUNNING', 'FAILED')).toBe(true);
    expect(canTransitionAutopilot('FAILED', 'ACTIVE')).toBe(true);
  });

  it('forbids DRAFT → RUNNING (cannot run a draft)', () => {
    expect(canTransitionAutopilot('DRAFT', 'RUNNING')).toBe(false);
  });

  it('forbids RUNNING → PAUSED (system owns RUNNING state)', () => {
    expect(canTransitionAutopilot('RUNNING', 'PAUSED')).toBe(false);
  });

  it('DISABLED is terminal', () => {
    expect(AUTOPILOT_TRANSITIONS.DISABLED).toEqual([]);
    expect(canTransitionAutopilot('DISABLED', 'ACTIVE')).toBe(false);
  });

  it('COMPLETED only transitions to DISABLED', () => {
    expect(canTransitionAutopilot('COMPLETED', 'ACTIVE')).toBe(false);
    expect(canTransitionAutopilot('COMPLETED', 'DISABLED')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Config validation (multi-niche + geography)
// ═══════════════════════════════════════════════════════════════════

describe('Autopilot config validation', () => {
  it('accepts multiple niches and dedupes case-insensitively', () => {
    const parsed = parseAutopilotConfig(['Dental', 'Hospital', 'dental'], { country: 'India', city: 'Mumbai' });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.niches).toEqual(['Dental', 'Hospital']);
      expect(parsed.value.geography).toEqual({ country: 'India', city: 'Mumbai' });
    }
  });

  it('rejects empty niche selection', () => {
    const parsed = parseAutopilotConfig([], {});
    expect(parsed.ok).toBe(false);
  });

  it('rejects non-array niches', () => {
    expect(parseAutopilotConfig('Dental', {}).ok).toBe(false);
    expect(parseAutopilotConfig(null, {}).ok).toBe(false);
  });

  it('rejects whitespace-only niches', () => {
    const parsed = parseAutopilotConfig(['   '], {});
    expect(parsed.ok).toBe(false);
  });

  it('rejects more than the max niches', () => {
    const many = Array.from({ length: AUTOPILOT_MAX_NICHES + 1 }, (_, i) => `niche ${i}`);
    const parsed = parseAutopilotConfig(many, {});
    expect(parsed.ok).toBe(false);
  });

  it('rejects non-object geography', () => {
    const parsed = parseAutopilotConfig(['Dental'], 'India');
    expect(parsed.ok).toBe(false);
  });

  it('accepts worldwide (no geography)', () => {
    const parsed = parseAutopilotConfig(['Dental'], undefined);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.geography).toEqual({});
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Schedule handling
// ═══════════════════════════════════════════════════════════════════

describe('Autopilot schedule', () => {
  it('recognizes whitelisted schedules only', () => {
    expect(isAutopilotSchedule('daily')).toBe(true);
    expect(isAutopilotSchedule('hourly')).toBe(true);
    expect(isAutopilotSchedule('every_6_hours')).toBe(true);
    expect(isAutopilotSchedule('weekly')).toBe(true);
    expect(isAutopilotSchedule('*/5 * * * *')).toBe(false);
    expect(isAutopilotSchedule('random')).toBe(false);
  });

  it('computes next run from the interval', () => {
    const from = new Date('2026-10-14T00:00:00Z');
    expect(computeNextRun('daily', from).toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(computeNextRun('hourly', from).toISOString()).toBe('2026-10-14T01:00:00.000Z');
    expect(computeNextRun('weekly', from).toISOString()).toBe('2026-10-21T00:00:00.000Z');
  });

  it('returns null for invalid schedule (no runaway scheduling)', () => {
    expect(computeNextRun('bogus')).toBeNull();
  });

  it('daily interval is 24h', () => {
    expect(SCHEDULE_INTERVAL_MS.daily).toBe(24 * 60 * 60 * 1000);
  });
});
