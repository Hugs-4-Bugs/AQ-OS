// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Single Source of Truth for Credit Costs
// ═══════════════════════════════════════════════════════════════════
//
// ALL credit cost definitions live here.
// Import from this file — NEVER hardcode credit values elsewhere.
//
// Target economy:
//   Lead search         = 1 credit
//   Deep analysis       = 1.5 credits
//   Workflow execution  ≈ 0.5 credits (per-action costs calibrated to sum to ~0.5)
//   Messaging           = 0.2 credits
//
// Plan allocations (from entitlement-service.ts):
//   Free  = 50 credits/month  → ~50 lead searches, ~33 deep analyses, ~250 messages
//   Pro   = 500 credits/month → ~500 lead searches, ~333 deep analyses, ~2500 messages
//   Elite = 2000 credits/month → ~2000 lead searches, ~1333 deep analyses, ~10000 messages
// ═══════════════════════════════════════════════════════════════════

// ===== Core Credit Actions =====

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
  deep_analysis: 1.5,
  outreach_message: 0.2,
  outreach_sequence: 0.5,
  sales_coaching: 0.5,
  proposal_generation: 1.5,
  competitor_analysis: 1.5,
  data_export: 0.5,
};

export const ACTION_LABELS: Record<CreditAction, string> = {
  lead_discovery: 'Lead Discovery',
  deep_analysis: 'Deep Lead Analysis',
  outreach_message: 'Outreach Message',
  outreach_sequence: 'Outreach Sequence',
  sales_coaching: 'Sales Coaching',
  proposal_generation: 'Proposal Generation',
  competitor_analysis: 'Competitor Analysis',
  data_export: 'Data Export (PDF)',
};

// ===== Workflow Action Credit Costs =====
//
// Calibrated so a typical 3-5 step workflow totals ~0.5 credits.
// Free actions (wait, conditional, system notifications) cost 0.
//
// Examples:
//   5-action workflow (1 send + 1 AI + 2 utility + 1 conditional)
//     = 0.1 + 0.15 + 0.05 + 0.05 + 0 = 0.35 credits
//
//   7-action workflow (2 sends + 1 AI analysis + 1 score + 2 utility + 1 wait)
//     = 0.2 + 0.15 + 0.1 + 0.1 + 0 = 0.55 credits

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

export const WORKFLOW_ACTION_CREDIT_COSTS: Record<WorkflowActionType, number> = {
  send_email: 0.1,
  create_gmail_draft: 0.1,
  send_telegram: 0.1,
  send_whatsapp: 0.1,
  ai_analysis: 0.15,
  ai_outreach: 0.15,
  score_lead: 0.1,
  move_lead_stage: 0.05,
  update_tags: 0.05,
  create_notification: 0.05,
  wait_delay: 0,
  conditional_branch: 0,
  webhook_call: 0.1,
  export_data: 0.15,
  add_note: 0.05,
  notify_low_credits: 0,
  notify_trial_ending: 0,
};

// ===== Plan Credit Allocations =====

export type PlanType = 'free' | 'pro' | 'elite';

export const PLAN_CREDITS: Record<PlanType, number> = {
  free: 50,
  pro: 500,
  elite: 2000,
};

// ===== Helper Functions =====

/** Get the cost of a core credit action. */
export function getCreditCost(action: CreditAction): number {
  return CREDIT_COSTS[action] ?? 0;
}

/** Get the cost of a workflow action. */
export function getWorkflowActionCost(actionType: WorkflowActionType | string): number {
  return WORKFLOW_ACTION_CREDIT_COSTS[actionType as WorkflowActionType] ?? 0.1;
}

/** Get all credit costs as a shallow copy. */
export function getAllCreditCosts(): Record<CreditAction, number> {
  return { ...CREDIT_COSTS };
}
