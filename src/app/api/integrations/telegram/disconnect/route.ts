import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      await db.telegramConfig.updateMany({
        where: { userId: user.id },
        data: { isConnected: false, isPaused: true },
      });
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Telegram disconnect error:', error);
      return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
    }
  });
}
