import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const limit = parseInt(searchParams.get('limit') || '20');
      const source = searchParams.get('source') || 'audit'; // 'audit', 'lead', or 'all'

      type ActivityItem = {
        id: string;
        type: string;
        title: string;
        description: string;
        timestamp: string;
        category: string;
        metadata?: string | null;
        userName?: string;
        userInitials?: string;
      };

      const activities: ActivityItem[] = [];

      if (source === 'audit' || source === 'all') {
        // Fetch from AuditLog
        const auditLogs = await db.auditLog.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          take: limit,
          include: {
            user: { select: { name: true, email: true } },
          },
        });

        for (const log of auditLogs) {
          const actionMap: Record<string, { title: string; category: string }> = {
            login: { title: 'Session started', category: 'system' },
            logout: { title: 'Session ended', category: 'system' },
            plan_change: { title: 'Plan changed', category: 'system' },
            gmail_connect: { title: 'Gmail connected', category: 'system' },
            email_sent: { title: 'Email sent', category: 'emails' },
            password_reset: { title: 'Password reset', category: 'system' },
            signup: { title: 'Account created', category: 'system' },
            mfa_enabled: { title: 'MFA enabled', category: 'system' },
            mfa_disabled: { title: 'MFA disabled', category: 'system' },
            suspicious_login: { title: 'Suspicious login detected', category: 'system' },
            account_locked: { title: 'Account locked', category: 'system' },
          };

          const mapped = actionMap[log.action] || { title: log.action, category: 'system' };

          let userName = 'System';
          let userInitials = 'SY';
          if (log.user?.name) {
            userName = log.user.name;
            userInitials = log.user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
          } else if (log.user?.email) {
            userName = log.user.email.split('@')[0];
            userInitials = userName.slice(0, 2).toUpperCase();
          }

          activities.push({
            id: log.id,
            type: log.action,
            title: mapped.title,
            description: log.details || log.action,
            timestamp: log.createdAt.toISOString(),
            category: mapped.category,
            metadata: log.details,
            userName,
            userInitials,
          });
        }
      }

      if (source === 'lead' || source === 'all') {
        // Fetch from LeadActivity
        const leadActivities = await db.leadActivity.findMany({
          where: {
            lead: { userId: user.id },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          include: {
            lead: { select: { businessName: true } },
          },
        });

        for (const la of leadActivities) {
          const typeMap: Record<string, { title: string; category: string }> = {
            created: { title: 'New lead discovered', category: 'leads' },
            updated: { title: 'Lead updated', category: 'leads' },
            scored: { title: 'Lead scored', category: 'leads' },
            contacted: { title: 'Lead contacted', category: 'leads' },
            replied: { title: 'Email reply received', category: 'emails' },
            stage_changed: { title: 'Deal stage advanced', category: 'deals' },
            deal_created: { title: 'New deal created', category: 'deals' },
            deal_won: { title: 'Deal closed successfully!', category: 'deals' },
            deal_lost: { title: 'Deal lost', category: 'deals' },
            note_added: { title: 'Note added to lead', category: 'leads' },
            email_sent: { title: 'Outreach email sent', category: 'emails' },
          };

          const mapped = typeMap[la.type] || { title: la.type, category: 'leads' };

          activities.push({
            id: la.id,
            type: la.type,
            title: mapped.title,
            description: `${la.lead.businessName}${la.description ? ` — ${la.description}` : ''}`,
            timestamp: la.createdAt.toISOString(),
            category: mapped.category,
            metadata: la.metadata,
            userName: 'You',
            userInitials: 'YO',
          });
        }
      }

      // Sort by timestamp descending and limit
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return NextResponse.json({
        data: activities.slice(0, limit),
        total: activities.length,
      });
    } catch (error) {
      console.error('[API] Error fetching activities:', error);
      return NextResponse.json({ data: [], total: 0, error: 'Failed to fetch activities' }, { status: 500 });
    }
  });
}
