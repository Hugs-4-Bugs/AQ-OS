import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

// POST /api/leads/[id]/analyze-website - AI Website Analysis
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const lead = await db.lead.findUnique({
      where: { id },
      include: {
        communications: { orderBy: { createdAt: 'desc' }, take: 3 },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (!lead.website) {
      return NextResponse.json(
        { error: 'Lead does not have a website URL' },
        { status: 400 }
      );
    }

    const websiteUrl = lead.website.startsWith('http')
      ? lead.website
      : `https://${lead.website}`;

    // Use LLM to analyze the website based on the URL and business context
    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: `You are an expert web analyst and UX/UI consultant specializing in analyzing business websites for digital transformation opportunities. Based on the website URL and business context provided, generate a comprehensive website analysis.

Since you cannot directly view the website, use the URL structure, domain, business type, niche, and any known information to make educated assessments about the website's likely quality and areas for improvement.

Return a JSON object with EXACTLY these fields:
- uiUxScore (number 0-100): Estimated UI/UX quality score based on the business type and typical patterns in that industry/niche
- mobileResponsiveness (string: "excellent"|"good"|"average"|"poor"): Assessment of mobile responsiveness
- seoAssessment (string: "excellent"|"good"|"average"|"poor"): SEO quality assessment
- contentQuality (string: "excellent"|"good"|"average"|"poor"): Content quality assessment
- ctaEffectiveness (string: "excellent"|"good"|"average"|"poor"): Call-to-action effectiveness
- overallScore (number 0-100): Overall website quality score
- recommendedImprovements (array of objects, each with "priority": "high"|"medium"|"low", "area": string, "suggestion": string): List of recommended improvements, sorted by priority
- analysisSummary (string): A brief 2-3 sentence summary of the website analysis findings

Be realistic and constructive. For businesses in niches known for poor web presence, estimate lower scores. For tech-savvy industries, estimate higher. Always provide actionable improvement suggestions. Return ONLY valid JSON.`,
        },
        {
          role: 'user',
          content: `Analyze this business website for digital improvement opportunities:

**Website URL:** ${websiteUrl}
**Business Name:** ${lead.businessName}
**Owner:** ${lead.ownerName || 'Unknown'}
**Niche/Industry:** ${lead.niche || 'Unknown'}
**Country:** ${lead.country || 'Unknown'}
**City:** ${lead.city || 'Unknown'}
**Current Website Quality:** ${lead.websiteQuality || 'Unknown'}
**Has Website:** ${lead.hasWebsite}
**Digital Weaknesses:** ${lead.digitalWeaknesses || 'Not analyzed'}
**Rating:** ${lead.rating || 'Unknown'}
**Estimated Revenue Level:** ${lead.estimatedRevenue || 'Unknown'}
${lead.communications?.length ? `**Recent Communications Context:** ${lead.communications.map(c => c.content.substring(0, 100)).join('; ')}` : ''}

Provide a comprehensive website analysis with scores and improvement recommendations.`,
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
      console.error('Failed to parse website analysis response:', parseError);
      console.error('Raw response:', responseText);
      return NextResponse.json(
        { error: 'Failed to parse AI website analysis' },
        { status: 500 }
      );
    }

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('Error analyzing website:', error);
    return NextResponse.json(
      { error: 'Failed to analyze website' },
      { status: 500 }
    );
  }
}
