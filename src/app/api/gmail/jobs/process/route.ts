// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/gmail/jobs/process
// Phase 9: Gmail Integration — Process Job Queue (Cron Endpoint)
// Requires auth + admin or API key
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { processJobQueue, getJobQueueStats } from '@/lib/gmail-job-service';
import { logGmailEvent } from '@/lib/gmail-audit-service';

const CRON_API_KEY = process.env.GMAIL_CRON_API_KEY || '';

export async function POST(request: NextRequest) {
  // Check for API key first (for cron jobs)
  const apiKey = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '');

  if (apiKey && CRON_API_KEY && apiKey === CRON_API_KEY) {
    // API key auth — process directly
    return processJobs();
  }

  // Fall back to user auth with admin check
  return withAuth(request, async (user) => {
    // Only admin users can trigger job processing
    if (user.role !== 'admin' && user.role !== 'owner') {
      return NextResponse.json(
        { error: 'Admin access required to process job queue' },
        { status: 403 }
      );
    }

    return processJobs(user.id);
  });
}

async function processJobs(userId?: string): Promise<NextResponse> {
  try {
    const result = await processJobQueue();

    // Audit log if user context available
    if (userId) {
      await logGmailEvent({
        userId,
        action: 'gmail_inbox_synced',
        details: `Job queue processed: ${result.triggered} jobs triggered`,
        metadata: {
          triggered: result.triggered,
          stats: result.stats,
        },
      });
    }

    return NextResponse.json({
      processed: result.triggered,
      stats: result.stats,
    });
  } catch (error) {
    console.error('[Gmail API] Job process error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
