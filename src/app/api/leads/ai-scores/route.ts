import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, AuthError } from '@/lib/auth';

// GET /api/leads/ai-scores - AI-generated lead scoring data for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const userId = user.id;

    // Fetch all leads for this user with score fields
    const leads = await db.lead.findMany({
      where: {
        userId,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        businessName: true,
        niche: true,
        city: true,
        country: true,
        stage: true,
        emailStatus: true,
        replyScore: true,
        conversionScore: true,
        urgencyScore: true,
        revenuePotentialScore: true,
        estimatedQuality: true,
        scoreReasoning: true,
        hasWebsite: true,
        websiteQuality: true,
        bestChannel: true,
        bestTiming: true,
        lastContactedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Fetch LeadScore entries for additional detail
    const leadScores = await db.leadScore.findMany({
      where: {
        lead: { userId, isActive: true, deletedAt: null },
      },
      select: {
        id: true,
        leadId: true,
        scoreType: true,
        score: true,
        explanation: true,
        modelVersion: true,
        scoredAt: true,
      },
      orderBy: { scoredAt: 'desc' },
    });

    // If no leads exist, return empty state data
    if (leads.length === 0) {
      return NextResponse.json({
        hasData: false,
        overallScore: 0,
        tier: 'cold' as const,
        trend: 'stable' as const,
        trendChange: 0,
        lastAnalyzed: 'Never',
        analysisVersion: 'v2.4',
        breakdown: [],
        suggestions: [],
        competitorContext: {
          avgScore: 0,
          industryBenchmark: 0,
          percentile: 0,
        },
        scoreDistribution: {
          cold: 0,
          warm: 0,
          hot: 0,
          premium: 0,
        },
        topLeads: [],
        totalLeads: 0,
        leadsWithScores: 0,
      });
    }

    // Filter leads that have at least one score > 0
    const leadsWithScores = leads.filter(
      (l) => l.replyScore > 0 || l.conversionScore > 0 || l.urgencyScore > 0 || l.revenuePotentialScore > 0
    );

    // Compute composite score for each lead (weighted average)
    const SCORE_WEIGHTS = {
      reply: 0.25,
      conversion: 0.25,
      urgency: 0.20,
      revenuePotential: 0.30,
    };

    interface LeadWithComposite {
      id: string;
      businessName: string;
      niche: string | null;
      city: string | null;
      country: string | null;
      stage: string;
      replyScore: number;
      conversionScore: number;
      urgencyScore: number;
      revenuePotentialScore: number;
      compositeScore: number;
      lastContactedAt: Date | null;
    }

    const leadsWithComposite: LeadWithComposite[] = leads.map((lead) => {
      const compositeScore = Math.round(
        lead.replyScore * SCORE_WEIGHTS.reply +
        lead.conversionScore * SCORE_WEIGHTS.conversion +
        lead.urgencyScore * SCORE_WEIGHTS.urgency +
        lead.revenuePotentialScore * SCORE_WEIGHTS.revenuePotential
      );
      return {
        id: lead.id,
        businessName: lead.businessName,
        niche: lead.niche,
        city: lead.city,
        country: lead.country,
        stage: lead.stage,
        replyScore: lead.replyScore,
        conversionScore: lead.conversionScore,
        urgencyScore: lead.urgencyScore,
        revenuePotentialScore: lead.revenuePotentialScore,
        compositeScore,
        lastContactedAt: lead.lastContactedAt,
      };
    });

    // Compute average scores across all leads with scores
    const scoredLeads = leadsWithComposite.filter((l) => l.compositeScore > 0);

    const avgReplyScore = scoredLeads.length > 0
      ? Math.round(scoredLeads.reduce((s, l) => s + l.replyScore, 0) / scoredLeads.length)
      : 0;
    const avgConversionScore = scoredLeads.length > 0
      ? Math.round(scoredLeads.reduce((s, l) => s + l.conversionScore, 0) / scoredLeads.length)
      : 0;
    const avgUrgencyScore = scoredLeads.length > 0
      ? Math.round(scoredLeads.reduce((s, l) => s + l.urgencyScore, 0) / scoredLeads.length)
      : 0;
    const avgRevenuePotentialScore = scoredLeads.length > 0
      ? Math.round(scoredLeads.reduce((s, l) => s + l.revenuePotentialScore, 0) / scoredLeads.length)
      : 0;
    const overallScore = scoredLeads.length > 0
      ? Math.round(scoredLeads.reduce((s, l) => s + l.compositeScore, 0) / scoredLeads.length)
      : 0;

    // Determine tier based on overall score
    let tier: 'cold' | 'warm' | 'hot' | 'premium';
    if (overallScore >= 80) tier = 'premium';
    else if (overallScore >= 65) tier = 'hot';
    else if (overallScore >= 40) tier = 'warm';
    else tier = 'cold';

    // Score distribution
    const scoreDistribution = {
      cold: leadsWithComposite.filter((l) => l.compositeScore < 40).length,
      warm: leadsWithComposite.filter((l) => l.compositeScore >= 40 && l.compositeScore < 65).length,
      hot: leadsWithComposite.filter((l) => l.compositeScore >= 65 && l.compositeScore < 80).length,
      premium: leadsWithComposite.filter((l) => l.compositeScore >= 80).length,
    };

    // Percentile calculation (vs. industry benchmark of ~50)
    const industryBenchmark = 50;
    const percentile = overallScore > 0
      ? Math.min(99, Math.round(50 + (overallScore - industryBenchmark) * 1.2))
      : 0;

    // Compute trend based on recently scored vs older leads
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentScores = leadScores.filter((ls) => new Date(ls.scoredAt) >= oneWeekAgo);
    const olderScores = leadScores.filter((ls) => new Date(ls.scoredAt) < oneWeekAgo);

    let trend: 'up' | 'down' | 'stable' = 'stable';
    let trendChange = 0;

    if (recentScores.length > 0 && olderScores.length > 0) {
      const recentAvg = recentScores.reduce((s, ls) => s + ls.score, 0) / recentScores.length;
      const olderAvg = olderScores.reduce((s, ls) => s + ls.score, 0) / olderScores.length;
      trendChange = Math.round(recentAvg - olderAvg);
      if (trendChange > 3) trend = 'up';
      else if (trendChange < -3) trend = 'down';
    }

    // Determine last analyzed time
    const lastScoredAt = leadScores.length > 0
      ? leadScores[0].scoredAt
      : null;
    const lastAnalyzed = lastScoredAt
      ? getRelativeTime(lastScoredAt)
      : leads.length > 0
        ? getRelativeTime(leads[0].updatedAt)
        : 'Never';

    // Build breakdown
    const breakdown = [
      {
        category: 'Reply Probability',
        score: avgReplyScore,
        weight: SCORE_WEIGHTS.reply,
        weightedScore: Math.round(avgReplyScore * SCORE_WEIGHTS.reply * 100) / 100,
        details: buildReplyDetails(leads, avgReplyScore),
      },
      {
        category: 'Conversion Potential',
        score: avgConversionScore,
        weight: SCORE_WEIGHTS.conversion,
        weightedScore: Math.round(avgConversionScore * SCORE_WEIGHTS.conversion * 100) / 100,
        details: buildConversionDetails(leads, avgConversionScore),
      },
      {
        category: 'Revenue Potential',
        score: avgRevenuePotentialScore,
        weight: SCORE_WEIGHTS.revenuePotential,
        weightedScore: Math.round(avgRevenuePotentialScore * SCORE_WEIGHTS.revenuePotential * 100) / 100,
        details: buildRevenueDetails(leads, avgRevenuePotentialScore),
      },
      {
        category: 'Urgency Signals',
        score: avgUrgencyScore,
        weight: SCORE_WEIGHTS.urgency,
        weightedScore: Math.round(avgUrgencyScore * SCORE_WEIGHTS.urgency * 100) / 100,
        details: buildUrgencyDetails(leads, avgUrgencyScore, leadScores),
      },
    ];

    // Build AI suggestions based on score patterns
    const suggestions = buildSuggestions(scoredLeads, avgReplyScore, avgConversionScore, avgUrgencyScore, avgRevenuePotentialScore, leads);

    // Top leads (sorted by composite score)
    const topLeads = leadsWithComposite
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, 5)
      .map((l) => ({
        id: l.id,
        businessName: l.businessName,
        niche: l.niche,
        compositeScore: l.compositeScore,
        stage: l.stage,
      }));

    // Build score explanation lookup from LeadScore entries
    const scoreExplanations: Record<string, string[]> = {};
    for (const ls of leadScores) {
      if (ls.explanation) {
        if (!scoreExplanations[ls.leadId]) {
          scoreExplanations[ls.leadId] = [];
        }
        scoreExplanations[ls.leadId].push(`${ls.scoreType}: ${ls.explanation}`);
      }
    }

    return NextResponse.json({
      hasData: scoredLeads.length > 0,
      overallScore,
      tier,
      trend,
      trendChange,
      lastAnalyzed,
      analysisVersion: 'v2.4',
      breakdown,
      suggestions,
      competitorContext: {
        avgScore: Math.round(industryBenchmark * 1.1), // slightly above benchmark
        industryBenchmark,
        percentile,
      },
      scoreDistribution,
      topLeads,
      totalLeads: leads.length,
      leadsWithScores: scoredLeads.length,
      scoreExplanations,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('Error fetching AI lead scores:', error);
    return NextResponse.json(
      { error: 'Failed to fetch AI lead scores' },
      { status: 500 }
    );
  }
}

// ─── Helper Functions ──────────────────────────────────────────────

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(date).toLocaleDateString();
}

function buildReplyDetails(
  leads: { replyScore: number; emailStatus: string | null; bestChannel: string | null }[],
  avgScore: number
): string[] {
  const details: string[] = [];

  const leadsWithEmail = leads.filter((l) => l.emailStatus && l.emailStatus !== 'none');
  const openedLeads = leads.filter((l) => l.emailStatus === 'opened');
  const repliedLeads = leads.filter((l) => l.emailStatus === 'replied');

  if (leadsWithEmail.length > 0) {
    details.push(`${leadsWithEmail.length} leads with active email outreach`);
  }
  if (repliedLeads.length > 0) {
    details.push(`${repliedLeads.length} leads have already replied to outreach`);
  }
  if (openedLeads.length > 0) {
    details.push(`${openedLeads.length} leads have opened emails (opportunity to follow up)`);
  }

  const bestChannel = leads.find((l) => l.bestChannel)?.bestChannel;
  if (bestChannel) {
    details.push(`Best performing channel: ${bestChannel}`);
  }

  if (avgScore >= 70) {
    details.push('Reply probability is above average — strong outreach potential');
  } else if (avgScore >= 40) {
    details.push('Moderate reply probability — consider improving personalization');
  } else {
    details.push('Low reply probability — review outreach strategy and timing');
  }

  if (details.length === 0) {
    details.push('No reply data available yet — start outreach to generate scores');
  }

  return details.slice(0, 4);
}

function buildConversionDetails(
  leads: { conversionScore: number; stage: string; hasWebsite: boolean }[],
  avgScore: number
): string[] {
  const details: string[] = [];

  const leadsInPipeline = leads.filter((l) =>
    ['interested', 'discussion', 'proposal', 'negotiation'].includes(l.stage)
  );
  const wonLeads = leads.filter((l) => l.stage === 'won');
  const leadsWithWebsite = leads.filter((l) => l.hasWebsite);

  if (leadsInPipeline.length > 0) {
    details.push(`${leadsInPipeline.length} leads actively in the conversion pipeline`);
  }
  if (wonLeads.length > 0) {
    details.push(`${wonLeads.length} leads already converted — proven model`);
  }
  if (leadsWithWebsite.length > 0) {
    details.push(`${leadsWithWebsite.length} leads with websites (higher conversion potential)`);
  }

  if (avgScore >= 70) {
    details.push('Strong conversion indicators detected across leads');
  } else if (avgScore >= 40) {
    details.push('Moderate conversion potential — focus on high-intent leads');
  } else {
    details.push('Conversion signals are weak — nurture leads before pushing to close');
  }

  if (details.length === 0) {
    details.push('No conversion data available — advance leads through pipeline');
  }

  return details.slice(0, 4);
}

function buildRevenueDetails(
  leads: { revenuePotentialScore: number; niche: string | null; estimatedQuality: string | null }[],
  avgScore: number
): string[] {
  const details: string[] = [];

  // Group by niche to find high-value verticals
  const nicheMap = new Map<string, number>();
  for (const l of leads) {
    if (l.niche) {
      nicheMap.set(l.niche, (nicheMap.get(l.niche) || 0) + 1);
    }
  }
  const topNiches = [...nicheMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  if (topNiches.length > 0) {
    details.push(`Top verticals: ${topNiches.map(([n]) => n).join(', ')}`);
  }

  const highRevenue = leads.filter((l) => l.revenuePotentialScore >= 70);
  if (highRevenue.length > 0) {
    details.push(`${highRevenue.length} leads with high revenue potential identified`);
  }

  if (avgScore >= 70) {
    details.push('Revenue potential is strong across your lead portfolio');
  } else if (avgScore >= 40) {
    details.push('Mixed revenue potential — prioritize high-value leads');
  } else {
    details.push('Revenue potential needs assessment — enrich lead data');
  }

  const totalLeads = leads.length;
  if (totalLeads > 0) {
    details.push(`Portfolio of ${totalLeads} leads with varying deal sizes`);
  }

  if (details.length === 0) {
    details.push('No revenue data available — analyze leads to estimate value');
  }

  return details.slice(0, 4);
}

function buildUrgencyDetails(
  leads: { urgencyScore: number; stage: string; lastContactedAt: Date | null; bestTiming: string | null }[],
  avgScore: number,
  _leadScores: { scoreType: string; score: number; explanation: string | null }[]
): string[] {
  const details: string[] = [];

  const urgentLeads = leads.filter((l) => l.urgencyScore >= 70);
  if (urgentLeads.length > 0) {
    details.push(`${urgentLeads.length} leads showing high urgency signals`);
  }

  const recentlyContacted = leads.filter((l) => {
    if (!l.lastContactedAt) return false;
    const diff = Date.now() - new Date(l.lastContactedAt).getTime();
    return diff < 7 * 24 * 60 * 60 * 1000;
  });
  if (recentlyContacted.length > 0) {
    details.push(`${recentlyContacted.length} leads contacted in the last 7 days`);
  }

  const bestTiming = leads.find((l) => l.bestTiming)?.bestTiming;
  if (bestTiming) {
    details.push(`Optimal contact window: ${bestTiming}`);
  }

  if (avgScore >= 70) {
    details.push('Strong urgency signals — act quickly on these leads');
  } else if (avgScore >= 40) {
    details.push('Moderate urgency — monitor for buying signals');
  } else {
    details.push('Low urgency signals — nurture and wait for triggers');
  }

  if (details.length === 0) {
    details.push('No urgency data available yet');
  }

  return details.slice(0, 4);
}

function buildSuggestions(
  scoredLeads: {
    id: string;
    businessName: string;
    compositeScore: number;
    replyScore: number;
    conversionScore: number;
    urgencyScore: number;
    revenuePotentialScore: number;
    stage: string;
    lastContactedAt: Date | null;
  }[],
  avgReply: number,
  avgConversion: number,
  avgUrgency: number,
  avgRevenue: number,
  allLeads: { id: string; stage: string; emailStatus: string | null; lastContactedAt: Date | null }[]
): Array<{
    id: string;
    type: 'action' | 'warning' | 'insight' | 'opportunity';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    impact: string;
    confidence: number;
    actionable: boolean;
  }> {
  const suggestions: Array<{
    id: string;
    type: 'action' | 'warning' | 'insight' | 'opportunity';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    impact: string;
    confidence: number;
    actionable: boolean;
  }> = [];

  // Suggestion: Follow up on high-engagement leads
  const hotLeads = scoredLeads.filter((l) => l.compositeScore >= 70);
  if (hotLeads.length > 0) {
    suggestions.push({
      id: 's-hot-followup',
      type: 'action',
      priority: 'high',
      title: `Follow up with ${hotLeads.length} hot lead${hotLeads.length > 1 ? 's' : ''}`,
      description: `${hotLeads.length} lead${hotLeads.length > 1 ? 's' : ''} score above 70 — timely follow-up can significantly increase conversion. ${hotLeads.slice(0, 2).map((l) => l.businessName).join(', ')}${hotLeads.length > 2 ? ' and more' : ''}.`,
      impact: `+${Math.min(25, hotLeads.length * 5)}% conversion probability`,
      confidence: 90,
      actionable: true,
    });
  }

  // Suggestion: Improve reply rates
  if (avgReply < 50 && scoredLeads.length > 0) {
    suggestions.push({
      id: 's-reply-improve',
      type: 'insight',
      priority: 'medium',
      title: 'Improve outreach reply rates',
      description: `Average reply score is ${avgReply}/100. Consider personalizing subject lines, adjusting send times, and using multi-channel outreach to boost engagement.`,
      impact: '+15% reply probability',
      confidence: 85,
      actionable: true,
    });
  }

  // Suggestion: Urgent leads at risk
  const urgentStale = scoredLeads.filter(
    (l) => l.urgencyScore >= 60 && l.lastContactedAt && (Date.now() - new Date(l.lastContactedAt).getTime()) > 3 * 24 * 60 * 60 * 1000
  );
  if (urgentStale.length > 0) {
    suggestions.push({
      id: 's-urgent-stale',
      type: 'warning',
      priority: 'high',
      title: `${urgentStale.length} urgent lead${urgentStale.length > 1 ? 's' : ''} going cold`,
      description: `${urgentStale.length} lead${urgentStale.length > 1 ? 's' : ''} with high urgency haven't been contacted in 3+ days. Speed is critical — reach out now before competitors do.`,
      impact: 'Prevent -20% win probability loss',
      confidence: 78,
      actionable: true,
    });
  }

  // Suggestion: Revenue opportunity
  const highRevenue = scoredLeads.filter((l) => l.revenuePotentialScore >= 70);
  if (highRevenue.length > 0) {
    suggestions.push({
      id: 's-revenue-upgrade',
      type: 'opportunity',
      priority: 'low',
      title: `${highRevenue.length} lead${highRevenue.length > 1 ? 's' : ''} with high revenue potential`,
      description: `${highRevenue.length} lead${highRevenue.length > 1 ? 's' : ''} show strong revenue indicators. Consider premium service packages or upsell opportunities.`,
      impact: `+${highRevenue.length * 30}% potential ARR increase`,
      confidence: 72,
      actionable: false,
    });
  }

  // Suggestion: Nurture cold leads
  const coldLeads = scoredLeads.filter((l) => l.compositeScore < 40);
  if (coldLeads.length > 0) {
    suggestions.push({
      id: 's-nurture-cold',
      type: 'insight',
      priority: 'low',
      title: `Nurture ${coldLeads.length} cold lead${coldLeads.length > 1 ? 's' : ''}`,
      description: `${coldLeads.length} leads score below 40. Rather than writing them off, try a long-term nurture sequence with valuable content to warm them up over time.`,
      impact: '+8% long-term conversion',
      confidence: 68,
      actionable: true,
    });
  }

  // Suggestion: Focus on conversion
  if (avgConversion < 50 && scoredLeads.length > 3) {
    suggestions.push({
      id: 's-conversion-focus',
      type: 'action',
      priority: 'medium',
      title: 'Focus on conversion optimization',
      description: `Average conversion score is ${avgConversion}/100. Review your sales pitch, add social proof, and consider offering a free audit or consultation to reduce friction.`,
      impact: '+12% close rate',
      confidence: 82,
      actionable: true,
    });
  }

  // Suggestion: Uncontacted leads
  const uncontactedLeads = allLeads.filter((l) => !l.lastContactedAt && l.stage === 'discovered');
  if (uncontactedLeads.length > 0) {
    suggestions.push({
      id: 's-uncontacted',
      type: 'action',
      priority: 'high',
      title: `${uncontactedLeads.length} discovered lead${uncontactedLeads.length > 1 ? 's' : ''} need outreach`,
      description: `You have ${uncontactedLeads.length} leads still in "discovered" stage with no outreach sent. Start contacting them to generate engagement data and improve scoring accuracy.`,
      impact: '+20% pipeline velocity',
      confidence: 88,
      actionable: true,
    });
  }

  return suggestions;
}
