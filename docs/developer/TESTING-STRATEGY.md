# Testing Strategy — AcquisitionOS

> Owner: Engineering. Status: Living document. Last reviewed: 2026-09-09.
> Source: `tests/`, `vitest.config.ts`, `vitest.setup.ts`, `package.json` (`test` scripts).

## 1. Types of Tests

| Type | Where | What they cover | Run command |
|---|---|---|---|
| **Unit** | `tests/unit/` | Pure functions: `credit-service`, `api-key-service`, `auth`, `billing`, `analytics`, `competitors`, `workflows`, `ai` | `bun run test` (selects `tests/unit/`) |
| **Integration** | `tests/integration/` | Multi-component flows: auth API, payments, Gmail, Telegram, WhatsApp, workflows | `bun run test:integration` |
| **End-to-end (e2e)** | `tests/e2e/` | Browser-driven flows: onboarding, signup, lead-flow, payment, workflow, ai | `bun run test:e2e` (when configured) |
| **Load** | `tests/load/` | Performance under load: queue, analytics, AI, WebSocket | `bun run test:load` (when configured) |

**Test runner:** Vitest (`vitest.config.ts`). Some e2e tests may use Playwright (when configured).

## 2. Coverage Expectations

- **Target:** 70% line coverage on `src/lib/` (the business logic). 50% on `src/app/api/` (route handlers — harder to unit-test; integration tests cover these). UI components (`src/components/`) are not measured (manual + e2e).
- **Critical paths must be covered:** auth (signup, signin, OTP, magic link, MFA), credits (deduct, grant, refund), payment (Stripe webhook, Razorpay), email (send, bounce, unsubscribe), API keys (create, verify, revoke, scope-check).
- **Don't chase 100%.** Coverage is a signal, not a goal. A test that asserts `expect(result).toBeDefined()` adds nothing.

## 3. How to Run Tests

```bash
# All unit tests
bun run test

# Watch mode (re-runs on file change)
bun run test:watch

# With coverage
bun run test:coverage

# Specific test file
bunx vitest tests/unit/credit-service.test.ts

# Integration (requires DB + maybe external services — gated)
bun run test:integration
```

## 4. How to Write a New Test

### Unit test (pure function)
```typescript
// tests/unit/credit-service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { deductCredits, checkCreditSufficiency } from '@/lib/credit-service';
import { db } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    creditsLedger: { create: vi.fn() },
  },
}));

describe('credit-service', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('checkCreditSufficiency', () => {
    it('returns sufficient=true when balance >= cost', async () => {
      vi.mocked(db.user.findUnique).mockResolvedValue({ credits: 100 } as any);
      const result = await checkCreditSufficiency('user-1', 50);
      expect(result.sufficient).toBe(true);
      expect(result.balance).toBe(100);
    });

    it('returns sufficient=false when balance < cost', async () => {
      vi.mocked(db.user.findUnique).mockResolvedValue({ credits: 10 } as any);
      const result = await checkCreditSufficiency('user-1', 50);
      expect(result.sufficient).toBe(false);
    });
  });

  describe('deductCredits', () => {
    it('deducts + logs + returns new balance', async () => {
      vi.mocked(db.user.findUnique).mockResolvedValue({ credits: 100 } as any);
      vi.mocked(db.user.update).mockResolvedValue({ credits: 50 } as any);
      const result = await deductCredits({ userId: 'user-1', action: 'discovery', cost: 50, referenceId: 'lead-1' });
      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(50);
      expect(db.creditsLedger.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'discovery', cost: 50 }));
    });
  });
});
```

### Integration test (API route + DB)
```typescript
// tests/integration/auth-api.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { createTestUser, cleanupTestUser } from '../helpers/test-utils';

describe('POST /api/auth/signin', () => {
  let testUser: { email: string; password: string };

  beforeAll(async () => {
    testUser = await createTestUser({ email: 'test-signin@example.com', password: 'Password123!' });
  });
  afterAll(async () => {
    await cleanupTestUser(testUser.email);
  });

  it('returns 200 + sets cookies on valid credentials', async () => {
    const res = await fetch('http://localhost:3000/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('access_token=');
  });

  it('returns 401 on wrong password', async () => {
    const res = await fetch('http://localhost:3000/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email, password: 'wrong' }),
    });
    expect(res.status).toBe(401);
  });
});
```

### E2E test (Playwright, when configured)
```typescript
// tests/e2e/signup-flow.test.ts
import { test, expect } from '@playwright/test';

test('user can sign up + verify email + sign in', async ({ page }) => {
  await page.goto('/');
  await page.click('text=Sign up');
  await page.fill('[name=email]', `e2e-${Date.now()}@example.com`);
  await page.fill('[name=password]', 'Password123!');
  await page.click('button:has-text("Sign Up")');
  await expect(page.locator('text=Check your email')).toBeVisible();
  // ... (would need a test email inbox to verify the OTP)
});
```

## 5. Test Helpers

- **`tests/helpers/test-utils.ts`** — `createTestUser`, `cleanupTestUser`, `createTestLead`, etc.
- **`tests/helpers/mock-db.ts`** — a mock Prisma client for unit tests.
- **`tests/helpers/mock-data.ts`** — sample data factories (User, Lead, Meeting, etc.).
- **`tests/helpers/mock-request.ts`** — a mock `NextRequest` for route handler tests.

## 6. What to Test (priorities)

### Always test
- **Pure functions** in `src/lib/`: `credit-service`, `api-key-service`, `auth` (hashing, JWT), `email` (validation), `rbac` (permission checks), `plan-gates`, `credit-costs`, `entitlement-service`.
- **Critical API routes**: auth (signup, signin, OTP, magic link, refresh, MFA), payment (Stripe webhook, confirm), credits (deduct, grant), API keys (verify, scope check).
- **Edge cases**: empty input, null/undefined, boundary values (credit balance = 0; rate limit = 0; quota = 0).

### Don't test (low value)
- **shadcn/ui components** — tested by the library.
- **Cosmetic UI** — manual + e2e.
- **Generated code** — Prisma client, types.
- **External SDKs** — Stripe, Google, Resend.

### Test defensively
- **Authz rules** — for each role × each gated endpoint, assert the correct 200/403/404. (Currently a gap — see [OWASP-COMPLIANCE.md](../security/OWASP-COMPLIANCE.md) A01.)
- **Rate-limit rules** — assert 429 on excess.
- **Idempotency** — for webhooks + cron jobs, assert that a replay is a no-op.

## 7. Mocking External Services

- **Stripe** — mock the Stripe SDK in unit tests; use Stripe's test-mode webhooks in integration.
- **Google** — mock the Google OAuth + Gmail + Calendar APIs in unit tests; integration tests skip real Google.
- **SMTP / Resend** — mock `sendEmail` in unit tests; integration tests use a fake SMTP (Mailhog / Ethereal) — though we removed Ethereal for production, dev can still use a fake.
- **Z-AI** — mock the AI provider in unit tests; integration tests skip real AI calls (or use a deterministic stub).

## 8. Continuous Integration (when configured)

- **On every PR:** `bun run lint` + `bunx tsc --noEmit` + `bun run test` (unit).
- **On merge to main:** the above + `bun run test:integration` (if DB + mocks are set up).
- **Nightly:** `bun run test:load` (performance regression).
- **Pre-release (manual):** the e2e suite against staging.

## 9. Test Data

- **Unit tests** — factories in `tests/helpers/mock-data.ts`; no DB.
- **Integration tests** — a separate test DB (`DATABASE_URL=file:./db/test.db`); seeded + torn down per test or per suite.
- **E2E tests** — the staging environment; test users created + cleaned up.

## 10. Known Gaps

- **Authz matrix test** — not yet written; the rules are in code but not covered. (See [OWASP-COMPLIANCE.md](../security/OWASP-COMPLIANCE.md) A01.)
- **Webhook idempotency test** — not yet written; the `PaymentWebhook` table is the mechanism but the replay-as-no-op path isn't tested.
- **E2E suite** — Playwright not yet configured; the e2e tests in `tests/e2e/` are stubs.
- **Load tests** — the suite exists but isn't run on a schedule.

## 11. Review Cadence

- **Per PR** — the diff's tests are reviewed alongside the code.
- **Monthly** — review the coverage report; identify under-tested critical paths.
- **Quarterly** — review the testing strategy; add / remove test types as the codebase matures.

---

*See also: [CONTRIBUTING.md](CONTRIBUTING.md), [CODE-REVIEW-CHECKLIST.md](CODE-REVIEW-CHECKLIST.md), [DEBUGGING-GUIDE.md](DEBUGGING-GUIDE.md), [../security/OWASP-COMPLIANCE.md](../security/OWASP-COMPLIANCE.md), [DEVELOPER EXPERIENCE improvements](../IMPROVEMENT-RECOMMENDATIONS.md#section-9--developer-experience-improvements).*
