// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — 5-Step Prospecting Pipeline: Orchestrator
//
// Lifecycle: startProspectPipeline() creates a ProspectPipeline row and
// fires runProspectPipeline() in the background (DiscoveryJob pattern —
// Next.js routes time out, so heavy work runs detached). The UI polls
// getLatestPipelineForLead() for live progress.
//
// Credits: 7 charged upfront (5 deep_analysis + 2 outreach_message).
// Refunds: full refund if STEP 1 fails (nothing delivered); 2-credit
// refund if STEP 5 fails after analysis completed. Idempotency key
// prevents double deduction on retries.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { resolveLeadForExecution } from '@/lib/lead-resolution';
import {
  checkCreditSufficiency,
  deductCredits,
  refundCredits,
} from '@/lib/credit-service';
import { logAuditEvent } from '@/lib/lead-audit';
import { logAIAudit } from '@/lib/ai/ai-audit';
import { createNotificationOnce } from '@/lib/notification-service';
import { analyzeWebsite, type WebsiteScore } from '@/lib/lead-discovery/website-scorer';
import {
  fetchSiteBundle,
  buildSiteTextBundle,
  normalizeUrl,
} from './website-fetch';
import {
  runStepEmail,
  runStepGaps,
  runStepMatch,
  runStepPitch,
  runStepResearch,
  type LeadContext,
} from './pipeline-steps';
import type {
  OfferService,
  PipelineEmail,
  PipelineGaps,
  PipelineMatch,
  PipelinePitch,
  PipelineResearch,
  PipelineState,
  PipelineStepState,
} from './types';
import { PIPELINE_CREDIT_COST } from './types';

const STALE_RUNNING_MS = 10 * 60 * 1000; // 10 minutes

// ===== Offer profile (UserSettings.servicesOffered) =====

export function parseOfferServices(raw: string | null | undefined): OfferService[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s): s is Partial<OfferService> =>
          !!s && typeof s === 'object' && typeof (s as OfferService).label === 'string'
      )
      .map((s, i) => ({
        id: typeof s.id === 'string' && s.id ? s.id : `offer_${i + 1}`,
        label: s.label!.trim().slice(0, 120),
        category: typeof s.category === 'string' && s.category ? s.category.trim().slice(0, 60) : 'general',
        description: typeof s.description === 'string' ? s.description.trim().slice(0, 400) : '',
      }))
      .filter((s) => s.label.length > 0)
      .slice(0, 20);
  } catch {
    return [];
  }
}

export async function loadUserOffers(userId: string): Promise<OfferService[]> {
  const settings = await db.userSettings.findUnique({
    where: { userId },
    select: { servicesOffered: true },
  });
  return parseOfferServices(settings?.servicesOffered);
}

// ===== Start a run =====

export interface StartPipelineResult {
  success: boolean;
  pipelineId?: string;
  error?: string;
  errorCode?: 'LEAD_NOT_FOUND' | 'ALREADY_RUNNING' | 'INSUFFICIENT_CREDITS' | 'LEAD_HAS_NO_CONTACT';
}

export async function startProspectPipeline(
  userId: string,
  leadId: string
): Promise<StartPipelineResult> {
  // Single reliable lead resolution path — owner-scoped, with
  // server-side LEAD_NOT_FOUND vs LEAD_ACCESS_DENIED diagnostics.
  // User-facing message stays generic ("Lead not found").
  const resolution = await resolveLeadForExecution(userId, leadId);
  if (!resolution.ok) {
    return { success: false, error: resolution.userMessage, errorCode: 'LEAD_NOT_FOUND' };
  }
  const lead = resolution.lead;

  // Guard: one live run per lead (stale runs older than 10 min are failed first)
  const running = await db.prospectPipeline.findFirst({
    where: { leadId, status: 'running' },
    orderBy: { createdAt: 'desc' },
  });
  if (running) {
    const isStale = running.startedAt && Date.now() - running.startedAt.getTime() > STALE_RUNNING_MS;
    if (isStale) {
      await db.prospectPipeline.update({
        where: { id: running.id },
        data: { status: 'failed', error: 'Pipeline timed out (stale run)', completedAt: new Date() },
      });
    } else {
      return {
        success: false,
        error: 'A pipeline run is already in progress for this lead',
        errorCode: 'ALREADY_RUNNING',
      };
    }
  }

  const balance = await checkCreditSufficiency(userId, PIPELINE_CREDIT_COST);
  if (!balance.sufficient) {
    return {
      success: false,
      error: `Insufficient credits: need ${PIPELINE_CREDIT_COST}, have ${balance.balance}`,
      errorCode: 'INSUFFICIENT_CREDITS',
    };
  }

  const pipeline = await db.prospectPipeline.create({
    data: {
      leadId,
      userId,
      status: 'running',
      currentStep: 1,
      totalSteps: 5,
      stepStatus: JSON.stringify({
        '1': 'running',
        '2': 'pending',
        '3': 'pending',
        '4': 'pending',
        '5': 'pending',
      }),
      progress: 0,
      startedAt: new Date(),
    },
  });

  const deduct = await deductCredits({
    userId,
    action: 'prospect_pipeline',
    cost: PIPELINE_CREDIT_COST,
    referenceId: pipeline.id,
    idempotencyKey: pipeline.id,
  });
  if (!deduct.success) {
    await db.prospectPipeline.update({
      where: { id: pipeline.id },
      data: { status: 'failed', error: deduct.error || 'Credit deduction failed', completedAt: new Date() },
    });
    return { success: false, error: deduct.error || 'Credit deduction failed', errorCode: 'INSUFFICIENT_CREDITS' };
  }

  await logAuditEvent(userId, 'prospect_pipeline_started', {
    leadId,
    credits: PIPELINE_CREDIT_COST,
  }, pipeline.id).catch(() => {});

  // Fire-and-forget background execution (never awaited by the route)
  void runProspectPipeline(pipeline.id).catch(async (err) => {
    console.error(`[ProspectPipeline] Unhandled run failure for ${pipeline.id}:`, err);
    await db.prospectPipeline
      .update({
        where: { id: pipeline.id },
        data: { status: 'failed', error: 'Unexpected pipeline error', completedAt: new Date() },
      })
      .catch(() => {});
  });

  return { success: true, pipelineId: pipeline.id };
}

// ===== Background execution =====

function markStep(
  stepStatus: Record<string, PipelineStepState>,
  step: number,
  state: PipelineStepState
): Record<string, PipelineStepState> {
  return { ...stepStatus, [String(step)]: state };
}

async function saveStepResult(
  pipelineId: string,
  step: number,
  state: PipelineStepState,
  patch: Record<string, unknown>
) {
  const current = await db.prospectPipeline.findUnique({
    where: { id: pipelineId },
    select: { stepStatus: true, progress: true },
  });
  const parsed = safeParseStepStatus(current?.stepStatus);
  const next = markStep(parsed, step, state);
  const completedCount = Object.values(next).filter((s) => s === 'completed' || s === 'skipped').length;
  const progress = Math.round((completedCount / 5) * 100);
  await db.prospectPipeline.update({
    where: { id: pipelineId },
    data: { stepStatus: JSON.stringify(next), progress, currentStep: step, ...patch },
  });
}

function safeParseStepStatus(raw: string | null | undefined): Record<string, PipelineStepState> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export async function runProspectPipeline(pipelineId: string): Promise<void> {
  const pipeline = await db.prospectPipeline.findUnique({ where: { id: pipelineId } });
  if (!pipeline || pipeline.status !== 'running') return;

  const lead = await db.lead.findUnique({ where: { id: pipeline.leadId } });
  if (!lead) {
    await db.prospectPipeline.update({
      where: { id: pipelineId },
      data: { status: 'failed', error: 'Lead no longer exists', completedAt: new Date() },
    });
    return;
  }

  const userId = pipeline.userId;
  const ctx: LeadContext = {
    id: lead.id,
    businessName: lead.businessName,
    website: lead.website,
    niche: lead.niche,
    city: lead.city,
    country: lead.country,
    email: lead.email,
    phone: lead.phone,
    rating: lead.rating,
    reviews: lead.reviews,
    ownerName: lead.ownerName,
    hasWebsite: lead.hasWebsite,
  };

  const stepStatus = safeParseStepStatus(pipeline.stepStatus);

  try {
    // ── STEP 1: Company Deep Research ──
    await saveStepResult(pipelineId, 1, 'running', {});
    const normalizedSite = normalizeUrl(lead.website);
    let websiteScore: WebsiteScore | null = null;
    let siteText = '';
    try {
      if (normalizedSite) {
        websiteScore = await analyzeWebsite(normalizedSite, lead.businessName, lead.niche || 'business').catch(() => null);
        const bundle = await fetchSiteBundle(normalizedSite, 3);
        siteText = bundle.homepage?.ok ? buildSiteTextBundle(bundle.homepage, bundle.subPages) : '';
      }
    } catch (fetchErr) {
      console.error('[ProspectPipeline] site fetch failed:', fetchErr);
    }
    const research: PipelineResearch = await runStepResearch(ctx, userId);
    await saveStepResult(pipelineId, 1, 'completed', {
      step1ResearchJson: JSON.stringify(research),
    });
    await logAIAudit({
      userId,
      action: 'ai_analysis_generated',
      resource: 'prospect_pipeline',
      resourceId: pipelineId,
      details: { step: 1, websiteFetched: research.dataSources.websiteFetched },
    }).catch(() => {});

    // ── STEP 2: Gap Detection ──
    await saveStepResult(pipelineId, 2, 'running', {});
    const gaps: PipelineGaps = await runStepGaps(ctx, research, websiteScore, siteText, userId);
    await saveStepResult(pipelineId, 2, 'completed', {
      step2GapsJson: JSON.stringify(gaps),
    });

    // ── STEP 3: Offer Profile Match ──
    await saveStepResult(pipelineId, 3, 'running', {});
    const offers = await loadUserOffers(userId);
    const match: PipelineMatch = await runStepMatch(ctx, gaps, offers, userId);
    await saveStepResult(pipelineId, 3, match.skipped ? 'skipped' : 'completed', {
      step3MatchJson: JSON.stringify(match),
      overallScore: match.skipped ? null : match.matchScore,
    });

    // ── STEP 4: Personalized Pitch ──
    await saveStepResult(pipelineId, 4, 'running', {});
    const pitch: PipelinePitch = await runStepPitch(ctx, research, gaps, match, userId);
    await saveStepResult(pipelineId, 4, 'completed', {
      step4PitchJson: JSON.stringify(pitch),
    });

    // ── STEP 5: Smart Email ──
    await saveStepResult(pipelineId, 5, 'running', {});
    const email: PipelineEmail = await runStepEmail(ctx, research, gaps, pitch, userId);

    // Persist as an OutreachMessage draft (reuses existing outreach storage)
    const outreach = await db.outreachMessage.create({
      data: {
        leadId: lead.id,
        userId,
        channel: 'email',
        direction: 'outbound',
        subject: email.subject,
        content: email.postscript ? `${email.body}\n\nP.S. ${email.postscript}` : email.body,
        status: 'draft',
        generatedByAI: true,
        metadata: JSON.stringify({
          source: 'prospect_pipeline',
          pipelineId,
          cta: email.cta,
          matchScore: match.skipped ? null : match.matchScore,
        }),
      },
    });

    await saveStepResult(pipelineId, 5, 'completed', {
      step5EmailJson: JSON.stringify(email),
      outreachMessageId: outreach.id,
      temperature: match.matchScore >= 65 ? 'hot' : match.matchScore >= 40 ? 'warm' : 'cold',
    });

    // Lead surface fields — only fill when empty (never clobber existing data)
    await db.lead.updateMany({
      where: { id: lead.id, digitalWeaknesses: null },
      data: { digitalWeaknesses: gaps.gaps.slice(0, 4).map((g) => g.gap).join('; ') },
    });
    await db.lead.updateMany({
      where: { id: lead.id, opportunityNotes: null },
      data: { opportunityNotes: pitch.pitch },
    });

    await db.prospectPipeline.update({
      where: { id: pipelineId },
      data: { status: 'completed', completedAt: new Date(), currentStep: 5, progress: 100 },
    });

    await db.leadActivity.create({
      data: {
        leadId: lead.id,
        userId,
        type: 'prospect_pipeline_completed',
        description: `5-step prospect pipeline completed: research + ${gaps.gaps.length} gaps detected${match.skipped ? '' : `; offer match ${match.matchScore}/100`}; smart email drafted`,
        metadata: JSON.stringify({
          pipelineId,
          gapCount: gaps.gaps.length,
          matchScore: match.skipped ? null : match.matchScore,
        }),
      },
    }).catch(() => {});

    await logAuditEvent(userId, 'prospect_pipeline_completed', {
      leadId: lead.id,
      gapCount: gaps.gaps.length,
    }, pipelineId).catch(() => {});

    await createNotificationOnce({
      userId,
      type: 'ai_analysis_complete',
      title: 'Prospect pipeline completed',
      message: `${lead.businessName}: ${gaps.gaps.length} gaps found${match.skipped ? '' : `, ${match.matchScore}/100 offer match`}. Smart email draft is ready.`,
      actionUrl: '/business-ai/leads',
      metadata: { pipelineId, leadId: lead.id },
      dedupeKey: `prospect_pipeline:${pipelineId}:completed`,
    }).catch(() => {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ProspectPipeline] Run ${pipelineId} failed:`, err);

    const current = await db.prospectPipeline.findUnique({
      where: { id: pipelineId },
      select: { stepStatus: true },
    });
    const steps = safeParseStepStatus(current?.stepStatus);
    const analysisDone = steps['1'] === 'completed'; // step 1 delivered → keep 5, refund 2

    const refund = await refundCredits({
      userId,
      amount: analysisDone ? 2 : PIPELINE_CREDIT_COST,
      originalAction: 'prospect_pipeline',
      referenceId: pipelineId,
    }).catch(() => ({ success: false }));

    await db.prospectPipeline.update({
      where: { id: pipelineId },
      data: {
        status: 'failed',
        error: message.slice(0, 500),
        completedAt: new Date(),
      },
    });

    await db.leadActivity.create({
      data: {
        leadId: lead.id,
        userId,
        type: 'prospect_pipeline_failed',
        description: analysisDone
          ? 'Pipeline failed partway. Analysis results saved; 2 credits refunded.'
          : 'Pipeline failed early. All 7 credits refunded.',
        metadata: JSON.stringify({ pipelineId, refundIssued: refund.success }),
      },
    }).catch(() => {});

    await createNotificationOnce({
      userId,
      type: 'system_failure',
      title: 'Prospect pipeline failed',
      message: `Pipeline for ${lead.businessName} failed: ${message.slice(0, 140)}`,
      actionUrl: '/business-ai/leads',
      metadata: { pipelineId, leadId: lead.id },
      dedupeKey: `prospect_pipeline:${pipelineId}:failed`,
    }).catch(() => {});
  }
}

// ===== State read for the UI =====

function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function getLatestPipelineForLead(
  leadId: string,
  userId: string
): Promise<PipelineState | null> {
  const pipeline = await db.prospectPipeline.findFirst({
    where: { leadId, userId },
    orderBy: { createdAt: 'desc' },
  });
  if (!pipeline) return null;

  return {
    id: pipeline.id,
    leadId: pipeline.leadId,
    userId: pipeline.userId,
    status: pipeline.status as PipelineState['status'],
    currentStep: pipeline.currentStep,
    totalSteps: pipeline.totalSteps,
    stepStatus: safeParseStepStatus(pipeline.stepStatus),
    progress: pipeline.progress,
    research: safeParse<PipelineResearch | null>(pipeline.step1ResearchJson, null),
    gaps: safeParse<PipelineGaps | null>(pipeline.step2GapsJson, null),
    match: safeParse<PipelineMatch | null>(pipeline.step3MatchJson, null),
    pitch: safeParse<PipelinePitch | null>(pipeline.step4PitchJson, null),
    email: safeParse<PipelineEmail | null>(pipeline.step5EmailJson, null),
    overallScore: pipeline.overallScore,
    temperature: pipeline.temperature,
    outreachMessageId: pipeline.outreachMessageId,
    error: pipeline.error,
    createdAt: pipeline.createdAt.toISOString(),
    startedAt: pipeline.startedAt?.toISOString() ?? null,
    completedAt: pipeline.completedAt?.toISOString() ?? null,
  };
}
