// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/telegram/connect
// Phase 10: Connect a Telegram bot by validating and storing the bot token
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { connectBot, TelegramServiceError } from '@/lib/telegram-service';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();

      const { botToken } = body;

      // Validate required fields
      if (!botToken || typeof botToken !== 'string' || botToken.trim().length === 0) {
        return NextResponse.json(
          { error: 'botToken is required' },
          { status: 400 }
        );
      }

      // Basic format check: Telegram bot tokens look like "123456:ABC-DEF..."
      const tokenPattern = /^\d+:[A-Za-z0-9_-]+$/;
      if (!tokenPattern.test(botToken.trim())) {
        return NextResponse.json(
          { error: 'Invalid bot token format. Expected format: 123456:ABC-DEF...' },
          { status: 400 }
        );
      }

      // Connect the bot — validates with Telegram, encrypts, stores, sets webhook
      const result = await connectBot(user.id, botToken.trim());

      return NextResponse.json({
        success: result.success,
        botInfo: result.botInfo,
        configId: result.configId,
      }, { status: 200 });
    } catch (error) {
      if (error instanceof TelegramServiceError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.statusCode }
        );
      }

      console.error('[API /telegram/connect] Error:', error);
      return NextResponse.json(
        { error: 'Failed to connect Telegram bot' },
        { status: 500 }
      );
    }
  });
}
