import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

// GET /api/dashboard/team-workload — Fetch team workload data
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const period = searchParams.get('period') || 'week';

      // Get user's org
      const orgMember = await db.orgMember.findFirst({
        where: { userId: user.id },
      });

      if (!orgMember) {
        // Return single-user workload data
        return NextResponse.json(getSingleUserWorkload(user.id, period));
      }

      // Get all org members
      const orgMembers = await db.orgMember.findMany({
        where: { orgId: orgMember.orgId },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      const memberIds = orgMembers.map((m) => m.userId);

      // Get active deals count per member
      const dealsPerMember = await db.lead.groupBy({
        by: ['userId'],
        where: {
          userId: { in: memberIds },
          isActive: true,
          stage: { in: ['contacted', 'qualified', 'proposal', 'negotiation'] },
        },
        _count: true,
      });

      const dealMap = new Map(dealsPerMember.map((d) => [d.userId, d._count]));

      // Build team members
      const colorPool = [
        'from-blue-500 to-indigo-600',
        'from-emerald-500 to-teal-600',
        'from-violet-500 to-purple-600',
        'from-amber-500 to-orange-600',
        'from-pink-500 to-rose-600',
        'from-cyan-500 to-blue-600',
        'from-teal-500 to-emerald-600',
      ];

      const maxCapacity = 6;
      const members = orgMembers.map((m, i) => {
        const activeDeals = dealMap.get(m.userId) || 0;
        const utilization = Math.round((activeDeals / maxCapacity) * 100);
        const status = utilization > 85 ? 'Overloaded' : utilization > 60 ? 'At Capacity' : 'On Track';

        const name = m.user.name || m.user.email.split('@')[0];
        const initials = name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

        const tasks: Array<{ text: string }> = [];
        if (activeDeals > 0) tasks.push({ text: `${activeDeals} active deal${activeDeals !== 1 ? 's' : ''}` });
        if (utilization > 60) tasks.push({ text: 'At capacity' });

        return {
          id: m.userId,
          name,
          initials,
          role: m.role === 'owner' ? 'Senior AE' : m.role === 'admin' ? 'Account Executive' : 'SDR Lead',
          activeDeals,
          maxCapacity,
          utilization: Math.min(utilization, 100),
          tasks,
          status: status as 'On Track' | 'At Capacity' | 'Overloaded',
        };
      });

      // Get task categories from outreach sequences
      const sequences = await db.outreachSequence.findMany({
        where: { userId: { in: memberIds } },
        select: { channel: true, status: true },
      });

      const channelCount: Record<string, number> = {};
      for (const seq of sequences) {
        channelCount[seq.channel] = (channelCount[seq.channel] || 0) + 1;
      }

      const taskCategories = [
        { name: 'Prospecting', count: channelCount['email'] || 0, color: '#06b6d4' },
        { name: 'Follow-ups', count: channelCount['whatsapp'] || 0, color: '#a855f7' },
        { name: 'Proposals', count: Object.values(channelCount).reduce((a, b) => a + b, 0), color: '#f59e0b' },
        { name: 'Meetings', count: channelCount['linkedin'] || 0, color: '#10b981' },
        { name: 'Admin', count: 1, color: '#64748b' },
      ].filter((c) => c.count > 0);

      if (taskCategories.length === 0) {
        taskCategories.push(
          { name: 'Prospecting', count: 0, color: '#06b6d4' },
          { name: 'Follow-ups', count: 0, color: '#a855f7' },
          { name: 'Proposals', count: 0, color: '#f59e0b' },
        );
      }

      // Calculate overall utilization
      const overallUtilization = members.length > 0
        ? Math.round(members.reduce((sum, m) => sum + m.utilization, 0) / members.length)
        : 0;
      const availableCapacity = 100 - overallUtilization;
      const overbooked = members.filter((m) => m.status === 'Overloaded').length;

      // Generate suggested actions based on workload
      const suggestedActions: Array<{ id: string; message: string; priority: 'high' | 'medium' }> = [];
      const overloaded = members.filter((m) => m.status === 'Overloaded');
      const underutilized = members.filter((m) => m.utilization < 50);

      if (overloaded.length > 0 && underutilized.length > 0) {
        suggestedActions.push({
          id: 'sa1',
          message: `Consider reassigning deals from ${overloaded[0].name} to ${underutilized[0].name} for better balance`,
          priority: 'high',
        });
      }

      if (overloaded.length > 0) {
        suggestedActions.push({
          id: 'sa2',
          message: `${overloaded.length} team member${overloaded.length > 1 ? 's are' : ' is'} overloaded — review workload distribution`,
          priority: 'high',
        });
      }

      if (underutilized.length > 0) {
        suggestedActions.push({
          id: 'sa3',
          message: `${underutilized[0].name} has available capacity for more deals`,
          priority: 'medium',
        });
      }

      if (suggestedActions.length === 0) {
        suggestedActions.push({
          id: 'sa0',
          message: 'Team workload is well balanced. Consider scheduling proactive outreach to fill available capacity.',
          priority: 'medium',
        });
      }

      const data = {
        period: period as 'week' | 'month',
        overallUtilization: period === 'month' ? Math.min(overallUtilization + 9, 100) : overallUtilization,
        availableCapacity: period === 'month' ? Math.max(availableCapacity - 9, 0) : availableCapacity,
        overbooked: period === 'month' ? Math.min(overbooked + 1, members.length) : overbooked,
        members,
        taskCategories,
        suggestedActions,
      };

      return NextResponse.json(data);
    } catch (error) {
      console.error('[API] Error fetching team workload data:', error);
      return NextResponse.json(
        getSingleUserWorkload(user.id, 'week'),
        { status: 500 }
      );
    }
  });
}

function getSingleUserWorkload(userId: string, period: string) {
  return {
    period: period as 'week' | 'month',
    overallUtilization: 0,
    availableCapacity: 100,
    overbooked: 0,
    members: [
      {
        id: userId,
        name: 'You',
        initials: 'YO',
        role: 'Owner',
        activeDeals: 0,
        maxCapacity: 6,
        utilization: 0,
        tasks: [] as Array<{ text: string }>,
        status: 'On Track' as const,
      },
    ],
    taskCategories: [
      { name: 'Prospecting', count: 0, color: '#06b6d4' },
      { name: 'Follow-ups', count: 0, color: '#a855f7' },
      { name: 'Proposals', count: 0, color: '#f59e0b' },
    ],
    suggestedActions: [
      { id: 'sa0', message: 'Start adding leads to your pipeline to see team workload insights', priority: 'medium' as const },
    ],
  };
}
