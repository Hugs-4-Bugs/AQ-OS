// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/messages/[id] + POST /api/messages/[id]
// Phase 10: Get conversation details & send unified message
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  getConversation,
  sendUnifiedMessage,
  type ChannelType,
  type SendMessageOptions,
} from '@/lib/messaging-hub-service';

/**
 * GET /api/messages/[id]
 * Get a conversation by ID with all its messages and lead info.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      const result = await getConversation(id, user.id);

      if (!result) {
        return NextResponse.json(
          { error: 'Conversation not found or access denied' },
          { status: 404 }
        );
      }

      return NextResponse.json(result);
    } catch (error) {
      console.error('[API /messages/[id]] GET Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch conversation' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/messages/[id]
 * Send a unified message in a conversation across any channel.
 * Body: { content: string, channel: string, options?: { subject?, aiGenerated?, templateId?, metadata? } }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      // Parse request body
      const body = await request.json();
      const { content, channel, options } = body as {
        content: string;
        channel: string;
        options?: SendMessageOptions;
      };

      // Validate required fields
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return NextResponse.json(
          { error: 'Message content is required' },
          { status: 400 }
        );
      }

      if (!channel || typeof channel !== 'string') {
        return NextResponse.json(
          { error: 'Channel is required' },
          { status: 400 }
        );
      }

      // Validate channel value
      const validChannels: ChannelType[] = ['email', 'telegram', 'whatsapp', 'linkedin', 'instagram'];
      if (!validChannels.includes(channel as ChannelType)) {
        return NextResponse.json(
          { error: `Invalid channel. Must be one of: ${validChannels.join(', ')}` },
          { status: 400 }
        );
      }

      // Send the unified message
      const result = await sendUnifiedMessage(
        user.id,
        id,
        content,
        channel as ChannelType,
        options
      );

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Failed to send message' },
          { status: 422 }
        );
      }

      return NextResponse.json({
        success: true,
        messageId: result.messageId,
        deliveryId: result.deliveryId,
      });
    } catch (error) {
      console.error('[API /messages/[id]] POST Error:', error);

      // Handle JSON parse errors
      if (error instanceof SyntaxError) {
        return NextResponse.json(
          { error: 'Invalid JSON in request body' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to send message' },
        { status: 500 }
      );
    }
  });
}
