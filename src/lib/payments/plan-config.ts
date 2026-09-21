// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Central Plan ↔ Gateway Mapping (single source of truth)
//
// Requirement: "Create/extend a central plan configuration that can map:
//   Application Plan → Stripe Price/Product → Razorpay Plan →
//   price → currency → billing interval → credits → entitlements"
//
// This module is THE mapping. Providers read gateway identifiers from
// the environment (never hardcoded); display prices come from the
// PLAN_PRICING table below, which is kept in lockstep with
// src/lib/subscription-store.ts (the pricing UI) and src/lib/payment-service.ts.
//
// Env vars per plan/cycle:
//   Stripe   : STRIPE_{PLAN}_{CYCLE}_PRICE_ID  (also accepts legacy aliases,
//              resolved via payment-service.resolvePlanPriceId)
//   Razorpay : RAZORPAY_PLAN_{PLAN}_{CYCLE}    (e.g. RAZORPAY_PLAN_PRO_MONTHLY)
//              When a Razorpay plan ID is configured, checkout creates a
//              recurring Razorpay Subscription; otherwise a one-time order
//              is used and renewals are handled by the end-of-period cron.
//
// Credits + entitlements come from entitlement-service (PLAN_CREDITS /
// ENTITLEMENTS) — NOT duplicated here.
// ═══════════════════════════════════════════════════════════════════

import type { BillingCycle, PaymentGateway } from './types';
import { PLAN_CREDITS, type PlanType } from '@/lib/entitlement-service';
import { resolvePlanPriceId } from '@/lib/payment-service';

export type PaidPlan = 'pro' | 'elite';

export interface PlanPrice {
  monthly: number;
  yearly: number;
}

/** Display prices in minor-unit-free major units (₹ / $). Server-side
 * amounts for Razorpay orders are derived from this table; Stripe amounts
 * always come from the Stripe Price object itself. */
export const PLAN_PRICING: Record<PaidPlan, Record<'INR' | 'USD', PlanPrice>> = {
  pro: { INR: { monthly: 1599, yearly: 11999 }, USD: { monthly: 19, yearly: 144 } },
  elite: { INR: { monthly: 5199, yearly: 37999 }, USD: { monthly: 63, yearly: 456 } },
};

/** Authoritative amount for a plan/cycle/currency (major units). */
export function getPlanPrice(plan: PaidPlan, cycle: BillingCycle, currency: 'INR' | 'USD'): number {
  return PLAN_PRICING[plan]?.[currency]?.[cycle] ?? 0;
}

/** Credits granted for a plan — delegated to entitlement-service. */
export function getPlanCredits(plan: PlanType): number {
  return PLAN_CREDITS[plan] ?? PLAN_CREDITS.free;
}

// ─── Stripe mapping ────────────────────────────────────────────────────

export function getStripePriceId(plan: PaidPlan, cycle: BillingCycle): string | null {
  return resolvePlanPriceId(plan, cycle).priceId;
}

// ─── Razorpay mapping ──────────────────────────────────────────────────

/** Razorpay plan env var name for a plan/cycle (e.g. RAZORPAY_PLAN_PRO_MONTHLY). */
export function razorpayPlanEnvName(plan: PaidPlan, cycle: BillingCycle): string {
  return `RAZORPAY_PLAN_${plan.toUpperCase()}_${cycle.toUpperCase()}`;
}

/** Resolve the configured Razorpay Plan ID (recurring subscription) for a
 * plan/cycle. IDs look like `plan_XXXX`. Returns null when not configured,
 * in which case Razorpay checkout falls back to a one-time order. */
export function getRazorpayPlanId(plan: PaidPlan, cycle: BillingCycle): string | null {
  const value = process.env[razorpayPlanEnvName(plan, cycle)];
  if (typeof value === 'string' && value.startsWith('plan_')) return value;
  return null;
}

// ─── Gateway availability per plan ─────────────────────────────────────

export interface PlanGatewayAvailability {
  stripe: boolean;
  razorpay: boolean;
  /** True when Razorpay will run as a recurring subscription (plan ID set). */
  razorpayRecurring: boolean;
}

export function getPlanGatewayAvailability(plan: PaidPlan, cycle: BillingCycle): PlanGatewayAvailability {
  const stripeAvailable =
    !!process.env.STRIPE_SECRET_KEY && !!getStripePriceId(plan, cycle);
  const razorpayAvailable =
    !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;
  return {
    stripe: stripeAvailable,
    razorpay: razorpayAvailable,
    razorpayRecurring: razorpayAvailable && !!getRazorpayPlanId(plan, cycle),
  };
}

/** Which gateways can take a credit add-on purchase. */
export function getCreditAddonGatewayAvailability(): Record<PaymentGateway, boolean> {
  return {
    stripe:
      !!process.env.STRIPE_SECRET_KEY &&
      [100, 500, 1000].some((n) => !!process.env[`STRIPE_PRICE_CREDITS_${n}_ID`]),
    razorpay: !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET,
  };
}

/** Full catalog dump for admin/debug surfaces (no secrets). */
export function getPlanCatalog() {
  const plans: Array<{
    plan: PaidPlan;
    cycle: BillingCycle;
    priceINR: number;
    priceUSD: number;
    credits: number;
    stripe: { configured: boolean; envVars: string[] };
    razorpay: { configured: boolean; recurring: boolean; envVar: string };
  }> = [];

  for (const plan of ['pro', 'elite'] as PaidPlan[]) {
    for (const cycle of ['monthly', 'yearly'] as BillingCycle[]) {
      const { envVarNamesTried } = { envVarNamesTried: stripeEnvNames(plan, cycle) };
      plans.push({
        plan,
        cycle,
        priceINR: getPlanPrice(plan, cycle, 'INR'),
        priceUSD: getPlanPrice(plan, cycle, 'USD'),
        credits: getPlanCredits(plan),
        stripe: {
          configured: !!getStripePriceId(plan, cycle),
          envVars: envVarNamesTried,
        },
        razorpay: {
          configured: !!getRazorpayPlanId(plan, cycle),
          recurring: !!getRazorpayPlanId(plan, cycle),
          envVar: razorpayPlanEnvName(plan, cycle),
        },
      });
    }
  }
  return plans;
}

function stripeEnvNames(plan: PaidPlan, cycle: BillingCycle): string[] {
  const P = plan.toUpperCase();
  const C = cycle.toUpperCase();
  return [
    `STRIPE_${P}_${C}_PRICE_ID`,
    `STRIPE_PRICE_ID_${P}_${C}`,
    `STRIPE_PRICE_${P}_${C}_ID`,
    `STRIPE_PRICE_${P}_${C}`,
  ];
}
