// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autonomous Classify Reply API
// POST: Classify a reply's intent
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { classifyReplyIntent, classifyReplyAndAct } from '@/lib/autonomous-outreach-engine';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { messageContent, leadId } = body;

      if (!messageContent || typeof messageContent !== 'string' || !messageContent.trim()) {
        return NextResponse.json(
          { error: 'Missing required field: messageContent' },
          { status: 400 }
        );
      }

      // If leadId is provided, fetch lead context from DB and use classifyReplyAndAct
      // which handles credit deduction and auto pipeline movement
      if (leadId && typeof leadId === 'string') {
        const lead = await db.lead.findFirst({
          where: { id: leadId, userId: user.id, isActive: true },
          include: {
            outreachMessages: {
              where: { direction: 'outbound' },
              orderBy: { createdAt: 'desc' },
              take: 3,
            },
          },
        });

        if (!lead) {
          return NextResponse.json(
            { error: 'Lead not found or inactive' },
            { status: 404 }
          );
        }

        // Build lead context from fetched data
        const leadContext = {
          businessName: lead.businessName || undefined,
          ownerName: lead.ownerName || undefined,
          niche: lead.niche || undefined,
          previousMessages: lead.outreachMessages
            .map((m) => m.content)
            .join('\n---\n') || undefined,
        };

        // Use classifyReplyAndAct which handles credit deduction, classification,
        // auto pipeline movement, and activity logging
        const classification = await classifyReplyAndAct(
          messageContent.trim(),
          leadId,
          user.id,
          leadContext
        );

        return NextResponse.json({
          success: true,
          classification,
          leadId,
        });
      }

      // Without leadId: just classify without credit deduction or DB writes
      // This is the lightweight version for ad-hoc classification
      const classification = await classifyReplyIntent(messageContent.trim(), {});

      return NextResponse.json({
        success: true,
        classification,
      });
    } catch (error) {
      console.error('[ClassifyReplyAPI] POST error:', error);
      return NextResponse.json(
        { error: 'Failed to classify reply' },
        { status: 500 }
      );
    }
  });
}
