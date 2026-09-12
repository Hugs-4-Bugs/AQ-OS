import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withDualAuthPermission } from '@/lib/auth-middleware';

const STAGE_HEX_COLORS: Record<string, string> = {
  discovered: '#64748b',
  analyzed: '#06b6d4',
  contacted: '#3b82f6',
  replied: '#f59e0b',
  discussion: '#f97316',
  proposal: '#a855f7',
  negotiation: '#ec4899',
  won: '#10b981',
  lost: '#ef4444',
};

const STAGE_LABELS: Record<string, string> = {
  discovered: 'Discovered',
  analyzed: 'Analyzed',
  contacted: 'Contacted',
  replied: 'Replied',
  discussion: 'Discussion',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
};

const FUNNEL_STAGES = ['discovered', 'analyzed', 'contacted', 'replied', 'discussion', 'proposal', 'negotiation', 'won'] as const;

// GET /api/insights - Get insights and recommendations
export async function GET(request: NextRequest) {
  return withDualAuthPermission(request, 'insights:read', async (user, apiKeyInfo) => {
  try {
    // Build org-scoped filter for queries when using API key auth
    // Lead has orgId directly; Communication and Deal are linked through Lead
    const leadOrgFilter = apiKeyInfo?.orgId ? { orgId: apiKeyInfo.orgId } : {};
    // For Communication and Deal, filter via their Lead relation
    const commOrgFilter = apiKeyInfo?.orgId ? { lead: { orgId: apiKeyInfo.orgId } } : {};
    const dealOrgFilter = apiKeyInfo?.orgId ? { lead: { orgId: apiKeyInfo.orgId } } : {};

    const [
      leads,
      communications,
      deals,
    ] = await Promise.all([
      db.lead.findMany({
        where: leadOrgFilter,
        include: {
          communications: { select: { id: true, channel: true, direction: true, createdAt: true } },
          deals: { select: { id: true, proposedPrice: true, finalPrice: true, currency: true, status: true, createdAt: true } },
        },
      }),
      db.communication.findMany({
        where: commOrgFilter,
        select: {
          id: true,
          leadId: true,
          channel: true,
          direction: true,
          intent: true,
          createdAt: true,
        },
      }),
      db.deal.findMany({
        where: dealOrgFilter,
        select: {
          id: true,
          leadId: true,
          proposedPrice: true,
          finalPrice: true,
          currency: true,
          status: true,
          projectType: true,
          createdAt: true,
        },
      }),
    ]);

    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    // --- Best-performing outreach channels ---
    const channelStats: Record<string, { sent: number; replied: number }> = {};
    for (const comm of communications) {
      if (!channelStats[comm.channel]) {
        channelStats[comm.channel] = { sent: 0, replied: 0 };
      }
      if (comm.direction === 'outbound') {
        channelStats[comm.channel].sent++;
      }
      if (comm.direction === 'inbound') {
        channelStats[comm.channel].replied++;
      }
    }
    const bestChannels = Object.entries(channelStats)
      .map(([channel, stats]) => ({
        channel,
        sent: stats.sent,
        replies: stats.replied,
        successRate: stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0,
      }))
      .sort((a, b) => b.successRate - a.successRate);

    // --- Best niches by conversion rate ---
    const nicheStats: Record<string, { total: number; won: number; replied: number }> = {};
    for (const lead of leads) {
      if (!lead.niche) continue;
      if (!nicheStats[lead.niche]) {
        nicheStats[lead.niche] = { total: 0, won: 0, replied: 0 };
      }
      nicheStats[lead.niche].total++;
      if (lead.stage === 'won') nicheStats[lead.niche].won++;
      if (['replied', 'interested', 'discussion', 'proposal', 'negotiation', 'won'].includes(lead.stage)) {
        nicheStats[lead.niche].replied++;
      }
    }
    const conversionByNiche = Object.entries(nicheStats)
      .map(([niche, stats]) => ({
        niche,
        total: stats.total,
        won: stats.won,
        rate: stats.total > 0 ? Math.round((stats.won / stats.total) * 100) : 0,
      }))
      .sort((a, b) => b.rate - a.rate);

    // --- Best countries ---
    const countryStats: Record<string, { total: number; won: number; replied: number }> = {};
    for (const lead of leads) {
      if (!lead.country) continue;
      if (!countryStats[lead.country]) {
        countryStats[lead.country] = { total: 0, won: 0, replied: 0 };
      }
      countryStats[lead.country].total++;
      if (lead.stage === 'won') countryStats[lead.country].won++;
      if (['replied', 'interested', 'discussion', 'proposal', 'negotiation', 'won'].includes(lead.stage)) {
        countryStats[lead.country].replied++;
      }
    }
    const performanceByCountry = Object.entries(countryStats)
      .map(([country, stats]) => ({
        country,
        leads: stats.total,
        won: stats.won,
        conversion: stats.total > 0 ? Math.round((stats.won / stats.total) * 100) : 0,
        replyRate: stats.total > 0 ? Math.round((stats.replied / stats.total) * 100) : 0,
      }))
      .sort((a, b) => b.conversion - a.conversion);

    // --- Stage Funnel ---
    const totalLeadsCount = leads.length || 1;
    const stageFunnel = FUNNEL_STAGES.map((stage) => {
      const count = leads.filter((l) => l.stage === stage).length;
      return {
        stage,
        label: STAGE_LABELS[stage],
        count,
        percentage: Math.round((count / totalLeadsCount) * 100),
        color: STAGE_HEX_COLORS[stage] ?? '#64748b',
      };
    });

    // --- Score Distribution ---
    const scoreDistribution = [
      { range: '0-25', count: leads.filter((l) => l.conversionScore <= 25).length, fill: '#ef4444' },
      { range: '26-50', count: leads.filter((l) => l.conversionScore > 25 && l.conversionScore <= 50).length, fill: '#f59e0b' },
      { range: '51-75', count: leads.filter((l) => l.conversionScore > 50 && l.conversionScore <= 75).length, fill: '#3b82f6' },
      { range: '76-100', count: leads.filter((l) => l.conversionScore > 75).length, fill: '#10b981' },
    ].map((item) => ({
      ...item,
      percentage: leads.length > 0 ? Math.round((item.count / leads.length) * 100) : 0,
    }));

    // --- Weekly Performance (last 8 weeks) ---
    const weeklyPerformance: Array<{ week: string; newLeads: number; dealsClosed: number }> = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - (i * 7 + now.getDay()));
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const newLeads = leads.filter((l) => {
        const d = new Date(l.createdAt);
        return d >= weekStart && d < weekEnd;
      }).length;

      const dealsClosed = deals.filter((d) => {
        const d2 = new Date(d.createdAt);
        return d2 >= weekStart && d2 < weekEnd && d.status === 'accepted';
      }).length;

      weeklyPerformance.push({
        week: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        newLeads,
        dealsClosed,
      });
    }

    // --- Average deal value ---
    const dealsWithPrice = deals.filter((d) => d.proposedPrice !== null);
    const avgDealValue = dealsWithPrice.length > 0
      ? Math.round(
          dealsWithPrice.reduce((sum, d) => sum + (d.proposedPrice || 0), 0) / dealsWithPrice.length
        )
      : 0;

    const closedDealsWithFinalPrice = deals.filter((d) => d.finalPrice !== null && d.status === 'accepted');
    const avgClosedDealValue = closedDealsWithFinalPrice.length > 0
      ? Math.round(
          closedDealsWithFinalPrice.reduce((sum, d) => sum + (d.finalPrice || 0), 0) / closedDealsWithFinalPrice.length
        )
      : 0;

    // --- Reply rate ---
    const leadsWithOutbound = leads.filter((l) =>
      l.communications.some((c) => c.direction === 'outbound')
    );
    const leadsWithInbound = leads.filter((l) =>
      l.communications.some((c) => c.direction === 'inbound')
    );
    const replyRate = leadsWithOutbound.length > 0
      ? Math.round((leadsWithInbound.length / leadsWithOutbound.length) * 100)
      : 0;

    // --- Close rate ---
    const closedLeads = leads.filter((l) => l.stage === 'won' || l.stage === 'lost');
    const wonLeads = leads.filter((l) => l.stage === 'won');
    const closeRate = closedLeads.length > 0
      ? Math.round((wonLeads.length / closedLeads.length) * 100)
      : 0;

    // --- Top leads to contact next ---
    const leadsNotContacted = leads.filter((l) =>
      !l.communications.some((c) => c.direction === 'outbound') &&
      l.stage === 'discovered' &&
      (l.replyScore > 0 || l.conversionScore > 0 || l.urgencyScore > 0)
    );
    const topLeadsToContact = leadsNotContacted
      .sort((a, b) => {
        const scoreA = (a.replyScore + a.conversionScore + a.urgencyScore + a.revenuePotentialScore) / 4;
        const scoreB = (b.replyScore + b.conversionScore + b.urgencyScore + b.revenuePotentialScore) / 4;
        return scoreB - scoreA;
      })
      .slice(0, 10)
      .map((l) => ({
        id: l.id,
        businessName: l.businessName,
        niche: l.niche,
        country: l.country,
        avgScore: Math.round((l.replyScore + l.conversionScore + l.urgencyScore + l.revenuePotentialScore) / 4),
        bestChannel: l.bestChannel,
        conversionScore: l.conversionScore,
        urgencyScore: l.urgencyScore,
        stage: l.stage,
      }));

    // --- Follow-ups needed ---
    const leadsNeedingFollowUp = leads.filter((l) => {
      const outboundComms = l.communications.filter((c) => c.direction === 'outbound');
      if (outboundComms.length === 0) return false;
      const hasInbound = l.communications.some((c) => c.direction === 'inbound');
      if (hasInbound) return false;
      const lastOutbound = outboundComms.reduce((latest, c) =>
        c.createdAt > latest ? c.createdAt : latest, outboundComms[0].createdAt
      );
      return lastOutbound < threeDaysAgo;
    });
    const followUpsNeeded = leadsNeedingFollowUp
      .sort((a, b) => {
        const aLast = a.communications
          .filter((c) => c.direction === 'outbound')
          .reduce((latest, c) => c.createdAt < latest ? c.createdAt : latest, new Date());
        const bLast = b.communications
          .filter((c) => c.direction === 'outbound')
          .reduce((latest, c) => c.createdAt < latest ? c.createdAt : latest, new Date());
        return aLast.getTime() - bLast.getTime();
      })
      .slice(0, 10)
      .map((l) => {
        const outboundComms = l.communications.filter((c) => c.direction === 'outbound');
        const lastContact = outboundComms.reduce((latest, c) =>
          c.createdAt > latest ? c.createdAt : latest, outboundComms[0].createdAt
        );
        const daysSince = Math.floor((now.getTime() - lastContact.getTime()) / (24 * 60 * 60 * 1000));
        return {
          id: l.id,
          businessName: l.businessName,
          niche: l.niche,
          country: l.country,
          lastContacted: lastContact.toISOString(),
          daysSinceContact: daysSince,
          bestChannel: l.bestChannel,
          outreachStyle: l.outreachStyle,
        };
      });

    // --- Urgent opportunities ---
    const urgentOpportunities = leads
      .filter((l) =>
        l.urgencyScore > 70 &&
        !['proposal', 'negotiation', 'won', 'lost'].includes(l.stage)
      )
      .sort((a, b) => b.urgencyScore - a.urgencyScore)
      .slice(0, 10)
      .map((l) => ({
        id: l.id,
        businessName: l.businessName,
        niche: l.niche,
        country: l.country,
        urgencyScore: l.urgencyScore,
        conversionScore: l.conversionScore,
        revenuePotentialScore: l.revenuePotentialScore,
        stage: l.stage,
        opportunityNotes: l.opportunityNotes,
      }));

    // --- AI Recommendations (data-driven) ---
    const recommendations: { id: string; text: string; priority: 'high' | 'medium' | 'low'; icon: string; actionTab?: string }[] = [];

    if (followUpsNeeded.length > 0) {
      recommendations.push({
        id: 'rec-followup',
        text: `${followUpsNeeded.length} lead(s) need follow-up — they haven't replied in 3+ days`,
        priority: 'high',
        icon: 'clock',
        actionTab: 'outreach',
      });
    }

    if (topLeadsToContact.length > 3) {
      recommendations.push({
        id: 'rec-contact',
        text: `${topLeadsToContact.length} high-scoring leads are waiting for first contact`,
        priority: 'high',
        icon: 'phone',
        actionTab: 'outreach',
      });
    }

    const lowConversionNiches = conversionByNiche.filter((n) => n.rate < 10 && n.total >= 2);
    if (lowConversionNiches.length > 0) {
      recommendations.push({
        id: 'rec-niche',
        text: `Low conversion in ${lowConversionNiches.map((n) => n.niche).join(', ')} — consider adjusting approach`,
        priority: 'medium',
        icon: 'target',
        actionTab: 'pipeline',
      });
    }

    if (replyRate < 30 && leadsWithOutbound.length > 0) {
      recommendations.push({
        id: 'rec-reply',
        text: `Reply rate is ${replyRate}% — try different outreach channels or messaging`,
        priority: 'medium',
        icon: 'message',
        actionTab: 'outreach',
      });
    }

    const dealsInNegotiation = deals.filter((d) => d.status === 'negotiation').length;
    if (dealsInNegotiation > 0) {
      recommendations.push({
        id: 'rec-deal',
        text: `${dealsInNegotiation} deal(s) in negotiation — close them this week`,
        priority: 'high',
        icon: 'dollar',
        actionTab: 'deals',
      });
    }

    if (urgentOpportunities.length > 0) {
      recommendations.push({
        id: 'rec-urgent',
        text: `${urgentOpportunities.length} urgent opportunity(ies) with high urgency scores`,
        priority: 'high',
        icon: 'zap',
        actionTab: 'pipeline',
      });
    }

    if (avgDealValue > 0 && avgClosedDealValue > avgDealValue) {
      recommendations.push({
        id: 'rec-value',
        text: `Closed deals average $${avgClosedDealValue.toLocaleString()} — ${Math.round(((avgClosedDealValue - avgDealValue) / avgDealValue) * 100)}% above proposed average`,
        priority: 'low',
        icon: 'trending',
      });
    }

    const bestChannel = bestChannels[0];
    if (bestChannel && bestChannel.successRate > 0) {
      recommendations.push({
        id: 'rec-channel',
        text: `${bestChannel.channel} has the highest reply rate (${bestChannel.successRate}%) — double down on this channel`,
        priority: 'low',
        icon: 'send',
        actionTab: 'outreach',
      });
    }

    // --- Deal pipeline ---
    const dealPipeline = {
      draft: deals.filter((d) => d.status === 'draft').length,
      sent: deals.filter((d) => d.status === 'sent').length,
      reviewed: deals.filter((d) => d.status === 'viewed').length,
      negotiation: deals.filter((d) => d.status === 'negotiation').length,
      accepted: deals.filter((d) => d.status === 'accepted').length,
      rejected: deals.filter((d) => d.status === 'rejected').length,
    };

    // --- Source Effectiveness ---
    const sourceStats: Record<string, { leadCount: number; totalConversionScore: number; totalReplyScore: number; dealsWon: number; pipelineValue: number }> = {};
    for (const lead of leads) {
      const source = lead.source || 'Unknown';
      if (!sourceStats[source]) {
        sourceStats[source] = { leadCount: 0, totalConversionScore: 0, totalReplyScore: 0, dealsWon: 0, pipelineValue: 0 };
      }
      sourceStats[source].leadCount++;
      sourceStats[source].totalConversionScore += lead.conversionScore;
      sourceStats[source].totalReplyScore += lead.replyScore;
      if (lead.stage === 'won') {
        sourceStats[source].dealsWon++;
      }
      // Calculate pipeline value from deals
      const leadDeals = deals.filter((d) => d.leadId === lead.id);
      for (const deal of leadDeals) {
        sourceStats[source].pipelineValue += deal.proposedPrice || 0;
      }
    }
    const sourceEffectiveness = Object.entries(sourceStats)
      .map(([source, stats]) => ({
        source,
        leadCount: stats.leadCount,
        avgConversionScore: stats.leadCount > 0 ? Math.round(stats.totalConversionScore / stats.leadCount) : 0,
        avgReplyScore: stats.leadCount > 0 ? Math.round(stats.totalReplyScore / stats.leadCount) : 0,
        dealsWon: stats.dealsWon,
        pipelineValue: Math.round(stats.pipelineValue),
      }))
      .sort((a, b) => b.pipelineValue - a.pipelineValue);

    // --- Lead Score Heatmap (niche × country) ---
    const heatmapData: Record<string, Record<string, { total: number; totalScore: number; avg: number }>> = {};
    for (const lead of leads) {
      if (!lead.niche || !lead.country) continue;
      if (!heatmapData[lead.niche]) {
        heatmapData[lead.niche] = {};
      }
      if (!heatmapData[lead.niche][lead.country]) {
        heatmapData[lead.niche][lead.country] = { total: 0, totalScore: 0, avg: 0 };
      }
      heatmapData[lead.niche][lead.country].total++;
      heatmapData[lead.niche][lead.country].totalScore += lead.conversionScore;
    }
    // Compute averages
    const leadScoreHeatmap: { niche: string; country: string; avgScore: number; leadCount: number }[] = [];
    for (const [niche, countries] of Object.entries(heatmapData)) {
      for (const [country, data] of Object.entries(countries)) {
        leadScoreHeatmap.push({
          niche,
          country,
          avgScore: data.total > 0 ? Math.round(data.totalScore / data.total) : 0,
          leadCount: data.total,
        });
      }
    }

    // --- Performance Trends (last 7 days vs previous 7 days) ---
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const leadsLast7 = leads.filter((l) => new Date(l.createdAt) >= sevenDaysAgo).length;
    const leadsPrev7 = leads.filter((l) => {
      const d = new Date(l.createdAt);
      return d >= fourteenDaysAgo && d < sevenDaysAgo;
    }).length;
    const leadsTrend = leadsPrev7 > 0 ? Math.round(((leadsLast7 - leadsPrev7) / leadsPrev7) * 100) : (leadsLast7 > 0 ? 100 : 0);

    const dealsLast7 = deals.filter((d) => new Date(d.createdAt) >= sevenDaysAgo && d.status === 'accepted').length;
    const dealsPrev7 = deals.filter((d) => {
      const d2 = new Date(d.createdAt);
      return d2 >= fourteenDaysAgo && d2 < sevenDaysAgo && d.status === 'accepted';
    }).length;
    const dealsTrend = dealsPrev7 > 0 ? Math.round(((dealsLast7 - dealsPrev7) / dealsPrev7) * 100) : (dealsLast7 > 0 ? 100 : 0);

    const commsLast7 = communications.filter((c) => new Date(c.createdAt) >= sevenDaysAgo && c.direction === 'inbound').length;
    const commsPrev7 = communications.filter((c) => {
      const d = new Date(c.createdAt);
      return d >= fourteenDaysAgo && d < sevenDaysAgo && c.direction === 'inbound';
    }).length;
    const replyTrend = commsPrev7 > 0 ? Math.round(((commsLast7 - commsPrev7) / commsPrev7) * 100) : (commsLast7 > 0 ? 100 : 0);

    const pipelineValueLast7 = deals
      .filter((d) => new Date(d.createdAt) >= sevenDaysAgo)
      .reduce((sum, d) => sum + (d.proposedPrice || 0), 0);
    const pipelineValuePrev7 = deals
      .filter((d) => {
        const d2 = new Date(d.createdAt);
        return d2 >= fourteenDaysAgo && d2 < sevenDaysAgo;
      })
      .reduce((sum, d) => sum + (d.proposedPrice || 0), 0);
    const pipelineTrend = pipelineValuePrev7 > 0 ? Math.round(((pipelineValueLast7 - pipelineValuePrev7) / pipelineValuePrev7) * 100) : (pipelineValueLast7 > 0 ? 100 : 0);

    const performanceTrends = {
      leads: { current: leadsLast7, previous: leadsPrev7, trend: leadsTrend },
      deals: { current: dealsLast7, previous: dealsPrev7, trend: dealsTrend },
      reply: { current: commsLast7, previous: commsPrev7, trend: replyTrend },
      pipeline: { current: pipelineValueLast7, previous: pipelineValuePrev7, trend: pipelineTrend },
    };

    return NextResponse.json({
      bestChannels,
      conversionByNiche,
      performanceByCountry,
      stageFunnel,
      scoreDistribution,
      weeklyPerformance,
      avgDealValue,
      avgClosedDealValue,
      replyRate,
      closeRate,
      topLeadsToContact,
      followUpsNeeded,
      urgentOpportunities,
      dealPipeline,
      recommendations,
      sourceEffectiveness,
      leadScoreHeatmap,
      performanceTrends,
      summary: {
        totalLeads: leads.length,
        totalCommunications: communications.length,
        totalDeals: deals.length,
        totalPipelineValue: dealsWithPrice.reduce((sum, d) => sum + (d.proposedPrice || 0), 0),
      },
    });
  } catch (error) {
    console.error('Error fetching insights:', error);
    return NextResponse.json(
      { error: 'Failed to fetch insights' },
      { status: 500 }
    );
  }
  });
}
