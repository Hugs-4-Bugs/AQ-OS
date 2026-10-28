// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Phase 26 Multi-Model Orchestration Tests
//
// Covers the NEW Phase 26 surface area:
//   · buildModelCallSpecs — model config parsing (single/array/dedupe)
//   · computeInvocationKey — deterministic idempotency keys
//   · Routing — configured provider/model actually reach the provider
//     abstraction (executeAICompletion receives them)
//   · SEQUENTIAL orchestration — order, result propagation, isolation
//   · PARALLEL orchestration — concurrency, BOUNDED fan-out, allSettled
//   · Failure isolation — one failed model never destroys siblings
//   · Invocation idempotency — COMPLETED slots reused, FAILED retried
//   · Cancellation — pending slots skipped, no new invocations
//   · Model-level tracking — ModelInvocation rows + MODEL_* events
//   · Billing — flat-fee policy untouched (MODEL_* events only, no
//     charge semantics anywhere in the orchestration layer)
//   · Aggregation — primary selection, partial success semantics
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock DB (Prisma-shaped subset) ──
const mockPrisma = vi.hoisted(() => ({
  modelInvocation: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
  },
  executionActivity: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  workflowExecution: {
    findUnique: vi.fn(),
  },
}));
vi.mock('@/lib/db', () => ({ db: mockPrisma }));

// ── Mock the provider abstraction (routing capture point) ──
const mockExecuteAICompletion = vi.hoisted(() => vi.fn());
vi.mock('@/lib/ai/ai-provider', () => ({
  executeAICompletion: mockExecuteAICompletion,
}));

// ── Passthrough retry wrapper (deterministic tests) ──
vi.mock('@/lib/workflow-ai-retry', () => ({
  withAiRateLimitRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

// ── Import the REAL orchestration layer ──
import {
  buildModelCallSpecs,
  computeInvocationKey,
  parseOrchestrationMode,
  parseConcurrencyLimit,
  orchestrateModelCalls,
  orchestrateAIAction,
} from '@/lib/ai/orchestrator';

// ── Helpers ──
function okCompletion(content: string, provider = 'z-ai', model = 'z-ai-default') {
  return {
    success: true,
    content,
    provider,
    model,
    tokensUsed: 12,
    latencyMs: 7,
    retries: 0,
  };
}

function completionFromSpec(req: { config?: { provider?: string; model?: string } }) {
  const p = req.config?.provider ?? 'z-ai';
  const m = req.config?.model ?? 'z-ai-default';
  return okCompletion(`output from ${p}/${m}`, p, m);
}

const CTX = {
  executionId: 'exec-1',
  workflowId: 'wf-1',
  leadId: 'lead-1',
  stepName: 'AI Analysis',
  userId: 'user-1',
  actionType: 'ai_analysis',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no existing invocation rows, execution not cancelled.
  mockPrisma.modelInvocation.findUnique.mockResolvedValue(null);
  mockPrisma.modelInvocation.create.mockImplementation(
    async (args: { data: Record<string, unknown> }) => ({
      id: 'inv-' + Math.random().toString(36).slice(2, 8),
      ...args.data,
    })
  );
  mockPrisma.modelInvocation.update.mockResolvedValue({});
  mockPrisma.executionActivity.create.mockResolvedValue({});
  mockPrisma.workflowExecution.findUnique.mockResolvedValue(null);
  // Default completion: derive from the request's configured provider/model.
  mockExecuteAICompletion.mockImplementation(
    async (req: { config?: { provider?: string; model?: string } }) =>
      completionFromSpec(req)
  );
});

// ═══════════════════════════════════════════════════════════════════
// Group 1: buildModelCallSpecs — model configuration parsing
// ═══════════════════════════════════════════════════════════════════

describe('Phase 26 — buildModelCallSpecs', () => {
  it('empty config → single default slot routed by the env chain', () => {
    expect(buildModelCallSpecs({})).toEqual([{}]);
  });

  it('legacy single model field → single spec with that model', () => {
    expect(buildModelCallSpecs({ model: 'gpt-4o' })).toEqual([{ model: 'gpt-4o' }]);
  });

  it('provider + model → single spec carrying both', () => {
    expect(buildModelCallSpecs({ provider: 'openai', model: 'gpt-4o' })).toEqual([
      { provider: 'openai', model: 'gpt-4o' },
    ]);
  });

  it('models array of strings → one spec per entry', () => {
    expect(buildModelCallSpecs({ models: ['gpt-4o', 'claude-sonnet-4'] })).toEqual([
      { model: 'gpt-4o' },
      { model: 'claude-sonnet-4' },
    ]);
  });

  it('models array of objects → provider/model/role preserved', () => {
    expect(
      buildModelCallSpecs({
        models: [
          { provider: 'openai', model: 'gpt-4o', role: 'analyst' },
          { provider: 'anthropic', model: 'claude-sonnet-4', role: 'critic' },
        ],
      })
    ).toEqual([
      { provider: 'openai', model: 'gpt-4o', role: 'analyst', includePreviousOutput: undefined },
      { provider: 'anthropic', model: 'claude-sonnet-4', role: 'critic', includePreviousOutput: undefined },
    ]);
  });

  it('identical (provider, model, role) tuples are deduplicated — first wins', () => {
    // G5 fix: dedup key now includes role. Two slots with same (provider,
    // model) but DIFFERENT roles are LEGITIMATELY DISTINCT invocations
    // (e.g. LEAD_SCORING: fit_scorer + engagement_scorer + intent_scorer +
    // timing_scorer — all use default z-ai/glm-4.6 but produce different
    // outputs). Two slots with IDENTICAL (provider, model, role) ARE
    // duplicates and must be collapsed.
    expect(
      buildModelCallSpecs({
        models: [
          { provider: 'openai', model: 'gpt-4o', role: 'first' },
          { provider: 'openai', model: 'gpt-4o', role: 'duplicate' },  // different role → kept
          { provider: 'openai', model: 'gpt-4o', role: 'first' },       // same role as slot 1 → DROPPED
          { provider: 'anthropic', model: 'claude-sonnet-4' },
        ],
      })
    ).toEqual([
      { provider: 'openai', model: 'gpt-4o', role: 'first', includePreviousOutput: undefined },
      { provider: 'openai', model: 'gpt-4o', role: 'duplicate', includePreviousOutput: undefined },
      { provider: 'anthropic', model: 'claude-sonnet-4', includePreviousOutput: undefined },
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Group 2: computeInvocationKey — deterministic idempotency keys
// ═══════════════════════════════════════════════════════════════════

describe('Phase 26 — computeInvocationKey', () => {
  it('is deterministic — same slot context, same key', () => {
    const a = computeInvocationKey({
      executionId: 'e1', leadId: 'l1', stepName: 's1', provider: 'openai', model: 'gpt-4o',
    });
    const b = computeInvocationKey({
      executionId: 'e1', leadId: 'l1', stepName: 's1', provider: 'openai', model: 'gpt-4o',
    });
    expect(a).toBe(b);
  });

  it('differs per lead, step, provider, and model', () => {
    const base = computeInvocationKey({
      executionId: 'e1', leadId: 'l1', stepName: 's1', provider: 'openai', model: 'gpt-4o',
    });
    expect(computeInvocationKey({ executionId: 'e1', leadId: 'l2', stepName: 's1', provider: 'openai', model: 'gpt-4o' })).not.toBe(base);
    expect(computeInvocationKey({ executionId: 'e1', leadId: 'l1', stepName: 's2', provider: 'openai', model: 'gpt-4o' })).not.toBe(base);
    expect(computeInvocationKey({ executionId: 'e1', leadId: 'l1', stepName: 's1', provider: 'anthropic', model: 'gpt-4o' })).not.toBe(base);
    expect(computeInvocationKey({ executionId: 'e1', leadId: 'l1', stepName: 's1', provider: 'openai', model: 'o1' })).not.toBe(base);
  });

  it('differs per execution — replays of a DIFFERENT run are distinct slots', () => {
    const a = computeInvocationKey({ executionId: 'e1', leadId: 'l1', stepName: 's1' });
    const b = computeInvocationKey({ executionId: 'e2', leadId: 'l1', stepName: 's1' });
    expect(a).not.toBe(b);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Group 3: mode / concurrency parsing
// ═══════════════════════════════════════════════════════════════════

describe('Phase 26 — orchestration mode & concurrency parsing', () => {
  it('default mode is SEQUENTIAL', () => {
    expect(parseOrchestrationMode({})).toBe('SEQUENTIAL');
  });

  it("orchestration: 'parallel' → PARALLEL (case-insensitive)", () => {
    expect(parseOrchestrationMode({ orchestration: 'parallel' })).toBe('PARALLEL');
    expect(parseOrchestrationMode({ orchestration: 'PARALLEL' })).toBe('PARALLEL');
  });

  it('concurrency defaults to 3', () => {
    expect(parseConcurrencyLimit({})).toBe(3);
  });

  it('concurrency is clamped to [1, 4] — no unbounded fan-out', () => {
    expect(parseConcurrencyLimit({ concurrency: 99 })).toBe(4);
    expect(parseConcurrencyLimit({ concurrency: 0 })).toBe(3);
    expect(parseConcurrencyLimit({ concurrency: -5 })).toBe(3);
    expect(parseConcurrencyLimit({ concurrency: 2 })).toBe(2);
    expect(parseConcurrencyLimit({ concurrency: 1 })).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Group 4: ROUTING — configured provider/model actually invoked
// ═══════════════════════════════════════════════════════════════════

describe('Phase 26 — model routing', () => {
  it('configured provider and model are passed to executeAICompletion', async () => {
    await orchestrateModelCalls({
      specs: [{ provider: 'openai', model: 'gpt-4o' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'analyze',
      context: CTX,
    });

    expect(mockExecuteAICompletion).toHaveBeenCalledTimes(1);
    const req = mockExecuteAICompletion.mock.calls[0][0];
    expect(req.config.provider).toBe('openai');
    expect(req.config.model).toBe('gpt-4o');
    expect(req.messages[0].content).toBe('analyze');
  });

  it('no configured provider → undefined (env default chain decides)', async () => {
    await orchestrateModelCalls({
      specs: [{}],
      mode: 'SEQUENTIAL',
      basePrompt: 'x',
      context: CTX,
    });
    expect(mockExecuteAICompletion.mock.calls[0][0].config.provider).toBeUndefined();
  });

  it('multi-slot config routes EACH slot with its own provider/model', async () => {
    await orchestrateModelCalls({
      specs: [
        { provider: 'openai', model: 'gpt-4o' },
        { provider: 'anthropic', model: 'claude-sonnet-4' },
      ],
      mode: 'PARALLEL',
      basePrompt: 'x',
      context: CTX,
    });

    const routed = mockExecuteAICompletion.mock.calls.map(
      (c: unknown[]) => (c[0] as { config: { provider?: string; model?: string } }).config
    );
    expect(routed).toEqual(
      expect.arrayContaining([
        { provider: 'openai', model: 'gpt-4o' },
        { provider: 'anthropic', model: 'claude-sonnet-4' },
      ])
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// Group 5: SEQUENTIAL orchestration
// ═══════════════════════════════════════════════════════════════════

describe('Phase 26 — SEQUENTIAL orchestration', () => {
  it('executes models in configured order (A → B → C)', async () => {
    const order: string[] = [];
    mockExecuteAICompletion.mockImplementation(async (req: { config?: { model?: string } }) => {
      order.push(req.config?.model ?? 'default');
      return okCompletion(`out-${req.config?.model}`);
    });

    const result = await orchestrateModelCalls({
      specs: [{ model: 'a' }, { model: 'b' }, { model: 'c' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'x',
      context: CTX,
    });

    expect(order).toEqual(['a', 'b', 'c']);
    expect(result.summary.completed).toBe(3);
    expect(result.primaryContent).toBe('out-a');
  });

  it('result propagation — later models receive completed predecessors\u2019 outputs', async () => {
    const prompts: string[] = [];
    mockExecuteAICompletion.mockImplementation(async (req: { messages: { content: string }[] }) => {
      prompts.push(req.messages[0].content);
      return okCompletion(`out-${prompts.length}`);
    });

    await orchestrateModelCalls({
      specs: [{ model: 'a' }, { model: 'b' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'BASE',
      context: CTX,
    });

    expect(prompts[0]).toBe('BASE');
    expect(prompts[1]).toContain('BASE');
    expect(prompts[1]).toContain('out-1'); // chained predecessor output
    expect(prompts[1]).toContain('Previous model outputs');
  });

  it('includePreviousOutput: false disables chaining for that slot', async () => {
    const prompts: string[] = [];
    mockExecuteAICompletion.mockImplementation(async (req: { messages: { content: string }[] }) => {
      prompts.push(req.messages[0].content);
      return okCompletion(`out-${prompts.length}`);
    });

    await orchestrateModelCalls({
      specs: [{ model: 'a' }, { model: 'b', includePreviousOutput: false }],
      mode: 'SEQUENTIAL',
      basePrompt: 'BASE',
      context: CTX,
    });

    expect(prompts[1]).toBe('BASE'); // unchanged — no chain block
  });

  it('failure isolation — Model A fails, Model B still runs and succeeds', async () => {
    mockExecuteAICompletion.mockImplementation(async (req: { config?: { model?: string } }) => {
      if (req.config?.model === 'a') throw new Error('provider A exploded');
      return okCompletion('b-content');
    });

    const result = await orchestrateModelCalls({
      specs: [{ model: 'a' }, { model: 'b' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'x',
      context: CTX,
    });

    expect(result.success).toBe(true);
    expect(result.primaryContent).toBe('b-content');
    expect(result.models[0].status).toBe('FAILED');
    expect(result.models[0].error).toContain('provider A exploded');
    expect(result.models[1].status).toBe('COMPLETED');
    expect(result.summary.failed).toBe(1);
    expect(result.summary.completed).toBe(1);
  });

  it('all models fail → success=false, errors surfaced', async () => {
    mockExecuteAICompletion.mockRejectedValue(new Error('down'));

    const result = await orchestrateModelCalls({
      specs: [{ model: 'a' }, { model: 'b' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'x',
      context: CTX,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('down');
    expect(result.models.every((m) => m.status === 'FAILED')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Group 6: PARALLEL orchestration — bounded concurrency
// ═══════════════════════════════════════════════════════════════════

describe('Phase 26 — PARALLEL orchestration', () => {
  it('models execute CONCURRENTLY (overlapping in flight)', async () => {
    let active = 0;
    let maxActive = 0;
    mockExecuteAICompletion.mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 25));
      active--;
      return okCompletion('parallel-out');
    });

    const result = await orchestrateModelCalls({
      specs: [{ model: 'a' }, { model: 'b' }, { model: 'c' }],
      mode: 'PARALLEL',
      basePrompt: 'x',
      context: CTX,
    });

    expect(maxActive).toBeGreaterThan(1); // genuinely concurrent
    expect(result.summary.completed).toBe(3);
  });

  it('BOUNDED fan-out — 10 slots, limit 2 → never more than 2 in flight', async () => {
    let active = 0;
    let maxActive = 0;
    mockExecuteAICompletion.mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return okCompletion('ok');
    });

    await orchestrateModelCalls({
      specs: Array.from({ length: 10 }, (_, i) => ({ model: `m${i}` })),
      mode: 'PARALLEL',
      concurrencyLimit: 2,
      basePrompt: 'x',
      context: CTX,
    });

    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('concurrency limit clamped to 4 even when configured higher', async () => {
    let active = 0;
    let maxActive = 0;
    mockExecuteAICompletion.mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return okCompletion('ok');
    });

    await orchestrateModelCalls({
      specs: Array.from({ length: 10 }, (_, i) => ({ model: `m${i}` })),
      mode: 'PARALLEL',
      concurrencyLimit: 99,
      basePrompt: 'x',
      context: CTX,
    });

    expect(maxActive).toBeLessThanOrEqual(4);
  });

  it('failure isolation — one failed model does not destroy successful siblings', async () => {
    mockExecuteAICompletion.mockImplementation(async (req: { config?: { model?: string } }) => {
      if (req.config?.model === 'b') throw new Error('B is down');
      return okCompletion(`ok-${req.config?.model}`);
    });

    const result = await orchestrateModelCalls({
      specs: [{ model: 'a' }, { model: 'b' }, { model: 'c' }],
      mode: 'PARALLEL',
      basePrompt: 'x',
      context: CTX,
    });

    expect(result.success).toBe(true);
    expect(result.primaryContent).toBe('ok-a');
    expect(result.models.map((m) => m.status)).toEqual(['COMPLETED', 'FAILED', 'COMPLETED']);
  });

  it('allSettled semantics — no rejection escapes even when ALL slots fail', async () => {
    mockExecuteAICompletion.mockRejectedValue(new Error('total outage'));

    const result = await orchestrateModelCalls({
      specs: [{ model: 'a' }, { model: 'b' }],
      mode: 'PARALLEL',
      basePrompt: 'x',
      context: CTX,
    });

    expect(result.success).toBe(false);
    expect(result.models.every((m) => m.status === 'FAILED')).toBe(true);
    expect(result.error).toContain('total outage');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Group 7: INVOCATION IDEMPOTENCY (retry/resume safety)
// ═══════════════════════════════════════════════════════════════════

describe('Phase 26 — invocation idempotency', () => {
  it('durably COMPLETED slot is REUSED — provider NOT re-invoked', async () => {
    mockPrisma.modelInvocation.findUnique.mockResolvedValue({
      id: 'inv-existing',
      status: 'COMPLETED',
      attempt: 1,
      provider: 'openai',
      model: 'gpt-4o',
      result: JSON.stringify({ content: 'cached-analysis' }),
    });

    const result = await orchestrateModelCalls({
      specs: [{ provider: 'openai', model: 'gpt-4o' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'x',
      context: CTX,
    });

    expect(mockExecuteAICompletion).not.toHaveBeenCalled();
    expect(result.models[0].status).toBe('REUSED');
    expect(result.models[0].fromCache).toBe(true);
    expect(result.primaryContent).toBe('cached-analysis');
    expect(result.summary.reused).toBe(1);
    expect(result.summary.completed).toBe(1); // reused counts as durable output
  });

  it('FAILED slot is retried IN PLACE — same row reopened, attempt incremented', async () => {
    mockPrisma.modelInvocation.findUnique.mockResolvedValue({
      id: 'inv-failed',
      status: 'FAILED',
      attempt: 2,
      provider: 'openai',
      model: 'gpt-4o',
      result: null,
      error: 'previous failure',
    });

    await orchestrateModelCalls({
      specs: [{ provider: 'openai', model: 'gpt-4o' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'x',
      context: CTX,
    });

    // Reopened on the SAME row — no second row for the logical slot.
    expect(mockPrisma.modelInvocation.create).not.toHaveBeenCalled();
    expect(mockPrisma.modelInvocation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-failed' },
        data: expect.objectContaining({ status: 'RUNNING', attempt: 3 }),
      })
    );
    expect(mockExecuteAICompletion).toHaveBeenCalledTimes(1);
  });

  it('fresh slot creates a row with the deterministic invocation key', async () => {
    await orchestrateModelCalls({
      specs: [{ provider: 'openai', model: 'gpt-4o' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'x',
      context: CTX,
    });

    expect(mockPrisma.modelInvocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invocationKey: computeInvocationKey({
          executionId: 'exec-1',
          leadId: 'lead-1',
          stepName: 'AI Analysis',
          provider: 'openai',
          model: 'gpt-4o',
        }),
        status: 'RUNNING',
        actionType: 'ai_analysis',
        userId: 'user-1',
      }),
    });
  });

  it('DB lookup failure degrades gracefully — invocation still proceeds', async () => {
    mockPrisma.modelInvocation.findUnique.mockRejectedValue(new Error('db hiccup'));

    const result = await orchestrateModelCalls({
      specs: [{ model: 'a' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'x',
      context: CTX,
    });

    expect(result.models[0].status).toBe('COMPLETED');
    expect(mockExecuteAICompletion).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Group 8: CANCELLATION
// ═══════════════════════════════════════════════════════════════════

describe('Phase 26 — cancellation', () => {
  it('cancelled probe → remaining slots SKIPPED, no new invocations', async () => {
    let cancelled = false;
    mockExecuteAICompletion.mockImplementation(async () => {
      cancelled = true; // after the first slot completes, cancel
      return okCompletion('first-out');
    });

    const result = await orchestrateModelCalls({
      specs: [{ model: 'a' }, { model: 'b' }, { model: 'c' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'x',
      context: CTX,
      isCancelled: async () => cancelled,
    });

    expect(mockExecuteAICompletion).toHaveBeenCalledTimes(1);
    expect(result.models[0].status).toBe('COMPLETED');
    expect(result.models[1].status).toBe('SKIPPED_CANCELLED');
    expect(result.models[2].status).toBe('SKIPPED_CANCELLED');
    expect(result.summary.cancelled).toBe(2);
    expect(result.success).toBe(true); // first slot's output preserved
  });

  it('default probe consults the live WorkflowExecution status', async () => {
    mockPrisma.workflowExecution.findUnique.mockResolvedValue({ status: 'cancelled' });

    const result = await orchestrateModelCalls({
      specs: [{ model: 'a' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'x',
      context: CTX,
    });

    expect(mockPrisma.workflowExecution.findUnique).toHaveBeenCalledWith({
      where: { id: 'exec-1' },
      select: { status: true },
    });
    expect(mockExecuteAICompletion).not.toHaveBeenCalled();
    expect(result.models[0].status).toBe('SKIPPED_CANCELLED');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Group 9: MODEL-LEVEL TRACKING
// ═══════════════════════════════════════════════════════════════════

describe('Phase 26 — model-level tracking', () => {
  it('creates a RUNNING ModelInvocation row with full slot identity', async () => {
    await orchestrateModelCalls({
      specs: [{ provider: 'openai', model: 'gpt-4o', role: 'analyst' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'x',
      context: { ...CTX, runId: 'run-9' },
    });

    expect(mockPrisma.modelInvocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        executionId: 'exec-1',
        runId: 'run-9',
        leadId: 'lead-1',
        stepName: 'AI Analysis',
        actionType: 'ai_analysis',
        provider: 'openai',
        model: 'gpt-4o',
        role: 'analyst',
        status: 'RUNNING',
        userId: 'user-1',
      }),
    });
  });

  it('COMPLETES the row with actual provider/model/tokens + duration', async () => {
    mockPrisma.modelInvocation.create.mockResolvedValue({ id: 'inv-1' });

    await orchestrateModelCalls({
      specs: [{ provider: 'openai', model: 'gpt-4o' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'x',
      context: CTX,
    });

    const completionUpdate = mockPrisma.modelInvocation.update.mock.calls
      .map((c: unknown[]) => c[0] as { data?: Record<string, unknown> })
      .find((c) => c.data?.status === 'COMPLETED');
    expect(completionUpdate).toBeDefined();
    expect(completionUpdate!.data).toMatchObject({
      provider: 'openai',
      model: 'gpt-4o',
      tokensUsed: 12,
      finishedAt: expect.any(Date),
    });
    expect(completionUpdate!.data!.result).toContain('output from');
  });

  it('logs MODEL_STARTED + MODEL_COMPLETED ExecutionActivity events', async () => {
    await orchestrateModelCalls({
      specs: [{ provider: 'openai', model: 'gpt-4o' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'x',
      context: CTX,
    });

    const events = mockPrisma.executionActivity.create.mock.calls.map(
      (c: unknown[]) => (c[0] as { data: { eventType: string } }).data.eventType
    );
    expect(events).toContain('MODEL_STARTED');
    expect(events).toContain('MODEL_COMPLETED');
  });

  it('failed slot marks the row FAILED and logs MODEL_FAILED with the reason', async () => {
    mockPrisma.modelInvocation.create.mockResolvedValue({ id: 'inv-2' });
    mockExecuteAICompletion.mockRejectedValue(new Error('rate limited hard'));

    await orchestrateModelCalls({
      specs: [{ model: 'a' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'x',
      context: CTX,
    });

    const failUpdate = mockPrisma.modelInvocation.update.mock.calls
      .map((c: unknown[]) => c[0] as { data?: Record<string, unknown> })
      .find((c) => c.data?.status === 'FAILED');
    expect(failUpdate).toBeDefined();
    expect(failUpdate!.data!.error).toContain('rate limited hard');

    const failEvent = mockPrisma.executionActivity.create.mock.calls
      .map((c: unknown[]) => (c[0] as { data: { eventType: string; detail?: string } }).data)
      .find((d) => d.eventType === 'MODEL_FAILED');
    expect(failEvent).toBeDefined();
    expect(failEvent!.detail).toContain('rate limited hard');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Group 10: BILLING — flat-fee policy untouched
// ═══════════════════════════════════════════════════════════════════

describe('Phase 26 — billing invariants (no double billing)', () => {
  it('orchestration emits ONLY MODEL_* activity events — never charge events', async () => {
    await orchestrateModelCalls({
      specs: [{ model: 'a' }, { model: 'b' }, { model: 'c' }],
      mode: 'PARALLEL',
      basePrompt: 'x',
      context: CTX,
    });

    const events = mockPrisma.executionActivity.create.mock.calls.map(
      (c: unknown[]) => (c[0] as { data: { eventType: string } }).data.eventType
    );
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e: string) => e.startsWith('MODEL_'))).toBe(true);
    expect(events).not.toContain('EXECUTION_CHARGED');
  });

  it('multi-model fan-out creates invocation rows but ZERO credit ledger writes', async () => {
    await orchestrateModelCalls({
      specs: [{ model: 'a' }, { model: 'b' }],
      mode: 'PARALLEL',
      basePrompt: 'x',
      context: CTX,
    });

    // The orchestration layer only touches modelInvocation +
    // executionActivity + workflowExecution (status probe). The credits
    // ledger is never part of the model path — flat fee is charged once
    // at run acceptance by the Phase 24 engine, untouched here.
    const touched = Object.keys(mockPrisma).filter(
      (k) => Object.values((mockPrisma as Record<string, Record<string, unknown>>)[k] ?? {}).some(
        (fn) => (fn as { mock?: { calls: unknown[] } }).mock?.calls?.length > 0
      )
    );
    expect(touched).toEqual(
      expect.arrayContaining(['modelInvocation', 'executionActivity', 'workflowExecution'])
    );
    expect(touched).not.toContain('creditsLedger');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Group 11: aggregation semantics
// ═══════════════════════════════════════════════════════════════════

describe('Phase 26 — result aggregation', () => {
  it('primary = FIRST successful slot in spec order (not the last)', async () => {
    mockExecuteAICompletion.mockImplementation(async (req: { config?: { model?: string } }) =>
      okCompletion(`content-${req.config?.model}`)
    );

    const result = await orchestrateModelCalls({
      specs: [{ model: 'a' }, { model: 'b' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'x',
      context: CTX,
    });

    expect(result.primaryContent).toBe('content-a');
    expect(result.primaryModel).toBe('z-ai-default'); // actual model reported by provider
  });

  it('summary counts completed/failed/reused/cancelled accurately', async () => {
    mockExecuteAICompletion.mockImplementation(async (req: { config?: { model?: string } }) => {
      if (req.config?.model === 'b') throw new Error('nope');
      return okCompletion('ok');
    });

    const result = await orchestrateModelCalls({
      specs: [{ model: 'a' }, { model: 'b' }, { model: 'c' }, { model: 'd' }],
      mode: 'SEQUENTIAL',
      basePrompt: 'x',
      context: CTX,
      isCancelled: async () => false,
    });

    expect(result.summary).toMatchObject({
      mode: 'SEQUENTIAL',
      total: 4,
      completed: 3,
      failed: 1,
      reused: 0,
      cancelled: 0,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Group 12: orchestrateAIAction — workflow action entry point
// ═══════════════════════════════════════════════════════════════════

describe('Phase 26 — orchestrateAIAction (action entry point)', () => {
  it('parses step config: models[] + orchestration: parallel', async () => {
    const result = await orchestrateAIAction({
      actionType: 'ai_analysis',
      basePrompt: 'PROMPT',
      config: {
        models: [
          { provider: 'openai', model: 'gpt-4o' },
          { provider: 'anthropic', model: 'claude-sonnet-4' },
        ],
        orchestration: 'parallel',
        concurrency: 2,
      },
      context: {
        executionId: 'exec-1',
        leadId: 'lead-1',
        stepName: 'Step X',
        userId: 'user-1',
      },
    });

    expect(result.mode).toBe('PARALLEL');
    expect(result.summary.total).toBe(2);
    expect(mockExecuteAICompletion).toHaveBeenCalledTimes(2);
  });

  it('legacy single-model config → exactly ONE invocation (back-compat)', async () => {
    const result = await orchestrateAIAction({
      actionType: 'score_lead',
      basePrompt: 'score this',
      config: { model: 'gpt-4o' },
      context: { executionId: 'e1', userId: 'u1' },
    });

    expect(result.mode).toBe('SEQUENTIAL');
    expect(mockExecuteAICompletion).toHaveBeenCalledTimes(1);
    expect(mockExecuteAICompletion.mock.calls[0][0].config.model).toBe('gpt-4o');
  });

  it('missing stepName falls back to the action type for the invocation key', async () => {
    await orchestrateAIAction({
      actionType: 'ai_outreach',
      basePrompt: 'x',
      config: {},
      context: { executionId: 'e1', userId: 'u1' },
    });

    expect(mockPrisma.modelInvocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stepName: 'ai_outreach',
        actionType: 'ai_outreach',
      }),
    });
  });

  it('provider error text propagates to the FAILED slot (surfaced, not swallowed)', async () => {
    mockExecuteAICompletion.mockResolvedValue({
      success: false,
      content: '',
      provider: 'z-ai',
      model: 'unknown',
      tokensUsed: 0,
      latencyMs: 0,
      retries: 0,
      error: 'Unknown AI provider "nonexistent" — supported: z-ai, openai, anthropic, openrouter, local',
    });

    const result = await orchestrateAIAction({
      actionType: 'ai_analysis',
      basePrompt: 'x',
      config: { provider: 'nonexistent' },
      context: { executionId: 'e1', userId: 'u1' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown AI provider');
    expect(result.models[0].status).toBe('FAILED');
  });
});
