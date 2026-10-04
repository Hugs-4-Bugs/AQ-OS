// ═══════════════════════════════════════════════════════════════════
// POST /api/outreach/autonomous — Single autonomous outreach
//
// Body: { leadId, channel, autonomyMode?, tone?, customInstructions? }
// Auth: withAuth + withApiLogging
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { autonomousOutreach, type OutreachAutonomyMode } from '@/lib/autonomous-outreach-service';
import type { AuthUser } from '@/lib/auth';

export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const body = await request.json();
      const { leadId, channel, autonomyMode, tone, customInstructions } = body;

      // Validate required fields
      if (!leadId || typeof leadId !== 'string') {
        return NextResponse.json(
          { error: 'leadId is required and must be a string' },
          { status: 400 }
        );
      }

      const validChannels = ['email', 'whatsapp', 'telegram'];
      if (!channel || !validChannels.includes(channel)) {
        return NextResponse.json(
          { error: `channel must be one of: ${validChannels.join(', ')}` },
          { status: 400 }
        );
      }

      // Validate autonomy mode if provided
      if (autonomyMode) {
        const validModes: OutreachAutonomyMode[] = ['manual', 'assisted', 'autonomous'];
        if (!validModes.includes(autonomyMode)) {
          return NextResponse.json(
            { error: `autonomyMode must be one of: ${validModes.join(', ')}` },
            { status: 400 }
          );
        }
      }

      const result = await autonomousOutreach({
        userId: user.id,
        leadId,
        channel,
        autonomyMode: autonomyMode as OutreachAutonomyMode | undefined,
        tone,
        customInstructions,
      });

      const statusCode = result.success ? 200 : 422;

      return NextResponse.json({
        success: result.success,
        action: result.action,
        messageId: result.messageId,
        message: result.message,
        creditsUsed: result.creditsUsed,
        autonomyMode: result.autonomyMode,
        error: result.error,
      }, { status: statusCode });
    } catch (error) {
      console.error('[API /outreach/autonomous] POST failed:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Autonomous outreach failed' },
        { status: 500 }
      );
    }
  });
}, 'outreach/autonomous');
