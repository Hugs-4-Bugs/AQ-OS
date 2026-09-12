# Phase 3: Auth Library — Work Record

**Task ID**: phase3-auth-lib
**Agent**: auth-lib-agent
**Date**: 2025-03-04

## Summary

Created `/home/z/my-project/src/lib/auth.ts` — the centralized authentication & authorization library for AcquisitionOS.

## Key Decisions & Schema Corrections

The provided template had several field names that didn't match the actual Prisma schema. These were corrected:

| Template Assumption | Actual Prisma Schema | Correction |
|---|---|---|
| `user.avatarUrl` | `user.avatar` | Mapped `avatar` → `avatarUrl` in AuthUser interface |
| `user.mfaEnabled` | No such field; MFA via `MfaConfig` relation | Query `mfaConfig` with `include` to resolve `isEnabled` |
| `loginHistory.ipAddress` | `loginHistory.ip` | Used correct field name `ip` |
| `loginHistory.userId` optional | `loginHistory.userId` required (FK) | Made userId required; added `recordLoginAttemptByEmail()` helper |
| `auditLog.userId` = 'system'/'anonymous' | `auditLog.userId` required (FK to User) | Made userId required; cannot use 'system' or 'anonymous' |

## Files Created

- `/home/z/my-project/src/lib/auth.ts` (551 lines)

## Exports

### Token Functions
- `generateAccessToken()`, `generateRefreshToken()`, `verifyToken()`, `extractBearerToken()`

### Cookie Helpers
- `setAuthCookies()`, `clearAuthCookies()`

### Password Functions
- `hashPassword()`, `verifyPassword()`, `validatePasswordStrength()`, `validateEmail()`

### OTP Functions
- `generateOTP()`, `generateMagicLinkToken()`

### Session Management
- `createSession()`, `revokeSession()`, `revokeAllUserSessions()`, `isSessionValid()`, `getUserActiveSessions()`

### Login History
- `recordLoginAttempt()`, `recordLoginAttemptByEmail()`

### Brute Force Protection
- `isAccountLocked()`, `isIpRateLimited()`

### MFA Functions
- `generateMfaSecret()`, `generateBackupCodes()`, `isMfaEnabled()`

### Audit Logging
- `logAuthEvent()`

### Auth Helpers for API Routes
- `getAuthUser()`, `requireAuth()`, `hasRole()`, `isAdmin()`

### Error Classes
- `AuthError`

### Request Info Helpers
- `getClientIp()`, `getUserAgent()`

### Types
- `JwtPayload`, `AuthUser`, `UserRole`, `AuthEventType`

### Constants
- `JWT_SECRET`, `JWT_ACCESS_EXPIRY`, `JWT_REFRESH_EXPIRY`, `BCRYPT_ROUNDS`, `OTP_EXPIRY_SECONDS`, `OTP_MAX_ATTEMPTS`, `MAX_LOGIN_ATTEMPTS`, `LOCKOUT_MINUTES`

## Verification

- ESLint: Passed (0 errors from auth.ts)
- Dev server: Running without compilation errors
