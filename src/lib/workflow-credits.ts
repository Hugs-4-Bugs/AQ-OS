// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Plan/Credit Enforcement
// Phase 12: Workflow limits, execution limits, and credit costs
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { deductCredits, refundCredits, checkCreditSufficiency } from '@/lib/credit-service';
import { WORKFLOW_EXECUTION_CREDIT_COST } from '@/lib/credit-costs';

// ===== WORKFLOW EXECUTION FEE (Part 2) =====

/**
 * The flat fee for ONE accepted workflow execution (5 credits) —
 * authoritative value lives in credit-costs.ts (single source of truth).
 * Re-exported here for the workflow layer's convenience.
 */
export const WORKFLOW_EXECUTION_FEE_CREDITS = WORKFLOW_EXECUTION_CREDIT_COST;

/** Who started the run — recorded on the ledger for the audit trail. */
export type WorkflowChargeSource =
  | 'MANUAL_WORKFLOW'
  | 'AUTOPILOT'
  | 'SCHEDULED_TRIGGER'
  | 'EVENT_TRIGGER'
  | 'WEBHOOK';

export interface ChargeWorkflowExecutionFeeParams {
  userId: string;
  workflowId: string;
  /** Stable identity of the run being charged (run batch id, execution-bound
   * key, or trigger idempotency key). The SAME key on a replay/retry returns
   * alreadyProcessed instead of charging again. */
  chargeKey: string;
  source: WorkflowChargeSource;
  /** Execution id / run batch id — lands on the ledger's referenceId. */
  referenceId?: string;
  /** How many leads the run targets (informational, never affects the fee). */
  leadCount?: number;
}

export type ChargeWorkflowExecutionFeeResult =
  | {
      ok: true;
      /** True when this chargeKey was already charged (idempotent replay). */
      alreadyProcessed: boolean;
      newBalance: number;
    }
  | {
      ok: false;
      code: 'INSUFFICIENT_CREDITS';
      fee: number;
      balance: number;
      shortfall: number;
    };

/**
 * Charge the flat workflow execution fee — THE single authoritative path
 * every actual workflow execution uses (manual runs, scheduled triggers,
 * event/webhook triggers, and Autopilot). Properties:
 *
 * • FLAT: WORKFLOW_EXECUTION_FEE_CREDITS regardless of lead/step/AI counts.
 * • EXACTLY ONCE: idempotent on chargeKey (a CreditsLedger row labeled
 *   `workflow_execution_idempotent_<chargeKey>` makes replays no-ops).
 * • ATOMIC + NEVER NEGATIVE: delegated to credit-service deductCredits'
 *   transactional balance check — a balance below the fee is rejected
 *   with INSUFFICIENT_CREDITS and NOTHING is deducted.
 * • AUDITED: source, workflow, run reference, and lead count are recorded
 *   on the ledger description; billing-audit events fire inside the service.
 */
export async function chargeWorkflowExecutionFee(
  params: ChargeWorkflowExecutionFeeParams
): Promise<ChargeWorkflowExecutionFeeResult> {
  const { userId, workflowId, chargeKey, source, referenceId, leadCount } = params;

  const result = await deductCredits({
    userId,
    action: 'workflow_execution',
    cost: WORKFLOW_EXECUTION_FEE_CREDITS,
    referenceId,
    idempotencyKey: chargeKey,
    description:
      `Workflow execution fee (${source}) — workflow ${workflowId}` +
      (leadCount !== undefined ? `, ${leadCount} lead${leadCount === 1 ? '' : 's'}` : '') +
      (referenceId ? `, run ${referenceId}` : ''),
  });

  if (!result.success) {
    // Insufficient credits (or the user vanished mid-charge): surface the
    // honest rejection — the caller must NOT start the execution.
    const balanceMatch = /have (\d+(?:\.\d+)?)/.exec(result.error || '');
    const balance = balanceMatch ? Number(balanceMatch[1]) : 0;
    return {
      ok: false,
      code: 'INSUFFICIENT_CREDITS',
      fee: WORKFLOW_EXECUTION_FEE_CREDITS,
      balance,
      shortfall: Math.max(0, WORKFLOW_EXECUTION_FEE_CREDITS - balance),
    };
  }

  return {
    ok: true,
    alreadyProcessed: Boolean(result.alreadyProcessed),
    newBalance: result.newBalance,
  };
}

/**
 * Refund the workflow execution fee when a charged run NEVER actually
 * started (internal preflight failure after the charge — e.g. zero
 * executions could be created). Idempotent on `${chargeKey}:refund`, so
 * worker retries / duplicate failure events refund at most once.
 *
 * NOT used for ordinary partial workflow failure — a run that started and
 * failed honestly consumed its execution fee (explicit product rule).
 */
export async function refundWorkflowExecutionFee(params: {
  userId: string;
  workflowId: string;
  chargeKey: string;
  source: WorkflowChargeSource;
  referenceId?: string;
}): Promise<{ refunded: boolean; newBalance: number }> {
  const { userId, workflowId, chargeKey, source, referenceId } = params;
  const result = await refundCredits({
    userId,
    amount: WORKFLOW_EXECUTION_FEE_CREDITS,
    originalAction: 'workflow_execution',
    // The refund's ledger reference points at the run identity; source and
    // workflow context ride on the charge row that is being reversed.
    referenceId: referenceId || workflowId,
    idempotencyKey: `${chargeKey}:refund`,
  });
  void source; // recorded on the original charge row; kept for signature clarity
  return { refunded: result.success && !result.alreadyProcessed, newBalance: result.newBalance };
}

// ===== PLAN LIMITS =====

// Plan limits for concurrent/total workflows per user.
// NOTE: keyed by plan name INCLUDING 'starter' explicitly — Starter is
// workflow-restricted (workflow_access = false) and falls back to the same
// numeric limits as Free so the map can never return undefined.
const WORKFLOW_LIMITS: Record<string, number> = {
  free: 3,
  starter: 3,
  pro: 25,
  elite: Infinity,
};

const EXECUTION_LIMITS: Record<string, number> = {
  free: 50,
  starter: 50,
  pro: 500,
  elite: Infinity,
};

// ===== CREDIT COSTS PER ACTION TYPE =====
//
// Part 2 note: these PER-ACTION costs are NO LONGER used to bill workflow
// executions. Billing for workflow runs is the flat fee above, charged once
// per accepted run. The table and helper remain for backwards compatibility
// and informational display only. (Historical conflict, documented in the
// Part 2 report: workflow-credits.ts and credit-costs.ts carried two
// different per-action tables; neither participates in execution billing
// anymore, which removes the ambiguity.)

export type WorkflowActionType =
  | 'send_email'
  | 'create_gmail_draft'
  | 'send_telegram'
  | 'send_whatsapp'
  | 'ai_analysis'
  | 'ai_outreach'
  | 'move_lead_stage'
  | 'update_tags'
  | 'create_notification'
  | 'wait_delay'
  | 'conditional_branch'
  | 'webhook_call'
  | 'export_data'
  | 'score_lead'
  | 'add_note'
  | 'notify_low_credits'
  | 'notify_trial_ending';

const ACTION_CREDIT_COSTS: Record<WorkflowActionType, number> = {
  send_email: 2,
  create_gmail_draft: 2,
  send_telegram: 2,
  send_whatsapp: 2,
  ai_analysis: 5,
  ai_outreach: 5,
  score_lead: 5,
  move_lead_stage: 1,
  update_tags: 1,
  create_notification: 1,
  wait_delay: 0,
  conditional_branch: 0,
  webhook_call: 1,
  export_data: 3,
  add_note: 1,
  notify_low_credits: 0,
  notify_trial_ending: 0,
};

// ===== CHECK WORKFLOW LIMIT =====

/**
 * Check if user can create more workflows based on their plan.
 * Returns { allowed, current, limit }
 */
export async function checkWorkflowLimit(
  userId: string
): Promise<{ allowed: boolean; current: number; limit: number }> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

    const plan = user?.plan || 'free';
    const limit = WORKFLOW_LIMITS[plan] ?? WORKFLOW_LIMITS.free;

    const current = await db.workflowDefinition.count({
      where: {
        userId,
        status: { not: 'archived' },
      },
    });

    return {
      allowed: current < limit,
      current,
      limit: limit === Infinity ? -1 : limit,
    };
  } catch (error) {
    console.error('[WorkflowCredits] Failed to check workflow limit:', error);
    return { allowed: false, current: 0, limit: 0 };
  }
}

// ===== CHECK EXECUTION LIMIT =====

/**
 * Check if user has remaining monthly execution capacity.
 * Returns { allowed, current, limit }
 */
export async function checkExecutionLimit(
  userId: string
): Promise<{ allowed: boolean; current: number; limit: number }> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

    const plan = user?.plan || 'free';
    const limit = EXECUTION_LIMITS[plan] ?? EXECUTION_LIMITS.free;

    // Count executions this month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const current = await db.workflowExecution.count({
      where: {
        workflow: { userId },
        startedAt: { gte: startOfMonth },
      },
    });

    return {
      allowed: current < limit,
      current,
      limit: limit === Infinity ? -1 : limit,
    };
  } catch (error) {
    console.error('[WorkflowCredits] Failed to check execution limit:', error);
    return { allowed: false, current: 0, limit: 0 };
  }
}

// ===== DEDUCT EXECUTION CREDITS =====

/**
 * Deduct credits for a workflow action.
 * Returns { success, creditsUsed, error }
 */
export async function deductExecutionCredits(
  userId: string,
  actionType: WorkflowActionType | string
): Promise<{ success: boolean; creditsUsed: number; error?: string }> {
  const cost = getActionCreditCost(actionType as WorkflowActionType);

  if (cost === 0) {
    return { success: true, creditsUsed: 0 };
  }

  // Check sufficiency first
  const sufficiency = await checkCreditSufficiency(userId, cost);
  if (!sufficiency.sufficient) {
    return {
      success: false,
      creditsUsed: 0,
      error: `Insufficient credits: have ${sufficiency.balance}, need ${cost} for ${actionType}`,
    };
  }

  const result = await deductCredits({
    userId,
    action: `workflow_${actionType}`,
    cost,
  });

  return {
    success: result.success,
    creditsUsed: cost,
    error: result.error,
  };
}

// ===== GET WORKFLOW USAGE =====

/**
 * Get current usage vs limits for a user.
 */
export async function getWorkflowUsage(
  userId: string
): Promise<{
  workflows: { current: number; limit: number };
  executions: { current: number; limit: number };
}> {
  const [workflowLimit, executionLimit] = await Promise.all([
    checkWorkflowLimit(userId),
    checkExecutionLimit(userId),
  ]);

  return {
    workflows: {
      current: workflowLimit.current,
      limit: workflowLimit.limit,
    },
    executions: {
      current: executionLimit.current,
      limit: executionLimit.limit,
    },
  };
}

// ===== GET ACTION CREDIT COST =====

/**
 * Get the credit cost for a specific workflow action type.
 */
export function getActionCreditCost(actionType: WorkflowActionType | string): number {
  return ACTION_CREDIT_COSTS[actionType as WorkflowActionType] ?? 1;
}
