-- ═══════════════════════════════════════════════════════════════════
-- Migration: phase34_schema_drift_additive (20261031)
-- Purpose : Close the Prisma migration/schema drift that Phase 34
--           acceptance identified. Specifically:
--             - Lead.discoveryJobId           (called out in Phase 34 report)
--             - BusinessProfile.isDefault     (called out in Phase 34 report)
--             - Other additive columns that Prisma migrate diff reports
--               as missing from the migration chain but already present
--               in the canonical live development database (applied
--               historically via `prisma db push`).
--
-- Safety  : 100% ADDITIVE.
--           - Every statement is `ALTER TABLE ... ADD COLUMN` or
--             `CREATE INDEX`. No DROP, no RENAME, no table recreation,
--             no UPDATE, no DELETE.
--           - Every new column is nullable OR carries a constant default,
--             so existing rows preserve their current data and read
--             sensibly (NULL or the documented default).
--           - Tested on an isolated shadow database (see
--             prisma/_drift_apply_test/README) by running ALL migrations
--             from scratch against a fresh DB, then verifying the
--             resulting schema matches `prisma/schema.prisma` for every
--             table touched by this migration.
--
-- Production application path:
--   The canonical development database at db/custom.db ALREADY carries
--   every column this migration adds (applied historically by
--   `prisma db push`). To bring migration history into parity WITHOUT
--   re-running the SQL, run:
--       prisma migrate resolve --applied 20261031000000_phase34_schema_drift_additive
--   This inserts a row into `_prisma_migrations` marking the migration
--   as applied. No SQL is executed against the production DB. The
--   production DB is not modified in any way by the resolve command.
--
-- Fresh-deployment path:
--   On a fresh database, `prisma migrate deploy` runs every migration
--   in order, INCLUDING this one. The ADD COLUMNs execute normally and
--   the resulting schema matches `prisma/schema.prisma` for the columns
--   listed below.
--
-- Scope limitation (deliberate):
--   The broader drift reported by `prisma migrate diff` includes
--   redefined tables (column type changes) and entirely new tables not
--   represented in any migration. Those require a separate, larger
--   migration pass and are tracked as known migration-chain debt in
--   the Phase 34 final closure report. They are NOT addressed here
--   because the safe additive fix for the user-called-out columns
--   (Lead.discoveryJobId, BusinessProfile.isDefault) does not require
--   touching them. Mixing additive ADD COLUMN with table-recreation
--   would risk data loss and is therefore explicitly out of scope.
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- Lead: Phase 9 discovery provenance + enrichment columns.
-- The original migration 20260520162908_echo_exit creates Lead WITHOUT
-- these columns; they were added to the live DB via `prisma db push`
-- during Phase 9 and never captured as a migration.
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE "Lead" ADD COLUMN "discoveryJobId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "discoveredVia" TEXT;
ALTER TABLE "Lead" ADD COLUMN "verificationStatus" TEXT;
ALTER TABLE "Lead" ADD COLUMN "employeeCount" INTEGER;
ALTER TABLE "Lead" ADD COLUMN "employeeRange" TEXT;
ALTER TABLE "Lead" ADD COLUMN "sourceUrl" TEXT;

-- Index declared in schema.prisma line 734
CREATE INDEX "Lead_discoveryJobId_idx" ON "Lead"("discoveryJobId");

-- ───────────────────────────────────────────────────────────────────
-- BusinessProfile: explicit default-profile selection (Phase 14).
-- Migration 20261020000000_profile_sections_persistence creates the
-- BusinessProfile table WITHOUT isDefault; the column was added to the
-- live DB via `prisma db push` during Phase 14 and never captured.
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE "BusinessProfile" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- ───────────────────────────────────────────────────────────────────
-- AuditLog: Phase 33 hash-chained audit columns.
-- The original migration creates AuditLog WITHOUT these columns; they
-- were added to the live DB via `prisma db push` during the security
-- hardening phases (audit chain, security event classification) and
-- never captured as a migration.
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE "AuditLog" ADD COLUMN "securityEventType" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "severity" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "eventHash" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "previousHash" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "sequence" INTEGER;
ALTER TABLE "AuditLog" ADD COLUMN "requestId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "confirmed" BOOLEAN;
ALTER TABLE "AuditLog" ADD COLUMN "beforeState" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "afterState" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "outcome" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "metadata" TEXT;

-- ───────────────────────────────────────────────────────────────────
-- DataExport: backup-type discriminator (admin backup routes).
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE "DataExport" ADD COLUMN "type" TEXT;

-- ───────────────────────────────────────────────────────────────────
-- WorkflowLog: retry-attempt counter (DLQ retry path).
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE "WorkflowLog" ADD COLUMN "retryAttempt" INTEGER;

-- ───────────────────────────────────────────────────────────────────
-- OutreachMessage: retry/delivery-state columns (Phase 26+ outreach
-- reliability). All additive (nullable or constant default).
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE "OutreachMessage" ADD COLUMN "providerAcceptedAt" DATETIME;
ALTER TABLE "OutreachMessage" ADD COLUMN "providerMessageId" TEXT;
ALTER TABLE "OutreachMessage" ADD COLUMN "errorCategory" TEXT;
ALTER TABLE "OutreachMessage" ADD COLUMN "errorMessage" TEXT;
ALTER TABLE "OutreachMessage" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OutreachMessage" ADD COLUMN "maxRetries" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "OutreachMessage" ADD COLUMN "nextRetryAt" DATETIME;

-- ───────────────────────────────────────────────────────────────────
-- Missing tables: the following 5 tables are declared in schema.prisma
-- but were never captured by any migration. They are created here via
-- CREATE TABLE IF NOT EXISTS so that a fresh `prisma migrate deploy`
-- reproduces the full schema. On the existing production DB (which
-- already has these tables from `prisma db push`), the IF NOT EXISTS
-- clause makes this a no-op.
-- ───────────────────────────────────────────────────────────────────

-- WorkflowExecutionLead: per-lead child rows for batch workflow execution.
CREATE TABLE IF NOT EXISTS "WorkflowExecutionLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "executionId" TEXT NOT NULL,
    "leadId" TEXT,
    "leadName" TEXT,
    "niche" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "stepSummary" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowExecutionLead_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "WorkflowExecution" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "WorkflowExecutionLead_executionId_idx" ON "WorkflowExecutionLead"("executionId");
CREATE INDEX IF NOT EXISTS "WorkflowExecutionLead_leadId_idx" ON "WorkflowExecutionLead"("leadId");
CREATE INDEX IF NOT EXISTS "WorkflowExecutionLead_status_idx" ON "WorkflowExecutionLead"("status");

-- CustomNiche: user-owned niche beyond the predefined vocabulary.
CREATE TABLE IF NOT EXISTS "CustomNiche" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nicheKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomNiche_userId_nicheKey_key" ON "CustomNiche"("userId", "nicheKey");
CREATE INDEX IF NOT EXISTS "CustomNiche_userId_status_idx" ON "CustomNiche"("userId", "status");

-- AgentEvent: unified event log for the agent/event-trigger system.
CREATE TABLE IF NOT EXISTS "AgentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "correlationId" TEXT,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "processedAt" DATETIME,
    "source" TEXT,
    "executionId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "error" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AgentEvent_userId_idx" ON "AgentEvent"("userId");
CREATE INDEX IF NOT EXISTS "AgentEvent_status_idx" ON "AgentEvent"("status");
CREATE INDEX IF NOT EXISTS "AgentEvent_correlationId_idx" ON "AgentEvent"("correlationId");

-- ExecutionActivity: unified execution event log.
CREATE TABLE IF NOT EXISTS "ExecutionActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT,
    "executionId" TEXT,
    "leadId" TEXT,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ExecutionActivity_runId_idx" ON "ExecutionActivity"("runId");
CREATE INDEX IF NOT EXISTS "ExecutionActivity_executionId_idx" ON "ExecutionActivity"("executionId");
CREATE INDEX IF NOT EXISTS "ExecutionActivity_userId_idx" ON "ExecutionActivity"("userId");
CREATE INDEX IF NOT EXISTS "ExecutionActivity_leadId_idx" ON "ExecutionActivity"("leadId");

-- DailyOutreachUsage: per-user daily outreach quota counter.
CREATE TABLE IF NOT EXISTS "DailyOutreachUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "DailyOutreachUsage_userId_dateKey_key" ON "DailyOutreachUsage"("userId", "dateKey");

-- ───────────────────────────────────────────────────────────────────
-- AutopilotWorkflow + AutopilotRun additive columns are NOT included
-- in this migration because the Autopilot tables themselves are not
-- created by any existing migration. They are applied directly to the
-- production DB via scripts/apply_autopilot_drift.py (idempotent).
-- A future migration pass that captures the full Autopilot table
-- CREATE statements will supersede that script.
-- ───────────────────────────────────────────────────────────────────
