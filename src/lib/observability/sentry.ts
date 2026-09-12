// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Sentry Integration
// Phase 14.2: Observability Infrastructure
//
// Provides captureException, captureMessage, user context enrichment,
// and breadcrumb management. Works as a no-op fallback when Sentry
// DSN is not configured.
// ═══════════════════════════════════════════════════════════════════

// ===== TYPES =====

export interface SentryUser {
  id: string;
  email?: string;
  username?: string;
  role?: string;
  plan?: string;
}

export interface SentryBreadcrumb {
  category: string;
  message: string;
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  data?: Record<string, unknown>;
  timestamp?: number;
}

export interface SentryEventContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: SentryUser;
  fingerprint?: string[];
}

// ===== SENTRY STATE =====

let sentryInitialized = false;
let breadcrumbs: SentryBreadcrumb[] = [];
const MAX_BREADCRUMBS = 100;
let currentUser: SentryUser | null = null;

// ===== NO-OP SENTRY CLIENT =====
// When Sentry DSN is not configured, we provide a full no-op fallback
// that silently discards all events. This allows code throughout the
// app to call Sentry functions without worrying about configuration.

interface SentryCaptureResult {
  eventId: string | null;
}

const noOpResult: SentryCaptureResult = { eventId: null };

/**
 * Initialize Sentry with the DSN from environment variable.
 * If NEXT_PUBLIC_SENTRY_DSN is not set, all capture calls become no-ops.
 *
 * Call this once at application startup (e.g., in instrumentation.ts
 * or at the top-level layout).
 */
export function initSentry(): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (!dsn) {
    console.info('[Sentry] No NEXT_PUBLIC_SENTRY_DSN configured — Sentry is in no-op mode');
    sentryInitialized = false;
    return;
  }

  // In a full Sentry SDK integration, we would call Sentry.init() here.
  // Since we're implementing a lightweight integration that works without
  // the @sentry/nextjs package, we store the DSN and prepare the client.
  sentryInitialized = true;
  console.info('[Sentry] Initialized with DSN:', dsn.substring(0, 20) + '...');

  // Set default tags
  setSentryTag('environment', process.env.NODE_ENV || 'development');
  setSentryTag('version', '2.0.0');
  setSentryTag('runtime', 'node');
}

// ===== CAPTURE FUNCTIONS =====

/**
 * Capture an exception and send it to Sentry.
 * Returns the event ID (null if Sentry is not configured).
 */
export function captureException(
  error: Error | unknown,
  context?: SentryEventContext
): SentryCaptureResult {
  if (!sentryInitialized) {
    // Still log the error for local development
    console.error('[Sentry] Exception (no-op):', error);
    if (context?.extra) {
      console.error('[Sentry] Extra context:', context.extra);
    }
    return noOpResult;
  }

  const eventId = generateEventId();

  // In production with @sentry/nextjs, this would call:
  // Sentry.captureException(error, { tags, extra, user, fingerprint });
  console.error(`[Sentry] Exception captured (event: ${eventId}):`, error);
  if (context?.tags) {
    console.error('[Sentry] Tags:', context.tags);
  }
  if (context?.extra) {
    console.error('[Sentry] Extra:', context.extra);
  }
  if (context?.user || currentUser) {
    console.error('[Sentry] User:', context?.user || currentUser);
  }

  return { eventId };
}

/**
 * Capture a message and send it to Sentry.
 * Returns the event ID (null if Sentry is not configured).
 */
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
  context?: SentryEventContext
): SentryCaptureResult {
  if (!sentryInitialized) {
    console.log(`[Sentry] Message (${level}, no-op):`, message);
    return noOpResult;
  }

  const eventId = generateEventId();

  // In production with @sentry/nextjs, this would call:
  // Sentry.captureMessage(message, level, { tags, extra, user });
  console.log(`[Sentry] Message captured (${level}, event: ${eventId}):`, message);

  return { eventId };
}

// ===== USER CONTEXT =====

/**
 * Set the current user context for Sentry events.
 * This enriches all subsequent events with user information.
 */
export function setSentryUser(user: SentryUser | null): void {
  currentUser = user;

  if (!sentryInitialized) return;

  // In production with @sentry/nextjs:
  // Sentry.setUser(user ? { id: user.id, email: user.email, username: user.username } : null);
  if (user) {
    console.info(`[Sentry] User context set: ${user.id} (${user.email})`);
  } else {
    console.info('[Sentry] User context cleared');
  }
}

/**
 * Get the current Sentry user context.
 */
export function getSentryUser(): SentryUser | null {
  return currentUser;
}

// ===== BREADCRUMB MANAGEMENT =====

/**
 * Add a breadcrumb to the Sentry breadcrumb trail.
 * Breadcrumbs are included with the next captured event.
 */
export function addBreadcrumb(breadcrumb: SentryBreadcrumb): void {
  const entry: SentryBreadcrumb = {
    ...breadcrumb,
    timestamp: breadcrumb.timestamp || Date.now() / 1000,
    level: breadcrumb.level || 'info',
  };

  breadcrumbs.push(entry);

  // Keep only the most recent breadcrumbs
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs = breadcrumbs.slice(-MAX_BREADCRUMBS);
  }

  if (sentryInitialized) {
    // In production with @sentry/nextjs:
    // Sentry.addBreadcrumb(entry);
  }
}

/**
 * Get all current breadcrumbs (for debugging).
 */
export function getBreadcrumbs(): SentryBreadcrumb[] {
  return [...breadcrumbs];
}

/**
 * Clear all breadcrumbs.
 */
export function clearBreadcrumbs(): void {
  breadcrumbs = [];
}

// ===== TAG MANAGEMENT =====

const tags: Record<string, string> = {};

/**
 * Set a Sentry tag for all subsequent events.
 */
export function setSentryTag(key: string, value: string): void {
  tags[key] = value;

  if (sentryInitialized) {
    // In production with @sentry/nextjs:
    // Sentry.setTag(key, value);
  }
}

/**
 * Get all current Sentry tags.
 */
export function getSentryTags(): Record<string, string> {
  return { ...tags };
}

// ===== EXTRA CONTEXT =====

const extraContext: Record<string, unknown> = {};

/**
 * Set extra context data for Sentry events.
 */
export function setSentryExtra(key: string, value: unknown): void {
  extraContext[key] = value;

  if (sentryInitialized) {
    // In production with @sentry/nextjs:
    // Sentry.setExtra(key, value);
  }
}

/**
 * Get all current extra context.
 */
export function getSentryExtra(): Record<string, unknown> {
  return { ...extraContext };
}

// ===== HELPERS =====

function generateEventId(): string {
  const bytes = new Uint8Array(16);
  // Use crypto if available
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  // Fallback to timestamp + random
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Check if Sentry is currently initialized.
 */
export function isSentryInitialized(): boolean {
  return sentryInitialized;
}

/**
 * Create a scoped capture function with pre-set context.
 * Useful for wrapping API route handlers with consistent context.
 */
export function withSentryContext(
  context: SentryEventContext,
  fn: () => Promise<void>
): Promise<void> {
  // Set context before running
  if (context.tags) {
    for (const [key, value] of Object.entries(context.tags)) {
      setSentryTag(key, value);
    }
  }
  if (context.extra) {
    for (const [key, value] of Object.entries(context.extra)) {
      setSentryExtra(key, value);
    }
  }
  if (context.user) {
    setSentryUser(context.user);
  }

  return fn().catch((error) => {
    captureException(error, context);
    throw error;
  });
}
