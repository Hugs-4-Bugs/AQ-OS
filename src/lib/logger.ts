// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Structured Logger
// Phase 11: Observability
//
// Provides structured JSON logging with levels, request tracking,
// and environment-aware formatting (pretty in dev, JSON in prod).
// ═══════════════════════════════════════════════════════════════════

// ===== TYPES =====

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  userId?: string;
  requestId?: string;
  duration?: number;
  [key: string]: unknown;
}

export interface LoggerOptions {
  service?: string;
  userId?: string;
  requestId?: string;
}

// ===== CONSTANTS =====

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const DEFAULT_SERVICE = 'acquisitionos';
const MIN_LOG_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// ===== COLOR HELPERS (development pretty-print) =====

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
  fatal: '\x1b[35m',  // magenta (stands out from error)
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function formatPretty(entry: LogEntry): string {
  const color = COLORS[entry.level];
  const timestamp = DIM + entry.timestamp + RESET;
  const level = `${color}${BOLD}${entry.level.toUpperCase().padEnd(5)}${RESET}`;
  const service = DIM + `[${entry.service}]` + RESET;

  let line = `${timestamp} ${level} ${service} ${entry.message}`;

  // Append structured fields
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (!['timestamp', 'level', 'message', 'service'].includes(key)) {
      extra[key] = value;
    }
  }

  if (Object.keys(extra).length > 0) {
    line += ` ${DIM}${JSON.stringify(extra)}${RESET}`;
  }

  return line;
}

function formatJson(entry: LogEntry): string {
  // In production, remove undefined values for clean JSON
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (value !== undefined) {
      clean[key] = value;
    }
  }
  return JSON.stringify(clean);
}

// ===== CORE LOGGER =====

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[MIN_LOG_LEVEL];
}

function createEntry(
  level: LogLevel,
  message: string,
  options?: LoggerOptions,
  extra?: Record<string, unknown>
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: options?.service || DEFAULT_SERVICE,
    userId: options?.userId,
    requestId: options?.requestId,
    ...extra,
  };
}

function emit(entry: LogEntry): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const formatted = isProduction ? formatJson(entry) : formatPretty(entry);

  switch (entry.level) {
    case 'debug':
      // Only log debug in non-production or when explicitly set
      if (!isProduction || MIN_LOG_LEVEL === 'debug') {
        process.stdout.write(formatted + '\n');
      }
      break;
    case 'info':
      process.stdout.write(formatted + '\n');
      break;
    case 'warn':
      process.stderr.write(formatted + '\n');
      break;
    case 'error':
      process.stderr.write(formatted + '\n');
      break;
    case 'fatal':
      process.stderr.write(formatted + '\n');
      break;
  }
}

// ===== PUBLIC API =====

/**
 * Log a debug message.
 * Only visible when LOG_LEVEL=debug or in development mode.
 */
export function debug(message: string, options?: LoggerOptions, extra?: Record<string, unknown>): void {
  if (!shouldLog('debug')) return;
  emit(createEntry('debug', message, options, extra));
}

/**
 * Log an informational message.
 */
export function info(message: string, options?: LoggerOptions, extra?: Record<string, unknown>): void {
  if (!shouldLog('info')) return;
  emit(createEntry('info', message, options, extra));
}

/**
 * Log a warning message.
 */
export function warn(message: string, options?: LoggerOptions, extra?: Record<string, unknown>): void {
  if (!shouldLog('warn')) return;
  emit(createEntry('warn', message, options, extra));
}

/**
 * Log an error message, with optional error object for stack trace.
 */
export function error(
  message: string,
  options?: LoggerOptions,
  extra?: Record<string, unknown>
): void {
  if (!shouldLog('error')) return;
  const entry = createEntry('error', message, options, extra);

  // If an Error object is passed in extra, extract stack trace
  if (extra?.error instanceof Error) {
    entry.stack = extra.error.stack;
    entry.errorName = extra.error.name;
    entry.errorMessage = extra.error.message;
    // Remove the raw error object to keep JSON serializable
    delete entry.error;
  }

  emit(entry);
}

/**
 * Log a fatal message — highest severity, always emitted.
 * Use for unrecoverable errors that require immediate attention.
 */
export function fatal(message: string, options?: LoggerOptions, extra?: Record<string, unknown>): void {
  if (!shouldLog('fatal')) return;
  const entry = createEntry('fatal', message, options, extra);

  if (extra?.error instanceof Error) {
    entry.stack = extra.error.stack;
    entry.errorName = extra.error.name;
    entry.errorMessage = extra.error.message;
    delete entry.error;
  }

  emit(entry);
}

/**
 * Create a child logger with pre-set context (service, userId, requestId).
 * All log calls on the child will include this context automatically.
 */
export function createLogger(options: LoggerOptions): {
  debug: (message: string, extra?: Record<string, unknown>) => void;
  info: (message: string, extra?: Record<string, unknown>) => void;
  warn: (message: string, extra?: Record<string, unknown>) => void;
  error: (message: string, extra?: Record<string, unknown>) => void;
  fatal: (message: string, extra?: Record<string, unknown>) => void;
  withRequestId: (requestId: string) => ReturnType<typeof createLogger>;
  withUserId: (userId: string) => ReturnType<typeof createLogger>;
} {
  return {
    debug: (message, extra) => debug(message, options, extra),
    info: (message, extra) => info(message, options, extra),
    warn: (message, extra) => warn(message, options, extra),
    error: (message, extra) => error(message, options, extra),
    fatal: (message, extra) => fatal(message, options, extra),
    withRequestId: (requestId) => createLogger({ ...options, requestId }),
    withUserId: (userId) => createLogger({ ...options, userId }),
  };
}

/**
 * Log with a timer — logs the duration of an async operation.
 */
export async function withDuration<T>(
  label: string,
  fn: () => Promise<T>,
  options?: LoggerOptions
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = Math.round(performance.now() - start);
    info(`${label} completed`, options, { duration });
    return result;
  } catch (err) {
    const duration = Math.round(performance.now() - start);
    error(`${label} failed`, options, {
      duration,
      error: err instanceof Error ? err : new Error(String(err)),
    });
    throw err;
  }
}

// ===== DEFAULT EXPORT =====

const logger = {
  debug,
  info,
  warn,
  error,
  fatal,
  createLogger,
  withDuration,
};

export default logger;
