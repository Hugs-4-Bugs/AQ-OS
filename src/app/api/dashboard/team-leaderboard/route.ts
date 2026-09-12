import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const period = searchParams.get('period') || 'month';

      // Calculate date range based on period
      const now = new Date();
      let startDate: Date;
      if (period === 'week') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (period === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else {
        startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1); // quarter
      }

      // Get org members if user has an orgId
      const currentUser = await db.user.findUnique({
        where: { id: user.id },
        select: { orgId: true },
      });

      if (!currentUser?.orgId) {
        // Single user — return just their own stats
        const userLeads = await db.lead.count({
          where: { userId: user.id, createdAt: { gte: startDate }, isActive: true },
        });

        const userDeals = await db.deal.findMany({
          where: {
            lead: { userId: user.id },
            createdAt: { gte: startDate },
          },
        });

        const dealsWon = userDeals.filter((d) => d.status === 'won' || d.status === 'closed').length;
        const revenue = userDeals
          .filter((d) => d.status === 'won' || d.status === 'closed')
          .reduce((s, d) => s + (d.finalPrice || 0), 0);

        const team = [{
          id: user.id,
          name: user.name || user.email,
          role: user.role,
          initials: (user.name || user.email).split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
          avatarColor: 'from-violet-500 to-purple-600',
          dealsWon,
          revenue,
          conversionRate: userLeads > 0 ? Math.round((dealsWon / userLeads) * 100) : 0,
          isCurrentUser: true,
        }];

        return NextResponse.json({ data: team });
      }

      // Get all org members
      const orgMembers = await db.orgMember.findMany({
        where: { orgId: currentUser.orgId },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      });

      const team = await Promise.all(
        orgMembers.map(async (member) => {
          const memberLeads = await db.lead.count({
            where: { userId: member.userId, createdAt: { gte: startDate }, isActive: true },
          });

          const memberDeals = await db.deal.findMany({
            where: {
              lead: { userId: member.userId },
              createdAt: { gte: startDate },
            },
          });

          const dealsWon = memberDeals.filter((d) => d.status === 'won' || d.status === 'closed').length;
          const revenue = memberDeals
            .filter((d) => d.status === 'won' || d.status === 'closed')
            .reduce((s, d) => s + (d.finalPrice || 0), 0);
          const conversionRate = memberLeads > 0 ? Math.round((dealsWon / memberLeads) * 100) : 0;

          const name = member.user.name || member.user.email;
          const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

          const gradients = [
            'from-violet-500 to-purple-600',
            'from-emerald-500 to-teal-600',
            'from-amber-500 to-orange-600',
            'from-rose-500 to-pink-600',
            'from-cyan-500 to-sky-600',
            'from-fuchsia-500 to-purple-600',
          ];

          return {
            id: member.userId,
            name,
            role: member.role,
            initials,
            avatarColor: gradients[orgMembers.indexOf(member) % gradients.length],
            dealsWon,
            revenue,
            conversionRate,
            isCurrentUser: member.userId === user.id,
          };
        })
      );

      // Sort by revenue descending
      team.sort((a, b) => b.revenue - a.revenue);

      return NextResponse.json({ data: team });
    } catch (error) {
      console.error('[API] Error fetching team leaderboard:', error);
      return NextResponse.json({ data: [], error: 'Failed to fetch team leaderboard' }, { status: 500 });
    }
  });
}
