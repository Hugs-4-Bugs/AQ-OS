// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/gmail/process-replies/status
// Get reply processing pipeline status for the authenticated user.
// Returns: last run time, processed count, errors, isRunning, etc.
// Auth: withAuth + withApiLogging
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { getReplyPipelineStatus } from '@/lib/gmail-reply-processor';

export const GET = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const status = await getReplyPipelineStatus(user.id);

      return NextResponse.json({
        enabled: status.enabled,
        isRunning: status.isRunning,
        runningSince: status.runningSince,
        lastRunAt: status.lastRunAt,
        lastProcessedCount: status.lastProcessedCount,
        lastErrorCount: status.lastErrorCount,
        totalProcessed: status.totalProcessed,
        totalErrors: status.totalErrors,
      });
    } catch (error) {
      console.error('[Gmail API] Reply pipeline status error:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to get pipeline status' },
        { status: 500 }
      );
    }
  });
}, 'gmail/process-replies/status');
