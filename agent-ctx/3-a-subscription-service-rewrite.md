# Task 3-a: Subscription Service Rewrite

## Summary
Rewrote `/home/z/my-project/src/lib/subscription-service.ts` with subscription types, upgrade lock engine, and custom 365/12 day cycle.

## Key Changes

### 1. Subscription Types (PRIMARY IDENTITY)
- `SubscriptionType` union: FREE_MONTHLY, PRO_MONTHLY, PRO_YEARLY, ELITE_MONTHLY, ELITE_YEARLY
- `getSubscriptionType(plan, billingCycle)` maps plan+cycle → subscription type
- `getSubscriptionDisplayLabel(subscriptionType)` returns human-readable labels

### 2. Custom Month Cycle
- `CUSTOM_MONTH_MS = 2629800000` (365/12 days)
- `CUSTOM_YEAR_MS = 31557600000` (12 × CUSTOM_MONTH_MS)
- Paid plans: cycle starts at purchase timestamp, renewal = previous + CUSTOM_MONTH_MS
- FREE_MONTHLY: calendar month reset (1st of each month via `getNextCalendarMonthStart()`)

### 3. Upgrade Lock Engine
- `isUpgradeLocked(userId)` → `{ locked, lockedUntil, remainingMs }`
- `checkUpgradeLockAndReject(userId)` → `{ allowed, error?, lockedUntil? }`
- Integrated into `upgradeSubscription()` and `downgradeSubscription()`
- Credit add-ons bypass lock check

### 4. Updated confirmPaymentAndActivate
- Sets subscriptionType, cycleStartDate=now, nextCreditRenewalDate=now+CUSTOM_MONTH_MS
- Sets upgradeLockedUntil=currentPeriodEnd
- Sets billingCycle from payment order
- Yearly plans: first month's credits only

### 5. Updated cancelSubscription
- Returns `remainingMs` (time until period end)
- Does NOT immediately cancel (cancelAtPeriodEnd=true)

### 6. processEndOfPeriodSubscriptions
- Handles cancelAtPeriodEnd subscriptions (expired → downgrade to free)
- Processes scheduled plan changes with new subscription type

### 7. New Functions
- `renewCreditsForCycle(userId)` — per-user credit renewal with rollover caps
- `processAllCreditRenewals()` — batch processes all due renewals
- `getNextCalendarMonthStart(fromDate)` — helper for calendar month reset

### 8. Pricing
- INR: FREE=0, PRO_MONTHLY=₹2499, PRO_YEARLY=₹23990, ELITE_MONTHLY=₹7999, ELITE_YEARLY=₹76790

### 9. Rollover Limits
- free: 0, pro: 200, elite: 1000

## Preserved
- All original imports (db, logSubscriptionEvent, PLAN_CREDITS, resetMonthlyCredits)
- VALID_TRANSITIONS map
- All existing Result interfaces (extended with new fields)
- Reactivate, trial expiry, state transition logic
