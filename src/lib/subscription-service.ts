// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Complete Subscription Lifecycle Management
// Phase 4: Subscription System + Credits Engine + Plan Gates + Billing
//
// Subscription states: trialing → active → past_due → canceled → expired
// Plan hierarchy: free < pro < elite
// Billing cycles: monthly, yearly
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logSubscriptionEvent } from '@/lib/billing-audit';
import { PLAN_CREDITS, type PlanType, getPlanLevel, getPlanChangeDirection, isValidPlanChange } from '@/lib/entitlement-service';
import { resetMonthlyCredits } from '@/lib/credit-service';

// ===== TYPES =====

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
export type BillingCycle = 'monthly' | 'yearly';

// ===== VALID STATE TRANSITIONS =====

export const VALID_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  trialing: ['active', 'expired', 'canceled'],
  active: ['past_due', 'canceled', 'expired'],
  past_due: ['active', 'canceled', 'expired'],
  canceled: ['expired'],
  expired: [], // Terminal state
};

// ===== INTERFACES =====

export interface SubscriptionResult {
  success: boolean;
  subscription?: {
    id: string;
    plan: string;
    status: SubscriptionStatus;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    scheduledPlanChange: string | null;
    isTrial: boolean;
    trialEndsAt: Date | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    razorpaySubscriptionId: string | null;
  };
  error?: string;
}

export interface SubscriptionStatusResult {
  subscription: {
    id: string;
    plan: PlanType;
    status: SubscriptionStatus;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    scheduledPlanChange: string | null;
    isTrial: boolean;
    trialEndsAt: Date | null;
  } | null;
  planDetails: {
    plan: PlanType;
    creditsMonthly: number;
    creditsRemaining: number;
  };
  trialInfo: {
    isTrial: boolean;
    trialEndsAt: Date | null;
    daysRemaining: number;
  };
}

export interface UpgradeResult {
  success: boolean;
  paymentOrderId?: string;
  effectiveImmediately?: boolean;
  error?: string;
}

export interface DowngradeResult {
  success: boolean;
  scheduledFor?: Date;
  newPlan?: PlanType;
  error?: string;
}

export interface CancelResult {
  success: boolean;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: Date | null;
  error?: string;
}

export interface ReactivateResult {
  success: boolean;
  status?: SubscriptionStatus;
  error?: string;
}

export interface StateTransitionResult {
  success: boolean;
  previousStatus?: SubscriptionStatus;
  newStatus?: SubscriptionStatus;
  error?: string;
}

export interface ScheduledChangeResult {
  success: boolean;
  processed?: boolean;
  newPlan?: PlanType;
  error?: string;
}

// ===== SUBSCRIPTION SERVICE FUNCTIONS =====

/**
 * Get user's active subscription or create one (default: free plan, trialing).
 * If no subscription exists, creates one with free plan and trialing status.
 */
export async function getOrCreateSubscription(userId: string): Promise<SubscriptionResult> {
  try {
    // Look for any active subscription
    let subscription = await db.subscription.findFirst({
      where: {
        userId,
        status: { in: ['trialing', 'active', 'past_due'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (subscription) {
      return {
        success: true,
        subscription: {
          id: subscription.id,
          plan: subscription.plan,
          status: subscription.status as SubscriptionStatus,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          scheduledPlanChange: subscription.scheduledPlanChange,
          isTrial: subscription.isTrial,
          trialEndsAt: subscription.trialEndsAt,
          stripeCustomerId: subscription.stripeCustomerId,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          razorpaySubscriptionId: subscription.razorpaySubscriptionId,
        },
      };
    }

    // No active subscription — create one with free plan
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    subscription = await db.subscription.create({
      data: {
        userId,
        plan: 'free',
        status: 'trialing',
        isTrial: true,
        trialEndsAt: periodEnd,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });

    // Log creation
    await logSubscriptionEvent(userId, 'subscription_created', {
      fromPlan: undefined,
      toPlan: 'free',
      toStatus: 'trialing',
    });

    return {
      success: true,
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status as SubscriptionStatus,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        scheduledPlanChange: subscription.scheduledPlanChange,
        isTrial: subscription.isTrial,
        trialEndsAt: subscription.trialEndsAt,
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        razorpaySubscriptionId: subscription.razorpaySubscriptionId,
      },
    };
  } catch (error) {
    console.error('[SubscriptionService] Failed to get/create subscription:', error);
    return { success: false, error: 'Failed to get or create subscription' };
  }
}

/**
 * Returns subscription with current state, plan details, and trial info.
 */
export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatusResult> {
  try {
    const subscription = await db.subscription.findFirst({
      where: {
        userId,
        status: { in: ['trialing', 'active', 'past_due', 'canceled'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { credits: true, creditsMonthly: true, plan: true, isTrial: true, trialEndsAt: true },
    });

    const plan = (user?.plan || 'free') as PlanType;
    const creditsMonthly = PLAN_CREDITS[plan] || PLAN_CREDITS.free;

    // Calculate trial days remaining
    let trialDaysRemaining = 0;
    if (user?.isTrial && user.trialEndsAt) {
      const now = new Date();
      if (user.trialEndsAt > now) {
        trialDaysRemaining = Math.ceil(
          (user.trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        );
      }
    }

    return {
      subscription: subscription ? {
        id: subscription.id,
        plan: subscription.plan as PlanType,
        status: subscription.status as SubscriptionStatus,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        scheduledPlanChange: subscription.scheduledPlanChange,
        isTrial: subscription.isTrial,
        trialEndsAt: subscription.trialEndsAt,
      } : null,
      planDetails: {
        plan,
        creditsMonthly,
        creditsRemaining: user?.credits ?? 0,
      },
      trialInfo: {
        isTrial: user?.isTrial ?? false,
        trialEndsAt: user?.trialEndsAt ?? null,
        daysRemaining: trialDaysRemaining,
      },
    };
  } catch (error) {
    console.error('[SubscriptionService] Failed to get subscription status:', error);
    return {
      subscription: null,
      planDetails: { plan: 'free', creditsMonthly: PLAN_CREDITS.free, creditsRemaining: 0 },
      trialInfo: { isTrial: false, trialEndsAt: null, daysRemaining: 0 },
    };
  }
}

/**
 * Handle plan upgrade (create payment order, schedule change).
 * Upgrades are effective immediately after payment.
 */
export async function upgradeSubscription(
  userId: string,
  plan: PlanType,
  billingCycle: BillingCycle = 'monthly'
): Promise<UpgradeResult> {
  try {
    // Get current subscription
    const subResult = await getOrCreateSubscription(userId);
    if (!subResult.success || !subResult.subscription) {
      return { success: false, error: subResult.error || 'No subscription found' };
    }

    const currentPlan = subResult.subscription.plan as PlanType;

    // Validate plan change
    if (!isValidPlanChange(currentPlan, plan)) {
      return { success: false, error: 'Invalid plan change' };
    }

    const direction = getPlanChangeDirection(currentPlan, plan);
    if (direction !== 'upgrade') {
      return { success: false, error: 'This is not an upgrade. Use downgradeSubscription instead.' };
    }

    // Calculate pricing
    const pricing = getPlanPricing(plan, billingCycle);

    // Create a payment order
    const now = new Date();
    const periodEnd = billingCycle === 'monthly'
      ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    const paymentOrder = await db.paymentOrder.create({
      data: {
        userId,
        provider: 'razorpay',
        amount: pricing.amount,
        currency: pricing.currency,
        plan,
        billingCycle,
        status: 'pending',
        subtotal: pricing.amount,
        taxRate: 0,
        taxAmount: 0,
      },
    });

    // Log the upgrade initiation
    await logSubscriptionEvent(userId, 'upgrade_initiated', {
      fromPlan: currentPlan,
      toPlan: plan,
      billingCycle,
    });

    return {
      success: true,
      paymentOrderId: paymentOrder.id,
      effectiveImmediately: false, // Will be true after payment confirmation
    };
  } catch (error) {
    console.error('[SubscriptionService] Failed to upgrade subscription:', error);
    return { success: false, error: 'Failed to upgrade subscription' };
  }
}

/**
 * Handle downgrade (schedule for end of period).
 * Downgrades take effect at the end of the current billing period.
 */
export async function downgradeSubscription(userId: string, plan: PlanType): Promise<DowngradeResult> {
  try {
    // Get current subscription
    const subResult = await getOrCreateSubscription(userId);
    if (!subResult.success || !subResult.subscription) {
      return { success: false, error: subResult.error || 'No subscription found' };
    }

    const currentPlan = subResult.subscription.plan as PlanType;

    // Validate plan change
    if (!isValidPlanChange(currentPlan, plan)) {
      return { success: false, error: 'Invalid plan change' };
    }

    const direction = getPlanChangeDirection(currentPlan, plan);
    if (direction !== 'downgrade') {
      return { success: false, error: 'This is not a downgrade. Use upgradeSubscription instead.' };
    }

    // Schedule the downgrade for end of current period
    const scheduledFor = subResult.subscription.currentPeriodEnd || new Date();

    await db.subscription.update({
      where: { id: subResult.subscription.id },
      data: {
        scheduledPlanChange: plan,
      },
    });

    // Log the scheduled downgrade
    await logSubscriptionEvent(userId, 'downgrade_scheduled', {
      fromPlan: currentPlan,
      toPlan: plan,
      scheduledChange: plan,
    });

    return {
      success: true,
      scheduledFor,
      newPlan: plan,
    };
  } catch (error) {
    console.error('[SubscriptionService] Failed to downgrade subscription:', error);
    return { success: false, error: 'Failed to downgrade subscription' };
  }
}

/**
 * Cancel subscription at end of period.
 * Sets cancelAtPeriodEnd = true but keeps the subscription active until the period ends.
 */
export async function cancelSubscription(userId: string): Promise<CancelResult> {
  try {
    const subResult = await getOrCreateSubscription(userId);
    if (!subResult.success || !subResult.subscription) {
      return { success: false, error: subResult.error || 'No subscription found' };
    }

    if (subResult.subscription.status === 'canceled') {
      return { success: false, error: 'Subscription is already canceled' };
    }

    if (subResult.subscription.status === 'expired') {
      return { success: false, error: 'Subscription is already expired' };
    }

    // Set cancelAtPeriodEnd = true
    await db.subscription.update({
      where: { id: subResult.subscription.id },
      data: { cancelAtPeriodEnd: true },
    });

    // Log the cancellation
    await logSubscriptionEvent(userId, 'subscription_canceled', {
      fromStatus: subResult.subscription.status,
      toStatus: subResult.subscription.status, // Status doesn't change yet
    });

    return {
      success: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: subResult.subscription.currentPeriodEnd,
    };
  } catch (error) {
    console.error('[SubscriptionService] Failed to cancel subscription:', error);
    return { success: false, error: 'Failed to cancel subscription' };
  }
}

/**
 * Reactivate a canceled subscription.
 * Removes the cancelAtPeriodEnd flag.
 */
export async function reactivateSubscription(userId: string): Promise<ReactivateResult> {
  try {
    const subscription = await db.subscription.findFirst({
      where: {
        userId,
        cancelAtPeriodEnd: true,
        status: { in: ['active', 'trialing'] },
      },
    });

    if (!subscription) {
      return { success: false, error: 'No canceled subscription found to reactivate' };
    }

    // Remove the cancelAtPeriodEnd flag
    await db.subscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: false,
        scheduledPlanChange: null,
      },
    });

    // Log the reactivation
    await logSubscriptionEvent(userId, 'subscription_reactivated', {
      fromStatus: subscription.status as SubscriptionStatus,
      toStatus: subscription.status as SubscriptionStatus,
    });

    return {
      success: true,
      status: subscription.status as SubscriptionStatus,
    };
  } catch (error) {
    console.error('[SubscriptionService] Failed to reactivate subscription:', error);
    return { success: false, error: 'Failed to reactivate subscription' };
  }
}

/**
 * Check if trial has expired, auto-downgrade if so.
 * Returns true if trial was expired (and downgraded), false if still active.
 */
export async function checkTrialExpiry(userId: string): Promise<boolean> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { isTrial: true, trialEndsAt: true },
    });

    if (!user || !user.isTrial || !user.trialEndsAt) {
      return false;
    }

    const now = new Date();
    if (user.trialEndsAt > now) {
      // Trial still active
      return false;
    }

    // Trial expired — downgrade to free
    const freeCredits = PLAN_CREDITS.free;

    await db.$transaction(async (tx) => {
      // Update user
      await tx.user.update({
        where: { id: userId },
        data: {
          plan: 'free',
          isTrial: false,
          trialEndsAt: null,
          credits: freeCredits,
          creditsMonthly: freeCredits,
          rolloverCredits: 0,
        },
      });

      // Update subscription
      await tx.subscription.updateMany({
        where: { userId, status: 'trialing' },
        data: {
          status: 'expired',
          isTrial: false,
          trialEndsAt: null,
        },
      });

      // Auto-pause all active workflows on trial expiry
      // The disabledBySubscription flag distinguishes system-paused (true)
      // from user-paused (false); only system-paused auto-resumes on repurchase.
      await tx.workflowDefinition.updateMany({
        where: { userId, status: 'active' },
        data: { status: 'paused', disabledBySubscription: true },
      });

      // Create ledger entry
      await tx.creditsLedger.create({
        data: {
          userId,
          action: 'trial_expired',
          credits: freeCredits,
          balance: freeCredits,
          description: 'Trial expired — auto-downgraded to free plan',
        },
      });
    });

    // Log the event
    await logSubscriptionEvent(userId, 'subscription_expired', {
      fromPlan: 'pro',
      toPlan: 'free',
      fromStatus: 'trialing',
      toStatus: 'expired',
    });
    await logSubscriptionEvent(userId, 'workflows_auto_paused', {
      reason: 'trial_expired',
      fromStatus: 'trialing',
      toStatus: 'expired',
    });

    return true;
  } catch (error) {
    console.error('[SubscriptionService] Failed to check trial expiry:', error);
    return false;
  }
}

/**
 * Validate and execute state transitions.
 * Only allows valid transitions per the VALID_TRANSITIONS map.
 */
export async function handleSubscriptionStateTransition(
  userId: string,
  fromStatus: SubscriptionStatus,
  toStatus: SubscriptionStatus
): Promise<StateTransitionResult> {
  try {
    // Validate transition
    const allowedTransitions = VALID_TRANSITIONS[fromStatus];
    if (!allowedTransitions || !allowedTransitions.includes(toStatus)) {
      return {
        success: false,
        previousStatus: fromStatus,
        error: `Invalid transition: ${fromStatus} → ${toStatus}`,
      };
    }

    // Find and update the subscription
    const subscription = await db.subscription.findFirst({
      where: {
        userId,
        status: fromStatus,
      },
    });

    if (!subscription) {
      return {
        success: false,
        previousStatus: fromStatus,
        error: `No subscription found with status ${fromStatus}`,
      };
    }

    await db.subscription.update({
      where: { id: subscription.id },
      data: { status: toStatus },
    });

    // Handle specific transitions
    if (toStatus === 'expired') {
      // Downgrade to free plan on expiration
      const freeCredits = PLAN_CREDITS.free;
      await db.user.update({
        where: { id: userId },
        data: {
          plan: 'free',
          isTrial: false,
          trialEndsAt: null,
          credits: freeCredits,
          creditsMonthly: freeCredits,
          rolloverCredits: 0,
        },
      });

      // Reset monthly credits
      await resetMonthlyCredits(userId, 'free');

      // Auto-pause all active workflows (NEVER delete — just pause + flag)
      // The disabledBySubscription flag distinguishes system-paused (true)
      // from user-paused (false); only system-paused auto-resumes on repurchase.
      await db.workflowDefinition.updateMany({
        where: { userId, status: 'active' },
        data: { status: 'paused', disabledBySubscription: true },
      });
      await logSubscriptionEvent(userId, 'workflows_auto_paused', {
        reason: 'subscription_expired',
        fromStatus,
        toStatus,
      });
    }

    if (toStatus === 'active' && fromStatus === 'trialing') {
      // Transition from trial to active — ensure user record matches subscription
      await db.user.update({
        where: { id: userId },
        data: {
          isTrial: false,
        },
      });
    }

    // Log the transition
    await logSubscriptionEvent(userId, 'plan_change_processed', {
      fromStatus,
      toStatus,
    });

    return {
      success: true,
      previousStatus: fromStatus,
      newStatus: toStatus,
    };
  } catch (error) {
    console.error('[SubscriptionService] Failed to handle state transition:', error);
    return {
      success: false,
      previousStatus: fromStatus,
      error: 'Failed to handle subscription state transition',
    };
  }
}

/**
 * Process any scheduled plan changes for a user.
 * Called at the end of a billing period.
 */
export async function processScheduledPlanChange(userId: string): Promise<ScheduledChangeResult> {
  try {
    const subscription = await db.subscription.findFirst({
      where: {
        userId,
        status: { in: ['active', 'trialing'] },
        scheduledPlanChange: { not: null },
      },
    });

    if (!subscription || !subscription.scheduledPlanChange) {
      return { success: true, processed: false };
    }

    // Check if current period has ended
    const now = new Date();
    if (subscription.currentPeriodEnd && subscription.currentPeriodEnd > now) {
      // Period hasn't ended yet — don't process
      return {
        success: true,
        processed: false,
        error: 'Current period has not ended yet',
      };
    }

    const newPlan = subscription.scheduledPlanChange as PlanType;
    const previousPlan = subscription.plan as PlanType;

    // Execute the plan change
    await db.$transaction(async (tx) => {
      // Update subscription
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          plan: newPlan,
          scheduledPlanChange: null,
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // Update user
      const newCredits = PLAN_CREDITS[newPlan] || PLAN_CREDITS.free;
      await tx.user.update({
        where: { id: userId },
        data: {
          plan: newPlan,
          creditsMonthly: newCredits,
          // Don't change credits immediately — they'll reset on rollover
        },
      });

      // Auto-pause all active workflows on scheduled downgrade to free
      // The disabledBySubscription flag distinguishes system-paused (true)
      // from user-paused (false); only system-paused auto-resumes on repurchase.
      if (newPlan === 'free' && previousPlan !== 'free') {
        await tx.workflowDefinition.updateMany({
          where: { userId, status: 'active' },
          data: { status: 'paused', disabledBySubscription: true },
        });
      }
    });

    // Reset monthly credits for the new plan
    await resetMonthlyCredits(userId, newPlan);

    // Log the plan change
    const direction = getPlanChangeDirection(previousPlan, newPlan);
    await logSubscriptionEvent(userId, direction === 'downgrade' ? 'downgrade_completed' : 'upgrade_completed', {
      fromPlan: previousPlan,
      toPlan: newPlan,
    });

    if (newPlan === 'free' && previousPlan !== 'free') {
      await logSubscriptionEvent(userId, 'workflows_auto_paused', {
        reason: 'scheduled_downgrade_to_free',
        fromPlan: previousPlan,
        toPlan: newPlan,
      });
    }

    return {
      success: true,
      processed: true,
      newPlan,
    };
  } catch (error) {
    console.error('[SubscriptionService] Failed to process scheduled plan change:', error);
    return { success: false, error: 'Failed to process scheduled plan change' };
  }
}

// ===== HELPER FUNCTIONS =====

/**
 * Get pricing for a plan and billing cycle.
 */
function getPlanPricing(plan: PlanType, billingCycle: BillingCycle): {
  amount: number;
  currency: string;
} {
  const PRICING: Record<PlanType, { monthly: number; yearly: number; currency: string }> = {
    free: { monthly: 0, yearly: 0, currency: 'USD' },
    pro: { monthly: 29, yearly: 279, currency: 'USD' },
    elite: { monthly: 89, yearly: 849, currency: 'USD' },
  };

  const planPricing = PRICING[plan] || PRICING.free;
  return {
    amount: billingCycle === 'monthly' ? planPricing.monthly : planPricing.yearly,
    currency: planPricing.currency,
  };
}

/**
 * Confirm a payment and activate the subscription upgrade.
 * Called after payment gateway confirms successful payment.
 */
export async function confirmPaymentAndActivate(
  userId: string,
  paymentOrderId: string,
  providerPaymentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate user owns the order (lightweight check outside tx is fine)
    const paymentOrderPreCheck = await db.paymentOrder.findUnique({
      where: { id: paymentOrderId },
    });

    if (!paymentOrderPreCheck) {
      return { success: false, error: 'Payment order not found' };
    }

    if (paymentOrderPreCheck.userId !== userId) {
      return { success: false, error: 'Payment order does not belong to this user' };
    }

    const newPlan = paymentOrderPreCheck.plan as PlanType;
    const now = new Date();

    await db.$transaction(async (tx) => {
      // Atomic check: find the order with status 'pending' inside the transaction.
      // If two concurrent webhooks race, only one will find status='pending';
      // the other gets null and skips (idempotent).
      const paymentOrder = await tx.paymentOrder.findFirst({
        where: { id: paymentOrderId, status: 'pending' },
      });

      if (!paymentOrder) {
        // Already processed by another concurrent call — silently succeed (idempotent)
        return;
      }

      // Mark as completed atomically
      await tx.paymentOrder.update({
        where: { id: paymentOrderId },
        data: {
          status: 'completed',
          providerPaymentId,
        },
      });

      // Update or create subscription
      const subscription = await tx.subscription.findFirst({
        where: { userId, status: { in: ['trialing', 'active', 'past_due'] } },
      });

      const periodEnd = paymentOrder.billingCycle === 'monthly'
        ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
        : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

      if (subscription) {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            plan: newPlan,
            status: 'active',
            isTrial: false,
            trialEndsAt: null,
            cancelAtPeriodEnd: false,
            scheduledPlanChange: null,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        });
      } else {
        // No active subscription found — create one
        await tx.subscription.create({
          data: {
            userId,
            plan: newPlan,
            status: 'active',
            isTrial: false,
            trialEndsAt: null,
            cancelAtPeriodEnd: false,
            scheduledPlanChange: null,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            billingCycle: paymentOrder.billingCycle || 'monthly',
          },
        });
      }

      // Update user — preserve existing credits as rollover, add new plan credits
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true, creditsMonthly: true, rolloverCredits: true },
      });
      const previousCredits = user?.credits ?? 0;
      const newPlanCredits = PLAN_CREDITS[newPlan] || PLAN_CREDITS.free;

      // Calculate rollover: unused credits from current plan carry forward
      // Only rollover the unused portion (credits above 0 that haven't been used)
      const unusedCredits = Math.max(0, previousCredits);
      const rolloverCredits = unusedCredits; // Preserve all unused credits as rollover
      const newCredits = newPlanCredits + rolloverCredits;

      await tx.user.update({
        where: { id: userId },
        data: {
          plan: newPlan,
          isTrial: false,
          trialEndsAt: null,
          credits: newCredits,
          creditsMonthly: newPlanCredits,
          rolloverCredits: rolloverCredits,
        },
      });

      // Create ledger entry — record the full credit adjustment
      const creditDelta = newCredits - previousCredits;
      await tx.creditsLedger.create({
        data: {
          userId,
          action: 'plan_upgrade',
          credits: creditDelta,
          balance: newCredits,
          description: `Upgraded to ${newPlan} plan — ${newPlanCredits} plan credits + ${rolloverCredits} rollover from previous plan (total: ${newCredits})`,
          referenceId: paymentOrderId,
        },
      });

      // Auto-resume workflows that were paused by subscription expiry.
      // Only resumes disabledBySubscription=true workflows; user-paused workflows
      // stay paused (user intent preserved).
      if (newPlan !== 'free') {
        await tx.workflowDefinition.updateMany({
          where: { userId, status: 'paused', disabledBySubscription: true },
          data: { status: 'active', disabledBySubscription: false },
        });
      }
    });

    // Log the upgrade completion
    await logSubscriptionEvent(userId, 'upgrade_completed', {
      toPlan: newPlan,
      billingCycle: paymentOrderPreCheck.billingCycle,
    });

    if (newPlan !== 'free') {
      await logSubscriptionEvent(userId, 'workflows_auto_resumed', {
        reason: 'payment_activated',
        toPlan: newPlan,
      });
    }

    return { success: true };
  } catch (error) {
    console.error('[SubscriptionService] Failed to confirm payment:', error);
    return { success: false, error: 'Failed to confirm payment and activate subscription' };
  }
}

/**
 * Process all subscriptions that need end-of-period handling.
 * Can be called by a scheduled job/cron.
 * - Expires canceled subscriptions whose period has ended
 * - Processes scheduled plan changes
 */
export async function processEndOfPeriodSubscriptions(): Promise<{
  checked: number;
  expired: number;
  planChanged: number;
}> {
  try {
    const now = new Date();
    let expired = 0;
    let planChanged = 0;

    // Find subscriptions with cancelAtPeriodEnd = true and period has ended
    const toExpire = await db.subscription.findMany({
      where: {
        cancelAtPeriodEnd: true,
        currentPeriodEnd: { lte: now },
        status: { in: ['active', 'trialing'] },
      },
    });

    for (const sub of toExpire) {
      const result = await handleSubscriptionStateTransition(sub.userId, sub.status as SubscriptionStatus, 'expired');
      if (result.success) expired++;
    }

    // Find subscriptions with scheduled plan changes
    const withScheduledChange = await db.subscription.findMany({
      where: {
        scheduledPlanChange: { not: null },
        status: { in: ['active', 'trialing'] },
        currentPeriodEnd: { lte: now },
      },
    });

    for (const sub of withScheduledChange) {
      const result = await processScheduledPlanChange(sub.userId);
      if (result.processed) planChanged++;
    }

    return {
      checked: toExpire.length + withScheduledChange.length,
      expired,
      planChanged,
    };
  } catch (error) {
    console.error('[SubscriptionService] Failed to process end-of-period subscriptions:', error);
    return { checked: 0, expired: 0, planChanged: 0 };
  }
}
