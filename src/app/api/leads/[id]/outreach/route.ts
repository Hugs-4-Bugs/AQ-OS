import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { canUserAccessLead } from '@/lib/lead-resolution';
import ZAI from 'z-ai-web-dev-sdk';
import {
  buildSenderSignatureBlock,
  applySenderSignatureToFields,
} from '@/lib/ai/sender-signature';
import { loadSenderProfile } from '@/lib/ai/outreach-generator';
import { resolveBusinessContext, buildBusinessContextBlock } from '@/lib/business-profile-server';

// POST /api/leads/[id]/outreach - Generate personalized outreach messages
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
  try {
    const { id } = await params;
    const body = await request.json();
    const { channel } = body;

    const validChannels = ['email', 'whatsapp', 'linkedin', 'instagram'];
    if (!channel || !validChannels.includes(channel)) {
      return NextResponse.json(
        { error: `channel is required. Valid channels: ${validChannels.join(', ')}` },
        { status: 400 }
      );
    }

    const lead = await db.lead.findUnique({
      where: { id },
      include: {
        communications: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // ACCOUNT ISOLATION: generated messages embed the lead's profile and
    // prior communication content — owner / same non-null org only.
    if (!canUserAccessLead(lead, user)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const zai = await ZAI.create();

    // BUSINESS CONTEXT (spec §3/§4): the authenticated user's selected
    // business profile (ownership-checked in resolveBusinessContext; falls
    // back to their default) + optional campaign-specific overrides sent in
    // the request body. This drives WHAT the sender offers — any industry —
    // instead of a hardcoded website/software pitch.
    const { businessProfileId, campaignOverrides } = (body ?? {}) as {
      businessProfileId?: string | null;
      campaignOverrides?: Record<string, string | undefined> | null;
    };
    const businessContext = await resolveBusinessContext(user.id, businessProfileId ?? null, campaignOverrides ?? null).catch((err) => {
      console.error('[LeadOutreach] business context resolution failed (continuing without):', err instanceof Error ? err.message : err);
      return null;
    });

    // SENDER IDENTITY: the authenticated user's own profile (never the
    // lead's, never sample data). Injected into the prompt so the model
    // signs with real details, and every returned string is post-processed
    // so a model-emitted "[Your Name]" placeholder can never survive.
    const senderProfile = await loadSenderProfile(user.id);
    if (businessContext?.companyName) senderProfile.company = businessContext.companyName;
    const senderBlock = buildSenderSignatureBlock(senderProfile);
    const senderBusinessBlock = buildBusinessContextBlock(businessContext);

    // Build context with analysis
    const leadContext = `
Business Name: ${lead.businessName}
Owner: ${lead.ownerName || 'Unknown'}
Website: ${lead.website || 'No website'}
City: ${lead.city || 'Unknown'}, Country: ${lead.country || 'Unknown'}
Niche: ${lead.niche || 'Unknown'}
Digital Weaknesses: ${lead.digitalWeaknesses || 'Not yet analyzed'}
Opportunity Notes: ${lead.opportunityNotes || 'Not yet analyzed'}
Best Channel: ${lead.bestChannel || 'Unknown'}
Outreach Style: ${lead.outreachStyle || 'Unknown'}
Score Reasoning: ${lead.scoreReasoning || 'Not yet analyzed'}
Reply Score: ${lead.replyScore}
Conversion Score: ${lead.conversionScore}
Urgency Score: ${lead.urgencyScore}
Previous Communications: ${lead.communications.length > 0 ? lead.communications.map((c) => `[${c.direction}] ${c.content}`).join('\n') : 'None'}
    `.trim();

    // Channel-specific instructions
    const channelInstructions: Record<string, string> = {
      email: `Write a professional email. Include a compelling subject line. The email should be well-structured with paragraphs. Keep it concise but impactful. End with a clear, low-pressure call to action. Format as: {"subject": "...", "body": "..."}`,
      whatsapp: `Write a WhatsApp message. Keep it short, conversational, and direct. Use a friendly but professional tone. No subject line needed. Format as: {"message": "..."}`,
      linkedin: `Write a LinkedIn connection request message and follow-up. The connection message should be under 300 characters. Include a longer follow-up message. Format as: {"connectionMessage": "...", "followUpMessage": "..."}`,
      instagram: `Write an Instagram DM. Keep it very short, casual, and visual-focused. Instagram messages should feel personal and authentic. Format as: {"message": "..."}`,
    };

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: `You are a world-class business development strategist who writes outreach messages that actually get responses. You write for the SENDER'S OWN business — which can be from ANY industry (wellness, hospitality, retail, consulting, manufacturing, software, marketing, education, …). You NEVER assume the sender sells websites, software, or marketing unless the SENDER BUSINESS CONTEXT says so.

Your messages are:
- Personalized with SPECIFIC, REAL facts about the target business (from the lead context only)
- Clear about what the sender offers (from SENDER BUSINESS CONTEXT) and why it may be relevant to THIS recipient
- Honest: NEVER invent relationships, prior conversations, results, statistics, or recipient problems; do NOT claim the recipient needs a website, redesign, marketing or SEO unless the lead context explicitly shows it
- Free of generic spam language like "I hope this email finds you well" or "synergy" or "revolutionize"
- Concise, human, and respectful of the reader's time
- Ended with the sender's preferred call to action (or a clear, specific, low-pressure one)

${channelInstructions[channel]}

${senderBusinessBlock}

${senderBlock}

Return ONLY valid JSON.`,
        },
        {
          role: 'user',
          content: `Generate a ${channel} outreach message for this lead:\n\n${leadContext}`,
        },
      ],
      thinking: { type: 'disabled' },
    });

    const responseText = completion.choices?.[0]?.message?.content || '';

    let messages: Record<string, string>;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        messages = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse outreach response:', parseError);
      console.error('Raw response:', responseText);
      return NextResponse.json(
        { error: 'Failed to parse AI outreach results' },
        { status: 500 }
      );
    }

    // Signature personalization: replace any placeholder tokens the model
    // still emitted with the user's real profile values (missing fields are
    // omitted cleanly — the lead's own details are never touched).
    messages = applySenderSignatureToFields(messages, senderProfile);

    // Also generate alternative versions
    const altCompletion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: `You are a business outreach specialist. Generate 2 alternative outreach messages for the same lead but with different approaches:
1. A more casual/friendly approach
2. A more data-driven/ROI-focused approach

For each alternative, provide the message in the same format as the original channel.

Return a JSON object: {"casual": {...}, "roi_focused": {...}}

Return ONLY valid JSON.`,
        },
        {
          role: 'user',
          content: `Generate alternative ${channel} outreach messages for this lead:\n\n${leadContext}\n\nOriginal message was: ${JSON.stringify(messages)}`,
        },
      ],
      thinking: { type: 'disabled' },
    });

    const altText = altCompletion.choices?.[0]?.message?.content || '';
    let alternatives: Record<string, Record<string, string>> = {};
    try {
      const jsonMatch = altText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        alternatives = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Alternatives are optional, don't fail
    }

    alternatives = {
      casual: applySenderSignatureToFields(alternatives.casual || {}, senderProfile),
      roi_focused: applySenderSignatureToFields(alternatives.roi_focused || {}, senderProfile),
    };

    return NextResponse.json({
      channel,
      messages,
      alternatives,
    });
  } catch (error) {
    console.error('Error generating outreach:', error);
    return NextResponse.json(
      { error: 'Failed to generate outreach messages' },
      { status: 500 }
    );
  }
  });
}
