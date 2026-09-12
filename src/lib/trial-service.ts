// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Complete Trial Management Service
// Phase 4: Subscription System + Credits Engine + Plan Gates + Billing
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logTrialEvent } from '@/lib/billing-audit';
import { PLAN_CREDITS, type PlanType } from '@/lib/entitlement-service';

// ===== CONSTANTS =====

const TRIAL_DURATION_DAYS = 14;
const TRIAL_PLAN: PlanType = 'pro';

// ===== INTERFACES =====

export interface TrialStartResult {
  success: boolean;
  trialEndsAt: Date | null;
  error?: string;
}

export interface TrialStatusResult {
  isActive: boolean;
  isExpired: boolean;
  trialEndsAt: Date | null;
  daysRemaining: number;
  hasUsedTrial: boolean;
}

export interface TrialInfoResult {
  isActive: boolean;
  isExpired: boolean;
  trialEndsAt: Date | null;
  startedAt: Date | null;
  daysRemaining: number;
  daysTotal: number;
  plan: PlanType;
  hasUsedTrial: boolean;
}

export interface TrialExpiryResult {
  expired: boolean;
  previousPlan: PlanType;
  newPlan: PlanType;
  previousCredits: number;
  newCredits: number;
}

// ===== TRIAL SERVICE FUNCTIONS =====

/**
 * Start a 14-day Pro trial for a user.
 * - Sets user.isTrial = true
 * - Sets user.trialEndsAt = now + 14 days
 * - Sets user.plan = 'pro'
 * - Sets user.credits = 500, creditsMonthly = 500
 * - Creates/updates Subscription record with status='trialing'
 * - Logs audit event 'trial_started'
 */
export async function startTrial(userId: string): Promise<TrialStartResult> {
  try {
    // Check if user has already used a trial
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, isTrial: true, trialEndsAt: true, plan: true },
    });

    if (!user) {
      return { success: false, trialEndsAt: null, error: 'User not found' };
    }

    // Check if user already has an active or past trial
    const hasUsedTrial = await hasUsedTrialByEmail(user.email);
    if (hasUsedTrial) {
      return { success: false, trialEndsAt: null, error: 'Trial has already been used for this email' };
    }

    // If user is already on a paid plan, don't start trial
    if (user.plan === 'pro' || user.plan === 'elite') {
      if (!user.isTrial) {
        return { success: false, trialEndsAt: null, error: 'User is already on a paid plan' };
      }
    }

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
    const trialCredits = PLAN_CREDITS[TRIAL_PLAN];

    // Use transaction for atomicity
    await db.$transaction(async (tx) => {
      // Update user record
      await tx.user.update({
        where: { id: userId },
        data: {
          isTrial: true,
          trialEndsAt,
          plan: TRIAL_PLAN,
          credits: trialCredits,
          creditsMonthly: trialCredits,
        },
      });

      // Create or update subscription record
      const existingSub = await tx.subscription.findFirst({
        where: { userId, status: { in: ['trialing', 'active'] } },
      });

      if (existingSub) {
        await tx.subscription.update({
          where: { id: existingSub.id },
          data: {
            plan: TRIAL_PLAN,
            status: 'trialing',
            isTrial: true,
            trialEndsAt,
            currentPeriodStart: now,
            currentPeriodEnd: trialEndsAt,
          },
        });
      } else {
        await tx.subscription.create({
          data: {
            userId,
            plan: TRIAL_PLAN,
            status: 'trialing',
            isTrial: true,
            trialEndsAt,
            currentPeriodStart: now,
            currentPeriodEnd: trialEndsAt,
          },
        });
      }

      // Create credits ledger entry for trial credits
      await tx.creditsLedger.create({
        data: {
          userId,
          action: 'trial_started',
          credits: trialCredits,
          balance: trialCredits,
          description: `${TRIAL_DURATION_DAYS}-day Pro trial started with ${trialCredits} credits`,
        },
      });
    });

    // Log audit event
    await logTrialEvent(userId, 'trial_started', {
      trialEndsAt: trialEndsAt.toISOString(),
      daysRemaining: TRIAL_DURATION_DAYS,
    });

    return { success: true, trialEndsAt };
  } catch (error) {
    console.error('[TrialService] Failed to start trial:', error);
    return {
      success: false,
      trialEndsAt: null,
      error: error instanceof Error ? error.message : 'Failed to start trial',
    };
  }
}

/**
 * Check if a user's trial is still active.
 */
export async function checkTrialStatus(userId: string): Promise<TrialStatusResult> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { isTrial: true, trialEndsAt: true, email: true },
    });

    if (!user) {
      return {
        isActive: false,
        isExpired: false,
        trialEndsAt: null,
        daysRemaining: 0,
        hasUsedTrial: false,
      };
    }

    const now = new Date();
    const trialEndsAt = user.trialEndsAt;
    const isActive = user.isTrial && !!trialEndsAt && trialEndsAt > now;
    const isExpired = user.isTrial && !!trialEndsAt && trialEndsAt <= now;

    const daysRemaining = isActive && trialEndsAt
      ? Math.ceil((trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      : 0;

    const usedTrial = await hasUsedTrialByEmail(user.email);

    return {
      isActive,
      isExpired,
      trialEndsAt,
      daysRemaining,
      hasUsedTrial: usedTrial,
    };
  } catch (error) {
    console.error('[TrialService] Failed to check trial status:', error);
    return {
      isActive: false,
      isExpired: false,
      trialEndsAt: null,
      daysRemaining: 0,
      hasUsedTrial: false,
    };
  }
}

/**
 * Handle trial expiration.
 * - Downgrades to free plan
 * - Sets user.plan = 'free', isTrial = false
 * - Sets credits = 50, creditsMonthly = 50
 * - Updates Subscription status to 'expired'
 * - Logs audit event 'trial_expired'
 * - Returns true if trial was expired, false if still active
 */
export async function expireTrial(userId: string): Promise<TrialExpiryResult> {
  try {
    const status = await checkTrialStatus(userId);

    // If trial is still active, do nothing
    if (status.isActive) {
      return {
        expired: false,
        previousPlan: 'pro',
        newPlan: 'pro',
        previousCredits: 0,
        newCredits: 0,
      };
    }

    // If user is not on trial, nothing to expire
    if (!status.isExpired) {
      return {
        expired: false,
        previousPlan: 'free',
        newPlan: 'free',
        previousCredits: 0,
        newCredits: 0,
      };
    }

    const freeCredits = PLAN_CREDITS.free;
    let previousCredits = 0;
    let previousPlan: PlanType = 'pro';

    // Use transaction for atomicity
    await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true, plan: true },
      });

      if (user) {
        previousCredits = user.credits;
        previousPlan = user.plan as PlanType;
      }

      // Update user record
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

      // Update subscription status
      await tx.subscription.updateMany({
        where: { userId, status: 'trialing' },
        data: {
          status: 'expired',
          isTrial: false,
          trialEndsAt: null,
        },
      });

      // Create credits ledger entry for reset
      await tx.creditsLedger.create({
        data: {
          userId,
          action: 'trial_expired',
          credits: freeCredits,
          balance: freeCredits,
          description: `Trial expired — downgraded to free plan with ${freeCredits} credits`,
        },
      });
    });

    // Log audit event
    await logTrialEvent(userId, 'trial_expired', {
      previousPlan,
      trialEndsAt: status.trialEndsAt?.toISOString(),
    });

    return {
      expired: true,
      previousPlan,
      newPlan: 'free',
      previousCredits,
      newCredits: freeCredits,
    };
  } catch (error) {
    console.error('[TrialService] Failed to expire trial:', error);
    return {
      expired: false,
      previousPlan: 'free',
      newPlan: 'free',
      previousCredits: 0,
      newCredits: 0,
    };
  }
}

/**
 * Check if an email has ever had a trial (one per email).
 * Checks both currently trialing users and any user with a past trial subscription.
 */
export async function hasUsedTrial(email: string): Promise<boolean> {
  return hasUsedTrialByEmail(email);
}

/**
 * Internal: Check if email has used a trial by looking at user records and subscriptions.
 */
async function hasUsedTrialByEmail(email: string): Promise<boolean> {
  try {
    // Check if any user with this email has ever been on trial
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, isTrial: true, trialEndsAt: true },
    });

    if (!user) return false;

    // Check if they're currently on trial or have been
    if (user.isTrial || user.trialEndsAt) return true;

    // Check subscription history for any trial records
    const trialSubscription = await db.subscription.findFirst({
      where: {
        userId: user.id,
        isTrial: true,
      },
    });

    return !!trialSubscription;
  } catch (error) {
    console.error('[TrialService] Failed to check trial usage:', error);
    return false;
  }
}

/**
 * Get days remaining in the trial.
 * Returns 0 if not on trial or trial has expired.
 */
export async function getTrialDaysRemaining(userId: string): Promise<number> {
  const status = await checkTrialStatus(userId);
  return status.daysRemaining;
}

/**
 * Get full trial info object for a user.
 */
export async function getTrialInfo(userId: string): Promise<TrialInfoResult> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        isTrial: true,
        trialEndsAt: true,
        plan: true,
        email: true,
        createdAt: true,
      },
    });

    if (!user) {
      return {
        isActive: false,
        isExpired: false,
        trialEndsAt: null,
        startedAt: null,
        daysRemaining: 0,
        daysTotal: TRIAL_DURATION_DAYS,
        plan: 'free',
        hasUsedTrial: false,
      };
    }

    const now = new Date();
    const trialEndsAt = user.trialEndsAt;
    const isActive = user.isTrial && !!trialEndsAt && trialEndsAt > now;
    const isExpired = user.isTrial && !!trialEndsAt && trialEndsAt <= now;

    const daysRemaining = isActive && trialEndsAt
      ? Math.ceil((trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      : 0;

    // Estimate start date from trial end
    const startedAt = trialEndsAt
      ? new Date(trialEndsAt.getTime() - TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000)
      : null;

    const usedTrial = await hasUsedTrialByEmail(user.email);

    return {
      isActive,
      isExpired,
      trialEndsAt,
      startedAt,
      daysRemaining,
      daysTotal: TRIAL_DURATION_DAYS,
      plan: user.plan as PlanType,
      hasUsedTrial: usedTrial,
    };
  } catch (error) {
    console.error('[TrialService] Failed to get trial info:', error);
    return {
      isActive: false,
      isExpired: false,
      trialEndsAt: null,
      startedAt: null,
      daysRemaining: 0,
      daysTotal: TRIAL_DURATION_DAYS,
      plan: 'free',
      hasUsedTrial: false,
    };
  }
}

/**
 * Schedule trial reminders.
 * Foundation for reminder scheduling — currently just logs.
 * In production, this would schedule emails at:
 * - 7 days before expiry
 * - 3 days before expiry
 * - 1 day before expiry
 * - Day of expiry
 */
export async function scheduleTrialReminders(userId: string): Promise<{
  scheduled: boolean;
  reminders: Array<{ type: string; scheduledFor: Date }>;
}> {
  try {
    const info = await getTrialInfo(userId);

    if (!info.isActive || !info.trialEndsAt) {
      return { scheduled: false, reminders: [] };
    }

    const reminders: Array<{ type: string; scheduledFor: Date }> = [];
    const trialEnd = info.trialEndsAt;

    // Reminder schedule: 7, 3, 1 days before, and day of
    const reminderDays = [7, 3, 1, 0];

    for (const daysBefore of reminderDays) {
      const reminderDate = new Date(trialEnd.getTime() - daysBefore * 24 * 60 * 60 * 1000);
      if (reminderDate > new Date()) {
        reminders.push({
          type: daysBefore === 0 ? 'trial_expiring_today' : `trial_expiring_in_${daysBefore}_days`,
          scheduledFor: reminderDate,
        });
      }
    }

    // Log the scheduled reminders (foundation)
    console.log(`[TrialService] Scheduled ${reminders.length} trial reminders for user ${userId}:`,
      reminders.map(r => `${r.type} at ${r.scheduledFor.toISOString()}`)
    );

    await logTrialEvent(userId, 'trial_reminder_sent', {
      daysRemaining: info.daysRemaining,
    });

    return { scheduled: true, reminders };
  } catch (error) {
    console.error('[TrialService] Failed to schedule trial reminders:', error);
    return { scheduled: false, reminders: [] };
  }
}

// ===== BULK OPERATIONS =====

/**
 * Check and expire all overdue trials.
 * Can be called by a scheduled job/cron.
 * Returns count of expired trials.
 */
export async function expireOverdueTrials(): Promise<{ checked: number; expired: number }> {
  try {
    const now = new Date();

    // Find all users with expired trials
    const overdueUsers = await db.user.findMany({
      where: {
        isTrial: true,
        trialEndsAt: { lte: now },
      },
      select: { id: true },
    });

    let expired = 0;

    for (const user of overdueUsers) {
      const result = await expireTrial(user.id);
      if (result.expired) {
        expired++;
      }
    }

    return { checked: overdueUsers.length, expired };
  } catch (error) {
    console.error('[TrialService] Failed to expire overdue trials:', error);
    return { checked: 0, expired: 0 };
  }
}
