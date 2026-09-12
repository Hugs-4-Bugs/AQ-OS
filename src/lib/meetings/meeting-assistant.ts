// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — AI Meeting Assistant
// Agenda generation, meeting preparation, action item extraction,
// post-meeting follow-up email drafting
//
// Uses the project's AI provider infrastructure:
// - executeAICompletion from ai-provider.ts (Z-AI with fallback chain)
// - Credit deduction via credit-service.ts (check → deduct → refund on fail)
// - Prompt management via prompt-manager.ts
//
// Phase 5: Full implementation with proper credit system integration
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { executeAICompletion, type AICompletionRequest, AI_CONFIG } from '@/lib/ai/ai-provider';
import { sanitizePromptInput } from '@/lib/ai/prompt-manager';
import { deductCredits, checkCreditSufficiency, type CreditAction } from '@/lib/credit-service';

// ===== TYPES =====

/** Agenda item */
export interface AgendaItem {
  topic: string;
  durationMinutes: number;
  purpose: 'information' | 'discussion' | 'decision' | 'action';
  notes?: string;
  priority: 'high' | 'medium' | 'low';
}

/** Generated agenda */
export interface GeneratedAgenda {
  items: AgendaItem[];
  totalDurationMinutes: number;
  objectives: string[];
  suggestedPreparation: string[];
  keyQuestions: string[];
}

/** Meeting preparation briefing */
export interface MeetingPreparation {
  companyOverview: string;
  industryInsights: string;
  painPoints: string[];
  decisionMakerProfile?: string;
  competitiveContext?: string;
  recommendedApproach: string;
  talkingPoints: string[];
  anticipatedObjections: string[];
  suggestedQuestions: string[];
  dealSizeContext?: string;
}

/** Action item extracted from meeting transcript */
export interface ActionItem {
  description: string;
  assignee: 'user' | 'lead' | 'both';
  dueDate?: string;
  priority: 'high' | 'medium' | 'low';
  category: 'follow_up' | 'research' | 'proposal' | 'internal' | 'client';
}

/** Objection extracted from meeting notes */
export interface ExtractedObjection {
  objection: string;
  category: 'pricing' | 'timeline' | 'competition' | 'trust' | 'need' | 'authority' | 'other';
  severity: 'high' | 'medium' | 'low';
  suggestedResponse: string;
}

/** Post-meeting follow-up email draft */
export interface FollowUpDraft {
  subject: string;
  body: string;
}

/** Common result wrapper for AI functions */
export interface MeetingAIResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  creditsDeducted?: number;
  newBalance?: number;
}

// ===== CREDIT COSTS =====

const AGENDA_CREDIT_COST = 3;
const PREP_CREDIT_COST = 5;
const ACTION_ITEMS_CREDIT_COST = 3;
const FOLLOW_UP_CREDIT_COST = 2;

const MEETING_AI_ACTION: CreditAction = 'deep_analysis';

// ===== LOGGING =====

const LOG_PREFIX = '[MeetingAssistant]';

// ===== HELPER: Safe JSON extraction from AI response =====

function safeParseJSON<T>(raw: string): T | null {
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/```(?:json)?\s*\n?/g, '').replace(/```/g, '').trim();
    // Try direct parse first
    try {
      return JSON.parse(cleaned) as T;
    } catch { /* continue */ }
    // Try extracting JSON object from the text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as T;
    }
    // Try extracting JSON array
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      return JSON.parse(arrayMatch[0]) as T;
    }
    return null;
  } catch {
    return null;
  }
}

// ===== HELPER: Build lead context string =====

function buildLeadContext(lead: {
  businessName: string;
  ownerName?: string | null;
  email?: string | null;
  website?: string | null;
  niche?: string | null;
  city?: string | null;
  country?: string | null;
  stage: string;
  replyScore: number;
  conversionScore: number;
  urgencyScore: number;
  revenuePotentialScore: number;
  tags: string;
}): string {
  const parts: string[] = [
    `Company: ${lead.businessName}`,
    lead.ownerName ? `Contact: ${lead.ownerName}` : '',
    lead.email ? `Email: ${lead.email}` : '',
    lead.website ? `Website: ${lead.website}` : '',
    lead.niche ? `Industry: ${lead.niche}` : '',
    lead.city || lead.country ? `Location: ${[lead.city, lead.country].filter(Boolean).join(', ')}` : '',
    `Pipeline Stage: ${lead.stage}`,
    `Scores: Reply=${lead.replyScore}, Conversion=${lead.conversionScore}, Urgency=${lead.urgencyScore}, Revenue=${lead.revenuePotentialScore}`,
    lead.tags ? `Tags: ${lead.tags}` : '',
  ];
  return parts.filter(Boolean).join('\n');
}

// ===== (a) generateAgenda =====

/**
 * Generate an AI-powered meeting agenda based on meeting context, lead profile,
 * and reply history. Produces a structured agenda with opening, key topics,
 * demo/discussion items, and next steps.
 *
 * Deducts AI credits via existing credit system.
 */
export async function generateAgenda(
  meeting: {
    id: string;
    title: string;
    description?: string | null;
    startDateTime: Date;
    endDateTime: Date;
    timezone: string;
    durationMinutes: number;
    leadId?: string | null;
    userId: string;
  },
  lead?: {
    businessName: string;
    ownerName?: string | null;
    email?: string | null;
    website?: string | null;
    niche?: string | null;
    city?: string | null;
    country?: string | null;
    stage: string;
    replyScore: number;
    conversionScore: number;
    urgencyScore: number;
    revenuePotentialScore: number;
    tags: string;
  } | null,
  replyHistory?: string
): Promise<MeetingAIResult<string>> {
  console.log(`${LOG_PREFIX} generateAgenda called for meeting ${meeting.id}`);

  try {
    // 1. Check credit sufficiency
    const sufficiency = await checkCreditSufficiency(meeting.userId, AGENDA_CREDIT_COST);
    if (!sufficiency.sufficient) {
      return {
        success: false,
        error: `Insufficient credits. Need ${AGENDA_CREDIT_COST}, have ${sufficiency.balance}`,
      };
    }

    // 2. Deduct credits
    const deduction = await deductCredits({
      userId: meeting.userId,
      action: MEETING_AI_ACTION,
      cost: AGENDA_CREDIT_COST,
      referenceId: meeting.id,
    });

    if (!deduction.success) {
      return { success: false, error: deduction.error || 'Failed to deduct credits' };
    }

    // 3. Build context
    const leadContext = lead ? buildLeadContext(lead) : 'No lead information available';
    const durationStr = `${meeting.durationMinutes} minutes`;
    const dateTimeStr = meeting.startDateTime.toLocaleString('en-US', {
      timeZone: meeting.timezone || 'UTC',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    // 4. Build prompt
    const systemPrompt = `You are an expert sales meeting planner. Generate a structured meeting agenda in markdown format.

Given the meeting details, lead profile, and conversation history, create a comprehensive agenda that:
1. Opens with rapport building and context setting
2. Addresses the lead's specific pain points and interests
3. Includes demo or discussion items relevant to the lead's needs
4. Leaves room for next steps and action items

Format the agenda as markdown with clear sections, time allocations, and bullet points.
Be specific and actionable — reference the lead's company, industry, and known concerns.`;

    const userPrompt = `Generate a meeting agenda for:

**Meeting:** ${sanitizePromptInput(meeting.title)}
**Date/Time:** ${dateTimeStr}
**Duration:** ${durationStr}
**Timezone:** ${meeting.timezone || 'UTC'}
${meeting.description ? `**Description:** ${sanitizePromptInput(meeting.description)}` : ''}

**Lead Profile:**
${sanitizePromptInput(leadContext)}

${replyHistory ? `**Recent Email Exchanges (last 5):**\n${sanitizePromptInput(replyHistory)}` : ''}

Generate a detailed markdown agenda with:
- Opening (5 min)
- Key discussion topics based on the lead's pain points (with time allocations)
- Demo or presentation items if relevant
- Q&A section
- Next steps and action items
- Closing

Ensure the total time adds up to ${durationStr}.`;

    // 5. Execute AI completion
    const request: AICompletionRequest = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      config: {
        provider: 'z-ai',
        maxTokens: 4096,
        temperature: 0.7,
        timeout: 45000,
        retries: 2,
      },
    };

    const result = await executeAICompletion(request, meeting.userId, 'meeting_agenda');

    if (!result.success || !result.content) {
      // Refund credits on failure
      await deductCredits({
        userId: meeting.userId,
        action: `${MEETING_AI_ACTION}_refund` as CreditAction,
        cost: -AGENDA_CREDIT_COST,
        referenceId: meeting.id,
      });
      return { success: false, error: result.error || 'AI agenda generation failed' };
    }

    // 6. Save agenda to meeting record
    try {
      await db.meeting.update({
        where: { id: meeting.id },
        data: { agenda: result.content },
      });
    } catch (saveError) {
      console.error(`${LOG_PREFIX} Failed to save agenda to meeting:`, saveError);
      // Non-blocking — still return the agenda
    }

    console.log(`${LOG_PREFIX} Agenda generated for meeting ${meeting.id}`);
    return {
      success: true,
      data: result.content,
      creditsDeducted: AGENDA_CREDIT_COST,
      newBalance: deduction.newBalance,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} generateAgenda failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error generating agenda',
    };
  }
}

// ===== (b) generateMeetingPrep =====

/**
 * Generate meeting preparation briefing. Reuses company research from
 * lead-analysis-engine when available, plus generates meeting-specific prep:
 * likely objections, talking points, competitor mentions, deal size context.
 *
 * Deducts AI credits via existing credit system.
 */
export async function generateMeetingPrep(
  meeting: {
    id: string;
    title: string;
    description?: string | null;
    leadId?: string | null;
    userId: string;
  },
  lead?: {
    businessName: string;
    ownerName?: string | null;
    email?: string | null;
    website?: string | null;
    niche?: string | null;
    city?: string | null;
    country?: string | null;
    stage: string;
    replyScore: number;
    conversionScore: number;
    urgencyScore: number;
    revenuePotentialScore: number;
    tags: string;
  } | null
): Promise<MeetingAIResult<MeetingPreparation>> {
  console.log(`${LOG_PREFIX} generateMeetingPrep called for meeting ${meeting.id}`);

  try {
    // 1. Check credit sufficiency
    const sufficiency = await checkCreditSufficiency(meeting.userId, PREP_CREDIT_COST);
    if (!sufficiency.sufficient) {
      return {
        success: false,
        error: `Insufficient credits. Need ${PREP_CREDIT_COST}, have ${sufficiency.balance}`,
      };
    }

    // 2. Deduct credits
    const deduction = await deductCredits({
      userId: meeting.userId,
      action: MEETING_AI_ACTION,
      cost: PREP_CREDIT_COST,
      referenceId: meeting.id,
    });

    if (!deduction.success) {
      return { success: false, error: deduction.error || 'Failed to deduct credits' };
    }

    // 3. Fetch existing lead analysis (reuse, don't duplicate)
    // If a cached record exists and is < 24h old, use it.
    // If not, call the live lead-analysis-engine to generate fresh analysis.
    let existingAnalysis = '';
    if (meeting.leadId) {
      try {
        const analysis = await db.leadAnalysis.findUnique({
          where: { leadId: meeting.leadId },
        });

        const CACHE_HOURS = 24;
        const isStale = analysis
          ? (Date.now() - analysis.updatedAt.getTime()) / (1000 * 60 * 60) >= CACHE_HOURS
          : true;

        if (analysis && !isStale) {
          existingAnalysis = `
**Existing Lead Analysis:**
- Lead Score: ${analysis.replyScore}/100
- Conversion Score: ${analysis.dealConversionScore}/100
- Urgency Score: ${analysis.urgencyScore}/100
- Revenue Potential: ${analysis.revenuePotentialScore}/100
- Closing Strategy: ${analysis.closingStrategy || 'Not set'}
- Recommended Services: ${analysis.recommendedServices || 'None'}
- Weaknesses: ${analysis.weaknesses || 'None identified'}
- Estimated Deal Value: ${analysis.estimatedDealValueUsd || 'Unknown'}`;
        } else if (!analysis || isStale) {
          // No recent analysis — call the live engine as fallback
          try {
            const { analyzeLead } = await import('@/lib/ai/lead-analysis-engine');
            const liveResult = await analyzeLead({
              leadId: meeting.leadId,
              userId: meeting.userId,
              force: false,
            });

            if (liveResult.success && liveResult.analysis) {
              const a = liveResult.analysis;
              existingAnalysis = `
**Fresh Lead Analysis (generated just now):**
- Lead Score: ${a.leadScore}/100
- Opportunity Score: ${a.opportunityScore}/100
- Outreach Priority: ${a.outreachPriority}
- Estimated Deal Size: ${a.estimatedDealSize}
- Best Approach: ${a.bestApproach}
- Key Pain Points: ${a.keyPainPoints.join(', ') || 'None identified'}
- Outreach Strategy: ${a.outreachStrategy || 'Not set'}
- Strengths: ${a.strengths.join(', ') || 'None identified'}
- Weaknesses: ${a.weaknesses.join(', ') || 'None identified'}`;
            }
          } catch (engineError) {
            console.warn(`${LOG_PREFIX} Lead analysis engine fallback failed:`, engineError);
            // If engine fails but we have a stale record, use it anyway
            if (analysis) {
              existingAnalysis = `
**Existing Lead Analysis (may be outdated):**
- Lead Score: ${analysis.replyScore}/100
- Conversion Score: ${analysis.dealConversionScore}/100
- Urgency Score: ${analysis.urgencyScore}/100
- Revenue Potential: ${analysis.revenuePotentialScore}/100
- Closing Strategy: ${analysis.closingStrategy || 'Not set'}
- Recommended Services: ${analysis.recommendedServices || 'None'}
- Weaknesses: ${analysis.weaknesses || 'None identified'}
- Estimated Deal Value: ${analysis.estimatedDealValueUsd || 'Unknown'}`;
            }
          }
        }
      } catch { /* non-blocking */ }
    }

    // 4. Fetch recent lead activities for context
    let recentActivities = '';
    if (meeting.leadId) {
      try {
        const activities = await db.leadActivity.findMany({
          where: { leadId: meeting.leadId },
          orderBy: { createdAt: 'desc' },
          take: 5,
        });
        if (activities.length > 0) {
          recentActivities = '\n**Recent Lead Activities:**\n' +
            activities.map(a => `- ${a.type}: ${a.description}`).join('\n');
        }
      } catch { /* non-blocking */ }
    }

    // 5. Build context
    const leadContext = lead ? buildLeadContext(lead) : 'No lead information available';

    // 6. Build prompt
    const systemPrompt = `You are an expert sales meeting preparation assistant. Generate a comprehensive meeting preparation briefing.

Return a JSON object with this exact structure:
{
  "companyOverview": "Brief overview of the lead's company",
  "industryInsights": "Key industry trends and challenges relevant to this meeting",
  "painPoints": ["pain point 1", "pain point 2", ...],
  "decisionMakerProfile": "Profile of the key decision maker if known",
  "competitiveContext": "Competitive landscape and positioning notes",
  "recommendedApproach": "Recommended meeting approach and strategy",
  "talkingPoints": ["point 1", "point 2", ...],
  "anticipatedObjections": ["objection 1", "objection 2", ...],
  "suggestedQuestions": ["question 1", "question 2", ...],
  "dealSizeContext": "Deal size estimate and context"
}

Be specific and actionable. Reference actual company details and pain points.`;

    const userPrompt = `Prepare a briefing for this meeting:

**Meeting:** ${sanitizePromptInput(meeting.title)}
${meeting.description ? `**Description:** ${sanitizePromptInput(meeting.description)}` : ''}

**Lead Profile:**
${sanitizePromptInput(leadContext)}

${existingAnalysis}
${recentActivities}

Generate a detailed preparation briefing with likely objections, suggested talking points, competitor awareness, and deal size context.`;

    // 7. Execute AI completion
    const request: AICompletionRequest = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      config: {
        provider: 'z-ai',
        maxTokens: 4096,
        temperature: 0.7,
        timeout: 45000,
        retries: 2,
      },
    };

    const result = await executeAICompletion(request, meeting.userId, 'meeting_prep');

    if (!result.success || !result.content) {
      await deductCredits({
        userId: meeting.userId,
        action: `${MEETING_AI_ACTION}_refund` as CreditAction,
        cost: -PREP_CREDIT_COST,
        referenceId: meeting.id,
      });
      return { success: false, error: result.error || 'AI meeting prep generation failed' };
    }

    // 8. Parse response
    const parsed = safeParseJSON<MeetingPreparation>(result.content);
    if (!parsed) {
      await deductCredits({
        userId: meeting.userId,
        action: `${MEETING_AI_ACTION}_refund` as CreditAction,
        cost: -PREP_CREDIT_COST,
        referenceId: meeting.id,
      });
      return { success: false, error: 'Failed to parse AI meeting prep response' };
    }

    // 9. Validate and return
    const prep: MeetingPreparation = {
      companyOverview: String(parsed.companyOverview || ''),
      industryInsights: String(parsed.industryInsights || ''),
      painPoints: Array.isArray(parsed.painPoints) ? parsed.painPoints.map(String) : [],
      decisionMakerProfile: parsed.decisionMakerProfile ? String(parsed.decisionMakerProfile) : undefined,
      competitiveContext: parsed.competitiveContext ? String(parsed.competitiveContext) : undefined,
      recommendedApproach: String(parsed.recommendedApproach || ''),
      talkingPoints: Array.isArray(parsed.talkingPoints) ? parsed.talkingPoints.map(String) : [],
      anticipatedObjections: Array.isArray(parsed.anticipatedObjections) ? parsed.anticipatedObjections.map(String) : [],
      suggestedQuestions: Array.isArray(parsed.suggestedQuestions) ? parsed.suggestedQuestions.map(String) : [],
      dealSizeContext: parsed.dealSizeContext ? String(parsed.dealSizeContext) : undefined,
    };

    console.log(`${LOG_PREFIX} Meeting prep generated for meeting ${meeting.id}`);
    return {
      success: true,
      data: prep,
      creditsDeducted: PREP_CREDIT_COST,
      newBalance: deduction.newBalance,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} generateMeetingPrep failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error generating meeting prep',
    };
  }
}

// ===== (c) extractActionItems =====

/**
 * Extract action items from a raw meeting transcript.
 * Uses LLM to identify: action items with owner (user or lead), due dates,
 * priority. Saves extracted items to Meeting.actionItems JSON field.
 *
 * Deducts AI credits via existing credit system.
 */
export async function extractActionItems(
  meetingId: string,
  transcript: string,
  userId: string
): Promise<MeetingAIResult<ActionItem[]>> {
  console.log(`${LOG_PREFIX} extractActionItems called for meeting ${meetingId}`);

  try {
    // 1. Check credit sufficiency
    const sufficiency = await checkCreditSufficiency(userId, ACTION_ITEMS_CREDIT_COST);
    if (!sufficiency.sufficient) {
      return {
        success: false,
        error: `Insufficient credits. Need ${ACTION_ITEMS_CREDIT_COST}, have ${sufficiency.balance}`,
      };
    }

    // 2. Deduct credits
    const deduction = await deductCredits({
      userId,
      action: MEETING_AI_ACTION,
      cost: ACTION_ITEMS_CREDIT_COST,
      referenceId: meetingId,
    });

    if (!deduction.success) {
      return { success: false, error: deduction.error || 'Failed to deduct credits' };
    }

    // 3. Fetch meeting for context
    const meeting = await db.meeting.findFirst({
      where: { id: meetingId, userId },
      include: {
        lead: { select: { ownerName: true, businessName: true } },
      },
    });

    if (!meeting) {
      // Refund since meeting not found
      await deductCredits({
        userId,
        action: `${MEETING_AI_ACTION}_refund` as CreditAction,
        cost: -ACTION_ITEMS_CREDIT_COST,
        referenceId: meetingId,
      });
      return { success: false, error: 'Meeting not found' };
    }

    // 4. Build prompt
    const systemPrompt = `You are an expert meeting analyst. Extract action items from the meeting transcript.

Return a JSON array of action items with this exact structure:
[
  {
    "description": "What needs to be done",
    "assignee": "user" | "lead" | "both",
    "dueDate": "due date if mentioned, otherwise null",
    "priority": "high" | "medium" | "low",
    "category": "follow_up" | "research" | "proposal" | "internal" | "client"
  }
]

Rules:
- "user" means the sales rep (our side), "lead" means the prospect/client
- Only include actual action items, not general statements
- Set priority based on urgency and importance
- Categorize each item appropriately
- If no due date is mentioned, set dueDate to null`;

    const userPrompt = `Extract action items from this meeting:

**Meeting:** ${sanitizePromptInput(meeting.title)}
**Lead:** ${meeting.lead?.businessName || 'Unknown'}${meeting.lead?.ownerName ? ` (${meeting.lead.ownerName})` : ''}
${meeting.description ? `**Description:** ${sanitizePromptInput(meeting.description)}` : ''}

**Transcript:**
${sanitizePromptInput(transcript)}`;

    // 5. Execute AI completion
    const request: AICompletionRequest = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      config: {
        provider: 'z-ai',
        maxTokens: 2048,
        temperature: 0.5,
        timeout: 30000,
        retries: 2,
      },
    };

    const result = await executeAICompletion(request, userId, 'meeting_action_items');

    if (!result.success || !result.content) {
      await deductCredits({
        userId,
        action: `${MEETING_AI_ACTION}_refund` as CreditAction,
        cost: -ACTION_ITEMS_CREDIT_COST,
        referenceId: meetingId,
      });
      return { success: false, error: result.error || 'AI action item extraction failed' };
    }

    // 6. Parse response
    const parsed = safeParseJSON<ActionItem[]>(result.content);
    if (!parsed || !Array.isArray(parsed)) {
      await deductCredits({
        userId,
        action: `${MEETING_AI_ACTION}_refund` as CreditAction,
        cost: -ACTION_ITEMS_CREDIT_COST,
        referenceId: meetingId,
      });
      return { success: false, error: 'Failed to parse AI action items response' };
    }

    // 7. Validate and normalize items
    const actionItems: ActionItem[] = parsed.map((item: Record<string, unknown>) => ({
      description: String(item.description || ''),
      assignee: ['user', 'lead', 'both'].includes(item.assignee as string)
        ? (item.assignee as 'user' | 'lead' | 'both')
        : 'user',
      dueDate: item.dueDate ? String(item.dueDate) : undefined,
      priority: ['high', 'medium', 'low'].includes(item.priority as string)
        ? (item.priority as 'high' | 'medium' | 'low')
        : 'medium',
      category: ['follow_up', 'research', 'proposal', 'internal', 'client'].includes(item.category as string)
        ? (item.category as 'follow_up' | 'research' | 'proposal' | 'internal' | 'client')
        : 'follow_up',
    }));

    // 8. Save to meeting record
    try {
      await db.meeting.update({
        where: { id: meetingId },
        data: { actionItems: actionItems },
      });
    } catch (saveError) {
      console.error(`${LOG_PREFIX} Failed to save action items to meeting:`, saveError);
      // Non-blocking — still return the items
    }

    console.log(`${LOG_PREFIX} Extracted ${actionItems.length} action items from meeting ${meetingId}`);
    return {
      success: true,
      data: actionItems,
      creditsDeducted: ACTION_ITEMS_CREDIT_COST,
      newBalance: deduction.newBalance,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} extractActionItems failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error extracting action items',
    };
  }
}

// ===== (d) generatePostMeetingFollowUp =====

/**
 * Generate a personalized post-meeting follow-up email draft.
 * Includes: thanks, meeting recap summary, action items list, proposed next step.
 * Does NOT send — returns draft for user review.
 *
 * Deducts AI credits via existing credit system.
 */
export async function generatePostMeetingFollowUp(
  meeting: {
    id: string;
    title: string;
    description?: string | null;
    startDateTime: Date;
    endDateTime: Date;
    timezone: string;
    notes?: string | null;
    actionItems?: string | null;
    leadId?: string | null;
    userId: string;
  },
  lead?: {
    businessName: string;
    ownerName?: string | null;
    email?: string | null;
  } | null,
  actionItems?: ActionItem[]
): Promise<MeetingAIResult<FollowUpDraft>> {
  console.log(`${LOG_PREFIX} generatePostMeetingFollowUp called for meeting ${meeting.id}`);

  try {
    // 1. Check credit sufficiency
    const sufficiency = await checkCreditSufficiency(meeting.userId, FOLLOW_UP_CREDIT_COST);
    if (!sufficiency.sufficient) {
      return {
        success: false,
        error: `Insufficient credits. Need ${FOLLOW_UP_CREDIT_COST}, have ${sufficiency.balance}`,
      };
    }

    // 2. Deduct credits
    const deduction = await deductCredits({
      userId: meeting.userId,
      action: 'outreach_message',
      cost: FOLLOW_UP_CREDIT_COST,
      referenceId: meeting.id,
    });

    if (!deduction.success) {
      return { success: false, error: deduction.error || 'Failed to deduct credits' };
    }

    // 3. Build context
    const dateTimeStr = meeting.startDateTime.toLocaleString('en-US', {
      timeZone: meeting.timezone || 'UTC',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    let actionItemsStr = '';
    if (actionItems && actionItems.length > 0) {
      actionItemsStr = '\n**Action Items from Meeting:**\n' +
        actionItems.map(a =>
          `- [${a.priority.toUpperCase()}] ${a.description} (Assignee: ${a.assignee}${a.dueDate ? `, Due: ${a.dueDate}` : ''})`
        ).join('\n');
    } else if (meeting.actionItems) {
      try {
        const parsed = JSON.parse(meeting.actionItems);
        if (Array.isArray(parsed) && parsed.length > 0) {
          actionItemsStr = '\n**Action Items from Meeting:**\n' +
            parsed.map((a: Record<string, unknown>) =>
              `- [${(a.priority as string || 'medium').toUpperCase()}] ${a.description} (Assignee: ${a.assignee || 'user'}${a.dueDate ? `, Due: ${a.dueDate}` : ''})`
            ).join('\n');
        }
      } catch { /* ignore */ }
    }

    // 4. Build prompt
    const systemPrompt = `You are an expert sales follow-up email writer. Generate a professional, personalized follow-up email after a meeting.

Return a JSON object with this exact structure:
{
  "subject": "Email subject line",
  "body": "Email body as plain text"
}

The email should:
- Start with a genuine thank you for the meeting
- Include a brief recap of key discussion points
- List any action items with clear owners and deadlines
- Propose a specific next step
- Be warm but professional
- Be concise (not more than 250 words)
- Reference the lead's company name and specific topics discussed`;

    const userPrompt = `Write a follow-up email for this meeting:

**Meeting:** ${sanitizePromptInput(meeting.title)}
**Date:** ${dateTimeStr}
**Lead:** ${lead?.businessName || 'Unknown'}${lead?.ownerName ? ` (${lead.ownerName})` : ''}
${meeting.description ? `**Description:** ${sanitizePromptInput(meeting.description)}` : ''}
${meeting.notes ? `**Meeting Notes:** ${sanitizePromptInput(meeting.notes)}` : ''}
${actionItemsStr}

Generate a professional follow-up email draft.`;

    // 5. Execute AI completion
    const request: AICompletionRequest = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      config: {
        provider: 'z-ai',
        maxTokens: 2048,
        temperature: 0.8,
        timeout: 30000,
        retries: 2,
      },
    };

    const result = await executeAICompletion(request, meeting.userId, 'meeting_follow_up');

    if (!result.success || !result.content) {
      await deductCredits({
        userId: meeting.userId,
        action: 'outreach_message_refund' as CreditAction,
        cost: -FOLLOW_UP_CREDIT_COST,
        referenceId: meeting.id,
      });
      return { success: false, error: result.error || 'AI follow-up generation failed' };
    }

    // 6. Parse response
    const parsed = safeParseJSON<{ subject: string; body: string }>(result.content);
    if (!parsed || !parsed.subject || !parsed.body) {
      await deductCredits({
        userId: meeting.userId,
        action: 'outreach_message_refund' as CreditAction,
        cost: -FOLLOW_UP_CREDIT_COST,
        referenceId: meeting.id,
      });
      return { success: false, error: 'Failed to parse AI follow-up email response' };
    }

    const draft: FollowUpDraft = {
      subject: String(parsed.subject),
      body: String(parsed.body),
    };

    console.log(`${LOG_PREFIX} Follow-up draft generated for meeting ${meeting.id}`);
    return {
      success: true,
      data: draft,
      creditsDeducted: FOLLOW_UP_CREDIT_COST,
      newBalance: deduction.newBalance,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} generatePostMeetingFollowUp failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error generating follow-up',
    };
  }
}
