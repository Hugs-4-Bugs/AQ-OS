# SUBSCRIPTION & DATA PERSISTENCE — AcquisitionOS

_Last verified: 2026-09-23 against the restored database (commit efbc216 snapshot) and current code._

## 1. Identity lifecycle (hard invariant)

```
USER ACCOUNT  (User row — permanent)
   ↓ 1:N
SUBSCRIPTION  (Subscription rows — change over time)
   ↓ defines
ENTITLEMENTS  (plan features, monthly credits)
```

Business data (`Lead`, `LeadActivity`, `WorkflowDefinition`, `WorkflowExecution`,
`OutreachSequence`, `AiChatSession`, `Report`, `PaymentOrder`, `Invoice`,
`CreditsLedger`, `AuditLog`, `ApiKey`, exports) belongs to the **USER**,
never to the subscription. Expiry/cancellation/downgrade changes only
entitlement fields. Verified: **zero** `delete`/`deleteMany` calls in
`src/app/api/cron/renew-subscriptions/route.ts`, `src/lib/subscription-service.ts`,
`src/lib/credit-service.ts`, payment routes.

## 2. What happens on each event (actual code paths)

| Event | Code | Effect on user/data |
|---|---|---|
| **Monthly subscription expires** (`status=active`, `currentPeriodEnd <= now`, `cancelAtPeriodEnd=false`) | `POST /api/cron/renew-subscriptions` | Renews **in place**: period +30d (monthly) or +365d (yearly), credits reset to `PLAN_CREDITS[plan]` + rollover ≤ `ROLLOVER_MAX[plan]`, ledger row `monthly_renewal` appended. **Same user ID, all data intact.** |
| **Monthly subscription cancelled-at-expiry** (`cancelAtPeriodEnd=true`) | `downgradeToFree()` in same route | `Subscription` → plan `free`, status `canceled`, 50 credits; `User.plan='free'`, credits 50. **No row of any business table is touched. No new user.** |
| **Yearly subscription renews** | same route (`billingCycle === 'yearly'` branch) | Period extends **+365 days**; grants the same `PLAN_CREDITS[plan]` amount as monthly. ⚠️ **Ambiguity (reported, NOT changed):** the current implementation grants the plan's standard (monthly-looking) credit amount per renewal event for yearly cycles too, and the ledger action is named `monthly_renewal` regardless of cycle. If the product intends yearly = one grant of 12× monthly credits (or 12 grants spaced monthly), that is a separate business decision. |
| **Upgrade Pro → Elite** | payment confirm / webhook routes update Subscription + User.plan in place | Same user ID, same data; entitlements change on next grant/renewal. |
| **Downgrade Elite → Pro** | same update path | Same user ID, same data. |
| **Free-plan monthly reset** | same route, 1st of month | Subscription + User credit counters reset to 50. Nothing else changes. |
| **Reactivation** | payment confirm (new active period on the SAME subscription/user) | Same user ID. |

Key files: `src/app/api/cron/renew-subscriptions/route.ts` (renewal + downgrade + free reset),
`src/lib/subscription-service.ts`, `src/app/api/payments/confirm-payment/route.ts`,
`src/app/api/payments/verify-session/route.ts`, webhooks in `src/app/api/payments/webhook/{stripe,razorpay}/route.ts`.

## 3. Credit lifecycle (exact current behavior)

- **Authoritative balance:** `User.credits` (+ `creditsMonthly`, `rolloverCredits`) and active `CreditAddon` rows — via `getCreditBalance()` in `src/lib/credit-service.ts`. (Note: `Subscription.creditsTotal/Remaining` also exist for the billing view; the ledger/rest logic maintains both, but the spending gate reads `User.credits`.)
- **Grant:** signup → 50 (schema defaults `User.credits @default(50)`, `Subscription.creditsTotal @default(50)`, 14-day trial); renewal → `PLAN_CREDITS` (`free 50, pro 500, elite 2000` per cron route) + rollover (`ROLLOVER_MAX`: `free 0, pro 50, elite 200`); purchases → `CreditAddon` fulfillment; payment confirm routes add credits.
- **Consume:** `deductCredits()` — transactional, writes a `CreditsLedger` row (negative delta + resulting balance + description).
- **Expire:** addon credits expire by `CreditAddon.expiresAt`; free reset sets counters to 50 on the 1st; renewal supersedes the old monthly allocation (unconsumed monthly credits beyond rollover max lapse).
- **Rollover:** `min(creditsRemaining, ROLLOVER_MAX[plan])` added on renewal; ledger description records `X fresh + Y rolled over`.
- **Refund:** `refundCredits()` exists and is ledgered.
- **Auditability:** every grant/consume/refund/renewal writes an append-only `CreditsLedger` row. The initial 50-credit signup grant is implicit from schema defaults (not a ledger row) — known nuance, documented here. No code path deletes ledger history (regression-tested).

### Cost tables (actual, unchanged — pricing untouched)

`src/lib/credit-costs.ts CREDIT_COSTS`: lead_discovery 1, deep_analysis 1.5, outreach_message 0.2, outreach_sequence 0.5, sales_coaching 0.5, proposal_generation 1.5, competitor_analysis 1.5, data_export 0.5 (+ workflow action costs).
`src/lib/prospecting/types.ts`: `PIPELINE_CREDIT_COST = 7` (5 analysis + 2 email), quick research 5 / deep pipeline 7.

⚠️ **Discrepancy (reported, NOT changed):** these code values do not exactly match the
cost list quoted in the task brief (1/5/2/8/3/10/8/5/7). Two tables coexist; the
product team should reconcile which is authoritative in a separate task. No credit
rule was modified here.

## 4. What MUST NEVER happen on expiry (enforced + tested)

❌ delete leads/contacts/analysis/proposals/outreach/workflows/reports/exports
❌ delete payment history or audit logs
❌ delete or recreate the user identity (new user ID)
❌ reset account identity / orphan historical data
❌ hide historical data (feature-gating happens at the **action** level via `checkCreditSufficiency` / plan checks, not by hiding history)

Automated proof: `src/__tests__/persistence/subscription-persistence.test.ts` —
Scenarios 1–5 (Pro expiry, renewal, upgrade, downgrade, Elite expiry) all pass against an
isolated copy of the real database: **9/9 PASS (2026-09-23)**.

## 5. Retention rules

- Data is retained indefinitely unless the **user** explicitly deletes it
  (`/api/settings/clear-data`, scoped `deleteMany` on their own leads; `/api/leads/[id]` DELETE, ownership-checked, transactional).
- No automatic retention purge exists in cron jobs (verified by grep + source-guard test).
