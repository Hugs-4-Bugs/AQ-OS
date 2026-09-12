// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Dedicated Billing Audit Logging
// Phase 4: Subscription System + Credits Engine + Plan Gates + Billing
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ===== BILLING EVENT TYPES =====

export type BillingEventType =
  | 'trial_started'
  | 'trial_expired'
  | 'trial_reminder_sent'
  | 'credits_added'
  | 'credits_deducted'
  | 'credits_refunded'
  | 'credit_warning'
  | 'credit_zero'
  | 'monthly_reset'
  | 'rollover_processed'
  | 'entitlement_denied'
  | 'feature_blocked'
  | 'upgrade_initiated'
  | 'upgrade_completed'
  | 'downgrade_scheduled'
  | 'downgrade_completed'
  | 'subscription_created'
  | 'subscription_canceled'
  | 'subscription_reactivated'
  | 'subscription_expired'
  | 'subscription_past_due'
  | 'coupon_validated'
  | 'coupon_applied'
  | 'coupon_rejected'
  | 'payment_initiated'
  | 'payment_completed'
  | 'payment_failed'
  | 'payment_refunded'
  | 'plan_change_scheduled'
  | 'plan_change_processed'
  | 'workflows_auto_paused'
  | 'workflows_auto_resumed';

// ===== INTERFACES =====

export interface BillingAuditParams {
  userId: string;
  action: BillingEventType | string;
  details?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface BillingAuditResult {
  success: boolean;
  auditLogId?: string;
  error?: string;
}

// ===== CORE LOGGING FUNCTION =====

/**
 * Log a billing event to the AuditLog with resource='billing'.
 * Extends the existing logAuthEvent pattern with billing-specific fields.
 * Silently fails if logging errors — never blocks the main flow.
 */
export async function logBillingEvent(params: BillingAuditParams): Promise<BillingAuditResult> {
  try {
    const details = params.metadata
      ? JSON.stringify({ ...(params.details ? { description: params.details } : {}), ...params.metadata })
      : params.details || null;

    const auditLog = await db.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        details,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        resource: 'billing',
        resourceId: params.resourceId || null,
      },
    });

    return { success: true, auditLogId: auditLog.id };
  } catch (error) {
    // Never fail the main flow due to audit logging failure
    console.error('[BillingAudit] Failed to log billing event:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ===== HELPER FUNCTIONS FOR COMMON BILLING EVENTS =====

/** Log a trial-related event */
export async function logTrialEvent(
  userId: string,
  action: 'trial_started' | 'trial_expired' | 'trial_reminder_sent',
  metadata?: { trialEndsAt?: string; daysRemaining?: number; previousPlan?: string }
): Promise<void> {
  await logBillingEvent({
    userId,
    action,
    details: `Trial event: ${action}`,
    metadata,
  });
}

/** Log a credits operation event */
export async function logCreditEvent(
  userId: string,
  action: 'credits_added' | 'credits_deducted' | 'credits_refunded' | 'credit_warning' | 'credit_zero' | 'monthly_reset' | 'rollover_processed',
  metadata: {
    amount: number;
    balance?: number;
    source?: string;
    action_type?: string;
    referenceId?: string;
  }
): Promise<void> {
  await logBillingEvent({
    userId,
    action,
    details: `Credit operation: ${action} — amount: ${metadata.amount}`,
    resourceId: metadata.referenceId,
    metadata,
  });
}

/** Log a subscription state change event */
export async function logSubscriptionEvent(
  userId: string,
  action:
    | 'subscription_created'
    | 'subscription_canceled'
    | 'subscription_reactivated'
    | 'subscription_expired'
    | 'subscription_past_due'
    | 'upgrade_initiated'
    | 'upgrade_completed'
    | 'downgrade_scheduled'
    | 'downgrade_completed'
    | 'plan_change_scheduled'
    | 'plan_change_processed'
    | 'workflows_auto_paused'
    | 'workflows_auto_resumed',
  metadata: {
    fromPlan?: string;
    toPlan?: string;
    fromStatus?: string;
    toStatus?: string;
    billingCycle?: string;
    scheduledChange?: string;
    reason?: string;
    count?: number;
  }
): Promise<void> {
  await logBillingEvent({
    userId,
    action,
    details: `Subscription event: ${action}`,
    metadata,
  });
}

/** Log an entitlement/feature gate event */
export async function logEntitlementEvent(
  userId: string,
  action: 'entitlement_denied' | 'feature_blocked',
  metadata: {
    feature: string;
    plan: string;
    reason: string;
    requiredPlan?: string;
  }
): Promise<void> {
  await logBillingEvent({
    userId,
    action,
    details: `Entitlement event: ${action} — feature: ${metadata.feature}`,
    metadata,
  });
}

/** Log a coupon event */
export async function logCouponEvent(
  userId: string,
  action: 'coupon_validated' | 'coupon_applied' | 'coupon_rejected',
  metadata: {
    code: string;
    discountAmount?: number;
    reason?: string;
  }
): Promise<void> {
  await logBillingEvent({
    userId,
    action,
    details: `Coupon event: ${action} — code: ${metadata.code}`,
    metadata,
  });
}

/** Log a payment event */
export async function logPaymentEvent(
  userId: string,
  action: 'payment_initiated' | 'payment_completed' | 'payment_failed' | 'payment_refunded',
  metadata: {
    amount: number;
    currency: string;
    provider: string;
    plan: string;
    paymentOrderId?: string;
    reason?: string;
  }
): Promise<void> {
  await logBillingEvent({
    userId,
    action,
    resourceId: metadata.paymentOrderId,
    details: `Payment event: ${action} — amount: ${metadata.amount} ${metadata.currency}`,
    metadata,
  });
}

// ===== QUERY HELPERS =====

/** Get billing audit events for a user */
export async function getBillingAuditHistory(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    action?: string;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<{ events: Array<{ id: string; action: string; details: string | null; createdAt: Date; resourceId: string | null }>; total: number }> {
  try {
    const where: Record<string, unknown> = {
      userId,
      resource: 'billing',
    };

    if (options?.action) {
      where.action = options.action;
    }

    if (options?.startDate || options?.endDate) {
      const createdAt: Record<string, Date> = {};
      if (options.startDate) createdAt.gte = options.startDate;
      if (options.endDate) createdAt.lte = options.endDate;
      where.createdAt = createdAt;
    }

    const [events, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
        select: {
          id: true,
          action: true,
          details: true,
          createdAt: true,
          resourceId: true,
        },
      }),
      db.auditLog.count({ where }),
    ]);

    return { events, total };
  } catch (error) {
    console.error('[BillingAudit] Failed to get billing audit history:', error);
    return { events: [], total: 0 };
  }
}
