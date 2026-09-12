import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const leadId = searchParams.get('leadId');

      if (!leadId) {
        // Return scoring breakdown for the user's top leads
        const leads = await db.lead.findMany({
          where: { userId: user.id, isActive: true },
          orderBy: { conversionScore: 'desc' },
          take: 10,
          include: {
            leadScores: { orderBy: { scoredAt: 'desc' } },
            leadAnalysis: true,
          },
        });

        const data = leads.map((lead) => {
          const overallScore = Math.round(
            (lead.replyScore + lead.conversionScore + lead.urgencyScore + lead.revenuePotentialScore) / 4
          );
          const tier = overallScore >= 85 ? 'premium' : overallScore >= 65 ? 'hot' : overallScore >= 40 ? 'warm' : 'cold';
          const analysis = lead.leadAnalysis[0] || null;

          return {
            leadId: lead.id,
            businessName: lead.businessName,
            overallScore,
            tier,
            replyScore: lead.replyScore,
            conversionScore: lead.conversionScore,
            urgencyScore: lead.urgencyScore,
            revenuePotentialScore: lead.revenuePotentialScore,
            scoreReasoning: lead.scoreReasoning,
            stage: lead.stage,
            scores: lead.leadScores.map((s) => ({
              scoreType: s.scoreType,
              score: s.score,
              explanation: s.explanation,
              scoredAt: s.scoredAt.toISOString(),
            })),
            analysis: analysis ? {
              websiteQualityScore: analysis.websiteQualityScore,
              digitalMaturityScore: analysis.digitalMaturityScore,
              replyScore: analysis.replyScore,
              dealConversionScore: analysis.dealConversionScore,
              urgencyScore: analysis.urgencyScore,
              revenuePotentialScore: analysis.revenuePotentialScore,
            } : null,
          };
        });

        return NextResponse.json({ data });
      }

      // Return detailed scoring for a specific lead
      const lead = await db.lead.findFirst({
        where: { id: leadId, userId: user.id },
        include: {
          leadScores: { orderBy: { scoredAt: 'desc' } },
          leadAnalysis: true,
        },
      });

      if (!lead) {
        return NextResponse.json({ data: null, error: 'Lead not found' }, { status: 404 });
      }

      const analysis = lead.leadAnalysis[0] || null;
      const overallScore = Math.round(
        (lead.replyScore + lead.conversionScore + lead.urgencyScore + lead.revenuePotentialScore) / 4
      );
      const tier = overallScore >= 85 ? 'premium' : overallScore >= 65 ? 'hot' : overallScore >= 40 ? 'warm' : 'cold';

      const categories = [
        {
          name: 'Industry Fit',
          score: Math.min(100, Math.max(10, analysis?.dealConversionScore ?? Math.round(lead.conversionScore))),
          weight: 25,
          factors: buildIndustryFitFactors(lead),
        },
        {
          name: 'Revenue Potential',
          score: Math.min(100, Math.max(10, Math.round(lead.revenuePotentialScore))),
          weight: 30,
          factors: buildRevenueFactors(lead),
        },
        {
          name: 'Engagement',
          score: Math.min(100, Math.max(10, Math.round(lead.replyScore))),
          weight: 20,
          factors: buildEngagementFactors(lead),
        },
        {
          name: 'Digital Presence',
          score: Math.min(100, Math.max(10, analysis?.websiteQualityScore ?? 30)),
          weight: 15,
          factors: buildDigitalFactors(lead, analysis),
        },
        {
          name: 'Growth Signals',
          score: Math.min(100, Math.max(10, Math.round(lead.urgencyScore))),
          weight: 10,
          factors: buildGrowthFactors(lead),
        },
      ];

      const recommendations = buildRecommendations(overallScore, lead);

      return NextResponse.json({
        data: {
          leadId: lead.id,
          businessName: lead.businessName,
          overallScore,
          tier,
          categories,
          recommendations,
          lastAnalyzed: analysis?.updatedAt?.toISOString() || lead.updatedAt.toISOString(),
          stage: lead.stage,
          scores: lead.leadScores.map((s) => ({
            scoreType: s.scoreType,
            score: s.score,
            explanation: s.explanation,
            scoredAt: s.scoredAt.toISOString(),
          })),
        },
      });
    } catch (error) {
      console.error('[API] Error fetching lead scoring:', error);
      return NextResponse.json({ data: [], error: 'Failed to fetch lead scoring' }, { status: 500 });
    }
  });
}

function buildIndustryFitFactors(lead: { niche: string | null; estimatedQuality: string | null; estimatedRevenue: string | null }) {
  const nicheScore = lead.niche ? 10 : -5;
  const qualityMap: Record<string, number> = { high: 12, medium: 5, low: -8 };
  const qualityScore = qualityMap[lead.estimatedQuality || 'medium'] ?? 5;

  return [
    { name: 'Niche relevance', impact: nicheScore > 0 ? 'positive' as const : 'negative' as const, value: lead.niche || 'Unknown', delta: nicheScore },
    { name: 'Lead quality', impact: qualityScore > 0 ? 'positive' as const : 'negative' as const, value: lead.estimatedQuality || 'medium', delta: qualityScore },
    { name: 'Market size', impact: 'neutral' as const, value: lead.estimatedRevenue || 'medium', delta: 3 },
  ];
}

function buildRevenueFactors(lead: { revenuePotentialScore: number; estimatedRevenue: string | null; urgencyScore: number }) {
  const revScore = Math.round(lead.revenuePotentialScore);
  return [
    { name: 'Revenue potential', impact: revScore > 50 ? 'positive' as const : 'negative' as const, value: lead.estimatedRevenue || 'medium', delta: revScore > 50 ? 15 : -10 },
    { name: 'Budget signals', impact: revScore > 55 ? 'positive' as const : 'neutral' as const, value: revScore > 55 ? 'Strong' : 'Moderate', delta: revScore > 55 ? 10 : 3 },
    { name: 'Purchase timeline', impact: lead.urgencyScore > 60 ? 'positive' as const : 'negative' as const, value: lead.urgencyScore > 60 ? '< 30 days' : '> 90 days', delta: lead.urgencyScore > 60 ? 12 : -10 },
  ];
}

function buildEngagementFactors(lead: { replyScore: number; emailStatus: string | null; stage: string }) {
  const emailOpened = ['opened', 'replied', 'sent'].includes(lead.emailStatus || '');
  return [
    { name: 'Reply score', impact: lead.replyScore > 50 ? 'positive' as const : 'neutral' as const, value: `${Math.round(lead.replyScore)}%`, delta: Math.round(lead.replyScore > 50 ? lead.replyScore * 0.1 : 0) },
    { name: 'Email status', impact: emailOpened ? 'positive' as const : 'neutral' as const, value: lead.emailStatus || 'none', delta: emailOpened ? 8 : 0 },
    { name: 'Stage progress', impact: lead.stage !== 'discovered' ? 'positive' as const : 'neutral' as const, value: lead.stage, delta: lead.stage !== 'discovered' ? 6 : 0 },
  ];
}

function buildDigitalFactors(lead: { hasWebsite: boolean; websiteQuality: string | null }, analysis: { websiteQualityScore: number; digitalMaturityScore: number } | null) {
  return [
    { name: 'Website quality', impact: lead.hasWebsite ? 'positive' as const : 'negative' as const, value: lead.websiteQuality || 'none', delta: lead.hasWebsite ? 8 : -5 },
    { name: 'Website score', impact: (analysis?.websiteQualityScore ?? 0) > 50 ? 'positive' as const : 'neutral' as const, value: `${analysis?.websiteQualityScore ?? 0}`, delta: (analysis?.websiteQualityScore ?? 0) > 50 ? 10 : 0 },
    { name: 'Digital maturity', impact: (analysis?.digitalMaturityScore ?? 0) > 40 ? 'positive' as const : 'neutral' as const, value: `${analysis?.digitalMaturityScore ?? 0}`, delta: (analysis?.digitalMaturityScore ?? 0) > 40 ? 7 : 0 },
  ];
}

function buildGrowthFactors(lead: { urgencyScore: number; city: string | null; country: string | null }) {
  return [
    { name: 'Urgency signals', impact: lead.urgencyScore > 50 ? 'positive' as const : 'neutral' as const, value: `${Math.round(lead.urgencyScore)}`, delta: lead.urgencyScore > 50 ? 8 : 0 },
    { name: 'Market location', impact: lead.city ? 'positive' as const : 'neutral' as const, value: lead.city || lead.country || 'Unknown', delta: lead.city ? 5 : 0 },
    { name: 'Growth indicators', impact: 'neutral' as const, value: 'Pending analysis', delta: 0 },
  ];
}

function buildRecommendations(overallScore: number, lead: { stage: string; replyScore: number; urgencyScore: number }) {
  const recs: string[] = [];
  if (overallScore < 70) recs.push('Send personalized outreach email highlighting ROI benefits');
  if (overallScore < 50) recs.push('Research company pain points before outreach');
  if (overallScore > 60) recs.push('Schedule a discovery call — high engagement signals detected');
  if (overallScore > 80) recs.push('Fast-track to proposal stage — premium lead quality');
  if (lead.stage === 'replied') recs.push('Follow up within 24 hours to maintain engagement momentum');
  if (lead.replyScore > 65 && lead.urgencyScore > 50) recs.push('Consider offering a free trial or demo to accelerate conversion');
  return recs.slice(0, 4);
}
