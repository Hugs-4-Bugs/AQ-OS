import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { processPendingSequences } from '@/lib/sequence-processor';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const result = await processPendingSequences();
      return NextResponse.json(result);
    } catch (error) {
      console.error('[SequenceProcessorAPI] Error:', error);
      return NextResponse.json(
        { error: 'Failed to process sequences', processed: 0, sent: 0, errors: 0 },
        { status: 500 }
      );
    }
  });
}
