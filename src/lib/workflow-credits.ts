// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Plan/Credit Enforcement
// Phase 12: Workflow limits, execution limits, and credit costs
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { deductCredits, checkCreditSufficiency } from '@/lib/credit-service';

// ===== PLAN LIMITS =====

const WORKFLOW_LIMITS: Record<string, number> = {
  free: 3,
  pro: 25,
  elite: Infinity,
};

const EXECUTION_LIMITS: Record<string, number> = {
  free: 50,
  pro: 500,
  elite: Infinity,
};

// ===== CREDIT COSTS PER ACTION TYPE =====

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
