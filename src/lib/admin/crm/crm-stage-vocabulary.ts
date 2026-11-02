// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin CRM Canonical Stage Vocabulary
//
// The CRM dashboard needs a single canonical acquisition lifecycle to
// render funnels, pipeline, and conversion analytics consistently.
//
// REALITY (queried from production DB, Nov 2026):
//   Lead.stage currently stores only: "discovered" (435), "contacted" (101)
//   Deal.status is empty (0 deals)
//   The full lifecycle (analyzed → replied → meeting → proposal → …) is
//   ASPIRATIONAL — it exists in the spec but NOT in persisted data.
//
// PRINCIPLE (spec §31): do NOT rewrite existing stage values. We define a
// canonical target lifecycle and MAP existing values to it. Stages with no
// mapped production data simply render with count=0 (honest empty state).
// No migration, no data rewrite, no destructive change.
//
// This module is the SINGLE SOURCE OF TRUTH for stage ordering, labels,
// and mapping. Every CRM aggregation service + chart + filter reads from
// here so the dashboard is internally consistent.
// ═══════════════════════════════════════════════════════════════════

/**
 * Canonical acquisition lifecycle stage.
 *
 * Order matters — it defines funnel progression and pipeline position.
 * `won` and `lost` are terminal stages (deal-closed outcomes), not
 * intermediate pipeline stages.
 */
export type CanonicalStage =
  | 'discovered'
  | 'analyzed'
  | 'contacted'
  | 'replied'
  | 'meeting'
  | 'proposal'
  | 'negotiation'
  | 'won'
  | 'lost';

/** Ordered list of non-terminal lifecycle stages (the "active funnel"). */
export const FUNNEL_STAGES: CanonicalStage[] = [
  'discovered',
  'analyzed',
  'contacted',
  'replied',
  'meeting',
  'proposal',
  'negotiation',
];

/** Terminal outcome stages (closed deals / resolved leads). */
export const TERMINAL_STAGES: CanonicalStage[] = ['won', 'lost'];

/** All canonical stages in lifecycle order, terminals last. */
export const ALL_STAGES: CanonicalStage[] = [...FUNNEL_STAGES, ...TERMINAL_STAGES];

/** Human-readable label for each canonical stage. */
export const STAGE_LABELS: Record<CanonicalStage, string> = {
  discovered: 'Discovered',
  analyzed: 'Analyzed',
  contacted: 'Contacted',
  replied: 'Replied',
  meeting: 'Meeting',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
};

/** Short description shown in tooltips / empty states. */
export const STAGE_DESCRIPTIONS: Record<CanonicalStage, string> = {
  discovered: 'Lead found via discovery or import — not yet analyzed.',
  analyzed: 'AI analysis complete: scores, weaknesses, outreach angles ready.',
  contacted: 'First outbound message sent (any channel).',
  replied: 'Lead responded — conversation started.',
  meeting: 'Meeting scheduled or completed.',
  proposal: 'Proposal sent — deal in flight.',
  negotiation: 'Active negotiation — terms under discussion.',
  won: 'Deal closed-won.',
  lost: 'Deal closed-lost or lead disqualified.',
};

/**
 * Map a raw Lead.stage value (as persisted in the DB) to a canonical
 * stage. Production currently stores only "discovered" and "contacted",
 * but the map handles legacy / future values defensively.
 *
 * Unknown / unmapped values fall back to "discovered" (the safest bucket —
 * every lead starts there). This is NOT a data rewrite; it is a read-time
 * projection for dashboard rendering only.
 */
export function mapLeadStageToCanonical(rawStage: string | null | undefined): CanonicalStage {
  if (!rawStage) return 'discovered';
  const s = rawStage.toLowerCase().trim();
  if (ALL_STAGES.includes(s as CanonicalStage)) return s as CanonicalStage;
  if (['new', 'pending', 'unqualified', 'fresh'].includes(s)) return 'discovered';
  if (['scored', 'enriched', 'qualified', 'analyzed_lead'].includes(s)) return 'analyzed';
  if (['responded', 'engaged', 'interested'].includes(s)) return 'replied';
  if (['meeting_scheduled', 'meeting_booked', 'demo', 'call_scheduled'].includes(s)) return 'meeting';
  if (['proposal_sent', 'quoted', 'pitched'].includes(s)) return 'proposal';
  if (['negotiating', 'in_negotiation', 'terms'].includes(s)) return 'negotiation';
  if (['closed_won', 'closed-won', 'converted', 'success'].includes(s)) return 'won';
  if (['closed_lost', 'closed-lost', 'dropped', 'disqualified', 'failed'].includes(s)) return 'lost';
  return 'discovered';
}

/**
 * Map a Deal.status value to a canonical stage. Deals currently use a
 * different vocabulary (draft, sent, won, lost, etc.). This normalizes
 * them into the same lifecycle so the funnel can include deal-side data.
 */
export function mapDealStatusToCanonical(rawStatus: string | null | undefined): CanonicalStage | null {
  if (!rawStatus) return null;
  const s = rawStatus.toLowerCase().trim();
  if (['won', 'closed_won', 'closed-won', 'completed', 'done'].includes(s)) return 'won';
  if (['lost', 'closed_lost', 'closed-lost', 'cancelled', 'canceled', 'failed'].includes(s)) return 'lost';
  if (['negotiation', 'negotiating', 'in_negotiation'].includes(s)) return 'negotiation';
  if (['proposal', 'proposal_sent', 'sent', 'quoted', 'pitched'].includes(s)) return 'proposal';
  if (['draft', 'pending', 'new', 'open'].includes(s)) return 'proposal';
  return null;
}

/** Days without contact before a post-contact lead is "stalled". */
export const STALL_DAYS = 14;

/** Days in discovered/analyzed before a lead is "stale". */
export const STALE_DAYS = 21;

export function isLeadStalled(params: {
  stage: CanonicalStage;
  lastContactedAt: Date | null;
  now?: Date;
}): boolean {
  if (TERMINAL_STAGES.includes(params.stage)) return false;
  if (params.stage === 'discovered' || params.stage === 'analyzed') return false;
  if (!params.lastContactedAt) return false;
  const now = params.now || new Date();
  const daysSince = (now.getTime() - params.lastContactedAt.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > STALL_DAYS;
}

export function isLeadStale(params: {
  stage: CanonicalStage;
  createdAt: Date;
  now?: Date;
}): boolean {
  if (!['discovered', 'analyzed'].includes(params.stage)) return false;
  const now = params.now || new Date();
  const daysSince = (now.getTime() - params.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > STALE_DAYS;
}
