// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Outreach Generation Engine
// Phase 8: AI-powered outreach message generation
//
// Generates:
// - Cold emails
// - WhatsApp drafts
// - Telegram drafts
// - LinkedIn messages
// - Follow-ups
// - Sequence steps
//
// Requirements:
// - Tone selection
// - Personalization
// - Language support
// - Regeneration
// - Templates
//
// CRITICAL: ONLY generation. NEVER send messages.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { resolveLeadForExecution } from '@/lib/lead-resolution';
import type { Lead, OutreachMessage } from '@prisma/client';
import { executeAICompletion, type AICompletionRequest, AI_CONFIG } from './ai-provider';
import { getPrompt, sanitizePromptInput } from './prompt-manager';
import { logOutreachGenerated } from './ai-audit';
import { deductCredits, checkCreditSufficiency, refundCredits, type CreditAction } from '@/lib/credit-service';

// ===== TYPES =====

export type OutreachChannel = 'email' | 'whatsapp' | 'telegram' | 'linkedin' | 'instagram';
export type OutreachTone = 'professional' | 'casual' | 'urgent' | 'friendly' | 'formal';

export interface GenerateOutreachInput {
  leadId: string;
  userId: string;
  channel: OutreachChannel;
  tone?: OutreachTone;
  language?: string;
  customInstructions?: string;
  previousMessageId?: string; // For follow-ups
}

export interface OutreachMessageOutput {
  subject?: string; // Email only
  body: string;
  callToAction: string;
  followUpSuggestion: string;
  personalizationPoints: string[];
  toneAnalysis: string;
  estimatedReplyRate: number;
  alternativeVersions: {
    formal: string;
    casual: string;
    urgent: string;
  };
  channel: OutreachChannel;
  tone: OutreachTone;
  leadId: string;
  aiProvider: string;
}

export interface GenerateOutreachResult {
  success: boolean;
  message?: OutreachMessageOutput;
  error?: string;
  creditsDeducted?: number;
  newBalance?: number;
}

// ===== CREDIT COST =====

const OUTREACH_CREDIT_COST = 2;
const OUTREACH_ACTION: CreditAction = 'outreach_message';

// ===== CHANNEL CONSTRAINTS =====

const CHANNEL_CONSTRAINTS: Record<OutreachChannel, { maxWords: number; requiresSubject: boolean }> = {
  email: { maxWords: 200, requiresSubject: true },
  whatsapp: { maxWords: 100, requiresSubject: false },
  telegram: { maxWords: 100, requiresSubject: false },
  linkedin: { maxWords: 150, requiresSubject: false },
  instagram: { maxWords: 80, requiresSubject: false },
};

// ===== MAIN GENERATION FUNCTION =====

export async function generateOutreach(input: GenerateOutreachInput): Promise<GenerateOutreachResult> {
  const { leadId, userId, channel, tone = 'professional', language = 'English', customInstructions, previousMessageId } = input;

  try {
    // 1. Get lead data — single reliable owner-scoped resolution path
    const resolution = await resolveLeadForExecution<Lead & { outreachMessages: OutreachMessage[] }>(userId, leadId, {
      include: {
        outreachMessages: {
          where: { channel },
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
    });

    if (!resolution.ok) {
      return { success: false, error: resolution.userMessage };
    }
    const lead = resolution.lead;

    // 2. Check credits
    const sufficiency = await checkCreditSufficiency(userId, OUTREACH_CREDIT_COST);
    if (!sufficiency.sufficient) {
      return { success: false, error: `Insufficient credits. Need ${OUTREACH_CREDIT_COST}, have ${sufficiency.balance}` };
    }

    // 3. Deduct credits
    const deduction = await deductCredits({
      userId,
      action: OUTREACH_ACTION,
      cost: OUTREACH_CREDIT_COST,
      referenceId: leadId,
    });

    if (!deduction.success) {
      return { success: false, error: deduction.error || 'Failed to deduct credits' };
    }

    // 4. Build context
    const previousMessages = lead.outreachMessages.map(m => `[${m.channel}] ${m.content}`).join('\n');

    const leadContext = [
      `Business: ${lead.businessName}`,
      lead.ownerName ? `Owner: ${lead.ownerName}` : '',
      lead.niche ? `Niche: ${lead.niche}` : '',
      lead.country ? `Country: ${lead.country}` : '',
      lead.city ? `City: ${lead.city}` : '',
      `Stage: ${lead.stage}`,
      lead.website ? `Website: ${lead.website}` : '',
      lead.digitalWeaknesses ? `Weaknesses: ${lead.digitalWeaknesses}` : '',
      lead.opportunityNotes ? `Opportunity: ${lead.opportunityNotes}` : '',
      lead.bestContactPerson ? `Best Contact: ${lead.bestContactPerson}` : '',
      lead.outreachStyle ? `Preferred Style: ${lead.outreachStyle}` : '',
      previousMessages ? `Previous Outreach:\n${previousMessages}` : '',
    ].filter(Boolean).join('\n');

    // 5. Determine if follow-up or initial
    const isFollowUp = !!previousMessageId;
    const promptId = isFollowUp ? 'followup-generation' : 'outreach-generation';

    const prompt = getPrompt(promptId, {
      leadContext: sanitizePromptInput(leadContext),
      businessName: sanitizePromptInput(lead.businessName),
      ownerName: sanitizePromptInput(lead.ownerName || 'Business Owner'),
      niche: sanitizePromptInput(lead.niche || 'Unknown'),
      channel,
      tone,
      language,
      previousMessage: isFollowUp ? 'See context above' : '',
      daysSinceLastContact: lead.lastContactedAt
        ? String(Math.ceil((Date.now() - new Date(lead.lastContactedAt).getTime()) / (1000 * 60 * 60 * 24)))
        : 'Never contacted',
    });

    // 6. Execute AI completion
    const userMessage = customInstructions
      ? `Generate a ${tone} ${channel} outreach message for ${lead.businessName}. Custom instructions: ${sanitizePromptInput(customInstructions)}`
      : `Generate a ${tone} ${channel} outreach message for ${lead.businessName}.`;

    const completionRequest: AICompletionRequest = {
      messages: [
        { role: 'system', content: prompt.content },
        { role: 'user', content: userMessage },
      ],
      config: {
        provider: 'z-ai',
        maxTokens: 2048,
        temperature: 0.8,
        timeout: 30000,
        retries: 2,
      },
    };

    const result = await executeAICompletion(completionRequest, userId, 'outreach_generation');

    if (!result.success || !result.content) {
      await refundCredits({ userId, amount: OUTREACH_CREDIT_COST, originalAction: OUTREACH_ACTION, referenceId: leadId });
      return { success: false, error: result.error || 'AI generation failed' };
    }

    // 7. Parse response
    let outreachData: OutreachMessageOutput;
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');

      const parsed = JSON.parse(jsonMatch[0]);
      const constraints = CHANNEL_CONSTRAINTS[channel];

      outreachData = {
        subject: constraints.requiresSubject ? String(parsed.subject || `Re: ${lead.businessName}`) : undefined,
        body: String(parsed.body || ''),
        callToAction: String(parsed.callToAction || ''),
        followUpSuggestion: String(parsed.followUpSuggestion || ''),
        personalizationPoints: Array.isArray(parsed.personalizationPoints) ? parsed.personalizationPoints.map(String) : [],
        toneAnalysis: String(parsed.toneAnalysis || ''),
        estimatedReplyRate: Math.min(100, Math.max(0, Number(parsed.estimatedReplyRate) || 30)),
        alternativeVersions: parsed.alternativeVersions || {
          formal: String(parsed.body || ''),
          casual: String(parsed.body || ''),
          urgent: String(parsed.body || ''),
        },
        channel,
        tone,
        leadId,
        aiProvider: result.provider,
      };
    } catch (parseError) {
      console.error('[OutreachGenerator] Failed to parse:', parseError);
      await refundCredits({ userId, amount: OUTREACH_CREDIT_COST, originalAction: OUTREACH_ACTION, referenceId: leadId });
      return { success: false, error: 'Failed to parse AI outreach response' };
    }

    // 8. Store as draft outreach message
    await db.outreachMessage.create({
      data: {
        leadId,
        userId,
        channel,
        subject: outreachData.subject,
        content: outreachData.body,
        status: 'draft',
        generatedByAI: true,
        metadata: JSON.stringify({
          tone,
          language,
          callToAction: outreachData.callToAction,
          followUpSuggestion: outreachData.followUpSuggestion,
          personalizationPoints: outreachData.personalizationPoints,
          estimatedReplyRate: outreachData.estimatedReplyRate,
          alternativeVersions: outreachData.alternativeVersions,
          toneAnalysis: outreachData.toneAnalysis,
          aiProvider: result.provider,
        }),
      },
    });

    // 9. Log audit
    await logOutreachGenerated(userId, leadId, {
      channel,
      tone,
      provider: result.provider,
    });

    return {
      success: true,
      message: outreachData,
      creditsDeducted: OUTREACH_CREDIT_COST,
      newBalance: deduction.newBalance,
    };
  } catch (error) {
    console.error('[OutreachGenerator] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Outreach generation failed' };
  }
}

/**
 * Get previous outreach messages for a lead.
 */
export async function getOutreachHistory(leadId: string, channel?: OutreachChannel) {
  const where: Record<string, unknown> = { leadId, generatedByAI: true };
  if (channel) where.channel = channel;

  return db.outreachMessage.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
}
