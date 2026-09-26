// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/prospecting/research-batch/status?jobId=
// Live progress of a batch deep-research job (UI polls this).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { getResearchJobStatus } from '@/lib/prospecting/batch-research';

export const GET = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const jobId = request.nextUrl.searchParams.get('jobId');
      if (!jobId) {
        return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
      }

      const job = await getResearchJobStatus(jobId, user.id);
      if (!job) {
        return NextResponse.json({ error: 'Research job not found' }, { status: 404 });
      }

      return NextResponse.json({ job });
    } catch (err) {
      console.error('[ResearchBatch:status] Unexpected error:', err);
      return NextResponse.json({ error: 'Failed to load research job status' }, { status: 500 });
    }
  });
}, 'prospecting/research-batch/status');
