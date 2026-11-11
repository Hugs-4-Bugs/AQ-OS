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
      const { phone } = await request.json();
      if (!phone) return NextResponse.json({ error: 'Phone number required' }, { status: 400 });

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

      await db.whatsappConfig.upsert({
        where: { userId: user.id },
        update: {
          phoneNumber: phone,
          verificationOtp: otp,
          otpExpiresAt: expiresAt,
          isConnected: false,
        },
        create: {
          userId: user.id,
          phoneNumber: phone,
          verificationOtp: otp,
          otpExpiresAt: expiresAt,
          isConnected: false,
        },
      });

      // In production, send OTP via WhatsApp Business API
      // For dev, return it in response (only in non-production environments)
      return NextResponse.json({
        success: true,
        ...(process.env.NODE_ENV !== 'production' && { _dev_otp: otp }),
      });
    } catch (error) {
      console.error('WhatsApp send OTP error:', error);
      return NextResponse.json({ error: 'Failed to send OTP' }, { status: 500 });
    }
  });
}
