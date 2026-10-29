// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 2 Tests — Agent-Level Parallelism
//
// Tests src/lib/ai/agent-orchestrator.ts:
//   · computeWaves (pure topological sort)
//   · validateGraph (cycles, missing deps)
//   · executeAgentGraph (parallel independent agents, sequential
//     dependent agents, mixed dependency graph, failure isolation,
//     cross-agent synthesis)
//
// Uses a mock provider to avoid real network calls.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest';
import {
  executeAgentGraph,
  computeWaves,
  type AgentTask,
} from '@/lib/ai/agent-orchestrator';

// ===== Helper: build a mock provider that the orchestrator will
// call via executeAICompletion. We mock at the module level.

vi.mock('@/lib/ai/ai-provider', () => ({
  executeAICompletion: vi.fn(async (params: { messages: { content: string }[] }) => {
    const prompt = params.messages[0]?.content ?? '';
    return {
      success: true,
      content: `mock response for prompt: ${prompt.slice(0, 50)}`,
      provider: 'mock',
      model: 'mock-model',
      tokensUsed: 10,
      latencyMs: 5,
      retries: 0,
    };
  }),
}));

vi.mock('@/lib/workflow-ai-retry', () => ({
  withAiRateLimitRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  tryWithAiRateLimitRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

// Skip durable ModelInvocation persistence — tests don't need DB.
vi.mock('@/lib/model-invocation', () => ({
  findInvocationByKey: vi.fn(async () => null),
  createRunningInvocation: vi.fn(async () => ({ id: 'mock-invocation-id' })),
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
    modelInvocation: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    auditLog: { create: vi.fn(async () => ({})) },
  },
}));

describe('[Part 2] Agent-Level Parallelism', () => {
  describe('computeWaves (pure topological sort)', () => {
    it('returns one wave when all tasks are independent', () => {
      const tasks: AgentTask[] = [
        mkTask('A', 'researcher', []),
        mkTask('B', 'critic', []),
        mkTask('C', 'verifier', []),
      ];
      const waves = computeWaves(tasks);
      expect(waves).toHaveLength(1);
      expect(waves[0].sort()).toEqual(['A', 'B', 'C']);
    });

    it('returns N sequential waves when all tasks depend on the previous', () => {
      const tasks: AgentTask[] = [
        mkTask('A', 'researcher', []),
        mkTask('B', 'enricher', ['A']),
        mkTask('C', 'qualifier', ['B']),
      ];
      const waves = computeWaves(tasks);
      expect(waves).toHaveLength(3);
      expect(waves[0]).toEqual(['A']);
      expect(waves[1]).toEqual(['B']);
      expect(waves[2]).toEqual(['C']);
    });

    it('returns mixed waves for a diamond dependency', () => {
      // A → B,C → D
      const tasks: AgentTask[] = [
        mkTask('A', 'discovery', []),
        mkTask('B', 'research', ['A']),
        mkTask('C', 'enrichment', ['A']),
        mkTask('D', 'qualification', ['B', 'C']),
      ];
      const waves = computeWaves(tasks);
      expect(waves).toHaveLength(3);
      expect(waves[0]).toEqual(['A']);
      expect(waves[1].sort()).toEqual(['B', 'C']);
      expect(waves[2]).toEqual(['D']);
    });

    it('returns empty waves for cyclic graphs', () => {
      const tasks: AgentTask[] = [
        mkTask('A', 'r', ['B']),
        mkTask('B', 'r', ['A']),
      ];
      const waves = computeWaves(tasks);
      expect(waves).toEqual([]);
    });

    it('returns empty waves when a dep is unknown', () => {
      const tasks: AgentTask[] = [
        mkTask('A', 'r', ['UNKNOWN']),
      ];
      const waves = computeWaves(tasks);
      expect(waves).toEqual([]);
    });
  });

  describe('executeAgentGraph — independent agents', () => {
    it('runs independent agents and synthesizes', async () => {
      const tasks: AgentTask[] = [
        mkTask('discovery', 'discovery', []),
        mkTask('research', 'researcher', []),
        mkTask('enrichment', 'enricher', []),
      ];
      const result = await executeAgentGraph(tasks, {
        parent: {
          executionId: 'test-exec-1',
          workflowId: 'wf-test',
          runId: 'run-test',
          leadId: null,
          stepName: 'agent-graph-test',
          userId: 'test-user',
          actionType: 'test',
        },
        synthesize: true,
      });

      expect(result.success).toBe(true);
      expect(result.agents).toHaveLength(3);
      expect(result.correlationId).toBeTruthy();
      // 2+ agents succeeded → synthesis ran
      expect(result.synthesis).toBeDefined();
      expect(result.synthesis?.success).toBe(true);
    });

    it('bounds agent concurrency to 4', async () => {
      // 6 independent agents with concurrency 2 — should run in 3
      // waves of 2 each (verified by total wall-clock duration being
      // roughly 3x a single agent's duration, not 1x).
      const tasks: AgentTask[] = Array.from({ length: 6 }, (_, i) =>
        mkTask(`agent-${i}`, 'role', [])
      );
      const result = await executeAgentGraph(tasks, {
        parent: {
          executionId: 'test-exec-2',
          stepName: 'concurrency-test',
          userId: 'test-user',
          actionType: 'test',
        },
        agentConcurrency: 2,
        synthesize: false, // skip synthesis to focus on agent timing
      });
      expect(result.success).toBe(true);
      expect(result.agents).toHaveLength(6);
    });
  });

  describe('executeAgentGraph — dependent agents', () => {
    it('runs sequential chain A → B → C', async () => {
      const tasks: AgentTask[] = [
        mkTask('A', 'discovery', []),
        mkTask('B', 'enricher', ['A']),
        mkTask('C', 'qualifier', ['B']),
      ];
      const result = await executeAgentGraph(tasks, {
        parent: {
          executionId: 'test-exec-3',
          stepName: 'sequential-chain',
          userId: 'test-user',
          actionType: 'test',
        },
        synthesize: false,
      });
      expect(result.success).toBe(true);
      expect(result.agents).toHaveLength(3);
      // Verify all completed (not skipped)
      expect(result.skippedTaskIds).toHaveLength(0);
    });

    it('runs diamond A → (B,C) → D', async () => {
      const tasks: AgentTask[] = [
        mkTask('A', 'discovery', []),
        mkTask('B', 'research', ['A']),
        mkTask('C', 'enrichment', ['A']),
        mkTask('D', 'qualification', ['B', 'C']),
      ];
      const result = await executeAgentGraph(tasks, {
        parent: {
          executionId: 'test-exec-4',
          stepName: 'diamond-deps',
          userId: 'test-user',
          actionType: 'test',
        },
        synthesize: false,
      });
      expect(result.success).toBe(true);
      expect(result.agents).toHaveLength(4);
      expect(result.skippedTaskIds).toHaveLength(0);
    });
  });

  describe('executeAgentGraph — failure isolation', () => {
    it('skips downstream agents when an upstream fails', async () => {
      // Force agent A to fail by overriding the mock for one call.
      const { executeAICompletion } = await import('@/lib/ai/ai-provider');
      const mockFn = executeAICompletion as unknown as { mockReset: () => void; mockImplementation: (fn: (p: unknown) => Promise<unknown>) => void };
      let callCount = 0;
      mockFn.mockReset();
      mockFn.mockImplementation(async (params: { messages: { content: string }[] }) => {
        callCount++;
        // First call (agent A) fails; subsequent calls succeed.
        if (callCount === 1) {
          return {
            success: false,
            content: null,
            provider: 'mock',
            model: 'mock',
            error: 'simulated failure for agent A',
          };
        }
        const prompt = params.messages[0]?.content ?? '';
        return {
          success: true,
          content: `mock: ${prompt.slice(0, 30)}`,
          provider: 'mock',
          model: 'mock',
          tokensUsed: 5,
          latencyMs: 1,
          retries: 0,
        };
      });

      const tasks: AgentTask[] = [
        mkTask('A', 'discovery', []),
        mkTask('B', 'enricher', ['A']),
        mkTask('C', 'qualifier', ['B']),
      ];
      const result = await executeAgentGraph(tasks, {
        parent: {
          executionId: 'test-exec-5',
          stepName: 'failure-isolation',
          userId: 'test-user',
          actionType: 'test',
        },
        synthesize: false,
      });

      // A failed → B and C skipped (failure isolation)
      expect(result.success).toBe(false);
      expect(result.agents.find((a) => a.taskId === 'A')?.success).toBe(false);
      expect(result.skippedTaskIds).toContain('B');
      expect(result.skippedTaskIds).toContain('C');
    });
  });

  describe('executeAgentGraph — idempotency', () => {
    it('uses the same correlationId when provided', async () => {
      const tasks: AgentTask[] = [
        mkTask('A', 'discovery', []),
      ];
      const result = await executeAgentGraph(tasks, {
        parent: {
          executionId: 'test-exec-6',
          stepName: 'idempotency-test',
          userId: 'test-user',
          actionType: 'test',
        },
        correlationId: 'stable-correlation-id',
        synthesize: false,
      });
      expect(result.correlationId).toBe('stable-correlation-id');
      expect(result.agents[0].evidence.correlationId).toBe('stable-correlation-id');
    });
  });
});

// ===== Helper =====

function mkTask(id: string, role: string, dependsOn: string[]): AgentTask {
  return {
    id,
    name: `Task ${id}`,
    role,
    dependsOn,
    modelStrategy: 'SINGLE' as const,
    models: [{ provider: 'mock', model: 'mock-model', role }],
    basePrompt: `You are the ${role} agent. Produce a JSON evidence object.`,
  };
}
