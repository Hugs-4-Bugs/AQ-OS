// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Activity Logging Tool (Phase 26 v2 agent tool layer)
// ═══════════════════════════════════════════════════════════════════

import { registerTool } from './registry';
import { type ToolContext, type ToolResult } from './types';

// ─── activity.log ────────────────────────────────────────────────────

registerTool({
  name: 'activity.log',
  description: 'Write a custom activity event to the Phase 25 ExecutionActivity log. Required: type + message. Optional: leadId, executionId, runId, metadata.',
  category: 'activity',
  readOnly: false,
  idempotent: true,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      type: { type: 'string', description: 'Required. Event type (e.g. AGENT_TOOL_CALLED, LEAD_ENRICHED).' },
      message: { type: 'string', description: 'Required. Human-readable event message.' },
      leadId: { type: 'string', description: 'Optional. Associated lead ID.' },
      executionId: { type: 'string', description: 'Optional. Associated workflow execution ID.' },
      runId: { type: 'string', description: 'Optional. Associated autopilot run ID.' },
      metadata: { type: 'object', description: 'Optional. JSON-serializable metadata.' },
    },
    required: ['type', 'message'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      logged: { type: 'boolean', description: 'Whether the event was persisted.' },
    },
  },
  async execute(input: {
    type: string; message: string; leadId?: string; executionId?: string;
    runId?: string; metadata?: Record<string, unknown>;
  }, ctx: ToolContext): Promise<ToolResult> {
    // Best-effort: import the Phase 25 logExecutionActivity function.
    // If unavailable (import fail), return a typed error.
    try {
      const { logExecutionActivity } = await import('@/lib/execution-activity');
      await logExecutionActivity({
        userId: ctx.userId,
        executionId: input.executionId || ctx.executionId,
        runId: input.runId || ctx.runId,
        leadId: input.leadId || ctx.leadId,
        type: input.type,
        message: input.message,
        metadata: input.metadata,
      });
      return {
        status: 'success',
        toolInvocationId: '',
        durationMs: 0,
        output: { logged: true },
      };
    } catch (err) {
      return {
        status: 'error',
        toolInvocationId: '',
        durationMs: 0,
        error: `Activity log write failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
});
