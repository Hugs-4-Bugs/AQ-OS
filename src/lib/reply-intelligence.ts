// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Reply Intelligence Service
// Phase 4: AI-powered reply analysis, intent classification,
// buying signal detection, and recommended actions
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

// ===== TYPES =====

export interface ReplyAnalysis {
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  intent: 'interested' | 'not_interested' | 'need_more_info' | 'objection' | 'meeting_request' | 'unsubscribe' | 'spam' | 'out_of_office' | 'referral' | 'neutral';
  buyingSignals: string[];
  objections: string[];
  urgency: 'low' | 'medium' | 'high' | 'critical';
  recommendedAction: string;
  leadQualification: 'hot' | 'warm' | 'cold';
  shouldAutoRespond: boolean;
  suggestedResponse?: string;
}

export type IntentClassification = Pick<ReplyAnalysis, 'intent' | 'sentiment'>;

// ===== REPLY INTELLIGENCE SERVICE =====

export class ReplyIntelligenceService {
  /**
   * Analyze a reply message in full detail.
   * Uses LLM to extract sentiment, intent, buying signals, objections,
   * urgency, recommended actions, and lead qualification.
   */
  async analyzeReply(messageId: string, messageContent: string, leadContext?: Record<string, unknown>): Promise<ReplyAnalysis> {
    try {
      const zai = await ZAI.create();

      const contextStr = leadContext
        ? `\n\nLEAD CONTEXT:\n${JSON.stringify(leadContext, null, 2)}`
        : '';

      const prompt = `You are an expert sales reply analyst. Analyze the following reply message and return a JSON object with these exact fields:

{
  "sentiment": "positive" | "neutral" | "negative" | "mixed",
  "intent": "interested" | "not_interested" | "need_more_info" | "objection" | "meeting_request" | "unsubscribe" | "spam" | "out_of_office" | "referral" | "neutral",
  "buyingSignals": ["signal1", "signal2", ...],
  "objections": ["objection1", "objection2", ...],
  "urgency": "low" | "medium" | "high" | "critical",
  "recommendedAction": "description of what to do next",
  "leadQualification": "hot" | "warm" | "cold",
  "shouldAutoRespond": true | false,
  "suggestedResponse": "optional suggested reply text"
}

MESSAGE ID: ${messageId}
MESSAGE CONTENT:
${messageContent}
${contextStr}

Rules:
- sentiment: Overall emotional tone of the reply
- intent: The primary intention behind the reply
- buyingSignals: Any indicators the prospect is interested (questions about pricing, timeline mentions, asking for demos, etc.)
- objections: Any concerns, hesitations, or pushback mentioned
- urgency: How quickly they need a response (critical = time-sensitive, meeting scheduled soon, etc.)
- recommendedAction: What the sales team should do next
- leadQualification: hot = ready to buy/meet, warm = interested but needs nurturing, cold = not interested/unlikely
- shouldAutoRespond: true only for out_of_office, spam, or simple acknowledgments
- suggestedResponse: Only provide if shouldAutoRespond is true or intent is interested/need_more_info

Return ONLY valid JSON. No markdown, no explanations.`;

      const response = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a precise sales intelligence assistant. Return only valid JSON. No markdown, no explanations.' },
          { role: 'user', content: prompt },
        ],
        model: 'auto',
      });

      const content = response.choices?.[0]?.message?.content || '{}';

      let cleaned = content.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(cleaned);

      // Validate and normalize the response
      return normalizeAnalysis(parsed);
    } catch (error) {
      console.error('[ReplyIntelligence] Analysis failed:', error);
      // Return a safe default analysis
      return {
        sentiment: 'neutral',
        intent: 'neutral',
        buyingSignals: [],
        objections: [],
        urgency: 'low',
        recommendedAction: 'Review the reply manually',
        leadQualification: 'cold',
        shouldAutoRespond: false,
      };
    }
  }

  /**
   * Lightweight intent classification only (no full analysis).
   * Useful for quick routing and triage.
   */
  async classifyIntent(messageContent: string): Promise<IntentClassification> {
    try {
      const zai = await ZAI.create();

      const prompt = `Classify the intent and sentiment of this reply. Return JSON:
{
  "intent": "interested" | "not_interested" | "need_more_info" | "objection" | "meeting_request" | "unsubscribe" | "spam" | "out_of_office" | "referral" | "neutral",
  "sentiment": "positive" | "neutral" | "negative" | "mixed"
}

REPLY:
${messageContent}

Return ONLY valid JSON.`;

      const response = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a precise intent classifier. Return only valid JSON.' },
          { role: 'user', content: prompt },
        ],
        model: 'auto',
      });

      const content = response.choices?.[0]?.message?.content || '{}';

      let cleaned = content.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(cleaned);

      return {
        intent: VALID_INTENTS.includes(parsed.intent) ? parsed.intent : 'neutral',
        sentiment: VALID_SENTIMENTS.includes(parsed.sentiment) ? parsed.sentiment : 'neutral',
      };
    } catch (error) {
      console.error('[ReplyIntelligence] Intent classification failed:', error);
      return { intent: 'neutral', sentiment: 'neutral' };
    }
  }

  /**
   * Process a reply end-to-end: analyze + trigger workflows.
   * - Analyzes the reply
   * - Updates lead scores based on analysis
   * - Creates notifications for important replies
   * - Updates lead stage if appropriate
   * - Records the conversation message with analysis metadata
   */
  async processReply(messageId: string, leadId: string, messageContent: string): Promise<{
    analysis: ReplyAnalysis;
    actions: string[];
  }> {
    const actions: string[] = [];

    try {
      // Fetch lead context
      const lead = await db.lead.findUnique({
        where: { id: leadId },
        include: {
          outreachMessages: {
            where: { direction: 'outbound', status: 'replied' },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });

      const leadContext = lead ? {
        businessName: lead.businessName,
        stage: lead.stage,
        emailStatus: lead.emailStatus,
        replyScore: lead.replyScore,
        conversionScore: lead.conversionScore,
        urgencyScore: lead.urgencyScore,
        revenuePotentialScore: lead.revenuePotentialScore,
        niche: lead.niche,
        previousOutreachCount: lead.outreachMessages.length,
      } : undefined;

      // 1. Analyze the reply
      const analysis = await this.analyzeReply(messageId, messageContent, leadContext);

      if (!lead) {
        return { analysis, actions: ['Lead not found - analysis only'] };
      }

      // 2. Update lead scores based on analysis
      const scoreUpdate = computeScoreUpdate(analysis);
      if (scoreUpdate.replyScoreDelta !== 0 || scoreUpdate.conversionScoreDelta !== 0) {
        await db.lead.update({
          where: { id: leadId },
          data: {
            replyScore: Math.min(100, Math.max(0, lead.replyScore + scoreUpdate.replyScoreDelta)),
            conversionScore: Math.min(100, Math.max(0, lead.conversionScore + scoreUpdate.conversionScoreDelta)),
            urgencyScore: Math.min(100, Math.max(0, lead.urgencyScore + scoreUpdate.urgencyScoreDelta)),
            lastContactedAt: new Date(),
          },
        });
        actions.push(`Updated lead scores: reply +${scoreUpdate.replyScoreDelta}, conversion +${scoreUpdate.conversionScoreDelta}, urgency +${scoreUpdate.urgencyScoreDelta}`);
      }

      // 3. Update lead stage based on intent
      const stageUpdate = computeStageUpdate(lead.stage, analysis);
      if (stageUpdate) {
        await db.lead.update({
          where: { id: leadId },
          data: { stage: stageUpdate },
        });
        actions.push(`Moved lead from ${lead.stage} to ${stageUpdate}`);
      }

      // 4. Update email status
      if (lead.emailStatus !== 'replied') {
        await db.lead.update({
          where: { id: leadId },
          data: { emailStatus: 'replied' },
        });
        actions.push('Updated email status to replied');
      }

      // 5. Create notifications for important replies
      if (shouldNotify(analysis)) {
        const notificationType = getNotificationType(analysis);
        const notificationTitle = getNotificationTitle(analysis);
        const notificationMessage = getNotificationMessage(analysis, lead.businessName);

        await db.notification.create({
          data: {
            userId: lead.userId || 'unknown',
            type: notificationType,
            title: notificationTitle,
            message: notificationMessage,
            actionUrl: `/leads/${leadId}`,
            metadata: JSON.stringify({
              leadId,
              messageId,
              intent: analysis.intent,
              sentiment: analysis.sentiment,
              urgency: analysis.urgency,
              leadQualification: analysis.leadQualification,
            }),
          },
        });
        actions.push(`Created ${notificationType} notification`);
      }

      // 6. Record conversation message with analysis metadata
      const conversation = await findOrCreateConversation(leadId, 'email');
      await db.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          userId: lead.userId,
          senderType: 'lead',
          content: messageContent,
          channel: 'email',
          direction: 'inbound',
          intent: analysis.intent,
          buyingSignals: JSON.stringify(analysis.buyingSignals),
          hesitationReasons: JSON.stringify(analysis.objections),
          metadata: JSON.stringify({
            messageId,
            sentiment: analysis.sentiment,
            urgency: analysis.urgency,
            leadQualification: analysis.leadQualification,
            recommendedAction: analysis.recommendedAction,
            shouldAutoRespond: analysis.shouldAutoRespond,
          }),
        },
      });
      actions.push('Recorded conversation message with analysis metadata');

      return { analysis, actions };
    } catch (error) {
      console.error('[ReplyIntelligence] Process reply failed:', error);
      return {
        analysis: {
          sentiment: 'neutral',
          intent: 'neutral',
          buyingSignals: [],
          objections: [],
          urgency: 'low',
          recommendedAction: 'Review manually - processing error occurred',
          leadQualification: 'cold',
          shouldAutoRespond: false,
        },
        actions: [`Error during processing: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }
}

// ===== HELPER FUNCTIONS =====

const VALID_INTENTS = ['interested', 'not_interested', 'need_more_info', 'objection', 'meeting_request', 'unsubscribe', 'spam', 'out_of_office', 'referral', 'neutral'];
const VALID_SENTIMENTS = ['positive', 'neutral', 'negative', 'mixed'];
const VALID_URGENCIES = ['low', 'medium', 'high', 'critical'];
const VALID_QUALIFICATIONS = ['hot', 'warm', 'cold'];

function normalizeAnalysis(parsed: Record<string, unknown>): ReplyAnalysis {
  return {
    sentiment: VALID_SENTIMENTS.includes(parsed.sentiment as string) ? (parsed.sentiment as ReplyAnalysis['sentiment']) : 'neutral',
    intent: VALID_INTENTS.includes(parsed.intent as string) ? (parsed.intent as ReplyAnalysis['intent']) : 'neutral',
    buyingSignals: Array.isArray(parsed.buyingSignals) ? (parsed.buyingSignals as string[]).filter((s: unknown) => typeof s === 'string') : [],
    objections: Array.isArray(parsed.objections) ? (parsed.objections as string[]).filter((s: unknown) => typeof s === 'string') : [],
    urgency: VALID_URGENCIES.includes(parsed.urgency as string) ? (parsed.urgency as ReplyAnalysis['urgency']) : 'low',
    recommendedAction: typeof parsed.recommendedAction === 'string' ? parsed.recommendedAction : 'Review the reply manually',
    leadQualification: VALID_QUALIFICATIONS.includes(parsed.leadQualification as string) ? (parsed.leadQualification as ReplyAnalysis['leadQualification']) : 'cold',
    shouldAutoRespond: typeof parsed.shouldAutoRespond === 'boolean' ? parsed.shouldAutoRespond : false,
    suggestedResponse: typeof parsed.suggestedResponse === 'string' ? parsed.suggestedResponse : undefined,
  };
}

function computeScoreUpdate(analysis: ReplyAnalysis): {
  replyScoreDelta: number;
  conversionScoreDelta: number;
  urgencyScoreDelta: number;
} {
  let replyScoreDelta = 0;
  let conversionScoreDelta = 0;
  let urgencyScoreDelta = 0;

  // Reply score adjustments based on intent
  switch (analysis.intent) {
    case 'interested':
      replyScoreDelta += 15;
      conversionScoreDelta += 10;
      break;
    case 'meeting_request':
      replyScoreDelta += 20;
      conversionScoreDelta += 20;
      break;
    case 'need_more_info':
      replyScoreDelta += 10;
      conversionScoreDelta += 5;
      break;
    case 'referral':
      replyScoreDelta += 15;
      conversionScoreDelta += 15;
      break;
    case 'objection':
      replyScoreDelta += 5;
      conversionScoreDelta += 0;
      break;
    case 'not_interested':
      replyScoreDelta += 0;
      conversionScoreDelta -= 15;
      break;
    case 'unsubscribe':
      replyScoreDelta -= 10;
      conversionScoreDelta -= 20;
      break;
    case 'out_of_office':
      replyScoreDelta += 0;
      conversionScoreDelta += 0;
      break;
    case 'spam':
      replyScoreDelta -= 20;
      conversionScoreDelta -= 20;
      break;
    default:
      break;
  }

  // Sentiment adjustments
  switch (analysis.sentiment) {
    case 'positive':
      replyScoreDelta += 5;
      conversionScoreDelta += 5;
      break;
    case 'negative':
      replyScoreDelta -= 5;
      conversionScoreDelta -= 5;
      break;
    case 'mixed':
      replyScoreDelta += 2;
      break;
    default:
      break;
  }

  // Buying signals boost
  replyScoreDelta += Math.min(10, analysis.buyingSignals.length * 3);
  conversionScoreDelta += Math.min(10, analysis.buyingSignals.length * 2);

  // Objections can still indicate engagement
  if (analysis.objections.length > 0 && analysis.intent !== 'not_interested') {
    replyScoreDelta += 2; // They're engaged enough to object
  }

  // Urgency adjustments
  switch (analysis.urgency) {
    case 'critical':
      urgencyScoreDelta += 20;
      break;
    case 'high':
      urgencyScoreDelta += 10;
      break;
    case 'medium':
      urgencyScoreDelta += 5;
      break;
    default:
      break;
  }

  return { replyScoreDelta, conversionScoreDelta, urgencyScoreDelta };
}

function computeStageUpdate(currentStage: string, analysis: ReplyAnalysis): string | null {
  const stageProgression: Record<string, string> = {
    'discovered': 'contacted',
    'contacted': 'interested',
    'interested': 'meeting_scheduled',
    'meeting_scheduled': 'proposal_sent',
    'proposal_sent': 'negotiation',
    'negotiation': 'closed_won',
  };

  switch (analysis.intent) {
    case 'meeting_request':
      return 'meeting_scheduled';
    case 'interested':
      if (['discovered', 'contacted'].includes(currentStage)) {
        return 'interested';
      }
      return null;
    case 'need_more_info':
      if (currentStage === 'discovered') {
        return 'contacted';
      }
      return null;
    case 'not_interested':
      return 'lost';
    case 'unsubscribe':
      return 'lost';
    default:
      // Check lead qualification for stage progression
      if (analysis.leadQualification === 'hot' && stageProgression[currentStage]) {
        return stageProgression[currentStage];
      }
      return null;
  }
}

function shouldNotify(analysis: ReplyAnalysis): boolean {
  return (
    analysis.leadQualification === 'hot' ||
    analysis.intent === 'meeting_request' ||
    analysis.intent === 'unsubscribe' ||
    analysis.urgency === 'critical' ||
    analysis.urgency === 'high' ||
    (analysis.intent === 'objection' && analysis.sentiment === 'negative')
  );
}

function getNotificationType(analysis: ReplyAnalysis): string {
  if (analysis.intent === 'meeting_request') return 'meeting_request';
  if (analysis.intent === 'unsubscribe') return 'unsubscribe';
  if (analysis.leadQualification === 'hot') return 'hot_lead_reply';
  if (analysis.urgency === 'critical' || analysis.urgency === 'high') return 'urgent_reply';
  if (analysis.intent === 'objection') return 'objection_reply';
  return 'email_reply';
}

function getNotificationTitle(analysis: ReplyAnalysis): string {
  if (analysis.intent === 'meeting_request') return 'Meeting Request Received';
  if (analysis.intent === 'unsubscribe') return 'Lead Unsubscribed';
  if (analysis.leadQualification === 'hot') return 'Hot Lead Replied!';
  if (analysis.urgency === 'critical') return 'Critical Reply Needs Attention';
  if (analysis.urgency === 'high') return 'Urgent Reply Received';
  if (analysis.intent === 'objection') return 'Lead Has Objections';
  return 'New Reply Received';
}

function getNotificationMessage(analysis: ReplyAnalysis, businessName: string): string {
  const name = businessName || 'Unknown lead';
  if (analysis.intent === 'meeting_request') return `${name} requested a meeting. ${analysis.recommendedAction}`;
  if (analysis.intent === 'unsubscribe') return `${name} has unsubscribed from your emails.`;
  if (analysis.leadQualification === 'hot') return `Hot lead ${name} replied with ${analysis.sentiment} sentiment. Buying signals: ${analysis.buyingSignals.join(', ') || 'none detected'}`;
  if (analysis.urgency === 'critical') return `Critical reply from ${name}: ${analysis.recommendedAction}`;
  if (analysis.intent === 'objection') return `${name} raised objections: ${analysis.objections.join(', ')}`;
  return `${name} replied. Intent: ${analysis.intent}, Sentiment: ${analysis.sentiment}`;
}

async function findOrCreateConversation(leadId: string, channel: string): Promise<{ id: string }> {
  // Try to find an existing active conversation for this lead and channel
  const existing = await db.conversation.findFirst({
    where: { leadId, channel, status: 'active' },
    orderBy: { lastMessageAt: 'desc' },
  });

  if (existing) {
    // Update the lastMessageAt timestamp
    await db.conversation.update({
      where: { id: existing.id },
      data: { lastMessageAt: new Date() },
    });
    return existing;
  }

  // Create a new conversation
  return db.conversation.create({
    data: {
      leadId,
      channel,
      status: 'active',
      lastMessageAt: new Date(),
    },
  });
}

// ===== EXPORTED SINGLETON =====

export const replyIntelligenceService = new ReplyIntelligenceService();
