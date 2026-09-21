import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';
import { withPermission } from '@/lib/auth-middleware';
import { canUserAccessLead } from '@/lib/lead-resolution';
import { detectMeetingIntent } from '@/lib/meeting-orchestration-service';

// ─── System Prompt Builders ──────────────────────────────────

function buildDefaultSystemPrompt(leadContext: string, currentPage: string): string {
  const pageContext = currentPage
    ? `\n\nThe user is currently viewing the "${currentPage}" tab in AcquisitionOS. Tailor your advice to be relevant to that context.`
    : '';

  return `You are an elite sales strategist and deal-closing expert. You help salespeople navigate complex B2B conversations by analyzing prospect messages and providing actionable, psychologically-informed guidance.${pageContext}

When given a prospect's message (or conversation snippet), you will:

1. ANALYZE the prospect's message:
   - Identify their true intent (curiosity, objection, comparison shopping, urgency, etc.)
   - Detect buying signals (even subtle ones)
   - Detect hesitation, trust issues, or resistance
   - Note pricing resistance or budget concerns
   - Identify power dynamics and decision-making authority cues

2. SUGGEST the best next response:
   - Write an actual suggested response the salesperson can send
   - Make it feel natural, not scripted
   - Address their specific concerns while advancing the sale

3. SUGGEST the psychological approach:
   - What psychological framework to use (authority, social proof, scarcity, reciprocity, etc.)
   - What emotional lever to pull
   - How to frame the value proposition for this specific prospect

4. SUGGEST the closing strategy:
   - What type of close to attempt (assumptive, alternative choice, urgency, summary, etc.)
   - When to push and when to pull back
   - What the next milestone in the sales process should be

Return your analysis as a JSON object with these EXACT fields:
{
  "analysis": {
    "intent": "string - what the prospect really wants/means",
    "buyingSignals": ["array of strings - buying signals detected"],
    "hesitationPoints": ["array of strings - concerns/objections"],
    "trustLevel": "low|medium|high",
    "priceSensitivity": "low|medium|high",
    "decisionAuthority": "decision_maker|influencer|unknown",
    "emotionalState": "string - their emotional state"
  },
  "suggestedResponse": "string - the actual message to send back",
  "psychologicalApproach": {
    "framework": "string - which psychological principle to use",
    "lever": "string - what emotional lever to pull",
    "framing": "string - how to frame the value",
    "rationale": "string - why this approach"
  },
  "closingStrategy": {
    "type": "string - type of close",
    "timing": "string - when to attempt it",
    "nextMilestone": "string - what milestone to aim for",
    "riskAssessment": "string - what could go wrong"
  }
}

Be specific, practical, and actionable. Return ONLY valid JSON.`;
}

function buildSalesCoachSystemPrompt(leadContext: string, currentPage: string): string {
  const pageContext = currentPage
    ? `\n\nThe user is currently viewing the "${currentPage}" tab in AcquisitionOS.`
    : '';

  return `You are an elite Sales Coach AI — a master at analyzing sales conversations, decoding buyer psychology, and crafting winning responses. You specialize in B2B deal coaching.${pageContext}

When given a conversation or message from a prospect, you MUST provide your analysis in this EXACT Markdown format:

## 🎯 Intent Analysis
[Classify as: Positive / Neutral / Negative / Objection — then explain in 1-2 sentences what the prospect truly means and wants]

## 🟢 Buying Signals
- [Signal 1 — be specific about what was said/done]
- [Signal 2]
- [Add more as detected, minimum 1 if any exist]

## 🔴 Hesitation Factors
- [Factor 1 — specific concern or objection]
- [Factor 2]
- [Add more as detected, minimum 1 if any exist]

## 💬 Reply Options
### Professional
[A polished, formal reply suitable for C-suite or enterprise contexts]

### Casual
[A warm, conversational reply for SMB or warmer relationships]

### Urgent
[A direct, urgency-driven reply when time is of the essence]

## 🏁 Closing Strategy
[Specific strategy recommendation: which close to use, when, and why. Include the next milestone and risk assessment.]

## 📊 Deal Probability: X%
[Give a percentage from 0-100, then explain what would increase or decrease it]

IMPORTANT RULES:
- Always use the EXACT format above with the EXACT emoji headers
- The Deal Probability MUST be a number between 0-100
- Each Reply Option should be a complete, sendable message (2-4 sentences)
- Be specific and actionable — no generic advice
- If no buying signals exist, say "None detected in this message"
- If no hesitation factors exist, say "No clear objections at this point"

Return your response as Markdown text (NOT JSON).`;
}

// POST /api/sales-assistant - Live sales assistant, Sales Coach, & AI proposal generation
export async function POST(request: NextRequest) {
  return withPermission(request, 'assistant:read', async (user) => {
  try {
    const body = await request.json();
    const { action, leadId, message, context, salesCoachMode, currentPage, leadContext: clientLeadContext } = body;

    // ─── AI Proposal Generation ────────────────────────────────
    if (action === 'generate_proposal') {
      const { dealId } = body;
      if (!dealId) {
        return NextResponse.json(
          { error: 'dealId is required for proposal generation' },
          { status: 400 }
        );
      }

      // Get deal with lead info
      // ACCOUNT ISOLATION: the deal's lead must belong to the caller —
      // proposal output embeds the lead's correspondence.
      const deal = await db.deal.findUnique({
        where: { id: dealId },
        include: {
          lead: {
            include: {
              communications: { orderBy: { createdAt: 'desc' }, take: 3 },
            },
          },
        },
      });

      if (!deal) {
        return NextResponse.json(
          { error: 'Deal not found' },
          { status: 404 }
        );
      }

      // ACCOUNT ISOLATION: deal's lead must be owned by the caller or in
      // the caller's real org.
      if (!canUserAccessLead(deal.lead, user)) {
        return NextResponse.json(
          { error: 'Deal not found' },
          { status: 404 }
        );
      }

      const lead = deal.lead;
      const businessName = lead?.businessName || 'the business';
      const niche = lead?.niche || 'General';
      const country = lead?.country || 'Unknown';
      const ownerName = lead?.ownerName || 'Business Owner';
      const projectType = deal.projectType || 'Digital Transformation';
      const proposedPrice = deal.proposedPrice || 0;
      const currency = deal.currency || 'USD';

      // Parse scope
      let scopeText = deal.projectScope || 'Full project scope';
      try {
        const parsed = JSON.parse(deal.projectScope || '{}');
        if (parsed.items && Array.isArray(parsed.items)) {
          scopeText = parsed.items.join(', ');
        }
      } catch {
        // Use as-is
      }

      const recentComms = lead?.communications?.length
        ? lead.communications.map((c) => `  [${c.direction} via ${c.channel}] ${c.content.substring(0, 200)}`).join('\n')
        : 'No prior communications';

      const zai = await ZAI.create();

      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'assistant',
            content: `You are an elite business proposal writer with deep expertise in B2B sales, digital transformation, and professional services. You craft compelling, data-driven proposals that convert prospects into clients.

When given deal and business information, generate a professional business proposal in Markdown format with the following EXACT structure:

# Business Proposal: [Project Type] for [Business Name]

## Executive Summary
A compelling 2-3 paragraph overview that captures attention, summarizes the opportunity, and makes the prospect want to read further. Reference specific pain points and the value you'll deliver.

## Problem Statement
Identify 3-4 specific challenges the business is facing based on their digital weaknesses, niche, and market position. Use concrete language and reference their industry context.

## Proposed Solution
Detail the solution with specific deliverables organized as bullet points. Connect each deliverable to a problem identified above. Include technical approach details where relevant.

## Implementation Timeline
Present a phased timeline with specific milestones:
- Phase 1: Discovery & Planning (Week 1-2)
- Phase 2: Design & Development (Week 3-6)
- Phase 3: Testing & Launch (Week 7-8)
- Phase 4: Optimization & Support (Week 9-12)

Adjust timeline based on the project scope and type.

## Investment & ROI
- Total Investment: [Proposed Price] [Currency]
- Break down the investment by phase
- Project ROI with realistic estimates (aim for 3-5x return)
- Time to value estimate

## Next Steps
Clear call-to-action with 3-4 concrete next steps. Include a deadline for response if appropriate.

Make the proposal feel personalized and specific to this business. Use industry-specific language. Be professional yet warm. Do NOT use generic filler - every sentence should add value.`,
          },
          {
            role: 'user',
            content: `Generate a professional business proposal with these details:

**Business Information:**
- Business Name: ${businessName}
- Owner: ${ownerName}
- Niche/Industry: ${niche}
- Country: ${country}
- Digital Weaknesses: ${lead?.digitalWeaknesses || 'Not analyzed'}
- Score Reasoning: ${lead?.scoreReasoning || 'N/A'}
- Opportunity Notes: ${lead?.opportunityNotes || 'N/A'}

**Deal Information:**
- Project Type: ${projectType}
- Project Scope: ${scopeText}
- Proposed Price: ${proposedPrice.toLocaleString()} ${currency}
- Deal Status: ${deal.status}

**Recent Communications:**
${recentComms}

Generate a complete, compelling proposal that this prospect can't ignore.`,
          },
        ],
        thinking: { type: 'disabled' },
      });

      const proposalText = completion.choices?.[0]?.message?.content || '';

      if (!proposalText.trim()) {
        return NextResponse.json(
          { error: 'AI failed to generate proposal content' },
          { status: 500 }
        );
      }

      // Save the proposal content to the deal
      await db.deal.update({
        where: { id: dealId },
        data: { proposalContent: proposalText },
      });

      return NextResponse.json({ proposal: proposalText });
    }

    // ─── Sales Assistant / Sales Coach (default action) ──────
    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 }
      );
    }

    // Get lead details if leadId is provided
    let leadContext = '';
    if (leadId) {
      const lead = await db.lead.findUnique({
        where: { id: leadId },
        include: {
          communications: { orderBy: { createdAt: 'desc' }, take: 5 },
          deals: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });

      // ACCOUNT ISOLATION: the assistant echoes the lead's scores, notes
      // and recent communications — foreign leads must be invisible.
      if (lead && !canUserAccessLead(lead, user)) {
        return NextResponse.json(
          { error: 'Lead not found' },
          { status: 404 }
        );
      }

      if (lead) {
        leadContext = `
Lead Information:
- Business: ${lead.businessName}
- Owner: ${lead.ownerName || 'Unknown'}
- Niche: ${lead.niche || 'Unknown'}
- City: ${lead.city || 'Unknown'}, Country: ${lead.country || 'Unknown'}
- Stage: ${lead.stage}
- Reply Score: ${lead.replyScore}, Conversion Score: ${lead.conversionScore}
- Urgency Score: ${lead.urgencyScore}, Revenue Potential: ${lead.revenuePotentialScore}
- Score Reasoning: ${lead.scoreReasoning || 'N/A'}
- Digital Weaknesses: ${lead.digitalWeaknesses || 'N/A'}
- Opportunity Notes: ${lead.opportunityNotes || 'N/A'}
- Best Channel: ${lead.bestChannel || 'N/A'}
- Outreach Style: ${lead.outreachStyle || 'N/A'}
${lead.communications.length > 0 ? `- Recent Communications:\n${lead.communications.map((c) => `  [${c.direction} via ${c.channel}] ${c.content}`).join('\n')}` : '- No communications yet'}
${lead.deals.length > 0 ? `- Latest Deal: ${lead.deals[0].projectType} - ${lead.deals[0].proposedPrice} ${lead.deals[0].currency} (${lead.deals[0].status})` : '- No deals yet'}
        `.trim();
      }
    } else if (clientLeadContext) {
      // Use client-provided lead context if no leadId
      leadContext = `Lead Context:\n${JSON.stringify(clientLeadContext)}`;
    }

    // Choose system prompt based on mode
    const isSalesCoach = salesCoachMode === true;
    const systemPrompt = isSalesCoach
      ? buildSalesCoachSystemPrompt(leadContext, currentPage || '')
      : buildDefaultSystemPrompt(leadContext, currentPage || '');

    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `${leadContext ? `Context about this lead:\n${leadContext}\n\n` : ''}${context ? `Previous conversation:\n${context}\n\n` : ''}${isSalesCoach ? `Analyze this conversation/message from a prospect:\n` : `The prospect just sent this message:\n`}"${message}"\n\n${isSalesCoach ? 'Provide your full Sales Coach analysis.' : 'Help me respond and close this deal.'}`,
        },
      ],
      thinking: { type: 'disabled' },
    });

    const responseText = completion.choices?.[0]?.message?.content || '';

    if (!responseText.trim()) {
      return NextResponse.json(
        { error: 'AI failed to generate a response' },
        { status: 500 }
      );
    }

    // ─── Meeting Intent Detection (post-processing) ──────────
    let meetingIntent: Record<string, unknown> | undefined;
    try {
      const intentResult = detectMeetingIntent(message);
      if (intentResult.intent && intentResult.confidence > 0.7) {
        meetingIntent = {
          detected: true as const,
          intent: intentResult.intent,
          confidence: intentResult.confidence,
          suggestedAction: intentResult.suggestedAction || '',
          leadId: leadId || undefined,
          suggestSlotsAction: '/api/meetings/suggest-slots',
        };

        // Log the intent detection for analytics
        try {
          await db.meetingIntentLog.create({
            data: {
              userId: user.id,
              leadId: leadId || null,
              sourceType: 'chat',
              sourceId: null,
              detectedIntent: intentResult.intent,
              confidence: intentResult.confidence,
              originalText: message.substring(0, 1000),
              suggestedAction: intentResult.suggestedAction
                ? JSON.stringify({ action: intentResult.suggestedAction })
                : null,
              status: 'detected',
            },
          });
        } catch (logError) {
          console.error('[SalesAssistant] Failed to log meeting intent:', logError);
        }
      }
    } catch (intentError) {
      console.error('[SalesAssistant] Meeting intent detection error:', intentError);
      // Don't fail the main response
    }

    // For Sales Coach mode, return the Markdown directly
    if (isSalesCoach) {
      // Try to extract deal probability from the response
      let dealProbability: number | null = null;
      const probMatch = responseText.match(/Deal Probability:\s*(\d+)%/i);
      if (probMatch) {
        dealProbability = parseInt(probMatch[1], 10);
      }

      return NextResponse.json({
        mode: 'sales_coach',
        content: responseText,
        dealProbability,
        meetingIntent,
      });
    }

    // For default mode, parse as JSON
    let result: Record<string, unknown>;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse sales assistant response:', parseError);
      console.error('Raw response:', responseText);
      return NextResponse.json(
        { error: 'Failed to parse AI analysis' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...result,
      meetingIntent,
    });
  } catch (error) {
    console.error('Error in sales assistant:', error);
    return NextResponse.json(
      { error: 'Failed to get sales assistant analysis' },
      { status: 500 }
    );
  }
  });
}
