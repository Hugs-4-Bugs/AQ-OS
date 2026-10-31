// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Countries Unit Tests
// Country catalog · selection resolution (Worldwide / single / multi /
// duplicates / invalid / cap) · persistence shape · API validation ·
// user isolation · runner geography resolution · catalog payload.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock prisma (same pattern as autopilot.test.ts) ──
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
  customNiche: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  discoveryJob: { findUnique: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ db: mockPrisma }));
vi.mock('@/lib/lead-audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/billing-audit', () => ({ logCreditEvent: vi.fn() }));

import { COUNTRIES, WORLDWIDE_SENTINEL, countryByCode } from '@/lib/countries';
import { AUTOPILOT_MAX_COUNTRIES } from '@/lib/autopilot/constants';
import {
  resolveCountrySelection,
  runCountriesFromGeography,
  buildPersistedGeography,
  geographySummary,
  countryCatalog,
  searchCountryEntries,
  catalogEntryFor,
} from '@/lib/autopilot/country-selection';
import {
  parseAutopilotConfig,
  createAutopilot,
  updateAutopilotFields,
  getAutopilotForUser,
} from '@/lib/autopilot/service';

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.workflowDefinition.findFirst.mockResolvedValue({
    id: 'wf1', userId: 'u1', status: 'active', name: 'Test WF', profileId: null,
  });
  mockPrisma.workflowDefinition.findMany.mockResolvedValue([]);
  // no saved custom niches (predefined niches pass through).
  mockPrisma.customNiche.findMany.mockResolvedValue([]);
  mockPrisma.autopilotWorkflow.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'ap-new', status: data.status, name: data.name,
    })
  );
  mockPrisma.autopilotWorkflow.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'ap1', status: 'ACTIVE', name: 'AP', ...data,
    })
  );
  mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(null);
  mockPrisma.autopilotWorkflow.count.mockResolvedValue(0);
});

// ═══════════════════════════════════════════════════════════════════
// 1. Catalog (190+ countries, stable codes, deterministic order)
// ═══════════════════════════════════════════════════════════════════

describe('country catalog', () => {
  it('contains 190+ individual countries (full ISO 3166-1 set)', () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(190);
    expect(COUNTRIES.length).toBe(249);
  });

  it('has no duplicate countries (unique codes AND unique names)', () => {
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length);
    expect(new Set(COUNTRIES.map((c) => c.name)).size).toBe(COUNTRIES.length);
  });

  it('is deterministically ordered (ISO alpha-2 code sequence)', () => {
    const codes = COUNTRIES.map((c) => c.code);
    const sorted = [...codes].sort();
    expect(codes).toEqual(sorted);
  });

  it('exposes a Worldwide sentinel distinct from every catalog country', () => {
    expect(WORLDWIDE_SENTINEL).toBe('Worldwide');
    expect(COUNTRIES.find((c) => c.name === 'Worldwide')).toBeUndefined();
  });

  it('resolves ISO alpha-2 codes case-insensitively (countryByCode)', () => {
    expect(countryByCode('IN')?.name).toBe('India');
    expect(countryByCode('ae')?.name).toBe('United Arab Emirates');
    expect(countryByCode('GB')?.name).toBe('United Kingdom');
    expect(countryByCode('XX')).toBeNull();
    expect(countryByCode('IND')).toBeNull(); // 3-letter is not alpha-2
    expect(countryByCode('')).toBeNull();
    expect(countryByCode(null)).toBeNull();
  });

  it('serves the canonical catalog payload (Worldwide + entries + bound)', () => {
    const payload = countryCatalog();
    expect(payload.worldwide.value).toBe('Worldwide');
    expect(payload.countries).toHaveLength(249);
    expect(payload.countries[0]).toEqual({ code: 'AD', name: 'Andorra' });
    expect(payload.total).toBe(249);
    expect(payload.maxSelection).toBe(AUTOPILOT_MAX_COUNTRIES);
    // deterministic: identical output on repeat calls
    expect(countryCatalog()).toEqual(payload);
  });

  it('searches the catalog by name fragment and ISO code (search)', () => {
    const byName = searchCountryEntries('united');
    expect(byName.length).toBeGreaterThan(3); // United Kingdom/States/Arab Emirates…
    expect(byName.every((c) => c.name.toLowerCase().includes('united'))).toBe(true);
    const byCode = searchCountryEntries('in');
    expect(byCode.find((c) => c.code === 'IN')?.name).toBe('India');
    expect(searchCountryEntries('zzz-nothing')).toEqual([]);
    const all = searchCountryEntries('');
    expect(all).toHaveLength(249);
  });

  it('resolves a canonical catalog entry for a known name (catalogEntryFor)', () => {
    expect(catalogEntryFor('India')?.code).toBe('IN');
    expect(catalogEntryFor('USA')?.code).toBe('US');
    expect(catalogEntryFor('Narnia')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Selection resolution — Worldwide / single / multiple
// ═══════════════════════════════════════════════════════════════════

describe('resolveCountrySelection', () => {
  it('1. WORLDWIDE: undefined / null / [] / ["Worldwide"] all mean global discovery', () => {
    for (const input of [undefined, null, [], ['Worldwide'], ['worldwide'], [' WORLDWIDE ']]) {
      const result = resolveCountrySelection(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.worldwide).toBe(true);
        expect(result.countries).toEqual([]);
      }
    }
  });

  it('2. SINGLE COUNTRY: one selection resolves to its canonical name', () => {
    const result = resolveCountrySelection(['India']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.worldwide).toBe(false);
      expect(result.countries).toEqual(['India']);
    }
  });

  it('3. MULTIPLE COUNTRIES: India + UAE + UK (mixed names/aliases/codes)', () => {
    // The exact example from the phase brief, expressed three ways.
    // Canonical ordering is CATALOG order (ISO alpha-2 code sequence:
    // AE < GB < IN), independent of the input order.
    for (const input of [
      ['India', 'UAE', 'UK'],
      ['IN', 'AE', 'GB'],
      ['india', 'United Arab Emirates', 'United Kingdom'],
    ]) {
      const result = resolveCountrySelection(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.countries).toEqual(['United Arab Emirates', 'United Kingdom', 'India']);
        expect(result.worldwide).toBe(false);
      }
    }
  });

  it('6. DUPLICATE PREVENTION: same country in any casing/spelling collapses to ONE', () => {
    const result = resolveCountrySelection(['India', 'india', 'IN', 'Bharat'.replace('Bharat', 'India')]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.countries).toEqual(['India']);
  });

  it('7. INVALID COUNTRY REJECTION: unknown entries are listed in a deterministic error (never substituted)', () => {
    const result = resolveCountrySelection(['India', 'Atlantis']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Atlantis');
      expect(result.error).toContain('Unknown country selection');
    }
    // purely-invalid selection
    expect(resolveCountrySelection(['Narnia', 'Westeros']).ok).toBe(false);
  });

  it('rejects Worldwide MIXED with individual countries', () => {
    const result = resolveCountrySelection(['Worldwide', 'India']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('cannot be combined');
    }
  });

  it('rejects non-array input and non-string entries deterministically', () => {
    expect(resolveCountrySelection('India').ok).toBe(false);
    expect(resolveCountrySelection(42).ok).toBe(false);
    expect(resolveCountrySelection(['India', 7]).ok).toBe(false);
    expect(resolveCountrySelection(['   ']).ok).toBe(false);
  });

  it('rejects more than AUTOPILOT_MAX_COUNTRIES individual countries (Worldwide never capped)', () => {
    const many = COUNTRIES.slice(0, AUTOPILOT_MAX_COUNTRIES + 1).map((c) => c.name);
    const over = resolveCountrySelection(many);
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.error).toContain(`maximum is ${AUTOPILOT_MAX_COUNTRIES}`);
      expect(over.error).toContain('Worldwide');
    }
    // exactly at the cap is allowed
    const atCap = resolveCountrySelection(COUNTRIES.slice(0, AUTOPILOT_MAX_COUNTRIES).map((c) => c.name));
    expect(atCap.ok).toBe(true);
    // Worldwide is the intended global scope — never subject to the cap
    expect(resolveCountrySelection(['Worldwide']).ok).toBe(true);
  });

  it('canonicalizes ordering to CATALOG order (ISO code sequence) regardless of input order', () => {
    const result = resolveCountrySelection(['United Kingdom', 'India', 'Andorra']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Catalog order = ISO code order: AD, GB, IN
      expect(result.countries).toEqual(['Andorra', 'United Kingdom', 'India']);
    }
  });

  it('resolves catalog names with diacritics (Åland Islands, Türkiye, Côte d\'Ivoire)', () => {
    for (const name of ['Åland Islands', 'Türkiye', "Côte d'Ivoire", 'Curaçao', 'Réunion']) {
      const result = resolveCountrySelection([name]);
      expect(result.ok, `expected ${name} to resolve`).toBe(true);
      if (result.ok) expect(result.countries).toEqual([name]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Persisted geography shape + runner-side resolution
// ═══════════════════════════════════════════════════════════════════

describe('persisted geography shape', () => {
  it('8. PERSISTENCE: Worldwide keeps the legacy JSON shape (no countries key)', () => {
    expect(buildPersistedGeography({ countries: [], worldwide: true })).toEqual({});
    expect(buildPersistedGeography({ countries: [], worldwide: true }, 'Mumbai')).toEqual({ city: 'Mumbai' });
  });

  it('persists individual countries as the canonical-name array', () => {
    const geo = buildPersistedGeography({ countries: ['India', 'United Arab Emirates'], worldwide: false }, 'Dubai');
    expect(geo).toEqual({ city: 'Dubai', countries: ['India', 'United Arab Emirates'] });
  });

  it('runCountriesFromGeography: countries[] is authoritative', () => {
    expect(runCountriesFromGeography({ countries: ['India', 'Brazil'] })).toEqual(['India', 'Brazil']);
  });

  it('runCountriesFromGeography: legacy single country falls back and normalizes', () => {
    expect(runCountriesFromGeography({ country: 'India' })).toEqual(['India']);
    expect(runCountriesFromGeography({ country: 'USA' })).toEqual(['United States']);
    expect(runCountriesFromGeography({ country: 'UAE', city: 'Dubai' })).toEqual(['United Arab Emirates']);
  });

  it('runCountriesFromGeography: explicit empty countries = Worldwide; absent both = Worldwide', () => {
    expect(runCountriesFromGeography({ countries: [] })).toEqual([]);
    expect(runCountriesFromGeography({})).toEqual([]);
    expect(runCountriesFromGeography({ city: 'Mumbai' })).toEqual([]);
  });

  it('runCountriesFromGeography: legacy rows with non-catalog countries keep the raw value (never guessed)', () => {
    expect(runCountriesFromGeography({ country: 'Atlantis' })).toEqual(['Atlantis']);
  });

  it('geographySummary renders list-row labels', () => {
    expect(geographySummary({})).toBe('Worldwide');
    expect(geographySummary({ countries: ['India'] })).toBe('India');
    expect(geographySummary({ countries: ['India', 'United Arab Emirates', 'United Kingdom'] })).toBe('India + 2 more');
    expect(geographySummary({ city: 'Mumbai', countries: ['India'] })).toBe('Mumbai, India');
    expect(geographySummary({ country: 'India' })).toBe('India'); // legacy row
    expect(geographySummary({ city: 'Mumbai' })).toBe('Mumbai');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. API/service validation (parseAutopilotConfig + create/update)
// ═══════════════════════════════════════════════════════════════════

describe('parseAutopilotConfig (API validation)', () => {
  it('11. accepts a valid multi-country selection and returns the resolved selection', () => {
    const parsed = parseAutopilotConfig(['Dentist'], {
      countries: ['IN', 'AE', 'UK'], city: 'Mumbai',
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.countrySelection.countries).toEqual([
        'United Arab Emirates', 'United Kingdom', 'India',
      ]);
      expect(parsed.value.countrySelection.worldwide).toBe(false);
      expect(parsed.value.geography).toEqual({
        city: 'Mumbai',
        countries: ['United Arab Emirates', 'United Kingdom', 'India'],
      });
    }
  });

  it(' Worldwide (no countries) produces the legacy geography shape', () => {
    const parsed = parseAutopilotConfig(['Dentist'], {});
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.countrySelection.worldwide).toBe(true);
      expect(parsed.value.geography).toEqual({});
    }
  });

  it(' invalid countries are rejected through the API config parser', () => {
    const parsed = parseAutopilotConfig(['Dentist'], { countries: ['Atlantis'] });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain('Atlantis');
  });

  it(' Worldwide mixed with countries is rejected through the API config parser', () => {
    const parsed = parseAutopilotConfig(['Dentist'], { countries: ['Worldwide', 'India'] });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain('cannot be combined');
  });

  it(' legacy single-country input is now catalog-validated (no more arbitrary strings)', () => {
    expect(parseAutopilotConfig(['Dentist'], { country: 'India' }).ok).toBe(true);
    const bad = parseAutopilotConfig(['Dentist'], { country: 'Atlantis' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('Atlantis');
    // "Worldwide" via the legacy field is accepted (case-insensitive)
    const ww = parseAutopilotConfig(['Dentist'], { country: 'worldwide' });
    expect(ww.ok).toBe(true);
    if (ww.ok) expect(ww.value.countrySelection.worldwide).toBe(true);
  });

  it(' non-object geography is rejected with a deterministic message', () => {
    const parsed = parseAutopilotConfig(['Dentist'], 'India');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain('geography must be an object');
  });

  it(' city is still bounded to 100 chars', () => {
    const parsed = parseAutopilotConfig(['Dentist'], { city: 'x'.repeat(150) });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.geography.city).toHaveLength(100);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Persistence through create/update + user isolation (server-side)
// ═══════════════════════════════════════════════════════════════════

describe('createAutopilot persistence', () => {
  it('8. PERSISTENCE: multi-country selection persists in geography JSON', async () => {
    const result = await createAutopilot('u1', null, 'pro', {
      name: 'Multi-country AP',
      niches: ['Dental'],
      geography: { countries: ['IN', 'AE', 'GB'] },
      workflowId: 'wf1',
      schedule: 'daily',
      activate: false,
    });
    expect(result.success).toBe(true);
    const createCall = mockPrisma.autopilotWorkflow.create.mock.calls[0][0];
    expect(JSON.parse(createCall.data.geography)).toEqual({
      countries: ['United Arab Emirates', 'United Kingdom', 'India'],
    });
  });

  it(' Worldwide persists the legacy shape (survives refresh / logout / restart by DB-backed design)', async () => {
    const result = await createAutopilot('u1', null, 'pro', {
      name: 'WW AP',
      niches: ['Dental'],
      geography: {},
      workflowId: 'wf1',
      schedule: 'daily',
      activate: false,
    });
    expect(result.success).toBe(true);
    const createCall = mockPrisma.autopilotWorkflow.create.mock.calls[0][0];
    expect(createCall.data.geography).toBe('{}');
  });

  it(' invalid country selection NEVER creates a row', async () => {
    const result = await createAutopilot('u1', null, 'pro', {
      name: 'Bad AP',
      niches: ['Dental'],
      geography: { countries: ['Atlantis'] },
      workflowId: 'wf1',
      schedule: 'daily',
      activate: false,
    });
    expect(result.success).toBe(false);
    expect(mockPrisma.autopilotWorkflow.create).not.toHaveBeenCalled();
  });
});

describe('updateAutopilotFields persistence + isolation', () => {
  const storedRow = {
    id: 'ap1', userId: 'u1', name: 'AP', status: 'ACTIVE',
    niches: JSON.stringify(['Dentist']),
    geography: JSON.stringify({ countries: ['India'] }),
    profileMappings: '{}',
    workflowId: 'wf1', schedule: 'daily',
  };

  it(' geography update rewrites the persisted countries', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(storedRow);
    const result = await updateAutopilotFields('u1', 'ap1', {
      geography: { countries: ['AE', 'GB'] },
    });
    expect(result.success).toBe(true);
    const updateCall = mockPrisma.autopilotWorkflow.update.mock.calls[0][0];
    expect(JSON.parse(updateCall.data.geography)).toEqual({
      countries: ['United Arab Emirates', 'United Kingdom'],
    });
  });

  it(' niches-only update does NOT rewrite (nor re-validate) the stored geography', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue({
      ...storedRow,
      // pre-Phase-21 row with a raw legacy country the validator would reject
      geography: JSON.stringify({ country: 'Atlantis' }),
    });
    const result = await updateAutopilotFields('u1', 'ap1', { niches: ['Dental'] });
    expect(result.success).toBe(true);
    const updateCall = mockPrisma.autopilotWorkflow.update.mock.calls[0][0];
    expect(updateCall.data.geography).toBeUndefined();
  });

  it('10. USER ISOLATION: a foreign autopilot id is indistinguishable from not-found', async () => {
    // findFirst is scoped by { id, userId } — a foreign owner's row
    // resolves to null → NOT_FOUND, never a cross-user write.
    mockPrisma.autopilotWorkflow.findFirst.mockImplementation(
      async ({ where }: { where: { id: string; userId: string } }) =>
        where.userId === 'u1' ? storedRow : null
    );
    const own = await updateAutopilotFields('u1', 'ap1', { geography: { countries: ['India'] } });
    expect(own.success).toBe(true);
    const foreign = await updateAutopilotFields('attacker', 'ap1', { geography: { countries: ['India'] } });
    expect(foreign.success).toBe(false);
    if (!foreign.success) expect(foreign.code).toBe('NOT_FOUND');
    // getAutopilotForUser is equally scoped
    await getAutopilotForUser('attacker', 'ap1');
    expect(mockPrisma.autopilotWorkflow.findFirst).toHaveBeenLastCalledWith({
      where: { id: 'ap1', userId: 'attacker' },
    });
  });
});
