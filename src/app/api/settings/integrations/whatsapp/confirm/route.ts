import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { secureCompare } from '@/lib/auth';

// POST /api/settings/integrations/whatsapp/confirm - Verify OTP and mark WhatsApp as connected
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { phone, otp } = body;

    if (!phone || !otp) {
      return NextResponse.json(
        { error: 'Phone number and OTP are required' },
        { status: 400 }
      );
    }

    const userId = authUser.id;

    // Find the WhatsApp config
    const whatsappConfig = await db.whatsappConfig.findUnique({
      where: { userId },
    });

    if (!whatsappConfig) {
      return NextResponse.json(
        { error: 'No verification pending. Please request a new verification code.' },
        { status: 400 }
      );
    }

    // Check if OTP has expired
    if (!whatsappConfig.otpExpiresAt || new Date() > whatsappConfig.otpExpiresAt) {
      return NextResponse.json(
        { error: 'Verification code has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    // Verify OTP using constant-time comparison
    if (!whatsappConfig.verificationOtp || !secureCompare(String(otp), whatsappConfig.verificationOtp)) {
      return NextResponse.json(
        { error: 'Invalid verification code' },
        { status: 400 }
      );
    }

    // Verify the phone number matches
    const phoneStr = String(phone).replace(/[\s\-()]/g, '');
    if (whatsappConfig.phoneNumber !== phoneStr) {
      return NextResponse.json(
        { error: 'Phone number does not match the verified number' },
        { status: 400 }
      );
    }

    // Mark WhatsApp as connected
    await db.whatsappConfig.update({
      where: { userId },
      data: {
        isConnected: true,
        verificationOtp: null,
        otpExpiresAt: null,
      },
    });

    // Also update UserSettings
    await db.userSettings.upsert({
      where: { userId },
      update: {
        whatsappConnected: true,
        whatsappNumber: phoneStr,
      },
      create: {
        userId,
        whatsappConnected: true,
        whatsappNumber: phoneStr,
      },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        userId,
        action: 'whatsapp_connect',
        details: JSON.stringify({
          phone: phoneStr,
        }),
        ipAddress: request.headers.get('x-forwarded-for') || null,
        userAgent: request.headers.get('user-agent') || null,
        resource: 'integration',
        resourceId: 'whatsapp',
      },
    });

    return NextResponse.json({
      message: 'WhatsApp connected successfully',
      whatsapp: {
        connected: true,
        phone: phoneStr,
      },
    });
  } catch (error) {
    console.error('WhatsApp confirm error:', error);
    return NextResponse.json(
      { error: 'Failed to confirm WhatsApp verification' },
      { status: 500 }
    );
  }
}
