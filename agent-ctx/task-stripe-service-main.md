# Task: Create stripe-service.ts

## Agent: Main Agent
## Status: COMPLETED

## Summary
Created `/home/z/my-project/src/lib/stripe-service.ts` — a comprehensive, production-grade Stripe integration service for AcquisitionOS.

## What was created
A ~750-line TypeScript file implementing the complete Stripe payment lifecycle:

### Core Functions
1. **`createCheckoutSession(params)`** — Creates Stripe Checkout Sessions for subscription signups
   - Creates/retrieves Stripe customer
   - Builds line items with USD/INR price support
   - Applies coupon discounts (Stripe Coupons or manual)
   - Stores PaymentOrder in DB with provider='stripe'
   - Returns { sessionId, url, paymentOrderId }

2. **`verifyWebhookSignature(body, sigHeader)`** — Verifies Stripe webhook signatures using `stripe.webhooks.constructEvent()`

3. **`processWebhookEvent(event)`** — Routes verified events to handlers with idempotency checking

4. **`handleCheckoutSessionCompleted(event)`** — Atomic DB transaction for:
   - Update PaymentOrder → completed
   - Update/create Subscription record
   - Update User (plan, credits, isTrial=false)
   - Create CreditsLedger entry
   - Create Invoice record
   - Increment coupon usage

5. **`handleInvoicePaymentSucceeded(event)`** — Handles recurring payments, adds monthly credits

6. **`handleInvoicePaymentFailed(event)`** — Sets subscription to 'past_due', logs failure

7. **`handleCustomerSubscriptionDeleted(event)`** — Expires subscription, downgrades user to free

8. **`handleCustomerSubscriptionUpdated(event)`** — Handles plan changes (upgrades immediately, schedules downgrades)

### Additional Functions
- `createCustomerPortalSession()` — Stripe Billing Portal
- `cancelStripeSubscription()` — Cancel at period end
- `reactivateStripeSubscription()` — Remove cancel_at_period_end
- `getStripeSubscriptionDetails()` — Retrieve Stripe subscription
- `isStripeConfigured()` — Feature flag check
- `getStripePlanPrice()` — Frontend-safe price display

### Design Decisions
- Lazy Stripe singleton initialization (doesn't throw at import-time)
- Idempotency via PaymentWebhook table (upsert pattern)
- All critical DB operations use `$transaction`
- Coupon discount via Stripe Coupons API when possible, falls back to manual price adjustment
- Audit logging for all billing events via existing billing-audit service
- Pricing: Pro $29/mo, Pro $279/yr, Elite $89/mo, Elite $849/yr (USD); INR variants included

## Verification
- ESLint: 0 errors (pre-existing warning in unrelated file)
- Dev server: Running normally, no compilation errors
