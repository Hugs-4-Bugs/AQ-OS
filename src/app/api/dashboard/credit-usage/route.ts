import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

// Map credit actions to categories
const ACTION_CATEGORY_MAP: Record<string, { name: string; color: string; bgClass: string; icon: string }> = {
  lead_discovery: { name: 'Lead Discovery', color: 'text-rose-500', bgClass: 'bg-rose-500', icon: 'Zap' },
  deep_analysis: { name: 'AI Scoring', color: 'text-violet-500', bgClass: 'bg-violet-500', icon: 'Sparkles' },
  website_analysis: { name: 'Website Analysis', color: 'text-sky-500', bgClass: 'bg-sky-500', icon: 'Globe' },
  outreach_generation: { name: 'Outreach', color: 'text-emerald-500', bgClass: 'bg-emerald-500', icon: 'TrendingUp' },
  outreach_message: { name: 'Outreach', color: 'text-emerald-500', bgClass: 'bg-emerald-500', icon: 'TrendingUp' },
  deal_analysis: { name: 'Deal Analysis', color: 'text-amber-500', bgClass: 'bg-amber-500', icon: 'BarChart3' },
  proposal_generation: { name: 'Deal Analysis', color: 'text-amber-500', bgClass: 'bg-amber-500', icon: 'BarChart3' },
  monthly_renewal: { name: 'Monthly Renewal', color: 'text-emerald-500', bgClass: 'bg-emerald-500', icon: 'TrendingUp' },
  free_monthly_reset: { name: 'Monthly Reset', color: 'text-sky-500', bgClass: 'bg-sky-500', icon: 'Globe' },
  data_export: { name: 'Data Export', color: 'text-sky-500', bgClass: 'bg-sky-500', icon: 'Globe' },
  sales_coaching: { name: 'AI Scoring', color: 'text-violet-500', bgClass: 'bg-violet-500', icon: 'Sparkles' },
  competitor_analysis: { name: 'Deal Analysis', color: 'text-amber-500', bgClass: 'bg-amber-500', icon: 'BarChart3' },
  credit_purchase: { name: 'Credit Purchase', color: 'text-emerald-500', bgClass: 'bg-emerald-500', icon: 'TrendingUp' },
};

function getPeriodDates(period: string): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  switch (period) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'week':
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      break;
    case 'month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    default:
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
  }

  return { start, end };
}

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const period = searchParams.get('period') ?? 'week';

      const { start, end } = getPeriodDates(period);

      // Fetch credit ledger entries for the period
      const ledgerEntries = await db.creditsLedger.findMany({
        where: {
          userId: user.id,
          createdAt: { gte: start, lte: end },
          credits: { lt: 0 }, // Only deductions (usage)
        },
      });

      // Aggregate usage by category
      const categoryMap: Record<string, number> = {};
      for (const entry of ledgerEntries) {
        const cat = ACTION_CATEGORY_MAP[entry.action];
        const key = cat?.name ?? entry.action;
        categoryMap[key] = (categoryMap[key] ?? 0) + Math.abs(entry.credits);
      }

      // Build usage data array
      const usageData = Object.entries(categoryMap).map(([name, credits]) => {
        const cat = Object.values(ACTION_CATEGORY_MAP).find((c) => c.name === name);
        return {
          name,
          credits,
          color: cat?.color ?? 'text-slate-500',
          bgClass: cat?.bgClass ?? 'bg-slate-500',
          icon: cat?.icon ?? 'Activity',
        };
      }).sort((a, b) => b.credits - a.credits);

      // Fetch user's credit info
      const userData = await db.user.findUnique({
        where: { id: user.id },
        select: { credits: true, creditsMonthly: true, plan: true },
      });

      // Fetch subscription for more accurate total
      const subscription = await db.subscription.findFirst({
        where: { userId: user.id, status: { in: ['active', 'trialing'] } },
        select: { creditsTotal: true, creditsRemaining: true, creditsUsed: true },
      });

      const totalCredits = subscription?.creditsTotal ?? userData?.creditsMonthly ?? 50;
      const remainingCredits = subscription?.creditsRemaining ?? userData?.credits ?? 0;

      return NextResponse.json({
        data: {
          usageData,
          totalCredits,
          remainingCredits,
          currentCredits: remainingCredits,
          plan: userData?.plan ?? 'free',
        },
      });
    } catch (error) {
      console.error('[API] Error fetching credit usage:', error);
      return NextResponse.json(
        { data: { usageData: [], totalCredits: 50, remainingCredits: 50, currentCredits: 50, plan: 'free' }, error: 'Failed to fetch credit usage' },
        { status: 500 }
      );
    }
  });
}
