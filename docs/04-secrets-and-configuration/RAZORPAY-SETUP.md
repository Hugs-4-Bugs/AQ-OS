# Razorpay Setup Guide (AcquisitionOS)

Step-by-step configuration for the Razorpay payment gateway. Zero prior
payment-integration knowledge required. Pair with
`docs/payments/PAYMENT-SYSTEM.md` for the system overview and
`docs/04-secrets-and-configuration/STRIPE-SETUP.md` for the other gateway.

> Razorpay is best for customers paying in **INR** (UPI, cards, net banking,
> wallets). Stripe covers international cards in USD. Both run side by side —
> users choose at checkout.

---

## 1. Create the account and get test keys

1. Sign up at <https://dashboard.razorpay.com>.
2. Complete KYC later — **Test mode works without it**, so you can integrate
   and test everything before business verification.
3. Dashboard → **Account & Settings → API Keys → Generate Test Key**.
4. You get:
   - `Key Id` — looks like `rzp_test_XXXXXXXXXXXX` (safe for the browser)
   - `Key Secret` — shown only once (server-side only)

## 2. Set the environment variables

```env
RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXX
RAZORPAY_KEY_SECRET=YOUR_KEY_SECRET
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXX
RAZORPAY_WEBHOOK_SECRET=choose-a-long-random-string
```

Restart the app. Verify: `GET /api/payments/provider-status` should show
`"razorpay": { "available": true, "mode": "test" }`.

## 3. Optional — enable recurring subscriptions

Without this section, Razorpay checkout uses **one-time orders** (still fully
functional — renewals are granted by the end-of-period cron). With it, checkout
creates true recurring Razorpay Subscriptions.

1. Dashboard → **Subscriptions → Plans → + New Plan**.
2. Create four INR plans (amounts must match the app catalog):
   | Plan name | Amount | Billing frequency |
   |---|---|---|
   | AcquisitionOS Pro Monthly | ₹1,599 | Every 1 month |
   | AcquisitionOS Pro Yearly | ₹11,999 | Every 12 months |
   | AcquisitionOS Elite Monthly | ₹5,199 | Every 1 month |
   | AcquisitionOS Elite Yearly | ₹37,999 | Every 12 months |
3. Copy each `plan_…` id into env:

```env
RAZORPAY_PLAN_PRO_MONTHLY=plan_XXXXXXXXXXXX
RAZORPAY_PLAN_PRO_YEARLY=plan_XXXXXXXXXXXX
RAZORPAY_PLAN_ELITE_MONTHLY=plan_XXXXXXXXXXXX
RAZORPAY_PLAN_ELITE_YEARLY=plan_XXXXXXXXXXXX
```

4. Optional tenure tuning (defaults are 12 monthly / 5 yearly cycles):
   `RAZORPAY_SUBSCRIPTION_TOTAL_COUNT_MONTHLY`, `RAZORPAY_SUBSCRIPTION_TOTAL_COUNT_YEARLY`.

> Keeping dashboard plan amounts in sync with
> `src/lib/payments/plan-config.ts` is mandatory — the order-record amount is
> computed server-side, and the webhook amount guard rejects mismatches.

## 4. Configure the webhook

1. Dashboard → **Account & Settings → Webhooks → + New Webhook**.
2. **URL**: `https://YOUR-DOMAIN/api/payments/webhook/razorpay`
3. **Secret**: the same long random string as `RAZORPAY_WEBHOOK_SECRET`.
4. **Active events** (tick exactly these):
   - `payment.captured`
   - `payment.failed`
   - `refund.created`
   - `refund.processed`
   - `subscription.charged` (only if using recurring)
   - `subscription.cancelled`
   - `subscription.halted`
   - `subscription.completed`
5. Save. Use the "Send test webhook" button to confirm a 200 response.

Local development: use a tunnel (ngrok / cloudflared) for the public URL, or
rely on the verify route (§5) which works fully on localhost.

## 5. How verification works (why the app stays secure)

The browser's "payment successful" callback is **never trusted**. After the
Razorpay modal closes successfully, the app calls
`POST /api/payments/razorpay/verify`, which:

1. Recomputes `HMAC-SHA256(order_id|payment_id, RAZORPAY_KEY_SECRET)` and
   compares in constant time — rejects forged callbacks.
2. Calls Razorpay's API (`payments.fetch`) and requires `captured`/`authorized`.
3. Compares the gateway amount against the server-stored order amount.
4. Activates the subscription/credits **idempotently** through the same shared
   service the webhook uses — a webhook arriving later is a no-op, and a
   webhook arriving earlier makes the verify call report "already processed".

If the browser dies before step 4, the webhook (or the reconciliation cron at
`/api/cron/payment-reconciliation`, which checks pending Razorpay orders older
than 15 minutes) completes activation.

## 6. Test the integration

Test mode uses Razorpay's standard test instruments (shown on the checkout
page in test mode, e.g. test UPI IDs like `success@razorpay`, test cards, and
the "NetBanking → mock" bank):

| Scenario | How |
|---|---|
| Successful payment | Any test UPI `success@razorpay` / valid test card |
| Failed payment | `failure@razorpay` UPI / test card ending 111 |
| Cancelled checkout | Close the Razorpay modal → app shows "Payment cancelled", nothing activated |
| Duplicate webhook | Razorpay retries automatically; watch `PaymentWebhook` rows — only one processed activation |
| Renewal | Dashboard → Subscriptions → pick the test subscription → "Charge now" (needs a `plan_` configured) |

Check the results:
- `GET /api/payments/history` (authenticated) → order `status: completed`
- `/dashboard/billing` → payment row shows the **Razorpay** badge
- `User.plan` / `User.credits` updated, `CreditsLedger` has a `plan_upgrade` row

## 7. Going live

1. Complete KYC → dashboard unlocks **Live mode**.
2. Generate **Live** API keys → replace the `rzp_test_…` env values
   (`RAZORPAY_KEY_ID`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`).
3. Recreate the four plans in **live** mode → update `RAZORPAY_PLAN_*` envs.
4. Re-register the webhook in live mode with a fresh secret.
5. Never mix test and live credentials in one deployment.
6. Verify `provider-status` reports `"mode": "live"`.

## 8. Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `provider-status` shows razorpay unavailable | Missing `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` | Set both, restart |
| "Razorpay checkout is missing order identifiers" | Order creation failed server-side | Check server logs + `PaymentOrder` rows; usually credentials or plan config |
| Checkout opens but immediately errors | Key id/secret mismatch or domain not allowed | Regenerate keys together; check Razorpay dashboard → Settings → payment pages domain config |
| Webhook 404 in Razorpay dashboard | Wrong URL path | Must be exactly `/api/payments/webhook/razorpay` (POST) |
| Webhook signature rejected | Secret mismatch | The dashboard webhook secret must equal `RAZORPAY_WEBHOOK_SECRET` exactly |
| "Amount verification failed" in logs | Dashboard plan amount ≠ app catalog amount | Re-align plan amounts (§3) |
| Payment succeeded but plan inactive | Webhook lost + browser closed | Wait for reconciliation cron (≤6h) or have the user revisit — verify route/`verify-session` heals it; check `PaymentWebhook.processingError` |
| Halted subscription stuck in past_due | Customer mandate paused | Customer retries payment → `subscription.charged` → active; or cancel and re-subscribe |
