import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateOTP } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Phase 7B — Consent enforcement (AFTER auth check, BEFORE OTP generation)
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

    const body = await request.json();
    const { phone } = body;

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    const phoneStr = String(phone).replace(/[\s\-()]/g, '');
    if (!/^\+?\d{7,15}$/.test(phoneStr)) {
      return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 });
    }

    const userId = authUser.id;
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.whatsappConfig.upsert({
      where: { userId },
      update: { phoneNumber: phoneStr, verificationOtp: otp, otpExpiresAt, isConnected: false },
      create: { userId, phoneNumber: phoneStr, verificationOtp: otp, otpExpiresAt, isConnected: false },
    });

    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json({
      message: 'Verification code sent to your WhatsApp number',
      ...(isDev ? { devOtp: otp } : {}),
      expiresIn: '10 minutes',
    });
  } catch (error) {
    console.error('WhatsApp verify error:', error);
    return NextResponse.json({ error: 'Failed to send WhatsApp verification code' }, { status: 500 });
  }
}
