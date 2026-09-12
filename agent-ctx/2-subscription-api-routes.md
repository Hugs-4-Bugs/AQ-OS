# Task ID: 2 — Subscription API Routes

## Agent: API Routes Agent

## Summary

Created 7 new API routes and enhanced 3 existing routes for the AcquisitionOS subscription, credits, and billing system. All routes use the backend services from `/src/lib/` and follow the existing auth middleware pattern (`withAuth`, `withPermission`).

## Files Created (7)

### 1. `/src/app/api/subscriptions/current/route.ts`
- **GET** — Get current subscription status
- Uses `withAuth` middleware
- Calls `subscription-service.getSubscriptionStatus(userId)` for subscription/plan/trial info
- Calls `trial-service.checkTrialStatus(userId)` if user is on trial
- Calls `credit-service.getCreditBalance(userId)` for balance breakdown
- Returns: subscription details, plan details, trial info, credit balance (with monthly/rollover/addons)

### 2. `/src/app/api/subscriptions/usage/route.ts`
- **GET** — Get usage data for current billing period
- Uses `withAuth` + `withPermission(billing:read)`
- Calls `usage-service.getUsageSummary(userId)` for aggregated usage
- Calls `usage-service.getQuotaStatus(userId)` for feature quotas
- Calls `usage-service.getDailyUsage(userId, days)` for charting data
- Query params: `days` (default 30, max 90)

### 3. `/src/app/api/subscriptions/entitlements/route.ts`
- **GET** — Get entitlements for current plan
- Uses `withAuth` middleware
- Calls `entitlement-service.getEntitlements(plan)` for full entitlements map
- Calls `entitlement-service.getDisabledFeatures(plan)` for disabled features list
- Returns: plan, planLevel, entitlements, disabledFeatures, feature counts

### 4. `/src/app/api/subscriptions/upgrade-preview/route.ts`
- **POST** — Preview an upgrade (no actual change)
- Uses `withAuth` middleware
- Body: `{ plan, billingCycle, couponCode?, currency? }`
- Calculates: base pricing, yearly discount, coupon discount via `coupon-service.validateAndApplyCoupon()`, GST for INR, credit allocation, prorated adjustment, feature comparison via `comparePlans()`
- Logs audit event `upgrade_initiated` via `logBillingEvent()`
- Returns: preview details with pricing breakdown, coupon result, credit info, feature changes

### 5. `/src/app/api/subscriptions/downgrade-preview/route.ts`
- **POST** — Preview a downgrade (no actual change)
- Uses `withAuth` middleware
- Body: `{ plan }`
- Calculates: credit loss, features that will be lost via `comparePlans()`, effective date (end of current period)
- Logs audit event `downgrade_scheduled` via `logBillingEvent()`
- Returns: preview details with credit impact, feature loss warning, scheduled effective date

### 6. `/src/app/api/credits/history/route.ts`
- **GET** — Get paginated credit transaction history
- Uses `withAuth` + `withPermission(billing:read)`
- Query params: `page`, `limit`, `action`, `startDate`, `endDate`
- Calls `usage-service.getUsageHistory(userId, params)`
- Returns: paginated list of credit ledger entries with full pagination metadata

### 7. `/src/app/api/subscriptions/trial/route.ts`
- **GET** — Get trial status and info
- Uses `withAuth` middleware
- Calls `trial-service.getTrialInfo(userId)` for full trial details
- Calls `entitlement-service.getEntitlements()` for features available during trial
- Returns: trial status, days remaining, available features

## Files Modified (3)

### 8. `/src/app/api/credits/route.ts` (Enhanced)
**GET enhancements:**
- Now uses `credit-service.getCreditBalance()` instead of raw DB query
- Returns credit balance breakdown: monthly + rollover + addons
- Returns credit warning status: `ok` | `low` | `zero` (low = below 20% of monthly)
- Returns `creditActionEntitlements` map showing cost + enabled + limit for each action

**POST enhancements:**
- Now uses `credit-service.deductCredits()` instead of manual deduction — atomic, idempotent, audited
- Added `idempotencyKey` support from request body (prevents double-deduction)
- Added `referenceId` support for linking to external resources
- Added `ledgerEntryId` in response
- Added `alreadyProcessed` flag for idempotent responses
- Added credit warning detection: logs `credit_warning` or `credit_zero` billing events if credits drop below 20%/0
- Returns `creditWarning` status in response

### 9. `/src/app/api/payments/validate-coupon/route.ts` (Enhanced)
- **Was:** No auth at all! Used `db.coupon.findUnique()` with manual validation
- **Now:** Uses `withAuth` middleware — requires authentication
- Uses `coupon-service.validateAndApplyCoupon()` instead of manual validation
- Passes `userId` to track per-user coupon validation
- Accepts `baseAmount` for preview discount calculation
- Logs audit event `coupon_validated` via `logBillingEvent()` with userId, code, result

### 10. `/src/app/api/payments/create-order/route.ts` (Enhanced)
- **Was:** No auth! Used `db.user.findFirst()` with no auth check; manual coupon validation; no idempotency
- **Now:** Uses `withAuth` middleware — properly authenticated
- Uses pricing from centralized `PLAN_PRICING` config (matching subscription-service)
- Uses `coupon-service.validateAndApplyCoupon()` for coupon validation + discount
- Uses `coupon-service.incrementCouponUsage()` after successful application
- Added idempotency key support: checks for existing pending order with same key
- Validates plan change is valid via `isValidPlanChange()`
- Includes `PLAN_CREDITS[plan]` in response and audit metadata
- Logs `payment_initiated` audit event via `logBillingEvent()` with full metadata

## Architecture Patterns Used

All routes follow the same pattern:
1. Import `withAuth` / `withPermission` from `@/lib/auth-middleware`
2. Import service functions from `@/lib/` (subscription-service, credit-service, etc.)
3. Use `NextRequest` / `NextResponse` from `next/server`
4. Handle errors gracefully with proper HTTP status codes (400, 401, 402, 403, 404, 500)
5. All responses are JSON
6. Request/response bodies are typed with TypeScript interfaces
7. Billing audit events logged via `logBillingEvent()` from `@/lib/billing-audit`
8. IP and user agent captured via `getClientIp()` / `getUserAgent()` from `@/lib/auth`

## Lint Result
- 0 errors, 1 pre-existing warning (TanStack Table incompatible library)
- Dev server running cleanly with no compilation errors
