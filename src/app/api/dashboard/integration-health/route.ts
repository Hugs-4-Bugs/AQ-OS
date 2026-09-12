import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const [telegram, whatsapp, emailAccounts] = await Promise.all([
        db.telegramConfig.findUnique({ where: { userId: user.id } }),
        db.whatsappConfig.findUnique({ where: { userId: user.id } }),
        db.emailAccount.findMany({ where: { userId: user.id, status: 'active' } }),
      ]);

      const integrations = [
        {
          name: 'Gmail',
          status: emailAccounts.length > 0 ? 'connected' : 'disconnected',
          lastSync: emailAccounts[0]?.lastPollAt?.toISOString() ?? null,
          health: emailAccounts.length > 0 ? 'healthy' : 'unknown',
          messageCount: emailAccounts.length,
        },
        {
          name: 'Telegram',
          status: telegram?.isConnected ? 'connected' : 'disconnected',
          lastSync: telegram?.lastWebhookAt?.toISOString() ?? null,
          health: telegram?.healthStatus ?? 'unknown',
          messageCount: telegram ? 1 : 0,
        },
        {
          name: 'WhatsApp',
          status: whatsapp?.isConnected ? 'connected' : 'disconnected',
          lastSync: whatsapp?.lastHealthCheckAt?.toISOString() ?? null,
          health: whatsapp?.healthStatus ?? 'unknown',
          messageCount: whatsapp ? 1 : 0,
        },
      ];

      const connectedCount = integrations.filter(i => i.status === 'connected').length;
      const healthyCount = integrations.filter(i => i.health === 'healthy').length;

      return NextResponse.json({
        data: {
          overallHealth: connectedCount === 0 ? 'unknown' : healthyCount === connectedCount ? 'healthy' : 'degraded',
          connectedCount,
          totalIntegrations: integrations.length,
          integrations,
          recentEvents: [] as Array<{ integration: string; event: string; timestamp: string }>,
        },
      });
    } catch (error) {
      console.error('[API] Integration health error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch integration health' }, { status: 500 });
    }
  });
}
