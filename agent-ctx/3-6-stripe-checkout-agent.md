# Task 3-6: Stripe Checkout and Frontend Payment Provider Detection

## Agent: stripe-checkout-agent

## Summary
Added frontend payment provider detection to proactively show users whether a payment provider is configured, instead of only surfacing errors after clicking "Pay Now".

## Files Changed
1. **`/src/hooks/use-payment-providers.ts`** (NEW) — Hook that fetches `/api/payments/provider-status` on mount
2. **`/src/components/dashboard/upgrade-modal.tsx`** — Added provider status banners (amber warning / green info)
3. **`/src/components/dashboard/pricing-page.tsx`** — Added provider status banners + dynamic trust/payment text
4. **`package.json`** — Added `@stripe/stripe-js@9.6.0`

## Key Design Decisions
- Used existing `/api/payments/provider-status` endpoint (already created by Task 7-8) instead of creating a new one
- When NO provider is configured: amber banner with exact env var names (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`)
- When a provider IS configured: green banner showing provider name + test/live mode badge
- Footer trust text dynamically shows actual provider name instead of hardcoded "Razorpay & Stripe"
- Payment methods description adapts to active provider (Stripe → Apple Pay/Google Pay; Razorpay → UPI/net banking)

## Verified
- `/api/payments/create-order/route.ts` already includes `hint` field in 503 response
- `/api/payments/provider-status/route.ts` already exists with correct structure
- Lint passes (only pre-existing errors in non-project JS files)
- Dev server compiles and runs successfully
