// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — StripePaymentProvider
//
// Thin adapter that presents the EXISTING, canonical Stripe flow
// (payment-service.createStripeCheckoutSession / verify-session / Stripe
// webhooks) through the PaymentProvider contract. All heavy lifting —
// session creation, price resolution from env, webhook signature checks,
// activation — stays in payment-service.ts / the Stripe webhook route.
// This file adds no new Stripe behavior; it only normalizes the shape.
// ═══════════════════════════════════════════════════════════════════

import {
  createStripeCheckoutSession,
  createStripeCreditAddonCheckoutSession,
  resolvePlanPriceId,
} from '@/lib/payment-service';
import type {
  BillingCycle,
  CreateCheckoutResult,
  PaymentProvider,
  PurchaseKind,
  VerifyPaymentParams,
  VerifyPaymentResult,
} from './types';

export class StripePaymentProvider implements PaymentProvider {
  readonly gateway = 'stripe' as const;
  readonly displayName = 'Stripe';

  isConfigured(): boolean {
    return !!process.env.STRIPE_SECRET_KEY;
  }

  getMode(): 'test' | 'live' | null {
    if (!this.isConfigured()) return null;
    const key = process.env.STRIPE_SECRET_KEY || '';
    return key.startsWith('sk_test_') ? 'test' : 'live';
  }

  supportedCurrencies(): string[] {
    // The canonical Stripe path uses the env-configured Stripe Price for
    // the plan; price currency is defined on the Price object in the
    // dashboard (USD prices per the current plan catalog).
    return ['USD'];
  }

  /** A Stripe checkout is possible when the plan's Price ID is configured. */
  canCheckout(plan: 'pro' | 'elite', cycle: BillingCycle): boolean {
    if (!this.isConfigured()) return false;
    return !!resolvePlanPriceId(plan, cycle).priceId;
  }

  async createCheckout(params: {
    userId: string;
    kind: PurchaseKind;
    plan?: 'pro' | 'elite';
    billingCycle?: BillingCycle;
    creditAmount?: 100 | 500 | 1000;
    couponCode?: string;
    successUrl?: string;
    cancelUrl?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<CreateCheckoutResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        gateway: 'stripe',
        error: 'Stripe is not configured. Set STRIPE_SECRET_KEY.',
      };
    }

    if (params.kind === 'credits') {
      if (params.creditAmount !== 100 && params.creditAmount !== 500 && params.creditAmount !== 1000) {
        return { success: false, gateway: 'stripe', error: 'Invalid creditAmount. Must be 100, 500, or 1000.' };
      }
      const result = await createStripeCreditAddonCheckoutSession({
        userId: params.userId,
        creditAmount: params.creditAmount,
        successUrl: params.successUrl,
        cancelUrl: params.cancelUrl,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      });
      if (!result.success) {
        return { success: false, gateway: 'stripe', error: result.error, orderId: result.orderId };
      }
      return {
        success: true,
        gateway: 'stripe',
        orderId: result.orderId,
        checkoutUrl: result.url,
        stripeSessionId: result.sessionId,
        amount: result.amount,
        currency: result.currency,
        plan: 'credit_addon',
        creditsAllocated: result.credits,
        mode: this.getMode() ?? undefined,
      };
    }

    const plan = params.plan;
    const billingCycle = params.billingCycle ?? 'monthly';
    if (plan !== 'pro' && plan !== 'elite') {
      return { success: false, gateway: 'stripe', error: 'Invalid plan. Only Pro and Elite plans require payment.' };
    }

    const result = await createStripeCheckoutSession({
      userId: params.userId,
      plan,
      billingCycle,
      couponCode: params.couponCode,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    if (!result.success) {
      return { success: false, gateway: 'stripe', error: result.error, orderId: result.orderId };
    }

    return {
      success: true,
      gateway: 'stripe',
      orderId: result.orderId,
      checkoutUrl: result.stripeSessionUrl,
      stripeSessionId: result.stripeSessionId,
      amount: result.amount,
      currency: result.currency,
      plan: result.plan,
      billingCycle: result.billingCycle,
      creditsAllocated: result.creditsAllocated,
      mode: this.getMode() ?? undefined,
    };
  }

  /**
   * Stripe does NOT verify client-reported payments through this path —
   * activation happens via the Stripe webhook (source of truth) and the
   * /api/payments/verify-session reconciliation route. Returning a clear
   * error keeps the contract honest instead of pretending to verify.
   */
  async verifyPayment(_params: VerifyPaymentParams): Promise<VerifyPaymentResult> {
    return {
      success: false,
      errorCode: 'GATEWAY_ERROR',
      error:
        'Stripe payments are verified server-side via webhooks and /api/payments/verify-session. Use the session verification flow for Stripe checkouts.',
    };
  }
}
