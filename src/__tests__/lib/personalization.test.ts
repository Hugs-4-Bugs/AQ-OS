// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Phases 16–17 — Per-Lead Personalized Intelligence +
// Personalized Workflow/Outreach (precedence + batch integration)
//
// THE MODEL this suite locks down (Oct 2026):
//   • Per-lead intelligence is LEAD-SPECIFIC: two leads whose
//     business/niche/geography/signals differ produce MATERIALLY
//     different contexts — never one generic block reused for all leads.
//   • Profile resolution precedence: explicitly supplied execution
//     settings → workflow/campaign override → user's default profile.
//   • Outreach settings precedence: business-profile defaults →
//     workflow (step) overrides → explicit execution settings.
//   • Batch execution: ONE WorkflowExecution for N leads; each lead's
//     ActionContext carries ITS OWN intelligence + the run's execution
//     settings; the intelligenceConfig snapshot rides triggerData;
//     billing stays flat 5 credits per successful run.
//   • Retry restores the run's original personalization config.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Simulated ledger (credit-service contract, same as the batch suite) ──
const sim = vi.hoisted(() => {
  const state = {
    balance: {} as Record<string, number>,
    rows: [] as Array<{ userId: string; action: string; credits: number; balance: number; description: string | null; referenceId: string | null }>,
    executions: new Map<string, Record<string, unknown>>(),
    leadItems: new Map<string, Record<string, unknown>>(),
    // Personalization sources:
    businessProfiles: new Map<string, Record<string, unknown>>(),
    userSettings: new Map<string, Record<string, unknown>>(),
    leads: new Map<string, Record<string, unknown>>(),
    execCounter: 0,
    itemCounter: 0,
  };

  const deductCredits = vi.fn(async (p: {
    userId: string; action: string; cost: number; referenceId?: string; idempotencyKey?: string; description?: string;
  }) => {
    const label = p.idempotencyKey ? `${p.action}_idempotent_${p.idempotencyKey}` : p.action;
    const existing = state.rows.find((r) => r.userId === p.userId && r.action === label);
    if (existing) return { success: true, newBalance: existing.balance, ledgerEntryId: 'led_dup', alreadyProcessed: true };
    const current = state.balance[p.userId] ?? 0;
    if (current < p.cost) return { success: false, newBalance: 0, error: 'Insufficient credits' };
    const newBalance = current - p.cost;
    state.balance[p.userId] = newBalance;
    state.rows.push({ userId: p.userId, action: label, credits: -p.cost, balance: newBalance, description: p.description || null, referenceId: p.referenceId ?? null });
    return { success: true, newBalance, ledgerEntryId: `led_${state.rows.length}` };
  });

  const refundCredits = vi.fn(async (p: {
    userId: string; amount: number; originalAction: string; referenceId?: string; idempotencyKey?: string; description?: string;
  }) => {
    const label = p.idempotencyKey ? `${p.originalAction}_refund_idempotent_${p.idempotencyKey}` : `${p.originalAction}_refund`;
    const existing = state.rows.find((r) => r.userId === p.userId && r.action === label);
    if (existing) return { success: true, newBalance: existing.balance, ledgerEntryId: 'led_dup', alreadyProcessed: true };
    const newBalance = (state.balance[p.userId] ?? 0) + p.amount;
    state.balance[p.userId] = newBalance;
    state.rows.push({ userId: p.userId, action: label, credits: p.amount, balance: newBalance, description: p.description || null, referenceId: p.referenceId ?? null });
    return { success: true, newBalance, ledgerEntryId: `led_${state.rows.length}` };
  });

  const checkCreditSufficiency = vi.fn(async (userId: string, amount: number) => {
    const balance = state.balance[userId] ?? 0;
    return { sufficient: balance >= amount, balance, shortfall: Math.max(0, amount - balance) };
  });

  const creditsLedgerFindFirst = vi.fn(async ({ where }: {
    where: { userId: string; action?: { startsWith?: string }; referenceId?: { in?: string[] } };
  }) => state.rows.find((r) => {
    if (r.userId !== where.userId) return false;
    if (where.action?.startsWith && !r.action.startsWith(where.action.startsWith)) return false;
    if (where.referenceId?.in && !where.referenceId.in.includes(r.referenceId ?? '')) return false;
    return true;
  }) ?? null);

  return { state, deductCredits, refundCredits, checkCreditSufficiency, creditsLedgerFindFirst };
});

const mocks = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn((fn: (tx?: unknown) => Promise<unknown>) => fn()),
    workflowDefinition: { findFirst: vi.fn(), findUnique: vi.fn() },
    workflowExecution: {
      findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(),
      create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn(), groupBy: vi.fn(),
    },
    workflowExecutionLead: {
      findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), createMany: vi.fn(),
      update: vi.fn(), updateMany: vi.fn(), count: vi.fn(), groupBy: vi.fn(),
    },
    workflowLog: { create: vi.fn(async () => ({})) },
    discoveryJob: { findUnique: vi.fn() },
    creditsLedger: { findFirst: sim.creditsLedgerFindFirst },
    user: { findUnique: vi.fn(async () => ({ plan: 'pro', credits: 100 })) },
    // Phase 16/17 personalization sources:
    lead: { findFirst: vi.fn() },
    userSettings: { findUnique: vi.fn() },
    businessProfile: { findFirst: vi.fn() },
  },
  executeAction: vi.fn(),
  sendToDeadLetter: vi.fn(),
  startDiscoveryJob: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/credit-service', () => ({
  deductCredits: sim.deductCredits,
  refundCredits: sim.refundCredits,
  checkCreditSufficiency: sim.checkCreditSufficiency,
}));
vi.mock('@/lib/workflow-actions', () => ({ executeAction: mocks.executeAction }));
vi.mock('@/lib/workflow-dead-letter', () => ({ sendToDeadLetter: mocks.sendToDeadLetter }));
vi.mock('@/lib/workflow-audit', () => ({ logWorkflowEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/realtime-event-bus', () => ({ publishEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/notification-service', () => ({ createNotificationOnce: vi.fn(async () => ({})) }));
vi.mock('@/lib/billing-audit', () => ({ logCreditEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/lead-discovery-service', () => ({ startDiscoveryJob: mocks.startDiscoveryJob }));

// REAL modules under test:
import { executeWorkflowBatch, retryBatchExecution } from '@/lib/workflow-batch';
import { WORKFLOW_EXECUTION_FEE_CREDITS } from '@/lib/workflow-credits';
import {
  resolveBusinessProfileForUser,
  resolveEffectiveSettings,
  buildLeadIntelligence,
  buildLeadIntelligenceBlock,
  loadLeadFacts,
  OUTREACH_SETTING_KEYS,
  type LeadFacts,
} from '@/lib/lead-intelligence';

const USER = 'user_p16';
const OTHER = 'user_p16_other';
const FEE = WORKFLOW_EXECUTION_FEE_CREDITS; // 5
const START_BALANCE = 500;

// ── Personalization fixtures ────────────────────────────────────────

const PROFILE_EXECUTION = { // Tier 1: explicit execution setting
  id: 'bp_exec', userId: USER, name: 'Execution Tier Profile', status: 'active', isDefault: false,
  industry: 'Execution Industry', description: 'Execution-tier description',
  productsServices: 'Exec services', offers: 'Exec offer', valueProposition: 'Exec value',
  targetAudience: 'Exec audience', preferredTone: 'urgent', preferredLanguage: 'English', cta: 'Exec CTA',
  createdAt: '2026-10-01T00:00:03Z', customInstructions: null, outreachPreferences: null,
  differentiators: null, proofPoints: null, painPoints: null, geographicMarket: null, targetIndustries: null,
};
const PROFILE_WORKFLOW = { // Tier 2: workflow override
  id: 'bp_wf', userId: USER, name: 'Workflow Tier Profile', status: 'active', isDefault: false,
  industry: 'Workflow Industry', description: 'Workflow-tier description',
  productsServices: 'Wf services', offers: 'Wf offer', valueProposition: 'Wf value',
  targetAudience: 'Wf audience', preferredTone: 'formal', preferredLanguage: null, cta: 'Wf CTA',
  createdAt: '2026-10-01T00:00:02Z', customInstructions: 'Wf custom instructions', outreachPreferences: null,
  differentiators: null, proofPoints: null, painPoints: null, geographicMarket: null, targetIndustries: null,
};
const PROFILE_DEFAULT = { // Tier 3: explicit default flag
  id: 'bp_def', userId: USER, name: 'Default Tier Profile', status: 'active', isDefault: true,
  industry: 'Default Industry', description: 'Default-tier description',
  productsServices: 'Default services', offers: 'Default offer', valueProposition: 'Default value',
  targetAudience: 'Default audience', preferredTone: 'friendly', preferredLanguage: 'English', cta: 'Default CTA',
  createdAt: '2026-10-01T00:00:01Z', customInstructions: 'Default instructions', outreachPreferences: 'Default outreach prefs',
  differentiators: null, proofPoints: null, painPoints: null, geographicMarket: null, targetIndustries: null,
};
const PROFILE_OTHER_USER = {
  id: 'bp_other', userId: OTHER, name: 'Foreign Profile', status: 'active', isDefault: true,
  industry: 'Foreign', description: 'Foreign desc', preferredTone: 'casual',
  createdAt: '2026-10-01T00:00:00Z',
};

const SETTINGS = {
  personalContext: JSON.stringify({
    whatYouDo: 'I run a healthcare SaaS agency',
    services: 'Automation, integrations',
    goals: 'Sign 10 clinics',
    positioning: 'Fastest deployment in the industry',
  }),
  servicesOffered: JSON.stringify([
    { id: 'o1', label: 'AI Receptionist', category: 'ai_automation', description: '24/7 automated call handling' },
    { id: 'o2', label: 'Billing Automation', category: 'saas', description: 'Insurance claim automation' },
  ]),
};

const LEAD_DENTAL: LeadFacts = {
  id: 'lead_dental', businessName: 'Smile Dental Clinic', niche: 'Dental', city: 'Mumbai', country: 'India',
  website: 'https://smiledental.example', rating: 4.8, reviews: '220 reviews', notes: 'Wants automation for appointments',
  source: 'google_maps', stage: 'discovered',
};
const LEAD_AYUR: LeadFacts = {
  id: 'lead_ayur', businessName: 'Ayur Wellness Retreat', niche: 'Ayurvedic Wellness', city: 'Kochi', country: 'India',
  website: 'https://ayurretreat.example', rating: 3.4, reviews: '45 reviews', notes: 'Losing bookings to online portals',
  source: 'justdial', stage: 'new',
};

function primePersonalization() {
  mocks.db.businessProfile.findFirst.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => {
      const rows = [
        PROFILE_EXECUTION, PROFILE_WORKFLOW, PROFILE_DEFAULT, PROFILE_OTHER_USER,
      ].filter((p) => {
        if (where.id && p.id !== where.id) return false;
        if (where.userId && p.userId !== where.userId) return false;
        if (where.status && p.status !== where.status) return false;
        if (where.isDefault !== undefined && p.isDefault !== where.isDefault) return false;
        return true;
      });
      rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      return rows[0] ?? null;
    }
  );
  mocks.db.userSettings.findUnique.mockImplementation(
    async ({ where }: { where: { userId: string } }) => {
      if (where.userId === USER) return { ...SETTINGS };
      return null;
    }
  );
  mocks.db.lead.findFirst.mockImplementation(
    async ({ where }: { where: { id: string; userId: string } }) => {
      if (where.userId !== USER) return null;
      if (where.id === LEAD_DENTAL.id) return { ...LEAD_DENTAL };
      if (where.id === LEAD_AYUR.id) return { ...LEAD_AYUR };
      return null;
    }
  );
}

// ── Batch fixtures (same shape as the multi-lead suite) ─────────────

function makeStep(id: string, name: string, actionType: string, config: Record<string, unknown> = {}) {
  return { id, type: 'action', name, config: JSON.stringify({ actionType, ...config }), order: 0, nextStepId: null };
}
const STEP_OUTREACH = makeStep('s1', 'AI outreach', 'ai_outreach', { channel: 'email', tone: 'professional' });

function workflowWith(profileId: string | null) {
  return {
    id: 'wf_p16', userId: USER, name: 'Personalization Test Workflow', status: 'active',
    triggerType: 'manual', requiresApproval: false, profileId,
    nodes: '[]', workflowSteps: [STEP_OUTREACH],
  };
}

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'workflow') {
      const rel = cond as Record<string, unknown>;
      if (rel.userId !== undefined && row.userId !== rel.userId) return false;
      continue;
    }
    if (key === 'OR') {
      const anyOk = (cond as Array<Record<string, unknown>>).some((sub) => matchesWhere(row, sub));
      if (!anyOk) return false;
      continue;
    }
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      const c = cond as Record<string, unknown>;
      if ('in' in c) {
        if (!(c.in as unknown[]).includes(row[key])) return false;
        continue;
      }
      if ('gte' in c) {
        const rowVal = row[key] instanceof Date ? (row[key] as Date).getTime() : new Date(String(row[key])).getTime() || 0;
        const condVal = c.gte instanceof Date ? (c.gte as Date).getTime() : new Date(String(c.gte)).getTime() || 0;
        if (rowVal < condVal) return false;
        continue;
      }
      if ('increment' in c) continue;
      if (row[key] !== cond) return false;
      continue;
    }
    if (row[key] !== cond) return false;
  }
  return true;
}

function primeBatchStores(workflow: Record<string, unknown>) {
  mocks.db.workflowDefinition.findFirst.mockResolvedValue(workflow);
  mocks.db.workflowDefinition.findUnique.mockResolvedValue(workflow);
  mocks.db.workflowExecution.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const id = `exec_${++sim.state.execCounter}`;
    sim.state.executions.set(id, {
      id, workflowId: data.workflowId, userId: data.userId, status: data.status ?? 'running',
      currentStep: 0, totalSteps: data.totalSteps ?? 0, error: data.error ?? null,
      retryCount: 0, maxRetries: data.maxRetries ?? 3, timeoutMs: data.timeoutMs ?? 300000,
      idempotencyKey: data.idempotencyKey ?? null, triggerData: data.triggerData ?? null,
      completedAt: null, durationMs: null, startedAt: new Date(),
      workflow: { id: data.workflowId, userId: data.userId, name: workflow.name },
    });
    return { id };
  });
  mocks.db.workflowExecution.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => sim.state.executions.get(where.id) ?? null
  );
  mocks.db.workflowExecution.findFirst.mockImplementation(
    async ({ where }: { where: { id?: string; idempotencyKey?: string; workflowId?: string } }) => {
      if (where.id) {
        const row = sim.state.executions.get(where.id);
        return row ? { ...row, workflow: { userId: USER, id: workflow.id } } : null;
      }
      if (where.idempotencyKey && where.workflowId) {
        for (const row of sim.state.executions.values()) {
          if (row.idempotencyKey === where.idempotencyKey && row.workflowId === where.workflowId) {
            return { ...row, workflow: { userId: USER, id: workflow.id } };
          }
        }
      }
      return null;
    }
  );
  mocks.db.workflowExecution.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = sim.state.executions.get(where.id);
      if (!row) throw new Error('execution not found');
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === 'object' && 'increment' in (v as Record<string, unknown>)) {
          row[k] = Number(row[k] ?? 0) + (v as { increment: number }).increment;
        } else {
          row[k] = v;
        }
      }
      return row;
    }
  );
  mocks.db.workflowExecution.updateMany.mockImplementation(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0;
      for (const row of sim.state.executions.values()) {
        if (matchesWhere(row, where)) { Object.assign(row, data); count++; }
      }
      return { count };
    }
  );
  // Monthly execution limit check (checkExecutionLimit):
  mocks.db.workflowExecution.count.mockImplementation(
    async ({ where }: { where?: Record<string, unknown> } = {}) => {
      let n = 0;
      for (const row of sim.state.executions.values()) {
        if (!where || matchesWhere(row, where)) n++;
      }
      return n;
    }
  );
  mocks.db.workflowExecutionLead.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const id = `item_${++sim.state.itemCounter}`;
    sim.state.leadItems.set(id, { id, ...data, createdAt: new Date(), updatedAt: new Date() });
    return { id };
  });
  mocks.db.workflowExecutionLead.createMany.mockImplementation(async ({ data }: { data: Array<Record<string, unknown>> }) => {
    for (const d of data) {
      const id = `item_${++sim.state.itemCounter}`;
      sim.state.leadItems.set(id, { id, ...d, createdAt: new Date(), updatedAt: new Date() });
    }
    return { count: data.length };
  });
  mocks.db.workflowExecutionLead.findMany.mockImplementation(
    async ({ where }: { where?: Record<string, unknown> } = {}) =>
      [...sim.state.leadItems.values()]
        .filter((row) => !where || matchesWhere(row, where))
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  );
  mocks.db.workflowExecutionLead.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = sim.state.leadItems.get(where.id);
      if (!row) throw new Error('item not found');
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === 'object' && 'increment' in (v as Record<string, unknown>)) {
          row[k] = Number(row[k] ?? 0) + (v as { increment: number }).increment;
        } else {
          row[k] = v;
        }
      }
      return row;
    }
  );
  mocks.db.workflowExecutionLead.updateMany.mockImplementation(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0;
      for (const row of sim.state.leadItems.values()) {
        if (matchesWhere(row, where)) { Object.assign(row, data); count++; }
      }
      return { count };
    }
  );
  mocks.db.workflowExecutionLead.count.mockImplementation(
    async ({ where }: { where?: Record<string, unknown> } = {}) => {
      let n = 0;
      for (const row of sim.state.leadItems.values()) {
        if (!where || matchesWhere(row, where)) n++;
      }
      return n;
    }
  );
  mocks.db.workflowExecutionLead.groupBy.mockImplementation(
    async ({ where }: { where?: { executionId?: unknown } }) => {
      const byKey = new Map<string, { executionId: string; status: string; n: number }>();
      for (const row of sim.state.leadItems.values()) {
        const w = where?.executionId as unknown;
        if (w && typeof w === 'object' && 'in' in (w as Record<string, unknown>)) {
          if (!(w as { in: string[] }).in.includes(String(row.executionId))) continue;
        } else if (w && String(row.executionId) !== String(w)) {
          continue;
        }
        const key = `${row.executionId}|${row.status}`;
        const entry = byKey.get(key) ?? { executionId: String(row.executionId), status: String(row.status), n: 0 };
        entry.n++;
        byKey.set(key, entry);
      }
      return [...byKey.values()].map((e) => ({ executionId: e.executionId, status: e.status, _count: { _all: e.n } }));
    }
  );
  mocks.executeAction.mockReset();
  mocks.executeAction.mockImplementation(async () => ({ success: true, output: { ok: true } }));
}

beforeEach(() => {
  vi.clearAllMocks();
  sim.state.balance = {};
  sim.state.rows = [];
  sim.state.executions.clear();
  sim.state.leadItems.clear();
  sim.state.businessProfiles.clear();
  sim.state.userSettings.clear();
  sim.state.leads.clear();
  sim.state.balance[USER] = START_BALANCE;
  primePersonalization();
});

// ═══ PHASE 16 — per-lead intelligence ═══════════════════════════════

describe('per-lead personalized intelligence', () => {
  it('two leads with different data produce MATERIALLY different contexts', async () => {
    const a = await buildLeadIntelligence(USER, LEAD_DENTAL, { resolvedProfile: { profile: PROFILE_DEFAULT, source: 'default' } });
    const b = await buildLeadIntelligence(USER, LEAD_AYUR, { resolvedProfile: { profile: PROFILE_DEFAULT, source: 'default' } });

    // Structured objects differ on every lead-specific axis:
    expect(a.lead.businessName).not.toBe(b.lead.businessName);
    expect(a.lead.niche).not.toBe(b.lead.niche);
    expect(a.lead.geography).not.toBe(b.lead.geography);
    expect(a.lead.signals).not.toEqual(b.lead.signals);

    // Prompt blocks are materially different (not a shared generic block):
    const blockA = buildLeadIntelligenceBlock(a);
    const blockB = buildLeadIntelligenceBlock(b);
    expect(blockA).not.toBe(blockB);
    expect(blockA).toContain('Smile Dental Clinic');
    expect(blockA).toContain('Dental');
    expect(blockA).toContain('Mumbai');
    expect(blockA).toContain('Rating 4.8');
    expect(blockB).toContain('Ayur Wellness Retreat');
    expect(blockB).toContain('Ayurvedic Wellness');
    expect(blockB).toContain('Kochi');
    expect(blockB).toContain('Rating 3.4');
    // Shared user-side tier present in both (sender identity):
    expect(blockA).toContain('Default Tier Profile');
    expect(blockB).toContain('Default Tier Profile');
  });

  it('embeds business profile + My Context + My Offer + lead signals', async () => {
    const intel = await buildLeadIntelligence(USER, LEAD_DENTAL, { resolvedProfile: { profile: PROFILE_WORKFLOW, source: 'workflow' } });
    expect(intel.businessProfile?.name).toBe('Workflow Tier Profile');
    expect(intel.myContext.whatYouDo).toBe('I run a healthcare SaaS agency');
    expect(intel.myOffer.map((o) => o.label)).toEqual(['AI Receptionist', 'Billing Automation']);
    expect(intel.lead.signals.join(' ')).toContain('Rating 4.8');

    const block = buildLeadIntelligenceBlock(intel);
    expect(block).toContain('Wf services');
    expect(block).toContain('I run a healthcare SaaS agency');
    expect(block).toContain('AI Receptionist');
    expect(block).toContain('Wf custom instructions');
  });

  it('lead facts loader is owner-scoped (foreign lead → null)', async () => {
    const own = await loadLeadFacts(USER, LEAD_DENTAL.id);
    expect(own?.businessName).toBe('Smile Dental Clinic');
    const foreign = await loadLeadFacts(OTHER, LEAD_DENTAL.id);
    expect(foreign).toBeNull();
  });

  it('a user with NO profile/context/offer still gets a valid lead-only intelligence', async () => {
    const intel = await buildLeadIntelligence(OTHER, { ...LEAD_DENTAL, id: 'lead_x' }, { resolvedProfile: { profile: null, source: 'none' } });
    expect(intel.businessProfile).toBeNull();
    expect(intel.myContext).toEqual({});
    expect(intel.myOffer).toEqual([]);
    expect(intel.lead.businessName).toBe('Smile Dental Clinic'); // lead floor always present
    expect(buildLeadIntelligenceBlock(intel)).toContain('Smile Dental Clinic');
  });
});

// ═══ PRECEDENCE — profile resolution ════════════════════════════════

describe('Profile resolution precedence (execution → workflow → default)', () => {
  it('explicit execution setting wins over workflow and default', async () => {
    const r = await resolveBusinessProfileForUser(USER, {
      explicitProfileId: 'bp_exec', workflowProfileId: 'bp_wf',
    });
    expect(r.profile?.id).toBe('bp_exec');
    expect(r.source).toBe('execution-setting');
  });

  it('workflow override wins when no execution setting', async () => {
    const r = await resolveBusinessProfileForUser(USER, { workflowProfileId: 'bp_wf' });
    expect(r.profile?.id).toBe('bp_wf');
    expect(r.source).toBe('workflow');
  });

  it('falls back to the explicit default profile (isDefault flag)', async () => {
    const r = await resolveBusinessProfileForUser(USER, {});
    expect(r.profile?.id).toBe('bp_def');
    expect(r.source).toBe('default');
  });

  it('foreign profile id in execution setting is IGNORED (falls through to workflow)', async () => {
    const r = await resolveBusinessProfileForUser(USER, {
      explicitProfileId: 'bp_other', // belongs to another user
      workflowProfileId: 'bp_wf',
    });
    expect(r.profile?.id).toBe('bp_wf');
    expect(r.source).toBe('workflow');
  });
});

// ═══ PRECEDENCE — outreach settings ═════════════════════════════════

describe('Outreach settings precedence (profile defaults → workflow → execution)', () => {
  it('execution settings override workflow overrides override profile defaults', () => {
    const resolved = resolveEffectiveSettings(
      OUTREACH_SETTING_KEYS,
      { tone: 'friendly', language: 'English', cta: 'Default CTA' }, // profile (broadest)
      { tone: 'formal' },                                            // workflow override
      { tone: 'urgent' }                                             // execution (highest)
    );
    expect(resolved.tone).toBe('urgent');
    expect(resolved.language).toBe('English'); // only profile defines it
    expect(resolved.cta).toBe('Default CTA');
  });

  it('workflow overrides beat profile defaults when execution silent', () => {
    const resolved = resolveEffectiveSettings(
      OUTREACH_SETTING_KEYS,
      { tone: 'friendly', cta: 'Default CTA' },
      { tone: 'formal', cta: 'Wf CTA' },
      null
    );
    expect(resolved.tone).toBe('formal');
    expect(resolved.cta).toBe('Wf CTA');
  });

  it('profile defaults apply when neither tier overrides', () => {
    const resolved = resolveEffectiveSettings(OUTREACH_SETTING_KEYS, { tone: 'friendly' }, {}, null);
    expect(resolved.tone).toBe('friendly');
  });

  it('empty/whitespace values never win any tier', () => {
    const resolved = resolveEffectiveSettings(
      OUTREACH_SETTING_KEYS,
      { tone: '  ' },
      { tone: '' },
      { tone: '   ' }
    );
    expect(resolved.tone).toBeUndefined();
  });
});

// ═══ PHASE 17 — batch execution personalization ═════════════════════

describe('personalized batch workflow execution', () => {
  it('each lead\'s ActionContext carries ITS OWN intelligence + execution settings', async () => {
    primeBatchStores(workflowWith('bp_wf'));
    const executionSettings = { profileId: 'bp_exec', tone: 'urgent', cta: 'Exec CTA' };

    const result = await executeWorkflowBatch('wf_p16', USER, {
      leads: [
        { id: LEAD_DENTAL.id, businessName: LEAD_DENTAL.businessName, niche: 'Dental' },
        { id: LEAD_AYUR.id, businessName: LEAD_AYUR.businessName, niche: 'Ayurvedic Wellness' },
      ],
      targetSnapshot: { mode: 'selected_leads', leadCount: 2 },
      awaitCompletion: true,
      executionSettings,
    });

    expect(result.status).toBe('completed');
    expect(sim.state.executions.size).toBe(1); // ONE execution for 2 leads

    // Every action call received the run's execution settings:
    for (const call of mocks.executeAction.mock.calls) {
      const ctx = call[2] as Record<string, unknown>;
      expect(ctx.executionSettings).toEqual(executionSettings);
    }

    // Per-lead intelligence is LEAD-SPECIFIC and resolved with the
    // EXECUTION-tier profile (bp_exec beats the workflow's bp_wf):
    const contexts = mocks.executeAction.mock.calls.map((c) => c[2] as {
      leadId: string;
      leadIntelligence?: { lead: { businessName: string; niche: string | null }; businessProfile: { id: string; source: string } | null };
    });
    const dentalCtx = contexts.find((c) => c.leadId === LEAD_DENTAL.id);
    const ayurCtx = contexts.find((c) => c.leadId === LEAD_AYUR.id);
    expect(dentalCtx?.leadIntelligence?.lead.businessName).toBe('Smile Dental Clinic');
    expect(dentalCtx?.leadIntelligence?.businessProfile?.id).toBe('bp_exec');
    expect(dentalCtx?.leadIntelligence?.businessProfile?.source).toBe('execution-setting');
    expect(ayurCtx?.leadIntelligence?.lead.businessName).toBe('Ayur Wellness Retreat');
    expect(ayurCtx?.leadIntelligence?.businessProfile?.id).toBe('bp_exec');
    // Materially different per-lead contexts:
    expect(dentalCtx?.leadIntelligence?.lead.niche).not.toBe(ayurCtx?.leadIntelligence?.lead.niche);
  });

  it('without execution settings, the WORKFLOW profile tier is used', async () => {
    primeBatchStores(workflowWith('bp_wf'));
    await executeWorkflowBatch('wf_p16', USER, {
      leads: [{ id: LEAD_DENTAL.id, businessName: LEAD_DENTAL.businessName, niche: 'Dental' }],
      targetSnapshot: { mode: 'selected_leads', leadCount: 1 },
      awaitCompletion: true,
    });
    const ctx = mocks.executeAction.mock.calls[0][2] as {
      leadIntelligence?: { businessProfile: { id: string; source: string } | null };
    };
    expect(ctx.leadIntelligence?.businessProfile?.id).toBe('bp_wf');
    expect(ctx.leadIntelligence?.businessProfile?.source).toBe('workflow');
  });

  it('workflow with NO profile falls back to the user default profile', async () => {
    primeBatchStores(workflowWith(null));
    await executeWorkflowBatch('wf_p16', USER, {
      leads: [{ id: LEAD_DENTAL.id, businessName: LEAD_DENTAL.businessName, niche: 'Dental' }],
      targetSnapshot: { mode: 'selected_leads', leadCount: 1 },
      awaitCompletion: true,
    });
    const ctx = mocks.executeAction.mock.calls[0][2] as {
      leadIntelligence?: { businessProfile: { id: string; source: string } | null };
    };
    expect(ctx.leadIntelligence?.businessProfile?.id).toBe('bp_def');
    expect(ctx.leadIntelligence?.businessProfile?.source).toBe('default');
  });

  it('intelligenceConfig snapshot rides the execution triggerData', async () => {
    primeBatchStores(workflowWith('bp_wf'));
    const executionSettings = { profileId: 'bp_exec', tone: 'urgent' };
    await executeWorkflowBatch('wf_p16', USER, {
      leads: [{ id: LEAD_DENTAL.id, businessName: LEAD_DENTAL.businessName, niche: 'Dental' }],
      targetSnapshot: { mode: 'selected_leads', leadCount: 1 },
      awaitCompletion: true,
      executionSettings,
    });
    const execution = [...sim.state.executions.values()][0];
    const triggerData = JSON.parse(String(execution.triggerData));
    expect(triggerData.intelligenceConfig).toMatchObject({
      profileId: 'bp_exec',
      profileName: 'Execution Tier Profile',
      profileSource: 'execution-setting',
    });
    expect(triggerData.intelligenceConfig.executionSettings).toEqual(executionSettings);
    expect(triggerData.workflowSnapshot.profileId).toBe('bp_wf');
  });

  it('billing stays flat 5 credits for a personalized multi-lead run', async () => {
    primeBatchStores(workflowWith('bp_wf'));
    // The route charges the flat fee at run acceptance — drive the same
    // charge (idempotent, run-keyed) then execute the batch.
    const { chargeWorkflowExecutionFee } = await import('@/lib/workflow-credits');
    const charge = await chargeWorkflowExecutionFee({
      userId: USER, workflowId: 'wf_p16', chargeKey: 'wfexec-run:p16_billing',
      source: 'MANUAL_WORKFLOW', referenceId: 'p16_billing', leadCount: 2,
    });
    expect(charge.ok).toBe(true);
    await executeWorkflowBatch('wf_p16', USER, {
      leads: [
        { id: LEAD_DENTAL.id, businessName: LEAD_DENTAL.businessName, niche: 'Dental' },
        { id: LEAD_AYUR.id, businessName: LEAD_AYUR.businessName, niche: 'Ayurvedic Wellness' },
      ],
      targetSnapshot: { mode: 'selected_leads', leadCount: 2, runBatchId: 'p16_billing' },
      idempotencyKey: 'batch_p16_billing',
      awaitCompletion: true,
      neverStartedAutoRefund: true,
    });
    expect(sim.state.balance[USER]).toBe(START_BALANCE - FEE); // 2 leads → 5, not 10
    const charges = sim.state.rows.filter((r) => r.credits < 0);
    expect(charges).toHaveLength(1); // exactly one charge, no per-lead fees
  });

  it('retry restores the run\'s original personalization config (snapshot profile + settings)', async () => {
    primeBatchStores(workflowWith('bp_wf'));
    const executionSettings = { profileId: 'bp_exec', tone: 'urgent' };
    const runKey = 'retry_p16';
    const first = await executeWorkflowBatch('wf_p16', USER, {
      leads: [{ id: LEAD_DENTAL.id, businessName: LEAD_DENTAL.businessName, niche: 'Dental' }],
      targetSnapshot: { mode: 'selected_leads', leadCount: 1, runBatchId: runKey },
      idempotencyKey: `batch_${runKey}`,
      awaitCompletion: true,
      executionSettings,
    });
    expect(first.status).toBe('completed');

    // Mark the lead failed so a retry is possible, then re-run:
    const item = [...sim.state.leadItems.values()][0];
    item.status = 'failed';
    const execution = sim.state.executions.get(first.executionId) as Record<string, unknown>;
    execution.status = 'partial';

    mocks.executeAction.mockClear();
    const retry = await retryBatchExecution(first.executionId, USER);
    expect(retry.success).toBe(true);

    const ctx = mocks.executeAction.mock.calls[0][2] as {
      executionSettings?: Record<string, unknown>;
      leadIntelligence?: { businessProfile: { id: string } | null };
    };
    expect(ctx.executionSettings).toEqual(executionSettings);
    expect(ctx.leadIntelligence?.businessProfile?.id).toBe('bp_exec'); // snapshotted profile restored
  });
});
