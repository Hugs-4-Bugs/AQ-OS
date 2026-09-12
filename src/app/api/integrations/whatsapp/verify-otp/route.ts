import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { phone, otp } = await request.json();
      if (!phone || !otp)
        return NextResponse.json({ error: 'Phone and OTP required' }, { status: 400 });

      const config = await db.whatsappConfig.findUnique({ where: { userId: user.id } });
      if (!config) return NextResponse.json({ error: 'No OTP request found' }, { status: 400 });

      if (config.verificationOtp !== otp) {
        return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 });
      }

      if (config.otpExpiresAt && new Date() > config.otpExpiresAt) {
        return NextResponse.json({ error: 'OTP expired' }, { status: 400 });
      }

      await db.whatsappConfig.update({
        where: { userId: user.id },
        data: { isConnected: true, verificationOtp: null, otpExpiresAt: null },
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('WhatsApp verify OTP error:', error);
      return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
    }
  });
}
