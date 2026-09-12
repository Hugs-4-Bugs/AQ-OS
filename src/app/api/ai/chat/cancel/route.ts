// ═══════════════════════════════════════════════════════════════════
// DELETE /api/ai/chat/cancel — Cancel ongoing AI generation
// Phase 8: Cancellation API
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { cancelGeneration } from '@/lib/ai/chat-service';

export async function DELETE(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { sessionId } = body;

      if (!sessionId) {
        return NextResponse.json(
          { error: 'sessionId is required' },
          { status: 400 }
        );
      }

      const result = await cancelGeneration(sessionId, user.id);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, message: 'Generation cancelled' });
    } catch (error) {
      console.error('[API /ai/chat/cancel] Error:', error);
      return NextResponse.json(
        { error: 'Failed to cancel generation' },
        { status: 500 }
      );
    }
  });
}
