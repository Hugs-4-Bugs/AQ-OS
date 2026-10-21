// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Part 1 — Engine Reliability (classification, exhaustion,
// notification dedup, per-lead isolation)
//
// Covers the MAIN engine (workflow-engine.ts) with the Part 1 layer:
//   1. Retry classification — 429/rate-limit retries are spent; permanent
//      errors fail on the FIRST attempt (no blind re-execution).
//   2. 'exhausted' terminal state — a retryable failure with the retry
//      budget spent dead-letters with a DISTINCT status.
//   3. Notification idempotency — the failure notification dedupeKey is
//      stable per execution across initial failure AND retry re-failure
//      (one logical failure event → one notification row).
//   4. Per-lead failure isolation — one lead's failed execution never
//      affects another lead's independent execution.
//   5. 'exhausted' executions remain retryable via retryExecution.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Shared mocks (hoisted) ────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn((fn: (tx?: unknown) => Promise<void>) => fn()),
    workflowDefinition: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    workflowExecution: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    workflowLog: { create: vi.fn() },
  },
  executeAction: vi.fn(),
  deductExecutionCredits: vi.fn(),
  sendToDeadLetter: vi.fn(),
  createNotificationOnce: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/workflow-actions', () => ({ executeAction: mocks.executeAction }));
vi.mock('@/lib/workflow-credits', () => ({
  deductExecutionCredits: mocks.deductExecutionCredits,
  getActionCreditCost: vi.fn(async () => 1),
  checkExecutionLimit: vi.fn(async () => ({ allowed: true, current: 1, limit: 500 })),
}));
vi.mock('@/lib/workflow-dead-letter', () => ({ sendToDeadLetter: mocks.sendToDeadLetter }));
vi.mock('@/lib/workflow-audit', () => ({ logWorkflowEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/realtime-event-bus', () => ({ publishEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/notification-service', () => ({
  createNotificationOnce: mocks.createNotificationOnce,
}));

import { executeWorkflow, retryExecution } from '@/lib/workflow-engine';

// ===== helpers =====

function makeStep(id: string, name: string, actionType: string, config: Record<string, unknown> = {}) {
  return {
    id, type: 'action', name,
    config: JSON.stringify({ actionType, ...config }),
    order: 0, nextStepId: null,
  };
}

function makeWorkflow(steps: { id: string; type: string; name: string; config: string; order: number; nextStepId?: string | null }[], nodes = '[]') {
  return {
    id: 'wf_1', userId: 'user_1', name: 'Part1', status: 'active',
    triggerType: 'manual', requiresApproval: false, profileId: null,
    nodes, workflowSteps: steps,
  };
}

let execCounter = 0;

/**
 * DB doubles with STATEFUL status: the final status executeWorkflow
 * reports comes from findUnique, which reflects the last status the
 * engine actually persisted for that execution id.
 */
function primeExecutionDoubles(opts?: {
  liveStatus?: string;
  retryCount?: number;
  maxRetries?: number;
}) {
  execCounter = 0;
  const statusById = new Map<string, string>();
  mocks.db.workflowExecution.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    execCounter += 1;
    const id = `exec_${execCounter}`;
    if (typeof data.status === 'string') statusById.set(id, data.status);
    return { id, status: data.status ?? 'running' };
  });
  mocks.db.workflowExecution.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: { status?: string } }) => {
    if (typeof data?.status === 'string') statusById.set(where.id, data.status);
    return {};
  });
  mocks.db.workflowExecution.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    id: where.id,
    status: statusById.get(where.id) ?? opts?.liveStatus ?? 'running',
    error: null,
    retryCount: opts?.retryCount ?? 0,
    maxRetries: opts?.maxRetries ?? 3,
    timeoutMs: 300000,
    currentStep: 0,
    workflowId: 'wf_1',
    triggerData: null,
  }));
  mocks.db.workflowLog.create.mockResolvedValue({});
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WORKFLOW_TIMEOUT = '10000';
  process.env.WORKFLOW_MAX_RETRIES = '3';
  process.env.WORKFLOW_RETRY_BACKOFF_BASE_MS = '1';
  mocks.deductExecutionCredits.mockResolvedValue({ success: true, creditsUsed: 1 });
  mocks.executeAction.mockResolvedValue({ success: true, output: { done: true } });
  mocks.createNotificationOnce.mockResolvedValue({ id: 'notif_1', duplicate: false });
  mocks.db.workflowDefinition.findFirst.mockResolvedValue(null);
  mocks.db.workflowDefinition.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    if (where.id === 'wf_1') return makeWorkflow([]);
    return null;
  });
  primeExecutionDoubles();
});

afterEach(() => {
  delete process.env.WORKFLOW_TIMEOUT;
  delete process.env.WORKFLOW_MAX_RETRIES;
  delete process.env.WORKFLOW_RETRY_BACKOFF_BASE_MS;
});

// ═══════════════════════════════════════════════════════════════════
// 1. Retry classification inside the engine
// ═══════════════════════════════════════════════════════════════════

describe('Part 1 — retry classification in the engine', () => {
  it('spends the configured retry budget on a rate-limited (429) step', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(makeWorkflow([
      makeStep('s1', 'Provider call', 'webhook_call', { url: 'https://x.test', retries: 3 }),
    ]));
    mocks.executeAction.mockResolvedValue({ success: false, error: 'HTTP 429: Too Many Requests' });

    await executeWorkflow('wf_1', 'user_1', {});

    // 1 initial attempt + 3 bounded re-attempts — a bounded, jittered
    // recovery, never an unbounded storm.
    expect(mocks.executeAction).toHaveBeenCalledTimes(4);
  });

  it('fails a PERMANENT error on the first attempt — no retries, no DLQ, no retryCount burn', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(makeWorkflow([
      makeStep('s1', 'Lead work', 'add_note', { content: 'a', retries: 3 }),
    ]));
    mocks.executeAction.mockResolvedValue({ success: false, error: 'Lead not found' });

    await executeWorkflow('wf_1', 'user_1', {});

    // Permanent failures are not retried at all — side effects never run twice.
    expect(mocks.executeAction).toHaveBeenCalledTimes(1);

    // Honest terminal state...
    const failedUpdate = mocks.db.workflowExecution.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: { status?: string } }).data?.status === 'failed'
    );
    expect(failedUpdate).toBeDefined();
    // ...with NO dead-letter (nothing to retry)...
    expect(mocks.sendToDeadLetter).not.toHaveBeenCalled();
    // ...and NO retryCount increment (permanent failures burn no budget).
    const incrementCalls = mocks.db.workflowExecution.update.mock.calls.filter(
      (c: unknown[]) => (c[0] as { data: { retryCount?: unknown } }).data?.retryCount
    );
    expect(incrementCalls).toHaveLength(0);
  });

  it('a NO_MATCHING_LEADS business error never retries (not a transient provider failure)', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(makeWorkflow([
      makeStep('s1', 'Find leads', 'webhook_call', { url: 'https://x.test', retries: 3 }),
    ]));
    mocks.executeAction.mockResolvedValue({ success: false, error: 'NO_MATCHING_LEADS: zero active leads for the target' });

    await executeWorkflow('wf_1', 'user_1', {});

    expect(mocks.executeAction).toHaveBeenCalledTimes(1);
    expect(mocks.sendToDeadLetter).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. 'exhausted' terminal state
// ═══════════════════════════════════════════════════════════════════

describe('Part 1 — exhausted retry state', () => {
  it('marks a retryable failure as exhausted + dead-letters it once the budget is spent', async () => {
    // The execution already burned its retry budget (3 of 3).
    primeExecutionDoubles({ retryCount: 3, maxRetries: 3 });
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(makeWorkflow([
      makeStep('s1', 'Flaky', 'webhook_call', { url: 'https://x.test', retries: 2 }),
    ]));
    mocks.executeAction.mockResolvedValue({ success: false, error: 'HTTP 503: Service Unavailable' });

    await executeWorkflow('wf_1', 'user_1', {});

    const exhaustedUpdate = mocks.db.workflowExecution.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: { status?: string } }).data?.status === 'exhausted'
    );
    expect(exhaustedUpdate).toBeDefined();
    expect(mocks.sendToDeadLetter).toHaveBeenCalledTimes(1);
    // Exhausted is a DISTINCT terminal state — not a plain 'failed' row.
    const failedUpdate = mocks.db.workflowExecution.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: { status?: string } }).data?.status === 'failed'
    );
    expect(failedUpdate).toBeUndefined();
  });

  it("an 'exhausted' execution is still retryable via retryExecution (user-driven, bounded)", async () => {
    mocks.db.workflowExecution.findFirst.mockResolvedValue({
      id: 'exec_x', status: 'exhausted', workflowId: 'wf_1', currentStep: 0,
      retryCount: 3, maxRetries: 3, timeoutMs: 300000, triggerData: null,
      workflow: { userId: 'user_1', id: 'wf_1' },
    });
    mocks.db.workflowDefinition.findUnique.mockResolvedValue(makeWorkflow([
      makeStep('s1', 'One', 'add_note', { content: 'a' }),
    ]));

    const result = await retryExecution('exec_x', 'user_1');

    expect(result.success).toBe(true);
    // The user-driven retry re-runs the step exactly once.
    expect(mocks.executeAction).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Notification idempotency (one failure event → one notification)
// ═══════════════════════════════════════════════════════════════════

describe('Part 1 — notification dedup across failure and retry re-failure', () => {
  it('uses ONE stable dedupeKey per execution for the failure notification', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(makeWorkflow([
      makeStep('s1', 'One', 'add_note', { content: 'a' }),
    ]));
    mocks.executeAction.mockResolvedValue({ success: false, error: 'Lead not found' });

    await executeWorkflow('wf_1', 'user_1', {});

    expect(mocks.createNotificationOnce).toHaveBeenCalledTimes(1);
    const first = mocks.createNotificationOnce.mock.calls[0][0] as { dedupeKey: string; userId: string };
    expect(first.dedupeKey).toBe('wfexec:exec_1:failed');
    expect(first.userId).toBe('user_1');

    // The user retries; the retry FAILS AGAIN. The engine emits the same
    // logical event — the SAME dedupeKey — so the persistence layer
    // (createNotificationOnce) collapses it to a single notification row.
    mocks.db.workflowExecution.findFirst.mockResolvedValue({
      id: 'exec_1', status: 'failed', workflowId: 'wf_1', currentStep: 0,
      retryCount: 1, maxRetries: 3, timeoutMs: 300000, triggerData: null,
      workflow: { userId: 'user_1', id: 'wf_1' },
    });
    mocks.db.workflowDefinition.findUnique.mockResolvedValue(makeWorkflow([
      makeStep('s1', 'One', 'add_note', { content: 'a' }),
    ]));

    await retryExecution('exec_1', 'user_1');

    expect(mocks.createNotificationOnce).toHaveBeenCalledTimes(2);
    const second = mocks.createNotificationOnce.mock.calls[1][0] as { dedupeKey: string };
    expect(second.dedupeKey).toBe('wfexec:exec_1:failed');
    expect(second.dedupeKey).toBe(first.dedupeKey);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Per-lead failure isolation
// ═══════════════════════════════════════════════════════════════════

describe('Part 1 — per-lead failure isolation', () => {
  it("one lead's failed execution never affects another lead's independent execution", async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(makeWorkflow([
      makeStep('s1', 'Step A', 'add_note', { content: 'a' }),
      makeStep('s2', 'Step B', 'add_note', { content: 'b' }),
    ]));
    // Lead A's run fails at step 1 (permanent); lead B's run succeeds fully.
    mocks.executeAction.mockImplementation(async (_type: string, _cfg: unknown, ctx: { executionId: string }) => {
      if (ctx.executionId === 'exec_1') {
        return { success: false, error: 'Lead not found' };
      }
      return { success: true, output: { ok: true } };
    });

    // Lead A (fails) — awaitCompletion default true
    const resultA = await executeWorkflow('wf_1', 'user_1', { leadId: 'lead_a' });
    // Lead B (succeeds) — runs AFTER A failed
    const resultB = await executeWorkflow('wf_1', 'user_1', { leadId: 'lead_b' });

    // Two independent execution records were created.
    expect(mocks.db.workflowExecution.create).toHaveBeenCalledTimes(2);

    // A failed honestly; B completed BOTH steps — A's failure did not
    // leak into B's run (no global abort, no skipped work).
    expect(mocks.executeAction).toHaveBeenCalledTimes(3); // 1 (A) + 2 (B)

    const statuses = mocks.db.workflowExecution.update.mock.calls
      .map((c: unknown[]) => (c[0] as { data: { status?: string } }).data?.status);
    expect(statuses).toContain('failed');
    expect(statuses).toContain('completed');
    expect(resultA.status).toBe('failed');
    expect(resultB.status).toBe('completed');
  });
});
