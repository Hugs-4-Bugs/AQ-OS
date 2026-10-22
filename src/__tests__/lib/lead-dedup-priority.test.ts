// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Lead Deduplication Priority Core (Phase 10)
// src/lib/lead-dedup-service.ts — findDuplicateMatch / buildDedupIndex
//
// Guards the STRICT priority order required by the spec:
//   1. domain  2. email  3. phone  4. normalized business name
//   5. business name + location
// and the case-insensitive / normalized / location-aware matching rules.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    lead: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/lead-audit', () => ({
  logAuditEvent: vi.fn(async () => {}),
}));

import { db } from '@/lib/db';
import {
  findDuplicateMatch,
  buildDedupIndex,
  checkDuplicate,
  type DedupIndexEntry,
} from '@/lib/lead-dedup-service';

const entry = (over: Partial<DedupIndexEntry> & { id: string }): DedupIndexEntry => ({
  businessName: 'Some Business',
  email: null,
  website: null,
  phone: null,
  city: null,
  country: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ orgId: null });
  (db.lead.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

describe('Phase 10 priority order — first matching tier wins', () => {
  it('tier 1: same website DOMAIN wins (www/case insensitive)', () => {
    const entries = [
      entry({ id: 'lead-1', businessName: 'Totally Different Name', website: 'https://www.ACME.com/deep/path' }),
    ];
    const result = findDuplicateMatch(entries, {
      businessName: 'ACME Medical Group',
      website: 'acme.com',
    });
    expect(result.isDuplicate).toBe(true);
    expect(result.duplicateOf).toBe('lead-1');
    expect(result.matchField).toBe('domain');
  });

  it('tier 2: same EMAIL (case-insensitive) matches after domain misses', () => {
    const entries = [entry({ id: 'lead-2', businessName: 'Other Biz', email: 'Info@Clinic.example' })];
    const result = findDuplicateMatch(entries, {
      businessName: 'Clinic Central',
      email: 'info@clinic.example',
    });
    expect(result.isDuplicate).toBe(true);
    expect(result.matchField).toBe('email');
  });

  it('tier 3: same PHONE (normalized digits) matches across formats', () => {
    const entries = [entry({ id: 'lead-3', businessName: 'Westside Dental', phone: '+91 98765 43210' })];
    const result = findDuplicateMatch(entries, {
      businessName: 'Eastside Dental',
      phone: '0091 9876543210',
    });
    expect(result.isDuplicate).toBe(true);
    expect(result.matchField).toBe('phone');
  });

  it('tier 4: normalized business NAME matches across legal suffixes', () => {
    const entries = [entry({ id: 'lead-4', businessName: 'Apollo Hospitals Pvt Ltd' })];
    const result = findDuplicateMatch(entries, {
      businessName: 'apollo hospitals',
    });
    expect(result.isDuplicate).toBe(true);
    expect(result.matchField).toBe('normalizedBusinessName');
  });

  it('tier 5: name + LOCATION matches when the name alone is below the bar', () => {
    const entries = [
      entry({ id: 'lead-5', businessName: 'Sunrise Clinic', city: 'Pune', country: 'India' }),
      entry({ id: 'lead-6', businessName: 'Sunrise Clinic', city: 'Austin', country: 'United States' }),
    ];
    // "Sunrise Clinic Pune" vs "Sunrise Clinic": name similarity 0.79 (≥ 0.78,
    // < 0.85) AND the city agrees with lead-5 → tier 5.
    const result = findDuplicateMatch(entries, {
      businessName: 'Sunrise Clinic Pune',
      city: 'pune',
      country: 'India',
    });
    expect(result.isDuplicate).toBe(true);
    expect(result.duplicateOf).toBe('lead-5');
    expect(result.matchField).toBe('businessNameLocation');
  });

  it('tier 4 blocks a location CONTRADICTION even for identical names', () => {
    const entries = [entry({ id: 'lead-7', businessName: 'Sunrise Clinic', city: 'Pune', country: 'India' })];
    const result = findDuplicateMatch(entries, {
      businessName: 'Sunrise Clinic',
      city: 'Austin',
      country: 'United States',
    });
    expect(result.isDuplicate).toBe(false);
  });

  it('tier 5 country-level agreement (no city on either side)', () => {
    const entries = [entry({ id: 'lead-5b', businessName: 'Sunrise Clinic', country: 'India' })];
    const result = findDuplicateMatch(entries, {
      businessName: 'Sunrise Clinic Pune',
      country: 'india',
    });
    expect(result.isDuplicate).toBe(true);
    expect(result.matchField).toBe('businessNameLocation');
  });

  it('genuinely different businesses never match', () => {
    const entries = [
      entry({ id: 'lead-8', businessName: 'Apollo Hospitals', website: 'apollo.com', email: 'a@apollo.com', phone: '+91 11111' }),
    ];
    const result = findDuplicateMatch(entries, {
      businessName: 'Zenith Fitness Studio',
      website: 'zenithfit.io',
      email: 'hello@zenithfit.io',
      phone: '+91 99999 88888',
    });
    expect(result.isDuplicate).toBe(false);
  });

  it('a candidate with no business name never matches', () => {
    const entries = [entry({ id: 'lead-9', businessName: 'Anything', email: 'x@y.com' })];
    expect(findDuplicateMatch(entries, { businessName: '' }).isDuplicate).toBe(false);
  });
});

describe('tier precedence — domain outranks email even when both match', () => {
  it('domain tier is checked FIRST (spec order)', () => {
    const entries = [
      entry({ id: 'lead-dom', businessName: 'Dom Biz', website: 'acme.com', email: 'shared@acme.com' }),
    ];
    const result = findDuplicateMatch(entries, {
      businessName: 'Other Name',
      website: 'https://www.acme.com/',
      email: 'shared@acme.com',
    });
    expect(result.matchField).toBe('domain');
  });
});

describe('buildDedupIndex (run-scoped loading)', () => {
  it('loads active leads once for a standalone user', async () => {
    (db.lead.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      entry({ id: 'l1', businessName: 'A' }),
    ]);
    const index = await buildDedupIndex('user-1');
    expect(db.lead.findMany).toHaveBeenCalledTimes(1);
    expect(index).toHaveLength(1);
    const where = (db.lead.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
    expect(where.userId).toBe('user-1');
    expect(where.isActive).toBe(true);
  });

  it('scopes to the ORG when the user belongs to one', async () => {
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ orgId: 'org-9' });
    await buildDedupIndex('user-1');
    const where = (db.lead.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
    expect(where.orgId).toBe('org-9');
    expect(where.userId).toBeUndefined();
  });
});

describe('checkDuplicate (ad-hoc path uses the same core)', () => {
  it('matches on domain through the DB-backed path', async () => {
    (db.lead.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      entry({ id: 'lead-x', businessName: 'X', website: 'https://x.com' }),
    ]);
    const result = await checkDuplicate('user-1', {
      businessName: 'X Corporation',
      website: 'www.x.com/home',
    });
    expect(result.isDuplicate).toBe(true);
    expect(result.matchField).toBe('domain');
    expect(result.duplicateOf).toBe('lead-x');
  });

  it('passes location context through for tier-5 matching', async () => {
    (db.lead.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      entry({ id: 'lead-loc', businessName: 'Sunrise Clinic', city: 'Pune' }),
    ]);
    // "The Sunrise Clinic" vs "Sunrise Clinic": similarity 0.82 (≥ 0.78,
    // < 0.85) + same city → tier 5 through the ad-hoc path.
    const result = await checkDuplicate('user-1', {
      businessName: 'The Sunrise Clinic',
      city: 'PUNE',
    });
    expect(result.isDuplicate).toBe(true);
    expect(result.matchField).toBe('businessNameLocation');
  });

  it('returns not-duplicate when the index is empty', async () => {
    const result = await checkDuplicate('user-1', { businessName: 'Fresh Biz' });
    expect(result.isDuplicate).toBe(false);
  });
});
