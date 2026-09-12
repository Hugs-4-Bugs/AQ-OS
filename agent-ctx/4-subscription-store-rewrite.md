# Task 4 — Subscription Store Rewrite + Credits Hook Enhancement

## Summary
Rewrote the subscription store and use-credits hook to integrate with real backend API routes, replacing mock data and client-only credit logic with a fully backend-synced subscription system.

## Files Modified

### 1. `/src/lib/subscription-store.ts` — Complete rewrite
**Before:** Simple Zustand store with mock data (currentPlan='pro', credits=347), client-only credit logic, no entitlements support.

**After:** Enhanced store with full backend sync support:

- **All existing type exports preserved** (PlanType, CreditAction, PlanDetails, CREDIT_COSTS, ACTION_LABELS, PLAN_DETAILS) — backward compatible with all consumers
- **New types added:**
  - `BackendSubscriptionData` — matches `/api/subscriptions/current` response shape
  - `BackendEntitlementsData` — matches `/api/subscriptions/entitlements` response shape
- **New state fields:**
  - `subscriptionStatus` ('trialing'|'active'|'past_due'|'canceled'|'expired')
  - `billingCycle` ('monthly'|'yearly')
  - `rolloverCredits`, `addonCredits`
  - `trialDaysRemaining`
  - `entitlements` (Record<string, {limit, enabled}>)
  - `disabledFeatures` (string[])
  - `creditWarningStatus` ('ok'|'low'|'zero')
  - `isLoading`, `lastFetchedAt`
- **New computed methods:**
  - `canPerform(action)` — now checks BOTH credits AND entitlements (was credits-only)
  - `hasFeatureAccess(feature)` — checks entitlements map
  - `getUpgradePlanForFeature(feature)` — returns minimum PlanType needed for a disabled feature
- **New setters:**
  - `setEntitlements`, `setSubscriptionStatus`, `setRolloverCredits`, `setAddonCredits`
  - `setCreditWarningStatus`, `setLoading`
  - `syncFromBackend(data)` — updates ALL fields from BackendSubscriptionData
  - `syncEntitlements(data)` — updates entitlements from BackendEntitlementsData
  - `reset()` — resets to defaults (for logout)
- **Default values:** currentPlan='free', credits=50, creditsMonthly=50, isTrial=true, trialDaysRemaining=14, subscriptionStatus='trialing'
- **Credit warning logic:** >20% → 'ok', 1-20% → 'low', 0 → 'zero'

### 2. `/src/hooks/use-credits.ts` — Complete rewrite
**Before:** Simple hook fetching `/api/credits`, basic 402 handling, no entitlements.

**After:** Full-featured hook with:

- **New `useSubscriptionSync()` hook:**
  - Fetches `/api/subscriptions/current` and `/api/subscriptions/entitlements` in parallel
  - Syncs all data to the enhanced store via `syncFromBackend()` and `syncEntitlements()`
  - Falls back to `/api/credits` if subscription endpoint fails
  - Only syncs once per mount or when data is stale (>5 min)
  - Designed to be called once in AuthGate
- **Enhanced `useCredits()` hook:**
  - Syncs rolloverCredits, addonCredits, creditWarningStatus, entitlements from credits response
  - Better 402 handling with detailed error messages
  - 403 handling for feature-not-available-on-plan errors
  - onError callback refetches real balance to correct optimistic deductions
  - Exposes new store fields: trialDaysRemaining, rolloverCredits, addonCredits, subscriptionStatus, creditWarningStatus, entitlements, disabledFeatures
- **All existing consumers remain compatible** — same return shape + new optional fields

## Backward Compatibility
- All existing type exports unchanged
- All existing store selectors still work (currentPlan, credits, creditsMonthly, isTrial, trialEndsAt)
- All existing method signatures preserved (canPerform, deductCredits, getActionCost, getPlanDetails, getCreditPercentage)
- Default values changed from mock ('pro'/347) to production defaults ('free'/50) — this is intentional

## Lint Status
- 0 errors in modified files
- Pre-existing errors in trial-banner.tsx and usage-limit-banner.tsx (unrelated)
- Pre-existing TanStack Table warning (unrelated)
