// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — API Route Monitoring Middleware
// Phase 11: Observability Infrastructure
//
// Wraps API route handlers to add:
// - Request/response timing
// - Error tracking
// - Request ID propagation
// - Trace span creation
// - API metrics recording
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { apiMonitor } from '@/lib/observability/api-monitor';
import { logger } from '@/lib/observability/logger';
import {
  createRequestTrace,
  setTraceContext,
  clearTraceContext,
  startSpan,
  endSpan,
  getTraceContext,
} from '@/lib/observability/tracer';

type RouteHandler = (request: NextRequest, context?: unknown) => Promise<NextResponse>;

/**
 * Wrap an API route handler with observability monitoring.
 *
 * Usage:
 * ```ts
 * export const GET = withMonitoring(async (request) => {
 *   // your handler
 * }, '/api/leads');
 * ```
 */
export function withMonitoring(
  handler: RouteHandler,
  routeLabel?: string,
): RouteHandler {
  return async (request: NextRequest, context?: unknown) => {
    const startTime = performance.now();
    const method = request.method;
    const url = new URL(request.url);
    const route = routeLabel || url.pathname;

    // Create trace context for this request
    const traceCtx = createRequestTrace(request.headers);
    setTraceContext(traceCtx);

    // Create a root span for the entire request
    const rootSpan = startSpan(`HTTP ${method} ${route}`, {
      'http.method': method,
      'http.url': url.pathname,
      'http.host': url.hostname,
    });

    try {
      // Set logger context for this request
      logger.setDefaultContext({
        requestId: traceCtx.traceId,
        traceId: traceCtx.traceId,
        spanId: traceCtx.spanId,
        route,
        method,
      });

      // Execute the handler
      const response = await handler(request, context);

      const durationMs = performance.now() - startTime;

      // Record metrics
      apiMonitor.recordRequest({
        method,
        route,
        statusCode: response.status,
        durationMs,
        traceId: traceCtx.traceId,
      });

      // End the root span
      endSpan(rootSpan, response.status >= 500 ? 'error' : 'ok');

      // Log the request
      logger.logApiRequest({
        method,
        path: route,
        statusCode: response.status,
        durationMs,
        traceId: traceCtx.traceId,
      });

      // Add trace ID to response headers
      const newHeaders = new Headers(response.headers);
      newHeaders.set('X-Trace-Id', traceCtx.traceId);
      newHeaders.set('X-Response-Time', `${Math.round(durationMs)}ms`);

      return new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (error) {
      const durationMs = performance.now() - startTime;

      // Record metrics
      apiMonitor.recordRequest({
        method,
        route,
        statusCode: 500,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
        traceId: traceCtx.traceId,
      });

      // End the root span with error
      endSpan(rootSpan, 'error');

      // Log the error
      logger.error(`Unhandled error in ${method} ${route}`, undefined, {
        error: error instanceof Error ? error : new Error(String(error)),
        method,
        route,
        duration: durationMs,
        traceId: traceCtx.traceId,
      });

      // Return a proper JSON error response instead of re-throwing.
      // Re-throwing causes unhandled rejections that can crash the process.
      return NextResponse.json(
        { error: 'Internal server error', traceId: traceCtx.traceId },
        { status: 500, headers: { 'X-Trace-Id': traceCtx.traceId } }
      );
    } finally {
      clearTraceContext();
    }
  };
}

/**
 * Create a DB span within an existing trace context.
 * Useful for wrapping individual database calls.
 */
export function traceDbCall<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  const span = startSpan(`db:${operation}`, { 'db.operation': operation });
  return fn().then(
    (result) => { endSpan(span, 'ok'); return result; },
    (error) => { endSpan(span, 'error'); throw error; }
  );
}

/**
 * Create an AI operation span within an existing trace context.
 */
export function traceAiCall<T>(operation: string, fn: () => Promise<T>, model?: string): Promise<T> {
  const span = startSpan(`ai:${operation}`, {
    'ai.operation': operation,
    ...(model ? { 'ai.model': model } : {}),
  });
  return fn().then(
    (result) => { endSpan(span, 'ok'); return result; },
    (error) => { endSpan(span, 'error'); throw error; }
  );
}
