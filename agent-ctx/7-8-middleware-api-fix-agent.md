# Task 7-8: Add Payment Provider Status API and Fix Middleware for Webhooks

## Work Completed

### Part A: Payment Provider Status API
- Created `/src/app/api/payments/provider-status/route.ts`
- Public GET endpoint (no auth required)
- Returns: Stripe availability, mode (test/live), publishable key
- Returns: Razorpay availability, mode (test/live), key ID
- Returns: `anyAvailable` boolean for quick frontend check

### Part B: Middleware Fixes
- Added `/api/payments/provider-status` to `PUBLIC_ROUTES` array in middleware
- Verified `/api/payments/webhook/stripe` and `/api/payments/webhook/razorpay` already bypass auth via `/api/payments/webhook` prefix match with `startsWith`
- Verified `/api/cron` sub-routes already bypass auth via `/api/cron` prefix match
- Verified CSRF protection does NOT block webhook endpoints — public routes skip both CSRF and auth

### Part C: Stripe Checkout Updates
- Added `billing_address_collection: 'auto'` to Stripe checkout session for proper tax handling
- Extracted `payment_method_types` into explicit variable with currency-aware documentation
- Maintained `['card']` as base for both USD and INR currencies
- Documented that Google Pay is auto-available via Payment Request API
- Documented extensibility for UPI/wallets via Stripe India

## Files Modified
1. `/src/app/api/payments/provider-status/route.ts` — NEW
2. `/src/middleware.ts` — Added `/api/payments/provider-status` to PUBLIC_ROUTES
3. `/src/app/api/payments/create-order/route.ts` — Added billing_address_collection + payment_method_types variable
4. `/worklog.md` — Appended work record
