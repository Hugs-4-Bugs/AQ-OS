# Task 2-3-4: Webhook Transaction Wrapping, PaymentPastDue Flag, Invoice Status Updates

## Summary
Completed all 3 improvements to the Stripe webhook handler and admin refund route:
1. Wrapped 5 webhook handlers in `db.$transaction()` for data consistency
2. Added `paymentPastDue` flag management to `customer.subscription.updated` handler
3. Added Invoice status updates for refunds and chargebacks

## Files Modified
- `src/app/api/payments/webhook/stripe/route.ts` — All 3 improvements applied
- `src/app/api/admin/refund/route.ts` — Invoice status update on admin refund

## Key Decisions
- Kept non-critical operations (notifications, audit logs, emails) OUTSIDE transactions
- Kept idempotency checks and webhook recording OUTSIDE transactions
- Consolidated the separate `paymentPastDue` user update in `customer.subscription.deleted` into the transaction's user update to avoid redundant DB calls
- Used `fullRefundSubscriptionData` variable to capture subscription data inside the transaction for use in audit logs outside
- Invoice lookups use `findUnique` with null checks since not all orders have invoices

## Lint Status
No new lint errors introduced.
