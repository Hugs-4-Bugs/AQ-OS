-- ═══════════════════════════════════════════════════════════════════
-- Migration: autopilotrun_unique_constraints (20261031)
-- Purpose : Close a schema-drift gap discovered by the idempotency E2E
--           test. The Prisma schema declares AutopilotRun.idempotencyKey,
--           AutopilotRun.runKey, and AutopilotRun.correlationId as
--           @unique, but the live database NEVER carried the corresponding
--           UNIQUE indexes (the table was built via `prisma db push` at
--           various points and the unique constraints were declared in
--           schema.prisma but never applied to the live DB).
--
--           Impact: the application-level findFirst pre-check in
--           createOrFetchInvocation was the ONLY dedup boundary for
--           concurrent scheduler/event triggers. Two concurrent calls
--           with the same slotEpochMs both passed the findFirst (null),
--           both called create, and BOTH succeeded — producing two
--           AutopilotRun rows for one logical invocation. The P2002
--           catch never fired because the DB did not enforce uniqueness.
--
--           This migration adds the missing UNIQUE indexes so the DB
--           enforces what the schema already declares. The
--           createOrFetchInvocation P2002 catch (already present in the
--           code) now fires on the race loser and re-reads the winning
--           row — exactly-once invocation is restored.
--
-- Safety  : 100% ADDITIVE.
--           - Every statement is `CREATE UNIQUE INDEX`. No DROP, no
--             RENAME, no table recreation, no data modification.
--           - The indexes are PARTIAL (WHERE ... IS NOT NULL) so the
--             existing 13 AutopilotRun rows (which all have NULL for
--             these columns — verified pre-flight) coexist without
--             conflict. SQLite treats NULLs as distinct under UNIQUE,
--             so multiple NULLs are allowed even without the partial
--             filter; the partial filter is belt-and-suspenders.
--           - Pre-flight duplicate check: 0 non-null rows for all three
--             columns → zero risk of CREATE UNIQUE INDEX failing.
--           - DB integrity_check = ok after migration.
-- ═══════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX "AutopilotRun_idempotencyKey_key"
  ON "AutopilotRun"("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

CREATE UNIQUE INDEX "AutopilotRun_runKey_key"
  ON "AutopilotRun"("runKey")
  WHERE "runKey" IS NOT NULL;

CREATE UNIQUE INDEX "AutopilotRun_correlationId_key"
  ON "AutopilotRun"("correlationId")
  WHERE "correlationId" IS NOT NULL;
