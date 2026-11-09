# Incident Report — Security Integration Test Database Isolation

**Incident ID:** INC-DB-ISOLATION-001
**Date:** 2026-11-09
**Severity:** P1 (Production Data at Risk)
**Status:** RESOLVED
**Author:** Automated Test Infrastructure Audit

---

## Summary

The file `tests/unit/security-integration.test.ts` hardcoded
`process.env.DATABASE_URL = 'file:/home/z/my-project/db/custom.db'`
in a `vi.hoisted()` block (line 16). This pointed the test's REAL
Prisma client at the **user's production database**. The test then ran
destructive queries (including `deleteMany` in `afterAll` cleanup)
against production data.

Additionally, two tests hardcoded a production user's email
(`kattyboy785@gmail.com`) for `db.user.findFirst()` lookups —
creating a data dependency on production records.

## Root Cause

### 1. Hardcoded Production Database Path

**File:** `tests/unit/security-integration.test.ts`
**Line:** 16 (before fix)
**Code:**
```ts
vi.hoisted(() => {
  process.env.DATABASE_URL = 'file:/home/z/my-project/db/custom.db';
});
```

`vi.hoisted()` runs before ALL imports. When `import { db } from '@/lib/db'`
executes on line 19, `src/lib/db.ts` reads `process.env.DATABASE_URL` and
finds the user's production database. The test then ran real Prisma queries
(upsert, deleteMany) against production data.

The `afterAll` cleanup function (lines 96-137) deleted test users and ALL
their dependent records (sessions, subscriptions, leads, workflows, audit
logs, etc.) from the production database.

### 2. Production User Email Dependency

**File:** `tests/unit/security-integration.test.ts`
**Lines:** 1282, 1567 (before fix)
**Code:**
```ts
const realUser = await db.user.findFirst({
  where: { email: 'kattyboy785@gmail.com' },
  select: { id: true }
});
```

These tests looked up a real production user by email. The tests only
passed when run against a database containing that user.

### 3. Missing Audit-on-Denial (Production Code Gap)

**File:** `src/lib/auth-middleware.ts`
**Function:** `logAuthorizationDenial` (lines 122-149 before fix)

Commit `48f799385` ("withPermissionAndMfa for sensitive mutations +
audit-on-denial + TS fixes") intended to create durable AuditLog entries
on authorization denials. However, the implementation only added
`console.warn` — no DB write. The comment explained: "console.warn is
used here to avoid circular dependencies with the audit-chain module."

Two tests expected AuditLog entries with
`securityEventType: 'authz_permission_denied'` to be created by the
middleware. These tests only "passed" before because the production
database had old AuditLog entries from prior usage.

## Impact

- **Data Safety:** The test could DELETE production user data via the
  `afterAll` cleanup function. If the test user IDs (`test-admin-phase33`,
  `su-1`, `ad-1`, `sp-1`, `an-1`, `me-1`, `vi-1`) matched real user IDs
  in production, those users and ALL their dependent records would be
  deleted.
- **Data Leakage:** The test imported the REAL `@/lib/db` and ran real
  Prisma queries — potentially exposing production data in test logs.
- **Test Reliability:** 67 test failures because the production DB schema
  was stale (missing `AuditLog.sequence` column added in a later Prisma
  schema version).

## Fix

### File 1: `tests/unit/security-integration.test.ts`

Replaced the `vi.hoisted()` block to:
1. Create a unique isolated SQLite database under `.test-db-isolated/`
   (gitignored).
2. Copy the schema from `test-schema.db` if it exists; otherwise generate
   the schema via `prisma db push` against the NEW isolated file (NOT the
   user's DB).
3. Clear the global Prisma client cache so `PrismaClient` re-initializes
   with the correct `DATABASE_URL`.

Replaced the `kattyboy785@gmail.com` lookups with test-created users
(`db.user.upsert` with test-local IDs and emails).

### File 2: `src/lib/auth-middleware.ts`

Added a `recordSecurityEvent` call inside `logAuthorizationDenial` using
a **dynamic import** to avoid the circular dependency:
```ts
const { recordSecurityEvent } = await import('@/lib/security/audit-chain');
await recordSecurityEvent({
  actorId: user.id,
  securityEventType: 'authz_permission_denied',
  severity: 'MEDIUM',
  action: `authz_denied:${perm}`,
  resource: path,
  details: { permission: perm, method, path },
  ipAddress: clientIP,
  userAgent: request.headers.get('user-agent') || undefined,
  outcome: 'denied',
});
```

This does NOT change any authorization decision — it only adds a DB audit
entry when a denial occurs. The 403 response is unchanged. The dynamic
import avoids the module-load-time circular dependency.

## Verification

| Check | Before | After |
|---|---|---|
| `tests/unit/security-integration.test.ts` | 67 fail / 38 pass (105) | **0 fail / 105 pass** |
| `tests/auth tests/rbac tests/security tests/api` (centralized) | 172 pass | **172 pass** (no regression) |
| `src/__tests__/lib/auth-middleware.test.ts` | 12 pass | **12 pass** (no regression) |
| Production DB access | YES — `file:/home/z/my-project/db/custom.db` | **NO** — isolated `.test-db-isolated/` file |
| `kattyboy785@gmail.com` lookup | YES | **NO** — test-created users |

## Prevention

1. **Never hardcode production database paths in test files.** Use
   `tests/helpers/isolated-test-db.ts` or the `vitest.setup.ts` per-worker
   isolation.
2. **Never look up production users by email in test files.** Create test
   users with `db.user.upsert` using test-local IDs.
3. **The `src/lib/db.ts:39` default** (`'file:/home/z/my-project/db/custom.db'`)
   is a secondary risk — if `DATABASE_URL` is unset, the app defaults to
   the user's DB. Consider changing this default to a non-production path
   or throwing an error when `DATABASE_URL` is unset.

## Files Changed

| File | Change type | Lines |
|---|---|---|
| `tests/unit/security-integration.test.ts` | Test infrastructure fix | +66/−3 (vi.hoisted block) + +12/−3 (user lookups) |
| `src/lib/auth-middleware.ts` | Production code: audit-on-denial | +19/−4 (logAuthorizationDenial) |
| `docs/incidents/INC-DB-ISOLATION-001-security-integration-test-db-isolation.md` | Incident documentation | New file |

No production authorization policy, RBAC matrix, or database schema
was changed. The authorization decision (403) is unchanged — only
audit logging was added.
