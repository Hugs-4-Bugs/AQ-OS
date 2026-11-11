import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Phase 7B — Consent enforcement (AFTER auth check, BEFORE connection creation)
    try {
      const { hasConsent } = await import('@/lib/compliance/consent-enforcement');
      if (!(await hasConsent(authUser.id, 'third_party_integrations'))) {
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

    const userId = authUser.id;
    const linkCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    const linkCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const telegramConfig = await db.telegramConfig.upsert({
      where: { userId },
      update: { linkCode, linkCodeExpiresAt },
      create: { userId, chatId: '', linkCode, linkCodeExpiresAt, isConnected: false },
    });

    return NextResponse.json({
      linkCode,
      expiresAt: linkCodeExpiresAt.toISOString(),
      instructions: 'Send this code to the AcquisitionOS Telegram bot to link your account. The code expires in 10 minutes.',
    });
  } catch (error) {
    console.error('Telegram link error:', error);
    return NextResponse.json(
      { error: 'Failed to generate Telegram link code' },
      { status: 500 }
    );
  }
}
