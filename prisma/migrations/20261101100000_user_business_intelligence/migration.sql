-- ═══════════════════════════════════════════════════════════════════
-- Migration: user_business_intelligence (20261101)
-- Purpose : Add WebProperty and ResearchSnapshot models to support
--           researching the user's own business website(s) and
--           persisting structured business intelligence for improved
--           acquisition decisions.
--
-- Safety  : 100% ADDITIVE.
--           - Two new tables only (WebProperty, ResearchSnapshot)
--           - No existing table modified (except adding relations
--             which are handled at the Prisma level, not SQL)
--           - No data changes
--           - No drops, no renames, no type changes
--
-- The migration creates:
--   1. WebProperty table — URL registry scoped to BusinessProfile
--   2. ResearchSnapshot table — versioned research results per WebProperty
--
-- Both tables use onDelete: Cascade from their parent (BusinessProfile
-- and WebProperty respectively), so cleanup is automatic when a profile
-- or property is deleted.
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- WebProperty: URLs the user claims as their own business web presence
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE "WebProperty" (
    "id"               TEXT     NOT NULL,
    "businessProfileId" TEXT    NOT NULL,
    "userId"           TEXT     NOT NULL,
    "url"              TEXT     NOT NULL,
    "label"            TEXT,
    "propertyType"     TEXT     NOT NULL DEFAULT 'website',
    "status"           TEXT     NOT NULL DEFAULT 'active',
    "lastResearchedAt" DATETIME,
    "createdAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        DATETIME NOT NULL,

    PRIMARY KEY ("id"),
    FOREIGN KEY ("businessProfileId") REFERENCES "BusinessProfile" ("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "WebProperty_businessProfileId_url_key"
    ON "WebProperty" ("businessProfileId", "url");

CREATE INDEX "WebProperty_userId_idx" ON "WebProperty" ("userId");
CREATE INDEX "WebProperty_businessProfileId_status_idx" ON "WebProperty" ("businessProfileId", "status");

-- ───────────────────────────────────────────────────────────────────
-- ResearchSnapshot: versioned research results per WebProperty
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE "ResearchSnapshot" (
    "id"                  TEXT     NOT NULL,
    "webPropertyId"       TEXT     NOT NULL,
    "userId"              TEXT     NOT NULL,
    "status"              TEXT     NOT NULL DEFAULT 'pending',
    "researchVersion"     INTEGER  NOT NULL DEFAULT 1,

    "companyDescription"  TEXT,
    "valueProposition"    TEXT,
    "targetAudience"      TEXT,
    "challenges"          TEXT,
    "differentiators"     TEXT,
    "positioning"         TEXT,
    "acquisitionAngles"   TEXT,

    "websiteQualityScore" INTEGER,
    "seoScore"            INTEGER,
    "techStack"           TEXT,
    "websiteGaps"         TEXT,

    "swot"                TEXT,
    "pricingSignals"      TEXT,
    "socialProfiles"      TEXT,

    "sourceUrls"          TEXT,
    "confidence"          TEXT,
    "isObserved"          BOOLEAN  NOT NULL DEFAULT true,

    "startedAt"           DATETIME,
    "completedAt"         DATETIME,
    "creditsUsed"         INTEGER  NOT NULL DEFAULT 0,
    "errorMessage"        TEXT,

    "createdAt"           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("id"),
    FOREIGN KEY ("webPropertyId") REFERENCES "WebProperty" ("id") ON DELETE CASCADE
);

CREATE INDEX "ResearchSnapshot_webPropertyId_researchVersion_idx"
    ON "ResearchSnapshot" ("webPropertyId", "researchVersion");
CREATE INDEX "ResearchSnapshot_userId_status_idx"
    ON "ResearchSnapshot" ("userId", "status");
CREATE INDEX "ResearchSnapshot_webPropertyId_status_completedAt_idx"
    ON "ResearchSnapshot" ("webPropertyId", "status", "completedAt");
