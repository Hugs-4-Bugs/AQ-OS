// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Error Tracking Utility
// Phase 11: Observability
//
// Provides captureException, captureMessage, and addBreadcrumb.
// In production, these would send to Sentry; for now, they log
// to the structured logger with full context enrichment.
//
// This replaces and enhances the Phase 14.2 sentry.ts module
// with tighter integration to the structured logger.
// ═══════════════════════════════════════════════════════════════════

import logger, { type LogLevel } from '@/lib/logger';

// ===== TYPES =====

export interface ErrorTrackingUser {
  id: string;
  email?: string;
  username?: string;
  role?: string;
  plan?: string;
}

export interface ErrorTrackingBreadcrumb {
  category: string;
  message: string;
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  data?: Record<string, unknown>;
  timestamp?: number;
}

export interface ErrorTrackingContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: ErrorTrackingUser;
  requestId?: string;
  fingerprint?: string[];
}

// ===== BREADCRUMB STORAGE =====

let breadcrumbs: ErrorTrackingBreadcrumb[] = [];
const MAX_BREADCRUMBS = 100;

// ===== USER CONTEXT =====

let currentUser: ErrorTrackingUser | null = null;

// ===== CORE FUNCTIONS =====

/**
 * Capture an exception with structured context.
 * Logs to the structured logger and (when Sentry is configured) would send to Sentry.
 *
 * @param error - The error to capture (Error object or unknown)
 * @param context - Additional context: tags, extra data, user info, request ID
 */
export function captureException(
  error: Error | unknown,
  context?: ErrorTrackingContext
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const user = context?.user || currentUser;

  logger.error(`Exception captured: ${err.message}`, {
    service: 'error-tracking',
    userId: user?.id,
    requestId: context?.requestId,
  }, {
    errorName: err.name,
    errorMessage: err.message,
    stack: err.stack,
    tags: context?.tags,
    extra: context?.extra,
    user: user ? { id: user.id, email: user.email, role: user.role, plan: user.plan } : undefined,
    fingerprint: context?.fingerprint,
    breadcrumbs: breadcrumbs.length > 0 ? breadcrumbs : undefined,
  });

  // In production with @sentry/nextjs, this would additionally call:
  // Sentry.captureException(err, { tags, extra, user, fingerprint });
  // For now, the structured logger is the destination.
}

/**
 * Capture a structured message at a given level.
 *
 * @param message - The message to capture
 * @param level - Severity level (default: 'info')
 * @param context - Additional context
 */
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
  context?: ErrorTrackingContext
): void {
  // Map Sentry-style levels to logger levels
  const levelMap: Record<string, LogLevel> = {
    fatal: 'error',
    error: 'error',
    warning: 'warn',
    info: 'info',
    debug: 'debug',
  };

  const logLevel = levelMap[level] || 'info';
  const user = context?.user || currentUser;

  logger[logLevel](`Message captured: ${message}`, {
    service: 'error-tracking',
    userId: user?.id,
    requestId: context?.requestId,
  }, {
    captureLevel: level,
    tags: context?.tags,
    extra: context?.extra,
    user: user ? { id: user.id, email: user.email } : undefined,
    breadcrumbs: breadcrumbs.length > 0 ? breadcrumbs : undefined,
  });

  // In production with @sentry/nextjs, this would additionally call:
  // Sentry.captureMessage(message, level, { tags, extra, user });
}

/**
 * Add a breadcrumb — a trail of events leading up to an error.
 * Breadcrumbs are attached to the next captured exception or message.
 *
 * @param category - Event category (e.g., 'auth', 'api', 'navigation')
 * @param message - Human-readable description
 * @param data - Additional structured data
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>
): void {
  const entry: ErrorTrackingBreadcrumb = {
    category,
    message,
    level: 'info',
    data,
    timestamp: Date.now() / 1000,
  };

  breadcrumbs.push(entry);

  // Keep only the most recent breadcrumbs
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs = breadcrumbs.slice(-MAX_BREADCRUMBS);
  }

  // In production with @sentry/nextjs:
  // Sentry.addBreadcrumb(entry);
}

/**
 * Set the current user context for error tracking.
 * All subsequent captures will include this user context.
 */
export function setErrorTrackingUser(user: ErrorTrackingUser | null): void {
  currentUser = user;

  if (user) {
    addBreadcrumb('auth', `User context set: ${user.id}`, {
      email: user.email,
      role: user.role,
      plan: user.plan,
    });
  }

  // In production with @sentry/nextjs:
  // Sentry.setUser(user ? { id: user.id, email: user.email, username: user.username } : null);
}

/**
 * Get the current user context.
 */
export function getErrorTrackingUser(): ErrorTrackingUser | null {
  return currentUser;
}

/**
 * Get all current breadcrumbs (for debugging).
 */
export function getBreadcrumbs(): ErrorTrackingBreadcrumb[] {
  return [...breadcrumbs];
}

/**
 * Clear all breadcrumbs.
 */
export function clearBreadcrumbs(): void {
  breadcrumbs = [];
}

/**
 * Wrap an async function with error tracking context.
 * Automatically captures any thrown exception.
 *
 * @param fn - The async function to wrap
 * @param context - Context to attach to any captured errors
 */
export async function withErrorTracking<T>(
  fn: () => Promise<T>,
  context: ErrorTrackingContext
): Promise<T> {
  // Set user context if provided
  if (context.user) {
    setErrorTrackingUser(context.user);
  }

  try {
    return await fn();
  } catch (error) {
    captureException(error, context);
    throw error;
  }
}

/**
 * Create a scoped error tracker with pre-set context.
 * Useful for wrapping an entire API route with consistent context.
 */
export function createErrorTracker(context: ErrorTrackingContext): {
  captureException: (error: Error | unknown, extra?: Record<string, unknown>) => void;
  captureMessage: (message: string, level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug') => void;
  addBreadcrumb: (category: string, message: string, data?: Record<string, unknown>) => void;
} {
  return {
    captureException: (error, extra) => {
      captureException(error, {
        ...context,
        extra: { ...context.extra, ...extra },
      });
    },
    captureMessage: (message, level) => {
      captureMessage(message, level, context);
    },
    addBreadcrumb: (category, message, data) => {
      addBreadcrumb(category, message, {
        ...data,
        requestId: context.requestId,
      });
    },
  };
}
