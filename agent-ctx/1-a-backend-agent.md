# Task 1-a: GST Service + Payment Service

## Agent: Backend Agent
## Task ID: 1-a

### Work Completed

#### File 1: `/home/z/my-project/src/lib/gst-service.ts`
Complete GST/Tax calculation service with:

- **GST Calculation** (`calculateGST`): Full tax calculation supporting:
  - International users: tax exempt (0% GST)
  - Indian users intra-state (same state as merchant): CGST 9% + SGST 9%
  - Indian users inter-state (different state from merchant): IGST 18%
  - Merchant default state: MH (Maharashtra)
  - All amounts rounded to 2 decimal places

- **GST Number Validation** (`validateGSTNumber`): Validates against regex `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$` plus state code range check (01-37)

- **Country Detection** (`isIndianUser`): Checks if country === 'IN' or 'IND' (case-insensitive)

- **Format GST Breakdown** (`formatGSTBreakdown`): Human-readable string for invoices

- **Additional helpers**: `getEffectiveGSTRate`, `getStateFromGSTNumber`, `getPANFromGSTNumber`, `isIntraState`, `getTaxTypeLabel`, `getGSTInvoiceLines`

#### File 2: `/home/z/my-project/src/lib/payment-service.ts`
Complete payment orchestration service with:

- **`createPaymentOrder`**: Razorpay order creation with full validation pipeline:
  - Plan validation (pro/elite only)
  - Billing cycle validation
  - Plan change validation via `isValidPlanChange`
  - Idempotency key check (returns existing pending order)
  - Coupon discount calculation via `validateAndApplyCoupon`
  - GST calculation via `gst-service`
  - Razorpay SDK order creation (`razorpay.orders.create()`)
  - DB PaymentOrder record with all pricing fields
  - Audit logging

- **`createStripeCheckoutSession`**: Stripe Checkout Session creation with same validation:
  - Stripe SDK session creation (`stripe.checkout.sessions.create()`)
  - Metadata includes orderId, userId, plan, billingCycle
  - Support for coupon via pre-calculated discount
  - DB PaymentOrder record
  - Audit logging

- **`activateSubscriptionAfterPayment`**: Atomic activation via `$transaction`:
  - Idempotency check (returns existing if already completed)
  - Update PaymentOrder status → 'completed'
  - Update/create Subscription (plan, status='active', period dates, provider IDs)
  - Update User (plan, credits, creditsMonthly, isTrial=false)
  - Create CreditsLedger entry
  - Generate Invoice (DB record with line items)
  - Audit logging (payment + subscription events)
  - Coupon usage increment

- **`handlePaymentFailure`**: Failure handling:
  - Update PaymentOrder status → 'failed'
  - Set Subscription to 'past_due'
  - 7-day grace period
  - Retry eligibility (max 3 retries)
  - Audit logging

- **`retryPayment`**: Creates new order via same provider for same plan/cycle

- **`cancelSubscriptionPayment`**: Sets cancelAtPeriodEnd=true (keeps access until period end)

- **`getBillingPreview`**: Calculates proration credit, new amount, GST, effective date

- **`getPaymentHistory`**: Paginated PaymentOrder records with Invoice data

- **Webhook helpers**: `recordWebhookEvent` (dedup), `markWebhookProcessed`, `verifyRazorpayWebhookSignature`, `verifyStripeWebhookSignature`

- **Plan pricing**: Exact values as specified (INR/USD × monthly/yearly for free/pro/elite)

### Integration Points
- Uses `db` from `@/lib/db`
- Uses `PLAN_CREDITS`, `PlanType`, `isValidPlanChange`, `getPlanChangeDirection`, `getPlanLevel` from `@/lib/entitlement-service`
- Uses `validateAndApplyCoupon`, `incrementCouponUsage` from `@/lib/coupon-service`
- Uses `logPaymentEvent`, `logSubscriptionEvent` from `@/lib/billing-audit`
- Uses `addCredits` from `@/lib/credit-service`
- Uses `calculateGST`, `isIndianUser`, `validateGSTNumber` from `@/lib/gst-service`
- Razorpay SDK: `import Razorpay from 'razorpay'` (package already installed)
- Stripe SDK: `import Stripe from 'stripe'` (package already installed, apiVersion '2024-06-20')

### Lint Status
- 0 errors, 1 pre-existing warning (TanStack Table)
- Dev server running normally
