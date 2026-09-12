// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/telegram/send
// Phase 10: Send a message via Telegram (text, markdown, media, or reply)
// Routes to the appropriate telegram-service function based on options
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  sendMessage,
  sendMarkdown,
  sendMedia,
  replyToMessage,
  TelegramServiceError,
  type TelegramMediaType,
} from '@/lib/telegram-service';

/** Valid parse modes accepted by the API (lowercase from client) */
type ApiParseMode = 'markdown' | 'html';

/** Valid media types accepted by the API */
type ApiMediaType = 'photo' | 'document' | 'video' | 'audio';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();

      const {
        chatId,
        content,
        parseMode,
        replyToMessageId,
        mediaType,
        mediaUrl,
      } = body;

      // ── Validate required fields ──────────────────────────────────
      if (!chatId || typeof chatId !== 'string' || chatId.trim().length === 0) {
        return NextResponse.json(
          { error: 'chatId is required' },
          { status: 400 }
        );
      }

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return NextResponse.json(
          { error: 'content is required' },
          { status: 400 }
        );
      }

      // ── Validate optional fields ──────────────────────────────────
      if (parseMode !== undefined && parseMode !== null) {
        const validParseModes: ApiParseMode[] = ['markdown', 'html'];
        if (!validParseModes.includes(parseMode)) {
          return NextResponse.json(
            { error: `parseMode must be one of: ${validParseModes.join(', ')}` },
            { status: 400 }
          );
        }
      }

      if (replyToMessageId !== undefined && replyToMessageId !== null) {
        const parsed = Number(replyToMessageId);
        if (isNaN(parsed) || parsed <= 0) {
          return NextResponse.json(
            { error: 'replyToMessageId must be a positive number' },
            { status: 400 }
          );
        }
      }

      if (mediaType !== undefined && mediaType !== null) {
        const validMediaTypes: ApiMediaType[] = ['photo', 'document', 'video', 'audio'];
        if (!validMediaTypes.includes(mediaType)) {
          return NextResponse.json(
            { error: `mediaType must be one of: ${validMediaTypes.join(', ')}` },
            { status: 400 }
          );
        }

        if (!mediaUrl || typeof mediaUrl !== 'string' || mediaUrl.trim().length === 0) {
          return NextResponse.json(
            { error: 'mediaUrl is required when mediaType is specified' },
            { status: 400 }
          );
        }
      }

      // ── Route to appropriate send function ────────────────────────
      let result: { deliveryId: string | null; telegramMessageId: number | null };

      if (mediaType && mediaUrl) {
        // Media message (photo, document, video, audio)
        result = await sendMedia(
          user.id,
          chatId.trim(),
          mediaType as TelegramMediaType,
          mediaUrl.trim(),
          content.trim() // caption for media
        );
      } else if (replyToMessageId) {
        // Reply to a specific message
        result = await replyToMessage(
          user.id,
          chatId.trim(),
          content.trim(),
          Number(replyToMessageId)
        );
      } else if (parseMode === 'markdown') {
        // Markdown-formatted message
        result = await sendMarkdown(
          user.id,
          chatId.trim(),
          content.trim()
        );
      } else {
        // Plain text or HTML message
        const options: Parameters<typeof sendMessage>[3] = {};

        if (parseMode === 'html') {
          options.parseMode = 'HTML';
        }

        result = await sendMessage(
          user.id,
          chatId.trim(),
          content.trim(),
          Object.keys(options).length > 0 ? options : undefined
        );
      }

      return NextResponse.json({
        success: true,
        deliveryId: result.deliveryId,
        telegramMessageId: result.telegramMessageId,
      }, { status: 200 });
    } catch (error) {
      if (error instanceof TelegramServiceError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.statusCode }
        );
      }

      console.error('[API /telegram/send] Error:', error);
      return NextResponse.json(
        { error: 'Failed to send Telegram message' },
        { status: 500 }
      );
    }
  });
}
