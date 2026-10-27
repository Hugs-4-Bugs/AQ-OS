// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Agent Runtime (Phase 26 v3 + Workstream C §5+§7+§8+§9)
//
// The bounded reasoning loop:
//   REASON (call AI brain with tool definitions + memory)
//   → SELECT TOOL/ACTION (model returns a tool call OR a final answer)
//   → VALIDATE TOOL/PERMISSION (check Agent.toolPermissions)
//   → INVOKE TOOL (via the existing secure registry)
//   → OBSERVE RESULT (append to memory as tool_result)
//   → UPDATE CONTEXT/MEMORY (trim to memoryConfig.windowSize)
//   → CHECKPOINT (persist run state for resume)
//   → REASON AGAIN
//   → CONTINUE
//   → COMPLETE (model returns a final answer with no tool call)
//
// Workstream C additions:
//   · modelStrategy (§5): single → executeAICompletion; sequential/parallel/
//     fallback → orchestrateAIAction (Workstream B multi-model routing)
//   · memoryScopes (§7): agent loads + persists memory filtered by scope;
//     provenance (source/freshness/confidence) preserved per item
//   · executionState (§8): granular state transitions for observability
//     (idle → running → reasoning → awaiting_tool → ... → completed)
//   · checkpoints (§8): persisted after each iteration; enables resume
//     after pause/timeout/crash (foundation for later workstreams)
//   · approval reason/context (§9): when pausing for human approval, the
//     agent writes a human-readable reason + JSON execution context
//
// Safety (Decision 6, preserved):
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
//     runtime creates an AgentApproval row (with reason + context),
//     pauses, waits for human decision, then resumes or cancels.
//
// Memory (Decision H + Workstream C §7):
//   - AgentMemory rows persisted per (agentId, role, content, runId, scope,
//     source, freshness, confidence, version, accessPolicy, leadId)
//   - windowSize: last N messages retained in context (default 20)
//   - maxTokens: hard cap on total context tokens (default 4000)
//   - memoryScopes restricts which scopes are loaded into the context
//     window. Lead-scoped memory from other agents owned by the same
//     user can be loaded when scope='lead' is in memoryScopes.
//
// Per-tool permissions (Decision 8, preserved):
//   - Agent.toolPermissions JSON: { "email.send": "send_with_approval", ... }
//   - The runtime checks permission BEFORE invoking each tool.
//   - For email tools with send_with_approval: create AgentApproval
//     (with reason + context), pause, wait for decision.
//
// Model strategy (Workstream C §5):
//   - 'single' (default): one provider+model — preserves Phase 26 v3
//     single-brain behavior. Uses executeAICompletion with strict
//     routing (no silent Z-AI fallback per Workstream B §8).
//   - 'sequential' / 'parallel' / 'fallback': uses the existing
//     orchestrator's orchestrateAIAction with bounded concurrency +
//     failure isolation + idempotency. Multi-model belongs to agents
//     that benefit from it (e.g. LEAD_SCORING uses parallel multi-angle).
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import type { AgentRow } from '@/lib/ai/agent-service';
import { isToolAllowed, getToolPermission } from '@/lib/ai/agent-service';
import { invokeTool, listTools } from '@/lib/ai/agent-tools';
import type { ToolContext } from '@/lib/ai/agent-tools';
import { executeAICompletion } from '@/lib/ai/ai-provider';
import { resolveProviderApiKey, markProviderInvalid } from '@/lib/ai/user-ai-provider-service';
import {
  appendMemoryScoped,
  readMemoryScoped,
  readLeadScopedMemoryForUser,
  trimMemoryToWindow,
  type MemoryScope,
} from '@/lib/ai/agent-memory-service';

export interface AgentRunOptions {
  agentId: string;
  userId: string;
  triggerSource: string; // "manual" | "schedule" | "trigger:<event>" | "workflow:<executionId>"
  initialPrompt?: string; // user's task description
  executionId?: string; // when invoked from a workflow
  runId?: string; // when invoked from an autopilot run
  leadId?: string; // when scoped to a lead
  isCancelled?: () => Promise<boolean>;
  /** When resuming after pause/timeout: the previous runId to load
   *  checkpoint + memory from. When omitted, a fresh run is started. */
  resumeFromRunId?: string;
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
      executionState: 'running',
      startedAt: new Date(),
    },
  });

  // Update the agent's executionState to 'running'
  await db.agent.update({
    where: { id: agent.id },
    data: { executionState: 'running' },
  }).catch(() => { /* non-fatal */ });

  // Parse agent config (JSON fields).
  let toolPermissions: Record<string, string> = {};
  let memoryConfig = { windowSize: 20, maxTokens: 4000 };
  let retryPolicy = { maxRetries: 2, backoffMs: 1000 };
  let modelStrategy: { strategy: string; models?: Array<{ provider?: string; model?: string; role?: string }>; concurrency?: number } = { strategy: 'single' };
  let memoryScopes: MemoryScope[] = ['agent'];
  try { toolPermissions = JSON.parse(agent.toolPermissions || '{}'); } catch { /* keep default */ }
  try { memoryConfig = JSON.parse(agent.memoryConfig || '{"windowSize":20,"maxTokens":4000}'); } catch { /* keep default */ }
  try { retryPolicy = JSON.parse(agent.retryPolicy || '{"maxRetries":2,"backoffMs":1000}'); } catch { /* keep default */ }
  try { modelStrategy = JSON.parse(agent.modelStrategy || '{"strategy":"single"}'); } catch { /* keep default */ }
  try { memoryScopes = JSON.parse(agent.memoryScopes || '["agent"]'); } catch { /* keep default */ }
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
    return failRun(run.id, startedAt, `AI brain "${agent.provider}" is not available: ${err instanceof Error ? err.message : String(err)}`, agent.id);
  }

  // ── Load recent memory (filtered by memoryScopes) ─────────────────
  // Workstream C §7: load memory items whose scope is in the agent's
  // memoryScopes. Lead-scoped memory from OTHER agents owned by the
  // same user is also loaded when 'lead' is in memoryScopes + leadId
  // is provided (cross-agent shared lead context).
  const inAgentScopes = memoryScopes.filter(s => s !== 'lead') as MemoryScope[];
  let recentMemory = await readMemoryScoped({
    agentId: agent.id,
    scopes: inAgentScopes.length > 0 ? inAgentScopes : ['agent'],
    limit: memoryConfig.windowSize,
  });
  // If 'lead' scope is enabled + a leadId is provided, also load
  // lead-scoped memory from any agent owned by this user (cross-agent
  // shared lead context). This is read-only — the agent can read but
  // its writes go to its own agent-scoped memory unless it explicitly
  // writes lead-scoped items.
  if (memoryScopes.includes('lead') && opts.leadId) {
    const leadMemory = await readLeadScopedMemoryForUser({
      userId: opts.userId,
      leadId: opts.leadId,
      scopes: ['lead', 'evidence'],
      limit: 50,
    });
    // Prepend lead-scoped memory (oldest first) — gives the agent context
    // from previous agents' work on this lead.
    recentMemory = [...leadMemory, ...recentMemory];
  }

  const memory: Array<{ role: string; content: string }> = recentMemory.reverse().map(m => ({
    role: m.role, content: m.content,
  }));

  // System prompt — instructs the model to use the tool-call format.
  const systemPrompt = buildSystemPrompt(agent.name, toolDefs, opts.initialPrompt || '', agent.objective || agent.description || '');

  // Persist the initial user prompt as memory (agent-scoped).
  if (opts.initialPrompt) {
    await appendMemoryScoped({
      agentId: agent.id, runId: run.id,
      role: 'user', content: opts.initialPrompt, tokensUsed: 0,
      scope: 'agent', source: 'user:manual', freshness: 'real-time', confidence: 1.0,
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

    // Update executionState to 'reasoning'
    await db.agentRun.update({
      where: { id: run.id },
      data: { executionState: 'reasoning', iterationsUsed },
    }).catch(() => { /* non-fatal */ });
    await db.agent.update({
      where: { id: agent.id },
      data: { executionState: 'reasoning' },
    }).catch(() => { /* non-fatal */ });

    // ── 1. REASON: call the AI brain (single OR multi-model) ──
    let aiContent: string;
    let aiTokens: number;
    let aiProvider: string;
    let aiModel: string;
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
        if (modelStrategy.strategy === 'single') {
          // Single-brain path — preserves Phase 26 v3 behavior
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
            if (result.error?.includes('401') || result.error?.includes('Unauthorized')) {
              if (credentialSource === 'user') {
                await markProviderInvalid({ userId: opts.userId, provider: agent.provider, error: result.error });
              }
            }
            throw new Error(result.error || 'AI brain call failed');
          }
          aiContent = result.content;
          aiTokens = result.tokensUsed;
          aiProvider = result.provider;
          aiModel = result.model;
        } else {
          // Multi-model path — uses Workstream B orchestrator
          // (sequential / parallel / fallback strategies)
          const { orchestrateAIAction } = await import('@/lib/ai/orchestrator');
          const orchestrationResult = await orchestrateAIAction({
            actionType: `agent:${agent.id}:run:${run.id}`,
            basePrompt: buildMultiModelPrompt(systemPrompt, memory),
            config: {
              orchestration: modelStrategy.strategy,
              models: modelStrategy.models,
              concurrency: modelStrategy.concurrency,
              fallback: modelStrategy.strategy === 'fallback',
              aiConfig: JSON.stringify(modelStrategy),
            },
            context: {
              executionId: opts.executionId || run.id,
              runId: opts.runId || run.id,
              leadId: opts.leadId,
              stepName: `agent:${agent.id}`,
              userId: opts.userId,
            },
            isCancelled: opts.isCancelled,
          });
          if (!orchestrationResult.success || !orchestrationResult.primaryContent) {
            const errDetails = orchestrationResult.models
              .filter(m => m.status === 'FAILED')
              .map(m => `${m.configuredProvider || m.provider}/${m.configuredModel || m.model}: ${m.error}`)
              .join('; ');
            throw new Error(orchestrationResult.error || `Multi-model orchestration failed: ${errDetails}`);
          }
          aiContent = orchestrationResult.primaryContent;
          aiTokens = orchestrationResult.models.reduce((sum, m) => sum + (m.tokensUsed || 0), 0);
          aiProvider = orchestrationResult.primaryProvider || agent.provider;
          aiModel = orchestrationResult.primaryModel || agent.model;
        }
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

    tokensUsed += aiTokens;

    // ── 2. PARSE the AI response: tool call or final answer? ──
    const parsed = parseAgentResponse(aiContent);

    if (parsed.type === 'final') {
      finalAnswer = parsed.content;
      // Persist the assistant's final answer as agent-scoped memory.
      await appendMemoryScoped({
        agentId: agent.id, runId: run.id,
        role: 'assistant', content: parsed.content, tokensUsed: aiTokens,
        scope: 'agent', source: `provider:${aiProvider}:${aiModel}`,
        freshness: 'real-time', confidence: 0.85,
      });
      break;
    }

    if (parsed.type === 'tool_call') {
      // Persist the assistant's tool-call reasoning as agent-scoped memory.
      await appendMemoryScoped({
        agentId: agent.id, runId: run.id,
        role: 'assistant', content: aiContent, tokensUsed: aiTokens,
        scope: 'agent', source: `provider:${aiProvider}:${aiModel}`,
        freshness: 'real-time', confidence: 0.7,
      });

      // Update executionState to 'awaiting_tool'
      await db.agentRun.update({
        where: { id: run.id },
        data: { executionState: 'awaiting_tool' },
      }).catch(() => { /* non-fatal */ });
      await db.agent.update({
        where: { id: agent.id },
        data: { executionState: 'awaiting_tool' },
      }).catch(() => { /* non-fatal */ });

      // ── 3. VALIDATE tool permission ──
      const perm = getToolPermission({
        toolPermissions,
      } as AgentRow, parsed.toolName);
      if (!perm || perm === 'disabled') {
        const errResult = `Error: tool "${parsed.toolName}" is not allowed for this agent. Available tools: ${allowedTools.map(t => t.name).join(', ')}`;
        await appendMemoryScoped({
          agentId: agent.id, runId: run.id,
          role: 'tool_result', content: errResult, tokensUsed: 0,
          scope: 'agent', source: `tool:${parsed.toolName}:denied`,
          freshness: 'real-time', confidence: 1.0,
        });
        memory.push({ role: 'assistant', content: aiContent });
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

      // For email.send with send_with_approval: create AgentApproval
      // (with reason + context per Workstream C §9), pause, wait for decision.
      if (parsed.toolName === 'email.send' || parsed.toolName === 'email.reply') {
        if (perm === 'send_with_approval') {
          // Update executionState to 'awaiting_approval'
          await db.agentRun.update({
            where: { id: run.id },
            data: { executionState: 'awaiting_approval' },
          }).catch(() => { /* non-fatal */ });
          await db.agent.update({
            where: { id: agent.id },
            data: { executionState: 'awaiting_approval' },
          }).catch(() => { /* non-fatal */ });

          const approvalReason = `Agent "${agent.name}" (run ${run.id}) is requesting approval to execute ${parsed.toolName}. The agent has reasoned that this action is necessary to complete the user's task. Review the input below and approve/reject. The agent will resume from this point on approval.`;
          const approvalContext = JSON.stringify({
            executionId: opts.executionId,
            runId: opts.runId,
            leadId: opts.leadId,
            iteration: iterationsUsed,
            memoryLength: memory.length,
            lastToolName: parsed.toolName,
            agentObjective: agent.objective,
          });
          const approval = await db.agentApproval.create({
            data: {
              agentId: agent.id,
              runId: run.id,
              toolName: parsed.toolName,
              input: JSON.stringify(parsed.input),
              status: 'requested',
              reason: approvalReason,
              context: approvalContext,
            },
          });
          // Update the run status to paused_awaiting_approval
          await db.agentRun.update({
            where: { id: run.id },
            data: { status: 'paused_awaiting_approval', approvalState: 'requested' },
          });
          // Persist the pending state in memory so a future resume can continue.
          await appendMemoryScoped({
            agentId: agent.id, runId: run.id,
            role: 'system', content: `TOOL_APPROVAL_REQUIRED: tool=${parsed.toolName} approvalId=${approval.id} input=${JSON.stringify(parsed.input)}`,
            tokensUsed: 0,
            scope: 'agent', source: 'agent:approval_request',
            freshness: 'real-time', confidence: 1.0,
          });
          // Persist checkpoint so resume can pick up where we left off.
          await persistCheckpoint(run.id, iterationsUsed, memory.length, parsed.toolName, 'awaiting_approval');
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

      // Persist the tool result as memory (lead-scoped when leadId is set +
      // 'lead' scope is in memoryScopes; otherwise agent-scoped).
      const resultStr = JSON.stringify(toolResult.output || toolResult.error);
      const resultScope: MemoryScope = (opts.leadId && memoryScopes.includes('lead')) ? 'lead' : 'agent';
      await appendMemoryScoped({
        agentId: agent.id, runId: run.id,
        role: 'tool_result', content: `TOOL_RESULT: tool=${parsed.toolName} status=${toolResult.status} output=${resultStr.slice(0, 2000)}`,
        tokensUsed: 0,
        scope: resultScope,
        source: `tool:${parsed.toolName}`,
        freshness: toolResult.status === 'success' ? 'real-time' : 'unknown',
        confidence: toolResult.status === 'success' ? 0.95 : 0.3,
        leadId: resultScope === 'lead' ? opts.leadId : null,
      });

      memory.push({ role: 'assistant', content: aiContent });
      memory.push({ role: 'tool_result', content: `TOOL_RESULT: tool=${parsed.toolName} status=${toolResult.status} output=${resultStr.slice(0, 2000)}` });

      // Trim memory to windowSize (drop oldest) — uses memory service.
      await trimMemoryToWindow(agent.id, memoryConfig.windowSize).catch(() => { /* non-fatal */ });
      while (memory.length > memoryConfig.windowSize) memory.shift();

      // Persist checkpoint after each iteration (Workstream C §8)
      await persistCheckpoint(run.id, iterationsUsed, memory.length, parsed.toolName, toolResult.status);

      continue;
    }

    // Unknown response format — feed back to the agent.
    await appendMemoryScoped({
      agentId: agent.id, runId: run.id,
      role: 'system', content: 'Error: response was neither a tool call nor a final answer. Use the correct format.',
      tokensUsed: 0,
      scope: 'agent', source: 'agent:format_error', freshness: 'real-time', confidence: 1.0,
    });
    memory.push({ role: 'system', content: 'Error: response was neither a tool call nor a final answer. Use the correct format.' });
  }

  // ─── Finalize the run ──────────────────────────────────────────────
  let finalStatus: AgentRunResult['status'] = 'completed';
  if (cancelled) finalStatus = 'cancelled';
  else if (timedOut) finalStatus = 'timeout';
  else if (lastError) finalStatus = 'failed';

  const finalExecutionState = finalStatus === 'completed' ? 'completed'
    : finalStatus === 'cancelled' ? 'cancelled'
    : finalStatus === 'timeout' ? 'timeout'
    : 'failed';

  await db.agentRun.update({
    where: { id: run.id },
    data: {
      status: finalStatus,
      executionState: finalExecutionState,
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
      executionState: finalExecutionState,
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

function failRun(runId: string, startedAt: number, error: string, agentId?: string): AgentRunResult {
  // Update executionState to 'failed' if we have an agentId
  if (agentId) {
    db.agent.update({
      where: { id: agentId },
      data: { executionState: 'failed' },
    }).catch(() => { /* non-fatal */ });
    db.agentRun.update({
      where: { id: runId },
      data: { executionState: 'failed', status: 'failed' },
    }).catch(() => { /* non-fatal */ });
  }
  return {
    runId, status: 'failed', iterationsUsed: 0, tokensUsed: 0, toolsCalled: 0,
    finalAnswer: null, error, durationMs: Date.now() - startedAt,
  };
}

/**
 * Persist a checkpoint for resume after pause/timeout/crash.
 * Workstream C §8: enables future resumeAgentRun() to pick up where
 * this run left off.
 */
async function persistCheckpoint(
  runId: string,
  iteration: number,
  memoryLength: number,
  lastToolName: string | null,
  lastToolStatus: string,
): Promise<void> {
  const checkpoint = JSON.stringify({
    iteration,
    memoryLength,
    lastToolName,
    lastToolStatus,
    timestamp: new Date().toISOString(),
  });
  await db.agentRun.update({
    where: { id: runId },
    data: { checkpoint },
  }).catch(() => { /* non-fatal — checkpoint is best-effort */ });
}

function buildSystemPrompt(
  agentName: string,
  toolDefs: Array<{ name: string; description: string; category: string; permission: string; readOnly: boolean }>,
  initialPrompt: string,
  objective: string,
): string {
  const toolList = toolDefs.map(t => `  - ${t.name} (${t.category}, permission=${t.permission}${t.readOnly ? ', read-only' : ''}): ${t.description}`).join('\n');
  return `You are "${agentName}", an AcquisitionOS AI Agent. You reason step-by-step and call approved tools to accomplish the user's task.

OBJECTIVE:
${objective || '(no explicit objective — operate based on the user task below)'}

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
- If an action requires human approval, the runtime will pause. Do NOT retry the same action repeatedly.

USER TASK:
${initialPrompt || '(no explicit task — operate based on your schedule/triggers)'}`;
}

/**
 * Build a single-string prompt for the multi-model orchestrator.
 * The orchestrator's orchestrateAIAction takes a basePrompt (not a
 * messages array). We flatten the system + memory into a single
 * structured prompt that the orchestrator's chain logic can use.
 */
function buildMultiModelPrompt(
  systemPrompt: string,
  memory: Array<{ role: string; content: string }>,
): string {
  const memoryBlock = memory
    .map(m => `--- [${m.role}] ---\n${m.content}`)
    .join('\n\n');
  return `${systemPrompt}

CONVERSATION HISTORY (use as context):
${memoryBlock || '(no prior conversation)'}

Based on the above, take the next step (TOOL_CALL or FINAL_ANSWER).`;
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
