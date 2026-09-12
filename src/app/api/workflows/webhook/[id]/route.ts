// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Webhook API Route
// Phase 12: Webhook trigger endpoint (no auth, validates signature)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { executeWorkflow } from '@/lib/workflow-engine';
import { logWorkflowEvent } from '@/lib/workflow-audit';
import { createHmac } from 'crypto';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Find the workflow
    const workflow = await db.workflowDefinition.findFirst({
      where: { id, status: 'active', triggerType: 'webhook' },
    });

    if (!workflow) {
      return NextResponse.json(
        { error: 'Workflow not found or not a webhook trigger' },
        { status: 404 }
      );
    }

    // Get the raw body
    const rawBody = await request.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = { raw: rawBody };
    }

    // Validate webhook signature if triggerConfig has a secret
    if (workflow.triggerConfig) {
      let config: Record<string, unknown>;
      try {
        config = JSON.parse(workflow.triggerConfig);
      } catch {
        config = {};
      }

      if (config.webhookSecret) {
        const signature = request.headers.get('x-webhook-signature') ||
          request.headers.get('x-hub-signature-256') || '';

        const expectedSignature = createHmac('sha256', String(config.webhookSecret))
          .update(rawBody)
          .digest('hex');

        if (signature !== `sha256=${expectedSignature}` && signature !== expectedSignature) {
          return NextResponse.json(
            { error: 'Invalid webhook signature' },
            { status: 401 }
          );
        }
      }
    }

    // Execute the workflow
    const idempotencyKey = `webhook_${id}_${(body as Record<string, unknown>).id || Date.now()}`;

    const result = await executeWorkflow(
      id,
      workflow.userId,
      { eventType: 'webhook', ...body },
      idempotencyKey
    );

    // Audit log
    await logWorkflowEvent(workflow.userId, 'workflow_executed', {
      workflowId: id,
      executionId: result.executionId,
      triggerType: 'webhook',
    });

    return NextResponse.json(
      {
        received: true,
        executionId: result.executionId,
        status: result.status,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('[WorkflowWebhookAPI] POST error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
