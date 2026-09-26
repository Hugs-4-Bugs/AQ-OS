# AcquisitionOS — Payment Configuration Master Guide

**Version:** 1.0 · **Date:** 2026-09-23 · **Scope:** Documentation only — no application code changes

The cross-provider reference for configuring payments in the current AcquisitionOS codebase. It consolidates: the payment category inventory, the Stripe Price ID master table, the Razorpay Plan ID master table, the webhook master tables, the full environment-variable inventory, and the single end-to-end setup checklist. Provider-specific step-by-step detail lives in `STRIPE-SETUP-GUIDE.md` and `RAZORPAY-SETUP-GUIDE.md`; this document never contradicts them.

**Current configuration status (verified against the live workspace):** no payment environment variables are set yet. Every paid plan/cycle therefore renders a **"Coming Soon"** button and checkout is never initiated — this is the codebase's designed, fail-safe behavior. The tables below use `TO_BE_CREATED` wherever a dashboard object must be created manually. No IDs are fabricated.

---

## 1. Architecture Overview

AcquisitionOS routes all payments through a provider abstraction (`src/lib/payments/`) with two implementations — Stripe and Razorpay — behind one contract (`PaymentProvider`): `isConfigured / getMode / supportedCurrencies / canCheckout / createCheckout / verifyPayment`. Shared services own everything else so neither provider duplicates business logic:

- **Activation:** `confirmPaymentAndActivate()` (subscription-service) — one atomic DB transaction: order → `completed`, subscription upsert (plan, status, period, provider IDs), user plan + credits update, `CreditsLedger` entry, invoice generation + email, audit logs, coupon usage increment. Idempotent by design (pending-order check inside the transaction + webhook dedup table).
- **Idempotency:** every webhook/verification event is recorded in the `PaymentWebhook` table (`eventId` unique) before processing; duplicates return "Already processed".
- **Amount authority:** Stripe — the Price object (created GST-inclusive); Razorpay — server-computed base + 18% GST from `PLAN_PRICING`. The browser never sets amounts.
- **UI gating:** `GET /api/payments/provider-status` returns per-plan/cycle availability; the pricing/billing/upgrade UIs render "Coming Soon" (disabled, Clock icon) for anything unavailable, and never start checkout.
- **Plan source of truth:** `PLAN_PRICING` (plan-config) ↔ entitlement-service credits — Free 50, Starter 150, Pro 750, Elite 2,000 credits/month; lead discovery limits 10 / 25 / unlimited / unlimited.

```text
Browser ──► POST /api/payments/create-checkout-session (gateway: stripe|razorpay)
              │
              ├─ Stripe  ─► Checkout Session (subscription|payment, Price ID from env)
              │               └─ redirect ─► hosted page ─► /dashboard?payment=success
              │                        webhook ─► POST /api/payments/webhook/stripe  ┐
              │                        verify  ─► POST /api/payments/verify-session   ├─► confirmPaymentAndActivate
              │                                                                    ┘
              └─ Razorpay ─► orders.create (one-time) or subscriptions.create (recurring)
                              └─ Checkout.js modal ─► POST /api/payments/razorpay/verify  ─► same activation
                              webhook ─► POST /api/payments/webhook/razorpay ─► same activation
```

## 2. Payment Category Master Table — Subscriptions

### 2a. Commercial view (what the customer buys)

| # | Provider | Product · Plan | Billing type | Cycle | Amount charged | GST | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Stripe | AcquisitionOS Starter | Recurring | Monthly | ₹471 (base 399 + 72 GST) | 18% in Price | Sell Starter monthly (price reduced ₹499 → ₹399, Sep 2026) |
| 2 | Stripe | AcquisitionOS Starter | Recurring | Yearly | ₹5,899 (base 4,999 + 900) | 18% in Price | Sell Starter yearly (yearly unchanged; no longer cheaper than 12× monthly) |
| 3 | Stripe | AcquisitionOS Pro | Recurring | Monthly | ₹1,887 (base 1,599 + 288) | 18% in Price | Sell Pro monthly |
| 4 | Stripe | AcquisitionOS Pro | Recurring | Yearly | ₹17,699 (base 14,999 + 2,700) | 18% in Price | Sell Pro yearly (Save ₹4,189/yr) |
| 5 | Stripe | AcquisitionOS Elite | Recurring | Monthly | ₹6,135 (base 5,199 + 936) | 18% in Price | Sell Elite monthly |
| 6 | Stripe | AcquisitionOS Elite | Recurring | Yearly | ₹53,099 (base 44,999 + 8,100) | 18% in Price | Sell Elite yearly (Save ₹17,389/yr) |
| 7 | Razorpay | AcquisitionOS Pro | One-time order (default) or Recurring (if Plan set) | Monthly | ₹1,887 (server-computed, paise 188700) | 18% server-side | Sell Pro monthly in India (UPI/cards/netbanking) |
| 8 | Razorpay | AcquisitionOS Pro | One-time / Recurring | Yearly | ₹17,699 | 18% server-side | Sell Pro yearly in India |
| 9 | Razorpay | AcquisitionOS Elite | One-time / Recurring | Monthly | ₹6,135 | 18% server-side | Sell Elite monthly in India |
| 10 | Razorpay | AcquisitionOS Elite | One-time / Recurring | Yearly | ₹53,099 | 18% server-side | Sell Elite yearly in India |
| n/a | n/a | *(no purchase)* Free | n/a | n/a | ₹0 | n/a | Free tier (50 credits/mo, 10 leads) granted in-app |

### 2b. Configuration view (IDs, env vars, webhooks, surfaces)

| # | Product ID | Price ID / Plan ID | Environment variable | Key webhook events | Where used in the app |
| --- | --- | --- | --- | --- | --- |
| 1 | `TO_BE_CREATED` | `TO_BE_CREATED` (price_...) | `STRIPE_PRICE_STARTER_MONTHLY_ID` | checkout.session.completed; invoice.paid; customer.subscription.* | Pricing page; Settings → Billing; upgrade modal |
| 2 | `TO_BE_CREATED` | `TO_BE_CREATED` | `STRIPE_PRICE_STARTER_YEARLY_ID` | same | same |
| 3 | `TO_BE_CREATED` | `TO_BE_CREATED` | `STRIPE_PRICE_PRO_MONTHLY_ID` (aliases accepted — Stripe guide Pt 9) | same | same |
| 4 | `TO_BE_CREATED` | `TO_BE_CREATED` | `STRIPE_PRICE_PRO_YEARLY_ID` | same | same |
| 5 | `TO_BE_CREATED` | `TO_BE_CREATED` | `STRIPE_PRICE_ELITE_MONTHLY_ID` | same | same |
| 6 | `TO_BE_CREATED` | `TO_BE_CREATED` | `STRIPE_PRICE_ELITE_YEARLY_ID` | same | same |
| 7 | n/a (order-based) | `TO_BE_CREATED` only if recurring (`plan_...`) | `RAZORPAY_PLAN_PRO_MONTHLY` (optional) | payment.captured; subscription.charged | Pricing page; checkout modal |
| 8 | n/a | `TO_BE_CREATED` (optional) | `RAZORPAY_PLAN_PRO_YEARLY` | payment.captured; subscription.charged | same |
| 9 | n/a | `TO_BE_CREATED` (optional) | `RAZORPAY_PLAN_ELITE_MONTHLY` | payment.captured; subscription.charged | same |
| 10 | n/a | `TO_BE_CREATED` (optional) | `RAZORPAY_PLAN_ELITE_YEARLY` | payment.captured; subscription.charged | same |
| n/a | none | none | none | none | Signup; plan gating |

> Starter via Razorpay is **not purchasable in the current code** (provider validates Pro/Elite only). Starter sells through Stripe rows 1–2.

## 3. Payment Category Master Table — Additional Credit Purchases

Credit packs are one-time purchases, fulfilled by `fulfillCreditAddon` (credits added atomically + ledger + email/notification). Catalog verified in `src/app/api/payments/credit-addons/route.ts` — these four packs are the **only** ones that exist; nothing else may be invented. (Final add-on pricing update, Sep 2026 — the retired 100-credit pack was removed; in-flight legacy `credits_100` orders still fulfill via `LEGACY_CREDIT_ADDONS`.)

### 3a. Commercial view

| Provider | Pack (in-app ID) | Credits | Billing type | Amount charged | GST |
| --- | --- | --- | --- | --- | --- |
| Stripe | `credits_250` (Starter Pack) | 250 | One-time | ₹707 (base 599 + 108) | 18% in Price |
| Stripe | `credits_500` (Growth Pack) | 500 | One-time | ₹1,179 (base 999 + 180) | 18% in Price |
| Stripe | `credits_1000` (Pro Pack) | 1,000 | One-time | ₹2,123 (base 1,799 + 324) | 18% in Price |
| Stripe | `credits_2500` (Power Pack) | 2,500 | One-time | ₹4,719 (base 3,999 + 720) | 18% in Price |
| Razorpay | `credits_250` | 250 | One-time order | ₹707 (server-computed) | 18% server-side |
| Razorpay | `credits_500` | 500 | One-time order | ₹1,179 | 18% server-side |
| Razorpay | `credits_1000` | 1,000 | One-time order | ₹2,123 | 18% server-side |
| Razorpay | `credits_2500` | 2,500 | One-time order | ₹4,719 | 18% server-side |

### 3b. Configuration view

| Pack | Provider | Product ID | Price ID / Plan ID | Environment variable | Webhook events | Where used |
| --- | --- | --- | --- | --- | --- | --- |
| `credits_250` | Stripe | `TO_BE_CREATED` | `TO_BE_CREATED` (price_...) | `STRIPE_PRICE_CREDITS_250_ID` | checkout.session.completed (type='credits') | Pricing page / checkout modal "Buy Now"; settings quick add-ons |
| `credits_500` | Stripe | `TO_BE_CREATED` | `TO_BE_CREATED` | `STRIPE_PRICE_CREDITS_500_ID` | same | same |
| `credits_1000` | Stripe | `TO_BE_CREATED` | `TO_BE_CREATED` | `STRIPE_PRICE_CREDITS_1000_ID` | same | same |
| `credits_2500` | Stripe | `TO_BE_CREATED` | `TO_BE_CREATED` | `STRIPE_PRICE_CREDITS_2500_ID` | same | same |
| `credits_250` | Razorpay | n/a (order-based) | n/a | none required | payment.captured | same |
| `credits_500` | Razorpay | n/a | n/a | none required | payment.captured | same |
| `credits_1000` | Razorpay | n/a | n/a | none required | payment.captured | same |
| `credits_2500` | Razorpay | n/a | n/a | none required | payment.captured | same |

## 4. Other Payment Types Present in the Implementation

| Type | Provider | Status | Notes |
| --- | --- | --- | --- |
| Billing Portal session | Stripe | Implemented | `POST /api/payments/stripe-portal` → Stripe Billing Portal (`ensureStripeCustomer` creates the Customer); return URL `STRIPE_PORTAL_RETURN_URL` or `{APP_URL}/settings?tab=billing` |
| Refunds (full/partial) | Both | Implemented | Dashboard refunds and super-admin `POST /api/admin/refund`; webhook-driven credit reversal + plan downgrade on full refund |
| Coupons / promotion codes | Both | Implemented | In-app `Coupon` table + `/api/payments/validate-coupon`; Stripe sessions enable `allow_promotion_codes` when a code is entered; Razorpay records the code for audit |
| Trials | In-app | App-side only | `POST /api/subscriptions/trial`; no gateway billing object involved |
| Payment recovery / dunning | In-app | Implemented | past-due banner, `payment-failed-modal`, `POST /api/payments/retry`, `/api/cron/payment-reconciliation` |
| SSE payment status | In-app | Implemented | `GET /api/payments/sse` + `GET /api/events/payments` push live payment status to the dashboard |
| Webhook replay (operator) | In-app | Implemented | `POST /api/payments/webhook-replay`; safe due to event dedup |

## 5. Stripe Price ID Master Table (copy-paste friendly)

| Plan | Billing | Stripe Product ID | Stripe Price ID | Environment Variable |
| ---- | ------- | ----------------- | --------------- | -------------------- |
| Starter | Monthly | `TO_BE_CREATED` | `TO_BE_CREATED` | `STRIPE_PRICE_STARTER_MONTHLY_ID` |
| Starter | Yearly | `TO_BE_CREATED` | `TO_BE_CREATED` | `STRIPE_PRICE_STARTER_YEARLY_ID` |
| Pro | Monthly | `TO_BE_CREATED` | `TO_BE_CREATED` | `STRIPE_PRICE_PRO_MONTHLY_ID` |
| Pro | Yearly | `TO_BE_CREATED` | `TO_BE_CREATED` | `STRIPE_PRICE_PRO_YEARLY_ID` |
| Elite | Monthly | `TO_BE_CREATED` | `TO_BE_CREATED` | `STRIPE_PRICE_ELITE_MONTHLY_ID` |
| Elite | Yearly | `TO_BE_CREATED` | `TO_BE_CREATED` | `STRIPE_PRICE_ELITE_YEARLY_ID` |
| Credit Pack 250 (Starter Pack) | One-time | `TO_BE_CREATED` | `TO_BE_CREATED` | `STRIPE_PRICE_CREDITS_250_ID` |
| Credit Pack 500 (Growth Pack) | One-time | `TO_BE_CREATED` | `TO_BE_CREATED` | `STRIPE_PRICE_CREDITS_500_ID` |
| Credit Pack 1000 (Pro Pack) | One-time | `TO_BE_CREATED` | `TO_BE_CREATED` | `STRIPE_PRICE_CREDITS_1000_ID` |
| Credit Pack 2500 (Power Pack) | One-time | `TO_BE_CREATED` | `TO_BE_CREATED` | `STRIPE_PRICE_CREDITS_2500_ID` |

Amounts for each row: Part 2/3 tables above (GST-inclusive). Legacy alias variable names accepted by the resolver are listed in the Stripe guide Part 9 — the canonical column above is the recommended set. **Never invent or hand-type `price_` values; copy them from the Stripe Dashboard.**

## 6. Razorpay Plan/ID Master Table

| Plan | Billing | Razorpay Product/Plan ID | Environment Variable |
| ---- | ------- | ------------------------ | -------------------- |
| Pro | Monthly | `TO_BE_CREATED` (only if recurring desired; one-time orders need nothing) | `RAZORPAY_PLAN_PRO_MONTHLY` |
| Pro | Yearly | `TO_BE_CREATED` (optional) | `RAZORPAY_PLAN_PRO_YEARLY` |
| Elite | Monthly | `TO_BE_CREATED` (optional) | `RAZORPAY_PLAN_ELITE_MONTHLY` |
| Elite | Yearly | `TO_BE_CREATED` (optional) | `RAZORPAY_PLAN_ELITE_YEARLY` |
| Starter | Monthly/Yearly | n/a (not supported via Razorpay in current code) | n/a |
| Credit packs | One-time | n/a (order-based; no Plan objects) | n/a |
| Webhook secret | n/a | self-chosen value (same on both sides) | `RAZORPAY_WEBHOOK_SECRET` |

## 7. Webhook Master Tables

### Stripe — endpoint `POST /api/payments/webhook/stripe`

| Provider | Event | Endpoint | Purpose | Required |
| -------- | ----- | -------- | ------- | -------- |
| Stripe | `checkout.session.completed` | /api/payments/webhook/stripe | Activate subscription / fulfill credit pack; generate invoice | **Yes** |
| Stripe | `checkout.session.expired` | /api/payments/webhook/stripe | Mark abandoned order failed | **Yes** |
| Stripe | `charge.refunded` | /api/payments/webhook/stripe | Credit reversal; plan downgrade on full refund | **Yes** |
| Stripe | `charge.dispute.created` | /api/payments/webhook/stripe | Chargeback alerting | **Yes** |
| Stripe | `customer.subscription.created` | /api/payments/webhook/stripe | Recorded; no dedicated logic | Optional |
| Stripe | `customer.subscription.updated` | /api/payments/webhook/stripe | Status/period/cancel-flag sync | **Yes** |
| Stripe | `customer.subscription.deleted` | /api/payments/webhook/stripe | Cancellation handling | **Yes** |
| Stripe | `invoice.payment_succeeded` | /api/payments/webhook/stripe | Renewal: extend period + reset credits | **Yes** |
| Stripe | `invoice.paid` | /api/payments/webhook/stripe | Renewal duplicate-safety net | **Yes** |
| Stripe | `invoice.payment_failed` | /api/payments/webhook/stripe | past_due + recovery flow | **Yes** |
| Stripe | `payment_intent.succeeded` | /api/payments/webhook/stripe | Fallback activation by PaymentIntent ID | **Yes** |

Secret env var: `STRIPE_WEBHOOK_SECRET` (per mode). Test + Live endpoints are configured separately in each mode.

### Razorpay — endpoint `POST /api/payments/webhook/razorpay`

| Provider | Event | Endpoint | Purpose | Required |
| -------- | ----- | -------- | ------- | -------- |
| Razorpay | `payment.captured` | /api/payments/webhook/razorpay | Activate subscription / fulfill credit pack | **Yes** |
| Razorpay | `payment.failed` | /api/payments/webhook/razorpay | Mark order failed + logging | **Yes** |
| Razorpay | `refund.created` | /api/payments/webhook/razorpay | Refund initiated tracking | **Yes** |
| Razorpay | `refund.processed` | /api/payments/webhook/razorpay | Credit reversal; downgrade on full refund | **Yes** |
| Razorpay | `subscription.cancelled` | /api/payments/webhook/razorpay | Cancel sync (recurring mode) | With recurring |
| Razorpay | `subscription.charged` | /api/payments/webhook/razorpay | Renewal: extend + reset credits | With recurring |
| Razorpay | `subscription.halted` | /api/payments/webhook/razorpay | Past-due / dunning state | With recurring |
| Razorpay | `subscription.completed` | /api/payments/webhook/razorpay | Tenure finished handling | With recurring |

Secret env var: `RAZORPAY_WEBHOOK_SECRET` (value you choose; identical in Dashboard and env; **mandatory in production** — unsigned webhooks are rejected).

## 8. Environment Variable Master (Safe Inventory — No Secret Values)

Placeholder convention: values shown as `<...>` must be filled from the provider dashboards. **Never commit real values**; `.env` is gitignored — keep it that way.

| Variable | Provider | Purpose | Test/Live | Where used (verified) | Required/Optional | Where to obtain |
| --- | --- | --- | --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | Stripe | Server SDK auth for checkout, portal, refunds, invoices, webhook client | `sk_test_...` / `sk_live_...` (prefix sets reported mode) | payment-service, stripe-portal-service, refund-service, invoice-pdf-service, webhook route, provider checks | **Required for Stripe** | Stripe → Developers → API keys |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe | Browser-safe publishable key surfaced by provider-status | `pk_test_...` / `pk_live_...` | provider-status; env-validation | Optional but recommended | Stripe → Developers → API keys → Publishable |
| `STRIPE_PUBLISHABLE_KEY` | Stripe | Server-side alias of the publishable key | public-safe | env-validation | Optional | Same |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Webhook signature verification | `whsec_...` per mode | webhook route (constructEvent; placeholders rejected) | **Required in production** | Stripe → Developers → Webhooks → endpoint signing secret |
| `STRIPE_PRICE_{PLAN}_{CYCLE}_ID` ×6 | Stripe | Plan Price IDs (canonical convention; 3 alias conventions auto-resolved) | `price_...` per mode | resolvePlanPriceId → checkout line_items; KNOWN_PRICE_IDS validation | **Required per sold plan/cycle** | Stripe → Products → Price ID |
| `STRIPE_PRICE_CREDITS_{100,500,1000}_ID` | Stripe | Credit pack one-time Price IDs | `price_...` | CREDIT_ADDON_PRICE_IDS → mode:'payment' checkout | Required for Stripe credit packs | Stripe → Products |
| `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` | Stripe | Checkout redirect overrides | URLs | createStripeCheckoutSession defaults | Optional (defaults exist) | Your URLs |
| `STRIPE_PORTAL_RETURN_URL` | Stripe | Billing Portal return URL | URL | stripe-portal-service (default `{APP_URL}/settings?tab=billing`) | Optional | Your URL |
| `RAZORPAY_KEY_ID` | Razorpay | Server SDK auth + fallback public key for Checkout.js | `rzp_test_...` / `rzp_live_...` | razorpay-provider, payment-service, razorpay-service, refund-service | **Required for Razorpay** | Razorpay → Account & Settings → API Keys |
| `RAZORPAY_KEY_SECRET` | Razorpay | Payment signature verification + refund API + gateway fetch | secret | razorpay verify route, razorpay-service, refund-service | **Required with key ID** | Same (shown once) |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Razorpay | Public Key ID for the browser modal | public-safe | getPublicKeyId() → checkout response | Optional | Same as Key ID |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay | Webhook HMAC-SHA256 verification | secret | webhook route (constant-time compare; mandatory outside dev) | **Required in production** | Your chosen value, set in Dashboard → Webhooks |
| `RAZORPAY_PLAN_{PRO,ELITE}_{MONTHLY,YEARLY}` | Razorpay | Recurring Plan IDs (one-time fallback without them) | `plan_...` | plan-config getRazorpayPlanId (must start with `plan_`) | Optional | Razorpay → Subscriptions → Plans |
| `RAZORPAY_SUBSCRIPTION_TOTAL_COUNT_MONTHLY` / `_YEARLY` | Razorpay | Mandate tenure (defaults 12 / 5) | config | razorpay-provider getSubscriptionTotalCount | Optional | Your choice |
| `RAZORPAY_SUPPORTED_CURRENCIES` | Razorpay | Advertised currencies (default `INR`) | config | razorpay-provider supportedCurrencies | Optional | Set only if international enabled |
| `APP_URL` / `NEXT_PUBLIC_APP_URL` / `NEXTAUTH_URL` | App | Public origin for success/cancel/portal redirect URLs | URL | app-url.ts; checkout redirect builders | Required in production | Your domain |
| `CRON_SECRET` | App | Bearer auth for cron/diagnostic routes (renewals, reconciliation) | secret | cron routes; email-diagnostic | Required for cron operations | Self-generated strong random |

## 9. Beginner Setup Flow (Single End-to-End Checklist)

```text
Create Stripe/Razorpay account
        ↓
Activate business/account (KYC)
        ↓
Enable Test Mode
        ↓
Create products
        ↓
Create monthly prices/plans  (GST-inclusive amounts)
        ↓
Create yearly prices/plans   (GST-inclusive amounts)
        ↓
Create additional-credit products
        ↓
Copy Product/Price/Plan IDs
        ↓
Configure environment variables  (exact names from §8)
        ↓
Create webhook  (both providers)
        ↓
Configure webhook secret
        ↓
Run test payment
        ↓
Verify webhook  (PaymentWebhook table + provider deliveries)
        ↓
Verify subscription  (plan + period + provider IDs)
        ↓
Verify credits  (PLAN_CREDITS + CreditsLedger)
        ↓
Verify payment history  (/api/payments/history + invoices)
        ↓
Verify refund  (credits reversed; full refund downgrades)
        ↓
Repeat in Live Mode  (new objects, new keys, new webhook secret)
```

## 10. What the Current Codebase Does NOT Use (Avoid Ghost Configuration)

- **Free plan:** no product, no price, no gateway object — granted in-app (50 credits/month, 10 lead discoveries).
- **Stripe PaymentIntents:** never created directly by the app (Checkout creates them internally; only the fallback webhook listens).
- **Stripe Tax / automatic_tax:** not enabled in session creation — tax must be baked into Price amounts (GST-inclusive).
- **Razorpay Invoices / Invoice IDs:** not used — the app generates its own numbered GST invoices (PDF + email) from the `Invoice` table.
- **Razorpay Merchant ID:** not referenced anywhere in the integration.
- **Embedded card fields / tokenization:** not used — hosted Checkout (Stripe) and Checkout.js modal (Razorpay) only.
- **Starter on Razorpay:** rejected by the provider's plan validation in the current code — Stripe only.

## 11. Verification & Admin Endpoints Reference

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /api/payments/provider-status` | Public | Gateway availability + mode + per-plan/cycle availability (drives "Coming Soon") |
| `POST /api/payments/create-checkout-session` | Session | Canonical checkout entry (both gateways; plans + credit packs) |
| `POST /api/payments/create-order` · `POST /api/payments/create-stripe-session` | Session | Legacy/alias checkout entries (same underlying services) |
| `POST /api/payments/razorpay/verify` | Session | Razorpay signature + gateway + amount verification → activation |
| `POST /api/payments/verify-session` | Session | Stripe post-redirect session reconciliation → activation |
| `POST /api/payments/webhook/stripe` · `/razorpay` | Signature | Provider webhooks (activation source of truth) |
| `GET /api/payments/history` | Session | User's payment orders + invoice info (billing UI) |
| `GET /api/payments/invoices` · `/api/billing/invoices/{id}/download` | Session | Invoice list + PDF download |
| `POST /api/payments/stripe-portal` | Session | Stripe Billing Portal session |
| `POST /api/payments/cancel` · `/api/subscriptions/cancel` | Session | Cancel (cancelAtPeriodEnd=true) |
| `POST /api/payments/retry` · `GET /api/payments/status` | Session | Retry / poll a pending order |
| `POST /api/admin/refund` | Super-admin | Initiate full/partial refund via provider API |
| `GET /api/admin/billing/webhooks` | Admin | Inspect webhook records (`PaymentWebhook`) |
| `POST /api/payments/webhook-replay` | Internal | Safe event replay (dedup-protected) |
| `GET /api/cron/renew-subscriptions` · `/api/cron/payment-reconciliation` | CRON_SECRET | Periodic credit resets / renewal + stale-payment reconciliation |

## 12. Immediate Next Actions (Operator)

1. Choose gateway per market: **Stripe** (cards; all four plans + packs) and/or **Razorpay** (India: UPI/netbanking; Pro/Elite + packs).
2. Create the dashboard objects from §5 and §6 in Test Mode; copy IDs into the §8 env vars.
3. Register both webhook endpoints (§7) and set the secrets.
4. Set `APP_URL` / `NEXT_PUBLIC_APP_URL` to the public domain so redirect URLs are correct.
5. Walk the §9 checklist once in Test Mode; then repeat in Live Mode.
6. Verify with `GET /api/payments/provider-status`: every sold plan/cycle should report `available: true` before announcing pricing.

---

*End of Payment Configuration Master Guide. See `STRIPE-SETUP-GUIDE.md` and `RAZORPAY-SETUP-GUIDE.md` for step-by-step dashboard walkthroughs.*
