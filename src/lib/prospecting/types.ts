// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — 5-Step Prospecting Pipeline Types
// STEP 1 Company Deep Research → STEP 2 Gap Detection
// → STEP 3 User Offer Profile Match → STEP 4 Personalized Pitch
// → STEP 5 Smart Email
// ═══════════════════════════════════════════════════════════════════

/** One service/offer the app user sells to prospects (Settings → My Offer). */
export interface OfferService {
  id: string;
  label: string; // e.g. "Web Development", "AI Automation"
  category: string; // e.g. "web", "marketing", "ai_automation", "saas"
  description: string; // one-line description of the offer
}

/** STEP 1 — structured company profile built from REAL data only. */
export interface PipelineResearch {
  businessType: string; // e.g. "Private hospital", "Textile manufacturer"
  whatTheySell: string[]; // products sold
  services: string[]; // services offered
  targetMarket: string; // who their customers are
  teamSizeEstimate: string; // evidence-based estimate or "unknown"
  revenueEstimate: string; // evidence-based estimate or "unknown"
  techStack: string[]; // technologies actually detected on their site
  socialPresence: {
    platforms: string[]; // platforms found (with URLs when available)
    signals: string; // activity level / follower signals found, or "No data found"
  };
  reviewsSummary: {
    averageRating: string; // e.g. "4.2" or "unknown"
    sentiment: string; // positive/mixed/negative/unknown
    highlights: string[]; // specific review snippets found
  };
  dataSources: {
    websiteFetched: boolean; // did we actually download their website?
    pagesFetched: string[]; // which pages were successfully fetched
    webSearchUsed: boolean; // did web search return results?
    websiteScore: number | null; // website-scorer overall score 0-100
  };
  confidence: 'high' | 'medium' | 'low';
  summary: string; // 2-3 sentence plain-language company summary
}

export type PipelineGapCategory =
  | 'website_quality'
  | 'seo'
  | 'automation'
  | 'missing_features'
  | 'outdated_process'
  | 'weak_area'
  | 'digital_presence';

/** STEP 2 — one detected gap with real evidence. */
export interface PipelineGap {
  category: PipelineGapCategory;
  gap: string;
  evidence: string; // what we actually observed (measured/fetched)
  severity: 'critical' | 'moderate' | 'minor';
  businessImpact: string; // how it hurts THEIR business
}

/** STEP 2 — full gap detection result. */
export interface PipelineGaps {
  overallDigitalHealthScore: number; // 0-100 (website score or 0 when no site)
  gaps: PipelineGap[];
  strengths: string[]; // what they already do well
}

/** STEP 3 — one offer ↔ gap match. */
export interface OfferMatch {
  offerLabel: string;
  matchedGaps: string[]; // gap titles this offer resolves
  matchStrength: 'strong' | 'partial' | 'weak';
  rationale: string; // why this offer fits this company
  angle: string; // how to position the offer in outreach
}

/** STEP 3 — full match result. */
export interface PipelineMatch {
  matchScore: number; // 0-100 overall offer fit
  opportunityStatement: string; // "Company X has gap Y → User offers Z"
  matches: OfferMatch[];
  skipped: boolean; // true when the user has no offer profile configured
  skipReason?: string;
}

/** STEP 4 — personalized pitch (like the Cavalier Hospital example). */
export interface PipelinePitch {
  headline: string;
  pitch: string; // ≤150 words, references specific evidence
  keyPoints: string[]; // 2-4 concrete points
  projectedOutcome: string; // quantified estimate (labelled as estimate)
  callToAction: string;
}

/** STEP 5 — smart email draft. */
export interface PipelineEmail {
  subject: string; // ≤60 chars, specific to their gap
  body: string; // ≤150 words, addresses their exact problem
  cta: string; // CTA relevant to their business
  postscript?: string;
}

export type PipelineStepState = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/** Full pipeline state returned by the status API and consumed by the UI. */
export interface PipelineState {
  id: string;
  leadId: string;
  userId: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  currentStep: number;
  totalSteps: number;
  stepStatus: Record<string, PipelineStepState>;
  progress: number;
  research: PipelineResearch | null;
  gaps: PipelineGaps | null;
  match: PipelineMatch | null;
  pitch: PipelinePitch | null;
  email: PipelineEmail | null;
  overallScore: number | null;
  temperature: string | null;
  outreachMessageId: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export const PIPELINE_STEP_LABELS: Record<number, string> = {
  1: 'Company Deep Research',
  2: 'Gap Detection',
  3: 'Offer Profile Match',
  4: 'Personalized Pitch',
  5: 'Smart Email',
};

/** Total credits charged for one full pipeline run (5 credits analysis + 2 credits email). */
export const PIPELINE_CREDIT_COST = 7;
