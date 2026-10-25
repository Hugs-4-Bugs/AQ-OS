// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Agent Runtime (Phase 26 v3 — Decisions 6+7+8+9+12+19)
//
// The bounded reasoning loop:
//   REASON (call AI brain with tool definitions + memory)
//   → SELECT TOOL/ACTION (model returns a tool call OR a final answer)
//   → VALIDATE TOOL/PERMISSION (check Agent.toolPermissions)
//   → INVOKE TOOL (via the existing secure registry)
//   → OBSERVE RESULT (append to memory as tool_result)
//   → UPDATE CONTEXT/MEMORY (trim to memoryConfig.windowSize)
//   → REASON AGAIN
//   → CONTINUE
//   → COMPLETE (model returns a final answer with no tool call)
//
// Safety (Decision 6):
//   - maxIterations: hard cap (default 25, configurable per agent)
//   - timeoutMs: hard timeout (default 5 min)
//   - cancellation: isCancelled() probe between iterations
//   - The model can ONLY call registered AcquisitionOS tools — never
//     arbitrary server code. Tool inputs are schema-validated by the
//     registry dispatcher.
//   - On permission denial: the agent receives an "error: permission
//     denied" tool result, can reason about it, and either retry with
//     a different tool or complete.
//   - On approval-required (email.send with send_with_approval): the
//     runtime creates an AgentApproval row, pauses, waits for human
//     decision, then resumes or cancels based on the decision.
//
// Memory (Decision H):
//   - AgentMemory rows persisted per (agentId, role, content, runId)
//   - windowSize: last N messages retained in context (default 20)
//   - maxTokens: hard cap on total context tokens (default 4000)
//   - Memory is loaded at run start and trimmed to windowSize.
//
// Per-tool permissions (Decision 8):
//   - Agent.toolPermissions JSON: { "email.send": "send_with_approval", ... }
//   - The runtime checks permission BEFORE invoking each tool.
//   - For email tools with send_with_approval: create AgentApproval,
//     pause, wait for decision.
//
// Single brain (Decision 12):
//   - One provider+model for reasoning (NOT multi-model).
//   - Multi-model orchestration belongs to workflow steps only.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import type { AgentRow } from '@/lib/ai/agent-service';
import { isToolAllowed, getToolPermission } from '@/lib/ai/agent-service';
import { invokeTool, listTools } from '@/lib/ai/agent-tools';
import type { ToolContext } from '@/lib/ai/agent-tools';
import { executeAICompletion } from '@/lib/ai/ai-provider';
import { resolveProviderApiKey, markProviderInvalid } from '@/lib/ai/user-ai-provider-service';

export interface AgentRunOptions {
  agentId: string;
  userId: string;
  triggerSource: string; // "manual" | "schedule" | "trigger:<event>" | "workflow:<executionId>"
  initialPrompt?: string; // user's task description
  executionId?: string; // when invoked from a workflow
  runId?: string; // when invoked from an autopilot run
  leadId?: string; // when scoped to a lead
  isCancelled?: () => Promise<boolean>;
}

export interface AgentRunResult {
  runId: string;
  status: 'completed' | 'failed' | 'cancelled' | 'paused_awaiting_approval' | 'timeout';
  iterationsUsed: number;
  tokensUsed: number;
  toolsCalled: number;
  finalAnswer: string | null;
  error: string | null;
  durationMs: number;
}

/**
 * Run an AI agent to completion (or until paused awaiting approval, or
 * until maxIterations/timeout, or until cancelled).
 *
 * This is the canonical entry point for agent execution.
 */
export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const startedAt = Date.now();
  const agent = await db.agent.findFirst({
    where: { id: opts.agentId, userId: opts.userId }, // ownership filter
  });
  if (!agent) {
    return {
      runId: '',
      status: 'failed',
      iterationsUsed: 0, tokensUsed: 0, toolsCalled: 0,
      finalAnswer: null,
      error: 'Agent not found or not owned by caller',
      durationMs: Date.now() - startedAt,
    };
  }
  if (agent.status !== 'active') {
    return {
      runId: '',
      status: 'failed',
      iterationsUsed: 0, tokensUsed: 0, toolsCalled: 0,
      finalAnswer: null,
      error: `Agent status is "${agent.status}" — must be "active" to run`,
      durationMs: Date.now() - startedAt,
    };
  }

  // Create the AgentRun row.
  const run = await db.agentRun.create({
    data: {
      agentId: agent.id,
      userId: opts.userId,
      orgId: agent.orgId || null,
      triggerSource: opts.triggerSource,
      status: 'running',
      startedAt: new Date(),
    },
  });

  // Parse agent config (JSON fields).
  let toolPermissions: Record<string, string> = {};
  let memoryConfig = { windowSize: 20, maxTokens: 4000 };
  let retryPolicy = { maxRetries: 2, backoffMs: 1000 };
  try { toolPermissions = JSON.parse(agent.toolPermissions || '{}'); } catch { /* keep default */ }
  try { memoryConfig = JSON.parse(agent.memoryConfig || '{"windowSize":20,"maxTokens":4000}'); } catch { /* keep default */ }
  try { retryPolicy = JSON.parse(agent.retryPolicy || '{"maxRetries":2,"backoffMs":1000}'); } catch { /* keep default */ }
  const maxIterations = agent.maxIterations;
  const timeoutMs = agent.timeoutMs;

  // Build the tool definitions for the system prompt.
  const registeredTools = listTools();
  const allowedTools = registeredTools.filter(t => {
    const perm = toolPermissions[t.name];
    return perm && perm !== 'disabled';
  });
  const toolDefs = allowedTools.map(t => ({
    name: t.name,
    description: t.description,
    category: t.category,
    permission: toolPermissions[t.name],
    readOnly: t.readOnly,
  }));

  // Resolve the AI brain credentials (user-connected OR platform).
  let apiKey: string;
  let credentialSource: 'user' | 'platform';
  try {
    const resolved = await resolveProviderApiKey(opts.userId, agent.provider);
    apiKey = resolved.apiKey;
    credentialSource = resolved.source;
  } catch (err) {
    return failRun(run.id, startedAt, `AI brain "${agent.provider}" is not available: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Load recent memory (windowSize messages).
  const recentMemory = await db.agentMemory.findMany({
    where: { agentId: agent.id },
    orderBy: { createdAt: 'desc' },
    take: memoryConfig.windowSize,
  });
  const memory: Array<{ role: string; content: string }> = recentMemory.reverse().map(m => ({
    role: m.role, content: m.content,
  }));

  // System prompt — instructs the model to use the tool-call format.
  const systemPrompt = buildSystemPrompt(agent.name, toolDefs, opts.initialPrompt || '');

  // Persist the initial user prompt as memory.
  if (opts.initialPrompt) {
    await db.agentMemory.create({
      data: { agentId: agent.id, role: 'user', content: opts.initialPrompt, tokensUsed: 0, runId: run.id },
    });
    memory.push({ role: 'user', content: opts.initialPrompt });
  }

  // ─── The bounded reasoning loop ────────────────────────────────────
  let iterationsUsed = 0;
  let tokensUsed = 0;
  let toolsCalled = 0;
  let finalAnswer: string | null = null;
  let lastError: string | null = null;
  let cancelled = false;
  let timedOut = false;

  while (iterationsUsed < maxIterations) {
    iterationsUsed++;

    // Check timeout
    if (Date.now() - startedAt > timeoutMs) { timedOut = true; break; }
    // Check cancellation
    if (opts.isCancelled) {
      try { if (await opts.isCancelled()) { cancelled = true; break; } }
      catch { /* treat as not cancelled */ }
    }

    // ── 1. REASON: call the AI brain ──
    let aiResponse: { content: string; tokensUsed: number; provider: string; model: string };
    try {
      // Temporarily set the resolved API key in process.env so the
      // provider call function (callOpenAI, etc.) can read it.
      // This is safe — the key is per-user (or platform), and we set
      // it ONLY for this call (then unset it).
      const envKey = `${agent.provider.toUpperCase()}_API_KEY`;
      const prevValue = process.env[envKey];
      if (credentialSource === 'user') {
        process.env[envKey] = apiKey;
      }
      try {
        const result = await executeAICompletion(
          {
            messages: [
              { role: 'system', content: systemPrompt },
              ...memory.map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })),
            ],
            config: {
              provider: agent.provider as never,
              model: agent.model,
              maxTokens: memoryConfig.maxTokens,
              temperature: 0.7,
              retries: retryPolicy.maxRetries,
            },
          },
          opts.userId,
          `agent:${agent.id}:run:${run.id}`,
        );
        if (!result.success) {
          // If the provider returned a 401, mark the user's credential as invalid.
          if (result.error?.includes('401') || result.error?.includes('Unauthorized')) {
            if (credentialSource === 'user') {
              await markProviderInvalid({ userId: opts.userId, provider: agent.provider, error: result.error });
            }
          }
          throw new Error(result.error || 'AI brain call failed');
        }
        aiResponse = {
          content: result.content,
          tokensUsed: result.tokensUsed,
          provider: result.provider,
          model: result.model,
        };
      } finally {
        // Restore env (only if we overrode it for user-source keys)
        if (credentialSource === 'user') {
          if (prevValue === undefined) delete process.env[envKey];
          else process.env[envKey] = prevValue;
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      break;
    }

    tokensUsed += aiResponse.tokensUsed;

    // ── 2. PARSE the AI response: is it a tool call or a final answer? ──
    const parsed = parseAgentResponse(aiResponse.content);

    if (parsed.type === 'final') {
      finalAnswer = parsed.content;
      // Persist the assistant's final answer as memory.
      await db.agentMemory.create({
        data: { agentId: agent.id, role: 'assistant', content: parsed.content, tokensUsed: aiResponse.tokensUsed, runId: run.id },
      });
      break;
    }

    if (parsed.type === 'tool_call') {
      // Persist the assistant's tool-call reasoning as memory.
      await db.agentMemory.create({
        data: { agentId: agent.id, role: 'assistant', content: aiResponse.content, tokensUsed: aiResponse.tokensUsed, runId: run.id },
      });

      // ── 3. VALIDATE tool permission ──
      const perm = getToolPermission({
        toolPermissions,
      } as AgentRow, parsed.toolName);
      if (!perm || perm === 'disabled') {
        // Tool not allowed — feed the error back to the agent as a tool_result.
        const errResult = `Error: tool "${parsed.toolName}" is not allowed for this agent. Available tools: ${allowedTools.map(t => t.name).join(', ')}`;
        await db.agentMemory.create({
          data: { agentId: agent.id, role: 'tool_result', content: errResult, tokensUsed: 0, runId: run.id },
        });
        memory.push({ role: 'assistant', content: aiResponse.content });
        memory.push({ role: 'tool_result', content: errResult });
        continue;
      }

      // ── 4. INVOKE TOOL via the secure registry ──
      const toolCtx: ToolContext = {
        userId: opts.userId,
        orgId: agent.orgId || null,
        emailPermission: (perm === 'autonomous' ? 'autonomous'
          : perm === 'send_with_approval' ? 'send_with_approval'
          : perm === 'read-write' ? 'autonomous' // non-email read-write tools are autonomous
          : 'read') as ToolContext['emailPermission'],
        invocationId: run.id,
        executionId: opts.executionId,
        runId: opts.runId,
        leadId: opts.leadId,
        idempotencyKey: `${run.id}:${parsed.toolName}:${iterationsUsed}`,
        log: (event, details) => console.log(`[AgentRun ${run.id}] ${event}`, details || ''),
      };

      // For email.send with send_with_approval: create AgentApproval,
      // pause the run, wait for human decision.
      if (parsed.toolName === 'email.send' || parsed.toolName === 'email.reply') {
        if (perm === 'send_with_approval') {
          const approval = await db.agentApproval.create({
            data: {
              agentId: agent.id,
              runId: run.id,
              toolName: parsed.toolName,
              input: JSON.stringify(parsed.input),
              status: 'requested',
            },
          });
          // Update the run status to paused_awaiting_approval
          await db.agentRun.update({
            where: { id: run.id },
            data: { status: 'paused_awaiting_approval', approvalState: 'requested' },
          });
          // Persist the pending state in memory so a future resume can continue.
          await db.agentMemory.create({
            data: {
              agentId: agent.id, role: 'system', runId: run.id,
              content: `TOOL_APPROVAL_REQUIRED: tool=${parsed.toolName} approvalId=${approval.id} input=${JSON.stringify(parsed.input)}`,
              tokensUsed: 0,
            },
          });
          return {
            runId: run.id,
            status: 'paused_awaiting_approval',
            iterationsUsed, tokensUsed, toolsCalled,
            finalAnswer: null,
            error: `Paused awaiting human approval for ${parsed.toolName} (approvalId=${approval.id})`,
            durationMs: Date.now() - startedAt,
          };
        }
      }

      // Invoke the tool via the secure registry.
      const toolResult = await invokeTool(parsed.toolName, parsed.input, toolCtx);
      toolsCalled++;

      // Persist the tool result as memory.
      const resultStr = JSON.stringify(toolResult.output || toolResult.error);
      await db.agentMemory.create({
        data: {
          agentId: agent.id, role: 'tool_result', runId: run.id,
          content: `TOOL_RESULT: tool=${parsed.toolName} status=${toolResult.status} output=${resultStr.slice(0, 2000)}`,
          tokensUsed: 0,
        },
      });

      memory.push({ role: 'assistant', content: aiResponse.content });
      memory.push({ role: 'tool_result', content: `TOOL_RESULT: tool=${parsed.toolName} status=${toolResult.status} output=${resultStr.slice(0, 2000)}` });

      // Trim memory to windowSize (drop oldest)
      while (memory.length > memoryConfig.windowSize) memory.shift();

      continue;
    }

    // Unknown response format — feed back to the agent.
    await db.agentMemory.create({
      data: { agentId: agent.id, role: 'system', runId: run.id, content: 'Error: response was neither a tool call nor a final answer. Use the correct format.', tokensUsed: 0 },
    });
    memory.push({ role: 'system', content: 'Error: response was neither a tool call nor a final answer. Use the correct format.' });
  }

  // ─── Finalize the run ──────────────────────────────────────────────
  let finalStatus: AgentRunResult['status'] = 'completed';
  if (cancelled) finalStatus = 'cancelled';
  else if (timedOut) finalStatus = 'timeout';
  else if (lastError) finalStatus = 'failed';

  await db.agentRun.update({
    where: { id: run.id },
    data: {
      status: finalStatus,
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt,
      result: finalAnswer ? JSON.stringify({ finalAnswer: finalAnswer.slice(0, 5000) }) : null,
      error: lastError,
      tokensUsed,
      iterationsUsed,
      toolsCalled,
      approvalState: 'none',
    },
  });

  await db.agent.update({
    where: { id: agent.id },
    data: {
      totalRuns: { increment: 1 },
      totalTokensUsed: { increment: tokensUsed },
      lastRunAt: new Date(),
      lastError: finalStatus === 'failed' ? lastError : null,
    },
  });

  return {
    runId: run.id,
    status: finalStatus,
    iterationsUsed, tokensUsed, toolsCalled,
    finalAnswer,
    error: lastError,
    durationMs: Date.now() - startedAt,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────

function failRun(runId: string, startedAt: number, error: string): AgentRunResult {
  return {
    runId, status: 'failed', iterationsUsed: 0, tokensUsed: 0, toolsCalled: 0,
    finalAnswer: null, error, durationMs: Date.now() - startedAt,
  };
}

function buildSystemPrompt(agentName: string, toolDefs: Array<{ name: string; description: string; category: string; permission: string; readOnly: boolean }>, initialPrompt: string): string {
  const toolList = toolDefs.map(t => `  - ${t.name} (${t.category}, permission=${t.permission}${t.readOnly ? ', read-only' : ''}): ${t.description}`).join('\n');
  return `You are "${agentName}", an AcquisitionOS AI Agent. You reason step-by-step and call approved tools to accomplish the user's task.

AVAILABLE TOOLS (you may ONLY call these — never invent tool names):
${toolList}

RESPONSE FORMAT (strict):
- To call a tool, respond EXACTLY with:
  TOOL_CALL: <tool_name>
  INPUT: <json_object>
  (one tool per response)

- To give a final answer (complete the task), respond EXACTLY with:
  FINAL_ANSWER: <your answer>

After each tool call, you will receive the tool's result as TOOL_RESULT. Use it to decide the next step.

RULES:
- Only call tools listed above. Inventing tool names is an error.
- Tool inputs must be valid JSON matching the tool's schema.
- If a tool returns an error, reason about it and either retry with different input or choose a different tool.
- When the task is complete, respond with FINAL_ANSWER.

USER TASK:
${initialPrompt || '(no explicit task — operate based on your schedule/triggers)'}`;
}

type ParsedResponse =
  | { type: 'tool_call'; toolName: string; input: Record<string, unknown> }
  | { type: 'final'; content: string }
  | { type: 'unknown' };

function parseAgentResponse(content: string): ParsedResponse {
  const trimmed = content.trim();
  // Match "TOOL_CALL: <name>\nINPUT: <json>"
  const toolMatch = trimmed.match(/^TOOL_CALL:\s*(\S+)\s*\n\s*INPUT:\s*(\{[\s\S]*\})\s*$/i);
  if (toolMatch) {
    const toolName = toolMatch[1].trim();
    try {
      const input = JSON.parse(toolMatch[2]);
      return { type: 'tool_call', toolName, input };
    } catch {
      return { type: 'tool_call', toolName, input: {} };
    }
  }
  // Match "FINAL_ANSWER: <text>"
  const finalMatch = trimmed.match(/^FINAL_ANSWER:\s*([\s\S]+)$/i);
  if (finalMatch) {
    return { type: 'final', content: finalMatch[1].trim() };
  }
  // Some models prefix with ``` — handle that too.
  const cleaned = trimmed.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  const toolMatch2 = cleaned.match(/^TOOL_CALL:\s*(\S+)\s*\n\s*INPUT:\s*(\{[\s\S]*\})\s*$/i);
  if (toolMatch2) {
    const toolName = toolMatch2[1].trim();
    try {
      const input = JSON.parse(toolMatch2[2]);
      return { type: 'tool_call', toolName, input };
    } catch {
      return { type: 'tool_call', toolName, input: {} };
    }
  }
  const finalMatch2 = cleaned.match(/^FINAL_ANSWER:\s*([\s\S]+)$/i);
  if (finalMatch2) {
    return { type: 'final', content: finalMatch2[1].trim() };
  }
  return { type: 'unknown' };
}
