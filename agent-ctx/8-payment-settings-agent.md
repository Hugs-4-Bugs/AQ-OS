# Task 8 - Payment & Settings Agent

## Task: Create payment API routes and enhance settings integrations UI

### Work Completed

#### Task A: Payment API Routes

1. **Installed packages**: `razorpay@2.9.6` and `stripe@22.1.1`

2. **Created `/src/app/api/payments/create-order/route.ts`**
   - POST endpoint creates payment orders
   - Plan pricing for Pro and Elite in INR and USD
   - GST calculation (18%) for Indian currency
   - Coupon validation with plan applicability, expiry, and usage checks
   - Discount computation (percent or flat)
   - Returns order details with razorpayOrderId for frontend checkout

3. **Created `/src/app/api/payments/validate-coupon/route.ts`**
   - POST endpoint validates coupon codes
   - Checks: active status, expiry date, usage limit, plan applicability
   - Returns discount type and value if valid

4. **Created `/src/app/api/payments/webhook/razorpay/route.ts`**
   - POST endpoint handles Razorpay webhooks
   - HMAC signature verification
   - Idempotency check via audit log
   - Handles payment.captured event
   - Updates order status, creates/updates subscription, allocates credits
   - Updates coupon usage count

5. **Created `/src/app/api/payments/webhook/stripe/route.ts`**
   - POST endpoint handles Stripe webhooks
   - Idempotency check via audit log
   - Handles checkout.session.completed event
   - Updates order status, creates/updates subscription, allocates credits

6. **Created `/src/app/api/payments/credit-addons/route.ts`**
   - GET returns available addon packages (100, 500, 1000 credits)
   - POST creates addon payment orders with tax

#### Task B: Enhanced Settings Panel Integrations

1. **Gmail Card**:
   - Connected/disconnected status badges
   - "Connect Gmail" button opens consent dialog before OAuth
   - Consent dialog shows permission scope (what we will/won't do)
   - "Continue with Google" button in dialog
   - Connected state shows email and "Disconnect" button
   - Plan gate: "Pro+ feature" badge for Free users

2. **Telegram Card**:
   - "Generate Link Code" button with random code generation
   - Code displayed in copyable box
   - Setup instructions (3 steps)
   - "Verify Connection" button after code generated
   - Connected state shows Chat ID and "Unlink" button
   - PlanGate component for Free users

3. **WhatsApp Card**:
   - Phone number input + "Send OTP" button (Elite only)
   - OTP verification input + "Verify" button
   - Connected state shows phone and "Disconnect" button
   - Plan gate: "Pro+ feature" for Free, "Elite for unlimited" for Pro
   - Limited messaging notice for Pro users

### Technical Details
- Added Dialog component import for Gmail consent modal
- Imported PlanGate from `@/components/dashboard/plan-gate`
- Added `useSubscriptionStore` for real plan state
- Added Crown icon import for plan gate badges
- Added new state: gmailConsentOpen, telegramConnected, telegramChatId, whatsappConnected
- Added handlers: handleGmailConnect, handleGmailDisconnect, handleTelegramConnect, handleTelegramDisconnect, handleWhatsappDisconnect
- Renamed local PlanGate to LocalPlanGate to avoid naming conflict
- Lint: 0 errors, 1 pre-existing warning
