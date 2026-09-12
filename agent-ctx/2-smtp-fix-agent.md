# Task 2: SMTP Fix Agent — Work Record

## Task
Fix SMTP environment variable alignment and ensure real email delivery flow

## Summary
All changes completed successfully. The email delivery pipeline now follows the correct flow: OTP/magic link → email service → SMTP → inbox.

## Changes Made

### 1. email.ts — SMTP env var alignment
- Added `getSmtpPassword()` helper: `SMTP_PASSWORD` (priority) → `SMTP_PASS` (fallback)
- Updated `isSmtpConfigured()` to use `getSmtpPassword()`
- Updated `sendViaSmtp()` auth.pass to use `getSmtpPassword()`
- Updated `sendEmail()` from address: `SMTP_FROM` (priority) → `EMAIL_FROM` → default
- Console logger fallback preserved as last resort

### 2. Auth routes — removed email delivery gating (6 routes)
All routes now always call the email service. The email service handles its own fallback chain.
- `/api/auth/otp/request/route.ts`
- `/api/auth/magic-link/request/route.ts`
- `/api/auth/forgot-password/route.ts`
- `/api/auth/signup/route.ts`
- `/api/auth/resend-verification/route.ts`
- `/api/auth/verify-email/route.ts`

### 3. Service files — removed email delivery gating (4 files + 1 route)
- `src/lib/auth.ts` (security alert email)
- `src/lib/auth-edge-cases.ts` (email change verification)
- `src/lib/account-lock-service.ts` (lock/unlock notifications, 2 instances)
- `src/lib/payment-recovery-service.ts` (payment failure — also fixed import bug and added missing text field)
- `/api/auth/security/lock-status/route.ts` (unlock verification)

## Key Design Decisions
- `AUTH_DEV_MODE=true` (explicitly set) still shortcuts to console logging inside `sendEmail()`
- When `AUTH_DEV_MODE` is NOT set, real delivery is always attempted
- `shouldBypassEmail()` gate removed from all callers — the email service owns its fallback chain
- `isEmailServiceConfigured()` still exported for health checks / UI feature flags

## Verification
- ESLint: 0 new errors (9 pre-existing in legacy JS files)
- Dev server: running, health check 200 OK
