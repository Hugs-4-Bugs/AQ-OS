'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Auto-Capture Module
// Silently captures browser/device info, navigation history, API
// requests, error logs, and performance metrics for attaching to
// feedback submissions.
//
// SECURITY: Never captures passwords, tokens, secrets, auth headers,
// cookies, or request/response bodies. All URLs are sanitized.
// ═══════════════════════════════════════════════════════════════════

const SENSITIVE_PARAM_RE = /token|key|secret|password|auth|session/i;
const SENSITIVE_URL_RE = /token|key|secret|password|auth/i;
const MAX_NAV_HISTORY = 5;
const MAX_API_REQUESTS = 10;
const MAX_ERROR_LOGS = 20;
const MAX_STACK_LENGTH = 2000;

// ─── Module-level state (persists for the session) ─────────────────
let navigationHistory: string[] = [];
let lastApiRequests: Array<{
  url: string;
  method: string;
  status: number;
  timestamp: string;
}> = [];
let errorLog: Array<{
  message: string;
  source: string;
  line: number;
  column: number;
  timestamp: string;
}> = [];

let initialized = false;
let perfRecorded = false;

// ─── Sanitization ──────────────────────────────────────────────────

function sanitizeUrl(url: string): string {
  if (!url) return '';
  try {
    // Remove query params matching sensitive patterns
    const u = new URL(url, window.location.origin);
    const params = new URLSearchParams(u.search);
    const toDelete: string[] = [];
    params.forEach((_, key) => {
      if (SENSITIVE_PARAM_RE.test(key)) toDelete.push(key);
    });
    toDelete.forEach((k) => params.delete(k));
    u.search = params.toString();
    return u.toString();
  } catch {
    // Not a parseable URL — check against sensitive string and return
    if (SENSITIVE_URL_RE.test(url)) return '[sanitized-url]';
    return url;
  }
}

function isSensitiveUrl(url: string): boolean {
  if (!url) return false;
  return SENSITIVE_URL_RE.test(url);
}

// ─── Browser / Device Info ─────────────────────────────────────────

interface BrowserInfo {
  browserName: string;
  browserVersion: string;
  osName: string;
  osVersion: string;
  screenResolution: string;
  timezone: string;
  locale: string;
  networkType: string;
  userAgent: string;
}

function parseUserAgent(ua: string): {
  browserName: string;
  browserVersion: string;
  osName: string;
  osVersion: string;
} {
  let browserName = 'Unknown';
  let browserVersion = '';
  let osName = 'Unknown';
  let osVersion = '';

  if (!ua) return { browserName, browserVersion, osName, osVersion };

  // Browser detection
  if (/Edg\//i.test(ua)) {
    browserName = 'Edge';
    browserVersion = (ua.match(/Edg\/([\d.]+)/) || [])[1] || '';
  } else if (/OPR\/|Opera/i.test(ua)) {
    browserName = 'Opera';
    browserVersion = (ua.match(/(?:OPR|Opera)\/([\d.]+)/) || [])[1] || '';
  } else if (/Chrome\/|Chromium\//i.test(ua)) {
    browserName = /Chromium\//i.test(ua) ? 'Chromium' : 'Chrome';
    browserVersion = (ua.match(/(?:Chrome|Chromium)\/([\d.]+)/) || [])[1] || '';
  } else if (/Firefox\//i.test(ua)) {
    browserName = 'Firefox';
    browserVersion = (ua.match(/Firefox\/([\d.]+)/) || [])[1] || '';
  } else if (/Safari\//i.test(ua) && !/Chrome/.test(ua)) {
    browserName = 'Safari';
    browserVersion = (ua.match(/Version\/([\d.]+)/) || [])[1] || '';
  }

  // OS detection
  if (/Windows NT/i.test(ua)) {
    osName = 'Windows';
    const m = ua.match(/Windows NT ([\d.]+)/);
    osVersion = m ? m[1] : '';
  } else if (/Mac OS X/i.test(ua)) {
    osName = 'macOS';
    const m = ua.match(/Mac OS X ([\d_]+)/);
    osVersion = m ? m[1].replace(/_/g, '.') : '';
  } else if (/Android/i.test(ua)) {
    osName = 'Android';
    const m = ua.match(/Android ([\d.]+)/);
    osVersion = m ? m[1] : '';
  } else if (/iPhone OS|iOS/i.test(ua)) {
    osName = 'iOS';
    const m = ua.match(/OS ([\d_]+)/);
    osVersion = m ? m[1].replace(/_/g, '.') : '';
  } else if (/Linux/i.test(ua)) {
    osName = 'Linux';
  }

  return { browserName, browserVersion, osName, osVersion };
}

function captureBrowserInfo(): BrowserInfo {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const parsed = parseUserAgent(ua);

  let screenResolution = '';
  if (typeof window !== 'undefined' && window.screen) {
    screenResolution = `${window.screen.width}x${window.screen.height}`;
  }

  let timezone = '';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    timezone = '';
  }

  const locale = typeof navigator !== 'undefined' ? navigator.language || '' : '';

  let networkType = 'unknown';
  try {
    const conn = (navigator as Navigator & {
      connection?: { effectiveType?: string };
    }).connection;
    if (conn && conn.effectiveType) networkType = conn.effectiveType;
  } catch {
    networkType = 'unknown';
  }

  return {
    ...parsed,
    screenResolution,
    timezone,
    locale,
    networkType,
    userAgent: ua,
  };
}

// ─── Navigation History Tracking ──────────────────────────────────

function pushNavigation(url: string) {
  if (!url) return;
  const sanitized = sanitizeUrl(url);
  if (isSensitiveUrl(sanitized)) return;
  navigationHistory.push(sanitized);
  if (navigationHistory.length > MAX_NAV_HISTORY) {
    navigationHistory = navigationHistory.slice(-MAX_NAV_HISTORY);
  }
  try {
    sessionStorage.setItem('__aos_nav_history', JSON.stringify(navigationHistory));
  } catch {
    // sessionStorage might be unavailable
  }
}

function setupNavigationTracking() {
  if (typeof window === 'undefined') return;

  // Capture initial page
  pushNavigation(window.location.href);

  // Listen to popstate (back/forward)
  window.addEventListener('popstate', () => {
    pushNavigation(window.location.href);
  });

  // Override pushState to catch SPA navigations
  const originalPushState = history.pushState.bind(history);
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    const result = originalPushState(...args);
    setTimeout(() => pushNavigation(window.location.href), 0);
    return result;
  };

  // Override replaceState too
  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    const result = originalReplaceState(...args);
    setTimeout(() => pushNavigation(window.location.href), 0);
    return result;
  };

  // Restore from sessionStorage
  try {
    const stored = sessionStorage.getItem('__aos_nav_history');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) navigationHistory = parsed.slice(-MAX_NAV_HISTORY);
    }
  } catch {
    // ignore
  }
}

// ─── API Request Tracking (sanitized) ─────────────────────────────

interface TrackedRequest {
  url: string;
  method: string;
  status: number;
  timestamp: string;
}

function trackApiRequest(url: string, method: string, status: number) {
  if (!url) return;
  // Never track sensitive URLs
  if (isSensitiveUrl(url)) return;
  const sanitized = sanitizeUrl(url);

  lastApiRequests.push({
    url: sanitized,
    method: method || 'GET',
    status: status || 0,
    timestamp: new Date().toISOString(),
  });
  if (lastApiRequests.length > MAX_API_REQUESTS) {
    lastApiRequests = lastApiRequests.slice(-MAX_API_REQUESTS);
  }
}

function setupFetchTracking() {
  if (typeof window === 'undefined') return;
  if (!(window.fetch && typeof window.fetch === 'function')) return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = function (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method || 'GET').toUpperCase();

    return originalFetch(input, init).then(
      (response: Response) => {
        trackApiRequest(url, method, response.status);
        return response;
      },
      (error: Error) => {
        trackApiRequest(url, method, 0);
        throw error;
      },
    );
  };
}

// ─── Error Log Capture ─────────────────────────────────────────────

function setupErrorCapture() {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event: ErrorEvent) => {
    const message = (event.message || 'Unknown error').toString().slice(0, 500);
    const source = (event.filename || '').toString().slice(0, 300);
    errorLog.push({
      message,
      source,
      line: event.lineno || 0,
      column: event.colno || 0,
      timestamp: new Date().toISOString(),
    });
    if (errorLog.length > MAX_ERROR_LOGS) {
      errorLog = errorLog.slice(-MAX_ERROR_LOGS);
    }
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message =
      (reason && typeof reason === 'object' && 'message' in reason
        ? String((reason as { message?: unknown }).message)
        : String(reason || 'Unhandled rejection')
      ).slice(0, 500);
    errorLog.push({
      message,
      source: 'promise',
      line: 0,
      column: 0,
      timestamp: new Date().toISOString(),
    });
    if (errorLog.length > MAX_ERROR_LOGS) {
      errorLog = errorLog.slice(-MAX_ERROR_LOGS);
    }
  });
}

// ─── Performance Metrics ───────────────────────────────────────────

interface PerfMetrics {
  pageLoadTime?: number;
  domLoadTime?: number;
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
}

function capturePerformance(): PerfMetrics {
  if (typeof window === 'undefined' || !window.performance) return {};

  const result: PerfMetrics = {};

  try {
    const timing = window.performance.timing;
    if (timing) {
      // Navigation Timing API (legacy)
      const loadEventEnd = timing.loadEventEnd || Date.now();
      const navigationStart = timing.navigationStart || Date.now();
      const domComplete = timing.domComplete || 0;
      result.pageLoadTime = loadEventEnd - navigationStart;
      result.domLoadTime = domComplete ? domComplete - navigationStart : undefined;
    } else {
      // Use PerformanceNavigationTiming
      const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (navEntries.length > 0) {
        const entry = navEntries[0];
        result.pageLoadTime = Math.round(entry.loadEventEnd - entry.startTime);
        result.domLoadTime = Math.round(entry.domComplete - entry.startTime);
      }
    }
  } catch {
    // ignore
  }

  try {
    const memory = (performance as Performance & {
      memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number };
    }).memory;
    if (memory) {
      result.usedJSHeapSize = memory.usedJSHeapSize;
      result.totalJSHeapSize = memory.totalJSHeapSize;
    }
  } catch {
    // ignore
  }

  return result;
}

// ─── Public API ────────────────────────────────────────────────────

export interface CapturedContext {
  browserName: string;
  browserVersion: string;
  osName: string;
  osVersion: string;
  screenResolution: string;
  timezone: string;
  locale: string;
  networkType: string;
  userAgent: string;
  pageUrl: string;
  previousPageUrl: string;
  navigationHistory: string[];
  lastApiRequests: TrackedRequest[];
  errorLogs: typeof errorLog;
  performanceData: PerfMetrics;
  appVersion: string;
  sessionId: string;
}

export function getCapturedContext(): CapturedContext {
  const browserInfo = captureBrowserInfo();
  const perf = perfRecorded ? capturePerformance() : capturePerformance();
  perfRecorded = true;

  let previousPageUrl = '';
  try {
    previousPageUrl = sanitizeUrl(document.referrer || '');
  } catch {
    previousPageUrl = '';
  }

  const pageUrl =
    typeof window !== 'undefined' ? sanitizeUrl(window.location.href) : '';

  // Session ID — generated once per session, stored in sessionStorage
  let sessionId = '';
  try {
    sessionId = sessionStorage.getItem('__aos_session_id') || '';
    if (!sessionId) {
      sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem('__aos_session_id', sessionId);
    }
  } catch {
    sessionId = '';
  }

  return {
    ...browserInfo,
    pageUrl,
    previousPageUrl,
    navigationHistory: [...navigationHistory],
    lastApiRequests: [...lastApiRequests],
    errorLogs: [...errorLog],
    performanceData: perf,
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
    sessionId,
  };
}

export function initAutoCapture(): void {
  if (initialized) return;
  if (typeof window === 'undefined') return;
  initialized = true;

  try {
    setupNavigationTracking();
    setupFetchTracking();
    setupErrorCapture();
    // Record perf once after load
    if (document.readyState === 'complete') {
      perfRecorded = true;
    } else {
      window.addEventListener('load', () => {
        perfRecorded = true;
      });
    }
    // eslint-disable-next-line no-console
    console.debug('[AutoCapture] Initialized');
  } catch (err) {
    // Never let auto-capture break the app
    // eslint-disable-next-line no-console
    console.warn('[AutoCapture] Init failed:', err);
  }
}

// Truncate helper for stack traces
export function truncateStack(stack: string | undefined | null, max = MAX_STACK_LENGTH): string {
  if (!stack) return '';
  if (stack.length <= max) return stack;
  return stack.slice(0, max) + '\n...[truncated]';
}
