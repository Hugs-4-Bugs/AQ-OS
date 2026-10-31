// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Unit Tests: Autopilot Workflow Selector
//
// Covers the contract:
//  1. Eligible workflows dynamically returned (live db query, scoped)
//  2. Newly created eligible workflow appears without code changes
//  3. User isolation (scoped listing; foreign ids indistinguishable)
//  4. Unauthorized workflow ID rejected at selection (no row, no charge)
//  5. Deleted (archived/missing) workflow handled safely (health flag,
//     config preserved, clear recoverable state)
//  6. Disabled (paused) workflow handled safely
//  7. Ineligible (draft) workflow rejected with clear error
//  8. Valid workflow persists in the Autopilot configuration
//  9. Resolver contract feeding runAutopilot's selected-workflow rule
// 10. No hard-coded workflow ID/name as selector source of truth
// 11. Invalid selection produces no execution/charge pathway
// 12. Flat 5-credit execution fee unchanged
// (13 idempotency + 14 P11-17 personalization are guarded by
//  the existing autopilot-runner / personalization suites — regression.)
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// ── Mock prisma (same pattern as autopilot.test.ts) ──
const mockPrisma = vi.hoisted(() => ({
  autopilotWorkflow: {
    findFirst: vi.fn(), findMany: vi.fn(),
    create: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
    delete: vi.fn(), deleteMany: vi.fn(), count: vi.fn(),
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
  // canonical niche resolution queries (create/update path).
  // Default: the caller has "Dentists" saved as a custom niche so the
  // legacy test input keeps resolving end-to-end.
  customNiche: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  businessProfile: { findMany: vi.fn() },
  discoveryJob: { findUnique: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ db: mockPrisma }));
vi.mock('@/lib/lead-audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/billing-audit', () => ({ logCreditEvent: vi.fn() }));

import {
  listEligibleWorkflows,
  resolveAutopilotWorkflow,
  createAutopilot,
  updateAutopilotFields,
  listAutopilots,
} from '@/lib/autopilot/service';
import { WORKFLOW_EXECUTION_FEE_CREDITS } from '@/lib/workflow-credits';

const USER_A = 'user-a-111';
const USER_B = 'user-b-222';

function wfRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wf-1',
    name: 'Dental Outreach',
    description: 'Outreach for dental clinics',
    status: 'active',
    triggerType: 'manual',
    profileId: null,
    updatedAt: new Date('2026-10-23T00:00:00Z'),
    _count: { workflowSteps: 3 },
    ...overrides,
  };
}

function apRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ap-1',
    userId: USER_A,
    orgId: null,
    name: 'Dental daily',
    status: 'ACTIVE',
    niches: JSON.stringify(['Dentists']),
    geography: JSON.stringify({ country: 'India' }),
    workflowId: 'wf-1',
    schedule: 'daily',
    lastRunAt: null,
    nextRunAt: new Date('2026-10-24T00:00:00Z'),
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

beforeEach(() => {
  vi.clearAllMocks();
  // the test user's saved custom niche (keeps the legacy
  // 'Dentists' input resolvable through the canonical service).
  mockPrisma.customNiche.findMany.mockResolvedValue([
    { id: 'cn-dentists', name: 'Dentists', nicheKey: 'dentists', status: 'active' },
  ]);
  mockPrisma.businessProfile.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════════════════════════
// 1–3 · Eligible-workflow listing: dynamic, live, user-scoped
// ═══════════════════════════════════════════════════════════════════

describe('listEligibleWorkflows (dynamic selector source)', () => {
  it('returns the user\'s active workflows derived live from the workflow system', async () => {
    mockPrisma.workflowDefinition.findMany.mockResolvedValue([
      wfRow({ id: 'wf-1', name: 'Dental Outreach' }),
      wfRow({ id: 'wf-2', name: 'Gyms Onboarding', _count: { workflowSteps: 5 } }),
    ]);
    const result = await listEligibleWorkflows(USER_A);

    // The listing is a LIVE query scoped to the caller + active status —
    // the DB filter itself is the isolation + eligibility rule.
    expect(mockPrisma.workflowDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_A, status: 'active' },
      })
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'wf-1',
      name: 'Dental Outreach',
      description: 'Outreach for dental clinics',
      status: 'active',
      triggerType: 'manual',
      stepCount: 3,
    });
    expect(result[1].stepCount).toBe(5);
  });

  it('newly created eligible workflows appear WITHOUT code modification (future-proof)', async () => {
    // First listing without the new workflow …
    mockPrisma.workflowDefinition.findMany.mockResolvedValueOnce([wfRow({ id: 'wf-1' })]);
    const before = await listEligibleWorkflows(USER_A);
    expect(before.map((w) => w.id)).toEqual(['wf-1']);

    // … then a workflow created AFTER deploy (new row, nothing else) …
    mockPrisma.workflowDefinition.findMany.mockResolvedValueOnce([
      wfRow({ id: 'wf-new', name: 'Brand New Flow' }),
      wfRow({ id: 'wf-1' }),
    ]);
    const after = await listEligibleWorkflows(USER_A);

    // … appears automatically in the very next listing call.
    expect(after.map((w) => w.id)).toContain('wf-new');
    expect(after.map((w) => w.name)).toContain('Brand New Flow');
  });

  it('scopes the query to the requesting user (User B never receives User A rows)', async () => {
    mockPrisma.workflowDefinition.findMany.mockResolvedValue([]);
    await listEligibleWorkflows(USER_B);
    const arg = mockPrisma.workflowDefinition.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: USER_B, status: 'active' });
  });

  it('bounds the listing (take 200) and orders by recency for a stable selector', async () => {
    mockPrisma.workflowDefinition.findMany.mockResolvedValue([]);
    await listEligibleWorkflows(USER_A);
    const arg = mockPrisma.workflowDefinition.findMany.mock.calls[0][0];
    expect(arg.take).toBe(200);
    expect(arg.orderBy).toEqual({ updatedAt: 'desc' });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3–7 · Single-workflow eligibility resolver
// ═══════════════════════════════════════════════════════════════════

describe('resolveAutopilotWorkflow (canonical eligibility rule)', () => {
  it('resolves an owned ACTIVE workflow as eligible (feeds selection + run)', async () => {
    mockPrisma.workflowDefinition.findFirst.mockResolvedValue(
      wfRow({ id: 'wf-9', name: 'Active Flow', status: 'active', profileId: 'bp-1' })
    );
    const r = await resolveAutopilotWorkflow(USER_A, 'wf-9');
    expect(r).toEqual({
      ok: true,
      workflow: { id: 'wf-9', name: 'Active Flow', status: 'active', profileId: 'bp-1' },
    });
    expect(mockPrisma.workflowDefinition.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'wf-9', userId: USER_A } })
    );
  });

  it('a missing workflow and another user\'s workflow are indistinguishable (NOT_FOUND, no leak)', async () => {
    mockPrisma.workflowDefinition.findFirst.mockResolvedValue(null);
    const missing = await resolveAutopilotWorkflow(USER_A, 'does-not-exist');
    const foreign = await resolveAutopilotWorkflow(USER_A, 'user-b-wf');
    expect(missing).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(foreign).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('a paused (disabled) workflow is INACTIVE with its name for a clear error', async () => {
    mockPrisma.workflowDefinition.findFirst.mockResolvedValue(
      wfRow({ name: 'Paused Flow', status: 'paused' })
    );
    const r = await resolveAutopilotWorkflow(USER_A, 'wf-1');
    expect(r).toEqual({ ok: false, code: 'INACTIVE', workflowName: 'Paused Flow' });
  });

  it('a draft (never activated) workflow is INACTIVE', async () => {
    mockPrisma.workflowDefinition.findFirst.mockResolvedValue(
      wfRow({ name: 'Draft Flow', status: 'draft' })
    );
    const r = await resolveAutopilotWorkflow(USER_A, 'wf-1');
    expect(r).toEqual({ ok: false, code: 'INACTIVE', workflowName: 'Draft Flow' });
  });

  it('an archived (soft-deleted) workflow is INACTIVE — deletion is handled safely', async () => {
    mockPrisma.workflowDefinition.findFirst.mockResolvedValue(
      wfRow({ name: 'Archived Flow', status: 'archived' })
    );
    const r = await resolveAutopilotWorkflow(USER_A, 'wf-1');
    expect(r).toEqual({ ok: false, code: 'INACTIVE', workflowName: 'Archived Flow' });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4, 7, 8 · Selection validation at CREATE
// ═══════════════════════════════════════════════════════════════════

describe('createAutopilot — workflow selection validation', () => {
  const baseInput = {
    name: 'Selector E2E autopilot',
    niches: ['Dentists'],
    geography: { country: 'India' },
    workflowId: 'wf-1',
    schedule: 'daily',
    activate: false,
  };

  it('rejects another user\'s workflow ID safely: no row, no execution, no charge', async () => {
    mockPrisma.workflowDefinition.findFirst.mockResolvedValue(null);
    const result = await createAutopilot(USER_A, null, 'pro', baseInput);

    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION');
    expect(result.error).toBe('Workflow not found for this account');
    expect(mockPrisma.autopilotWorkflow.create).not.toHaveBeenCalled();
  });

  it('rejects an ineligible (draft) workflow with a clear actionable error', async () => {
    mockPrisma.workflowDefinition.findFirst.mockResolvedValue(
      wfRow({ name: 'Draft Flow', status: 'draft' })
    );
    const result = await createAutopilot(USER_A, null, 'pro', baseInput);

    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION');
    expect(result.error).toContain('Draft Flow');
    expect(result.error).toContain('not active');
    expect(mockPrisma.autopilotWorkflow.create).not.toHaveBeenCalled();
  });

  it('rejects a paused (disabled) workflow at selection time', async () => {
    mockPrisma.workflowDefinition.findFirst.mockResolvedValue(
      wfRow({ name: 'Paused Flow', status: 'paused' })
    );
    const result = await createAutopilot(USER_A, null, 'pro', baseInput);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Paused Flow');
    expect(mockPrisma.autopilotWorkflow.create).not.toHaveBeenCalled();
  });

  it('persists a VALID active workflow in the Autopilot configuration', async () => {
    mockPrisma.workflowDefinition.findFirst.mockResolvedValue(
      wfRow({ id: 'wf-ok', name: 'Valid Flow', status: 'active' })
    );
    mockPrisma.autopilotWorkflow.create.mockResolvedValue(
      apRow({ id: 'ap-created', status: 'DRAFT' })
    );
    const result = await createAutopilot(USER_A, null, 'pro', {
      ...baseInput,
      workflowId: 'wf-ok',
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.autopilotWorkflow.create).toHaveBeenCalledTimes(1);
    const createdArg = mockPrisma.autopilotWorkflow.create.mock.calls[0][0];
    expect(createdArg.data.workflowId).toBe('wf-ok');
    expect(createdArg.data.userId).toBe(USER_A);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4, 6, 7 · Selection validation at UPDATE (relink path)
// ═══════════════════════════════════════════════════════════════════

describe('updateAutopilotFields — relink validation', () => {
  beforeEach(() => {
    mockPrisma.autopilotWorkflow.findFirst.mockResolvedValue(apRow());
  });

  it('rejects relinking to another user\'s workflow (no update call)', async () => {
    mockPrisma.workflowDefinition.findFirst.mockResolvedValue(null);
    const result = await updateAutopilotFields(USER_A, 'ap-1', { workflowId: 'user-b-wf' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Workflow not found for this account');
    expect(mockPrisma.autopilotWorkflow.update).not.toHaveBeenCalled();
  });

  it('rejects relinking to an inactive workflow with a clear error', async () => {
    mockPrisma.workflowDefinition.findFirst.mockResolvedValue(
      wfRow({ name: 'Old Flow', status: 'archived' })
    );
    const result = await updateAutopilotFields(USER_A, 'ap-1', { workflowId: 'wf-archived' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Old Flow');
    expect(mockPrisma.autopilotWorkflow.update).not.toHaveBeenCalled();
  });

  it('rejects an empty workflow id safely', async () => {
    const result = await updateAutopilotFields(USER_A, 'ap-1', { workflowId: '  ' });
    expect(result.success).toBe(false);
    expect(mockPrisma.autopilotWorkflow.update).not.toHaveBeenCalled();
  });

  it('accepts relinking to a valid active workflow', async () => {
    mockPrisma.workflowDefinition.findFirst.mockResolvedValue(
      wfRow({ id: 'wf-new', status: 'active' })
    );
    mockPrisma.autopilotWorkflow.update.mockResolvedValue(apRow({ workflowId: 'wf-new' }));
    const result = await updateAutopilotFields(USER_A, 'ap-1', { workflowId: 'wf-new' });

    expect(result.success).toBe(true);
    const updateArg = mockPrisma.autopilotWorkflow.update.mock.calls[0][0];
    expect(updateArg.data.workflowId).toBe('wf-new');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5, 6 · Listing with linked-workflow health (recoverable state)
// ═══════════════════════════════════════════════════════════════════

describe('listAutopilots — linked-workflow health', () => {
  it('returns workflow details + eligible=true for a healthy active link', async () => {
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([apRow()]);
    mockPrisma.workflowDefinition.findMany.mockResolvedValue([
      { id: 'wf-1', name: 'Dental Outreach', status: 'active' },
    ]);

    const items = await listAutopilots(USER_A);
    expect(items).toHaveLength(1);
    expect(items[0].workflow).toEqual({ id: 'wf-1', name: 'Dental Outreach', status: 'active' });
    expect(items[0].workflowEligible).toBe(true);
  });

  it('a DELETED workflow resolves to null with eligible=false — and the autopilot config is preserved (never auto-deleted)', async () => {
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([apRow({ workflowId: 'wf-gone' })]);
    mockPrisma.workflowDefinition.findMany.mockResolvedValue([]); // row no longer exists

    const items = await listAutopilots(USER_A);
    expect(items).toHaveLength(1); // ← the config itself is still listed
    expect(items[0].workflow).toBeNull();
    expect(items[0].workflowEligible).toBe(false);
    expect(items[0].workflowId).toBe('wf-gone'); // raw link kept for recovery
    expect(mockPrisma.autopilotWorkflow.delete).not.toHaveBeenCalled();
    expect(mockPrisma.autopilotWorkflow.deleteMany).not.toHaveBeenCalled();
  });

  it('a DISABLED (paused) workflow is present-but-ineligible → clear recoverable state', async () => {
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([apRow()]);
    mockPrisma.workflowDefinition.findMany.mockResolvedValue([
      { id: 'wf-1', name: 'Dental Outreach', status: 'paused' },
    ]);

    const items = await listAutopilots(USER_A);
    expect(items[0].workflow).toEqual({ id: 'wf-1', name: 'Dental Outreach', status: 'paused' });
    expect(items[0].workflowEligible).toBe(false);
  });

  it('an ARCHIVED (soft-deleted) workflow is ineligible', async () => {
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([apRow()]);
    mockPrisma.workflowDefinition.findMany.mockResolvedValue([
      { id: 'wf-1', name: 'Dental Outreach', status: 'archived' },
    ]);
    const items = await listAutopilots(USER_A);
    expect(items[0].workflowEligible).toBe(false);
  });

  it('resolves every autopilot in ONE batched user-scoped query (no cross-user leak)', async () => {
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([
      apRow({ id: 'ap-1', workflowId: 'wf-1' }),
      apRow({ id: 'ap-2', workflowId: 'wf-2' }),
      apRow({ id: 'ap-3', workflowId: 'wf-1' }), // shared link, deduped
    ]);
    mockPrisma.workflowDefinition.findMany.mockResolvedValue([
      { id: 'wf-1', name: 'A', status: 'active' },
      { id: 'wf-2', name: 'B', status: 'active' },
    ]);

    const items = await listAutopilots(USER_A);
    expect(mockPrisma.workflowDefinition.findMany).toHaveBeenCalledTimes(1);
    const wfArg = mockPrisma.workflowDefinition.findMany.mock.calls[0][0];
    expect(wfArg.where.userId).toBe(USER_A);
    expect(wfArg.where.id).toEqual({ in: ['wf-1', 'wf-2'] }); // deduped id set
    expect(items.map((i) => i.workflowEligible)).toEqual([true, true, true]);
  });

  it('skips the workflow query entirely when there are no autopilots', async () => {
    mockPrisma.autopilotWorkflow.findMany.mockResolvedValue([]);
    const items = await listAutopilots(USER_A);
    expect(items).toEqual([]);
    expect(mockPrisma.workflowDefinition.findMany).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 10, 11, 12 · Source-of-truth + billing guards
// ═══════════════════════════════════════════════════════════════════

describe('selector source of truth (no hard-coded workflows)', () => {
  const readSrc = (rel: string) =>
    fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

  it('contains NO hard-coded workflow name/ID literals in the selector path', () => {
    const serviceSrc = readSrc('src/lib/autopilot/service.ts');
    const routeSrc = readSrc('src/app/api/autopilot/workflows/route.ts');
    const uiSrc = readSrc('src/components/dashboard/autopilot-tab.tsx');

    for (const src of [serviceSrc, routeSrc, uiSrc]) {
      expect(src).not.toContain('Lead Follow-up Sequence');
      expect(src).not.toMatch(/workflowId\s*[:=]\s*['"]cl[a-z0-9]{20,}/);
      expect(src).not.toMatch(/HARDCODED|FIXED_WORKFLOW|DEFAULT_WORKFLOW/);
    }
  });

  it('the UI selector loads from the dynamic eligible-workflow API (not a static list)', () => {
    const uiSrc = readSrc('src/components/dashboard/autopilot-tab.tsx');
    expect(uiSrc).toContain("fetch('/api/autopilot/workflows')");
    expect(uiSrc).not.toContain('/api/workflows?status=active');
  });

  it('the eligible list is derived from a live db query in the service', () => {
    const serviceSrc = readSrc('src/lib/autopilot/service.ts');
    expect(serviceSrc).toContain('listEligibleWorkflows');
    expect(serviceSrc).toContain('workflowDefinition.findMany');
  });
});

describe('billing invariants preserved', () => {
  it('the canonical workflow execution fee is still a flat 5 credits', () => {
    expect(WORKFLOW_EXECUTION_FEE_CREDITS).toBe(5);
  });

  it('a rejected selection never reaches row creation — no execution/charge pathway exists', async () => {
    // Invalid selection (foreign + inactive) → no autopilot row is created;
    // with no autopilot and no execution, no billing service can be invoked.
    mockPrisma.workflowDefinition.findFirst.mockResolvedValue(null);
    await createAutopilot(USER_A, null, 'pro', {
      name: 'never created',
      niches: ['Dentists'],
      geography: {},
      workflowId: 'foreign-wf',
      schedule: 'daily',
      activate: false,
    });
    expect(mockPrisma.autopilotWorkflow.create).not.toHaveBeenCalled();
  });
});
