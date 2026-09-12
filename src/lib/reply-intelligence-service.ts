// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Reply Intelligence Service
// AI-Powered Email Reply Classification, Buying Signal Detection,
// Urgency Assessment, and Pipeline Automation
//
// CRITICAL RULES:
// - ALWAYS use executeAICompletion for LLM classification
// - ALWAYS deduct 2 credits per classification
// - ALWAYS store results in ConversationMessage or Lead notes
// - NEVER block on notifications — fire-and-forget
// - ALWAYS handle AI failures with rule-based fallback
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { executeAICompletion } from '@/lib/ai/ai-provider';
import { deductCredits } from '@/lib/credit-service';
import { createNotification } from '@/lib/notification-service';
import { evaluateTrigger } from '@/lib/workflow-triggers';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type Sentiment = 'positive' | 'negative' | 'neutral' | 'enthusiastic' | 'frustrated';

export type ReplyIntent =
  | 'interested'
  | 'not_interested'
  | 'meeting_request'
  | 'pricing_question'
  | 'objection'
  | 'information_request'
  | 'negotiation'
  | 'unsubscribe_request'
  | 'out_of_office';

export type Urgency = 'low' | 'medium' | 'high' | 'critical';

export type RecommendedAction =
  | 'reply_with_proposal'
  | 'schedule_meeting'
  | 'send_info'
  | 'follow_up_later'
  | 'mark_lost'
  | 'notify_sales_rep'
  | 'escalate_manager';

export interface BuyingSignals {
  wants_demo: boolean;
  asks_pricing: boolean;
  mentions_budget: boolean;
  mentions_timeline: boolean;
  refers_colleague: boolean;
  asks_features: boolean;
  compares_competitors: boolean;
  ready_to_buy: boolean;
  needs_approval: boolean;
}

export interface ClassifyReplyResult {
  id: string;
  sentiment: Sentiment;
  intent: ReplyIntent;
  confidence: number;
  buyingSignals: BuyingSignals;
  urgency: Urgency;
  recommendedAction: RecommendedAction;
  suggestedReply: string;
  keyPhrases: string[];
  classifiedAt: Date;
}

export interface ProcessIncomingReplyResult {
  success: boolean;
  classification: ClassifyReplyResult | null;
  leadUpdated: boolean;
  notificationSent: boolean;
  workflowTriggered: boolean;
  workflowExecutionIds: string[];
  error?: string;
}

export interface ReplyAnalytics {
  period: string;
  totalReplies: number;
  bySentiment: Record<Sentiment, number>;
  byIntent: Record<string, number>;
  byUrgency: Record<Urgency, number>;
  averageBuyingSignals: number;
  hotLeadsCount: number;
  conversionRate: number;
  topActions: Array<{ action: RecommendedAction; count: number }>;
}

export interface BuyingSignalsSummary {
  totalLeadsWithSignals: number;
  leads: Array<{
    leadId: string;
    businessName: string;
    email: string | null;
    signals: BuyingSignals;
    signalCount: number;
    urgency: Urgency;
    lastReplyAt: Date;
    intent: ReplyIntent;
  }>;
  signalFrequency: Record<keyof BuyingSignals, number>;
}

export interface ClassifyReplyParams {
  userId: string;
  leadId?: string;
  emailContent: string;
  emailSubject?: string;
  fromEmail: string;
  messageId?: string;
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const CREDIT_COST = 2;
const CREDIT_ACTION = 'reply_classification';

const VALID_SENTIMENTS: Sentiment[] = ['positive', 'negative', 'neutral', 'enthusiastic', 'frustrated'];
const VALID_INTENTS: ReplyIntent[] = [
  'interested', 'not_interested', 'meeting_request', 'pricing_question',
  'objection', 'information_request', 'negotiation', 'unsubscribe_request', 'out_of_office',
];
const VALID_URGENCIES: Urgency[] = ['low', 'medium', 'high', 'critical'];
const VALID_ACTIONS: RecommendedAction[] = [
  'reply_with_proposal', 'schedule_meeting', 'send_info', 'follow_up_later',
  'mark_lost', 'notify_sales_rep', 'escalate_manager',
];

// Rule-based pattern lists for fallback
const NEGATIVE_PHRASES = [
  'not interested', 'no thanks', 'unsubscribe', 'remove me', 'stop emailing',
  'do not contact', 'never', "don't want", 'not for us', 'opt out',
];
const POSITIVE_PHRASES = [
  'interested', 'great', 'love', 'excellent', 'amazing', 'yes please',
  'sounds good', 'let\'s do it', 'looking forward', 'excited',
];
const OOO_PHRASES = [
  'out of office', 'on vacation', 'on leave', 'away from desk',
  'automatic reply', 'auto-reply', 'returning on',
];
const MEETING_PHRASES = [
  'schedule a meeting', 'set up a call', 'let\'s meet', 'book a call',
  'zoom call', 'quick chat', 'when are you free',
];
const OBJECTION_PHRASES = [
  'too expensive', 'out of budget', 'can\'t afford', 'not the right time',
  'happy with current', 'using competitor', 'already have',
];
const PRICING_PHRASES = [
  'how much', 'pricing', 'cost', 'quote', 'estimate', 'price',
  'budget', 'what does it cost',
];

// ═══════════════════════════════════════════════════════════════════
// AI SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════

const CLASSIFICATION_PROMPT = `You are an expert B2B email reply analyst for AcquisitionOS. Analyze incoming email replies and classify them.

Return ONLY valid JSON with these fields:
{
  "sentiment": "positive|negative|neutral|enthusiastic|frustrated",
  "intent": "interested|not_interested|meeting_request|pricing_question|objection|information_request|negotiation|unsubscribe_request|out_of_office",
  "confidence": 0.0-1.0,
  "buyingSignals": {
    "wants_demo": boolean,
    "asks_pricing": boolean,
    "mentions_budget": boolean,
    "mentions_timeline": boolean,
    "refers_colleague": boolean,
    "asks_features": boolean,
    "compares_competitors": boolean,
    "ready_to_buy": boolean,
    "needs_approval": boolean
  },
  "urgency": "low|medium|high|critical",
  "recommendedAction": "reply_with_proposal|schedule_meeting|send_info|follow_up_later|mark_lost|notify_sales_rep|escalate_manager",
  "keyPhrases": ["phrase1", "phrase2"],
  "suggestedReply": "A brief suggested reply (2-3 sentences max)"
}

RULES:
- OOO auto-replies → intent=out_of_office, urgency=low, action=follow_up_later
- Unsubscribe requests → intent=unsubscribe_request, action=mark_lost
- Meeting requests → intent=meeting_request, action=schedule_meeting
- Pricing questions → intent=pricing_question, urgency=medium, action=reply_with_proposal
- Objections with budget/timeline → urgency=high, action=notify_sales_rep
- Frustration + deadline → sentiment=frustrated, urgency=critical, action=escalate_manager
- Enthusiasm + budget approval → sentiment=enthusiastic, urgency=high, action=reply_with_proposal`;

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function generateId(): string {
  return `ri_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchesAny(text: string, phrases: string[]): boolean {
  const norm = normalizeText(text);
  return phrases.some(p => norm.includes(p));
}

function countMatches(text: string, phrases: string[]): number {
  const norm = normalizeText(text);
  return phrases.filter(p => norm.includes(p)).length;
}

function safeParseJSON<T>(raw: string): T | null {
  if (!raw || typeof raw !== 'string') return null;
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  try { return JSON.parse(cleaned) as T; }
  catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]) as T; }
      catch { return null; }
    }
    return null;
  }
}

function defaultBuyingSignals(): BuyingSignals {
  return {
    wants_demo: false, asks_pricing: false, mentions_budget: false,
    mentions_timeline: false, refers_colleague: false, asks_features: false,
    compares_competitors: false, ready_to_buy: false, needs_approval: false,
  };
}

function countBuyingSignals(signals: BuyingSignals): number {
  return Object.values(signals).filter(Boolean).length;
}

// ═══════════════════════════════════════════════════════════════════
// RULE-BASED FALLBACK
// ═══════════════════════════════════════════════════════════════════

function classifyRuleBased(text: string, subject?: string): Partial<ClassifyReplyResult> {
  const combined = normalizeText(`${subject || ''} ${text}`);

  let sentiment: Sentiment = 'neutral';
  let intent: ReplyIntent = 'information_request';
  let urgency: Urgency = 'low';
  let action: RecommendedAction = 'send_info';
  const buyingSignals = defaultBuyingSignals();
  const keyPhrases: string[] = [];

  // OOO detection (highest priority)
  if (matchesAny(combined, OOO_PHRASES)) {
    return { sentiment: 'neutral', intent: 'out_of_office', confidence: 0.95, buyingSignals, urgency: 'low', recommendedAction: 'follow_up_later', keyPhrases: ['out of office'], suggestedReply: '' };
  }

  // Unsubscribe
  if (matchesAny(combined, NEGATIVE_PHRASES.slice(0, 5))) {
    const hasUnsub = combined.includes('unsubscribe') || combined.includes('remove') || combined.includes('opt out');
    if (hasUnsub) {
      return { sentiment: 'negative', intent: 'unsubscribe_request', confidence: 0.9, buyingSignals, urgency: 'medium', recommendedAction: 'mark_lost', keyPhrases: ['unsubscribe request'], suggestedReply: '' };
    }
  }

  // Meeting request
  if (matchesAny(combined, MEETING_PHRASES)) {
    return { sentiment: 'positive', intent: 'meeting_request', confidence: 0.85, buyingSignals: { ...buyingSignals, wants_demo: true }, urgency: 'high', recommendedAction: 'schedule_meeting', keyPhrases: ['meeting request'], suggestedReply: '' };
  }

  // Pricing question
  if (matchesAny(combined, PRICING_PHRASES)) {
    buyingSignals.asks_pricing = true;
    if (combined.includes('budget')) buyingSignals.mentions_budget = true;
    return { sentiment: 'neutral', intent: 'pricing_question', confidence: 0.8, buyingSignals, urgency: 'medium', recommendedAction: 'reply_with_proposal', keyPhrases: ['pricing inquiry'], suggestedReply: '' };
  }

  // Objection
  if (matchesAny(combined, OBJECTION_PHRASES)) {
    if (combined.includes('too expensive') || combined.includes('out of budget')) {
      buyingSignals.mentions_budget = true;
    }
    if (combined.includes('competitor') || combined.includes('already have')) {
      buyingSignals.compares_competitors = true;
    }
    return { sentiment: 'frustrated', intent: 'objection', confidence: 0.75, buyingSignals, urgency: 'medium', recommendedAction: 'notify_sales_rep', keyPhrases: ['objection detected'], suggestedReply: '' };
  }

  // Positive
  if (matchesAny(combined, POSITIVE_PHRASES)) {
    const posCount = countMatches(combined, POSITIVE_PHRASES);
    sentiment = posCount >= 3 ? 'enthusiastic' : 'positive';
    intent = 'interested';
    urgency = posCount >= 3 ? 'high' : 'medium';
    action = urgency === 'high' ? 'reply_with_proposal' : 'send_info';
  }

  // Negative
  if (matchesAny(combined, NEGATIVE_PHRASES)) {
    sentiment = 'frustrated';
    intent = 'not_interested';
    urgency = 'medium';
    action = 'mark_lost';
  }

  // Feature questions
  if (combined.includes('feature') || combined.includes('capability') || combined.includes('what can')) {
    buyingSignals.asks_features = true;
    intent = 'information_request';
  }

  // Timeline mentions
  if (combined.includes('asap') || combined.includes('deadline') || combined.includes('by end of')) {
    buyingSignals.mentions_timeline = true;
    urgency = 'high';
  }

  // Referral mentions
  if (combined.includes('colleague') || combined.includes('team member') || combined.includes('introduce')) {
    buyingSignals.refers_colleague = true;
    urgency = 'high';
  }

  // Ready to buy
  if (combined.includes('sign up') || combined.includes('let\'s start') || combined.includes('ready to buy')) {
    buyingSignals.ready_to_buy = true;
    urgency = 'high';
    action = 'reply_with_proposal';
  }

  // Needs approval
  if (combined.includes('need approval') || combined.includes('manager') || combined.includes('decision maker')) {
    buyingSignals.needs_approval = true;
  }

  return { sentiment, intent, confidence: 0.6, buyingSignals, urgency, recommendedAction: action, keyPhrases, suggestedReply: '' };
}

// ═══════════════════════════════════════════════════════════════════
// CORE: classifyReply
// ═══════════════════════════════════════════════════════════════════

export async function classifyReply(params: ClassifyReplyParams): Promise<ClassifyReplyResult> {
  const { userId, emailContent, emailSubject, fromEmail } = params;

  // 1. Deduct credits
  const creditResult = await deductCredits({
    userId,
    action: CREDIT_ACTION,
    cost: CREDIT_COST,
    referenceId: params.leadId || params.messageId,
    idempotencyKey: params.messageId ? `reply_classify_${params.messageId}` : undefined,
  });

  if (!creditResult.success) {
    // Return a minimal rule-based result if credits fail — do not throw
    console.warn(`[ReplyIntel] Credit deduction failed: ${creditResult.error}, using rule-based fallback`);
  }

  // 2. Call AI for classification
  let aiResult: Partial<ClassifyReplyResult> | null = null;

  if (creditResult.success) {
    const userPrompt = `Analyze this email reply:\n\nFROM: ${fromEmail}\nSUBJECT: ${emailSubject || '(no subject)'}\n\nCONTENT:\n${emailContent}`;

    const aiResponse = await executeAICompletion(
      { messages: [{ role: 'system', content: CLASSIFICATION_PROMPT }, { role: 'user', content: userPrompt }] },
      userId,
      CREDIT_ACTION,
    );

    if (aiResponse.success && aiResponse.content) {
      const parsed = safeParseJSON<{
        sentiment?: string;
        intent?: string;
        confidence?: number;
        buyingSignals?: Partial<BuyingSignals>;
        urgency?: string;
        recommendedAction?: string;
        keyPhrases?: string[];
        suggestedReply?: string;
      }>(aiResponse.content);

      if (parsed) {
        aiResult = {
          sentiment: VALID_SENTIMENTS.includes(parsed.sentiment as Sentiment) ? parsed.sentiment as Sentiment : 'neutral',
          intent: VALID_INTENTS.includes(parsed.intent as ReplyIntent) ? parsed.intent as ReplyIntent : 'information_request',
          confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
          buyingSignals: { ...defaultBuyingSignals(), ...parsed.buyingSignals },
          urgency: VALID_URGENCIES.includes(parsed.urgency as Urgency) ? parsed.urgency as Urgency : 'medium',
          recommendedAction: VALID_ACTIONS.includes(parsed.recommendedAction as RecommendedAction) ? parsed.recommendedAction as RecommendedAction : 'send_info',
          keyPhrases: Array.isArray(parsed.keyPhrases) ? parsed.keyPhrases.filter((p): p is string => typeof p === 'string').slice(0, 10) : [],
          suggestedReply: typeof parsed.suggestedReply === 'string' ? parsed.suggestedReply.slice(0, 500) : '',
        };
      }
    }
  }

  // 3. Fallback to rule-based if AI failed
  let result: Partial<ClassifyReplyResult>;
  if (!aiResult || (aiResult.confidence !== undefined && aiResult.confidence < 0.4)) {
    const ruleResult = classifyRuleBased(emailContent, emailSubject);
    // Merge: AI result takes priority where available
    result = {
      sentiment: aiResult?.sentiment || ruleResult.sentiment || 'neutral',
      intent: aiResult?.intent || ruleResult.intent || 'information_request',
      confidence: aiResult?.confidence || ruleResult.confidence || 0.5,
      buyingSignals: { ...defaultBuyingSignals(), ...(ruleResult.buyingSignals || {}), ...(aiResult?.buyingSignals || {}) },
      urgency: aiResult?.urgency || ruleResult.urgency || 'medium',
      recommendedAction: aiResult?.recommendedAction || ruleResult.recommendedAction || 'send_info',
      keyPhrases: aiResult?.keyPhrases?.length ? aiResult.keyPhrases : (ruleResult.keyPhrases || []),
      suggestedReply: aiResult?.suggestedReply || ruleResult.suggestedReply || '',
    };
  } else {
    result = aiResult;
  }

  // 4. Build final result
  const finalResult: ClassifyReplyResult = {
    id: generateId(),
    sentiment: result.sentiment || 'neutral',
    intent: result.intent || 'information_request',
    confidence: result.confidence || 0.5,
    buyingSignals: result.buyingSignals || defaultBuyingSignals(),
    urgency: result.urgency || 'medium',
    recommendedAction: result.recommendedAction || 'send_info',
    suggestedReply: result.suggestedReply || '',
    keyPhrases: result.keyPhrases || [],
    classifiedAt: new Date(),
  };

  // 5. Store as ConversationMessage if leadId available
  if (params.leadId) {
    try {
      // Find or create conversation for this lead
      let conversation = await db.conversation.findFirst({
        where: { leadId: params.leadId, channel: 'email', status: 'active' },
        select: { id: true },
      });

      if (!conversation) {
        conversation = await db.conversation.create({
          data: { leadId: params.leadId, channel: 'email', subject: emailSubject, status: 'active' },
          select: { id: true },
        });
      }

      await db.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          userId,
          senderType: 'lead',
          content: emailContent,
          channel: 'email',
          direction: 'inbound',
          intent: finalResult.intent,
          buyingSignals: JSON.stringify(finalResult.buyingSignals),
          metadata: JSON.stringify({
            classificationId: finalResult.id,
            sentiment: finalResult.sentiment,
            urgency: finalResult.urgency,
            recommendedAction: finalResult.recommendedAction,
            confidence: finalResult.confidence,
            fromEmail,
          }),
        },
      });
    } catch (error) {
      console.error('[ReplyIntel] Failed to store ConversationMessage:', error);
    }

    // Also add to Lead notes
    try {
      const signalCount = countBuyingSignals(finalResult.buyingSignals);
      await db.leadNote.create({
        data: {
          leadId: params.leadId,
          userId,
          content: `[Reply Intelligence] ${finalResult.sentiment} / ${finalResult.intent} / urgency=${finalResult.urgency} / action=${finalResult.recommendedAction} / signals=${signalCount}`,
        },
      });
    } catch (error) {
      console.error('[ReplyIntel] Failed to store LeadNote:', error);
    }
  }

  console.log(`[ReplyIntel] Classified reply from ${fromEmail}: sentiment=${finalResult.sentiment}, intent=${finalResult.intent}, urgency=${finalResult.urgency}`);
  return finalResult;
}

// ═══════════════════════════════════════════════════════════════════
// CORE: processIncomingReply
// ═══════════════════════════════════════════════════════════════════

export async function processIncomingReply(params: ClassifyReplyParams): Promise<ProcessIncomingReplyResult> {
  const { userId, leadId, fromEmail } = params;

  try {
    // 1. Classify the reply
    const classification = await classifyReply(params);

    // 2. Update Lead record with latest reply data
    let leadUpdated = false;
    if (leadId) {
      try {
        const stageUpdate = determineLeadStage(classification);
        const signalCount = countBuyingSignals(classification.buyingSignals);

        await db.lead.update({
          where: { id: leadId },
          data: {
            ...(stageUpdate.stage !== undefined ? { stage: stageUpdate.stage } : {}),
            lastContactedAt: new Date(),
            emailStatus: 'replied',
            replyScore: Math.min(100, classification.confidence * 100 + signalCount * 10),
            urgencyScore: urgencyToScore(classification.urgency),
            notes: buildLeadNote(classification),
          },
        });
        leadUpdated = true;

        // Create activity log
        await db.leadActivity.create({
          data: {
            leadId,
            type: 'reply_classified',
            description: `Reply classified: ${classification.sentiment}/${classification.intent}, urgency=${classification.urgency}, ${signalCount} buying signals`,
            metadata: JSON.stringify(classification),
          },
        });
      } catch (error) {
        console.error('[ReplyIntel] Failed to update Lead:', error);
      }
    }

    // 3. Create notifications for buying signals / high urgency
    let notificationSent = false;
    const signalCount = countBuyingSignals(classification.buyingSignals);
    if (signalCount >= 3 || classification.urgency === 'high' || classification.urgency === 'critical') {
      const leadName = await getLeadBusinessName(leadId, fromEmail);
      const notifType = classification.urgency === 'critical' ? 'analysis' : 'lead_reply';
      const notifTitle = classification.urgency === 'critical'
        ? `🚨 URGENT: ${fromEmail}`
        : `🔥 ${signalCount} buying signals from ${leadName}`;

      await createNotification({
        userId,
        type: notifType,
        title: notifTitle,
        message: `Intent: ${classification.intent}, Sentiment: ${classification.sentiment}, Urgency: ${classification.urgency}. Action: ${classification.recommendedAction}`,
        actionUrl: leadId ? `/leads/${leadId}` : undefined,
        metadata: { classificationId: classification.id, fromEmail, signalCount },
      }).catch(err => console.error('[ReplyIntel] Notification error (non-blocking):', err));
      notificationSent = true;
    }

    // 4. Trigger workflow for meeting_request intent
    let workflowTriggered = false;
    let workflowExecutionIds: string[] = [];

    if (classification.intent === 'meeting_request' && leadId) {
      try {
        workflowExecutionIds = await evaluateTrigger(
          'lead_reply',
          { leadId, replyType: 'meeting_request', channelId: 'email' },
          userId,
        );
        workflowTriggered = workflowExecutionIds.length > 0;
        if (workflowTriggered) {
          console.log(`[ReplyIntel] Triggered ${workflowExecutionIds.length} workflow(s) for meeting request`);
        }
      } catch (error) {
        console.error('[ReplyIntel] Workflow trigger error (non-blocking):', error);
      }
    }

    return {
      success: true,
      classification,
      leadUpdated,
      notificationSent,
      workflowTriggered,
      workflowExecutionIds,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ReplyIntel] processIncomingReply failed:', error);
    return {
      success: false,
      classification: null,
      leadUpdated: false,
      notificationSent: false,
      workflowTriggered: false,
      workflowExecutionIds: [],
      error: message,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// ANALYTICS: getReplyAnalytics
// ═══════════════════════════════════════════════════════════════════

export async function getReplyAnalytics(
  userId: string,
  filters?: { period?: string; channel?: string }
): Promise<ReplyAnalytics> {
  const period = filters?.period || '30d';
  const channel = filters?.channel || 'email';

  const since = getPeriodStart(period);

  // Fetch recent conversation messages for analytics
  const messages = await db.conversationMessage.findMany({
    where: {
      userId,
      channel,
      createdAt: { gte: since },
    },
    select: { intent: true, buyingSignals: true, createdAt: true, metadata: true },
  });

  const analytics: ReplyAnalytics = {
    period,
    totalReplies: messages.length,
    bySentiment: { positive: 0, negative: 0, neutral: 0, enthusiastic: 0, frustrated: 0 },
    byIntent: {},
    byUrgency: { low: 0, medium: 0, high: 0, critical: 0 },
    averageBuyingSignals: 0,
    hotLeadsCount: 0,
    conversionRate: 0,
    topActions: [],
  };

  let totalSignals = 0;
  const actionCounts: Record<string, number> = {};

  for (const msg of messages) {
    // Parse metadata for sentiment and urgency
    let sentiment: Sentiment = 'neutral';
    let urgency: Urgency = 'medium';
    let action: RecommendedAction = 'send_info';

    if (msg.metadata) {
      try {
        const meta = JSON.parse(msg.metadata) as Record<string, unknown>;
        if (typeof meta.sentiment === 'string' && VALID_SENTIMENTS.includes(meta.sentiment as Sentiment)) {
          sentiment = meta.sentiment as Sentiment;
        }
        if (typeof meta.urgency === 'string' && VALID_URGENCIES.includes(meta.urgency as Urgency)) {
          urgency = meta.urgency as Urgency;
        }
        if (typeof meta.recommendedAction === 'string' && VALID_ACTIONS.includes(meta.recommendedAction as RecommendedAction)) {
          action = meta.recommendedAction as RecommendedAction;
        }
      } catch { /* skip */ }
    }

    analytics.bySentiment[sentiment]++;
    analytics.byIntent[msg.intent] = (analytics.byIntent[msg.intent] || 0) + 1;
    analytics.byUrgency[urgency]++;

    // Parse buying signals count
    if (msg.buyingSignals) {
      try {
        const signals = JSON.parse(msg.buyingSignals) as Record<string, boolean>;
        const signalCount = Object.values(signals).filter(Boolean).length;
        totalSignals += signalCount;
        if (signalCount >= 3) analytics.hotLeadsCount++;
      } catch { /* skip */ }
    }

    actionCounts[action] = (actionCounts[action] || 0) + 1;
  }

  analytics.averageBuyingSignals = messages.length > 0 ? Math.round((totalSignals / messages.length) * 10) / 10 : 0;
  analytics.conversionRate = messages.length > 0
    ? Math.round(((analytics.byIntent['interested'] || 0) + (analytics.byIntent['meeting_request'] || 0)) / messages.length * 100) / 100
    : 0;

  // Top actions
  analytics.topActions = Object.entries(actionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([action, count]) => ({ action: action as RecommendedAction, count }));

  return analytics;
}

// ═══════════════════════════════════════════════════════════════════
// ANALYTICS: getBuyingSignalsSummary
// ═══════════════════════════════════════════════════════════════════

export async function getBuyingSignalsSummary(userId: string): Promise<BuyingSignalsSummary> {
  // Find leads that have conversation messages with buying signals
  const conversations = await db.conversation.findMany({
    where: {
      userId,
      status: 'active',
    },
    select: {
      leadId: true,
      channel: true,
      messages: {
        where: { buyingSignals: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { buyingSignals: true, intent: true, createdAt: true, metadata: true },
      },
      lead: {
        select: { id: true, businessName: true, email: true },
      },
    },
  });

  const leads: BuyingSignalsSummary['leads'] = [];
  const signalFrequency: Record<keyof BuyingSignals, number> = {
    wants_demo: 0, asks_pricing: 0, mentions_budget: 0, mentions_timeline: 0,
    refers_colleague: 0, asks_features: 0, compares_competitors: 0,
    ready_to_buy: 0, needs_approval: 0,
  };

  for (const conv of conversations) {
    const latestMsg = conv.messages[0];
    if (!latestMsg || !latestMsg.buyingSignals) continue;

    let signals: BuyingSignals;
    let urgency: Urgency = 'medium';

    try { signals = JSON.parse(latestMsg.buyingSignals) as BuyingSignals; }
    catch { continue; }

    if (latestMsg.metadata) {
      try {
        const meta = JSON.parse(latestMsg.metadata) as Record<string, unknown>;
        if (typeof meta.urgency === 'string' && VALID_URGENCIES.includes(meta.urgency as Urgency)) {
          urgency = meta.urgency as Urgency;
        }
      } catch { /* skip */ }
    }

    const signalCount = countBuyingSignals(signals);
    if (signalCount === 0) continue;

    // Track frequency
    for (const [key, val] of Object.entries(signals)) {
      if (val) signalFrequency[key as keyof BuyingSignals]++;
    }

    leads.push({
      leadId: conv.leadId,
      businessName: conv.lead?.businessName || 'Unknown',
      email: conv.lead?.email || null,
      signals,
      signalCount,
      urgency,
      lastReplyAt: latestMsg.createdAt,
      intent: (VALID_INTENTS.includes(latestMsg.intent as ReplyIntent) ? latestMsg.intent : 'information_request') as ReplyIntent,
    });
  }

  // Sort by urgency (critical first) then by signal count
  const urgencyOrder: Record<Urgency, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  leads.sort((a, b) => {
    const urgDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (urgDiff !== 0) return urgDiff;
    return b.signalCount - a.signalCount;
  });

  return {
    totalLeadsWithSignals: leads.length,
    leads,
    signalFrequency,
  };
}

// ═══════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════

function determineLeadStage(classification: ClassifyReplyResult): { stage?: string } {
  switch (classification.intent) {
    case 'interested':
    case 'pricing_question':
    case 'negotiation':
      return { stage: 'interested' };
    case 'meeting_request':
      return { stage: 'meeting_scheduled' };
    case 'not_interested':
    case 'unsubscribe_request':
      return { stage: 'closed_lost' };
    case 'out_of_office':
      return {}; // Don't change stage for OOO
    default:
      return { stage: 'replied' };
  }
}

function urgencyToScore(urgency: Urgency): number {
  const map: Record<Urgency, number> = { low: 20, medium: 50, high: 80, critical: 100 };
  return map[urgency] || 50;
}

function buildLeadNote(classification: ClassifyReplyResult): string {
  const signals = Object.entries(classification.buyingSignals)
    .filter(([, v]) => v)
    .map(([k]) => k);
  return JSON.stringify({
    replyIntel: {
      sentiment: classification.sentiment,
      intent: classification.intent,
      urgency: classification.urgency,
      action: classification.recommendedAction,
      buyingSignals: signals,
      classifiedAt: classification.classifiedAt.toISOString(),
    },
  });
}

async function getLeadBusinessName(leadId: string | undefined, fromEmail: string): Promise<string> {
  if (leadId) {
    try {
      const lead = await db.lead.findUnique({
        where: { id: leadId },
        select: { businessName: true },
      });
      if (lead) return lead.businessName;
    } catch { /* fallback */ }
  }
  return fromEmail;
}

function getPeriodStart(period: string): Date {
  const now = new Date();
  switch (period) {
    case '7d': return new Date(now.getTime() - 7 * 86400000);
    case '30d': return new Date(now.getTime() - 30 * 86400000);
    case '90d': return new Date(now.getTime() - 90 * 86400000);
    case 'all': return new Date(0);
    default: return new Date(now.getTime() - 30 * 86400000);
  }
}
