// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Discovery Targeting Plan (Phases 8–9)
// src/lib/lead-discovery-service.ts — buildTargetingPlan
//
// Guards the server-side parsing of multi-niche / multi-country / city
// inputs into the independent targeting combination matrix.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.DISCOVERY_ZAI_MIN_INTERVAL_MS = '0';
});

vi.mock('z-ai-web-dev-sdk', () => ({
  default: { create: vi.fn(async () => ({})) },
}));
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    lead: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    discoveryJob: { create: vi.fn(), update: vi.fn(), count: vi.fn() },
  },
}));
vi.mock('@/lib/credit-service', () => ({
  deductCredits: vi.fn(async () => ({ success: true })),
  refundCredits: vi.fn(async () => ({ success: true })),
  CREDIT_COSTS: { lead_discovery: 1 },
}));
vi.mock('@/lib/notification-service', () => ({
  createNotificationOnce: vi.fn(async () => {}),
}));
vi.mock('@/lib/lead-audit', () => ({
  logAuditEvent: vi.fn(async () => {}),
}));

import {
  buildTargetingPlan,
  TARGETING_COMBO_CAP,
  type DiscoveryParams,
} from '@/lib/lead-discovery-service';

const params = (over: Partial<DiscoveryParams>): DiscoveryParams => ({
  niche: 'hospital',
  source: 'ai_search',
  ...over,
});

describe('single-niche / single-country (the historical form)', () => {
  it('one niche + one country = one combo with that exact targeting', () => {
    const plan = buildTargetingPlan(params({ niche: 'hospital', country: 'India', city: 'Mumbai' }));
    expect(plan.invalid).toBe(false);
    expect(plan.combos).toHaveLength(1);
    expect(plan.combos[0]).toMatchObject({ niche: 'hospital', country: 'India', city: 'Mumbai' });
  });

  it('one niche, no country = one WORLDWIDE combo (country undefined)', () => {
    const plan = buildTargetingPlan(params({ niche: 'hospital' }));
    expect(plan.invalid).toBe(false);
    expect(plan.combos).toHaveLength(1);
    expect(plan.combos[0].country).toBeUndefined();
    expect(plan.countries).toEqual([]);
  });

  it('custom niche flows through the same pipeline as any other niche', () => {
    const plan = buildTargetingPlan(params({ niche: 'organic cat food suppliers', country: 'Germany' }));
    expect(plan.invalid).toBe(false);
    expect(plan.combos[0].niche).toBe('organic cat food suppliers');
  });
});

describe('multi-niche (Phase 8 — the "hospital, dentist" input)', () => {
  it('comma-separated input parses into independent niches × combos', () => {
    const plan = buildTargetingPlan(params({ niche: 'hospital, dentist', country: 'India' }));
    expect(plan.invalid).toBe(false);
    expect(plan.niches).toEqual(['hospital', 'dentist']);
    expect(plan.combos).toHaveLength(2);
    expect(plan.combos.map((c) => c.niche)).toEqual(['hospital', 'dentist']);
    // Every combo keeps the SAME country context.
    for (const combo of plan.combos) expect(combo.country).toBe('India');
  });

  it('the entire comma-joined string is NEVER a combo niche', () => {
    const plan = buildTargetingPlan(params({ niche: 'hospital, dentist' }));
    for (const combo of plan.combos) {
      expect(combo.niche).not.toContain(',');
    }
  });

  it('an explicit niches[] array takes precedence and dedupes', () => {
    const plan = buildTargetingPlan(params({ niche: 'ignored', niches: ['Hospital', 'hospital', 'gym'] }));
    expect(plan.niches).toEqual(['Hospital', 'gym']);
    expect(plan.combos).toHaveLength(2);
  });

  it('unusable niche input is rejected as invalid targeting (never guessed)', () => {
    const plan = buildTargetingPlan(params({ niche: ' , , , ' }));
    expect(plan.invalid).toBe(true);
    expect(plan.invalidReason).toMatch(/niche/i);
  });

  it('more than the niche cap is rejected honestly, not silently truncated', () => {
    const many = Array.from({ length: 9 }, (_, i) => `niche${i}`);
    const plan = buildTargetingPlan(params({ niches: many }));
    expect(plan.invalid).toBe(true);
    expect(plan.invalidReason).toMatch(/too many niches/i);
  });
});

describe('multi-country (Phase 9)', () => {
  it('multi-niche × multi-country produces the full combination matrix', () => {
    const plan = buildTargetingPlan(params({ niche: 'hospital, dentist', country: 'India, United States' }));
    expect(plan.invalid).toBe(false);
    expect(plan.combos).toHaveLength(4);
    const labels = plan.combos.map((c) => `${c.niche}|${c.country}`);
    expect(labels).toContain('hospital|India');
    expect(labels).toContain('hospital|United States');
    expect(labels).toContain('dentist|India');
    expect(labels).toContain('dentist|United States');
  });

  it('countries[] array takes precedence over the country string', () => {
    const plan = buildTargetingPlan(params({ country: 'ignored', countries: ['India', 'Brazil'] }));
    expect(plan.countries).toEqual(['India', 'Brazil']);
  });

  it('country names are canonicalized when confidently resolvable', () => {
    const plan = buildTargetingPlan(params({ country: 'india' }));
    expect(plan.combos[0].country).toBe('India');
  });

  it('a specific country is NEVER silently replaced by Worldwide', () => {
    const plan = buildTargetingPlan(params({ country: 'Atlantis' }));
    // Unresolvable country stays as the RAW value — never dropped to worldwide.
    expect(plan.combos[0].country).toBe('Atlantis');
  });

  it('country cap exceeded is rejected honestly', () => {
    const many = Array.from({ length: 11 }, (_, i) => `C${i}`);
    const plan = buildTargetingPlan(params({ countries: many }));
    expect(plan.invalid).toBe(true);
    expect(plan.invalidReason).toMatch(/too many countries/i);
  });
});

describe('city handling (optional, never mandatory)', () => {
  it('the city applies to every combo when provided', () => {
    const plan = buildTargetingPlan(params({ niche: 'hospital, dentist', country: 'India, Brazil', city: 'Mumbai' }));
    for (const combo of plan.combos) expect(combo.city).toBe('Mumbai');
  });

  it('a missing city stays missing (optional city never becomes mandatory)', () => {
    const plan = buildTargetingPlan(params({ niche: 'hospital', country: 'India' }));
    expect(plan.combos[0].city).toBeUndefined();
  });

  it('city + no country is a valid worldwide-with-city combo', () => {
    const plan = buildTargetingPlan(params({ niche: 'gym', city: 'Tokyo' }));
    expect(plan.invalid).toBe(false);
    expect(plan.combos[0].country).toBeUndefined();
    expect(plan.combos[0].city).toBe('Tokyo');
  });
});

describe('combination cap (bounded fan-out)', () => {
  it('rejects pathological niche×country counts with an actionable message', () => {
    const niches = Array.from({ length: 8 }, (_, i) => `n${i}`);
    const countries = Array.from({ length: 10 }, (_, i) => `c${i}`);
    const plan = buildTargetingPlan(params({ niches, countries }));
    expect(plan.invalid).toBe(true);
    expect(plan.invalidReason).toMatch(/too many targeting combinations/i);
    expect(TARGETING_COMBO_CAP).toBeLessThan(8 * 10);
  });
});
