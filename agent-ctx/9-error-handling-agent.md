# Task 9 — Error Handling Agent

## Summary
Added comprehensive error handling across the AcquisitionOS application. Goal: **NO SILENT ERRORS**. Every API call now has proper error handling with user feedback.

## Files Created
1. **`/src/lib/api-error-handler.ts`** — Global API error handler utility
   - `ApiError` class with status/code
   - `apiCall<T>()` with retry, auth redirect, rate limit handling, toast notifications
   - `safeApiCall<T>()` for non-critical fetches
   - `isNetworkError()`, `getErrorFallbackMessage()`, `isRetryableError()` helpers

2. **`/src/components/dashboard/error-fallback.tsx`** — Reusable error display component
   - Network/server/general error detection with distinct icons/colors
   - Compact mode for inline errors
   - Retry button, customizable title/description, ARIA accessibility

## Files Modified
3. **`/src/components/error-boundary.tsx`** — Improved with retry, error details, Sentry integration
4. **`/src/lib/api.ts`** — All 26 API functions now use `apiCall()` instead of raw `fetch()`
5. **`/src/hooks/use-subscription-sync.ts`** — Uses `apiCall` with `ApiError` 401 detection
6. **`/src/hooks/use-credits.ts`** — Uses `apiCall` for credits queries and mutations
7. **`/src/hooks/use-entitlements.ts`** — Uses `apiCall` for all 3 query hooks
8. **`/src/hooks/use-auth.ts`** — Uses `apiCall` for fetchUser and signOut
9. **`/src/components/dashboard/overview-tab.tsx`** — Added ErrorFallback for stats query failures
10. **`/src/components/dashboard/leads-tab.tsx`** — Added ErrorFallback for leads query failures
11. **`/src/components/dashboard/insights-tab.tsx`** — Added ErrorFallback for insights query failures
12. **`/src/components/dashboard/deals-tab.tsx`** — Added ErrorFallback for deals query failures

## Key Design Decisions
- GET/query functions use `showToast: false` — TanStack Query + ErrorFallback handle display
- POST/mutation functions use `showToast: true` — immediate user feedback
- 401 errors trigger page reload after a 1.5s toast delay
- Retry logic skips 4xx errors (except 429/408) — no point retrying client errors
- ErrorFallback component supports network vs server vs general errors with different visuals
