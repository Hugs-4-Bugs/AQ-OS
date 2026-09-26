// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Credit Addon Fulfillment Service
// Handles fulfillment of credit addon purchases after payment confirmation.
// Called by both Stripe and Razorpay webhook handlers when they detect
// a payment order with plan='credit_addon'.
//
// IMPORTANT: Credit addon orders must NOT go through confirmPaymentAndActivate()
// because that function would set the user's plan to 'credit_addon' (invalid)
// and reset their credits, destroying their existing subscription.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { addCreditAddon } from '@/lib/credit-service';
import { logPaymentEvent, logCreditEvent } from '@/lib/billing-audit';
import { CREDIT_ADDONS, LEGACY_CREDIT_ADDONS } from '@/app/api/payments/credit-addons/route';

interface CreditAddonFulfillmentResult {
  success: boolean;
  creditsAdded?: number;
  newBalance?: number;
  error?: string;
}

/**
 * Fulfill a credit addon purchase after payment confirmation.
 *
 * Flow:
 * 1. Verify the order is a credit_addon order
 * 2. Look up the addon by ID stored in couponCode (format: "addon:credits_500")
 * 3. Mark order as completed (atomic check inside transaction)
 * 4. Add credits via addCreditAddon (atomic with ledger entry)
 * 5. Log audit events
 *
 * This is idempotent — if the order is already completed, it returns success
 * without re-adding credits.
 */
export async function fulfillCreditAddon(
  userId: string,
  paymentOrderId: string,
  providerPaymentId: string,
): Promise<CreditAddonFulfillmentResult> {
  try {
    // Fetch the order
    const order = await db.paymentOrder.findUnique({
      where: { id: paymentOrderId },
    });

    if (!order) {
      return { success: false, error: 'Payment order not found' };
    }

    if (order.userId !== userId) {
      return { success: false, error: 'Payment order does not belong to this user' };
    }

    if (order.plan !== 'credit_addon') {
      return { success: false, error: 'Not a credit addon order' };
    }

    // Idempotency: if already completed, return success
    if (order.status === 'completed') {
      return { success: true, creditsAdded: 0 };
    }

    if (order.status !== 'pending') {
      return { success: false, error: `Order is in '${order.status}' state, cannot fulfill` };
    }

    // Look up the addon by ID stored in couponCode
    const addonId = order.couponCode?.startsWith('addon:')
      ? order.couponCode.slice(6) // Remove "addon:" prefix
      : null;

    if (!addonId) {
      return { success: false, error: 'Cannot determine addon ID from order' };
    }

    // Look up the addon by ID. Active packs first; then the legacy map so
    // in-flight orders created before a pack retirement (e.g. "addon:credits_100")
    // still fulfill with their original credit amount. Payment safety: a
    // customer who already paid must always receive their credits.
    const addon =
      CREDIT_ADDONS.find(a => a.id === addonId) ??
      LEGACY_CREDIT_ADDONS.find(a => a.id === addonId);
    if (!addon) {
      return { success: false, error: `Unknown addon ID: ${addonId}` };
    }

    // Atomic: claim the pending→completed transition. SECURITY/CONSISTENCY
    // HARDENING: updateMany with a status guard returns the number of rows
    // actually updated, so exactly ONE concurrent caller wins the claim.
    // (The previous transaction version flipped the status but still ran
    // addCreditAddon unconditionally afterwards — N concurrent calls could
    // grant credits N times for one payment.)
    const claimed = await db.paymentOrder.updateMany({
      where: { id: paymentOrderId, status: 'pending' },
      data: {
        status: 'completed',
        providerPaymentId,
      },
    });

    if (claimed.count === 0) {
      // Another concurrent call already fulfilled this order — idempotent no-op
      return { success: true, creditsAdded: 0 };
    }

    // Add credits via the credit service (creates CreditAddon record + CreditsLedger entry)
    const addonResult = await addCreditAddon({
      userId,
      credits: addon.credits,
      pricePaid: order.amount,
      currency: order.currency,
      paymentOrderId,
      expiresAt: undefined, // Addon credits don't expire by default
    });

    if (!addonResult.success) {
      console.error('[CreditAddonFulfillment] Failed to add credits:', addonResult.error);
      return { success: false, error: addonResult.error || 'Failed to add addon credits' };
    }

    // Log audit events
    await logPaymentEvent(userId, 'payment_completed', {
      amount: order.amount,
      currency: order.currency,
      provider: order.provider,
      plan: 'credit_addon',
      paymentOrderId,
      addonId,
      creditsAdded: addon.credits,
    });

    await logCreditEvent(userId, 'credits_added', {
      amount: addon.credits,
      balance: addonResult.newBalance,
      source: 'addon_purchase',
      addonId,
    });

    return {
      success: true,
      creditsAdded: addon.credits,
      newBalance: addonResult.newBalance,
    };
  } catch (error) {
    console.error('[CreditAddonFulfillment] Failed to fulfill credit addon:', error);
    return { success: false, error: 'Failed to fulfill credit addon purchase' };
  }
}

/**
 * Check if a payment order is a credit addon order.
 * Used by webhook handlers to route to the correct fulfillment path.
 */
export function isCreditAddonOrder(order: { plan: string }): boolean {
  return order.plan === 'credit_addon';
}
