// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Server-Side Global Error Handler
// Phase L10: Observability
//
// Provides:
//   - Error classification (critical / warning / info)
//   - Request ID generation & tracking
//   - Structured error responses for API routes
//   - Integration with the structured logger
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

// ===== ERROR SEVERITY =====

export type ErrorSeverity = 'critical' | 'warning' | 'info';

/**
 * Classify an error by its HTTP status code or error type.
 *
 * - critical: 5xx server errors, unhandled exceptions
 * - warning: 4xx client errors (except 404 which is info), rate limits
 * - info: 404 not found, validation errors, expected conditions
 */
export function classifyError(error: unknown): ErrorSeverity {
  // Check for status code
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    if (status >= 500) return 'critical';
    if (status === 429) return 'warning'; // rate limit
    if (status === 404) return 'info';
    if (status === 401 || status === 403) return 'warning';
    if (status >= 400) return 'info'; // 4xx validation etc
  }

  // Check error name patterns
  if (error instanceof Error) {
    const name = error.name.toLowerCase();
    if (name.includes('timeout') || name.includes('connection')) return 'critical';
    if (name.includes('validation') || name.includes('notfound')) return 'info';
    if (name.includes('auth') || name.includes('permission')) return 'warning';
  }

  // Default: unhandled errors are critical
  return 'critical';
}

// ===== REQUEST ID =====

/**
 * Generate a short, unique request ID for tracing.
 * Format: `req_<timestamp_hex>_<random_hex>`
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `req_${timestamp}_${random}`;
}

/**
 * Extract or generate a request ID from the incoming request.
 * Checks `x-request-id` header first, then generates a new one.
 */
export function getRequestId(request?: Request | null): string {
  if (request) {
    const existing = request.headers.get('x-request-id');
    if (existing && existing.length > 0) return existing;
  }
  return generateRequestId();
}

// ===== STRUCTURED ERROR RESPONSE =====

export interface StructuredErrorResponse {
  error: {
    code: string;
    message: string;
    severity: ErrorSeverity;
    requestId: string;
    timestamp: string;
    details?: string;
    path?: string;
  };
}

/**
 * Build a consistent structured error JSON response.
 * Automatically classifies the error, attaches request ID and timestamp.
 */
export function structuredErrorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string,
  options?: {
    severity?: ErrorSeverity;
    details?: string;
    path?: string;
  }
): NextResponse<StructuredErrorResponse> {
  const severity = options?.severity || classifyError({ status });

  // Log the error via structured logger based on severity
  const logContext = { requestId, service: 'error-handler' };

  switch (severity) {
    case 'critical':
      logger.error(`[${code}] ${message}`, logContext, { path: options?.path, httpStatus: status, details: options?.details });
      break;
    case 'warning':
      logger.warn(`[${code}] ${message}`, logContext, { path: options?.path, httpStatus: status });
      break;
    case 'info':
      logger.info(`[${code}] ${message}`, logContext, { path: options?.path, httpStatus: status });
      break;
  }

  return NextResponse.json(
    {
      error: {
        code,
        message,
        severity,
        requestId,
        timestamp: new Date().toISOString(),
        ...(options?.details ? { details: options.details } : {}),
        ...(options?.path ? { path: options.path } : {}),
      },
    },
    { status }
  );
}

// ===== CONVENIENCE HELPERS =====

/** 400 Bad Request */
export function badRequest(message: string, requestId: string, options?: { details?: string; path?: string }) {
  return structuredErrorResponse(400, 'BAD_REQUEST', message, requestId, options);
}

/** 401 Unauthorized */
export function unauthorized(message: string = 'Authentication required', requestId: string, options?: { path?: string }) {
  return structuredErrorResponse(401, 'UNAUTHORIZED', message, requestId, { severity: 'warning', ...options });
}

/** 403 Forbidden */
export function forbidden(message: string = 'Insufficient permissions', requestId: string, options?: { path?: string }) {
  return structuredErrorResponse(403, 'FORBIDDEN', message, requestId, { severity: 'warning', ...options });
}

/** 404 Not Found */
export function notFound(message: string = 'Resource not found', requestId: string, options?: { path?: string }) {
  return structuredErrorResponse(404, 'NOT_FOUND', message, requestId, { severity: 'info', ...options });
}

/** 409 Conflict */
export function conflict(message: string, requestId: string, options?: { details?: string; path?: string }) {
  return structuredErrorResponse(409, 'CONFLICT', message, requestId, options);
}

/** 429 Rate Limited */
export function rateLimited(message: string = 'Too many requests. Please wait.', requestId: string, options?: { path?: string }) {
  return structuredErrorResponse(429, 'RATE_LIMITED', message, requestId, { severity: 'warning', ...options });
}

/** 500 Internal Server Error */
export function internalError(message: string = 'Internal server error', requestId: string, options?: { details?: string; path?: string; error?: unknown }) {
  const details = options?.details || (options?.error instanceof Error ? options.error.message : undefined);
  return structuredErrorResponse(500, 'INTERNAL_ERROR', message, requestId, { severity: 'critical', details, path: options?.path });
}

/** 503 Service Unavailable */
export function serviceUnavailable(message: string = 'Service temporarily unavailable', requestId: string, options?: { details?: string; path?: string }) {
  return structuredErrorResponse(503, 'SERVICE_UNAVAILABLE', message, requestId, { severity: 'critical', ...options });
}

// ===== WRAP API ROUTE HANDLER =====

/**
 * Wrap an API route handler with error handling and request ID tracking.
 * Catches unhandled errors and returns structured error responses.
 *
 * @example
 * export const GET = withErrorHandler(async (request, requestId) => {
 *   const user = await getCurrentUser(request);
 *   return NextResponse.json({ data: user });
 * });
 */
export function withErrorHandler(
  handler: (request: Request, requestId: string) => Promise<NextResponse> | NextResponse
) {
  return async (request: Request): Promise<NextResponse> => {
    const requestId = getRequestId(request);

    try {
      const response = await handler(request, requestId);

      // Attach request ID to response headers for tracing
      response.headers.set('x-request-id', requestId);
      return response;
    } catch (error) {
      // Classify and log the unhandled error
      const severity = classifyError(error);
      const message = error instanceof Error ? error.message : 'Unexpected error';
      const path = new URL(request.url).pathname;

      logger.error(`Unhandled error in ${path}`, { requestId, service: 'error-handler' }, {
        severity,
        errorMessage: message,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        stack: error instanceof Error ? error.stack : undefined,
        path,
      });

      // Return structured error response
      const status = error && typeof error === 'object' && 'status' in error
        ? Math.min((error as { status: number }).status, 599)
        : 500;

      const response = structuredErrorResponse(
        status,
        'UNHANDLED_ERROR',
        process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : message,
        requestId,
        {
          severity,
          path,
          details: process.env.NODE_ENV === 'production' ? undefined : message,
        }
      );

      response.headers.set('x-request-id', requestId);
      return response;
    }
  };
}
