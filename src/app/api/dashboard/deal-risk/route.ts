import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

function computeRiskLevel(daysInStage: number, stakeholderEngagement: string, budgetConfirmed: boolean): { riskScore: number; riskLevel: 'Low' | 'Medium' | 'High' | 'Critical' } {
  let score = 0;

  // Days in stage scoring
  if (daysInStage > 21) score += 40;
  else if (daysInStage > 14) score += 30;
  else if (daysInStage > 7) score += 15;
  else score += 5;

  // Engagement scoring
  if (stakeholderEngagement === 'low') score += 30;
  else if (stakeholderEngagement === 'medium') score += 15;
  else score += 5;

  // Budget not confirmed
  if (!budgetConfirmed) score += 20;

  // Cap at 100
  score = Math.min(score, 100);

  let riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  if (score >= 70) riskLevel = 'Critical';
  else if (score >= 40) riskLevel = 'High';
  else if (score >= 20) riskLevel = 'Medium';
  else riskLevel = 'Low';

  return { riskScore: score, riskLevel };
}

function computeDaysInStage(createdAt: Date, updatedAt: Date): number {
  const now = new Date();
  return Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
}

function getMitigationTip(riskLevel: string, daysInStage: number, budgetConfirmed: boolean, engagement: string): string {
  if (riskLevel === 'Critical') {
    return 'Escalate to decision-maker immediately. Schedule executive briefing to re-engage stakeholders.';
  }
  if (riskLevel === 'High') {
    if (!budgetConfirmed) return 'Send revised pricing proposal with ROI analysis. Budget holder needs financial justification.';
    return 'Arrange technical demo or detailed walkthrough. Address any remaining concerns.';
  }
  if (riskLevel === 'Medium') {
    return 'Follow up on proposal feedback. Offer flexible terms to accelerate decision.';
  }
  return 'Track approval process. Deal expected to close within normal cycle.';
}

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const deals = await db.deal.findMany({
        where: {
          lead: { userId: user.id },
          status: { notIn: ['won', 'closed_won', 'lost', 'closed_lost'] },
        },
        include: {
          lead: {
            select: {
              businessName: true,
              ownerName: true,
              stage: true,
              conversionScore: true,
              replyScore: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      const dealRisks = deals.map((deal) => {
        const daysInStage = computeDaysInStage(deal.createdAt, deal.updatedAt);
        const engagement = deal.lead.replyScore > 50 ? 'high' : deal.lead.replyScore > 25 ? 'medium' : 'low';
        const budgetConfirmed = deal.finalPrice !== null;
        const { riskScore, riskLevel } = computeRiskLevel(daysInStage, engagement, budgetConfirmed);

        const lastActivityMs = Date.now() - deal.updatedAt.getTime();
        const lastActivityHours = Math.floor(lastActivityMs / (1000 * 60 * 60));
        let lastActivity: string;
        if (lastActivityHours < 1) lastActivity = 'Just now';
        else if (lastActivityHours < 24) lastActivity = `${lastActivityHours}h ago`;
        else lastActivity = `${Math.floor(lastActivityHours / 24)}d ago`;

        return {
          id: deal.id,
          name: deal.projectType ?? 'Untitled Deal',
          company: deal.lead.businessName,
          value: deal.finalPrice ?? deal.proposedPrice ?? 0,
          stage: deal.status,
          riskScore,
          riskLevel,
          daysInStage,
          lastActivity,
          stakeholderEngagement: engagement,
          budgetConfirmed,
          mitigationTip: getMitigationTip(riskLevel, daysInStage, budgetConfirmed, engagement),
        };
      });

      return NextResponse.json({ data: dealRisks });
    } catch (error) {
      console.error('[API] Error fetching deal risks:', error);
      return NextResponse.json(
        { data: [], error: 'Failed to fetch deal risk data' },
        { status: 500 }
      );
    }
  });
}
