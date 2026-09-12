import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withDualAuthPermission } from '@/lib/auth-middleware';
import { checkPlanEntitlement } from '@/lib/entitlement-middleware';

// GET /api/competitor — list all competitor analyses
export async function GET(request: NextRequest) {
  return withDualAuthPermission(request, 'competitors:read', async (user, apiKeyInfo) => {
    try {
      // Entitlement check: competitor_analysis feature
      const entitlementCheck = await checkPlanEntitlement(user.id, user.plan, 'competitor_analysis');
      if (!entitlementCheck.allowed) return entitlementCheck.response!;

      // CompetitorAnalysis doesn't have orgId, filter by userId or via Lead relation
      const where: Record<string, unknown> = { userId: user.id };
      const analyses = await db.competitorAnalysis.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json(analyses);
    } catch (error) {
      console.error('Failed to fetch competitor analyses:', error);
      return NextResponse.json({ error: 'Failed to fetch competitor analyses' }, { status: 500 });
    }
  });
}

// POST /api/competitor — create new competitor analysis
export async function POST(request: NextRequest) {
  return withDualAuthPermission(request, 'competitors:write', async (user, apiKeyInfo) => {
    try {
      // Entitlement check: competitor_analysis feature
      const entitlementCheck = await checkPlanEntitlement(user.id, user.plan, 'competitor_analysis');
      if (!entitlementCheck.allowed) return entitlementCheck.response!;

      const body = await request.json();
      const { competitorName, competitorUrl, yourBusinessName, yourWebsiteUrl } = body;

      if (!competitorName || !competitorUrl) {
        return NextResponse.json(
          { error: 'Competitor name and URL are required' },
          { status: 400 }
        );
      }

      // Use AI to generate competitor analysis
      let analysisResult: Record<string, unknown>;

      try {
        const zai = await import('z-ai-web-dev-sdk');
        const client = await zai.default.create();

        const prompt = `You are a competitive intelligence analyst. Analyze the competitor and provide structured insights.

Competitor: ${competitorName}
Competitor Website: ${competitorUrl}
${yourBusinessName ? `Our Business: ${yourBusinessName}` : ''}
${yourWebsiteUrl ? `Our Website: ${yourWebsiteUrl}` : ''}

Provide a comprehensive competitor analysis in the following JSON format:
{
  "seoScore": <number 0-100>,
  "socialScore": <number 0-100>,
  "threatLevel": "<low|medium|high>",
  "strengths": ["<strength1>", "<strength2>", ...],
  "weaknesses": ["<weakness1>", "<weakness2>", ...],
  "opportunities": ["<opportunity1>", "<opportunity2>", ...],
  "threats": ["<threat1>", "<threat2>", ...],
  "techStack": ["<tech1>", "<tech2>", ...],
  "pricingModel": "<description of their pricing model>",
  "estimatedTrafficTier": "<low|medium|high>",
  "differentiationOpportunities": ["<diff1>", "<diff2>", ...]
}

Be specific and actionable. Return ONLY valid JSON, no markdown.`;

        const response = await client.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: 'You are a competitive intelligence analyst. Analyze the competitor and provide structured insights. Always respond with valid JSON only.',
            },
            { role: 'user', content: prompt },
          ],
        });

        const content = response.choices?.[0]?.message?.content || '';
        // Try to parse JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in AI response');
        }
      } catch (aiError) {
        console.error('AI analysis failed:', aiError);
        // When AI analysis fails, return null for computed fields
        // The frontend should display "N/A" or "Analysis unavailable" for these
        analysisResult = {
          seoScore: null,
          socialScore: null,
          threatLevel: null,
          strengths: [],
          weaknesses: [],
          opportunities: [],
          threats: [],
          techStack: [],
          pricingModel: null,
          estimatedTrafficTier: null,
          differentiationOpportunities: [],
        };
      }

      // Extract fields for DB storage
      const seoScore = typeof analysisResult.seoScore === 'number' ? analysisResult.seoScore : null;
      const socialScore = typeof analysisResult.socialScore === 'number' ? analysisResult.socialScore : null;
      const threatLevel = ['low', 'medium', 'high'].includes(analysisResult.threatLevel as string)
        ? (analysisResult.threatLevel as string)
        : null;

      // Store structured data in analysisData JSON field
      const analysisData = JSON.stringify(analysisResult);

      // Use the authenticated user's ID
      const analysis = await db.competitorAnalysis.create({
        data: {
          userId: user.id,
          competitorName,
          competitorUrl,
          techStack: Array.isArray(analysisResult.techStack) ? JSON.stringify(analysisResult.techStack) : null,
          seoScore,
          socialScore,
          strengths: Array.isArray(analysisResult.strengths) ? JSON.stringify(analysisResult.strengths) : null,
          weaknesses: Array.isArray(analysisResult.weaknesses) ? JSON.stringify(analysisResult.weaknesses) : null,
          opportunities: Array.isArray(analysisResult.opportunities) ? JSON.stringify(analysisResult.opportunities) : null,
          threatLevel,
          analysisData,
        },
      });

      return NextResponse.json(analysis, { status: 201 });
    } catch (error) {
      console.error('Failed to create competitor analysis:', error);
      return NextResponse.json(
        { error: 'Failed to create competitor analysis' },
        { status: 500 }
      );
    }
  });
}
