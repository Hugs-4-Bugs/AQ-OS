// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Stripe Customer Portal Integration
// Phase 4-5: Billing and Payment Gaps Remediation
//
// Creates Stripe Customer Portal sessions for self-service
// billing management (payment methods, invoices, cancel, update).
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logBillingEvent } from '@/lib/billing-audit';

// ===== TYPES =====

export interface PortalSessionResult {
  success: boolean;
  url?: string;
  sessionId?: string;
  error?: string;
}

export interface PortalConfigResult {
  success: boolean;
  configurationId?: string;
  error?: string;
}

export interface PortalReturnResult {
  success: boolean;
  subscriptionUpdated?: boolean;
  paymentMethodUpdated?: boolean;
  subscriptionCanceled?: boolean;
  error?: string;
}

// ===== CONFIGURE PORTAL =====

export async function configurePortal(): Promise<PortalConfigResult> {
  try {
    const stripe = await import('stripe');
    const stripeClient = new stripe.default(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2024-12-18.acacia' as never,
    });

    // Create or retrieve a portal configuration
    const configurations = await stripeClient.billingPortal.configurations.list({
      limit: 1,
    });

    if (configurations.data.length > 0) {
      return {
        success: true,
        configurationId: configurations.data[0].id,
      };
    }

    // Create a new configuration with all features enabled
    const configuration = await stripeClient.billingPortal.configurations.create({
      business_profile: {
        headline: 'AcquisitionOS - Manage your subscription',
        privacy_policy_url: process.env.PRIVACY_POLICY_URL || 'https://acquisitionos.com/privacy',
        terms_of_service_url: process.env.TERMS_URL || 'https://acquisitionos.com/terms',
      },
      features: {
        payment_method_update: {
          enabled: true,
        },
        invoice_history: {
          enabled: true,
        },
        subscription_cancel: {
          enabled: true,
          mode: 'at_period_end',
          cancellation_reason: {
            enabled: true,
            options: [
              'too_expensive',
              'missing_features',
              'switched_service',
              'unused',
              'other',
            ],
          },
        },
        subscription_update: {
          enabled: true,
          default_allowed: true,
          proration_behavior: 'create_prorations',
          products: [
            {
              product: process.env.STRIPE_PRO_PRODUCT_ID || 'prod_pro',
              prices: [
                process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 'price_pro_monthly',
                process.env.STRIPE_PRO_YEARLY_PRICE_ID || 'price_pro_yearly',
              ],
            },
            {
              product: process.env.STRIPE_ELITE_PRODUCT_ID || 'prod_elite',
              prices: [
                process.env.STRIPE_ELITE_MONTHLY_PRICE_ID || 'price_elite_monthly',
                process.env.STRIPE_ELITE_YEARLY_PRICE_ID || 'price_elite_yearly',
              ],
            },
          ],
        },
      },
    });

    return {
      success: true,
      configurationId: configuration.id,
    };
  } catch (error) {
    console.error('[StripePortal] Failed to configure portal:', error);
    return { success: false, error: 'Failed to configure Stripe customer portal' };
  }
}

// ===== CREATE PORTAL SESSION =====

export async function createPortalSession(params: {
  userId: string;
  returnUrl?: string;
}): Promise<PortalSessionResult> {
  try {
    const { userId, returnUrl } = params;

    // Get the user's Stripe customer ID from their subscription
    const subscription = await db.subscription.findFirst({
      where: {
        userId,
        status: { in: ['trialing', 'active', 'past_due', 'canceled'] },
      },
      select: {
        id: true,
        stripeCustomerId: true,
        plan: true,
        status: true,
      },
    });

    if (!subscription?.stripeCustomerId) {
      return { success: false, error: 'No Stripe customer ID found. Please subscribe first.' };
    }

    const stripe = await import('stripe');
    const stripeClient = new stripe.default(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2024-12-18.acacia' as never,
    });

    // Get or create portal configuration
    const configResult = await configurePortal();
    const configurationId = configResult.configurationId;

    // Create the portal session
    const session = await stripeClient.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: returnUrl || process.env.STRIPE_PORTAL_RETURN_URL || `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL}/settings?tab=billing`,
      configuration: configurationId,
    });

    // Log portal access
    await logBillingEvent({
      userId,
      action: 'subscription_canceled', // Using existing event type for audit
      details: 'Customer portal session created',
      metadata: {
        action: 'portal_session_created',
        sessionId: session.id,
        plan: subscription.plan,
        status: subscription.status,
      },
    });

    return {
      success: true,
      url: session.url,
      sessionId: session.id,
    };
  } catch (error) {
    console.error('[StripePortal] Failed to create portal session:', error);
    return { success: false, error: 'Failed to create Stripe customer portal session' };
  }
}

// ===== HANDLE PORTAL RETURN =====

export async function handlePortalReturn(params: {
  userId: string;
  sessionId?: string;
}): Promise<PortalReturnResult> {
  try {
    const { userId, sessionId } = params;

    // If we have a session ID, we could retrieve session details from Stripe
    // to understand what action the user took
    let subscriptionUpdated = false;
    let paymentMethodUpdated = false;
    let subscriptionCanceled = false;

    if (sessionId) {
      try {
        const stripe = await import('stripe');
        const stripeClient = new stripe.default(process.env.STRIPE_SECRET_KEY || '', {
          apiVersion: '2024-12-18.acacia' as never,
        });

        // Retrieve session details (note: portal sessions don't have detailed info)
        // We rely on webhooks for actual changes
        const session = await stripeClient.billingPortal.sessions.retrieve(sessionId);

        // Log portal return
        await logBillingEvent({
          userId,
          action: 'subscription_reactivated',
          details: 'Customer returned from portal',
          metadata: {
            action: 'portal_return',
            sessionId: session.id,
          },
        });
      } catch {
        // Session retrieval might fail, but we still process the return
        console.warn('[StripePortal] Could not retrieve portal session details');
      }
    }

    // Sync subscription status from Stripe to our database
    const subscription = await db.subscription.findFirst({
      where: {
        userId,
        status: { in: ['trialing', 'active', 'past_due', 'canceled'] },
      },
    });

    if (subscription?.stripeSubscriptionId) {
      try {
        const stripe = await import('stripe');
        const stripeClient = new stripe.default(process.env.STRIPE_SECRET_KEY || '', {
          apiVersion: '2024-12-18.acacia' as never,
        });

        const stripeSub = await stripeClient.subscriptions.retrieve(subscription.stripeSubscriptionId);

        // Detect changes
        const previousStatus = subscription.status;
        const newStatus = stripeSub.status;

        if (previousStatus !== newStatus) {
          await db.subscription.update({
            where: { id: subscription.id },
            data: {
              status: newStatus,
              cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
              currentPeriodStart: stripeSub.current_period_start
                ? new Date(stripeSub.current_period_start * 1000)
                : null,
              currentPeriodEnd: stripeSub.current_period_end
                ? new Date(stripeSub.current_period_end * 1000)
                : null,
            },
          });

          subscriptionUpdated = true;

          if (newStatus === 'canceled') {
            subscriptionCanceled = true;
          }
        }

        // Check for payment method changes
        if (stripeSub.default_payment_method) {
          paymentMethodUpdated = true;
        }
      } catch (error) {
        console.error('[StripePortal] Failed to sync subscription from Stripe:', error);
      }
    }

    return {
      success: true,
      subscriptionUpdated,
      paymentMethodUpdated,
      subscriptionCanceled,
    };
  } catch (error) {
    console.error('[StripePortal] Failed to handle portal return:', error);
    return { success: false, error: 'Failed to handle portal return' };
  }
}

// ===== ENSURE STRIPE CUSTOMER =====

export async function ensureStripeCustomer(userId: string, email: string, name?: string): Promise<{
  success: boolean;
  customerId?: string;
  error?: string;
}> {
  try {
    // Check if customer already exists
    const subscription = await db.subscription.findFirst({
      where: { userId },
      select: { id: true, stripeCustomerId: true },
    });

    if (subscription?.stripeCustomerId) {
      return { success: true, customerId: subscription.stripeCustomerId };
    }

    // Create a new Stripe customer
    const stripe = await import('stripe');
    const stripeClient = new stripe.default(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2024-12-18.acacia' as never,
    });

    const customer = await stripeClient.customers.create({
      email,
      name: name || undefined,
      metadata: {
        userId,
      },
    });

    // Update subscription with Stripe customer ID
    if (subscription) {
      await db.subscription.update({
        where: { id: subscription.id },
        data: { stripeCustomerId: customer.id },
      });
    }

    return { success: true, customerId: customer.id };
  } catch (error) {
    console.error('[StripePortal] Failed to ensure Stripe customer:', error);
    return { success: false, error: 'Failed to create Stripe customer' };
  }
}
