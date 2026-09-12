// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/cron/hot-lead-scan
// Cron endpoint to scan for hot leads across all active users.
// Auth: Bearer acquisitionos-cron-dev
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { detectHotLeads } from '@/lib/hot-lead-detection-service';

export async function POST(request: NextRequest) {
  try {
    // Verify cron auth header
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('[Cron HotLeadScan] CRON_SECRET not configured');
      return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
    }
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find all active users (users who have logged in within the last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const activeUsers = await db.user.findMany({
      where: {
        lastLoginAt: { gte: thirtyDaysAgo },
      },
      select: { id: true },
    });

    if (activeUsers.length === 0) {
      return NextResponse.json({
        usersScanned: 0,
        hotLeadsFound: 0,
        criticalLeads: 0,
      });
    }

    let hotLeadsFound = 0;
    let criticalLeads = 0;

    // Scan for hot leads for each active user
    for (const { id: userId } of activeUsers) {
      try {
        const scanResult = await detectHotLeads(userId);
        hotLeadsFound += scanResult.hot + scanResult.critical;
        criticalLeads += scanResult.critical;
      } catch (error) {
        console.error(
          `[Cron HotLeadScan] Scan failed for user ${userId}:`,
          error instanceof Error ? error.message : error
        );
        // Continue processing other users — one failure must not block the rest
      }
    }

    return NextResponse.json({
      usersScanned: activeUsers.length,
      hotLeadsFound,
      criticalLeads,
    });
  } catch (error) {
    console.error('[Cron] Hot lead scan error:', error);
    const message = error instanceof Error ? error.message : 'Hot lead scan failed';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
