// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/cron/process-gmail-replies
// Cron endpoint that processes replies for all active users with Gmail
// connected. Processes up to 50 users per run.
// Protected by Bearer acquisitionos-cron-dev token auth.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processNewReplies } from '@/lib/gmail-reply-processor';

const MAX_USERS_PER_RUN = 50;

export async function POST(request: NextRequest) {
  // Verify cron auth — require CRON_SECRET to be set
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[Cron ProcessGmailReplies] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  let processedUsers = 0;
  let totalMatched = 0;
  let totalErrors = 0;
  const errors: string[] = [];

  try {
    // Find all users with active Gmail accounts who have reply processing enabled
    const usersWithGmail = await db.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        emailAccounts: {
          some: {
            status: 'active',
            consentGiven: true,
          },
        },
      },
      select: {
        id: true,
        preferencesJson: true,
      },
      take: MAX_USERS_PER_RUN,
    });

    for (const user of usersWithGmail) {
      // Check if reply processing is enabled in user preferences
      let enabled = true;
      if (user.preferencesJson) {
        try {
          const prefs = JSON.parse(user.preferencesJson);
          if (prefs.replyProcessing?.enabled === false) {
            enabled = false;
          }
        } catch { /* ignore */ }
      }

      if (!enabled) continue;

      try {
        const result = await processNewReplies(user.id);
        processedUsers++;
        totalMatched += result.matchedCount;
        totalErrors += result.errors.length;

        if (result.errors.length > 0) {
          errors.push(`User ${user.id}: ${result.errors.length} errors`);
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        errors.push(`User ${user.id}: ${errMsg}`);
        totalErrors++;
        console.error(`[Cron:ProcessReplies] Error for user ${user.id}:`, error);
      }
    }

    const durationMs = Date.now() - startTime;

    console.log(`[Cron:ProcessReplies] Complete: ${processedUsers} users, ${totalMatched} replies matched, ${totalErrors} errors in ${durationMs}ms`);

    return NextResponse.json({
      success: true,
      processedUsers,
      totalMatched,
      totalErrors,
      errors: errors.length > 0 ? errors : undefined,
      durationMs,
    });
  } catch (error) {
    console.error('[Cron:ProcessReplies] Fatal error:', error);
    return NextResponse.json(
      { error: 'Cron job failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
