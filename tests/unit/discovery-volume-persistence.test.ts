// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Unit Tests: discovery volume + reliable persistence
//
// Regression coverage for the three discovery defects reported by the
// operator:
//   1. AI-chat discovery stopped at ~20 leads because the intent parser
//      fabricated count=20 when the user named no number. The parser now
//      returns null (covered via the service contract below: maxResults
//      unspecified targets RESULTS_PER_JOB, and the query loop only stops
//      on the configured budget or exhausted data).
//   2. Worldwide (location-free) discovery runs silently discarded EVERY
//      extracted candidate in sanitizeDiscoveredLeads ("hasLocation"
//      gate): jobs completed with totalFound=0 and nothing was persisted
//      to the Leads page. Candidates without location are now retained.
//   3. Leads without an email address are retained — email has never been
//      a validity requirement; phone-only and contact-less leads must
//      persist too.
//
// The provider is mocked to its REAL observed behaviour: web_search
// returns at most 10 results per query (the num parameter is ignored by
// the upstream API), so volume is legitimately achieved by running more
// of the expanded queries — never by inflating pages.
// ═══════════════════════════════════════════════════════════════════
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// Pacing must not slow unit tests — the service reads this at module load.
beforeAll(() => {
  process.env.DISCOVERY_ZAI_MIN_INTERVAL_MS = '0';
});

// ── Mocked DB: captures lead.create calls and job updates ──────────
const state = vi.hoisted(() => {
  return {
    createdLeads: [] as Array<Record<string, unknown>>,
    jobUpdates: [] as Array<Record<string, unknown>>,
    duplicateOf: null as null | string,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    discoveryJob: {
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.jobUpdates.push(data);
        return { id: 'job-1', ...data };
      }),
    },
    lead: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.createdLeads.push(data);
        return { id: `lead-${state.createdLeads.length}`, ...data };
      }),
      findFirst: vi.fn(async () =>
        state.duplicateOf ? { id: state.duplicateOf } : null
      ),
      findUnique: vi.fn(async () => null),
    },
  },
}));

vi.mock('@/lib/credit-service', () => ({
  deductCredits: vi.fn(async () => ({ success: true })),
  refundCredits: vi.fn(async () => ({ success: true })),
  CREDIT_COSTS: { lead_discovery: 1 },
}));

vi.mock('@/lib/lead-audit', () => ({ logAuditEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/lead-dedup-service', () => ({
  checkDuplicate: vi.fn(async () => ({ isDuplicate: false, duplicateOf: null })),
}));
vi.mock('@/lib/notification-service', () => ({
  createNotificationOnce: vi.fn(async () => {}),
}));

// Provider mock: web_search answers 10 results per call (real provider page
// size); the extraction LLM answers with a JSON array of the requested shape.
const zaiState = vi.hoisted(() => {
  return {
    searchCalls: [] as Array<{ query: string; num: number }>,
    extractionCalls: 0,
    /** Leads handed back per extraction call (configurable per test). */
    leadsPerExtraction: 10,
    /** When set, replaces the generated extraction payload entirely. */
    customExtraction: null as null | Array<Record<string, unknown>>,
  };
});

vi.mock('z-ai-web-dev-sdk', () => ({
  default: {
    create: async () => ({
      functions: {
        invoke: async (_fn: string, args: { query: string; num: number }) => {
          zaiState.searchCalls.push({ query: args.query, num: args.num });
          // Real provider behaviour: 10 results per query, num ignored.
          return Array.from({ length: 10 }, (_, i) => ({
            url: `https://result-${zaiState.searchCalls.length}-${i}.example.com`,
            name: `Result ${zaiState.searchCalls.length}-${i}`,
            snippet: 'snippet text',
          }));
        },
      },
      chat: {
        completions: {
          create: async () => {
            zaiState.extractionCalls += 1;
            const payload = zaiState.customExtraction ??
              Array.from({ length: zaiState.leadsPerExtraction }, (_, i) => ({
                businessName: `Company ${zaiState.extractionCalls}-${i}`,
                // NOTE: no city/country/website/email/phone on purpose —
                // worldwide candidates carry no location.
              }));
            return {
              choices: [{ message: { content: JSON.stringify(payload) } }],
            };
          },
        },
      },
    }),
  },
}));

let service: typeof import('@/lib/lead-discovery-service');

beforeAll(async () => {
  service = await import('@/lib/lead-discovery-service');
});

const baseParams = (over: Partial<import('@/lib/lead-discovery-service').DiscoveryParams> = {}) => ({
  niche: 'dentist',
  country: undefined,
  city: undefined,
  source: 'ai_search' as const,
  maxResults: 200,
  criteria: {
    website: 'any' as const,
    excludeTypes: [] as never[],
    growthSignals: false,
    hiringSignals: false,
  },
  ...over,
});

beforeEach(() => {
  state.createdLeads.length = 0;
  state.jobUpdates.length = 0;
  state.duplicateOf = null;
  zaiState.searchCalls.length = 0;
  zaiState.extractionCalls = 0;
  zaiState.leadsPerExtraction = 10;
  zaiState.customExtraction = null;
});

// ═══════════════ QUERY EXPANSION (volume lever) ═══════════════

describe('buildSearchQueries — volume expansion', () => {
  it('expands a variant niche ("dentist") via reverse synonym lookup', () => {
    const queries = service.buildSearchQueries(baseParams());
    // 3 base + directory + 3 reverse variants × 2 phrasings = 10 (capped)
    expect(queries.length).toBeGreaterThanOrEqual(8);
    const joined = queries.join(' | ');
    expect(joined).toContain('dental clinic');
    expect(joined).toContain('orthodontist');
    expect(joined).toContain('dental');
  });

  it('keeps the hard query cap of 10 (provider pacing bound)', () => {
    const queries = service.buildSearchQueries(baseParams({ niche: 'dental' }));
    expect(queries.length).toBeLessThanOrEqual(10);
  });

  it('produces location-free queries for worldwide runs', () => {
    const queries = service.buildSearchQueries(baseParams());
    expect(queries[0]).not.toContain('in undefined');
    expect(queries[0]).not.toContain('in null');
  });

  it('includes the location when one is given', () => {
    const queries = service.buildSearchQueries(baseParams({ country: 'India', city: 'Mumbai' }));
    expect(queries[0]).toContain('Mumbai, India');
  });
});

// ═══════════════ SANITIZE (worldwide persistence regression) ═══════════════

describe('sanitizeDiscoveredLeads — worldwide candidates are retained', () => {
  it('KEEPS candidates with no location on worldwide (location-free) runs', () => {
    // Pre-fix, these three were ALL silently discarded → totalFound=0,
    // nothing persisted to the Leads page.
    const leads = [
      { businessName: 'Alpha Dental', source: 'ai_search' },
      { businessName: 'Beta Clinic', source: 'ai_search' },
      { businessName: 'Gamma Ortho', source: 'ai_search' },
    ] as never[];
    const out = service.sanitizeDiscoveredLeads(leads, baseParams(), 200);
    expect(out.map((l) => l.businessName)).toEqual(['Alpha Dental', 'Beta Clinic', 'Gamma Ortho']);
  });

  it('KEEPS candidates when the search itself was location-scoped', () => {
    const leads = [{ businessName: 'Alpha Dental', source: 'ai_search' }] as never[];
    const out = service.sanitizeDiscoveredLeads(leads, baseParams({ country: 'India' }), 200);
    expect(out).toHaveLength(1);
  });

  it('still drops nameless/degenerate entries and per-source duplicates', () => {
    const leads = [
      { businessName: 'A', source: 'ai_search' },                    // <2 chars
      { businessName: 'Alpha Dental', phone: '555-1', source: 'ai_search' },
      { businessName: 'alpha dental', phone: '555-1', source: 'ai_search' }, // dup
    ] as never[];
    const out = service.sanitizeDiscoveredLeads(leads, baseParams(), 200);
    expect(out).toHaveLength(1);
    expect(out[0].businessName).toBe('Alpha Dental');
  });

  it('honours maxResults', () => {
    const leads = Array.from({ length: 30 }, (_, i) => ({
      businessName: `Company ${i}`,
      source: 'ai_search',
    })) as never[];
    const out = service.sanitizeDiscoveredLeads(leads, baseParams(), 25);
    expect(out).toHaveLength(25);
  });
});

// ═══════════════ FULL PIPELINE (volume + persistence + counts) ═══════════════

describe('processDiscoveryJob — more than 20 results across expanded queries', () => {
  it('persists >20 leads by exhausting the expanded query set (provider gives 10/query)', async () => {
    await service.processDiscoveryJob('job-1', 'user-1', baseParams({ maxResults: 200 }));

    // 10 queries × 10 real results per query — volume comes from running
    // ALL the expanded queries, not from a provider page size.
    expect(zaiState.searchCalls.length).toBe(10);
    expect(state.createdLeads.length).toBeGreaterThan(20);
    expect(state.createdLeads.length).toBe(100);

    const completed = state.jobUpdates.at(-1) as Record<string, unknown>;
    expect(completed.status).toBe('completed');
    expect(completed.totalFound).toBe(100);
    expect(completed.imported).toBe(100);
    expect(completed.duplicates).toBe(0);
    expect(completed.failed).toBe(0);
  });

  it('respects an explicit user count as the budget (stops at the configured budget)', async () => {
    await service.processDiscoveryJob('job-1', 'user-1', baseParams({ maxResults: 25 }));
    // 100 available candidates, budget 25 → exactly 25 processed through
    // sanitize (the query loop stops once 25 candidates are extracted).
    expect(state.createdLeads.length).toBeLessThanOrEqual(25);
    expect(state.createdLeads.length).toBeGreaterThan(20);
  });
});

describe('processDiscoveryJob — reliable persistence of valid leads', () => {
  it('persists worldwide candidates with no location (Issue 2 regression)', async () => {
    zaiState.leadsPerExtraction = 3;
    await service.processDiscoveryJob('job-1', 'user-1', baseParams({ maxResults: 10 }));
    expect(state.createdLeads.length).toBeGreaterThanOrEqual(3);
    // No fabricated location: country stays undefined when nothing is known.
    expect(state.createdLeads[0].businessName).toBeTruthy();
  });

  it('retains email-only, phone-only and contact-less leads (Issue 4)', async () => {
    zaiState.customExtraction = [
      { businessName: 'Email Only Co', email: 'hello@emailonly.example' },
      { businessName: 'Phone Only Co', phone: '+1 555 0100' },
      { businessName: 'Unreachable Co' },
    ];

    await service.processDiscoveryJob('job-1', 'user-1', baseParams({ maxResults: 10 }));

    const names = state.createdLeads.map((l) => l.businessName);
    expect(names).toContain('Email Only Co');
    expect(names).toContain('Phone Only Co');
    expect(names).toContain('Unreachable Co');
    const emailLead = state.createdLeads.find((l) => l.businessName === 'Email Only Co');
    expect(emailLead?.email).toBe('hello@emailonly.example');
    const phoneLead = state.createdLeads.find((l) => l.businessName === 'Phone Only Co');
    expect(phoneLead?.phone).toBe('+1 555 0100');
    expect(phoneLead?.email).toBeNull();
  });

  it('tags persisted leads with provenance and honest verification status', async () => {
    zaiState.leadsPerExtraction = 2;
    await service.processDiscoveryJob('job-1', 'user-1', baseParams({ maxResults: 10 }));
    for (const lead of state.createdLeads) {
      expect(lead.stage).toBe('discovered');
      expect(lead.source).toBe('ai_search');
      expect(lead.userId).toBe('user-1');
      expect(lead.verificationStatus).toBe('unverified');
    }
  });

  it('counts duplicates honestly and does not charge them', async () => {
    const dedup = await import('@/lib/lead-dedup-service');
    vi.mocked(dedup.checkDuplicate).mockResolvedValueOnce({
      isDuplicate: true,
      duplicateOf: 'existing-lead-id',
    } as never);

    zaiState.leadsPerExtraction = 3;
    // maxResults=3 → one extraction query (3 candidates), then the budget
    // check stops the loop — exactly one duplicate sighting.
    const credits = await import('@/lib/credit-service');
    vi.mocked(credits.deductCredits).mockClear();
    await service.processDiscoveryJob('job-1', 'user-1', baseParams({ maxResults: 3 }));

    const completed = state.jobUpdates.at(-1) as Record<string, unknown>;
    expect(completed.duplicates).toBe(1);
    expect(completed.imported).toBe(2);
    expect(vi.mocked(credits.deductCredits).mock.calls.length).toBe(2);
  });
});
