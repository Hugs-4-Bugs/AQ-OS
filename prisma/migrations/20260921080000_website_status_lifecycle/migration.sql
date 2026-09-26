-- Add website verification lifecycle to Lead + staleness to LeadAnalysis
-- Data-preserving migration: all existing rows keep their data; new
-- columns are nullable / defaulted so nothing is lost or reset.

-- Lead: canonical website status lifecycle
ALTER TABLE "Lead" ADD COLUMN "websiteStatus" TEXT;
ALTER TABLE "Lead" ADD COLUMN "websiteVerifiedAt" DATETIME;
ALTER TABLE "Lead" ADD COLUMN "websiteVerificationSource" TEXT;
ALTER TABLE "Lead" ADD COLUMN "websiteVerificationConfidence" TEXT;

-- Backfill (data-safe):
--   leads WITH a stored website are treated as VERIFIED-by-source
--   (they were provided/stored; re-verification happens lazily at
--   analyze time). Leads WITHOUT a website become UNKNOWN — which the
--   application must never present as "no website".
UPDATE "Lead" SET "websiteStatus" = 'VERIFIED' WHERE "website" IS NOT NULL AND "hasWebsite" = 1;
UPDATE "Lead" SET "websiteStatus" = 'UNKNOWN' WHERE "website" IS NULL;

-- LeadAnalysis: staleness tracking
ALTER TABLE "LeadAnalysis" ADD COLUMN "isStale" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LeadAnalysis" ADD COLUMN "staleReason" TEXT;
