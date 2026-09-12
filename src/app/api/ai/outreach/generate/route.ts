// ═══════════════════════════════════════════════════════════════════
// POST /api/ai/outreach/generate — Generate AI outreach messages
// Phase 8: Outreach Generation API
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { generateOutreach, type OutreachChannel, type OutreachTone } from '@/lib/ai/outreach-generator';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { leadId, channel, tone, language, customInstructions, previousMessageId } = body;

      if (!leadId || typeof leadId !== 'string') {
        return NextResponse.json(
          { error: 'leadId is required' },
          { status: 400 }
        );
      }

      const validChannels: OutreachChannel[] = ['email', 'whatsapp', 'telegram', 'linkedin', 'instagram'];
      if (!channel || !validChannels.includes(channel)) {
        return NextResponse.json(
          { error: `channel must be one of: ${validChannels.join(', ')}` },
          { status: 400 }
        );
      }

      const validTones: OutreachTone[] = ['professional', 'casual', 'urgent', 'friendly', 'formal'];
      const selectedTone: OutreachTone = tone && validTones.includes(tone) ? tone : 'professional';

      const result = await generateOutreach({
        leadId,
        userId: user.id,
        channel,
        tone: selectedTone,
        language: language || 'English',
        customInstructions,
        previousMessageId,
      });

      if (!result.success) {
        const statusCode = result.error?.includes('Insufficient credits') ? 402 : 500;
        return NextResponse.json(
          { error: result.error },
          { status: statusCode }
        );
      }

      return NextResponse.json({
        success: true,
        message: result.message,
        creditsDeducted: result.creditsDeducted,
        newBalance: result.newBalance,
      });
    } catch (error) {
      console.error('[API /ai/outreach/generate] Error:', error);
      return NextResponse.json(
        { error: 'Failed to generate outreach' },
        { status: 500 }
      );
    }
  });
}
