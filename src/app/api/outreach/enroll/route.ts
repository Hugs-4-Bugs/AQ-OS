// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Outreach Enroll API Route
// POST /api/outreach/enroll — Enroll a single lead in a sequence
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import type { AuthUser } from '@/lib/auth';
import { enrollLeadInSequence } from '@/lib/sequence-execution-engine';

// POST /api/outreach/enroll
export async function POST(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const body = await request.json();
      const { sequenceId, leadId, startAt, variables } = body;

      // Validate required fields
      if (!sequenceId || typeof sequenceId !== 'string') {
        return NextResponse.json(
          { error: 'sequenceId is required and must be a string' },
          { status: 400 }
        );
      }
      if (!leadId || typeof leadId !== 'string') {
        return NextResponse.json(
          { error: 'leadId is required and must be a string' },
          { status: 400 }
        );
      }

      // Validate optional fields
      const enrollmentInput: {
        sequenceId: string;
        leadId: string;
        userId: string;
        startAt?: Date;
        variables?: Record<string, string>;
      } = {
        sequenceId,
        leadId,
        userId: user.id,
      };

      if (startAt) {
        const parsedDate = new Date(startAt);
        if (isNaN(parsedDate.getTime())) {
          return NextResponse.json(
            { error: 'startAt must be a valid ISO date string' },
            { status: 400 }
          );
        }
        enrollmentInput.startAt = parsedDate;
      }

      if (variables) {
        if (typeof variables !== 'object' || Array.isArray(variables)) {
          return NextResponse.json(
            { error: 'variables must be an object with string key-value pairs' },
            { status: 400 }
          );
        }
        enrollmentInput.variables = variables as Record<string, string>;
      }

      const result = await enrollLeadInSequence(enrollmentInput);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Enrollment failed' },
          { status: 422 }
        );
      }

      return NextResponse.json({
        success: true,
        enrollmentId: result.enrollmentId,
      });
    } catch (error) {
      console.error('[OutreachEnroll API] POST failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to enroll lead in sequence';
      return NextResponse.json(
        { error: message },
        { status: 500 }
      );
    }
  });
}
