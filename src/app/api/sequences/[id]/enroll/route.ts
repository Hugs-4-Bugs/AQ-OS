// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/sequences/[id]/enroll
// Enroll one or more leads into a sequence.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { enrollLead, bulkEnroll } from '@/lib/email-sequence-service';

// POST /api/sequences/[id]/enroll — Enroll lead(s)
export const POST = withApiLogging(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return withAuth(request, async (user) => {
    try {
      const { id: sequenceId } = await params;
      const body = await request.json();

      // Single lead enrollment
      if (body.leadId) {
        if (typeof body.leadId !== 'string') {
          return NextResponse.json({ error: 'leadId must be a string' }, { status: 400 });
        }

        const result = await enrollLead(sequenceId, body.leadId, user.id);

        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({
          enrollment: result.enrollment,
          creditsDeducted: result.creditsDeducted,
          newBalance: result.newBalance,
        }, { status: 201 });
      }

      // Bulk lead enrollment
      if (body.leadIds && Array.isArray(body.leadIds)) {
        if (body.leadIds.length === 0) {
          return NextResponse.json({ error: 'leadIds must be a non-empty array' }, { status: 400 });
        }

        if (body.leadIds.length > 500) {
          return NextResponse.json({ error: 'Maximum 500 leads per bulk enrollment' }, { status: 400 });
        }

        const result = await bulkEnroll(sequenceId, body.leadIds, user.id);

        return NextResponse.json({
          enrolled: result.enrolled.length,
          enrolledIds: result.enrolled,
          skipped: result.skipped,
          failed: result.failed,
        }, { status: 201 });
      }

      return NextResponse.json(
        { error: 'Either leadId or leadIds is required' },
        { status: 400 }
      );
    } catch (error) {
      console.error('[API] Enroll lead error:', error);
      return NextResponse.json({ error: 'Failed to enroll leads' }, { status: 500 });
    }
  });
}, 'sequences/enroll');
