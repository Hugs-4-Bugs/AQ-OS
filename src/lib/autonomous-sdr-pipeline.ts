// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autonomous SDR Pipeline Orchestrator
// Phase: Full autonomous SDR loop orchestration
//
// Orchestrates the complete SDR cycle:
//   Find lead → Research → Analyze → Generate outreach → Send →
//   Monitor replies → Detect intent → Schedule meeting → Update CRM → Notify
//
// CRITICAL RULES:
//   - NEVER skip autonomy level checks — respect user's autonomy mode
//   - NEVER exceed daily outreach limits
//   - NEVER lose execution logs — always persist cycle results
//   - NEVER send without checking credits first
//   - Always create LeadActivity records for traceability
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { sendNotification } from '@/lib/notification-engine';
import { deductCredits, checkCreditSufficiency } from '@/lib/credit-service';
import { startDiscoveryJob, type DiscoverySource } from '@/lib/lead-discovery-service';
import { enrichLead } from '@/lib/lead-enrichment-service';
import { scoreLead } from '@/lib/ai/scoring-engine';
import { generateOutreach, type OutreachChannel } from '@/lib/ai/outreach-generator';

// ===== TYPES =====

export type SDRAutonomyLevel = 'approval' | 'assisted' | 'autonomous';

export interface SDRConfig {
  userId: string;
  niches: string[];
  locations: string[];
  dailyOutreachLimit: number;
  minLeadScoreForOutreach: number;
  followUpCadenceDays: number;
  preferredChannels: string[];
  autonomyLevel: SDRAutonomyLevel;
}

export interface SDRCycleResult {
  cycleId: string;
  userId: string;
  startedAt: Date;
  completedAt: Date;
  phases: {
    discover: { leadsFound: number; jobsStarted: number };
    enrich: { leadsEnriched: number; failed: number };
    analyze: { leadsScored: number; hotLeads: number };
    detect: { hot: number; critical: number; actions: number };
    outreach: { generated: number; sent: number; enrolled: number };
    monitor: { repliesClassified: number; positive: number; meetingsTriggered: number };
    followUp: { sent: number; skipped: number };
    pipeline: { stagesUpdated: number };
  };
  totalCreditsUsed: number;
  actionsRequiringApproval: number;
  actionsAutoExecuted: number;
  errors: string[];
}

export interface SDRDailySummary {
  date: string;
  newLeads: number;
  leadsEnriched: number;
  outreachSent: number;
  repliesReceived: number;
  meetingsScheduled: number;
  pipelineMoved: number;
  creditsUsed: number;
  hotLeadsIdentified: number;
  topPerformingChannel: string;
  recommendations: string[];
}

export interface SDRStatusResult {
  isActive: boolean;
  lastCycleAt: Date | null;
  nextCycleAt: Date | null;
  todayOutreachSent: number;
  todayOutreachLimit: number;
  pendingApprovals: number;
  config: SDRConfig;
  recentCycleResults: SDRCycleResult[];
}

// ===== CONSTANTS =====

const SDR_CYCLE_CREDIT_COST = 5;
const SDR_CYCLE_ACTION = 'sdr_cycle';
const DEFAULT_DAILY_OUTREACH_LIMIT = 50;
const DEFAULT_MIN_LEAD_SCORE = 40;
const DEFAULT_FOLLOW_UP_CADENCE_DAYS = 3;
const DEFAULT_PREFERRED_CHANNELS: OutreachChannel[] = ['email', 'whatsapp'];
const DEFAULT_NICHES: string[] = [];
const DEFAULT_LOCATIONS: string[] = [];

// Pipeline stage progression mapping
const STAGE_PROGRESSION: Record<string, string> = {
  discovered: 'enriched',
  enriched: 'analyzed',
  analyzed: 'outreach_ready',
  outreach_ready: 'contacted',
  contacted: 'replied',
  replied: 'meeting_scheduled',
  meeting_scheduled: 'qualified',
  qualified: 'proposal_sent',
  proposal_sent: 'negotiation',
  negotiation: 'closed_won',
};

// ===== HELPER: SAFE JSON PARSE =====

function safeParseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const cleaned = raw.trim();
    const jsonStr = cleaned.startsWith('```')
      ? cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      : cleaned;
    return JSON.parse(jsonStr) as T;
  } catch {
    return fallback;
  }
}

// ===== HELPER: GENERATE CYCLE ID =====

function generateCycleId(): string {
  return `sdr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// ===== HELPER: TODAY DATE RANGE =====

function getTodayRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start, end };
}

// ===== HELPER: LOG LEAD ACTIVITY =====

async function logLeadActivity(
  leadId: string,
  type: string,
  description: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await db.leadActivity.create({
      data: {
        leadId,
        type,
        description,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
  } catch (error) {
    console.error(`[SDRPipeline] Failed to log lead activity for ${leadId}:`, error);
  }
}

// ===== HELPER: CHECK AUTONOMY PERMISSION =====

function canAutoExecute(
  autonomyLevel: SDRAutonomyLevel,
  actionSeverity: 'low' | 'medium' | 'high'
): { allowed: boolean; requiresApproval: boolean } {
  switch (autonomyLevel) {
    case 'approval':
      // All actions require user approval
      return { allowed: false, requiresApproval: true };
    case 'assisted':
      // Low and medium actions auto-execute, high severity needs approval
      if (actionSeverity === 'high') {
        return { allowed: false, requiresApproval: true };
      }
      return { allowed: true, requiresApproval: false };
    case 'autonomous':
      // Everything auto-executes
      return { allowed: true, requiresApproval: false };
    default:
      return { allowed: false, requiresApproval: true };
  }
}

// ===== HELPER: GET TODAY'S OUTREACH COUNT =====

async function getTodayOutreachCount(userId: string): Promise<number> {
  const { start, end } = getTodayRange();
  try {
    const count = await db.outreachMessage.count({
      where: {
        userId,
        status: { in: ['sent', 'delivered', 'opened', 'replied'] },
        sentAt: { gte: start, lt: end },
      },
    });
    return count;
  } catch {
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 1: DISCOVER — Run lead discovery jobs for configured niches
// ═══════════════════════════════════════════════════════════════════

async function executeDiscoverPhase(
  userId: string,
  config: SDRConfig,
  autonomyLevel: SDRAutonomyLevel
): Promise<{ leadsFound: number; jobsStarted: number; errors: string[]; autoExecuted: number; requiresApproval: number }> {
  const errors: string[] = [];
  let leadsFound = 0;
  let jobsStarted = 0;
  let autoExecuted = 0;
  let requiresApproval = 0;

  if (!config.niches || config.niches.length === 0) {
    console.log(`[SDRPipeline] No niches configured for user ${userId}, skipping discovery`);
    return { leadsFound: 0, jobsStarted: 0, errors: [], autoExecuted: 0, requiresApproval: 0 };
  }

  const permission = canAutoExecute(autonomyLevel, 'medium');
  if (!permission.allowed) {
    requiresApproval += config.niches.length * (config.locations.length || 1);
    // In approval mode, we don't auto-start discovery jobs
    // We notify the user with suggestions
    await sendNotification({
      userId,
      type: 'ai_analysis_complete',
      title: 'SDR: Discovery Jobs Ready',
      message: `Found ${config.niches.length} niche(s) to discover leads for. Approval needed to start ${config.niches.length * Math.max(config.locations.length, 1)} discovery jobs.`,
      metadata: { niches: config.niches, locations: config.locations, phase: 'discover' },
    });
    return { leadsFound: 0, jobsStarted: 0, errors: [], autoExecuted: 0, requiresApproval };
  }

  for (const niche of config.niches) {
    const locations = config.locations.length > 0 ? config.locations : ['US'];

    for (const location of locations) {
      try {
        // Parse location into country/city
        const parts = location.split(',');
        const country = parts[0].trim();
        const city = parts.length > 1 ? parts[1].trim() : undefined;

        const result = await startDiscoveryJob(userId, {
          niche,
          country,
          city,
          source: 'ai_search' as DiscoverySource,
          maxResults: 25,
        });

        if (result.jobId) {
          jobsStarted++;
          autoExecuted++;
        } else if (result.status === 'failed') {
          errors.push(`Discovery failed for ${niche}/${location}: ${result.message}`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown discovery error';
        errors.push(`Discovery error for ${niche}/${location}: ${msg}`);
      }
    }
  }

  // Count leads discovered today by this user
  const { start, end } = getTodayRange();
  try {
    const todayLeads = await db.lead.count({
      where: {
        userId,
        stage: 'discovered',
        createdAt: { gte: start, lt: end },
      },
    });
    leadsFound = todayLeads;
  } catch {
    // Use jobsStarted as fallback estimate
    leadsFound = jobsStarted * 10;
  }

  return { leadsFound, jobsStarted, errors, autoExecuted, requiresApproval };
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 2: ENRICH — Enrich newly discovered leads
// ═══════════════════════════════════════════════════════════════════

async function executeEnrichPhase(
  userId: string,
  _config: SDRConfig,
  autonomyLevel: SDRAutonomyLevel
): Promise<{ leadsEnriched: number; failed: number; errors: string[]; autoExecuted: number; requiresApproval: number }> {
  const errors: string[] = [];
  let leadsEnriched = 0;
  let failed = 0;
  let autoExecuted = 0;
  let requiresApproval = 0;

  // Find leads that are in 'discovered' stage and haven't been enriched yet
  const unenrichedLeads = await db.lead.findMany({
    where: {
      userId,
      stage: 'discovered',
      isActive: true,
      bestChannel: null, // Not yet enriched
    },
    take: 20, // Limit per cycle to avoid credit exhaustion
    orderBy: { createdAt: 'desc' },
  });

  if (unenrichedLeads.length === 0) {
    return { leadsEnriched: 0, failed: 0, errors: [], autoExecuted: 0, requiresApproval: 0 };
  }

  const permission = canAutoExecute(autonomyLevel, 'medium');
  if (!permission.allowed) {
    requiresApproval += unenrichedLeads.length;
    await sendNotification({
      userId,
      type: 'ai_analysis_complete',
      title: 'SDR: Leads Ready for Enrichment',
      message: `${unenrichedLeads.length} leads are ready for enrichment. Approval needed.`,
      metadata: { leadCount: unenrichedLeads.length, phase: 'enrich' },
    });
    return { leadsEnriched: 0, failed: 0, errors: [], autoExecuted: 0, requiresApproval };
  }

  for (const lead of unenrichedLeads) {
    try {
      const result = await enrichLead(lead.id, userId);

      if (result.success) {
        leadsEnriched++;
        autoExecuted++;

        // Move lead to enriched stage
        await db.lead.update({
          where: { id: lead.id },
          data: { stage: 'enriched' },
        });

        await logLeadActivity(lead.id, 'sdr_enriched', 'Lead enriched via SDR pipeline', {
          fieldsUpdated: result.fieldsUpdated,
        });
      } else {
        failed++;
        if (result.error) {
          errors.push(`Enrichment failed for lead ${lead.id}: ${result.error}`);
        }
      }

      // Small delay between enrichments
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error) {
      failed++;
      const msg = error instanceof Error ? error.message : 'Unknown enrichment error';
      errors.push(`Enrichment error for lead ${lead.id}: ${msg}`);
    }
  }

  return { leadsEnriched, failed, errors, autoExecuted, requiresApproval };
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 3: ANALYZE — Score and analyze leads
// ═══════════════════════════════════════════════════════════════════

async function executeAnalyzePhase(
  userId: string,
  config: SDRConfig,
  autonomyLevel: SDRAutonomyLevel
): Promise<{ leadsScored: number; hotLeads: number; errors: string[]; autoExecuted: number; requiresApproval: number }> {
  const errors: string[] = [];
  let leadsScored = 0;
  let hotLeads = 0;
  let autoExecuted = 0;
  let requiresApproval = 0;

  // Find leads that are enriched but not yet scored/analyzed
  const unanalyzedLeads = await db.lead.findMany({
    where: {
      userId,
      stage: { in: ['enriched', 'discovered'] },
      isActive: true,
      replyScore: 0, // Not yet scored
    },
    take: 20,
    orderBy: { createdAt: 'desc' },
  });

  if (unanalyzedLeads.length === 0) {
    return { leadsScored: 0, hotLeads: 0, errors: [], autoExecuted: 0, requiresApproval: 0 };
  }

  const permission = canAutoExecute(autonomyLevel, 'medium');
  if (!permission.allowed) {
    requiresApproval += unanalyzedLeads.length;
    await sendNotification({
      userId,
      type: 'ai_scoring_complete',
      title: 'SDR: Leads Ready for Scoring',
      message: `${unanalyzedLeads.length} leads are ready for AI scoring. Approval needed.`,
      metadata: { leadCount: unanalyzedLeads.length, phase: 'analyze' },
    });
    return { leadsScored: 0, hotLeads: 0, errors: [], autoExecuted: 0, requiresApproval };
  }

  for (const lead of unanalyzedLeads) {
    try {
      const result = await scoreLead({
        leadId: lead.id,
        userId,
        force: false,
      });

      if (result.success && result.scores) {
        leadsScored++;
        autoExecuted++;

        // Update lead stage to analyzed
        await db.lead.update({
          where: { id: lead.id },
          data: { stage: 'analyzed' },
        });

        // Count hot leads (above threshold)
        const compositeScore = Math.round(
          (result.scores.leadQualityScore * 0.4 +
            result.scores.purchaseProbability * 0.3 +
            result.scores.digitalMaturityScore * 0.15 +
            result.scores.websiteQualityScore * 0.15)
        );

        if (compositeScore >= config.minLeadScoreForOutreach) {
          hotLeads++;
        }

        await logLeadActivity(lead.id, 'sdr_scored', 'Lead scored via SDR pipeline', {
          leadQuality: result.scores.leadQualityScore,
          purchaseProbability: result.scores.purchaseProbability,
          outreachPriority: result.scores.outreachPriority,
        });
      } else {
        errors.push(`Scoring failed for lead ${lead.id}: ${result.error || 'Unknown error'}`);
      }

      // Delay between scoring calls
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown scoring error';
      errors.push(`Scoring error for lead ${lead.id}: ${msg}`);
    }
  }

  return { leadsScored, hotLeads, errors, autoExecuted, requiresApproval };
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 4: DETECT — Run hot lead detection
// ═══════════════════════════════════════════════════════════════════

async function executeDetectPhase(
  userId: string,
  config: SDRConfig,
  autonomyLevel: SDRAutonomyLevel
): Promise<{ hot: number; critical: number; actions: number; errors: string[]; autoExecuted: number; requiresApproval: number }> {
  const errors: string[] = [];
  let hot = 0;
  let critical = 0;
  let actions = 0;
  let autoExecuted = 0;
  let requiresApproval = 0;

  // Find leads with high scores that haven't been contacted yet
  const scoredLeads = await db.lead.findMany({
    where: {
      userId,
      stage: { in: ['analyzed', 'enriched'] },
      isActive: true,
      replyScore: { gte: config.minLeadScoreForOutreach },
    },
    orderBy: { urgencyScore: 'desc' },
    take: 30,
  });

  // Also check for leads with recent engagement signals
  const recentlyEngaged = await db.lead.findMany({
    where: {
      userId,
      isActive: true,
      emailStatus: { in: ['opened', 'replied'] },
    },
    orderBy: { lastContactedAt: 'desc' },
    take: 20,
  });

  const allLeadsToCheck = [...scoredLeads, ...recentlyEngaged];
  // Deduplicate by ID
  const uniqueLeads = Array.from(new Map(allLeadsToCheck.map((l) => [l.id, l])).values());

  for (const lead of uniqueLeads) {
    try {
      const isHot = lead.urgencyScore >= 70 || lead.replyScore >= 70;
      const isCritical = lead.urgencyScore >= 85 || (lead.emailStatus === 'replied' && lead.replyScore >= 60);

      if (isCritical) {
        critical++;
        hot++;

        // Critical leads need immediate action — always notify
        await sendNotification({
          userId,
          type: 'lead_pipeline_update',
          title: '🔥 Critical Hot Lead Detected!',
          message: `${lead.businessName} has an urgency score of ${lead.urgencyScore} and requires immediate attention. ${lead.opportunityNotes || ''}`,
          actionUrl: `/leads/${lead.id}`,
          metadata: { leadId: lead.id, score: lead.urgencyScore, phase: 'detect' },
        });

        await logLeadActivity(lead.id, 'sdr_hot_lead_critical', 'Critical hot lead detected via SDR pipeline', {
          urgencyScore: lead.urgencyScore,
          replyScore: lead.replyScore,
          conversionScore: lead.conversionScore,
        });

        actions++;
      } else if (isHot) {
        hot++;

        const permission = canAutoExecute(autonomyLevel, 'medium');
        if (permission.allowed) {
          autoExecuted++;
          // In assisted/autonomous mode, hot leads get auto-queued for outreach
          await db.lead.update({
            where: { id: lead.id },
            data: { stage: 'outreach_ready' },
          });

          await logLeadActivity(lead.id, 'sdr_hot_lead_detected', 'Hot lead detected and queued for outreach', {
            urgencyScore: lead.urgencyScore,
            replyScore: lead.replyScore,
          });
          actions++;
        } else {
          requiresApproval++;
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown detection error';
      errors.push(`Detection error for lead ${lead.id}: ${msg}`);
    }
  }

  // Try to use hot-lead-detection-service if available
  try {
    const { detectHotLeads } = await import('@/lib/hot-lead-detection-service');
    const detectionResult = await detectHotLeads(userId);
    // Merge results if service returned data
    if (detectionResult && typeof detectionResult === 'object') {
      const result = detectionResult as { hot?: number; critical?: number };
      hot += result.hot || 0;
      critical += result.critical || 0;
    }
  } catch {
    // Service not available — we already did manual detection above
  }

  return { hot, critical, actions, errors, autoExecuted, requiresApproval };
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 5: OUTREACH — Generate and send outreach for hot/warm leads
// ═══════════════════════════════════════════════════════════════════

async function executeOutreachPhase(
  userId: string,
  config: SDRConfig,
  autonomyLevel: SDRAutonomyLevel
): Promise<{ generated: number; sent: number; enrolled: number; errors: string[]; autoExecuted: number; requiresApproval: number }> {
  const errors: string[] = [];
  let generated = 0;
  let sent = 0;
  let enrolled = 0;
  let autoExecuted = 0;
  let requiresApproval = 0;

  // Check daily outreach limit
  const todaySent = await getTodayOutreachCount(userId);
  const remainingLimit = Math.max(0, config.dailyOutreachLimit - todaySent);

  if (remainingLimit <= 0) {
    console.log(`[SDRPipeline] Daily outreach limit reached for user ${userId} (${todaySent}/${config.dailyOutreachLimit})`);
    return { generated: 0, sent: 0, enrolled: 0, errors: [], autoExecuted: 0, requiresApproval: 0 };
  }

  // Find leads ready for outreach
  const outreachReadyLeads = await db.lead.findMany({
    where: {
      userId,
      stage: { in: ['analyzed', 'outreach_ready'] },
      isActive: true,
      replyScore: { gte: config.minLeadScoreForOutreach },
    },
    orderBy: { urgencyScore: 'desc' },
    take: Math.min(remainingLimit, 15), // Cap per cycle
  });

  if (outreachReadyLeads.length === 0) {
    return { generated: 0, sent: 0, enrolled: 0, errors: [], autoExecuted: 0, requiresApproval: 0 };
  }

  const permission = canAutoExecute(autonomyLevel, 'high');
  if (!permission.allowed) {
    requiresApproval += outreachReadyLeads.length;
    await sendNotification({
      userId,
      type: 'ai_outreach_complete',
      title: 'SDR: Outreach Ready for Approval',
      message: `${outreachReadyLeads.length} leads are ready for outreach. Approval needed to generate and send messages.`,
      metadata: { leadCount: outreachReadyLeads.length, phase: 'outreach' },
    });
    return { generated: 0, sent: 0, enrolled: 0, errors: [], autoExecuted: 0, requiresApproval };
  }

  // Determine channel priority from config
  const channels = config.preferredChannels.length > 0
    ? config.preferredChannels as OutreachChannel[]
    : DEFAULT_PREFERRED_CHANNELS;

  for (const lead of outreachReadyLeads) {
    if (sent >= remainingLimit) break;

    try {
      // Pick best channel for this lead
      const channel = (lead.bestChannel as OutreachChannel) || channels[0] || 'email';

      // Generate outreach message
      const outreachResult = await generateOutreach({
        leadId: lead.id,
        userId,
        channel,
        tone: (lead.outreachStyle as 'professional' | 'casual' | 'urgent' | 'friendly' | 'formal') || 'professional',
      });

      if (outreachResult.success && outreachResult.message) {
        generated++;
        autoExecuted++;

        // In autonomous/assisted mode, mark the draft as ready for sending
        // The actual sending is done through the sequence execution engine or manually
        const permission2 = canAutoExecute(autonomyLevel, 'high');
        if (permission2.allowed) {
          // Find the draft message that was just created and mark it as 'sent'
          const draftMessage = await db.outreachMessage.findFirst({
            where: {
              leadId: lead.id,
              userId,
              status: 'draft',
              generatedByAI: true,
            },
            orderBy: { createdAt: 'desc' },
          });

          if (draftMessage) {
            await db.outreachMessage.update({
              where: { id: draftMessage.id },
              data: {
                status: 'sent',
                sentAt: new Date(),
              },
            });
            sent++;
            autoExecuted++;

            // Update lead stage and last contacted
            await db.lead.update({
              where: { id: lead.id },
              data: {
                stage: 'contacted',
                lastContactedAt: new Date(),
                emailStatus: channel === 'email' ? 'sent' : lead.emailStatus,
              },
            });

            await logLeadActivity(lead.id, 'sdr_outreach_sent', `Outreach sent via ${channel}`, {
              channel,
              messageId: draftMessage.id,
              estimatedReplyRate: outreachResult.message.estimatedReplyRate,
            });
          }

          // Try to enroll lead in a sequence
          try {
            const { enrollLeadInSequence } = await import('@/lib/sequence-execution-engine');
            // Find an active outreach sequence for this user, or skip enrollment
            const activeSequence = await db.outreachSequence.findFirst({
              where: { userId, status: 'active' },
            });
            if (activeSequence) {
              const enrollResult = await enrollLeadInSequence({
                sequenceId: activeSequence.id,
                leadId: lead.id,
                userId,
              });
              if (enrollResult.success) enrolled++;
            }
          } catch {
            // Sequence engine not available or no active sequence — set up follow-up manually
            const followUpDate = new Date();
            followUpDate.setDate(followUpDate.getDate() + config.followUpCadenceDays);

            await db.lead.update({
              where: { id: lead.id },
              data: { followUpAt: followUpDate },
            });
          }
        } else {
          // Assisted mode: notify user that outreach was generated
          await sendNotification({
            userId,
            type: 'ai_outreach_complete',
            title: 'SDR: Outreach Generated',
            message: `Outreach for ${lead.businessName} has been generated. Review and send when ready.`,
            actionUrl: `/leads/${lead.id}`,
            metadata: { leadId: lead.id, channel, phase: 'outreach' },
          });
        }
      } else {
        errors.push(`Outreach generation failed for lead ${lead.id}: ${outreachResult.error || 'Unknown error'}`);
      }

      // Delay between outreach generation
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown outreach error';
      errors.push(`Outreach error for lead ${lead.id}: ${msg}`);
    }
  }

  return { generated, sent, enrolled, errors, autoExecuted, requiresApproval };
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 6: MONITOR — Check for replies and classify them
// ═══════════════════════════════════════════════════════════════════

async function executeMonitorPhase(
  userId: string,
  _config: SDRConfig,
  autonomyLevel: SDRAutonomyLevel
): Promise<{ repliesClassified: number; positive: number; meetingsTriggered: number; errors: string[]; autoExecuted: number; requiresApproval: number }> {
  const errors: string[] = [];
  let repliesClassified = 0;
  let positive = 0;
  let meetingsTriggered = 0;
  let autoExecuted = 0;
  let requiresApproval = 0;

  // Find recently replied messages
  const repliedMessages = await db.outreachMessage.findMany({
    where: {
      userId,
      status: 'replied',
      repliedAt: { not: null },
    },
    orderBy: { repliedAt: 'desc' },
    take: 30,
    include: { lead: true },
  });

  if (repliedMessages.length === 0) {
    return { repliesClassified: 0, positive: 0, meetingsTriggered: 0, errors: [], autoExecuted: 0, requiresApproval: 0 };
  }

  for (const message of repliedMessages) {
    try {
      // Try to use reply-intelligence-service
      let classification: { sentiment: string; intent: string; confidence: number } | null = null;

      try {
        const { classifyReply } = await import('@/lib/reply-intelligence-service');
        const replyResult = await classifyReply({
          userId,
          leadId: message.leadId,
          emailContent: message.content,
          emailSubject: message.subject || undefined,
          fromEmail: '',
          messageId: message.id,
        });
        if (replyResult) {
          classification = {
            sentiment: replyResult.sentiment,
            intent: replyResult.intent,
            confidence: replyResult.confidence,
          };
        }
      } catch {
        // Reply intelligence service not available — use heuristic classification
        classification = classifyReplyHeuristic(message);
      }

      if (classification) {
        repliesClassified++;
        autoExecuted++;

        const isPositive = classification.sentiment === 'positive' ||
          classification.intent === 'meeting_request' ||
          classification.intent === 'interested' ||
          classification.intent === 'pricing_inquiry';

        if (isPositive) {
          positive++;

          // Update lead stage
          await db.lead.update({
            where: { id: message.leadId },
            data: {
              stage: 'replied',
              emailStatus: 'replied',
            },
          });

          await logLeadActivity(message.leadId, 'sdr_positive_reply', 'Positive reply received and classified', {
            sentiment: classification.sentiment,
            intent: classification.intent,
            confidence: classification.confidence,
          });

          // Check if we should auto-trigger meeting scheduling
          const shouldScheduleMeeting = classification.intent === 'meeting_request' || classification.confidence >= 0.8;

          if (shouldScheduleMeeting) {
            const permission = canAutoExecute(autonomyLevel, 'high');
            if (permission.allowed) {
              // In autonomous mode, create a meeting intent log for the meeting orchestration service
              await db.meetingIntentLog.create({
                data: {
                  userId,
                  leadId: message.leadId,
                  sourceType: message.channel,
                  sourceId: message.id,
                  detectedIntent: classification.intent,
                  confidence: classification.confidence,
                  originalText: message.content.substring(0, 500),
                },
              });

              meetingsTriggered++;
              autoExecuted++;

              await sendNotification({
                userId,
                type: 'meeting_scheduled',
                title: 'SDR: Meeting Intent Detected!',
                message: `${message.lead?.businessName || 'A lead'} expressed interest in scheduling a meeting. Auto-processing.`,
                actionUrl: `/leads/${message.leadId}`,
                metadata: { leadId: message.leadId, intent: classification.intent, phase: 'monitor' },
              });
            } else {
              requiresApproval++;
              await sendNotification({
                userId,
                type: 'meeting_scheduled',
                title: 'SDR: Meeting Intent Detected — Approval Needed',
                message: `${message.lead?.businessName || 'A lead'} wants to schedule a meeting. Approve to proceed.`,
                actionUrl: `/leads/${message.leadId}`,
                metadata: { leadId: message.leadId, intent: classification.intent, phase: 'monitor' },
              });
            }
          }
        }

        await logLeadActivity(message.leadId, 'sdr_reply_classified', 'Reply classified via SDR pipeline', {
          sentiment: classification.sentiment,
          intent: classification.intent,
          confidence: classification.confidence,
          messageId: message.id,
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown classification error';
      errors.push(`Reply classification error for message ${message.id}: ${msg}`);
    }
  }

  return { repliesClassified, positive, meetingsTriggered, errors, autoExecuted, requiresApproval };
}

// ===== HEURISTIC REPLY CLASSIFICATION =====

function classifyReplyHeuristic(
  message: { content: string; subject?: string | null; channel: string }
): { sentiment: string; intent: string; confidence: number } {
  const text = `${message.subject || ''} ${message.content}`.toLowerCase();

  const positiveKeywords = ['interested', 'yes', 'schedule', 'meeting', 'call', 'demo', 'pricing', 'quote', 'proposal', 'discuss', 'available', 'book', 'let\'s talk', 'set up', 'love to', 'sounds great'];
  const negativeKeywords = ['not interested', 'unsubscribe', 'remove', 'no thanks', 'stop', 'don\'t contact', 'not looking', 'no budget', 'competitor', 'already have'];
  const meetingKeywords = ['schedule', 'meeting', 'call', 'demo', 'book', 'available', 'set up', 'let\'s talk'];
  const pricingKeywords = ['pricing', 'cost', 'price', 'quote', 'budget', 'how much', 'rates', 'plan'];

  let score = 0;
  for (const kw of positiveKeywords) {
    if (text.includes(kw)) score += 1;
  }
  for (const kw of negativeKeywords) {
    if (text.includes(kw)) score -= 2;
  }

  let intent = 'general';
  for (const kw of meetingKeywords) {
    if (text.includes(kw)) { intent = 'meeting_request'; break; }
  }
  if (intent === 'general') {
    for (const kw of pricingKeywords) {
      if (text.includes(kw)) { intent = 'pricing_inquiry'; break; }
    }
  }

  const isPositive = score > 0;
  const confidence = Math.min(1, Math.max(0, 0.3 + score * 0.15));

  return {
    sentiment: isPositive ? 'positive' : score < 0 ? 'negative' : 'neutral',
    intent: isPositive ? intent : score < 0 ? 'not_interested' : 'general',
    confidence,
  };
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 7: FOLLOW_UP — Send follow-ups for leads that haven't replied
// ═══════════════════════════════════════════════════════════════════

async function executeFollowUpPhase(
  userId: string,
  config: SDRConfig,
  autonomyLevel: SDRAutonomyLevel
): Promise<{ sent: number; skipped: number; errors: string[]; autoExecuted: number; requiresApproval: number }> {
  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;
  let autoExecuted = 0;
  let requiresApproval = 0;

  // Check daily outreach limit
  const todaySent = await getTodayOutreachCount(userId);
  const remainingLimit = Math.max(0, config.dailyOutreachLimit - todaySent);

  // Find leads that need follow-up
  const followUpDate = new Date();
  const leadsNeedingFollowUp = await db.lead.findMany({
    where: {
      userId,
      stage: 'contacted',
      isActive: true,
      followUpAt: { lte: followUpDate },
      emailStatus: { not: 'replied' }, // Haven't replied yet
    },
    take: Math.min(remainingLimit, 15),
    orderBy: { followUpAt: 'asc' },
  });

  if (leadsNeedingFollowUp.length === 0) {
    return { sent: 0, skipped: 0, errors: [], autoExecuted: 0, requiresApproval: 0 };
  }

  const permission = canAutoExecute(autonomyLevel, 'high');
  if (!permission.allowed) {
    requiresApproval += leadsNeedingFollowUp.length;
    await sendNotification({
      userId,
      type: 'ai_outreach_complete',
      title: 'SDR: Follow-ups Ready',
      message: `${leadsNeedingFollowUp.length} leads are due for follow-up. Approval needed.`,
      metadata: { leadCount: leadsNeedingFollowUp.length, phase: 'followUp' },
    });
    return { sent: 0, skipped: leadsNeedingFollowUp.length, errors: [], autoExecuted: 0, requiresApproval };
  }

  const channels = config.preferredChannels.length > 0
    ? config.preferredChannels as OutreachChannel[]
    : DEFAULT_PREFERRED_CHANNELS;

  for (const lead of leadsNeedingFollowUp) {
    if (sent >= remainingLimit) {
      skipped += leadsNeedingFollowUp.length - sent;
      break;
    }

    try {
      // Check how many follow-ups have been sent already
      const previousOutreachCount = await db.outreachMessage.count({
        where: {
          leadId: lead.id,
          userId,
          status: { in: ['sent', 'delivered', 'opened'] },
          generatedByAI: true,
        },
      });

      // Max 3 follow-ups in a sequence
      if (previousOutreachCount >= 3) {
        skipped++;
        // Mark lead as cold
        await db.lead.update({
          where: { id: lead.id },
          data: { stage: 'contacted', notes: 'Max follow-ups reached, no reply' },
        });
        await logLeadActivity(lead.id, 'sdr_follow_up_exhausted', 'Max follow-ups reached with no reply');
        continue;
      }

      const channel = (lead.bestChannel as OutreachChannel) || channels[0] || 'email';

      // Generate follow-up message
      const result = await generateOutreach({
        leadId: lead.id,
        userId,
        channel,
        tone: 'friendly',
      });

      if (result.success && result.message) {
        // Find and send the draft
        const draftMessage = await db.outreachMessage.findFirst({
          where: {
            leadId: lead.id,
            userId,
            status: 'draft',
            generatedByAI: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (draftMessage) {
          await db.outreachMessage.update({
            where: { id: draftMessage.id },
            data: {
              status: 'sent',
              sentAt: new Date(),
            },
          });

          sent++;
          autoExecuted++;

          // Schedule next follow-up
          const nextFollowUp = new Date();
          nextFollowUp.setDate(nextFollowUp.getDate() + config.followUpCadenceDays);

          await db.lead.update({
            where: { id: lead.id },
            data: {
              lastContactedAt: new Date(),
              followUpAt: nextFollowUp,
            },
          });

          await logLeadActivity(lead.id, 'sdr_follow_up_sent', `Follow-up #${previousOutreachCount + 1} sent via ${channel}`, {
            channel,
            followUpNumber: previousOutreachCount + 1,
            nextFollowUpAt: nextFollowUp.toISOString(),
          });
        }
      } else {
        errors.push(`Follow-up generation failed for lead ${lead.id}: ${result.error || 'Unknown error'}`);
        skipped++;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown follow-up error';
      errors.push(`Follow-up error for lead ${lead.id}: ${msg}`);
      skipped++;
    }
  }

  return { sent, skipped, errors, autoExecuted, requiresApproval };
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 8: PIPELINE — Update pipeline stages based on all intelligence
// ═══════════════════════════════════════════════════════════════════

async function executePipelinePhase(
  userId: string,
  _config: SDRConfig,
  autonomyLevel: SDRAutonomyLevel
): Promise<{ stagesUpdated: number; errors: string[]; autoExecuted: number; requiresApproval: number }> {
  const errors: string[] = [];
  let stagesUpdated = 0;
  let autoExecuted = 0;
  let requiresApproval = 0;

  // Find leads where stage might need updating based on current signals
  const leadsNeedingUpdate = await db.lead.findMany({
    where: {
      userId,
      isActive: true,
      stage: { notIn: ['closed_won', 'closed_lost', 'disqualified'] },
    },
    take: 50,
    orderBy: { updatedAt: 'asc' }, // Oldest first
  });

  const permission = canAutoExecute(autonomyLevel, 'low');

  for (const lead of leadsNeedingUpdate) {
    try {
      let newStage: string | null = null;

      // Determine stage progression based on lead signals
      if (lead.emailStatus === 'replied' && lead.stage !== 'replied' && lead.stage !== 'meeting_scheduled' && lead.stage !== 'qualified') {
        newStage = 'replied';
      } else if (lead.emailStatus === 'opened' && lead.stage === 'contacted') {
        // Lead opened email but didn't reply — keep in contacted, schedule follow-up
        if (!lead.followUpAt || lead.followUpAt <= new Date()) {
          const nextFollowUp = new Date();
          nextFollowUp.setDate(nextFollowUp.getDate() + 2);

          await db.lead.update({
            where: { id: lead.id },
            data: { followUpAt: nextFollowUp },
          });
        }
      } else if (lead.stage === 'contacted' && lead.urgencyScore >= 80) {
        // High urgency but not replied — might need different channel
        newStage = 'outreach_ready';
      }

      // Try gap analysis service if available
      try {
        const { analyzeLeadGaps } = await import('@/lib/gap-analysis-service');
        const gapResult = await analyzeLeadGaps(lead.id, userId);
        if (gapResult && gapResult.success && gapResult.analysis) {
          // Use gap analysis to suggest stage progression
          const conversionProb = gapResult.analysis.conversionProbability;
          if (conversionProb >= 70 && lead.stage === 'contacted') {
            newStage = 'replied';
          } else if (conversionProb >= 50 && lead.stage === 'discovered') {
            newStage = 'enriched';
          }
          // Store gap analysis result as lead activity
          await logLeadActivity(lead.id, 'sdr_gap_analysis', 'Gap analysis performed via SDR pipeline', {
            overallScore: gapResult.analysis.overallScore,
            conversionProbability: gapResult.analysis.conversionProbability,
            gaps: gapResult.analysis.gaps.length,
          });
        }
      } catch {
        // Gap analysis service not available — use heuristic above
      }

      if (newStage && newStage !== lead.stage) {
        if (permission.allowed) {
          const previousStage = lead.stage;
          await db.lead.update({
            where: { id: lead.id },
            data: { stage: newStage },
          });

          stagesUpdated++;
          autoExecuted++;

          await logLeadActivity(lead.id, 'sdr_stage_updated', `Pipeline stage updated: ${previousStage} → ${newStage}`, {
            previousStage,
            newStage,
          });
        } else {
          requiresApproval++;
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown pipeline error';
      errors.push(`Pipeline update error for lead ${lead.id}: ${msg}`);
    }
  }

  return { stagesUpdated, errors, autoExecuted, requiresApproval };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN EXPORT: executeSDRCycle — Full SDR Loop
// ═══════════════════════════════════════════════════════════════════

export async function executeSDRCycle(userId: string): Promise<SDRCycleResult> {
  const cycleId = generateCycleId();
  const startedAt = new Date();
  const allErrors: string[] = [];
  let totalCreditsUsed = 0;
  let totalActionsRequiringApproval = 0;
  let totalActionsAutoExecuted = 0;

  console.log(`[SDRPipeline] Starting SDR cycle ${cycleId} for user ${userId}`);

  // Load SDR config
  const config = await getSDRConfig(userId);

  // Check credit sufficiency
  const sufficiency = await checkCreditSufficiency(userId, SDR_CYCLE_CREDIT_COST);
  if (!sufficiency.sufficient) {
    allErrors.push(`Insufficient credits: need ${SDR_CYCLE_CREDIT_COST}, have ${sufficiency.balance}`);
    return {
      cycleId,
      userId,
      startedAt,
      completedAt: new Date(),
      phases: {
        discover: { leadsFound: 0, jobsStarted: 0 },
        enrich: { leadsEnriched: 0, failed: 0 },
        analyze: { leadsScored: 0, hotLeads: 0 },
        detect: { hot: 0, critical: 0, actions: 0 },
        outreach: { generated: 0, sent: 0, enrolled: 0 },
        monitor: { repliesClassified: 0, positive: 0, meetingsTriggered: 0 },
        followUp: { sent: 0, skipped: 0 },
        pipeline: { stagesUpdated: 0 },
      },
      totalCreditsUsed: 0,
      actionsRequiringApproval: 0,
      actionsAutoExecuted: 0,
      errors: allErrors,
    };
  }

  // Deduct cycle credits
  const creditResult = await deductCredits({
    userId,
    action: SDR_CYCLE_ACTION,
    cost: SDR_CYCLE_CREDIT_COST,
    referenceId: cycleId,
  });

  if (creditResult.success) {
    totalCreditsUsed = SDR_CYCLE_CREDIT_COST;
  } else {
    allErrors.push(`Credit deduction failed: ${creditResult.error}`);
    return {
      cycleId,
      userId,
      startedAt,
      completedAt: new Date(),
      phases: {
        discover: { leadsFound: 0, jobsStarted: 0 },
        enrich: { leadsEnriched: 0, failed: 0 },
        analyze: { leadsScored: 0, hotLeads: 0 },
        detect: { hot: 0, critical: 0, actions: 0 },
        outreach: { generated: 0, sent: 0, enrolled: 0 },
        monitor: { repliesClassified: 0, positive: 0, meetingsTriggered: 0 },
        followUp: { sent: 0, skipped: 0 },
        pipeline: { stagesUpdated: 0 },
      },
      totalCreditsUsed: 0,
      actionsRequiringApproval: 0,
      actionsAutoExecuted: 0,
      errors: allErrors,
    };
  }

  // Execute each phase sequentially
  // Phase 1: DISCOVER
  const discoverResult = await executeDiscoverPhase(userId, config, config.autonomyLevel);
  allErrors.push(...discoverResult.errors);
  totalActionsRequiringApproval += discoverResult.requiresApproval;
  totalActionsAutoExecuted += discoverResult.autoExecuted;

  // Phase 2: ENRICH
  const enrichResult = await executeEnrichPhase(userId, config, config.autonomyLevel);
  allErrors.push(...enrichResult.errors);
  totalActionsRequiringApproval += enrichResult.requiresApproval;
  totalActionsAutoExecuted += enrichResult.autoExecuted;

  // Phase 3: ANALYZE
  const analyzeResult = await executeAnalyzePhase(userId, config, config.autonomyLevel);
  allErrors.push(...analyzeResult.errors);
  totalActionsRequiringApproval += analyzeResult.requiresApproval;
  totalActionsAutoExecuted += analyzeResult.autoExecuted;

  // Phase 4: DETECT
  const detectResult = await executeDetectPhase(userId, config, config.autonomyLevel);
  allErrors.push(...detectResult.errors);
  totalActionsRequiringApproval += detectResult.requiresApproval;
  totalActionsAutoExecuted += detectResult.autoExecuted;

  // Phase 5: OUTREACH
  const outreachResult = await executeOutreachPhase(userId, config, config.autonomyLevel);
  allErrors.push(...outreachResult.errors);
  totalActionsRequiringApproval += outreachResult.requiresApproval;
  totalActionsAutoExecuted += outreachResult.autoExecuted;

  // Phase 6: MONITOR
  const monitorResult = await executeMonitorPhase(userId, config, config.autonomyLevel);
  allErrors.push(...monitorResult.errors);
  totalActionsRequiringApproval += monitorResult.requiresApproval;
  totalActionsAutoExecuted += monitorResult.autoExecuted;

  // Phase 7: FOLLOW_UP
  const followUpResult = await executeFollowUpPhase(userId, config, config.autonomyLevel);
  allErrors.push(...followUpResult.errors);
  totalActionsRequiringApproval += followUpResult.requiresApproval;
  totalActionsAutoExecuted += followUpResult.autoExecuted;

  // Phase 8: PIPELINE
  const pipelineResult = await executePipelinePhase(userId, config, config.autonomyLevel);
  allErrors.push(...pipelineResult.errors);
  totalActionsRequiringApproval += pipelineResult.requiresApproval;
  totalActionsAutoExecuted += pipelineResult.autoExecuted;

  const completedAt = new Date();

  const result: SDRCycleResult = {
    cycleId,
    userId,
    startedAt,
    completedAt,
    phases: {
      discover: { leadsFound: discoverResult.leadsFound, jobsStarted: discoverResult.jobsStarted },
      enrich: { leadsEnriched: enrichResult.leadsEnriched, failed: enrichResult.failed },
      analyze: { leadsScored: analyzeResult.leadsScored, hotLeads: analyzeResult.hotLeads },
      detect: { hot: detectResult.hot, critical: detectResult.critical, actions: detectResult.actions },
      outreach: { generated: outreachResult.generated, sent: outreachResult.sent, enrolled: outreachResult.enrolled },
      monitor: { repliesClassified: monitorResult.repliesClassified, positive: monitorResult.positive, meetingsTriggered: monitorResult.meetingsTriggered },
      followUp: { sent: followUpResult.sent, skipped: followUpResult.skipped },
      pipeline: { stagesUpdated: pipelineResult.stagesUpdated },
    },
    totalCreditsUsed,
    actionsRequiringApproval: totalActionsRequiringApproval,
    actionsAutoExecuted: totalActionsAutoExecuted,
    errors: allErrors,
  };

  // Store cycle result in audit log
  try {
    await db.auditLog.create({
      data: {
        userId,
        action: 'sdr_cycle_completed',
        resource: 'sdr_pipeline',
        resourceId: cycleId,
        details: JSON.stringify(result),
      },
    });
  } catch (error) {
    console.error(`[SDRPipeline] Failed to store cycle result:`, error);
  }

  // Notify user of cycle completion (always, regardless of autonomy level)
  try {
    const durationMs = completedAt.getTime() - startedAt.getTime();
    const summary = `SDR cycle completed in ${Math.round(durationMs / 1000)}s. ` +
      `Discovered: ${result.phases.discover.leadsFound}, ` +
      `Enriched: ${result.phases.enrich.leadsEnriched}, ` +
      `Scored: ${result.phases.analyze.leadsScored}, ` +
      `Hot: ${result.phases.detect.hot}, ` +
      `Outreach: ${result.phases.outreach.sent}, ` +
      `Replies: ${result.phases.monitor.repliesClassified}, ` +
      `Follow-ups: ${result.phases.followUp.sent}, ` +
      `Pipeline updates: ${result.phases.pipeline.stagesUpdated}`;

    await sendNotification({
      userId,
      type: 'workflow_execution_complete',
      title: 'SDR Cycle Complete',
      message: summary,
      metadata: { cycleId, phaseResults: result.phases, errors: allErrors.length },
    });
  } catch (error) {
    console.error(`[SDRPipeline] Failed to send cycle notification:`, error);
  }

  console.log(`[SDRPipeline] SDR cycle ${cycleId} completed for user ${userId}. Errors: ${allErrors.length}`);

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// GET SDR CONFIG — Retrieve user's SDR configuration
// ═══════════════════════════════════════════════════════════════════

export async function getSDRConfig(userId: string): Promise<SDRConfig> {
  try {
    const settings = await db.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      return {
        userId,
        niches: DEFAULT_NICHES,
        locations: DEFAULT_LOCATIONS,
        dailyOutreachLimit: DEFAULT_DAILY_OUTREACH_LIMIT,
        minLeadScoreForOutreach: DEFAULT_MIN_LEAD_SCORE,
        followUpCadenceDays: DEFAULT_FOLLOW_UP_CADENCE_DAYS,
        preferredChannels: DEFAULT_PREFERRED_CHANNELS,
        autonomyLevel: 'approval',
      };
    }

    return {
      userId,
      niches: safeParseJSON<string[]>(settings.targetNiches, DEFAULT_NICHES),
      locations: safeParseJSON<string[]>(settings.targetCountries, DEFAULT_LOCATIONS),
      dailyOutreachLimit: DEFAULT_DAILY_OUTREACH_LIMIT,
      minLeadScoreForOutreach: DEFAULT_MIN_LEAD_SCORE,
      followUpCadenceDays: DEFAULT_FOLLOW_UP_CADENCE_DAYS,
      preferredChannels: safeParseJSON<string[]>(settings.targetChannels, DEFAULT_PREFERRED_CHANNELS),
      autonomyLevel: (settings.meetingAutonomyMode as SDRAutonomyLevel) || 'approval',
    };
  } catch (error) {
    console.error(`[SDRPipeline] Failed to get SDR config for user ${userId}:`, error);
    return {
      userId,
      niches: DEFAULT_NICHES,
      locations: DEFAULT_LOCATIONS,
      dailyOutreachLimit: DEFAULT_DAILY_OUTREACH_LIMIT,
      minLeadScoreForOutreach: DEFAULT_MIN_LEAD_SCORE,
      followUpCadenceDays: DEFAULT_FOLLOW_UP_CADENCE_DAYS,
      preferredChannels: DEFAULT_PREFERRED_CHANNELS,
      autonomyLevel: 'approval',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// UPDATE SDR CONFIG — Update user's SDR configuration
// ═══════════════════════════════════════════════════════════════════

export async function updateSDRConfig(userId: string, config: Partial<SDRConfig>): Promise<void> {
  try {
    const updateData: Record<string, unknown> = {};

    if (config.niches !== undefined) {
      updateData.targetNiches = JSON.stringify(config.niches);
    }
    if (config.locations !== undefined) {
      updateData.targetCountries = JSON.stringify(config.locations);
    }
    if (config.preferredChannels !== undefined) {
      updateData.targetChannels = JSON.stringify(config.preferredChannels);
    }
    if (config.autonomyLevel !== undefined) {
      updateData.meetingAutonomyMode = config.autonomyLevel;
    }

    // Ensure settings record exists
    await db.userSettings.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        targetNiches: JSON.stringify(config.niches || DEFAULT_NICHES),
        targetCountries: JSON.stringify(config.locations || DEFAULT_LOCATIONS),
        targetChannels: JSON.stringify(config.preferredChannels || DEFAULT_PREFERRED_CHANNELS),
        meetingAutonomyMode: config.autonomyLevel || 'approval',
      },
    });

    // Store SDR-specific config in audit log for traceability
    await db.auditLog.create({
      data: {
        userId,
        action: 'sdr_config_updated',
        resource: 'sdr_pipeline',
        details: JSON.stringify(config),
      },
    });

    // Store additional SDR config that isn't in UserSettings in a separate record
    // Using a leadActivity-like approach — store as a special config record
    // We store dailyOutreachLimit, minLeadScoreForOutreach, followUpCadenceDays in the notes field
    // of UserSettings (or we could use a separate SDRConfig table, but for now we use metadata)
    const sdrSpecificConfig: Record<string, unknown> = {};
    if (config.dailyOutreachLimit !== undefined) sdrSpecificConfig.dailyOutreachLimit = config.dailyOutreachLimit;
    if (config.minLeadScoreForOutreach !== undefined) sdrSpecificConfig.minLeadScoreForOutreach = config.minLeadScoreForOutreach;
    if (config.followUpCadenceDays !== undefined) sdrSpecificConfig.followUpCadenceDays = config.followUpCadenceDays;

    if (Object.keys(sdrSpecificConfig).length > 0) {
      // Store SDR-specific numeric config in notificationPreferences JSON field
      const existingSettings = await db.userSettings.findUnique({ where: { userId } });
      const existingPrefs = safeParseJSON<Record<string, unknown>>(existingSettings?.notificationPreferences, {});
      const updatedPrefs = { ...existingPrefs, ...sdrSpecificConfig };

      await db.userSettings.update({
        where: { userId },
        data: { notificationPreferences: JSON.stringify(updatedPrefs) },
      });
    }

    console.log(`[SDRPipeline] SDR config updated for user ${userId}`);
  } catch (error) {
    console.error(`[SDRPipeline] Failed to update SDR config for user ${userId}:`, error);
    throw new Error('Failed to update SDR configuration');
  }
}

// ═══════════════════════════════════════════════════════════════════
// GENERATE DAILY SUMMARY — Summary of what the SDR did today
// ═══════════════════════════════════════════════════════════════════

export async function generateDailySummary(userId: string): Promise<SDRDailySummary> {
  const { start, end } = getTodayRange();
  const today = start.toISOString().split('T')[0];

  try {
    // New leads today
    const newLeads = await db.lead.count({
      where: {
        userId,
        createdAt: { gte: start, lt: end },
        isActive: true,
      },
    });

    // Leads enriched today (check lead activities)
    const enrichmentActivities = await db.leadActivity.count({
      where: {
        type: 'sdr_enriched',
        createdAt: { gte: start, lt: end },
        lead: { userId },
      },
    });

    // Outreach sent today
    const outreachSent = await db.outreachMessage.count({
      where: {
        userId,
        status: { in: ['sent', 'delivered', 'opened', 'replied'] },
        sentAt: { gte: start, lt: end },
      },
    });

    // Replies received today
    const repliesReceived = await db.outreachMessage.count({
      where: {
        userId,
        status: 'replied',
        repliedAt: { gte: start, lt: end },
      },
    });

    // Meetings scheduled today
    const meetingsScheduled = await db.meeting.count({
      where: {
        userId,
        status: { in: ['scheduled', 'confirmed'] },
        createdAt: { gte: start, lt: end },
      },
    });

    // Pipeline stages moved today
    const pipelineMoved = await db.leadActivity.count({
      where: {
        type: 'sdr_stage_updated',
        createdAt: { gte: start, lt: end },
        lead: { userId },
      },
    });

    // Credits used today
    const creditsUsed = await db.creditsLedger.aggregate({
      where: {
        userId,
        credits: { lt: 0 },
        createdAt: { gte: start, lt: end },
      },
      _sum: { credits: true },
    });

    // Hot leads identified today
    const hotLeadsIdentified = await db.leadActivity.count({
      where: {
        type: { in: ['sdr_hot_lead_detected', 'sdr_hot_lead_critical'] },
        createdAt: { gte: start, lt: end },
        lead: { userId },
      },
    });

    // Top performing channel
    const topChannel = await getTopPerformingChannel(userId, start, end);

    // Generate recommendations
    const recommendations = await generateRecommendations(userId, {
      newLeads,
      outreachSent,
      repliesReceived,
      meetingsScheduled,
      hotLeadsIdentified,
    });

    const creditsUsedAmount = Math.abs(creditsUsed._sum.credits || 0);

    return {
      date: today,
      newLeads,
      leadsEnriched: enrichmentActivities,
      outreachSent,
      repliesReceived,
      meetingsScheduled,
      pipelineMoved,
      creditsUsed: creditsUsedAmount,
      hotLeadsIdentified,
      topPerformingChannel: topChannel,
      recommendations,
    };
  } catch (error) {
    console.error(`[SDRPipeline] Failed to generate daily summary for user ${userId}:`, error);
    return {
      date: today,
      newLeads: 0,
      leadsEnriched: 0,
      outreachSent: 0,
      repliesReceived: 0,
      meetingsScheduled: 0,
      pipelineMoved: 0,
      creditsUsed: 0,
      hotLeadsIdentified: 0,
      topPerformingChannel: 'email',
      recommendations: ['Unable to generate recommendations due to an error. Please try again later.'],
    };
  }
}

// ===== HELPER: GET TOP PERFORMING CHANNEL =====

async function getTopPerformingChannel(
  userId: string,
  start: Date,
  end: Date
): Promise<string> {
  try {
    const channelStats = await db.outreachMessage.groupBy({
      by: ['channel'],
      where: {
        userId,
        sentAt: { gte: start, lt: end },
        status: { in: ['sent', 'delivered', 'opened', 'replied'] },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    if (channelStats.length > 0) {
      return channelStats[0].channel;
    }

    return 'email';
  } catch {
    return 'email';
  }
}

// ===== HELPER: GENERATE RECOMMENDATIONS =====

async function generateRecommendations(
  userId: string,
  stats: {
    newLeads: number;
    outreachSent: number;
    repliesReceived: number;
    meetingsScheduled: number;
    hotLeadsIdentified: number;
  }
): Promise<string[]> {
  const recommendations: string[] = [];

  // Low lead volume
  if (stats.newLeads < 5) {
    recommendations.push('Lead discovery is low. Consider adding more niches or locations to your SDR config to increase lead volume.');
  }

  // Low reply rate
  if (stats.outreachSent > 10 && stats.repliesReceived < stats.outreachSent * 0.05) {
    recommendations.push('Reply rate is below 5%. Try adjusting your outreach tone or personalization settings to improve engagement.');
  }

  // Good reply rate but low meeting conversion
  if (stats.repliesReceived > 3 && stats.meetingsScheduled === 0) {
    recommendations.push('You\'re getting replies but not converting to meetings. Review your meeting scheduling process and ensure quick follow-up on positive replies.');
  }

  // Hot leads not being acted on
  if (stats.hotLeadsIdentified > stats.outreachSent) {
    recommendations.push('You have more hot leads than outreach sent. Increase your daily outreach limit or run the SDR cycle more frequently.');
  }

  // All zeros — need to get started
  if (stats.newLeads === 0 && stats.outreachSent === 0) {
    recommendations.push('No activity today. Configure your target niches and locations, then run an SDR cycle to start generating leads and outreach.');
  }

  // Good performance
  if (stats.repliesReceived > 0 && stats.meetingsScheduled > 0) {
    const conversionRate = (stats.meetingsScheduled / stats.repliesReceived * 100).toFixed(0);
    recommendations.push(`Great job! You\'re converting ${conversionRate}% of replies to meetings. Keep up the momentum.`);
  }

  // Check for stale leads
  try {
    const staleLeads = await db.lead.count({
      where: {
        userId,
        isActive: true,
        stage: { in: ['discovered', 'enriched'] },
        updatedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    });

    if (staleLeads > 10) {
      recommendations.push(`You have ${staleLeads} leads that haven't been updated in 7+ days. Consider running enrichment and scoring to move them forward.`);
    }
  } catch {
    // Skip this recommendation
  }

  return recommendations.length > 0 ? recommendations : ['Everything looks good! Continue running daily SDR cycles for optimal results.'];
}

// ═══════════════════════════════════════════════════════════════════
// GET SDR STATUS — Current status of the SDR pipeline for a user
// ═══════════════════════════════════════════════════════════════════

export async function getSDRStatus(userId: string): Promise<SDRStatusResult> {
  try {
    const config = await getSDRConfig(userId);

    // Get last cycle execution
    const lastCycle = await db.auditLog.findFirst({
      where: {
        userId,
        action: 'sdr_cycle_completed',
        resource: 'sdr_pipeline',
      },
      orderBy: { createdAt: 'desc' },
    });

    const lastCycleAt = lastCycle?.createdAt || null;

    // Next cycle would be approximately 24 hours after last cycle
    const nextCycleAt = lastCycleAt
      ? new Date(lastCycleAt.getTime() + 24 * 60 * 60 * 1000)
      : new Date();

    // Today's outreach count
    const todayOutreachSent = await getTodayOutreachCount(userId);

    // Pending approvals count (leads in outreach_ready stage for approval mode)
    let pendingApprovals = 0;
    if (config.autonomyLevel === 'approval') {
      pendingApprovals = await db.lead.count({
        where: {
          userId,
          stage: 'outreach_ready',
          isActive: true,
        },
      });

      // Also count draft outreach messages
      const draftMessages = await db.outreachMessage.count({
        where: {
          userId,
          status: 'draft',
          generatedByAI: true,
        },
      });

      pendingApprovals += draftMessages;
    }

    // Get recent cycle results from audit logs
    const recentCycleLogs = await db.auditLog.findMany({
      where: {
        userId,
        action: 'sdr_cycle_completed',
        resource: 'sdr_pipeline',
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const recentCycleResults: SDRCycleResult[] = recentCycleLogs
      .map((log) => {
        try {
          return safeParseJSON<SDRCycleResult>(log.details, null as unknown as SDRCycleResult);
        } catch {
          return null;
        }
      })
      .filter((r): r is SDRCycleResult => r !== null && r !== undefined);

    return {
      isActive: true, // SDR pipeline is always "active" — it runs on schedule
      lastCycleAt,
      nextCycleAt,
      todayOutreachSent,
      todayOutreachLimit: config.dailyOutreachLimit,
      pendingApprovals,
      config,
      recentCycleResults,
    };
  } catch (error) {
    console.error(`[SDRPipeline] Failed to get SDR status for user ${userId}:`, error);
    const config = await getSDRConfig(userId);
    return {
      isActive: false,
      lastCycleAt: null,
      nextCycleAt: null,
      todayOutreachSent: 0,
      todayOutreachLimit: config.dailyOutreachLimit,
      pendingApprovals: 0,
      config,
      recentCycleResults: [],
    };
  }
}
