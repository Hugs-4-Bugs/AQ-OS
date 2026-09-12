# Task: Rewrite Webhook Handlers for AcquisitionOS Phase 5

## Task ID: webhook-rewrite

## Summary

Rewrote both webhook handler files to be thin route handlers that delegate all business logic to the service layer (`razorpay-service.ts` and `stripe-service.ts`).

## Files Modified

1. **`/home/z/my-project/src/app/api/payments/webhook/razorpay/route.ts`** — Complete rewrite
2. **`/home/z/my-project/src/app/api/payments/webhook/stripe/route.ts`** — Complete rewrite

## Changes Made

### Razorpay Webhook (`razorpay/route.ts`)

**Before:** 
- Had basic HMAC verification inline
- Used AuditLog table for idempotency (wrong table)
- Only handled `payment.captured` event
- All business logic was inline in the route handler
- No use of `razorpay-service.ts`

**After:**
- Reads raw body as text (critical for HMAC verification)
- Extracts `x-razorpay-signature` header
- Parses JSON payload separately from raw body
- Delegates to `processRazorpayWebhook(rawBody, signature, parsedEvent)` from `@/lib/razorpay-service`
- Service handles: signature verification, idempotency (via PaymentWebhook table), event routing for all Razorpay event types, DB mutations, audit logging
- Returns 200 for success (including already-processed events)
- Returns 400 for missing/invalid signatures
- Returns 500 for processing errors
- No auth required (webhooks from Razorpay servers)

### Stripe Webhook (`stripe/route.ts`)

**Before:**
- Parsed JSON without verifying signature
- Used AuditLog table for idempotency (wrong table)
- Only handled `checkout.session.completed` event
- All business logic was inline in the route handler
- No use of `stripe-service.ts`

**After:**
- Reads raw body as text (critical for signature verification)
- Extracts `stripe-signature` header
- Calls `verifyWebhookSignature(body, sigHeader)` to get verified Stripe.Event
- Calls `processWebhookEvent(event)` to handle the event
- Service handles: signature verification (via `stripe.webhooks.constructEvent()`), idempotency (via PaymentWebhook table), event routing for all Stripe event types, DB mutations, audit logging
- Returns 200 for success (including skipped/idempotent events)
- Returns 400 for missing/invalid signatures
- Returns 500 for processing errors
- No auth required (webhooks from Stripe servers)

## Design Principles

1. **Thin handlers**: Route handlers only do I/O (read body, headers) and delegate to service
2. **Raw body for verification**: Both handlers read body as text, not parsed JSON, since signature verification requires the exact raw bytes
3. **No auth**: Webhook endpoints receive requests from payment providers, not users
4. **Service layer owns everything**: Signature verification, idempotency, event routing, DB mutations, audit logging all live in the service
5. **Proper HTTP semantics**: 200 for success/idempotency, 400 for bad signatures, 500 for server errors

## Lint Results

- 0 errors, 1 pre-existing warning (unrelated to webhook changes)
- Dev server running with no compilation errors
