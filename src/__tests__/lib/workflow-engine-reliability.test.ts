// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Phase 4 — Workflow Execution Engine Reliability
//
// Covers (against the MAIN engine, executeWorkflow/runSteps semantics):
//   1. Step order + every configured step executes (1, 2, 3+ steps).
//   2. Step output propagation (previousOutputs keyed by step id).
//   3. Honest failure: step failure marks execution failed; later steps
//      get explicit "skipped" logs and never execute (partial failure).
//   4. Per-step retries: config.retries opt-in, backoff, retryAttempt
//      persisted; default = no blind re-execution of side effects.
//   5. Cancellation honored mid-run — never overwritten by "completed".
//   6. Pause honored mid-run — resume path re-runs remaining steps.
//   7. Timeout: overall budget enforced; hanging step resolves as failure.
//   8. Idempotency: same key returns the existing execution, no duplicate.
//   9. Zero-step / malformed definitions fail honestly (no silent no-op).
//  10. Credit cost keyed on the ACTION type, not the node type.
//  11. Legacy nodes-based definitions retry correctly (no silent 0-step).
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
}));

vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/workflow-actions', () => ({ executeAction: mocks.executeAction }));
vi.mock('@/lib/workflow-credits', () => ({
  deductExecutionCredits: mocks.deductExecutionCredits,
  getActionCreditCost: vi.fn(async () => 1),
  checkExecutionLimit: vi.fn(async () => ({ allowed: true, current: 1, limit: 500 })),
  // Part 2 §21 (amended) — never-started fee reconciliation helpers: these
  // suites test engine mechanics, not billing; the dedicated billing suite
  // (billing-never-started.test.ts) covers the real reconciliation paths.
  refundNeverStartedWorkflowExecutionFee: vi.fn(async () => ({ refunded: true, newBalance: 0 })),
  rechargeWorkflowExecutionFeeOnStart: vi.fn(async () => ({ ok: true, alreadyProcessed: false, newBalance: 0 })),
  wasNeverStartedFeeRefunded: vi.fn(async () => false),
  checkWorkflowExecutionFeeSufficiency: vi.fn(async () => ({ sufficient: true, balance: 100, fee: 5 })),
}));
vi.mock('@/lib/workflow-dead-letter', () => ({ sendToDeadLetter: mocks.sendToDeadLetter }));
vi.mock('@/lib/workflow-audit', () => ({ logWorkflowEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/realtime-event-bus', () => ({ publishEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/notification-service', () => ({
  createNotificationOnce: vi.fn(async () => ({})),
}));

import { executeWorkflow, retryExecution } from '@/lib/workflow-engine';

// ===== helpers =====

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeStep(id: string, name: string, actionType: string, config: Record<string, unknown> = {}) {
  return {
    id, type: 'action', name,
    config: JSON.stringify({ actionType, ...config }),
    order: 0, nextStepId: null,
  };
}

function makeWorkflow(steps: { id: string; type: string; name: string; config: string; order: number; nextStepId?: string | null }[], nodes = '[]') {
  return {
    id: 'wf_1', userId: 'user_1', name: 'Reliability', status: 'active',
    triggerType: 'manual', requiresApproval: false, profileId: null,
    nodes, workflowSteps: steps,
  };
}

/** DB doubles for one run: create returns an id; findUnique returns live status. */
function primeExecutionDoubles(opts?: { liveStatus?: string; finalStatus?: string }) {
  mocks.db.workflowExecution.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'exec_1', status: data.status ?? 'running',
  }));
  mocks.db.workflowExecution.findUnique.mockImplementation(async () => ({
    id: 'exec_1',
    status: opts?.liveStatus ?? 'running',
    error: null,
    retryCount: 0,
    maxRetries: 3,
    timeoutMs: 300000,
    currentStep: 0,
    workflowId: 'wf_1',
    triggerData: null,
  }));
  mocks.db.workflowExecution.update.mockResolvedValue({});
  mocks.db.workflowLog.create.mockResolvedValue({});
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WORKFLOW_TIMEOUT = '10000';
  process.env.WORKFLOW_MAX_RETRIES = '3';
  process.env.WORKFLOW_RETRY_BACKOFF_BASE_MS = '1';
  mocks.deductExecutionCredits.mockResolvedValue({ success: true, creditsUsed: 1 });
  mocks.executeAction.mockResolvedValue({ success: true, output: { done: true } });
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
// 1–2. Order, execution of every step, I/O propagation
// ═══════════════════════════════════════════════════════════════════

describe('Phase 4 — step order and I/O', () => {
  it('executes a 3-step workflow in the persisted order, skipping none', async () => {
    const calls: string[] = [];
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(makeWorkflow([
      makeStep('s1', 'One', 'add_note', { content: 'a' }),
      makeStep('s2', 'Two', 'add_note', { content: 'b' }),
      makeStep('s3', 'Three', 'add_note', { content: 'c' }),
    ]));
    mocks.executeAction.mockImplementation(async (_type: string, _cfg: unknown, ctx: { executionId: string }) => {
      calls.push(ctx.executionId);
      return { success: true, output: { ok: true } };
    });

    const result = await executeWorkflow('wf_1', 'user_1', {});
    expect(result.status).toBe('running'); // findUnique double returns 'running' — no crash
    expect(mocks.executeAction).toHaveBeenCalledTimes(3);
    // Order comes from WorkflowStep.order (asc) — the loader preserves it.
    const types = mocks.executeAction.mock.calls.map((c: unknown[]) => c[0]);
    expect(types).toEqual(['add_note', 'add_note', 'add_note']);
  });

  it('propagates previous step outputs to later steps keyed by step id', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(makeWorkflow([
      makeStep('s1', 'One', 'ai_analysis'),
      makeStep('s2', 'Two', 'add_note', { content: '{{output.s1.summary}}' }),
    ]));
    mocks.executeAction.mockImplementation(async (type: string) => {
      if (type === 'ai_analysis') return { success: true, output: { summary: 'great lead' } };
      return { success: true };
    });

    await executeWorkflow('wf_1', 'user_1', {});

    const noteCall = mocks.executeAction.mock.calls.find((c: unknown[]) => c[0] === 'add_note') as unknown[];
    const ctx = noteCall[2] as { previousOutputs: Record<string, unknown> };
    expect(ctx.previousOutputs['s1']).toEqual({ summary: 'great lead' });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Honest failure + partial failure representation
// ═══════════════════════════════════════════════════════════════════

describe('Phase 4 — honest failure and partial failure', () => {
  it('marks the execution failed, never runs later steps, and logs them as skipped', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(makeWorkflow([
      makeStep('s1', 'One', 'add_note', { content: 'a' }),
      makeStep('s2', 'Two', 'send_email', { subject: 'x', body: 'y' }),
      makeStep('s3', 'Three', 'add_note', { content: 'c' }),
    ]));
    mocks.executeAction.mockImplementation(async (type: string) => {
      if (type === 'send_email') return { success: false, error: 'SMTP unavailable' };
      return { success: true };
    });
    primeExecutionDoubles({ finalStatus: 'failed' });

    await executeWorkflow('wf_1', 'user_1', {});

    // Step 3 never executed
    expect(mocks.executeAction).toHaveBeenCalledTimes(2);

    // Execution marked failed with the real error
    const failedUpdate = mocks.db.workflowExecution.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: { status?: string } }).data?.status === 'failed'
    ) as unknown[];
    expect(failedUpdate).toBeDefined();
    expect((failedUpdate[0] as { data: { error: string } }).data.error).toContain('SMTP unavailable');

    // Step 3 got an explicit skipped log — partial failure is honest
    const skippedLogs = mocks.db.workflowLog.create.mock.calls
      .map((c: unknown[]) => (c[0] as { data: { status: string; stepName: string; error?: string } }).data)
      .filter((d) => d.status === 'skipped');
    expect(skippedLogs).toHaveLength(1);
    expect(skippedLogs[0].stepName).toBe('Three');
    expect(skippedLogs[0].error).toContain('Not executed');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Per-step retries
// ═══════════════════════════════════════════════════════════════════

describe('Phase 4 — per-step retries', () => {
  it('retries a step configured with retries=2 until it succeeds, persisting retryAttempt', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(makeWorkflow([
      makeStep('s1', 'Flaky', 'webhook_call', { url: 'https://x.test', retries: 2 }),
    ]));
    let attempts = 0;
    mocks.executeAction.mockImplementation(async () => {
      attempts++;
      // Part 1 — a positively-identified TRANSIENT error (recognized by
      // the classifier); unrecognized errors no longer retry blindly.
      if (attempts < 3) return { success: false, error: 'HTTP 503: Service temporarily unavailable' };
      return { success: true, output: { ok: true } };
    });

    await executeWorkflow('wf_1', 'user_1', {});

    expect(attempts).toBe(3);
    const retryAttempts = mocks.db.workflowLog.create.mock.calls
      .map((c: unknown[]) => (c[0] as { data: { retryAttempt?: number } }).data?.retryAttempt)
      .filter((v) => v !== undefined);
    expect(retryAttempts).toEqual([0, 1, 2]);

    // Execution completed — the retry recovered the step
    const completedUpdate = mocks.db.workflowExecution.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: { status?: string } }).data?.status === 'completed'
    );
    expect(completedUpdate).toBeDefined();
  });

  it('does NOT retry by default — a failing step runs exactly once', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(makeWorkflow([
      makeStep('s1', 'One-shot', 'send_email', { subject: 'x', body: 'y' }),
    ]));
    mocks.executeAction.mockResolvedValue({ success: false, error: 'boom' });

    await executeWorkflow('wf_1', 'user_1', {});

    expect(mocks.executeAction).toHaveBeenCalledTimes(1);
  });

  it('bounds configured retries by the execution maxRetries', async () => {
    process.env.WORKFLOW_MAX_RETRIES = '2';
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(makeWorkflow([
      makeStep('s1', 'Flaky', 'webhook_call', { url: 'https://x.test', retries: 10 }),
    ]));
    // Part 1 — a recognized rate-limit error: retryable, so the bounded
    // retry budget (2) is honored: 1 initial attempt + 2 re-attempts.
    mocks.executeAction.mockResolvedValue({ success: false, error: 'HTTP 429: Too Many Requests' });

    await executeWorkflow('wf_1', 'user_1', {});

    // 1 initial attempt + at most maxRetries (2) re-attempts
    expect(mocks.executeAction).toHaveBeenCalledTimes(3);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5–6. Cancellation and pause honored mid-run
// ═══════════════════════════════════════════════════════════════════

describe('Phase 4 — mid-run cancellation and pause', () => {
  it('stops executing further steps after cancellation and never overwrites with completed', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(makeWorkflow([
      makeStep('s1', 'One', 'add_note', { content: 'a' }),
      makeStep('s2', 'Two', 'add_note', { content: 'b' }),
    ]));
    // Status poll returns 'cancelled' after the first step ran
    let stepCalls = 0;
    mocks.executeAction.mockImplementation(async () => {
      stepCalls++;
      return { success: true };
    });
    let polls = 0;
    mocks.db.workflowExecution.findUnique.mockImplementation(async () => {
      polls++;
      // poll before step1, before step2, final fetch — cancelled from poll 2 on
      return { id: 'exec_1', status: polls >= 2 ? 'cancelled' : 'running', error: null, retryCount: 0, maxRetries: 3, timeoutMs: 300000, currentStep: 0, workflowId: 'wf_1', triggerData: null };
    });

    const result = await executeWorkflow('wf_1', 'user_1', {});

    expect(stepCalls).toBe(1); // step 2 never ran
    expect(result.status).toBe('cancelled');
    const completedUpdate = mocks.db.workflowExecution.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: { status?: string } }).data?.status === 'completed'
    );
    expect(completedUpdate).toBeUndefined();
  });

  it('stops executing further steps after pause (resume continues from currentStep)', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(makeWorkflow([
      makeStep('s1', 'One', 'add_note', { content: 'a' }),
      makeStep('s2', 'Two', 'add_note', { content: 'b' }),
    ]));
    let polls = 0;
    mocks.db.workflowExecution.findUnique.mockImplementation(async () => {
      polls++;
      return { id: 'exec_1', status: polls >= 2 ? 'paused' : 'running', error: null, retryCount: 0, maxRetries: 3, timeoutMs: 300000, currentStep: 0, workflowId: 'wf_1', triggerData: null };
    });

    await executeWorkflow('wf_1', 'user_1', {});

    expect(mocks.executeAction).toHaveBeenCalledTimes(1);
    expect(mocks.db.workflowExecution.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: { status?: string } }).data?.status === 'completed'
    )).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. Timeout
// ═══════════════════════════════════════════════════════════════════

describe('Phase 4 — execution timeout', () => {
  it('a hanging step resolves as a timeout failure within the budget', async () => {
    process.env.WORKFLOW_TIMEOUT = '80';
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(makeWorkflow([
      makeStep('s1', 'Hanging', 'webhook_call', { url: 'https://slow.test' }),
      makeStep('s2', 'After', 'add_note', { content: 'never' }),
    ]));
    mocks.executeAction.mockImplementation(async () => {
      await sleep(500); // far beyond the 80ms budget
      return { success: true };
    });

    await executeWorkflow('wf_1', 'user_1', {});

    const failedUpdate = mocks.db.workflowExecution.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: { status?: string } }).data?.status === 'failed'
    ) as unknown[];
    expect(failedUpdate).toBeDefined();
    expect((failedUpdate[0] as { data: { error: string } }).data.error).toContain('imed out');
    // Later steps are skipped, not executed
    expect(mocks.executeAction).toHaveBeenCalledTimes(1);
  }, 10000);

  it('stops before the next step when the budget is already exhausted', async () => {
    // Deterministic between-steps timeout: step 1 is a delay that sleeps
    // past the whole budget, so the check before step 2 finds the budget
    // exhausted — the run fails honestly without executing step 2.
    process.env.WORKFLOW_TIMEOUT = '10';
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(makeWorkflow([
      { id: 's1', type: 'delay', name: 'Wait', config: JSON.stringify({ actionType: 'wait_delay', duration: 1, unit: 'seconds' }), order: 0, nextStepId: null },
      makeStep('s2', 'Two', 'add_note', { content: 'b' }),
    ]));
    mocks.executeAction.mockImplementation(async (type: string) => {
      if (type === 'wait_delay') return { success: true, output: { delayMs: 50 } };
      return { success: true };
    });

    await executeWorkflow('wf_1', 'user_1', {});

    // Step 2 never ran
    expect(mocks.executeAction).toHaveBeenCalledTimes(1);
    const failedUpdate = mocks.db.workflowExecution.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: { status?: string; error?: string } }).data?.status === 'failed'
    ) as unknown[];
    expect(failedUpdate).toBeDefined();
    expect((failedUpdate[0] as { data: { error: string } }).data.error).toContain('imed out');
    expect((failedUpdate[0] as { data: { error: string } }).data.error).toContain('Two');
    // Step 2 is logged as skipped — honest partial state
    const skippedLogs = mocks.db.workflowLog.create.mock.calls
      .map((c: unknown[]) => (c[0] as { data: { status: string } }).data)
      .filter((d) => d.status === 'skipped');
    expect(skippedLogs).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. Idempotency
// ═══════════════════════════════════════════════════════════════════

describe('Phase 4 — idempotency', () => {
  it('returns the existing execution for a repeated key without creating a duplicate', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(makeWorkflow([
      makeStep('s1', 'One', 'add_note', { content: 'a' }),
    ]));
    mocks.db.workflowExecution.findFirst.mockResolvedValue({ id: 'exec_existing', status: 'completed' });

    const result = await executeWorkflow('wf_1', 'user_1', {}, 'idem_key_1');

    expect(result.executionId).toBe('exec_existing');
    expect(result.status).toBe('completed');
    expect(mocks.db.workflowExecution.create).not.toHaveBeenCalled();
    expect(mocks.executeAction).not.toHaveBeenCalled();
  });

  it('creates exactly one execution for a new key', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(makeWorkflow([
      makeStep('s1', 'One', 'add_note', { content: 'a' }),
    ]));
    mocks.db.workflowExecution.findFirst.mockResolvedValue(null);

    const result = await executeWorkflow('wf_1', 'user_1', {}, 'idem_key_2');

    expect(result.executionId).toBe('exec_1');
    expect(mocks.db.workflowExecution.create).toHaveBeenCalledTimes(1);
    // The key is persisted for future replay dedupe
    const createData = (mocks.db.workflowExecution.create.mock.calls[0] as unknown[])[0] as { data: { idempotencyKey: string } };
    expect(createData.data.idempotencyKey).toBe('idem_key_2');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 9. Zero-step / malformed definitions fail honestly
// ═══════════════════════════════════════════════════════════════════

describe('Phase 4 — invalid definitions never silently execute', () => {
  it('a zero-step workflow creates a FAILED record with a clear error instead of silent success', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(makeWorkflow([], '[]'));

    const result = await executeWorkflow('wf_1', 'user_1', {});

    expect(result.status).toBe('failed');
    expect(result.error).toContain('no executable steps');
    expect(mocks.executeAction).not.toHaveBeenCalled();
    const createData = (mocks.db.workflowExecution.create.mock.calls[0] as unknown[])[0] as { data: { status: string; error?: string } };
    expect(createData.data.status).toBe('failed');
    expect(createData.data.error).toContain('no executable steps');
  });

  it('malformed step config JSON fails honestly with the step named', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(makeWorkflow([
      { id: 's1', type: 'action', name: 'Broken', config: '{not json', order: 0, nextStepId: null },
    ]));

    const result = await executeWorkflow('wf_1', 'user_1', {});

    expect(result.status).toBe('failed');
    expect(result.error).toContain('malformed');
    expect(result.error).toContain('Broken');
    expect(mocks.executeAction).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 10. Credit billing — Part 2 flat execution fee
// ═══════════════════════════════════════════════════════════════════

describe('Part 2 — flat execution fee replaces per-step charging', () => {
  it('processStep NEVER charges per action/attempt — billing happens once per accepted run at the entry points', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(makeWorkflow([
      makeStep('s1', 'Note', 'add_note', { content: 'a' }),
      makeStep('s2', 'Email', 'send_email', { subject: 's', body: 'b' }),
    ]));

    await executeWorkflow('wf_1', 'user_1', {});

    // The product rule changed in Part 2: ONE accepted run = ONE flat
    // 5-credit fee charged at the run-acceptance boundary (execute route,
    // triggers, autopilot). The engine must never touch credits per step,
    // per lead, or per retry — the old per-action charging storm is gone.
    expect(mocks.deductExecutionCredits).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 11. Legacy nodes-based retry
// ═══════════════════════════════════════════════════════════════════

describe('Phase 4 — retry of nodes-based definitions', () => {
  it('re-runs the node steps on retry instead of silently completing with zero steps', async () => {
    const nodes = JSON.stringify([
      { id: 't', type: 'trigger', title: 'Trigger' },
      { id: 'n1', type: 'action', title: 'Record', config: { actionType: 'add_note', content: 'x' } },
    ]);
    // The execution's workflow has NO WorkflowStep rows — only nodes
    mocks.db.workflowExecution.findFirst.mockResolvedValue({
      id: 'exec_failed', status: 'failed', workflowId: 'wf_1', currentStep: 0,
      retryCount: 1, maxRetries: 3, timeoutMs: 300000, triggerData: null,
      workflow: { userId: 'user_1', id: 'wf_1' },
    });
    mocks.db.workflowDefinition.findUnique.mockResolvedValue(makeWorkflow([], nodes));

    const result = await retryExecution('exec_failed', 'user_1');

    expect(result.success).toBe(true);
    expect(mocks.executeAction).toHaveBeenCalledTimes(1); // the node step actually re-ran
    expect(mocks.executeAction.mock.calls[0][0]).toBe('add_note');
  });
});
