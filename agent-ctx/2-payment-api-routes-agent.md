# Task ID: 2
# Agent: Payment API Routes Agent
# Task: Phase 5 — Create ALL payment API routes

## Work Summary

Created and rewrote all 11 payment API routes for AcquisitionOS Phase 5 Payments System.

## Files Written/Rewritten (11 total)

### Rewritten Routes (5)

1. **`/src/app/api/payments/create-order/route.ts`** — REWRITTEN
   - Now delegates to `createPaymentOrder()` from `@/lib/payment-service`
   - Uses `withAuth` middleware
   - Validates plan, billingCycle, currency
   - Logs billing events with `logBillingEvent()`
   - Returns Razorpay config (orderId, keyId, amount, GST breakdown)
   - Handles idempotency via payment-service

2. **`/src/app/api/payments/webhook/razorpay/route.ts`** — REWRITTEN
   - Now delegates to `processRazorpayWebhook()` from `@/lib/webhook-processor`
   - NO AUTH (webhooks come from Razorpay)
   - Reads body as `request.text()` (NOT JSON) for signature verification
   - ALWAYS returns `{ success: true }` (200) to prevent provider retries
   - All verification, idempotency, replay protection handled by webhook-processor

3. **`/src/app/api/payments/webhook/stripe/route.ts`** — REWRITTEN
   - Now delegates to `processStripeWebhook()` from `@/lib/webhook-processor`
   - NO AUTH (webhooks come from Stripe)
   - Reads body as `request.text()` (NOT JSON) for signature verification
   - ALWAYS returns `{ success: true }` (200) to prevent provider retries
   - All verification, idempotency, replay protection handled by webhook-processor

4. **`/src/app/api/payments/validate-coupon/route.ts`** — KEPT AS-IS
   - Already properly implemented with withAuth, coupon-service, audit logging

5. **`/src/app/api/payments/credit-addons/route.ts`** — REWRITTEN
   - Added `withAuth` middleware to POST handler
   - Fixed critical bug: was using `db.user.findFirst()` with no where clause (picks random user)
   - Now uses `user.id` from authenticated session
   - Added input validation (addonId, currency)
   - Added audit logging via `logBillingEvent()`

### New Routes (6)

6. **`/src/app/api/payments/create-stripe-session/route.ts`** — NEW
   - POST handler with `withAuth`
   - Creates Stripe Checkout Session via `createStripeCheckoutSession()` from payment-service
   - Validates plan, billingCycle, successUrl, cancelUrl
   - Returns `{ sessionId, url }` for Stripe redirect
   - Logs billing events

7. **`/src/app/api/payments/invoices/route.ts`** — NEW
   - GET handler with `withAuth`
   - Query params: `?limit=20&offset=0` (clamped 1-100)
   - Delegates to `getInvoicesForUser()` from invoice-service
   - Returns `{ invoices: [], total: number }`

8. **`/src/app/api/payments/invoices/[id]/route.ts`** — NEW
   - GET handler with `withAuth`
   - Uses `getInvoiceForUser()` for ownership verification
   - Returns full invoice data + HTML (via `generateInvoiceHTML()`)
   - Supports `Accept: text/html` header for direct HTML response
   - Returns 404 if invoice not found or doesn't belong to user

9. **`/src/app/api/payments/retry/route.ts`** — NEW
   - POST handler with `withAuth`
   - Body: `{ failedOrderId: string }`
   - Delegates to `retryPayment()` from payment-service
   - Returns new order config (Razorpay or Stripe)
   - Proper status codes: 404 (not found), 403 (not owner), 400 (not failed), 429 (max retries)

10. **`/src/app/api/payments/cancel/route.ts`** — NEW
    - POST handler with `withAuth`
    - Body: `{ reason?: string }`
    - Delegates to `cancelSubscriptionPayment()` from payment-service
    - Sets `cancelAtPeriodEnd=true` (doesn't immediately cancel)
    - Returns `{ success, cancelAtPeriodEnd, currentPeriodEnd }`

11. **`/src/app/api/payments/history/route.ts`** — NEW
    - GET handler with `withAuth`
    - Query params: `?limit=20&offset=0` (clamped 1-100)
    - Delegates to `getPaymentHistory()` from payment-service
    - Returns `{ orders: [], total: number }` with invoice data embedded

12. **`/src/app/api/payments/preview/route.ts`** — NEW
    - GET handler with `withAuth`
    - Query params: `?plan=pro&billingCycle=monthly`
    - Delegates to `getBillingPreview()` from payment-service
    - Returns proration credit, tax breakdown, effective date

## Architecture Decisions

- **Service delegation**: All routes delegate business logic to service layer (`payment-service`, `webhook-processor`, `invoice-service`). Routes only handle HTTP concerns (validation, serialization, status codes).
- **Audit logging**: Every route logs relevant billing events using `logBillingEvent()` with IP and user agent.
- **Webhook security**: Webhook routes NEVER require auth, ALWAYS read body as text, ALWAYS return 200.
- **Error handling**: Routes return appropriate HTTP status codes (400, 403, 404, 409, 429, 500).
- **Consistent patterns**: All auth-protected routes use `withAuth()`, all query params are validated and clamped.

## Lint Results
- Zero lint errors in all payment route files
- Pre-existing errors in unrelated files (checkout-modal.tsx, leads-tab.tsx)
- Dev server running cleanly with no compilation errors
