# Task 3 — Auth Gate Enhancement + Token Refresh + Suspicious Login + CSRF

## Summary

Enhanced the AcquisitionOS authentication system with four major improvements: full multi-page auth flow, automatic token refresh, suspicious login detection, and CSRF protection.

## Files Created

1. **`/src/hooks/use-token-refresh.ts`** — Hook that automatically refreshes access tokens every 14 minutes, handles tab visibility changes, and logs out on 401 errors.

2. **`/src/app/api/auth/resend-verification/route.ts`** — New API endpoint that regenerates and stores an email verification OTP for users who haven't verified their email yet.

## Files Modified

1. **`/src/components/dashboard/auth-gate.tsx`** — Complete rewrite:
   - Added `AuthPage` state type with 7 pages: signin, signup, verify-email, forgot-password, reset-password, mfa-verify, magic-link
   - Tracks `flowEmail` for flows that need email context (verify-email, reset-password)
   - Auto-switches to MFA page when `mfaRequired` becomes true in auth store
   - Handles all navigation: SignIn↔SignUp, SignIn→ForgotPassword→ResetPassword→SignIn, SignUp→VerifyEmail→SignIn, MFA→Dashboard
   - Includes Magic Link page component
   - Integrates `useTokenRefresh` hook for authenticated users
   - Fully responsive and mobile-safe

2. **`/src/components/dashboard/auth-pages-v2.tsx`** — SignInPage enhanced:
   - Added `onMagicLinkClick` prop
   - Added "Sign in with Magic Link" button
   - Added "Sign in with OTP" button (placeholder)
   - Both buttons render in a responsive flex layout

3. **`/src/lib/auth.ts`** — Added two new functions:
   - `detectSuspiciousLogin()`: Checks login history for new IPs or user agents in the last 30 days
   - `sendSecurityAlert()`: Logs security alert and records suspicious_login event in audit log

4. **`/src/app/api/auth/signin/route.ts`** — Added suspicious login detection:
   - Imports `detectSuspiciousLogin` and `sendSecurityAlert`
   - After successful login + audit logging, checks for suspicious patterns
   - Fires security alert asynchronously (non-blocking)

5. **`/src/middleware.ts`** — Complete rewrite with:
   - CSRF protection: POST/PUT/DELETE/PATCH require either `access_token` cookie (SameSite=Strict) or `X-Requested-With: XMLHttpRequest` header
   - Public auth routes exempted from CSRF
   - Security headers on ALL responses: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy, Content-Security-Policy
   - Removed wildcard CORS (strict SameSite cookies handle this)
   - Preserved existing JWT verification logic with jose

## Lint Result

0 errors, 1 pre-existing warning (TanStack Table incompatible library)
