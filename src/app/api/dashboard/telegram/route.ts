import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

// GET /api/dashboard/telegram — Fetch Telegram integration data
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Fetch Telegram config
      const telegramConfig = await db.telegramConfig.findUnique({
        where: { userId: user.id },
      });

      const isConnected = telegramConfig?.isConnected || false;

      // Build channels list from telegram config
      const channels: Array<{
        id: string;
        name: string;
        type: 'private' | 'group' | 'channel';
        chatId: string;
        isActive: boolean;
        lastActivity?: string;
        messageCount?: number;
      }> = [];

      if (telegramConfig && telegramConfig.isConnected && telegramConfig.chatId) {
        channels.push({
          id: telegramConfig.id,
          name: telegramConfig.username ? `@${telegramConfig.username}` : 'Telegram Bot',
          type: 'private',
          chatId: telegramConfig.chatId,
          isActive: !telegramConfig.isPaused,
          lastActivity: telegramConfig.lastWebhookAt?.toISOString(),
        });
      }

      // Fetch recent Telegram message deliveries
      const recentMessages = await db.messageDelivery.findMany({
        where: {
          userId: user.id,
          channel: 'telegram',
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      const messages = recentMessages.map((d) => ({
        id: d.id,
        type: (d.templateName || 'system') as 'lead_reply' | 'deal_update' | 'reminder' | 'system' | 'daily_summary',
        channel: d.recipientName || d.recipientId || 'Telegram',
        content: d.content || '',
        status: (d.status === 'delivered' || d.status === 'read' ? 'delivered' : d.status === 'sent' ? 'sent' : d.status === 'failed' ? 'failed' : 'pending') as 'sent' | 'delivered' | 'failed' | 'pending',
        timestamp: (d.sentAt || d.createdAt).toISOString(),
      }));

      return NextResponse.json({
        isConnected,
        channels,
        messages,
      });
    } catch (error) {
      console.error('[API] Error fetching Telegram data:', error);
      return NextResponse.json({
        isConnected: false,
        channels: [],
        messages: [],
      }, { status: 500 });
    }
  });
}
