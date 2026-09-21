# AcquisitionOS — Payment System (Stripe + Razorpay)

A complete guide to how payments work in AcquisitionOS, and how to configure
both gateways. Written for someone with **no prior payment-integration
experience** — every step is explicit.

**Both Stripe and Razorpay are fully supported and coexist.** The user picks a
gateway at checkout. Neither one can be removed without breaking the other.

> Companion docs:
> - `docs/04-secrets-and-configuration/STRIPE-SETUP.md` — Stripe dashboard walkthrough
> - `docs/04-secrets-and-configuration/RAZORPAY-SETUP.md` — Razorpay dashboard walkthrough
> - `.env.example` — every environment variable with placeholders

---

## 1. The 60-second mental model

```
User picks a plan (Pro / Elite)
        │
        ▼
User picks a gateway (Stripe or Razorpay)          ← UI step in upgrade modal
        │
        ▼
Server creates the checkout                         ← amounts computed SERVER-SIDE
   • Stripe  → hosted Checkout Session (redirect)      (never trusted from browser)
   • Razorpay→ Order or Subscription (Checkout.js modal)
        │
        ▼
User pays on the gateway's page
        │
        ▼
Payment verified SERVER-SIDE                        ← the only trust boundary
   • Stripe  → webhook signature check
   • Razorpay→ HMAC signature + gateway payment fetch + amount match
        │
        ▼
Unified Payment Service (shared by BOTH gateways)
   • PaymentOrder marked completed (idempotent, atomic)
   • Subscription activated (period dates, plan, status)
   • Credits granted (PLAN_CREDITS + rollover) + CreditsLedger entry
   • Invoice generated
        │
        ▼
UI refreshes (store sync / SSE) → success state
```

**Golden rule:** the browser never decides anything. A payment is "successful"
only when the backend says so after verifying with the gateway.

---

## 2. Architecture (provider abstraction)

All gateway-specific behavior lives behind one interface:

```
src/lib/payments/
├── types.ts               PaymentProvider interface, shared types
├── plan-config.ts         THE plan → gateway mapping (single source of truth)
├── stripe-provider.ts     Stripe adapter (delegates to payment-service.ts)
├── razorpay-provider.ts   Razorpay adapter (orders, subscriptions, verification)
└── index.ts               Registry: getPaymentProvider(), availability lists
```

Shared services (never duplicated per gateway):

| Concern | Implementation |
|---|---|
| Activation (plan + credits + invoice + ledger) | `confirmPaymentAndActivate()` in `src/lib/subscription-service.ts` |
| Credit add-on fulfillment | `fulfillCreditAddon()` in `src/lib/credit-addon-fulfillment.ts` |
| Credit math | `src/lib/credit-service.ts` (`PLAN_CREDITS` from `entitlement-service.ts`) |
| Idempotent webhook records | `PaymentWebhook` table (`eventId @unique`) |
| Webhook replay/monitoring | `src/lib/webhook-replay-service.ts`, `/api/payments/webhook-replay` |

To add a future gateway: implement `PaymentProvider`, register it in
`src/lib/payments/index.ts`. No other application code changes.

---

## 3. Plans, prices, currencies

Plan catalog (single source: `src/lib/payments/plan-config.ts`, mirrored by the
pricing UI in `src/lib/subscription-store.ts`):

| Plan | USD monthly | USD yearly | INR monthly | INR yearly | Credits |
|---|---|---|---|---|---|
| Pro  | $19 | $144 | ₹1,599 | ₹11,999 | 500 |
| Elite | $63 | $456 | ₹5,199 | ₹37,999 | 2,000 |

- **Stripe** charges **USD** using the Stripe Price object (the Price in the
  Stripe dashboard is the authoritative amount — the app never sends amounts).
- **Razorpay** charges **INR** (amounts computed server-side from the table
  above; 18% GST added for Indian users). If your Razorpay account supports
  more currencies, set `RAZORPAY_SUPPORTED_CURRENCIES`.
- Credit add-on packs (100/500/1,000 credits) are purchasable on **both**
  gateways.

Do **not** invent new plans — edit `plan-config.ts` + `subscription-store.ts`
together if pricing ever changes.

---

## 4. Environment variables

Copy `.env.example` → `.env` and fill in. Summary:

### Stripe
| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Server-side API (`sk_test_…` / `sk_live_…`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Browser-safe key (`pk_…`) |
| `STRIPE_WEBHOOK_SECRET` | Verifies webhook calls (`whsec_…`) |
| `STRIPE_{PLAN}_{CYCLE}_PRICE_ID` | Price IDs: `STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_PRO_YEARLY_PRICE_ID`, `STRIPE_ELITE_MONTHLY_PRICE_ID`, `STRIPE_ELITE_YEARLY_PRICE_ID` (legacy aliases also accepted, see `resolvePlanPriceId`) |
| `STRIPE_PRICE_CREDITS_{100,500,1000}_ID` | Optional one-time prices for credit packs |

### Razorpay
| Variable | Purpose |
|---|---|
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | API keys (`rzp_test_…` / `rzp_live_…`) |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Browser-safe key id for Checkout.js |
| `RAZORPAY_WEBHOOK_SECRET` | Verifies webhook calls |
| `RAZORPAY_PLAN_{PLAN}_{CYCLE}` | **Optional** Razorpay Plan IDs → enables recurring subscriptions |
| `RAZORPAY_SUBSCRIPTION_TOTAL_COUNT_{MONTHLY,YEARLY}` | Optional tenure (defaults 12 / 5 cycles) |
| `RAZORPAY_SUPPORTED_CURRENCIES` | Default `INR` |

Never commit real values. Secrets live only in the server environment.

---

## 5. Stripe setup (test mode first)

Full walkthrough: `docs/04-secrets-and-configuration/STRIPE-SETUP.md`.

1. Create a Stripe account → stay in **Test mode** (toggle in dashboard).
2. **Products** → create "AcquisitionOS Pro" and "AcquisitionOS Elite" with
   recurring USD prices (monthly + yearly). Copy each `price_…` id.
3. Put the ids in env vars (see table above) and restart the app.
4. **Developers → Webhooks** → add endpoint:
   - URL: `https://YOUR-DOMAIN/api/payments/webhook/stripe`
   - Events: `checkout.session.completed`, `checkout.session.expired`,
     `payment_intent.succeeded`, `invoice.paid`, `invoice.payment_succeeded`,
     `invoice.payment_failed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`,
     `charge.refunded`, `charge.dispute.created`
   - Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.
5. Local development: use the Stripe CLI
   (`stripe listen --forward-to localhost:3000/api/payments/webhook/stripe`).

## 6. Razorpay setup (test mode first)

Full walkthrough: `docs/04-secrets-and-configuration/RAZORPAY-SETUP.md`.

1. Create a Razorpay account → **Test** keys from Dashboard → Settings → API Keys.
2. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`.
3. **Recurring (optional but recommended for subscriptions):**
   Dashboard → Subscriptions → Plans → create plans matching
   Pro/Elite × monthly/yearly in INR. Copy each `plan_…` id into
   `RAZORPAY_PLAN_PRO_MONTHLY` etc. Without plan ids, Razorpay checkout still
   works using one-time orders (renewals handled by the end-of-period cron).
4. **Settings → Webhooks** → add endpoint:
   - URL: `https://YOUR-DOMAIN/api/payments/webhook/razorpay`
   - Secret: any strong string → same value in `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured`, `payment.failed`, `refund.created`,
     `refund.processed`, `subscription.charged`, `subscription.cancelled`,
     `subscription.halted`, `subscription.completed`

---

## 7. The checkout flows, step by step

### 7.1 Stripe
1. UI: plan card → gateway step → **Stripe**.
2. `POST /api/payments/create-checkout-session` `{ plan, billingCycle, couponCode }`.
3. Server validates plan change, resolves the Stripe Price ID from env, creates
   a `PaymentOrder` (pending) + a real Checkout Session (mode `subscription`),
   returns `{ url }`.
4. Browser redirects to Stripe's hosted page. No card data ever touches our
   servers.
5. Success → `/dashboard?payment=success&session_id=…`; cancel → `?payment=cancelled`.
6. Stripe sends `checkout.session.completed` → webhook verifies signature →
   `confirmPaymentAndActivate()` runs → subscription active + credits granted.
7. `/api/payments/verify-session` covers the case where the user returns before
   the webhook lands (double-safe: still server-verified).

### 7.2 Razorpay (one-time order)
1. UI: plan card → gateway step → **Razorpay**.
2. `POST /api/payments/create-checkout-session` `{ gateway: 'razorpay', plan, billingCycle, couponCode }`.
3. Server computes the INR amount (price table + coupon + GST), creates a
   Razorpay order + pending `PaymentOrder`, returns
   `{ razorpayOrderId, razorpayKeyId, razorpayAmount, razorpayCurrency, prefill }`.
4. Browser opens Razorpay Checkout.js (`order_id` + server amount).
5. On success the handler returns `razorpay_order_id`, `razorpay_payment_id`,
   `razorpay_signature`.
6. Browser posts them to `POST /api/payments/razorpay/verify`, which:
   - verifies `HMAC-SHA256(order_id|payment_id, key_secret)` (constant-time),
   - re-fetches the payment from Razorpay's API (status must be captured/authorized),
   - checks the paid amount equals the stored order amount (±0.01),
   - records an idempotency marker (`checkout_verify_<paymentId>`),
   - runs the same `confirmPaymentAndActivate()` used by the webhook.
7. UI re-syncs the subscription store → success state.

### 7.3 Razorpay (recurring subscription — when plan IDs are configured)
Same as above, but step 3 creates a **Razorpay Subscription** (via
`subscriptions.create` with the mapped `plan_id`) and checkout opens with
`subscription_id`. The **first `subscription.charged` webhook** activates the
subscription (resolving the order via `providerSubscriptionId` or subscription
notes). Renewals trigger `subscription.charged` again → credits reset for the
new period. `subscription.halted` → `past_due` (recoverable);
`subscription.cancelled` / `subscription.completed` → expired + downgrade to free.

---

## 8. Subscriptions: states and transitions

`Subscription.status`: `trialing → active → past_due → canceled/expired`
(validated by `VALID_TRANSITIONS` in `subscription-service.ts`).

| Event | Stripe | Razorpay |
|---|---|---|
| Activation | `checkout.session.completed` | `payment.captured` / `subscription.charged` / verify route |
| Renewal | `invoice.payment_succeeded` | `subscription.charged` |
| Failed payment | `invoice.payment_failed` → `past_due` + dunning | `payment.failed`, `subscription.halted` → `past_due` |
| Cancellation | `customer.subscription.deleted` | `subscription.cancelled` |
| Expiration | period end (cron `end-of-period`) | `subscription.completed` / cron |
| Refund (full) | `charge.refunded` → downgrade | `refund.processed` → downgrade |

Cron jobs (all guarded by `CRON_SECRET`):
- `/api/cron/end-of-period` + `/api/cron/credit-renewal` — period rollovers
- `/api/cron/renew-subscriptions` — monthly credit grants (rollover caps: free 0 / pro 200 / elite 1000)
- `/api/cron/payment-reconciliation` — **both gateways**: finds payments the
  webhooks missed (Stripe: payment intents + paid sessions of last 24h;
  Razorpay: pending orders >15 min old, checked against Razorpay's API).

---

## 9. Idempotency — why duplicate payments are impossible

Three independent layers, used by both gateways:

1. **Webhook event dedup** — every gateway event is stored in `PaymentWebhook`
   (`eventId @unique`). Razorpay synthetic ids look like `payment.captured_pay_X`;
   client-verified payments use `checkout_verify_<paymentId>`. Re-delivery →
   "Already processed".
2. **Atomic order transition** — `confirmPaymentAndActivate()` re-checks
   `status='pending'` INSIDE a database transaction; two concurrent calls race
   and only one wins. A completed order short-circuits to "already processed".
3. **Gateway ids** — `PaymentOrder.providerPaymentId` / `providerOrderId` /
   `providerSubscriptionId` give every activation a concrete gateway identity;
   reconciliation jobs check these before re-fulfilling.

Webhook-arrives-before-frontend-callback (or vice versa) is safe: whichever
runs second is a no-op.

---

## 10. Credits & entitlements after payment

One shared path for both gateways (`confirmPaymentAndActivate`):

1. `PaymentOrder.status: pending → completed` (+ `providerPaymentId`)
2. `Subscription` upserted: plan, `status='active'`, `isTrial=false`,
   period = now + 30/365 days, gateway subscription id linked
3. `User`: `plan = newPlan`, `credits = previous + PLAN_CREDITS[newPlan]`
   (previous preserved as rollover), `creditsMonthly` set
4. `CreditsLedger` entry (`plan_upgrade`) with the new balance
5. Invoice row generated (GST-aware for INR orders)
6. Workflows paused by subscription expiry are auto-resumed
7. Coupon usage incremented (if a code was used)

Credit add-ons never change the plan — they route through
`fulfillCreditAddon()` which only adds credits + a `credit_addon_purchase`
ledger entry.

---

## 11. Security checklist

- [x] Secret keys only server-side (`STRIPE_SECRET_KEY`, `RAZORPAY_KEY_SECRET` never shipped to the browser — only publishable key ids)
- [x] Webhook signature verification on both endpoints (Stripe `constructEvent`, Razorpay HMAC + `timingSafeEqual`); production rejects unsigned webhooks
- [x] Razorpay checkout payments verified server-side (signature + API fetch + amount match) before activation
- [x] Amounts always computed server-side; Stripe Price is authoritative; Razorpay amounts from `plan-config` + GST
- [x] Authenticated user association (`withAuth`) + ownership checks on every payment route
- [x] Idempotent activation (see §9)
- [x] No secrets in logs; audit logs store ids and amounts only
- [x] No frontend-only entitlement activation anywhere

---

## 12. Testing both gateways

### Stripe test cards
| Card | Result |
|---|---|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 9995` | Declined (insufficient funds) |
| `4000 0000 0000 0341` | Succeeds, then fails on renewal |

### Razorpay test mode
Use Razorpay's test-mode instruments (test UPI ids / test cards listed in the
Razorpay dashboard under each payment method) — test keys never move real money.

### Scenario matrix (run in test mode before production)

| Scenario | Stripe | Razorpay |
|---|---|---|
| Successful subscription | ✅ hosted checkout → webhook activates | ✅ order + verify route activates |
| Successful credit add-on | ✅ | ✅ |
| Cancelled checkout | redirect `?payment=cancelled`, nothing changes | dismiss modal → idle, order stays pending |
| Failed payment | declined card → no activation | `payment.failed` webhook → order failed, nothing granted |
| Duplicate webhook | second delivery ignored (`PaymentWebhook` dedup) | same |
| Webhook arrives before/after callback | safe (idempotent activation) | safe |
| Browser closed after paying | reconciliation cron fulfills | reconciliation cron fulfills (orders >15 min) |
| Page refresh after success | `verify-session` re-checks server state | store re-syncs from `/api/subscriptions/current` |
| Recurring renewal | `invoice.payment_succeeded` | `subscription.charged` |
| Recurring failure | `invoice.payment_failed` → past_due | `subscription.halted` → past_due |
| Cancellation | dashboard/webhook → expired | `subscription.cancelled` → expired |
| Plan changes | same-plan cycle switch allowed; downgrades via support | same rules enforced server-side |
| Unauthorized API calls | `withAuth` on all payment routes; ownership checks | same |

---

## 13. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Stripe is not configured" / "Razorpay is not configured" | Missing env vars | Set the vars listed in §4 and restart |
| "Stripe price ID for pro (monthly) is not configured. Set one of: STRIPE_PRO_MONTHLY_PRICE_ID, …" | Price id env missing | Create the Price in Stripe and set the env var |
| Razorpay checkout opens but fails instantly | Wrong key id/secret pair, or `NEXT_PUBLIC_RAZORPAY_KEY_ID` mismatched | Re-copy both keys from the same dashboard app |
| "Payment signature verification failed" (Razorpay) | Tampered payload or mismatched `RAZORPAY_KEY_SECRET` | Confirm the secret belongs to the same key id; never bypass verification |
| Webhook events recorded but `processingError` set | Order not found / amount mismatch | Check `PaymentWebhook.processingError`; replay via Admin → Billing → Webhooks (`/api/payments/webhook-replay`) |
| User paid but plan not active | Webhook delayed/lost | Reconciliation cron will fulfill; or POST `/api/payments/verify-session` (Stripe) / let the user retry verify (Razorpay). Check `PaymentOrder.status` |
| Credits granted twice | (should be impossible) | Audit `CreditsLedger.referenceId` for duplicate order ids; both gateway paths are idempotent — investigate custom integrations |
| Amount mismatch errors | Plan pricing changed in one place only | Re-align `plan-config.ts`, `subscription-store.ts`, and dashboard prices |

Diagnostics: `PaymentOrder`, `PaymentWebhook`, `CreditsLedger`, `AuditLog`
(`resource='billing'`) + Admin billing endpoints (`/api/admin/billing`).

---

## 14. Production rollout checklist

1. Switch both dashboards from test to live keys; update env vars (never mix
   test and live in one deployment).
2. Create live Products/Prices (Stripe) and live Plans (Razorpay) — test-mode
   objects do not carry over.
3. Register production webhook endpoints + secrets (§5.4, §6.4) — both gateways.
4. Set `CRON_SECRET` and schedule the reconciliation + end-of-period crons.
5. Apply the `providerSubscriptionId` migration (additive, safe — see
   `prisma/migrations/20260921000000_add_provider_subscription_id/`).
6. Smoke-test with real money in the smallest amount possible, then refund.
7. Verify `/api/payments/provider-status` shows `mode: live` for both.

---

## 15. File reference (what changed for dual-gateway support)

**New**
- `src/lib/payments/{types,plan-config,stripe-provider,razorpay-provider,index}.ts`
- `src/app/api/payments/razorpay/verify/route.ts`
- `prisma/migrations/20260921000000_add_provider_subscription_id/migration.sql`
- `.env.example`
- `tests/unit/payment-gateways.test.ts`
- `docs/payments/PAYMENT-SYSTEM.md`, `docs/04-secrets-and-configuration/RAZORPAY-SETUP.md`

**Modified**
- `prisma/schema.prisma` (+ `PaymentOrder.providerSubscriptionId`, additive)
- `src/app/api/payments/create-checkout-session/route.ts` (gateway param)
- `src/app/api/payments/webhook/razorpay/route.ts` (first-charge activation, halted/completed)
- `src/app/api/cron/payment-reconciliation/route.ts` (dual-gateway reconciliation)
- `src/lib/subscription-service.ts` (optional `providerSubscriptionId` param — backward compatible)
- `src/lib/razorpay-service.ts` (lazy secret reads in verification — fail-closed kept)
- `src/components/dashboard/upgrade-modal.tsx` (gateway selection step + Razorpay flow)
- `src/app/dashboard/billing/page.tsx` ("Paid Via" gateway column)
