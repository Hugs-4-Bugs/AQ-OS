# Task: fix-round-1 — Fix Round 1 Audit Fixes

## Agent: Main Agent
## Status: ✅ Completed

## Summary
All 4 fixes from the Phase 1-6 audit have been implemented successfully.

## Fixes Applied

### Fix 1: Activity Analytics Widget — Replace Hardcoded Data with Real API
- **File**: `/src/components/dashboard/activity-analytics-widget.tsx`
- **Change**: Complete rewrite from hardcoded static data to real API using `useQuery`
- Removed: WEEKLY_DATA, NICHE_DATA, PERFORMANCE_METRICS constants
- Added: `fetchLeadStats()` function calling `/api/leads/stats`
- Metrics now show real: avgScores.replyScore, closeRate, replyRate, streak
- Niches show real data from `topNiches` array
- Chart shows pipeline stage breakdown from `stageBreakdown`
- Added: AnalyticsSkeleton (loading state), AnalyticsEmpty (empty state)
- Kept: glass-card design, framer-motion animations, recharts bar chart

### Fix 2: Add Auth to /api/leads/stats Route
- **File**: `/src/app/api/leads/stats/route.ts`
- **Change**: Added `requireAuth(request)` at the start of GET handler
- All Prisma queries now filter by `userId: user.id`
- Communication and Deal queries use `lead: { userId }` for user scoping
- Error handling catches AuthError and returns proper status codes

### Fix 3: Add RBAC to Critical Settings API Routes
- **File**: `/src/app/api/settings/clear-data/route.ts`
  - Added: owner/super_admin role check (`!['owner', 'super_admin'].includes(user.role)`)
- **File**: `/src/app/api/settings/account/delete-request/route.ts`
  - Added: `hasPermission(user.role, 'billing:write')` check (owner/super_admin only have this)
- **File**: `/src/app/api/payments/process-billing/route.ts`
  - Added: Alternative admin auth path using `requireAuth` + `hasPermission(role, 'admin:access')`
  - Route now accepts: CRON_SECRET bearer token OR authenticated admin user
- **File**: `/src/app/api/settings/team/invite/route.ts` — Verified already has admin/owner check ✅

### Fix 4: Fix logAuthEvent userId Issue
- **File**: `/prisma/schema.prisma`
  - `AuditLog.userId` changed from `String` to `String?`
  - `AuditLog.user` relation changed from required to optional with `onDelete: SetNull`
- **File**: `/src/lib/auth.ts`
  - `logAuthEvent` param `userId` changed from `string` to `string | null`
  - `db.auditLog.create` now uses `userId: params.userId || null`
- **File**: `/src/lib/billing-audit.ts`
  - `BillingAuditParams.userId` changed to `string | null`
  - All helper functions (logTrialEvent, logCreditEvent, logSubscriptionEvent, logEntitlementEvent, logCouponEvent, logPaymentEvent, getBillingAuditHistory) updated
- **File**: `/src/app/api/auth/signin/route.ts` — `userId: 'unknown'` → `userId: null`
- **File**: `/src/app/api/auth/otp/verify/route.ts` — `userId: 'unknown'` → `userId: null`
- **File**: `/src/app/api/payments/process-billing/route.ts` — `userId: 'system'` → `userId: null`

## Verification
- ✅ `bun run lint` — 0 errors
- ✅ `bun run db:push` — Schema synced
- ✅ Dev server running on port 3000
