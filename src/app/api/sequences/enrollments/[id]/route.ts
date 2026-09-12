// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET/DELETE/POST/PATCH /api/sequences/enrollments/[id]
// Get enrollment detail, unenroll, pause, or resume enrollment.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { unenrollLead, pauseEnrollment, resumeEnrollment } from '@/lib/email-sequence-service';
import { db } from '@/lib/db';

// GET /api/sequences/enrollments/[id] — Get enrollment detail
export const GET = withApiLogging(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      const enrollment = await db.sequenceEnrollment.findFirst({
        where: { id },
        include: {
          sequence: {
            select: {
              id: true,
              name: true,
              status: true,
              channel: true,
              userId: true,
            },
          },
          lead: {
            select: {
              id: true,
              businessName: true,
              ownerName: true,
              email: true,
            },
          },
        },
      });

      if (!enrollment) {
        return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
      }

      if (enrollment.sequence.userId !== user.id) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }

      // Get step info for current and past steps
      const steps = await db.sequenceStep.findMany({
        where: { sequenceId: enrollment.sequenceId },
        orderBy: { order: 'asc' },
      });

      const messages = await db.outreachMessage.findMany({
        where: {
          leadId: enrollment.leadId,
          sequenceStepId: { in: steps.map(s => s.id) },
        },
        orderBy: { createdAt: 'asc' },
      });

      return NextResponse.json({
        ...enrollment,
        nextSendAt: enrollment.nextSendAt?.toISOString() || null,
        sequence: {
          ...enrollment.sequence,
        },
        lead: enrollment.lead,
        currentStepDetail: steps[enrollment.currentStep] || null,
        totalSteps: steps.length,
        messagesSent: messages.length,
        messages: messages.map(m => ({
          id: m.id,
          channel: m.channel,
          status: m.status,
          sentAt: m.sentAt?.toISOString() || null,
          openedAt: m.openedAt?.toISOString() || null,
          repliedAt: m.repliedAt?.toISOString() || null,
        })),
      });
    } catch (error) {
      console.error('[API] Get enrollment detail error:', error);
      return NextResponse.json({ error: 'Failed to get enrollment detail' }, { status: 500 });
    }
  });
}, 'sequences/enrollment-detail');

// DELETE /api/sequences/enrollments/[id] — Unenroll/opt-out
export const DELETE = withApiLogging(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const result = await unenrollLead(id, user.id);

      if (!result.success) {
        const status = result.error?.includes('not found') ? 404 :
                       result.error?.includes('authorized') ? 403 : 400;
        return NextResponse.json({ error: result.error }, { status });
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('[API] Unenroll error:', error);
      return NextResponse.json({ error: 'Failed to unenroll' }, { status: 500 });
    }
  });
}, 'sequences/unenroll');

// POST /api/sequences/enrollments/[id] — Pause enrollment
export const POST = withApiLogging(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const result = await pauseEnrollment(id, user.id);

      if (!result.success) {
        const status = result.error?.includes('not found') ? 404 :
                       result.error?.includes('authorized') ? 403 : 400;
        return NextResponse.json({ error: result.error }, { status });
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('[API] Pause enrollment error:', error);
      return NextResponse.json({ error: 'Failed to pause enrollment' }, { status: 500 });
    }
  });
}, 'sequences/pause-enrollment');

// PATCH /api/sequences/enrollments/[id] — Resume enrollment
export const PATCH = withApiLogging(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const result = await resumeEnrollment(id, user.id);

      if (!result.success) {
        const status = result.error?.includes('not found') ? 404 :
                       result.error?.includes('authorized') ? 403 : 400;
        return NextResponse.json({ error: result.error }, { status });
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('[API] Resume enrollment error:', error);
      return NextResponse.json({ error: 'Failed to resume enrollment' }, { status: 500 });
    }
  });
}, 'sequences/resume-enrollment');
