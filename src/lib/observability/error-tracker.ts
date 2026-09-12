// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Error Tracking Utility (Observability Module)
// Phase L10: Observability
//
// Provides lightweight in-memory error tracking with:
// - Ring buffer of last 100 errors for quick inspection
// - Error classification (critical, warning, info)
// - Stack trace capture
// - Source attribution (route name, component name)
// - Integration with health checks for error status reporting
// - Structured error logging alongside tracking
// ═══════════════════════════════════════════════════════════════════

import * as coreLogger from '@/lib/logger';

// ===== TYPES =====

export type ErrorSeverity = 'critical' | 'warning' | 'info';

export interface TrackedError {
  /** Unique ID for this tracked error */
  id: string;
  /** Error severity classification */
  severity: ErrorSeverity;
  /** Error message (or class name for non-Error throws) */
  message: string;
  /** Error class name */
  errorName: string;
  /** Stack trace if available */
  stack?: string;
  /** Source route / component where the error occurred */
  source: string;
  /** ISO timestamp of when the error was tracked */
  timestamp: string;
  /** Additional context */
  context?: Record<string, unknown>;
  /** Whether this error has been acknowledged */
  acknowledged: boolean;
  /** Count of identical errors (same message + source) */
  count: number;
}

export interface TrackErrorOptions {
  /** Override auto-detected severity */
  severity?: ErrorSeverity;
  /** Source route name or component name */
  source?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

// ===== RING BUFFER =====

const MAX_ERRORS = 100;
const errorBuffer: TrackedError[] = [];

// ===== ERROR ID GENERATION =====

let errorCounter = 0;
function generateErrorId(): string {
  errorCounter++;
  const ts = Date.now().toString(36);
  const cnt = errorCounter.toString(36).padStart(4, '0');
  return `err_${ts}_${cnt}`;
}

// ===== SEVERITY CLASSIFICATION =====

/**
 * Auto-classify an error based on its type and properties.
 * - Error classes with 'Auth' or 'Unauthorized' → warning
 * - Error classes with 'Validation' → warning
 * - Error classes with 'NotFound' → info
 * - Error classes with 'Rate' or 'Timeout' → warning
 * - Everything else → critical
 */
function classifyError(error: Error | unknown): ErrorSeverity {
  if (error instanceof Error) {
    const name = error.name.toLowerCase();
    const message = error.message.toLowerCase();

    if (name.includes('auth') || name.includes('unauthorized') || message.includes('unauthorized')) {
      return 'warning';
    }
    if (name.includes('validation') || message.includes('validation')) {
      return 'warning';
    }
    if (name.includes('notfound') || name.includes('not found') || message.includes('not found')) {
      return 'info';
    }
    if (name.includes('rate') || name.includes('timeout') || message.includes('timeout')) {
      return 'warning';
    }
    if (name.includes('abort')) {
      return 'info';
    }
  }

  return 'critical';
}

// ===== PUBLIC API =====

/**
 * Track an error in the ring buffer and log it.
 *
 * Usage:
 * ```ts
 * try {
 *   await riskyOperation();
 * } catch (err) {
 *   trackError(err, { source: 'api/payments/webhook/stripe' });
 * }
 * ```
 */
export function trackError(error: Error | unknown, context?: TrackErrorOptions): TrackedError {
  const err = error instanceof Error ? error : new Error(String(error));
  const severity = context?.severity || classifyError(error);
  const source = context?.source || 'unknown';

  // Check for duplicate (same message + source in last 5 seconds)
  const fiveSecondsAgo = Date.now() - 5000;
  const recent = errorBuffer.find(
    e => e.message === err.message && e.source === source && new Date(e.timestamp).getTime() > fiveSecondsAgo
  );

  const trackedError: TrackedError = {
    id: recent ? recent.id : generateErrorId(),
    severity,
    message: err.message,
    errorName: err.name,
    stack: err.stack,
    source,
    timestamp: recent ? recent.timestamp : new Date().toISOString(),
    context: context?.context,
    acknowledged: recent?.acknowledged || false,
    count: (recent?.count || 0) + 1,
  };

  // If it's a duplicate, update in place; otherwise push to buffer
  if (recent) {
    // Update the existing entry
    const idx = errorBuffer.indexOf(recent);
    if (idx !== -1) {
      errorBuffer[idx] = trackedError;
    }
  } else {
    errorBuffer.push(trackedError);

    // Evict oldest if over capacity
    while (errorBuffer.length > MAX_ERRORS) {
      errorBuffer.shift();
    }
  }

  // Also log via structured logger
  const logLevel = severity === 'critical' ? 'error'
    : severity === 'warning' ? 'warn'
    : 'info';

  coreLogger[logLevel as 'error' | 'warn' | 'info'](
    `[ErrorTracker] ${severity.toUpperCase()}: ${err.message}`,
    { service: 'error-tracker', requestId: context?.context?.requestId as string | undefined },
    {
      errorId: trackedError.id,
      severity,
      source,
      errorName: err.name,
      stack: err.stack,
      count: trackedError.count,
      ...context?.context,
    },
  );

  return trackedError;
}

/**
 * Get recent tracked errors from the ring buffer.
 * Returns errors ordered from newest to oldest.
 *
 * @param limit - Max number of errors to return (default: all)
 * @param severity - Optional filter by severity
 */
export function getRecentErrors(limit?: number, severity?: ErrorSeverity): TrackedError[] {
  let errors = [...errorBuffer];

  if (severity) {
    errors = errors.filter(e => e.severity === severity);
  }

  // Reverse to get newest first
  errors.reverse();

  if (limit !== undefined) {
    errors = errors.slice(0, limit);
  }

  return errors;
}

/**
 * Get a count summary of errors by severity.
 */
export function getErrorCounts(): {
  total: number;
  critical: number;
  warning: number;
  info: number;
  recentCount: number; // errors in the last 5 minutes
  criticalCount: number; // critical errors in the last 5 minutes
} {
  const now = Date.now();
  const fiveMinutesAgo = now - 300000;

  let recentCount = 0;
  let criticalCount = 0;

  for (const err of errorBuffer) {
    const ts = new Date(err.timestamp).getTime();
    if (ts > fiveMinutesAgo) {
      recentCount++;
      if (err.severity === 'critical') {
        criticalCount++;
      }
    }
  }

  return {
    total: errorBuffer.length,
    critical: errorBuffer.filter(e => e.severity === 'critical').length,
    warning: errorBuffer.filter(e => e.severity === 'warning').length,
    info: errorBuffer.filter(e => e.severity === 'info').length,
    recentCount,
    criticalCount,
  };
}

/**
 * Acknowledge an error (mark it as seen/handled).
 */
export function acknowledgeError(errorId: string): boolean {
  const err = errorBuffer.find(e => e.id === errorId);
  if (err) {
    err.acknowledged = true;
    return true;
  }
  return false;
}

/**
 * Clear all tracked errors. Useful for testing.
 */
export function clearErrors(): void {
  errorBuffer.length = 0;
  errorCounter = 0;
}

/**
 * Check if any critical errors exist in the buffer.
 * Useful for health checks.
 */
export function hasCriticalErrors(): boolean {
  return errorBuffer.some(e => e.severity === 'critical' && !e.acknowledged);
}

// ===== DEFAULT EXPORT =====

const errorTracker = {
  trackError,
  getRecentErrors,
  getErrorCounts,
  acknowledgeError,
  clearErrors,
  hasCriticalErrors,
};

export default errorTracker;
