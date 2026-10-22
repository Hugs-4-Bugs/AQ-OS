// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Webhook Call Support (shared, single source of truth)
//
// WHY THIS MODULE EXISTS (Oct 2026 incident): a workflow whose first step
// was a webhook_call to a PLACEHOLDER URL (https://api.example.com/...)
// failed with the opaque Node.js message "Webhook call failed: fetch
// failed" — the actionable root cause (DNS ENOTFOUND for a reserved
// documentation domain that can never respond) was dropped on the floor
// because the runtime only surfaced `error.message`, never `error.cause`.
//
// This module centralizes, for BOTH executors (workflow-actions engine
// path + workflow-executor legacy/autopilot path) and the definition
// validator (workflow-validation.ts, Run Now pre-flight):
//   1. validateWebhookUrl   — reject unparseable / non-http(s) /
//      reserved-placeholder URLs BEFORE any network I/O, with clear
//      actionable repair guidance.
//   2. describeWebhookFetchError — surface the REAL network cause
//      (DNS / connection refused / timeout / TLS) instead of the generic
//      "fetch failed", while keeping the errno tokens (ENOTFOUND,
//      ECONNREFUSED, …) that workflow-retry.ts classifies as transient.
//   3. webhookTimeoutMs — a bounded per-call timeout budget so a hung
//      endpoint can never consume the whole execution budget silently.
// ═══════════════════════════════════════════════════════════════════

// ── Reserved documentation hosts ───────────────────────────────────
// RFC 2606 §3 reserves example.com / example.net / example.org (and their
// subdomains) for documentation; they are the classic placeholder hosts
// invented by AI workflow generators and can never serve a real request.
// Deliberately NARROW: `localhost`, IP literals, and RFC reserved TLDs
// like `.test` remain VALID — they are legitimate local/test endpoints
// (the app's own engine, for instance, calls http://localhost:3000/...).
const RESERVED_WEBHOOK_HOST_SUFFIXES = ['example.com', 'example.net', 'example.org'] as const;

export function isReservedWebhookHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, ''); // tolerate [::1]
  return RESERVED_WEBHOOK_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
}

// ── URL validation ─────────────────────────────────────────────────

export interface WebhookUrlCheck {
  valid: boolean;
  /** Parsed URL when valid (a fresh object — callers may mutate it). */
  url?: URL;
  /** Actionable, user-facing reason when invalid (no leading "Webhook …"). */
  error?: string;
}

/**
 * Validate a webhook step's URL BEFORE any network I/O.
 * Returns a clear, actionable error for every rejection:
 *   - missing / blank
 *   - not an absolute URL
 *   - non-http(s) scheme (ftp:, file:, …)
 *   - reserved documentation domain (api.example.com, example.net, …)
 */
export function validateWebhookUrl(raw: unknown): WebhookUrlCheck {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return {
      valid: false,
      error: 'no URL is configured — set the endpoint URL in the webhook step configuration',
    };
  }
  const trimmed = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      error: `"${trimmed}" is not a valid absolute URL — include the full http:// or https:// endpoint address`,
    };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      error: `"${trimmed}" uses the unsupported scheme "${parsed.protocol}" — only http:// and https:// webhook URLs are supported`,
    };
  }
  if (isReservedWebhookHost(parsed.hostname)) {
    return {
      valid: false,
      error:
        `"${trimmed}" points at the reserved documentation domain "${parsed.hostname}", ` +
        'which can never respond — replace it with the real endpoint URL of the service you want to call',
    };
  }
  return { valid: true, url: parsed };
}

// ── Fetch error surfacing ──────────────────────────────────────────

interface NodeErrorLike extends Error {
  code?: string;
  errno?: string | number;
  hostname?: string;
  host?: string;
  port?: number | string;
  cause?: unknown;
}

/** Collect the error + its `cause` chain (undici wraps the real error). */
function errorChain(error: unknown, maxDepth = 5): NodeErrorLike[] {
  const chain: NodeErrorLike[] = [];
  let current: unknown = error;
  while (current instanceof Error && chain.length < maxDepth) {
    chain.push(current as NodeErrorLike);
    current = (current as NodeErrorLike).cause;
  }
  return chain;
}

/**
 * Turn a failed fetch into the REAL, actionable reason.
 *
 * Node's `fetch` throws `TypeError: fetch failed` and hides the actual
 * failure in `error.cause` (e.g. `{ code: 'ENOTFOUND', hostname:
 * 'api.example.com' }`). This walks the cause chain and produces a
 * message that names the host/port and the failure class.
 *
 * The errno token (ENOTFOUND, ECONNREFUSED, …) is intentionally kept in
 * the text so workflow-retry.ts's TRANSIENT_RE classifier still sees it —
 * network blips remain retryable exactly as before.
 */
export function describeWebhookFetchError(error: unknown, timeoutMs?: number): string {
  const chain = errorChain(error);
  if (chain.length === 0) {
    return error ? String(error) : 'unknown network error';
  }

  // Our own AbortController timeout surfaces as an AbortError.
  const aborted = chain.find((e) => e.name === 'AbortError' || e.message === 'This operation was aborted');
  if (aborted) {
    return `the endpoint did not respond within ${timeoutMs ?? 'the configured'}ms — the request was aborted (check the service is reachable and fast enough, or raise the step's timeout)`;
  }

  const deepest = chain[chain.length - 1];
  const code = String(deepest.code ?? deepest.errno ?? '');
  const host = deepest.hostname ?? deepest.host ?? '';
  const port = deepest.port !== undefined ? `:${deepest.port}` : '';
  const where = host ? ` ${host}${port}` : '';

  switch (code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return (
        `DNS lookup failed — the hostname${where ? ` "${host}"` : ''} does not resolve. ` +
        'The endpoint URL is wrong or the host does not exist. [ENOTFOUND]'
      );
    case 'ECONNREFUSED':
      return (
        `connection refused${where ? ` by ${host}${port}` : ''} — nothing is listening at that address. ` +
        'Check the port and that the endpoint service is running. [ECONNREFUSED]'
      );
    case 'ETIMEDOUT':
      return `the connection to${where ? ` ${host}${port}` : ' the endpoint'} timed out [ETIMEDOUT]`;
    case 'ECONNRESET':
      return `the connection to${where ? ` ${host}` : ' the endpoint'} was reset by the remote end mid-request [ECONNRESET]`;
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return `the endpoint${where ? ` ${host}` : ''} is unreachable from this network [${code}]`;
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return `the TLS certificate for "${host}" does not cover this hostname — check the URL or the endpoint's certificate [ERR_TLS_CERT_ALTNAME_INVALID]`;
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'ERR_TLS_SELF_SIGNED_CERT_IN_CHAIN':
    case 'CERT_HAS_EXPIRED':
      return `the TLS certificate of "${host}" could not be verified (${code}) — the endpoint needs a valid certificate`;
    case 'UND_ERR_HEADERS_TIMEOUT':
    case 'UND_ERR_BODY_TIMEOUT':
    case 'UND_ERR_CONNECT_TIMEOUT':
      return `the endpoint${where ? ` ${host}` : ''} did not complete the response in time [${code}]`;
    default: {
      // No recognized errno — prefer the deepest concrete message over the
      // generic "fetch failed" wrapper (e.g. "Request with GET/HEAD method
      // cannot have body" style request-construction errors).
      const concrete = [...chain].reverse().find((e) => e.message && e.message !== 'fetch failed');
      return concrete?.message ?? 'unknown network error';
    }
  }
}

// ── Timeout budget ─────────────────────────────────────────────────

const WEBHOOK_TIMEOUT_DEFAULT_MS = 30_000;
const WEBHOOK_TIMEOUT_MIN_MS = 100;
const WEBHOOK_TIMEOUT_MAX_MS = 120_000;

/**
 * Per-call webhook timeout: step config `timeout` (ms) → env
 * WORKFLOW_WEBHOOK_TIMEOUT_MS → default 30s, clamped to a sane range so
 * a hung endpoint can never stall an execution indefinitely.
 */
export function webhookTimeoutMs(config?: Record<string, unknown>): number {
  const fromConfig = Number(config?.timeout);
  const fromEnv = Number(process.env.WORKFLOW_WEBHOOK_TIMEOUT_MS);
  let ms = WEBHOOK_TIMEOUT_DEFAULT_MS;
  if (Number.isFinite(fromConfig) && fromConfig > 0) ms = fromConfig;
  else if (Number.isFinite(fromEnv) && fromEnv > 0) ms = fromEnv;
  return Math.min(Math.max(Math.floor(ms), WEBHOOK_TIMEOUT_MIN_MS), WEBHOOK_TIMEOUT_MAX_MS);
}

/** HTTP methods that legally carry a request body (everything else must not). */
export function methodAllowsBody(method: string): boolean {
  const m = method.toUpperCase();
  return m !== 'GET' && m !== 'HEAD';
}

/** Methods the webhook step accepts (the fetch API set used by workflows). */
export function isValidWebhookMethod(method: string): boolean {
  return /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(method.toUpperCase());
}
