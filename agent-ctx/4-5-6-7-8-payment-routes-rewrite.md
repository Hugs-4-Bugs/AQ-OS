# Task 4-5-6-7-8 — Payment Routes Rewrite

## Task
Rewrite create-order, webhook, refund routes + create credit-renewal cron + cancel subscription route

## Work Completed

### Files Modified
1. **`src/lib/subscription-service.ts`** — Core service updates:
   - Added `CUSTOM_MONTH_MS = 2629800000` constant
   - Added `deriveSubscriptionType(plan, billingCycle)` function
   - Updated `confirmPaymentAndActivate()` — now accepts optional `subscriptionType` param, sets `cycleStartDate=now`, `nextCreditRenewalDate=now+CUSTOM_MONTH_MS`, `upgradeLockedUntil=periodEnd`
   - Rewrote `cancelSubscription()` — now accepts `{reason?, immediate?}` options
   - Updated `CancelResult` interface — added `remainingTimeMs`, `reason`, `immediate`
   - Added `processAllCreditRenewals()` — batch credit renewal for cron

2. **`src/app/api/payments/create-order/route.ts`** — Full rewrite:
   - Upgrade lock check before order creation (409 if locked)
   - subscriptionType derivation and storage
   - UPI + wallet for INR in Stripe checkout
   - subscriptionType in Stripe session metadata
   - Response includes subscriptionType and upgradeLocked

3. **`src/app/api/payments/webhook/stripe/route.ts`** — Full rewrite:
   - All 5 key Stripe webhook events with idempotency
   - subscriptionType propagation from metadata
   - cycleStartDate, nextCreditRenewalDate, upgradeLockedUntil management
   - Credit-based refund formula in charge.refunded handler

4. **`src/app/api/payments/refund/route.ts`** — Full rewrite:
   - Credit-based prorated refund: `(unusedCredits / totalCredits) × planAmount`
   - Minimum threshold (₹100 or $1)
   - 8-step refund process (remove credits, downgrade, cancel Stripe, audit, invoice, ledger)

### Files Created
5. **`src/app/api/cron/credit-renewal/route.ts`** — Cron endpoint:
   - Bearer token auth with CRON_SECRET
   - Calls `processAllCreditRenewals()`

6. **`src/app/api/subscriptions/cancel/route.ts`** — Cancel endpoint:
   - withAuth middleware
   - `{reason?, immediate?}` body
   - Graceful or immediate cancellation with Stripe sync

## Lint Status
- Zero errors on all modified/created files
- Dev server stable
