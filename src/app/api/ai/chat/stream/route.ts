// ═══════════════════════════════════════════════════════════════════
// POST /api/ai/chat/stream — AI Chat with SSE Streaming
// Phase 8: Streaming Architecture
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { sendMessage, saveStreamedResponse } from '@/lib/ai/chat-service';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { sessionId, message } = body;

      if (!sessionId || !message) {
        return new NextResponse(
          JSON.stringify({ error: 'sessionId and message are required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const result = await sendMessage({
        sessionId,
        userId: user.id,
        message,
        stream: true,
      });

      if (!result.success) {
        const statusCode = result.error?.includes('Insufficient credits') ? 402 : 500;
        return new NextResponse(
          JSON.stringify({ error: result.error }),
          { status: statusCode, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (!result.stream) {
        return new NextResponse(
          JSON.stringify({ error: 'Stream not available' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Collect the full response for saving while streaming
      let fullContent = '';
      let sseBuffer = ''; // Buffer for partial SSE lines

      // Create a TransformStream to intercept and save content
      const transformStream = new TransformStream({
        transform(chunk, controller) {
          const text = new TextDecoder().decode(chunk);
          sseBuffer += text;
          // Try to extract content from SSE data
          try {
            const lines = sseBuffer.split('\n');
            // Keep the last potentially incomplete line in the buffer
            sseBuffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data: ')) {
                try {
                  const data = JSON.parse(trimmed.slice(6));
                  if (data.content) {
                    fullContent += data.content;
                  }
                } catch {
                  // Ignore individual parse errors
                }
              }
            }
          } catch {
            // Ignore parse errors during streaming
          }
          controller.enqueue(chunk);
        },
        flush() {
          // Process any remaining buffer
          if (sseBuffer.trim().startsWith('data: ')) {
            try {
              const data = JSON.parse(sseBuffer.trim().slice(6));
              if (data.content) {
                fullContent += data.content;
              }
            } catch {
              // Ignore
            }
          }
          // Save the full response after streaming completes
          if (fullContent) {
            saveStreamedResponse(sessionId, user.id, fullContent).catch((err) => {
              console.error('[Stream] Failed to save streamed response:', err);
            });
          }
        },
      });

      const transformedStream = result.stream.pipeThrough(transformStream);

      return new NextResponse(transformedStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    } catch (error) {
      console.error('[API /ai/chat/stream] Error:', error);
      return new NextResponse(
        JSON.stringify({ error: 'Streaming failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  });
}
