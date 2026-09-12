// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Detect Meeting Intent API
// POST /api/meetings/detect-intent — Detect meeting intent from text
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { detectMeetingIntent } from '@/lib/meeting-orchestration-service';
import { db } from '@/lib/db';

export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();

      if (!body.text || typeof body.text !== 'string') {
        return NextResponse.json(
          { error: 'Missing required field: text (string)' },
          { status: 400 }
        );
      }

      const result = detectMeetingIntent(body.text);

      // Log the intent detection for analytics
      if (result.intent) {
        try {
          await db.meetingIntentLog.create({
            data: {
              userId: user.id,
              leadId: body.leadId || null,
              sourceType: body.sourceType || 'chat',
              sourceId: body.sourceId || null,
              detectedIntent: result.intent,
              confidence: result.confidence,
              originalText: body.text.substring(0, 1000), // Limit stored text
              suggestedAction: result.suggestedAction
                ? JSON.stringify({ action: result.suggestedAction })
                : null,
              status: 'detected',
            },
          });
        } catch (logError) {
          console.error('[Detect Intent API] Failed to log intent:', logError);
          // Don't fail the request if logging fails
        }
      }

      return NextResponse.json({
        intent: result.intent,
        confidence: result.confidence,
        suggestedAction: result.suggestedAction || null,
        hasIntent: !!result.intent,
      });
    } catch (error) {
      console.error('[Detect Intent API] POST Error:', error);
      return NextResponse.json(
        { error: 'Failed to detect meeting intent' },
        { status: 500 }
      );
    }
  });
}, 'meetings/detect-intent');
