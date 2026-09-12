import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

// GET /api/dashboard/whatsapp — Fetch WhatsApp integration data
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Fetch WhatsApp config
      const whatsappConfig = await db.whatsappConfig.findUnique({
        where: { userId: user.id },
      });

      const connectionStatus = whatsappConfig?.isConnected ? 'connected' : 'disconnected';
      const phoneNumber = whatsappConfig?.phoneNumber || '';

      // Fetch WhatsApp message templates
      const templates = await db.messageTemplate.findMany({
        where: {
          userId: user.id,
          channel: 'whatsapp',
        },
        orderBy: { lastUsedAt: 'desc' },
        take: 20,
      });

      const formattedTemplates = templates.map((t) => ({
        id: t.id,
        name: t.name,
        body: t.content,
        category: (t.category || 'utility') as 'marketing' | 'utility' | 'authentication',
        status: t.isDefault ? 'approved' as const : 'pending' as const,
      }));

      // Fetch recent WhatsApp message deliveries for activity
      const recentDeliveries = await db.messageDelivery.findMany({
        where: {
          userId: user.id,
          channel: 'whatsapp',
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      const activity = recentDeliveries.map((d) => ({
        id: d.id,
        direction: (d.status === 'failed' ? 'failed' : d.direction === 'inbound' ? 'received' : 'sent') as 'sent' | 'received' | 'failed',
        contact: d.recipientName || d.recipientId || 'Unknown',
        preview: (d.content || '').substring(0, 80),
        time: (d.sentAt || d.createdAt).toISOString(),
      }));

      // Build daily volume from message deliveries in the last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const deliveries = await db.messageDelivery.findMany({
        where: {
          userId: user.id,
          channel: 'whatsapp',
          createdAt: { gte: sevenDaysAgo },
        },
        select: {
          direction: true,
          createdAt: true,
        },
      });

      // Group by day
      const dailyMap = new Map<string, { sent: number; received: number }>();
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayKey = date.toISOString().split('T')[0];
        const dayName = dayNames[date.getDay()];
        dailyMap.set(dayKey, { sent: 0, received: 0 });
      }

      for (const d of deliveries) {
        const dayKey = d.createdAt.toISOString().split('T')[0];
        const entry = dailyMap.get(dayKey);
        if (entry) {
          if (d.direction === 'outbound') {
            entry.sent++;
          } else {
            entry.received++;
          }
        }
      }

      const dailyVolume = Array.from(dailyMap.entries()).map(([dayKey, data]) => {
        const date = new Date(dayKey);
        return {
          day: dayNames[date.getDay()],
          sent: data.sent,
          received: data.received,
        };
      });

      return NextResponse.json({
        connectionStatus,
        phoneNumber,
        templates: formattedTemplates,
        activity,
        dailyVolume,
      });
    } catch (error) {
      console.error('[API] Error fetching WhatsApp data:', error);
      return NextResponse.json({
        connectionStatus: 'disconnected',
        phoneNumber: '',
        templates: [],
        activity: [],
        dailyVolume: [],
      }, { status: 500 });
    }
  });
}
