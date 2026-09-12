# Task 3: Backend Plan Gates Middleware + Auth Enhancement + Entitlement Hooks

## Agent: Plan Gates Agent

## Task Summary
Created backend plan enforcement middleware, enhanced auth middleware, created API routes, and built frontend entitlement hooks.

## Files Created

### 1. `/src/lib/plan-gates.ts`
Complete backend plan enforcement middleware with 5 gate functions:

- **`withPlan(request, requiredPlan, handler)`** — Requires minimum plan level (free < pro < elite)
- **`withFeature(request, feature, handler)`** — Requires specific feature access on user's plan
- **`withCredits(request, action, handler)`** — Requires sufficient credits for an action (checks without deducting)
- **`withTeamAccess(request, minimumRole, handler)`** — Requires org membership with minimum role
- **`withBillingGate(request, options, handler)`** — Combined gate: auth + plan + feature + credits

Each gate:
1. Authenticates the user via `getAuthUser()`
2. Checks the plan/feature/credit/team requirement
3. On failure: returns structured JSON error with code, required/current values, and upgrade URL
4. On success: calls the handler with user and context
5. Logs audit events for denied access via `billing-audit.ts`

Exported types: `CreditCheckResult`, `BillingGateContext`

Error formats:
- Plan: `{ error, code: "PLAN_REQUIRED", required, current, upgradeUrl }`
- Feature: `{ error, code: "FEATURE_REQUIRED", feature, currentPlan, requiredPlan, upgradeUrl }`
- Credits: `{ error, code: "INSUFFICIENT_CREDITS", required, available, deficit, action }`
- Team: `{ error, code: "TEAM_ACCESS_REQUIRED", minimumRole, upgradeUrl }`

### 2. `/src/lib/auth-middleware.ts` (Modified)
Added two billing middleware shorthand functions:

- **`withBillingRead(request, handler)`** — Shorthand for `withPermission('billing:read')`
- **`withBillingWrite(request, handler)`** — Shorthand for `withPermission('billing:write')`

All existing functions preserved unchanged.

### 3. `/src/app/api/entitlements/route.ts`
GET endpoint returning plan entitlements, enabled/disabled features, upgrade hints, and credit balance.

### 4. `/src/app/api/entitlements/check-credits/route.ts`
POST endpoint checking credit sufficiency for a specific action without deducting.

### 5. `/src/app/api/entitlements/quota/route.ts`
GET endpoint returning quota usage vs. limits for all features.

### 6. `/src/hooks/use-entitlements.ts`
Three frontend hooks using TanStack Query:

- **`useEntitlements()`** — Plan entitlements with helpers: `canAccess()`, `canAccessAll()`, `canAccessAny()`, `getUpgradePlan()`, `getFeatureLimit()`
- **`useCreditCheck(action)`** — Credit sufficiency for a specific action with `hasCredits`, `creditInfo`, `cost`, `balance`, `shortfall`
- **`useQuotaStatus()`** — Quota usage with helpers: `getQuota()`, `isQuotaReached()`, `getRemaining()`, `getUsagePercentage()`

All hooks use proper TanStack Query caching with appropriate stale times and refetch intervals.

## Lint Result
0 errors, 1 pre-existing warning (TanStack Table incompatible library)
