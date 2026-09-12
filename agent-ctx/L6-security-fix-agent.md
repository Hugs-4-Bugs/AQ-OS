# Task L6 — Security Fix Agent Work Record

## Task: Fix critical authorization and security issues

## Files Modified

1. **`/src/app/api/lead-discovery/route.ts`** — Replaced `getUserId()` (x-user-id header trust) with `withAuth()` middleware. GET endpoint also now requires auth.

2. **`/src/app/api/website-score/route.ts`** — Added `withAuth()` wrapper. Was completely unauthenticated.

3. **`/src/app/api/company-research/route.ts`** — Added `withAuth()` + ownership check `lead.userId === user.id`.

4. **`/src/app/api/reply-handler/route.ts`** — Added `withAuth()`. Derives userId from session, ignoring `body.userId` (IDOR fix).

5. **`/src/app/api/leads/route.ts`** — Added userId/orgId filter for session-auth on GET. Sets userId/orgId from session on POST.

6. **`/src/app/api/outreach/execute/route.ts`** — Added `sequence.userId === user.id` ownership check for POST and GET.

7. **`/src/lib/telegram-service.ts`** — Removed `|| 'default-dev-key-change-in-production-32b!'` fallback. Throws in production, warns in dev.

8. **`/src/lib/gmail-tracking-service.ts`** — Removed `|| 'default-unsubscribe-secret-change-in-production'` fallback. Throws in production, warns in dev.

9. **`/src/app/api/admin/backup/route.ts`** — Added `ALLOWED_TYPES` whitelist validation.

10. **`/src/app/api/payments/refund/route.ts`** — Changed from `withAuth()` to `withPermission('billing:write')`.

11. **`/src/app/api/payments/process-billing/route.ts`** — Changed permission from `admin:access` to `billing:write`.

## Key Decisions
- Used `withAuth` from `@/lib/auth-middleware` (not `@/lib/auth`) for route wrappers as per existing codebase patterns
- For leads route, preserved existing `withDualAuthPermission` pattern but added session-scoped filtering
- For process-billing, preserved dual auth (CRON_SECRET OR user auth) but tightened user permission to `billing:write`
- Fallback secrets: kept dev-only fallbacks with clear "INSECURE-DEV-ONLY" prefix and console warnings, but throw in production
