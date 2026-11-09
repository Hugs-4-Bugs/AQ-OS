# AcquisitionOS — Centralized Test Suite

This document describes the centralized automated testing system for
AcquisitionOS. It extends the existing `tests/` and `src/__tests__/`
directories with new high-value suites targeting the most
security-critical surfaces.

## Testing architecture

```
vitest.config.ts            ← root config (existing)
vitest.setup.ts             ← per-worker setup (existing): mocks next/router,
                              next/headers, isolates SQLite per worker,
                              sets JWT_SECRET for tests
tests/
├── helpers/                ← shared test infrastructure
│   ├── global-setup.ts         (existing) prisma generate before workers
│   ├── isolated-test-db.ts     (existing) per-file SQLite isolation
│   ├── mock-data.ts            (existing) realistic test data factories
│   ├── test-utils.ts           (existing) createMockPrisma, createTestUser
│   ├── rbac-fixtures.ts        (NEW) deterministic role-specific identities
│   └── auth-test-helpers.ts    (NEW) request builders + auth-state setters
├── auth/                   ← (NEW) authentication flow tests
│   ├── otp-flow.test.ts            OTP request + verify lifecycle
│   ├── inactivity-timeout.test.ts  10-min admin session enforcement
│   └── signout-refresh.test.ts     signout + token rotation
├── rbac/                   ← (NEW) RBAC matrix tests
│   └── permission-matrix.test.ts   role → permission grants (snapshot)
├── security/               ← (NEW) security-policy tests
│   └── mfa-enforcement-gap.test.ts withPermission vs withSuperAdmin vs
│                                    withPermissionAndMfa
├── api/                    ← (NEW) route-level authorization tests
│   └── admin-security-routes.test.ts 7 withPermission routes × caller classes
├── unit/                   ← (existing) unit tests
├── e2e/                    ← (existing) end-to-end flow tests
├── load/                   ← (existing) load tests
├── integration/            ← (existing) integration tests
├── tenant-isolation/       ← (empty — reserved for future tenant tests)
└── fixtures/               ← (empty — reserved for future shared fixtures)

src/__tests__/              ← (existing) co-located unit tests
├── api/                        auth-routes, health-credits-routes
├── components/                 lead-detail-portal
├── lib/                        auth-middleware, billing, credit-service, etc.
├── security/                   input-validator, jwt-security, rate-limiter
├── observability/              metrics-collector
├── persistence/                subscription-persistence
└── support/                    support-center
```

## How to run each suite

All commands are defined in `package.json` scripts. They run `prisma generate`
first to ensure the Prisma client matches the develop schema.

| Command | What it runs |
|---|---|
| `npm test` | Full test suite (existing + new) |
| `npm run test:unit` | Existing unit tests in `tests/unit` + `src/__tests__` |
| `npm run test:auth` | Authentication flow tests (OTP, signout, refresh, inactivity) |
| `npm run test:rbac` | RBAC permission matrix tests |
| `npm run test:security` | Security-policy tests (MFA enforcement gap) |
| `npm run test:api` | Route-level API authorization tests |
| `npm run test:centralized` | All new suites: auth + rbac + security + api |
| `npm run test:coverage` | Full suite with V8 coverage report |
| `npm run test:watch` | Watch mode (vitest interactive) |

## Required local environment variables

The test setup (`vitest.setup.ts`) sets these automatically:

- `DATABASE_URL` — per-worker isolated SQLite file under `.test-db-isolated/`
- `JWT_SECRET` — `test-jwt-secret-key-for-testing-only-min-32-chars`
- `NEXT_PUBLIC_APP_URL` — `http://localhost:3000`

No production credentials are needed. No real SMTP, Redis, or OAuth
provider is contacted by the centralized tests — all external services
are mocked.

## Test database setup

The vitest setup creates a fresh SQLite file per worker under
`.test-db-isolated/`. The schema source is `test-schema.db` (referenced
by `vitest.setup.ts`) or `test.db` (referenced by
`tests/helpers/isolated-test-db.ts`). If neither exists, the Prisma
client will create the DB on first query.

**The test suite never touches `db/custom.db` (production data).**

If `test-schema.db` is missing, the global-setup will still regenerate
the Prisma client, but the per-worker SQLite copy will be empty. Tests
that need schema-only DBs should call `setupIsolatedTestDb(label)` from
`tests/helpers/isolated-test-db.ts`.

## Mocked external services

- **Email (SMTP/Resend)** — `@/lib/email` is mocked in auth tests.
  `sendOtpLoginEmail` returns `{ sent: true, provider: 'smtp',
  messageId: 'msg-1' }` by default.
- **Redis (rate limiter)** — `@/lib/security/distributed-rate-limiter`
  is mocked in auth/route tests. `checkRateLimit` returns `{ allowed:
  true, storeAvailable: true }` by default; tests override per case.
- **Prisma DB** — `@/lib/db` is mocked in route-level tests.
  `db.user`, `db.userSession`, `db.auditLog` are vi.fn() mocks.
- **Auth (JWT)** — `@/lib/auth.getAuthUser` is mocked per test to
  return the desired identity (or null for unauthenticated cases).
- **Audit chain** — `@/lib/security/audit-chain.detectSuspiciousActivity`
  is mocked to return `[]`.

## How to add new tests

1. **Pick the right directory:**
   - `tests/auth/` — auth flow tests (OTP, MFA, signout, refresh, magic link, OAuth)
   - `tests/rbac/` — RBAC matrix + role behavior tests
   - `tests/security/` — security policy tests (MFA, CSRF, rate limiting)
   - `tests/api/` — route-level authorization tests
   - `tests/tenant-isolation/` — multi-tenant data isolation tests
   - `tests/unit/` — pure unit tests (no DB, no network)
   - `tests/e2e/` — end-to-end flow tests

2. **Use the existing helpers:**
   ```ts
   import { SUPER_ADMIN_WITH_MFA, OWNER, VIEWER } from '../helpers/rbac-fixtures';
   import { createMockRequest, createUnauthenticatedRequest } from '../helpers/mock-request';
   import { createMockUser } from '../helpers/mock-user';
   ```

3. **For route-level tests, follow the mock pattern** in
   `tests/api/admin-security-routes.test.ts`:
   - Use `vi.hoisted()` for mocks referenced inside `vi.mock()` factories.
   - Mock `@/lib/auth`, `@/lib/db`, `@/lib/security/distributed-rate-limiter`,
     `@/lib/api-key-middleware`, `@/lib/api-key-service`,
     `@/lib/entitlement-service`.
   - Import the route handler AFTER the mocks are installed.
   - Call the handler directly: `await route.GET(req)`.

4. **Never weaken assertions** to make a test pass. If the actual
   behavior differs from the expected, the test should fail and the
   discrepancy should be documented in the test report.

5. **Never expose secrets in test logs.** Mock JWTs use the test
   `JWT_SECRET` only; no real tokens are generated.

## How to run tests before a commit

```bash
# Fast feedback: just the new centralized suites (~10s)
npm run test:centralized

# Full regression: existing + new (~3-5 min)
npm test

# With coverage
npm run test:coverage
```

## Known limitations

- **No browser E2E in this batch.** Playwright is not yet installed;
  frontend/E2E coverage is left for a future phase. The existing
  `tests/e2e/*.test.ts` files use mocked Prisma, not a real browser.
- **No real Redis test.** The distributed rate limiter is mocked in
  these tests. A real-Redis integration test would require a running
  Redis instance (use `docker-compose.yml`'s `redis` service).
- **No real SMTP test.** Email delivery is mocked. A real SMTP test
  would use Mailpit (per `docker-compose.yml`).
- **Route coverage is partial.** Of the 584 API routes in the repo,
  this batch covers the 7 routes flagged in the Phase C MFA-enforcement
  audit plus the OTP/signout/refresh/inactivity auth surface.
  Remaining routes (CRM, billing, operations, etc.) follow the same
  authorization pattern and can be tested using the same fixtures and
  helpers.
- **No multi-tenant integration test.** `tests/tenant-isolation/` is
  reserved but not yet populated. A real test would need two persisted
  users in different `orgId` values against an isolated SQLite DB.

## Coverage matrix

| Suite | Tests | Status |
|---|---|---|
| `tests/security/mfa-enforcement-gap.test.ts` | 17 | ✅ passing |
| `tests/rbac/permission-matrix.test.ts` | 35 | ✅ passing |
| `tests/api/admin-security-routes.test.ts` | 55 | ✅ passing (post-ISSUE-004 + member/viewer) |
| `tests/auth/otp-flow.test.ts` | 22 | ✅ passing |
| `tests/auth/inactivity-timeout.test.ts` | 26 | ✅ passing |
| `tests/auth/signout-refresh.test.ts` | 19 | ✅ passing |
| `tests/unit/admin-billing-routes.test.ts` | 68 | ✅ passing (Option A reconciliation + MFA enforcement) |
| `tests/unit/admin-operations-routes.test.ts` | 127 | ✅ passing (Option A reconciliation + MFA enforcement) |
| **Total** | **369** | **✅ all passing** |

The `admin-security-routes.test.ts` count grew from 32 → 53 (ISSUE-004
fix) → 55 (member/viewer negative cells added for audit/:id).
The `admin-billing-routes.test.ts` count grew from 64 → 68 (added 4
super_admin-without-MFA enforcement tests).
The `admin-operations-routes.test.ts` count grew from 121 → 127 (added
6 super_admin-without-MFA enforcement tests).

## Resolved bugs

### MEDIUM — MFA enforcement gap on 7 admin security GET routes — RESOLVED

**Status:** ✅ FIXED in commit `4ad4bca0a6fe26e272045b6061402ed561581945`
(ISSUE-004).

**Affected routes (all now use `withPermissionAndMfa`):**
- `/api/admin/rbac/roles` (rbac.read)
- `/api/admin/security/audit` (audit.read)
- `/api/admin/security/audit/:id` (audit.read)
- `/api/admin/security/config-changes` (audit.read)
- `/api/admin/security/events` (security.events.read)
- `/api/admin/security/role-changes` (rbac.read)
- `/api/admin/security/suspicious-activity` (security.events.read)

**Fix:** Swapped the wrapper from `withPermission` to
`withPermissionAndMfa` in each route file. `withPermissionAndMfa`
(`src/lib/auth-middleware.ts:86–105`) enforces MFA for super_admin
at line 97 (`if (user.role === 'super_admin' && !user.mfaEnabled)`).

**Behavior after the fix:**
- super_admin WITH MFA + permission → 200 (unchanged)
- super_admin WITHOUT MFA + permission → **403 `MFA_REQUIRED`** (was 200)
- admin/support/analytics with `audit.read` → 200 (unchanged; MFA only
  enforced for super_admin per `withPermissionAndMfa:97`)
- admin/support/analytics lacking the permission → 403 (unchanged)
- owner/member/viewer → 403 (unchanged)
- unauthenticated → 401 (unchanged)

**Test evidence:** `tests/api/admin-security-routes.test.ts` invokes
all 7 route handlers directly across 8 caller classes (super_admin±MFA,
admin, support, analytics, owner, member, viewer, unauthenticated).
55 tests, all passing.

**Wrapper-level test retained:** `tests/security/mfa-enforcement-gap.test.ts`
(17 tests) still tests `withPermission` directly — `withPermission`'s
behavior is unchanged, so it remains a valid regression baseline.

### LOW — Stale RBAC comment on `security.events.read` routes

**Affected routes:**
- `/api/admin/security/events` (`src/app/api/admin/security/events/route.ts:2`)
- `/api/admin/security/suspicious-activity` (`src/app/api/admin/security/suspicious-activity/route.ts:2`)

**Root cause:** Both route file headers say
`// RBAC: security.events.read (super_admin, admin)` but
`src/lib/rbac.ts:64–180` grants `security.events.read` ONLY to
`super_admin`. The `admin` role has `audit.read` (line 136) but NOT
`security.events.read`.

**Evidence:** `tests/rbac/permission-matrix.test.ts` asserts that
`hasPermission('admin', 'security.events.read')` returns `false`.

**Practical impact:** Documentation-only. The actual enforcement is
more restrictive than the comment claims. An `admin` user calling
these endpoints receives 403 even though the route comment implies
they should be allowed.

**Recommended fix:** Update the route comments to read
`// RBAC: security.events.read (super_admin only)`. Or, if `admin`
should have access, add `'security.events.read'` to the `admin`
permission set in `rbac.ts`. **Awaiting product owner decision.**

## Manual verification still required

- **Browser-level verification** of all 7 affected routes per the
  Phase C verification checklist (block A super_admin+MFA positive
  control, block B unauthenticated negative, block C non-super_admin
  negative, block D super_admin-without-MFA — now expected to return
  403 `MFA_REQUIRED`, confirming the fix). The route-level tests prove
  the wrapper logic, but a real browser session against a non-MFA
  super_admin account would provide end-to-end HTTP evidence.
- **Real-Redis integration test** for the distributed rate limiter
  (the mocked tests prove the wrapper logic, not the Redis path).
- **Real-SMTP integration test** for OTP email delivery.
- **Multi-tenant isolation test** with two persisted users in
  different `orgId` values.
- **Frontend E2E** via Playwright (not yet installed).
- **Pre-existing `tests/unit/security-integration.test.ts` failures**
  (67 tests fail due to missing `test-schema.db` fixture). Verified
  to fail identically on the baseline commit before ISSUE-004 —
  not a regression. Fixing this requires running `prisma db push`
  against a test DB, which is out of scope for ISSUE-004.
