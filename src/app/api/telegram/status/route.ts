// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/telegram/status
// Phase 10: Get Telegram bot connection status, health, and webhook info
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getBotStatus, TelegramServiceError } from '@/lib/telegram-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const status = await getBotStatus(user.id);

      return NextResponse.json({
        isConnected: status.isConnected,
        isPaused: status.isPaused,
        healthStatus: status.healthStatus,
        botUsername: status.botUsername,
        botId: status.botId,
        chatId: status.chatId,
        username: status.username,
        mode: status.mode,
        webhookUrl: status.webhookUrl,
        webhookVerified: status.webhookVerified,
        lastHealthCheckAt: status.lastHealthCheckAt,
        lastWebhookAt: status.lastWebhookAt,
        reconnectAttempts: status.reconnectAttempts,
        errorMessage: status.errorMessage,
        webhookInfo: status.webhookInfo,
      }, { status: 200 });
    } catch (error) {
      if (error instanceof TelegramServiceError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.statusCode }
        );
      }

      console.error('[API /telegram/status] Error:', error);
      return NextResponse.json(
        { error: 'Failed to get Telegram bot status' },
        { status: 500 }
      );
    }
  });
}
