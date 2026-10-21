// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Retry Classification & Backoff (Part 1)
//
// Shared reliability primitives for BOTH execution engines
// (workflow-engine.ts — the main engine — and workflow-executor.ts —
// the legacy/nodes engine used by autopilot). Pure functions only:
// this module is imported by server engines AND by client components
// (niche splitting), so it must never import server-only code.
//
// Part 1 goals implemented here:
//   • classifyStepError — retryable vs non-retryable error taxonomy,
//     including HTTP 429 / rate-limit detection with Retry-After hints.
//   • computeBackoffDelayMs — exponential backoff with FULL jitter
//     (AWS-style) so concurrent retries never synchronize into a stampede.
//   • splitNicheList — a niche target like "hospital, dentist" resolves
//     into distinct niches so every discovered lead keeps the niche that
//     actually produced it (never the comma-joined string).
// ═══════════════════════════════════════════════════════════════════

// ===== TYPES =====

export type StepErrorKind =
  | 'rate_limited' // 429 / quota — retryable, honors Retry-After
  | 'transient' // 5xx / network — retryable
  | 'timeout' // deadline exceeded — retryable (bounded)
  | 'permanent' // 4xx validation/auth/not-found — NOT retryable
  | 'business' // structured business states (no matching leads…) — NOT retryable
  | 'unknown'; // unrecognized — NOT retryable (never blindly re-run side effects)

export interface StepErrorClassification {
  retryable: boolean;
  kind: StepErrorKind;
  /** Server-provided retry delay hint (ms) when present (Retry-After style). */
  retryAfterMs?: number;
  /** Canonical structured business code when kind === 'business'. */
  code?: string;
}

// ===== ERROR CLASSIFICATION =====

/** Structured error shapes some actions already return (webhook statusCode etc.). */
interface StructuredErrorLike {
  statusCode?: number;
  status?: number;
  retryable?: boolean;
  retryAfterMs?: number;
  code?: string;
}

const RATE_LIMIT_RE =
  /\b(429|too many requests|rate[ -]?limit|rate-limited|quota exceeded|quota exhausted|daily quota|request limit reached)\b/i;
const RETRY_AFTER_RE = /retry[ -]?after[:\s]+(\d+)\s*(ms|s|sec|seconds)?/i;
const TRANSIENT_RE =
  /\b(500|502|503|504|internal server error|bad gateway|service unavailable|gateway timeout|service temporarily unavailable|temporarily unavailable|econnreset|econnrefused|econnaborted|etimedout|enotfound|eai_again|epipe|fetch failed|network error|network request failed|socket hang up|connection reset|connection refused|connection dropped|aborted|upstream error|overloaded)\b/i;
const TIMEOUT_RE =
  /\b(timeout|timed out|deadline exceeded|deadline reached|__wf_step_timeout__|execution timeout budget)\b/i;
const PERMANENT_RE =
  /\b(400|401|403|404|422|unauthorized|forbidden|not found|invalid api key|invalid_api_key|authentication|unauthenticated|permission denied|access denied|bad request|invalid request|validation failed|is required|must be|unsupported|unknown action type|malformed)\b/i;
const BUSINESS_RE =
  /\b(NO_MATCHING_LEADS|NO_LEADS_FOR_NICHE|NO_LEADS_FOR_QUERY|NO_LEADS_SELECTED|SUBSCRIPTION_PAUSED|PLAN_LEAD_LIMIT_EXCEEDED|WORKFLOW_INVALID)\b/;

/** Parse "retry after 30s" / "Retry-After: 5000ms" style hints into milliseconds. */
function parseRetryAfterMs(text: string): number | undefined {
  const m = RETRY_AFTER_RE.exec(text);
  if (!m) return undefined;
  const value = Number(m[1]);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const unit = (m[2] || 'ms').toLowerCase();
  return unit.startsWith('s') ? value * 1000 : value;
}

/**
 * Classify a step/action error for retry purposes.
 *
 * The taxonomy is deliberately conservative: an UNRECOGNIZED error is
 * classified as non-retryable. Side-effecting steps (send_email, …) are
 * never blindly re-executed for arbitrary failures — matching the
 * engine's Phase 4 philosophy of explicit opt-in retries. Retrying is
 * reserved for errors we can positively identify as transient
 * (rate limits, 5xx, network, timeouts).
 */
export function classifyStepError(
  error: string | Error | StructuredErrorLike | null | undefined,
): StepErrorClassification {
  // Structured objects with an explicit verdict win outright.
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const structured = error as StructuredErrorLike;
    if (typeof structured.retryable === 'boolean') {
      const codeNum = Number(structured.statusCode ?? structured.status);
      return {
        retryable: structured.retryable,
        kind: structured.retryable
          ? codeNum === 429 || RATE_LIMIT_RE.test(String(structured.code ?? ''))
            ? 'rate_limited'
            : 'transient'
          : 'permanent',
        retryAfterMs:
          typeof structured.retryAfterMs === 'number' && structured.retryAfterMs > 0
            ? structured.retryAfterMs
            : undefined,
      };
    }
    if (codeOnly(structured)) {
      return classifyHttpStatus(codeOnly(structured)!);
    }
  }

  const message = error instanceof Error ? error.message : String(error ?? '');

  // Business states are structured results, never transient failures.
  const businessMatch = BUSINESS_RE.exec(message);
  if (businessMatch) {
    return { retryable: false, kind: 'business', code: businessMatch[1].toUpperCase() };
  }

  const rateMatch = RATE_LIMIT_RE.exec(message);
  if (rateMatch) {
    return { retryable: true, kind: 'rate_limited', retryAfterMs: parseRetryAfterMs(message) };
  }

  if (TRANSIENT_RE.test(message)) {
    return { retryable: true, kind: 'transient', retryAfterMs: parseRetryAfterMs(message) };
  }

  if (TIMEOUT_RE.test(message)) {
    // A timeout is retryable — but ONLY within the overall execution
    // timeout budget, which the engine enforces independently.
    return { retryable: true, kind: 'timeout' };
  }

  if (PERMANENT_RE.test(message)) {
    return { retryable: false, kind: 'permanent' };
  }

  return { retryable: false, kind: 'unknown' };
}

function codeOnly(structured: StructuredErrorLike): number | null {
  const n = Number(structured.statusCode ?? structured.status);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function classifyHttpStatus(status: number): StepErrorClassification {
  if (status === 429) return { retryable: true, kind: 'rate_limited' };
  if (status === 408) return { retryable: true, kind: 'timeout' };
  if (status >= 500 && status <= 599) return { retryable: true, kind: 'transient' };
  return { retryable: false, kind: 'permanent' };
}

// ===== BACKOFF =====

/**
 * Exponential backoff with FULL jitter (AWS "Exponential Backoff and
 * Jitter" — full-jitter variant): the delay is uniform in [0, cap],
 * where cap = base * 2^attempt. Full jitter de-synchronizes concurrent
 * retries (a 429 storm recovering in lockstep would otherwise re-collide).
 *
 * A server-provided Retry-After hint is respected as a LOWER bound so
 * providers asking for a specific cooldown actually get it (jitter is
 * then added on top, capped at maxMs).
 */
export function computeBackoffDelayMs(
  attempt: number,
  opts?: {
    baseMs?: number;
    maxMs?: number;
    retryAfterMs?: number;
    /** Injectable randomness for deterministic tests. */
    rand?: () => number;
  },
): number {
  const base = opts?.baseMs ?? backoffBaseMs();
  const max = opts?.maxMs ?? backoffMaxMs();
  const rand = opts?.rand ?? Math.random;
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const exponentialCap = Math.min(max, base * Math.pow(2, safeAttempt));
  // Full jitter: uniform within [0, exponentialCap]
  const jittered = Math.floor(rand() * exponentialCap);
  const retryAfter = opts?.retryAfterMs && opts.retryAfterMs > 0 ? Math.floor(opts.retryAfterMs) : 0;
  if (retryAfter > 0) {
    // Respect the server hint as a lower bound, still capped at max.
    return Math.min(max, retryAfter + Math.floor(rand() * Math.min(base, 1000)));
  }
  return Math.min(max, Math.max(0, jittered));
}

/** Env-tunable backoff base (matches the engine's existing env knob). */
export function backoffBaseMs(): number {
  const v = Number(process.env.WORKFLOW_RETRY_BACKOFF_BASE_MS);
  return Number.isFinite(v) && v >= 0 ? v : 1000;
}

/** Backoff ceiling — default 30s, matching the legacy engine cap. */
export function backoffMaxMs(): number {
  const v = Number(process.env.WORKFLOW_RETRY_BACKOFF_MAX_MS);
  return Number.isFinite(v) && v > 0 ? v : 30000;
}

// ===== NICHE SPLITTING (multi-niche targeting & discovery attribution) =====

/**
 * Split a user-entered niche target into distinct niches.
 *
 * "hospital, dentist" → ["hospital", "dentist"] — so a multi-niche target
 * resolves leads whose OWN niche is either value, and discovery runs one
 * job per niche, attributing each discovered lead to the niche/query that
 * actually produced it. Empty entries and duplicates are dropped.
 */
export function splitNicheList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(raw).split(/[,;]/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Does a lead's stored niche match ANY of the requested niches?
 * Exact (case-insensitive) per niche — "hospital, dentist" never matches
 * a lead stored as the joined string, and a lead never gets relabeled.
 */
export function leadMatchesRequestedNiches(
  leadNiche: string | null | undefined,
  requested: string[],
): boolean {
  if (requested.length === 0) return false;
  const wanted = new Set(requested.map((n) => n.trim().toLowerCase()).filter(Boolean));
  return wanted.has((leadNiche || '').trim().toLowerCase());
}

// ===== CANONICAL PART 1 BUSINESS CODES + EXECUTION STATES =====

/** Structured business result: the run targeted a niche with zero matching leads. */
export const NO_MATCHING_LEADS = 'NO_MATCHING_LEADS';

/**
 * Canonical WorkflowExecution.status values (the schema field is a free
 * String — additive values need no migration). Part 1 additions:
 *   • 'exhausted' — retryable failure burned its full retry budget.
 *   • 'waiting_user_action' — business state awaiting the user (e.g. the
 *     no-leads Find-Leads handoff); never retried in the background.
 */
export const EXECUTION_STATUSES = {
  QUEUED: 'queued',
  RUNNING: 'running',
  WAITING_USER_ACTION: 'waiting_user_action',
  RETRYING: 'retrying',
  SUCCEEDED: 'completed',
  PARTIAL: 'partial',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  EXHAUSTED: 'exhausted',
} as const;

/** Terminal statuses — a settled execution never transitions again. */
export const TERMINAL_EXECUTION_STATUSES: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'cancelled',
  'exhausted',
]);
