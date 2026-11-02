// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin CRM Lead List Service
//
// Paginated, filtered lead list for the CRM Leads workspace.
// Read-only. Stage mapping is a read-time projection (no data rewrite).
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { mapLeadStageToCanonical, isLeadStale, isLeadStalled, STALE_DAYS } from './crm-stage-vocabulary';
import type { LeadListFilters, LeadListItem, LeadListResult } from './crm-types';
import type { CanonicalStage } from './crm-stage-vocabulary';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export async function getLeads(filters: LeadListFilters): Promise<LeadListResult> {
  const limit = Math.min(Math.max(filters.limit || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(filters.offset || 0, 0);
  const now = new Date();

  // Build Prisma where from filters
  const where: Record<string, unknown> = {
    isActive: true,
    deletedAt: null,
  };

  // Stage filter — needs read-time mapping, so we fetch a broader set and
  // filter in JS if a canonical stage is specified. For the common case
  // (no stage filter or 'all'), we use pure DB filtering for performance.
  let stageFilterInJs = false;
  if (filters.stage && filters.stage !== 'all') {
    // Map canonical stage back to possible raw values
    const canonical = filters.stage as CanonicalStage;
    const rawValues = rawStageValuesForCanonical(canonical);
    if (rawValues.length > 0) {
      where.stage = { in: rawValues };
    } else {
      // Canonical stage with no known raw mapping (e.g. 'replied' when DB
      // only has 'discovered'/'contacted') — filter in JS after fetch
      stageFilterInJs = true;
    }
  }

  if (filters.source && filters.source !== 'all') {
    where.source = filters.source;
  }

  if (filters.search) {
    where.OR = [
      { businessName: { contains: filters.search } },
      { email: { contains: filters.search } },
      { ownerName: { contains: filters.search } },
      { niche: { contains: filters.search } },
      { city: { contains: filters.search } },
    ];
  }

  if (filters.hotOnly) {
    where.replyScore = { gte: 70 };
  }

  if (filters.hasEmail) {
    where.email = { not: null };
  }

  // Stale filter: leads in discovered/analyzed older than STALE_DAYS
  if (filters.staleOnly) {
    where.stage = { in: ['discovered', 'analyzed', null] };
    where.createdAt = { lt: daysAgo(STALE_DAYS) };
  }

  // Fetch with a broader limit if we need JS stage filtering
  const fetchLimit = stageFilterInJs ? Math.min(limit * 10, MAX_LIMIT * 4) : limit;

  const [leads, total] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: fetchLimit,
      skip: offset,
      select: {
        id: true,
        businessName: true,
        ownerName: true,
        email: true,
        phone: true,
        website: true,
        stage: true,
        source: true,
        niche: true,
        city: true,
        country: true,
        replyScore: true,
        conversionScore: true,
        urgencyScore: true,
        revenuePotentialScore: true,
        emailStatus: true,
        lastContactedAt: true,
        followUpAt: true,
        createdAt: true,
      },
    }),
    db.lead.count({ where }),
  ]);

  // Map to canonical + compute stale/stalled flags
  let items: LeadListItem[] = leads.map((l) => {
    const canonical = mapLeadStageToCanonical(l.stage);
    return {
      id: l.id,
      businessName: l.businessName,
      ownerName: l.ownerName,
      email: l.email,
      phone: l.phone,
      website: l.website,
      stage: canonical,
      rawStage: l.stage,
      source: l.source,
      niche: l.niche,
      city: l.city,
      country: l.country,
      replyScore: l.replyScore,
      conversionScore: l.conversionScore,
      urgencyScore: l.urgencyScore,
      revenuePotentialScore: l.revenuePotentialScore,
      emailStatus: l.emailStatus,
      lastContactedAt: l.lastContactedAt?.toISOString() || null,
      followUpAt: l.followUpAt?.toISOString() || null,
      createdAt: l.createdAt.toISOString(),
      isStale: isLeadStale({ stage: canonical, createdAt: l.createdAt, now }),
      isStalled: isLeadStalled({ stage: canonical, lastContactedAt: l.lastContactedAt, now }),
    };
  });

  // JS stage filtering for canonical stages with no raw mapping
  if (stageFilterInJs && filters.stage && filters.stage !== 'all') {
    const target = filters.stage as CanonicalStage;
    items = items.filter((i) => i.stage === target);
  }

  // Trim to requested limit after JS filtering
  items = items.slice(0, limit);

  return {
    leads: items,
    total: stageFilterInJs ? items.length : total,
    hasMore: offset + items.length < total,
  };
}

/** Return all raw stage values that map to a given canonical stage. */
function rawStageValuesForCanonical(canonical: CanonicalStage): string[] {
  switch (canonical) {
    case 'discovered': return ['discovered', 'new', 'pending', 'unqualified', 'fresh'];
    case 'analyzed': return ['analyzed', 'scored', 'enriched', 'qualified', 'analyzed_lead'];
    case 'contacted': return ['contacted'];
    case 'replied': return ['replied', 'responded', 'engaged', 'interested'];
    case 'meeting': return ['meeting_scheduled', 'meeting_booked', 'demo', 'call_scheduled'];
    case 'proposal': return ['proposal_sent', 'quoted', 'pitched'];
    case 'negotiation': return ['negotiating', 'in_negotiation', 'terms'];
    case 'won': return ['won', 'closed_won', 'closed-won', 'converted', 'success'];
    case 'lost': return ['lost', 'closed_lost', 'closed-lost', 'dropped', 'disqualified', 'failed'];
    default: return [];
  }
}

// ── Lead detail ──────────────────────────────────────────────────────

export interface LeadDetail {
  id: string;
  businessName: string;
  ownerName: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  linkedin: string | null;
  instagram: string | null;
  website: string | null;
  stage: CanonicalStage;
  rawStage: string;
  source: string | null;
  niche: string | null;
  city: string | null;
  country: string | null;
  estimatedQuality: string | null;
  estimatedRevenue: string | null;
  replyScore: number;
  conversionScore: number;
  urgencyScore: number;
  revenuePotentialScore: number;
  scoreReasoning: string | null;
  emailStatus: string | null;
  hasWebsite: boolean;
  websiteQuality: string | null;
  digitalWeaknesses: string | null;
  opportunityNotes: string | null;
  bestContactPerson: string | null;
  bestChannel: string | null;
  outreachStyle: string | null;
  notes: string | null;
  tags: string;
  followUpAt: string | null;
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isStale: boolean;
  isStalled: boolean;
  // Related
  activities: Array<{ id: string; type: string; description: string; createdAt: string; actorEmail: string | null }>;
  outreachMessages: Array<{ id: string; channel: string; status: string; subject: string | null; sentAt: string | null; createdAt: string }>;
  meetings: Array<{ id: string; title: string; status: string; startDateTime: string; platform: string }>;
  deals: Array<{ id: string; status: string; proposedPrice: number | null; title: string | null; createdAt: string }>;
  followUpReminders: Array<{ id: string; message: string; dueAt: string; completed: boolean }>;
  analysis: {
    websiteQualityScore: number;
    digitalMaturityScore: number;
    replyScore: number;
    dealConversionScore: number;
    urgencyScore: number;
    revenuePotentialScore: number;
    weaknesses: string | null;
    recommendedServices: string | null;
    estimatedDealValueUsd: string | null;
    closingStrategy: string | null;
    isStale: boolean;
  } | null;
}

export async function getLeadDetail(leadId: string): Promise<LeadDetail | null> {
  const now = new Date();
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: {
      activities: { orderBy: { createdAt: 'desc' }, take: 20, include: { user: { select: { email: true } } } },
      outreachMessages: { orderBy: { createdAt: 'desc' }, take: 20 },
      meetings: { orderBy: { startDateTime: 'desc' }, take: 10 },
      deals: { orderBy: { createdAt: 'desc' }, take: 10 },
      followUpReminders: { orderBy: { dueAt: 'desc' }, take: 10 },
      leadAnalysis: { take: 1, orderBy: { updatedAt: 'desc' } },
    },
  });

  if (!lead) return null;

  const canonical = mapLeadStageToCanonical(lead.stage);
  const analysis = lead.leadAnalysis[0] || null;

  return {
    id: lead.id,
    businessName: lead.businessName,
    ownerName: lead.ownerName,
    email: lead.email,
    phone: lead.phone,
    whatsapp: lead.whatsapp,
    linkedin: lead.linkedin,
    instagram: lead.instagram,
    website: lead.website,
    stage: canonical,
    rawStage: lead.stage,
    source: lead.source,
    niche: lead.niche,
    city: lead.city,
    country: lead.country,
    estimatedQuality: lead.estimatedQuality,
    estimatedRevenue: lead.estimatedRevenue,
    replyScore: lead.replyScore,
    conversionScore: lead.conversionScore,
    urgencyScore: lead.urgencyScore,
    revenuePotentialScore: lead.revenuePotentialScore,
    scoreReasoning: lead.scoreReasoning,
    emailStatus: lead.emailStatus,
    hasWebsite: lead.hasWebsite,
    websiteQuality: lead.websiteQuality,
    digitalWeaknesses: lead.digitalWeaknesses,
    opportunityNotes: lead.opportunityNotes,
    bestContactPerson: lead.bestContactPerson,
    bestChannel: lead.bestChannel,
    outreachStyle: lead.outreachStyle,
    notes: lead.notes,
    tags: lead.tags,
    followUpAt: lead.followUpAt?.toISOString() || null,
    lastContactedAt: lead.lastContactedAt?.toISOString() || null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    isStale: isLeadStale({ stage: canonical, createdAt: lead.createdAt, now }),
    isStalled: isLeadStalled({ stage: canonical, lastContactedAt: lead.lastContactedAt, now }),
    activities: lead.activities.map((a) => ({
      id: a.id, type: a.type, description: a.description,
      createdAt: a.createdAt.toISOString(), actorEmail: a.user?.email || null,
    })),
    outreachMessages: lead.outreachMessages.map((m) => ({
      id: m.id, channel: m.channel, status: m.status, subject: m.subject,
      sentAt: m.sentAt?.toISOString() || null, createdAt: m.createdAt.toISOString(),
    })),
    meetings: lead.meetings.map((m) => ({
      id: m.id, title: m.title, status: m.status,
      startDateTime: m.startDateTime.toISOString(), platform: m.platform,
    })),
    deals: lead.deals.map((d) => ({
      id: d.id, status: d.status, proposedPrice: d.proposedPrice,
      title: d.title, createdAt: d.createdAt.toISOString(),
    })),
    followUpReminders: lead.followUpReminders.map((f) => ({
      id: f.id, message: f.message, dueAt: f.dueAt.toISOString(), completed: f.completed,
    })),
    analysis: analysis ? {
      websiteQualityScore: analysis.websiteQualityScore,
      digitalMaturityScore: analysis.digitalMaturityScore,
      replyScore: analysis.replyScore,
      dealConversionScore: analysis.dealConversionScore,
      urgencyScore: analysis.urgencyScore,
      revenuePotentialScore: analysis.revenuePotentialScore,
      weaknesses: analysis.weaknesses,
      recommendedServices: analysis.recommendedServices,
      estimatedDealValueUsd: analysis.estimatedDealValueUsd,
      closingStrategy: analysis.closingStrategy,
      isStale: analysis.isStale || false,
    } : null,
  };
}
