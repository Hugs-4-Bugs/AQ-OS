import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userId = user.id;

      // Get outreach messages grouped by channel and status
      const messages = await db.outreachMessage.findMany({
        where: { userId, lead: { userId } },
        select: {
          status: true,
          channel: true,
          sentAt: true,
          openedAt: true,
          repliedAt: true,
          bouncedAt: true,
          createdAt: true,
        },
      });

      // Get outreach sequences as campaigns
      const sequences = await db.outreachSequence.findMany({
        where: { userId },
        include: {
          enrollments: { select: { id: true, status: true } },
          sequenceSteps: { select: { id: true, channel: true, template: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Campaign-level metrics
      const campaigns = sequences.map(seq => {
        const seqMessages = messages.filter(m =>
          seq.sequenceSteps.some(s => s.id === m.channel) || m.channel === seq.channel
        );
        const sent = seqMessages.filter(m => m.status === 'sent' || m.status === 'delivered' || m.status === 'opened' || m.status === 'replied').length;
        const opened = seqMessages.filter(m => m.status === 'opened' || m.status === 'replied').length;
        const replied = seqMessages.filter(m => m.status === 'replied').length;
        const bounced = seqMessages.filter(m => m.status === 'bounced').length;

        return { name: seq.name, sent, opened, replied, bounced };
      });

      // Template performance from MessageTemplate
      const templates = await db.messageTemplate.findMany({
        where: { userId },
        select: { name: true, channel: true, usageCount: true, category: true },
        orderBy: { usageCount: 'desc' },
        take: 10,
      });

      // Top templates — openRate/replyRate require real email tracking
      const topTemplates = templates.map(t => ({
        name: t.name,
        openRate: 0,
        replyRate: 0,
        uses: t.usageCount,
        category: t.category,
        tracked: false,
      }));

      // Recent campaigns — opened/replied require real email tracking
      const recentCampaigns = sequences.slice(0, 5).map(seq => ({
        id: seq.id,
        name: seq.name,
        sentAt: seq.status === 'active' ? 'Active' : seq.status === 'paused' ? 'Paused' : 'Completed',
        status: seq.status === 'active' ? 'sent' as const : seq.status === 'paused' ? 'scheduled' as const : 'draft' as const,
        sent: seq.enrollments.length,
        opened: 0,
        replied: 0,
        tracked: false,
      }));

      // Totals
      const totalSent = messages.filter(m => m.status === 'sent' || m.status === 'delivered' || m.status === 'opened' || m.status === 'replied').length;
      const totalOpened = messages.filter(m => m.status === 'opened' || m.status === 'replied').length;
      const totalReplied = messages.filter(m => m.status === 'replied').length;
      const totalBounced = messages.filter(m => m.status === 'bounced').length;

      return NextResponse.json({
        data: {
          campaigns,
          templates: topTemplates,
          recentCampaigns,
          totals: {
            sent: totalSent,
            opened: totalOpened,
            replied: totalReplied,
            bounced: totalBounced,
            openRate: totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : '0.0',
            replyRate: totalSent > 0 ? ((totalReplied / totalSent) * 100).toFixed(1) : '0.0',
            conversionRate: totalOpened > 0 ? ((totalReplied / totalOpened) * 100).toFixed(1) : '0.0',
          },
        },
      });
    } catch (error) {
      console.error('[API] Email performance error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch email performance' }, { status: 500 });
    }
  });
}
