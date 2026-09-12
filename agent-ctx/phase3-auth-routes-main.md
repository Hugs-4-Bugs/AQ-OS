# Task: Phase 3 Auth + Authorization - Core Auth API Routes Rewrite

## Task ID
phase3-auth-routes

## Agent
main

## Summary

Rewrote all 7 existing auth API routes to production-grade quality using the centralized auth library at `/home/z/my-project/src/lib/auth.ts`, and created 4 new routes (refresh, MFA setup/verify/disable).

## Changes Made

### Prisma Schema Updates
- Added `authProvider` (String, default "email") to User model
- Added `emailVerificationOtp` (String?) to User model  
- Added `emailVerificationOtpExpiry` (DateTime?) to User model
- Added `resetOtp` (String?) to User model
- Added `resetOtpExpiry` (DateTime?) to User model

### Auth Library Updates (`/src/lib/auth.ts`)
- Added complete TOTP implementation (RFC 6238) with:
  - `generateTotpSecret()` - Base32-encoded random secret
  - `generateTotpUri()` - otpauth:// URI for QR codes
  - `verifyTotpCode()` - TOTP verification with ±1 window for clock drift
  - `generateBackupCodes()` - 8-character hex backup codes
  - Custom Base32 encode/decode functions
  - HMAC-SHA1 based TOTP calculation with dynamic truncation

### Rewritten Routes (7)

1. **POST /api/auth/signup** - Full validation, OTP stored on User record, trial subscription, audit logging
2. **POST /api/auth/signin** - Account lockout check, OAuth detection, MFA flow, session creation, cookie setting
3. **POST /api/auth/verify-email** - Uses OTP from User record (not AuditLog), clears OTP after verification, plus PUT handler for resend
4. **POST /api/auth/forgot-password** - Stores OTP on User.resetOtp field, rate limiting, constant response (no enumeration)
5. **POST /api/auth/reset-password** - Password strength validation, brute-force protection, session invalidation on reset
6. **POST /api/auth/signout** - Revokes session via refresh token, clears cookies, audit logging
7. **GET /api/auth/me** - Uses `getAuthUser()` supporting both Bearer token and cookie auth

### New Routes (4)

8. **POST /api/auth/refresh** - Token rotation: verifies refresh token, checks session validity, revokes old session, creates new token pair
9. **POST /api/auth/mfa/setup** - Requires auth + password verification, generates TOTP secret + QR URI + backup codes, stores hashed backup codes
10. **POST /api/auth/mfa/verify** - Verifies TOTP code during login, supports backup codes, completes login flow with session creation
11. **POST /api/auth/mfa/disable** - Requires auth + password + current TOTP code, clears MFA config

### Key Design Decisions
- OTPs stored directly on User model fields instead of AuditLog (cleaner, faster queries)
- Custom TOTP implementation avoids otplib dependency (had ESM/CJS interop issues with Turbopack)
- Backup codes are bcrypt-hashed for storage, plaintext shown only once during setup
- All routes use try/catch with proper HTTP status codes
- Audit logging for all auth events via `logAuthEvent()`
- devOtp only returned in development mode, never in production

## Files Modified
- `prisma/schema.prisma` - Added 5 fields to User model
- `src/lib/auth.ts` - Added TOTP functions (generateTotpSecret, generateTotpUri, verifyTotpCode)
- `src/app/api/auth/signup/route.ts` - Complete rewrite
- `src/app/api/auth/signin/route.ts` - Complete rewrite
- `src/app/api/auth/verify-email/route.ts` - Complete rewrite + resend endpoint
- `src/app/api/auth/forgot-password/route.ts` - Complete rewrite
- `src/app/api/auth/reset-password/route.ts` - Complete rewrite
- `src/app/api/auth/signout/route.ts` - Complete rewrite
- `src/app/api/auth/me/route.ts` - Complete rewrite
- `src/app/api/auth/refresh/route.ts` - New file
- `src/app/api/auth/mfa/setup/route.ts` - New file
- `src/app/api/auth/mfa/verify/route.ts` - New file
- `src/app/api/auth/mfa/disable/route.ts` - New file

## Test Results
All 11 routes compile and respond correctly:
- Validation errors return 400
- Auth required returns 401
- Proper JSON error messages
- Lint passes with 0 errors (1 pre-existing warning in leads-tab.tsx)
