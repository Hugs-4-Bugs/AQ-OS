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

    // Keep the raw body so HMAC signature verification (when the workflow
    // has a webhookSecret configured) matches exactly what was sent.
    const rawBody = await request.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = {};
    }

    const execution = await handleWebhookTrigger(webhookPath, body, {
      rawBody,
      signature:
        request.headers.get('x-webhook-signature') ||
        request.headers.get('x-hub-signature-256') ||
        '',
    });

    return NextResponse.json(execution, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook trigger failed';

    if (message.includes('No active workflow')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (message.includes('Invalid webhook signature')) {
      return NextResponse.json({ error: message }, { status: 401 });
    }

    console.error('[Workflows API] Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook trigger failed' },
      { status: 500 }
    );
  }
}
