-- AlterTable
ALTER TABLE "DiscoveryJob" ADD COLUMN "outcome" TEXT;
ALTER TABLE "DiscoveryJob" ADD COLUMN "targetingJson" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "discoveryJobId" TEXT;

-- CreateTable
CREATE TABLE "DailyOutreachUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyOutreachUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkflowExecutionLead" (
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkflowExecutionLead_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "WorkflowExecution" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomNiche" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nicheKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AutopilotRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "autopilotId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "config" TEXT NOT NULL DEFAULT '{}',
    "runKey" TEXT,
    "executionId" TEXT,
    "discovered" INTEGER NOT NULL DEFAULT 0,
    "saved" INTEGER NOT NULL DEFAULT 0,
    "skippedDupes" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "executionsCreated" INTEGER NOT NULL DEFAULT 0,
    "leadsCompleted" INTEGER NOT NULL DEFAULT 0,
    "leadsFailed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME
);
INSERT INTO "new_AutopilotRun" ("autopilotId", "completedAt", "config", "createdAt", "discovered", "error", "executionsCreated", "id", "processed", "saved", "skippedDupes", "startedAt", "status", "trigger", "userId") SELECT "autopilotId", "completedAt", "config", "createdAt", "discovered", "error", "executionsCreated", "id", "processed", "saved", "skippedDupes", "startedAt", "status", "trigger", "userId" FROM "AutopilotRun";
DROP TABLE "AutopilotRun";
ALTER TABLE "new_AutopilotRun" RENAME TO "AutopilotRun";
CREATE UNIQUE INDEX "AutopilotRun_runKey_key" ON "AutopilotRun"("runKey");
CREATE INDEX "AutopilotRun_autopilotId_idx" ON "AutopilotRun"("autopilotId");
CREATE INDEX "AutopilotRun_userId_idx" ON "AutopilotRun"("userId");
CREATE INDEX "AutopilotRun_status_idx" ON "AutopilotRun"("status");
CREATE INDEX "AutopilotRun_createdAt_idx" ON "AutopilotRun"("createdAt");
CREATE INDEX "AutopilotRun_executionId_idx" ON "AutopilotRun"("executionId");
CREATE TABLE "new_AutopilotWorkflow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "orgId" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "niches" TEXT NOT NULL DEFAULT '[]',
    "geography" TEXT NOT NULL DEFAULT '{}',
    "profileMappings" TEXT NOT NULL DEFAULT '{}',
    "workflowId" TEXT NOT NULL,
    "schedule" TEXT NOT NULL DEFAULT 'daily',
    "lastRunAt" DATETIME,
    "nextRunAt" DATETIME,
    "lastError" TEXT,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "totalDiscovered" INTEGER NOT NULL DEFAULT 0,
    "totalSaved" INTEGER NOT NULL DEFAULT 0,
    "totalProcessed" INTEGER NOT NULL DEFAULT 0,
    "totalExecutions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AutopilotWorkflow" ("createdAt", "geography", "id", "lastError", "lastRunAt", "name", "nextRunAt", "niches", "orgId", "runCount", "schedule", "status", "totalDiscovered", "totalExecutions", "totalProcessed", "totalSaved", "updatedAt", "userId", "workflowId") SELECT "createdAt", "geography", "id", "lastError", "lastRunAt", "name", "nextRunAt", "niches", "orgId", "runCount", "schedule", "status", "totalDiscovered", "totalExecutions", "totalProcessed", "totalSaved", "updatedAt", "userId", "workflowId" FROM "AutopilotWorkflow";
DROP TABLE "AutopilotWorkflow";
ALTER TABLE "new_AutopilotWorkflow" RENAME TO "AutopilotWorkflow";
CREATE INDEX "AutopilotWorkflow_userId_idx" ON "AutopilotWorkflow"("userId");
CREATE INDEX "AutopilotWorkflow_status_idx" ON "AutopilotWorkflow"("status");
CREATE INDEX "AutopilotWorkflow_nextRunAt_idx" ON "AutopilotWorkflow"("nextRunAt");
CREATE INDEX "AutopilotWorkflow_workflowId_idx" ON "AutopilotWorkflow"("workflowId");
CREATE TABLE "new_BusinessProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "description" TEXT,
    "productsServices" TEXT,
    "offers" TEXT,
    "valueProposition" TEXT,
    "targetAudience" TEXT,
    "targetIndustries" TEXT,
    "targetRoles" TEXT,
    "geographicMarket" TEXT,
    "painPoints" TEXT,
    "businessGoals" TEXT,
    "differentiators" TEXT,
    "proofPoints" TEXT,
    "preferredTone" TEXT,
    "preferredLanguage" TEXT,
    "cta" TEXT,
    "commercialConstraints" TEXT,
    "customInstructions" TEXT,
    "researchPreferences" TEXT,
    "outreachPreferences" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BusinessProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BusinessProfile" ("businessGoals", "commercialConstraints", "createdAt", "cta", "customInstructions", "description", "differentiators", "geographicMarket", "id", "industry", "name", "offers", "outreachPreferences", "painPoints", "preferredLanguage", "preferredTone", "productsServices", "proofPoints", "researchPreferences", "status", "targetAudience", "targetIndustries", "targetRoles", "updatedAt", "userId", "valueProposition") SELECT "businessGoals", "commercialConstraints", "createdAt", "cta", "customInstructions", "description", "differentiators", "geographicMarket", "id", "industry", "name", "offers", "outreachPreferences", "painPoints", "preferredLanguage", "preferredTone", "productsServices", "proofPoints", "researchPreferences", "status", "targetAudience", "targetIndustries", "targetRoles", "updatedAt", "userId", "valueProposition" FROM "BusinessProfile";
DROP TABLE "BusinessProfile";
ALTER TABLE "new_BusinessProfile" RENAME TO "BusinessProfile";
CREATE INDEX "BusinessProfile_userId_status_idx" ON "BusinessProfile"("userId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DailyOutreachUsage_userId_idx" ON "DailyOutreachUsage"("userId");

-- CreateIndex
CREATE INDEX "DailyOutreachUsage_dateKey_idx" ON "DailyOutreachUsage"("dateKey");

-- CreateIndex
CREATE UNIQUE INDEX "DailyOutreachUsage_userId_dateKey_key" ON "DailyOutreachUsage"("userId", "dateKey");

-- CreateIndex
CREATE INDEX "WorkflowExecutionLead_executionId_idx" ON "WorkflowExecutionLead"("executionId");

-- CreateIndex
CREATE INDEX "WorkflowExecutionLead_leadId_idx" ON "WorkflowExecutionLead"("leadId");

-- CreateIndex
CREATE INDEX "WorkflowExecutionLead_status_idx" ON "WorkflowExecutionLead"("status");

-- CreateIndex
CREATE INDEX "CustomNiche_userId_status_idx" ON "CustomNiche"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CustomNiche_userId_nicheKey_key" ON "CustomNiche"("userId", "nicheKey");

-- CreateIndex
CREATE INDEX "Lead_discoveryJobId_idx" ON "Lead"("discoveryJobId");

