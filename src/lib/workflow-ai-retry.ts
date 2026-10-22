// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow AI Rate-Limit Reliability
//
// Bounded retry for workflow AI provider calls (ai_analysis, ai_outreach,
// score_lead). The engine's step-level retry (config.retries) defaults to 0
// because side-effecting steps must never be blindly repeated — but a pure
// 429/"Too many requests" from the provider is EXACTLY the transient case
// where an immediate, bounded, provider-paced retry is correct:
//
//   • respects Retry-After when the provider supplies it (header or body)
//   • bounded attempts (default 3) and bounded total wait (default 30s)
//   • only positively-identified transient errors are retried (the SAME
//     classifier the engine uses — workflow-retry.ts classifyStepError);
//     validation/auth/business errors surface immediately
//   • the final error keeps its original message (incl. the "429" token),
//     so engine-level classification, workflow-retry's transient detector,
//     and per-lead failure reporting all still see the real cause
//   • one lead's exhausted retries never block the batch: the caller marks
//     THAT lead failed and continues the remaining leads (per-lead isolation)
// ═══════════════════════════════════════════════════════════════════

import { classifyStepError, computeBackoffDelayMs } from '@/lib/workflow-retry';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Max attempts per AI call (1 initial + N retries). Env-tunable for tests. */
export function aiRetryMaxAttempts(): number {
  const v = Number(process.env.WORKFLOW_AI_RETRY_ATTEMPTS);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 4;
}

/** Ceiling on the TOTAL time one AI call may spend waiting between retries. */
export function aiRetryMaxTotalWaitMs(): number {
  const v = Number(process.env.WORKFLOW_AI_RETRY_MAX_WAIT_MS);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 60000;
}

/** Provider-appropriate backoff ladder for rate-limited responses WITHOUT
 * a Retry-After hint — the same cooldowns the discovery pipeline's proven
 * pacer uses against this provider (8s / 15s / 25s). Bounded by the total
 * wait budget, so a provider that stays limited never stalls a lead
 * indefinitely. Env-tunable (comma-separated ms list) for ops/tests. */
const DEFAULT_RATE_LIMIT_LADDER_MS = [8000, 15000, 25000, 25000];
function rateLimitLadderDelayMs(attempt: number): number {
  const raw = process.env.WORKFLOW_AI_RATE_LIMIT_LADDER_MS;
  let ladder = DEFAULT_RATE_LIMIT_LADDER_MS;
  if (raw) {
    const parsed = raw
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v) && v >= 0);
    if (parsed.length > 0) ladder = parsed;
  }
  return ladder[Math.min(attempt, ladder.length - 1)];
}

interface RetryAfterCarrier {
  status?: number;
  statusCode?: number;
  headers?: unknown;
  retryAfter?: unknown;
  retry_after?: unknown;
}

/** Extract a Retry-After hint (ms) from a provider error, when present.
 * Handles header-map objects (Headers-like with .get), plain records, and
 * camelCase/snake_case properties. Values may be seconds or milliseconds. */
export function extractRetryAfterMs(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const carrier = error as RetryAfterCarrier;

  const readHeader = (name: string): string | null => {
    const h = carrier.headers;
    if (!h || typeof h !== 'object') return null;
    const getter = (h as { get?: (k: string) => unknown }).get;
    if (typeof getter === 'function') {
      const v = getter.call(h, name);
      return typeof v === 'string' ? v : null;
    }
    const record = h as Record<string, unknown>;
    const v = record[name] ?? record[name.toLowerCase()];
    return typeof v === 'string' ? v : null;
  };

  for (const raw of [readHeader('retry-after'), readHeader('Retry-After')]) {
    if (raw == null) continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      // HTTP-spec Retry-After is seconds; some SDKs pass milliseconds.
      return n > 1000 ? Math.floor(n) : Math.floor(n * 1000);
    }
  }

  for (const raw of [carrier.retryAfter, carrier.retry_after]) {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) continue;
    return raw > 1000 ? Math.floor(raw) : Math.floor(raw * 1000);
  }
  return undefined;
}

export interface AiRetryOutcome<T> {
  value?: T;
  /** True when this attempt series succeeded. */
  ok: boolean;
  /** True when at least one retryable failure was retried. */
  retried: boolean;
  attempts: number;
  /** Total ms spent waiting between attempts. */
  waitedMs: number;
  /** The last provider error when ok is false. */
  error?: unknown;
}

/**
 * Run an AI provider call with bounded rate-limit-aware retries.
 * Throws the ORIGINAL error when retries are exhausted or the failure is
 * not positively-identified as transient — callers surface it unchanged.
 */
export async function withAiRateLimitRetry<T>(
  fn: () => Promise<T>
): Promise<T> {
  const outcome = await tryWithAiRateLimitRetry<T>(fn);
  if (outcome.ok) return outcome.value as T;
  // Every attempt failed with a retryable error (or the wait budget was
  // exhausted): rethrow the ORIGINAL provider error so the caller surfaces
  // the real cause (with its 429 token intact for downstream classifiers).
  throw outcome.error;
}

/** Non-throwing variant: resolves with ok=false when the (retryable)
 * failure exhausted its bounded budget; still THROWS immediately for
 * non-retryable failures so permanent causes are never masked. */
export async function tryWithAiRateLimitRetry<T>(
  fn: () => Promise<T>
): Promise<AiRetryOutcome<T>> {
  const maxAttempts = aiRetryMaxAttempts();
  const maxTotalWait = aiRetryMaxTotalWaitMs();
  let waitedMs = 0;
  let retried = false;
  let lastError: unknown;
  let attempts = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    attempts++;
    try {
      const value = await fn();
      return { value, ok: true, retried, attempts, waitedMs };
    } catch (error) {
      lastError = error;
      // Non-retryable (validation / auth / business / unknown) — surface now.
      const classification = classifyStepError(error as string | Error);
      if (!classification.retryable) {
        throw error;
      }
      if (attempt === maxAttempts - 1) break; // attempt budget exhausted

      // Retry-After hint: structured carrier first, then the classifier's
      // message parse (e.g. "Retry-After: 5s" inside the provider body).
      const hint =
        extractRetryAfterMs(error) ?? classification.retryAfterMs;
      // Rate limits WITHOUT a hint use the provider-appropriate ladder
      // (the discovery pacer's proven 8/15/25s cooldowns); everything else
      // keeps the engine's full-jitter exponential backoff.
      const delay =
        classification.kind === 'rate_limited' && !hint
          ? rateLimitLadderDelayMs(attempt)
          : computeBackoffDelayMs(attempt, { retryAfterMs: hint });
      if (waitedMs + delay > maxTotalWait) break; // wait budget exhausted
      waitedMs += delay;
      retried = true;
      await sleep(delay);
    }
  }
  return { ok: false, retried, attempts, waitedMs, error: lastError };
}
