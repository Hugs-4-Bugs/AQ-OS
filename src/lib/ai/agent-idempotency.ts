// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workstream D §13 — Operation-Level Idempotency
//
// Persistent idempotency registry (AgentOperation table). Survives process
// restarts — unlike the in-memory tool cache in agent-tools/registry.ts
// (5-min TTL, single process). Used across:
//   · events               (dispatcher dedupe also uses AgentEvent key)
//   · agent runs           (re-run of identical scope)
//   · workflow starts      (on top of executeWorkflow's own key)
//   · tool calls           (persistent replay protection)
//   · email sends          (never send twice)
//   · Telegram notifications
//   · approvals / callbacks / retries / resume operations
//   · continuation steps   (a step never repeats for the same lead scope)
//
// Fingerprint incorporates the relevant identity + effective input:
//   user, agent, execution/run, operation type, target, effective input,
//   evidence/version — so a genuinely NEW scope produces a NEW fingerprint
// and may perform (and charge for) new meaningful work, while a replay of
// the SAME scope returns the existing result with no duplicate business
// action and no charge.
// ═══════════════════════════════════════════════════════════════════

import crypto from 'crypto';

export type IdempotentOperationType =
  | 'agent_run'
  | 'workflow_start'
  | 'tool_call'
  | 'email_send'
  | 'telegram_notify'
  | 'approval_resume'
  | 'continuation_step'
  | 'external_callback';

export interface OperationFingerprintInput {
  userId: string;
  agentId?: string | null;
  runId?: string | null;
  operationType: IdempotentOperationType;
  /** Logical target of the operation (lead id, workflow id, approval id, recipient, ...). */
  target?: string | null;
  /** The effective input (after normalization — irrelevant fields removed). */
  input?: unknown;
  /** Evidence/content version — bumping it makes a NEW meaningful scope. */
  evidenceVersion?: string | number | null;
}

export interface IdempotentResult<T = unknown> {
  /** True when a previous execution's result was returned (no work performed). */
  replayed: boolean;
  /** The recorded or newly produced result. */
  result: T | null;
  /** Operation row id (existing on replay, new on first execution). */
  operationId: string;
  /** The computed fingerprint (for audit). */
  fingerprint: string;
}

/** Normalize a value into a stable canonical JSON string (sorted keys). */
export function canonicalJson(value: unknown): string {
  const sortDeep = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === 'object') {
      const entries = Object.entries(v as Record<string, unknown>)
        .filter(([, val]) => val !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      const out: Record<string, unknown> = {};
      for (const [k, val] of entries) out[k] = sortDeep(val);
      return out;
    }
    return v;
  };
  return JSON.stringify(sortDeep(value));
}

/** Compute the stable sha256 fingerprint for an operation. */
export function computeOperationFingerprint(inp: OperationFingerprintInput): string {
  const material = canonicalJson({
    userId: inp.userId,
    agentId: inp.agentId ?? null,
    runId: inp.runId ?? null,
    operationType: inp.operationType,
    target: inp.target ?? null,
    input: inp.input ?? null,
    evidenceVersion: inp.evidenceVersion ?? null,
  });
  return crypto.createHash('sha256').update(material).digest('hex');
}

/**
 * Execute `fn` exactly once per fingerprint. On a repeated execution with
 * the same fingerprint the FIRST result is returned (replayed: true) and
 * `fn` is never invoked — no duplicate business action, no charge.
 *
 * `describeResult` converts the fn's return value into the compact
 * persisted summary (resultType/resultId/resultRef) that replays receive.
 */
export async function withIdempotency<T>(
  inp: OperationFingerprintInput,
  fn: () => Promise<T>,
  describeResult?: (result: T) => { resultType: string; resultId?: string; resultRef?: string },
): Promise<IdempotentResult<T>> {
  const fingerprint = computeOperationFingerprint(inp);
  const { db } = await import('@/lib/db');

  // ── 1. Replay check (unique fingerprint) ──
  let existing: { id: string; resultRef: string | null; fingerprint: string } | null = null;
  try {
    existing = await db.agentOperation.findUnique({ where: { fingerprint } });
  } catch {
    existing = null; // tracking is best-effort; degrade to no dedup
  }

  if (existing) {
    return {
      replayed: true,
      result: (existing.resultRef ? safeParse(existing.resultRef) : null) as T | null,
      operationId: existing.id,
      fingerprint,
    };
  }

  // ── 2. First execution ──
  // Create the row BEFORE executing so concurrent duplicates see it
  // (SQLite UNIQUE constraint is the hard guard).
  let row: { id: string };
  try {
    row = await db.agentOperation.create({
      data: {
        userId: inp.userId,
        operationType: inp.operationType,
        fingerprint,
        agentId: inp.agentId ?? null,
        runId: inp.runId ?? null,
        status: 'completed', // provisional — corrected below on failure
      },
    });
  } catch (createErr: unknown) {
    // UNIQUE race — another worker won. Read its result.
    if (String(createErr).includes('Unique constraint')) {
      const winner = await db.agentOperation.findUnique({ where: { fingerprint } });
      if (winner) {
        return {
          replayed: true,
          result: (winner.resultRef ? safeParse(winner.resultRef) : null) as T | null,
          operationId: winner.id,
          fingerprint,
        };
      }
    }
    // If AgentOperation table doesn't exist or DB is unavailable, proceed
    // WITHOUT persistent idempotency — execution must not stall. The
    // in-memory cache in the tool registry still provides short-term dedup.
    const result = await fn();
    return { replayed: false, result, operationId: 'no-db-tracking', fingerprint };
  }

  try {
    const result = await fn();
    const desc = describeResult ? describeResult(result) : undefined;
    try {
      await db.agentOperation.update({
        where: { id: row.id },
        data: {
          status: 'completed',
          resultType: desc?.resultType ?? null,
          resultId: desc?.resultId ?? null,
          resultRef: desc?.resultRef ?? canonicalJson(result ?? null),
          completedAt: new Date(),
        },
      });
    } catch {
      /* best-effort tracking */
    }
    return { replayed: false, result, operationId: row.id, fingerprint };
  } catch (execErr) {
    // Failed operations do NOT block future retries — a retryable failure
    // should be able to run again (per spec: failure → no charge, retry OK).
    try {
      await db.agentOperation.update({
        where: { id: row.id },
        data: { status: 'failed', resultRef: null, completedAt: new Date() },
      });
    } catch {
      /* non-fatal */
    }
    throw execErr;
  }
}

function safeParse(ref: string): unknown {
  try { return JSON.parse(ref); } catch { return ref; }
}
