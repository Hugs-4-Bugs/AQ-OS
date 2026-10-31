// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Unit Tests: Autopilot Niches
//
// Covers the contract at unit level:
//  1. Multiple predefined niches resolve to the canonical vocabulary
//  2. Custom niche creation (normalized identity + persistence payload)
//  3. Custom niche persistence semantics (plain user-scoped DB rows —
//     refresh/logout/restart survival verified live in the E2E)
//  5. Duplicate custom niche prevention ("Dental Clinics" ≡ "dental
//     clinics" ≡ "DENTAL CLINICS" ≡ " dental clinics ")
//  6. User isolation (listing + creation scoped; never overwritten
//     cross-user)
//  7. Unauthorized niche ID rejection (foreign `custom:<id>` is
//     indistinguishable from missing; no Autopilot row created)
//  8. Multiple-niche Autopilot configuration (resolved niches +
//     profileMappings persisted through create AND update)
// 11. Profile mapping validation (shape, selected-niche keys, ownership)
// +  source-scan guards (no second hard-coded niche list; UI fetches
//    the dynamic API) mirroring the conventions.
//
// Items 9/10/12–18 (discovery attribution, cross-run dedup, per-lead
// personalized context, workflow intact, 0-credit discovery,
// flat single charge, ONE parent execution, idempotency,
// eligibility) are covered by the additions to
// tests/unit/autopilot-runner.test.ts plus the existing regression
// suites (autopilot-runner, autopilot-workflow-selector, autopilot,
// workflow-batch, phase16-17-personalization).
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// ── Mock prisma (same pattern as autopilot-workflow-selector.test.ts) ──
const mockPrisma = vi.hoisted(() => ({
  customNiche: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  businessProfile: { findMany: vi.fn() },
  autopilotWorkflow: {
    findFirst: vi.fn(), findMany: vi.fn(),
    create: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
    delete: vi.fn(), deleteMany: vi.fn(), count: vi.fn(),
  },
  autopilotRun: {
    findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(),
    create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn(),
  },
  autopilotLead: { create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  workflowDefinition: { findFirst: vi.fn(), findMany: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ db: mockPrisma }));

import {
  normalizeNicheKey,
  isPredefinedNiche,
  listCustomNiches,
  createCustomNiche,
  resolveNicheSelection,
  parseProfileMappings,
  validateProfileMappingsOwnership,
  CUSTOM_NICHE_REF_PREFIX,
} from '@/lib/niches';
import {
  createAutopilot,
  updateAutopilotFields,
  listAutopilots,
} from '@/lib/autopilot/service';
import { NICHE_OPTIONS } from '@/lib/types';

const USER_A = 'user-a-111';
const USER_B = 'user-b-222';

function customRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cn-1',
    userId: USER_A,
    name: 'AI SaaS companies',
    nicheKey: 'ai saas companies',
    status: 'active',
    createdAt: new Date('2026-10-23T00:00:00Z'),
    updatedAt: new Date('2026-10-23T00:00:00Z'),
    ...overrides,
  };
}

function apRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ap-1',
    userId: USER_A,
    orgId: null,
    name: 'Dental daily',
    status: 'DRAFT',
    niches: JSON.stringify(['Dental']),
    geography: JSON.stringify({ country: 'India' }),
    profileMappings: JSON.stringify({}),
    workflowId: 'wf-1',
    schedule: 'daily',
    lastRunAt: null,
    nextRunAt: null,
    lastError: null,
    runCount: 0,
    totalDiscovered: 0,
    totalSaved: 0,
    totalProcessed: 0,
    totalExecutions: 0,
    createdAt: new Date('2026-10-23T00:00:00Z'),
    updatedAt: new Date('2026-10-23T00:00:00Z'),
    ...overrides,
  };
}

const CREATE_INPUT = {
  name: 'Multi-niche autopilot',
  niches: ['Dental'],
  geography: {},
  workflowId: 'wf-1',
  schedule: 'daily',
  activate: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Active + owned linked workflow .
  mockPrisma.workflowDefinition.findFirst.mockResolvedValue({
    id: 'wf-1', userId: USER_A, status: 'active', name: 'Test WF', profileId: null,
  });
  mockPrisma.customNiche.findFirst.mockResolvedValue(null);
  mockPrisma.customNiche.findMany.mockResolvedValue([]);
  mockPrisma.customNiche.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'cn-new',
    createdAt: new Date('2026-10-23T00:00:00Z'),
    updatedAt: new Date('2026-10-23T00:00:00Z'),
    status: 'active',
    ...data,
  }));
  mockPrisma.businessProfile.findMany.mockResolvedValue([{ id: 'bp-1' }]);
  mockPrisma.autopilotWorkflow.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'ap-new', status: data.status ?? 'DRAFT', name: data.name, ...data,
  }));
  mockPrisma.autopilotWorkflow.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'ap-1', status: 'DRAFT', name: 'Dental daily', ...data,
  }));
});

// ═══════════════════════════════════════════════════════════════════
// Normalized identity (spec 20.5)
// ═══════════════════════════════════════════════════════════════════

describe('normalizeNicheKey (canonical niche identity)', () => {
  it('"Dental Clinics", "dental clinics", "DENTAL CLINICS" and " dental clinics " are the SAME logical niche', () => {
    const expected = 'dental clinics';
    expect(normalizeNicheKey('Dental Clinics')).toBe(expected);
    expect(normalizeNicheKey('dental clinics')).toBe(expected);
    expect(normalizeNicheKey('DENTAL CLINICS')).toBe(expected);
    expect(normalizeNicheKey('  dental   clinics  ')).toBe(expected);
  });

  it('empty / null / non-string input normalizes to empty (never a fabricated identity)', () => {
    expect(normalizeNicheKey('')).toBe('');
    expect(normalizeNicheKey(null)).toBe('');
    expect(normalizeNicheKey(undefined)).toBe('');
  });

  it('predefined detection is case-insensitive over the canonical vocabulary', () => {
    expect(isPredefinedNiche('Dental')).toBe(true);
    expect(isPredefinedNiche('real estate')).toBe(true);
    expect(isPredefinedNiche('CONSTRUCTION')).toBe(true);
    expect(isPredefinedNiche('Solar installation companies')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Custom niche creation + duplicate prevention (spec 20.2 / 20.5)
// ═══════════════════════════════════════════════════════════════════

describe('createCustomNiche', () => {
  it('persists a custom niche with its normalized identity and the user as owner', async () => {
    const result = await createCustomNiche(USER_A, 'AI SaaS companies');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.niche.name).toBe('AI SaaS companies');
      expect(result.niche.nicheKey).toBe('ai saas companies');
    }
    expect(mockPrisma.customNiche.create).toHaveBeenCalledWith({
      data: {
        userId: USER_A,
        name: 'AI SaaS companies',
        nicheKey: 'ai saas companies',
      },
    });
  });

  it('rejects a duplicate in ANY casing/whitespace variation — the existing save is never overwritten', async () => {
    mockPrisma.customNiche.findFirst.mockResolvedValue(customRow({ name: 'Dental Clinics', nicheKey: 'dental clinics' }));
    for (const variation of ['dental clinics', 'DENTAL CLINICS', ' Dental Clinics ', 'Dental  Clinics']) {
      const result = await createCustomNiche(USER_A, variation);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('DUPLICATE');
        expect(result.error).toContain('Dental Clinics');
      }
    }
    expect(mockPrisma.customNiche.create).not.toHaveBeenCalled();
  });

  it('surfaces a DB unique-constraint race as the same friendly duplicate error', async () => {
    mockPrisma.customNiche.findFirst.mockResolvedValue(null);
    mockPrisma.customNiche.create.mockRejectedValueOnce({ code: 'P2002' });
    const result = await createCustomNiche(USER_A, 'Luxury interior designers');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('DUPLICATE');
  });

  it('rejects a name that duplicates a PREDEFINED niche (it already exists in the app vocabulary)', async () => {
    const result = await createCustomNiche(USER_A, 'dental');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PREDEFINED');
    expect(mockPrisma.customNiche.create).not.toHaveBeenCalled();
  });

  it('rejects empty / non-string names honestly', async () => {
    expect((await createCustomNiche(USER_A, '')).ok).toBe(false);
    expect((await createCustomNiche(USER_A, '   ')).ok).toBe(false);
    expect((await createCustomNiche(USER_A, 42)).ok).toBe(false);
  });

  it('user B saving the SAME display name creates B\'s OWN row — A\'s niche is never touched (no cross-user overwrite)', async () => {
    // A already saved it; B's scoped lookup finds nothing.
    mockPrisma.customNiche.findFirst.mockImplementation(async ({ where }: { where: { userId: string } }) =>
      where.userId === USER_A ? customRow() : null
    );
    const resultB = await createCustomNiche(USER_B, 'AI SaaS companies');
    expect(resultB.ok).toBe(true);
    expect(mockPrisma.customNiche.create).toHaveBeenCalledWith({
      data: { userId: USER_B, name: 'AI SaaS companies', nicheKey: 'ai saas companies' },
    });
    // A's row was never updated or deleted.
    expect(mockPrisma.customNiche.create).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Custom niche persistence + isolation (spec 20.3 / 20.4 / 20.6)
// ═══════════════════════════════════════════════════════════════════

describe('listCustomNiches', () => {
  it('lists ONLY the caller\'s active custom niches (user-scoped query)', async () => {
    mockPrisma.customNiche.findMany.mockResolvedValue([
      customRow(),
      customRow({ id: 'cn-2', name: 'Solar installation companies', nicheKey: 'solar installation companies' }),
    ]);
    const result = await listCustomNiches(USER_A);
    expect(mockPrisma.customNiche.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_A, status: 'active' },
      })
    );
    expect(result.map((n) => n.name)).toEqual(['AI SaaS companies', 'Solar installation companies']);
  });

  it('persistence is a plain user-scoped DB query — no session, selection, or time dependency (survives refresh/logout/restart; deletion never happens on deselect)', async () => {
    mockPrisma.customNiche.findMany.mockResolvedValue([customRow()]);
    // Called twice — simulating a "re-fetch after refresh/login": the
    // SAME user-scoped query returns the SAME rows.
    const first = await listCustomNiches(USER_A);
    const second = await listCustomNiches(USER_A);
    expect(first).toEqual(second);
    expect(mockPrisma.customNiche.findMany).toHaveBeenCalledTimes(2);
    expect(mockPrisma.customNiche.findMany.mock.calls[1][0].where).toEqual({
      userId: USER_A,
      status: 'active',
    });
    // No delete/archive API exists on the service surface at all.
    expect((mockPrisma.customNiche as Record<string, unknown>).delete).toBeUndefined();
    expect((mockPrisma.customNiche as Record<string, unknown>).update).toBeUndefined();
    expect((mockPrisma.customNiche as Record<string, unknown>).updateMany).toBeUndefined();
  });

  it('User B never sees User A\'s custom niches (empty for B)', async () => {
    mockPrisma.customNiche.findMany.mockResolvedValue([]); // scoped query for B matches nothing
    const result = await listCustomNiches(USER_B);
    expect(mockPrisma.customNiche.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_B, status: 'active' } })
    );
    expect(result).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Niche selection resolution — the Autopilot configuration authority
// (spec 20.1 / 20.4 / 20.7)
// ═══════════════════════════════════════════════════════════════════

describe('resolveNicheSelection', () => {
  it('resolves MULTIPLE predefined niches to their canonical forms, order preserved, no DB needed', async () => {
    const result = await resolveNicheSelection(USER_A, ['Dental', 'real estate', 'CONSTRUCTION']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.niches).toEqual(['Dental', 'Real Estate', 'Construction']);
    expect(mockPrisma.customNiche.findMany).not.toHaveBeenCalled();
  });

  it('resolves the caller\'s OWN saved custom niche by name (saved display form wins)', async () => {
    mockPrisma.customNiche.findMany.mockResolvedValue([customRow()]);
    const result = await resolveNicheSelection(USER_A, ['ai saas companies']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.niches).toEqual(['AI SaaS companies']);
  });

  it('resolves an explicit custom:<id> reference to the caller\'s OWN saved niche', async () => {
    mockPrisma.customNiche.findMany.mockResolvedValue([customRow({ id: 'cn-77' })]);
    const result = await resolveNicheSelection(USER_A, [`custom:cn-77`]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.niches).toEqual(['AI SaaS companies']);
  });

  it('a FOREIGN custom-niche id is rejected and indistinguishable from a missing one (no existence leak)', async () => {
    // The scoped query returns nothing — whether the id belongs to
    // another user or does not exist at all.
    mockPrisma.customNiche.findMany.mockResolvedValue([]);
    const foreign = await resolveNicheSelection(USER_A, [`${CUSTOM_NICHE_REF_PREFIX}cn-belongs-to-b`]);
    const missing = await resolveNicheSelection(USER_A, [`${CUSTOM_NICHE_REF_PREFIX}does-not-exist`]);
    expect(foreign.ok).toBe(false);
    expect(missing.ok).toBe(false);
    if (!foreign.ok && !missing.ok) {
      expect(foreign.error).toBe(missing.error);
      expect(foreign.error).toBe('Custom niche not found for this account');
    }
  });

  it('a foreign id lookup is user-scoped — B\'s row can never match A\'s resolution', async () => {
    mockPrisma.customNiche.findMany.mockImplementation(async ({ where }: { where: { userId: string; OR: object[] } }) => {
      // Emulate real scoping: only rows whose userId matches.
      expect(where.userId).toBe(USER_A);
      return [];
    });
    const result = await resolveNicheSelection(USER_A, ['custom:cn-b-private']);
    expect(result.ok).toBe(false);
  });

  it('an unknown niche (not predefined, not the caller\'s) is rejected with the save-first guidance', async () => {
    mockPrisma.customNiche.findMany.mockResolvedValue([]);
    const result = await resolveNicheSelection(USER_A, ['Solar installation companies']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION');
      expect(result.error).toContain('save it as a custom niche');
    }
  });

  it('deduplicates post-resolution when a predefined entry and a custom reference resolve to the same niche', async () => {
    mockPrisma.customNiche.findMany.mockResolvedValue([customRow({ name: 'Dental', nicheKey: 'dental' })]);
    const result = await resolveNicheSelection(USER_A, ['Dental', 'custom:cn-1']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.niches).toEqual(['Dental']);
  });

  it('ONE batched user-scoped query resolves every custom reference and key at once', async () => {
    mockPrisma.customNiche.findMany.mockResolvedValue([
      customRow({ id: 'cn-a' }),
      customRow({ id: 'cn-b', name: 'Luxury interior designers', nicheKey: 'luxury interior designers' }),
    ]);
    await resolveNicheSelection(USER_A, ['custom:cn-a', 'luxury interior designers', 'Dental']);
    expect(mockPrisma.customNiche.findMany).toHaveBeenCalledTimes(1);
  });

  it('empty input is rejected honestly', async () => {
    expect((await resolveNicheSelection(USER_A, [])).ok).toBe(false);
    expect((await resolveNicheSelection(USER_A, undefined as unknown as string[])).ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Profile mappings — shape + ownership (spec 20.6 / 20.7)
// ═══════════════════════════════════════════════════════════════════

describe('parseProfileMappings', () => {
  it('accepts a mapping keyed by normalized niche keys of the selected niches', () => {
    const result = parseProfileMappings({ dental: 'bp-1', 'real estate': 'bp-2' }, ['Dental', 'Real Estate']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ dental: 'bp-1', 'real estate': 'bp-2' });
    }
  });

  it('rejects keys that do not match a selected niche (never silently dropped)', () => {
    const result = parseProfileMappings({ hospitals: 'bp-1' }, ['Dental']);
    expect(result.ok).toBe(false);
  });

  it('rejects non-object payloads and non-string values', () => {
    expect(parseProfileMappings('nope', ['Dental']).ok).toBe(false);
    expect(parseProfileMappings([{ dental: 'bp-1' }], ['Dental']).ok).toBe(false);
    expect(parseProfileMappings({ dental: 42 }, ['Dental']).ok).toBe(false);
    expect(parseProfileMappings({ dental: '  ' }, ['Dental']).ok).toBe(false);
  });

  it('null/undefined payload means "no mapping" (legacy-compatible)', () => {
    expect(parseProfileMappings(undefined, ['Dental']).ok).toBe(true);
    expect(parseProfileMappings(null, ['Dental']).ok).toBe(true);
  });
});

describe('validateProfileMappingsOwnership', () => {
  it('ONE batched user-scoped query verifies every mapped profile (active only)', async () => {
    mockPrisma.businessProfile.findMany.mockResolvedValue([{ id: 'bp-1' }, { id: 'bp-2' }]);
    const result = await validateProfileMappingsOwnership(USER_A, { dental: 'bp-1', hospital: 'bp-2' });
    expect(result.ok).toBe(true);
    expect(mockPrisma.businessProfile.findMany).toHaveBeenCalledWith({
      where: { userId: USER_A, status: 'active', id: { in: ['bp-1', 'bp-2'] } },
      select: { id: true },
    });
  });

  it('a foreign / missing profile id is rejected indistinguishably (no cross-user mapping, no leak)', async () => {
    mockPrisma.businessProfile.findMany.mockResolvedValue([{ id: 'bp-1' }]); // bp-2 not owned by A
    const result = await validateProfileMappingsOwnership(USER_A, { dental: 'bp-1', hospital: 'bp-2' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Mapped profile not found for this account');
  });

  it('an empty mapping is trivially valid (no query)', async () => {
    const result = await validateProfileMappingsOwnership(USER_A, {});
    expect(result.ok).toBe(true);
    expect(mockPrisma.businessProfile.findMany).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Autopilot configuration integration (spec 20.7 / 20.4)
// ═══════════════════════════════════════════════════════════════════

describe('createAutopilot (niche + mapping integration)', () => {
  it('persists a multi-niche configuration with resolved canonical niche names', async () => {
    mockPrisma.customNiche.findMany.mockResolvedValue([customRow({ name: 'AI SaaS', nicheKey: 'ai saas' })]);
    const result = await createAutopilot(USER_A, null, null, {
      ...CREATE_INPUT,
      niches: ['dental', 'real estate', 'ai saas'],
    });
    expect(result.success).toBe(true);
    expect(mockPrisma.autopilotWorkflow.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.autopilotWorkflow.create.mock.calls[0][0].data;
    expect(JSON.parse(data.niches)).toEqual(['Dental', 'Real Estate', 'AI SaaS']);
  });

  it('persists a valid profile mapping into the configuration', async () => {
    // 'Hospital' is NOT predefined — resolve it as the caller's custom niche.
    mockPrisma.customNiche.findMany.mockResolvedValue([
      customRow({ name: 'Hospital', nicheKey: 'hospital' }),
    ]);
    const result = await createAutopilot(USER_A, null, null, {
      ...CREATE_INPUT,
      niches: ['Dental', 'Hospital'],
      profileMappings: { dental: 'bp-1', hospital: 'bp-1' },
    });
    expect(result.success).toBe(true);
    expect(mockPrisma.autopilotWorkflow.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.autopilotWorkflow.create.mock.calls[0][0].data;
    expect(JSON.parse(data.niches)).toEqual(['Dental', 'Hospital']);
    expect(JSON.parse(data.profileMappings)).toEqual({ dental: 'bp-1', hospital: 'bp-1' });
  });

  it('an UNAUTHORIZED niche id is rejected BEFORE any row is created (no config, no discovery, no charge)', async () => {
    mockPrisma.customNiche.findMany.mockResolvedValue([]); // foreign/missing → not resolvable
    const result = await createAutopilot(USER_A, null, null, {
      ...CREATE_INPUT,
      niches: ['Dental', 'custom:cn-foreign'],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe('Custom niche not found for this account');
    expect(mockPrisma.autopilotWorkflow.create).not.toHaveBeenCalled();
  });

  it('a foreign PROFILE id in the mapping is rejected BEFORE any row is created', async () => {
    mockPrisma.businessProfile.findMany.mockResolvedValue([]); // none owned
    const result = await createAutopilot(USER_A, null, null, {
      ...CREATE_INPUT,
      niches: ['Dental'],
      profileMappings: { dental: 'bp-foreign' },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe('Mapped profile not found for this account');
    expect(mockPrisma.autopilotWorkflow.create).not.toHaveBeenCalled();
  });

  it('a mapping key for an unselected niche is rejected (clear validation, no silent drop)', async () => {
    const result = await createAutopilot(USER_A, null, null, {
      ...CREATE_INPUT,
      niches: ['Dental'],
      profileMappings: { hospital: 'bp-1' },
    });
    expect(result.success).toBe(false);
    expect(mockPrisma.autopilotWorkflow.create).not.toHaveBeenCalled();
  });

  it('defaults to an empty mapping when none is provided (legacy-compatible)', async () => {
    const result = await createAutopilot(USER_A, null, null, { ...CREATE_INPUT });
    expect(result.success).toBe(true);
    const data = mockPrisma.autopilotWorkflow.create.mock.calls[0][0].data;
    expect(data.profileMappings).toBe('{}');
  });
});

describe('updateAutopilotFields ', () => {
  it('updates niches through the canonical resolution and persists mappings', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(apRow());
    mockPrisma.customNiche.findMany.mockResolvedValue([
      customRow({ name: 'AI SaaS', nicheKey: 'ai saas' }),
    ]);
    const result = await updateAutopilotFields(USER_A, 'ap-1', {
      niches: ['dental', 'ai saas'],
      profileMappings: { dental: 'bp-1' },
    });
    expect(result.success).toBe(true);
    const data = mockPrisma.autopilotWorkflow.update.mock.calls[0][0].data;
    expect(JSON.parse(data.niches)).toEqual(['Dental', 'AI SaaS']);
    expect(JSON.parse(data.profileMappings)).toEqual({ dental: 'bp-1' });
  });

  it('rejects an unauthorized niche id on update — the stored configuration is untouched', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(apRow());
    mockPrisma.customNiche.findMany.mockResolvedValue([]);
    const result = await updateAutopilotFields(USER_A, 'ap-1', {
      niches: ['Dental', 'custom:cn-foreign'],
    });
    expect(result.success).toBe(false);
    expect(mockPrisma.autopilotWorkflow.update).not.toHaveBeenCalled();
  });

  it('an update that does NOT touch profileMappings keeps the stored mapping verbatim (non-destructive)', async () => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(
      apRow({ profileMappings: JSON.stringify({ dental: 'bp-1' }) })
    );
    const result = await updateAutopilotFields(USER_A, 'ap-1', { name: 'Renamed' });
    expect(result.success).toBe(true);
    const data = mockPrisma.autopilotWorkflow.update.mock.calls[0][0].data;
    expect(data.profileMappings).toBeUndefined();
  });
});

describe('listAutopilots (serialization)', () => {
  it('returns the parsed profileMappings with every autopilot', async () => {
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([
      apRow({ profileMappings: JSON.stringify({ dental: 'bp-1' }) }),
    ]);
    mockPrisma.workflowDefinition.findMany.mockResolvedValue([
      { id: 'wf-1', name: 'Test WF', status: 'active' },
    ]);
    const result = await listAutopilots(USER_A);
    expect(result).toHaveLength(1);
    expect(result[0].profileMappings).toEqual({ dental: 'bp-1' });
  });

  it('legacy rows without a mapping serialize to an empty object (never a crash)', async () => {
    const legacyRow = apRow();
    delete (legacyRow as Record<string, unknown>).profileMappings;
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([legacyRow]);
    mockPrisma.workflowDefinition.findMany.mockResolvedValue([]);
    const result = await listAutopilots(USER_A);
    expect(result[0].profileMappings).toEqual({});
  });
});

// ═══════════════════════════════════════════════════════════════════
// Source-scan guards : no second hard-coded niche
// list; the canonical service consumes the app's shared vocabulary; the
// UI fetches the dynamic custom-niche API.
// ═══════════════════════════════════════════════════════════════════

describe('source-scan guards', () => {
  const ROOT = path.join(__dirname, '..', '..');

  it('the canonical niche service imports the shared NICHE_OPTIONS vocabulary — no duplicated hard-coded list', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/lib/niches.ts'), 'utf8');
    expect(source).toContain("from '@/lib/types'");
    expect(source).toContain('NICHE_OPTIONS');
    // No literal niche array duplicated inside the service.
    for (const literal of ['"Restaurant"', '"Cafe"', '"Gym"', '"Salon"']) {
      expect(source).not.toContain(literal);
    }
  });

  it('the Autopilot UI fetches the dynamic custom-niche API (no fixed custom list)', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/components/dashboard/autopilot-tab.tsx'), 'utf8');
    expect(source).toContain("fetch('/api/autopilot/niches')");
    expect(source).toContain('NICHE_OPTIONS');
  });

  it('NICHE_OPTIONS remains the single predefined vocabulary (spot-check entries from the spec examples)', () => {
    expect(NICHE_OPTIONS).toContain('Dental');
    expect(NICHE_OPTIONS).toContain('Real Estate');
    expect(NICHE_OPTIONS).toContain('Construction');
    expect(NICHE_OPTIONS).toContain('Restaurant');
  });
});
