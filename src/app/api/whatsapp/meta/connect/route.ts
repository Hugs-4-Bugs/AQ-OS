// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/whatsapp/meta/connect
// Phase 10: WhatsApp Integration — Connect Meta Cloud WhatsApp
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { connectMeta } from '@/lib/whatsapp-service';

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
      const body = await request.json() as {
        accessToken?: string;
        phoneNumberId?: string;
        businessId?: string;
        wabaId?: string;
      };

      // Validate required fields
      if (!body.accessToken || !body.phoneNumberId) {
        return NextResponse.json(
          { error: 'accessToken and phoneNumberId are required' },
          { status: 400 }
        );
      }

      const result = await connectMeta(
        user.id,
        body.accessToken,
        body.phoneNumberId,
        body.businessId || '',
        body.wabaId || ''
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
      console.error('[WhatsApp Meta Connect] Error:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Internal server error', success: false },
        { status: 500 }
      );
    }
  });
}
