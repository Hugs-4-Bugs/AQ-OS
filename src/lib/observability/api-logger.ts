// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — API Request Logging Middleware
// Phase 11: Observability
//
// Wraps API route handlers to add:
//   - Structured request/response logging (method, path, status, duration)
//   - Prometheus metrics (api_requests_total, api_request_duration_seconds)
//   - Sentry error capture for unhandled exceptions
//   - User context enrichment (when available via x-user-id header)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { metricsCollector } from '@/lib/observability/metrics-collector';
import { captureException, addBreadcrumb } from '@/lib/observability/sentry';

/**
 * Wraps an API route handler with observability: logging, metrics, and error tracking.
 *
 * Supports both NextRequest (standard routes) and Request (webhook routes).
 *
 * Usage:
 *   export const POST = withApiLogging(async (request: NextRequest) => {
 *     // your handler logic
 *     return NextResponse.json({ ok: true });
 *   }, 'auth/signin');
 *
 * @param handler - The API route handler function
 * @param routeName - A human-readable route identifier for logs/metrics (e.g., 'auth/signin')
 */
/** Next.js route context: { params: Promise<Record<string, string>> } (passed as 2nd handler arg) */
export function withApiLogging(
  handler: (request: NextRequest, context?: any) => Promise<NextResponse>,
  routeName: string
): (request: NextRequest, context?: any) => Promise<NextResponse> {
  return async (request: NextRequest, context?: any): Promise<NextResponse> => {
    const method = request.method;
    // nextUrl is available on NextRequest; fallback to url for Request compatibility
    const path = 'nextUrl' in request ? (request as NextRequest).nextUrl.pathname : new URL((request as Request).url).pathname;
    const userId = request.headers.get('x-user-id') || undefined;
    const startTime = performance.now();

    // Add breadcrumb for request tracing in Sentry
    addBreadcrumb({
      category: 'api',
      message: `${method} ${path}`,
      level: 'info',
      data: { route: routeName, method, userId },
    });

    try {
      const response = await handler(request, context);
      const durationMs = performance.now() - startTime;
      const durationSec = durationMs / 1000;
      const statusCode = response.status;

      // Structured log
      logger.info(`API ${method} ${routeName} → ${statusCode}`, {
        service: 'api',
        userId,
      }, {
        method,
        path,
        route: routeName,
        statusCode,
        durationMs: Math.round(durationMs),
      });

      // Prometheus metrics
      const statusGroup = `${Math.floor(statusCode / 100)}xx`;
      metricsCollector.incrementCounter('api_requests_total', {
        method,
        route: routeName,
        status: String(statusCode),
        statusGroup,
      });

      metricsCollector.observeHistogram(
        'api_request_duration_seconds',
        { method, route: routeName },
        durationSec
      );

      return response;
    } catch (error) {
      const durationMs = performance.now() - startTime;
      const durationSec = durationMs / 1000;

      // Structured error log
      logger.error(`API ${method} ${routeName} → 500 (unhandled)`, {
        service: 'api',
        userId,
      }, {
        method,
        path,
        route: routeName,
        statusCode: 500,
        durationMs: Math.round(durationMs),
        error: error instanceof Error ? error : new Error(String(error)),
      });

      // Prometheus metrics for error
      metricsCollector.incrementCounter('api_requests_total', {
        method,
        route: routeName,
        status: '500',
        statusGroup: '5xx',
      });

      metricsCollector.observeHistogram(
        'api_request_duration_seconds',
        { method, route: routeName },
        durationSec
      );

      // Capture to Sentry (no-op if DSN not configured)
      captureException(error, {
        tags: { route: routeName, method },
        extra: { path, durationMs: Math.round(durationMs) },
      });

      // Return a generic 500 response
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}
