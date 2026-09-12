// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/whatsapp/twilio/connect
// Phase 10: WhatsApp Integration — Connect Twilio WhatsApp
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { connectTwilio } from '@/lib/whatsapp-service';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json() as {
        accountSid?: string;
        authToken?: string;
        phoneNumber?: string;
      };

      // Validate required fields
      if (!body.accountSid || !body.authToken || !body.phoneNumber) {
        return NextResponse.json(
          { error: 'accountSid, authToken, and phoneNumber are required' },
          { status: 400 }
        );
      }

      const result = await connectTwilio(
        user.id,
        body.accountSid,
        body.authToken,
        body.phoneNumber
      );

      if (!result.success) {
        return NextResponse.json(
          { error: result.error, success: false },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        configId: result.configId,
        provider: result.provider,
      });
    } catch (error) {
      console.error('[WhatsApp Twilio Connect] Error:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Internal server error', success: false },
        { status: 500 }
      );
    }
  });
}
