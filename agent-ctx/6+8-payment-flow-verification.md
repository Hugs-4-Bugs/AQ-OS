# Task 6+8: Payment Flow Verification and Fixes

## Summary
Verified the complete payment → subscription activation flow across 6 endpoints and fixed 9 issues.

## Files Modified
1. `src/app/api/payments/webhook/stripe/route.ts` — Invoice try/catch
2. `src/app/api/payments/webhook/razorpay/route.ts` — Invoice try/catch
3. `src/app/api/payments/create-order/route.ts` — Race condition fix, metadata fix, orderId in URLs
4. `src/lib/subscription-service.ts` — Subscription creation, credits ledger delta

## Key Fixes
- Race condition: Payment order now created BEFORE provider orders
- Stripe metadata now includes orderId for reliable webhook matching
- Both webhooks: Invoice creation wrapped in try/catch (non-blocking)
- confirmPaymentAndActivate creates subscription if none exists
- CreditsLedger correctly records delta instead of total
