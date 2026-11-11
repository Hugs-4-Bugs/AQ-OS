import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    // Phase 7B — Consent enforcement for third-party integrations
    try {
      const { hasConsent } = await import('@/lib/compliance/consent-enforcement');
      if (!(await hasConsent(user.id, 'third_party_integrations'))) {
        return NextResponse.json(
          { error: 'Third-party integration consent is not granted. Please grant consent in Privacy Settings to connect new integrations.' },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Unable to verify integration consent. Please try again.' },
        { status: 500 }
      );
    }
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
