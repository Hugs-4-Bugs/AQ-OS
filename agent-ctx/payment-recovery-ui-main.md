# Task: Payment Recovery UI — AcquisitionOS Phase 5

## Summary

Created a complete payment failure recovery UI component at `/home/z/my-project/src/components/dashboard/payment-recovery-ui.tsx` with 5 sub-components and an interactive demo page.

## Files Created/Modified

### Created
- **`/home/z/my-project/src/components/dashboard/payment-recovery-ui.tsx`** — Main component file with all 5 sub-components + default export
- **`/home/z/my-project/src/app/page.tsx`** — Updated to showcase the Payment Recovery UI with interactive demo

### Existing (No Changes Needed)
- `/home/z/my-project/src/app/api/payments/status/route.ts` — Already exists with `getPaymentStatus()`
- `/home/z/my-project/src/app/api/payments/retry/route.ts` — Already exists with `initiatePaymentRetry()`
- `/home/z/my-project/src/app/api/payments/cancel/route.ts` — Already exists with `cancelSubscription()`
- `/home/z/my-project/src/lib/payment-recovery-service.ts` — Full backend service already exists
- `/home/z/my-project/src/lib/subscription-store.ts` — Zustand store already exists

## Sub-components Exported

1. **`PastDueBanner`** — Red/orange warning banner for past_due subscriptions
   - Grace period countdown (X days remaining)
   - "Update Payment" and "Retry Payment" buttons
   - Dismissible but reappears on refresh
   - AlertTriangle icon with pulse animation for urgency

2. **`RetryPaymentCard`** — Card for retrying failed payments
   - Shows failed payment details (plan, amount, date, billing cycle)
   - "Retry Payment" button with loading state
   - "Change Plan" and "Cancel Subscription" links
   - Success/error states with animations
   - Calls POST /api/payments/retry

3. **`CancelSubscriptionCard`** — Card for confirming cancellation
   - Warning about what features will be lost
   - Expandable list of features removed per plan (Pro/Elite)
   - "Keep Subscription" (primary) and "Cancel Anyway" (destructive) buttons
   - Success state showing cancellation date
   - Calls POST /api/payments/cancel

4. **`GracePeriodCard`** — Grace period countdown & feature access
   - SVG circular progress indicator (days remaining / 7)
   - Progress bar with color-coded urgency
   - Live countdown timer (hours:minutes)
   - Feature access status grid (Available/Restricted badges)
   - Payment CTA button

5. **`PaymentStatusOverview`** — Full payment status dashboard
   - Status badge with color-coded icon
   - Current plan, next billing date, payment method (masked), failed payments
   - Grace period info section
   - Scheduled changes warning
   - Quick action buttons (Retry, Update Payment, Cancel)

6. **`PaymentRecoveryUI`** (default export) — Main orchestrator
   - Fetches from /api/payments/status on mount
   - Conditionally renders appropriate sub-components
   - Auto-refreshes every 30s when past_due
   - Handles loading/error states
   - Uses useSubscriptionStore() for current plan/status

## Design System
- Dark theme with oklch color variables from globals.css
- Uses existing shadcn/ui components (Card, Button, Badge, Separator, Alert, Progress)
- Framer-motion animations (fadeInUp, staggerItem, scaleIn)
- Responsive grid layout (1 col mobile, 2 col desktop)
- Color-coded urgency: green → amber → orange → red

## Demo Page
The `/` route now shows an interactive demo with 6 scenarios:
- Past Due, Grace Period (Urgent), Grace Period (Safe), Cancelled, Expired, Active
- Each scenario renders the appropriate sub-components with demo data

## Lint & Build
- `bun run lint` passes (only pre-existing warning in leads-tab.tsx)
- `npx tsc --noEmit` passes with zero errors
- Dev server compiles and renders successfully (HTTP 200)
