import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

// POST /api/leads/[id]/explain-scores - Use AI to explain lead scores
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const lead = await db.lead.findUnique({
      where: { id },
      include: {
        communications: { orderBy: { createdAt: 'desc' }, take: 5 },
        deals: { orderBy: { createdAt: 'desc' }, take: 3 },
        activities: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const zai = await ZAI.create();

    const leadContext = `
Business: ${lead.businessName}
Owner: ${lead.ownerName || 'Unknown'}
Niche: ${lead.niche || 'Unknown'}
Location: ${[lead.city, lead.country].filter(Boolean).join(', ') || 'Unknown'}
Stage: ${lead.stage}
Website: ${lead.hasWebsite ? lead.website || 'Yes' : 'None'}
Website Quality: ${lead.websiteQuality || 'N/A'}
Digital Weaknesses: ${lead.digitalWeaknesses || 'None identified'}
Opportunity Notes: ${lead.opportunityNotes || 'None'}
Best Contact Person: ${lead.bestContactPerson || 'Unknown'}
Best Channel: ${lead.bestChannel || 'Unknown'}
Outreach Style: ${lead.outreachStyle || 'Unknown'}
Score Reasoning: ${lead.scoreReasoning || 'N/A'}
Recent Communications: ${lead.communications.length > 0 ? lead.communications.map(c => `[${c.direction}] ${c.content.substring(0, 100)}`).join('\n') : 'None'}
Deals: ${lead.deals.length > 0 ? lead.deals.map(d => `${d.projectType || 'Unknown'} - ${d.status}`).join(', ') : 'None'}
Recent Activities: ${lead.activities.length > 0 ? lead.activities.map(a => `${a.type}: ${a.description}`).join('\n') : 'None'}
    `.trim();

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: `You are a sales intelligence analyst. Explain WHY a lead has their specific scores based on their data. Be specific, data-driven, and actionable. Format your response in clear markdown with headers for each score area. Keep the analysis concise but insightful.`,
        },
        {
          role: 'user',
          content: `Analyze this lead and explain their scores:

CURRENT SCORES:
- Reply Score: ${lead.replyScore}/100
- Conversion Score: ${lead.conversionScore}/100
- Urgency Score: ${lead.urgencyScore}/100
- Revenue Potential Score: ${lead.revenuePotentialScore}/100

LEAD DATA:
${leadContext}

Please provide:
1. **Reply Score Analysis**: Why is the reply score ${lead.replyScore}? What factors contribute to this rating?
2. **Conversion Score Analysis**: Why is the conversion score ${lead.conversionScore}? What signals support this?
3. **Urgency Score Analysis**: Why is the urgency score ${lead.urgencyScore}? What indicates urgency (or lack thereof)?
4. **Revenue Potential Analysis**: Why is the revenue potential score ${lead.revenuePotentialScore}? What drives this estimate?
5. **Key Recommendation**: What's the single most important action to take with this lead?`,
        },
      ],
      thinking: { type: 'disabled' },
    });

    const explanation = completion.choices?.[0]?.message?.content || 'Unable to generate score explanation.';

    // Create activity for this analysis
    await db.leadActivity.create({
      data: {
        leadId: id,
        type: 'score_updated',
        description: 'AI score explanation generated',
        metadata: JSON.stringify({
          replyScore: lead.replyScore,
          conversionScore: lead.conversionScore,
          urgencyScore: lead.urgencyScore,
          revenuePotentialScore: lead.revenuePotentialScore,
        }),
      },
    });

    return NextResponse.json({ explanation });
  } catch (error) {
    console.error('Error explaining scores:', error);
    return NextResponse.json(
      { error: 'Failed to explain scores' },
      { status: 500 }
    );
  }
}
