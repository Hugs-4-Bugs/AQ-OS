// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/autonomous-outreach/generate
// Generate personalized outreach message for a lead
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { autonomousOutreachService } from '@/lib/autonomous-outreach';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { leadId, channel } = body as {
        leadId?: string;
        channel?: string;
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

      const content = await autonomousOutreachService.generateOutreach(leadId, channel);

      return NextResponse.json({
        success: true,
        data: {
          leadId,
          channel,
          content,
        },
      });
    } catch (error) {
      console.error('[AutonomousOutreach] Generate endpoint error:', error);
      return NextResponse.json(
        { error: 'Failed to generate outreach' },
        { status: 500 }
      );
    }
  });
}
