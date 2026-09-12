// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/whatsapp/twilio/send
// Phase 10: WhatsApp Integration — Send Twilio WhatsApp Message
//
// Routes to:
//   - sendTwilioMessage  (text messages)
//   - sendTwilioTemplate (template messages)
//   - sendTwilioMedia    (media messages)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  sendTwilioMessage,
  sendTwilioTemplate,
  sendTwilioMedia,
} from '@/lib/whatsapp-service';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json() as {
        to?: string;
        text?: string;
        templateSid?: string;
        variables?: Record<string, string>;
        mediaUrl?: string;
        caption?: string;
      };

      // Validate required fields
      if (!body.to) {
        return NextResponse.json(
          { error: 'Recipient "to" is required', success: false },
          { status: 400 }
        );
      }

      // Determine which send function to use based on the body
      let result;

      if (body.templateSid) {
        // Template message
        result = await sendTwilioTemplate(
          user.id,
          body.to,
          body.templateSid,
          body.variables
        );
      } else if (body.mediaUrl) {
        // Media message
        result = await sendTwilioMedia(
          user.id,
          body.to,
          body.mediaUrl,
          body.caption
        );
      } else if (body.text) {
        // Text message
        result = await sendTwilioMessage(
          user.id,
          body.to,
          body.text
        );
      } else {
        return NextResponse.json(
          { error: 'One of text, templateSid, or mediaUrl is required', success: false },
          { status: 400 }
        );
      }

      if (!result.success) {
        return NextResponse.json(
          { error: result.error, success: false, deliveryId: result.deliveryId },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        deliveryId: result.deliveryId,
        providerMessageId: result.providerMessageId,
      });
    } catch (error) {
      console.error('[WhatsApp Twilio Send] Error:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Internal server error', success: false },
        { status: 500 }
      );
    }
  });
}
