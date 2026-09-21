// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Payment Provider Registry
//
// The single place where gateways are registered. Application code
// (routes, UI) asks THIS module for a provider — never instantiates
// gateway SDKs directly. Adding a future gateway means:
//   1. implement PaymentProvider in src/lib/payments/<name>-provider.ts
//   2. register it in PAYMENT_PROVIDERS below.
// ═══════════════════════════════════════════════════════════════════

import type { BillingCycle, PaymentGateway, PaymentProvider } from './types';
import { isPaymentGateway } from './types';
import { StripePaymentProvider } from './stripe-provider';
import { RazorpayPaymentProvider } from './razorpay-provider';

const PAYMENT_PROVIDERS: Record<PaymentGateway, PaymentProvider> = {
  stripe: new StripePaymentProvider(),
  razorpay: new RazorpayPaymentProvider(),
};

export function getPaymentProvider(gateway: PaymentGateway): PaymentProvider {
  return PAYMENT_PROVIDERS[gateway];
}

export function tryGetPaymentProvider(gateway: unknown): PaymentProvider | null {
  return isPaymentGateway(gateway) ? PAYMENT_PROVIDERS[gateway] : null;
}

export function getAllPaymentProviders(): PaymentProvider[] {
  return Object.values(PAYMENT_PROVIDERS);
}

/** Public-safe availability snapshot for UI (no secrets). */
export interface GatewayAvailability {
  gateway: PaymentGateway;
  displayName: string;
  available: boolean;
  mode: 'test' | 'live' | null;
  currencies: string[];
}

export function getGatewaysAvailability(): GatewayAvailability[] {
  return getAllPaymentProviders().map((p) => ({
    gateway: p.gateway,
    displayName: p.displayName,
    available: p.isConfigured(),
    mode: p.getMode(),
    currencies: p.supportedCurrencies(),
  }));
}

/** Gateways that can take a specific plan/cycle checkout right now. */
export function getAvailableGatewaysForPlan(plan: 'pro' | 'elite', cycle: BillingCycle): PaymentGateway[] {
  return getAllPaymentProviders()
    .filter((p) => p.isConfigured() && p.canCheckout(plan, cycle))
    .map((p) => p.gateway);
}

export * from './types';
export {
  getPlanPrice,
  getPlanCredits,
  getPlanGatewayAvailability,
  getCreditAddonGatewayAvailability,
  getRazorpayPlanId,
  razorpayPlanEnvName,
  getPlanCatalog,
  PLAN_PRICING,
} from './plan-config';
