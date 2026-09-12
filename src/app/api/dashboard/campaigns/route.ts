import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userId = user.id;

      // Get outreach sequences (acting as campaigns)
      const sequences = await db.outreachSequence.findMany({
        where: { userId },
        include: {
          enrollments: {
            select: { id: true, status: true, leadId: true },
          },
          sequenceSteps: {
            select: { id: true, channel: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Get outreach messages for reply counts
      const messages = await db.outreachMessage.findMany({
        where: { userId, lead: { userId } },
        select: { status: true, channel: true, sequenceStepId: true },
      });

      // Build campaign list from sequences
      const campaigns = sequences.map(seq => {
        const leadsCount = seq.enrollments.length;
        const sentCount = messages.filter(m => m.status === 'sent' || m.status === 'delivered' || m.status === 'opened').length;
        const replyCount = messages.filter(m => m.status === 'replied').length;
        const replyRate = sentCount > 0 ? Math.round((replyCount / sentCount) * 100) : 0;

        return {
          id: seq.id,
          name: seq.name,
          status: seq.status as 'active' | 'paused' | 'completed',
          niche: '',
          country: '',
          templateId: seq.sequenceSteps[0]?.id || '',
          leadsCount,
          sentCount,
          replyCount,
          replyRate,
          createdAt: seq.createdAt.toISOString(),
        };
      });

      return NextResponse.json({ data: campaigns });
    } catch (error) {
      console.error('[API] Campaigns error:', error);
      return NextResponse.json({ data: [], error: 'Failed to fetch campaigns' }, { status: 500 });
    }
  });
}
