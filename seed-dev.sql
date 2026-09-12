-- ═══════════════════════════════════════════════════════════════════════
-- AcquisitionOS — Development Seed Data
-- ═══════════════════════════════════════════════════════════════════════
--
-- Purpose : Inserts reference/seed data for local development after
--           Prisma schema has been pushed. This script ONLY inserts
--           data — Prisma manages all table DDL.
--
-- Usage   : psql -U acquisitionos -d acquisitionos -f seed-dev.sql
--
-- Notes   :
--   - Uses INSERT ... ON CONFLICT DO NOTHING for idempotency.
--   - Uses readable CUID-style IDs for easy debugging in dev.
--   - Safe to run multiple times; will not duplicate data.
--   - DO NOT use this in production — it contains test coupons and
--     default pipeline stages that should be managed via migrations.
--
-- ═══════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────
-- 1. Pipeline Stages
-- ───────────────────────────────────────────────────────────────────────
-- The 7 default stages that every new account starts with. These map to
-- the lead pipeline view and drive the sales funnel visualization.
--
-- Schema: PipelineStage(id, name, order, color, isDefault, orgId, createdAt, updatedAt)

INSERT INTO PipelineStage (id, name, "order", color, isDefault, orgId, createdAt, updatedAt)
VALUES
    ('stage-discovered',  'Discovered',  1, '#6B7280', true, NULL, NOW(), NOW()),
    ('stage-contacted',   'Contacted',   2, '#3B82F6', true, NULL, NOW(), NOW()),
    ('stage-qualified',   'Qualified',   3, '#8B5CF6', true, NULL, NOW(), NOW()),
    ('stage-proposal',    'Proposal',    4, '#F59E0B', true, NULL, NOW(), NOW()),
    ('stage-negotiation', 'Negotiation', 5, '#EF4444', true, NULL, NOW(), NOW()),
    ('stage-won',         'Won',         6, '#10B981', true, NULL, NOW(), NOW()),
    ('stage-lost',        'Lost',        7, '#6B7280', true, NULL, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;


-- ───────────────────────────────────────────────────────────────────────
-- 2. Plan Entitlements
-- ───────────────────────────────────────────────────────────────────────
-- Defines what each plan tier is entitled to. The `limit` column uses
-- NULL to mean "unlimited". The `enabled` flag controls whether the
-- feature is available at all on that plan.
--
-- Schema: PlanEntitlement(id, plan, feature, limit, enabled, createdAt, updatedAt)
-- Unique constraint: (plan, feature)

-- ── Free Plan ──────────────────────────────────────────────────────────
INSERT INTO PlanEntitlement (id, plan, feature, limit, enabled, createdAt, updatedAt)
VALUES
    ('ent-free-credits',       'free', 'credits_per_month',     50,   true, NOW(), NOW()),
    ('ent-free-leads',         'free', 'max_leads',            100,   true, NOW(), NOW()),
    ('ent-free-outreach',      'free', 'outreach_per_day',       5,   true, NOW(), NOW()),
    ('ent-free-sequences',     'free', 'sequences',              0,  false, NOW(), NOW()),
    ('ent-free-workflows',     'free', 'workflows',              0,  false, NOW(), NOW())
ON CONFLICT (plan, feature) DO NOTHING;

-- ── Pro Plan ───────────────────────────────────────────────────────────
INSERT INTO PlanEntitlement (id, plan, feature, limit, enabled, createdAt, updatedAt)
VALUES
    ('ent-pro-credits',       'pro', 'credits_per_month',    500,    true, NOW(), NOW()),
    ('ent-pro-leads',         'pro', 'max_leads',           5000,    true, NOW(), NOW()),
    ('ent-pro-outreach',      'pro', 'outreach_per_day',      50,   true, NOW(), NOW()),
    ('ent-pro-sequences',     'pro', 'sequences',             10,   true, NOW(), NOW()),
    ('ent-pro-workflows',     'pro', 'workflows',              5,   true, NOW(), NOW())
ON CONFLICT (plan, feature) DO NOTHING;

-- ── Elite Plan ─────────────────────────────────────────────────────────
-- NULL limit = unlimited for that feature.
INSERT INTO PlanEntitlement (id, plan, feature, limit, enabled, createdAt, updatedAt)
VALUES
    ('ent-elite-credits',       'elite', 'credits_per_month',  2000,  true, NOW(), NOW()),
    ('ent-elite-leads',         'elite', 'max_leads',          NULL,  true, NOW(), NOW()),
    ('ent-elite-outreach',      'elite', 'outreach_per_day',   NULL,  true, NOW(), NOW()),
    ('ent-elite-sequences',     'elite', 'sequences',          NULL,  true, NOW(), NOW()),
    ('ent-elite-workflows',     'elite', 'workflows',          NULL,  true, NOW(), NOW())
ON CONFLICT (plan, feature) DO NOTHING;


-- ───────────────────────────────────────────────────────────────────────
-- 3. Feature Flags
-- ───────────────────────────────────────────────────────────────────────
-- Global feature flags that gate functionality by plan tier.
-- The `plans` column is a JSON array of plan names that can access
-- the feature. An empty array or ["all"] means all plans.
--
-- Schema: FeatureFlag(id, key, name, description, enabled, plans, createdAt, updatedAt)
-- Unique constraint: key

INSERT INTO FeatureFlag (id, key, name, description, enabled, plans, createdAt, updatedAt)
VALUES
    (
        'flag-ai-coach',
        'ai_sales_coach',
        'AI Sales Coach',
        'AI-powered sales coaching with deal insights, objection handling, and closing strategies. Available to all plans with varying depth.',
        true,
        '["free","pro","elite"]',
        NOW(), NOW()
    ),
    (
        'flag-competitor-intel',
        'competitor_intelligence',
        'Competitor Intelligence',
        'Track and analyze competitor websites, SEO, social presence, and positioning. Generates competitive battle cards.',
        true,
        '["pro","elite"]',
        NOW(), NOW()
    ),
    (
        'flag-gmail-integration',
        'gmail_integration',
        'Gmail Integration',
        'Connect your Gmail account for bidirectional email sync, inbox monitoring via Pub/Sub, and direct outreach from the pipeline.',
        true,
        '["pro","elite"]',
        NOW(), NOW()
    ),
    (
        'flag-workflow-automation',
        'workflow_automation',
        'Workflow Automation',
        'Build automated workflows with triggers, conditions, delays, and AI actions. Nurture leads and follow up automatically.',
        true,
        '["pro","elite"]',
        NOW(), NOW()
    ),
    (
        'flag-custom-stages',
        'custom_stages',
        'Custom Pipeline Stages',
        'Add, rename, reorder, and color-code pipeline stages to match your unique sales process. Override the default 7-stage pipeline.',
        true,
        '["elite"]',
        NOW(), NOW()
    ),
    (
        'flag-priority-support',
        'priority_support',
        'Priority Support',
        'Faster response times and dedicated support channel. Includes Slack connect channel and 4-hour SLA for critical issues.',
        true,
        '["pro","elite"]',
        NOW(), NOW()
    ),
    (
        'flag-white-label',
        'white_label',
        'White Label',
        'Customize the platform with your own branding, logo, colors, and custom domain. Remove all AcquisitionOS branding.',
        true,
        '["elite"]',
        NOW(), NOW()
    ),
    (
        'flag-api-access',
        'api_access',
        'API Access',
        'Full REST API access with API key management, rate limiting, and webhook support. Build custom integrations and automate workflows.',
        true,
        '["pro","elite"]',
        NOW(), NOW()
    )
ON CONFLICT (key) DO NOTHING;


-- ───────────────────────────────────────────────────────────────────────
-- 4. Tax Rates
-- ───────────────────────────────────────────────────────────────────────
-- Tax configuration for billing. Used by the payment service to calculate
-- tax on invoices based on the user's country/region.
--
-- Schema: TaxRate(id, country, region, rate, name, isActive, createdAt, updatedAt)
-- Unique constraint: (country, region)

INSERT INTO TaxRate (id, country, region, rate, name, isActive, createdAt, updatedAt)
VALUES
    (
        'tax-in-gst',
        'IN',
        'GST',
        18.0,
        'India GST',
        true,
        NOW(), NOW()
    ),
    (
        'tax-in-igst',
        'IN',
        'IGST',
        18.0,
        'India IGST',
        true,
        NOW(), NOW()
    ),
    (
        'tax-us-digital',
        'US',
        NULL,
        0.0,
        'US Sales Tax (digital goods exempt)',
        true,
        NOW(), NOW()
    )
ON CONFLICT (country, region) DO NOTHING;


-- ───────────────────────────────────────────────────────────────────────
-- 5. Coupons
-- ───────────────────────────────────────────────────────────────────────
-- Test coupons for development. NOT for production use.
--
-- Schema: Coupon(id, code, discountType, discountValue, maxUses, usedCount,
--                expiresAt, applicablePlans, active, createdAt, updatedAt)
-- Unique constraint: code

INSERT INTO Coupon (id, code, discountType, discountValue, maxUses, usedCount, expiresAt, applicablePlans, active, createdAt, updatedAt)
VALUES
    (
        'coupon-launch20',
        'LAUNCH20',
        'percent',
        20.0,
        1000,
        0,
        '2026-12-31T23:59:59Z',
        '["pro","elite"]',
        true,
        NOW(), NOW()
    ),
    (
        'coupon-earlybird50',
        'EARLYBIRD50',
        'percent',
        50.0,
        100,
        0,
        '2025-12-31T23:59:59Z',
        '["pro","elite"]',
        true,
        NOW(), NOW()
    )
ON CONFLICT (code) DO NOTHING;


-- ───────────────────────────────────────────────────────────────────────
-- Verification Summary
-- ───────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    v_stages       INTEGER;
    v_entitlements INTEGER;
    v_flags        INTEGER;
    v_taxes        INTEGER;
    v_coupons      INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_stages       FROM PipelineStage  WHERE id LIKE 'stage-%';
    SELECT COUNT(*) INTO v_entitlements FROM PlanEntitlement WHERE id LIKE 'ent-%';
    SELECT COUNT(*) INTO v_flags        FROM FeatureFlag    WHERE id LIKE 'flag-%';
    SELECT COUNT(*) INTO v_taxes        FROM TaxRate        WHERE id LIKE 'tax-%';
    SELECT COUNT(*) INTO v_coupons      FROM Coupon         WHERE id LIKE 'coupon-%';

    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
    RAISE NOTICE '  AcquisitionOS Seed Data Summary';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
    RAISE NOTICE '  Pipeline Stages   : %', v_stages;
    RAISE NOTICE '  Plan Entitlements : %', v_entitlements;
    RAISE NOTICE '  Feature Flags     : %', v_flags;
    RAISE NOTICE '  Tax Rates         : %', v_taxes;
    RAISE NOTICE '  Coupons           : %', v_coupons;
    RAISE NOTICE '═══════════════════════════════════════════════════════';
    RAISE NOTICE '';

    IF v_stages <> 7 THEN
        RAISE WARNING 'Expected 7 pipeline stages, found %', v_stages;
    END IF;

    IF v_entitlements <> 15 THEN
        RAISE WARNING 'Expected 15 plan entitlements (5 per plan × 3 plans), found %', v_entitlements;
    END IF;

    IF v_flags <> 8 THEN
        RAISE WARNING 'Expected 8 feature flags, found %', v_flags;
    END IF;

    IF v_taxes <> 3 THEN
        RAISE WARNING 'Expected 3 tax rates, found %', v_taxes;
    END IF;

    IF v_coupons <> 2 THEN
        RAISE WARNING 'Expected 2 coupons, found %', v_coupons;
    END IF;
END
$$;
