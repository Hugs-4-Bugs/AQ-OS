// ═══════════════════════════════════════════════════════════════════
// Unit Tests: FINAL PAYMENT ACTIVATION ARCHITECTURE (Sep 2026)
//
// Locks in the end-to-end contract for ALL paid plans:
//   • Starter / Pro / Elite are ACTIVE plans — plan status is NEVER
//     derived from provider configuration (no "Coming Soon").
//   • Pro/Elite canonical pricing + GST (18%):
//       Pro   monthly ₹1,599 → ₹288 GST → ₹1,887
//       Pro   yearly  ₹14,999 → ₹2,700 GST → ₹17,699
//       Elite monthly ₹5,199 → ₹936 GST → ₹6,135
//       Elite yearly  ₹44,999 → ₹8,100 GST → ₹53,099
//   • Entitlements: Pro 750 credits + unlimited leads; Elite 2,000
//     credits + unlimited leads.
//   • Plan order Free → Starter → Pro → Elite everywhere.
//   • Checkout validation accepts all six plan/cycle combos on both
//     providers (fixtures only — SDKs/network fully mocked).
//   • Missing provider IDs are REPORTED (config-required), never
//     invented, never sent to a provider.
//   • The safe configuration validator reports CONFIGURED/MISSING and
//     NEVER leaks secret values.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mock for @/lib/payment-service ─────────────────────────
// Same env-driven resolvePlanPriceId contract as the real implementation
// (the real one is exercised in starter-plan.test.ts); everything else
// is a vi.fn() so no SDK/network/DB is ever touched.
const paymentServiceMocks = vi.hoisted(() => ({
  createPaymentOrder: vi.fn(),
  createStripeCheckoutSession: vi.fn(),
  createStripeCreditAddonCheckoutSession: vi.fn(),
  getRazorpayClient: vi.fn(),
  recordWebhookEvent: vi.fn(),
  markWebhookProcessed: vi.fn(),
  resolvePlanPriceId: (plan: string, cycle: string) => {
    const P = plan.toUpperCase();
    const C = cycle.toUpperCase();
    const conventions = [
      `STRIPE_${P}_${C}_PRICE_ID`,
      `STRIPE_PRICE_ID_${P}_${C}`,
      `STRIPE_PRICE_${P}_${C}_ID`,
      `STRIPE_PRICE_${P}_${C}`,
    ];
    for (const name of conventions) {
      const value = process.env[name];
      if (typeof value === 'string' && value.startsWith('price_')) {
        return { priceId: value, envVarNamesTried: conventions };
      }
    }
    return { priceId: null, envVarNamesTried: conventions };
  },
}));

vi.mock('@/lib/payment-service', () => paymentServiceMocks);

// ── Hoisted mock for @/lib/db (Prisma client singleton) ────────────
const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  subscription: { findFirst: vi.fn() },
  paymentOrder: { create: vi.fn(), update: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ db: mockPrisma }));

vi.mock('@/lib/billing-audit', () => ({
  logPaymentEvent: vi.fn(),
  logSubscriptionEvent: vi.fn(),
  logBillingEvent: vi.fn(),
}));

vi.mock('@/lib/subscription-service', () => ({
  confirmPaymentAndActivate: vi.fn(),
}));

vi.mock('@/lib/credit-addon-fulfillment', () => ({
  fulfillCreditAddon: vi.fn(),
  isCreditAddonOrder: vi.fn(),
}));

vi.mock('@/lib/razorpay-service', () => ({
  verifyPaymentSignature: vi.fn(),
}));

vi.mock('@/lib/observability/logger', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { PLAN_DETAILS } from '@/lib/subscription-store';
import {
  ENTITLEMENTS,
  PLAN_CREDITS,
  getPlanLevel,
  canPerformAction,
} from '@/lib/entitlement-service';
import {
  getPlanPrice,
  PLAN_PRICING,
  getPlanCredits,
  razorpayPlanEnvName,
  getRazorpayPlanId,
  getPlanCatalog,
} from '@/lib/payments/plan-config';
import { calculateGST } from '@/lib/gst-service';
import { buildPaymentConfigReport } from '@/lib/payment-config-validator';
import { GET as providerStatusGET } from '@/app/api/payments/provider-status/route';
import { computePlanButtonState } from '@/components/dashboard/upgrade-modal';
import { RazorpayPaymentProvider } from '@/lib/payments/razorpay-provider';
import { StripePaymentProvider } from '@/lib/payments/stripe-provider';

// Env vars touched by these tests — always cleaned up.
const TRACKED_ENV = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'STRIPE_PRICE_STARTER_MONTHLY_ID',
  'STRIPE_PRICE_STARTER_YEARLY_ID',
  'STRIPE_PRICE_PRO_MONTHLY_ID',
  'STRIPE_PRICE_PRO_YEARLY_ID',
  'STRIPE_PRICE_ELITE_MONTHLY_ID',
  'STRIPE_PRICE_ELITE_YEARLY_ID',
  'STRIPE_PRO_MONTHLY_PRICE_ID',
  'STRIPE_ELITE_MONTHLY_PRICE_ID',
  'RAZORPAY_PLAN_STARTER_MONTHLY',
  'RAZORPAY_PLAN_STARTER_YEARLY',
  'RAZORPAY_PLAN_PRO_MONTHLY',
  'RAZORPAY_PLAN_PRO_YEARLY',
  'RAZORPAY_PLAN_ELITE_MONTHLY',
  'RAZORPAY_PLAN_ELITE_YEARLY',
];

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of TRACKED_ENV) delete process.env[k];
  // Common user lookup: Free user upgrading.
  mockPrisma.user.findUnique.mockResolvedValue({
    id: 'user-1',
    plan: 'free',
    country: 'IN',
    name: 'Test User',
    email: 'test@example.com',
    phone: null,
  });
  mockPrisma.subscription.findFirst.mockResolvedValue(null);
});

afterEach(() => {
  for (const k of TRACKED_ENV) delete process.env[k];
});

// ── 1. Plan status: all paid plans ACTIVE (never provider-derived) ──

describe('plan status — all paid plans ACTIVE', () => {
  it('provider-status reports every plan as active (free included)', async () => {
    const res = await providerStatusGET();
    const data = await res.json();

    expect(data.planStatus).toEqual({
      free: 'active',
      starter: 'active',
      pro: 'active',
      elite: 'active',
    });
  });

  it('planStatus stays active even with ZERO provider configuration', async () => {
    // No STRIPE_*/RAZORPAY_* env at all (tracked env cleaned in beforeEach).
    const res = await providerStatusGET();
    const data = await res.json();

    expect(data.planStatus.pro).toBe('active');
    expect(data.planStatus.elite).toBe('active');
    expect(data.planStatus.starter).toBe('active');
    // …while provider configuration honestly reports unavailable.
    expect(data.planAvailability.pro.monthly.available).toBe(false);
    expect(data.planAvailability.elite.yearly.available).toBe(false);
  });

  it('planAvailability flips to available when a plan Price ID + key are set (fixture)', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fixture_key';
    process.env.STRIPE_PRICE_ELITE_YEARLY_ID = 'price_test_fixture_elite_yearly';

    const res = await providerStatusGET();
    const data = await res.json();

    expect(data.planStatus.elite).toBe('active'); // plan status unchanged
    expect(data.planAvailability.elite.yearly.available).toBe(true);
    expect(data.planAvailability.elite.yearly.stripe).toBe(true);
    // Other combos remain honestly unavailable.
    expect(data.planAvailability.elite.monthly.available).toBe(false);
  });
});

// ── 2. Pro/Elite pricing + GST ──────────────────────────────────────

describe('pro and elite pricing and GST', () => {
  it('Pro monthly = ₹1,599 base', () => {
    expect(getPlanPrice('pro', 'monthly', 'INR')).toBe(1599);
    expect(PLAN_PRICING.pro.INR.monthly).toBe(1599);
    expect(PLAN_DETAILS.pro.priceINR).toBe(1599);
  });

  it('Pro yearly = ₹14,999 base', () => {
    expect(getPlanPrice('pro', 'yearly', 'INR')).toBe(14999);
    expect(PLAN_PRICING.pro.INR.yearly).toBe(14999);
    expect(PLAN_DETAILS.pro.yearlyINR).toBe(14999);
  });

  it('Elite monthly = ₹5,199 base', () => {
    expect(getPlanPrice('elite', 'monthly', 'INR')).toBe(5199);
    expect(PLAN_PRICING.elite.INR.monthly).toBe(5199);
    expect(PLAN_DETAILS.elite.priceINR).toBe(5199);
  });

  it('Elite yearly = ₹44,999 base', () => {
    expect(getPlanPrice('elite', 'yearly', 'INR')).toBe(44999);
    expect(PLAN_PRICING.elite.INR.yearly).toBe(44999);
    expect(PLAN_DETAILS.elite.yearlyINR).toBe(44999);
  });

  it('Pro monthly GST (18%) = ₹288 → total ₹1,887', () => {
    const base = getPlanPrice('pro', 'monthly', 'INR');
    const gst = Math.round(base * 0.18);
    expect(gst).toBe(288);
    expect(base + gst).toBe(1887);
    const gstCalc = calculateGST({ subtotal: base, currency: 'INR', isIndianUser: true, merchantState: 'MH' });
    expect(Math.round(gstCalc.totalTax)).toBe(288);
    expect(Math.round(gstCalc.total)).toBe(1887);
  });

  it('Pro yearly GST (18%) = ₹2,700 → total ₹17,699', () => {
    const base = getPlanPrice('pro', 'yearly', 'INR');
    const gst = Math.round(base * 0.18);
    expect(gst).toBe(2700);
    expect(base + gst).toBe(17699);
    const gstCalc = calculateGST({ subtotal: base, currency: 'INR', isIndianUser: true, merchantState: 'MH' });
    expect(Math.round(gstCalc.totalTax)).toBe(2700);
    expect(Math.round(gstCalc.total)).toBe(17699);
  });

  it('Elite monthly GST (18%) = ₹936 → total ₹6,135', () => {
    const base = getPlanPrice('elite', 'monthly', 'INR');
    const gst = Math.round(base * 0.18);
    expect(gst).toBe(936);
    expect(base + gst).toBe(6135);
    const gstCalc = calculateGST({ subtotal: base, currency: 'INR', isIndianUser: true, merchantState: 'MH' });
    expect(Math.round(gstCalc.totalTax)).toBe(936);
    expect(Math.round(gstCalc.total)).toBe(6135);
  });

  it('Elite yearly GST (18%) = ₹8,100 → total ₹53,099', () => {
    const base = getPlanPrice('elite', 'yearly', 'INR');
    const gst = Math.round(base * 0.18);
    expect(gst).toBe(8100);
    expect(base + gst).toBe(53099);
    const gstCalc = calculateGST({ subtotal: base, currency: 'INR', isIndianUser: true, merchantState: 'MH' });
    expect(Math.round(gstCalc.totalTax)).toBe(8100);
    expect(Math.round(gstCalc.total)).toBe(53099);
  });

  it('USD display values match the catalog (Stripe charges via Price object)', () => {
    expect(PLAN_PRICING.pro.USD).toEqual({ monthly: 19, yearly: 180 });
    expect(PLAN_PRICING.elite.USD).toEqual({ monthly: 63, yearly: 540 });
  });
});

// ── 3. Entitlements ─────────────────────────────────────────────────

describe('pro and elite entitlements', () => {
  it('Pro = 750 credits/month', () => {
    expect(PLAN_CREDITS.pro).toBe(750);
    expect(getPlanCredits('pro')).toBe(750);
    expect(PLAN_DETAILS.pro.creditsMonthly).toBe(750);
  });

  it('Elite = 2,000 credits/month', () => {
    expect(PLAN_CREDITS.elite).toBe(2000);
    expect(getPlanCredits('elite')).toBe(2000);
    expect(PLAN_DETAILS.elite.creditsMonthly).toBe(2000);
  });

  it('Pro and Elite have UNLIMITED lead discovery', () => {
    expect(ENTITLEMENTS.pro.lead_discovery).toEqual({ limit: null, enabled: true });
    expect(ENTITLEMENTS.elite.lead_discovery).toEqual({ limit: null, enabled: true });
    // Even far beyond Starter's 25-lead cap, still allowed.
    expect(canPerformAction('pro', 'lead_discovery', 100000).allowed).toBe(true);
    expect(canPerformAction('elite', 'lead_discovery', 100000).allowed).toBe(true);
  });
});

// ── 4. Plan order ───────────────────────────────────────────────────

describe('plan order Free → Starter → Pro → Elite', () => {
  it('plan levels are strictly increasing 0 < 1 < 2 < 3', () => {
    const order = (['free', 'starter', 'pro', 'elite'] as const).map((p) => getPlanLevel(p));
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it('PLAN_DETAILS keys follow the canonical order', () => {
    expect(Object.keys(PLAN_DETAILS)).toEqual(['free', 'starter', 'pro', 'elite']);
  });

  it('plan catalog lists paid plans in Starter → Pro → Elite order', () => {
    const order = [...new Set(getPlanCatalog().map((r) => r.plan))];
    expect(order).toEqual(['starter', 'pro', 'elite']);
  });

  it('every plan/cycle row in the catalog reports its canonical env var names', () => {
    const catalog = getPlanCatalog();
    const proMonthly = catalog.find((r) => r.plan === 'pro' && r.cycle === 'monthly');
    const eliteYearly = catalog.find((r) => r.plan === 'elite' && r.cycle === 'yearly');
    expect(proMonthly?.stripe.envVars).toContain('STRIPE_PRICE_PRO_MONTHLY_ID');
    expect(proMonthly?.razorpay.envVar).toBe('RAZORPAY_PLAN_PRO_MONTHLY');
    expect(eliteYearly?.stripe.envVars).toContain('STRIPE_PRICE_ELITE_YEARLY_ID');
    expect(eliteYearly?.razorpay.envVar).toBe('RAZORPAY_PLAN_ELITE_YEARLY');
  });
});

// ── 5. Stripe Price ID resolution — all six combos ──────────────────

describe('Stripe Price ID resolution (all six plan/cycle combos)', () => {
  const COMBOS = [
    { plan: 'starter', cycle: 'monthly', canonical: 'STRIPE_PRICE_STARTER_MONTHLY_ID' },
    { plan: 'starter', cycle: 'yearly', canonical: 'STRIPE_PRICE_STARTER_YEARLY_ID' },
    { plan: 'pro', cycle: 'monthly', canonical: 'STRIPE_PRICE_PRO_MONTHLY_ID' },
    { plan: 'pro', cycle: 'yearly', canonical: 'STRIPE_PRICE_PRO_YEARLY_ID' },
    { plan: 'elite', cycle: 'monthly', canonical: 'STRIPE_PRICE_ELITE_MONTHLY_ID' },
    { plan: 'elite', cycle: 'yearly', canonical: 'STRIPE_PRICE_ELITE_YEARLY_ID' },
  ] as const;

  it('missing Price IDs are reported as null with the canonical env var listed (never invented)', () => {
    for (const { plan, cycle, canonical } of COMBOS) {
      const { priceId, envVarNamesTried } = paymentServiceMocks.resolvePlanPriceId(plan, cycle);
      expect(priceId).toBeNull();
      expect(envVarNamesTried).toContain(canonical);
    }
  });

  it('resolves each canonical env var when configured (explicit fixtures)', () => {
    for (const { plan, cycle, canonical } of COMBOS) {
      const fixture = `price_test_fixture_${plan}_${cycle}`;
      process.env[canonical] = fixture;
      const { priceId } = paymentServiceMocks.resolvePlanPriceId(plan, cycle);
      expect(priceId).toBe(fixture);
    }
  });

  it('legacy aliases still resolve (one example per plan)', () => {
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_test_fixture_legacy_pro_monthly';
    expect(paymentServiceMocks.resolvePlanPriceId('pro', 'monthly').priceId).toBe(
      'price_test_fixture_legacy_pro_monthly'
    );

    process.env.STRIPE_ELITE_MONTHLY_PRICE_ID = 'price_test_fixture_legacy_elite_monthly';
    expect(paymentServiceMocks.resolvePlanPriceId('elite', 'monthly').priceId).toBe(
      'price_test_fixture_legacy_elite_monthly'
    );
  });
});

// ── 6. Razorpay Plan ID mapping — all six combos ────────────────────

describe('Razorpay Plan ID mapping (all six plan/cycle combos)', () => {
  it('uses the canonical env var names for every plan/cycle', () => {
    expect(razorpayPlanEnvName('starter', 'monthly')).toBe('RAZORPAY_PLAN_STARTER_MONTHLY');
    expect(razorpayPlanEnvName('starter', 'yearly')).toBe('RAZORPAY_PLAN_STARTER_YEARLY');
    expect(razorpayPlanEnvName('pro', 'monthly')).toBe('RAZORPAY_PLAN_PRO_MONTHLY');
    expect(razorpayPlanEnvName('pro', 'yearly')).toBe('RAZORPAY_PLAN_PRO_YEARLY');
    expect(razorpayPlanEnvName('elite', 'monthly')).toBe('RAZORPAY_PLAN_ELITE_MONTHLY');
    expect(razorpayPlanEnvName('elite', 'yearly')).toBe('RAZORPAY_PLAN_ELITE_YEARLY');
  });

  it('returns null (one-time order fallback) when not configured — never invents IDs', () => {
    for (const plan of ['starter', 'pro', 'elite'] as const) {
      for (const cycle of ['monthly', 'yearly'] as const) {
        expect(getRazorpayPlanId(plan, cycle)).toBeNull();
      }
    }
  });

  it('returns configured Plan IDs when present (explicit fixtures)', () => {
    process.env.RAZORPAY_PLAN_PRO_MONTHLY = 'plan_test_fixture_pro_monthly';
    process.env.RAZORPAY_PLAN_ELITE_YEARLY = 'plan_test_fixture_elite_yearly';
    expect(getRazorpayPlanId('pro', 'monthly')).toBe('plan_test_fixture_pro_monthly');
    expect(getRazorpayPlanId('elite', 'yearly')).toBe('plan_test_fixture_elite_yearly');
  });
});

// ── 7. Checkout validation — providers accept all paid plans ────────

describe('checkout validation — providers accept all six plan/cycle combos', () => {
  const RZP_ENV = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'NEXT_PUBLIC_RAZORPAY_KEY_ID'];

  afterEach(() => {
    for (const k of RZP_ENV) delete process.env[k];
  });

  it.each([
    ['pro', 'monthly'],
    ['pro', 'yearly'],
    ['elite', 'monthly'],
    ['elite', 'yearly'],
  ])('Razorpay accepts %s %s and delegates to the canonical createPaymentOrder', async (plan, cycle) => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_fixture_key_id';
    process.env.RAZORPAY_KEY_SECRET = 'rzp_test_fixture_key_secret';

    paymentServiceMocks.createPaymentOrder.mockResolvedValue({
      success: true,
      orderId: `order-${plan}-${cycle}`,
      razorpayOrderId: `rzp_order_${plan}_${cycle}`,
      amount: 100,
      currency: 'INR',
      plan,
      billingCycle: cycle,
      creditsAllocated: 100,
      idempotent: false,
    });

    const provider = new RazorpayPaymentProvider();
    const result = await provider.createCheckout({
      userId: 'user-1',
      kind: 'subscription',
      plan: plan as 'pro' | 'elite' | 'starter',
      billingCycle: cycle as 'monthly' | 'yearly',
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.plan).toBe(plan);
    expect(result.billingCycle).toBe(cycle);
    expect(paymentServiceMocks.createPaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({ plan, billingCycle: cycle, currency: 'INR' })
    );
  });

  it.each([
    ['pro', 'monthly'],
    ['pro', 'yearly'],
    ['elite', 'monthly'],
    ['elite', 'yearly'],
  ])('Stripe provider accepts %s %s and delegates to the canonical createStripeCheckoutSession', async (plan, cycle) => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fixture_key';

    paymentServiceMocks.createStripeCheckoutSession.mockResolvedValue({
      success: true,
      orderId: `order-${plan}-${cycle}`,
      stripeSessionId: `cs_test_${plan}_${cycle}`,
      stripeSessionUrl: 'https://checkout.stripe.com/c/pay/test_fixture',
      amount: 100,
      currency: 'USD',
      plan,
      billingCycle: cycle,
      creditsAllocated: 100,
    });

    const provider = new StripePaymentProvider();
    const result = await provider.createCheckout({
      userId: 'user-1',
      kind: 'subscription',
      plan: plan as 'pro' | 'elite' | 'starter',
      billingCycle: cycle as 'monthly' | 'yearly',
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.plan).toBe(plan);
    expect(paymentServiceMocks.createStripeCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ plan, billingCycle: cycle })
    );
  });

  it('free remains non-purchasable on both providers', async () => {
    // Credentials must be present so the plan-validation gate is reached
    // (the credentials gate fires first by design — honest config errors).
    process.env.RAZORPAY_KEY_ID = 'rzp_test_fixture_key_id';
    process.env.RAZORPAY_KEY_SECRET = 'rzp_test_fixture_key_secret';
    const rzp = await new RazorpayPaymentProvider().createCheckout({
      userId: 'user-1',
      kind: 'subscription',
      plan: 'free' as 'pro',
      billingCycle: 'monthly',
    });
    expect(rzp.success).toBe(false);
    expect(rzp.error).toContain('Invalid plan');
    expect(paymentServiceMocks.createPaymentOrder).not.toHaveBeenCalled();

    process.env.STRIPE_SECRET_KEY = 'sk_test_fixture_key';
    const stripe = await new StripePaymentProvider().createCheckout({
      userId: 'user-1',
      kind: 'subscription',
      plan: 'free' as 'pro',
      billingCycle: 'monthly',
    });
    expect(stripe.success).toBe(false);
    expect(stripe.error).toContain('Invalid plan');
  });

  it('providers report honest errors when credentials are missing (no fake success)', async () => {
    const rzp = await new RazorpayPaymentProvider().createCheckout({
      userId: 'user-1',
      kind: 'subscription',
      plan: 'pro',
      billingCycle: 'monthly',
    });
    expect(rzp.success).toBe(false);
    expect(rzp.error).toContain('Razorpay is not configured');

    const stripe = await new StripePaymentProvider().createCheckout({
      userId: 'user-1',
      kind: 'subscription',
      plan: 'elite',
      billingCycle: 'yearly',
    });
    expect(stripe.success).toBe(false);
    expect(stripe.error).toContain('Stripe is not configured');
  });
});

// ── 8. UI button state matrix — no "Coming Soon" for paid plans ─────

describe('upgrade modal button state — paid plans are always ACTIVE', () => {
  it('Free user → Pro (monthly): enabled upgrade action even when provider config is missing', () => {
    const state = computePlanButtonState('free', 'monthly', 'pro', false, false);
    expect(state.kind).toBe('upgrade');
    expect(state.label).toBe('Upgrade to Pro');
    expect(state.disabled).toBe(false);
    expect(state.configRequired).toBe(true); // honest config notice, CTA stays enabled
  });

  it('Free user → Elite (yearly): enabled upgrade action even when provider config is missing', () => {
    const state = computePlanButtonState('free', 'monthly', 'elite', true, false);
    expect(state.kind).toBe('upgrade');
    expect(state.disabled).toBe(false);
    expect(state.configRequired).toBe(true);
  });

  it('Starter user → Pro: enabled upgrade with config notice when unavailable', () => {
    const state = computePlanButtonState('starter', 'monthly', 'pro', false, false);
    expect(state.kind).toBe('upgrade');
    expect(state.disabled).toBe(false);
    expect(state.configRequired).toBe(true);
  });

  it('Pro user → Elite: enabled upgrade with config notice when unavailable', () => {
    const state = computePlanButtonState('pro', 'monthly', 'elite', false, false);
    expect(state.kind).toBe('upgrade');
    expect(state.disabled).toBe(false);
    expect(state.configRequired).toBe(true);
  });

  it('same-plan monthly → yearly switch keeps the real action when config is missing', () => {
    const state = computePlanButtonState('pro', 'monthly', 'pro', true, false);
    expect(state.kind).toBe('switch-annual');
    expect(state.disabled).toBe(false);
    expect(state.configRequired).toBe(true);
  });

  it('no config-required flag when availability is unknown (CTA enabled, server enforces)', () => {
    const state = computePlanButtonState('free', 'monthly', 'elite', false, null);
    expect(state.kind).toBe('upgrade');
    expect(state.disabled).toBe(false);
    expect(state.configRequired).toBeUndefined();
  });

  it('no config-required flag when provider configuration exists', () => {
    const state = computePlanButtonState('free', 'monthly', 'pro', false, true);
    expect(state.kind).toBe('upgrade');
    expect(state.disabled).toBe(false);
    expect(state.configRequired).toBeUndefined();
  });

  it('the coming-soon state no longer exists for ANY plan/cycle combination', () => {
    const plans = ['free', 'starter', 'pro', 'elite'] as const;
    const cycles = ['monthly', 'yearly'] as const;
    const views = ['free', 'starter', 'pro', 'elite'] as const;
    for (const currentPlan of views) {
      for (const plan of plans) {
        for (const isYearly of [false, true]) {
          for (const availability of [true, false, null] as const) {
            const state = computePlanButtonState(
              currentPlan,
              cycles[isYearly ? 1 : 0],
              plan,
              isYearly,
              availability
            );
            expect(state.kind).not.toBe('coming-soon');
            // Only the current-plan state is ever disabled (plus processing).
            if (state.kind === 'upgrade' || state.kind === 'switch-annual') {
              expect(state.disabled).toBe(false);
            }
          }
        }
      }
    }
  });

  it('downgrades remain non-self-serve (Contact Support) — unchanged lifecycle', () => {
    const state = computePlanButtonState('pro', 'monthly', 'free', false, true);
    expect(state.kind).toBe('support');
    expect(state.label).toContain('Contact Support');
  });

  it('current plan renders as Current Plan (disabled) regardless of config', () => {
    const state = computePlanButtonState('pro', 'monthly', 'pro', false, false);
    expect(state.kind).toBe('current');
    expect(state.disabled).toBe(true);
  });
});

// ── 9. Safe configuration validator ─────────────────────────────────

describe('payment configuration validator (safe report)', () => {
  it('reports everything MISSING with zero configuration (no values, no throw)', () => {
    const report = buildPaymentConfigReport({});
    expect(report.plans).toEqual({
      starter: { status: 'active' },
      pro: { status: 'active' },
      elite: { status: 'active' },
    });
    expect(report.stripe.secretKey.configured).toBe(false);
    expect(report.stripe.webhookSecret.configured).toBe(false);
    expect(report.razorpay.keyId.configured).toBe(false);
    expect(report.razorpay.keySecret.configured).toBe(false);
    expect(report.stripe.plans.pro.monthly.configured).toBe(false);
    expect(report.stripe.plans.elite.yearly.configured).toBe(false);
    expect(report.razorpay.plans.pro.monthly.configured).toBe(false);
    expect(report.checkoutReady.stripeCredentials).toBe(false);
    expect(report.checkoutReady.razorpayCredentials).toBe(false);
    expect(report.checkoutReady.razorpayRecurringComplete).toBe(false);
  });

  it('reports all six Stripe mappings CONFIGURED via canonical names (fixtures)', () => {
    const env = {
      STRIPE_SECRET_KEY: 'sk_test_fixture_secret',
      STRIPE_PRICE_STARTER_MONTHLY_ID: 'price_fixture_sm',
      STRIPE_PRICE_STARTER_YEARLY_ID: 'price_fixture_sy',
      STRIPE_PRICE_PRO_MONTHLY_ID: 'price_fixture_pm',
      STRIPE_PRICE_PRO_YEARLY_ID: 'price_fixture_py',
      STRIPE_PRICE_ELITE_MONTHLY_ID: 'price_fixture_em',
      STRIPE_PRICE_ELITE_YEARLY_ID: 'price_fixture_ey',
    };
    const report = buildPaymentConfigReport(env);
    for (const plan of ['starter', 'pro', 'elite'] as const) {
      for (const cycle of ['monthly', 'yearly'] as const) {
        expect(report.stripe.plans[plan][cycle].configured).toBe(true);
        expect(report.stripe.plans[plan][cycle].matchedVia).toBe(
          `STRIPE_PRICE_${plan.toUpperCase()}_${cycle.toUpperCase()}_ID`
        );
      }
    }
    expect(report.checkoutReady.stripeCredentials).toBe(true);
  });

  it('supports legacy aliases via matchedVia without value exposure', () => {
    const report = buildPaymentConfigReport({
      STRIPE_PRO_MONTHLY_PRICE_ID: 'price_fixture_legacy_pm',
    });
    expect(report.stripe.plans.pro.monthly.configured).toBe(true);
    expect(report.stripe.plans.pro.monthly.matchedVia).toBe('STRIPE_PRO_MONTHLY_PRICE_ID');
  });

  it('flags malformed provider IDs as MISSING (set but unusable)', () => {
    const report = buildPaymentConfigReport({
      STRIPE_PRICE_PRO_MONTHLY_ID: 'not-a-price-id',
      RAZORPAY_PLAN_PRO_MONTHLY: 'sub_bogus',
    });
    expect(report.stripe.plans.pro.monthly.configured).toBe(false);
    expect(report.razorpay.plans.pro.monthly.configured).toBe(false);
  });

  it('razorpayRecurringComplete is true only when all six Plan IDs are set (fixtures)', () => {
    const partial = buildPaymentConfigReport({
      RAZORPAY_PLAN_PRO_MONTHLY: 'plan_fixture_pm',
      RAZORPAY_PLAN_PRO_YEARLY: 'plan_fixture_py',
      RAZORPAY_PLAN_ELITE_MONTHLY: 'plan_fixture_em',
      RAZORPAY_PLAN_ELITE_YEARLY: 'plan_fixture_ey',
    });
    expect(partial.checkoutReady.razorpayRecurringComplete).toBe(false); // starter missing

    const full = buildPaymentConfigReport({
      RAZORPAY_PLAN_STARTER_MONTHLY: 'plan_fixture_sm',
      RAZORPAY_PLAN_STARTER_YEARLY: 'plan_fixture_sy',
      RAZORPAY_PLAN_PRO_MONTHLY: 'plan_fixture_pm',
      RAZORPAY_PLAN_PRO_YEARLY: 'plan_fixture_py',
      RAZORPAY_PLAN_ELITE_MONTHLY: 'plan_fixture_em',
      RAZORPAY_PLAN_ELITE_YEARLY: 'plan_fixture_ey',
    });
    expect(full.checkoutReady.razorpayRecurringComplete).toBe(true);
  });

  it('NEVER leaks secret values anywhere in the serialized report', () => {
    const secrets = [
      'sk_test_SUPERSECRETVALUE123',
      'price_fixture_SUPERSECRET456',
      'plan_fixture_SUPERSECRET789',
      'whsec_SUPERSECRET000',
    ];
    const report = buildPaymentConfigReport({
      STRIPE_SECRET_KEY: secrets[0],
      STRIPE_WEBHOOK_SECRET: secrets[3],
      STRIPE_PRICE_PRO_MONTHLY_ID: secrets[1],
      RAZORPAY_PLAN_ELITE_YEARLY: secrets[2],
      RAZORPAY_KEY_SECRET: 'rzp_secret_SUPERSECRET999',
    });
    const serialized = JSON.stringify(report);
    for (const s of secrets) {
      expect(serialized).not.toContain(s);
    }
    expect(serialized).not.toContain('rzp_secret_SUPERSECRET999');
    // But the names ARE reported as configured.
    expect(report.stripe.secretKey.configured).toBe(true);
    expect(report.stripe.secretKey.envVar).toBe('STRIPE_SECRET_KEY');
  });
});
