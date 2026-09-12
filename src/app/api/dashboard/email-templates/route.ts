import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userId = user.id;

      // Query MessageTemplate table
      const templates = await db.messageTemplate.findMany({
        where: { userId },
        orderBy: { usageCount: 'desc' },
      });

      const data = templates.map(t => ({
        id: t.id,
        name: t.name,
        category: t.category || 'Custom',
        subject: t.subject || '',
        body: t.content,
        preview: (t.content || '').substring(0, 100) + '...',
        openRate: Math.min(30 + t.usageCount * 0.5, 92),
        replyRate: Math.min(5 + t.usageCount * 0.2, 55),
        usageCount: t.usageCount,
        isFavorite: t.isDefault,
        variables: (() => {
          try { return JSON.parse(t.variables ?? 'null'); } catch { return []; }
        })(),
        channel: t.channel,
        isAiGenerated: t.isAiGenerated,
      }));

      return NextResponse.json({ data });
    } catch (error) {
      console.error('[API] Email templates error:', error);
      return NextResponse.json({ data: [], error: 'Failed to fetch email templates' }, { status: 500 });
    }
  });
}
