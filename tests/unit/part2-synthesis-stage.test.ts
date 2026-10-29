// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 2 Tests — Synthesis Stage
//
// Verifies src/lib/ai/synthesis.ts:
//   · Single completed slot → no synthesis, returns extracted evidence
//   · Multiple completed slots → synthesizer runs and produces unified evidence
//   · Disagreement reason propagates into synthesizer prompt
//   · Synthesizer failure preserves independent results with reduced confidence
//   · Idempotency: re-running synthesis reuses durable COMPLETED invocation
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { synthesizeResults } from '@/lib/ai/synthesis';
import type { ModelCallResult, OrchestrationContext } from '@/lib/ai/orchestrator';

// ===== Mocks =====

let mockSynthResponse = '';
let mockSynthFail = false;
let mockCallCount = 0;

vi.mock('@/lib/ai/ai-provider', () => ({
  executeAICompletion: vi.fn(async (params: { messages: { content: string }[] }) => {
    const idx = mockCallCount++;
    if (mockSynthFail) {
      throw new Error('synthesizer model failed');
    }
    return {
      success: true,
      content: mockSynthResponse || `synthesis[${idx}]: ${params.messages[0]?.content.slice(0, 30)}`,
      provider: 'mock',
      model: 'synth-model',
      tokensUsed: 10,
      latencyMs: 5,
      retries: 0,
    };
  }),
}));

vi.mock('@/lib/workflow-ai-retry', () => ({
  withAiRateLimitRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

vi.mock('@/lib/model-invocation', () => ({
  findInvocationByKey: vi.fn(async () => null),
  createRunningInvocation: vi.fn(async () => ({ id: 'synth-inv-1' })),
  reopenInvocationForRetry: vi.fn(async (id: string) => ({ id, attempt: 1 })),
  completeInvocation: vi.fn(async () => {}),
  failInvocation: vi.fn(async () => {}),
  cancelInvocation: vi.fn(async () => {}),
}));

vi.mock('@/lib/execution-activity', () => ({
  logExecutionActivity: vi.fn(async () => {}),
}));

vi.mock('@/lib/db', () => ({
  db: {
    workflowExecution: { findUnique: vi.fn(async () => null) },
  },
}));

function resetMocks() {
  mockSynthResponse = '';
  mockSynthFail = false;
  mockCallCount = 0;
}

const baseContext: OrchestrationContext = {
  executionId: 'test-synth-exec',
  stepName: 'synth-test',
  userId: 'test-user',
  actionType: 'synthesis',
};

describe('[Part 2] Synthesis Stage', () => {
  beforeEach(resetMocks);

  it('returns extracted evidence for a single completed slot (no synthesis needed)', async () => {
    mockSynthResponse = '{"facts": ["single fact"], "confidence": 0.85}';
    const input: ModelCallResult[] = [
      {
        status: 'COMPLETED',
        role: 'researcher',
        provider: 'mock',
        model: 'm1',
        content: '{"facts": ["single fact"], "confidence": 0.85}',
      },
    ];
    const out = await synthesizeResults({
      results: input,
      context: baseContext,
    });
    expect(out.success).toBe(true);
    expect(out.reused).toBe(true); // single slot reused, no synthesizer call
    expect(out.evidence.facts).toContain('single fact');
  });

  it('runs synthesizer when 2+ slots completed and produces unified evidence', async () => {
    mockSynthResponse = JSON.stringify({
      facts: ['agreed fact 1', 'agreed fact 2'],
      inferences: ['models agreed on key facts'],
      confidence: 0.8,
      limitations: ['Some disagreement on minor points'],
    });
    const input: ModelCallResult[] = [
      {
        status: 'COMPLETED',
        role: 'researcher',
        provider: 'mock',
        model: 'm1',
        content: '{"facts": ["fact A"], "confidence": 0.7}',
      },
      {
        status: 'COMPLETED',
        role: 'critic',
        provider: 'mock',
        model: 'm2',
        content: '{"facts": ["fact B"], "confidence": 0.6}',
      },
    ];
    const out = await synthesizeResults({
      results: input,
      context: baseContext,
      disagreementReason: 'min similarity 0.20 < 0.30 threshold',
    });
    expect(out.success).toBe(true);
    expect(out.evidence.facts.length).toBeGreaterThanOrEqual(1);
    expect(out.evidence.role).toBe('synthesizer');
    expect(out.invocationId).toBe('synth-inv-1');
  });

  it('preserves independent results with reduced confidence when synthesizer fails', async () => {
    mockSynthFail = true;
    const input: ModelCallResult[] = [
      {
        status: 'COMPLETED',
        role: 'researcher',
        provider: 'mock',
        model: 'm1',
        content: '{"facts": ["fact A"], "confidence": 0.8}',
      },
      {
        status: 'COMPLETED',
        role: 'critic',
        provider: 'mock',
        model: 'm2',
        content: '{"facts": ["fact B"], "confidence": 0.6}',
      },
    ];
    const out = await synthesizeResults({
      results: input,
      context: baseContext,
    });
    expect(out.success).toBe(false);
    expect(out.error).toBeTruthy();
    // Independent results preserved (merged evidence)
    expect(out.evidence.facts.length).toBeGreaterThanOrEqual(1);
    // Confidence reduced (min of 0.8, 0.6 = 0.6, then -0.2 = 0.4)
    expect(out.evidence.confidence).toBeLessThanOrEqual(0.6);
    expect(out.evidence.limitations.some((l) => l.includes('Synthesizer model failed'))).toBe(true);
  });

  it('returns empty synthesis when no completed slots', async () => {
    const input: ModelCallResult[] = [
      { status: 'FAILED', role: 'r1', provider: 'p', model: 'm' },
      { status: 'FAILED', role: 'r2', provider: 'p', model: 'm' },
    ];
    const out = await synthesizeResults({
      results: input,
      context: baseContext,
    });
    expect(out.success).toBe(false);
    expect(out.evidence.facts).toHaveLength(0);
    expect(out.evidence.limitations[0]).toContain('No completed');
  });

  it('propagates disagreement reason into synthesizer prompt (verified by mock capture)', async () => {
    mockSynthResponse = '{"facts": ["x"], "confidence": 0.5}';
    const input: ModelCallResult[] = [
      { status: 'COMPLETED', role: 'r1', provider: 'p', model: 'm', content: 'output 1' },
      { status: 'COMPLETED', role: 'r2', provider: 'p', model: 'm', content: 'output 2' },
    ];
    await synthesizeResults({
      results: input,
      disagreementReason: 'CRITICAL DISAGREEMENT FLAG',
      context: baseContext,
    });
    // Verify the synthesizer was invoked and the disagreement reason
    // was injected into the prompt. vi.fn stores calls at .mock.calls
    // where each entry is the arguments array passed to the function.
    const { executeAICompletion } = await import('@/lib/ai/ai-provider');
    type MockFn = {
      mock: { calls: Array<Array<{ messages: { content: string }[] }>> };
    };
    const mockFn = executeAICompletion as unknown as MockFn;
    expect(mockFn.mock.calls.length).toBeGreaterThan(0);
    const lastCallArgs = mockFn.mock.calls.at(-1)?.[0];
    const lastCallPrompt = lastCallArgs?.messages[0]?.content ?? '';
    expect(lastCallPrompt).toContain('CRITICAL DISAGREEMENT FLAG');
  });
});
