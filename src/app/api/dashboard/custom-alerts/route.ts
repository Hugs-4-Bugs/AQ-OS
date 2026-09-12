import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userId = user.id;

      const leads = await db.lead.findMany({
        where: { userId, isActive: true },
        select: { stage: true, lastContactedAt: true, createdAt: true, businessName: true, replyScore: true, conversionScore: true, urgencyScore: true },
      });

      const deals = await db.deal.findMany({
        where: { lead: { userId } },
        select: { status: true, proposedPrice: true, finalPrice: true, createdAt: true, lead: { select: { businessName: true } } },
      });

      const notifications = await db.notification.findMany({
        where: { userId, read: false },
        select: { id: true, type: true, title: true, message: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const now = new Date();

      // Build alert rules from actual data
      const coldLeads = leads.filter(l => {
        if (l.stage === 'won' || l.stage === 'lost') return false;
        const lastContact = l.lastContactedAt ? new Date(l.lastContactedAt) : null;
        const daysSinceContact = lastContact ? Math.floor((now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24)) : 999;
        return daysSinceContact > 7;
      });

      const stuckDeals = deals.filter(d => {
        if (d.status !== 'pending' && d.status !== 'proposed') return false;
        const daysSinceCreation = Math.floor((now.getTime() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        return daysSinceCreation > 14;
      });

      const hotLeads = leads.filter(l => {
        if (l.stage !== 'discovered' && l.stage !== 'contacted') return false;
        const lastContact = l.lastContactedAt ? new Date(l.lastContactedAt) : null;
        const daysSinceContact = lastContact ? Math.floor((now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24)) : 999;
        return (l.urgencyScore >= 70 || l.conversionScore >= 70) && daysSinceContact > 1;
      });

      const alertRules = [
        { id: 'cold-lead', label: 'Lead goes cold (no activity > 7 days)', triggered: coldLeads.length, enabled: true },
        { id: 'stuck-deal', label: 'Deal stuck in stage > 14 days', triggered: stuckDeals.length, enabled: true },
        { id: 'hot-lead', label: 'High-value lead uncontacted > 24h', triggered: hotLeads.length, enabled: true },
      ];

      // Active alerts from notifications + lead/deal analysis
      const activeAlerts = [
        ...hotLeads.slice(0, 2).map((l, i) => ({
          id: `hl-${i}`,
          severity: 'Critical' as const,
          description: `Hot lead "${l.businessName}" uncontacted for ${l.lastContactedAt ? Math.floor((now.getTime() - new Date(l.lastContactedAt).getTime()) / (1000 * 60 * 60 * 24)) : 'many'} days`,
          entity: l.businessName,
          time: l.lastContactedAt ? getRelativeTime(l.lastContactedAt) : 'No activity',
        })),
        ...stuckDeals.slice(0, 2).map((d, i) => ({
          id: `sd-${i}`,
          severity: 'Critical' as const,
          description: `Deal with "${d.lead.businessName}" stuck for ${Math.floor((now.getTime() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24))} days`,
          entity: d.lead.businessName,
          time: getRelativeTime(d.createdAt),
        })),
        ...coldLeads.slice(0, 2).map((l, i) => ({
          id: `cl-${i}`,
          severity: 'Warning' as const,
          description: `Lead "${l.businessName}" has been cold for ${l.lastContactedAt ? Math.floor((now.getTime() - new Date(l.lastContactedAt).getTime()) / (1000 * 60 * 60 * 24)) : 'many'} days`,
          entity: l.businessName,
          time: l.lastContactedAt ? getRelativeTime(l.lastContactedAt) : 'No activity',
        })),
        ...notifications.slice(0, 2).map((n, i) => ({
          id: n.id,
          severity: 'Info' as const,
          description: n.message || n.title,
          entity: n.type,
          time: getRelativeTime(n.createdAt),
        })),
      ];

      // Reminders from follow-up reminders
      const reminders = await db.followUpReminder.findMany({
        where: { lead: { userId }, completed: false },
        include: { lead: { select: { businessName: true } } },
        orderBy: { dueAt: 'asc' },
        take: 4,
      });

      const upcomingReminders = reminders.map(r => {
        const due = new Date(r.dueAt);
        const isOverdue = due < now;
        const isToday = due.toDateString() === now.toDateString();
        const contactName = r.lead?.businessName || 'Unknown';
        return {
          id: r.id,
          contact: contactName,
          type: 'Follow-up',
          due: isOverdue ? `Overdue, ${due.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : `${isToday ? 'Today' : due.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, ${due.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
          status: isOverdue ? 'Overdue' : isToday ? 'Today' : 'Upcoming',
        };
      });

      // Alert history from read notifications
      const readNotifications = await db.notification.findMany({
        where: { userId, read: true },
        select: { id: true, title: true, message: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      const alertHistory = readNotifications.map(n => ({
        id: n.id,
        text: n.title || n.message,
        dismissed: getRelativeTime(n.createdAt),
      }));

      return NextResponse.json({
        data: {
          alertRules,
          activeAlerts,
          upcomingReminders: upcomingReminders.length > 0 ? upcomingReminders : undefined,
          alertHistory: alertHistory.length > 0 ? alertHistory : undefined,
        },
      });
    } catch (error) {
      console.error('[API] Custom alerts error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch custom alerts' }, { status: 500 });
    }
  });
}

function getRelativeTime(date: Date | string): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}
