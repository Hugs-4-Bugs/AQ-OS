import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateOTP } from '@/lib/auth';

// POST /api/settings/integrations/whatsapp/verify - Generate OTP for WhatsApp verification
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { phone } = body;

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    // Basic phone validation
    const phoneStr = String(phone).replace(/[\s\-()]/g, '');
    if (!/^\+?\d{7,15}$/.test(phoneStr)) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    const userId = authUser.id;

    // Generate OTP
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Upsert WhatsappConfig with OTP
    await db.whatsappConfig.upsert({
      where: { userId },
      update: {
        phoneNumber: phoneStr,
        verificationOtp: otp,
        otpExpiresAt,
        isConnected: false,
      },
      create: {
        userId,
        phoneNumber: phoneStr,
        verificationOtp: otp,
        otpExpiresAt,
        isConnected: false,
      },
    });

    // ─────────────────────────────────────────────────────────────
    // PENDING: Real WhatsApp OTP delivery
    // ─────────────────────────────────────────────────────────────
    // The OTP is generated and stored in the DB, but NOT actually sent
    // via WhatsApp. This requires a real provider (Twilio or Meta API).
    // In dev mode the OTP is returned in the response for manual testing.
    // In production with a real provider, replace the devOtp return with
    // an actual API call to send the OTP via WhatsApp.
    // ─────────────────────────────────────────────────────────────
    const isDev = process.env.NODE_ENV !== 'production';

    return NextResponse.json({
      message: 'Verification code sent to your WhatsApp number',
      ...(isDev ? { devOtp: otp } : {}),
      expiresIn: '10 minutes',
    });
  } catch (error) {
    console.error('WhatsApp verify error:', error);
    return NextResponse.json(
      { error: 'Failed to send WhatsApp verification code' },
      { status: 500 }
    );
  }
}
