# Task 5: Webhook Enhancement + Entitlement Enforcement

## Work Record

### Part A: Webhook Enhancement

**Razorpay Webhook** (`src/app/api/payments/webhook/razorpay/route.ts`):
- Added `logSubscriptionEvent` import from billing-audit
- Added `resetMonthlyCredits` import from credit-service
- Added handler for `refund.created` / `refund.processed`:
  - Finds payment order by providerPaymentId
  - Updates order status to `refunded`
  - Creates user notification with refund amount/currency
  - Logs refund event via `logPaymentEvent`
  - Non-blocking error handling with try/catch
- Added handler for `subscription.changed` / `subscription.cancelled`:
  - Finds subscription by razorpaySubscriptionId
  - Updates subscription status/plan
  - For cancelled: downgrades user to free plan, resets credits
  - For changed: updates plan and resets credits if plan changed
  - Creates user notification
  - Logs via `logSubscriptionEvent`
  - Non-blocking error handling
- Added handler for `invoice.generated`:
  - Finds matching payment order by providerOrderId
  - Creates/updates invoice record via `db.invoice.upsert`
  - Logs payment event
  - Non-blocking error handling
- Updated handled events list for unhandled events check

**Stripe Webhook** (`src/app/api/payments/webhook/stripe/route.ts`):
- Added `logSubscriptionEvent` import from billing-audit
- Added `resetMonthlyCredits` import from credit-service
- Added handler for `charge.refunded`:
  - Finds payment order by payment_intent (providerPaymentId)
  - Updates order status to `refunded`
  - Creates user notification with refund amount/currency
  - Logs refund event via `logPaymentEvent`
  - Non-blocking error handling
- Added handler for `customer.subscription.updated`:
  - Finds subscription by stripeSubscriptionId
  - Maps Stripe status to internal status (active, trialing, past_due, canceled, expired)
  - Resolves plan from price metadata
  - Updates subscription, user, and credits
  - For cancelled/expired: downgrades user to free plan
  - Creates user notification
  - Logs via `logSubscriptionEvent`
  - Non-blocking error handling
- Added handler for `invoice.paid` / `invoice.payment_succeeded`:
  - Finds subscription by stripeSubscriptionId or stripeCustomerId
  - Resets monthly credits for subscription renewal
  - Updates subscription period dates and ensures active status
  - Creates/updates invoice record
  - Creates user notification
  - Logs via `logPaymentEvent`
  - Non-blocking error handling
- Updated handled events list for unhandled events check

### Part B: Entitlement Enforcement

1. `/api/leads/discover/route.ts`:
   - Added `requireFeatureAccess` and `PlanType` imports
   - Added entitlement check for `lead_discovery` feature after auth
   - Returns 403 with reason and requiredPlan if access denied

2. `/api/competitor/route.ts`:
   - Added `requireFeatureAccess` and `PlanType` imports
   - Added entitlement check for `competitor_analysis` feature in both GET and POST handlers
   - GET handler now receives `user: AuthUser` parameter (was `() =>`)
   - Returns 403 with reason and requiredPlan if access denied

3. `/api/ai/rag/context/route.ts`:
   - Added `requireFeatureAccess`, `PlanType`, and `AuthUser` imports
   - Added entitlement check for `sales_coaching` feature in both POST and GET handlers
   - Both handlers now receive `user: AuthUser` parameter (was `() =>`)
   - Fixed nesting issue in GET handler (merged try blocks)
   - Returns 403 with reason and requiredPlan if access denied

4. `/api/workflows/route.ts`:
   - Added `requireFeatureAccess` and `PlanType` imports
   - Added entitlement check for `workflow_access` feature in both GET and POST handlers
   - Returns 403 with reason and requiredPlan if access denied

## Verification
- ESLint: 0 new errors (9 pre-existing in legacy JS files only)
- Dev server: Running and compiling successfully
- All existing handlers preserved and unmodified
- All new webhook handlers use PaymentWebhook idempotency pattern
- All new handlers are non-blocking (errors don't crash the webhook)
