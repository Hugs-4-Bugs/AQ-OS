// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Unit Tests: Payment Gateway Abstraction (Stripe+Razorpay)
//
// Covers:
//   1. Central plan mapping (plan-config) — prices, credits, env mappings
//   2. Razorpay signature verification (HMAC-SHA256, constant-time)
//   3. Provider registry — availability, mode detection, currencies
//   4. RazorpayPaymentProvider.verifyPayment — auth, idempotency,
//      signature rejection paths (server-side verification contract)
//   5. Razorpay webhook signature verification
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

// ─── Mock db (same pattern as billing.test.ts) ────────────────────────
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    subscription: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn(), count: vi.fn() },
    creditsLedger: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
    paymentOrder: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    paymentWebhook: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn(), count: vi.fn() },
    workflowDefinition: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    invoice: { findUnique: vi.fn(), create: vi.fn(), count: vi.fn(), upsert: vi.fn() },
    notification: { create: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    creditAddon: { findMany: vi.fn(), create: vi.fn() },
    coupon: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    $transaction: vi.fn((fn: any) => (typeof fn === 'function' ? fn(mokedTx) : fn)),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $disconnect: vi.fn(),
  },
}));

// A pass-through "transaction client" — same shape as db for tests that
// call $transaction(async (tx) => ...).
const mokedTx = new Proxy({}, {
  get(_t, prop) {
    if (prop === '$transaction') return vi.fn((fn: any) => (typeof fn === 'function' ? fn(mokedTx) : fn));
    return (undefined as unknown) as never;
  },
}) as never as Record<string, never>;

// Mock audit logging (never touch real AuditLog in tests)
vi.mock('@/lib/billing-audit', () => ({
  logPaymentEvent: vi.fn(),
  logSubscriptionEvent: vi.fn(),
  logCreditEvent: vi.fn(),
  logBillingEvent: vi.fn(),
  logCouponEvent: vi.fn(),
}));

import { db } from '@/lib/db';
import {
  PLAN_PRICING,
  getPlanPrice,
  getPlanCredits,
  getRazorpayPlanId,
  razorpayPlanEnvName,
  getPlanGatewayAvailability,
  getCreditAddonGatewayAvailability,
  getStripePriceId,
} from '@/lib/payments/plan-config';
import { verifyPaymentSignature } from '@/lib/razorpay-service';
import { verifyRazorpayWebhookSignature } from '@/lib/payment-service';
import { StripePaymentProvider } from '@/lib/payments/stripe-provider';
import { RazorpayPaymentProvider } from '@/lib/payments/razorpay-provider';
import { PLAN_CREDITS } from '@/lib/entitlement-service';

const mockedDb = db as unknown as {
  paymentOrder: { findUnique: ReturnType<typeof vi.fn> };
};

// ─── Env helpers ──────────────────────────────────────────────────────
const ENV_SNAPSHOT = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  // Restore env so gateway tests don't leak configuration between cases
  process.env = { ...ENV_SNAPSHOT };
});

// ═════════════════════════════════════════════════════════════════════
// 1. Central plan mapping
// ═════════════════════════════════════════════════════════════════════
describe('plan-config: central plan ↔ gateway mapping', () => {
  it('exposes the canonical pricing table (₹1,599/₹11,999 Pro, ₹5,199/₹37,999 Elite)', () => {
    expect(PLAN_PRICING.pro.INR).toEqual({ monthly: 1599, yearly: 11999 });
    expect(PLAN_PRICING.elite.INR).toEqual({ monthly: 5199, yearly: 37999 });
    expect(PLAN_PRICING.pro.USD).toEqual({ monthly: 19, yearly: 144 });
    expect(PLAN_PRICING.elite.USD).toEqual({ monthly: 63, yearly: 456 });
  });

  it('returns authoritative amounts via getPlanPrice', () => {
    expect(getPlanPrice('pro', 'monthly', 'INR')).toBe(1599);
    expect(getPlanPrice('pro', 'yearly', 'INR')).toBe(11999);
    expect(getPlanPrice('elite', 'monthly', 'USD')).toBe(63);
    expect(getPlanPrice('free' as never, 'monthly', 'INR')).toBe(0);
  });

  it('delegates credits to the entitlement-service source of truth', () => {
    expect(getPlanCredits('pro')).toBe(PLAN_CREDITS.pro);
    expect(getPlanCredits('elite')).toBe(PLAN_CREDITS.elite);
    expect(getPlanCredits('free')).toBe(PLAN_CREDITS.free);
  });

  it('builds Razorpay plan env names deterministically', () => {
    expect(razorpayPlanEnvName('pro', 'monthly')).toBe('RAZORPAY_PLAN_PRO_MONTHLY');
    expect(razorpayPlanEnvName('elite', 'yearly')).toBe('RAZORPAY_PLAN_ELITE_YEARLY');
  });

  it('resolves Razorpay plan IDs only from valid plan_ env values', () => {
    process.env.RAZORPAY_PLAN_PRO_MONTHLY = 'plan_ABC123';
    expect(getRazorpayPlanId('pro', 'monthly')).toBe('plan_ABC123');

    process.env.RAZORPAY_PLAN_ELITE_YEARLY = 'not_a_plan_id';
    expect(getRazorpayPlanId('elite', 'yearly')).toBeNull();

    delete process.env.RAZORPAY_PLAN_PRO_MONTHLY;
    expect(getRazorpayPlanId('pro', 'monthly')).toBeNull();
  });

  it('resolves Stripe price IDs from env and reports availability', () => {
    delete process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_test123';
    expect(getStripePriceId('pro', 'monthly')).toBe('price_test123');

    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    expect(getPlanGatewayAvailability('pro', 'monthly')).toEqual({
      stripe: true,
      razorpay: false,
      razorpayRecurring: false,
    });

    process.env.STRIPE_ELITE_YEARLY_PRICE_ID = '';
    expect(getPlanGatewayAvailability('elite', 'yearly').stripe).toBe(false);
  });

  it('reports Razorpay recurring only when a plan id is mapped', () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
    process.env.RAZORPAY_KEY_SECRET = 'secret';
    process.env.RAZORPAY_PLAN_ELITE_MONTHLY = 'plan_E1';
    const availability = getPlanGatewayAvailability('elite', 'monthly');
    expect(availability.razorpay).toBe(true);
    expect(availability.razorpayRecurring).toBe(true);
  });

  it('advertises credit add-on gateways based on configuration', () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    const none = getCreditAddonGatewayAvailability();
    expect(none.stripe).toBe(false);
    expect(none.razorpay).toBe(false);

    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_PRICE_CREDITS_500_ID = 'price_c500';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
    process.env.RAZORPAY_KEY_SECRET = 'secret';
    const both = getCreditAddonGatewayAvailability();
    expect(both.stripe).toBe(true);
    expect(both.razorpay).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 2. Razorpay payment signature verification
// ═════════════════════════════════════════════════════════════════════
describe('razorpay-service: checkout payment signature verification', () => {
  const SECRET = 'test_razorpay_key_secret';

  beforeEach(() => {
    process.env.RAZORPAY_KEY_SECRET = SECRET;
  });

  it('accepts a correctly-computed HMAC(order_id|payment_id, secret)', () => {
    const signature = createHmac('sha256', SECRET).update('order_ABC|pay_XYZ').digest('hex');
    const result = verifyPaymentSignature({ orderId: 'order_ABC', paymentId: 'pay_XYZ', signature });
    expect(result.success).toBe(true);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const signature = createHmac('sha256', 'attacker_secret').update('order_ABC|pay_XYZ').digest('hex');
    const result = verifyPaymentSignature({ orderId: 'order_ABC', paymentId: 'pay_XYZ', signature });
    expect(result.success).toBe(false);
  });

  it('rejects a signature for tampered payment data', () => {
    const signature = createHmac('sha256', SECRET).update('order_ABC|pay_XYZ').digest('hex');
    // Attacker swaps the payment id after signing
    const result = verifyPaymentSignature({ orderId: 'order_ABC', paymentId: 'pay_other', signature });
    expect(result.success).toBe(false);
  });

  it('rejects missing parameters', () => {
    expect(verifyPaymentSignature({ orderId: '', paymentId: 'pay_XYZ', signature: 'x' }).success).toBe(false);
    expect(verifyPaymentSignature({ orderId: 'o', paymentId: '', signature: 'x' }).success).toBe(false);
    expect(verifyPaymentSignature({ orderId: 'o', paymentId: 'p', signature: '' }).success).toBe(false);
  });

  it('fails safely when RAZORPAY_KEY_SECRET is not configured', () => {
    delete process.env.RAZORPAY_KEY_SECRET;
    const signature = createHmac('sha256', 'anything').update('order|pay').digest('hex');
    const result = verifyPaymentSignature({ orderId: 'order', paymentId: 'pay', signature });
    expect(result.success).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 3. Razorpay webhook signature verification
// ═════════════════════════════════════════════════════════════════════
describe('payment-service: Razorpay webhook signature verification', () => {
  const WEBHOOK_SECRET = 'test_webhook_secret';

  it('accepts a valid HMAC of the raw body', () => {
    const body = JSON.stringify({ event: 'payment.captured' });
    const signature = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
    expect(verifyRazorpayWebhookSignature(body, signature, WEBHOOK_SECRET)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const body = JSON.stringify({ event: 'payment.captured' });
    expect(verifyRazorpayWebhookSignature(body, 'deadbeef', WEBHOOK_SECRET)).toBe(false);
  });

  it('rejects when the webhook secret is missing (fail closed)', () => {
    const body = JSON.stringify({ event: 'payment.captured' });
    expect(verifyRazorpayWebhookSignature(body, 'sig', undefined)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 4. Provider registry behavior
// ═════════════════════════════════════════════════════════════════════
describe('providers: availability and mode detection', () => {
  it('Stripe provider reports test/live mode from the key prefix', () => {
    const provider = new StripePaymentProvider();

    delete process.env.STRIPE_SECRET_KEY;
    expect(provider.isConfigured()).toBe(false);
    expect(provider.getMode()).toBeNull();

    process.env.STRIPE_SECRET_KEY = 'sk_test_abc';
    expect(provider.isConfigured()).toBe(true);
    expect(provider.getMode()).toBe('test');

    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    expect(provider.getMode()).toBe('live');
  });

  it('Stripe provider requires a configured price id to check out a plan', () => {
    const provider = new StripePaymentProvider();
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc';
    delete process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
    delete process.env.STRIPE_PRICE_ID_PRO_MONTHLY;
    delete process.env.STRIPE_PRICE_PRO_MONTHLY_ID;
    delete process.env.STRIPE_PRICE_PRO_MONTHLY;
    expect(provider.canCheckout('pro', 'monthly')).toBe(false);

    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_ok';
    expect(provider.canCheckout('pro', 'monthly')).toBe(true);
  });

  it('Razorpay provider reports test/live mode and INR currency support', () => {
    const provider = new RazorpayPaymentProvider();

    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    expect(provider.isConfigured()).toBe(false);
    expect(provider.getMode()).toBeNull();

    process.env.RAZORPAY_KEY_ID = 'rzp_test_abc';
    process.env.RAZORPAY_KEY_SECRET = 'sec';
    expect(provider.isConfigured()).toBe(true);
    expect(provider.getMode()).toBe('test');
    expect(provider.supportedCurrencies()).toContain('INR');
  });

  it('Razorpay verifyPayment refuses to run when not configured', async () => {
    const provider = new RazorpayPaymentProvider();
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;

    const result = await provider.verifyPayment({
      userId: 'u1',
      orderId: 'o1',
      razorpayPaymentId: 'pay_1',
      razorpaySignature: 'sig',
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('NOT_CONFIGURED');
  });
});

// ═════════════════════════════════════════════════════════════════════
// 5. RazorpayPaymentProvider.verifyPayment — server-side contract
// ═════════════════════════════════════════════════════════════════════
describe('RazorpayPaymentProvider.verifyPayment: verification contract', () => {
  const SECRET = 'test_razorpay_key_secret';
  const provider = new RazorpayPaymentProvider();

  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_abc';
    process.env.RAZORPAY_KEY_SECRET = SECRET;
    mockedDb.paymentOrder.findUnique.mockReset();
  });

  it('rejects orders that do not exist or belong to another user', async () => {
    mockedDb.paymentOrder.findUnique.mockResolvedValueOnce(null);
    const notFound = await provider.verifyPayment({
      userId: 'u1', orderId: 'missing', razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', razorpaySignature: 'sig',
    });
    expect(notFound.success).toBe(false);
    expect(notFound.errorCode).toBe('ORDER_NOT_FOUND');

    mockedDb.paymentOrder.findUnique.mockResolvedValueOnce({
      id: 'o1', userId: 'someone_else', provider: 'razorpay', status: 'pending', amount: 100,
    });
    const wrongUser = await provider.verifyPayment({
      userId: 'u1', orderId: 'o1', razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', razorpaySignature: 'sig',
    });
    expect(wrongUser.success).toBe(false);
    expect(wrongUser.errorCode).toBe('ORDER_NOT_FOUND');
  });

  it('returns alreadyProcessed for a completed order (idempotent repeat)', async () => {
    mockedDb.paymentOrder.findUnique.mockResolvedValueOnce({
      id: 'o1', userId: 'u1', provider: 'razorpay', status: 'completed', amount: 100, plan: 'pro',
    });
    const result = await provider.verifyPayment({
      userId: 'u1', orderId: 'o1', razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', razorpaySignature: 'sig',
    });
    expect(result.success).toBe(true);
    expect(result.alreadyProcessed).toBe(true);
  });

  it('refuses to activate an order that is not pending', async () => {
    mockedDb.paymentOrder.findUnique.mockResolvedValueOnce({
      id: 'o1', userId: 'u1', provider: 'razorpay', status: 'failed', amount: 100,
    });
    const result = await provider.verifyPayment({
      userId: 'u1', orderId: 'o1', razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', razorpaySignature: 'sig',
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('ORDER_NOT_PENDING');
  });

  it('rejects an invalid signature without touching activation', async () => {
    mockedDb.paymentOrder.findUnique.mockResolvedValueOnce({
      id: 'o1', userId: 'u1', provider: 'razorpay', status: 'pending',
      amount: 1887, currency: 'INR', plan: 'pro', providerOrderId: 'order_1',
    });

    const badSig = createHmac('sha256', 'attacker_secret').update('order_1|pay_1').digest('hex');
    const result = await provider.verifyPayment({
      userId: 'u1', orderId: 'o1', razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', razorpaySignature: badSig,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('SIGNATURE_INVALID');
    // Activation service must never have been invoked — assert no order
    // update happened (activation runs later with a valid signature).
    expect(db.paymentOrder.update).not.toHaveBeenCalled();
  });

  it('verifies a valid signature but fails safely when the gateway fetch errors', async () => {
    mockedDb.paymentOrder.findUnique.mockResolvedValueOnce({
      id: 'o1', userId: 'u1', provider: 'razorpay', status: 'pending',
      amount: 1887, currency: 'INR', plan: 'pro', providerOrderId: 'order_1',
    });

    const goodSig = createHmac('sha256', SECRET).update('order_1|pay_1').digest('hex');
    // No network in unit tests → payments.fetch rejects → GATEWAY_ERROR with
    // a webhook-recovery message (never a fake success).
    const result = await provider.verifyPayment({
      userId: 'u1', orderId: 'o1', razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', razorpaySignature: goodSig,
    });

    expect(result.success).toBe(false);
    expect(['GATEWAY_ERROR']).toContain(result.errorCode);
  });
});
