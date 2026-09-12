import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const dateRange = searchParams.get('dateRange') ?? '30d';
      const actionFilter = searchParams.get('action') ?? 'all';
      const entityFilter = searchParams.get('entity') ?? 'all';

      // Calculate date range
      const now = new Date();
      const startDate = new Date(now);
      switch (dateRange) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        default:
          startDate.setDate(startDate.getDate() - 30);
      }

      // Build where clause
      const where: Record<string, unknown> = {
        userId: user.id,
        createdAt: { gte: startDate },
      };

      if (actionFilter !== 'all') {
        where.action = actionFilter;
      }

      if (entityFilter !== 'all') {
        where.resource = entityFilter;
      }

      // Fetch audit logs
      const auditLogs = await db.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      // Map action types
      const actionMap: Record<string, 'create' | 'update' | 'delete' | 'login' | 'export'> = {
        login: 'login',
        logout: 'login',
        plan_change: 'update',
        gmail_connect: 'update',
        email_sent: 'create',
        lead_created: 'create',
        lead_updated: 'update',
        lead_deleted: 'delete',
        deal_created: 'create',
        deal_updated: 'update',
        deal_deleted: 'delete',
        data_export: 'export',
        export: 'export',
      };

      // Get unique users for filter dropdown
      const usersMap = new Map<string, { id: string; name: string; avatar: string; role: string }>();
      for (const log of auditLogs) {
        if (!usersMap.has(log.userId)) {
          const name = log.user.name ?? log.user.email;
          usersMap.set(log.userId, {
            id: log.userId,
            name,
            avatar: name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2),
            role: log.user.role,
          });
        }
      }
      const users = Array.from(usersMap.values());

      // Format audit entries
      const entries = auditLogs.map((log) => {
        const userName = log.user.name ?? log.user.email;
        const initials = userName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
        const action = actionMap[log.action] ?? 'update';
        const date = log.createdAt;
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        let dateLabel: string;
        if (date.toDateString() === today.toDateString()) dateLabel = 'Today';
        else if (date.toDateString() === yesterday.toDateString()) dateLabel = 'Yesterday';
        else dateLabel = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        // Parse details for description
        let description = log.action.replace(/_/g, ' ');
        try {
          if (log.details) {
            const details = JSON.parse(log.details);
            if (details.description) description = details.description;
            else if (details.message) description = details.message;
          }
        } catch {
          // Keep default description
        }

        return {
          id: log.id,
          timestamp: date.toISOString().replace('T', ' ').slice(0, 19),
          date: dateLabel,
          user: userName,
          userAvatar: initials,
          action,
          entityType: log.resource ?? 'System',
          entityName: log.resourceId ?? 'N/A',
          description,
          ipAddress: log.ipAddress ?? 'N/A',
        };
      });

      return NextResponse.json({
        data: {
          entries,
          users,
          totalEntries: entries.length,
        },
      });
    } catch (error) {
      console.error('[API] Error fetching audit logs:', error);
      return NextResponse.json(
        { data: { entries: [], users: [], totalEntries: 0 }, error: 'Failed to fetch audit logs' },
        { status: 500 }
      );
    }
  });
}
