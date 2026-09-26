// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Starter checkout acceptance (providers, Sep 2026)
//
// Regression lock for the Starter finalization:
//   • RazorpayPaymentProvider.createCheckout must ACCEPT plan='starter'
//     (it previously rejected Starter with "Only Pro and Elite plans
//     require payment") for BOTH monthly and yearly cycles.
//   • StripePaymentProvider.createCheckout must ACCEPT plan='starter'.
//   • Starter rides the SAME canonical checkout paths — no second
//     payment architecture — verified by asserting the provider
//     delegates to createPaymentOrder / createStripeCheckoutSession
//     with the plan + billing cycle intact.
//   • Provider configuration gaps are reported honestly (never a fake
//     payment success).
//
// All gateway IDs used here are explicit test fixtures and can never
// reach a real provider: the SDK/network layers are fully mocked.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mock for @/lib/payment-service ─────────────────────────
const paymentServiceMocks = vi.hoisted(() => ({
  createPaymentOrder: vi.fn(),
  createStripeCheckoutSession: vi.fn(),
  createStripeCreditAddonCheckoutSession: vi.fn(),
  getRazorpayClient: vi.fn(),
  recordWebhookEvent: vi.fn(),
  markWebhookProcessed: vi.fn(),
  // Same env-driven contract as the real implementation.
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

// ── Hoisted mock for @/lib/db ──────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  subscription: { findFirst: vi.fn() },
  paymentOrder: { create: vi.fn(), update: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ db: mockPrisma }));

// ── Remaining side-effect modules used by the providers ────────────
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

import { RazorpayPaymentProvider } from '@/lib/payments/razorpay-provider';
import { StripePaymentProvider } from '@/lib/payments/stripe-provider';

const RAZORPAY_ENV = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'NEXT_PUBLIC_RAZORPAY_KEY_ID'];
const STRIPE_ENV = ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_STARTER_MONTHLY_ID', 'STRIPE_PRICE_STARTER_YEARLY_ID'];

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of [...RAZORPAY_ENV, ...STRIPE_ENV]) delete process.env[k];
  // Common user lookup: Free user upgrading to Starter.
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
  for (const k of [...RAZORPAY_ENV, ...STRIPE_ENV]) delete process.env[k];
});

// ── Razorpay accepts Starter ───────────────────────────────────────

describe('razorpay provider — starter checkout', () => {
  beforeEach(() => {
    // Fixture keys — the Razorpay SDK itself is never invoked on the
    // one-time-order path (createPaymentOrder is mocked).
    process.env.RAZORPAY_KEY_ID = 'rzp_test_fixture_key_id';
    process.env.RAZORPAY_KEY_SECRET = 'rzp_test_fixture_key_secret';
  });

  it('accepts starter monthly and delegates to the canonical createPaymentOrder', async () => {
    paymentServiceMocks.createPaymentOrder.mockResolvedValue({
      success: true,
      orderId: 'order-starter-m-1',
      razorpayOrderId: 'rzp_order_starter_m_1',
      amount: 589,
      currency: 'INR',
      plan: 'starter',
      billingCycle: 'monthly',
      creditsAllocated: 150,
      idempotent: false,
    });

    const provider = new RazorpayPaymentProvider();
    const result = await provider.createCheckout({
      userId: 'user-1',
      kind: 'subscription',
      plan: 'starter',
      billingCycle: 'monthly',
    });

    // The old bug: this used to fail with "Invalid plan. Only Pro and
    // Elite plans require payment."
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.plan).toBe('starter');
    expect(result.billingCycle).toBe('monthly');

    expect(paymentServiceMocks.createPaymentOrder).toHaveBeenCalledTimes(1);
    expect(paymentServiceMocks.createPaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'starter', billingCycle: 'monthly', currency: 'INR' })
    );
  });

  it('accepts starter yearly and delegates to the canonical createPaymentOrder', async () => {
    paymentServiceMocks.createPaymentOrder.mockResolvedValue({
      success: true,
      orderId: 'order-starter-y-1',
      razorpayOrderId: 'rzp_order_starter_y_1',
      amount: 5899,
      currency: 'INR',
      plan: 'starter',
      billingCycle: 'yearly',
      creditsAllocated: 150,
      idempotent: false,
    });

    const provider = new RazorpayPaymentProvider();
    const result = await provider.createCheckout({
      userId: 'user-1',
      kind: 'subscription',
      plan: 'starter',
      billingCycle: 'yearly',
    });

    expect(result.success).toBe(true);
    expect(result.plan).toBe('starter');
    expect(result.billingCycle).toBe('yearly');
    expect(paymentServiceMocks.createPaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'starter', billingCycle: 'yearly' })
    );
  });

  it('still rejects genuinely invalid plans (free is not purchasable)', async () => {
    const provider = new RazorpayPaymentProvider();
    const result = await provider.createCheckout({
      userId: 'user-1',
      kind: 'subscription',
      plan: 'free' as 'starter',
      billingCycle: 'monthly',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid plan');
    expect(paymentServiceMocks.createPaymentOrder).not.toHaveBeenCalled();
  });

  it('honest error when Razorpay keys are not configured', async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;

    const provider = new RazorpayPaymentProvider();
    const result = await provider.createCheckout({
      userId: 'user-1',
      kind: 'subscription',
      plan: 'starter',
      billingCycle: 'monthly',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Razorpay is not configured');
    expect(paymentServiceMocks.createPaymentOrder).not.toHaveBeenCalled();
  });
});

// ── Stripe accepts Starter ─────────────────────────────────────────

describe('stripe provider — starter checkout', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fixture_secret_key';
  });

  it('accepts starter monthly and delegates to the canonical createStripeCheckoutSession', async () => {
    paymentServiceMocks.createStripeCheckoutSession.mockResolvedValue({
      success: true,
      orderId: 'order-stripe-starter-m-1',
      stripeSessionId: 'cs_test_starter_m',
      stripeSessionUrl: 'https://checkout.stripe.com/c/pay/cs_test_starter_m',
      amount: 6,
      currency: 'USD',
      plan: 'starter',
      billingCycle: 'monthly',
      creditsAllocated: 150,
    });

    const provider = new StripePaymentProvider();
    const result = await provider.createCheckout({
      userId: 'user-1',
      kind: 'subscription',
      plan: 'starter',
      billingCycle: 'monthly',
    });

    expect(result.success).toBe(true);
    expect(result.plan).toBe('starter');
    expect(result.checkoutUrl).toContain('cs_test_starter_m');
    expect(paymentServiceMocks.createStripeCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'starter', billingCycle: 'monthly' })
    );
  });

  it('accepts starter yearly and delegates to the canonical createStripeCheckoutSession', async () => {
    paymentServiceMocks.createStripeCheckoutSession.mockResolvedValue({
      success: true,
      orderId: 'order-stripe-starter-y-1',
      stripeSessionId: 'cs_test_starter_y',
      stripeSessionUrl: 'https://checkout.stripe.com/c/pay/cs_test_starter_y',
      amount: 60,
      currency: 'USD',
      plan: 'starter',
      billingCycle: 'yearly',
      creditsAllocated: 150,
    });

    const provider = new StripePaymentProvider();
    const result = await provider.createCheckout({
      userId: 'user-1',
      kind: 'subscription',
      plan: 'starter',
      billingCycle: 'yearly',
    });

    expect(result.success).toBe(true);
    expect(result.plan).toBe('starter');
    expect(result.billingCycle).toBe('yearly');
    expect(paymentServiceMocks.createStripeCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'starter', billingCycle: 'yearly' })
    );
  });

  it('honest error when Stripe Price ID is missing (no invented IDs, no fake success)', async () => {
    // No STRIPE_PRICE_STARTER_*_ID configured → the underlying service
    // reports the missing configuration; the provider surfaces it.
    paymentServiceMocks.createStripeCheckoutSession.mockResolvedValue({
      success: false,
      amount: 0,
      currency: 'USD',
      subtotal: 0,
      discountAmount: 0,
      taxAmount: 0,
      gstRate: 0,
      plan: 'starter',
      billingCycle: 'monthly',
      creditsAllocated: 0,
      error:
        'Stripe price ID for starter (monthly) is not configured. Set one of: STRIPE_PRICE_STARTER_MONTHLY_ID in your environment.',
    });

    const provider = new StripePaymentProvider();
    const result = await provider.createCheckout({
      userId: 'user-1',
      kind: 'subscription',
      plan: 'starter',
      billingCycle: 'monthly',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('STRIPE_PRICE_STARTER_MONTHLY_ID');
  });

  it('canCheckout reflects a configured Price ID (explicit test fixture)', () => {
    process.env.STRIPE_PRICE_STARTER_MONTHLY_ID = 'price_test_fixture_starter_monthly';
    const provider = new StripePaymentProvider();
    expect(provider.canCheckout('starter', 'monthly')).toBe(true);
    // Cycle without a configured Price ID → not purchasable via Stripe.
    expect(provider.canCheckout('starter', 'yearly')).toBe(false);
  });
});
