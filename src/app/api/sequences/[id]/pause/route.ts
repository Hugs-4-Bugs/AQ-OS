// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/sequences/[id]/pause
// Pause an entire sequence (pauses all active enrollments).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { pauseSequence } from '@/lib/email-sequence-service';

// POST /api/sequences/[id]/pause — Pause sequence
export const POST = withApiLogging(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const result = await pauseSequence(id, user.id);

      if (!result.success) {
        const status = result.error?.includes('not found') ? 404 : 400;
        return NextResponse.json({ error: result.error }, { status });
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('[API] Pause sequence error:', error);
      return NextResponse.json({ error: 'Failed to pause sequence' }, { status: 500 });
    }
  });
}, 'sequences/pause');
