# Task 2b — Integration API Routes & Subscription Cancellation Route

## Agent: Integration & Subscription API Routes Agent

## Summary
Created 8 API route files for integration endpoints (Gmail, Telegram, WhatsApp) and subscription management (cancel, check-eligibility).

## Files Created

### Gmail Integration
1. **`/src/app/api/integrations/gmail/connect/route.ts`** — GET handler generating Google OAuth URL with scopes (readonly, send, modify, userinfo.email), offline access, consent prompt, and user.id as state parameter
2. **`/src/app/api/integrations/gmail/revoke/route.ts`** — POST handler marking all active EmailAccount records as revoked for the authenticated user

### Telegram Integration
3. **`/src/app/api/integrations/telegram/generate-code/route.ts`** — POST handler generating ACQ-XXXXXX link codes with 10-minute expiry via TelegramConfig upsert
4. **`/src/app/api/integrations/telegram/disconnect/route.ts`** — POST handler setting isConnected=false and isPaused=true on TelegramConfig

### WhatsApp Integration
5. **`/src/app/api/integrations/whatsapp/send-otp/route.ts`** — POST handler generating 6-digit OTP stored via WhatsappConfig upsert with 5-minute expiry; returns `_dev_otp` for testing
6. **`/src/app/api/integrations/whatsapp/verify-otp/route.ts`** — POST handler verifying OTP validity and expiry, then marking WhatsappConfig as connected

### Subscription Management
7. **`/src/app/api/subscriptions/cancel/route.ts`** — POST handler for subscription cancellation with:
   - Prorated refund calculation (remaining fraction of billing period)
   - Stripe `cancel_at_period_end` update (graceful fallback if Stripe fails)
   - Local subscription update keeping status active until period end
   - Refund eligibility check (>20% remaining, minimum Rs 100)
   - Audit log entry with plan, billing cycle, refund details
   
8. **`/src/app/api/subscriptions/check-eligibility/route.ts`** — POST handler checking plan change eligibility with:
   - Plan rank system (free=0, pro=1, elite=2)
   - Same plan/cycle rejection
   - Yearly→monthly downgrade prevention
   - Monthly→yearly with remaining days calculation
   - Downgrade requires cancel-first flow
   - Upgrade always allowed

## Fixes Applied vs Spec
- **Bug fix**: Replaced `subscription.status in ['expired', 'canceled']` with `['expired', 'canceled'].includes(subscription.status)` — the `in` operator checks object keys, not array membership
- **Deprecation fix**: Replaced `Math.random().toString(36).substr(2, 6)` with `.substring(2, 8)` (substr is deprecated)
- **Stripe import**: Used dynamic import `(await import('stripe')).default` matching existing project pattern instead of top-level import with apiVersion
- **Safe date handling**: Added null-safe periodEnd formatting in check-eligibility

## Lint Results
All 8 new files pass ESLint with zero errors. Only pre-existing lint errors remain in legacy JS files.

## Database Models Used
- `EmailAccount` (gmail connect/revoke)
- `TelegramConfig` (telegram generate-code/disconnect)
- `WhatsappConfig` (whatsapp send-otp/verify-otp)
- `Subscription`, `PaymentOrder`, `AuditLog` (subscriptions cancel/check-eligibility)
