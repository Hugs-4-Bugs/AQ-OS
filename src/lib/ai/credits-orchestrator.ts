// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 2: Server-Side Credit Enforcement for Orchestration
//
// Wraps the existing credit-service with idempotency-aware helpers.
//
// INVARIANTS:
//   · A successful operation = exactly one charge.
//   · A failed provider attempt = NO charge (refund on failure).
//   · A retry/replay of the SAME logical operation = NO duplicate charge
//     (idempotency key derived from orchestration identity).
//   · Parallel models in ONE orchestration = ONE charge for the
//     orchestration (model fan-out never multiplies credit cost).
//   · Entitlement checks happen server-side only.
//   · No artificial lead/task cap; only credits and plan tier gate usage.
//
// This module REUSES credit-service.ts (atomic deductCredits /
// refundCredits / checkCreditSufficiency) and ai/credit-enforcement.ts
// (the AI_CREDIT_COSTS table). It does NOT redefine credit costs.
// ═══════════════════════════════════════════════════════════════════

import {
  deductCredits,
  refundCredits,
  checkCreditSufficiency,
} from '@/lib/credit-service';
import { AI_CREDIT_COSTS, type AICreditAction } from '@/lib/ai/credit-enforcement';
import { logAIAudit } from '@/lib/ai/ai-audit';

// ===== TYPES =====

export interface EntitlementCheck {
  /** True when the user has both sufficient credits AND the plan tier
   *  required for the operation. */
  allowed: boolean;
  /** Cost in credits that WILL be charged on success. */
  cost: number;
  /** Current credit balance. */
  balance: number;
  /** Shortfall when blocked by insufficient credits. */
  shortfall: number;
  /** Reason the operation was blocked (when allowed=false). */
  reason?: string;
}

export interface ChargeResult {
  /** True when the charge was applied OR was already applied (idempotent). */
  charged: boolean;
  /** True when the charge was deduplicated (already charged for this key). */
  deduplicated: boolean;
  /** Stable idempotency key (echoed back for caller tracking). */
  idempotencyKey: string;
  /** Cost that was charged (0 when deduplicated). */
  cost: number;
  /** New balance after the charge. */
  newBalance?: number;
}

export interface RefundResult {
  refunded: boolean;
  deduplicated: boolean;
  idempotencyKey: string;
  amount: number;
  newBalance?: number;
}

// ===== IDEMPOTENT CHARGE =====

/**
 * Idempotently charge credits for one orchestration operation.
 *
 * The idempotency key MUST be derived from the stable orchestration
 * identity (execution + lead + step + role) — NOT from per-attempt
 * randomness. This way:
 *   · a duplicate scheduler tick → same key → no duplicate charge
 *   · a worker retry → same key → no duplicate charge
 *   · a duplicate event trigger → same key → no duplicate charge
 *   · a duplicate approval callback → same key → no duplicate charge
 *
 * Caller provides the LOGICAL key; we namespace it under the credit
 * action to avoid cross-action collisions (e.g. an `ai_analysis` and
 * `lead_scoring` happening to share the same execution+lead+step).
 */
export async function chargeOperationCredits(params: {
  userId: string;
  action: AICreditAction;
  /** Stable logical identity (e.g. executionId:leadId:stepName:role). */
  logicalKey: string;
}): Promise<ChargeResult> {
  const cost = AI_CREDIT_COSTS[params.action] ?? 0;
  const idempotencyKey = stableKey(params.action, params.logicalKey);
  if (cost === 0) {
    return {
      charged: false,
      deduplicated: false,
      idempotencyKey,
      cost: 0,
    };
  }
  // credit-service's deductCredits already implements idempotency: it
  // looks up an existing ledger row by the idempotency key and returns
  // `alreadyProcessed=true` rather than charging again. We pass the
  // key through and surface that flag.
  const result = await deductCredits({
    userId: params.userId,
    action: params.action,
    cost,
    idempotencyKey,
  });
  if (result.alreadyProcessed) {
    return {
      charged: true,
      deduplicated: true,
      idempotencyKey,
      cost: 0,
      newBalance: result.newBalance,
    };
  }
  if (!result.success) {
    throw new Error(result.error || `credit charge failed for ${params.action}`);
  }
  return {
    charged: true,
    deduplicated: false,
    idempotencyKey,
    cost,
    newBalance: result.newBalance,
  };
}

/**
 * Idempotently refund credits for a failed operation.
 *
 * Refunds are tied to the SAME logical idempotency key as the original
 * charge. This means:
 *   · A retry that succeeds after a refunded attempt → no double-refund.
 *   · A duplicate scheduler tick that finds the operation already
 *     refunded → no double-refund.
 */
export async function refundOperationCredits(params: {
  userId: string;
  action: AICreditAction;
  logicalKey: string;
}): Promise<RefundResult> {
  const cost = AI_CREDIT_COSTS[params.action] ?? 0;
  // The credit-service uses `${originalAction}_refund_idempotent_${key}`
  // as the ledger row's action label. We pass our stable key as the
  // idempotencyKey; the service handles the namespacing.
  const idempotencyKey = stableKey(params.action, params.logicalKey);
  if (cost === 0) {
    return { refunded: false, deduplicated: false, idempotencyKey, amount: 0 };
  }
  const result = await refundCredits({
    userId: params.userId,
    amount: cost,
    originalAction: params.action,
    idempotencyKey,
  });
  if (result.alreadyProcessed) {
    return {
      refunded: true,
      deduplicated: true,
      idempotencyKey,
      amount: 0,
      newBalance: result.newBalance,
    };
  }
  if (!result.success) {
    throw new Error(result.error || `credit refund failed for ${params.action}`);
  }
  return {
    refunded: true,
    deduplicated: false,
    idempotencyKey,
    amount: cost,
    newBalance: result.newBalance,
  };
}

// ===== ENTITLEMENT CHECK =====

/**
 * Server-side entitlement check for an orchestration operation.
 *
 * Verifies:
 *   · User has sufficient credits.
 *   · (Plan-tier checks happen at the route/feature layer; this
 *      function ONLY gates on credits — keeping the orchestrator
 *      plan-agnostic.)
 *
 * This MUST run on the server before any model invocation. The
 * orchestrator calls this BEFORE it touches the provider abstraction.
 */
export async function checkOperationEntitlement(
  userId: string,
  action: AICreditAction
): Promise<EntitlementCheck> {
  const cost = AI_CREDIT_COSTS[action] ?? 0;
  if (cost === 0) {
    return {
      allowed: true,
      cost: 0,
      balance: 0,
      shortfall: 0,
    };
  }
  const sufficiency = await checkCreditSufficiency(userId, cost);
  return {
    allowed: sufficiency.sufficient,
    cost,
    balance: sufficiency.balance,
    shortfall: sufficiency.shortfall,
    reason: sufficiency.sufficient ? undefined : `Insufficient credits: need ${cost}, have ${sufficiency.balance}`,
  };
}

// ===== AUDIT (BEST-EFFORT) =====

/**
 * Best-effort audit log entry for a credit operation. Uses the
 * canonical `ai_credits_deducted` action (the existing audit enum)
 * with the operation type encoded in `details.operation`.
 */
export function auditOperationCredits(params: {
  userId: string;
  action: AICreditAction;
  logicalKey: string;
  operation: 'charge' | 'refund' | 'check';
  result: 'ok' | 'deduplicated' | 'blocked' | 'error';
  detail?: Record<string, unknown>;
}): void {
  try {
    void logAIAudit({
      userId: params.userId,
      action: 'ai_credits_deducted',
      details: {
        operation: params.operation,
        result: params.result,
        action_type: params.action,
        logicalKey: params.logicalKey,
        ...params.detail,
      },
    }).catch(() => {});
  } catch {
    // best-effort — never block on audit
  }
}

// ===== HELPERS =====

function stableKey(action: string, logicalKey: string): string {
  // Composite idempotency key — namespaced per action so a single
  // logical operation that triggers multiple credit actions (e.g.
  // ai_analysis THEN lead_scoring on the same lead) doesn't collide.
  return `${action}_orch_${logicalKey}`;
}
