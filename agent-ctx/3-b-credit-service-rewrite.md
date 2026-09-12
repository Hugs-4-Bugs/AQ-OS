# Task 3-b: Rewrite credit-service.ts

## Agent: credit-service-rewrite

## Summary
Rewrote `/home/z/my-project/src/lib/credit-service.ts` with custom month cycle, yearly monthly allocation, free calendar reset, and plan-specific rollover limits.

## Key Changes

### New Constants & Helpers
- `CUSTOM_MONTH_MS` = 2629800000ms (365/12 days)
- `getNextCalendarMonthReset()` → 1st of next calendar month (for FREE_MONTHLY)
- `getRolloverLimit(plan)` → free:0, pro:200, elite:1000
- `calculateCreditRenewalDate(subscriptionType, currentRenewalDate, cycleStartDate)` → routes FREE_MONTHLY to calendar month, paid plans to custom cycle
- `getPlanFromSubscriptionType()` → internal helper to extract base plan from subscription type string

### Updated Functions
- `rolloloverCredits(userId)` → now respects plan-specific rollover caps, returns `{ success, rolloverAmount, newMonthly, newRollover }`
- `resetMonthlyCredits(userId, plan)` → new signature (plan: string), calculates rollover, updates nextCreditRenewalDate in subscription, returns `{ success, newCredits, rolloverKept }`
- `getCreditBalance(userId)` → now includes `subscriptionType` field in result

### Updated Interfaces
- `RolloverResult`: removed `previousBalance`, added `newRollover`
- `ResetMonthlyResult`: new interface with `newCredits` and `rolloverKept`
- `CreditBalanceResult`: added `subscriptionType: string | null`

### Unchanged Functions
- `deductCredits` — kept as-is
- `addCredits` — kept as-is
- `checkCreditSufficiency` — kept as-is
- `refundCredits` — kept as-is
- `addCreditAddon` — kept as-is (credit add-ons always allowed)

## Files Modified
- `/home/z/my-project/src/lib/credit-service.ts` — complete rewrite

## Lint Status
No new errors introduced. Pre-existing errors in .js files only.
