// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — AI Credit Enforcement
// Phase 8: Credit deduction for all AI operations
//
// Deduct credits for:
// - Analysis (5 credits)
// - Chat (1 credit per message)
// - Outreach generation (2 credits)
// - Scoring (3 credits)
// - Exports (5 credits)
//
// Requirements:
// - Backend enforcement ONLY
// - Atomic deduction
// - Never allow negative
// ═══════════════════════════════════════════════════════════════════

import { deductCredits, checkCreditSufficiency, type CreditAction } from '@/lib/credit-service';
import { logAIAudit } from './ai-audit';

// ===== AI CREDIT COSTS =====

export const AI_CREDIT_COSTS = {
  lead_analysis: 5,
  lead_scoring: 3,
  outreach_generation: 2,
  outreach_followup: 2,
  ai_chat_message: 1,
  ai_chat_stream: 1,
  data_export: 5,
  deep_analysis: 5,
} as const;

export type AICreditAction = keyof typeof AI_CREDIT_COSTS;

// ===== CREDIT CHECK RESULT =====

export interface CreditCheckResult {
  sufficient: boolean;
  cost: number;
  balance: number;
  shortfall: number;
  action: AICreditAction;
}

// ===== CHECK AI CREDITS =====

/**
 * Check if user has sufficient credits for an AI action.
 * Does NOT deduct — only checks.
 */
export async function checkAICredits(
  userId: string,
  action: AICreditAction
): Promise<CreditCheckResult> {
  const cost = AI_CREDIT_COSTS[action];
  const sufficiency = await checkCreditSufficiency(userId, cost);

  return {
    sufficient: sufficiency.sufficient,
    cost,
    balance: sufficiency.balance,
    shortfall: sufficiency.shortfall,
    action,
  };
}

// ===== DEDUCT AI CREDITS =====

/**
 * Atomically deduct credits for an AI action.
 * - Returns result with new balance
 * - Logs audit event
 * - Uses idempotency key if provided
 */
export async function deductAICredits(
  userId: string,
  action: AICreditAction,
  referenceId?: string,
  idempotencyKey?: string
): Promise<{
  success: boolean;
  newBalance: number;
  error?: string;
}> {
  const cost = AI_CREDIT_COSTS[action];
  const result = await deductCredits({
    userId,
    action: action as CreditAction,
    cost,
    referenceId,
    idempotencyKey,
  });

  if (result.success) {
    await logAIAudit({
      userId,
      action: 'ai_credits_deducted',
      resource: 'credits',
      resourceId: referenceId,
      details: {
        action,
        amount: cost,
        balance: result.newBalance,
        referenceId,
      },
    });
  }

  return {
    success: result.success,
    newBalance: result.newBalance,
    error: result.error,
  };
}

// ===== REFUND AI CREDITS =====

/**
 * Refund credits for a failed AI action.
 */
export async function refundAICredits(
  userId: string,
  action: AICreditAction,
  referenceId?: string
): Promise<{ success: boolean; newBalance: number }> {
  const cost = AI_CREDIT_COSTS[action];

  // Use addCredits instead of refundCredits for simplicity
  const { addCredits } = await import('@/lib/credit-service');
  const result = await addCredits({
    userId,
    amount: cost,
    source: `${action}_refund`,
    description: `Refund for failed ${action}`,
    referenceId,
  });

  return {
    success: result.success,
    newBalance: result.newBalance,
  };
}

// ===== BULK CREDIT CHECK =====

/**
 * Check credits for multiple AI actions at once.
 * Useful for showing users what they can afford.
 */
export async function bulkCreditCheck(
  userId: string
): Promise<Record<AICreditAction, CreditCheckResult>> {
  const actions: AICreditAction[] = Object.keys(AI_CREDIT_COSTS) as AICreditAction[];
  const results: Partial<Record<AICreditAction, CreditCheckResult>> = {};

  for (const action of actions) {
    results[action] = await checkAICredits(userId, action);
  }

  return results as Record<AICreditAction, CreditCheckResult>;
}
