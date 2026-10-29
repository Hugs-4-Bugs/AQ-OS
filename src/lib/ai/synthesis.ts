// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 2: Synthesis Stage
//
// When a PARALLEL orchestration produces 2+ model results and the
// disagreement detector flags them as disagreeing, a Synthesizer model
// runs to produce a single authoritative StructuredEvidence.
//
// The synthesizer has access to every independent model output and its
// extracted evidence. It must:
//   · preserve all independent results in the durable record
//   · identify the disagreement and its cause
//   · attempt verification when external evidence is available
//   · otherwise lower confidence
//   · emit a final structured result with explicit limitations
//
// The synthesis invocation itself is durable: it persists via the same
// ModelInvocation table used by every other model slot, keyed on
// `synthesizer` role so it deduplicates on retry/resume.
//
// If the synthesizer fails, the independent model results REMAIN
// persisted (their ModelInvocation rows are not rolled back). The
// caller receives the best-available primaryContent + a flag noting
// that synthesis failed.
// ═══════════════════════════════════════════════════════════════════

import { executeAICompletion, type AIProviderConfig } from '@/lib/ai/ai-provider';
import { withAiRateLimitRetry } from '@/lib/workflow-ai-retry';
import { logExecutionActivity } from '@/lib/execution-activity';
import {
  findInvocationByKey,
  createRunningInvocation,
  reopenInvocationForRetry,
  completeInvocation,
  failInvocation,
} from '@/lib/model-invocation';
import {
  computeInvocationKey,
  type ModelCallResult,
  type OrchestrationContext,
} from '@/lib/ai/orchestrator';
import {
  extractEvidenceFromContent,
  mergeEvidence,
  type StructuredEvidence,
} from '@/lib/ai/evidence';

// ===== TYPES =====

export interface SynthesisInput {
  /** Completed (or REUSED) model results from the parallel phase. */
  results: ModelCallResult[];
  /** The disagreement assessment that triggered synthesis (optional —
   *  synthesis can run whenever 2+ models completed, even on agreement,
   *  to produce a unified view). */
  disagreementReason?: string;
  /** Provider/model override for the synthesizer. Defaults to env chain. */
  synthesizerProvider?: string;
  synthesizerModel?: string;
  /** Context inherited from the parent orchestration. */
  context: OrchestrationContext;
}

export interface SynthesisOutput {
  /** True if the synthesizer produced durable output. False if it
   *  failed or was skipped. */
  success: boolean;
  /** The synthesized evidence — the canonical result of the
   *  orchestration. When success=false, this falls back to a merge
   *  of the input evidence with the synthesizer's failure noted as
   *  a limitation. */
  evidence: StructuredEvidence;
  /** The synthesizer model's raw content (for audit). */
  content?: string;
  /** Synthesizer invocation id (for traceability). */
  invocationId?: string;
  /** Whether the synthesizer was reused from a prior durable call. */
  reused: boolean;
  /** Error message if synthesis failed. */
  error?: string;
}

// ===== ENTRY POINT =====

/**
 * Run the synthesis stage. Idempotent — re-running with the same
 * inputs reuses the durably COMPLETED synthesizer invocation.
 *
 * The synthesizer prompt is built from the parallel results: each
 * model's role + content + extracted evidence is provided as context,
 * and the synthesizer is asked to emit a unified JSON evidence object.
 */
export async function synthesizeResults(
  input: SynthesisInput
): Promise<SynthesisOutput> {
  const { results, context } = input;
  const completed = results.filter((r) => r.status === 'COMPLETED' || r.status === 'REUSED');

  if (completed.length === 0) {
    return {
      success: false,
      evidence: emptySynthesisWithLimitation(
        'No completed model results to synthesize — all parallel slots failed.'
      ),
      reused: false,
      error: 'no completed model results',
    };
  }

  if (completed.length === 1) {
    // Single-model "parallel" — no synthesis needed. Just extract
    // evidence from the lone completed slot.
    const only = completed[0];
    const evidence = extractEvidenceFromContent(only.content ?? '', {
      role: only.role ?? 'analyst',
      modelProvider: only.provider,
      modelId: only.model,
    });
    return {
      success: true,
      evidence,
      content: only.content,
      reused: true,
    };
  }

  // Build the synthesizer prompt
  const prompt = buildSynthesizerPrompt(completed, input.disagreementReason);
  const invocationKey = computeInvocationKey({
    executionId: context.executionId,
    leadId: context.leadId,
    stepName: context.stepName,
    provider: input.synthesizerProvider,
    model: input.synthesizerModel,
    role: 'synthesizer',
  });

  // Idempotency: reuse durable COMPLETED synthesizer call
  let existing: Awaited<ReturnType<typeof findInvocationByKey>> = null;
  try {
    existing = await findInvocationByKey(invocationKey);
  } catch {
    existing = null;
  }
  if (existing && existing.status === 'COMPLETED') {
    let cachedContent = '';
    try {
      cachedContent = existing.result
        ? JSON.parse(existing.result).content ?? ''
        : '';
    } catch {
      cachedContent = '';
    }
    const evidence = extractEvidenceFromContent(cachedContent, {
      role: 'synthesizer',
      modelProvider: existing.provider,
      modelId: existing.model,
    });
    return {
      success: true,
      evidence,
      content: cachedContent,
      invocationId: existing.id,
      reused: true,
    };
  }

  // Open (or reopen) durable invocation
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
        provider: input.synthesizerProvider ?? 'env-default',
        model: input.synthesizerModel ?? 'default',
        role: 'synthesizer',
        userId: context.userId,
      });
      invocationId = created.id;
    }
  } catch {
    invocationId = null; // best-effort durability
  }

  void logExecutionActivity({
    runId: context.runId ?? undefined,
    executionId: context.executionId,
    leadId: context.leadId ?? undefined,
    eventType: 'MODEL_STARTED',
    detail: JSON.stringify({
      invocationKey,
      role: 'synthesizer',
      provider: input.synthesizerProvider ?? 'env-default',
      model: input.synthesizerModel ?? 'default',
      synthesizing: completed.length,
      attempt: existing ? (existing.attempt ?? 0) + 1 : 0,
    }),
    userId: context.userId,
  }).catch(() => {});

  // Invoke synthesizer through the canonical provider abstraction
  try {
    const completion = await withAiRateLimitRetry(() =>
      executeAICompletion(
        {
          messages: [{ role: 'user', content: prompt }],
          config: {
            provider:
              input.synthesizerProvider as AIProviderConfig['provider'] | undefined,
            model: input.synthesizerModel,
          },
        },
        context.userId,
        context.actionType
      )
    );

    if (!completion.success || !completion.content) {
      throw new Error(completion.error || 'Synthesizer returned empty content');
    }

    // Persist success
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
        /* best-effort */
      }
    }

    void logExecutionActivity({
      runId: context.runId ?? undefined,
      executionId: context.executionId,
      leadId: context.leadId ?? undefined,
      eventType: 'MODEL_COMPLETED',
      detail: JSON.stringify({
        invocationKey,
        role: 'synthesizer',
        provider: completion.provider,
        model: completion.model,
        tokensUsed: completion.tokensUsed,
        retries: completion.retries,
      }),
      userId: context.userId,
    }).catch(() => {});

    const evidence = extractEvidenceFromContent(completion.content, {
      role: 'synthesizer',
      modelProvider: completion.provider,
      modelId: completion.model,
    });
    return {
      success: true,
      evidence,
      content: completion.content,
      invocationId: invocationId ?? undefined,
      reused: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (invocationId) {
      try {
        await failInvocation(invocationId, message);
      } catch {
        /* best-effort */
      }
    }
    void logExecutionActivity({
      runId: context.runId ?? undefined,
      executionId: context.executionId,
      leadId: context.leadId ?? undefined,
      eventType: 'MODEL_FAILED',
      detail: JSON.stringify({
        invocationKey,
        role: 'synthesizer',
        error: message.slice(0, 500),
      }),
      userId: context.userId,
    }).catch(() => {});

    // Synthesis failed — preserve independent results with a limitation
    const mergedInputs = completed.map((r) =>
      extractEvidenceFromContent(r.content ?? '', {
        role: r.role ?? 'analyst',
        modelProvider: r.provider,
        modelId: r.model,
      })
    );
    const fallbackEvidence = mergeEvidence(mergedInputs);
    fallbackEvidence.limitations.push(
      `Synthesizer model failed: ${message.slice(0, 200)}. Independent results preserved with reduced confidence.`
    );
    fallbackEvidence.confidence = Math.max(0, fallbackEvidence.confidence - 0.2);
    return {
      success: false,
      evidence: fallbackEvidence,
      reused: false,
      error: message,
    };
  }
}

// ===== SYNTHESIZER PROMPT =====

/**
 * Build the prompt for the synthesizer model.
 *
 * Each parallel result is presented with its role + raw content + the
 * extracted evidence. The synthesizer is asked to:
 *   1. Identify the points of agreement and disagreement.
 *   2. Emit a unified JSON evidence object with explicit limitations.
 *   3. Set confidence conservatively (lower than the max of inputs).
 */
function buildSynthesizerPrompt(
  completed: ModelCallResult[],
  disagreementReason?: string
): string {
  const sections = completed.map((r, i) => {
    const evidence = extractEvidenceFromContent(r.content ?? '', {
      role: r.role ?? 'analyst',
      modelProvider: r.provider,
      modelId: r.model,
    });
    return `--- Model ${i + 1}: ${r.role ?? r.model ?? 'unknown'} (${r.provider ?? '?'}/${r.model ?? '?'}) ---
Raw output:
${(r.content ?? '').trim()}

Extracted evidence:
${JSON.stringify({ facts: evidence.facts, inferences: evidence.inferences, recommendations: evidence.recommendations, confidence: evidence.confidence, limitations: evidence.limitations }, null, 2)}`;
  }).join('\n\n');

  const disagreementNote = disagreementReason
    ? `\nDISAGREEMENT DETECTED: ${disagreementReason}\n`
    : '';

  return `You are the Synthesizer in a multi-model orchestration. Multiple models independently produced the following results for the same task. Your job is to produce ONE unified, evidence-first synthesis.

${disagreementNote}
${sections}

Synthesis requirements:
1. Identify facts that appear in MULTIPLE models — these are the most trustworthy.
2. Identify facts that appear in only ONE model — treat as candidate, lower confidence.
3. Identify explicit disagreements — note them as limitations.
4. Identify recommendations — preserve them but DO NOT auto-execute (caller will review).
5. Set confidence conservatively: 0.0 to 1.0, where 1.0 means all models fully agreed.

Return a single JSON object with this exact shape:
{
  "facts": ["..."],
  "evidence": ["..."],
  "inferences": ["..."],
  "recommendations": ["..."],
  "confidence": 0.0,
  "limitations": ["..."]
}`;
}

// ===== HELPERS =====

function emptySynthesisWithLimitation(reason: string): StructuredEvidence {
  return {
    facts: [],
    evidence: [],
    inferences: [],
    recommendations: [],
    confidence: 0,
    limitations: [reason],
    role: 'synthesizer',
    correlationId: `synth-failed-${Date.now()}`,
    timestamp: Date.now(),
  };
}
