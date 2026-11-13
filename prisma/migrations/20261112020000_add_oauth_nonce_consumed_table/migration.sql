-- ═══════════════════════════════════════════════════════════════════
-- Migration: add_oauth_nonce_consumed_table (20261112)
-- Purpose  : Create a dedicated table for database-enforced single-use
--            OAuth nonce consumption, replacing the application-level
--            INSERT...WHERE NOT EXISTS check against AuditLog.
--
-- Safety   : 100% ADDITIVE.
--            - One new table only (OAuthNonceConsumed)
--            - No existing table modified
--            - No data changes
--            - No drops, no renames, no type changes
--
-- The migration creates:
--   1. OAuthNonceConsumed table — nonce consumption records
--   2. UNIQUE constraint on `nonce` — database-enforced single-use
--   3. Index on `userId` — query support for user-scoped lookups
--   4. Index on `consumedAt` — supports future retention cleanup
--   5. Foreign key to User with ON DELETE CASCADE
--
-- The UNIQUE constraint on `nonce` is the critical security guarantee:
-- it ensures that at most one row can exist for any given nonce value,
-- preventing concurrent requests from both consuming the same OAuth
-- state token. This works across all database providers (SQLite,
-- PostgreSQL) and across multiple application processes.
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- OAuthNonceConsumed: Durable OAuth state nonce consumption records
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE "OAuthNonceConsumed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nonce" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "flow" TEXT NOT NULL,
    "consumedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuthNonceConsumed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex: unique constraint on nonce — database-enforced single-use
CREATE UNIQUE INDEX "OAuthNonceConsumed_nonce_key" ON "OAuthNonceConsumed"("nonce");

-- CreateIndex: userId index — supports user-scoped queries
CREATE INDEX "OAuthNonceConsumed_userId_idx" ON "OAuthNonceConsumed"("userId");

-- CreateIndex: consumedAt index — supports future retention cleanup
CREATE INDEX "OAuthNonceConsumed_consumedAt_idx" ON "OAuthNonceConsumed"("consumedAt");
