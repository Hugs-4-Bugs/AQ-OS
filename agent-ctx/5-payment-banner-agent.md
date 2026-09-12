# Task 5 — Payment Past-Due Banner

## Summary
Created a persistent payment past-due banner component that displays at the top of the dashboard when a user's subscription renewal payment has failed.

## Files Created
- `src/components/dashboard/payment-past-due-banner.tsx` — The banner component with amber/yellow warning style, framer-motion animation, sessionStorage dismiss, and responsive layout

## Files Modified
- `src/lib/subscription-store.ts` — Added `paymentPastDue` field to BackendSubscriptionData, SubscriptionState, DEFAULT_STATE, and syncFromBackend
- `src/app/api/subscriptions/current/route.ts` — Added `paymentPastDue` to API response by fetching from User DB record
- `src/components/dashboard/auth-gate.tsx` — Integrated PaymentPastDueBanner as topmost banner in AuthenticatedWrapper
- `worklog.md` — Appended work log entry

## Data Flow
DB User.paymentPastDue → /api/subscriptions/current → subscription-store → PaymentPastDueBanner

## Key Decisions
- Used `useSubscriptionStore` for paymentPastDue state (consistent with other banners)
- Lazy state initializer for sessionStorage read (avoids lint error with useEffect+setState)
- Banner positioned above TrialBanner and CreditWarningBanner (highest priority)
- Dismiss uses sessionStorage only (resets on new session as required)
- Amber/yellow color scheme matching the CreditWarningBanner pattern
