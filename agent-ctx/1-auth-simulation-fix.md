# Task 1 — Auth Simulation Fix

## Summary
Permanently eliminated authentication simulation/demo mode from AcquisitionOS. The "Demo Mode — Email delivery is simulated. OTPs & magic links are auto-completed." banner and all underlying bypass mechanisms have been removed.

## Root Cause
`AUTH_DEV_MODE=true` in `.env` triggered a cascade that:
1. Set `devMode = true` in feature-flags (default was `!prod`, which is `true` in development)
2. This enabled `AUTH_AUTO_VERIFY`, `AUTH_DEV_OTP_IN_RESPONSE`, and `AUTH_BYPASS_EMAIL`
3. API routes leaked OTPs/tokens in responses
4. Frontend auto-filled OTPs and auto-redirected magic links
5. DemoModeBanner displayed on all auth pages

## Files Modified (11)

### Backend
1. `.env` — `AUTH_DEV_MODE=true` → `false`
2. `src/lib/feature-flags.ts` — Default changed from `!prod` to `false`
3. `src/app/api/auth/otp/request/route.ts` — Removed devOtp from response
4. `src/app/api/auth/magic-link/request/route.ts` — Removed devToken/devLink from response
5. `src/app/api/auth/signup/route.ts` — Restructured: always requires verification, never auto-logins
6. `src/app/api/auth/forgot-password/route.ts` — Removed devOtp from response
7. `src/app/api/auth/resend-verification/route.ts` — Removed devOtp from response
8. `src/lib/email.ts` — Removed AUTH_BYPASS_EMAIL bypass check
9. `src/app/api/auth/config/route.ts` — Removed devOtpInResponse from response

### Frontend
10. `src/components/dashboard/auth-pages-v2.tsx` — Removed DemoModeBanner, devOtp auto-fill, initialOtp prop
11. `src/components/dashboard/auth-gate.tsx` — Removed DemoModeBanner, devOtp/devLink auto-fill, resetDevOtp state

## Verification
- Feature flags all resolve to `false` (confirmed in dev.log)
- Auth config endpoint returns `devMode: false`
- No new lint errors
- All simulation/bypass paths removed at both API and frontend levels
