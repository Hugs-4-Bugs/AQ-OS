-- ═══════════════════════════════════════════════════════════════════
-- Migration: idempotency_unique_constraints (20261031)
-- Purpose : Close the race-condition gaps identified by the
--           idempotency/retry/duplication E2E discovery:
--             1. CreditsLedger had NO DB-level idempotency backstop.
--                deductCredits/refundCredits used an application-level
--                findFirst pre-check on an overloaded `action` field
--                (`${action}_idempotent_${key}`) OUTSIDE the $transaction.
--                Two concurrent calls with the same idempotencyKey both
--                passed the pre-check and both created ledger rows →
--                DOUBLE CHARGE / DOUBLE REFUND.
--             2. WorkflowExecution.idempotencyKey was `@@index` only,
--                NOT `@unique`. createExecutionRecord used findFirst+create
--                inside a $transaction with no DB backstop. Two concurrent
--                triggers with the same idempotencyKey → TWO execution rows
--                → duplicate downstream side effects (even though the
--                credit charge was separately dedup'd).
--
-- Safety  : 100% ADDITIVE.
--           - Every statement is `ALTER TABLE ... ADD COLUMN` or
--             `CREATE UNIQUE INDEX`. No DROP, no RENAME, no table
--             recreation, no UPDATE, no DELETE.
--           - The new CreditsLedger.idempotencyKey column is nullable;
--             existing 613 rows keep NULL and read sensibly.
--           - The UNIQUE indexes are created on nullable columns. SQLite
--             treats NULLs as distinct under UNIQUE, so multiple NULL
--             rows coexist without conflict.
--           - Pre-flight duplicate check ran before authoring this
--             migration: ZERO existing non-null duplicate
--             (workflowId, idempotencyKey) pairs in WorkflowExecution,
--             ZERO existing non-null duplicate (userId, idempotencyKey)
--             pairs possible in CreditsLedger (column did not exist).
--             The CREATE UNIQUE INDEX statements therefore succeed
--             against the live DB without data modification.
--
-- Production application path:
--   The canonical development database at db/custom.db does NOT yet carry
--   these columns/indexes. This migration MUST be applied via
--   `prisma migrate deploy` (or the SQL run directly) — do NOT use
--   `prisma migrate resolve --applied` here, because the columns/indexes
--   genuinely do not exist yet on the live DB (unlike the previous
--   additive drift migration which only reconciled history).
--
-- Fresh-deployment path:
--   On a fresh database, `prisma migrate deploy` runs every migration in
--   order, INCLUDING this one. The ADD COLUMNs + CREATE UNIQUE INDEXes
--   execute normally and the resulting schema matches schema.prisma.
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- CreditsLedger: add DB-enforced idempotency backstop.
-- The column is nullable; historical rows keep NULL. The compound
-- UNIQUE (userId, idempotencyKey) is scoped per tenant so an
-- idempotencyKey cannot leak across users.
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE "CreditsLedger" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "CreditsLedger_userId_idempotencyKey_key"
  ON "CreditsLedger"("userId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────
-- WorkflowExecution: add DB-enforced idempotency backstop.
-- The compound UNIQUE (workflowId, idempotencyKey) ensures a logical
-- run identity maps to exactly one execution row, even under
-- concurrent duplicate triggers. The application-level findFirst
-- pre-check stays as the fast path; this index is the race loser's
-- safety net.
-- ───────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "WorkflowExecution_workflowId_idempotencyKey_key"
  ON "WorkflowExecution"("workflowId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
