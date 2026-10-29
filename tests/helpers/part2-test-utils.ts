// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 2 Test Helpers
//
// Shared utilities for Part 2 orchestration tests. Provides:
//   · Mock model call capture (records prompts + returns canned content)
//   · Test user setup (for credit + isolation tests)
//   · Lightweight assertions for evidence shape, disagreement, etc.
//
// The orchestrator uses `executionId` as a key for invocation
// deduplication — it does NOT require a real WorkflowExecution row to
// exist (the cancellation probe degrades gracefully when the row is
// missing). So Part 2 tests can use any string as executionId.
// ═══════════════════════════════════════════════════════════════════

import { randomUUID } from 'crypto';

// ===== TEST USER CONTEXT =====

export interface Part2TestContext {
  runPrefix: string;
  userIds: string[];
  /** A stable executionId (string) for orchestration context. */
  executionId: string;
  /** Stable correlation id (for evidence grouping). */
  correlationId: string;
}

/**
 * Bootstrap a test user on the live Prisma client. Returns a stable
 * executionId + correlationId for the orchestrator context.
 *
 * Cleanup is the caller's responsibility via teardownPart2Context.
 */
export async function setupPart2Context(): Promise<Part2TestContext> {
  const { db } = await import('@/lib/db');
  const runPrefix = `p2t-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
  const userIds: string[] = [];

  const user = await db.user.create({
    data: {
      email: `${runPrefix}-u@test.part2`,
      name: `Part2 Test ${runPrefix}`,
      passwordHash: null,
      role: 'owner',
      plan: 'autopilot',
      credits: 1000, // enough for many AI operations
      createdAt: new Date(),
    },
  });
  userIds.push(user.id);

  return {
    runPrefix,
    userIds,
    executionId: `exec-${runPrefix}`,
    correlationId: `corr-${runPrefix}`,
  };
}

export async function teardownPart2Context(ctx: Part2TestContext | undefined): Promise<void> {
  if (!ctx) return;
  const { db } = await import('@/lib/db');
  // Cleanup: model invocations tagged with our executionId
  try {
    await db.modelInvocation.deleteMany({ where: { executionId: ctx.executionId } });
  } catch {
    // best-effort
  }
  // Cleanup: agent operations tagged with our userId
  for (const userId of ctx.userIds) {
    try {
      await db.agentOperation.deleteMany({ where: { userId } });
    } catch {
      // best-effort
    }
    try {
      await db.creditsLedger.deleteMany({ where: { userId } });
    } catch {
      // best-effort
    }
    try {
      await db.user.delete({ where: { id: userId } });
    } catch {
      // best-effort
    }
  }
}

// ===== MOCK MODEL PROVIDER =====

/**
 * A mock provider that records every invocation and returns a canned
 * response. Used by Part 2 tests to verify orchestration semantics
 * (parallelism, idempotency, evidence extraction) WITHOUT making
 * real network calls.
 *
 * Real provider smoke tests live in part2-real-provider-smoke.test.ts
 * and DO hit the network (when credentials are present).
 */
export interface MockCall {
  prompt: string;
  provider?: string;
  model?: string;
  role?: string;
  timestamp: number;
  callIndex: number;
}

export interface MockProviderConfig {
  /** Responses to return, in order. If exhausted, returns the last one. */
  responses: string[];
  /** Force-fail the Nth call (0-indexed). Useful for failure-isolation
   *  tests. `failOnCall[0] = 'timeout'` makes the first call throw a
   *  timeout-shaped error. */
  failOnCall?: Record<number, string>;
  /** Per-call delay in ms (simulates latency for parallelism tests). */
  delayMs?: number;
}

export function makeMockProvider(config: MockProviderConfig): {
  calls: MockCall[];
  callCount: () => number;
  provider: (params: {
    prompt: string;
    provider?: string;
    model?: string;
    role?: string;
  }) => Promise<string>;
} {
  const calls: MockCall[] = [];
  let cursor = 0;
  const provider = async (params: {
    prompt: string;
    provider?: string;
    model?: string;
    role?: string;
  }): Promise<string> => {
    const idx = cursor++;
    calls.push({
      prompt: params.prompt,
      provider: params.provider,
      model: params.model,
      role: params.role,
      timestamp: Date.now(),
      callIndex: idx,
    });
    if (config.delayMs && config.delayMs > 0) {
      await new Promise((r) => setTimeout(r, config.delayMs));
    }
    if (config.failOnCall && config.failOnCall[idx]) {
      throw new Error(config.failOnCall[idx]);
    }
    return config.responses[Math.min(idx, config.responses.length - 1)] ?? '';
  };
  return { calls, callCount: () => calls.length, provider };
}

// ===== ASSERTION HELPERS =====

/**
 * Assert that a value is a valid StructuredEvidence object.
 */
export function assertEvidenceShape(v: unknown): void {
  if (typeof v !== 'object' || v === null) {
    throw new Error('expected object');
  }
  const e = v as Record<string, unknown>;
  for (const key of ['facts', 'evidence', 'inferences', 'recommendations', 'limitations']) {
    if (!Array.isArray(e[key])) {
      throw new Error(`expected ${key} to be an array, got ${typeof e[key]}`);
    }
  }
  if (typeof e.confidence !== 'number') {
    throw new Error(`expected confidence to be a number, got ${typeof e.confidence}`);
  }
  if (typeof e.role !== 'string') {
    throw new Error(`expected role to be a string, got ${typeof e.role}`);
  }
  if (typeof e.correlationId !== 'string') {
    throw new Error(`expected correlationId to be a string, got ${typeof e.correlationId}`);
  }
}

// ===== DETERMINISTIC KEYS (for idempotency tests) =====

/**
 * Generate a stable logical key for tests. The same inputs always
 * produce the same key — used to verify idempotency invariants.
 */
export function stableLogicalKey(parts: string[]): string {
  return parts.join(':');
}
