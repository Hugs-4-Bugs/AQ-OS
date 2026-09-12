// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/sequences/[id]/resume
// Resume a paused sequence (resumes all paused enrollments).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { resumeSequence } from '@/lib/email-sequence-service';

// POST /api/sequences/[id]/resume — Resume sequence
export const POST = withApiLogging(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const result = await resumeSequence(id, user.id);

      if (!result.success) {
        const status = result.error?.includes('not found') ? 404 : 400;
        return NextResponse.json({ error: result.error }, { status });
      }

      return NextResponse.json({
        success: true,
        resumedCount: result.resumedCount,
      });
    } catch (error) {
      console.error('[API] Resume sequence error:', error);
      return NextResponse.json({ error: 'Failed to resume sequence' }, { status: 500 });
    }
  });
}, 'sequences/resume');
