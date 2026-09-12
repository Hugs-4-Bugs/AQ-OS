import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

// ChatSession model is not yet in the Prisma schema (AiChatSession exists but
// is a different model used for AI chat). Return empty/501 until implemented.

// GET /api/chat-sessions — List chat sessions
export async function GET(request: NextRequest) {
  return withPermission(request, 'assistant:read', async () => {
    try {
      // Attempt to query using AiChatSession if available
      // Note: AiChatSession is the closest model; ChatSession is not yet in the schema
      const sessions = await db.aiChatSession.findMany({
        orderBy: { updatedAt: 'desc' },
      });

      return NextResponse.json({
        sessions: sessions.map(s => ({
          id: s.id,
          title: s.title || 'Untitled',
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
          messageCount: 0, // AiChatMessage count would require a separate query
          mode: s.salesCoachMode ? 'sales_coach' : 'default',
        })),
        total: sessions.length,
      });
    } catch {
      // If the model doesn't exist or query fails, return empty
      return NextResponse.json({
        sessions: [],
        total: 0,
      });
    }
  });
}

// POST /api/chat-sessions — Create a new chat session
export async function POST(request: NextRequest) {
  return withPermission(request, 'assistant:read', async (user) => {
    try {
      const body = await request.json();
      const { title, mode } = body;

      try {
        const session = await db.aiChatSession.create({
          data: {
            title: title || 'New Conversation',
            salesCoachMode: mode === 'sales_coach',
            userId: user.id,
          },
        });

        return NextResponse.json(
          {
            id: session.id,
            title: session.title || 'Untitled',
            createdAt: session.createdAt.toISOString(),
            updatedAt: session.updatedAt.toISOString(),
            messageCount: 0,
            mode: session.salesCoachMode ? 'sales_coach' : 'default',
          },
          { status: 201 }
        );
      } catch {
        // If the model doesn't exist, return 501
        return NextResponse.json(
          { error: 'Chat sessions not yet implemented' },
          { status: 501 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 400 }
      );
    }
  });
}
