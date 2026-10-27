// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Phase 26: Multi-Model Orchestration Engine
//
// ONE canonical layer between the workflow AI actions and the provider
// abstraction (executeAICompletion in ai/ai-provider.ts). Replaces the
// previous hardcoded single-Z-AI-call path in workflow-actions.ts.
//
// Capabilities:
//   · Model routing — a configured provider/model actually determines the
//     invocation target (no decorative model fields).
//   · SEQUENTIAL mode — configured models run one after another, with
//     optional output chaining (result propagation between models).
//   · PARALLEL mode — bounded worker-pool fan-out (hard-capped at 4,
//     default 3). NO uncontrolled Promise.all fan-out.
//   · Failure isolation — one failed model never destroys siblings'
//     results (allSettled semantics via per-call error capture).
//   · Invocation idempotency — deterministic invocationKey
//     (execution + lead + step + provider + model); a durably COMPLETED
//     slot is REUSED on retry/resume instead of re-invoked.
//   · Model-level tracking — every slot gets a ModelInvocation row plus
//     best-effort ExecutionActivity MODEL_* events.
//   · Cancellation — checked before each slot starts; unstarted slots
//     are marked skipped, in-flight slots finish and record normally.
//
// Billing policy (unchanged by design): workflow runs bill a FLAT fee at
// run acceptance (Phase 24 semantics). Model fan-out NEVER multiplies
// credit consumption — see tests/phase26 for the no-double-billing
// invariants.
// ═══════════════════════════════════════════════════════════════════

import {
  executeAICompletion,
  type AIProviderConfig,
} from '@/lib/ai/ai-provider';
import { withAiRateLimitRetry } from '@/lib/workflow-ai-retry';
import { logExecutionActivity } from '@/lib/execution-activity';
import {
  findInvocationByKey,
  createRunningInvocation,
  reopenInvocationForRetry,
  completeInvocation,
  failInvocation,
} from '@/lib/model-invocation';
import { db } from '@/lib/db';

// ===== TYPES =====

export type OrchestrationMode = 'SEQUENTIAL' | 'PARALLEL';

/** One configured model slot inside a step's model list. */
export interface ModelCallSpec {
  /** Target provider ('z-ai' | 'openai' | 'anthropic' | 'openrouter' | 'local').
   *  Undefined → env-driven default chain. */
  provider?: string;
  /** Target model id, passed through to the provider adapter. */
  model?: string;
  /** Logical role of this slot (e.g. 'analyst', 'critic') — labeling only. */
  role?: string;
  /** SEQUENTIAL mode: include completed predecessors' outputs in this
   *  slot's prompt. Default true. */
  includePreviousOutput?: boolean;
}

export interface ModelCallResult {
  /** Configured slot identity (what the workflow asked for). */
  configuredProvider?: string;
  configuredModel?: string;
  role?: string;
  /** Actual serving provider/model (post-fallback). */
  provider?: string;
  model?: string;
  status: 'COMPLETED' | 'FAILED' | 'REUSED' | 'SKIPPED_CANCELLED';
  content?: string;
  error?: string;
  durationMs?: number;
  tokensUsed?: number;
  retries?: number;
  /** True when a durably completed invocation was reused (idempotent skip). */
  fromCache?: boolean;
  invocationId?: string;
}

export interface OrchestrationContext {
  executionId: string;
  workflowId?: string;
  runId?: string;
  leadId?: string | null;
  stepName: string;
  userId: string;
  actionType: string;
}

export interface OrchestrationResult {
  success: boolean;
  mode: OrchestrationMode;
  /** Content of the first successful slot (spec order) — the step's
   *  canonical output. Partial success preserves this. */
  primaryContent: string;
  primaryProvider?: string;
  primaryModel?: string;
  models: ModelCallResult[];
  summary: {
    mode: OrchestrationMode;
    total: number;
    completed: number;
    failed: number;
    reused: number;
    cancelled: number;
    durationMs: number;
  };
  error?: string;
  /** Workstream 3 — model disagreement detection. Present when 2+ slots
   *  completed. When `detected=true`, the caller (agent runtime / workflow
   *  step) should NOT blindly trust `primaryContent` — it should seek
   *  additional evidence, reduce confidence, or escalate per the spec. */
  disagreement?: DisagreementAssessment;
}

/** Workstream 3 — disagreement assessment between completed model slots. */
export interface DisagreementAssessment {
  /** True when the minimum pairwise similarity between completed slots
   *  falls below DISAGREEMENT_THRESHOLD. The caller must NOT arbitrarily
   *  pick one — it should seek more evidence or escalate. */
  detected: boolean;
  /** Minimum Jaccard similarity (0..1) between any two completed slots'
   *  outputs. Lower = more disagreement. */
  minSimilarity: number;
  /** Mean pairwise similarity across all completed slots. */
  meanSimilarity: number;
  /** Recommended next action when disagreement is detected. */
  recommendation: 'accept' | 'seek_evidence' | 'escalate';
  /** Human-readable explanation (for audit/memory). */
  reason: string;
}

interface OrchestrateParams {
  specs: ModelCallSpec[];
  mode: OrchestrationMode;
  /** Bounded worker count for PARALLEL mode. Clamped to [1, 4]. */
  concurrencyLimit?: number;
  basePrompt: string;
  context: OrchestrationContext;
  /** Cancellation probe — checked before each slot starts. */
  isCancelled?: () => Promise<boolean>;
}

// ===== CONSTANTS =====

const MAX_CONCURRENCY = 4;
const DEFAULT_CONCURRENCY = 3;

// ===== CONFIG PARSING =====

/**
 * Parse a workflow step's model configuration into call specs.
 *
 * Supported (additive, backward-compatible) step config shapes:
 *   · config.models: array of "model-id" strings or
 *     { provider?, model?, role?, includePreviousOutput? } objects
 *   · config.provider + config.model: single configured slot
 *   · neither: one default slot routed by the env fallback chain
 *
 * Identical (provider, model) slots are deduplicated — the first
 * occurrence wins (invocation keys are per logical slot).
 */
export function buildModelCallSpecs(
  config: Record<string, unknown>
): ModelCallSpec[] {
  const raw = config.models;

  if (Array.isArray(raw) && raw.length > 0) {
    const specs: ModelCallSpec[] = [];
    const seen = new Set<string>();
    for (const entry of raw) {
      const spec: ModelCallSpec =
        typeof entry === 'string'
          ? { model: entry }
          : entry && typeof entry === 'object'
            ? {
                provider: strOrUndefined((entry as Record<string, unknown>).provider),
                model: strOrUndefined((entry as Record<string, unknown>).model),
                role: strOrUndefined((entry as Record<string, unknown>).role),
                includePreviousOutput:
                  (entry as Record<string, unknown>).includePreviousOutput === false
                    ? false
                    : undefined,
              }
            : {};
      const key = `${spec.provider ?? ''}|${spec.model ?? ''}`;
      if (seen.has(key)) continue; // dedupe identical logical slots
      seen.add(key);
      specs.push(spec);
    }
    return specs;
  }

  // Single-slot configuration (legacy `model` field — now actually routed).
  const provider = strOrUndefined(config.provider);
  const model = strOrUndefined(config.model);
  if (provider || model) return [{ provider, model }];
  return [{}];
}

function strOrUndefined(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/** Parse orchestration mode from step config ('parallel' → PARALLEL). */
export function parseOrchestrationMode(
  config: Record<string, unknown>
): OrchestrationMode {
  const raw = typeof config.orchestration === 'string' ? config.orchestration.toLowerCase() : '';
  return raw === 'parallel' ? 'PARALLEL' : 'SEQUENTIAL';
}

/** Parse bounded concurrency from step config, clamped to [1, 4]. */
export function parseConcurrencyLimit(config: Record<string, unknown>): number {
  const raw = Number(config.concurrency);
  const n = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_CONCURRENCY;
  return Math.min(Math.max(n, 1), MAX_CONCURRENCY);
}

// ===== INVOCATION KEY =====

/**
 * Deterministic idempotency key for a logical invocation slot.
 * Same slot (execution + lead + step + configured provider/model) →
 * same key → the ModelInvocation unique constraint enforces exactly one
 * durable row per slot across retries, resumes, and replays.
 */
export function computeInvocationKey(params: {
  executionId: string;
  leadId?: string | null;
  stepName: string;
  provider?: string;
  model?: string;
}): string {
  return [
    'mi',
    params.executionId,
    params.leadId ?? 'none',
    params.stepName,
    params.provider ?? 'env-default',
    params.model ?? 'default',
  ].join(':');
}

// ===== CANCELLATION PROBE =====

/**
 * Default cancellation probe: consult the live WorkflowExecution status.
 * Failures resolve to "not cancelled" — cancellation is an optimization,
 * never a new failure mode. Returns a no-op probe when the execution id
 * is unavailable (standalone action invocations).
 */
function executionStatusProbe(executionId?: string): () => Promise<boolean> {
  if (!executionId) return async () => false;
  return async () => {
    try {
      const status = await db.workflowExecution.findUnique({
        where: { id: executionId },
        select: { status: true },
      });
      return status?.status === 'cancelled' || status?.status === 'paused';
    } catch {
      return false;
    }
  };
}

// ===== CORE ORCHESTRATION =====

/**
 * Execute the configured model slots for one workflow AI action.
 *
 * SEQUENTIAL: slots run in spec order; each slot may receive completed
 * predecessors' outputs as prompt context (result propagation).
 * PARALLEL: bounded worker pool over the slot queue (allSettled
 * semantics — every slot's outcome is captured independently).
 *
 * In BOTH modes a slot failure is isolated: the slot records FAILED and
 * the remaining slots still run. `success` is true when at least one
 * slot produced durable output (completed or reused).
 */
export async function orchestrateModelCalls(
  params: OrchestrateParams
): Promise<OrchestrationResult> {
  const startedAt = Date.now();
  const { specs, basePrompt, context } = params;
  const mode = params.mode;
  const probe = params.isCancelled ?? executionStatusProbe(context.executionId);
  const results: ModelCallResult[] = new Array(specs.length);

  if (mode === 'SEQUENTIAL') {
    const completedSoFar: ModelCallResult[] = [];
    for (let i = 0; i < specs.length; i++) {
      if (await probe()) {
        results[i] = {
          configuredProvider: specs[i].provider,
          configuredModel: specs[i].model,
          role: specs[i].role,
          status: 'SKIPPED_CANCELLED',
        };
        continue;
      }
      const prompt = chainPrompt(basePrompt, specs[i], completedSoFar);
      results[i] = await executeOneModelCall(specs[i], prompt, context);
      if (results[i].status === 'COMPLETED' || results[i].status === 'REUSED') {
        completedSoFar.push(results[i]);
      }
    }
  } else {
    // PARALLEL — bounded worker pool over the slot queue (cursor pattern).
    // Workers NEVER reject: every slot's error is captured in its result.
    const concurrency = Math.min(
      Math.max(params.concurrencyLimit ?? DEFAULT_CONCURRENCY, 1),
      MAX_CONCURRENCY,
      Math.max(specs.length, 1)
    );
    let cursor = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (cursor < specs.length) {
        const idx = cursor++;
        if (await probe()) {
          results[idx] = {
            configuredProvider: specs[idx].provider,
            configuredModel: specs[idx].model,
            role: specs[idx].role,
            status: 'SKIPPED_CANCELLED',
          };
          continue;
        }
        results[idx] = await executeOneModelCall(specs[idx], basePrompt, context);
      }
    });
    await Promise.all(workers);
  }

  return aggregate(results, mode, startedAt);
}

/** SEQUENTIAL chaining: append completed predecessors' outputs as context. */
function chainPrompt(
  basePrompt: string,
  spec: ModelCallSpec,
  completed: ModelCallResult[]
): string {
  if (spec.includePreviousOutput === false) return basePrompt;
  const withContent = completed.filter((r) => r.content && r.content.trim().length > 0);
  if (withContent.length === 0) return basePrompt;
  const chainBlock = withContent
    .map(
      (r) =>
        `--- [${r.role ?? r.configuredModel ?? r.model ?? 'model'} output] ---\n${r.content}`
    )
    .join('\n');
  return `${basePrompt}\n\nPrevious model outputs in this step (use as context; do not repeat verbatim):\n${chainBlock}`;
}

/**
 * Execute ONE model slot with full Phase 26 semantics:
 * idempotency → durable tracking → routed invocation → isolation.
 */
async function executeOneModelCall(
  spec: ModelCallSpec,
  prompt: string,
  context: OrchestrationContext
): Promise<ModelCallResult> {
  const invocationKey = computeInvocationKey({
    executionId: context.executionId,
    leadId: context.leadId,
    stepName: context.stepName,
    provider: spec.provider,
    model: spec.model,
  });

  // ── Idempotency read: a durably completed slot is REUSED, never re-run ──
  let existing: Awaited<ReturnType<typeof findInvocationByKey>> = null;
  try {
    existing = await findInvocationByKey(invocationKey);
  } catch {
    existing = null; // tracking is best-effort; degrade to no dedup
  }

  if (existing && existing.status === 'COMPLETED') {
    let cached: { content?: string } = {};
    try {
      cached = existing.result ? JSON.parse(existing.result) : {};
    } catch {
      cached = {};
    }
    void logExecutionActivity({
      runId: context.runId ?? undefined,
      executionId: context.executionId,
      leadId: context.leadId ?? undefined,
      eventType: 'MODEL_COMPLETED',
      detail: JSON.stringify({
        reused: true,
        invocationKey,
        provider: existing.provider,
        model: existing.model,
      }),
      userId: context.userId,
    }).catch(() => {});
    return {
      configuredProvider: spec.provider,
      configuredModel: spec.model,
      role: spec.role,
      provider: existing.provider,
      model: existing.model,
      status: 'REUSED',
      content: cached.content ?? '',
      fromCache: true,
      invocationId: existing.id,
      durationMs: 0,
    };
  }

  // ── Durable tracking: open (or reopen) the invocation row ──
  let invocationId: string | null = null;
  try {
    if (existing) {
      const reopened = await reopenInvocationForRetry(
        existing.id,
        (existing.attempt ?? 0) + 1
      );
      invocationId = reopened.id;
    } else {
      const created = await createRunningInvocation({
        invocationKey,
        executionId: context.executionId,
        runId: context.runId ?? null,
        leadId: context.leadId ?? null,
        stepName: context.stepName,
        actionType: context.actionType,
        provider: spec.provider ?? 'env-default',
        model: spec.model ?? 'default',
        role: spec.role ?? null,
        userId: context.userId,
      });
      invocationId = created.id;
    }
  } catch {
    // Unique-constraint race (concurrent duplicate) or DB hiccup:
    // proceed WITHOUT durable tracking — execution must not stall.
    invocationId = null;
  }

  void logExecutionActivity({
    runId: context.runId ?? undefined,
    executionId: context.executionId,
    leadId: context.leadId ?? undefined,
    eventType: 'MODEL_STARTED',
    detail: JSON.stringify({
      invocationKey,
      provider: spec.provider ?? 'env-default',
      model: spec.model ?? 'default',
      role: spec.role ?? null,
      attempt: existing ? (existing.attempt ?? 0) + 1 : 0,
    }),
    userId: context.userId,
  }).catch(() => {});

  // ── Routed invocation through the canonical provider abstraction ──
  const slotStart = Date.now();
  try {
    const completion = await withAiRateLimitRetry(() =>
      executeAICompletion(
        {
          messages: [{ role: 'user', content: prompt }],
          config: {
            provider: spec.provider as AIProviderConfig['provider'] | undefined,
            model: spec.model,
          },
        },
        context.userId,
        context.actionType
      )
    );

    if (!completion.success || !completion.content) {
      throw new Error(completion.error || `Provider returned empty content`);
    }

    const durationMs = completion.latencyMs || Date.now() - slotStart;

    if (invocationId) {
      try {
        await completeInvocation(invocationId, {
          provider: completion.provider,
          model: completion.model,
          content: completion.content,
          tokensUsed: completion.tokensUsed,
          retries: completion.retries,
        });
      } catch {
        /* best-effort tracking */
      }
    }

    void logExecutionActivity({
      runId: context.runId ?? undefined,
      executionId: context.executionId,
      leadId: context.leadId ?? undefined,
      eventType: 'MODEL_COMPLETED',
      detail: JSON.stringify({
        invocationKey,
        provider: completion.provider,
        model: completion.model,
        durationMs,
        tokensUsed: completion.tokensUsed,
        retries: completion.retries,
      }),
      userId: context.userId,
    }).catch(() => {});

    return {
      configuredProvider: spec.provider,
      configuredModel: spec.model,
      role: spec.role,
      provider: completion.provider,
      model: completion.model,
      status: 'COMPLETED',
      content: completion.content,
      durationMs,
      tokensUsed: completion.tokensUsed,
      retries: completion.retries,
      invocationId: invocationId ?? undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (invocationId) {
      try {
        await failInvocation(invocationId, message);
      } catch {
        /* best-effort tracking */
      }
    }

    void logExecutionActivity({
      runId: context.runId ?? undefined,
      executionId: context.executionId,
      leadId: context.leadId ?? undefined,
      eventType: 'MODEL_FAILED',
      detail: JSON.stringify({
        invocationKey,
        provider: spec.provider ?? 'env-default',
        model: spec.model ?? 'default',
        error: message.slice(0, 500),
      }),
      userId: context.userId,
    }).catch(() => {});

    return {
      configuredProvider: spec.provider,
      configuredModel: spec.model,
      role: spec.role,
      provider: spec.provider,
      model: spec.model,
      status: 'FAILED',
      error: message,
      durationMs: Date.now() - slotStart,
      invocationId: invocationId ?? undefined,
    };
  }
}

/** Aggregate slot results into the step-level OrchestrationResult. */
function aggregate(
  results: ModelCallResult[],
  mode: OrchestrationMode,
  startedAt: number
): OrchestrationResult {
  const completed = results.filter((r) => r.status === 'COMPLETED' || r.status === 'REUSED');
  const failed = results.filter((r) => r.status === 'FAILED');
  const cancelled = results.filter((r) => r.status === 'SKIPPED_CANCELLED');
  const primary = completed[0];

  // Workstream 3 — model disagreement detection. Only assessed when 2+
  // slots produced durable output. Single-slot steps (the overwhelming
  // majority) skip this entirely (no disagreement is possible).
  const disagreement = completed.length >= 2
    ? detectDisagreement(completed)
    : undefined;

  return {
    success: completed.length > 0,
    mode,
    primaryContent: primary?.content ?? '',
    primaryProvider: primary?.provider,
    primaryModel: primary?.model,
    models: results,
    summary: {
      mode,
      total: results.length,
      completed: completed.length,
      failed: failed.length,
      reused: results.filter((r) => r.status === 'REUSED').length,
      cancelled: cancelled.length,
      durationMs: Date.now() - startedAt,
    },
    error:
      completed.length === 0 && failed.length > 0
        ? failed.map((f) => f.error ?? 'unknown error').join('; ')
        : undefined,
    disagreement,
  };
}

/**
 * Workstream 3 — detect material disagreement between completed model slots.
 *
 * Uses word-level Jaccard similarity (token-set overlap). This is a
 * deliberately SIMPLE, deterministic metric — it does NOT attempt semantic
 * understanding. The goal is to surface MATERIAL disagreement (two models
 * giving clearly different answers) so the caller can seek more evidence
 * or escalate, rather than arbitrarily picking one.
 *
 * Threshold: 0.30 (configurable). Below this, the outputs share fewer than
 * 30% of their unique words — material disagreement. The caller should:
 *   1. inspect evidence (the model outputs themselves)
 *   2. determine whether additional research is required
 *   3. retrieve additional evidence if permitted
 *   4. rerun/evaluate
 *   5. update confidence
 *   6. continue only when decision quality is sufficient
 *   7. escalate if uncertainty remains materially high
 *
 * When models agree (similarity >= threshold), `detected=false` and the
 * existing behavior (primary = first completed slot) is unchanged.
 */
const DISAGREEMENT_THRESHOLD = 0.30;

/**
 * Tokenize a model output into a lowercase word set for Jaccard comparison.
 * Strips punctuation, collapses whitespace, ignores empty tokens.
 */
function tokenize(text: string): Set<string> {
  if (!text || typeof text !== 'string') return new Set();
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0)
  );
}

/**
 * Compute Jaccard similarity between two texts: |A∩B| / |A∪B|.
 * Returns 1.0 for identical sets, 0.0 for disjoint sets.
 */
function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1.0 : intersection / union;
}

/**
 * Assess disagreement across all completed model slots.
 * Returns the min + mean pairwise similarity + a recommendation.
 */
export function detectDisagreement(
  completed: ModelCallResult[]
): DisagreementAssessment {
  const contents = completed
    .map((r) => r.content ?? '')
    .filter((c) => c.trim().length > 0);

  // If only one slot has non-empty content, no disagreement is possible.
  if (contents.length < 2) {
    return {
      detected: false,
      minSimilarity: 1.0,
      meanSimilarity: 1.0,
      recommendation: 'accept',
      reason: 'Only one slot produced non-empty content — no disagreement possible.',
    };
  }

  // Compute all pairwise similarities.
  const similarities: number[] = [];
  for (let i = 0; i < contents.length; i++) {
    for (let j = i + 1; j < contents.length; j++) {
      similarities.push(jaccardSimilarity(contents[i], contents[j]));
    }
  }

  const minSimilarity = Math.min(...similarities);
  const meanSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  const detected = minSimilarity < DISAGREEMENT_THRESHOLD;

  let recommendation: DisagreementAssessment['recommendation'] = 'accept';
  let reason = `Models agree (min similarity ${minSimilarity.toFixed(2)} >= ${DISAGREEMENT_THRESHOLD}).`;

  if (detected) {
    // Determine severity: very low similarity → escalate; moderate → seek evidence.
    if (minSimilarity < 0.10) {
      recommendation = 'escalate';
      reason = `Material disagreement detected (min similarity ${minSimilarity.toFixed(2)} < 0.10). Models gave fundamentally different answers. Escalate to human review.`;
    } else {
      recommendation = 'seek_evidence';
      reason = `Material disagreement detected (min similarity ${minSimilarity.toFixed(2)} < ${DISAGREEMENT_THRESHOLD}). Seek additional evidence before deciding.`;
    }
  }

  return {
    detected,
    minSimilarity: Math.round(minSimilarity * 100) / 100,
    meanSimilarity: Math.round(meanSimilarity * 100) / 100,
    recommendation,
    reason,
  };
}

// ===== WORKFLOW-ACTION ENTRY POINT =====

/**
 * Convenience wrapper for workflow AI actions: parses the step config,
 * picks the orchestration mode, and executes. Single-model steps (the
 * overwhelming majority) take the same path with one spec — identical
 * observable behavior to the legacy single call, but properly routed.
 */
export async function orchestrateAIAction(params: {
  actionType: string;
  basePrompt: string;
  config: Record<string, unknown>;
  context: {
    executionId: string;
    workflowId?: string;
    runId?: string;
    leadId?: string | null;
    stepName?: string;
    userId: string;
  };
  isCancelled?: () => Promise<boolean>;
}): Promise<OrchestrationResult> {
  // Phase 26 v3 — Decision 4: connect the Workflow Builder UI to the
  // existing orchestrator. The UI saves the AI step config as a JSON
  // string in config.aiConfig (because WorkflowNode.config is
  // Record<string,string>). Parse it here and merge its fields into
  // the config so buildModelCallSpecs + parseOrchestrationMode +
  // parseConcurrencyLimit see them. The aiConfig fields OVERRIDE any
  // flat config fields (the UI is the source of truth for AI routing).
  const mergedConfig: Record<string, unknown> = { ...params.config };
  const aiConfigRaw = params.config?.aiConfig;
  if (typeof aiConfigRaw === 'string' && aiConfigRaw.trim().length > 0) {
    try {
      const parsed = JSON.parse(aiConfigRaw);
      if (parsed && typeof parsed === 'object') {
        // Spread the aiConfig fields — overrides any flat config values.
        // The orchestrator reads: provider, model, models, orchestration,
        // concurrency, fallback, temperature.
        Object.assign(mergedConfig, parsed);
      }
    } catch (err) {
      console.warn('[orchestrateAIAction] failed to parse config.aiConfig:', err instanceof Error ? err.message : String(err));
    }
  }
  return orchestrateModelCalls({
    specs: buildModelCallSpecs(mergedConfig),
    mode: parseOrchestrationMode(mergedConfig),
    concurrencyLimit: parseConcurrencyLimit(mergedConfig),
    basePrompt: params.basePrompt,
    context: {
      executionId: params.context.executionId,
      workflowId: params.context.workflowId,
      runId: params.context.runId,
      leadId: params.context.leadId ?? null,
      stepName: params.context.stepName ?? params.actionType,
      userId: params.context.userId,
      actionType: params.actionType,
    },
    isCancelled: params.isCancelled,
  });
}
