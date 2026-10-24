// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Phase 21 Runner Multi-Country Unit Tests
// Discovery fan-out (per niche × country chunk) · per-country
// attribution reach-through · run country snapshot + immutability ·
// ONE parent execution + ONE flat 5-credit charge regardless of the
// country count · Phase 20 niche/profile compatibility · cross-chunk
// ledger dedup.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pacing/poll constants are read at module-load — zero them out BEFORE
// the runner module is imported so tests run instantly.
vi.hoisted(() => {
  process.env.AUTOPILOT_EXECUTION_PACING_MS = '0';
  process.env.AUTOPILOT_NICHE_PACING_MS = '0';
  process.env.AUTOPILOT_JOB_POLL_MS = '10';
  process.env.AUTOPILOT_EXECUTION_SETTLE_POLL_MS = '1';
  process.env.AUTOPILOT_EXECUTION_SETTLE_TIMEOUT_MS = '150';
});

const mockPrisma = vi.hoisted(() => ({
  autopilotWorkflow: {
    findFirst: vi.fn(), findMany: vi.fn(),
    create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), count: vi.fn(),
  },
  autopilotRun: {
    findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(),
    create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn(),
  },
  autopilotLead: {
    create: vi.fn(), updateMany: vi.fn(),
    deleteMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(),
  },
  workflowDefinition: { findFirst: vi.fn() },
  discoveryJob: { findUnique: vi.fn(), create: vi.fn() },
  lead: { findFirst: vi.fn() },
  workflowExecution: { findUnique: vi.fn(), update: vi.fn() },
  workflowExecutionLead: { findMany: vi.fn() },
  businessProfile: { findFirst: vi.fn() },
  __ledger: new Set<string>(),
}));

vi.mock('@/lib/db', () => ({ db: mockPrisma }));

const mockResolveBusinessProfileForUser = vi.hoisted(() => vi.fn());
vi.mock('@/lib/lead-intelligence', () => ({
  resolveBusinessProfileForUser: mockResolveBusinessProfileForUser,
}));

const mockStartDiscoveryJob = vi.hoisted(() => vi.fn());
const mockExecuteWorkflowBatch = vi.hoisted(() => vi.fn());
const mockCheckCreditSufficiency = vi.hoisted(() => vi.fn());

vi.mock('@/lib/lead-discovery-service', () => ({
  startDiscoveryJob: mockStartDiscoveryJob,
}));
vi.mock('@/lib/workflow-batch', () => ({
  executeWorkflowBatch: mockExecuteWorkflowBatch,
}));
vi.mock('@/lib/credit-service', () => ({
  checkCreditSufficiency: mockCheckCreditSufficiency,
  CREDIT_COSTS: { lead_discovery: 1 },
}));
const mockChargeWorkflowExecutionFee = vi.hoisted(() => vi.fn());
const mockRefundWorkflowExecutionFee = vi.hoisted(() => vi.fn());
vi.mock('@/lib/workflow-credits', () => ({
  chargeWorkflowExecutionFee: mockChargeWorkflowExecutionFee,
  refundWorkflowExecutionFee: mockRefundWorkflowExecutionFee,
  WORKFLOW_EXECUTION_FEE_CREDITS: 5,
  checkExecutionLimit: vi.fn(async () => ({ allowed: true, current: 0, limit: 500 })),
}));

import { executeAutopilotRun } from '@/lib/autopilot/runner';

function rowWith(geography: Record<string, unknown>, niches: string[] = ['Dentist'], profileMappings: Record<string, string> = {}) {
  return {
    id: 'ap1',
    userId: 'u1',
    orgId: null,
    name: 'Test Autopilot',
    status: 'RUNNING',
    niches: JSON.stringify(niches),
    geography: JSON.stringify(geography),
    profileMappings: JSON.stringify(profileMappings),
    workflowId: 'wf1',
    schedule: 'daily',
  };
}

const TWELVE_COUNTRIES = [
  'India', 'United Arab Emirates', 'United Kingdom', 'United States', 'Canada',
  'Australia', 'Germany', 'France', 'Singapore', 'Brazil', 'Japan', 'Mexico',
];

beforeEach(() => {
  vi.clearAllMocks();
  (mockPrisma.__ledger as Set<string>).clear();
  mockCheckCreditSufficiency.mockResolvedValue({ sufficient: true, balance: 100000, shortfall: 0 });
  mockPrisma.workflowDefinition.findFirst.mockResolvedValue({ id: 'wf1', userId: 'u1', status: 'active', name: 'Test WF', profileId: 'bp1' });
  mockPrisma.autopilotRun.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.autopilotRun.update.mockResolvedValue({});
  mockPrisma.autopilotWorkflow.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.autopilotWorkflow.update.mockResolvedValue({});
  mockPrisma.autopilotRun.findUnique.mockImplementation(async ({ where }: { where: { id?: string; runKey?: string } }) => {
    if (where && typeof where.runKey === 'string') return null;
    return { id: where?.id || 'run1', status: 'RUNNING', runKey: 'rk-1', executionId: null };
  });
  mockPrisma.workflowExecution.findUnique.mockResolvedValue({ status: 'completed' });
  mockPrisma.workflowExecution.update.mockResolvedValue({});
  mockPrisma.workflowExecutionLead.findMany.mockResolvedValue([]);
  mockResolveBusinessProfileForUser.mockResolvedValue({
    profile: { id: 'bp1', name: 'Profile A', preferredTone: 'professional', preferredLanguage: 'English', cta: 'Book a call' },
    source: 'workflow',
  });
  mockPrisma.autopilotLead.create.mockImplementation(async ({ data }: { data: { autopilotId: string; leadId: string } }) => {
    const seen = mockPrisma.__ledger as Set<string>;
    const key = `${data.autopilotId}:${data.leadId}`;
    if (seen.has(key)) {
      throw new Error('Unique constraint failed on the constraint: `AutopilotLead_autopilotId_leadId_key`');
    }
    seen.add(key);
    return {};
  });
  mockPrisma.autopilotLead.updateMany.mockResolvedValue({ count: 1 });
  mockExecuteWorkflowBatch.mockImplementation(
    async (_wf: string, _user: string, opts: { leads: unknown[] }) => ({
      executionId: 'exec1',
      status: 'running',
      leadCount: opts.leads.length,
      stepsCompleted: 0,
    })
  );
  mockChargeWorkflowExecutionFee.mockResolvedValue({ ok: true, alreadyProcessed: false, newBalance: 99995 });
  mockRefundWorkflowExecutionFee.mockResolvedValue({ refunded: true, newBalance: 100000 });

  // Default discovery mocks: each started job gets a sequential id and
  // completes with TWO payloads (distinct websites → distinct leads,
  // attributed to the job's targeted country — simulating the per-combo
  // attribution the discovery pipeline performs server-side).
  let jobSeq = 0;
  mockStartDiscoveryJob.mockImplementation(async (_userId: string, _params: Record<string, unknown>) => ({
    jobId: `job${++jobSeq}`,
    status: 'started',
    message: 'ok',
  }));
  mockPrisma.discoveryJob.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const n = String(where.id).replace('job', '');
    return {
      id: where.id,
      status: 'completed',
      totalFound: 2,
      imported: 2,
      duplicates: 0,
      failed: 0,
      filteredOut: 0,
      errorMessage: null,
      resultData: JSON.stringify([
        { businessName: `Lead ${n} A`, website: `https://l${n}a.example`, country: 'India' },
        { businessName: `Lead ${n} B`, website: `https://l${n}b.example`, country: 'India' },
      ]),
    };
  });
  mockPrisma.lead.findFirst.mockImplementation(async ({ where }: { where: { website?: string } }) => {
    if (!where?.website) return null;
    const slug = where.website.replace('https://', '').replace('.example', '');
    return { id: `lead-${slug}`, businessName: `Lead ${slug}`, niche: 'Dentist' };
  });
});

// ═══════════════════════════════════════════════════════════════════
// 12/13 — discovery fan-out + country attribution reach-through
// ═══════════════════════════════════════════════════════════════════

describe('Phase 21 — multi-country discovery fan-out', () => {
  it('13. MULTIPLE COUNTRIES: India+UAE+UK produce ONE discovery job per niche carrying the selection', async () => {
    const outcome = await executeAutopilotRun(
      rowWith({ countries: ['India', 'United Arab Emirates', 'United Kingdom'] }),
      'run1',
      'manual'
    );
    expect(outcome.status).toBe('COMPLETED');
    expect(mockStartDiscoveryJob).toHaveBeenCalledTimes(1);
    const params = mockStartDiscoveryJob.mock.calls[0][1];
    // the whole selection rides ONE job (≤ MAX_COUNTRIES_PER_JOB=10)
    expect(params.countries).toEqual(['India', 'United Arab Emirates', 'United Kingdom']);
    expect(params.niche).toBe('Dentist');
    // the legacy single-country param is NOT set
    expect(params.country).toBeUndefined();
    // per-niche outcome reports the targeted countries
    expect(outcome.perNiche[0].countries).toEqual(['India', 'United Arab Emirates', 'United Kingdom']);
    expect(outcome.perNiche[0].worldwide).toBe(false);
    expect(outcome.perNiche[0].jobs).toHaveLength(1);
    expect(outcome.perNiche[0].jobId).toBe('job1');
  });

  it('fans out >10 countries into MAX_COUNTRIES_PER_JOB chunks', async () => {
    await executeAutopilotRun(rowWith({ countries: TWELVE_COUNTRIES }), 'run1', 'manual');
    expect(mockStartDiscoveryJob).toHaveBeenCalledTimes(2);
    const first = mockStartDiscoveryJob.mock.calls[0][1].countries;
    const second = mockStartDiscoveryJob.mock.calls[1][1].countries;
    expect(first).toHaveLength(10);
    expect(second).toHaveLength(2);
    expect([...first, ...second]).toEqual(TWELVE_COUNTRIES);
    // never more than the discovery pipeline's per-job country bound
    expect(first.length).toBeLessThanOrEqual(10);
    expect(second.length).toBeLessThanOrEqual(10);
  });

  it('1. WORLDWIDE: no country constraint is passed to discovery', async () => {
    const outcome = await executeAutopilotRun(rowWith({}), 'run1', 'manual');
    expect(mockStartDiscoveryJob).toHaveBeenCalledTimes(1);
    const params = mockStartDiscoveryJob.mock.calls[0][1];
    expect(params.countries).toBeUndefined();
    expect(params.country).toBeUndefined();
    expect(outcome.perNiche[0].worldwide).toBe(true);
    expect(outcome.perNiche[0].countries).toEqual([]);
  });

  it('legacy single-country row keeps the equivalent call shape (countries:[X])', async () => {
    await executeAutopilotRun(rowWith({ country: 'India', city: 'Mumbai' }), 'run1', 'manual');
    expect(mockStartDiscoveryJob).toHaveBeenCalledTimes(1);
    const params = mockStartDiscoveryJob.mock.calls[0][1];
    expect(params.countries).toEqual(['India']);
    expect(params.city).toBe('Mumbai');
  });

  it('12. COUNTRY ATTRIBUTION: each job\'s country-attributed payloads reach the lead ledger', async () => {
    // The per-country attribution itself is performed INSIDE the
    // discovery pipeline (lead.country = combo country) and covered by
    // the discovery multi-niche/multi-country attribution suite. Here we
    // assert the runner hands each country group its own job and that
    // each job's payloads resolve through to persisted leads + ledger.
    const outcome = await executeAutopilotRun(
      rowWith({ countries: ['India', 'United Arab Emirates', 'United Kingdom'] }),
      'run1',
      'manual'
    );
    const ledgerInserts = mockPrisma.autopilotLead.create.mock.calls.map((c) => c[0].data.leadId);
    expect(ledgerInserts).toEqual(['lead-l1a', 'lead-l1b']);
    expect(outcome.processed).toBe(2);
    expect(outcome.saved).toBe(2);
  });

  it('scales the discovery pre-flight credit estimate with the job count', async () => {
    await executeAutopilotRun(
      rowWith({ countries: ['India', 'United Arab Emirates', 'United Kingdom'] }),
      'run1',
      'manual'
    );
    // 1 niche × 1 chunk job × 20 batch × 1 credit = 20
    expect(mockCheckCreditSufficiency).toHaveBeenNthCalledWith(1, 'u1', 20);
    // workflow execution fee pre-flight stays the flat 5
    expect(mockCheckCreditSufficiency).toHaveBeenNthCalledWith(2, 'u1', 5);
  });

  it('12-chunk run scales the discovery estimate to niches × chunks × batch', async () => {
    await executeAutopilotRun(rowWith({ countries: TWELVE_COUNTRIES }), 'run1', 'manual');
    // 1 niche × 2 chunk jobs × 20 batch × 1 credit = 40
    expect(mockCheckCreditSufficiency).toHaveBeenNthCalledWith(1, 'u1', 40);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 15/16 — run country snapshot + immutability
// ═══════════════════════════════════════════════════════════════════

describe('Phase 21 — run country snapshot', () => {
  it('15. RUN SNAPSHOT: the run config records the resolved countries + worldwide flag', async () => {
    await executeAutopilotRun(
      rowWith({ countries: ['India', 'United Arab Emirates'] }),
      'run1',
      'manual'
    );
    const updateCall = mockPrisma.autopilotRun.update.mock.calls.find(
      (c) => c[0].where.id === 'run1' && c[0].data.config
    );
    expect(updateCall).toBeTruthy();
    const snapshot = JSON.parse(updateCall![0].data.config as string);
    expect(snapshot.countries).toEqual(['India', 'United Arab Emirates']);
    expect(snapshot.worldwide).toBe(false);
    expect(snapshot.geography).toEqual({ countries: ['India', 'United Arab Emirates'] });
    // Phase 20 fields remain in the snapshot
    expect(snapshot.niches).toEqual(['Dentist']);
    expect(snapshot.profileMappings).toEqual({});
    expect(Array.isArray(snapshot.nicheProfiles)).toBe(true);
  });

  it('Worldwide runs snapshot an empty country list + worldwide=true', async () => {
    await executeAutopilotRun(rowWith({ city: 'Mumbai' }), 'run1', 'manual');
    const updateCall = mockPrisma.autopilotRun.update.mock.calls.find(
      (c) => c[0].where.id === 'run1' && c[0].data.config
    );
    const snapshot = JSON.parse(updateCall![0].data.config as string);
    expect(snapshot.countries).toEqual([]);
    expect(snapshot.worldwide).toBe(true);
  });

  it('16. SNAPSHOT IMMUTABILITY: the run executes the row loaded at start — later row changes never mutate it', async () => {
    // The runner receives the autopilot ROW as a parameter and never
    // re-reads it: mutate the "stored" row AFTER the run starts (via a
    // discovery-start side effect) and the snapshot + fan-out still use
    // the original country selection.
    const row = rowWith({ countries: ['India', 'United Arab Emirates'] });
    let mutated = false;
    mockStartDiscoveryJob.mockImplementation(async () => {
      if (!mutated) {
        mutated = true;
        // simulate a concurrent config update landing mid-run
        row.geography = JSON.stringify({ countries: ['Brazil'] });
      }
      return { jobId: 'job1', status: 'started', message: 'ok' };
    });
    await executeAutopilotRun(row, 'run1', 'manual');
    // the job was started with the ORIGINAL selection (parsed before
    // the mid-run mutation could land)
    const params = mockStartDiscoveryJob.mock.calls[0][1];
    expect(params.countries).toEqual(['India', 'United Arab Emirates']);
    const updateCall = mockPrisma.autopilotRun.update.mock.calls.find(
      (c) => c[0].where.id === 'run1' && c[0].data.config
    );
    const snapshot = JSON.parse(updateCall![0].data.config as string);
    expect(snapshot.countries).toEqual(['India', 'United Arab Emirates']);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 19/20/21 — billing invariance
// ═══════════════════════════════════════════════════════════════════

describe('Phase 21 — billing invariance (ONE flat fee per run)', () => {
  it('19. ONE workflow execution charge (exactly 5 credits) for a multi-country run', async () => {
    const outcome = await executeAutopilotRun(
      rowWith({ countries: ['India', 'United Arab Emirates', 'United Kingdom'] }),
      'run1',
      'manual'
    );
    expect(outcome.executionsCreated).toBe(1);
    expect(mockExecuteWorkflowBatch).toHaveBeenCalledTimes(1);
    expect(mockChargeWorkflowExecutionFee).toHaveBeenCalledTimes(1);
    const charge = mockChargeWorkflowExecutionFee.mock.calls[0][0];
    expect(charge.chargeKey).toBe('wfexec-run:autopilot-ap1-run-run1');
    expect(charge.workflowId).toBe('wf1');
    // the country count never enters the charge call
    expect(charge).not.toHaveProperty('countries');
  });

  it('21. NO DUPLICATE BILLING across multiple countries: 12 countries → 2 jobs, still ONE charge', async () => {
    const outcome = await executeAutopilotRun(rowWith({ countries: TWELVE_COUNTRIES }), 'run1', 'manual');
    expect(mockStartDiscoveryJob).toHaveBeenCalledTimes(2); // 2 chunk jobs
    expect(outcome.executionsCreated).toBe(1);
    expect(mockChargeWorkflowExecutionFee).toHaveBeenCalledTimes(1);
    expect(mockExecuteWorkflowBatch).toHaveBeenCalledTimes(1);
  });

  it('20. DISCOVERY-ONLY: no leads resolved → no execution, no fee, honest counters', async () => {
    mockPrisma.lead.findFirst.mockResolvedValue(null); // payloads match no persisted lead
    const outcome = await executeAutopilotRun(
      rowWith({ countries: ['India', 'United Arab Emirates'] }),
      'run1',
      'manual'
    );
    expect(outcome.executionsCreated).toBe(0);
    expect(mockChargeWorkflowExecutionFee).not.toHaveBeenCalled();
    expect(mockExecuteWorkflowBatch).not.toHaveBeenCalled();
    expect(outcome.status).toBe('COMPLETED'); // honest: discovery succeeded, nothing to execute
  });
});

// ═══════════════════════════════════════════════════════════════════
// 17/18 — Phase 20 niche + country combination
// ═══════════════════════════════════════════════════════════════════

describe('Phase 21 — Phase 20 compatibility (niches + profiles + countries)', () => {
  it('17. multi-niche × multi-country: per-niche jobs carry the SAME country selection; ONE parent execution', async () => {
    const outcome = await executeAutopilotRun(
      rowWith({ countries: ['India', 'United Arab Emirates'] }, ['Dentist', 'Gym']),
      'run1',
      'manual'
    );
    expect(mockStartDiscoveryJob).toHaveBeenCalledTimes(2); // one per niche
    for (const call of mockStartDiscoveryJob.mock.calls) {
      expect(call[1].countries).toEqual(['India', 'United Arab Emirates']);
    }
    expect(outcome.perNiche).toHaveLength(2);
    expect(outcome.perNiche.map((p) => p.niche)).toEqual(['Dentist', 'Gym']);
    for (const p of outcome.perNiche) {
      expect(p.countries).toEqual(['India', 'United Arab Emirates']);
    }
    expect(outcome.executionsCreated).toBe(1);
    expect(mockChargeWorkflowExecutionFee).toHaveBeenCalledTimes(1);
  });

  it('18. per-lead profile resolutions still flow with countries (Phase 20 mapping intact)', async () => {
    mockResolveBusinessProfileForUser.mockResolvedValue({
      profile: { id: 'bp9', name: 'Dental Profile', preferredTone: 'friendly', preferredLanguage: 'English', cta: 'Call' },
      source: 'explicit',
    });
    await executeAutopilotRun(
      rowWith({ countries: ['India', 'United Arab Emirates'] }, ['Dentist'], { dentist: 'bp9' }),
      'run1',
      'manual'
    );
    const batchCall = mockExecuteWorkflowBatch.mock.calls[0];
    expect(batchCall[2].profileResolutionsByLeadId).toBeTruthy();
    const keys = Object.keys(batchCall[2].profileResolutionsByLeadId);
    expect(keys.length).toBeGreaterThan(0);
    expect(batchCall[2].profileResolutionsByLeadId[keys[0]].profile.id).toBe('bp9');
    // snapshot keeps the profileMappings + nicheProfiles (Phase 20)
    const updateCall = mockPrisma.autopilotRun.update.mock.calls.find(
      (c) => c[0].where.id === 'run1' && c[0].data.config
    );
    const snapshot = JSON.parse(updateCall![0].data.config as string);
    expect(snapshot.profileMappings).toEqual({ dentist: 'bp9' });
    expect(snapshot.nicheProfiles).toHaveLength(1);
    expect(snapshot.nicheProfiles[0].profileId).toBe('bp9');
    // ...and the Phase 21 country snapshot rides alongside
    expect(snapshot.countries).toEqual(['India', 'United Arab Emirates']);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 14 — dedup across countries (runner ledger level)
// ═══════════════════════════════════════════════════════════════════

describe('Phase 21 — dedup across countries (runner ledger)', () => {
  it('14. the same lead surfaced by two country chunks is ledgered ONCE (unique constraint)', async () => {
    // 12 countries → 2 chunk jobs; BOTH return the SAME business
    // (cross-country re-sighting). The AutopilotLead unique constraint
    // means it enters the run's lead collection exactly once — one item
    // under the run's ONE parent execution.
    mockPrisma.discoveryJob.findUnique.mockImplementation(async () => ({
      id: 'jobX',
      status: 'completed',
      totalFound: 1,
      imported: 1,
      duplicates: 0,
      failed: 0,
      filteredOut: 0,
      errorMessage: null,
      resultData: JSON.stringify([
        { businessName: 'Same Business', website: 'https://same.example', country: 'India' },
      ]),
    }));
    const outcome = await executeAutopilotRun(rowWith({ countries: TWELVE_COUNTRIES }), 'run1', 'manual');
    expect(mockStartDiscoveryJob).toHaveBeenCalledTimes(2); // 12 countries → 2 chunks
    // both jobs resolved the same payload (processed=2, honest) but the
    // ledger unique guard admits it once:
    const batchLeads = mockExecuteWorkflowBatch.mock.calls[0][2].leads;
    expect(batchLeads).toHaveLength(1);
    expect(outcome.executionsCreated).toBe(1);
    expect(mockChargeWorkflowExecutionFee).toHaveBeenCalledTimes(1);
  });
});
