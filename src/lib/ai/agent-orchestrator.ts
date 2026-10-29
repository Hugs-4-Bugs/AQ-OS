// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 2: Agent-Level Parallelism
//
// Executes a graph of independent/dependent agent subtasks. Each agent
// is itself a model orchestration (SINGLE/SEQUENTIAL/PARALLEL/FALLBACK).
//
// Two distinct kinds of parallelism, COMPOSABLE:
//
//   · MODEL PARALLELISM — multiple models solving/evaluating one task.
//     Implemented by orchestrateModelCalls in ai/orchestrator.ts.
//
//   · AGENT PARALLELISM — multiple agents independently performing
//     different subtasks. Implemented here.
//
// Composition example:
//
//   Objective
//      |
//   +--+--+--+----------+
//   |     |  |          |       (independent agents — parallel)
//   v     v  v          v
//  AgentA AgentB AgentC AgentD
//   |     |     |       |
//   M1+M2 M2+M3 M1+M3   M1   (each agent fans out to multiple models)
//   |     |     |       |
//   +--+--+--+----------+
//      |
//      v
//   Cross-agent synthesis
//
// Agents with NO dependency on each other run in parallel (bounded
// worker pool). Agents WITH a dependency (declared via `dependsOn`)
// wait for their dependency to COMPLETE before starting.
//
// Every agent invocation is durable: each agent gets its own
// AutomationCheckpoint entry (when running under an AutopilotRun) or
// a ModelInvocation row (when running standalone). Resume on restart
// skips agents whose checkpoint is already COMPLETE.
// ═══════════════════════════════════════════════════════════════════

import { randomUUID } from 'crypto';
import {
  orchestrateModelCalls,
  type OrchestrationMode,
  type OrchestrationContext,
  type OrchestrationResult,
  type ModelCallSpec,
} from '@/lib/ai/orchestrator';
import { synthesizeResults, type SynthesisOutput } from '@/lib/ai/synthesis';
import {
  extractEvidenceFromContent,
  mergeEvidence,
  type StructuredEvidence,
} from '@/lib/ai/evidence';

// ===== TYPES =====

export interface AgentTask {
  /** Stable agent id (used as checkpoint key when running under autopilot). */
  id: string;
  /** Human-readable agent name (for audit/dashboard). */
  name: string;
  /** Logical role of this agent (researcher/critic/etc.). */
  role: string;
  /** Agent ids that must COMPLETE before this agent starts.
   *  Empty array (or undefined) = no dependencies → eligible for
   *  immediate parallel execution. */
  dependsOn?: string[];
  /** The model orchestration strategy for this agent's internal model
   *  fan-out (SINGLE/SEQUENTIAL/PARALLEL/FALLBACK). */
  modelStrategy: OrchestrationMode;
  /** Model slots this agent runs (parallel/sequential/fallback
   *  according to `modelStrategy`). */
  models: ModelCallSpec[];
  /** Base prompt for this agent's model invocation. The prompt is
   *  rendered with the parent objective + upstream agents' outputs
   *  (when dependsOn is set). */
  basePrompt: string;
  /** Bounded concurrency override for PARALLEL modelStrategy. */
  concurrencyLimit?: number;
}

export interface AgentExecutionResult {
  taskId: string;
  taskName: string;
  role: string;
  /** True if at least one model produced durable output. */
  success: boolean;
  /** The orchestration result from this agent's model fan-out. */
  orchestration: OrchestrationResult;
  /** Extracted structured evidence (the agent's canonical contribution). */
  evidence: StructuredEvidence;
  /** Wall-clock duration (ms). */
  durationMs: number;
  /** Error message when success=false. */
  error?: string;
}

export interface AgentGraphResult {
  /** Per-agent results, keyed by taskId. Includes successful, failed,
   *  and skipped (due to upstream failure) agents. */
  agents: AgentExecutionResult[];
  /** True when ALL agents completed successfully. */
  success: boolean;
  /** Cross-agent synthesis (only present when 2+ agents succeeded and
   *  the caller requested synthesis). */
  synthesis?: SynthesisOutput;
  /** Wall-clock duration (ms) for the entire graph. */
  durationMs: number;
  /** Stable correlation id — shared by every agent + synthesizer in
   *  this graph invocation (used for durable traceability). */
  correlationId: string;
  /** Agents that were skipped because an upstream dependency failed. */
  skippedTaskIds: string[];
}

export interface AgentGraphContext {
  /** Inherits from the parent orchestration context. Each agent
   *  receives a copy with its own taskId stamped into `stepName`. */
  parent: OrchestrationContext;
  /** Optional correlation id override. When unset, a new UUID is
   *  generated for the whole graph. */
  correlationId?: string;
  /** Run cross-agent synthesis after the graph completes. Default true
   *  when 2+ agents succeeded. */
  synthesize?: boolean;
  /** Synthesizer provider/model override. */
  synthesizerProvider?: string;
  synthesizerModel?: string;
  /** Bounded agent-level concurrency. Clamped to [1, 4] (separate
   *  from per-agent model concurrency). */
  agentConcurrency?: number;
  /** Cancellation probe — checked before each agent starts. */
  isCancelled?: () => Promise<boolean>;
}

// ===== CONSTANTS =====

const MAX_AGENT_CONCURRENCY = 4;
const DEFAULT_AGENT_CONCURRENCY = 2; // agents are heavier than models

// ===== ENTRY POINT =====

/**
 * Execute a graph of agent subtasks.
 *
 * Algorithm:
 *   1. Topological sort (Kahn's algorithm) by `dependsOn`.
 *   2. Process the sorted "waves" — each wave is the set of agents
 *      whose dependencies have all COMPLETE'd. Within a wave, run
 *      agents in parallel under a bounded worker pool.
 *   3. Persist each agent's result via orchestrateModelCalls (which
 *      itself persists per-slot ModelInvocation rows).
 *   4. After all waves complete (or skip due to upstream failure),
 *      optionally run cross-agent synthesis.
 *
 * Failures are isolated: an agent's failure does NOT crash the whole
 * graph. Downstream agents depending on a failed agent are SKIPPED
 * (with a clear reason) rather than executed with missing input.
 *
 * Idempotency: re-running the same graph with the same correlationId
 * reuses durable COMPLETED ModelInvocation rows for each agent slot.
 */
export async function executeAgentGraph(
  tasks: AgentTask[],
  ctx: AgentGraphContext
): Promise<AgentGraphResult> {
  const correlationId = ctx.correlationId ?? randomUUID();
  const startedAt = Date.now();
  const agentConcurrency = Math.min(
    Math.max(ctx.agentConcurrency ?? DEFAULT_AGENT_CONCURRENCY, 1),
    MAX_AGENT_CONCURRENCY
  );

  // Validate the graph (cycles, missing deps)
  const validation = validateGraph(tasks);
  if (!validation.ok) {
    return {
      agents: [],
      success: false,
      durationMs: Date.now() - startedAt,
      correlationId,
      skippedTaskIds: tasks.map((t) => t.id),
    };
  }

  // Build dependency index
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const completedAgents = new Set<string>();
  const failedAgents = new Set<string>();
  const skippedAgents = new Set<string>();
  const results = new Map<string, AgentExecutionResult>();

  // Process waves until all tasks are completed/failed/skipped
  // (each wave resolves at least one task; bounded by task count)
  let wavesRemaining = tasks.length;
  while (wavesRemaining > 0) {
    const wave = tasks.filter((t) => {
      if (completedAgents.has(t.id) || failedAgents.has(t.id) || skippedAgents.has(t.id)) {
        return false; // already resolved
      }
      // Eligible if all deps are completed (or skipped if a dep failed)
      const deps = t.dependsOn ?? [];
      const allDepsResolved = deps.every(
        (d) =>
          completedAgents.has(d) ||
          failedAgents.has(d) ||
          skippedAgents.has(d) ||
          !taskById.has(d) // unknown dep — treat as resolved (warned)
      );
      if (!allDepsResolved) return false;
      // If any dep failed or was skipped, mark this agent as skipped
      const anyDepFailed = deps.some(
        (d) => failedAgents.has(d) || skippedAgents.has(d)
      );
      if (anyDepFailed) {
        skippedAgents.add(t.id);
        return false;
      }
      return true;
    });

    if (wave.length === 0) {
      // No progress — every remaining task is blocked by a dep that
      // hasn't completed. This shouldn't happen if validation passed
      // (cycles are caught there). Break to avoid infinite loop.
      for (const t of tasks) {
        if (!completedAgents.has(t.id) && !failedAgents.has(t.id) && !skippedAgents.has(t.id)) {
          skippedAgents.add(t.id);
        }
      }
      break;
    }

    // Execute the wave under a bounded worker pool
    let cursor = 0;
    const workers = Array.from({ length: Math.min(agentConcurrency, wave.length) }, async () => {
      while (cursor < wave.length) {
        const idx = cursor++;
        const task = wave[idx];
        if (ctx.isCancelled && (await ctx.isCancelled())) {
          skippedAgents.add(task.id);
          continue;
        }
        const result = await executeOneAgent(task, ctx, correlationId, results);
        results.set(task.id, result);
        if (result.success) {
          completedAgents.add(task.id);
        } else {
          failedAgents.add(task.id);
        }
      }
    });
    await Promise.all(workers);
    wavesRemaining = tasks.length - completedAgents.size - failedAgents.size - skippedAgents.size;
  }

  // Collect results
  const agentResults = tasks.map((t) => results.get(t.id)).filter(Boolean) as AgentExecutionResult[];

  // Cross-agent synthesis (optional, when 2+ agents succeeded)
  let synthesis: SynthesisOutput | undefined;
  if (ctx.synthesize !== false) {
    const successful = agentResults.filter((r) => r.success);
    if (successful.length >= 2) {
      // Use the parallel-orchestration synthesis path: pass the
      // completed agent results as ModelCallResult-shaped inputs.
      const fakeModelResults = successful.map((r) => ({
        status: 'COMPLETED' as const,
        role: r.role,
        provider: r.orchestration.primaryProvider,
        model: r.orchestration.primaryModel,
        content: r.orchestration.primaryContent,
      }));
      synthesis = await synthesizeResults({
        results: fakeModelResults,
        disagreementReason: undefined, // synthesizer decides
        synthesizerProvider: ctx.synthesizerProvider,
        synthesizerModel: ctx.synthesizerModel,
        context: {
          ...ctx.parent,
          stepName: `${ctx.parent.stepName}::agent-synthesis`,
        },
      });
    }
  }

  return {
    agents: agentResults,
    success: failedAgents.size === 0 && skippedAgents.size === 0,
    synthesis,
    durationMs: Date.now() - startedAt,
    correlationId,
    skippedTaskIds: Array.from(skippedAgents),
  };
}

// ===== ONE AGENT =====

/**
 * Execute one agent task. Renders the agent's prompt with upstream
 * agents' outputs (when dependsOn is set), then delegates to
 * orchestrateModelCalls for the model fan-out.
 */
async function executeOneAgent(
  task: AgentTask,
  ctx: AgentGraphContext,
  correlationId: string,
  priorResults: Map<string, AgentExecutionResult>
): Promise<AgentExecutionResult> {
  const startedAt = Date.now();
  const agentContext: OrchestrationContext = {
    ...ctx.parent,
    stepName: `${ctx.parent.stepName}::agent:${task.id}`,
    actionType: task.role,
  };

  // Render prompt with upstream context
  const prompt = renderAgentPrompt(task, priorResults, correlationId);

  try {
    const orchestration = await orchestrateModelCalls({
      specs: task.models,
      mode: task.modelStrategy,
      concurrencyLimit: task.concurrencyLimit,
      basePrompt: prompt,
      context: agentContext,
      isCancelled: ctx.isCancelled,
    });

    const primaryProvider = orchestration.primaryProvider;
    const primaryModel = orchestration.primaryModel;
    const evidence = orchestration.primaryContent
      ? extractEvidenceFromContent(orchestration.primaryContent, {
          role: task.role,
          modelProvider: primaryProvider,
          modelId: primaryModel,
          correlationId,
        })
      : {
          facts: [],
          evidence: [],
          inferences: [],
          recommendations: [],
          confidence: 0,
          limitations: [orchestration.error ?? 'No content produced'],
          role: task.role,
          modelProvider: primaryProvider,
          modelId: primaryModel,
          correlationId,
          timestamp: Date.now(),
        };

    return {
      taskId: task.id,
      taskName: task.name,
      role: task.role,
      success: orchestration.success,
      orchestration,
      evidence,
      durationMs: Date.now() - startedAt,
      error: orchestration.error,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      taskId: task.id,
      taskName: task.name,
      role: task.role,
      success: false,
      orchestration: {
        success: false,
        mode: task.modelStrategy,
        primaryContent: '',
        models: [],
        summary: {
          mode: task.modelStrategy,
          total: 0,
          completed: 0,
          failed: 0,
          reused: 0,
          cancelled: 0,
          durationMs: Date.now() - startedAt,
        },
        error: message,
      },
      evidence: {
        facts: [],
        evidence: [],
        inferences: [],
        recommendations: [],
        confidence: 0,
        limitations: [message],
        role: task.role,
        correlationId,
        timestamp: Date.now(),
      },
      durationMs: Date.now() - startedAt,
      error: message,
    };
  }
}

// ===== PROMPT RENDERING =====

function renderAgentPrompt(
  task: AgentTask,
  priorResults: Map<string, AgentExecutionResult>,
  correlationId: string
): string {
  const deps = task.dependsOn ?? [];
  if (deps.length === 0) {
    return task.basePrompt;
  }
  const upstreamBlocks: string[] = [];
  for (const depId of deps) {
    const prior = priorResults.get(depId);
    if (!prior || !prior.success) continue;
    upstreamBlocks.push(
      `--- Upstream agent: ${prior.taskName} (${prior.role}) ---\n${prior.orchestration.primaryContent}`
    );
  }
  if (upstreamBlocks.length === 0) {
    return task.basePrompt;
  }
  return `${task.basePrompt}

The following upstream agents have completed their work. Use their outputs as input context (do not repeat verbatim; cite as evidence where relevant):

${upstreamBlocks.join('\n\n')}

[Correlation id: ${correlationId}]`;
}

// ===== GRAPH VALIDATION =====

function validateGraph(tasks: AgentTask[]): { ok: boolean; reason?: string } {
  const ids = new Set(tasks.map((t) => t.id));
  // 1. Unique ids
  if (ids.size !== tasks.length) {
    return { ok: false, reason: 'duplicate task id' };
  }
  // 2. All deps exist
  for (const t of tasks) {
    for (const dep of t.dependsOn ?? []) {
      if (!ids.has(dep)) {
        return { ok: false, reason: `task ${t.id} depends on unknown task ${dep}` };
      }
    }
  }
  // 3. No cycles (topological sort)
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const t of tasks) {
    inDegree.set(t.id, t.dependsOn?.length ?? 0);
    adj.set(t.id, []);
  }
  for (const t of tasks) {
    for (const dep of t.dependsOn ?? []) {
      adj.get(dep)!.push(t.id);
    }
  }
  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited++;
    for (const next of adj.get(id) ?? []) {
      const newDeg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }
  if (visited !== tasks.length) {
    return { ok: false, reason: 'cycle detected in agent dependency graph' };
  }
  return { ok: true };
}

// ===== PURE HELPERS (exported for tests) =====

/**
 * Compute the wave structure for a given task graph. Pure function —
 * useful for tests that want to verify the execution order without
 * actually invoking any models.
 */
export function computeWaves(tasks: AgentTask[]): string[][] {
  const validation = validateGraph(tasks);
  if (!validation.ok) return [];
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const t of tasks) {
    inDegree.set(t.id, t.dependsOn?.length ?? 0);
    adj.set(t.id, []);
  }
  for (const t of tasks) {
    for (const dep of t.dependsOn ?? []) {
      adj.get(dep)!.push(t.id);
    }
  }
  const waves: string[][] = [];
  const completed = new Set<string>();
  while (completed.size < tasks.length) {
    const wave = tasks
      .filter((t) => !completed.has(t.id))
      .filter((t) => (t.dependsOn ?? []).every((d) => completed.has(d)))
      .map((t) => t.id);
    if (wave.length === 0) break; // safety
    waves.push(wave);
    for (const id of wave) completed.add(id);
  }
  return waves;
}
