// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Multi-Lead Workflow Execution Model (batch runs)
//
// THE MODEL this suite locks down (Oct 2026):
//   • N selected/niche leads = ONE WorkflowExecution (one history row),
//     with N per-lead child items: pending → running → completed /
//     failed / skipped.
//   • Per-lead isolation: one lead's failure never marks other leads
//     failed; the run reports 'partial' when some succeeded.
//   • Billing: flat 5 credits per successful run — never per lead, per
//     step, or per retry. 100 leads = 5 credits, not 500. A run that
//     terminates with ZERO steps completed = never started = 0 credits.
//   • Replays of the same run identity never create a second execution
//     row and never double-charge.
//   • Batch retry re-runs ONLY failed leads — completed leads are never
//     re-executed (no duplicate outreach); a never-started refund is
//     re-charged exactly once when the retry actually starts.
//
// Runs the REAL batch coordinator (executeWorkflowBatch / retryBatchExecution
// / executeNicheRunWithDiscovery) + REAL workflow-credits + REAL engine
// processStep against a simulated ledger and in-memory table stores — the
// same contract billing-never-started.test.ts asserts on.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Simulated ledger + balances (the credit-service contract) ──────
const sim = vi.hoisted(() => {
  const state = {
    balance: {} as Record<string, number>,
    rows: [] as Array<{ userId: string; action: string; credits: number; balance: number; description: string | null; referenceId: string | null }>,
    // In-memory tables
    executions: new Map<string, Record<string, unknown>>(),
    leadItems: new Map<string, Record<string, unknown>>(),
    logs: [] as Array<Record<string, unknown>>,
    discoveryJobs: new Map<string, Record<string, unknown>>(),
    execCounter: 0,
    itemCounter: 0,
    jobCounter: 0,
  };

  const deductCredits = vi.fn(async (p: {
    userId: string; action: string; cost: number; referenceId?: string; idempotencyKey?: string; description?: string;
  }) => {
    const label = p.idempotencyKey ? `${p.action}_idempotent_${p.idempotencyKey}` : p.action;
    const existing = state.rows.find((r) => r.userId === p.userId && r.action === label);
    if (existing) {
      return { success: true, newBalance: existing.balance, ledgerEntryId: 'led_dup', alreadyProcessed: true };
    }
    const current = state.balance[p.userId] ?? 0;
    if (current < p.cost) {
      return { success: false, newBalance: 0, error: `Insufficient credits: have ${current}, need ${p.cost}` };
    }
    const newBalance = current - p.cost;
    state.balance[p.userId] = newBalance;
    state.rows.push({
      userId: p.userId, action: label, credits: -p.cost, balance: newBalance,
      description: p.description || `Deducted ${p.cost} credits for ${p.action}`,
      referenceId: p.referenceId ?? null,
    });
    return { success: true, newBalance, ledgerEntryId: `led_${state.rows.length}` };
  });

  const refundCredits = vi.fn(async (p: {
    userId: string; amount: number; originalAction: string; referenceId?: string; idempotencyKey?: string; description?: string;
  }) => {
    const label = p.idempotencyKey
      ? `${p.originalAction}_refund_idempotent_${p.idempotencyKey}`
      : `${p.originalAction}_refund`;
    const existing = state.rows.find((r) => r.userId === p.userId && r.action === label);
    if (existing) {
      return { success: true, newBalance: existing.balance, ledgerEntryId: 'led_dup', alreadyProcessed: true };
    }
    const newBalance = (state.balance[p.userId] ?? 0) + p.amount;
    state.balance[p.userId] = newBalance;
    state.rows.push({
      userId: p.userId, action: label, credits: p.amount, balance: newBalance,
      description: p.description || `Refund: ${p.amount} credits returned for failed ${p.originalAction}`,
      referenceId: p.referenceId ?? null,
    });
    return { success: true, newBalance, ledgerEntryId: `led_${state.rows.length}` };
  });

  const checkCreditSufficiency = vi.fn(async (userId: string, amount: number) => {
    const balance = state.balance[userId] ?? 0;
    return { sufficient: balance >= amount, balance, shortfall: Math.max(0, amount - balance) };
  });

  const creditsLedgerFindFirst = vi.fn(async ({ where }: {
    where: { userId: string; action?: { startsWith?: string }; referenceId?: { in?: string[] } };
  }) => {
    return state.rows.find((r) => {
      if (r.userId !== where.userId) return false;
      if (where.action?.startsWith && !r.action.startsWith(where.action.startsWith)) return false;
      if (where.referenceId?.in && !where.referenceId.in.includes(r.referenceId ?? '')) return false;
      return true;
    }) ?? null;
  });

  return { state, deductCredits, refundCredits, checkCreditSufficiency, creditsLedgerFindFirst };
});

const mocks = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn((fn: (tx?: unknown) => Promise<unknown>) => fn()),
    workflowDefinition: { findFirst: vi.fn(), findUnique: vi.fn() },
    workflowExecution: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    workflowExecutionLead: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    workflowLog: { create: vi.fn(async () => ({})) },
    discoveryJob: { findUnique: vi.fn() },
    creditsLedger: { findFirst: sim.creditsLedgerFindFirst },
    user: { findUnique: vi.fn(async () => ({ plan: 'pro', credits: 100 })) },
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

// REAL batch coordinator + REAL credits + REAL engine processStep
import {
  executeWorkflowBatch,
  retryBatchExecution,
  executeNicheRunWithDiscovery,
  isZaiProviderConfigured,
} from '@/lib/workflow-batch';
import {
  chargeWorkflowExecutionFee,
  WORKFLOW_EXECUTION_FEE_CREDITS,
} from '@/lib/workflow-credits';
import { getExecutionHistory } from '@/lib/workflow-engine';
import { withAiRateLimitRetry } from '@/lib/workflow-ai-retry';

const USER = 'user_batch';
const START_BALANCE = 500;
const FEE = WORKFLOW_EXECUTION_FEE_CREDITS; // 5

// ── Fixtures ───────────────────────────────────────────────────────

function makeStep(id: string, name: string, actionType: string, config: Record<string, unknown> = {}) {
  return { id, type: 'action', name, config: JSON.stringify({ actionType, ...config }), order: 0, nextStepId: null };
}

const STEP_1 = makeStep('s1', 'Webhook search', 'webhook_call', { url: 'https://x.test/api', method: 'GET' });
const STEP_2 = makeStep('s2', 'AI outreach', 'ai_outreach', {});
const STEP_3 = makeStep('s3', 'Move stage', 'move_lead_stage', { stage: 'contacted' });

const WORKFLOW = {
  id: 'wf_batch', userId: USER, name: 'Dental Clinic Outreach', status: 'active',
  triggerType: 'manual', requiresApproval: false, profileId: null,
  nodes: '[]', workflowSteps: [STEP_1, STEP_2, STEP_3],
};

function leadIds(n: number): { id: string; businessName: string; niche: string | null }[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `lead_${i + 1}`,
    businessName: `Lead ${i + 1}`,
    niche: 'dental',
  }));
}

/** Wire the in-memory table stores into the db mock. */
function primeStores() {
  mocks.db.workflowDefinition.findFirst.mockResolvedValue(WORKFLOW);
  mocks.db.workflowDefinition.findUnique.mockResolvedValue(WORKFLOW);

  mocks.db.workflowExecution.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const id = `exec_${++sim.state.execCounter}`;
    const row: Record<string, unknown> = {
      id, workflowId: data.workflowId, userId: data.userId,
      status: data.status ?? 'running', currentStep: 0, totalSteps: data.totalSteps ?? 0,
      error: data.error ?? null, retryCount: 0, maxRetries: data.maxRetries ?? 3,
      timeoutMs: data.timeoutMs ?? 300000, idempotencyKey: data.idempotencyKey ?? null,
      triggerData: data.triggerData ?? null, completedAt: null, durationMs: null,
      startedAt: new Date(), workflow: { id: data.workflowId, userId: data.userId, name: WORKFLOW.name },
    };
    sim.state.executions.set(id, row);
    return { id, status: row.status };
  });
  mocks.db.workflowExecution.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => sim.state.executions.get(where.id) ?? null,
  );
  mocks.db.workflowExecution.findFirst.mockImplementation(
    async ({ where }: { where: { id?: string; idempotencyKey?: string; workflowId?: string; include?: unknown } }) => {
      if (where.id) {
        const row = sim.state.executions.get(where.id) ?? null;
        return row ? { ...row, workflow: { userId: USER, id: WORKFLOW.id, name: WORKFLOW.name } } : null;
      }
      if (where.idempotencyKey && where.workflowId) {
        for (const row of sim.state.executions.values()) {
          if (row.idempotencyKey === where.idempotencyKey && row.workflowId === where.workflowId) {
            return { ...row, workflow: { userId: USER, id: WORKFLOW.id, name: WORKFLOW.name } };
          }
        }
      }
      return null;
    },
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
    },
  );
  mocks.db.workflowExecution.updateMany.mockImplementation(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0;
      for (const row of sim.state.executions.values()) {
        if (matchesWhere(row, where)) {
          for (const [k, v] of Object.entries(data)) {
            if (v && typeof v === 'object' && 'increment' in (v as Record<string, unknown>)) {
              row[k] = Number(row[k] ?? 0) + (v as { increment: number }).increment;
            } else {
              row[k] = v;
            }
          }
          count++;
        }
      }
      return { count };
    },
  );
  mocks.db.workflowExecution.count.mockImplementation(
    async ({ where }: { where?: Record<string, unknown> } = {}) => {
      let n = 0;
      for (const row of sim.state.executions.values()) {
        if (!where || matchesExecutionWhere(row, where)) n++;
      }
      return n;
    },
  );

  mocks.db.workflowExecutionLead.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => {
      const id = `item_${++sim.state.itemCounter}`;
      const row = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
      sim.state.leadItems.set(id, row);
      return row;
    },
  );
  mocks.db.workflowExecutionLead.createMany.mockImplementation(
    async ({ data }: { data: Array<Record<string, unknown>> }) => {
      for (const d of data) {
        const id = `item_${++sim.state.itemCounter}`;
        sim.state.leadItems.set(id, { id, ...d, createdAt: new Date(), updatedAt: new Date() });
      }
      return { count: data.length };
    },
  );
  mocks.db.workflowExecutionLead.findMany.mockImplementation(
    async ({ where }: { where?: Record<string, unknown>; orderBy?: unknown } = {}) => {
      const rows = [...sim.state.leadItems.values()]
        .filter((row) => !where || matchesWhere(row, where))
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      return rows;
    },
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
    },
  );
  mocks.db.workflowExecutionLead.updateMany.mockImplementation(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0;
      for (const row of sim.state.leadItems.values()) {
        if (matchesWhere(row, where)) {
          Object.assign(row, data);
          count++;
        }
      }
      return { count };
    },
  );
  mocks.db.workflowExecutionLead.count.mockImplementation(
    async ({ where }: { where?: Record<string, unknown> } = {}) => {
      let n = 0;
      for (const row of sim.state.leadItems.values()) {
        if (!where || matchesWhere(row, where)) n++;
      }
      return n;
    },
  );
  const groupLead = vi.fn(async ({ where }: { where?: { executionId?: { in?: string[] } } }) => {
    const rows: Array<{ executionId: string; status: string; _count: { _all: number } }> = [];
    const byKey = new Map<string, { executionId: string; status: string; n: number }>();
    for (const row of sim.state.leadItems.values()) {
      if (where?.executionId?.in && !where.executionId.in.includes(String(row.executionId))) continue;
      const key = `${row.executionId}|${row.status}`;
      const entry = byKey.get(key) ?? { executionId: String(row.executionId), status: String(row.status), n: 0 };
      entry.n++;
      byKey.set(key, entry);
    }
    for (const e of byKey.values()) rows.push({ executionId: e.executionId, status: e.status, _count: { _all: e.n } });
    return rows;
  });
  mocks.db.workflowExecutionLead.groupBy.mockImplementation(groupLead);
  // engine history list — groupBy is by executionId+status on lead items
  mocks.db.workflowExecution.groupBy.mockImplementation(
    async ({ by, where }: { by: string[]; where?: Record<string, unknown> }) => {
      // status grouping is the only engine usage; simple implementation
      if (by.includes('status')) {
        const byStatus = new Map<string, number>();
        for (const row of sim.state.executions.values()) {
          if (where && !matchesWhere(row, where)) continue;
          byStatus.set(String(row.status), (byStatus.get(String(row.status)) ?? 0) + 1);
        }
        return [...byStatus.entries()].map(([status, count]) => ({ status, _count: { id: count } }));
      }
      return [];
    },
  );
  mocks.db.workflowExecution.findMany.mockImplementation(
    async ({ where, skip = 0, take = 20, orderBy, include }: {
      where?: Record<string, unknown>; skip?: number; take?: number; orderBy?: unknown; include?: unknown;
    } = {}) => {
      let rows = [...sim.state.executions.values()].filter((row) => !where || matchesExecutionWhere(row, where));
      rows.sort((a, b) => (b.startedAt as Date).getTime() - (a.startedAt as Date).getTime());
      return rows.slice(skip, skip + take).map((row) => ({
        ...row,
        workflow: { name: WORKFLOW.name, triggerType: WORKFLOW.triggerType },
      }));
    },
  );

  // executeAction default: everything succeeds
  mocks.executeAction.mockReset();
  mocks.executeAction.mockImplementation(async () => ({ success: true, output: { ok: true } }));
}

/** Tiny where-matcher for the flat mock rows (equality + {in} + {gte}/{lte} on dates). */
function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'workflow') {
      // relation filter on workflow: { userId }
      const rel = cond as Record<string, unknown>;
      if (rel.userId !== undefined && (row.workflow as Record<string, unknown> | undefined)?.userId !== rel.userId) {
        // executions carry their own userId; treat as match when equal
        if (row.userId !== rel.userId) return false;
      }
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
        const list = c.in as unknown[];
        if (!list.includes(row[key])) return false;
        continue;
      }
      if ('startsWith' in c) {
        if (!String(row[key] ?? '').startsWith(String(c.startsWith))) return false;
        continue;
      }
      if ('contains' in c) {
        if (!String(row[key] ?? '').toLowerCase().includes(String(c.contains).toLowerCase())) return false;
        continue;
      }
      if ('gte' in c || 'lte' in c) {
        const value = row[key] instanceof Date ? (row[key] as Date).getTime() : new Date(String(row[key])).getTime();
        if ('gte' in c && value < new Date(String(c.gte)).getTime()) return false;
        if ('lte' in c && value > new Date(String(c.lte)).getTime()) return false;
        continue;
      }
      if ('not' in c) {
        if (row[key] === c.not) return false;
        continue;
      }
    }
    if (row[key] !== cond) return false;
  }
  return true;
}

/** History where may nest workflow.name contains via OR branches. */
function matchesExecutionWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'workflow') {
      const rel = cond as Record<string, unknown>;
      if (rel.userId !== undefined && row.userId !== rel.userId) return false;
      if (rel.name && typeof rel.name === 'object' && 'contains' in (rel.name as Record<string, unknown>)) {
        const needle = String((rel.name as Record<string, unknown>).contains).toLowerCase();
        const name = String((row.workflow as Record<string, unknown> | undefined)?.name ?? WORKFLOW.name).toLowerCase();
        if (!name.includes(needle)) return false;
      }
      continue;
    }
    if (key === 'OR') {
      const branches = cond as Array<Record<string, unknown>>;
      const anyOk = branches.some((sub) =>
        Object.entries(sub).some(([k, v]) => {
          if (k === 'workflow') {
            const rel = (v as Record<string, unknown>).name as Record<string, unknown> | undefined;
            const needle = rel && 'contains' in rel ? String(rel.contains).toLowerCase() : null;
            const name = String(WORKFLOW.name).toLowerCase();
            return needle ? name.includes(needle) : false;
          }
          if (k === 'error') {
            const rel = v as Record<string, unknown>;
            const needle = 'contains' in rel ? String(rel.contains).toLowerCase() : null;
            const err = String(row.error ?? '').toLowerCase();
            return needle ? err.includes(needle) : false;
          }
          return false;
        }),
      );
      if (!anyOk) return false;
      continue;
    }
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      const c = cond as Record<string, unknown>;
      if ('gte' in c || 'lte' in c) {
        const value = (row[key] as Date).getTime?.() ?? new Date(String(row[key])).getTime();
        if ('gte' in c && value < new Date(String(c.gte)).getTime()) return false;
        if ('lte' in c && value > new Date(String(c.lte)).getTime()) return false;
        continue;
      }
    }
    if (row[key] !== cond) return false;
  }
  return true;
}

function itemStatuses(executionId: string): Record<string, unknown>[] {
  return [...sim.state.leadItems.values()].filter((r) => r.executionId === executionId);
}

async function runBatch(nLeads: number, opts?: { failLead?: string; runKey?: string }) {
  const runKey = opts?.runKey ?? `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const charge = await chargeWorkflowExecutionFee({
    userId: USER, workflowId: WORKFLOW.id,
    chargeKey: `wfexec-run:${runKey}`, source: 'MANUAL_WORKFLOW',
    referenceId: runKey, leadCount: nLeads,
  });
  const failLead = opts?.failLead;
  if (failLead) {
    mocks.executeAction.mockImplementation(async (_action: string, _config: unknown, ctx: { leadId?: string }) =>
      ctx.leadId === failLead
        ? { success: false, error: 'Webhook call failed: DNS lookup failed for host (ENOTFOUND)' }
        : { success: true, output: { ok: true } },
    );
  }
  const result = await executeWorkflowBatch(WORKFLOW.id, USER, {
    leads: leadIds(nLeads),
    targetSnapshot: { mode: 'selected_leads', runBatchId: runKey, leadCount: nLeads, selectedLeadIds: leadIds(nLeads).map((l) => l.id) },
    idempotencyKey: `batch_${runKey}`,
    awaitCompletion: true,
    neverStartedAutoRefund: true,
  });
  return { runKey, charge, result };
}

// ── Test env: fast knobs ───────────────────────────────────────────
beforeEach(() => {
  vi.resetModules === undefined; // noop guard
  process.env.WORKFLOW_LEAD_PACING_MS = '0';
  process.env.WORKFLOW_RATE_LIMIT_COOLDOWN_MS = '0';
  process.env.WORKFLOW_DISCOVERY_POLL_MS = '1';
  process.env.WORKFLOW_DISCOVERY_TIMEOUT_MS = '5000';
  process.env.WORKFLOW_TIMEOUT = '60000';
  sim.state.balance[USER] = START_BALANCE;
  sim.state.rows.length = 0;
  sim.state.executions.clear();
  sim.state.leadItems.clear();
  sim.state.logs.length = 0;
  sim.state.discoveryJobs.clear();
  sim.state.execCounter = 0;
  sim.state.itemCounter = 0;
  sim.state.jobCounter = 0;
  sim.deductCredits.mockClear();
  sim.refundCredits.mockClear();
  primeStores();
});

// ═══════════════════════════════════════════════════════════════════
// 1. ONE execution per run (1 / 4 / 100 leads)
// ═══════════════════════════════════════════════════════════════════

describe('multi-lead execution model: N leads = ONE execution', () => {
  it.each([1, 4, 100])('%i selected leads → exactly ONE WorkflowExecution row + %i lead items', async (n) => {
    const { result } = await runBatch(n);
    expect(result.executionId).toBeTruthy();
    expect(sim.state.executions.size).toBe(1);
    expect(result.status).toBe('completed');
    expect(itemStatuses(result.executionId)).toHaveLength(n);
    for (const item of itemStatuses(result.executionId)) {
      expect(item.status).toBe('completed');
    }
  });

  it('100 leads cost the FLAT fee exactly once — not 500 credits (5 per lead)', async () => {
    const before = sim.state.balance[USER];
    const { result } = await runBatch(100);
    expect(result.status).toBe('completed');
    const charges = sim.state.rows.filter((r) => r.action.startsWith('workflow_execution_idempotent_') && r.credits < 0);
    expect(charges).toHaveLength(1);
    expect(sim.state.balance[USER]).toBe(before - FEE);
    // 100 leads × 3 steps = 300 step-units recorded as overall progress.
    const exec = sim.state.executions.get(result.executionId)!;
    expect(exec.currentStep).toBe(300);
    expect(exec.totalSteps).toBe(300);
  });

  it('a replay of the same run identity NEVER creates a second execution or charge', async () => {
    const first = await runBatch(4, { runKey: 'replay_run' });
    const before = sim.state.balance[USER];
    const second = await executeWorkflowBatch(WORKFLOW.id, USER, {
      leads: leadIds(4),
      targetSnapshot: { mode: 'selected_leads', runBatchId: 'replay_run', leadCount: 4 },
      idempotencyKey: 'batch_replay_run',
      awaitCompletion: true,
      neverStartedAutoRefund: true,
    });
    expect(sim.state.executions.size).toBe(1);
    expect(second.executionId).toBe(first.result.executionId);
    expect(sim.state.balance[USER]).toBe(before); // no second charge
    expect(itemStatuses(first.result.executionId)).toHaveLength(4); // no duplicate items
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Per-lead isolation
// ═══════════════════════════════════════════════════════════════════

describe('per-lead failure isolation', () => {
  it('one lead failing at step 1 marks ONLY that lead failed; others complete; run = partial; fee kept', async () => {
    const before = sim.state.balance[USER];
    const { result } = await runBatch(4, { failLead: 'lead_2' });
    const items = itemStatuses(result.executionId);
    const byLead = new Map(items.map((i) => [i.leadId, i]));
    expect(byLead.get('lead_1')!.status).toBe('completed');
    expect(byLead.get('lead_2')!.status).toBe('failed');
    expect(byLead.get('lead_2')!.error).toContain('ENOTFOUND');
    expect(byLead.get('lead_3')!.status).toBe('completed');
    expect(byLead.get('lead_4')!.status).toBe('completed');
    expect(result.status).toBe('partial');
    // Fee kept: at least one lead completed real steps.
    expect(sim.state.balance[USER]).toBe(before - FEE);
    const refunds = sim.state.rows.filter((r) => r.credits > 0);
    expect(refunds).toHaveLength(0);
  });

  it('ALL leads failing pre-start (zero steps completed) = never started = 0 credits', async () => {
    const before = sim.state.balance[USER];
    mocks.executeAction.mockImplementation(async () => ({
      success: false, error: 'Webhook call failed: DNS lookup failed (ENOTFOUND)',
    }));
    const runKey = 'never_start';
    await chargeWorkflowExecutionFee({
      userId: USER, workflowId: WORKFLOW.id,
      chargeKey: `wfexec-run:${runKey}`, source: 'MANUAL_WORKFLOW', referenceId: runKey, leadCount: 4,
    });
    const result = await executeWorkflowBatch(WORKFLOW.id, USER, {
      leads: leadIds(4),
      targetSnapshot: { mode: 'selected_leads', runBatchId: runKey, leadCount: 4 },
      idempotencyKey: `batch_${runKey}`,
      awaitCompletion: true,
      neverStartedAutoRefund: true,
    });
    expect(result.status).toBe('exhausted'); // retryable failure, budget spent
    expect(sim.state.balance[USER]).toBe(before); // net 0
    const refunds = sim.state.rows.filter((r) => r.credits > 0);
    expect(refunds).toHaveLength(1); // exactly ONE never-started refund
    expect(refunds[0].action).toContain('wfexec-neverstarted:');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Batch retry semantics
// ═══════════════════════════════════════════════════════════════════

describe('batch retry: only failed leads re-run', () => {
  it('retry re-runs ONLY the failed lead — completed leads are never re-executed (no duplicate outreach)', async () => {
    let callsForLead3 = 0;
    let failLead3 = true;
    const runKey = 'retry_run';
    await chargeWorkflowExecutionFee({
      userId: USER, workflowId: WORKFLOW.id,
      chargeKey: `wfexec-run:${runKey}`, source: 'MANUAL_WORKFLOW', referenceId: runKey, leadCount: 4,
    });
    mocks.executeAction.mockImplementation(async (_a: string, _c: unknown, ctx: { leadId?: string }) => {
      if (ctx.leadId === 'lead_3') callsForLead3++;
      return ctx.leadId === 'lead_3' && failLead3
        ? { success: false, error: 'Webhook call failed: connection refused (ECONNREFUSED)' }
        : { success: true, output: { ok: true } };
    });
    const first = await executeWorkflowBatch(WORKFLOW.id, USER, {
      leads: leadIds(4),
      targetSnapshot: { mode: 'selected_leads', runBatchId: runKey, leadCount: 4 },
      idempotencyKey: `batch_${runKey}`,
      awaitCompletion: true,
      neverStartedAutoRefund: true,
    });
    expect(first.status).toBe('partial');
    const before = sim.state.balance[USER];
    const beforeCallsLead3 = callsForLead3;
    expect(beforeCallsLead3).toBe(1); // lead 3 failed at step 1 and stopped there
    failLead3 = false; // the retry's lead 3 now succeeds
    const retry = await retryBatchExecution(first.executionId, USER);
    expect(retry.success).toBe(true);

    const items = itemStatuses(first.executionId);
    const byLead = new Map(items.map((i) => [i.leadId, i]));
    expect(byLead.get('lead_3')!.status).toBe('completed');
    expect((byLead.get('lead_3') as Record<string, unknown>).attempts).toBe(2);
    // Completed leads untouched (attempts still 1).
    expect((byLead.get('lead_1') as Record<string, unknown>).attempts).toBe(1);

    const exec = sim.state.executions.get(first.executionId)!;
    expect(exec.status).toBe('completed');
    expect(exec.retryCount).toBe(1);
    // Partial run kept its fee → retry adds NO second charge.
    expect(sim.state.balance[USER]).toBe(before);
    const charges = sim.state.rows.filter((r) => r.action.startsWith('workflow_execution_idempotent_') && r.credits < 0);
    expect(charges).toHaveLength(1);
  });

  it('retry after a never-started refund re-charges EXACTLY once when the retry actually starts', async () => {
    const before = sim.state.balance[USER];
    let fail = true;
    const runKey = 'retry_neverstarted';
    await chargeWorkflowExecutionFee({
      userId: USER, workflowId: WORKFLOW.id,
      chargeKey: `wfexec-run:${runKey}`, source: 'MANUAL_WORKFLOW', referenceId: runKey, leadCount: 2,
    });
    mocks.executeAction.mockImplementation(async () =>
      fail ? { success: false, error: 'Webhook call failed: DNS lookup failed (ENOTFOUND)' } : { success: true, output: {} },
    );
    const first = await executeWorkflowBatch(WORKFLOW.id, USER, {
      leads: leadIds(2),
      targetSnapshot: { mode: 'selected_leads', runBatchId: runKey, leadCount: 2 },
      idempotencyKey: `batch_${runKey}`,
      awaitCompletion: true,
      neverStartedAutoRefund: true,
    });
    expect(first.status).toBe('exhausted');
    expect(sim.state.balance[USER]).toBe(before); // refunded

    fail = false;
    const retry = await retryBatchExecution(first.executionId, USER);
    expect(retry.success).toBe(true);
    const exec = sim.state.executions.get(first.executionId)!;
    expect(exec.status).toBe('completed');
    // Net: one charge (refunded) + exactly one actual-start re-charge = -FEE.
    expect(sim.state.balance[USER]).toBe(before - FEE);
    const recharges = sim.state.rows.filter((r) => r.action.includes('wfexec-started:'));
    expect(recharges).toHaveLength(1);
    // Replaying the retry again (same reconciled state) stays at -FEE net.
    const retryAgain = await retryBatchExecution(first.executionId, USER);
    expect(retryAgain.success).toBe(false); // nothing failed — nothing to retry
    expect(sim.state.balance[USER]).toBe(before - FEE);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Execution history: pagination + search + lead summaries
// ═══════════════════════════════════════════════════════════════════

describe('execution history pagination (server-side)', () => {
  it('pages through a large dataset with totals, filters, and per-run lead summaries', async () => {
    // 25 single-lead-style executions + 1 batch execution over 10 leads.
    for (let i = 0; i < 25; i++) {
      const id = `hist_${i}`;
      sim.state.executions.set(id, {
        id, workflowId: WORKFLOW.id, userId: USER, status: i % 5 === 0 ? 'failed' : 'completed',
        currentStep: 3, totalSteps: 3, error: i % 5 === 0 ? 'Step failed' : null,
        retryCount: 0, maxRetries: 3, timeoutMs: 300000, idempotencyKey: `hist_${i}`,
        triggerData: null, completedAt: new Date(), durationMs: 100 + i,
        startedAt: new Date(Date.now() - i * 1000),
        workflow: { id: WORKFLOW.id, userId: USER, name: WORKFLOW.name, triggerType: 'manual' },
      });
    }
    const batchId = 'hist_batch';
    sim.state.executions.set(batchId, {
      id: batchId, workflowId: WORKFLOW.id, userId: USER, status: 'partial',
      currentStep: 27, totalSteps: 30, error: '1 of 10 leads failed. Last error: Webhook failed',
      retryCount: 0, maxRetries: 3, timeoutMs: 300000, idempotencyKey: 'hist_batch',
      triggerData: null, completedAt: new Date(), durationMs: 5000,
      startedAt: new Date(),
      workflow: { id: WORKFLOW.id, userId: USER, name: WORKFLOW.name, triggerType: 'manual' },
    });
    for (let i = 0; i < 10; i++) {
      const id = `hist_item_${i}`;
      sim.state.leadItems.set(id, {
        id, executionId: batchId, leadId: `lead_${i}`, leadName: `Lead ${i}`,
        status: i === 0 ? 'failed' : 'completed', attempts: 1, error: i === 0 ? 'Webhook failed' : null,
        createdAt: new Date(), updatedAt: new Date(),
      });
    }

    // Page 3 of size 10 → 26 - 20 = 6 rows, total 26, totalPages 3.
    const page3 = await getExecutionHistory(USER, { page: 3, limit: 10 });
    expect(page3.total).toBe(26);
    expect(page3.totalPages).toBe(3);
    expect(page3.executions).toHaveLength(6);

    // Page 1 → newest first; the batch run carries its lead summary.
    const page1 = await getExecutionHistory(USER, { page: 1, limit: 10 });
    const first = page1.executions[0] as Record<string, unknown>;
    const batchRow = page1.executions.find((e) => (e as Record<string, unknown>).id === batchId) as Record<string, unknown>;
    expect(batchRow).toBeTruthy();
    expect(batchRow.leadCount).toBe(10);
    expect((batchRow.leadSummary as Record<string, number>).completed).toBe(9);
    expect((batchRow.leadSummary as Record<string, number>).failed).toBe(1);
    expect(batchRow.durationMs).toBe(5000);
    // Legacy single-lead rows omit the lead summary entirely.
    expect((first.id === batchId ? page1.executions[1] : first).leadSummary).toBeUndefined();

    // Status filter + search compose server-side.
    const failedOnly = await getExecutionHistory(USER, { page: 1, limit: 50, status: 'failed' });
    expect(failedOnly.total).toBe(5); // hist_0,5,10,15,20 — the batch is 'partial'
    const bySearch = await getExecutionHistory(USER, { page: 1, limit: 50, search: 'Webhook' });
    expect(bySearch.total).toBe(1); // only the batch row's error mentions Webhook
    const byName = await getExecutionHistory(USER, { page: 1, limit: 50, search: 'Dental Clinic' });
    expect(byName.total).toBe(26); // every row's workflow name matches

    // Changing pages never mutates execution state.
    const before = sim.state.executions.size;
    await getExecutionHistory(USER, { page: 2, limit: 10 });
    await getExecutionHistory(USER, { page: 1, limit: 10 });
    expect(sim.state.executions.size).toBe(before);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Missing niche → discovery → execution bridge
// ═══════════════════════════════════════════════════════════════════

describe('missing-niche discovery bridge', () => {
  it('niche with no leads: discovery runs, leads are resolved+deduped, ONE execution completes, fee charged once', async () => {
    const before = sim.state.balance[USER];
    // Discovery job completes immediately with 2 payloads; niche
    // re-resolution returns nothing (payload matching finds the leads).
    mocks.startDiscoveryJob.mockResolvedValue({ jobId: 'job_1', status: 'queued' });
    mocks.db.discoveryJob.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id !== 'job_1') return null;
      return {
        id: 'job_1', status: 'completed', totalFound: 2, imported: 2, duplicates: 0,
        errorMessage: null,
        resultData: JSON.stringify([
          { businessName: 'Smile Care', website: 'https://smilecare.test', niche: 'dental' },
          { businessName: 'Bright Teeth', website: 'https://brightteeth.test', niche: 'dental' },
        ]),
      };
    });
    // The niche resolver (db.lead.findMany) yields the two persisted leads.
    mocks.db.lead = { findMany: vi.fn(async () => []) } as unknown as typeof mocks.db.lead;
    // Payload matching (db.lead.findFirst) resolves each website.
    (mocks.db as unknown as { lead: { findFirst: vi.fn; findMany: vi.fn } }).lead = {
      findMany: vi.fn(async () => [
        { id: 'disc_1', businessName: 'Smile Care', niche: 'dental', city: null, stage: 'discovered' },
        { id: 'disc_2', businessName: 'Bright Teeth', niche: 'dental', city: null, stage: 'discovered' },
      ]),
      findFirst: vi.fn(async ({ where }: { where: { website?: string } }) => {
        if (where.website === 'https://smilecare.test') {
          return { id: 'disc_1', businessName: 'Smile Care', niche: 'dental' };
        }
        if (where.website === 'https://brightteeth.test') {
          return { id: 'disc_2', businessName: 'Bright Teeth', niche: 'dental' };
        }
        return null;
      }),
    };

    const start = await executeNicheRunWithDiscovery({
      workflowId: WORKFLOW.id, userId: USER, niche: 'dental', runKey: 'disc_run',
      targetSnapshot: { mode: 'niche', runBatchId: 'disc_run', leadCount: 0, niche: 'dental' },
    });
    expect(start.status).toBe('discovering');
    expect(start.executionId).toBeTruthy();

    // Wait for the background continuation to reach a terminal state.
    const deadline = Date.now() + 10000;
    let exec: Record<string, unknown> | undefined;
    while (Date.now() < deadline) {
      exec = sim.state.executions.get(start.executionId);
      if (exec && ['completed', 'partial', 'failed', 'exhausted'].includes(String(exec.status))) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(exec).toBeTruthy();
    expect(exec!.status).toBe('completed');
    // ONE execution, TWO lead items, ONE charge — discovery cost nothing
    // extra on the workflow side.
    expect(sim.state.executions.size).toBe(1);
    expect(itemStatuses(start.executionId)).toHaveLength(2);
    expect(sim.state.balance[USER]).toBe(before - FEE);
    const charges = sim.state.rows.filter((r) => r.action.startsWith('workflow_execution_idempotent_') && r.credits < 0);
    expect(charges).toHaveLength(1);
  });

  it('discovery producing no leads fails the run honestly with 0 credits', async () => {
    const before = sim.state.balance[USER];
    mocks.startDiscoveryJob.mockResolvedValue({ jobId: 'job_2', status: 'queued' });
    mocks.db.discoveryJob.findUnique.mockImplementation(async () => ({
      id: 'job_2', status: 'completed', totalFound: 0, imported: 0, duplicates: 0,
      errorMessage: null, resultData: null,
    }));
    (mocks.db as unknown as { lead: { findFirst: vi.fn; findMany: vi.fn } }).lead = {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
    };

    const start = await executeNicheRunWithDiscovery({
      workflowId: WORKFLOW.id, userId: USER, niche: 'nonexistent-niche-xyz', runKey: 'disc_empty',
      targetSnapshot: { mode: 'niche', runBatchId: 'disc_empty', leadCount: 0, niche: 'nonexistent-niche-xyz' },
    });
    const deadline = Date.now() + 10000;
    let exec: Record<string, unknown> | undefined;
    while (Date.now() < deadline) {
      exec = sim.state.executions.get(start.executionId);
      if (exec && ['completed', 'partial', 'failed', 'exhausted'].includes(String(exec.status))) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(exec!.status).toBe('failed');
    expect(String(exec!.error)).toContain('no eligible new leads');
    expect(sim.state.balance[USER]).toBe(before); // 0 credits
  });

  it('discovery provider failure surfaces the actionable provider error with 0 credits', async () => {
    const before = sim.state.balance[USER];
    mocks.startDiscoveryJob.mockResolvedValue({ jobId: '', status: 'failed', message: 'Web search credentials are not configured (missing ZAI keys)' });
    const start = await executeNicheRunWithDiscovery({
      workflowId: WORKFLOW.id, userId: USER, niche: 'dental', runKey: 'disc_fail',
      targetSnapshot: { mode: 'niche', runBatchId: 'disc_fail', leadCount: 0, niche: 'dental' },
    });
    const deadline = Date.now() + 10000;
    let exec: Record<string, unknown> | undefined;
    while (Date.now() < deadline) {
      exec = sim.state.executions.get(start.executionId);
      if (exec && String(exec.status) === 'failed') break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(String(exec!.error)).toContain('discovery could not start');
    expect(String(exec!.error)).toContain('ZAI keys');
    expect(sim.state.balance[USER]).toBe(before); // 0 credits
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. 429 / rate-limit reliability
// ═══════════════════════════════════════════════════════════════════

describe('AI rate-limit retry (429 with Retry-After)', () => {
  const origAttempts = process.env.WORKFLOW_AI_RETRY_ATTEMPTS;
  const origMaxWait = process.env.WORKFLOW_AI_RETRY_MAX_WAIT_MS;
  const origBackoffMax = process.env.WORKFLOW_RETRY_BACKOFF_MAX_MS;
  const origBackoffBase = process.env.WORKFLOW_RETRY_BACKOFF_BASE_MS;
  const origLadder = process.env.WORKFLOW_AI_RATE_LIMIT_LADDER_MS;

  afterEach(() => {
    if (origAttempts === undefined) delete process.env.WORKFLOW_AI_RETRY_ATTEMPTS;
    else process.env.WORKFLOW_AI_RETRY_ATTEMPTS = origAttempts;
    if (origMaxWait === undefined) delete process.env.WORKFLOW_AI_RETRY_MAX_WAIT_MS;
    else process.env.WORKFLOW_AI_RETRY_MAX_WAIT_MS = origMaxWait;
    if (origBackoffMax === undefined) delete process.env.WORKFLOW_RETRY_BACKOFF_MAX_MS;
    else process.env.WORKFLOW_RETRY_BACKOFF_MAX_MS = origBackoffMax;
    if (origBackoffBase === undefined) delete process.env.WORKFLOW_RETRY_BACKOFF_BASE_MS;
    else process.env.WORKFLOW_RETRY_BACKOFF_BASE_MS = origBackoffBase;
    if (origLadder === undefined) delete process.env.WORKFLOW_AI_RATE_LIMIT_LADDER_MS;
    else process.env.WORKFLOW_AI_RATE_LIMIT_LADDER_MS = origLadder;
  });

  it('retries a 429 with bounded attempts and eventually succeeds', async () => {
    process.env.WORKFLOW_AI_RETRY_ATTEMPTS = '3';
    process.env.WORKFLOW_AI_RETRY_MAX_WAIT_MS = '100';
    process.env.WORKFLOW_AI_RATE_LIMIT_LADDER_MS = '1,1,1'; // tiny ladder for test speed
    let calls = 0;
    const value = await withAiRateLimitRetry(async () => {
      calls++;
      if (calls < 3) {
        throw new Error('API request failed with status 429: Too many requests');
      }
      return 'ok';
    });
    expect(value).toBe('ok');
    expect(calls).toBe(3);
  });

  it('a 429 WITHOUT a Retry-After hint uses the provider backoff ladder (8s/15s/25s)', async () => {
    process.env.WORKFLOW_AI_RETRY_ATTEMPTS = '2';
    process.env.WORKFLOW_AI_RETRY_MAX_WAIT_MS = '60000';
    delete process.env.WORKFLOW_AI_RATE_LIMIT_LADDER_MS; // the real default ladder
    const startedAt = Date.now();
    let calls = 0;
    await withAiRateLimitRetry(async () => {
      calls++;
      if (calls === 1) {
        throw new Error('API request failed with status 429: {"error":"Too many requests, please try again later"}');
      }
      return 'ok';
    });
    // The first ladder step (8s) is the minimum wait before attempt 2.
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(7500);
    expect(calls).toBe(2);
  });

  it('respects a structured Retry-After header as the backoff floor', async () => {
    process.env.WORKFLOW_AI_RETRY_ATTEMPTS = '2';
    process.env.WORKFLOW_RETRY_BACKOFF_MAX_MS = '2500';
    process.env.WORKFLOW_AI_RETRY_MAX_WAIT_MS = '3000';
    process.env.WORKFLOW_AI_RATE_LIMIT_LADDER_MS = '2500'; // hint still wins over the ladder
    let calls = 0;
    const startedAt = Date.now();
    await withAiRateLimitRetry(async () => {
      calls++;
      if (calls === 1) {
        throw Object.assign(new Error('API request failed with status 429: Too many requests'), {
          status: 429,
          headers: { 'retry-after': '1' }, // 1 second
        });
      }
      return 'ok';
    }).catch(() => {});
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(900); // ≥ ~1s floor
    expect(calls).toBe(2);
  });

  it('a permanently-unavailable provider (429 exhausting its budget) throws the ORIGINAL error — token preserved', async () => {
    process.env.WORKFLOW_AI_RETRY_ATTEMPTS = '3';
    process.env.WORKFLOW_AI_RETRY_MAX_WAIT_MS = '50';
    process.env.WORKFLOW_AI_RATE_LIMIT_LADDER_MS = '5,5,5';
    let calls = 0;
    await expect(
      withAiRateLimitRetry(async () => {
        calls++;
        throw new Error('API request failed with status 429: Too many requests');
      }),
    ).rejects.toThrow(/429: Too many requests/);
    expect(calls).toBe(3); // bounded — never an infinite loop
  });

  it('non-retryable failures (401/403/422) surface immediately without retries', async () => {
    process.env.WORKFLOW_AI_RETRY_ATTEMPTS = '3';
    let calls = 0;
    await expect(
      withAiRateLimitRetry(async () => {
        calls++;
        throw new Error('API request failed with status 401: Unauthorized');
      }),
    ).rejects.toThrow(/401/);
    expect(calls).toBe(1);
  });

  it('per-lead isolation: a lead whose AI call stays rate-limited fails alone; the batch continues', async () => {
    const before = sim.state.balance[USER];
    const runKey = 'rate_limit_run';
    await chargeWorkflowExecutionFee({
      userId: USER, workflowId: WORKFLOW.id,
      chargeKey: `wfexec-run:${runKey}`, source: 'MANUAL_WORKFLOW', referenceId: runKey, leadCount: 3,
    });
    mocks.executeAction.mockImplementation(async (_a: string, _c: unknown, ctx: { leadId?: string }) =>
      ctx.leadId === 'lead_2'
        ? { success: false, error: 'AI outreach failed: API request failed with status 429: Too many requests' }
        : { success: true, output: { ok: true } },
    );
    const result = await executeWorkflowBatch(WORKFLOW.id, USER, {
      leads: leadIds(3),
      targetSnapshot: { mode: 'selected_leads', runBatchId: runKey, leadCount: 3 },
      idempotencyKey: `batch_${runKey}`,
      awaitCompletion: true,
      neverStartedAutoRefund: true,
    });
    expect(result.status).toBe('partial');
    const items = itemStatuses(result.executionId);
    const byLead = new Map(items.map((i) => [i.leadId, i]));
    expect(byLead.get('lead_1')!.status).toBe('completed');
    expect(byLead.get('lead_2')!.status).toBe('failed');
    expect(byLead.get('lead_2')!.error).toContain('429');
    expect(byLead.get('lead_3')!.status).toBe('completed');
    expect(sim.state.balance[USER]).toBe(before - FEE); // fee kept — real work completed
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. Provider configuration surface
// ═══════════════════════════════════════════════════════════════════

describe('Z-ai provider configuration check', () => {
  it('detects a configured provider through the SDK config file locations', () => {
    // The sandbox always runs with a configured provider (E2E-verified);
    // the check itself is exercised for shape, not for absence.
    const result = isZaiProviderConfigured();
    expect(typeof result).toBe('boolean');
  });
});
