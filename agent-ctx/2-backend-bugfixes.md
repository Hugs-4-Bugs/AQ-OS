# Task 2 — Backend Bug Fixes

**Agent**: Backend Bugfix Agent
**Date**: 2025-01-22

## Summary

Fixed 4 backend bugs in the AcquisitionOS project. All fixes are TypeScript-error-free and preserve existing behavior while adding the required enhancements.

## Fixes Applied

### 1. Metrics API Bug — `cost` → `costUsd`
**File**: `src/app/api/metrics/route.ts`
**Problem**: The `AiCostRecord` aggregate referenced `_sum: { cost: true }` and `aiCostAggregate._sum.cost`, but the Prisma schema defines the field as `costUsd` (not `cost`). This would cause a runtime Prisma error when hitting `/api/metrics`.
**Fix**: Changed both occurrences to use `costUsd`:
- `_sum: { costUsd: true }`
- `aiCostAggregate._sum.costUsd`

### 2. Session Creation Race Condition — P2002 Handling
**File**: `src/lib/auth.ts` — `createSession()` function
**Problem**: The `UserSession.refreshToken` field has a `@unique` constraint. If `createSession` is called with a refreshToken that already exists in the DB (e.g., re-login, race condition, token reuse), Prisma throws a P2002 unique constraint violation error.
**Fix**: Added two layers of protection:
1. **Pre-emptive cleanup**: Before creating the session, `deleteMany` is called to remove any existing session with the same `refreshToken`.
2. **P2002 catch-and-retry**: If the create still fails with P2002 (possible in a race between deleteMany and create), the handler deletes the conflicting record and retries the insert once. Other errors are re-thrown.

### 3. Signout Enhancement — `allDevices` Query Parameter
**File**: `src/app/api/auth/signout/route.ts`
**Problem**: The signout endpoint only revoked the session matching the current `refresh_token` cookie, with no way to log out all devices.
**Fix**: Added `allDevices` query parameter support:
- `POST /api/auth/signout` — default behavior, revokes only the current session (single-device logout)
- `POST /api/auth/signout?allDevices=true` — revokes ALL sessions for the authenticated user by calling `revokeAllUserSessions()`
- Added import for `revokeAllUserSessions`
- Audit log distinguishes between single-device and all-device signout
- Response message is contextual ("Signed out all devices successfully" vs "Signed out successfully")

### 4. `/api/auth/me` — Subscription Plan Resolution
**File**: `src/lib/auth.ts` — `mapUserToAuthUser()` and `getAuthUser()`
**Problem**: `getAuthUser` only used the `User.plan` field (which defaults to `"free"`), ignoring the `Subscription` table entirely. If a user had an active subscription with a higher plan (e.g., "pro", "elite"), the `/api/auth/me` endpoint would still return "free".
**Fix**:
- Updated `mapUserToAuthUser` to accept `subscriptions: { plan: string; status: string }[]` in the user parameter
- The function now resolves the plan by first looking for an active/trialing subscription, falling back to `user.plan`, then to `'free'`
- Updated both `db.user.findUnique` calls in `getAuthUser` (Bearer token path and cookie path) to include the `subscriptions` relation with a filter for `status: { in: ['active', 'trialing'] }`, ordered by `createdAt: 'desc'` and limited to 1

## Verification
- TypeScript compilation (`tsc --noEmit`) shows **no errors** in any of the modified files
- ESLint shows only pre-existing errors in unrelated legacy JS files
- Dev server starts without errors
