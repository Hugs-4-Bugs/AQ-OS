# Task: Create Razorpay Integration Service

## Task ID: razorpay-service-creation
## Agent: Main Agent
## Status: COMPLETED

## Summary
Created `/home/z/my-project/src/lib/razorpay-service.ts` — a complete production-grade Razorpay integration service for AcquisitionOS.

## Functions Implemented
1. **`createRazorpayOrder(params)`** — Creates Razorpay order via SDK, stores PaymentOrder in DB, applies coupons, returns checkout config
2. **`verifyPaymentSignature(params)`** — HMAC-SHA256 signature verification with timing-safe comparison
3. **`verifyWebhookSignature(body, signature)`** — Webhook signature verification
4. **`handlePaymentCaptured(payload)`** — Atomic transaction: updates PaymentOrder, Subscription, User, CreditsLedger, Invoice, Coupon
5. **`handlePaymentFailed(payload)`** — Updates PaymentOrder to failed, Subscription to past_due
6. **`handleSubscriptionCharged(payload)`** — Handles recurring payments, extends subscription period
7. **`handleSubscriptionCancelled(payload)`** — Cancels subscription, schedules downgrade
8. **`processRazorpayWebhook(rawBody, signature, parsedEvent)`** — Main dispatcher with signature verification and idempotency
9. **`fetchRazorpayOrder(orderId)`** — Fetch order from Razorpay API
10. **`fetchRazorpayOrderPayments(orderId)`** — Fetch payments for an order
11. **`cancelRazorpaySubscription(subId, cancelAtCycleEnd)`** — Cancel via SDK
12. **`getRazorpayKeyId()`** — Safe key ID accessor for frontend
13. **`isRazorpayConfigured()`** — Config check
14. **`getWebhookProcessingStats()`** — Monitoring stats
15. **`retryFailedWebhook(webhookId)`** — Retry failed webhook events

## Types Exported
- `CreateRazorpayOrderParams`, `CreateRazorpayOrderResult`
- `VerifyPaymentSignatureParams`, `VerifyPaymentSignatureResult`
- `VerifyWebhookSignatureResult`
- `RazorpayPaymentCapturedPayload`, `RazorpayPaymentFailedPayload`
- `RazorpaySubscriptionChargedPayload`, `RazorpaySubscriptionCancelledPayload`
- `RazorpayWebhookEvent`, `WebhookProcessResult`

## Security Rules Followed
- ✅ NEVER trusts frontend payment claims — all verified via webhook
- ✅ NEVER updates DB before webhook signature verification
- ✅ ALWAYS uses Prisma $transaction for atomic operations
- ✅ ALWAYS logs audit events
- ✅ NEVER stores raw card/payment details
- ✅ NEVER exposes secret keys to frontend
- ✅ Idempotency via PaymentWebhook eventId (unique constraint)
- ✅ Timing-safe string comparison to prevent timing attacks

## Lint Status
✅ ESLint passed with 0 errors (1 unrelated warning from leads-tab.tsx)
✅ Dev server running without compilation errors
