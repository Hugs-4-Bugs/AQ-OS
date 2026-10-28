// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 1 — Retry Policy
//
// Error classification for durable autonomous execution.
//
// Every failure is bucketed into one of three categories:
//   · retryable      — transient; safe to retry with backoff
//   · permanent      — config/credential/provider issue; will not
//                      succeed on retry → BLOCKED + notify
//   · human_required — needs user decision (approval / reconnect /
//                      clarification) → PAUSED + escalate
//
// Backoff: exponential with jitter, capped at 5 minutes per step.
// ═══════════════════════════════════════════════════════════════════

export type ErrorCategory = 'retryable' | 'permanent' | 'human_required';

export interface RetryDecision {
  category: ErrorCategory;
  /** Milliseconds to wait before the next attempt. 0 when terminal. */
  backoffMs: number;
  /** True if the caller should retry now (after the backoff). */
  shouldRetry: boolean;
  /** True if execution should transition to BLOCKED. */
  shouldBlock: boolean;
  /** True if execution should transition to PAUSED awaiting human input. */
  shouldPause: boolean;
  /** Human-readable reason persisted on the run/checkpoint. */
  reason: string;
}

const DEFAULT_MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 5 * 60 * 1000; // 5 min cap
const BASE_BACKOFF_MS = 5_000; // 5 s base

// ── Heuristics ──────────────────────────────────────────────────────

const RETRYABLE_PATTERNS: RegExp[] = [
  /timeout/i,
  /etimedout/i,
  /econnreset/i,
  /econnrefused/i,
  /enotfound/i,
  /eai_again/i,
  /socket hang up/i,
  /network error/i,
  /temporarily/i,
  /rate.?limit/i,
  /429/,
  /502|503|504/,
  /service unavailable/i,
  /internal server error/i,
  /database is locked/i,
  /sqlite_busy/i,
  /worker crash/i,
  /aborted/i,
  /fetch failed/i,
];

const PERMANENT_PATTERNS: RegExp[] = [
  /invalid credentials/i,
  /invalid api key/i,
  /unauthorized/i,
  /forbidden/i,
  /401|403/,
  /unsupported provider/i,
  /unsupported model/i,
  /invalid configuration/i,
  /invalid request/i,
  /schema validation/i,
  /malformed/i,
  /not found/i,
  /does not exist/i,
  /unknown agent/i,
];

const HUMAN_REQUIRED_PATTERNS: RegExp[] = [
  /approval required/i,
  /approval needed/i,
  /permission denied/i,
  /insufficient permission/i,
  /reconnect required/i,
  /reconnect account/i,
  /account disconnected/i,
  /account revoked/i,
  /clarification required/i,
  /ambiguous/i,
  /sensitive decision/i,
];

/**
 * Classify an error into one of three durable-execution categories.
 * Pure function — safe to call from tests, no DB writes.
 */
export function classifyError(error: unknown): ErrorCategory {
  if (!error) return 'retryable';
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);

  if (HUMAN_REQUIRED_PATTERNS.some((re) => re.test(message))) {
    return 'human_required';
  }
  if (PERMANENT_PATTERNS.some((re) => re.test(message))) {
    return 'permanent';
  }
  if (RETRYABLE_PATTERNS.some((re) => re.test(message))) {
    return 'retryable';
  }
  // Default to retryable — never silently mark an unknown error as permanent.
  // This avoids accidentally blocking execution on a transient issue we
  // haven't seen before. Permanent classification should be intentional
  // and pattern-driven.
  return 'retryable';
}

/**
 * Compute the exponential-with-jitter backoff for a retryable failure.
 *
 *   attempt 0 → ~5 s
 *   attempt 1 → ~10 s
 *   attempt 2 → ~20 s
 *   ...capped at 5 minutes
 *
 * The jitter is ±25% to decorrelate concurrent workers retrying at the
 * same cadence.
 */
export function computeBackoffMs(attemptNumber: number): number {
  const base = BASE_BACKOFF_MS * Math.pow(2, Math.max(0, attemptNumber));
  const jitter = 1 + (Math.random() - 0.5) * 0.5; // 0.75 .. 1.25
  return Math.min(MAX_BACKOFF_MS, Math.round(base * jitter));
}

/**
 * Top-level retry decision for an invocation step.
 *
 * Caller passes: the error, the current retry count, and the max-retries
 * ceiling (default 3). Returns the bucket + backoff + next-state hint.
 */
export function decideRetry(input: {
  error: unknown;
  retryCount: number;
  maxRetries?: number;
  stepKey?: string;
}): RetryDecision {
  const max = input.maxRetries ?? DEFAULT_MAX_RETRIES;
  const category = classifyError(input.error);
  const message =
    typeof input.error === 'string'
      ? input.error
      : input.error instanceof Error
        ? input.error.message
        : String(input.error);

  if (category === 'permanent') {
    return {
      category: 'permanent',
      backoffMs: 0,
      shouldRetry: false,
      shouldBlock: true,
      shouldPause: false,
      reason: `Permanent failure (${input.stepKey ? input.stepKey + ': ' : ''}${message})`,
    };
  }

  if (category === 'human_required') {
    return {
      category: 'human_required',
      backoffMs: 0,
      shouldRetry: false,
      shouldBlock: false,
      shouldPause: true,
      reason: `Human intervention required (${input.stepKey ? input.stepKey + ': ' : ''}${message})`,
    };
  }

  // Retryable — check budget.
  if (input.retryCount >= max) {
    // Exhausted retries → escalate to human_required (permanent would be
    // misleading — the underlying issue may be transient, just out of budget).
    return {
      category: 'human_required',
      backoffMs: 0,
      shouldRetry: false,
      shouldBlock: false,
      shouldPause: true,
      reason: `Retryable failure exhausted ${max} attempts (${input.stepKey ? input.stepKey + ': ' : ''}${message})`,
    };
  }

  const backoffMs = computeBackoffMs(input.retryCount);
  return {
    category: 'retryable',
    backoffMs,
    shouldRetry: true,
    shouldBlock: false,
    shouldPause: false,
    reason: `Retryable failure, attempt ${input.retryCount + 1}/${max} in ${backoffMs}ms (${input.stepKey ? input.stepKey + ': ' : ''}${message})`,
  };
}

export const __part1RetryPolicyInternal = {
  RETRYABLE_PATTERNS,
  PERMANENT_PATTERNS,
  HUMAN_REQUIRED_PATTERNS,
  DEFAULT_MAX_RETRIES,
  MAX_BACKOFF_MS,
  BASE_BACKOFF_MS,
  computeBackoffMs,
  classifyError,
  decideRetry,
};
