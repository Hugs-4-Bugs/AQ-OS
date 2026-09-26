import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdmin } from '@/lib/auth-middleware';
import { processPendingSequences } from '@/lib/sequence-processor';

// SECURITY HARDENING: this endpoint processes pending sequence steps for
// ALL tenants (real outreach sends). It previously required only any
// authenticated user, allowing repeated invocations outside the cron
// cadence. It is now super-admin-only (external schedulers should call
// /api/cron/process-sequences with CRON_SECRET instead).
export async function POST(request: NextRequest) {
  return withSuperAdmin(request, async (user) => {
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
