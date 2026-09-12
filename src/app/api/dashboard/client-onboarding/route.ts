import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const onboarding = await db.onboardingProgress.findUnique({ where: { userId: user.id } });
      const deals = await db.deal.findMany({
        where: { lead: { userId: user.id }, status: { in: ['won', 'accepted'] } },
        select: { createdAt: true, finalPrice: true, proposedPrice: true, lead: { select: { businessName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const stages = [
        { id: 's1', name: 'Contract Signed', completed: deals.length > 0 },
        { id: 's2', name: 'Welcome Email Sent', completed: deals.length > 0 },
        { id: 's3', name: 'Onboarding Call Scheduled', completed: false },
        { id: 's4', name: 'Initial Setup Complete', completed: false },
        { id: 's5', name: 'First Value Delivered', completed: false },
      ];

      return NextResponse.json({
        data: {
          overallProgress: onboarding ? 50 : 0,
          stages,
          recentOnboardings: deals.map(d => ({
            name: d.lead.businessName,
            value: d.finalPrice ?? d.proposedPrice ?? 0,
            stage: 'Contract Signed',
            startDate: d.createdAt.toISOString(),
          })),
          metrics: {
            totalOnboarded: deals.length,
            avgOnboardingDays: 0,
            completionRate: onboarding ? Math.round(([onboarding.profileCompleted, onboarding.nichesSelected, onboarding.countriesSelected, onboarding.channelsSelected, onboarding.toolsConnected, onboarding.firstLeadAdded, onboarding.firstAnalysisRun].filter(Boolean).length / 7) * 100) : 0,
          },
        },
      });
    } catch (error) {
      console.error('[API] Client onboarding error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch client onboarding' }, { status: 500 });
    }
  });
}
