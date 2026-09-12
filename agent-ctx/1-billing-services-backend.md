# Task 1 — Backend Service Files: Subscription + Credits + Billing Foundation

## Agent: Main Agent
## Task ID: 1
## Phase: 4 — Subscription System + Credits Engine + Plan Gates + Billing

## Work Log

### Files Created (7 total):

1. **`/src/lib/billing-audit.ts`** — Dedicated billing audit logging
   - `BillingEventType` type union with 30+ event types (trial_*, credits_*, subscription_*, coupon_*, payment_*, entitlement_*, plan_change_*)
   - `logBillingEvent()` — Core logging function, writes to AuditLog with `resource='billing'`
   - Helper functions: `logTrialEvent()`, `logCreditEvent()`, `logSubscriptionEvent()`, `logEntitlementEvent()`, `logCouponEvent()`, `logPaymentEvent()`
   - `getBillingAuditHistory()` — Query billing events for a user with filtering
   - All functions silently fail — never block main flow

2. **`/src/lib/entitlement-service.ts`** — Complete plan entitlement system
   - `ENTITLEMENTS` config: free/pro/elite × 17 features with {limit, enabled}
   - Features: lead_discovery, deep_analysis, outreach_messages, outreach_sequences, sales_coaching, proposal_generation, competitor_analysis, data_export, gmail_integration, whatsapp_integration, telegram_access, workflow_access, api_access, chatbot_access, team_members, white_label, custom_integrations
   - `getEntitlements(plan)` — Get all entitlements for a plan
   - `checkEntitlement(plan, feature)` — Check if plan has feature enabled
   - `getFeatureLimit(plan, feature)` — Get limit (null=unlimited)
   - `hasFeatureAccess(plan, feature)` — Boolean check
   - `getPlanLevel(plan)` — Numeric level (0=free, 1=pro, 2=elite)
   - `canPerformAction(plan, action, currentUsage?)` — Check with limits
   - `getUpgradeRequiredPlan(currentPlan, feature)` — Minimum plan for feature
   - `getDisabledFeatures()`, `getEnabledFeatures()`, `comparePlans()`
   - `isValidPlanChange()`, `getPlanChangeDirection()`
   - `requireFeatureAccess()` — Gate function with audit logging
   - `seedPlanEntitlements()` — Seed PlanEntitlement table from config
   - `getEntitlementsFromDB()` — Get from DB with fallback to in-memory

3. **`/src/lib/trial-service.ts`** — Complete trial management
   - `startTrial(userId)` — 14-day Pro trial: sets user.plan=pro, isTrial=true, credits=500, creates Subscription w/ status=trialing
   - `checkTrialStatus(userId)` — Returns isActive, isExpired, daysRemaining
   - `expireTrial(userId)` — Downgrade to free, reset credits to 50, update subscription to expired
   - `hasUsedTrial(email)` — One trial per email check
   - `getTrialDaysRemaining(userId)` — Days remaining
   - `getTrialInfo(userId)` — Full trial info object
   - `scheduleTrialReminders(userId)` — Foundation for reminder scheduling (7, 3, 1, 0 days)
   - `expireOverdueTrials()` — Bulk operation for cron jobs
   - All operations use $transaction for atomicity

4. **`/src/lib/coupon-service.ts`** — Complete coupon architecture
   - `validateCoupon({code, plan, userId?})` — Full validation (active, expired, usage limit, applicable plans)
   - `applyCoupon({code, baseAmount, plan})` — Calculate discount (percent or fixed, never exceeds baseAmount)
   - `validateAndApplyCoupon()` — Combined validation + application
   - `incrementCouponUsage(code)` — Increment usedCount after use
   - `createCoupon(params)` — Create new coupon with validation
   - `deactivateCoupon(code)` — Soft delete (active=false)
   - `getActiveCoupons()` — List active coupons
   - `getCouponByCode()` — Get single coupon details
   - All validation failures logged via billing-audit

5. **`/src/lib/credit-service.ts`** — Complete credits engine with atomic operations
   - `deductCredits({userId, action, cost, referenceId?, idempotencyKey?})` — Atomic deduction with:
     - Balance check (NEVER allow negative)
     - Idempotency key support (check if already processed)
     - $transaction for atomicity (update user.credits + create CreditsLedger)
     - Returns {success, newBalance, ledgerEntryId, alreadyProcessed?}
     - Auto-logs credit_warning (≤10) and credit_zero (=0)
   - `addCredits({userId, amount, source, description?, referenceId?})` — Add credits with:
     - Duplicate detection (same referenceId + source within 5 min)
     - $transaction consistency
   - `rolloverCredits(userId)` — Monthly rollover (save unused as rolloverCredits, reset to plan allocation)
   - `resetMonthlyCredits(userId, plan)` — Reset monthly credits on plan change
   - `getCreditBalance(userId)` — Balance breakdown (monthly + rollover + addons)
   - `checkCreditSufficiency(userId, amount)` — Check without deducting
   - `refundCredits({userId, amount, originalAction, referenceId?})` — Refund for failed actions
   - `addCreditAddon()` — Purchase addon credits with CreditAddon record
   - `getActionCost()`, `getAllCreditCosts()` — Utility functions
   - CREDIT_COSTS mapping: lead_discovery=1, deep_analysis=5, outreach_message=2, outreach_sequence=8, sales_coaching=3, proposal_generation=10, competitor_analysis=8, data_export=5

6. **`/src/lib/subscription-service.ts`** — Complete subscription lifecycle management
   - Subscription states: trialing → active → past_due → canceled → expired
   - Valid transition map enforced
   - `getOrCreateSubscription(userId)` — Get or create (default: free, trialing)
   - `getSubscriptionStatus(userId)` — Full status with plan details + trial info
   - `upgradeSubscription(userId, plan, billingCycle)` — Create payment order, schedule upgrade
   - `downgradeSubscription(userId, plan)` — Schedule for end of period
   - `cancelSubscription(userId)` — Set cancelAtPeriodEnd=true
   - `reactivateSubscription(userId)` — Remove cancelAtPeriodEnd flag
   - `checkTrialExpiry(userId)` — Auto-downgrade if trial expired
   - `handleSubscriptionStateTransition(userId, fromStatus, toStatus)` — Validate & execute transitions
   - `processScheduledPlanChange(userId)` — Process at end of period
   - `confirmPaymentAndActivate(userId, paymentOrderId, providerPaymentId)` — Post-payment activation
   - `processEndOfPeriodSubscriptions()` — Bulk operation for cron jobs
   - `getPlanPricing()` — Plan pricing helper
   - Plan hierarchy: free < pro < elite, Billing cycles: monthly, yearly

7. **`/src/lib/usage-service.ts`** — Complete usage tracking
   - Uses CreditsLedger table (no separate UsageTracking table)
   - `recordUsage({userId, action, creditsUsed, metadata?})` — Record usage event
   - `getUsageSummary(userId, period?)` — Current billing period summary with by-action breakdown
   - `getUsageByAction(userId, action, period?)` — Per-action usage detail
   - `checkUsageLimit(userId, action, limit)` — Check if limit reached
   - `resetMonthlyUsage(userId)` — Reset billing period dates
   - `getUsageHistory(userId, params)` — Paginated history with filtering
   - `getQuotaStatus(userId)` — All features: used/limit/remaining/percentage
   - `getTopUsedFeatures(userId, limit)` — Top features for dashboards
   - `getDailyUsage(userId, days)` — Daily usage for charts/graphs

### Cross-Service Dependencies:
- `billing-audit.ts` — Standalone, no deps on other new services
- `entitlement-service.ts` — Imports `billing-audit` for logging
- `trial-service.ts` — Imports `billing-audit`, `entitlement-service`
- `coupon-service.ts` — Imports `billing-audit`, `entitlement-service` (PlanType)
- `credit-service.ts` — Imports `billing-audit`, `entitlement-service` (PLAN_CREDITS)
- `subscription-service.ts` — Imports `billing-audit`, `entitlement-service`, `credit-service`
- `usage-service.ts` — Imports `credit-service` (CreditAction), `entitlement-service`

### Lint Results:
- 0 errors
- 1 pre-existing warning (TanStack Table — unrelated to this task)

### All Critical Rules Followed:
- ✅ NEVER allow negative credits (balance check in deductCredits)
- ✅ ALWAYS use Prisma $transaction for atomicity
- ✅ ALWAYS create CreditsLedger entry for every operation
- ✅ ALWAYS log audit event for every credit/subscription/trial/coupon operation
- ✅ Support idempotency keys to prevent double-deduction
- ✅ Never throw unhandled errors — all functions return structured error objects
- ✅ Each function has clear return type (success/error pattern)
