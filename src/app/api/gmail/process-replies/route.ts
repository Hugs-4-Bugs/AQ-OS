// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/gmail/process-replies
// Trigger reply processing pipeline for the authenticated user.
// Auth: withAuth + withApiLogging
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { processNewReplies, getReplyPipelineStatus } from '@/lib/gmail-reply-processor';

export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      // Check if reply processing is enabled for this user
      const status = await getReplyPipelineStatus(user.id);
      if (!status.enabled) {
        return NextResponse.json(
          { error: 'Reply processing is disabled for this account' },
          { status: 400 }
        );
      }

      // Check if already running
      if (status.isRunning) {
        return NextResponse.json(
          { error: 'Reply processing is already running', isRunning: true },
          { status: 409 }
        );
      }

      // Run the pipeline (fire-and-forget the actual processing, return immediately)
      const resultPromise = processNewReplies(user.id);

      // Return immediately with a processing status — the pipeline runs async
      return NextResponse.json({
        processing: true,
        userId: user.id,
        message: 'Reply processing pipeline started',
      });

      // Note: In production you'd await resultPromise or use a job queue.
      // For now, the caller can poll /status for completion.
    } catch (error) {
      console.error('[Gmail API] Process replies error:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to process replies' },
        { status: 500 }
      );
    }
  });
}, 'gmail/process-replies');
