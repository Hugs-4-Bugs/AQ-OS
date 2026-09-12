// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Gmail Reply Processor Pipeline
// End-to-end processing of incoming Gmail replies to tracked outreach.
//
// Pipeline stages:
//   1. Poll Gmail inbox for new inbound messages
//   2. Match replies to existing OutreachMessage records
//   3. Classify reply sentiment/intent via reply-intelligence-service
//   4. Update lead stage based on classification
//   5. Fire workflow triggers on reply events
//   6. Store processed reply as ConversationMessage
//
// CRITICAL RULES:
// - NEVER fail entire batch on one reply error
// - ALWAYS use graceful error handling per-reply
// - ALWAYS deduplicate already-processed replies
// - Use db from '@/lib/db' for all database operations
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { getConnectedAccounts, getValidAccessToken } from '@/lib/gmail-oauth-service';
import { getThreads, getThreadMessages } from '@/lib/gmail-inbox-service';
import { classifyReply, processIncomingReply, type ClassifyReplyResult } from '@/lib/reply-intelligence-service';
import { evaluateTrigger } from '@/lib/workflow-triggers';
import { orchestrateMeetingFromReply, type ReplyAnalysis } from '@/lib/meetings/meeting-orchestration-service';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface ProcessRepliesResult {
  success: boolean;
  userId: string;
  processedCount: number;
  matchedCount: number;
  classifiedCount: number;
  stageUpdates: number;
  workflowsTriggered: number;
  errors: string[];
  durationMs: number;
  processedAt: Date;
}

export interface ReplyProcessResult {
  success: boolean;
  outreachMessageId: string;
  leadId: string | null;
  fromEmail: string;
  subject: string | null;
  classification: ClassifyReplyResult | null;
  stageUpdated: boolean;
  workflowTriggered: boolean;
  error?: string;
}

export interface PipelineStatus {
  userId: string;
  enabled: boolean;
  lastRunAt: Date | null;
  lastProcessedCount: number;
  lastErrorCount: number;
  totalProcessed: number;
  totalErrors: number;
  isRunning: boolean;
  runningSince: Date | null;
}

interface InboundMessage {
  threadId: string;
  gmailThreadId: string;
  fromEmail: string;
  toEmail: string;
  subject: string | null;
  bodyPlain: string | null;
  bodyHtml: string | null;
  createdAt: Date;
}

interface GmailApiMessage {
  id: string;
  threadId: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{ mimeType: string; body?: { data?: string } }>;
  };
  internalDate?: string;
  labelIds?: string[];
}

// ═══════════════════════════════════════════════════════════════════
// IN-MEMORY PIPELINE STATE
// ═══════════════════════════════════════════════════════════════════

const pipelineState = new Map<string, PipelineStatus>();
const runningLocks = new Set<string>();

// ═══════════════════════════════════════════════════════════════════
// MAIN PIPELINE: processNewReplies
// ═══════════════════════════════════════════════════════════════════

/**
 * Poll Gmail inbox for new replies to tracked outreach messages.
 * Matches each reply to an OutreachMessage, classifies it, updates
 * lead stage, and fires workflow triggers.
 */
export async function processNewReplies(userId: string): Promise<ProcessRepliesResult> {
  const startTime = Date.now();
  const result: ProcessRepliesResult = {
    success: true,
    userId,
    processedCount: 0,
    matchedCount: 0,
    classifiedCount: 0,
    stageUpdates: 0,
    workflowsTriggered: 0,
    errors: [],
    durationMs: 0,
    processedAt: new Date(),
  };

  // Prevent concurrent runs for the same user
  if (runningLocks.has(userId)) {
    result.errors.push('Reply processing already running for this user');
    return result;
  }
  runningLocks.add(userId);

  try {
    const state = getPipelineState(userId);
    state.isRunning = true;
    state.runningSince = new Date();

    // 1. Get connected Gmail accounts for this user
    const accounts = await getConnectedAccounts(userId);
    const activeAccounts = accounts.filter(a => a.isActive);

    if (activeAccounts.length === 0) {
      result.errors.push('No active Gmail accounts found');
      return result;
    }

    // 2. Get all outbound OutreachMessages that are awaiting replies
    const pendingOutreach = await db.outreachMessage.findMany({
      where: {
        userId,
        channel: 'email',
        status: { in: ['sent', 'delivered', 'opened'] },
        repliedAt: null,
      },
      include: {
        lead: {
          select: { id: true, email: true, businessName: true, stage: true },
        },
      },
      orderBy: { sentAt: 'desc' },
      take: 200,
    });

    if (pendingOutreach.length === 0) {
      console.log(`[ReplyProcessor] No pending outreach messages for user ${userId}`);
      return result;
    }

    // 3. For each active Gmail account, fetch inbound messages
    for (const account of activeAccounts) {
      try {
        const inboundMessages = await fetchInboundMessages(account.id);
        result.processedCount += inboundMessages.length;

        // 4. Match each inbound message to an OutreachMessage
        for (const msg of inboundMessages) {
          try {
            // Skip messages that are clearly auto-generated/system messages
            if (isSystemMessage(msg.fromEmail, msg.subject || '')) {
              continue;
            }

            const match = await matchReplyToOutreach(userId, pendingOutreach, msg);
            if (!match) continue;

            result.matchedCount++;

            // 5. Process the matched reply
            const processResult = await processReplyForMessage(
              match.id,
              match.leadId,
              userId,
              msg,
            );

            if (processResult.success) {
              result.classifiedCount++;
              if (processResult.stageUpdated) result.stageUpdates++;
              if (processResult.workflowTriggered) result.workflowsTriggered++;
            } else {
              result.errors.push(`Reply processing failed for ${msg.fromEmail}: ${processResult.error}`);
            }
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            result.errors.push(`Error processing reply from ${msg.fromEmail}: ${errMsg}`);
            console.error(`[ReplyProcessor] Error processing reply from ${msg.fromEmail}:`, error);
          }
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Error fetching inbox for account ${account.id}: ${errMsg}`);
        console.error(`[ReplyProcessor] Error fetching inbox for account ${account.id}:`, error);
      }
    }

    // 6. Update pipeline state
    state.lastRunAt = new Date();
    state.lastProcessedCount = result.matchedCount;
    state.lastErrorCount = result.errors.length;
    state.totalProcessed += result.matchedCount;
    state.totalErrors += result.errors.length;

    result.durationMs = Date.now() - startTime;
    result.success = result.errors.length === 0 || result.matchedCount > 0;

    console.log(`[ReplyProcessor] Complete for user ${userId}: ${result.matchedCount} matched, ${result.classifiedCount} classified, ${result.errors.length} errors in ${result.durationMs}ms`);

    return result;
  } catch (error) {
    result.success = false;
    result.errors.push(`Pipeline error: ${error instanceof Error ? error.message : String(error)}`);
    console.error('[ReplyProcessor] Pipeline error:', error);
    return result;
  } finally {
    const state = getPipelineState(userId);
    state.isRunning = false;
    state.runningSince = null;
    runningLocks.delete(userId);
  }
}

// ═══════════════════════════════════════════════════════════════════
// PROCESS SINGLE REPLY: processReplyForMessage
// ═══════════════════════════════════════════════════════════════════

/**
 * Process a single matched reply:
 *   1. Update OutreachMessage status to 'replied'
 *   2. Extract reply content, sender, subject
 *   3. Classify via reply-intelligence-service
 *   4. Update lead stage based on classification
 *   5. Fire workflow triggers
 *   6. Store as ConversationMessage
 */
async function processReplyForMessage(
  outreachMessageId: string,
  leadId: string | null,
  userId: string,
  msg: InboundMessage,
): Promise<ReplyProcessResult> {
  const result: ReplyProcessResult = {
    success: false,
    outreachMessageId,
    leadId,
    fromEmail: msg.fromEmail,
    subject: msg.subject,
    classification: null,
    stageUpdated: false,
    workflowTriggered: false,
  };

  try {
    // 1. Update OutreachMessage status to 'replied'
    await db.outreachMessage.update({
      where: { id: outreachMessageId },
      data: { status: 'replied', repliedAt: new Date() },
    });

    // 2. Extract reply content
    const replyContent = extractReplyContent(msg.bodyPlain || msg.bodyHtml || '');

    if (!replyContent.trim()) {
      result.error = 'Empty reply content — skipping classification';
      return result;
    }

    // 3. Classify the reply
    const classifyResult = await classifyReply({
      userId,
      leadId: leadId || undefined,
      emailContent: replyContent,
      emailSubject: msg.subject || undefined,
      fromEmail: msg.fromEmail,
    });
    result.classification = classifyResult;

    // 4. Update lead stage based on classification
    if (leadId) {
      const stageUpdated = await updateLeadFromClassification(leadId, userId, classifyResult);
      result.stageUpdated = stageUpdated;
    }

    // 5. Fire 'lead_reply' workflow trigger
    if (leadId) {
      try {
        const executionIds = await evaluateTrigger(
          'lead_reply',
          {
            leadId,
            replyType: classifyResult.intent,
            channelId: 'email',
          },
          userId,
        );
        result.workflowTriggered = executionIds.length > 0;
      } catch (error) {
        console.error('[ReplyProcessor] Workflow trigger error (non-blocking):', error);
      }
    }

    // 6. Store as Communication record (the ConversationMessage is already
    //    created inside classifyReply/processIncomingReply — we also
    //    create a Communication for the lead timeline)
    if (leadId) {
      await db.communication.create({
        data: {
          leadId,
          channel: 'email',
          direction: 'inbound',
          content: replyContent.substring(0, 5000),
          intent: classifyResult.intent,
          buyingSignals: JSON.stringify(classifyResult.buyingSignals),
        },
      });

      // Log lead activity
      await db.leadActivity.create({
        data: {
          leadId,
          type: 'reply_received',
          description: `Reply received from ${msg.fromEmail}: ${classifyResult.sentiment}/${classifyResult.intent}, urgency=${classifyResult.urgency}`,
          metadata: JSON.stringify({
            outreachMessageId,
            classificationId: classifyResult.id,
            sentiment: classifyResult.sentiment,
            intent: classifyResult.intent,
            urgency: classifyResult.urgency,
            fromEmail: msg.fromEmail,
          }),
        },
      });
    }

    result.success = true;
    console.log(`[ReplyProcessor] Processed reply from ${msg.fromEmail} for outreach ${outreachMessageId}: ${classifyResult.sentiment}/${classifyResult.intent}`);

    // ── Phase 3: Wire meeting orchestration into reply processing ──
    // If the classification recommends a meeting, trigger orchestration.
    // This is a non-blocking async call — reply processing still completes.
    const meetingRecommended =
      classifyResult.recommendedAction === 'schedule_meeting' ||
      classifyResult.intent === 'meeting_request';

    if (meetingRecommended && leadId) {
      const replyAnalysis: ReplyAnalysis = {
        meetingRecommended: true,
        intent: classifyResult.intent,
        sentiment: classifyResult.sentiment,
        confidence: classifyResult.confidence,
        urgency: classifyResult.urgency,
        suggestedReply: classifyResult.suggestedReply,
        buyingSignals: classifyResult.buyingSignals,
        fromEmail: msg.fromEmail,
        emailContent: replyContent,
        classification: classifyResult,
      };

      orchestrateMeetingFromReply(userId, leadId, replyAnalysis)
        .then((orchResult) => {
          if (orchResult.success) {
            console.log(`[ReplyProcessor] Meeting orchestration: mode=${orchResult.context.autonomyMode}, status=${orchResult.context.status}, meetingId=${orchResult.meetingId || 'pending'}`);
          } else {
            console.error(`[ReplyProcessor] Meeting orchestration failed: ${orchResult.error}`);
          }
        })
        .catch((err) => {
          console.error('[ReplyProcessor] Meeting orchestration error (non-blocking):', err);
        });
    }

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.error(`[ReplyProcessor] Failed to process reply for outreach ${outreachMessageId}:`, error);
    return result;
  }
}

// ═══════════════════════════════════════════════════════════════════
// MATCHING: matchReplyToOutreach
// ═══════════════════════════════════════════════════════════════════

/**
 * Match an incoming Gmail reply to an existing OutreachMessage.
 *
 * Matching strategy:
 *   1. Subject contains "Re:" prefix + original outreach subject (fuzzy)
 *   2. From email matches lead email
 *   3. If multiple matches, pick the most recent sent
 */
async function matchReplyToOutreach(
  userId: string,
  pendingOutreach: Array<{
    id: string;
    leadId: string;
    subject: string | null;
    lead: { id: string; email: string | null; businessName: string; stage: string };
    sentAt: Date | null;
  }>,
  gmailMessage: InboundMessage,
): Promise<typeof pendingOutreach[number] | null> {
  const replySubject = normalizeSubject(gmailMessage.subject || '');
  const replyFrom = extractEmailAddress(gmailMessage.fromEmail);
  const candidates: Array<{ outreach: typeof pendingOutreach[number]; score: number }> = [];

  for (const outreach of pendingOutreach) {
    let score = 0;
    const outreachSubject = normalizeSubject(outreach.subject || '');

    // Subject matching: check if reply subject relates to outreach subject
    if (outreachSubject && replySubject) {
      // Remove Re:, Fwd:, etc. prefixes for comparison
      const cleanOutreach = stripReplyPrefix(outreachSubject);
      const cleanReply = stripReplyPrefix(replySubject);

      if (cleanOutreach && cleanReply) {
        // Exact match
        if (cleanOutreach === cleanReply) {
          score += 50;
        }
        // One contains the other
        else if (cleanReply.includes(cleanOutreach) || cleanOutreach.includes(cleanReply)) {
          score += 40;
        }
        // Fuzzy similarity: check for significant word overlap
        else {
          const similarity = computeWordSimilarity(cleanOutreach, cleanReply);
          score += Math.round(similarity * 30);
        }
      }

      // Bonus for "Re:" prefix
      if (replySubject.toLowerCase().startsWith('re:')) {
        score += 10;
      }
    }

    // Email matching: from email matches lead email
    if (outreach.lead.email && replyFrom) {
      const leadEmail = extractEmailAddress(outreach.lead.email);
      if (leadEmail && leadEmail.toLowerCase() === replyFrom.toLowerCase()) {
        score += 30;
      }
    }

    // Recency bonus: more recent outreach gets a small bonus
    if (outreach.sentAt) {
      const ageHours = (Date.now() - outreach.sentAt.getTime()) / (1000 * 60 * 60);
      if (ageHours < 24) score += 5;
      else if (ageHours < 72) score += 3;
      else if (ageHours < 168) score += 1;
    }

    if (score >= 50) {
      candidates.push({ outreach, score });
    }
  }

  if (candidates.length === 0) return null;

  // Sort by score descending, then by sentAt descending
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aTime = a.outreach.sentAt?.getTime() || 0;
    const bTime = b.outreach.sentAt?.getTime() || 0;
    return bTime - aTime;
  });

  return candidates[0].outreach;
}

// ═══════════════════════════════════════════════════════════════════
// LEAD STAGE UPDATE
// ═══════════════════════════════════════════════════════════════════

/**
 * Update lead stage based on reply classification.
 * Only advances the lead — never moves backwards unless very negative.
 */
async function updateLeadFromClassification(
  leadId: string,
  userId: string,
  classification: ClassifyReplyResult,
): Promise<boolean> {
  try {
    const lead = await db.lead.findUnique({
      where: { id: leadId },
      select: { stage: true },
    });
    if (!lead) return false;

    const stageProgression: Record<string, number> = {
      'discovered': 0,
      'reached_out': 1,
      'replied': 2,
      'interested': 3,
      'meeting_scheduled': 4,
      'proposal_sent': 5,
      'negotiation': 6,
      'closed_won': 7,
      'closed_lost': -1,
    };

    const currentLevel = stageProgression[lead.stage] ?? 0;
    let newStage: string | null = null;

    // Positive sentiment + buying signals → move to 'replied' or 'interested'
    const signalCount = countBuyingSignals(classification.buyingSignals);
    const isPositive = classification.sentiment === 'positive' || classification.sentiment === 'enthusiastic';

    if (isPositive && signalCount >= 2) {
      newStage = 'interested';
    } else if (isPositive && currentLevel < 2) {
      newStage = 'replied';
    }

    // Meeting request intent → trigger meeting workflow (stage stays or goes to meeting_scheduled)
    if (classification.intent === 'meeting_request') {
      newStage = 'meeting_scheduled';
    }

    // Pricing question or negotiation → interested or proposal_sent
    if (classification.intent === 'pricing_question' || classification.intent === 'negotiation') {
      if (currentLevel < 3) newStage = 'interested';
    }

    // Not interested → only close if very negative
    if (classification.intent === 'not_interested' || classification.intent === 'unsubscribe_request') {
      if (classification.sentiment === 'frustrated' || classification.sentiment === 'negative') {
        newStage = 'closed_lost';
      }
    }

    // Only update if we have a new stage and it's a progression (or closing)
    if (newStage && newStage !== lead.stage) {
      const newLevel = stageProgression[newStage] ?? 0;
      // Allow any forward progression, or closing as lost
      if (newLevel > currentLevel || newStage === 'closed_lost') {
        await db.lead.update({
          where: { id: leadId },
          data: {
            stage: newStage,
            lastContactedAt: new Date(),
            emailStatus: 'replied',
            replyScore: Math.min(100, classification.confidence * 100 + signalCount * 10),
          },
        });
        return true;
      }
    } else if (!newStage && lead.stage === 'discovered' || lead.stage === 'reached_out') {
      // At minimum, update to 'replied' for any non-negative reply
      await db.lead.update({
        where: { id: leadId },
        data: {
          lastContactedAt: new Date(),
          emailStatus: 'replied',
        },
      });
      return true;
    }

    return false;
  } catch (error) {
    console.error('[ReplyProcessor] Failed to update lead stage:', error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// PIPELINE STATUS & CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Get the current reply processing pipeline status for a user.
 */
export async function getReplyPipelineStatus(userId: string): Promise<PipelineStatus> {
  // First check in-memory state
  const memState = pipelineState.get(userId);
  if (memState) return memState;

  // Fall back to DB-stored state
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { preferencesJson: true },
  });

  let prefs: { replyProcessing?: { enabled?: boolean; lastRunAt?: string; totalProcessed?: number; totalErrors?: number } } = {};
  if (user?.preferencesJson) {
    try { prefs = JSON.parse(user.preferencesJson); } catch { /* ignore */ }
  }

  const replyPrefs = prefs.replyProcessing || {};
  return {
    userId,
    enabled: replyPrefs.enabled ?? true,
    lastRunAt: replyPrefs.lastRunAt ? new Date(replyPrefs.lastRunAt) : null,
    lastProcessedCount: 0,
    lastErrorCount: 0,
    totalProcessed: replyPrefs.totalProcessed || 0,
    totalErrors: replyPrefs.totalErrors || 0,
    isRunning: false,
    runningSince: null,
  };
}

/**
 * Enable reply processing for a user.
 */
export async function enableReplyProcessing(userId: string): Promise<void> {
  const state = getPipelineState(userId);
  state.enabled = true;
  await persistPipelinePrefs(userId, state);
  console.log(`[ReplyProcessor] Enabled for user ${userId}`);
}

/**
 * Disable reply processing for a user.
 */
export async function disableReplyProcessing(userId: string): Promise<void> {
  const state = getPipelineState(userId);
  state.enabled = false;
  await persistPipelinePrefs(userId, state);
  console.log(`[ReplyProcessor] Disabled for user ${userId}`);
}

// ═══════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Fetch all inbound (non-user) messages from Gmail via the local DB.
 * We query EmailThread records synced by gmail-inbox-service.
 */
async function fetchInboundMessages(emailAccountId: string): Promise<InboundMessage[]> {
  try {
    // Get the account's email to determine direction
    const account = await db.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { gmailEmail: true, userId: true },
    });
    if (!account) return [];

    const userThreads = await getThreads(emailAccountId, { limit: 100 });

    const messages: InboundMessage[] = [];

    for (const thread of userThreads.threads) {
      try {
        const threadMessages = await getThreadMessages(thread.id);
        for (const msg of threadMessages) {
          // Only process inbound messages (not sent by the user)
          if (msg.direction === 'inbound' && !msg.fromEmail.includes(account.gmailEmail)) {
            messages.push({
              threadId: thread.id,
              gmailThreadId: thread.gmailThreadId,
              fromEmail: msg.fromEmail,
              toEmail: msg.toEmail,
              subject: msg.subject,
              bodyPlain: msg.bodyPlain,
              bodyHtml: msg.bodyHtml,
              createdAt: msg.createdAt,
            });
          }
        }
      } catch (error) {
        console.error(`[ReplyProcessor] Error fetching messages for thread ${thread.id}:`, error);
      }
    }

    return messages;
  } catch (error) {
    console.error(`[ReplyProcessor] Error fetching inbound messages for account ${emailAccountId}:`, error);
    return [];
  }
}

/**
 * Get or create in-memory pipeline state for a user.
 */
function getPipelineState(userId: string): PipelineStatus {
  let state = pipelineState.get(userId);
  if (!state) {
    state = {
      userId,
      enabled: true,
      lastRunAt: null,
      lastProcessedCount: 0,
      lastErrorCount: 0,
      totalProcessed: 0,
      totalErrors: 0,
      isRunning: false,
      runningSince: null,
    };
    pipelineState.set(userId, state);
  }
  return state;
}

/**
 * Persist pipeline preferences to the user's preferencesJson.
 */
async function persistPipelinePrefs(userId: string, state: PipelineStatus): Promise<void> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { preferencesJson: true },
    });
    let prefs: Record<string, unknown> = {};
    if (user?.preferencesJson) {
      try { prefs = JSON.parse(user.preferencesJson); } catch { /* ignore */ }
    }

    prefs.replyProcessing = {
      enabled: state.enabled,
      lastRunAt: state.lastRunAt?.toISOString(),
      totalProcessed: state.totalProcessed,
      totalErrors: state.totalErrors,
    };

    await db.user.update({
      where: { id: userId },
      data: { preferencesJson: JSON.stringify(prefs) },
    });
  } catch (error) {
    console.error('[ReplyProcessor] Failed to persist pipeline prefs:', error);
  }
}

/**
 * Normalize a subject line for comparison.
 */
function normalizeSubject(subject: string): string {
  return subject.trim().toLowerCase();
}

/**
 * Strip "Re:", "Fwd:", "RE:" etc. prefixes from a subject.
 */
function stripReplyPrefix(subject: string): string {
  return subject
    .replace(/^(re|fwd|fw)\s*:\s*/gi, '')
    .replace(/\[(\d+)\]\s*/g, '')
    .trim();
}

/**
 * Extract email address from a potentially formatted "Name <email>" string.
 */
function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  if (match) return match[1].trim().toLowerCase();
  return raw.trim().toLowerCase();
}

/**
 * Compute word-level similarity between two strings (0-1).
 */
function computeWordSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Count active buying signals from a classification result.
 */
function countBuyingSignals(signals: { [key: string]: boolean }): number {
  return Object.values(signals).filter(Boolean).length;
}

/**
 * Extract the actual reply content, stripping quoted original text.
 */
function extractReplyContent(raw: string): string {
  if (!raw) return '';

  // Strip HTML tags if HTML content
  let content = raw;
  if (content.includes('<') && content.includes('>')) {
    content = content
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  // Remove common quoted reply markers
  const lines = content.split('\n');
  const replyLines: string[] = [];
  let hitQuotedSection = false;

  for (const line of lines) {
    // Detect start of quoted section
    if (/^>{1,3}\s/.test(line.trim()) || /^On .+ wrote:$/.test(line.trim())) {
      hitQuotedSection = true;
      break;
    }
    // Detect "-----Original Message-----" separator
    if (line.includes('-----Original Message') || line.includes('—')) {
      hitQuotedSection = true;
      break;
    }
    // Detect "From:" header in quoted section
    if (/^From:\s*/.test(line.trim()) && replyLines.length > 3) {
      hitQuotedSection = true;
      break;
    }

    replyLines.push(line);
  }

  const extracted = replyLines
    .map(l => l.replace(/^>\s?/, '').trim())
    .filter(l => l.length > 0)
    .join('\n')
    .trim();

  // If we got nothing (all was quoted), return everything
  return extracted.length > 10 ? extracted : content.trim();
}

/**
 * Check if a message is a system-generated message that should be skipped.
 */
function isSystemMessage(fromEmail: string, subject: string): boolean {
  const systemPatterns = [
    'noreply@', 'no-reply@', 'mailer-daemon@', 'postmaster@',
    'mail.google.com', 'gmail.com', 'google.com',
  ];
  const fromLower = fromEmail.toLowerCase();

  for (const pattern of systemPatterns) {
    if (fromLower.includes(pattern)) return true;
  }

  // Skip delivery status notifications
  if (subject.toLowerCase().includes('delivery status notification')) return true;
  if (subject.toLowerCase().includes('mail delivery')) return true;

  return false;
}
