// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/autonomous-outreach/dispatch
// Dispatch outreach message to a lead
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { autonomousOutreachService } from '@/lib/autonomous-outreach';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { leadId, channel, subject, body: messageBody } = body as {
        leadId?: string;
        channel?: string;
        subject?: string;
        body?: string;
      };

      if (!leadId || typeof leadId !== 'string') {
        return NextResponse.json(
          { error: 'leadId is required' },
          { status: 400 }
        );
      }

      if (!channel || typeof channel !== 'string') {
        return NextResponse.json(
          { error: 'channel is required' },
          { status: 400 }
        );
      }

      const validChannels = ['email', 'whatsapp', 'linkedin', 'instagram'];
      if (!validChannels.includes(channel)) {
        return NextResponse.json(
          { error: `Invalid channel. Must be one of: ${validChannels.join(', ')}` },
          { status: 400 }
        );
      }

      if (!messageBody || typeof messageBody !== 'string') {
        return NextResponse.json(
          { error: 'body is required' },
          { status: 400 }
        );
      }

      if (messageBody.trim().length === 0) {
        return NextResponse.json(
          { error: 'body cannot be empty' },
          { status: 400 }
        );
      }

      const outreachMessage = await autonomousOutreachService.dispatchOutreach(
        leadId,
        channel,
        {
          subject: subject || undefined,
          body: messageBody,
        },
        user.id
      );

      return NextResponse.json({
        success: true,
        data: outreachMessage,
      });
    } catch (error) {
      console.error('[AutonomousOutreach] Dispatch endpoint error:', error);
      return NextResponse.json(
        { error: 'Failed to dispatch outreach' },
        { status: 500 }
      );
    }
  });
}
