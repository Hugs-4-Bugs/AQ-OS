# Task 1-b: Invoice Service + Webhook Processor

## Agent: Backend Services Agent

## Task
Create two complete backend service files for AcquisitionOS Phase 5 — Payments System:
1. `/home/z/my-project/src/lib/invoice-service.ts` — Invoice generation service
2. `/home/z/my-project/src/lib/webhook-processor.ts` — Webhook processing service

## Work Done

### File 1: invoice-service.ts
- **Invoice numbering**: Thread-safe auto-incrementing with format `INV-{YYYYMMDD}-{XXXX}` using DB transaction with `findFirst` + increment pattern
- **Line items**: JSON array with `{ description, quantity, unitPrice, amount }` — includes subscription line item and discount line item
- **GST breakdown**: Full CGST/SGST (intra-state Maharashtra) or IGST (inter-state) calculation based on user location and company state
- **Invoice data generation**: Complete `InvoiceData` interface with all fields for PDF rendering
- **HTML generation**: `generateInvoiceHTML()` produces professional, print-ready HTML invoice with:
  - Company header with name, address, GST number
  - Invoice number, date, currency
  - Customer details (name, email, GST number)
  - Line items table with description, qty, unit price, amount
  - Tax breakdown section (CGST/SGST or IGST)
  - Amount in words (Indian numbering system: Crore, Lakh, Thousand)
  - GST summary table for Indian invoices
  - Professional footer with company details
- **DB operations**: `generateInvoice()`, `getInvoiceData()`, `getInvoiceForUser()`, `getInvoicesForUser()` with pagination
- **Company details**: From env vars with defaults (AcquisitionOS Technologies Pvt. Ltd., 27AABCA1234F1Z5, Mumbai)
- **Idempotency**: Checks for existing invoice on same payment order before creating

### File 2: webhook-processor.ts
- **Razorpay verification**: HMAC-SHA256 signature verification using `createHmac('sha256', secret).update(body).digest('hex')` with constant-time comparison (timing-safe)
- **Stripe verification**: Uses `stripe.webhooks.constructEvent()` for official verification
- **Idempotency**: PaymentWebhook table with unique `eventId` — checks before processing, records all events
- **Replay protection**: Rejects events with timestamps > 5 minutes from current time
- **Razorpay event handlers**:
  - `payment.captured`: Activates subscription via `confirmPaymentAndActivate()` with atomic transaction
  - `payment.failed`: Updates order status, logs failure
  - `subscription.cancelled`: Marks subscription as canceled
  - `subscription.charged`: Handles renewal, extends billing period
- **Stripe event handlers**:
  - `checkout.session.completed`: Activates subscription, stores Stripe customer/subscription IDs
  - `invoice.payment_failed`: Marks subscription as past_due, updates order
  - `customer.subscription.deleted`: Marks subscription as expired
  - `invoice.payment_succeeded`: Handles renewal, extends billing period
- **Failed webhook logging**: Records in PaymentWebhook with `processingError` field
- **Security**: Never exposes internal errors, always returns 200-safe results, audit logs all events
- **Utility functions**: `timingSafeEqual()` for constant-time comparison, user ID extraction helpers

### Additional Fix
- Fixed lint error in `payment-service.ts` line 1583: replaced `require('crypto')` with `await import('crypto')` to resolve `@typescript-eslint/no-require-imports` error

## Files Created
- `src/lib/invoice-service.ts` (~450 lines)
- `src/lib/webhook-processor.ts` (~570 lines)

## Files Modified
- `src/lib/payment-service.ts` (line 1583: require → import fix)

## Lint Status
0 errors, 1 pre-existing warning (TanStack Table incompatible library)

## Dependencies
- Uses existing `db` from `@/lib/db`
- Uses existing `logPaymentEvent` from `@/lib/billing-audit`
- Uses existing `confirmPaymentAndActivate` from `@/lib/subscription-service`
- Uses existing `PLAN_CREDITS`, `PlanType` from `@/lib/entitlement-service`
- Requires `stripe` package (already installed)
- Uses Node.js `crypto` module for HMAC-SHA256
