// AcquisitionOS — AI-Powered Client Acquisition System | Shared TypeScript Types

export type LeadStage =
  | "discovered"
  | "analyzed"
  | "contacted"
  | "replied"
  | "discussion"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost";

export const STAGE_ORDER: LeadStage[] = [
  "discovered",
  "analyzed",
  "contacted",
  "replied",
  "discussion",
  "proposal",
  "negotiation",
  "won",
  "lost",
];

export const STAGE_LABELS: Record<LeadStage, string> = {
  discovered: "Discovered",
  analyzed: "Analyzed",
  contacted: "Contacted",
  replied: "Replied",
  discussion: "Discussion",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export const STAGE_COLORS: Record<LeadStage, string> = {
  discovered: "bg-slate-500",
  analyzed: "bg-cyan-500",
  contacted: "bg-blue-500",
  replied: "bg-amber-500",
  discussion: "bg-orange-500",
  proposal: "bg-purple-500",
  negotiation: "bg-pink-500",
  won: "bg-emerald-500",
  lost: "bg-red-500",
};

// FIX (2026-09-09): Hex color mapping for SVG/recharts usage.
// `STAGE_COLORS` uses Tailwind background classes (e.g. "bg-slate-500")
// which are NOT valid SVG `fill` values — recharts silently falls back to
// black, which renders bars INVISIBLE in dark mode. Chart components must
// use this hex map instead. The colors mirror the Tailwind -500 palette.
export const STAGE_CHART_COLORS: Record<LeadStage, string> = {
  discovered: "#64748b", // slate-500
  analyzed: "#06b6d4",  // cyan-500
  contacted: "#3b82f6",  // blue-500
  replied: "#f59e0b",    // amber-500
  discussion: "#f97316", // orange-500
  proposal: "#a855f7",   // purple-500
  negotiation: "#ec4899",// pink-500
  won: "#10b981",       // emerald-500
  lost: "#ef4444",      // red-500
};

export type Niche =
  | "Restaurant"
  | "Cafe"
  | "Gym"
  | "Salon"
  | "Clinic"
  | "Hotel"
  | "Legal"
  | "Real Estate"
  | "Interior Design"
  | "Repair Shop"
  | "Coaching"
  | "Manufacturing"
  | "Logistics"
  | "Dental"
  | "Healthcare"
  | "E-commerce"
  | "Fitness"
  | "Hospitality"
  | "Education"
  | "Automotive"
  | "Construction"
  | "Service";

export type Country =
  | "India"
  | "UAE"
  | "USA"
  | "UK"
  | "Canada"
  | "Australia";

export type OutreachChannel = "email" | "whatsapp" | "linkedin" | "instagram";

export interface DigitalWeakness {
  issue: string;
  severity: "low" | "medium" | "high" | "critical";
}

export interface Lead {
  id: string;
  businessName: string;
  ownerName?: string;
  niche?: string;
  country?: string;
  city?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  linkedin?: string;
  instagram?: string;
  facebook?: string;
  googleMapsListing?: string;
  rating?: number;
  stage: LeadStage;
  replyScore: number;
  conversionScore: number;
  urgencyScore: number;
  revenuePotentialScore: number;
  urgency: "low" | "medium" | "high" | "critical";
  revenuePotential: "low" | "medium" | "high" | "premium";
  digitalWeaknesses: DigitalWeakness[];
  hasWebsite: boolean;
  websiteQuality?: string;
  scoreReasoning?: string;
  bestContactPerson?: string;
  bestChannel?: string;
  bestTiming?: string;
  outreachStyle?: string;
  opportunityNotes?: string;
  source?: string;
  notes?: string;
  followUpAt?: string;
  tags: string[];
  lastContact?: string;
  nextFollowUp?: string;
  communications?: Communication[];
  deals?: Deal[];
  createdAt: string;
  updatedAt: string;
}

export interface Communication {
  id: string;
  leadId: string;
  channel: string;
  direction: "outbound" | "inbound";
  content: string;
  messageGeneratedByAI?: boolean;
  responseSummary?: string;
  intent?: string;
  buyingSignals?: string;
  hesitationReasons?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Deal {
  id: string;
  leadId: string;
  projectType?: string;
  projectScope?: string;
  proposedPrice?: number;
  finalPrice?: number;
  currency: string;
  status: string;
  notes?: string;
  implementationTimeline?: string;
  maintenancePlan?: string;
  proposalContent?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalLeads: number;
  hotLeads: number;
  contactedLeads: number;
  repliedLeads: number;
  interestedLeads: number;
  wonLeads: number;
  lostLeads: number;
  stageBreakdown: Record<string, number>;
  avgScores: {
    replyScore: number;
    conversionScore: number;
    urgencyScore: number;
    revenuePotentialScore: number;
  };
  topNiches: { niche: string; count: number }[];
  topCountries: { country: string; count: number }[];
  replyRate: number;
  closeRate: number;
  avgDealValue: number;
  totalDeals: number;
}

export interface ChannelInsight {
  channel: string;
  successRate: number;
  sent: number;
  replies: number;
}

export interface NicheInsight {
  niche: string;
  rate: number;
  total: number;
  won: number;
}

export interface CountryInsight {
  country: string;
  leads: number;
  conversion: number;
  replyRate: number;
  won: number;
}

export interface StageFunnelItem {
  stage: LeadStage;
  label: string;
  count: number;
  percentage: number;
  color: string;
}

export interface ScoreDistributionItem {
  range: string;
  count: number;
  fill: string;
  percentage: number;
}

export interface WeeklyPerformanceItem {
  week: string;
  newLeads: number;
  dealsClosed: number;
}

export interface TopLeadToContact {
  id: string;
  businessName: string;
  niche?: string;
  country?: string;
  avgScore: number;
  bestChannel?: string;
  conversionScore: number;
  urgencyScore: number;
  stage: string;
}

export interface FollowUpLead {
  id: string;
  businessName: string;
  niche?: string;
  country?: string;
  lastContacted: string;
  daysSinceContact: number;
  bestChannel?: string;
  outreachStyle?: string;
}

export interface Recommendation {
  id: string;
  text: string;
  priority: 'high' | 'medium' | 'low';
  icon: string;
  actionTab?: TabId;
}

export interface SourceEffectivenessItem {
  source: string;
  leadCount: number;
  avgConversionScore: number;
  avgReplyScore: number;
  dealsWon: number;
  pipelineValue: number;
}

export interface HeatmapCell {
  niche: string;
  country: string;
  avgScore: number;
  leadCount: number;
}

export interface PerformanceTrends {
  leads: { current: number; previous: number; trend: number };
  deals: { current: number; previous: number; trend: number };
  reply: { current: number; previous: number; trend: number };
  pipeline: { current: number; previous: number; trend: number };
}

export interface InsightData {
  bestChannels: ChannelInsight[];
  conversionByNiche: NicheInsight[];
  performanceByCountry: CountryInsight[];
  stageFunnel: StageFunnelItem[];
  scoreDistribution: ScoreDistributionItem[];
  weeklyPerformance: WeeklyPerformanceItem[];
  topLeadsToContact: TopLeadToContact[];
  followUpsNeeded: FollowUpLead[];
  recommendations: Recommendation[];
  sourceEffectiveness: SourceEffectivenessItem[];
  leadScoreHeatmap: HeatmapCell[];
  performanceTrends: PerformanceTrends;
  summary: {
    totalLeads: number;
    totalCommunications: number;
    totalDeals: number;
    totalPipelineValue: number;
  };
}

export type TabId =
  | "overview"
  | "leads"
  | "pipeline"
  | "discover"
  | "outreach"
  | "workflows"
  | "messaging"
  | "assistant"
  | "insights"
  | "deals"
  | "competitors"
  | "notifications"
  | "settings";

export type ThreatLevel = "low" | "medium" | "high";

export interface CompetitorAnalysis {
  id: string;
  userId: string;
  leadId?: string;
  competitorName: string;
  competitorUrl: string;
  techStack?: string[];
  seoScore?: number;
  socialScore?: number;
  strengths?: string[];
  weaknesses?: string[];
  opportunities?: string[];
  threats?: string[];
  threatLevel?: ThreatLevel;
  pricingModel?: string;
  estimatedTrafficTier?: "low" | "medium" | "high";
  differentiationOpportunities?: string[];
  analysisData?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebsiteAnalysisResult {
  uiUxScore: number;
  mobileResponsiveness: string;
  seoAssessment: string;
  contentQuality: string;
  ctaEffectiveness: string;
  overallScore: number;
  recommendedImprovements: {
    priority: 'high' | 'medium' | 'low';
    area: string;
    suggestion: string;
  }[];
  analysisSummary: string;
}

export type LeadActivityType =
  | "stage_change"
  | "note_added"
  | "deal_created"
  | "outreach_sent"
  | "analysis_complete"
  | "website_analyzed"
  | "score_updated"
  | "meeting_scheduled"
  | "meeting_completed"
  | "meeting_cancelled"
  | "meeting_rescheduled";

export interface LeadActivity {
  id: string;
  leadId: string;
  type: LeadActivityType;
  description: string;
  metadata?: string;
  createdAt: string;
}

export interface MeetingIntent {
  detected: true;
  intent: string;
  confidence: number;
  suggestedAction: string;
  leadId?: string;
  suggestSlotsAction: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  intentAnalysis?: string;
  buyingSignals?: string[];
  hesitationFactors?: string[];
  recommendedResponse?: string;
  closingStrategy?: string;
  meetingIntent?: MeetingIntent;
  createdAt: string;
}

export interface FollowUpReminder {
  id: string;
  leadId: string;
  message: string;
  dueAt: string;
  completed: boolean;
  lead?: {
    id: string;
    businessName: string;
    niche?: string;
    country?: string;
    stage: string;
  };
  createdAt: string;
}

export interface MeetingReminderInfo {
  id: string;
  meetingId: string;
  meetingTitle: string;
  meetingUrl: string | null;
  startDateTime: string;
  endDateTime: string;
  timezone: string;
  durationMinutes: number;
  platform: string;
  location: string | null;
  remindAt: string;
  minutesBefore: number;
  type: string;
  leadId: string | null;
  leadName: string | null;
  hostName: string;
  hostEmail: string;
}

// Helper functions for score-to-label conversion
export function urgencyScoreToLabel(score: number): "low" | "medium" | "high" | "critical" {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

export function revenueScoreToLabel(score: number): "low" | "medium" | "high" | "premium" {
  if (score >= 80) return "premium";
  if (score >= 55) return "high";
  if (score >= 30) return "medium";
  return "low";
}

export const NICHE_OPTIONS: Niche[] = [
  "Restaurant", "Cafe", "Gym", "Salon", "Clinic", "Hotel",
  "Legal", "Real Estate", "Interior Design", "Repair Shop",
  "Coaching", "Manufacturing", "Logistics", "Service",
  "Dental", "Healthcare", "E-commerce", "Fitness",
  "Hospitality", "Education", "Automotive", "Construction",
];

export const COUNTRY_OPTIONS: Country[] = [
  "India", "UAE", "USA", "UK", "Canada", "Australia",
];
