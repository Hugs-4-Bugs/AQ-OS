import type {
  Lead,
  Communication,
  Deal,
  DashboardStats,
  InsightData,
  Niche,
  Country,
  OutreachChannel,
  LeadStage,
  AssistantMessage,
  DigitalWeakness,
  ChannelInsight,
  NicheInsight,
  CountryInsight,
  StageFunnelItem,
  ScoreDistributionItem,
  WeeklyPerformanceItem,
  TopLeadToContact,
  FollowUpLead,
  Recommendation,
  WebsiteAnalysisResult,
  LeadActivity,
  LeadActivityType,
  FollowUpReminder,
  MeetingReminderInfo,
  SourceEffectivenessItem,
  HeatmapCell,
  PerformanceTrends,
  CompetitorAnalysis,
} from "./types";
import { urgencyScoreToLabel, revenueScoreToLabel } from "./types";
import { apiCall, safeApiCall, ApiError, getErrorFallbackMessage } from "./api-error-handler";
import { toast } from "sonner";

// ─── Helper: Transform raw DB lead to frontend Lead ─────────────

interface RawLead {
  id: string;
  businessName: string;
  ownerName?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  linkedin?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  googleMapsListing?: string | null;
  reviews?: string | null;
  rating?: number | null;
  estimatedQuality?: string | null;
  estimatedRevenue?: string | null;
  city?: string | null;
  country?: string | null;
  niche?: string | null;
  replyScore: number;
  conversionScore: number;
  urgencyScore: number;
  revenuePotentialScore: number;
  scoreReasoning?: string | null;
  stage: string;
  hasWebsite: boolean;
  websiteQuality?: string | null;
  digitalWeaknesses?: string | null;
  opportunityNotes?: string | null;
  bestContactPerson?: string | null;
  bestChannel?: string | null;
  bestTiming?: string | null;
  outreachStyle?: string | null;
  source?: string | null;
  notes?: string | null;
  tags?: string | null;
  communications?: RawCommunication[];
  deals?: RawDeal[];
  _count?: { communications: number; deals: number };
  createdAt: string;
  updatedAt: string;
}

interface RawCommunication {
  id: string;
  leadId: string;
  channel: string;
  direction: string;
  content: string;
  messageGeneratedByAI?: boolean;
  responseSummary?: string | null;
  intent?: string | null;
  buyingSignals?: string | null;
  hesitationReasons?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RawDeal {
  id: string;
  leadId: string;
  projectType?: string | null;
  projectScope?: string | null;
  proposedPrice?: number | null;
  finalPrice?: number | null;
  currency: string;
  status: string;
  implementationTimeline?: string | null;
  maintenancePlan?: string | null;
  proposalContent?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

function parseDigitalWeaknesses(raw: string | null | undefined): DigitalWeakness[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((w: string | DigitalWeakness) => {
        if (typeof w === 'string') {
          return { issue: w, severity: 'medium' as const };
        }
        return w;
      });
    }
    return [];
  } catch {
    return [];
  }
}

function transformLead(raw: RawLead): Lead {
  const communications = raw.communications?.map(transformCommunication) || [];
  const deals = raw.deals?.map(transformDeal) || [];

  // Derive lastContact from communications
  const outboundComms = communications.filter(c => c.direction === 'outbound' || c.direction === 'inbound');
  const lastContact = outboundComms.length > 0
    ? outboundComms.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0].createdAt
    : undefined;

  return {
    id: raw.id,
    businessName: raw.businessName,
    ownerName: raw.ownerName || undefined,
    website: raw.website || undefined,
    email: raw.email || undefined,
    phone: raw.phone || undefined,
    whatsapp: raw.whatsapp || undefined,
    linkedin: raw.linkedin || undefined,
    instagram: raw.instagram || undefined,
    facebook: raw.facebook || undefined,
    googleMapsListing: raw.googleMapsListing || undefined,
    rating: raw.rating ?? undefined,
    niche: raw.niche || undefined,
    country: raw.country || undefined,
    city: raw.city || undefined,
    stage: raw.stage as LeadStage,
    replyScore: raw.replyScore,
    conversionScore: raw.conversionScore,
    urgencyScore: raw.urgencyScore,
    revenuePotentialScore: raw.revenuePotentialScore,
    urgency: urgencyScoreToLabel(raw.urgencyScore),
    revenuePotential: revenueScoreToLabel(raw.revenuePotentialScore),
    digitalWeaknesses: parseDigitalWeaknesses(raw.digitalWeaknesses),
    hasWebsite: raw.hasWebsite,
    websiteQuality: raw.websiteQuality || undefined,
    scoreReasoning: raw.scoreReasoning || undefined,
    bestContactPerson: raw.bestContactPerson || undefined,
    bestChannel: raw.bestChannel || undefined,
    bestTiming: raw.bestTiming || undefined,
    outreachStyle: raw.outreachStyle || undefined,
    opportunityNotes: raw.opportunityNotes || undefined,
    source: raw.source || undefined,
    notes: raw.notes || undefined,
    tags: (() => {
      if (!raw.tags) return [];
      try {
        const parsed = JSON.parse(raw.tags);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })(),
    lastContact,
    communications,
    deals,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function transformCommunication(raw: RawCommunication): Communication {
  return {
    id: raw.id,
    leadId: raw.leadId,
    channel: raw.channel,
    direction: raw.direction as "outbound" | "inbound",
    content: raw.content,
    messageGeneratedByAI: raw.messageGeneratedByAI,
    responseSummary: raw.responseSummary || undefined,
    intent: raw.intent || undefined,
    buyingSignals: raw.buyingSignals || undefined,
    hesitationReasons: raw.hesitationReasons || undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function transformDeal(raw: RawDeal): Deal {
  return {
    id: raw.id,
    leadId: raw.leadId,
    projectType: raw.projectType || undefined,
    projectScope: raw.projectScope || undefined,
    proposedPrice: raw.proposedPrice ?? undefined,
    finalPrice: raw.finalPrice ?? undefined,
    currency: raw.currency,
    status: raw.status,
    notes: raw.notes || undefined,
    implementationTimeline: raw.implementationTimeline || undefined,
    maintenancePlan: raw.maintenancePlan || undefined,
    proposalContent: raw.proposalContent || undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

// ─── API Functions ────────────────────────────────────────────

export async function fetchLeads(params?: {
  stage?: LeadStage;
  niche?: Niche;
  country?: Country;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  page?: number;
  limit?: number;
}): Promise<{ leads: Lead[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const searchParams = new URLSearchParams();
  if (params?.stage) searchParams.set('stage', params.stage);
  if (params?.niche) searchParams.set('niche', params.niche);
  if (params?.country) searchParams.set('country', params.country);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));

  const data = await apiCall<{ leads: RawLead[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(
    `/api/leads?${searchParams.toString()}`,
    undefined,
    { errorMessage: 'Failed to fetch leads', showToast: false }
  );

  return {
    leads: data.leads.map(transformLead),
    pagination: data.pagination,
  };
}

export async function fetchLeadById(id: string): Promise<Lead | null> {
  try {
    const data = await apiCall<RawLead>(
      `/api/leads/${id}`,
      undefined,
      { errorMessage: 'Failed to fetch lead', showToast: false }
    );
    return transformLead(data);
  } catch (error) {
    // 404 means lead not found — return null instead of throwing
    if (error instanceof ApiError && error.status === 404) return null;
    // For other errors, also return null but log the issue
    console.error('[fetchLeadById] Error:', error);
    return null;
  }
}

export async function createLead(data: Partial<Lead> & { businessName: string }): Promise<Lead> {
  const result = await apiCall<RawLead>('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }, { errorMessage: 'Failed to create lead' });
  return transformLead(result);
}

export async function updateLead(id: string, data: Partial<Lead>): Promise<Lead | null> {
  const result = await apiCall<RawLead>(`/api/leads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }, { errorMessage: 'Failed to update lead' });
  return transformLead(result);
}

export async function deleteLead(id: string): Promise<boolean> {
  // Idempotent delete: if the server responds 404 LEAD_NOT_FOUND, the lead
  // is already gone (e.g. deleted in another session, or the browser is
  // showing a stale list after a data reset). Treating that as SUCCESS
  // lets the UI report success and invalidate the leads query, which
  // refetches the list and removes the phantom row. Previously this case
  // surfaced as "Deleted 0 leads, N failed", which confused users.
  try {
    await apiCall<void>(`/api/leads/${id}`, { method: 'DELETE' }, {
      errorMessage: 'Failed to delete lead',
      // We handle error toasts below so that the "already deleted" case
      // stays silent (it is a success, not an error).
      showToast: false,
    });
    return true;
  } catch (error) {
    // Already deleted → success (idempotent). Any 404 from this endpoint
    // means the lead does not exist, so the user's goal is achieved.
    if (error instanceof ApiError && error.status === 404) {
      return true;
    }
    // apiCall's built-in toast is suppressed for this call, so surface
    // the real error here (401 sessions expired, 403 forbidden, 500...).
    toast.error(getErrorFallbackMessage(error));
    throw error;
  }
}

export async function fetchStats(): Promise<DashboardStats> {
  return apiCall<DashboardStats>('/api/leads/stats', undefined, {
    errorMessage: 'Failed to fetch dashboard stats',
    showToast: false,
  });
}

export async function discoverBusinesses(
  niche: Niche,
  country: Country,
  city?: string
): Promise<Lead[]> {
  const data = await apiCall<{ leads: RawLead[] }>('/api/leads/discover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ niche, country, city }),
  }, { errorMessage: 'Failed to discover businesses', retryCount: 1 });
  return data.leads.map(transformLead);
}

export async function analyzeLead(id: string): Promise<{ lead: Lead; analysis: Record<string, unknown> }> {
  const data = await apiCall<{ lead: RawLead; analysis: Record<string, unknown> }>(`/api/leads/${id}/analyze`, {
    method: 'POST',
  }, { errorMessage: 'Failed to analyze lead' });
  return {
    lead: transformLead(data.lead),
    analysis: data.analysis,
  };
}

export async function generateOutreach(
  leadId: string,
  channel: OutreachChannel
): Promise<{ channel: string; messages: Record<string, string>; alternatives: Record<string, Record<string, string>> }> {
  return apiCall<{ channel: string; messages: Record<string, string>; alternatives: Record<string, Record<string, string>> }>(`/api/leads/${leadId}/outreach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel }),
  }, { errorMessage: 'Failed to generate outreach message' });
}

export async function addCommunication(
  leadId: string,
  data: { channel: string; direction: "outbound" | "inbound"; content: string; messageGeneratedByAI?: boolean }
): Promise<Communication> {
  const result = await apiCall<RawCommunication>(`/api/leads/${leadId}/communications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }, { errorMessage: 'Failed to add communication' });
  return transformCommunication(result);
}

export async function fetchCommunications(leadId: string): Promise<Communication[]> {
  const data = await apiCall<RawCommunication[]>(`/api/leads/${leadId}/communications`, undefined, {
    errorMessage: 'Failed to fetch communications',
    showToast: false,
  });
  return data.map(transformCommunication);
}

export async function createDeal(
  leadId: string,
  data: { projectType: string; projectScope?: string; proposedPrice?: number; currency?: string }
): Promise<Deal> {
  const result = await apiCall<RawDeal>(`/api/leads/${leadId}/deals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }, { errorMessage: 'Failed to create deal' });
  return transformDeal(result);
}

export async function updateDeal(
  id: string,
  data: { status?: string; proposedPrice?: number; finalPrice?: number; projectType?: string; projectScope?: string; currency?: string; implementationTimeline?: string; maintenancePlan?: string; proposalContent?: string; notes?: string }
): Promise<Deal & { lead?: { id: string; businessName: string; niche?: string; country?: string; city?: string; ownerName?: string } }> {
  const result = await apiCall<RawDeal & { lead?: { id: string; businessName: string; niche?: string; country?: string; city?: string; ownerName?: string } }>(`/api/deals/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }, { errorMessage: 'Failed to update deal' });
  return {
    ...transformDeal(result),
    lead: result.lead,
  };
}

export async function fetchDeals(leadId?: string): Promise<(Deal & { lead?: { id: string; businessName: string; niche?: string; country?: string; city?: string; ownerName?: string } })[]> {
  const url = leadId ? `/api/leads/${leadId}/deals` : '/api/deals';
  const data = await apiCall<(RawDeal & { lead?: { id: string; businessName: string; niche?: string; country?: string; city?: string; ownerName?: string } })[]>(url, undefined, {
    errorMessage: 'Failed to fetch deals',
    showToast: false,
  });
  return data.map((d) => ({
    ...transformDeal(d),
    lead: d.lead,
  }));
}

export async function askSalesAssistant(
  leadId: string | null,
  message: string,
  context?: string
): Promise<AssistantMessage> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await apiCall<Record<string, any>>('/api/sales-assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadId, message, context }),
  }, { errorMessage: 'Failed to get sales assistant response' });

  // Transform the structured AI response into an AssistantMessage
  const analysis = data.analysis || {};
  const psych = data.psychologicalApproach || {};
  const closing = data.closingStrategy || {};

  const buyingSignals = Array.isArray(analysis.buyingSignals)
    ? analysis.buyingSignals as string[]
    : [];
  const hesitationFactors = Array.isArray(analysis.hesitationPoints)
    ? analysis.hesitationPoints as string[]
    : [];

  const contentParts: string[] = [];

  if (analysis.intent) {
    contentParts.push(`**Intent Analysis:** ${analysis.intent}`);
  }
  if (buyingSignals.length > 0) {
    contentParts.push(`**Buying Signals:**\n${buyingSignals.map(s => `- ${s}`).join('\n')}`);
  }
  if (hesitationFactors.length > 0) {
    contentParts.push(`**Hesitation Factors:**\n${hesitationFactors.map(s => `- ${s}`).join('\n')}`);
  }
  if (data.suggestedResponse) {
    contentParts.push(`**Recommended Response:**\n${data.suggestedResponse}`);
  }
  if (psych.framework || psych.lever) {
    contentParts.push(`**Psychological Approach:** ${psych.framework || ''} — ${psych.lever || ''}. ${psych.rationale || ''}`);
  }
  if (closing.type || closing.nextMilestone) {
    contentParts.push(`**Closing Strategy:** ${closing.type || ''}. Next milestone: ${closing.nextMilestone || 'N/A'}. Timing: ${closing.timing || 'N/A'}`);
  }

  return {
    id: `asst-${Date.now()}`,
    role: "assistant",
    content: contentParts.join('\n\n'),
    intentAnalysis: analysis.intent as string | undefined,
    buyingSignals,
    hesitationFactors,
    recommendedResponse: data.suggestedResponse as string | undefined,
    closingStrategy: closing.type as string | undefined,
    meetingIntent: data.meetingIntent as AssistantMessage['meetingIntent'],
    createdAt: new Date().toISOString(),
  };
}

export async function fetchInsights(): Promise<InsightData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await apiCall<Record<string, any>>('/api/insights', undefined, {
    errorMessage: 'Failed to fetch insights',
    showToast: false,
  });

  return {
    bestChannels: (data.bestChannels || []) as ChannelInsight[],
    conversionByNiche: (data.conversionByNiche || []) as NicheInsight[],
    performanceByCountry: (data.performanceByCountry || []) as CountryInsight[],
    stageFunnel: (data.stageFunnel || []) as StageFunnelItem[],
    scoreDistribution: (data.scoreDistribution || []) as ScoreDistributionItem[],
    weeklyPerformance: (data.weeklyPerformance || []) as WeeklyPerformanceItem[],
    topLeadsToContact: (data.topLeadsToContact || []) as TopLeadToContact[],
    followUpsNeeded: (data.followUpsNeeded || []) as FollowUpLead[],
    recommendations: (data.recommendations || []) as Recommendation[],
    sourceEffectiveness: (data.sourceEffectiveness || []) as SourceEffectivenessItem[],
    leadScoreHeatmap: (data.leadScoreHeatmap || []) as HeatmapCell[],
    performanceTrends: (data.performanceTrends || {
      leads: { current: 0, previous: 0, trend: 0 },
      deals: { current: 0, previous: 0, trend: 0 },
      reply: { current: 0, previous: 0, trend: 0 },
      pipeline: { current: 0, previous: 0, trend: 0 },
    }) as PerformanceTrends,
    summary: data.summary || {
      totalLeads: 0,
      totalCommunications: 0,
      totalDeals: 0,
      totalPipelineValue: 0,
    },
  };
}

export async function generateProposal(dealId: string): Promise<string> {
  const data = await apiCall<{ proposal: string }>('/api/sales-assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'generate_proposal', dealId }),
  }, { errorMessage: 'Failed to generate proposal' });
  return data.proposal;
}

export async function analyzeWebsite(leadId: string): Promise<WebsiteAnalysisResult> {
  const data = await apiCall<{ analysis: WebsiteAnalysisResult }>(`/api/leads/${leadId}/analyze-website`, {
    method: 'POST',
  }, { errorMessage: 'Failed to analyze website' });
  return data.analysis;
}

export async function fetchLeadActivities(leadId: string): Promise<LeadActivity[]> {
  return apiCall<LeadActivity[]>(`/api/leads/${leadId}/activities`, undefined, {
    errorMessage: 'Failed to fetch lead activities',
    showToast: false,
  });
}

export async function createLeadActivity(
  leadId: string,
  data: { type: LeadActivityType; description: string; metadata?: string }
): Promise<LeadActivity> {
  return apiCall<LeadActivity>(`/api/leads/${leadId}/activities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }, { errorMessage: 'Failed to create activity' });
}

export async function explainScores(leadId: string): Promise<string> {
  const data = await apiCall<{ explanation: string }>(`/api/leads/${leadId}/explain-scores`, {
    method: 'POST',
  }, { errorMessage: 'Failed to explain scores' });
  return data.explanation;
}

// ─── Follow-up Reminders ─────────────────────────────────────

export async function fetchReminders(overdue?: boolean): Promise<FollowUpReminder[]> {
  const params = new URLSearchParams();
  if (overdue) params.set('overdue', 'true');
  const data = await apiCall<FollowUpReminder[]>(`/api/reminders?${params.toString()}`, undefined, {
    errorMessage: 'Failed to fetch reminders',
    showToast: false,
  });
  return data.map((r: FollowUpReminder) => ({
    ...r,
    dueAt: r.dueAt,
    lead: r.lead ? {
      id: r.lead.id,
      businessName: r.lead.businessName,
      niche: r.lead.niche,
      country: r.lead.country,
      stage: r.lead.stage,
    } : undefined,
  }));
}

export async function fetchLeadReminders(leadId: string): Promise<FollowUpReminder[]> {
  return apiCall<FollowUpReminder[]>(`/api/leads/${leadId}/reminders`, undefined, {
    errorMessage: 'Failed to fetch lead reminders',
    showToast: false,
  });
}

export async function createReminder(leadId: string, message: string, dueAt: string): Promise<FollowUpReminder> {
  return apiCall<FollowUpReminder>(`/api/leads/${leadId}/reminders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, dueAt }),
  }, { errorMessage: 'Failed to create reminder' });
}

export async function completeReminder(reminderId: string, leadId: string): Promise<FollowUpReminder> {
  return apiCall<FollowUpReminder>(`/api/leads/${leadId}/reminders`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reminderId, completed: true }),
  }, { errorMessage: 'Failed to complete reminder' });
}

// ─── Meeting Reminders ─────────────────────────────────────

export async function fetchMeetingReminders(limit?: number): Promise<MeetingReminderInfo[]> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  const data = await apiCall<{ reminders: MeetingReminderInfo[] }>(`/api/meetings/reminders?${params.toString()}`, undefined, {
    errorMessage: 'Failed to fetch meeting reminders',
    showToast: false,
  });
  return (data.reminders || []).map((r: MeetingReminderInfo) => ({
    ...r,
    startDateTime: r.startDateTime,
    endDateTime: r.endDateTime,
    remindAt: r.remindAt,
  }));
}

export async function processMeetingReminders(): Promise<{ processed: number; failed: number; total: number }> {
  const data = await apiCall<{ success: boolean; processed: number; failed: number; total: number }>('/api/meetings/reminders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, { errorMessage: 'Failed to process meeting reminders' });
  return { processed: data.processed, failed: data.failed, total: data.total };
}

export async function dismissMeetingReminder(reminderId: string): Promise<void> {
  await apiCall('/api/meetings/reminders', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reminderId, action: 'dismiss' }),
  }, { errorMessage: 'Failed to dismiss reminder' });
}

export async function snoozeMeetingReminder(reminderId: string, snoozeMinutes?: number): Promise<void> {
  await apiCall('/api/meetings/reminders', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reminderId, action: 'snooze', snoozeMinutes }),
  }, { errorMessage: 'Failed to snooze reminder' });
}

// ─── Competitor Analysis ─────────────────────────────────────

interface RawCompetitorAnalysis {
  id: string;
  userId: string;
  leadId?: string | null;
  competitorName: string;
  competitorUrl: string;
  techStack?: string | null;
  seoScore?: number | null;
  socialScore?: number | null;
  strengths?: string | null;
  weaknesses?: string | null;
  opportunities?: string | null;
  threatLevel?: string | null;
  analysisData?: string | null;
  createdAt: string;
  updatedAt: string;
}

function transformCompetitorAnalysis(raw: RawCompetitorAnalysis): CompetitorAnalysis {
  let analysisData: Record<string, unknown> | undefined;
  if (raw.analysisData) {
    try {
      analysisData = JSON.parse(raw.analysisData);
    } catch {
      analysisData = undefined;
    }
  }

  const parsed = analysisData as Record<string, unknown> | undefined;

  return {
    id: raw.id,
    userId: raw.userId,
    leadId: raw.leadId || undefined,
    competitorName: raw.competitorName,
    competitorUrl: raw.competitorUrl,
    techStack: parsed?.techStack ? parsed.techStack as string[] : undefined,
    seoScore: raw.seoScore ?? undefined,
    socialScore: raw.socialScore ?? undefined,
    strengths: parsed?.strengths ? parsed.strengths as string[] : undefined,
    weaknesses: parsed?.weaknesses ? parsed.weaknesses as string[] : undefined,
    opportunities: parsed?.opportunities ? parsed.opportunities as string[] : undefined,
    threats: parsed?.threats ? parsed.threats as string[] : undefined,
    threatLevel: (raw.threatLevel as CompetitorAnalysis['threatLevel']) ?? undefined,
    pricingModel: parsed?.pricingModel as string | undefined,
    estimatedTrafficTier: parsed?.estimatedTrafficTier as CompetitorAnalysis['estimatedTrafficTier'] ?? undefined,
    differentiationOpportunities: parsed?.differentiationOpportunities as string[] | undefined,
    analysisData: raw.analysisData ?? undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export async function fetchCompetitorAnalyses(): Promise<CompetitorAnalysis[]> {
  const data = await apiCall<RawCompetitorAnalysis[]>('/api/competitor', undefined, {
    errorMessage: 'Failed to fetch competitor analyses',
    showToast: false,
  });
  return data.map(transformCompetitorAnalysis);
}

export async function fetchCompetitorAnalysis(id: string): Promise<CompetitorAnalysis> {
  const data = await apiCall<RawCompetitorAnalysis>(`/api/competitor/${id}`, undefined, {
    errorMessage: 'Failed to fetch competitor analysis',
    showToast: false,
  });
  return transformCompetitorAnalysis(data);
}

export async function createCompetitorAnalysis(data: {
  competitorName: string;
  competitorUrl: string;
  yourBusinessName?: string;
  yourWebsiteUrl?: string;
}): Promise<CompetitorAnalysis> {
  const result = await apiCall<RawCompetitorAnalysis>('/api/competitor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }, { errorMessage: 'Failed to create competitor analysis' });
  return transformCompetitorAnalysis(result);
}

export async function deleteCompetitorAnalysis(id: string): Promise<boolean> {
  try {
    await apiCall<void>(`/api/competitor/${id}`, { method: 'DELETE' }, { errorMessage: 'Failed to delete competitor analysis' });
    return true;
  } catch {
    return false;
  }
}

// ─── Gmail integration API ───────────────────────────────────────

export interface GmailSyncStatus {
  connected: boolean;
  accounts: number;
  activeAccounts: number;
  lastSyncAt: string | null;
  pubSubEnabled: boolean;
  syncStatus: string;
}

export interface GmailAccountSummary {
  id: string;
  email: string;
  displayName?: string | null;
  provider?: string | null;
  status?: string;
  isActive?: boolean;
  isConnected?: boolean;
  isPaused?: boolean;
  lastSyncAt?: string | null;
  unreadCount?: number | null;
  totalMessages?: number | null;
  signature?: string | null;
}

export interface GmailThreadSummary {
  id: string;
  subject?: string | null;
  from?: string | null;
  fromName?: string | null;
  date?: string | null;
  snippet?: string | null;
  isRead?: boolean;
  isStarred?: boolean;
  hasAttachments?: boolean;
  participants?: string[];
  leadId?: string | null;
  labels?: string[];
  unreadCount?: number;
}

export interface GmailAttachmentInfo {
  id?: string;
  filename: string;
  size: number;
  mimeType?: string;
  url?: string;
}

export interface GmailThreadMessage {
  id: string;
  from?: string | null;
  fromName?: string | null;
  to?: string | null;
  date?: string | null;
  subject?: string | null;
  body?: string | null;
  snippet?: string | null;
  isRead?: boolean;
  isStarred?: boolean;
  hasAttachments?: boolean;
  attachments?: GmailAttachmentInfo[];
}

export interface GmailThreadDetail {
  id: string;
  subject?: string | null;
  participants?: string[];
  isStarred?: boolean;
  isRead?: boolean;
  leadId?: string | null;
  date?: string | null;
  messages?: GmailThreadMessage[];
}

export interface GmailThreadsResponse {
  threads: GmailThreadSummary[];
  pagination: { total: number; page: number; limit: number; hasMore: boolean };
}

export async function fetchGmailStatus(): Promise<GmailSyncStatus> {
  return apiCall<GmailSyncStatus>('/api/gmail/status', {}, { errorMessage: 'Failed to fetch Gmail status' });
}

export async function fetchGmailAccounts(): Promise<{ accounts: GmailAccountSummary[]; activeAccountId: string | null }> {
  return apiCall<{ accounts: GmailAccountSummary[]; activeAccountId: string | null }>(
    '/api/gmail/accounts', {}, { errorMessage: 'Failed to fetch Gmail accounts' }
  );
}

export async function fetchGmailThreads(params: {
  emailAccountId?: string;
  query?: string;
  limit?: number;
  page?: number;
  labelIds?: string[];
} = {}): Promise<GmailThreadsResponse> {
  const qs = new URLSearchParams();
  if (params.emailAccountId) qs.set('emailAccountId', params.emailAccountId);
  if (params.query) qs.set('query', params.query);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.page) qs.set('page', String(params.page));
  if (params.labelIds?.length) qs.set('labelIds', params.labelIds.join(','));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiCall<GmailThreadsResponse>(`/api/gmail/threads${suffix}`, {}, { errorMessage: 'Failed to fetch Gmail threads' });
}

export async function fetchGmailThread(threadId: string): Promise<GmailThreadDetail> {
  return apiCall<GmailThreadDetail>(
    `/api/gmail/thread/${encodeURIComponent(threadId)}`,
    {},
    { errorMessage: 'Failed to fetch Gmail thread' }
  );
}

export async function connectGmail(): Promise<{ authUrl: string }> {
  return apiCall<{ authUrl: string }>(
    '/api/gmail/connect',
    { method: 'POST' },
    { errorMessage: 'Failed to start Gmail connection' }
  );
}

export async function disconnectGmail(emailAccountId: string): Promise<void> {
  await apiCall<unknown>(
    '/api/gmail/disconnect',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailAccountId }),
    },
    { errorMessage: 'Failed to disconnect Gmail account' }
  );
}

export async function sendGmailEmail(params: {
  emailAccountId: string;
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  leadId?: string;
}): Promise<{ success: boolean; messageId?: string }> {
  return apiCall<{ success: boolean; messageId?: string }>(
    '/api/gmail/send',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
    { errorMessage: 'Failed to send email' }
  );
}

export async function createGmailDraft(params: {
  emailAccountId: string;
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  action?: 'create' | 'update';
  draftId?: string;
}): Promise<{ success: boolean; draftId?: string }> {
  return apiCall<{ success: boolean; draftId?: string }>(
    '/api/gmail/draft',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
    { errorMessage: 'Failed to save draft' }
  );
}

export async function replyGmailEmail(params: {
  emailAccountId: string;
  messageId: string;
  body: string;
  replyAll?: boolean;
}): Promise<{ success: boolean; messageId?: string }> {
  return apiCall<{ success: boolean; messageId?: string }>(
    '/api/gmail/reply',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
    { errorMessage: 'Failed to send reply' }
  );
}

// ─── Telegram integration API ────────────────────────────────────

export async function sendTelegramMessage(params: {
  chatId: string;
  message: string;
  parseMode?: string;
  replyToMessageId?: string;
}): Promise<{ success: boolean }> {
  return apiCall<{ success: boolean }>(
    '/api/telegram/send',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: params.chatId,
        content: params.message,
        parseMode: params.parseMode,
        replyToMessageId: params.replyToMessageId,
      }),
    },
    { errorMessage: 'Failed to send Telegram message' }
  );
}
