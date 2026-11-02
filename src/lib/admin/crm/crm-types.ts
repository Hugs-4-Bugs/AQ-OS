// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin CRM Shared Types
//
// All CRM aggregation services return shapes declared here. The UI layer
// imports these types directly so server → client contract is explicit.
// ═══════════════════════════════════════════════════════════════════

import type { CanonicalStage } from './crm-stage-vocabulary';

// ── KPI strip ─────────────────────────────────────────────────────────

export interface CrmKpi {
  /** Stable key for React + drilldown routing. */
  key: string;
  label: string;
  /** Current value (already formatted for display OR raw number — see valueFormat). */
  value: number;
  /** How to render `value`. `int` / `money` / `percent` / `raw`. */
  valueFormat: 'int' | 'money' | 'percent' | 'raw';
  /** Optional period-comparison delta (positive = improvement). */
  deltaPercent?: number;
  /** Optional secondary line (e.g. "+12 in 7 days"). */
  sub?: string;
  trend?: 'up' | 'down' | 'flat';
  /** Drilldown route — clicking the card navigates here. */
  drilldownHref?: string;
  /** Icon name from lucide-react (resolved by the UI). */
  icon: string;
}

// ── Needs Attention ───────────────────────────────────────────────────

export interface NeedsAttentionItem {
  key: string;
  label: string;
  count: number;
  severity: 'critical' | 'warning' | 'info';
  drilldownHref: string;
  /** Short description of what this item represents. */
  description: string;
}

// ── Funnel ────────────────────────────────────────────────────────────

export interface FunnelStage {
  stage: CanonicalStage;
  label: string;
  count: number;
  /** % of the first stage (discovered = 100%). */
  conversionPercent: number;
  /** % retained from the immediately previous stage. */
  stepConversionPercent: number | null;
  /** Drop-off count from the previous stage. */
  dropOff: number | null;
}

// ── Pipeline ──────────────────────────────────────────────────────────

export interface PipelineStageSummary {
  stage: CanonicalStage;
  label: string;
  leadCount: number;
  /** Sum of deal.proposedPrice for deals mapped to this stage (0 if none). */
  dealValue: number;
  /** Count of active deals in this stage. */
  dealCount: number;
  /** Average days leads have sat in this stage (null if no leads). */
  avgAgeDays: number | null;
}

// ── Outreach ──────────────────────────────────────────────────────────

export interface OutreachStatusBreakdown {
  status: string;
  count: number;
}

export interface OutreachChannelBreakdown {
  channel: string;
  sent: number;
  delivered: number;
  opened: number;
  replied: number;
  failed: number;
}

// ── Autopilot ─────────────────────────────────────────────────────────

export interface AutopilotRunSummary {
  status: string;
  count: number;
}

export interface AutopilotWorkflowSummary {
  id: string;
  name: string;
  status: string;
  schedule: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  totalDiscovered: number;
  totalSaved: number;
  totalProcessed: number;
  lastError: string | null;
}

// ── Business Intelligence ─────────────────────────────────────────────

export interface BusinessProfileSummary {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  name: string;
  industry: string | null;
  status: string;
  isDefault: boolean;
  webPropertyCount: number;
  researchSnapshotCount: number;
  lastResearchedAt: string | null;
  createdAt: string;
}

export interface BiStatus {
  totalProfiles: number;
  totalWebProperties: number;
  totalResearchSnapshots: number;
  completedSnapshots: number;
  failedSnapshots: number;
  pendingSnapshots: number;
  /** Schema-drift flag: true if WebProperty / ResearchSnapshot tables are missing from DB. */
  schemaDrift: boolean;
  profiles: BusinessProfileSummary[];
}

// ── Lead list ─────────────────────────────────────────────────────────

export interface LeadListFilters {
  stage?: CanonicalStage | 'all';
  source?: string | 'all';
  search?: string;
  /** Filter to hot leads (replyScore >= 70). */
  hotOnly?: boolean;
  /** Filter to stale leads (in discovered/analyzed > STALE_DAYS). */
  staleOnly?: boolean;
  /** Filter to leads with email. */
  hasEmail?: boolean;
  limit?: number;
  offset?: number;
}

export interface LeadListItem {
  id: string;
  businessName: string;
  ownerName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  stage: CanonicalStage;
  rawStage: string;
  source: string | null;
  niche: string | null;
  city: string | null;
  country: string | null;
  replyScore: number;
  conversionScore: number;
  urgencyScore: number;
  revenuePotentialScore: number;
  emailStatus: string | null;
  lastContactedAt: string | null;
  followUpAt: string | null;
  createdAt: string;
  isStale: boolean;
  isStalled: boolean;
}

export interface LeadListResult {
  leads: LeadListItem[];
  total: number;
  hasMore: boolean;
}

// ── Activity timeline ─────────────────────────────────────────────────

export interface ActivityItem {
  id: string;
  leadId: string;
  leadBusinessName: string;
  type: string;
  description: string;
  actorEmail: string | null;
  createdAt: string;
  metadata: string | null;
}

// ── Overview (top-level aggregate) ────────────────────────────────────

export interface CrmOverview {
  generatedAt: string;
  kpis: CrmKpi[];
  needsAttention: NeedsAttentionItem[];
  funnel: FunnelStage[];
  pipeline: {
    stages: PipelineStageSummary[];
    totalPipelineValue: number;
    activeDealCount: number;
  };
  outreach: {
    totalMessages: number;
    byStatus: OutreachStatusBreakdown[];
    byChannel: OutreachChannelBreakdown[];
    replyRate: number;
  };
  autopilot: {
    activeWorkflows: number;
    totalRuns: number;
    runsByStatus: AutopilotRunSummary[];
    workflows: AutopilotWorkflowSummary[];
    failedRunsRecent: number;
  };
  bi: BiStatus;
  recentActivity: ActivityItem[];
  /** Schema-drift warnings (missing tables). */
  schemaDrift: string[];
}
