-- AcquisitionOS — additive schema-drift repair (AI Pipeline fix)
-- Scope: create the ProspectPipeline table + UserSettings.servicesOffered column
-- that prisma/schema.prisma declares but db/custom.db lacks after restore.
--
-- EXPLICITLY NON-DESTRUCTIVE:
--   * No DROP, no DELETE, no table rewrites.
--   * Orphaned legacy columns in Lead / LeadAnalysis (websiteStatus,
--     websiteVerifiedAt, websiteVerificationSource, websiteVerificationConfidence,
--     isStale, staleReason) are intentionally LEFT ALIVE — no code reads them
--     today, but deleting them would destroy historical data.
--   * Existing rows in UserSettings are untouched (ADD COLUMN with default).

CREATE TABLE IF NOT EXISTS "ProspectPipeline" (
    "id"                TEXT     NOT NULL PRIMARY KEY,
    "leadId"            TEXT     NOT NULL,
    "userId"            TEXT     NOT NULL,
    "status"            TEXT     NOT NULL DEFAULT 'idle',
    "currentStep"       INTEGER  NOT NULL DEFAULT 0,
    "totalSteps"        INTEGER  NOT NULL DEFAULT 5,
    "stepStatus"        TEXT     NOT NULL DEFAULT '{}',
    "progress"          INTEGER  NOT NULL DEFAULT 0,
    "step1ResearchJson" TEXT,
    "step2GapsJson"     TEXT,
    "step3MatchJson"    TEXT,
    "step4PitchJson"    TEXT,
    "step5EmailJson"    TEXT,
    "overallScore"      REAL,
    "temperature"       TEXT,
    "outreachMessageId" TEXT,
    "error"             TEXT,
    "startedAt"         DATETIME,
    "completedAt"       DATETIME,
    "createdAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         DATETIME NOT NULL,
    CONSTRAINT "ProspectPipeline_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ProspectPipeline_leadId_createdAt_idx" ON "ProspectPipeline"("leadId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProspectPipeline_userId_createdAt_idx" ON "ProspectPipeline"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProspectPipeline_status_idx" ON "ProspectPipeline"("status");

ALTER TABLE "UserSettings" ADD COLUMN "servicesOffered" TEXT DEFAULT '[]';
