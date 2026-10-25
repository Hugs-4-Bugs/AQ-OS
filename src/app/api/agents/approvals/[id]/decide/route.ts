// POST /api/agents/approvals/[id]/decide — approve or reject a tool invocation
// When approved + the tool was email.send/email.reply, the runtime will
// resume the paused run and execute the tool.
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { invokeTool } from '@/lib/ai/agent-tools';
import type { ToolContext } from '@/lib/ai/agent-tools';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, async (user) => {
    const { id } = await params;
    let body: Record<string, unknown>;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    const decision = body.decision as string | undefined; // "approve" | "reject"
    if (decision !== 'approve' && decision !== 'reject') {
      return NextResponse.json({ error: 'decision must be "approve" or "reject"' }, { status: 400 });
    }

    const approval = await db.agentApproval.findUnique({ where: { id } });
    if (!approval) return NextResponse.json({ error: 'Approval not found' }, { status: 404 });
    if (approval.status !== 'requested') {
      return NextResponse.json({ error: `Approval already ${approval.status}` }, { status: 400 });
    }

    // Mark the approval as decided.
    await db.agentApproval.update({
      where: { id },
      data: {
        status: decision === 'approve' ? 'approved' : 'rejected',
        decidedAt: new Date(),
        decidedBy: user.id,
        decisionNote: (body.note as string | undefined) || null,
      },
    });

    if (decision === 'reject') {
      // Update the run status to cancelled (the paused run cannot continue).
      await db.agentRun.updateMany({
        where: { id: approval.runId, status: 'paused_awaiting_approval' },
        data: { status: 'cancelled', error: `Approval ${id} rejected by user` },
      });
      return NextResponse.json({ decided: 'rejected', runCancelled: true });
    }

    // Approved — execute the tool NOW (the runtime paused before invoking).
    // Load the agent to get the userId/orgId for the ToolContext.
    const agent = await db.agent.findUnique({ where: { id: approval.agentId } });
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Parse the input that was about to be passed to the tool.
    let toolInput: Record<string, unknown> = {};
    try { toolInput = JSON.parse(approval.input); } catch { /* keep default */ }

    // Build the tool context for the approved execution.
    const toolCtx: ToolContext = {
      userId: user.id,
      orgId: agent.orgId || null,
      // Approved execution = autonomous for this single call.
      emailPermission: 'autonomous',
      invocationId: `approval:${approval.id}`,
      executionId: undefined,
      runId: approval.runId,
      leadId: undefined,
      idempotencyKey: `approval:${approval.id}`,
      log: (event, details) => console.log(`[Approval ${approval.id}] ${event}`, details || ''),
    };

    const toolResult = await invokeTool(approval.toolName, toolInput, toolCtx);

    // Persist the invocation result on the approval row.
    await db.agentApproval.update({
      where: { id },
      data: {
        invocationResult: JSON.stringify(toolResult.output || toolResult.error),
      },
    });

    // Update the run status to completed (the paused run is now resumed + finished).
    await db.agentRun.updateMany({
      where: { id: approval.runId, status: 'paused_awaiting_approval' },
      data: {
        status: 'completed',
        finishedAt: new Date(),
        result: JSON.stringify({ approvedToolCall: approval.toolName, toolResult }),
      },
    });

    return NextResponse.json({ decided: 'approved', toolExecuted: true, toolResult });
  });
}
