// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autonomous Outreach Engine
// Phase 10: Core Orchestration Layer
//
// The central nervous system of the autonomous acquisition pipeline:
//   Lead Discovery → Research → Outreach → Gmail Sending → Monitoring
//
// CRITICAL RULES:
// - NEVER throw unhandled errors (all functions wrapped in try/catch)
// - ALWAYS check + deduct credits before AI/automation operations
// - ALWAYS update campaign status at each pipeline step
// - ALWAYS log activities to LeadActivity table
// - Non-blocking: startAutonomousCampaign returns campaignId immediately
//
// Credit Costs:
// - researchCompany: 3 credits
// - classifyReplyIntent: 1 credit
// - autoMovePipelineStage: 1 credit (theoretical 0.5, rounded up for integer system)
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { deductCredits, checkCreditSufficiency, refundCredits } from '@/lib/credit-service';
import { startDiscoveryJob, getDiscoveryJobStatus } from '@/lib/lead-discovery-service';
import { generateOutreach } from '@/lib/ai/outreach-generator';
import { logAuditEvent } from '@/lib/lead-audit';
import { createNotificationOnce } from '@/lib/notification-service';
import ZAI from 'z-ai-web-dev-sdk';

// ===== TYPE DEFINITIONS =====

export type ReplyIntent =
  | 'interested'
  | 'meeting_requested'
  | 'pricing_inquiry'
  | 'rejection'
  | 'spam_complaint'
  | 'unsubscribe'
  | 'follow_up_request'
  | 'later_response'
  | 'positive_buying_signal'
  | 'urgent_requirement'
  | 'out_of_office'
  | 'referral'
  | 'neutral';

export type PipelineTrigger =
  | 'email_sent'
  | 'email_opened'
  | 'email_replied'
  | 'reply_classified'
  | 'meeting_booked'
  | 'proposal_sent';

export interface AutonomousCampaignParams {
  niche: string;
  country: string;
  city?: string;
  source?: string;
  maxLeads?: number;
  autoOutreach?: boolean;
  autoResearch?: boolean;
  tone?: string;
  channel?: string;
  customInstructions?: string;
}

export interface ResearchResult {
  leadId: string;
  businessModelAnalysis: string;
  techStack: string[];
  seoQuality: string;
  websiteQuality: string;
  competitorComparison: string;
  painPoints: string[];
  opportunities: string[];
  recommendedAngle: string;
  estimatedDealSize: string;
  urgencyLevel: string;
  aiProvider: string;
}

export interface ReplyClassification {
  intent: ReplyIntent;
  confidence: number;
  suggestedAction: string;
  suggestedResponse: string;
  shouldAutoRespond: boolean;
}

export interface CampaignStatus {
  id: string;
  status: string;
  phase: string;
  leadsDiscovered: number;
  leadsResearched: number;
  outreachSent: number;
  repliesReceived: number;
  interestedCount: number;
  meetingsBooked: number;
  errorMessage?: string;
  startedAt: Date;
  completedAt?: Date;
}

// ===== CONSTANTS =====

const CREDIT_COST_RESEARCH = 3;
const CREDIT_COST_CLASSIFY_REPLY = 1;
const CREDIT_COST_PIPELINE_MOVE = 1; // Theoretical 0.5, rounded up for integer credits

const DISCOVERY_POLL_INTERVAL_MS = 2000;
const DISCOVERY_POLL_MAX_MS = 60000;

const PIPELINE_STAGES_ORDER: string[] = [
  'discovered',
  'contacted',
  'replied',
  'interested',
  'meeting_booked',
  'proposal_sent',
  'negotiation',
  'won',
];

const POSITIVE_INTENTS: ReplyIntent[] = ['interested', 'positive_buying_signal'];
const NEGATIVE_INTENTS: ReplyIntent[] = ['unsubscribe', 'spam_complaint'];

// ===== 1. START AUTONOMOUS CAMPAIGN =====

/**
 * Start a full autonomous campaign.
 * Creates an AcquisitionCampaign record, returns campaignId immediately,
 * and kicks off async processing in the background.
 */
export async function startAutonomousCampaign(
  userId: string,
  params: AutonomousCampaignParams
): Promise<{ campaignId: string; status: string; message: string }> {
  try {
    // Validate required params
    if (!params.niche || !params.country) {
      return {
        campaignId: '',
        status: 'failed',
        message: 'Missing required fields: niche, country',
      };
    }

    // Check for running campaigns (limit concurrent)
    const runningCampaigns = await db.acquisitionCampaign.count({
      where: {
        userId,
        status: { in: ['parsing', 'discovering', 'analyzing', 'generating', 'sending'] },
      },
    });

    if (runningCampaigns >= 3) {
      return {
        campaignId: '',
        status: 'failed',
        message: `Maximum concurrent campaigns (3) reached. Please wait for existing campaigns to complete.`,
      };
    }

    // Estimate credits needed
    const maxLeads = params.maxLeads || 20;
    const estimatedCredits = maxLeads * (CREDIT_COST_RESEARCH + 2); // research + outreach per lead

    const creditCheck = await checkCreditSufficiency(userId, estimatedCredits);
    if (!creditCheck.sufficient) {
      return {
        campaignId: '',
        status: 'failed',
        message: `Insufficient credits. Estimated ${estimatedCredits} needed, have ${creditCheck.balance}. Shortfall: ${creditCheck.shortfall}`,
      };
    }

    // Build instruction from params
    const instruction = buildCampaignInstruction(params);

    // Create campaign record
    const campaign = await db.acquisitionCampaign.create({
      data: {
        userId,
        status: 'parsing',
        niche: params.niche,
        country: params.country,
        city: params.city || null,
        source: params.source || 'ai_search',
        channel: params.channel || 'email',
        tone: params.tone || 'professional',
        maxLeads,
        autoSend: params.autoOutreach ?? false,
        customInstructions: [instruction, params.customInstructions].filter(Boolean).join('\n') || null,
        totalLeads: maxLeads,
      },
    });

    // Audit log
    await logAuditEvent(userId, 'autonomous_campaign_started', {
      campaignId: campaign.id,
      niche: params.niche,
      country: params.country,
      city: params.city,
      maxLeads,
      autoOutreach: params.autoOutreach,
      autoResearch: params.autoResearch,
      estimatedCredits,
    });

    // Kick off async processing (non-blocking)
    processAutonomousCampaign(campaign.id, userId, params).catch((err) => {
      console.error(`[AutonomousOutreach] Campaign ${campaign.id} failed:`, err);
    });

    return {
      campaignId: campaign.id,
      status: 'parsing',
      message: `Autonomous campaign started. Campaign ID: ${campaign.id}. Estimated ${maxLeads} leads, ~${estimatedCredits} credits.`,
    };
  } catch (error) {
    console.error('[AutonomousOutreach] Failed to start campaign:', error);
    return {
      campaignId: '',
      status: 'failed',
      message: error instanceof Error ? error.message : 'Failed to start autonomous campaign',
    };
  }
}

// ===== 2. PROCESS AUTONOMOUS CAMPAIGN (Main Pipeline) =====

/**
 * The main autonomous pipeline orchestrator.
 * Runs through: Discovery → Research → Outreach → Send → Monitor
 * Each step updates the campaign status and handles errors gracefully.
 */
export async function processAutonomousCampaign(
  campaignId: string,
  userId: string,
  params: AutonomousCampaignParams
): Promise<void> {
  const log = (step: string, message: string) =>
    console.log(`[AutonomousOutreach] Campaign ${campaignId} [${step}]: ${message}`);

  try {
    // ── Step 1: Discover leads ──────────────────────────────────────
    log('discovery', 'Starting lead discovery...');

    await updateCampaignStatus(campaignId, 'discovering');

    const discoveryResult = await startDiscoveryJob(userId, {
      niche: params.niche,
      country: params.country,
      city: params.city,
      source: (params.source || 'ai_search') as 'ai_search',
      maxResults: params.maxLeads || 20,
    });

    if (!discoveryResult.jobId || discoveryResult.status === 'failed') {
      await markCampaignFailed(campaignId, discoveryResult.message);
      return;
    }

    // Link discovery job to campaign
    await db.acquisitionCampaign.update({
      where: { id: campaignId },
      data: { discoveryJobId: discoveryResult.jobId },
    });

    // ── Step 2: Wait for discovery completion ───────────────────────
    log('discovery', `Waiting for discovery job ${discoveryResult.jobId}...`);

    const discoveryJob = await waitForDiscoveryCompletion(
      discoveryResult.jobId,
      userId,
      DISCOVERY_POLL_INTERVAL_MS,
      DISCOVERY_POLL_MAX_MS
    );

    if (!discoveryJob || discoveryJob.status !== 'completed') {
      const errorMsg = discoveryJob?.errorMessage || 'Discovery job did not complete in time';
      await markCampaignFailed(campaignId, errorMsg);
      return;
    }

    const discoveredCount = discoveryJob.imported;
    log('discovery', `Discovered ${discoveredCount} leads`);

    await db.acquisitionCampaign.update({
      where: { id: campaignId },
      data: {
        discovered: discoveredCount,
        totalLeads: discoveredCount,
      },
    });

    if (discoveredCount === 0) {
      await markCampaignFailed(campaignId, 'No leads discovered. Try different search parameters.');
      return;
    }

    // ── Step 3: Research each discovered lead ───────────────────────
    if (params.autoResearch !== false) {
      log('research', `Starting deep research on ${discoveredCount} leads...`);

      await updateCampaignStatus(campaignId, 'analyzing');

      const leads = await db.lead.findMany({
        where: {
          userId,
          niche: params.niche,
          country: params.country,
          city: params.city || undefined,
          stage: 'discovered',
          isActive: true,
        },
        take: params.maxLeads || 20,
        orderBy: { createdAt: 'desc' },
      });

      let researchedCount = 0;
      for (const lead of leads) {
        try {
          await researchCompany(lead.id, userId);
          researchedCount++;

          // Update campaign progress
          await db.acquisitionCampaign.update({
            where: { id: campaignId },
            data: { analyzed: researchedCount },
          });
        } catch (researchErr) {
          console.error(`[AutonomousOutreach] Research failed for lead ${lead.id}:`, researchErr);
          // Continue with next lead
        }
      }

      log('research', `Completed research on ${researchedCount}/${leads.length} leads`);
    }

    // ── Step 4: Generate personalized outreach ──────────────────────
    log('outreach', 'Generating personalized outreach messages...');

    await updateCampaignStatus(campaignId, 'generating');

    const researchedLeads = await db.lead.findMany({
      where: {
        userId,
        niche: params.niche,
        country: params.country,
        city: params.city || undefined,
        stage: { in: ['discovered', 'analyzed'] },
        isActive: true,
        email: { not: null },
      },
      include: {
        leadAnalysis: { take: 1, orderBy: { createdAt: 'desc' } },
      },
      take: params.maxLeads || 20,
      orderBy: { createdAt: 'desc' },
    });

    const channel = (params.channel || 'email') as 'email' | 'whatsapp' | 'telegram' | 'linkedin' | 'instagram';
    const tone = (params.tone || 'professional') as 'professional' | 'casual' | 'urgent' | 'friendly' | 'formal';

    let outreachGeneratedCount = 0;
    for (const lead of researchedLeads) {
      try {
        const result = await generateOutreach({
          leadId: lead.id,
          userId,
          channel,
          tone,
          customInstructions: params.customInstructions,
        });

        if (result.success) {
          outreachGeneratedCount++;
        }
      } catch (outreachErr) {
        console.error(`[AutonomousOutreach] Outreach generation failed for lead ${lead.id}:`, outreachErr);
        // Continue with next lead
      }
    }

    await db.acquisitionCampaign.update({
      where: { id: campaignId },
      data: { outreachGenerated: outreachGeneratedCount },
    });

    log('outreach', `Generated outreach for ${outreachGeneratedCount} leads`);

    // ── Step 5: Send emails via Gmail if autoOutreach=true ──────────
    if (params.autoOutreach) {
      log('sending', 'Auto-outreach enabled — sending emails via Gmail...');

      await updateCampaignStatus(campaignId, 'sending');

      // Check if user has connected Gmail
      const emailAccount = await db.emailAccount.findFirst({
        where: { userId, status: 'active' },
      });

      if (!emailAccount) {
        log('sending', 'No active Gmail account found. Skipping auto-send.');
      } else {
        // Get draft outreach messages for this campaign's leads
        const leadIds = researchedLeads.map((l) => l.id);

        const draftMessages = await db.outreachMessage.findMany({
          where: {
            leadId: { in: leadIds },
            channel: 'email',
            status: 'draft',
            generatedByAI: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        let sentCount = 0;
        for (const msg of draftMessages) {
          try {
            const lead = researchedLeads.find((l) => l.id === msg.leadId);
            if (!lead?.email) continue;

            // Import sendEmail dynamically to avoid circular deps at module level
            const { sendEmail } = await import('@/lib/gmail-delivery-service');

            const sendResult = await sendEmail(emailAccount.id, {
              to: lead.email,
              subject: msg.subject || `Re: ${lead.businessName}`,
              body: msg.content,
            });

            if (sendResult.success) {
              sentCount++;

              // Move lead to contacted stage
              await autoMovePipelineStage(lead.id, userId, 'email_sent');
            }
          } catch (sendErr) {
            console.error(`[AutonomousOutreach] Send failed for message ${msg.id}:`, sendErr);
            // Continue with next message
          }
        }

        await db.acquisitionCampaign.update({
          where: { id: campaignId },
          data: { sent: sentCount },
        });

        log('sending', `Sent ${sentCount} emails`);
      }
    }

    // ── Step 6: Monitor for replies ─────────────────────────────────
    log('monitoring', 'Setting up reply monitoring...');

    // Create a follow-up reminder for reply checking
    const leadIds = researchedLeads.map((l) => l.id);
    for (const leadId of leadIds) {
      try {
        await db.followUpReminder.create({
          data: {
            leadId,
            message: 'Check for email reply from autonomous campaign',
            dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
            completed: false,
          },
        });
      } catch {
        // Best effort
      }
    }

    // Mark campaign as completed
    await db.acquisitionCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });

    log('completed', 'Autonomous campaign completed successfully');

    await logAuditEvent(userId, 'autonomous_campaign_completed', {
      campaignId,
      discoveredCount,
      outreachGenerated: outreachGeneratedCount,
    });

    // User-facing notification (deduped per campaign run).
    await createNotificationOnce({
      userId,
      type: 'campaign_completed',
      title: 'Outreach campaign completed',
      message: `Your autonomous campaign finished: ${discoveredCount} lead${discoveredCount === 1 ? '' : 's'} discovered and ${outreachGeneratedCount} outreach message${outreachGeneratedCount === 1 ? '' : 's'} generated.`,
      actionUrl: '/business-ai/outreach',
      metadata: { campaignId, discoveredCount, outreachGenerated: outreachGeneratedCount },
      dedupeKey: `campaign:${campaignId}:completed`,
    }).catch(() => {
      // Never fail the campaign path because of a notification problem
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error in campaign pipeline';
    console.error(`[AutonomousOutreach] Campaign ${campaignId} pipeline error:`, error);

    await markCampaignFailed(campaignId, errorMessage);

    await logAuditEvent(userId, 'autonomous_campaign_failed', {
      campaignId,
      error: errorMessage,
    });

    // User-facing notification — safe message only (raw error stays in the
    // campaign record / audit log).
    await createNotificationOnce({
      userId,
      type: 'campaign_failed',
      title: 'Outreach campaign failed',
      message: 'Your autonomous outreach campaign could not be completed. You can restart it from the Outreach page.',
      actionUrl: '/business-ai/outreach',
      metadata: { campaignId },
      dedupeKey: `campaign:${campaignId}:failed`,
    }).catch(() => {
      // Never fail the campaign path because of a notification problem
    });
  }
}

// ===== 3. RESEARCH COMPANY (Deep Research) =====

/**
 * Deep company research using z-ai-web-dev-sdk.
 * Uses web_search + page_reader + LLM to produce comprehensive analysis.
 * Stores results in LeadAnalysis table and updates Lead record.
 */
export async function researchCompany(
  leadId: string,
  userId: string
): Promise<ResearchResult | null> {
  try {
    // Fetch lead data
    const lead = await db.lead.findUnique({
      where: { id: leadId, isActive: true },
    });

    if (!lead) {
      console.error(`[AutonomousOutreach] Lead ${leadId} not found for research`);
      return null;
    }

    // Check + deduct credits
    const creditCheck = await checkCreditSufficiency(userId, CREDIT_COST_RESEARCH);
    if (!creditCheck.sufficient) {
      console.error(`[AutonomousOutreach] Insufficient credits for research. Need ${CREDIT_COST_RESEARCH}, have ${creditCheck.balance}`);
      return null;
    }

    const deduction = await deductCredits({
      userId,
      action: 'deep_analysis',
      cost: CREDIT_COST_RESEARCH,
      referenceId: leadId,
    });

    if (!deduction.success) {
      console.error(`[AutonomousOutreach] Credit deduction failed for research: ${deduction.error}`);
      return null;
    }

    // Initialize ZAI SDK
    let zai: ZAI;
    try {
      zai = await ZAI.create();
    } catch {
      await refundCredits({ userId, amount: CREDIT_COST_RESEARCH, originalAction: 'deep_analysis', referenceId: leadId });
      console.error('[AutonomousOutreach] Failed to initialize AI SDK for research');
      return null;
    }

    // ── Phase A: Web Search for company info ─────────────────────────
    let searchResults: Array<{ url: string; name: string; snippet: string }> = [];
    const companyName = lead.businessName;
    const location = [lead.city, lead.country].filter(Boolean).join(', ');

    try {
      const searchQuery = location
        ? `${companyName} ${lead.niche || ''} ${location} business information`
        : `${companyName} ${lead.niche || ''} business information`;

      const searchResponse = await zai.functions.invoke('web_search', {
        query: searchQuery,
        num: 10,
      });

      if (Array.isArray(searchResponse)) {
        searchResults = searchResponse.slice(0, 10);
      }
    } catch (searchErr) {
      console.error(`[AutonomousOutreach] Web search failed for ${companyName}:`, searchErr);
      // Continue with whatever we have
    }

    // ── Phase B: Read company website content ────────────────────────
    let websiteContent = '';
    if (lead.website) {
      try {
        const pageReaderResponse = await zai.functions.invoke('page_reader', {
          url: lead.website,
        });

        if (typeof pageReaderResponse === 'string') {
          websiteContent = pageReaderResponse.slice(0, 5000);
        } else if (pageReaderResponse && typeof pageReaderResponse === 'object' && 'content' in pageReaderResponse) {
          websiteContent = String((pageReaderResponse as { content: string }).content).slice(0, 5000);
        }
      } catch (pageErr) {
        console.error(`[AutonomousOutreach] Page reader failed for ${lead.website}:`, pageErr);
        // Continue without website content
      }
    }

    // ── Phase C: LLM Analysis ───────────────────────────────────────
    const searchContext = searchResults
      .slice(0, 5)
      .map((r, i) => `[${i + 1}] ${r.name}: ${r.snippet}`)
      .join('\n');

    const analysisPrompt = `You are a senior business analyst. Analyze the following company and provide a comprehensive assessment.

COMPANY: ${companyName}
NICHE: ${lead.niche || 'Unknown'}
LOCATION: ${location || 'Unknown'}
WEBSITE: ${lead.website || 'Not available'}

SEARCH RESULTS:
${searchContext || 'No search results available'}

WEBSITE CONTENT:
${websiteContent || 'Website content not available'}

Provide your analysis as a JSON object with exactly these fields:
{
  "businessModelAnalysis": "How this company makes money, their target market, and business model",
  "techStack": ["List", "of", "technologies", "they", "likely", "use"],
  "seoQuality": "Poor / Basic / Good / Excellent — with brief explanation",
  "websiteQuality": "Poor / Basic / Good / Excellent — with brief explanation",
  "competitorComparison": "How they compare to competitors in their space",
  "painPoints": ["List", "of", "likely", "pain", "points"],
  "opportunities": ["List", "of", "opportunities", "for", "service", "providers"],
  "recommendedAngle": "Best outreach angle for selling web/digital services",
  "estimatedDealSize": "Estimated deal size range (e.g., $500-$2000)",
  "urgencyLevel": "low / medium / high — how urgently they need digital services"
}

Return ONLY valid JSON. No markdown, no explanations.`;

    let result: ResearchResult;
    try {
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a precise business analyst. Return only valid JSON objects. No markdown formatting.',
          },
          { role: 'user', content: analysisPrompt },
        ],
        model: 'auto',
      });

      const content = completion.choices?.[0]?.message?.content || '';

      // Parse LLM response — handle potential markdown wrapping
      let cleaned = content.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(cleaned);

      result = {
        leadId,
        businessModelAnalysis: String(parsed.businessModelAnalysis || 'Analysis unavailable'),
        techStack: Array.isArray(parsed.techStack) ? parsed.techStack.map(String) : [],
        seoQuality: String(parsed.seoQuality || 'Unknown'),
        websiteQuality: String(parsed.websiteQuality || 'Unknown'),
        competitorComparison: String(parsed.competitorComparison || 'Comparison unavailable'),
        painPoints: Array.isArray(parsed.painPoints) ? parsed.painPoints.map(String) : [],
        opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities.map(String) : [],
        recommendedAngle: String(parsed.recommendedAngle || 'Standard outreach'),
        estimatedDealSize: String(parsed.estimatedDealSize || 'Unknown'),
        urgencyLevel: String(parsed.urgencyLevel || 'medium'),
        aiProvider: 'z-ai',
      };
    } catch (parseErr) {
      console.error(`[AutonomousOutreach] LLM analysis parsing failed for ${companyName}:`, parseErr);
      await refundCredits({ userId, amount: CREDIT_COST_RESEARCH, originalAction: 'deep_analysis', referenceId: leadId });

      result = {
        leadId,
        businessModelAnalysis: 'Analysis failed — could not parse AI response',
        techStack: [],
        seoQuality: 'Unknown',
        websiteQuality: 'Unknown',
        competitorComparison: 'Unknown',
        painPoints: [],
        opportunities: [],
        recommendedAngle: 'Standard outreach',
        estimatedDealSize: 'Unknown',
        urgencyLevel: 'medium',
        aiProvider: 'z-ai',
      };
    }

    // ── Phase D: Store results in LeadAnalysis ───────────────────────
    try {
      const existingAnalysis = await db.leadAnalysis.findUnique({
        where: { leadId },
      });

      const analysisData = {
        websiteQualityScore: mapQualityToScore(result.websiteQuality),
        digitalMaturityScore: mapQualityToScore(result.seoQuality),
        weaknesses: JSON.stringify(result.painPoints),
        replyScore: result.urgencyLevel === 'high' ? 80 : result.urgencyLevel === 'medium' ? 50 : 30,
        dealConversionScore: result.urgencyLevel === 'high' ? 75 : result.urgencyLevel === 'medium' ? 50 : 25,
        urgencyScore: result.urgencyLevel === 'high' ? 90 : result.urgencyLevel === 'medium' ? 55 : 20,
        revenuePotentialScore: mapDealSizeToScore(result.estimatedDealSize),
        scoreExplanations: JSON.stringify({
          businessModel: result.businessModelAnalysis,
          competitorComparison: result.competitorComparison,
          recommendedAngle: result.recommendedAngle,
        }),
        recommendedServices: JSON.stringify(result.opportunities),
        estimatedDealValueUsd: result.estimatedDealSize,
        closingStrategy: result.recommendedAngle,
        outreachMessages: JSON.stringify({ angle: result.recommendedAngle }),
        analysisVersion: (existingAnalysis?.analysisVersion || 0) + 1,
      };

      if (existingAnalysis) {
        await db.leadAnalysis.update({
          where: { leadId },
          data: analysisData,
        });
      } else {
        await db.leadAnalysis.create({
          data: {
            leadId,
            ...analysisData,
          },
        });
      }
    } catch (dbErr) {
      console.error(`[AutonomousOutreach] Failed to store analysis for lead ${leadId}:`, dbErr);
      // Don't fail the whole research — we still have the result in memory
    }

    // ── Phase E: Update Lead record ──────────────────────────────────
    try {
      await db.lead.update({
        where: { id: leadId },
        data: {
          techStack: JSON.stringify(result.techStack),
          websiteQuality: result.websiteQuality.toLowerCase(),
          digitalWeaknesses: JSON.stringify(result.painPoints),
          opportunityNotes: JSON.stringify(result.opportunities),
          outreachStyle: result.recommendedAngle,
          estimatedQuality: result.urgencyLevel === 'high' ? 'high' : result.urgencyLevel === 'medium' ? 'medium' : 'low',
          estimatedRevenue: mapDealSizeToRevenue(result.estimatedDealSize),
          stage: 'analyzed',
        },
      });

      // Log activity
      await db.leadActivity.create({
        data: {
          leadId,
          type: 'deep_research',
          description: `Deep research completed for ${companyName}. Urgency: ${result.urgencyLevel}. Deal size: ${result.estimatedDealSize}`,
          metadata: JSON.stringify({
            painPointCount: result.painPoints.length,
            opportunityCount: result.opportunities.length,
            recommendedAngle: result.recommendedAngle,
          }),
        },
      });
    } catch (dbErr) {
      console.error(`[AutonomousOutreach] Failed to update lead ${leadId}:`, dbErr);
    }

    // Audit log
    await logAuditEvent(userId, 'company_researched', {
      leadId,
      businessName: companyName,
      urgencyLevel: result.urgencyLevel,
      estimatedDealSize: result.estimatedDealSize,
      creditsCost: CREDIT_COST_RESEARCH,
    });

    return result;
  } catch (error) {
    console.error(`[AutonomousOutreach] Research failed for lead ${leadId}:`, error);
    return null;
  }
}

// ===== 4. CLASSIFY REPLY INTENT =====

/**
 * Classify email replies into intent categories using AI.
 * Returns classification with suggested action and response.
 * Auto-moves leads based on intent classification.
 */
export async function classifyReplyIntent(
  messageContent: string,
  leadContext: {
    businessName?: string;
    ownerName?: string;
    previousMessages?: string;
    niche?: string;
  }
): Promise<ReplyClassification> {
  const defaultClassification: ReplyClassification = {
    intent: 'neutral',
    confidence: 0,
    suggestedAction: 'Review manually',
    suggestedResponse: '',
    shouldAutoRespond: false,
  };

  try {
    // Check for obvious patterns before using AI (fast path)
    const quickClassify = quickClassifyIntent(messageContent);
    if (quickClassify.intent !== 'neutral' && quickClassify.confidence >= 0.95) {
      return quickClassify;
    }

    // Initialize ZAI SDK
    let zai: ZAI;
    try {
      zai = await ZAI.create();
    } catch {
      console.error('[AutonomousOutreach] Failed to initialize AI SDK for reply classification');
      return defaultClassification;
    }

    // Deduct credit for classification
    const userId = 'system'; // Will be overridden by caller with proper userId
    // Note: Credit deduction should happen at the caller level with the actual userId
    // This function focuses on the AI classification logic

    const contextStr = [
      leadContext.businessName ? `Business: ${leadContext.businessName}` : '',
      leadContext.ownerName ? `Contact: ${leadContext.ownerName}` : '',
      leadContext.niche ? `Niche: ${leadContext.niche}` : '',
      leadContext.previousMessages ? `Previous messages:\n${leadContext.previousMessages.slice(0, 2000)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const classificationPrompt = `You are an expert sales intelligence analyst. Classify the intent of this email reply.

LEAD CONTEXT:
${contextStr || 'No context available'}

REPLY CONTENT:
${messageContent}

Classify the intent as EXACTLY ONE of these categories:
- interested: They expressed interest in learning more
- meeting_requested: They want to schedule a meeting/call
- pricing_inquiry: They asked about pricing or costs
- rejection: They explicitly declined
- spam_complaint: They flagged the email as spam
- unsubscribe: They want to stop receiving emails
- follow_up_request: They asked to follow up later
- later_response: They said "not now" but left the door open
- positive_buying_signal: Strong purchase intent or asking about next steps
- urgent_requirement: They need help urgently
- out_of_office: Auto-responder / away message
- referral: They referred someone else
- neutral: General response that doesn't fit other categories

Return ONLY a JSON object:
{
  "intent": "one of the categories above",
  "confidence": 0.0 to 1.0,
  "suggestedAction": "What the sales team should do next",
  "suggestedResponse": "Draft a brief professional reply",
  "shouldAutoRespond": true/false
}

Rules for shouldAutoRespond:
- true for: interested, meeting_requested, positive_buying_signal, urgent_requirement, follow_up_request, pricing_inquiry
- false for: rejection, spam_complaint, unsubscribe, out_of_office, neutral
- true for: later_response (with a gentle acknowledgment), referral

Return ONLY valid JSON. No markdown.`;

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are a precise sales intent classifier. Return only valid JSON. No markdown formatting.',
        },
        { role: 'user', content: classificationPrompt },
      ],
      model: 'auto',
    });

    const content = completion.choices?.[0]?.message?.content || '';

    // Parse response
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleaned);

    const validIntents: ReplyIntent[] = [
      'interested', 'meeting_requested', 'pricing_inquiry',
      'rejection', 'spam_complaint', 'unsubscribe',
      'follow_up_request', 'later_response', 'positive_buying_signal',
      'urgent_requirement', 'out_of_office', 'referral', 'neutral',
    ];

    const intent = validIntents.includes(parsed.intent) ? parsed.intent as ReplyIntent : 'neutral';
    const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0));

    const classification: ReplyClassification = {
      intent,
      confidence,
      suggestedAction: String(parsed.suggestedAction || 'Review manually'),
      suggestedResponse: String(parsed.suggestedResponse || ''),
      shouldAutoRespond: typeof parsed.shouldAutoRespond === 'boolean' ? parsed.shouldAutoRespond : false,
    };

    return classification;
  } catch (error) {
    console.error('[AutonomousOutreach] Reply classification failed:', error);
    return defaultClassification;
  }
}

/**
 * Classify reply intent with credit management and auto pipeline movement.
 * This is the full-featured version that should be called from API routes.
 */
export async function classifyReplyAndAct(
  messageContent: string,
  leadId: string,
  userId: string,
  leadContext: {
    businessName?: string;
    ownerName?: string;
    previousMessages?: string;
    niche?: string;
  }
): Promise<ReplyClassification> {
  try {
    // Deduct credit
    const creditCheck = await checkCreditSufficiency(userId, CREDIT_COST_CLASSIFY_REPLY);
    if (!creditCheck.sufficient) {
      return {
        intent: 'neutral',
        confidence: 0,
        suggestedAction: 'Insufficient credits for classification',
        suggestedResponse: '',
        shouldAutoRespond: false,
      };
    }

    const deduction = await deductCredits({
      userId,
      action: 'reply_classification',
      cost: CREDIT_COST_CLASSIFY_REPLY,
      referenceId: leadId,
    });

    if (!deduction.success) {
      return {
        intent: 'neutral',
        confidence: 0,
        suggestedAction: 'Credit deduction failed',
        suggestedResponse: '',
        shouldAutoRespond: false,
      };
    }

    // Classify
    const classification = await classifyReplyIntent(messageContent, leadContext);

    // Auto-move based on intent
    if (POSITIVE_INTENTS.includes(classification.intent)) {
      await autoMovePipelineStage(leadId, userId, 'reply_classified');
    } else if (NEGATIVE_INTENTS.includes(classification.intent)) {
      // Mark lead as do not contact
      try {
        await db.lead.update({
          where: { id: leadId },
          data: {
            isActive: false,
            deletedAt: new Date(),
          },
        });

        await db.leadActivity.create({
          data: {
            leadId,
            type: 'do_not_contact',
            description: `Lead marked as do-not-contact due to ${classification.intent}`,
            metadata: JSON.stringify({ intent: classification.intent, confidence: classification.confidence }),
          },
        });
      } catch (dbErr) {
        console.error(`[AutonomousOutreach] Failed to mark lead ${leadId} as do-not-contact:`, dbErr);
      }
    }

    // Log activity
    try {
      await db.leadActivity.create({
        data: {
          leadId,
          type: 'reply_classified',
          description: `Reply classified as "${classification.intent}" (confidence: ${(classification.confidence * 100).toFixed(0)}%)`,
          metadata: JSON.stringify(classification),
        },
      });
    } catch {
      // Best effort
    }

    // Update lead email status
    if (classification.intent !== 'out_of_office') {
      try {
        await db.lead.update({
          where: { id: leadId },
          data: { emailStatus: 'replied' },
        });
      } catch {
        // Best effort
      }
    }

    // Audit log
    await logAuditEvent(userId, 'reply_classified', {
      leadId,
      intent: classification.intent,
      confidence: classification.confidence,
      shouldAutoRespond: classification.shouldAutoRespond,
    });

    return classification;
  } catch (error) {
    console.error('[AutonomousOutreach] classifyReplyAndAct failed:', error);
    return {
      intent: 'neutral',
      confidence: 0,
      suggestedAction: 'Classification failed — review manually',
      suggestedResponse: '',
      shouldAutoRespond: false,
    };
  }
}

// ===== 5. AUTO MOVE PIPELINE STAGE =====

/**
 * Automatically move a lead through the pipeline based on a trigger event.
 * Uses rules + AI to determine if lead should advance.
 * Logs to LeadActivity table.
 */
export async function autoMovePipelineStage(
  leadId: string,
  userId: string,
  trigger: PipelineTrigger
): Promise<{ moved: boolean; fromStage?: string; toStage?: string; reason?: string }> {
  try {
    // Fetch lead
    const lead = await db.lead.findUnique({
      where: { id: leadId, isActive: true },
    });

    if (!lead) {
      return { moved: false, reason: 'Lead not found or inactive' };
    }

    // Rule-based stage progression
    const nextStage = determineNextStage(lead.stage, trigger);

    if (!nextStage || nextStage === lead.stage) {
      return { moved: false, fromStage: lead.stage, toStage: lead.stage, reason: 'No stage change needed' };
    }

    // For significant jumps, use AI to validate the progression
    if (shouldValidateWithAI(lead.stage, nextStage)) {
      const aiApproval = await validateStageProgressionWithAI(lead, trigger, nextStage);
      if (!aiApproval.approved) {
        return { moved: false, fromStage: lead.stage, toStage: nextStage, reason: aiApproval.reason || 'AI validation did not approve progression' };
      }
    }

    // Deduct credit for pipeline move
    const creditCheck = await checkCreditSufficiency(userId, CREDIT_COST_PIPELINE_MOVE);
    if (!creditCheck.sufficient) {
      // Still move the lead even if credits are insufficient — this is a core feature
      console.warn(`[AutonomousOutreach] Insufficient credits for pipeline move, proceeding without charge`);
    } else {
      await deductCredits({
        userId,
        action: 'pipeline_stage_move',
        cost: CREDIT_COST_PIPELINE_MOVE,
        referenceId: leadId,
      });
    }

    // Move lead
    const fromStage = lead.stage;
    await db.lead.update({
      where: { id: leadId },
      data: { stage: nextStage },
    });

    // Log activity
    await db.leadActivity.create({
      data: {
        leadId,
        type: 'auto_stage_change',
        description: `Auto-moved from "${fromStage}" to "${nextStage}" triggered by ${trigger}`,
        metadata: JSON.stringify({
          fromStage,
          toStage: nextStage,
          trigger,
          autoMoved: true,
        }),
      },
    });

    // Audit log
    await logAuditEvent(userId, 'auto_pipeline_move', {
      leadId,
      fromStage,
      toStage: nextStage,
      trigger,
      businessName: lead.businessName,
    });

    return { moved: true, fromStage, toStage: nextStage };
  } catch (error) {
    console.error(`[AutonomousOutreach] Auto pipeline move failed for lead ${leadId}:`, error);
    return { moved: false, reason: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ===== 6. GET CAMPAIGN STATUS =====

/**
 * Get campaign status with progress details.
 */
export async function getCampaignStatus(
  campaignId: string,
  userId: string
): Promise<CampaignStatus | null> {
  try {
    const campaign = await db.acquisitionCampaign.findFirst({
      where: { id: campaignId, userId },
    });

    if (!campaign) return null;

    // Get additional stats from leads
    const leadStats = await db.lead.aggregate({
      where: {
        userId,
        niche: campaign.niche || undefined,
        country: campaign.country || undefined,
        city: campaign.city || undefined,
        isActive: true,
      },
      _count: {
        id: true,
      },
    });

    const repliedCount = await db.lead.count({
      where: {
        userId,
        niche: campaign.niche || undefined,
        country: campaign.country || undefined,
        emailStatus: 'replied',
        isActive: true,
      },
    });

    const interestedCount = await db.lead.count({
      where: {
        userId,
        niche: campaign.niche || undefined,
        country: campaign.country || undefined,
        stage: { in: ['interested', 'meeting_booked', 'proposal_sent', 'negotiation', 'won'] },
        isActive: true,
      },
    });

    const meetingBookedCount = await db.lead.count({
      where: {
        userId,
        niche: campaign.niche || undefined,
        country: campaign.country || undefined,
        stage: { in: ['meeting_booked', 'proposal_sent', 'negotiation', 'won'] },
        isActive: true,
      },
    });

    const phase = mapStatusToPhase(campaign.status);

    return {
      id: campaign.id,
      status: campaign.status,
      phase,
      leadsDiscovered: campaign.discovered,
      leadsResearched: campaign.analyzed,
      outreachSent: campaign.sent,
      repliesReceived: repliedCount,
      interestedCount,
      meetingsBooked: meetingBookedCount,
      errorMessage: campaign.errorMessage || undefined,
      startedAt: campaign.createdAt,
      completedAt: campaign.completedAt || undefined,
    };
  } catch (error) {
    console.error(`[AutonomousOutreach] Failed to get campaign status for ${campaignId}:`, error);
    return null;
  }
}

// ===== HELPER FUNCTIONS =====

/**
 * Update campaign status safely.
 */
async function updateCampaignStatus(campaignId: string, status: string): Promise<void> {
  try {
    await db.acquisitionCampaign.update({
      where: { id: campaignId },
      data: { status },
    });
  } catch (error) {
    console.error(`[AutonomousOutreach] Failed to update campaign ${campaignId} status to ${status}:`, error);
  }
}

/**
 * Mark campaign as failed with error message.
 */
async function markCampaignFailed(campaignId: string, errorMessage: string): Promise<void> {
  try {
    await db.acquisitionCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'failed',
        errorMessage: errorMessage.slice(0, 1000),
        completedAt: new Date(),
      },
    });
  } catch (error) {
    console.error(`[AutonomousOutreach] Failed to mark campaign ${campaignId} as failed:`, error);
  }
}

/**
 * Wait for discovery job to complete by polling.
 */
async function waitForDiscoveryCompletion(
  jobId: string,
  userId: string,
  pollIntervalMs: number,
  maxWaitMs: number
): Promise<Awaited<ReturnType<typeof getDiscoveryJobStatus>> | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const status = await getDiscoveryJobStatus(jobId, userId);
      if (!status) return null;

      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    } catch (error) {
      console.error(`[AutonomousOutreach] Error polling discovery job ${jobId}:`, error);
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  // Timeout — return whatever status we can get
  try {
    return await getDiscoveryJobStatus(jobId, userId);
  } catch {
    return null;
  }
}

/**
 * Build a campaign instruction string from params.
 */
function buildCampaignInstruction(params: AutonomousCampaignParams): string {
  const parts = [
    `Discover ${params.maxLeads || 20} ${params.niche} leads in ${params.country}`,
    params.city ? ` (city: ${params.city})` : '',
    params.autoResearch !== false ? ', research each lead' : '',
    params.autoOutreach ? ', send personalized outreach automatically' : ', generate outreach for review',
    params.tone ? ` (tone: ${params.tone})` : '',
    params.channel ? ` via ${params.channel}` : ' via email',
  ];
  return parts.join('');
}

/**
 * Quick intent classification using pattern matching (no AI needed).
 * Returns neutral if no clear pattern is found.
 */
function quickClassifyIntent(messageContent: string): ReplyClassification {
  const lower = messageContent.toLowerCase().trim();

  // Unsubscribe patterns
  if (
    lower.includes('unsubscribe') ||
    lower.includes('opt out') ||
    lower.includes('stop sending') ||
    lower.includes('remove me') ||
    lower.includes('don\'t email') ||
    lower.includes('do not email') ||
    lower.includes('no longer interested')
  ) {
    return {
      intent: 'unsubscribe',
      confidence: 0.97,
      suggestedAction: 'Remove from mailing list immediately',
      suggestedResponse: '',
      shouldAutoRespond: false,
    };
  }

  // Spam complaint
  if (lower.includes('spam') || lower.includes('reported') || lower.includes('harassment')) {
    return {
      intent: 'spam_complaint',
      confidence: 0.95,
      suggestedAction: 'Remove from all communications immediately',
      suggestedResponse: '',
      shouldAutoRespond: false,
    };
  }

  // Out of office
  if (
    lower.includes('out of office') ||
    lower.includes('auto-reply') ||
    lower.includes('autoreply') ||
    lower.includes('i am currently away') ||
    lower.includes('i will be out of') ||
    lower.includes('automated response')
  ) {
    return {
      intent: 'out_of_office',
      confidence: 0.96,
      suggestedAction: 'Schedule follow-up for after return date',
      suggestedResponse: '',
      shouldAutoRespond: false,
    };
  }

  return {
    intent: 'neutral',
    confidence: 0,
    suggestedAction: '',
    suggestedResponse: '',
    shouldAutoRespond: false,
  };
}

/**
 * Determine the next pipeline stage based on current stage and trigger.
 */
function determineNextStage(currentStage: string, trigger: PipelineTrigger): string | null {
  const stageIndex = PIPELINE_STAGES_ORDER.indexOf(currentStage);

  // Trigger-to-stage mapping
  const triggerStageMap: Record<PipelineTrigger, string> = {
    email_sent: 'contacted',
    email_opened: 'contacted',
    email_replied: 'replied',
    reply_classified: 'interested',
    meeting_booked: 'meeting_booked',
    proposal_sent: 'proposal_sent',
  };

  const targetStage = triggerStageMap[trigger];
  if (!targetStage) return null;

  // Allow forward progression only (or same level for specific triggers)
  const targetIndex = PIPELINE_STAGES_ORDER.indexOf(targetStage);

  // If current stage is not in our ordered list, allow the move
  if (stageIndex === -1) return targetStage;

  // If target stage is ahead of current, allow the move
  if (targetIndex > stageIndex) return targetStage;

  // If already at or past the target stage, don't downgrade
  if (targetIndex <= stageIndex) {
    // For email_replied, if they're already at 'interested' or beyond, don't move back
    if (trigger === 'email_replied' && stageIndex >= PIPELINE_STAGES_ORDER.indexOf('replied')) {
      return null;
    }
    // For reply_classified, if they're already at 'interested' or beyond, don't move back
    if (trigger === 'reply_classified' && stageIndex >= PIPELINE_STAGES_ORDER.indexOf('interested')) {
      return null;
    }
    return null;
  }

  return targetStage;
}

/**
 * Whether a stage progression should be validated with AI.
 * Only validate significant jumps (skipping stages).
 */
function shouldValidateWithAI(currentStage: string, nextStage: string): boolean {
  const currentIndex = PIPELINE_STAGES_ORDER.indexOf(currentStage);
  const nextIndex = PIPELINE_STAGES_ORDER.indexOf(nextStage);

  // Validate if jumping more than 2 stages
  return nextIndex - currentIndex > 2;
}

/**
 * Use AI to validate if a stage progression makes sense.
 */
async function validateStageProgressionWithAI(
  lead: { id: string; businessName: string; stage: string; niche?: string | null },
  trigger: PipelineTrigger,
  proposedStage: string
): Promise<{ approved: boolean; reason?: string }> {
  try {
    const zai = await ZAI.create();

    const prompt = `You are a sales pipeline validator. A lead is being auto-moved in the sales pipeline.

LEAD: ${lead.businessName}
NICHE: ${lead.niche || 'Unknown'}
CURRENT STAGE: ${lead.stage}
TRIGGER EVENT: ${trigger}
PROPOSED NEW STAGE: ${proposedStage}

Does this stage progression make sense? Consider:
1. Is the trigger event sufficient to justify the stage change?
2. Are there any red flags that suggest the progression is premature?

Return a JSON object:
{
  "approved": true/false,
  "reason": "Brief explanation"
}

Return ONLY valid JSON.`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a precise validator. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      model: 'auto',
    });

    const content = completion.choices?.[0]?.message?.content || '';
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleaned);
    return {
      approved: !!parsed.approved,
      reason: String(parsed.reason || ''),
    };
  } catch (error) {
    console.error('[AutonomousOutreach] AI validation failed, defaulting to approved:', error);
    // Default to approved if AI validation fails — don't block progression
    return { approved: true, reason: 'AI validation unavailable, proceeding with rule-based progression' };
  }
}

/**
 * Map campaign status to a human-readable phase name.
 */
function mapStatusToPhase(status: string): string {
  const phaseMap: Record<string, string> = {
    parsing: 'Initializing',
    discovering: 'Discovering Leads',
    analyzing: 'Researching Companies',
    generating: 'Generating Outreach',
    sending: 'Sending Emails',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
  };
  return phaseMap[status] || status;
}

/**
 * Map quality string to a numeric score (0-100).
 */
function mapQualityToScore(quality: string): number {
  const q = quality.toLowerCase();
  if (q.includes('excellent') || q.includes('great')) return 85;
  if (q.includes('good') || q.includes('decent')) return 65;
  if (q.includes('basic') || q.includes('average')) return 40;
  if (q.includes('poor') || q.includes('bad') || q.includes('terrible')) return 15;
  return 50; // Unknown
}

/**
 * Map deal size string to revenue potential score (0-100).
 */
function mapDealSizeToScore(dealSize: string): number {
  const lower = dealSize.toLowerCase();
  // Try to extract dollar amounts
  const dollarMatch = lower.match(/\$?([\d,]+)/g);
  if (dollarMatch) {
    const amounts = dollarMatch.map((s) => parseInt(s.replace(/[$,]/g, ''), 10));
    const maxAmount = Math.max(...amounts);

    if (maxAmount >= 5000) return 90;
    if (maxAmount >= 2000) return 70;
    if (maxAmount >= 1000) return 50;
    if (maxAmount >= 500) return 30;
    return 20;
  }

  // Fallback to keyword matching
  if (lower.includes('enterprise') || lower.includes('large')) return 90;
  if (lower.includes('mid') || lower.includes('medium')) return 60;
  if (lower.includes('small') || lower.includes('starter')) return 30;
  return 50;
}

/**
 * Map deal size to revenue estimate category.
 */
function mapDealSizeToRevenue(dealSize: string): string {
  const lower = dealSize.toLowerCase();
  const dollarMatch = lower.match(/\$?([\d,]+)/g);
  if (dollarMatch) {
    const amounts = dollarMatch.map((s) => parseInt(s.replace(/[$,]/g, ''), 10));
    const maxAmount = Math.max(...amounts);

    if (maxAmount >= 5000) return 'high';
    if (maxAmount >= 1000) return 'medium';
    return 'low';
  }
  return 'medium';
}
