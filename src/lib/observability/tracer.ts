// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Request Tracer
// Phase 11: Observability Infrastructure
//
// Provides distributed tracing with:
// - Request ID generation and propagation
// - Span creation for database queries
// - Span creation for API calls
// - Span creation for AI operations
// - Trace context propagation across async boundaries
// ═══════════════════════════════════════════════════════════════════

import { logger } from './logger';
import { randomUUID } from 'crypto';

// ===== TYPES =====

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: 'ok' | 'error' | 'timeout';
  tags: Record<string, string>;
  logs: Array<{ timestamp: number; message: string; data?: Record<string, unknown> }>;
}

// ===== TRACE STORAGE =====

const MAX_TRACES = 200;
const MAX_SPANS_PER_TRACE = 100;
let activeSpans: Map<string, Span> = new Map();
let completedTraces: Map<string, Span[]> = new Map();
let currentTraceContext: TraceContext | null = null;

// ===== TRACE ID GENERATION =====

/**
 * Generate a new trace ID (32 hex characters).
 */
export function generateTraceId(): string {
  return randomUUID().replace(/-/g, '');
}

/**
 * Generate a new span ID (16 hex characters).
 */
export function generateSpanId(): string {
  const uuid = randomUUID().replace(/-/g, '');
  return uuid.substring(0, 16);
}

// ===== TRACE CONTEXT MANAGEMENT =====

/**
 * Set the current trace context (call at the beginning of a request).
 */
export function setTraceContext(context: TraceContext): void {
  currentTraceContext = context;
  logger.setDefaultContext({
    requestId: context.traceId,
    traceId: context.traceId,
    spanId: context.spanId,
  });
}

/**
 * Get the current trace context.
 */
export function getTraceContext(): TraceContext | null {
  return currentTraceContext;
}

/**
 * Clear the current trace context (call at the end of a request).
 */
export function clearTraceContext(): void {
  currentTraceContext = null;
  logger.clearDefaultContext();
}

/**
 * Create a new trace context for an incoming request.
 * If a trace ID is provided in headers, it will be propagated.
 */
export function createRequestTrace(headers?: Headers): TraceContext {
  const traceId = headers?.get('x-trace-id') || generateTraceId();
  const parentSpanId = headers?.get('x-span-id') || undefined;
  const spanId = generateSpanId();

  return {
    traceId,
    spanId,
    parentSpanId,
  };
}

// ===== SPAN MANAGEMENT =====

/**
 * Start a new span for a database query.
 */
export function startDbSpan(operation: string, query?: string): Span {
  return createSpan(`db:${operation}`, {
    'db.system': 'sqlite',
    'db.operation': operation,
    ...(query ? { 'db.statement': query.substring(0, 200) } : {}),
  });
}

/**
 * Start a new span for an API call.
 */
export function startApiSpan(method: string, url: string): Span {
  return createSpan(`api:${method} ${new URL(url).pathname}`, {
    'http.method': method,
    'http.url': url.substring(0, 200),
  });
}

/**
 * Start a new span for an AI operation.
 */
export function startAiSpan(operation: string, model?: string): Span {
  return createSpan(`ai:${operation}`, {
    'ai.operation': operation,
    ...(model ? { 'ai.model': model } : {}),
  });
}

/**
 * Start a generic span.
 */
export function startSpan(operationName: string, tags?: Record<string, string>): Span {
  return createSpan(operationName, tags || {});
}

/**
 * End a span and record its duration.
 */
export function endSpan(span: Span, status: 'ok' | 'error' | 'timeout' = 'ok'): void {
  span.endTime = performance.now();
  span.durationMs = Math.round((span.endTime - span.startTime) * 100) / 100;
  span.status = status;

  // Move from active to completed
  activeSpans.delete(span.spanId);

  // Add to trace
  const existing = completedTraces.get(span.traceId) || [];
  existing.push(span);
  if (existing.length > MAX_SPANS_PER_TRACE) {
    existing.shift();
  }
  completedTraces.set(span.traceId, existing);

  // Trim completed traces
  if (completedTraces.size > MAX_TRACES) {
    const firstKey = completedTraces.keys().next().value;
    if (firstKey) completedTraces.delete(firstKey);
  }

  // Log if slow
  if (span.durationMs > 1000) {
    logger.debug(`Slow span: ${span.operationName} took ${span.durationMs}ms`, undefined, {
      traceId: span.traceId,
      spanId: span.spanId,
      durationMs: span.durationMs,
      operation: span.operationName,
    });
  }
}

/**
 * Run an async function within a span.
 * Automatically starts and ends the span, and sets status based on success/failure.
 */
export async function traceAsync<T>(
  operationName: string,
  fn: () => Promise<T>,
  tags?: Record<string, string>
): Promise<T> {
  const span = startSpan(operationName, tags);
  try {
    const result = await fn();
    endSpan(span, 'ok');
    return result;
  } catch (error) {
    endSpan(span, 'error');
    if (error instanceof Error) {
      span.tags['error.message'] = error.message;
      span.tags['error.type'] = error.name;
    }
    throw error;
  }
}

/**
 * Run a synchronous function within a span.
 */
export function traceSync<T>(
  operationName: string,
  fn: () => T,
  tags?: Record<string, string>
): T {
  const span = startSpan(operationName, tags);
  try {
    const result = fn();
    endSpan(span, 'ok');
    return result;
  } catch (error) {
    endSpan(span, 'error');
    throw error;
  }
}

// ===== TRACE QUERIES =====

/**
 * Get a specific trace by ID.
 */
export function getTrace(traceId: string): Span[] | null {
  return completedTraces.get(traceId) || null;
}

/**
 * Get recent traces.
 */
export function getRecentTraces(count: number = 20): Array<{
  traceId: string;
  spans: Span[];
  totalDurationMs: number;
  spanCount: number;
  rootOperation: string;
  status: 'ok' | 'error' | 'timeout';
}> {
  const traces: Array<{
    traceId: string;
    spans: Span[];
    totalDurationMs: number;
    spanCount: number;
    rootOperation: string;
    status: 'ok' | 'error' | 'timeout';
  }> = [];

  const entries = Array.from(completedTraces.entries()).slice(-count).reverse();

  for (const [traceId, spans] of entries) {
    if (spans.length === 0) continue;

    const rootSpan = spans[0];
    const totalDurationMs = spans.reduce((max, s) => Math.max(max, s.durationMs || 0), 0);
    const hasError = spans.some(s => s.status === 'error');
    const hasTimeout = spans.some(s => s.status === 'timeout');

    traces.push({
      traceId,
      spans,
      totalDurationMs,
      spanCount: spans.length,
      rootOperation: rootSpan?.operationName || 'unknown',
      status: hasTimeout ? 'timeout' : hasError ? 'error' : 'ok',
    });
  }

  return traces;
}

/**
 * Get active (in-progress) spans.
 */
export function getActiveSpans(): Span[] {
  return Array.from(activeSpans.values());
}

// ===== INTERNAL HELPERS =====

function createSpan(operationName: string, tags: Record<string, string>): Span {
  const ctx = currentTraceContext;
  const span: Span = {
    traceId: ctx?.traceId || generateTraceId(),
    spanId: generateSpanId(),
    parentSpanId: ctx?.spanId,
    operationName,
    startTime: performance.now(),
    status: 'ok',
    tags,
    logs: [],
  };

  activeSpans.set(span.spanId, span);
  return span;
}

/**
 * Add a log entry to a span.
 */
export function addSpanLog(span: Span, message: string, data?: Record<string, unknown>): void {
  span.logs.push({
    timestamp: performance.now(),
    message,
    data,
  });
}

/**
 * Add a tag to a span.
 */
export function addSpanTag(span: Span, key: string, value: string): void {
  span.tags[key] = value;
}
