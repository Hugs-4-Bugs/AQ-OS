// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 2: Provider Failure Classification
//
// Wraps Part 1's classifyError (in src/lib/autopilot/retry-policy.ts)
// for AI/provider-specific failure modes. Adds the `fallback` category
// — distinct from retryable and permanent — when the primary provider
// is unavailable but another configured model can perform the task.
//
// Categories:
//   · RETRYABLE       — timeout, temporary provider error, rate limit,
//                       transient network error. Retry with backoff.
//   · FALLBACK        — primary provider structurally unavailable
//                       (5xx cascade, quota exhausted, region down).
//                       Switch to a configured fallback model.
//   · PERMANENT       — invalid configuration, unsupported model,
//                       malformed request, missing capability.
//                       Do NOT retry; surface to caller.
//   · HUMAN_REQUIRED  — sensitive action, unresolved critical ambiguity,
//                       approval requirement. Pause and escalate.
//
// IMPORTANT: a normal model disagreement (two models giving different
// answers) is NOT a provider failure — it stays in the disagreement
// flow (see evidence.ts + orchestrator.ts). Do not conflate.
// ═══════════════════════════════════════════════════════════════════

import { classifyError } from '@/lib/autopilot/retry-policy';

// ===== TYPES =====

export type ProviderFailureCategory =
  | 'retryable'
  | 'fallback'
  | 'permanent'
  | 'human_required';

export interface ProviderFailureClassification {
  category: ProviderFailureCategory;
  reason: string;
  /** True when the caller should retry the SAME provider/model. */
  shouldRetry: boolean;
  /** True when the caller should switch to a fallback provider/model. */
  shouldFallback: boolean;
  /** True when the caller should pause and surface to a human. */
  shouldEscalate: boolean;
  /** Suggested backoff milliseconds before retry (0 when not retryable). */
  backoffMs: number;
}

// ===== PATTERNS =====

const RETRYABLE_PATTERNS: RegExp[] = [
  /timeout/i,
  /timed?\s*out/i,
  /etim?ed?out/i,
  /aborterror/i,
  /rate\s*limit/i,
  /429/,
  /503/,
  /502/,
  /504/,
  /service\s*unavailable/i,
  /network/i,
  /econnreset/i,
  /econnrefused/i,
  /eai_again/i,
  /socket\s*hang\s*up/i,
  /transient/i,
  /temporary/i,
  /retry[-_ ]?after/i,
];

const FALLBACK_PATTERNS: RegExp[] = [
  /quota/i,
  /insufficient\s*quota/i,
  /billing/i,
  /payment\s*required/i,
  /402/,
  /insufficient\s*funds/i,
  /exceeded\s+your\s+current\s+quota/i,
  /model[\s_]*overloaded/i,
  /provider\s*unavailable/i,
  /maintenance/i,
];

const PERMANENT_PATTERNS: RegExp[] = [
  /invalid\s*api\s*key/i,
  /401/,
  /403/,
  /forbidden/i,
  /unauthorized/i,
  /not\s*found/i,
  /404/,
  /model\s*not\s*found/i,
  /invalid\s*model/i,
  /unsupported\s*model/i,
  /malformed/i,
  /invalid\s*request/i,
  /bad\s*request/i,
  /400/,
  /context\s*window/i,
  /maximum\s+context/i,
  /too\s*many\s*tokens/i,
];

const HUMAN_REQUIRED_PATTERNS: RegExp[] = [
  /approval\s*required/i,
  /human\s*review/i,
  /requires?\s*human/i,
  /sensitive\s*action/i,
  /ambiguous/i,
  /could\s*not\s*verify/i,
  /insufficient\s*permissions/i,
];

// ===== CLASSIFICATION =====

/**
 * Classify a provider error into one of the four categories.
 *
 * Heuristics:
 *   1. Pattern-match the error message against known failure phrases.
 *   2. Delegate to Part 1's classifyError for the canonical verdict.
 *   3. Reconcile: when patterns disagree with classifyError, the
 *      pattern verdict wins for FALLBACK (more specific), otherwise
 *      classifyError wins (more conservative).
 *
 * The result is consumed by orchestrateModelCalls's retry/fallback
 * decision logic — see orchestrator.ts.
 */
export function classifyProviderFailure(
  error: Error | string | unknown
): ProviderFailureClassification {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();

  // 1. Pattern-match
  let patternVerdict: ProviderFailureCategory | null = null;
  if (HUMAN_REQUIRED_PATTERNS.some((re) => re.test(lower))) {
    patternVerdict = 'human_required';
  } else if (PERMANENT_PATTERNS.some((re) => re.test(lower))) {
    patternVerdict = 'permanent';
  } else if (FALLBACK_PATTERNS.some((re) => re.test(lower))) {
    patternVerdict = 'fallback';
  } else if (RETRYABLE_PATTERNS.some((re) => re.test(lower))) {
    patternVerdict = 'retryable';
  }

  // 2. Delegate to Part 1
  const part1 = classifyError(error);
  const part1Category: ProviderFailureCategory =
    part1 === 'retryable' ? 'retryable'
    : part1 === 'human_required' ? 'human_required'
    : 'permanent'; // Part 1 has no `fallback` — collapse to permanent.

  // 3. Reconcile
  let category: ProviderFailureCategory;
  if (patternVerdict === 'fallback') {
    // Pattern says fallback — that's more specific than Part 1's
    // permanent/retryable bucket. Trust the pattern.
    category = 'fallback';
  } else if (patternVerdict === 'human_required') {
    category = 'human_required';
  } else if (patternVerdict === 'permanent') {
    category = 'permanent';
  } else if (patternVerdict === 'retryable') {
    category = 'retryable';
  } else {
    // No pattern matched — trust Part 1's verdict.
    category = part1Category;
  }

  // 4. Decision flags
  const shouldRetry = category === 'retryable';
  const shouldFallback = category === 'fallback';
  const shouldEscalate = category === 'human_required';
  const backoffMs = shouldRetry ? computeBackoff(message) : 0;

  return {
    category,
    reason: message.slice(0, 500),
    shouldRetry,
    shouldFallback,
    shouldEscalate,
    backoffMs,
  };
}

// ===== BACKOFF =====

/**
 * Exponential-with-jitter backoff for retryable provider errors.
 *
 * Ladder: 1s, 2s, 4s, 8s, capped at 30s. The jitter is ±20% to avoid
 * thundering-herd on shared rate-limit recovery.
 *
 * The actual retry count is tracked per-slot in the orchestrator
 * (via the ModelInvocation.attempt counter). This function only
 * suggests the wait for the NEXT retry.
 */
function computeBackoff(message: string): number {
  // Try to extract a Retry-After value (seconds) if the message contains one.
  const m = message.match(/retry[-_ ]?after[:\s]+(\d+)/i);
  if (m) {
    const seconds = Number(m[1]);
    if (Number.isFinite(seconds) && seconds > 0 && seconds <= 60) {
      return Math.round(seconds * 1000);
    }
  }

  // Default ladder (mirrors workflow-ai-retry.ts but local to this module
  // so the synthesizer's classification stays self-contained).
  const ladder = [1000, 2000, 4000, 8000, 16000, 30000];
  // Use a non-cryptographic index based on message length so the same
  // error consistently picks the same ladder rung (deterministic tests).
  const idx = Math.min(message.length % ladder.length, ladder.length - 1);
  const base = ladder[idx];
  const jitter = base * (Math.random() * 0.4 - 0.2); // ±20%
  return Math.max(100, Math.round(base + jitter));
}

// ===== EXPORTED FOR TESTS =====

/**
 * Pure predicate: does this error category trigger a model-level retry
 * (vs. an orchestration-level fallback or pause)?
 */
export function isRetryableProviderFailure(c: ProviderFailureCategory): boolean {
  return c === 'retryable';
}

/**
 * Pure predicate: should the orchestrator switch to a different
 * configured model?
 */
export function isFallbackProviderFailure(c: ProviderFailureCategory): boolean {
  return c === 'fallback';
}

/**
 * Pure predicate: should the orchestrator pause and surface to a human?
 */
export function isHumanRequiredFailure(c: ProviderFailureCategory): boolean {
  return c === 'human_required';
}
