// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/discovery/status
// Returns the current discovery job status for the authenticated user.
// Queries the most recent DiscoveryJob and returns progress.
// Uses withAuth middleware — no custom auth logic.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const jobId = searchParams.get('jobId');

      let job;

      if (jobId) {
        // Get specific job by ID
        job = await db.discoveryJob.findFirst({
          where: { id: jobId, userId: user.id },
        });
      } else {
        // Get the most recent running/pending job
        job = await db.discoveryJob.findFirst({
          where: { userId: user.id, status: { in: ['pending', 'running'] } },
          orderBy: { createdAt: 'desc' },
        });

        // If no running job, get the most recent completed/failed job
        if (!job) {
          job = await db.discoveryJob.findFirst({
            where: { userId: user.id, source: 'full_pipeline' },
            orderBy: { createdAt: 'desc' },
          });
        }
      }

      if (!job) {
        return NextResponse.json({
          running: false,
          jobId: null,
          progress: 0,
          total: 0,
          status: 'idle',
          error: null,
        });
      }

      return NextResponse.json({
        running: job.status === 'running' || job.status === 'pending',
        jobId: job.id,
        progress: job.progress,
        total: job.total,
        status: job.status,
        error: job.errorMessage,
        totalFound: job.totalFound,
        imported: job.imported,
        duplicates: job.duplicates,
        failed: job.failed,
        source: job.source,
        niche: job.niche,
        country: job.country,
        city: job.city,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
      });
    } catch (error) {
      console.error('[DiscoveryStatus] Error:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
