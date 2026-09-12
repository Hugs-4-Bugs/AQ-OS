// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/whatsapp/meta/send
// Phase 10: WhatsApp Integration — Send Meta WhatsApp Message
//
// Routes to:
//   - sendMetaMessage  (text messages)
//   - sendMetaTemplate (template messages)
//   - sendMetaMedia    (media messages)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  sendMetaMessage,
  sendMetaTemplate,
  sendMetaMedia,
} from '@/lib/whatsapp-service';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json() as {
        to?: string;
        text?: string;
        templateName?: string;
        languageCode?: string;
        components?: Array<{
          type: string;
          sub_type?: string;
          index?: number;
          parameters: Array<{ type: string; text?: string; payload?: string }>;
        }>;
        mediaType?: string;
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

      if (body.templateName) {
        // Template message
        if (!body.languageCode) {
          return NextResponse.json(
            { error: 'languageCode is required for template messages', success: false },
            { status: 400 }
          );
        }

        result = await sendMetaTemplate(
          user.id,
          body.to,
          body.templateName,
          body.languageCode,
          body.components
        );
      } else if (body.mediaUrl) {
        // Media message
        if (!body.mediaType) {
          return NextResponse.json(
            { error: 'mediaType is required for media messages', success: false },
            { status: 400 }
          );
        }

        const validMediaTypes = ['image', 'document', 'audio', 'video', 'sticker'] as const;
        const mediaType = validMediaTypes.includes(body.mediaType as typeof validMediaTypes[number])
          ? (body.mediaType as 'image' | 'document' | 'audio' | 'video' | 'sticker')
          : null;

        if (!mediaType) {
          return NextResponse.json(
            { error: `Invalid mediaType. Must be one of: ${validMediaTypes.join(', ')}`, success: false },
            { status: 400 }
          );
        }

        result = await sendMetaMedia(
          user.id,
          body.to,
          mediaType,
          body.mediaUrl,
          body.caption
        );
      } else if (body.text) {
        // Text message
        result = await sendMetaMessage(
          user.id,
          body.to,
          body.text
        );
      } else {
        return NextResponse.json(
          { error: 'One of text, templateName, or mediaUrl is required', success: false },
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
      console.error('[WhatsApp Meta Send] Error:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Internal server error', success: false },
        { status: 500 }
      );
    }
  });
}
