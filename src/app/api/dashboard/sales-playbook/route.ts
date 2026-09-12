import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const deals = await db.deal.findMany({
        where: { lead: { userId: user.id } },
        select: { status: true, proposedPrice: true, finalPrice: true, createdAt: true, lead: { select: { businessName: true, niche: true } } },
        orderBy: { createdAt: 'desc' },
      });

      const wonDeals = deals.filter(d => d.status === 'won' || d.status === 'accepted');
      const lostDeals = deals.filter(d => d.status === 'lost' || d.status === 'rejected');
      const totalDealValue = wonDeals.reduce((s, d) => s + (d.finalPrice ?? d.proposedPrice ?? 0), 0);
      const avgDealSize = wonDeals.length > 0 ? totalDealValue / wonDeals.length : 0;
      const winRate = deals.length > 0 ? Math.round((wonDeals.length / deals.length) * 100) : 0;
      const now = new Date();

      // Compute avg cycle days from won deals
      const avgCycleDays = wonDeals.length > 0
        ? Math.round(wonDeals.reduce((s, d) => {
            const diff = now.getTime() - new Date(d.createdAt).getTime();
            return s + Math.max(0, diff / (1000 * 60 * 60 * 24));
          }, 0) / wonDeals.length)
        : 0;

      return NextResponse.json({
        data: {
          playbooks: [
            {
              id: 'p1',
              name: 'Enterprise Deal Playbook',
              stage: 'Discovery',
              winRate: winRate,
              avgDealSize,
              avgCycleDays,
              steps: [],
            },
          ],
          stats: {
            totalDeals: deals.length,
            wonDeals: wonDeals.length,
            lostDeals: lostDeals.length,
            totalDealValue,
            winRate,
            avgDealSize,
          },
          bestPractices: [] as string[],
        },
      });
    } catch (error) {
      console.error('[API] Sales playbook error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch sales playbook' }, { status: 500 });
    }
  });
}
