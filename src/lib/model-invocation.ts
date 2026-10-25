// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Phase 26: Model Invocation Persistence Layer
//
// Durable record of EVERY AI model invocation made by the workflow
// execution path. One row per logical invocation slot:
//   (execution, lead, step, configured provider, configured model)
//
// Canonical idempotency contract:
//   · invocationKey is UNIQUE — the same logical slot can never have two
//     live rows (DB-level duplicate protection, same pattern as
//     AutopilotRun.runKey).
//   · A COMPLETED row is durable output: retry/resume of the step reuses
//     it instead of re-invoking the provider (no duplicate generation,
//     no duplicate token spend).
//   · A FAILED row is retried in place: attempt counter increments on the
//     SAME row (audit trail of retry history), status returns to RUNNING.
//
// All functions are BEST-EFFORT from the orchestrator's perspective:
// callers wrap them in try/catch — tracking must never break execution
// (same philosophy as Phase 25's logExecutionActivity).
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

export type ModelInvocationStatus =
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface ModelInvocationCreateInput {
  invocationKey: string;
  executionId?: string | null;
  runId?: string | null;
  leadId?: string | null;
  stepName?: string | null;
  actionType: string;
  provider: string;
  model: string;
  role?: string | null;
  userId: string;
}

/** Find the durable invocation row for a logical slot (idempotency read). */
export async function findInvocationByKey(invocationKey: string) {
  return db.modelInvocation.findUnique({ where: { invocationKey } });
}

/** Create a new invocation row already in RUNNING state (start of work). */
export async function createRunningInvocation(
  data: ModelInvocationCreateInput
) {
  return db.modelInvocation.create({
    data: {
      ...data,
      status: 'RUNNING',
      attempt: 0,
      startedAt: new Date(),
    },
  });
}

/** Re-open a FAILED row for another attempt (retry history preserved:
 * attempt increments on the SAME row — never a second row for the slot). */
export async function reopenInvocationForRetry(id: string, attempt: number) {
  return db.modelInvocation.update({
    where: { id },
    data: {
      status: 'RUNNING',
      attempt,
      startedAt: new Date(),
      finishedAt: null,
      durationMs: null,
      error: null,
      result: null,
    },
  });
}

/** Durable success — after this write, the slot is never re-invoked. */
export async function completeInvocation(
  id: string,
  data: {
    provider: string;
    model: string;
    content: string;
    tokensUsed?: number;
    retries?: number;
  }
) {
  const finishedAt = new Date();
  return db.modelInvocation.update({
    where: { id },
    data: {
      status: 'COMPLETED',
      finishedAt,
      result: JSON.stringify({
        content: data.content,
        tokensUsed: data.tokensUsed ?? null,
        retries: data.retries ?? null,
      }),
      provider: data.provider,
      model: data.model,
      tokensUsed: data.tokensUsed ?? null,
    },
  }).catch(() => {
    // durationMs computed from startedAt difference where supported
    return db.modelInvocation.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        finishedAt,
        result: JSON.stringify({ content: data.content }),
        provider: data.provider,
        model: data.model,
      },
    });
  });
}

/** Durable failure — retriable in place, error surfaced for audit. */
export async function failInvocation(id: string, error: string) {
  const finishedAt = new Date();
  return db.modelInvocation.update({
    where: { id },
    data: {
      status: 'FAILED',
      finishedAt,
      error: error.slice(0, 2000),
    },
  });
}

/** Mark a not-yet-finished slot as cancelled (mid-orchestration stop). */
export async function cancelInvocation(id: string) {
  return db.modelInvocation.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      finishedAt: new Date(),
    },
  });
}

/** Ownership-scoped read model (User B can never see User A's invocations). */
export async function getInvocationsForExecution(
  executionId: string,
  userId: string
) {
  return db.modelInvocation.findMany({
    where: { executionId, userId },
    orderBy: { createdAt: 'asc' },
  });
}

/** Ownership-scoped per-lead view. */
export async function getInvocationsForLead(
  leadId: string,
  userId: string,
  take = 200
) {
  return db.modelInvocation.findMany({
    where: { leadId, userId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(take, 200),
  });
}

/** Aggregate stats for observability (bounded to the caller's data). */
export async function getInvocationStats(userId: string) {
  const [completed, failed, running, cancelled] = await Promise.all([
    db.modelInvocation.count({ where: { userId, status: 'COMPLETED' } }),
    db.modelInvocation.count({ where: { userId, status: 'FAILED' } }),
    db.modelInvocation.count({ where: { userId, status: 'RUNNING' } }),
    db.modelInvocation.count({ where: { userId, status: 'CANCELLED' } }),
  ]);
  return { completed, failed, running, cancelled };
}
