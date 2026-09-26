// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Starter Plan (final pricing/plan update, Sep 2026)
//
// Locks in the canonical Starter entitlement + checkout contract:
//   • Starter exists as a real paid plan (never "Coming Soon" app-side)
//   • Entitlement = 150 credits/month, 25 lead limit
//   • Monthly ₹399 base (reduced from ₹499, Sep 2026) / Yearly ₹4,999 base (INR)
//   • GST 18% → totals ₹471 / ₹5,899
//   • Plan order Free → Starter → Pro → Elite
//   • Stripe Price ID env resolution (STRIPE_PRICE_STARTER_*_ID) —
//     missing IDs are REPORTED, never invented
//   • Razorpay plan env mapping (RAZORPAY_PLAN_STARTER_*)
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// payment-service imports the Prisma client singleton — mock it so the
// real resolvePlanPriceId / plan pricing logic can be exercised without a
// database (no query is actually run by the functions under test).
vi.mock('@/lib/db', () => ({
  db: {},
}));

import { PLAN_DETAILS } from '@/lib/subscription-store';
import {
  ENTITLEMENTS,
  PLAN_CREDITS,
  getPlanLevel,
  isValidPlanChange,
  getPlanChangeDirection,
  canPerformAction,
} from '@/lib/entitlement-service';
import { getPlanPrice, PLAN_PRICING, getPlanCredits, getStripePriceId } from '@/lib/payments/plan-config';
import { calculateGST } from '@/lib/gst-service';
import { resolvePlanPriceId } from '@/lib/payment-service';
import {
  razorpayPlanEnvName,
  getRazorpayPlanId,
  getPlanCatalog,
} from '@/lib/payments/plan-config';

// ── Starter plan definition ────────────────────────────────────────

describe('starter plan definition', () => {
  it('Starter exists in PLAN_DETAILS', () => {
    expect(PLAN_DETAILS.starter).toBeDefined();
    expect(PLAN_DETAILS.starter.name).toBe('Starter');
    expect(PLAN_DETAILS.starter.plan).toBe('starter');
  });

  it('Starter entitlement = 150 credits/month', () => {
    expect(PLAN_DETAILS.starter.creditsMonthly).toBe(150);
    expect(PLAN_CREDITS.starter).toBe(150);
    expect(getPlanCredits('starter')).toBe(150);
  });

  it('Starter lead limit = 25', () => {
    expect(PLAN_DETAILS.starter.maxLeads).toBe(25);
    expect(ENTITLEMENTS.starter.lead_discovery).toEqual({ limit: 25, enabled: true });
    expect(canPerformAction('starter', 'lead_discovery', 24).allowed).toBe(true);
    expect(canPerformAction('starter', 'lead_discovery', 25).allowed).toBe(false);
  });

  it('Starter canonical feature list is present', () => {
    const features = PLAN_DETAILS.starter.features;
    expect(features).toContain('Basic lead discovery');
    expect(features).toContain('Simple outreach messages');
    expect(features).toContain('Email support');
    expect(features).toContain('Basic dashboard');
  });

  it('Starter sits between Free and Pro (plan order Free → Starter → Pro → Elite)', () => {
    const order = ['free', 'starter', 'pro', 'elite'].map(getPlanLevel);
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it('Starter transition rules follow the existing lifecycle (no new semantics)', () => {
    expect(isValidPlanChange('free', 'starter')).toBe(true);
    expect(isValidPlanChange('starter', 'pro')).toBe(true);
    expect(isValidPlanChange('starter', 'elite')).toBe(true);
    expect(isValidPlanChange('starter', 'starter')).toBe(false);
    expect(isValidPlanChange('pro', 'starter')).toBe(true); // level change allowed; UI gates downgrades
    expect(getPlanChangeDirection('free', 'starter')).toBe('upgrade');
    expect(getPlanChangeDirection('starter', 'free')).toBe('downgrade');
  });
});

// ── Starter pricing + GST ──────────────────────────────────────────

describe('starter pricing and GST', () => {
  it('Starter monthly price = ₹399 base (reduced from ₹499, Sep 2026)', () => {
    expect(getPlanPrice('starter', 'monthly', 'INR')).toBe(399);
    expect(PLAN_PRICING.starter.INR.monthly).toBe(399);
    expect(PLAN_DETAILS.starter.priceINR).toBe(399);
  });

  it('Starter yearly price = ₹4,999 base', () => {
    expect(getPlanPrice('starter', 'yearly', 'INR')).toBe(4999);
    expect(PLAN_PRICING.starter.INR.yearly).toBe(4999);
    expect(PLAN_DETAILS.starter.yearlyINR).toBe(4999);
  });

  it('Starter monthly GST (18%) = ₹72 → total ₹471', () => {
    const base = getPlanPrice('starter', 'monthly', 'INR');
    // Canonical display rounding — exactly how the pricing/checkout UI
    // computes the GST rows (Math.round(base * 0.18)).
    const gst = Math.round(base * 0.18);
    expect(gst).toBe(72);
    expect(base + gst).toBe(471);
    // gst-service raw computation rounds to the same canonical values.
    const gstCalc = calculateGST({ subtotal: base, currency: 'INR', isIndianUser: true, merchantState: 'MH' });
    expect(Math.round(gstCalc.totalTax)).toBe(72);
    expect(Math.round(gstCalc.total)).toBe(471);
  });

  it('Starter yearly GST (18%) = ₹900 → total ₹5,899', () => {
    const base = getPlanPrice('starter', 'yearly', 'INR');
    const gst = Math.round(base * 0.18);
    expect(gst).toBe(900);
    expect(base + gst).toBe(5899);
    const gstCalc = calculateGST({ subtotal: base, currency: 'INR', isIndianUser: true, merchantState: 'MH' });
    expect(Math.round(gstCalc.totalTax)).toBe(900);
    expect(Math.round(gstCalc.total)).toBe(5899);
  });

  it('International users are GST-exempt (existing behavior preserved)', () => {
    const gst = calculateGST({ subtotal: 499, currency: 'USD', isIndianUser: false });
    expect(gst.totalTax).toBe(0);
    expect(gst.total).toBe(499);
  });
});

// ── Stripe Price ID configuration reporting ────────────────────────

describe('starter Stripe Price ID resolution', () => {
  const ENV_KEYS = [
    'STRIPE_PRICE_STARTER_MONTHLY_ID',
    'STRIPE_PRICE_STARTER_YEARLY_ID',
    'STRIPE_STARTER_MONTHLY_PRICE_ID',
    'STRIPE_PRICE_STARTER_MONTHLY',
    'STRIPE_PRICE_STARTER_YEARLY',
  ];

  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });

  it('missing Price ID is reported as null with the exact env var names tried', () => {
    const { priceId, envVarNamesTried } = resolvePlanPriceId('starter', 'monthly');
    expect(priceId).toBeNull();
    expect(envVarNamesTried).toContain('STRIPE_PRICE_STARTER_MONTHLY_ID');
    expect(getStripePriceId('starter', 'monthly')).toBeNull();
  });

  it('missing yearly Price ID reports STRIPE_PRICE_STARTER_YEARLY_ID', () => {
    const { priceId, envVarNamesTried } = resolvePlanPriceId('starter', 'yearly');
    expect(priceId).toBeNull();
    expect(envVarNamesTried).toContain('STRIPE_PRICE_STARTER_YEARLY_ID');
  });

  it('resolves the canonical STRIPE_PRICE_STARTER_MONTHLY_ID when configured (explicit test fixture)', () => {
    // Explicit test fixture — never reaches a real provider (no SDK call).
    process.env.STRIPE_PRICE_STARTER_MONTHLY_ID = 'price_test_fixture_starter_monthly';
    const { priceId } = resolvePlanPriceId('starter', 'monthly');
    expect(priceId).toBe('price_test_fixture_starter_monthly');
    expect(getStripePriceId('starter', 'monthly')).toBe('price_test_fixture_starter_monthly');
  });

  it('resolves the canonical STRIPE_PRICE_STARTER_YEARLY_ID when configured (explicit test fixture)', () => {
    process.env.STRIPE_PRICE_STARTER_YEARLY_ID = 'price_test_fixture_starter_yearly';
    expect(getStripePriceId('starter', 'yearly')).toBe('price_test_fixture_starter_yearly');
  });

  it('non-price_ values are ignored (never invent IDs)', () => {
    process.env.STRIPE_PRICE_STARTER_MONTHLY_ID = 'not-a-price-id';
    expect(getStripePriceId('starter', 'monthly')).toBeNull();
  });
});

// ── Razorpay plan mapping ──────────────────────────────────────────

describe('starter Razorpay plan mapping', () => {
  const ENV_KEYS = ['RAZORPAY_PLAN_STARTER_MONTHLY', 'RAZORPAY_PLAN_STARTER_YEARLY'];

  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });

  it('uses the canonical env var names', () => {
    expect(razorpayPlanEnvName('starter', 'monthly')).toBe('RAZORPAY_PLAN_STARTER_MONTHLY');
    expect(razorpayPlanEnvName('starter', 'yearly')).toBe('RAZORPAY_PLAN_STARTER_YEARLY');
  });

  it('returns null (one-time order fallback) when no Razorpay Plan ID is configured', () => {
    expect(getRazorpayPlanId('starter', 'monthly')).toBeNull();
    expect(getRazorpayPlanId('starter', 'yearly')).toBeNull();
  });

  it('returns the configured Plan ID when present (explicit test fixture)', () => {
    process.env.RAZORPAY_PLAN_STARTER_MONTHLY = 'plan_test_fixture_starter_monthly';
    expect(getRazorpayPlanId('starter', 'monthly')).toBe('plan_test_fixture_starter_monthly');
  });
});

// ── Plan catalog ───────────────────────────────────────────────────

describe('starter plan catalog', () => {
  it('contains a starter row for both cycles with correct prices and env var names', () => {
    const catalog = getPlanCatalog();
    const starterRows = catalog.filter((row) => row.plan === 'starter');
    expect(starterRows).toHaveLength(2);

    const monthly = starterRows.find((r) => r.cycle === 'monthly');
    const yearly = starterRows.find((r) => r.cycle === 'yearly');
    expect(monthly).toMatchObject({
      plan: 'starter',
      cycle: 'monthly',
      priceINR: 399,
      credits: 150,
    });
    expect(monthly?.stripe.envVars).toContain('STRIPE_PRICE_STARTER_MONTHLY_ID');
    expect(monthly?.razorpay.envVar).toBe('RAZORPAY_PLAN_STARTER_MONTHLY');

    expect(yearly).toMatchObject({
      plan: 'starter',
      cycle: 'yearly',
      priceINR: 4999,
      credits: 150,
    });
    expect(yearly?.stripe.envVars).toContain('STRIPE_PRICE_STARTER_YEARLY_ID');
    expect(yearly?.razorpay.envVar).toBe('RAZORPAY_PLAN_STARTER_YEARLY');
  });

  it('keeps the catalog order Free(taxonomy) Starter → Pro → Elite', () => {
    const catalog = getPlanCatalog();
    const planOrder = [...new Set(catalog.map((r) => r.plan))];
    expect(planOrder).toEqual(['starter', 'pro', 'elite']);
  });
});
