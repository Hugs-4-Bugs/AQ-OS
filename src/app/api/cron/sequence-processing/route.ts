import { NextResponse } from 'next/server';
import { emailSequenceEngine } from '@/lib/email-sequence-engine';

// ═══════════════════════════════════════════════════════════════════
// Cron Endpoint: Sequence Step Processing
//
// Called periodically (e.g., every 5-15 minutes) to process all
// due sequence steps. Requires Bearer token auth for security.
//
// POST /api/cron/sequence-processing
// Authorization: Bearer <CRON_SECRET>
// ═══════════════════════════════════════════════════════════════════

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: Request) {
  try {
    // Verify cron auth — require CRON_SECRET to be set
    if (!CRON_SECRET) {
      console.error('[Cron/SequenceProcessing] CRON_SECRET not configured');
      return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
    }
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (token !== CRON_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const result = await emailSequenceEngine.processDueSteps();

    return NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron/SequenceProcessing] Fatal error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Sequence processing failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
