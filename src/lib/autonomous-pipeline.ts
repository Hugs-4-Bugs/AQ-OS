// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autonomous Acquisition Pipeline
// Orchestrates: discover → research → analyze → generate outreach → send
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { startDiscoveryJob, getDiscoveryJobStatus, type DiscoveryParams, type DiscoverySource } from './lead-discovery-service';
import { analyzeLead } from './ai/lead-analysis-engine';
import { generateOutreach } from './ai/outreach-generator';
import { checkCreditSufficiency, deductCredits } from './credit-service';
import { dispatchNotification } from './notification-engine';
import { sendEmail, type SendEmailParams } from './gmail-delivery-service';
import ZAI from 'z-ai-web-dev-sdk';

// ===== TYPES =====

export interface CampaignConfig {
  niche: string;
  country: string;
  city?: string;
  source: DiscoverySource;
  maxLeads: number;
  channel: 'email' | 'whatsapp' | 'linkedin';
  tone: 'professional' | 'casual' | 'friendly' | 'formal';
  autoSend: boolean;
  customInstructions?: string;
}

export interface CampaignProgress {
  campaignId: string;
  status: string;
  phase: string;
  totalLeads: number;
  discovered: number;
  analyzed: number;
  outreachGenerated: number;
  sent: number;
  errors: number;
  errorMessage?: string;
}

// ===== INSTRUCTION PARSER =====

async function parseInstruction(zai: ZAI, instruction: string): Promise<CampaignConfig> {
  const response = await zai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: `You are a campaign configuration parser for a lead acquisition system. Extract structured data from user instructions. Return ONLY valid JSON, no markdown.`,
      },
      {
        role: 'user',
        content: `Parse this instruction into a campaign config: "${instruction}"

Return JSON with these exact keys:
- "niche" (string): The business niche/type (e.g. "dentists", "real estate agents")
- "country" (string): The country (e.g. "India", "USA")
- "city" (string|null): City if mentioned, otherwise null
- "source" (string): One of: ai_search, google_maps, justdial, yelp, linkedin. Default to "ai_search"
- "maxLeads" (number): Number of leads to find, between 5-50. Default 15
- "channel" (string): "email"
- "tone" (string): One of: professional, casual, friendly, formal. Default "professional"
- "autoSend" (boolean): false

Be concise and accurate.`,
      },
    ],
    model: 'auto',
  });

  const content = response.choices?.[0]?.message?.content || '';
  let cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const parsed = JSON.parse(cleaned);
    return {
      niche: String(parsed.niche || 'general'),
      country: String(parsed.country || 'India'),
      city: parsed.city || undefined,
      source: ['ai_search', 'google_maps', 'justdial', 'yelp', 'linkedin'].includes(parsed.source) ? parsed.source : 'ai_search',
      maxLeads: Math.min(Math.max(Number(parsed.maxLeads) || 15, 5), 50),
      channel: 'email',
      tone: ['professional', 'casual', 'friendly', 'formal'].includes(parsed.tone) ? parsed.tone : 'professional',
      autoSend: !!parsed.autoSend,
      customInstructions: parsed.customInstructions || undefined,
    };
  } catch {
    // Fallback defaults
    return {
      niche: instruction.split(' ').slice(0, 3).join(' '),
      country: 'India',
      source: 'ai_search',
      maxLeads: 15,
      channel: 'email',
      tone: 'professional',
      autoSend: false,
    };
  }
}

// ===== MAIN ENTRY POINT =====

export async function startAutonomousCampaign(
  userId: string,
  instruction: string,
  orgId?: string,
  autoSend?: boolean
): Promise<{ campaignId: string; status: string }> {
  // Check credits (minimum 10 needed to start a campaign)
  const sufficiency = await checkCreditSufficiency(userId, 10);
  if (!sufficiency.sufficient) {
    throw new Error(`Insufficient credits. Need at least 10 credits to start a campaign. Current balance: ${sufficiency.balance}`);
  }

  // Deduct initial campaign credit
  const deduction = await deductCredits({
    userId,
    action: 'autonomous_campaign',
    cost: 5,
    referenceId: undefined,
  });

  if (!deduction.success) {
    throw new Error(deduction.error || 'Failed to deduct campaign credits');
  }

  // Create campaign record
  const campaign = await db.acquisitionCampaign.create({
    data: {
      userId,
      orgId: orgId || null,
      instruction,
      status: 'parsing',
      autoSend: autoSend || false,
    },
  });

  // Notify user via multi-channel dispatch
  await dispatchNotification({
    userId,
    type: 'campaign_started',
    title: 'Campaign Started',
    message: `Autonomous campaign started: "${instruction.slice(0, 60)}"`,
    metadata: { campaignId: campaign.id },
  });

  // Start async processing (non-blocking)
  processCampaignAsync(campaign.id, userId, instruction, orgId, autoSend || false).catch((err) => {
    console.error(`[AutonomousPipeline] Campaign ${campaign.id} failed:`, err);
  });

  return { campaignId: campaign.id, status: 'parsing' };
}

// ===== BACKGROUND PROCESSOR =====

async function processCampaignAsync(
  campaignId: string,
  userId: string,
  instruction: string,
  orgId?: string,
  autoSend?: boolean
): Promise<void> {
  try {
    // Step 1: Parse instruction
    await db.acquisitionCampaign.update({
      where: { id: campaignId },
      data: { status: 'parsing' },
    });

    const zai = await ZAI.create();
    const config = await parseInstruction(zai, instruction);

    await db.acquisitionCampaign.update({
      where: { id: campaignId },
      data: {
        niche: config.niche,
        country: config.country,
        city: config.city,
        source: config.source,
        channel: config.channel,
        tone: config.tone,
        maxLeads: config.maxLeads,
        customInstructions: config.customInstructions,
      },
    });

    // Step 2: Start lead discovery
    await db.acquisitionCampaign.update({
      where: { id: campaignId },
      data: { status: 'discovering' },
    });

    const discoveryParams: DiscoveryParams = {
      niche: config.niche,
      country: config.country,
      city: config.city,
      source: config.source,
      maxResults: config.maxLeads,
    };

    const discoveryResult = await startDiscoveryJob(userId, discoveryParams, orgId);

    if (!discoveryResult.jobId) {
      await db.acquisitionCampaign.update({
        where: { id: campaignId },
        data: { status: 'failed', errorMessage: discoveryResult.message },
      });
      return;
    }

    await db.acquisitionCampaign.update({
      where: { id: campaignId },
      data: { discoveryJobId: discoveryResult.jobId },
    });

    // Step 3: Poll discovery and process leads
    await pollDiscoveryAndProcessLeads(campaignId, userId, config, discoveryResult.jobId, autoSend || false);

    // Step 4: Mark completed
    await db.acquisitionCampaign.update({
      where: { id: campaignId },
      data: { status: 'completed', completedAt: new Date() },
    });

    await dispatchNotification({
      userId,
      type: 'campaign_completed',
      title: 'Campaign Completed',
      message: `Autonomous campaign "${config.niche} in ${config.country}" completed.`,
      metadata: { campaignId },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await db.acquisitionCampaign.update({
      where: { id: campaignId },
      data: { status: 'failed', errorMessage },
    });

    await dispatchNotification({
      userId,
      type: 'campaign_failed',
      title: 'Campaign Failed',
      message: `Campaign failed: ${errorMessage.slice(0, 100)}`,
      metadata: { campaignId },
    });

    console.error(`[AutonomousPipeline] Campaign ${campaignId} error:`, error);
  }
}

// ===== DISCOVERY POLLING + LEAD PROCESSING =====

async function pollDiscoveryAndProcessLeads(
  campaignId: string,
  userId: string,
  config: CampaignConfig,
  discoveryJobId: string,
  autoSend: boolean
): Promise<void> {
  const maxPollTime = 5 * 60 * 1000; // 5 minutes max
  const pollInterval = 3000; // 3 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxPollTime) {
    const jobStatus = await getDiscoveryJobStatus(discoveryJobId, userId);

    if (!jobStatus) {
      await db.acquisitionCampaign.update({
        where: { id: campaignId },
        data: {
          discovered: 0,
          status: 'failed',
          errorMessage: 'Discovery job not found',
        },
      });
      return;
    }

    // Update campaign progress
    await db.acquisitionCampaign.update({
      where: { id: campaignId },
      data: {
        discovered: jobStatus.imported + jobStatus.duplicates + jobStatus.failed,
        totalLeads: jobStatus.totalFound,
      },
    });

    if (jobStatus.status === 'completed') {
      // Process discovered leads
      await processDiscoveredLeads(campaignId, userId, config, discoveryJobId, autoSend);
      return;
    }

    if (jobStatus.status === 'failed') {
      await db.acquisitionCampaign.update({
        where: { id: campaignId },
        data: {
          status: 'failed',
          errorMessage: jobStatus.errorMessage || 'Discovery job failed',
        },
      });
      return;
    }

    // Wait and poll again
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  // Timeout
  await db.acquisitionCampaign.update({
    where: { id: campaignId },
    data: { status: 'failed', errorMessage: 'Discovery job timed out' },
  });
}

// ===== PROCESS DISCOVERED LEADS =====

async function processDiscoveredLeads(
  campaignId: string,
  userId: string,
  config: CampaignConfig,
  discoveryJobId: string,
  autoSend: boolean
): Promise<void> {
  // Get leads from this discovery job
  const job = await db.discoveryJob.findUnique({ where: { id: discoveryJobId } });
  if (!job || !job.resultData) return;

  let leadIds: string[] = [];
  try {
    const leadsData = JSON.parse(job.resultData);
    // Find leads that were imported for this user matching the campaign
    const recentLeads = await db.lead.findMany({
      where: {
        userId,
        niche: config.niche,
        country: config.country,
        isActive: true,
        createdAt: { gte: job.createdAt },
      },
      orderBy: { createdAt: 'desc' },
      take: config.maxLeads,
      select: { id: true },
    });
    leadIds = recentLeads.map((l) => l.id);
  } catch {
    // Empty leads
  }

  if (leadIds.length === 0) {
    await db.acquisitionCampaign.update({
      where: { id: campaignId },
      data: { status: 'completed', discovered: 0 },
    });
    return;
  }

  // Update campaign to analyzing phase
  await db.acquisitionCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'analyzing',
      discovered: leadIds.length,
      totalLeads: leadIds.length,
    },
  });

  let analyzedCount = 0;
  let outreachCount = 0;
  let sentCount = 0;
  let errorCount = 0;

  for (const leadId of leadIds) {
    try {
      // Check if still have credits
      const creditCheck = await checkCreditSufficiency(userId, 7); // 5 analysis + 2 outreach
      if (!creditCheck.sufficient) {
        console.log(`[AutonomousPipeline] Insufficient credits, stopping at ${analyzedCount}/${leadIds.length}`);
        break;
      }

      // Step: Analyze lead
      const analysisResult = await analyzeLead({
        leadId,
        userId,
        force: false,
      });

      if (!analysisResult.success) {
        errorCount++;
        continue;
      }

      analyzedCount++;

      await db.acquisitionCampaign.update({
        where: { id: campaignId },
        data: { analyzed: analyzedCount, status: 'generating' },
      });

      // Step: Generate outreach
      const outreachResult = await generateOutreach({
        leadId,
        userId,
        channel: config.channel as 'email' | 'whatsapp' | 'linkedin',
        tone: config.tone as 'professional' | 'casual' | 'urgent' | 'friendly' | 'formal',
        customInstructions: config.customInstructions,
      });

      if (!outreachResult.success) {
        errorCount++;
        continue;
      }

      outreachCount++;

      // Step: Auto-send if enabled
      if (autoSend && outreachResult.message) {
        const lead = await db.lead.findUnique({ where: { id: leadId } });
        if (lead?.email) {
          try {
            const emailAccount = await db.emailAccount.findFirst({
              where: { userId, status: 'active' },
            });

            if (emailAccount) {
              await sendEmail(emailAccount.id, {
                to: lead.email,
                subject: outreachResult.message.subject || `Re: ${lead.businessName}`,
                body: outreachResult.message.body,
              });

              sentCount++;
            }
          } catch (sendError) {
            console.error(`[AutonomousPipeline] Failed to send email to ${lead.email}:`, sendError);
            errorCount++;
          }
        }
      }

      // Update progress
      await db.acquisitionCampaign.update({
        where: { id: campaignId },
        data: {
          outreachGenerated: outreachCount,
          sent: sentCount,
          errors: errorCount,
          status: autoSend ? 'sending' : 'generating',
        },
      });

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (leadError) {
      errorCount++;
      console.error(`[AutonomousPipeline] Error processing lead ${leadId}:`, leadError);
    }
  }

  // Final update
  await db.acquisitionCampaign.update({
    where: { id: campaignId },
    data: {
      analyzed: analyzedCount,
      outreachGenerated: outreachCount,
      sent: sentCount,
      errors: errorCount,
      status: 'completed',
      completedAt: new Date(),
    },
  });
}

// ===== GET CAMPAIGN PROGRESS =====

export async function getCampaignProgress(campaignId: string, userId: string): Promise<CampaignProgress | null> {
  const campaign = await db.acquisitionCampaign.findFirst({
    where: { id: campaignId, userId },
  });

  if (!campaign) return null;

  return {
    campaignId: campaign.id,
    status: campaign.status,
    phase: campaign.status,
    totalLeads: campaign.totalLeads,
    discovered: campaign.discovered,
    analyzed: campaign.analyzed,
    outreachGenerated: campaign.outreachGenerated,
    sent: campaign.sent,
    errors: campaign.errors,
    errorMessage: campaign.errorMessage || undefined,
  };
}

// ===== LIST CAMPAIGNS =====

export async function listCampaigns(
  userId: string,
  options?: { limit?: number; status?: string }
): Promise<{ campaigns: CampaignProgress[] }> {
  const where: Record<string, unknown> = { userId };
  if (options?.status) where.status = options.status;

  const campaigns = await db.acquisitionCampaign.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: options?.limit || 20,
  });

  return {
    campaigns: campaigns.map((c) => ({
      campaignId: c.id,
      status: c.status,
      phase: c.status,
      totalLeads: c.totalLeads,
      discovered: c.discovered,
      analyzed: c.analyzed,
      outreachGenerated: c.outreachGenerated,
      sent: c.sent,
      errors: c.errors,
      errorMessage: c.errorMessage || undefined,
    })),
  };
}

// ===== GET CAMPAIGN STATS =====

export async function getCampaignStats(userId: string): Promise<{
  totalCampaigns: number;
  totalLeadsDiscovered: number;
  totalOutreachGenerated: number;
  totalSent: number;
  activeCampaigns: number;
}> {
  const campaigns = await db.acquisitionCampaign.findMany({
    where: { userId },
  });

  return {
    totalCampaigns: campaigns.length,
    totalLeadsDiscovered: campaigns.reduce((sum, c) => sum + c.discovered, 0),
    totalOutreachGenerated: campaigns.reduce((sum, c) => sum + c.outreachGenerated, 0),
    totalSent: campaigns.reduce((sum, c) => sum + c.sent, 0),
    activeCampaigns: campaigns.filter((c) => ['parsing', 'discovering', 'analyzing', 'generating', 'sending'].includes(c.status)).length,
  };
}
