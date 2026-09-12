// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Reply Handler & Meeting Scheduler
// Handles client email replies: match → analyze intent → update lead
// → orchestrate meeting → notify user → log activity
//
// Flow:
// 1. Match reply to a Lead by email address
// 2. Analyze reply intent using existing Z-AI infrastructure
// 3. Update Lead status/score based on intent
// 4. If meeting requested → orchestrate via existing meeting system
// 5. Send notifications (in-app + Telegram + WhatsApp)
// 6. Create LeadActivity record
//
// Uses:
// - executeAICompletion from ai-provider (Z-AI infrastructure)
// - moveLeadToStage from pipeline-service
// - orchestrateMeetingFromReply from meetings/meeting-orchestration-service
// - sendNotification + sendTelegramNotification + sendWhatsAppNotification
//   from notification-engine
// - logAuditEvent from lead-audit
// - logAIAudit from ai/ai-audit
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { executeAICompletion, type AICompletionRequest } from '@/lib/ai/ai-provider';
import { logAIAudit } from '@/lib/ai/ai-audit';
import { moveLeadToStage } from '@/lib/pipeline-service';
import { orchestrateMeetingFromReply } from '@/lib/meetings/meeting-orchestration-service';
import {
  sendNotification,
  sendTelegramNotification,
  sendWhatsAppNotification,
} from '@/lib/notification-engine';
import { logAuditEvent } from '@/lib/lead-audit';

// ===== TYPES =====

/** Incoming email data from a client reply */
export interface EmailReplyData {
  from: string;
  subject: string;
  body: string;
  threadId?: string;
  messageId?: string;
}

/** Reply intent analysis result from Z-AI */
interface ReplyIntentAnalysis {
  intent: 'interested' | 'not_interested' | 'needs_more_info' | 'wants_meeting' | 'out_of_office';
  sentiment: 'positive' | 'neutral' | 'negative';
  meetingRequested: boolean;
  suggestedReplyTone: 'enthusiastic' | 'informative' | 'gentle_followup';
  keyPoints: string[];
}

/** The final result of processing a lead reply */
export interface ProcessLeadReplyResult {
  matched: boolean;
  leadId?: string;
  intent?: ReplyIntentAnalysis['intent'];
  sentiment?: ReplyIntentAnalysis['sentiment'];
  meetingTriggered?: boolean;
  error?: string;
}

// ===== CREDIT COST =====

const REPLY_ANALYSIS_CREDIT_COST = 1;

// ===== MAIN EXPORT =====

/**
 * Process an incoming email reply from a potential client.
 *
 * @param emailData - The email reply data (from, subject, body, thread/message IDs)
 * @param userId - The ID of the user who owns the leads
 * @returns ProcessLeadReplyResult with match status, intent, and meeting info
 */
export async function processLeadReply(
  emailData: EmailReplyData,
  userId: string
): Promise<ProcessLeadReplyResult> {
  console.log(`[ReplyHandler] Processing reply from: ${emailData.from}, userId=${userId}`);

  // ── STEP 1: Match reply to a Lead ─────────────────────────────────

  const lead = await db.lead.findFirst({
    where: {
      userId,
      email: emailData.from,
      isActive: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (!lead) {
    console.log(`[ReplyHandler] No matching lead found for email: ${emailData.from}`);
    return { matched: false };
  }

  console.log(`[ReplyHandler] Matched reply to lead: ${lead.businessName} (${lead.id})`);

  // ── STEP 2: Analyze reply intent using existing Z-AI ──────────────

  const analysisResult = await analyzeReplyIntent(emailData, userId);

  if (!analysisResult) {
    // AI analysis failed — use heuristic fallback
    console.warn('[ReplyHandler] AI analysis failed, using heuristic fallback');
  }

  const intent = analysisResult?.intent || heuristicIntent(emailData);
  const sentiment = analysisResult?.sentiment || heuristicSentiment(emailData);
  const meetingRequested = analysisResult?.meetingRequested ?? false;
  const suggestedReplyTone = analysisResult?.suggestedReplyTone || 'informative';
  const keyPoints = analysisResult?.keyPoints || [];

  console.log(`[ReplyHandler] Intent: ${intent}, Sentiment: ${sentiment}, Meeting: ${meetingRequested}`);

  // ── STEP 3: Update Lead based on intent ────────────────────────────

  let meetingTriggered = false;

  switch (intent) {
    case 'interested':
    case 'wants_meeting': {
      // Set status, bump score, move pipeline stage
      const newScore = Math.min(100, lead.replyScore + 20);

      await db.lead.update({
        where: { id: lead.id },
        data: {
          stage: 'replied_positive',
          replyScore: newScore,
          emailStatus: 'replied',
          lastContactedAt: new Date(),
        },
      });

      // Move to next pipeline stage
      await moveLeadToStage(lead.id, 'replied', userId);

      console.log(`[ReplyHandler] Lead ${lead.id} → replied_positive, score +20 → ${newScore}`);
      break;
    }

    case 'not_interested': {
      await db.lead.update({
        where: { id: lead.id },
        data: {
          stage: 'replied_negative',
          emailStatus: 'replied',
          lastContactedAt: new Date(),
        },
      });

      console.log(`[ReplyHandler] Lead ${lead.id} → replied_negative`);
      break;
    }

    case 'needs_more_info': {
      await db.lead.update({
        where: { id: lead.id },
        data: {
          stage: 'replied_neutral',
          emailStatus: 'replied',
          lastContactedAt: new Date(),
        },
      });

      console.log(`[ReplyHandler] Lead ${lead.id} → replied_neutral`);
      break;
    }

    case 'out_of_office': {
      // Set status to awaiting_reply and schedule follow-up for 7 days later
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + 7);

      await db.lead.update({
        where: { id: lead.id },
        data: {
          stage: 'awaiting_reply',
          followUpAt: followUpDate,
          lastContactedAt: new Date(),
        },
      });

      // Create FollowUpReminder for 7 days later
      await db.followUpReminder.create({
        data: {
          leadId: lead.id,
          message: `Follow up with ${lead.businessName} — out-of-office auto-reply received on ${new Date().toLocaleDateString()}. Original subject: "${emailData.subject}"`,
          dueAt: followUpDate,
          completed: false,
        },
      });

      console.log(`[ReplyHandler] Lead ${lead.id} → awaiting_reply, follow-up in 7 days`);
      break;
    }
  }

  // ── STEP 4: Orchestrate meeting if requested ───────────────────────

  if (intent === 'wants_meeting' || meetingRequested) {
    try {
      console.log(`[ReplyHandler] Meeting requested for lead ${lead.id} — orchestrating`);

      const meetingResult = await orchestrateMeetingFromReply(userId, lead.id, {
        meetingRecommended: true,
        sentiment,
        leadId: lead.id,
      });

      meetingTriggered = true;
      console.log(`[ReplyHandler] Meeting orchestrated: id=${meetingResult.meetingId}, url=${meetingResult.meetingUrl || 'none'}`);

      // Update lead with meeting reference
      const currentMetadata = lead.techStack ? JSON.parse(lead.techStack) as Record<string, unknown> : {};
      await db.lead.update({
        where: { id: lead.id },
        data: {
          techStack: JSON.stringify({
            ...currentMetadata,
            lastMeetingOrchestrated: {
              meetingId: meetingResult.meetingId,
              calendarEventId: meetingResult.calendarEventId,
              meetingUrl: meetingResult.meetingUrl,
              orchestratedAt: new Date().toISOString(),
              triggerIntent: intent,
            },
          }),
        },
      });
    } catch (meetingError) {
      console.error('[ReplyHandler] Meeting orchestration failed:', meetingError);
      // Don't fail the whole process — meeting is a nice-to-have
    }
  }

  // ── STEP 5: Send notifications to user ─────────────────────────────

  const notificationTitle = `${lead.businessName} replied to your outreach`;
  const notificationMessage = `${lead.businessName} replied — intent: ${intent}, sentiment: ${sentiment}${meetingTriggered ? '. A meeting has been scheduled!' : ''}`;

  // 5a. In-app notification
  try {
    await sendNotification({
      userId,
      type: 'lead_stage_moved',
      title: notificationTitle,
      message: notificationMessage,
      actionUrl: `/leads/${lead.id}`,
      metadata: {
        leadId: lead.id,
        intent,
        sentiment,
        meetingTriggered,
        from: emailData.from,
      },
    });
    console.log(`[ReplyHandler] In-app notification sent to user ${userId}`);
  } catch (notifErr) {
    console.error('[ReplyHandler] In-app notification failed:', notifErr);
  }

  // 5b. Telegram notification (if connected)
  try {
    const telegramConfig = await db.telegramConfig.findUnique({
      where: { userId },
      select: { isConnected: true, chatId: true, isPaused: true },
    });

    if (telegramConfig?.isConnected && telegramConfig.chatId && !telegramConfig.isPaused) {
      await sendTelegramNotification(userId, {
        title: notificationTitle,
        message: notificationMessage,
        type: 'lead_stage_moved',
      });
      console.log(`[ReplyHandler] Telegram notification sent to user ${userId}`);
    }
  } catch (telegramErr) {
    console.error('[ReplyHandler] Telegram notification failed:', telegramErr);
  }

  // 5c. WhatsApp notification (if connected via Twilio)
  try {
    const whatsappConfig = await db.whatsappConfig.findUnique({
      where: { userId },
      select: { isConnected: true, isPaused: true, provider: true },
    });

    if (whatsappConfig?.isConnected && !whatsappConfig.isPaused) {
      await sendWhatsAppNotification(userId, {
        title: notificationTitle,
        message: notificationMessage,
        type: 'lead_stage_moved',
      });
      console.log(`[ReplyHandler] WhatsApp notification sent to user ${userId}`);
    }
  } catch (whatsappErr) {
    console.error('[ReplyHandler] WhatsApp notification failed:', whatsappErr);
  }

  // ── STEP 6: Create LeadActivity ────────────────────────────────────

  try {
    await db.leadActivity.create({
      data: {
        leadId: lead.id,
        type: 'reply_received',
        description: `${intent} — ${sentiment} sentiment. ${keyPoints.length > 0 ? `Key points: ${keyPoints.join('; ')}` : 'No key points extracted.'}`,
        metadata: JSON.stringify({
          intent,
          sentiment,
          meetingRequested,
          meetingTriggered,
          suggestedReplyTone,
          keyPoints,
          emailFrom: emailData.from,
          emailSubject: emailData.subject,
          emailBodyPreview: emailData.body.substring(0, 200),
          threadId: emailData.threadId || null,
          messageId: emailData.messageId || null,
        }),
      },
    });
    console.log(`[ReplyHandler] LeadActivity created for lead ${lead.id}`);
  } catch (activityErr) {
    console.error('[ReplyHandler] Failed to create LeadActivity:', activityErr);
  }

  // ── AUDIT LOGS ─────────────────────────────────────────────────────

  await logAuditEvent(userId, 'reply_processed', {
    leadId: lead.id,
    leadName: lead.businessName,
    intent,
    sentiment,
    meetingTriggered,
    emailFrom: emailData.from,
  });

  await logAIAudit({
    userId,
    action: 'ai_analysis_generated',
    resource: 'lead',
    resourceId: lead.id,
    details: {
      type: 'reply_intent_analysis',
      intent,
      sentiment,
      meetingRequested,
      suggestedReplyTone,
      keyPointsCount: keyPoints.length,
    },
  });

  // ── RETURN ─────────────────────────────────────────────────────────

  return {
    matched: true,
    leadId: lead.id,
    intent,
    sentiment,
    meetingTriggered,
  };
}

// ═══════════════════════════════════════════════════════════════════
// AI INTENT ANALYSIS
// ═══════════════════════════════════════════════════════════════════

/**
 * Analyze reply intent using existing Z-AI infrastructure.
 * Returns parsed intent analysis or null on failure.
 */
async function analyzeReplyIntent(
  emailData: EmailReplyData,
  userId: string
): Promise<ReplyIntentAnalysis | null> {
  const prompt = `Analyze this email reply from a potential client.
Reply: ${emailData.body}

Return ONLY JSON:
{
  "intent": "interested"|"not_interested"|"needs_more_info"|"wants_meeting"|"out_of_office",
  "sentiment": "positive"|"neutral"|"negative",
  "meetingRequested": boolean,
  "suggestedReplyTone": "enthusiastic"|"informative"|"gentle_followup",
  "keyPoints": string[]
}`;

  const request: AICompletionRequest = {
    messages: [
      {
        role: 'system',
        content:
          'You are an email reply analyzer for a sales pipeline. Analyze intent, sentiment, and meeting signals. Always return valid JSON. No markdown formatting.',
      },
      { role: 'user', content: prompt },
    ],
    config: {
      provider: 'z-ai' as const,
      maxTokens: 1024,
      temperature: 0.3,
      timeout: 30000,
      retries: 2,
    },
  };

  try {
    const aiResult = await executeAICompletion(request, userId, 'deep_analysis');

    if (!aiResult.success || !aiResult.content) {
      console.error(`[ReplyHandler] AI analysis failed: ${aiResult.error}`);
      return null;
    }

    // Parse the JSON response
    return parseIntentAnalysis(aiResult.content);
  } catch (error) {
    console.error('[ReplyHandler] AI analysis exception:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// AI RESPONSE PARSER
// ═══════════════════════════════════════════════════════════════════

/**
 * Parse AI response into ReplyIntentAnalysis.
 * Handles markdown-wrapped JSON gracefully.
 */
function parseIntentAnalysis(content: string): ReplyIntentAnalysis | null {
  // Clean markdown wrapping if present
  let cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  // Try to extract JSON from the response
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[ReplyHandler] No JSON object found in AI response');
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    // Validate and normalize intent
    const validIntents: ReplyIntentAnalysis['intent'][] = [
      'interested',
      'not_interested',
      'needs_more_info',
      'wants_meeting',
      'out_of_office',
    ];
    const intent = validIntents.includes(parsed.intent as ReplyIntentAnalysis['intent'])
      ? (parsed.intent as ReplyIntentAnalysis['intent'])
      : 'needs_more_info';

    // Validate and normalize sentiment
    const validSentiments: ReplyIntentAnalysis['sentiment'][] = [
      'positive',
      'neutral',
      'negative',
    ];
    const sentiment = validSentiments.includes(parsed.sentiment as ReplyIntentAnalysis['sentiment'])
      ? (parsed.sentiment as ReplyIntentAnalysis['sentiment'])
      : 'neutral';

    // Validate meetingRequested
    const meetingRequested = typeof parsed.meetingRequested === 'boolean'
      ? parsed.meetingRequested
      : intent === 'wants_meeting';

    // Validate suggestedReplyTone
    const validTones: ReplyIntentAnalysis['suggestedReplyTone'][] = [
      'enthusiastic',
      'informative',
      'gentle_followup',
    ];
    const suggestedReplyTone = validTones.includes(parsed.suggestedReplyTone as ReplyIntentAnalysis['suggestedReplyTone'])
      ? (parsed.suggestedReplyTone as ReplyIntentAnalysis['suggestedReplyTone'])
      : 'informative';

    // Validate keyPoints
    const keyPoints = Array.isArray(parsed.keyPoints)
      ? parsed.keyPoints.filter((p: unknown) => typeof p === 'string').map(String)
      : [];

    return {
      intent,
      sentiment,
      meetingRequested,
      suggestedReplyTone,
      keyPoints,
    };
  } catch (parseError) {
    console.error('[ReplyHandler] JSON parse failed:', parseError);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// HEURISTIC FALLBACKS (when AI fails)
// ═══════════════════════════════════════════════════════════════════

/**
 * Simple keyword-based intent detection when AI is unavailable.
 */
function heuristicIntent(emailData: EmailReplyData): ReplyIntentAnalysis['intent'] {
  const bodyLower = emailData.body.toLowerCase();
  const subjectLower = emailData.subject.toLowerCase();

  // Out-of-office detection (high confidence patterns)
  const oooPatterns = [
    'out of office',
    'out of the office',
    'auto-reply',
    'autoreply',
    'automatic reply',
    'i am away',
    'i will be away',
    'i\'m currently away',
    'on vacation',
    'on leave',
    'maternity leave',
  ];
  if (oooPatterns.some((p) => bodyLower.includes(p) || subjectLower.includes(p))) {
    return 'out_of_office';
  }

  // Meeting request detection
  const meetingPatterns = [
    'schedule a meeting',
    'set up a meeting',
    'book a call',
    'schedule a call',
    'let\'s meet',
    'let us meet',
    'can we meet',
    'available for a call',
    'free for a chat',
    'hop on a call',
    'set up a time',
    'calendar invite',
    'book some time',
  ];
  if (meetingPatterns.some((p) => bodyLower.includes(p))) {
    return 'wants_meeting';
  }

  // Positive/interested detection
  const interestedPatterns = [
    'interested',
    'sounds good',
    'tell me more',
    'i\'d like to learn more',
    'i would like to know more',
    'let\'s discuss',
    'let us discuss',
    'love to hear more',
    'keen to explore',
    'looks promising',
    'this could work',
    'worth exploring',
  ];
  if (interestedPatterns.some((p) => bodyLower.includes(p))) {
    return 'interested';
  }

  // Not interested detection
  const notInterestedPatterns = [
    'not interested',
    'not looking for',
    'don\'t need',
    'do not need',
    'no thanks',
    'no thank you',
    'not right now',
    'not at this time',
    'unsubscribe',
    'remove me',
    'stop sending',
    'not a good fit',
    'no longer interested',
  ];
  if (notInterestedPatterns.some((p) => bodyLower.includes(p))) {
    return 'not_interested';
  }

  // Default — needs more info
  return 'needs_more_info';
}

/**
 * Simple sentiment detection when AI is unavailable.
 */
function heuristicSentiment(emailData: EmailReplyData): ReplyIntentAnalysis['sentiment'] {
  const bodyLower = emailData.body.toLowerCase();

  const positiveWords = [
    'great',
    'thanks',
    'thank you',
    'interested',
    'looking forward',
    'sounds good',
    'yes',
    'absolutely',
    'love',
    'excited',
    'awesome',
    'perfect',
  ];
  const negativeWords = [
    'no',
    'not interested',
    'unsubscribe',
    'stop',
    'annoying',
    'spam',
    'remove',
    'never',
    'waste',
    'bad',
    'terrible',
  ];

  let posScore = 0;
  let negScore = 0;

  for (const word of positiveWords) {
    if (bodyLower.includes(word)) posScore++;
  }
  for (const word of negativeWords) {
    if (bodyLower.includes(word)) negScore++;
  }

  if (posScore > negScore) return 'positive';
  if (negScore > posScore) return 'negative';
  return 'neutral';
}
