// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Webhook Trigger API
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { handleWebhookTrigger } from '@/lib/workflow-executor';

/** POST /api/workflows/webhook/[...path] — Webhook trigger endpoint */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const webhookPath = path.join('/');

    const body = await request.json().catch(() => ({}));

    const execution = await handleWebhookTrigger(webhookPath, body);

    return NextResponse.json(execution, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook trigger failed';

    if (message.includes('No active workflow')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    console.error('[Workflows API] Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook trigger failed' },
      { status: 500 }
    );
  }
}
