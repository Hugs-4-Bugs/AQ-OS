-- ═══════════════════════════════════════════════════════════════════
-- Migration: add_provider_subscription_id (20260921)
-- Purpose : Unified Stripe + Razorpay payment support.
--           Adds providerSubscriptionId to PaymentOrder so a Razorpay
--           recurring subscription (or any future gateway subscription)
--           can be linked back to the internal payment order for
--           webhook attribution and first-charge activation.
--
-- Safety  : ADDITIVE ONLY. Nullable column + index. No data is modified
--           or dropped. Existing rows keep providerSubscriptionId = NULL.
--           SQLite: applied via `prisma db push`. PostgreSQL: run this
--           file against the production database (or `prisma migrate
--           deploy` after regenerating migrations from the schema).
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "PaymentOrder" ADD COLUMN "providerSubscriptionId" TEXT;

CREATE INDEX "PaymentOrder_providerSubscriptionId_idx" ON "PaymentOrder"("providerSubscriptionId");
