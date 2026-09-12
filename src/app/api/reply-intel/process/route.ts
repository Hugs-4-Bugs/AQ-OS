import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { processNewReplies } from '@/lib/gmail-reply-processor';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const result = await processNewReplies(user.id);
      return NextResponse.json(result);
    } catch (error) {
      console.error('[ReplyIntelAPI] Error:', error);
      return NextResponse.json(
        { error: 'Failed to process replies', processed: 0, classified: 0, notifications: 0 },
        { status: 500 }
      );
    }
  });
}
