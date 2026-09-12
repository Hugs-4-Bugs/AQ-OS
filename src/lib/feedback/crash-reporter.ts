'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Crash Reporter
// Captures uncaught errors and unhandled promise rejections, then
// reports them to the backend (fire-and-forget). Uses a 1-second
// cooldown and localStorage retry queue for failed reports.
//
// SECURITY: Stack traces are sanitized (absolute paths stripped).
// ═══════════════════════════════════════════════════════════════════

const CRASH_ENDPOINT = '/api/feedback/crash';
const COOLDOWN_MS = 1000;
const MAX_STACK_LENGTH = 2000;
const RETRY_KEY = '__aos_crash_retry';
const MAX_RETRY_QUEUE = 20;

let lastReportTime = 0;
let initialized = false;
let currentUserId: string | null = null;

// ─── Noise filtering (FIX: M_ID crash flood) ───────────────────────
// Browser extensions (Chrome/Edge/Firefox/Safari) inject scripts into the
// page and throw errors like "Cannot read properties of undefined (reading
// 'M_ID')" from chrome-extension:// frames. These are NOT app bugs, but
// window.onerror forwards everything, which flooded the CrashReport table
// (62 of 65 rows were extension errors) and polluted crash analytics.
const EXTENSION_SOURCE_PATTERN = /(chrome-extension|moz-extension|safari-extension|safari-web-extension|edge-extension|extensions::)/i;
const EXTENSION_URL_PATTERN = /^((chrome|moz|safari|edge|opera)-extension|chrome|about|res):/i;

function isExtensionNoise(input: {
  message?: string;
  source?: string | undefined;
  stack?: string | undefined;
}): boolean {
  if (input.source && EXTENSION_SOURCE_PATTERN.test(input.source)) return true;
  const haystack = `${input.stack || ''}`;
  if (EXTENSION_SOURCE_PATTERN.test(haystack)) return true;
  // window.onerror passes the script URL as `source`; also catch bare
  // "chrome-extension:200.js" style sources without the full scheme.
  if (input.source && EXTENSION_URL_PATTERN.test(input.source)) return true;
  return false;
}

// ─── Stack sanitization ────────────────────────────────────────────

function sanitizeStackTrace(stack: string | undefined | null): string {
  if (!stack) return '';
  let s = stack;
  // Truncate
  if (s.length > MAX_STACK_LENGTH) {
    s = s.slice(0, MAX_STACK_LENGTH) + '\n...[truncated]';
  }
  // Strip absolute file paths (keep relative). Handles both unix /abs/path and Windows C:\path
  s = s.replace(/\(?((?:file|https?):\/\/)?(?:\/|[A-Za-z]:\\)[^\s)]+\)?/g, (match) => {
    // Keep only the basename portion if we can extract it
    const parts = match.split(/[/\\]/);
    const basename = parts[parts.length - 1].replace(/[)]$/, '');
    return basename || '[path]';
  });
  return s;
}

// ─── Crash submission ──────────────────────────────────────────────

interface CrashPayload {
  message: string;
  source?: string;
  line?: number;
  col?: number;
  stack?: string;
  userId?: string;
  pageUrl?: string;
  userAgent?: string;
  componentName?: string;
}

async function reportCrash(payload: CrashPayload): Promise<void> {
  // Drop browser-extension noise — it is not an application bug.
  if (isExtensionNoise(payload)) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug('[CrashReporter] Ignored extension error:', payload.message);
    }
    return;
  }
  // Cooldown check
  const now = Date.now();
  if (now - lastReportTime < COOLDOWN_MS) return;
  lastReportTime = now;

  const enrichedPayload: CrashPayload = {
    ...payload,
    stack: sanitizeStackTrace(payload.stack),
    userId: currentUserId || undefined,
    pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  };

  try {
    const res = await fetch(CRASH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enrichedPayload),
      // fire-and-forget — keepalive lets the request finish even if page unloads
      keepalive: true,
    });
    if (!res.ok) {
      queueForRetry(enrichedPayload);
    }
  } catch {
    queueForRetry(enrichedPayload);
  }
}

function queueForRetry(payload: CrashPayload): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const existing = JSON.parse(localStorage.getItem(RETRY_KEY) || '[]');
    existing.push({ payload, queuedAt: Date.now() });
    // Cap queue size
    const trimmed = existing.slice(-MAX_RETRY_QUEUE);
    localStorage.setItem(RETRY_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage may be full — drop silently
  }
}

async function flushRetryQueue(): Promise<void> {
  if (typeof window === 'undefined' || !window.localStorage) return;
  let queue: Array<{ payload: CrashPayload; queuedAt: number }> = [];
  try {
    queue = JSON.parse(localStorage.getItem(RETRY_KEY) || '[]');
    if (queue.length === 0) return;
    localStorage.removeItem(RETRY_KEY);
  } catch {
    return;
  }

  for (const item of queue) {
    // Don't respect cooldown when flushing old items
    const now = Date.now();
    if (now - item.queuedAt > 24 * 60 * 60 * 1000) continue; // skip items older than 24h
    try {
      const res = await fetch(CRASH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
        keepalive: true,
      });
      if (!res.ok) {
        // Re-queue on failure
        queueForRetry(item.payload);
        break; // stop flushing if backend is down
      }
    } catch {
      queueForRetry(item.payload);
      break;
    }
  }
}

// ─── Init ──────────────────────────────────────────────────────────

export function initCrashReporter(userId?: string | null): void {
  if (initialized) {
    if (userId) currentUserId = userId;
    return;
  }
  if (typeof window === 'undefined') return;
  initialized = true;
  currentUserId = userId || null;

  try {
    // window.onerror
    window.onerror = function (
      message: string | Event,
      source?: string | undefined,
      line?: number | undefined,
      col?: number | undefined,
      error?: Error | undefined,
    ) {
      const msg = typeof message === 'string' ? message : 'Unknown error';
      // FIX: skip errors originating from browser extension frames so the
      // crash API only receives real application errors.
      if (isExtensionNoise({ message: msg, source, stack: error?.stack || error?.message })) {
        return false;
      }
      reportCrash({
        message: msg,
        source: source || undefined,
        line: line || undefined,
        col: col || undefined,
        stack: error?.stack || error?.message,
      });
      return false; // Let default handler also run
    };

    // unhandledrejection
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason && typeof reason === 'object' && 'message' in reason
          ? String((reason as { message?: unknown }).message)
          : String(reason || 'Unhandled rejection');
      const stack =
        reason && typeof reason === 'object' && 'stack' in reason
          ? String((reason as { stack?: unknown }).stack)
          : undefined;
      if (isExtensionNoise({ message, stack })) return;
      reportCrash({
        message,
        stack,
      });
    });

    // Flush any retry queue after a short delay
    setTimeout(() => {
      flushRetryQueue().catch(() => {
        /* ignore */
      });
    }, 3000);

    // Attempt to flush on page hide
    window.addEventListener('pagehide', () => {
      flushRetryQueue().catch(() => {
        /* ignore */
      });
    });

    // eslint-disable-next-line no-console
    console.debug('[CrashReporter] Initialized');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[CrashReporter] Init failed:', err);
  }
}

// Update user ID when auth state changes
export function setCrashReporterUser(userId: string | null): void {
  currentUserId = userId;
}

// Manual crash report (for caught errors that should still be logged)
export function reportManualCrash(
  error: Error | string,
  componentName?: string,
): void {
  const message = typeof error === 'string' ? error : error.message || 'Manual crash report';
  const stack = typeof error === 'string' ? undefined : error.stack;
  reportCrash({
    message,
    stack,
    componentName,
  });
}
