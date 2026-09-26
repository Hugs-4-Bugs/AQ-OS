// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Payment Provider Configuration Validator
//
// FINAL PAYMENT ACTIVATION ARCHITECTURE (Sep 2026) — requirement #19:
// a SAFE configuration validator that reports, for every payment
// provider credential and per-plan provider ID, whether it is
// CONFIGURED or MISSING.
//
// SAFETY RULES:
//   • NEVER returns, logs, or serializes an actual secret VALUE.
//     Only boolean status + the env var NAME being checked.
//   • A value that is set but malformed (wrong prefix for a provider
//     ID) is reported as MISSING with reason 'malformed' — the app
//     treats it as unusable, and the value itself is never surfaced.
//   • The canonical Stripe naming convention is
//     STRIPE_PRICE_{PLAN}_{CYCLE}_ID; all historic aliases are still
//     accepted by resolvePlanPriceId (payment-service) and reported
//     here via `matchedVia` when one of them satisfies the mapping.
//   • Razorpay Plan IDs use RAZORPAY_PLAN_{PLAN}_{CYCLE}.
//   • Credit-pack Price IDs use STRIPE_PRICE_CREDITS_{N}_ID for the four
//     active packs (N = 250 / 500 / 1000 / 2500).
//
// Used by:
//   • GET /api/payments/config-status (admin-only diagnostics endpoint)
//   • scripts/payment-config-report.mjs (CLI report)
//   • unit tests (payment-activation.test.ts)
// ═══════════════════════════════════════════════════════════════════

export type PaidPlanId = 'starter' | 'pro' | 'elite';
export type Cycle = 'monthly' | 'yearly';

export interface ConfigItemStatus {
  /** Environment variable NAME (never the value). */
  envVar: string;
  /** true when the variable is set and usable. */
  configured: boolean;
  /** When set-but-malformed, the reason — no value is ever included. */
  reason?: 'malformed' | 'unset';
}

export interface PlanProviderConfigStatus {
  /** Canonical env var name for this plan/cycle. */
  canonicalEnvVar: string;
  /** Whether the plan/cycle is checkout-ready for the provider. */
  configured: boolean;
  /** Which env var actually satisfied the mapping (alias support). */
  matchedVia: string | null;
}

export interface PaymentConfigReport {
  plans: Record<PaidPlanId, { status: 'active' }>;
  stripe: {
    secretKey: ConfigItemStatus;
    webhookSecret: ConfigItemStatus;
    publishableKey: ConfigItemStatus;
    plans: Record<PaidPlanId, Record<Cycle, PlanProviderConfigStatus>>;
    creditPacks: Record<'250' | '500' | '1000' | '2500', PlanProviderConfigStatus & { canonicalEnvVar: string }>;
  };
  razorpay: {
    keyId: ConfigItemStatus;
    keySecret: ConfigItemStatus;
    webhookSecret: ConfigItemStatus;
    plans: Record<PaidPlanId, Record<Cycle, PlanProviderConfigStatus>>;
  };
  /** Convenience booleans — true when a full checkout could run now. */
  checkoutReady: {
    /** Stripe credentials present (per-plan readiness via plans map). */
    stripeCredentials: boolean;
    /** Razorpay credentials present. */
    razorpayCredentials: boolean;
    /** Razorpay recurring subscriptions available (all 6 plan IDs mapped). */
    razorpayRecurringComplete: boolean;
  };
}

export const STRIPE_PLAN_ENV_VARS: Record<PaidPlanId, Record<Cycle, string>> = {
  starter: { monthly: 'STRIPE_PRICE_STARTER_MONTHLY_ID', yearly: 'STRIPE_PRICE_STARTER_YEARLY_ID' },
  pro: { monthly: 'STRIPE_PRICE_PRO_MONTHLY_ID', yearly: 'STRIPE_PRICE_PRO_YEARLY_ID' },
  elite: { monthly: 'STRIPE_PRICE_ELITE_MONTHLY_ID', yearly: 'STRIPE_PRICE_ELITE_YEARLY_ID' },
};

export const RAZORPAY_PLAN_ENV_VARS: Record<PaidPlanId, Record<Cycle, string>> = {
  starter: { monthly: 'RAZORPAY_PLAN_STARTER_MONTHLY', yearly: 'RAZORPAY_PLAN_STARTER_YEARLY' },
  pro: { monthly: 'RAZORPAY_PLAN_PRO_MONTHLY', yearly: 'RAZORPAY_PLAN_PRO_YEARLY' },
  elite: { monthly: 'RAZORPAY_PLAN_ELITE_MONTHLY', yearly: 'RAZORPAY_PLAN_ELITE_YEARLY' },
};

/** Legacy Stripe conventions still honoured by resolvePlanPriceId,
 * tried in the same order. */
function stripeLegacyAliases(plan: PaidPlanId, cycle: Cycle): string[] {
  const P = plan.toUpperCase();
  const C = cycle.toUpperCase();
  return [
    `STRIPE_${P}_${C}_PRICE_ID`,
    `STRIPE_PRICE_ID_${P}_${C}`,
    `STRIPE_PRICE_${P}_${C}`, // canonical is STRIPE_PRICE_${P}_${C}_ID
  ];
}

function checkSecret(env: Record<string, string | undefined>, name: string): ConfigItemStatus {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    return { envVar: name, configured: false, reason: 'unset' };
  }
  return { envVar: name, configured: true };
}

function checkPrefixedId(
  env: Record<string, string | undefined>,
  name: string,
  prefix: string
): ConfigItemStatus {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    return { envVar: name, configured: false, reason: 'unset' };
  }
  if (!value.startsWith(prefix)) {
    // Set but unusable — reported MISSING; the value is NEVER surfaced.
    return { envVar: name, configured: false, reason: 'malformed' };
  }
  return { envVar: name, configured: true };
}

/** Build the full safe configuration report. `env` defaults to
 * process.env; tests pass explicit fixtures. Never includes values. */
export function buildPaymentConfigReport(
  env: Record<string, string | undefined> = process.env
): PaymentConfigReport {
  const paidPlans: PaidPlanId[] = ['starter', 'pro', 'elite'];
  const cycles: Cycle[] = ['monthly', 'yearly'];

  const stripePlans = {} as PaymentConfigReport['stripe']['plans'];
  const razorpayPlans = {} as PaymentConfigReport['razorpay']['plans'];

  for (const plan of paidPlans) {
    stripePlans[plan] = {} as Record<Cycle, PlanProviderConfigStatus>;
    razorpayPlans[plan] = {} as Record<Cycle, PlanProviderConfigStatus>;
    for (const cycle of cycles) {
      // ── Stripe: canonical name first, then legacy aliases. ──
      const canonical = STRIPE_PLAN_ENV_VARS[plan][cycle];
      let matchedVia: string | null = null;
      const canonicalStatus = checkPrefixedId(env, canonical, 'price_');
      if (canonicalStatus.configured) {
        matchedVia = canonical;
      } else {
        for (const alias of stripeLegacyAliases(plan, cycle)) {
          if (checkPrefixedId(env, alias, 'price_').configured) {
            matchedVia = alias;
            break;
          }
        }
      }
      stripePlans[plan][cycle] = {
        canonicalEnvVar: canonical,
        configured: matchedVia !== null,
        matchedVia,
      };

      // ── Razorpay: canonical RAZORPAY_PLAN_{PLAN}_{CYCLE}. ──
      const rzpCanonical = RAZORPAY_PLAN_ENV_VARS[plan][cycle];
      const rzpStatus = checkPrefixedId(env, rzpCanonical, 'plan_');
      razorpayPlans[plan][cycle] = {
        canonicalEnvVar: rzpCanonical,
        configured: rzpStatus.configured,
        matchedVia: rzpStatus.configured ? rzpCanonical : null,
      };
    }
  }

  const creditPacks = {} as PaymentConfigReport['stripe']['creditPacks'];
  for (const n of ['250', '500', '1000', '2500'] as const) {
    const name = `STRIPE_PRICE_CREDITS_${n}_ID`;
    const status = checkPrefixedId(env, name, 'price_');
    creditPacks[n] = {
      canonicalEnvVar: name,
      configured: status.configured,
      matchedVia: status.configured ? name : null,
    };
  }

  const stripeSecret = checkSecret(env, 'STRIPE_SECRET_KEY');
  const rzpKey = checkSecret(env, 'RAZORPAY_KEY_ID');
  const rzpSecret = checkSecret(env, 'RAZORPAY_KEY_SECRET');

  const razorpayRecurringComplete = paidPlans.every((p) =>
    cycles.every((c) => razorpayPlans[p][c].configured)
  );

  return {
    plans: { starter: { status: 'active' }, pro: { status: 'active' }, elite: { status: 'active' } },
    stripe: {
      secretKey: stripeSecret,
      webhookSecret: checkSecret(env, 'STRIPE_WEBHOOK_SECRET'),
      publishableKey: checkSecret(env, 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
      plans: stripePlans,
      creditPacks,
    },
    razorpay: {
      keyId: rzpKey,
      keySecret: rzpSecret,
      webhookSecret: checkSecret(env, 'RAZORPAY_WEBHOOK_SECRET'),
      plans: razorpayPlans,
    },
    checkoutReady: {
      stripeCredentials: stripeSecret.configured,
      razorpayCredentials: rzpKey.configured && rzpSecret.configured,
      razorpayRecurringComplete,
    },
  };
}
