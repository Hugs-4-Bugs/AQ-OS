// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Global API Error Handler
// Task 9: Comprehensive Error Handling — NO SILENT ERRORS
//
// Every API call should use this utility for consistent error handling,
// user feedback via toast notifications, retry logic, and auth redirect.
// ═══════════════════════════════════════════════════════════════════

import { toast } from 'sonner';

// ─── ApiError Class ────────────────────────────────────────

/**
 * Custom error class for API responses.
 * Carries HTTP status, optional error code, and a human-readable message.
 */
export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// ─── apiCall Options ───────────────────────────────────────

export interface ApiCallOptions {
  /** Default error message if the server doesn't provide one */
  errorMessage?: string;
  /** Whether to show a toast on error (default: true) */
  showToast?: boolean;
  /** Number of retries on failure (default: 0) */
  retryCount?: number;
  /** Base delay between retries in ms (multiplied by attempt number) */
  retryDelay?: number;
  /** Whether to include credentials (default: true) */
  credentials?: boolean;
}

// ─── apiCall — The Core API Request Function ──────────────

/**
 * Wrapper around `fetch()` that provides:
 * - Automatic error parsing with ApiError
 * - Auth redirect on 401
 * - Rate-limit handling on 429
 * - Payment-required handling on 402
 * - Configurable retry logic with exponential backoff
 * - Toast notifications on failure
 * - Consistent error shape
 *
 * @example
 * const data = await apiCall<User>('/api/auth/me');
 *
 * @example
 * const result = await apiCall<Lead[]>('/api/leads', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ businessName: 'Acme' }),
 * }, { errorMessage: 'Failed to create lead', retryCount: 2 });
 */
export async function apiCall<T>(
  url: string,
  options?: RequestInit,
  {
    errorMessage = 'Something went wrong',
    showToast = true,
    retryCount = 0,
    retryDelay = 1000,
    credentials = true,
  }: ApiCallOptions = {}
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const res = await fetch(url, {
        credentials: credentials ? 'include' : undefined,
        ...options,
      });

      // ── 401 Unauthorized ──
      if (res.status === 401) {
        const data = await res.json().catch(() => ({}));
        const err = new ApiError(
          (data as { error?: string }).error || 'Session expired. Please sign in again.',
          401,
          'UNAUTHORIZED'
        );
        // CRITICAL FIX (auto-refresh bug):
        // Do NOT call window.location.reload() here. Previously, every 401
        // response from any API would trigger a full page reload after 1.5s.
        // If a polling endpoint kept returning 401 (e.g., session briefly
        // expired or token refresh race), the page would reload every few
        // seconds, making the app unusable.
        //
        // Instead: just surface the error to the caller. The caller can
        // decide whether to redirect to login (e.g., the auth gate checks
        // auth state on mount) — but no silent background reloads.
        if (showToast) {
          toast.error(err.message);
        }
        throw err;
      }

      // ── 402 Payment Required ──
      if (res.status === 402) {
        const data = await res.json().catch(() => ({}));
        throw new ApiError(
          (data as { error?: string }).error || 'Payment required',
          402,
          (data as { code?: string }).code || 'PAYMENT_REQUIRED'
        );
      }

      // ── 429 Rate Limited ──
      if (res.status === 429) {
        throw new ApiError(
          'Too many requests. Please wait a moment.',
          429,
          'RATE_LIMITED'
        );
      }

      // ── Other non-OK responses ──
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const serverMessage = (data as { error?: string }).error;
        const serverCode = (data as { code?: string }).code;
        throw new ApiError(
          serverMessage || errorMessage,
          res.status,
          serverCode
        );
      }

      // ── Success ──
      return (await res.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry auth errors — they need user action
      if (error instanceof ApiError && error.status === 401) {
        break;
      }

      // Don't retry on the last attempt
      if (attempt === retryCount) {
        break;
      }

      // Don't retry client errors (4xx) except 429 and 408
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429 && error.status !== 408) {
        break;
      }

      // Wait before retry with exponential backoff
      await new Promise((resolve) =>
        setTimeout(resolve, retryDelay * (attempt + 1))
      );
    }
  }

  // Show toast for the final error
  if (showToast && lastError) {
    const message = getErrorFallbackMessage(lastError);
    toast.error(message);
  }

  throw lastError || new Error(errorMessage);
}

// ─── Helper: Check if error is a network error ────────────

/**
 * Returns true if the error is a network-level failure
 * (e.g., the browser couldn't reach the server).
 */
export function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    (error.message === 'Failed to fetch' ||
      error.message === 'NetworkError when attempting to fetch resource.' ||
      error.message.includes('NetworkError'))
  );
}

// ─── Helper: Get a user-friendly error message ────────────

/**
 * Converts any error into a human-readable message.
 * Maps HTTP status codes to contextual messages and handles
 * network errors separately.
 */
export function getErrorFallbackMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return 'Network error. Please check your connection.';
  }

  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message || 'Invalid request. Please check your input.';
      case 401:
        return 'Session expired. Please sign in again.';
      case 403:
        return 'You do not have permission to perform this action.';
      case 404:
        return 'The requested resource was not found.';
      case 408:
        return 'Request timed out. Please try again.';
      case 409:
        return error.message || 'Conflict. The resource may have been modified.';
      case 422:
        return error.message || 'Validation error. Please check your input.';
      case 429:
        return 'Too many requests. Please wait a moment.';
      case 500:
        return 'Server error. Please try again later.';
      case 502:
        return 'Service temporarily unavailable.';
      case 503:
        return 'Service unavailable. Please try again later.';
      case 504:
        return 'Request timed out. The server is taking too long to respond.';
      default:
        return error.message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred.';
}

// ─── Helper: Check if an error is retryable ───────────────

/**
 * Returns true if the error is worth retrying
 * (network errors, 5xx, 429, 408).
 */
export function isRetryableError(error: unknown): boolean {
  if (isNetworkError(error)) return true;
  if (error instanceof ApiError) {
    return (
      error.status === 429 ||
      error.status === 408 ||
      error.status >= 500
    );
  }
  return false;
}

// ─── Helper: Create a safe API call that returns null on error ──

/**
 * Like apiCall, but returns null instead of throwing on error.
 * Useful for non-critical fetches where you'd rather show empty
 * state than an error state.
 *
 * @example
 * const stats = await safeApiCall<DashboardStats>('/api/leads/stats');
 * // stats is DashboardStats | null
 */
export async function safeApiCall<T>(
  url: string,
  options?: RequestInit,
  apiCallOptions?: ApiCallOptions
): Promise<T | null> {
  try {
    return await apiCall<T>(url, options, {
      ...apiCallOptions,
      showToast: apiCallOptions?.showToast ?? true,
    });
  } catch {
    return null;
  }
}
