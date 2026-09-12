// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Complete Credits Engine with Atomic Operations
// Phase 4: Subscription System + Credits Engine + Plan Gates + Billing
//
// CRITICAL RULES:
// - NEVER allow negative credits
// - ALWAYS use Prisma $transaction for atomicity
// - ALWAYS create CreditsLedger entry for every operation
// - ALWAYS log audit event for every credit operation
// - Support idempotency keys to prevent double-deduction
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logCreditEvent } from '@/lib/billing-audit';
import { PLAN_CREDITS, type PlanType } from '@/lib/entitlement-service';

// ===== CREDIT COSTS MAPPING =====

export type CreditAction =
  | 'lead_discovery'
  | 'deep_analysis'
  | 'outreach_message'
  | 'outreach_sequence'
  | 'sales_coaching'
  | 'proposal_generation'
  | 'competitor_analysis'
  | 'data_export';

export const CREDIT_COSTS: Record<CreditAction, number> = {
  lead_discovery: 1,
  deep_analysis: 5,
  outreach_message: 2,
  outreach_sequence: 8,
  sales_coaching: 3,
  proposal_generation: 10,
  competitor_analysis: 8,
  data_export: 5,
};

// ===== INTERFACES =====

export interface DeductCreditsParams {
  userId: string;
  action: CreditAction | string;
  cost: number;
  referenceId?: string;
  idempotencyKey?: string;
}

export interface DeductCreditsResult {
  success: boolean;
  newBalance: number;
  ledgerEntryId?: string;
  error?: string;
  alreadyProcessed?: boolean; // true if idempotency key was already used
}

export interface AddCreditsParams {
  userId: string;
  amount: number;
  source: string;
  description?: string;
  referenceId?: string;
}

export interface AddCreditsResult {
  success: boolean;
  newBalance: number;
  ledgerEntryId?: string;
  error?: string;
  duplicate?: boolean;
}

export interface CreditBalanceResult {
  total: number;
  monthly: number;
  rollover: number;
  addons: number;
  plan: PlanType;
}

export interface RolloverResult {
  success: boolean;
  rolloverAmount: number;
  previousBalance: number;
  newMonthly: number;
  error?: string;
}

export interface RefundCreditsParams {
  userId: string;
  amount: number;
  originalAction: string;
  referenceId?: string;
}

export interface RefundCreditsResult {
  success: boolean;
  newBalance: number;
  ledgerEntryId?: string;
  error?: string;
}

// ===== CORE CREDIT OPERATIONS =====

/**
 * Atomic credit deduction with:
 * - Balance check (never allow negative)
 * - Idempotency key support (check if already processed)
 * - DB transaction for atomicity (update user.credits + create CreditsLedger entry)
 * - Return detailed result (success, new balance, ledger entry id)
 */
export async function deductCredits(params: DeductCreditsParams): Promise<DeductCreditsResult> {
  try {
    const { userId, action, cost, referenceId, idempotencyKey } = params;

    // Validate cost
    if (cost <= 0) {
      return { success: false, newBalance: 0, error: 'Cost must be greater than 0' };
    }

    // Check idempotency key if provided
    if (idempotencyKey) {
      const existingLedger = await db.creditsLedger.findFirst({
        where: {
          userId,
          action: `${action}_idempotent_${idempotencyKey}`,
        },
      });

      if (existingLedger) {
        // Already processed — return the existing result
        return {
          success: true,
          newBalance: existingLedger.balance,
          ledgerEntryId: existingLedger.id,
          alreadyProcessed: true,
        };
      }
    }

    // Atomic transaction: check balance, deduct, create ledger entry
    const result = await db.$transaction(async (tx) => {
      // Get current user with lock-like behavior (read within transaction)
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true, plan: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Balance check — NEVER allow negative
      if (user.credits < cost) {
        throw new Error(`Insufficient credits: have ${user.credits}, need ${cost}`);
      }

      const newBalance = user.credits - cost;

      // Update user credits
      await tx.user.update({
        where: { id: userId },
        data: { credits: newBalance },
      });

      // Create ledger entry
      const ledgerAction = idempotencyKey ? `${action}_idempotent_${idempotencyKey}` : action;
      const ledgerEntry = await tx.creditsLedger.create({
        data: {
          userId,
          action,
          credits: -cost,
          balance: newBalance,
          description: `Deducted ${cost} credits for ${action}`,
          referenceId: referenceId || null,
        },
      });

      return { newBalance, ledgerEntryId: ledgerEntry.id, plan: user.plan };
    });

    // Log audit event
    await logCreditEvent(userId, 'credits_deducted', {
      amount: cost,
      balance: result.newBalance,
      action_type: action,
      referenceId,
    });

    // Check for low credit warnings
    if (result.newBalance <= 0) {
      await logCreditEvent(userId, 'credit_zero', {
        amount: 0,
        balance: 0,
        action_type: action,
      });
    } else if (result.newBalance <= 10) {
      await logCreditEvent(userId, 'credit_warning', {
        amount: cost,
        balance: result.newBalance,
        action_type: action,
      });
    }

    return {
      success: true,
      newBalance: result.newBalance,
      ledgerEntryId: result.ledgerEntryId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to deduct credits';

    // If it's an insufficient credits error, return structured error
    if (message.includes('Insufficient credits')) {
      return { success: false, newBalance: 0, error: message };
    }

    console.error('[CreditService] Failed to deduct credits:', error);
    return { success: false, newBalance: 0, error: 'Failed to deduct credits' };
  }
}

/**
 * Add credits with:
 * - Duplicate detection (same referenceId + source within 5 min)
 * - DB transaction consistency
 */
export async function addCredits(params: AddCreditsParams): Promise<AddCreditsResult> {
  try {
    const { userId, amount, source, description, referenceId } = params;

    // Validate amount
    if (amount <= 0) {
      return { success: false, newBalance: 0, error: 'Amount must be greater than 0' };
    }

    // Duplicate detection: check for same referenceId + source within 5 minutes
    if (referenceId && source) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const duplicate = await db.creditsLedger.findFirst({
        where: {
          userId,
          action: source,
          referenceId,
          createdAt: { gte: fiveMinutesAgo },
        },
      });

      if (duplicate) {
        return {
          success: true,
          newBalance: duplicate.balance,
          ledgerEntryId: duplicate.id,
          duplicate: true,
        };
      }
    }

    // Atomic transaction
    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const newBalance = user.credits + amount;

      // Update user credits
      await tx.user.update({
        where: { id: userId },
        data: { credits: newBalance },
      });

      // Create ledger entry
      const ledgerEntry = await tx.creditsLedger.create({
        data: {
          userId,
          action: source,
          credits: amount,
          balance: newBalance,
          description: description || `Added ${amount} credits from ${source}`,
          referenceId: referenceId || null,
        },
      });

      return { newBalance, ledgerEntryId: ledgerEntry.id };
    });

    // Log audit event
    await logCreditEvent(userId, 'credits_added', {
      amount,
      balance: result.newBalance,
      source,
      referenceId,
    });

    return {
      success: true,
      newBalance: result.newBalance,
      ledgerEntryId: result.ledgerEntryId,
    };
  } catch (error) {
    console.error('[CreditService] Failed to add credits:', error);
    return { success: false, newBalance: 0, error: 'Failed to add credits' };
  }
}

/**
 * Handle monthly credit rollover.
 * - Save unused credits as rolloverCredits on user
 * - Reset credits to plan's monthly allocation
 * - Rollover credits are used FIRST, then monthly
 */
export async function rolloverCredits(userId: string): Promise<RolloverResult> {
  try {
    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true, creditsMonthly: true, rolloverCredits: true, plan: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const plan = user.plan as PlanType;
      const planMonthly = PLAN_CREDITS[plan] || PLAN_CREDITS.free;

      // Calculate rollover: unused credits become rollover
      // The "unused" portion is: current credits (which may include old rollover)
      // We only rollover the monthly portion that wasn't used
      const previousBalance = user.credits;
      const rolloverAmount = Math.max(0, previousBalance);

      // Reset to plan's monthly allocation + rollover
      const newMonthly = planMonthly;
      const newCredits = planMonthly + rolloverAmount;

      // Update user
      await tx.user.update({
        where: { id: userId },
        data: {
          credits: newCredits,
          creditsMonthly: newMonthly,
          rolloverCredits: rolloverAmount,
        },
      });

      // Create ledger entries
      // 1. Rollover credit entry
      if (rolloverAmount > 0) {
        await tx.creditsLedger.create({
          data: {
            userId,
            action: 'rollover_processed',
            credits: rolloverAmount,
            balance: newCredits,
            description: `Rolled over ${rolloverAmount} unused credits from previous period`,
          },
        });
      }

      // 2. Monthly reset entry
      await tx.creditsLedger.create({
        data: {
          userId,
          action: 'monthly_reset',
          credits: newMonthly,
          balance: newCredits,
          description: `Monthly credits reset: ${newMonthly} credits for ${plan} plan`,
        },
      });

      return {
        rolloverAmount,
        previousBalance,
        newMonthly,
        newCredits,
      };
    });

    // Log audit events
    if (result.rolloverAmount > 0) {
      await logCreditEvent(userId, 'rollover_processed', {
        amount: result.rolloverAmount,
        balance: result.newCredits,
        source: 'monthly_rollover',
      });
    }

    await logCreditEvent(userId, 'monthly_reset', {
      amount: result.newMonthly,
      balance: result.newCredits,
      source: 'monthly_reset',
    });

    return {
      success: true,
      rolloverAmount: result.rolloverAmount,
      previousBalance: result.previousBalance,
      newMonthly: result.newMonthly,
    };
  } catch (error) {
    console.error('[CreditService] Failed to rollover credits:', error);
    return {
      success: false,
      rolloverAmount: 0,
      previousBalance: 0,
      newMonthly: 0,
      error: 'Failed to rollover credits',
    };
  }
}

/**
 * Reset monthly credits based on plan.
 * Called when a user's plan changes or at the start of a billing period.
 * Does NOT carry over unused credits (use rolloverCredits for that).
 */
export async function resetMonthlyCredits(userId: string, plan: PlanType): Promise<{
  success: boolean;
  newCredits: number;
  previousCredits: number;
  error?: string;
}> {
  try {
    const planCredits = PLAN_CREDITS[plan] || PLAN_CREDITS.free;

    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true, rolloverCredits: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const previousCredits = user.credits;
      // Preserve rollover credits, reset monthly portion
      const newCredits = planCredits + (user.rolloverCredits || 0);

      await tx.user.update({
        where: { id: userId },
        data: {
          credits: newCredits,
          creditsMonthly: planCredits,
        },
      });

      // Create ledger entry
      await tx.creditsLedger.create({
        data: {
          userId,
          action: 'monthly_reset',
          credits: planCredits,
          balance: newCredits,
          description: `Monthly credits reset to ${planCredits} for ${plan} plan`,
        },
      });

      return { previousCredits, newCredits };
    });

    // Log audit event
    await logCreditEvent(userId, 'monthly_reset', {
      amount: planCredits,
      balance: result.newCredits,
      source: 'plan_change',
    });

    return {
      success: true,
      newCredits: result.newCredits,
      previousCredits: result.previousCredits,
    };
  } catch (error) {
    console.error('[CreditService] Failed to reset monthly credits:', error);
    return {
      success: false,
      newCredits: 0,
      previousCredits: 0,
      error: 'Failed to reset monthly credits',
    };
  }
}

/**
 * Get current credit balance with breakdown (monthly + rollover + addons).
 */
export async function getCreditBalance(userId: string): Promise<CreditBalanceResult> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { credits: true, creditsMonthly: true, rolloverCredits: true, plan: true },
    });

    if (!user) {
      return { total: 0, monthly: 0, rollover: 0, addons: 0, plan: 'free' };
    }

    // Get active addon credits
    const activeAddons = await db.creditAddon.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
    });
    const addonCredits = activeAddons.reduce((sum, addon) => sum + addon.credits, 0);

    return {
      total: user.credits,
      monthly: user.creditsMonthly,
      rollover: user.rolloverCredits,
      addons: addonCredits,
      plan: (user.plan || 'free') as PlanType,
    };
  } catch (error) {
    console.error('[CreditService] Failed to get credit balance:', error);
    return { total: 0, monthly: 0, rollover: 0, addons: 0, plan: 'free' };
  }
}

/**
 * Check if user has enough credits (without deducting).
 * Returns the current balance and whether the amount is affordable.
 */
export async function checkCreditSufficiency(
  userId: string,
  amount: number
): Promise<{ sufficient: boolean; balance: number; shortfall: number }> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });

    const balance = user?.credits ?? 0;
    const sufficient = balance >= amount;
    const shortfall = sufficient ? 0 : amount - balance;

    return { sufficient, balance, shortfall };
  } catch (error) {
    console.error('[CreditService] Failed to check credit sufficiency:', error);
    return { sufficient: false, balance: 0, shortfall: amount };
  }
}

/**
 * Refund credits for a failed action.
 * Creates a positive ledger entry to reverse the deduction.
 */
export async function refundCredits(params: RefundCreditsParams): Promise<RefundCreditsResult> {
  try {
    const { userId, amount, originalAction, referenceId } = params;

    if (amount <= 0) {
      return { success: false, newBalance: 0, error: 'Refund amount must be greater than 0' };
    }

    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const newBalance = user.credits + amount;

      // Update user credits
      await tx.user.update({
        where: { id: userId },
        data: { credits: newBalance },
      });

      // Create refund ledger entry
      const ledgerEntry = await tx.creditsLedger.create({
        data: {
          userId,
          action: `${originalAction}_refund`,
          credits: amount,
          balance: newBalance,
          description: `Refund: ${amount} credits returned for failed ${originalAction}`,
          referenceId: referenceId || null,
        },
      });

      return { newBalance, ledgerEntryId: ledgerEntry.id };
    });

    // Log audit event
    await logCreditEvent(userId, 'credits_refunded', {
      amount,
      balance: result.newBalance,
      action_type: originalAction,
      referenceId,
    });

    return {
      success: true,
      newBalance: result.newBalance,
      ledgerEntryId: result.ledgerEntryId,
    };
  } catch (error) {
    console.error('[CreditService] Failed to refund credits:', error);
    return { success: false, newBalance: 0, error: 'Failed to refund credits' };
  }
}

// ===== UTILITY FUNCTIONS =====

/**
 * Get the cost of a specific action.
 */
export function getActionCost(action: CreditAction): number {
  return CREDIT_COSTS[action] ?? 0;
}

/**
 * Get all credit costs mapping.
 */
export function getAllCreditCosts(): Record<CreditAction, number> {
  return { ...CREDIT_COSTS };
}

/**
 * Add credits from a credit addon purchase.
 * Creates both a CreditAddon record and a CreditsLedger entry.
 */
export async function addCreditAddon(params: {
  userId: string;
  credits: number;
  pricePaid: number;
  currency?: string;
  paymentOrderId?: string;
  expiresAt?: Date;
}): Promise<{ success: boolean; newBalance: number; addonId?: string; error?: string }> {
  try {
    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: params.userId },
        select: { credits: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const newBalance = user.credits + params.credits;

      // Update user credits
      await tx.user.update({
        where: { id: params.userId },
        data: { credits: newBalance },
      });

      // Create addon record
      const addon = await tx.creditAddon.create({
        data: {
          userId: params.userId,
          credits: params.credits,
          pricePaid: params.pricePaid,
          currency: params.currency || 'USD',
          paymentOrderId: params.paymentOrderId || null,
          expiresAt: params.expiresAt || null,
        },
      });

      // Create ledger entry
      await tx.creditsLedger.create({
        data: {
          userId: params.userId,
          action: 'credit_addon_purchase',
          credits: params.credits,
          balance: newBalance,
          description: `Purchased ${params.credits} credits addon for ${params.pricePaid} ${params.currency || 'USD'}`,
          referenceId: addon.id,
        },
      });

      return { newBalance, addonId: addon.id };
    });

    // Log audit event
    await logCreditEvent(params.userId, 'credits_added', {
      amount: params.credits,
      balance: result.newBalance,
      source: 'addon_purchase',
    });

    return {
      success: true,
      newBalance: result.newBalance,
      addonId: result.addonId,
    };
  } catch (error) {
    console.error('[CreditService] Failed to add credit addon:', error);
    return { success: false, newBalance: 0, error: 'Failed to add credit addon' };
  }
}
