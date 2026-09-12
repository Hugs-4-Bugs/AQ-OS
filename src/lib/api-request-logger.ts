// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — API Request Logger
// Phase 11: Observability
//
// Wraps API route handlers with structured request/response logging,
// slow request detection, and error capture. Works in Node.js runtime
// (not Edge Runtime) since API routes run in Node.js.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { captureException } from '@/lib/error-tracking';

// ===== TYPES =====

type RouteHandler = (
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> }
) => Promise<NextResponse>;

interface RequestLogOptions {
  /** Service name for log entries (default: 'api') */
  service?: string;
  /** Log request body for debugging (default: false — can contain PII) */
  logBody?: boolean;
  /** Skip logging for this route (e.g., health checks, metrics) */
  skipLogging?: boolean;
}

// ===== SLOW REQUEST THRESHOLD =====

const SLOW_REQUEST_MS = 1000; // 1 second

// ===== HELPER: Sanitize headers for logging =====

function sanitizeHeaders(headers: Headers): Record<string, string> {
  const sanitized: Record<string, string> = {};
  const sensitiveKeys = new Set([
    'authorization',
    'cookie',
    'access_token',
    'refresh_token',
    'smtp_pass',
  ]);

  for (const [key, value] of headers.entries()) {
    if (sensitiveKeys.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// ===== HELPER: Extract context from request =====

function extractRequestContext(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || 'unknown';
  const userId = request.headers.get('x-user-id') || undefined;
  const method = request.method;
  const path = new URL(request.url).pathname;
  return { requestId, userId, method, path };
}

// ===== REQUEST LOGGER WRAPPER =====

/**
 * Wrap an API route handler with structured request/response logging.
 *
 * Usage:
 * ```ts
 * export const GET = withRequestLogging(async (request) => {
 *   // your handler logic
 *   return NextResponse.json({ data: 'hello' });
 * });
 * ```
 */
export function withRequestLogging(
  handler: RouteHandler,
  options?: RequestLogOptions
): RouteHandler {
  const serviceName = options?.service || 'api';

  return async (request, context) => {
    const { requestId, userId, method, path } = extractRequestContext(request);

    // Skip logging if configured
    if (options?.skipLogging) {
      return handler(request, context);
    }

    const log = logger.createLogger({
      service: serviceName,
      requestId,
      userId,
    });

    const startTime = performance.now();

    // Log incoming request
    log.info(`${method} ${path}`, {
      method,
      path,
      userAgent: request.headers.get('user-agent') || undefined,
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
    });

    try {
      const response = await handler(request, context);
      const duration = Math.round(performance.now() - startTime);
      const status = response.status;

      // Structured response log
      const logEntry: Record<string, unknown> = {
        method,
        path,
        status,
        duration,
      };

      if (duration > SLOW_REQUEST_MS) {
        log.warn(`SLOW ${method} ${path} ${status} ${duration}ms`, logEntry);
      } else {
        log.info(`${method} ${path} ${status} ${duration}ms`, logEntry);
      }

      // Add request ID to response if not already present
      if (!response.headers.has('x-request-id')) {
        response.headers.set('x-request-id', requestId);
      }

      return response;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);

      // Log the error with full context
      const err = error instanceof Error ? error : new Error(String(error));

      log.error(`${method} ${path} 500 ${duration}ms`, {
        method,
        path,
        status: 500,
        duration,
        error: err,
      });

      // Capture to error tracking (Sentry in production)
      captureException(err, {
        tags: {
          method,
          path,
          requestId,
        },
        extra: {
          duration,
          userId,
        },
        user: userId ? {
          id: userId,
          email: request.headers.get('x-user-email') || undefined,
        } : undefined,
      });

      // Return a 500 response
      return NextResponse.json(
        {
          error: 'Internal server error',
          requestId,
        },
        {
          status: 500,
          headers: {
            'x-request-id': requestId,
          },
        }
      );
    }
  };
}
