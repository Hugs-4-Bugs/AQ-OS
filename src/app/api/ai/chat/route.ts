// ═══════════════════════════════════════════════════════════════════
// POST /api/ai/chat — AI Chat (non-streaming)
// POST /api/ai/chat — Also handles session creation
// Phase 8: AI Chat API
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { startChatSession, sendMessage, getChatSessions, getChatMessages, endChatSession } from '@/lib/ai/chat-service';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { action, leadId, salesCoachMode, currentPage, sessionId, message } = body;

      // ─── Start New Session ───
      if (action === 'start_session') {
        const result = await startChatSession({
          userId: user.id,
          leadId,
          salesCoachMode,
          currentPage,
        });

        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 500 });
        }

        return NextResponse.json({ success: true, session: result.session });
      }

      // ─── Send Message (non-streaming) ───
      if (action === 'send_message' || (!action && sessionId && message)) {
        if (!sessionId || !message) {
          return NextResponse.json(
            { error: 'sessionId and message are required' },
            { status: 400 }
          );
        }

        const result = await sendMessage({
          sessionId,
          userId: user.id,
          message,
          stream: false,
        });

        if (!result.success) {
          const statusCode = result.error?.includes('Insufficient credits') ? 402 : 500;
          return NextResponse.json({ error: result.error }, { status: statusCode });
        }

        return NextResponse.json({
          success: true,
          message: result.message,
          creditsDeducted: result.creditsDeducted,
          newBalance: result.newBalance,
          meetingIntent: result.meetingIntent,
        });
      }

      // ─── End Session ───
      if (action === 'end_session') {
        if (!sessionId) {
          return NextResponse.json(
            { error: 'sessionId is required' },
            { status: 400 }
          );
        }

        await endChatSession(sessionId, user.id);
        return NextResponse.json({ success: true });
      }

      return NextResponse.json(
        { error: 'Invalid action. Use: start_session, send_message, or end_session' },
        { status: 400 }
      );
    } catch (error) {
      console.error('[API /ai/chat] Error:', error);
      return NextResponse.json(
        { error: 'Chat operation failed' },
        { status: 500 }
      );
    }
  });
}

// GET /api/ai/chat — Get sessions or messages
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const action = searchParams.get('action');
      const sessionId = searchParams.get('sessionId');

      if (action === 'messages' && sessionId) {
        const messages = await getChatMessages(sessionId, user.id);
        return NextResponse.json({ success: true, messages });
      }

      // Default: return sessions
      const sessions = await getChatSessions(user.id);
      return NextResponse.json({ success: true, sessions });
    } catch (error) {
      console.error('[API /ai/chat GET] Error:', error);
      return NextResponse.json(
        { error: 'Failed to get chat data' },
        { status: 500 }
      );
    }
  });
}
