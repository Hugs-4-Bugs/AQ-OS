import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

// GET /api/dashboard/ai-copilot — Fetch AI copilot conversation history
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Get the most recent active AI chat session
      const session = await db.aiChatSession.findFirst({
        where: {
          userId: user.id,
          isActive: true,
        },
        orderBy: { updatedAt: 'desc' },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 50,
          },
        },
      });

      const conversationHistory = (session?.messages || []).map((msg) => ({
        id: msg.id,
        role: msg.role === 'assistant' ? 'ai' : msg.role === 'user' ? 'user' : 'ai',
        content: msg.content,
        timestamp: msg.createdAt.toISOString(),
      }));

      return NextResponse.json({ conversationHistory });
    } catch (error) {
      console.error('[API] Error fetching AI copilot data:', error);
      return NextResponse.json({ conversationHistory: [] }, { status: 500 });
    }
  });
}

// POST /api/dashboard/ai-copilot — Send a message to AI copilot and get a response
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { message, context } = body;

      if (!message || typeof message !== 'string') {
        return NextResponse.json({ error: 'Message is required' }, { status: 400 });
      }

      // Get or create an active AI chat session
      let session = await db.aiChatSession.findFirst({
        where: { userId: user.id, isActive: true },
        orderBy: { updatedAt: 'desc' },
      });

      if (!session) {
        session = await db.aiChatSession.create({
          data: {
            userId: user.id,
            title: message.substring(0, 50),
            isActive: true,
          },
        });
      }

      // Save user message
      await db.aiChatMessage.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: message,
          metadata: context ? JSON.stringify({ context }) : null,
        },
      });

      // AI response: use real AI service or return unavailable message
      const aiResponse = 'AI copilot service is currently unavailable. Please configure an AI provider (OpenAI, Anthropic, etc.) in your settings to enable AI-powered insights and recommendations.';

      // Save AI response
      const aiMessage = await db.aiChatMessage.create({
        data: {
          sessionId: session.id,
          role: 'assistant',
          content: aiResponse,
          metadata: JSON.stringify({ context, generatedBy: 'copilot' }),
        },
      });

      // Update session title if it's still default
      if (session.title === 'New Conversation') {
        await db.aiChatSession.update({
          where: { id: session.id },
          data: { title: message.substring(0, 50) },
        });
      }

      return NextResponse.json({
        id: aiMessage.id,
        role: 'ai',
        content: aiResponse,
        timestamp: aiMessage.createdAt.toISOString(),
      });
    } catch (error) {
      console.error('[API] Error processing AI copilot message:', error);
      return NextResponse.json({ error: 'Failed to process message' }, { status: 500 });
    }
  });
}
