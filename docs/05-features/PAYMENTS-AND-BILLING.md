# Payments and Billing

> AcquisitionOS / `vantage` v0.2.0 — Billing subsystem reference. All paths,
> function names, model names, and constants below are taken verbatim from
> the codebase (see the file references at the bottom).

---

## 1. Available Plans

> **Honest status**: the codebase ships **three plans**, not four. The brief
> mentioned a "Premium" tier — there is **no `premium` plan** anywhere in the
> code or Prisma schema. The three real plans are `free`, `pro`, `elite`.

Verified across:
- `src/lib/entitlement-service.ts:11` — `export type PlanType = 'free' | 'pro' | 'elite';`
- `src/lib/plan-gates.ts:43` — `type PlanLevel = 'free' | 'pro' | 'elite';`
- `src/lib/subscription-service.ts:6` — `Plan hierarchy: free < pro < elite`
- `src/lib/credit-costs.ts:107` — `export type PlanType = 'free' | 'pro' | 'elite';`
- `prisma/schema.prisma` — `PlanEntitlement.plan` comment: `// free, pro, elite`

### 1.1 Plan pricing

Two copies of the pricing table exist; both agree numerically.

`src/lib/payment-service.ts:39` (`PLAN_PRICING`, used by Stripe + Razorpay order
creation):

| Plan | INR monthly | INR yearly | USD monthly | USD yearly |
| --- | ---: | ---: | ---: | ---: |
| free | 0 | 0 | 0 | 0 |
| pro | 2499 | 23990 | 29 | 279 |
| elite | 7999 | 76790 | 89 | 849 |

`src/app/api/subscriptions/upgrade-preview/route.ts:24` (`PLAN_PRICING`, USD
only, used by the upgrade-preview endpoint): same USD numbers as above.

> **Note on Stripe Price IDs**: the brief mentioned env vars like
> `STRIPE_PRICE_PRO_ID`, `STRIPE_PRICE_ELITE_ID`, `STRIPE_PRICE_CREDITS_ID`.
> These are **not used** anywhere in the codebase (verified with a full
> search). Instead, `src/lib/payment-service.ts:795` builds the Stripe
> Checkout Session with `line_items[0].price_data = { currency, product_data,
> unit_amount }` — ad-hoc pricing derived from `PLAN_PRICING` in code. There
> is a placeholder-price regex `PLACEHOLDER_PRICE_RE = /^price_[a-z_]+$/` in
> `create-order/route.ts` for the legacy code path that *would* use Stripe
> Price IDs, but the live Stripe checkout path is ad-hoc.

### 1.2 Plan credits (monthly allocation)

`src/lib/entitlement-service.ts:110` (`PLAN_CREDITS`):

| Plan | Credits / month |
| --- | ---: |
| free | 50 |
| pro | 500 |
| elite | 2000 |

### 1.3 Plan entitlements (feature flags)

`src/lib/entitlement-service.ts:42` (`ENTITLEMENTS`) — keyed by `FeatureKey`
(`lead_discovery`, `deep_analysis`, `outreach_messages`,
`outreach_sequences`, `sales_coaching`, `proposal_generation`,
`competitor_analysis`, `data_export`, `gmail_integration`,
`whatsapp_integration`, `telegram_access`, `workflow_access`, `api_access`,
`chatbot_access`, `team_members`, `white_label`, `custom_integrations`).

| Feature | free | pro | elite |
| --- | :---: | :---: | :---: |
| `lead_discovery` | 10 | ∞ | ∞ |
| `deep_analysis` | – | ∞ | ∞ |
| `outreach_messages` | 50 | ∞ | ∞ |
| `outreach_sequences` | – | ∞ | ∞ |
| `sales_coaching` | – | ∞ | ∞ |
| `proposal_generation` | – | ∞ | ∞ |
| `competitor_analysis` | – | ∞ | ∞ |
| `data_export` | – | ∞ | ∞ |
| `gmail_integration` | – | ∞ | ∞ |
| `whatsapp_integration` | – | – | ∞ |
| `telegram_access` | – | – | ∞ |
| `workflow_access` | – | ∞ | ∞ |
| `api_access` | – | ∞ | ∞ |
| `chatbot_access` | – | ∞ | ∞ |
| `team_members` | 1 | 3 | 10 |
| `white_label` | – | – | ∞ |
| `custom_integrations` | – | – | ∞ |

`–` = disabled; `∞` = `limit: null` (unlimited).

The `PlanEntitlement` Prisma model exists (`@@unique([plan, feature])`) and
is seeded by `scripts/seed-entitlements.ts`, but the runtime check in
`src/lib/entitlement-service.ts` reads from the in-code `ENTITLEMENTS`
constant, not from the DB. Both must stay in sync.

### 1.4 Trial

`src/lib/trial-service.ts`:
- `TRIAL_DURATION_DAYS = 14`
- `TRIAL_PLAN: PlanType = 'pro'` — trials grant Pro features for 14 days
- `startTrial(userId)` sets `user.isTrial = true`, `user.trialEndsAt = now + 14d`,
  `user.plan = 'pro'`, `user.credits = 500`, `user.creditsMonthly = 500`,
  creates a `Subscription` with `status = 'trialing'`, `isTrial = true`.
- `checkTrialExpiry(userId)` auto-downgrades to `free` when the trial expires.
- `/api/subscriptions/trial` returns trial status + the list of features
  available during the trial.

### 1.5 Subscription states

`src/lib/subscription-service.ts:17`:
```
type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
type BillingCycle        = 'monthly' | 'yearly';
```

Valid transitions (`VALID_TRANSITIONS`):
- `trialing → active | expired | canceled`
- `active → past_due | canceled | expired`
- `past_due → active | canceled | expired`
- `canceled → expired`
- `expired` is terminal

---

## 2. How Stripe Checkout Works

### 2.1 Session creation — `POST /api/payments/create-stripe-session`
Source: `src/app/api/payments/create-stripe-session/route.ts`.

1. `withAuth` — must be authenticated.
2. Body: `{ plan: 'pro' | 'elite', billingCycle: 'monthly' | 'yearly',
   couponCode?, successUrl?, cancelUrl? }`.
3. Validates plan (only `pro` or `elite` — `free` does not need a paid
   checkout), billing cycle, and URL formats.
4. Calls `createStripeCheckoutSession({ userId, plan, billingCycle,
   couponCode, successUrl, cancelUrl, ipAddress, userAgent })` from
   `src/lib/payment-service.ts`.
   - Inside `createStripeCheckoutSession`:
     1. Validates plan change via `isValidPlanChange(currentPlan, plan)`.
     2. Idempotency: returns existing order if the same `idempotencyKey` was
        already used.
     3. Calculates coupon discount via `validateAndApplyCoupon`.
     4. Calculates GST via `src/lib/gst-service.ts` for Indian users
        (`isIndianUser` from `checkIsIndianUser(user.country)`).
     5. Creates a `PaymentOrder` row (`status: 'pending'`,
        `provider: 'stripe'`, `amount = totalAmount`, `subtotal`,
        `discountAmount`, `taxAmount`, `gstNumber`).
     6. Gets a Stripe instance via `getStripeInstance()` — throws
        `'Stripe credentials not configured. Set STRIPE_SECRET_KEY.'` if
        missing.
     7. Creates a Stripe Checkout Session with:
        - `mode: 'payment'`, `payment_method_types: ['card']`
        - `line_items[0].price_data = { currency, product_data: { name,
          description }, unit_amount: amountInCents }` (ad-hoc pricing, no
          Stripe Price ID)
        - `success_url` defaults to
          `${NEXT_PUBLIC_APP_URL || NEXTAUTH_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`
        - `cancel_url` defaults to
          `${NEXT_PUBLIC_APP_URL || NEXTAUTH_URL}/dashboard/billing?canceled=true`
        - `metadata: { orderId, userId, plan, billingCycle, couponCode,
          subtotal, discountAmount, taxAmount }`
        - `client_reference_id: userId`
     8. Updates `PaymentOrder.providerOrderId = session.id`.
     9. Returns the session URL and all pricing breakdown.
5. Logs `payment_initiated` via `logBillingEvent`.
6. Returns `{ orderId, sessionId, url, amount, currency, subtotal,
   discountAmount, taxAmount, gstRate, plan, billingCycle,
   creditsAllocated }`.

### 2.2 Frontend redirect → Stripe → success URL
1. Frontend does `window.location = result.url` to send the user to Stripe.
2. User pays in Stripe's hosted checkout.
3. Stripe redirects to `success_url` →
   `GET /api/payments/stripe-success?session_id=...`
   (`src/app/api/payments/stripe-success/route.ts`).
4. That route 307-redirects to the client-side page
   `/payment/success?session_id=...`.
5. The client polls `GET /api/payments/verify-session?session_id=...`
   (`src/app/api/payments/verify-session/route.ts`) until `paid: true`.
6. Alternatively, the client can listen on `GET /api/payments/sse`
   (`src/app/api/payments/sse/route.ts`) for a server-sent event when the
   webhook lands.

### 2.3 `GET /api/payments/verify-session`
- Looks up `PaymentOrder` by `providerOrderId = sessionId`.
- If order is `completed` in the DB → returns success immediately with
  plan, credits, invoice number, subscription status.
- If order is `pending` and Stripe key is set:
  - `stripe.checkout.sessions.retrieve(sessionId)`.
  - Verifies ownership (`session.metadata.user_id === user.id`).
  - If `session.payment_status === 'paid'`:
    - **Routes addon orders separately** via `fulfillCreditAddon`
      (`src/lib/credit-addon-fulfillment.ts`).
    - Otherwise calls `confirmPaymentAndActivate(user.id, order.id,
      providerPaymentId)` (see §3).
    - Generates invoice PDF + sends invoice email (blocking — must complete
      before response).
    - Creates a `payment_success` notification.
    - Returns `{ paid: true, orderStatus: 'completed', activated: true, ... }`.
- If no order in DB but Stripe says paid → **creates a retroactive
  PaymentOrder** and activates (handles the edge case where the order row
  wasn't created before the Stripe redirect).

### 2.4 Razorpay parallel flow

| Step | Route | Notes |
| --- | --- | --- |
| Create order | `POST /api/payments/create-order` | `src/app/api/payments/create-order/route.ts`. Validates plan (`pro`/`elite`), billing cycle, coupon. Calls `createPaymentOrder` from `payment-service.ts` — creates `PaymentOrder` with `provider: 'razorpay'`, calls `razorpay.orders.create()` to get `providerOrderId`. Returns `{ orderId, razorpayOrderId, razorpayKeyId, amount, currency, ... }`. |
| Frontend checkout | Razorpay.js | Frontend opens the Razorpay checkout modal with the key + order ID. |
| Confirm | `POST /api/payments/confirm` | `src/app/api/payments/confirm/route.ts`. Verifies the Razorpay signature client-side and marks the order ready for webhook. |
| Verify | `POST /api/payments/verify` | `src/app/api/payments/verify/route.ts`. Server-side signature verification + `confirmPaymentAndActivate`. |
| Confirm-payment | `POST /api/payments/confirm-payment` | `src/app/api/payments/confirm-payment/route.ts`. Fallback path for clients that don't get the webhook — calls Stripe API directly and activates. |

`createPaymentOrder` (in `payment-service.ts`) auto-selects the provider:
when `STRIPE_SECRET_KEY` is set, it routes to Stripe; otherwise Razorpay
(requires `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET`). The brief's "create-order
→ confirm → verify" sequence is the Razorpay path; the Stripe path uses
`create-stripe-session → verify-session`.

---

## 3. After a Successful Payment

### 3.1 Webhook — `POST /api/payments/webhook/stripe`
Source: `src/app/api/payments/webhook/stripe/route.ts`.

1. Reads raw body (as text — required for signature verification).
2. Reads `stripe-signature` header.
3. **Signature verification**:
   - Detects placeholder secrets (`whsec_YOUR_STRIPE_WEBHOOK_SECRET`,
     secrets containing `YOUR_`).
   - If real secret + signature header present →
     `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)`.
   - On failure → HTTP 400 `'Invalid signature'`.
   - In production with no secret → HTTP 500 `'Webhook verification not
     configured — rejected in production'`.
   - In dev mode with no secret → parses JSON directly and warns.
4. **Idempotency check**: looks up `PaymentWebhook` by `event.id`
   (`@unique`). If already processed → returns `'Already processed'`.
5. Records webhook receipt via `db.paymentWebhook.upsert({ where: { eventId },
   create: { eventId, provider: 'stripe', eventType, payload, signature,
   processed: false } })`.
6. Event-specific handling (see §6 for what each event does).

### 3.2 `confirmPaymentAndActivate(userId, paymentOrderId, providerPaymentId)`
Source: `src/lib/subscription-service.ts`.

Runs inside a Prisma `$transaction`:
1. Looks up `PaymentOrder` with `status: 'pending'` (inside the tx — so two
   concurrent webhooks race safely; the loser sees `null` and silently
   succeeds idempotently).
2. Updates `PaymentOrder.status = 'completed'`,
   `providerPaymentId = <payment_intent or charge ID>`.
3. Updates or creates the user's `Subscription`:
   - `plan = newPlan`, `status = 'active'`, `isTrial = false`,
     `trialEndsAt = null`, `cancelAtPeriodEnd = false`,
     `scheduledPlanChange = null`, `currentPeriodStart = now`,
     `currentPeriodEnd = now + (monthly ? 30d : 365d)`.
4. Updates `User`:
   - `plan = newPlan`, `isTrial = false`, `trialEndsAt = null`,
     `credits = PLAN_CREDITS[newPlan]`, `creditsMonthly = same`,
     `rolloverCredits = 0`.
5. Writes a positive `CreditsLedger` entry (`action: 'subscription_activated'`,
   `credits: +PLAN_CREDITS[newPlan]`, `balance: PLAN_CREDITS[newPlan]`).
6. If a coupon code is on the order: `incrementCouponUsage(couponCode)`
   (called by the webhook after `confirmPaymentAndActivate` returns).
7. Returns `{ success: true }` or `{ success: false, error }`. If the
   order was already completed by a concurrent call, returns
   `{ success: false, error: 'Payment already completed' }` — the caller
   (verify-session) treats this specific error string as success.

### 3.3 Invoice generation
After `confirmPaymentAndActivate` succeeds, the webhook (and verify-session)
calls:
1. `generateInvoicePdf(orderId)` from `src/lib/invoice-pdf-service.ts` —
   creates an `Invoice` row (`invoiceNumber` is `@unique`), renders HTML,
   generates the PDF.
2. `sendInvoiceEmail(userId, orderId)` from
   `src/lib/invoice-email-service.ts` — sends the invoice email with the
   PDF attached.

Both are **blocking** in the verify-session path so the user always gets
their invoice before the response returns.

### 3.4 Notifications
`notifyPaymentSuccess({ userId, plan, amount, currency, creditsAdded,
orderId })` from `src/lib/notification-service.ts` — creates a
`Notification` row.

### 3.5 Audit
`logPaymentEvent(userId, 'payment_completed', { amount, currency, provider,
plan, paymentOrderId })` from `src/lib/billing-audit.ts` — writes a
`BillingAudit` row.

---

## 4. Credits System

### 4.1 Balance fields on `User`
| Field | Purpose |
| --- | --- |
| `credits` | Current spendable balance (mutable, decremented by `deductCredits`, incremented by `addCredits`). |
| `creditsMonthly` | Plan-granted monthly allowance (50/500/2000). Reset to this every renewal. |
| `rolloverCredits` | Unused credits rolled over from the previous period (set during `processEndOfPeriodSubscriptions`). |

### 4.2 `CreditsLedger` (Prisma)
```
model CreditsLedger {
  id          String  @id @default(cuid())
  userId      String
  action      String  // lead_discovery, deep_analysis, outreach_message, outreach_sequence,
                      // sales_coaching, proposal_generation, competitor_analysis, data_export,
                      // subscription_activated, trial_expired, addon_purchase,
                      // refund_adjustment, chargeback_adjustment, etc.
  credits     Int     // positive for add, negative for deduct
  balance     Int     // balance AFTER this transaction
  description String?
  referenceId String? // Lead.id, PaymentOrder.id, Subscription.id, etc.
  createdAt   DateTime @default(now())
}
```

### 4.3 `deductCredits(params)` — atomic deduction
Source: `src/lib/credit-service.ts`.

- Inside a Prisma `$transaction`:
  1. Looks up the user's current `credits` row.
  2. If `credits < cost` → returns `{ success: false, error:
     'Insufficient credits' }` without writing anything.
  3. Otherwise decrements `User.credits` and writes a negative
     `CreditsLedger` entry with `balance` set to the new balance.
  4. Supports `idempotencyKey` — if a ledger entry with the same key
     already exists, returns `{ success: true, alreadyProcessed: true }`.
- Never allows negative balance.

### 4.4 `addCredits(params)` — atomic grant
- Same shape; writes a positive `CreditsLedger` entry. Used by the
  addon-fulfillment path.

### 4.5 `refundCredits(params)` — reverse a previous deduction
- Used by `outreach-sender.ts` when an email send fails after the credit
  deduction. Writes a positive ledger entry tagged
  `action: 'outreach_refund'`.

### 4.6 Credit costs actually used at runtime
> `src/lib/credit-service.ts:29` — the table used by `deductCredits`:

| Action | Credits |
| --- | ---: |
| `lead_discovery` | 1 |
| `deep_analysis` | 5 |
| `outreach_message` | 2 |
| `outreach_sequence` | 8 |
| `sales_coaching` | 3 |
| `proposal_generation` | 10 |
| `competitor_analysis` | 8 |
| `data_export` | 5 |

> ⚠️ `src/lib/credit-costs.ts:32` contains a **separate** `CREDIT_COSTS` map
> with fractional values (`lead_discovery: 1`, `deep_analysis: 1.5`,
> `outreach_message: 0.2`, `outreach_sequence: 0.5`, etc.). That table is
> imported by `src/lib/plan-gates.ts` (the `withCredits` gate uses it for
> preview checks) but **not** by `deductCredits`. Both tables exist; the
> integer table above is the one that lands on `CreditsLedger`.

### 4.7 Credit addon purchases
Source: `src/app/api/payments/credit-addons/route.ts`.

`CREDIT_ADDONS` constant (in the route file):

| ID | Credits | INR | USD |
| --- | ---: | ---: | ---: |
| `credits_100` | 100 | 199 | 2.49 |
| `credits_500` | 500 | 799 | 9.99 |
| `credits_1000` | 1000 | 1299 | 15.99 |

- `GET /api/payments/credit-addons` — lists addons.
- `POST /api/payments/credit-addons` — body `{ addonId, currency }`. Creates
  a `PaymentOrder` with `plan: 'credit_addon'`, `billingCycle: 'one_time'`,
  `couponCode: 'addon:${addonId}'` (the addon ID is encoded in the
  `couponCode` field so the webhook can find it). Auto-selects provider
  based on currency (`INR → razorpay`, `USD → stripe`).
- On webhook `checkout.session.completed`, the route detects addon orders
  via `isCreditAddonOrder(order)` and calls `fulfillCreditAddon(userId,
  orderId, providerPaymentId)` from
  `src/lib/credit-addon-fulfillment.ts`:
  - Adds the addon's credits via `addCreditAddon` (atomic, with ledger
    entry `action: 'addon_purchase'`).
  - Marks order `completed`.
  - Idempotent — if order is already `completed`, returns
    `{ success: true, creditsAdded: 0 }`.
  - **Does NOT call `confirmPaymentAndActivate`** — that function would
    overwrite the user's plan and destroy their subscription.

### 4.8 Monthly credit renewal — `POST /api/cron/credit-renewal`
Source: `src/app/api/cron/credit-renewal/route.ts`.

- Auth: `Authorization: Bearer ${CRON_SECRET}` — returns 401 if mismatched,
  500 if `CRON_SECRET` env var is missing.
- Calls `processEndOfPeriodSubscriptions()` from
  `src/lib/subscription-service.ts` — iterates subscriptions whose
  `currentPeriodEnd < now`, rolls over unused credits
  (`User.rolloverCredits`), resets `credits = creditsMonthly`, advances
  `currentPeriodStart/End` by one period.
- Related: `POST /api/cron/end-of-period` and
  `POST /api/payments/process-billing` both call the same underlying
  function (and additionally send trial-ending / past-due reminders).

### 4.9 Entitlement checks
| Endpoint | Source | Behaviour |
| --- | --- | --- |
| `GET /api/entitlements` | `src/app/api/entitlements/route.ts` | Returns full entitlements + disabled features for the user's plan. |
| `GET /api/entitlements/quota` | `src/app/api/entitlements/quota/route.ts` | Returns quota status per feature with current usage. |
| `GET /api/entitlements/check-credits` | `src/app/api/entitlements/check-credits/route.ts` | Checks if the user has enough credits for an action. |
| `GET /api/subscriptions/entitlements` | `src/app/api/subscriptions/entitlements/route.ts` | Same as `/api/entitlements` but subscriptions-prefixed. |
| `GET /api/subscriptions/usage` | `src/app/api/subscriptions/usage/route.ts` | `withPermission('billing:read')`. Returns usage summary, quota status, daily usage (up to 90 days). |
| `GET /api/subscriptions/check-eligibility` | `src/app/api/subscriptions/check-eligibility/route.ts` | Checks eligibility for a plan change. |
| `GET /api/credits` | `src/app/api/credits/route.ts` | Credit balance + recent ledger entries. |
| `GET /api/credits/history` | `src/app/api/credits/history/route.ts` | Paginated `CreditsLedger` history. |

### 4.10 Plan gates (middleware)
`src/lib/plan-gates.ts` exposes wrappers used by route handlers:
- `withPlan(request, requiredPlan, handler)` — minimum plan level.
- `withFeature(request, featureKey, handler)` — feature entitlement.
- `withCredits(request, action, handler)` — credit sufficiency (does not
  deduct — the handler must call `deductCredits` itself).
- `withTeamAccess(request, minimumRole, handler)` — org role.
- `withBillingGate(request, { plan?, feature?, action?, permission? },
  handler)` — combined gate.

`src/lib/entitlement-middleware.ts` exposes `checkPlanEntitlement(userId,
plan, feature)` used by per-lead routes like
`/api/leads/[id]/analyze`.

---

## 5. Subscription Management

### 5.1 `GET /api/subscriptions/current`
Source: `src/app/api/subscriptions/current/route.ts`.

- `withAuth`.
- Calls `getSubscriptionStatus(user.id)` (from
  `src/lib/subscription-service.ts`) — returns the most recent subscription
  row whose status is in `['trialing', 'active', 'past_due', 'canceled']`
  plus `planDetails` (plan, creditsMonthly, creditsRemaining) and
  `trialInfo` (isTrial, trialEndsAt, daysRemaining).
- If on trial, additionally calls `checkTrialStatus(user.id)` from
  `src/lib/trial-service.ts` to get `isActive`/`isExpired`/`hasUsedTrial`.
- Calls `getCreditBalance(user.id)` (from `src/lib/credit-service.ts`) for
  the balance breakdown (`total`, `monthly`, `rollover`, `addons`, `plan`,
  `percentage`).
- Fetches the full `Subscription` row to also return `billingCycle`,
  `creditsTotal`, `creditsUsed`, `creditsRemaining`, `creditsResetAt`.

### 5.2 `POST /api/subscriptions/cancel`
Source: `src/app/api/subscriptions/cancel/route.ts`.

- `withAuth`.
- Looks up the active subscription (`status in ['active', 'trialing']`).
- If a `stripeSubscriptionId` is set: calls
  `stripe.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true })`.
  Stripe call failures are logged but do not block local cancellation.
- Updates local `Subscription.cancelAtPeriodEnd = true`. Status stays
  `active` until period end (when Stripe fires
  `customer.subscription.deleted`).
- Computes a refund estimate based on the remaining fraction of the
  billing period (no refund if <20% remains or if the estimated amount is
  <₹100).
- Writes an `AuditLog` row with `action: 'subscription_canceled'`.
- Returns `{ message, accessUntil, refundEstimate, refundStatus }`.

### 5.3 `POST /api/subscriptions/upgrade-preview`
Source: `src/app/api/subscriptions/upgrade-preview/route.ts`.

- `withAuth`.
- Body: `{ plan: 'pro' | 'elite', billingCycle, couponCode?, currency? }`.
- Validates plan change is an upgrade via `isValidPlanChange` +
  `getPlanChangeDirection === 'upgrade'`.
- Computes pricing, coupon discount (`validateAndApplyCoupon`), GST for
  Indian users, credit adjustment, feature comparison
  (`comparePlans(currentPlan, targetPlan)`).
- Returns a full preview `{ pricing, coupon, credits, features: { gained,
  limitIncreases, lost }, effectiveDate, subscription: { currentPeriodEnd,
  cancelAtPeriodEnd } }`. **No DB change** — `preview: true` flag in the
  response.

### 5.4 `POST /api/subscriptions/downgrade-preview`
Source: `src/app/api/subscriptions/downgrade-preview/route.ts`.

- `withAuth`.
- Body: `{ plan: 'free' | 'pro' }` (downgrade target — `elite` rejected).
- Computes credits remaining, new allocation, features lost, effective
  date (downgrades take effect at period end).
- Preview only — no DB change.

### 5.5 `POST /api/subscriptions/trial`
Source: `src/app/api/subscriptions/trial/route.ts` (GET only).

- `GET` returns trial status, days remaining, and the list of features
  available during the trial (entitlements for the trial plan = `pro`).

### 5.6 Stripe Customer Portal — `POST /api/payments/stripe-portal`
Source: `src/app/api/payments/stripe-portal/route.ts`.

- `withAuth`.
- Body: `{ returnUrl? }`.
- Calls `createPortalSession({ userId, returnUrl })` from
  `src/lib/stripe-portal-service.ts`.
- Returns `{ url, sessionId }` — the frontend redirects the user to the
  Stripe-hosted portal for self-service subscription management.

### 5.7 Other subscription endpoints
- `GET /api/subscriptions/usage` — see §4.9.
- `GET /api/subscriptions/entitlements` — see §4.9.
- `GET /api/subscriptions/check-eligibility` — checks if a plan change is
  valid.

---

## 6. Webhook Events (Stripe)

Source: `src/app/api/payments/webhook/stripe/route.ts`. Each event is
processed inside its own block, gated by the `PaymentWebhook.eventId`
idempotency check at the top of the handler.

| Stripe event | What the handler does |
| --- | --- |
| `checkout.session.completed` | Finds `PaymentOrder` by `metadata.order_id`, `providerOrderId`, or `user_id + plan + status='pending'`. Verifies amount matches order. **Routes addon orders to `fulfillCreditAddon`**; all others to `confirmPaymentAndActivate`. Then `incrementCouponUsage`, updates the `Subscription` with `stripeSubscriptionId` + `stripeCustomerId`, generates invoice PDF + sends invoice email, fires `notifyPaymentSuccess`, logs `payment_completed`. Marks webhook `processed: true`. |
| `checkout.session.expired` | Marks the pending `PaymentOrder` as `failed`, fires `notifyPaymentFailure`, logs `payment_failed`. |
| `charge.refunded` | Looks up order by `providerPaymentId = charge.payment_intent`. Determines full vs partial refund. For full refunds: sets `PaymentOrder.status = 'refunded'`, downgrades `Subscription` to `expired/free`, downgrades `User.plan = 'free'`, resets credits to free allocation, writes a negative `CreditsLedger` entry (`action: 'refund_adjustment'`). For addon refunds: reverses the addon credits with `action: 'addon_refund_reversal'`. Fires `notifyRefundProcessed`, logs `payment_refunded`. |
| `customer.subscription.updated` | Looks up subscription by `stripeSubscriptionId`. Maps Stripe status → our status (`active`, `trialing`, `past_due`, `canceled`, `expired` for `unpaid`/`incomplete_expired`, `canceled` for `paused`). Reads `newPlan` from `stripeSub.metadata.plan` or `stripeSub.plan.metadata.plan`. Updates `Subscription` row (`status`, `plan`, `currentPeriodStart/End`, `cancelAtPeriodEnd`). If plan changed, updates `User.plan` and `User.creditsMonthly`. If `cancel_at_period_end` flipped to true, fires `notifySubscriptionCancelling`. Logs `plan_change_processed`. |
| `customer.subscription.deleted` | Sets `Subscription.status = 'expired'`. Downgrades `User` to `free` (resets credits). Writes a `CreditsLedger` entry `action: 'subscription_cancelled'`. Fires `notifySubscriptionExpired`. Logs `subscription_expired`. |
| `invoice.payment_succeeded` | Looks up subscription by `stripeSubscriptionId`. **Cross-event dedup**: skips credit reset if `period_start` already matches the stored `currentPeriodStart`. Otherwise `resetMonthlyCredits(userId, plan)`. Updates `currentPeriodStart/End`, sets `status = 'active'`. Logs `payment_completed` (renewal). Fires `notifySubscriptionRenewed`. Generates renewal invoice PDF + sends email. |
| `invoice.payment_failed` | Sets `Subscription.status = 'past_due'`. Fires `notifyPaymentFailure`. Logs `subscription_past_due` and `payment_failed`. |
| `charge.dispute.created` | (Chargeback) Finds the order by `payment_intent` or `charge`. For `lost` disputes: marks order `refunded`, downgrades subscription to `expired/free`, downgrades `User` to `free`, writes `CreditsLedger` entry `action: 'chargeback_adjustment` (or `chargeback_addon_reversal` for addons). Fires `notifyChargebackReceived`. Logs `chargeback_received`. |

### 6.1 Razorpay webhook events
Source: `src/app/api/payments/webhook/razorpay/route.ts`. Verified with
`createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)` and `timingSafeEqual`.
Handles `payment.captured`, `payment.failed`, `refund.created`,
`refund.processed`, `subscription.cancelled`, `subscription.charged` —
semantics mirror the Stripe handler.

### 6.2 Idempotency
- `PaymentWebhook.eventId` is `@unique`. Every webhook upserts a row keyed
  by `eventId` (`stripe_<event.id>` or
  `${event}_${paymentId|payload.id|Date.now()}` for Razorpay).
- If `eventId` already exists and `processed = true` → returns
  `'Already processed'` without re-running side effects.
- If `eventId` exists and `processed = false` (errored before) → continues
  processing.
- This prevents double-fulfillment when Stripe redelivers an event.

---

## 7. Refund Handling

### 7.1 User-initiated — `POST /api/payments/refund`
Source: `src/app/api/payments/refund/route.ts`.

- `withAuth`.
- Body: `{ paymentOrderId, refundType: 'full' | 'partial', amount?, reason? }`.
- Calls `initiateRefund({ paymentOrderId, userId, refundType, amount,
  reason, initiatedBy: user.email })` from `src/lib/refund-service.ts`.
  - Validates order exists, belongs to the user, and is `completed` (not
    already refunded).
  - Calculates refund amount (`order.amount` for full, `amount` for partial).
  - Calls Stripe's `stripe.refunds.create({ payment_intent: <id>, amount })`
    or the Razorpay equivalent.
  - On Stripe-side success: writes a `CreditsLedger` reversal if it's a
    full refund (handled by the `charge.refunded` webhook when Stripe
    fires it), updates `PaymentOrder.status = 'refunded'` once the
    webhook confirms.
- Returns `{ success, refundId, refundAmount, creditsReversed, status }`.

### 7.2 Admin-initiated — `POST /api/admin/refund`
Source: `src/app/api/admin/refund/route.ts`.

- `withAdmin` — admin role required.
- Body: `{ userId, paymentIntentId, amount?, reason }`.
- Finds the `PaymentOrder` by `providerPaymentId = paymentIntentId`.
- Calls Stripe's `stripe.refunds.create({ payment_intent: paymentIntentId,
  amount, reason })` directly.
- Logs the refund via `logPaymentEvent('admin_refund')`.
- Sends a notification email via `sendRefundNotificationEmail` from
  `src/lib/payment-failure-utils.ts`.

### 7.3 Webhook-driven refunds
See `charge.refunded` in §6 — when Stripe fires this event (whether the
refund was initiated by the user, admin, or directly in the Stripe
Dashboard), the webhook handles credit reversal and plan downgrade.

---

## 8. Dunning (Failed Payment Recovery)

### 8.1 `src/lib/payment-recovery-service.ts`
- Dunning schedule: retry on day 1, 3, 7, 14 after failure
  (`DUNNING_SCHEDULE = [1, 3, 7, 14]`).
- Grace period: 14 days (`GRACE_PERIOD_DAYS = 14`) — user retains access
  during this window.
- Downgrade after 14 days of failed payment
  (`DOWNGRADE_AFTER_DAYS = 14`).
- `processFailedPayments()` — iterates all `past_due` subscriptions,
  schedules retries, sends notifications, eventually downgrades.
- `getRecoveryStatus(userId)` — used by `/api/payments/status` to show the
  user their recovery state.

### 8.2 `src/lib/payment-failure-utils.ts`
- `STRIPE_ERROR_MESSAGES` — maps Stripe error codes (`card_declined`,
  `insufficient_funds`, `incorrect_cvc`, `expired_card`,
  `processing_error`, `card_velocity_exceeded`, `do_not_honor`,
  `generic_decline`, `authentication_required`, etc.) to user-friendly
  messages.
- `getStripeErrorMessage(errorCode)` — fallback formatter.
- `extractStripeErrorCode(error)` — pulls the code/decline_code/type out
  of a Stripe SDK error object.
- `sendRefundNotificationEmail(...)` — used by the admin refund path.

### 8.3 `consecutivePaymentFailures`
- The `User` model does not have a dedicated `consecutivePaymentFailures`
  column in the current schema (verified by reading `model User`). The
  dunning logic in `payment-recovery-service.ts` derives failure count
  from the `BillingAudit` rows (or the `past_due` duration itself — see
  the `DUNNING_SCHEDULE` stepping).
- After `DOWNGRADE_AFTER_DAYS = 14` of `past_due`, the recovery service
  cancels the subscription (status → `canceled` → eventually `expired`
  via the `customer.subscription.deleted` webhook).

### 8.4 Recovery notifications
`src/lib/payment-notification-service.ts`:
- `sendTrialEndingReminders()` — fires trial-ending reminders.
- `sendPastDueReminders()` — fires past-due reminders (Day 1, 3, 7, 14).
- Both are called by `POST /api/payments/process-billing` (cron-driven).

### 8.5 Frontend recovery UI
- `src/components/dashboard/payment-past-due-banner.tsx` — banner shown
  when `subscription.status === 'past_due'`.
- `src/components/dashboard/payment-recovery-ui.tsx` — full recovery flow
  UI.
- `src/components/dashboard/payment-failed-modal.tsx` — modal shown on
  immediate payment failure.

---

## 9. Common Payment Errors and Fixes

### 9.1 "Payment failed immediately without reaching Stripe"
- **Cause**: `STRIPE_SECRET_KEY` is missing or wrong, **or** the request
  body did not include `plan` (or it was something other than
  `'pro' | 'elite'`).
- **Fix**:
  1. Verify `STRIPE_SECRET_KEY` is set in `.env` and matches the Stripe
     Dashboard secret key (test vs. live mode matters).
  2. `getStripeInstance()` in `src/lib/payment-service.ts:339` throws
     `'Stripe credentials not configured. Set STRIPE_SECRET_KEY.'` if
     the env var is missing — check the server logs for this exact
     string.
  3. Ensure the frontend sends `{ plan: 'pro' | 'elite', billingCycle:
     'monthly' | 'yearly', ... }`. The route returns HTTP 400 with
     `Invalid plan. Must be "pro" or "elite".` if `plan` is wrong.

### 9.2 "Webhook signature verification failed"
- **Cause**: `STRIPE_WEBHOOK_SECRET` in `.env` does not match the
  `whsec_...` shown in Stripe Dashboard → Developers → Webhooks →
  your endpoint → Signing secret. Placeholder values
  (`whsec_YOUR_STRIPE_WEBHOOK_SECRET`, anything containing `YOUR_`) are
  detected and rejected.
- **Fix**:
  1. Stripe Dashboard → Developers → Webhooks → select the endpoint →
     Signing secret → Reveal → copy the `whsec_...` value.
  2. Paste it into `STRIPE_WEBHOOK_SECRET` in `.env` (no quotes, no
     whitespace).
  3. Restart the server.
  4. In Stripe Dashboard → Webhooks → Send test webhook →
     `checkout.session.completed` — verify it returns HTTP 200.

### 9.3 "Credits not granted after payment"
- **Cause**: Either the webhook URL is not registered in Stripe, or the
  webhook is being delivered but failing inside the handler.
- **Diagnosis**:
  1. Stripe Dashboard → Developers → Webhooks → your endpoint →
     "Attempts" — look at the most recent `checkout.session.completed`
     delivery. If the response status is not 200, the handler is
     throwing.
  2. The webhook URL must be `https://<your-domain>/api/payments/webhook/stripe`
     — Stripe cannot reach `localhost` or internal cloud hostnames.
  3. Check the server logs for `[Stripe Webhook]` lines — the route logs
     every step (`Webhook event received`, `No matching payment order
     found`, `confirmPaymentAndActivate failed`, etc.).
  4. If the webhook never arrives: the URL is not registered in Stripe
     Dashboard. Add it, then "Send test webhook".
  5. If the webhook arrives but `confirmPaymentAndActivate` fails: check
     the `PaymentWebhook.processingError` column for the human-readable
     error message.
- **Fallback path**: even if the webhook is delayed, the
  `verify-session` route will call `confirmPaymentAndActivate` directly
  when the user lands on `/payment/success?session_id=...` and Stripe
  reports `payment_status: 'paid'`. So credits will be granted on the
  user's next page load regardless of webhook delivery.

### 9.4 "subscription not found"
- **Cause**: `getSubscriptionStatus(userId)` returned no subscription
  row (e.g. the user signed up but the `Subscription` row creation
  silently failed).
- **Fix**: call `GET /api/subscriptions/current` to inspect. If `null`,
  `getOrCreateSubscription(userId)` (called by other routes) will
  create a default `free / trialing` row.

### 9.5 "Idempotency conflict" (duplicate webhook delivery)
- **Cause**: Stripe redelivered the same event (this is normal — Stripe
  retries on non-2xx responses).
- **Resolution**: the `PaymentWebhook.eventId @unique` constraint
  prevents double fulfillment. If `processed = true` on the second
  delivery, the handler returns `'Already processed'` immediately. If
  you see this in the logs, it means idempotency is working — no action
  needed.

### 9.6 Dunning failures
- **Cause**: `consecutivePaymentFailures`-equivalent state — the
  subscription has been `past_due` for ≥14 days.
- **Resolution**: `processFailedPayments()` from
  `src/lib/payment-recovery-service.ts` (called by the
  `/api/payments/process-billing` cron) cancels the subscription and
  downgrades the user to `free`. The Stripe-side
  `customer.subscription.deleted` event then fires and the webhook
  finalises the downgrade (see §6).

### 9.7 "Insufficient credits" when the user just paid
- **Cause**: `confirmPaymentAndActivate` failed and the user's
  `User.credits` was not updated. Most often because the webhook
  signature check failed (see §9.2) so the handler returned 400
  before reaching the activation block.
- **Fix**: check the `PaymentOrder.status`. If it's `completed` but
  `User.credits` is still the old value, the `$transaction` inside
  `confirmPaymentAndActivate` was rolled back. Look at
  `PaymentWebhook.processingError` for the rollback reason. Manually
  re-triggering activation: call `GET /api/payments/verify-session?
  session_id=<sessionId>` — it will detect the `pending` order, see
  Stripe says `paid`, and call `confirmPaymentAndActivate` again.

---

## 10. File Reference

### Routes — payments (`src/app/api/payments/`)
| Path | Purpose |
| --- | --- |
| `create-stripe-session/route.ts` | Create Stripe Checkout Session |
| `create-order/route.ts` | Create Razorpay (or Stripe) order |
| `confirm/route.ts` | Razorpay confirm |
| `confirm-payment/route.ts` | Fallback activation path |
| `verify/route.ts` | Razorpay server-side verification |
| `verify-session/route.ts` | Stripe post-redirect verification + activation |
| `stripe-success/route.ts` | Stripe redirect target → `/payment/success` |
| `status/route.ts` | Recovery status for the user |
| `sse/route.ts` | Real-time SSE stream for payment updates |
| `history/route.ts` | Payment history list |
| `preview/route.ts` | Billing preview |
| `process-billing/route.ts` | Cron-driven billing processor (CRON_SECRET or admin) |
| `stripe-portal/route.ts` | Stripe Customer Portal session |
| `refund/route.ts` | User-initiated refund |
| `retry/route.ts` | Retry a failed payment |
| `cancel/route.ts` | Cancel a pending payment |
| `validate-coupon/route.ts` | Validate a coupon code |
| `credit-addons/route.ts` | List + purchase credit addons |
| `provider-status/route.ts` | Returns which providers are configured |
| `webhook-replay/route.ts` | Replay a webhook event |
| `webhook/stripe/route.ts` | Stripe webhook handler |
| `webhook/razorpay/route.ts` | Razorpay webhook handler |
| `invoices/route.ts`, `invoices/[id]/route.ts`, `invoices/[id]/download/route.ts`, `invoices/generate/route.ts`, `invoices/resend-email/route.ts`, `invoice/[id]/route.ts` | Invoice endpoints |

### Routes — subscriptions (`src/app/api/subscriptions/`)
| Path | Purpose |
| --- | --- |
| `current/route.ts` | Get current subscription + plan + trial + credit balance |
| `cancel/route.ts` | Cancel at period end (Stripe + local) |
| `upgrade-preview/route.ts` | Preview an upgrade |
| `downgrade-preview/route.ts` | Preview a downgrade |
| `usage/route.ts` | Usage summary + quota status |
| `entitlements/route.ts` | Plan entitlements + disabled features |
| `trial/route.ts` | Trial status + features |
| `check-eligibility/route.ts` | Plan-change eligibility |

### Routes — credits & entitlements
- `src/app/api/credits/route.ts`, `credits/history/route.ts`
- `src/app/api/entitlements/route.ts`, `entitlements/quota/route.ts`,
  `entitlements/check-credits/route.ts`

### Routes — admin & billing
- `src/app/api/admin/refund/route.ts`, `admin/billing/route.ts`,
  `admin/billing/failed-payments/route.ts`,
  `admin/billing/webhooks/route.ts`
- `src/app/api/billing/invoices/[invoiceId]/download/route.ts`,
  `billing/recovery/route.ts`, `billing/analytics/route.ts`,
  `billing/history/route.ts`

### Routes — cron
- `src/app/api/cron/credit-renewal/route.ts`
- `src/app/api/cron/end-of-period/route.ts`
- `src/app/api/cron/renew-subscriptions/route.ts`
- `src/app/api/cron/payment-reconciliation/route.ts`

### Lib (`src/lib/`)
| File | Exports |
| --- | --- |
| `payment-service.ts` | `createPaymentOrder`, `createStripeCheckoutSession`, `getStripeInstance`, `PLAN_PRICING`, `CreateOrderResult`, `PaymentActivationResult` |
| `stripe-service.ts` | Stripe-specific helpers |
| `razorpay-service.ts` | Razorpay-specific helpers |
| `subscription-service.ts` | `getOrCreateSubscription`, `getSubscriptionStatus`, `upgradeSubscription`, `downgradeSubscription`, `cancelSubscription`, `reactivateSubscription`, `checkTrialExpiry`, `handleSubscriptionStateTransition`, `confirmPaymentAndActivate`, `processEndOfPeriodSubscriptions`, `SubscriptionStatus`, `BillingCycle`, `VALID_TRANSITIONS` |
| `credit-service.ts` | `deductCredits`, `addCredits`, `refundCredits`, `addCreditAddon`, `checkCreditSufficiency`, `getCreditBalance`, `resetMonthlyCredits`, `CREDIT_COSTS` (integer table — the one used at runtime) |
| `credit-costs.ts` | Second `CREDIT_COSTS` table (fractional values) + `WORKFLOW_ACTION_CREDIT_COSTS` + `PLAN_CREDITS` (duplicate). Used by `plan-gates.ts`, **not** by `deductCredits`. |
| `credit-addon-fulfillment.ts` | `fulfillCreditAddon`, `isCreditAddonOrder` |
| `entitlement-service.ts` | `ENTITLEMENTS`, `PLAN_CREDITS`, `PlanType`, `FeatureKey`, `getEntitlements`, `checkEntitlement`, `hasFeatureAccess`, `getPlanLevel`, `getPlanChangeDirection`, `isValidPlanChange`, `comparePlans` |
| `entitlement-middleware.ts` | `checkPlanEntitlement` |
| `plan-gates.ts` | `withPlan`, `withFeature`, `withCredits`, `withTeamAccess`, `withBillingGate` |
| `trial-service.ts` | `startTrial`, `checkTrialStatus`, `getTrialInfo`, `checkTrialExpiry`, `TRIAL_DURATION_DAYS`, `TRIAL_PLAN` |
| `coupon-service.ts` | `validateAndApplyCoupon`, `incrementCouponUsage` |
| `invoice-service.ts` | Invoice DB helpers |
| `invoice-pdf-service.ts` | `generateInvoicePdf` |
| `invoice-pdf-generator.ts` | PDF rendering helper |
| `invoice-email-service.ts` | `sendInvoiceEmail` |
| `refund-service.ts` | `initiateRefund`, `RefundType`, `RefundStatus` |
| `payment-recovery-service.ts` | `processFailedPayments`, `getRecoveryStatus`, `DUNNING_SCHEDULE`, `DOWNGRADE_AFTER_DAYS`, `GRACE_PERIOD_DAYS` |
| `payment-failure-utils.ts` | `STRIPE_ERROR_MESSAGES`, `getStripeErrorMessage`, `extractStripeErrorCode`, `sendRefundNotificationEmail` |
| `payment-notification-service.ts` | `notifyPaymentSuccess`, `notifyPaymentFailure`, `notifyRefundProcessed`, `notifySubscriptionRenewed`, `notifySubscriptionCancelling`, `notifySubscriptionExpired`, `notifyCreditAssigned`, `notifyChargebackReceived`, `sendTrialEndingReminders`, `sendPastDueReminders` |
| `payment-sse-service.ts` | `createPaymentSSEStream` |
| `stripe-portal-service.ts` | `createPortalSession` |
| `billing-audit.ts` | `logPaymentEvent`, `logSubscriptionEvent`, `logCreditEvent`, `logTrialEvent`, `logEntitlementEvent`, `logBillingEvent` |
| `gst-service.ts` | GST calculation for Indian users |

### Prisma models involved
`User` (credits, creditsMonthly, rolloverCredits, plan, isTrial,
trialEndsAt), `Subscription`, `PaymentOrder`, `PaymentWebhook`, `Invoice`,
`CreditsLedger`, `CreditAddon`, `Coupon`, `PlanEntitlement`, `AuditLog`,
`BillingAudit` (if present), `Notification`.

### Required env vars
| Var | Required for |
| --- | --- |
| `STRIPE_SECRET_KEY` | Stripe checkout creation + webhook signature verification + `verify-session` retrieval. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification (`whsec_...`). Required in production. |
| `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` | Razorpay order creation + verification. |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook signature verification. |
| `CRON_SECRET` | All `/api/cron/*` endpoints + `/api/payments/process-billing`. |
| `SMTP_*` / `GMAIL_*` / `RESEND_API_KEY` | Invoice email delivery via `src/lib/email.ts`. |
| `NEXT_PUBLIC_APP_URL` (or `NEXTAUTH_URL`, `APP_URL`) | Stripe `success_url` / `cancel_url` defaults. |

### Honest status summary
| Subsystem | Status | Notes |
| --- | --- | --- |
| Stripe Checkout (one-time, ad-hoc pricing) | ✅ Code OK | Uses `price_data`, not Stripe Price IDs. |
| Razorpay order + verify | ✅ Code OK | Parallel flow, used for INR by default. |
| Webhook handlers (Stripe + Razorpay) | ✅ Code OK | Idempotent via `PaymentWebhook.eventId`. Signature verification required in production. |
| `confirmPaymentAndActivate` (atomic) | ✅ Code OK | Prisma `$transaction`-wrapped; race-safe. |
| Credit addon fulfillment | ✅ Code OK | Routed separately from subscription activation. |
| Invoice PDF + email | ✅ Code OK | Generated synchronously in the webhook path. |
| Subscription state machine | ✅ Code OK | `VALID_TRANSITIONS` enforced. |
| Trial management | ✅ Code OK | 14-day Pro trial; auto-downgrade on expiry. |
| Plan gates / entitlements | ✅ Code OK | Two entitlement tables exist (in-code + Prisma `PlanEntitlement`); keep in sync. |
| Credit deduction | ✅ Code OK | Atomic; never negative balance. |
| Refunds (user + admin) | ✅ Code OK | User can self-refund via `/api/payments/refund`; admins via `/api/admin/refund`. |
| Dunning | ✅ Code OK | 14-day grace, then downgrade. |
| Stripe Customer Portal | ✅ Code OK | `createPortalSession` from `stripe-portal-service.ts`. |
| **Plan tiers** | ⚠️ 3 plans (free/pro/elite), **not 4** | The brief mentioned "Premium"; that tier does not exist in the code. |
| **Stripe Price IDs** | ⚠️ Not used | Pricing is hardcoded in `PLAN_PRICING` constant; `STRIPE_PRICE_*_ID` env vars are not read. |
| **Two `CREDIT_COSTS` tables** | ⚠️ Divergent values | `credit-service.ts` (integer, used at runtime) vs `credit-costs.ts` (fractional, used by `plan-gates`). |
| **`consecutivePaymentFailures` column** | ⚠️ Not present | The `User` model has no such column; dunning derives failure duration from `past_due` state and `BillingAudit` rows. |
