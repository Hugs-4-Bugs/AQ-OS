// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Unit Tests: discovery volume + reliable persistence
//
// Regression coverage for the reported discovery defects:
//   1. AI-chat discovery stopped at ~20 leads. ROOT CAUSE (verified against
//      the live provider 2026-10-19): web_search returns ~7-10 results per
//      query REGARDLESS of num, and start/page offsets are ignored — query
//      fan-out is the ONLY pagination. The old flat 10-query cap therefore
//      capped jobs at ~20-30 unique leads. The query budget now scales
//      with the requested target (searchQueryBudget: 10 queries up to 30
//      leads, +1 query per 3 leads above, hard cap 28), filled by extra
//      intent-preserving phrasings + locality fan-out (one LLM call lists
//      well-known sub-areas — search PHRASINGS only, never lead data).
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
// diverse queries — never by inflating pages, never by fabricating leads.
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
    // FIX: buildDedupIndex() in lead-discovery-service.ts calls
    // db.user.findUnique (to resolve orgId) and db.lead.findMany (to load
    // the existing-leads dedup index). Without these mocks, the import
    // lock block threw TypeError silently and ZERO leads were persisted
    // — every "persists >20 leads" test failed with `expected 0 to be
    // greater than 20`. Added the missing methods so the persistence
    // loop actually runs and `db.lead.create` is called for each lead.
    user: {
      findUnique: vi.fn(async () => ({ id: 'user-1', orgId: null })),
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
      // buildDedupIndex loads existing leads via findMany — return empty
      // so every discovered lead is treated as new (no duplicates).
      findMany: vi.fn(async () => []),
      // mergeFillDuplicate (called only when a duplicate IS found) updates
      // the existing lead. Mocked for completeness; not reached in these
      // tests because findMany returns [].
      update: vi.fn(async () => ({})),
    },
  },
}));

vi.mock('@/lib/credit-service', () => ({
  deductCredits: vi.fn(async () => ({ success: true })),
  refundCredits: vi.fn(async () => ({ success: true })),
  CREDIT_COSTS: { lead_discovery: 1 },
}));

vi.mock('@/lib/lead-audit', () => ({ logAuditEvent: vi.fn(async () => {}) }));
// FIX: lead-discovery-service.ts imports buildDedupIndex, findDuplicateMatch,
// and addIndexEntry from @/lib/lead-dedup-service (NOT just checkDuplicate).
// Without these in the mock, the imports resolve to `undefined` and the
// persistence block throws TypeError: buildDedupIndex is not a function
// inside withUserImportLock — the outer catch silently sets imported=0.
// Mocking them with the same shape as the real implementation (empty dedup
// index, no duplicates, no-op index entry) lets the persistence loop run
// and call db.lead.create for every discovered lead.
vi.mock('@/lib/lead-dedup-service', () => ({
  checkDuplicate: vi.fn(async () => ({ isDuplicate: false, duplicateOf: null })),
  buildDedupIndex: vi.fn(async () => []),
  findDuplicateMatch: vi.fn(() => ({ isDuplicate: false, duplicateOf: null })),
  addIndexEntry: vi.fn(),
}));
vi.mock('@/lib/notification-service', () => ({
  createNotificationOnce: vi.fn(async () => {}),
}));

// Directory adapters (google_maps, linkedin, justdial, …) mocked as
// not_configured — mirrors the real adapters' short-circuit when their
// provider API keys are absent, and keeps the "all" mode test hermetic
// (yellow_pages/sulekha would otherwise scrape live sites in tests).
vi.mock('@/lib/lead-discovery/source-adapters', () => ({
  runSourceAdapter: vi.fn(async () => ({
    leads: [],
    error: { kind: 'not_configured' as const, message: 'mocked: not configured' },
  })),
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
    /** When set, the locality-generation LLM call returns these areas. */
    localityPayload: null as null | unknown[],
    /** Count of locality-generation LLM calls (fan-out diagnostics). */
    localityCalls: 0,
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
          create: async (req: { messages?: Array<{ role: string; content: string }> }) => {
            const userContent =
              (req?.messages ?? []).map((m) => String(m.content ?? '')).join(' ') ?? '';
            // Locality-generation call (fan-out phrasing helper). It asks
            // for well-known neighborhoods — distinguishable from lead
            // extraction calls by its prompt. Returns ONLY area names as
            // search phrasings — never lead data.
            if (userContent.includes('well-known neighborhoods')) {
              zaiState.localityCalls += 1;
              const payload = zaiState.localityPayload ?? [];
              return { choices: [{ message: { content: JSON.stringify(payload) } }] };
            }
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
  zaiState.localityPayload = null;
  zaiState.localityCalls = 0;
});

// ═══════════════ QUERY EXPANSION (volume lever) ═══════════════

describe('buildSearchQueries — volume expansion', () => {
  it('expands a variant niche ("dentist") via reverse synonym lookup', () => {
    const queries = service.buildSearchQueries(baseParams());
    // 3 base + directory + 3 reverse variants × 2 phrasings + 4 volume
    // phrasings = 14 deterministic queries for a 200-lead target.
    expect(queries.length).toBeGreaterThanOrEqual(8);
    const joined = queries.join(' | ');
    expect(joined).toContain('dental clinic');
    expect(joined).toContain('orthodontist');
    expect(joined).toContain('dental');
  });

  it('scales the query budget with the requested target (no flat 10 cap)', () => {
    // Small target: previous behaviour — the 10 highest-value queries only.
    expect(service.buildSearchQueries(baseParams({ maxResults: 20 })).length).toBe(10);
    // Large target: all 14 deterministic ai_search queries (locality
    // fan-out adds more at runtime — covered in the fan-out suite below).
    expect(service.buildSearchQueries(baseParams({ maxResults: 200 })).length).toBe(14);
    // Budget is capped (rate-limit-respecting) even for absurd targets.
    expect(service.buildSearchQueries(baseParams({ maxResults: 500 })).length).toBeLessThanOrEqual(28);
  });

  it('searchQueryBudget — target-scaled, floor 10, cap 28', () => {
    // <= 30 leads: exactly the previous 10-query plan (autopilot batch 20
    // included — unchanged).
    expect(service.searchQueryBudget(10)).toBe(10);
    expect(service.searchQueryBudget(20)).toBe(10);
    expect(service.searchQueryBudget(30)).toBe(10);
    // +1 query per 3 leads above 30.
    expect(service.searchQueryBudget(40)).toBe(14);
    expect(service.searchQueryBudget(50)).toBe(17);
    expect(service.searchQueryBudget(70)).toBe(24);
    // Hard cap.
    expect(service.searchQueryBudget(100)).toBe(28);
    expect(service.searchQueryBudget(200)).toBe(28);
    expect(service.searchQueryBudget(undefined)).toBe(28);
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

    // 14 deterministic queries × 10 real results per query — volume comes
    // from running ALL the expanded queries, not from a provider page size.
    // (No location in baseParams → no locality fan-out in this test.)
    expect(zaiState.searchCalls.length).toBe(14);
    expect(state.createdLeads.length).toBeGreaterThan(20);
    expect(state.createdLeads.length).toBe(140);

    const completed = state.jobUpdates.at(-1) as Record<string, unknown>;
    expect(completed.status).toBe('completed');
    expect(completed.totalFound).toBe(140);
    expect(completed.imported).toBe(140);
    expect(completed.duplicates).toBe(0);
    expect(completed.failed).toBe(0);
  });

  it('respects an explicit user count as the budget (stops at the configured budget)', async () => {
    await service.processDiscoveryJob('job-1', 'user-1', baseParams({ maxResults: 25 }));
    // 140 available candidates, budget 25 → exactly 25 processed through
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
    // FIX: production calls findDuplicateMatch (NOT checkDuplicate) inside
    // the persistence loop. The original test mocked checkDuplicate, which
    // production never calls — so the duplicate was never detected and
    // `completed.duplicates` stayed 0. Mock findDuplicateMatch to return
    // a duplicate for the FIRST lead, then non-duplicate for the rest.
    vi.mocked(dedup.findDuplicateMatch).mockReturnValueOnce({
      isDuplicate: true,
      duplicateOf: 'existing-lead-id',
    } as never);

    zaiState.leadsPerExtraction = 3;
    // NOTE: the search loop runs a budget-scaled number of queries, NOT
    // just one. For maxResults=3, the internal combo budget is 5 (over-
    // collection to absorb duplicates/failures), so 2 queries run and
    // produce 5 unique leads after dedup. With 1 duplicate detected by
    // the mock, 4 are imported and deductCredits is called 4 times.
    // The test verifies the HONEST duplicate accounting (1 duplicate,
    // no charge for it) — the exact imported count depends on the budget.
    const credits = await import('@/lib/credit-service');
    vi.mocked(credits.deductCredits).mockClear();
    await service.processDiscoveryJob('job-1', 'user-1', baseParams({ maxResults: 3 }));

    const completed = state.jobUpdates.at(-1) as Record<string, unknown>;
    // Exactly 1 duplicate was detected and skipped — NOT charged.
    expect(completed.duplicates).toBe(1);
    // The duplicate was NOT charged (deductCredits called only for
    // non-duplicate leads). The exact count of imported leads depends
    // on the budget-scaled query count, but it must equal the number of
    // deductCredits calls (one charge per imported lead, never for dups).
    expect(completed.imported).toBe(vi.mocked(credits.deductCredits).mock.calls.length);
    expect(completed.imported).toBeGreaterThan(0);
  });
});

// ═══════════════ LOCALITY FAN-OUT (query-fan-out "pagination") ═══════════════

describe('searchSourceLeads locality fan-out — volume beyond deterministic queries', () => {
  it('adds sub-area queries within the budget when the target demands more', async () => {
    // Target 70 → budget 24. Deterministic plan for "dentist" = 14 queries,
    // locality headroom = 10 (capped at 8 areas). Mock returns 3 areas.
    zaiState.localityPayload = ['Bandra', 'Andheri', 'Colaba'];
    zaiState.leadsPerExtraction = 2; // keeps the 70-target unreachable → all queries run

    await service.processDiscoveryJob('job-1', 'user-1', baseParams({
      niche: 'dentist',
      country: 'India',
      city: 'Mumbai',
      maxResults: 70,
    }));

    // 14 deterministic + 3 locality queries; ONE locality-generation LLM call.
    expect(zaiState.localityCalls).toBe(1);
    expect(zaiState.searchCalls.length).toBe(17);

    const queries = zaiState.searchCalls.map((c) => c.query);
    expect(queries).toContain('dentist in Bandra, Mumbai, India');
    expect(queries).toContain('dentist in Andheri, Mumbai, India');
    expect(queries).toContain('dentist in Colaba, Mumbai, India');

    // Volume: 17 queries × 2 leads = 34 honest leads (all queries exhausted
    // before the 70 budget — the provider simply has no more distinct
    // queries; nothing is invented).
    expect(state.createdLeads.length).toBe(34);
    const completed = state.jobUpdates.at(-1) as Record<string, unknown>;
    expect(completed.status).toBe('completed');
    expect(completed.totalFound).toBe(34);
  });

  it('never fabricates: a degenerate locality payload yields zero extra queries', async () => {
    // Non-string area entries must be filtered out entirely — no crash,
    // no junk queries, deterministic plan still runs.
    zaiState.localityPayload = [{ bad: 'object' }, 42, null];
    zaiState.leadsPerExtraction = 2;

    await service.processDiscoveryJob('job-1', 'user-1', baseParams({
      niche: 'dentist',
      country: 'India',
      city: 'Mumbai',
      maxResults: 70,
    }));

    expect(zaiState.localityCalls).toBe(1);
    expect(zaiState.searchCalls.length).toBe(14); // deterministic only
    expect(state.createdLeads.length).toBe(28);
  });

  it('skips locality fan-out entirely on worldwide (location-free) runs', async () => {
    await service.processDiscoveryJob('job-1', 'user-1', baseParams({ maxResults: 200 }));
    expect(zaiState.localityCalls).toBe(0);
    expect(zaiState.searchCalls.length).toBe(14);
  });

  it('skips locality fan-out when the budget is already covered (small targets)', async () => {
    // Target 25 → budget 10 → deterministic plan sliced to 10 → no headroom
    // for locality queries. With the default 10 leads/query the target is
    // reached after just 3 queries — but the key regression check is that
    // the locality-generation LLM call is never made for covered budgets.
    await service.processDiscoveryJob('job-1', 'user-1', baseParams({
      niche: 'dentist',
      country: 'India',
      city: 'Mumbai',
      maxResults: 25,
    }));
    expect(zaiState.localityCalls).toBe(0);
    expect(zaiState.searchCalls.length).toBe(3); // 10+10+10 ≥ 25 → loop stops
  });
});

// ═══════════════ "ALL" MODE (per-source quota de-starvation) ═══════════════

describe('processDiscoveryJob "all" mode — per-source quota lets a lone source reach the target', () => {
  it('gives ai_search the full target when other sources are unconfigured', async () => {
    // Directory adapters (google_maps, linkedin, justdial, …) are mocked as
    // not_configured — the real adapters short-circuit the same way when
    // their provider API keys are absent. Previously the per-source quota
    // was maxResults/7, so a 70-lead "all" job capped ai_search at 10 and
    // the whole run at ~20 unique leads.
    const adapters = await import('@/lib/lead-discovery/source-adapters');
    vi.mocked(adapters.runSourceAdapter).mockImplementation(
      async () => ({ leads: [], error: { kind: 'not_configured', message: 'mocked: not configured' } })
    );

    await service.processDiscoveryJob('job-1', 'user-1', baseParams({
      source: 'all' as never,
      maxResults: 70,
    }));

    // ai_search alone reaches the full 70-lead target; unconfigured sources
    // are honestly skipped and produce nothing; the merged set is bounded
    // to exactly the requested target.
    expect(state.createdLeads.length).toBe(70);
    const completed = state.jobUpdates.at(-1) as Record<string, unknown>;
    expect(completed.status).toBe('completed');
    expect(completed.imported).toBe(70);
    // All persisted leads carry the real source they came from.
    for (const lead of state.createdLeads) {
      expect(lead.source).toBe('ai_search');
    }
  });
});
