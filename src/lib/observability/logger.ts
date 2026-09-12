// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Structured Logging Utility (Observability Module)
// Phase L10: Observability (Enhanced)
//
// Provides structured logging with:
// - JSON output in production, pretty-print in development
// - Module-scoped loggers via createModuleLogger()
// - Request tracing support (requestId / traceId)
// - userId correlation for audit trails
// - Metadata enrichment for structured analysis
// - Default context propagation for request-scoped loggers
// - PerfTimer for easy duration tracking
//
// This module wraps the core logger at @/lib/logger and adds:
// - Module-scoped convenience (no need to pass service on every call)
// - Typed metadata support
// - Integration with the observability stack
// ═══════════════════════════════════════════════════════════════════

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  module?: string;
  userId?: string;
  requestId?: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
}

export interface ModuleLoggerOptions {
  module: string;
  userId?: string;
  requestId?: string;
  traceId?: string;
}

export interface ModuleLogger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
  fatal(message: string, metadata?: Record<string, unknown>): void;
  withRequestId(requestId: string): ModuleLogger;
  withUserId(userId: string): ModuleLogger;
  withMetadata(extra: Record<string, unknown>): ModuleLogger;
  withTraceId(traceId: string): ModuleLogger;
  setDefaultContext(ctx: Record<string, unknown>): void;
  clearDefaultContext(): void;
  apiRequest(method: string, path: string, status: number, durationMs: number, extra?: Record<string, unknown>): void;
}

// ===== IMPORT CORE LOGGER =====

import * as coreLogger from '@/lib/logger';

// ===== RE-EXPORT CORE FUNCTIONS =====

export const debug = coreLogger.debug;
export const info = coreLogger.info;
export const warn = coreLogger.warn;
export const error = coreLogger.error;
export const fatal = coreLogger.fatal;
export const createLogger = coreLogger.createLogger;
export const withDuration = coreLogger.withDuration;

// ===== DEFAULT CONTEXT (request-scoped) =====
// Used by the monitoring middleware to inject trace/request context
// into all log entries for the duration of a request.

let defaultContext: Record<string, unknown> = {};

/**
 * Set default context that will be merged into every log entry.
 * Typically called at the start of a request with trace/request IDs.
 */
export function setDefaultContext(ctx: Record<string, unknown>): void {
  defaultContext = { ...ctx };
}

/**
 * Clear default context. Called at the end of a request.
 */
export function clearDefaultContext(): void {
  defaultContext = {};
}

/**
 * Get the current default context (for internal use).
 */
export function getDefaultContext(): Record<string, unknown> {
  return { ...defaultContext };
}

// ===== PERFORMANCE TIMER =====

export class PerfTimer {
  private startTime: number;
  private label: string;

  constructor(label: string) {
    this.label = label;
    this.startTime = performance.now();
  }

  /** Stop the timer and log the duration at info level. Returns ms. */
  stop(extra?: Record<string, unknown>): number {
    const durationMs = Math.round(performance.now() - this.startTime);
    coreLogger.info(`${this.label} completed`, { service: 'observability' }, { durationMs, ...extra });
    return durationMs;
  }

  /** Stop the timer and log the duration at error level. */
  stopError(message: string, extra?: Record<string, unknown>): number {
    const durationMs = Math.round(performance.now() - this.startTime);
    coreLogger.error(message, { service: 'observability' }, { durationMs, ...extra });
    return durationMs;
  }

  /** Get elapsed ms without stopping. */
  elapsed(): number {
    return Math.round(performance.now() - this.startTime);
  }
}

// ===== MODULE-SCOPED LOGGER =====

/**
 * Create a module-scoped logger that automatically tags all log entries
 * with the module name. Supports request tracing and userId correlation.
 *
 * Usage:
 * ```ts
 * const log = createModuleLogger({ module: 'payment-service' });
 * log.info('Payment processed', { amount: 29.99, currency: 'USD' });
 *
 * // With request tracing
 * const reqLog = log.withRequestId('req_123').withUserId('user_456');
 * reqLog.info('Starting payment flow');
 * ```
 */
export function createModuleLogger(options: ModuleLoggerOptions): ModuleLogger {
  const baseOptions = {
    service: options.module,
    userId: options.userId,
    requestId: options.requestId || options.traceId,
  };

  return {
    debug: (message, metadata) =>
      coreLogger.debug(message, baseOptions, { ...defaultContext, ...metadata }),
    info: (message, metadata) =>
      coreLogger.info(message, baseOptions, { ...defaultContext, ...metadata }),
    warn: (message, metadata) =>
      coreLogger.warn(message, baseOptions, { ...defaultContext, ...metadata }),
    error: (message, metadata) =>
      coreLogger.error(message, baseOptions, { ...defaultContext, ...metadata }),
    fatal: (message, metadata) =>
      coreLogger.fatal(message, baseOptions, { ...defaultContext, ...metadata }),

    withRequestId: (requestId: string) =>
      createModuleLogger({ ...options, requestId }),

    withUserId: (userId: string) =>
      createModuleLogger({ ...options, userId }),

    withTraceId: (traceId: string) =>
      createModuleLogger({ ...options, traceId }),

    withMetadata: (extra: Record<string, unknown>) =>
      createModuleLogger({
        ...options,
      }),

    setDefaultContext: (ctx: Record<string, unknown>) => {
      defaultContext = { ...ctx };
    },

    clearDefaultContext: () => {
      defaultContext = {};
    },

    apiRequest: (method: string, path: string, status: number, durationMs: number, extra?: Record<string, unknown>) => {
      const level: LogLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
      coreLogger[level](
        `API ${method} ${path} → ${status} (${durationMs}ms)`,
        baseOptions,
        { method, path, status, durationMs, ...defaultContext, ...extra },
      );
    },
  };
}

/**
 * Log an API request with structured metadata.
 * Useful for request/response logging at API route boundaries.
 */
export function logApiRequest(params: {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  userId?: string;
  requestId?: string;
  traceId?: string;
  error?: string;
  module?: string;
}): void {
  const level: LogLevel = params.statusCode >= 500 ? 'error'
    : params.statusCode >= 400 ? 'warn'
    : 'info';

  const metadata: Record<string, unknown> = {
    method: params.method,
    path: params.path,
    statusCode: params.statusCode,
    durationMs: params.durationMs,
  };

  if (params.error) {
    metadata.error = params.error;
  }

  coreLogger[level](
    `${params.method} ${params.path} → ${params.statusCode}`,
    {
      service: params.module || 'api',
      userId: params.userId,
      requestId: params.requestId || params.traceId,
    },
    metadata,
  );
}

/**
 * Log a business event with structured metadata.
 * Used for tracking key business operations (payment, subscription, etc.)
 */
export function logBusinessEvent(params: {
  event: string;
  module: string;
  userId?: string;
  requestId?: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
}): void {
  coreLogger.info(
    `Business event: ${params.event}`,
    {
      service: params.module,
      userId: params.userId,
      requestId: params.requestId || params.traceId,
    },
    {
      event: params.event,
      ...defaultContext,
      ...params.metadata,
    },
  );
}

// ===== DEFAULT EXPORT =====

const observabilityLogger = {
  debug,
  info,
  warn,
  error,
  fatal,
  createLogger,
  createModuleLogger,
  logApiRequest,
  logBusinessEvent,
  withDuration,
  PerfTimer,
  setDefaultContext,
  clearDefaultContext,
  getDefaultContext,
};

export const logger = observabilityLogger;
export default observabilityLogger;
