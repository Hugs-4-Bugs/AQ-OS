// POST /api/agents/approvals/[id]/decide — approve or reject a tool invocation
// When approved + the tool was email.send/email.reply, the runtime will
// resume the paused run and execute the tool.
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { authorizeAndInvokeTool, type AgentToolAuthContext } from '@/lib/ai/agent-authz';

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

    // FIX: ownership check — the approval must belong to the authenticated user.
    // The AgentApproval table now has a `userId` field (Workstream D §8) for
    // ownership scoping. Without this check, User B could approve User A's
    // agent's tool execution.
    if (approval.userId !== user.id) {
      return NextResponse.json({ error: 'Approval not owned by this user' }, { status: 403 });
    }

    if (approval.status !== 'requested') {
      return NextResponse.json({ error: `Approval already ${approval.status}` }, { status: 400 });
    }

    // Mark the approval as decided (CAS via updateMany — only transitions if
    // status is still 'requested', preventing double-decision races).
    const transitioned = await db.agentApproval.updateMany({
      where: { id, status: 'requested' },
      data: {
        status: decision === 'approve' ? 'approved' : 'rejected',
        decidedAt: new Date(),
        decidedBy: user.id,
        decisionNote: (body.note as string | undefined) || null,
      },
    });
    if (transitioned.count === 0) {
      return NextResponse.json({ error: `Approval already processed` }, { status: 400 });
    }

    if (decision === 'reject') {
      // Update the run status to cancelled (the paused run cannot continue).
      await db.agentRun.updateMany({
        where: { id: approval.runId, status: 'paused_awaiting_approval' },
        data: { status: 'cancelled', error: `Approval ${id} rejected by user` },
      });
      return NextResponse.json({ decided: 'rejected', runCancelled: true });
    }

    // Approved — execute the tool through the full authorization chain
    // (agent-authz.ts). authorizeAndInvokeTool wraps the invocation in:
    //   · evaluateAuthorization (9-check chain — agent ownership, run
    //     ownership, connected-account resolution, capability, permission)
    //   · withIdempotency (persistent AgentOperation fingerprint — a
    //     duplicate approve callback returns the existing result without
    //     re-executing the tool. NO double-send.)
    //   · invokeTool (the actual tool execution via the secure registry)
    //   · audit logging (agentActivity)
    const agent = await db.agent.findUnique({ where: { id: approval.agentId } });
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    let toolInput: Record<string, unknown> = {};
    try { toolInput = JSON.parse(approval.input); } catch { /* keep default */ }

    const authzCtx: AgentToolAuthContext = {
      userId: user.id,
      orgId: agent.orgId || null,
      agentId: agent.id,
      runId: approval.runId,
      executionId: null,
      leadId: typeof toolInput.leadId === 'string' ? toolInput.leadId : null,
      emailPermission: 'autonomous', // human-approved single call
      toolLevelPermission: 'autonomous',
      approvalPolicy: 'autonomous', // already approved — no further approval needed
      permissionCategoriesJson: (agent as { permissionCategories?: string | null }).permissionCategories ?? null,
      invocationId: `approval:${approval.id}`,
      log: (event, details) => console.log(`[Approval ${approval.id}] ${event}`, details || ''),
    };

    const toolResult = await authorizeAndInvokeTool(approval.toolName, toolInput, authzCtx);

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
