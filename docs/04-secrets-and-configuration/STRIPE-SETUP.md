# Stripe Setup Guide

> Read with `PAYMENTS-AND-BILLING.md`. Honest note: payments are currently INACTIVE in this deployment because no Stripe credentials are set — the flow below is what to do to activate it.

## 1. Create a Stripe Account

1. Sign up at [dashboard.stripe.com/register](https://dashboard.stripe.com/register) (business details can be added later in test mode).
2. Toggle **Test mode** while integrating (switch at top right); go Live later.

## 2. Get API Keys

*Developers → API keys*:

| Key | Env var | Format |
|---|---|---|
| Secret key | `STRIPE_SECRET_KEY` | `sk_test_...` (test) / `sk_live_...` (live) |
| Publishable key | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` / `pk_live_...` |

## 3. Products & Prices — IMPORTANT, READ

**This application does NOT use Stripe Price IDs.** `createCheckoutSession` in `src/lib/stripe-service.ts` builds inline `price_data` from amounts hardcoded in the file:

```ts
const PLAN_PRICES_USD = {
  pro:   { monthly: 29,  yearly: 279  },
  elite: { monthly: 89,  yearly: 849 },
};
const PLAN_PRICES_INR = {
  pro:   { monthly: 2299,  yearly: 22499 },
  elite: { monthly: 6999,  yearly: 67499 },
};
```

Plans: **free / pro / elite** (no separate "premium" tier in code). To change pricing, edit these constants — do not hunt for `STRIPE_PRICE_*` env vars (they are not read).

You can still create matching Products/Prices in the Stripe Dashboard for your own bookkeeping/invoicing, but the app will not reference them.

## 4. Set Up the Webhook Endpoint

*Developers → Webhooks → Add endpoint*

**URL (exact):**

```
https://your-domain.com/api/payments/webhook/stripe
```

(For local dev: use the Stripe CLI `stripe listen --forward-to localhost:3000/api/payments/webhook/stripe`.)

**Events to listen to** (mapped to app fulfillment logic):

| Event | What the app does |
|---|---|
| `checkout.session.completed` | Marks `PaymentOrder` completed, upserts `Subscription`, grants plan credits (`CreditsLedger`), generates `Invoice` + PDF + email |
| `invoice.paid` | Renewal fulfillment (period rollover, credit refresh) |
| `invoice.payment_failed` | Dunning: failure counters, recovery emails, past_due status |
| `customer.subscription.updated` | Sync plan/status/period/cancel-at-period-end |
| `customer.subscription.deleted` | Downgrade to free at period end |
| `charge.refunded` | Refund processing: reverse credits/plan per `refund-service` |

Copy the endpoint's **Signing secret** → `STRIPE_WEBHOOK_SECRET` (`whsec_...`). Webhook handling is idempotent — events are stored in `PaymentWebhook` keyed by unique `eventId`, so Stripe retries are safe.

## 5. Test Payments (Test Mode)

1. Card `4242 4242 4242 4242` with any future expiry + any CVC → succeeds.
2. `4000 0000 0000 9995` → declined (insufficient funds) — verifies failure UX.
3. `4000 0000 0000 0341` → succeeds then fails on renewal (tests dunning).
4. Flow to verify: billing page → Checkout modal → Stripe hosted page → success redirect to `/dashboard/billing?session_id=…&status=success` → subscription + credits visible → invoice generated.
5. Webhooks: check *Developers → Webhooks → your endpoint → Attempts* shows `200` responses (the app returns non-200 if signature fails — check `STRIPE_WEBHOOK_SECRET`).

## 6. Switch Test → Live

1. Flip the dashboard to Live mode; grab `sk_live_...` (+ `pk_live_...`).
2. Add a **Live-mode webhook endpoint** (test and live webhooks are separate!) and copy its `whsec_...`.
3. Replace the three env vars in your production platform; keep variable names identical.
4. Only real cards work in live mode; money movement requires completed account activation (payouts, tax details).
5. Update `APP_URL`/`NEXT_PUBLIC_APP_URL` to the live domain if not already — success/cancel URLs are built from it.

## 7. How the Stripe Webhook Works With This Application

```
Stripe event → POST /api/payments/webhook/stripe
   ├─ constructEvent(payload, sig, STRIPE_WEBHOOK_SECRET)   → reject if signature invalid (400)
   ├─ PaymentWebhook.create({eventId unique, type, payload}) → duplicate eventId = skip (idempotent)
   ├─ switch(eventType): fulfillment per table above (subscription/credits/invoice/refund)
   └─ mark processed / record processingError (visible in admin → billing → webhooks)
```

Failure recovery tooling that exists: admin webhook log viewer (`/api/admin/billing/webhooks`), failed payments list, manual retry (`/api/payments/retry`), reconciliation cron (`/api/cron/payment-reconciliation`), and webhook replay (`/api/payments/webhook-replay`).

## 8. Troubleshooting Quick List

| Symptom | Likely cause |
|---|---|
| Checkout fails instantly, no Stripe page | `STRIPE_SECRET_KEY` missing/invalid, or plan/price resolution failed — check server logs |
| "Payment failed immediately without reaching Stripe" | Same as above; also verify the request body carries the plan |
| Redirected but plan didn't change | Webhook didn't arrive/signature failed — check Stripe webhook attempts + `STRIPE_WEBHOOK_SECRET` |
| `No signatures found` in logs | Wrong webhook secret (test secret used on live endpoint or vice versa) |
| Duplicate fulfillment | Shouldn't happen (eventId unique); if seen, check for a second webhook endpoint registered |
