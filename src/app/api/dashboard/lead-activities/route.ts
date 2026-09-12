import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Fetch lead activities with lead info
      const activities = await db.leadActivity.findMany({
        where: {
          lead: { userId: user.id },
        },
        include: {
          lead: {
            select: {
              businessName: true,
              ownerName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      // If no lead activities, try audit logs as fallback
      if (activities.length === 0) {
        const auditLogs = await db.auditLog.findMany({
          where: {
            userId: user.id,
            resource: { in: ['lead', 'deal', 'contact'] },
          },
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });

        const mappedActivities = auditLogs.map((log) => {
          // Map audit actions to activity types
          const typeMap: Record<string, string> = {
            lead_created: 'stage_changed',
            lead_updated: 'score_updated',
            deal_created: 'deal_created',
            email_sent: 'outreach_sent',
            gmail_connect: 'outreach_sent',
          };

          return {
            id: log.id,
            type: typeMap[log.action] ?? 'note_added',
            title: log.action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
            description: (() => {
              try {
                const details = log.details ? JSON.parse(log.details) : {};
                return details.description ?? `${log.action} on ${log.resource ?? 'resource'}`;
              } catch {
                return `${log.action} on ${log.resource ?? 'resource'}`;
              }
            })(),
            timestamp: log.createdAt.toISOString(),
            actorName: log.user.name ?? log.user.email,
            metadata: {},
          };
        });

        return NextResponse.json({ data: mappedActivities });
      }

      // Format lead activities
      const formattedActivities = activities.map((act) => {
        // Map LeadActivity types to the component's activity types
        const typeMap: Record<string, string> = {
          email: 'email_sent',
          email_sent: 'email_sent',
          email_received: 'email_received',
          call: 'call_made',
          call_made: 'call_made',
          call_received: 'call_received',
          note: 'note_added',
          note_added: 'note_added',
          stage_change: 'stage_changed',
          stage_changed: 'stage_changed',
          score_update: 'score_updated',
          score_updated: 'score_updated',
          deal_created: 'deal_created',
          reminder: 'reminder_set',
          reminder_set: 'reminder_set',
          tag: 'tag_added',
          tag_added: 'tag_added',
          analysis: 'analysis_run',
          analysis_run: 'analysis_run',
          outreach: 'outreach_sent',
          outreach_sent: 'outreach_sent',
        };

        const activityType = typeMap[act.type] ?? 'note_added';

        // Parse metadata
        let metadata: Record<string, unknown> = {};
        try {
          if (act.metadata) metadata = JSON.parse(act.metadata);
        } catch {
          // Keep empty metadata
        }

        return {
          id: act.id,
          type: activityType,
          title: act.description ?? `${act.type} activity`,
          description: act.description ?? '',
          timestamp: act.createdAt.toISOString(),
          actorName: act.lead.ownerName ?? act.lead.businessName,
          metadata,
        };
      });

      return NextResponse.json({ data: formattedActivities });
    } catch (error) {
      console.error('[API] Error fetching lead activities:', error);
      return NextResponse.json(
        { data: [], error: 'Failed to fetch lead activities' },
        { status: 500 }
      );
    }
  });
}
