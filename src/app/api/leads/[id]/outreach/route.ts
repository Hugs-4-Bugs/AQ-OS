import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

// POST /api/leads/[id]/outreach - Generate personalized outreach messages
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const zai = await ZAI.create();

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
          content: `You are a world-class business development strategist who writes outreach messages that actually get responses. Your messages are:
- Highly personalized and reference SPECIFIC observations about the target business
- Mention actual business problems you've identified (not generic pain points)
- Explain the concrete business impact of those problems
- Sound human, intelligent, and ROI-focused
- NEVER use generic spam language like "I hope this email finds you well" or "synergy" or "revolutionize"
- Show you've done your homework on their business
- Are concise and respect the reader's time
- Have a clear, specific, low-pressure call to action

${channelInstructions[channel]}

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
}
