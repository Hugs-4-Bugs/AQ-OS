// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Payment Provider Abstraction (types)
//
// Common contracts shared by every payment gateway (Stripe, Razorpay,
// and future providers). The rest of the application (checkout routes,
// UI, billing history) programs against these types — never against a
// provider SDK directly.
//
// Architecture:
//   PaymentProvider (interface)
//   ├── StripePaymentProvider   (src/lib/payments/stripe-provider.ts)
//   └── RazorpayPaymentProvider (src/lib/payments/razorpay-provider.ts)
//
// Provider-specific code lives ONLY in the provider implementations.
// ═══════════════════════════════════════════════════════════════════

/** Supported payment gateways. Adding a gateway = adding a provider file. */
export type PaymentGateway = 'stripe' | 'razorpay';

export const PAYMENT_GATEWAYS: PaymentGateway[] = ['stripe', 'razorpay'];

export function isPaymentGateway(value: unknown): value is PaymentGateway {
  return value === 'stripe' || value === 'razorpay';
}

/** Billing intervals supported by both gateways. */
export type BillingCycle = 'monthly' | 'yearly';

/** What the client wants to buy. */
export type PurchaseKind = 'subscription' | 'credits';

/**
 * Unified result of a "create checkout" operation.
 *
 * - Stripe  → the client redirects to `checkoutUrl` (hosted checkout).
 * - Razorpay→ the client opens Razorpay Checkout.js with `razorpay.*`
 *             fields, then posts the handler response to
 *             /api/payments/razorpay/verify.
 */
export interface CreateCheckoutResult {
  success: boolean;
  gateway: PaymentGateway;
  /** Internal PaymentOrder id (our DB). */
  orderId?: string;
  error?: string;

  // ── Stripe-specific ──
  checkoutUrl?: string;
  stripeSessionId?: string;

  // ── Razorpay-specific ──
  razorpayOrderId?: string;
  /** Present when the plan is mapped to a Razorpay subscription (recurring). */
  razorpaySubscriptionId?: string;
  /** Publishable key id for Checkout.js (safe for the browser). */
  razorpayKeyId?: string;
  /** Amount in the currency's smallest unit (paise for INR). */
  razorpayAmount?: number;
  razorpayCurrency?: string;
  /** User prefill for the Razorpay modal. */
  prefill?: { name?: string; email?: string; contact?: string };

  // ── Common display fields (already verified server-side) ──
  amount?: number;
  currency?: string;
  plan?: string;
  billingCycle?: BillingCycle;
  creditsAllocated?: number;
  /** True when an idempotency key matched an existing pending order. */
  idempotent?: boolean;
  /** Test vs live mode of the gateway (informational, safe to expose). */
  mode?: 'test' | 'live';
}

/** Params for verification of a client-reported payment. */
export interface VerifyPaymentParams {
  userId: string;
  /** Internal PaymentOrder id. */
  orderId: string;
  /** Razorpay: razorpay_order_id from the Checkout handler. */
  razorpayOrderId?: string;
  /** Razorpay: razorpay_payment_id from the Checkout handler. */
  razorpayPaymentId?: string;
  /** Razorpay: razorpay_signature from the Checkout handler. */
  razorpaySignature?: string;
  /** Razorpay subscriptions: razorpay_subscription_id from the handler. */
  razorpaySubscriptionId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  /** Already activated earlier (idempotent repeat) — treat as success. */
  alreadyProcessed?: boolean;
  error?: string;
  errorCode?:
    | 'ORDER_NOT_FOUND'
    | 'ORDER_NOT_PENDING'
    | 'SIGNATURE_INVALID'
    | 'PAYMENT_NOT_FOUND'
    | 'PAYMENT_FAILED'
    | 'AMOUNT_MISMATCH'
    | 'NOT_CONFIGURED'
    | 'GATEWAY_ERROR';
  /** Plan that was activated (present on success). */
  plan?: string;
  creditsAdded?: number;
}

/**
 * The provider contract. Every gateway implements these five operations;
 * subscription state, credits, invoices and idempotency are handled by
 * the SHARED services (subscription-service / payment-service), never
 * duplicated inside a provider.
 */
export interface PaymentProvider {
  readonly gateway: PaymentGateway;
  /** Display name for UI. */
  readonly displayName: string;
  /** True when the required env credentials are present. */
  isConfigured(): boolean;
  /** 'test' | 'live' when configured, null otherwise. */
  getMode(): 'test' | 'live' | null;
  /** Currencies this gateway can charge in this deployment. */
  supportedCurrencies(): string[];
  /** True when the given plan+cycle is purchasable on this gateway. */
  canCheckout(plan: 'pro' | 'elite', cycle: BillingCycle): boolean;

  /** Create a checkout (subscription or credit add-on). */
  createCheckout(params: {
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
  }): Promise<CreateCheckoutResult>;

  /** Verify a client-reported payment server-side. Stripe uses webhooks +
   * session verification, so this may return a "not applicable" error. */
  verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult>;
}
