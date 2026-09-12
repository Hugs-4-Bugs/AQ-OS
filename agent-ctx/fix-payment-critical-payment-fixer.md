---
Task ID: fix-payment-critical
Agent: Payment Fixer
Task: Fix 4 critical bugs in AcquisitionOS payment and plan enforcement system

Work Log:

AUDIT PERFORMED:
- Read worklog.md for context (previous agent: Final, completed 11 fix areas)
- Read all 7 target files to understand current state before making changes

FIX 1: Environment guard on /api/payments/confirm (CRITICAL SECURITY)
  File: src/app/api/payments/confirm/route.ts
  - Added NODE_ENV === 'production' check at the top of POST handler
  - Returns 403 with descriptive error message in production
  - Prevents direct API calls from activating plans without real payment
  - Dev mode still works for testing via /api/payments/confirm

FIX 2: api_access entitlement mismatch in UI
  Files: src/components/dashboard/upgrade-modal.tsx, src/components/dashboard/pricing-page.tsx
  - Backend (entitlement-service.ts): Pro plan has api_access = { limit: null, enabled: true }
  - UI FEATURE_COMPARISON had: { feature: 'API Access', free: false, pro: false, elite: true }
  - Changed both UI files to: { feature: 'API Access', free: false, pro: true, elite: true }
  - UI now correctly reflects that Pro plan includes API access

FIX 3: Credit add-on purchase flow
  Files: src/components/dashboard/upgrade-modal.tsx, src/components/dashboard/pricing-page.tsx
  - "Buy Now" buttons were non-functional (no onClick handlers)
  - Added handleBuyAddon function that:
    1. Calls POST /api/payments/create-order with addon details (credits, price, label, isAddon flag)
    2. Routes to Razorpay checkout or Stripe redirect based on provider
    3. Falls back to dev mode payment confirmation
  - Updated all "Buy Now" buttons with onClick={() => handleBuyAddon(addon)}
  - Added loading state (Loader2 spinner) when paymentState === 'creating_order'
  - Added disabled state during processing

FIX 4: Move coupon usage increment to webhooks
  Files:
  - src/app/api/payments/create-order/route.ts (removed incrementCouponUsage call)
  - src/app/api/payments/webhook/razorpay/route.ts (added incrementCouponUsage after confirmPaymentAndActivate)
  - src/app/api/payments/webhook/stripe/route.ts (added incrementCouponUsage after confirmPaymentAndActivate)
  - Removed incrementCouponUsage import from create-order (no longer needed there)
  - Added incrementCouponUsage import to both webhook files
  - Coupon usage now only increments after payment succeeds, preventing count inflation from abandoned/failed orders
  - Wrapped in try/catch as non-critical (don't block payment confirmation)

LINT RESULTS:
- bun run lint: 9 pre-existing errors in legacy JS files (custom-server.js, proxy/index.js, process-manager.js, server.js)
- 0 new errors introduced by these fixes
- Dev server compiles and runs successfully

Stage Summary:
- 6 files modified across backend and frontend
- All 4 critical fixes applied
- No new lint errors
- Dev server running successfully
