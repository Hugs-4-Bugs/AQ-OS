import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { emailSequenceEngine } from '@/lib/email-sequence-engine';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { enrollmentId } = body;

      if (!enrollmentId || typeof enrollmentId !== 'string') {
        return NextResponse.json(
          { success: false, error: 'enrollmentId is required' },
          { status: 400 }
        );
      }

      // Verify the enrollment belongs to a sequence owned by this user
      const enrollment = await db.sequenceEnrollment.findUnique({
        where: { id: enrollmentId },
        include: {
          sequence: {
            select: { userId: true },
          },
        },
      });

      if (!enrollment) {
        return NextResponse.json(
          { success: false, error: 'Enrollment not found' },
          { status: 404 }
        );
      }

      if (enrollment.sequence.userId !== user.id) {
        return NextResponse.json(
          { success: false, error: 'Access denied' },
          { status: 403 }
        );
      }

      await emailSequenceEngine.pauseEnrollment(enrollmentId);

      return NextResponse.json({
        success: true,
        data: { enrollmentId, status: 'paused' },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to pause enrollment';
      console.error('[Sequences/Pause] Error:', error);
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 }
      );
    }
  });
}
