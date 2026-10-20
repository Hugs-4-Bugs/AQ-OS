-- ═══════════════════════════════════════════════════════════════════
-- Migration: profile_sections_persistence (20261020)
-- Purpose : Durable database persistence for the three Profile sections
--           of AcquisitionOS Settings:
--             1. My Offer          → UserSettings.servicesOffered
--             2. My Context        → UserSettings.personalContext
--             3. Business Profiles → BusinessProfile (multi-profile,
--                                    user-owned, plan-limited)
--
-- Safety  : ADDITIVE ONLY — new nullable/defaulted columns and one new
--           table + index. No existing column, row, table or index is
--           modified or dropped. The canonical live development database
--           already carries this exact shape (applied historically via
--           `prisma db push`); this migration brings migration-built
--           databases to the same Profile schema parity. Existing rows
--           keep NULL personalContext / '[]' servicesOffered semantics.
--
-- Why the full UserSettings column set: the Profile PUT paths
-- (/api/settings/personal-context, /api/prospecting/offer-profile) use
-- Prisma upserts, and the Prisma client writes the COMPLETE UserSettings
-- model on the create branch. A migration-built database therefore needs
-- every UserSettings column the schema declares, otherwise those Profile
-- saves fail with P2022 (column does not exist). All columns below are
-- nullable or carry constant defaults, matching the live database
-- exactly. Drift on OTHER tables (User, TelegramConfig, ...) is
-- pre-existing migration-chain debt outside this migration's scope.
-- ═══════════════════════════════════════════════════════════════════

-- AlterTable: My Offer (what THIS user sells — JSON array of OfferService)
ALTER TABLE "UserSettings" ADD COLUMN "servicesOffered" TEXT DEFAULT '[]';

-- AlterTable: My Offer read side (offer-profile GET also returns these)
ALTER TABLE "UserSettings" ADD COLUMN "businessDescription" TEXT;

-- AlterTable: My Context (user preference / personal business context)
ALTER TABLE "UserSettings" ADD COLUMN "personalContext" TEXT;

-- AlterTable: remaining UserSettings model columns required by the
-- Prisma upsert create-branch used by the Profile save paths
-- (values/defaults identical to the canonical live database)
ALTER TABLE "UserSettings" ADD COLUMN "gmailConnected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSettings" ADD COLUMN "gmailEmail" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN "googleCalendarConnected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSettings" ADD COLUMN "meetingPlatform" TEXT NOT NULL DEFAULT 'google_meet';
ALTER TABLE "UserSettings" ADD COLUMN "meetingDurationDefault" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "UserSettings" ADD COLUMN "meetingBufferMinutes" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "UserSettings" ADD COLUMN "meetingWorkingHoursStart" TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE "UserSettings" ADD COLUMN "meetingWorkingHoursEnd" TEXT NOT NULL DEFAULT '18:00';
ALTER TABLE "UserSettings" ADD COLUMN "meetingWorkingDays" TEXT NOT NULL DEFAULT '[1,2,3,4,5]';
ALTER TABLE "UserSettings" ADD COLUMN "meetingTimezone" TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE "UserSettings" ADD COLUMN "meetingAutoSchedule" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSettings" ADD COLUMN "meetingAutonomyMode" TEXT NOT NULL DEFAULT 'approval';
ALTER TABLE "UserSettings" ADD COLUMN "meetingRemindersEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserSettings" ADD COLUMN "meetingReminderMinutes" TEXT NOT NULL DEFAULT '[10,60]';
ALTER TABLE "UserSettings" ADD COLUMN "meetingEmailConfirmation" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserSettings" ADD COLUMN "meetingEmailReminder" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserSettings" ADD COLUMN "calendarSyncEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserSettings" ADD COLUMN "calendarWatchEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSettings" ADD COLUMN "outreachAutonomyMode" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "UserSettings" ADD COLUMN "theme" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN "compactMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSettings" ADD COLUMN "defaultNiche" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN "defaultCountry" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN "timezone" TEXT;

-- CreateTable: Business Profiles (multiple user-owned profiles)
CREATE TABLE "BusinessProfile" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BusinessProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BusinessProfile_userId_status_idx" ON "BusinessProfile"("userId", "status");
