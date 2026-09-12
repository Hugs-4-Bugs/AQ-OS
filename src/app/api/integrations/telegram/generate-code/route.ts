import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const code = 'ACQ-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

      // Upsert telegram config
      await db.telegramConfig.upsert({
        where: { userId: user.id },
        update: { linkCode: code, linkCodeExpiresAt: expiresAt, isConnected: false },
        create: {
          userId: user.id,
          chatId: 'pending',
          linkCode: code,
          linkCodeExpiresAt: expiresAt,
          isConnected: false,
        },
      });

      return NextResponse.json({ code });
    } catch (error) {
      console.error('Telegram generate code error:', error);
      return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 });
    }
  });
}
