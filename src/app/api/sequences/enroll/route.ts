import { withAuth } from '@/lib/auth-middleware';
import { emailSequenceEngine } from '@/lib/email-sequence-engine';
import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { sequenceId, leadId, leadIds } = body;

      // Support enrolling a single lead or multiple leads
      const targetLeadIds: string[] = [];

      if (leadId) {
        targetLeadIds.push(leadId);
      } else if (leadIds && Array.isArray(leadIds)) {
        targetLeadIds.push(...leadIds);
      } else {
        return NextResponse.json(
          { success: false, error: 'leadId or leadIds is required' },
          { status: 400 }
        );
      }

      if (!sequenceId || typeof sequenceId !== 'string') {
        return NextResponse.json(
          { success: false, error: 'sequenceId is required' },
          { status: 400 }
        );
      }

      // Verify the sequence belongs to the user
      const sequence = await db.outreachSequence.findFirst({
        where: {
          id: sequenceId,
          userId: user.id,
        },
      });

      if (!sequence) {
        return NextResponse.json(
          { success: false, error: 'Sequence not found' },
          { status: 404 }
        );
      }

      // ACCOUNT ISOLATION: every lead to enroll MUST belong to the caller.
      // The sequence engine does not verify ownership itself — without
      // this check a user could enroll ANOTHER tenant's lead into their
      // sequence (spam + data leak).
      const ownedLeads = await db.lead.findMany({
        where: { id: { in: targetLeadIds }, userId: user.id },
        select: { id: true },
      });
      const ownedIds = new Set(ownedLeads.map((l) => l.id));
      const unauthorized = targetLeadIds.filter((lid) => !ownedIds.has(lid));
      if (unauthorized.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'One or more leads not found in your account',
          },
          { status: 403 }
        );
      }

      // Enroll leads
      const results: Array<{
        leadId: string;
        success: boolean;
        enrollmentId?: string;
        error?: string;
      }> = [];

      for (const lid of targetLeadIds) {
        try {
          const enrollment = await emailSequenceEngine.enrollLead(sequenceId, lid);
          results.push({
            leadId: lid,
            success: true,
            enrollmentId: enrollment.id,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          results.push({
            leadId: lid,
            success: false,
            error: message,
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.filter((r) => !r.success).length;

      return NextResponse.json({
        success: true,
        data: {
          enrolled: successCount,
          failed: failureCount,
          results,
        },
      });
    } catch (error) {
      console.error('[Sequences/Enroll] Error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to enroll leads' },
        { status: 500 }
      );
    }
  });
}
