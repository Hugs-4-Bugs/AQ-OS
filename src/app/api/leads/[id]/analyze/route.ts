import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';
import { withAuth } from '@/lib/auth-middleware';
import { checkPlanEntitlement } from '@/lib/entitlement-middleware';

// POST /api/leads/[id]/analyze - Deep AI analysis of a lead
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      // Entitlement check: deep_analysis feature
      const entitlementCheck = await checkPlanEntitlement(user.id, user.plan, 'deep_analysis');
      if (!entitlementCheck.allowed) return entitlementCheck.response!;

      const { id } = await params;

      const lead = await db.lead.findUnique({
        where: { id },
        include: {
          communications: { orderBy: { createdAt: 'desc' } },
          deals: { orderBy: { createdAt: 'desc' } },
        },
      });

      if (!lead) {
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      }

      const zai = await ZAI.create();

      // If lead has a website, search for more info
      let webContext = '';
      if (lead.website) {
        try {
          const searchResults = await zai.functions.invoke('web_search', {
            query: `${lead.businessName} ${lead.website} reviews competitors`,
            num: 5,
          });
          webContext = `\n\nAdditional web research results:\n${JSON.stringify(searchResults)}`;
        } catch (searchError) {
          console.error('Web search failed for lead analysis:', searchError);
        }
      }

      // Build lead context for LLM
      const leadContext = `
Business Name: ${lead.businessName}
Owner: ${lead.ownerName || 'Unknown'}
Website: ${lead.website || 'No website'}
Email: ${lead.email || 'Unknown'}
Phone: ${lead.phone || 'Unknown'}
City: ${lead.city || 'Unknown'}
Country: ${lead.country || 'Unknown'}
Niche: ${lead.niche || 'Unknown'}
Current Stage: ${lead.stage}
Has Website: ${lead.hasWebsite}
Website Quality: ${lead.websiteQuality || 'Unknown'}
Rating: ${lead.rating || 'Unknown'}
Reviews: ${lead.reviews || 'Unknown'}
Estimated Revenue Level: ${lead.estimatedRevenue}
Existing Notes: ${lead.notes || 'None'}
${webContext}
      `.trim();

      // Use LLM for deep analysis
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'assistant',
            content: `You are an expert business acquisition analyst specializing in identifying digital transformation opportunities. Analyze the business lead and provide a comprehensive assessment.

Return a JSON object with EXACTLY these fields:
- replyScore (number 0-100): How likely they will respond to outreach based on their digital maturity and contact availability
- conversionScore (number 0-100): How likely they will become a paying client based on their business needs
- urgencyScore (number 0-100): How urgently they need digital services based on their current gaps
- revenuePotentialScore (number 0-100): Revenue potential based on business size, niche, and market
- scoreReasoning (string): Detailed explanation of WHY each score was assigned, including specific observations
- digitalWeaknesses (array of strings): List of specific digital weaknesses found (e.g., "no website", "outdated website", "no online booking", "no WhatsApp integration", "no chatbot", "poor SEO", "no social media presence", "no Google Maps listing")
- bestContactPerson (string or null): Who to contact and why
- bestChannel (string: "email"|"whatsapp"|"linkedin"|"instagram"|"phone"): Best outreach channel and why
- bestTiming (string): When to reach out for best results
- outreachStyle (string): Recommended outreach approach (e.g., "direct ROI-focused", "casual relationship-building", "authority-positioning", "problem-awareness")
- opportunityNotes (string): Detailed notes about the opportunity, specific problems you identified, and how to position the offer

Be specific and analytical. Reference actual observations about the business. Return ONLY valid JSON.`,
          },
          {
            role: 'user',
            content: `Analyze this business lead for digital acquisition opportunity:\n\n${leadContext}`,
          },
        ],
        thinking: { type: 'disabled' },
      });

      const responseText = completion.choices?.[0]?.message?.content || '';

      let analysis: Record<string, unknown>;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.error('Failed to parse analysis response:', parseError);
        console.error('Raw response:', responseText);
        return NextResponse.json(
          { error: 'Failed to parse AI analysis results' },
          { status: 500 }
        );
      }

      // Update the lead with analysis results
      const updatedLead = await db.lead.update({
        where: { id },
        data: {
          replyScore: Number(analysis.replyScore) || 0,
          conversionScore: Number(analysis.conversionScore) || 0,
          urgencyScore: Number(analysis.urgencyScore) || 0,
          revenuePotentialScore: Number(analysis.revenuePotentialScore) || 0,
          scoreReasoning: String(analysis.scoreReasoning || ''),
          digitalWeaknesses: analysis.digitalWeaknesses
            ? JSON.stringify(analysis.digitalWeaknesses)
            : null,
          bestContactPerson: analysis.bestContactPerson
            ? String(analysis.bestContactPerson)
            : null,
          bestChannel: analysis.bestChannel
            ? String(analysis.bestChannel)
            : null,
          bestTiming: analysis.bestTiming
            ? String(analysis.bestTiming)
            : null,
          outreachStyle: analysis.outreachStyle
            ? String(analysis.outreachStyle)
            : null,
          opportunityNotes: analysis.opportunityNotes
            ? String(analysis.opportunityNotes)
            : null,
          hasWebsite: lead.hasWebsite,
          websiteQuality: analysis.digitalWeaknesses
            ? (Array.isArray(analysis.digitalWeaknesses) &&
              (analysis.digitalWeaknesses as string[]).includes('no website')
              ? 'none'
              : lead.websiteQuality)
            : lead.websiteQuality,
        },
        include: {
          communications: { orderBy: { createdAt: 'desc' } },
          deals: { orderBy: { createdAt: 'desc' } },
        },
      });

      return NextResponse.json({
        lead: updatedLead,
        analysis,
      });
    } catch (error) {
      console.error('Error analyzing lead:', error);
      return NextResponse.json(
        { error: 'Failed to analyze lead' },
        { status: 500 }
      );
    }
  });
}
