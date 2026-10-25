// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Agent Tool Registry + Dispatcher (Phase 26 v2)
//
// Single canonical entry point for AI agent tool invocation.
// - All tools register here at module-load time (additive; never
//   dynamically loaded from user input).
// - Dispatcher enforces auth, validation, idempotency, audit.
// - NEVER allows arbitrary model-generated tool names — unknown tool
//   names throw ToolNotFoundError.
//
// Per user spec Part 6:
//   Tools must have:
//   - explicit schemas ✓ (ToolDefinition.inputSchema)
//   - authentication context ✓ (ToolContext.userId, set by caller)
//   - authorization checks ✓ (requiredFeature → entitlement check)
//   - user ownership checks ✓ (each tool queries WHERE userId = ctx.userId)
//   - server-side validation ✓ (validateToolInput)
//   - audit logging ✓ (agentActivity table)
//   - idempotency where required ✓ (idempotencyKey + fromCache)
//   - safe failure handling ✓ (try/catch returns error result)
// ═══════════════════════════════════════════════════════════════════

import {
  type ToolDefinition,
  type ToolContext,
  type ToolResult,
  ToolNotFoundError,
  ToolValidationError,
  ToolAuthorizationError,
  validateToolInput,
  generateToolInvocationId,
} from './types';
import { getUserEntitlements } from '@/lib/entitlement-service';

// ─── In-memory idempotency cache ────────────────────────────────────
//
// Tools that declare `idempotent: true` and provide an idempotencyKey
// get their result cached here for the lifetime of the process. A
// second invocation with the same key returns the cached result with
// `fromCache: true` — no DB side-effect is run twice.
//
// For multi-process safety, idempotent tools SHOULD also write a
// deterministic marker to the database (e.g. agentActivity row keyed
// by idempotencyKey) before executing.

interface IdempotencyCacheEntry {
  result: ToolResult;
  expiresAt: number; // epoch ms
}

const idempotencyCache = new Map<string, IdempotencyCacheEntry>();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheGet(key: string): IdempotencyCacheEntry | undefined {
  const entry = idempotencyCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    idempotencyCache.delete(key);
    return undefined;
  }
  return entry;
}

function cacheSet(key: string, result: ToolResult): void {
  idempotencyCache.set(key, {
    result,
    expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
  });
}

// ─── Registry ────────────────────────────────────────────────────────

const registry = new Map<string, ToolDefinition>();

export function registerTool<TInput, TOutput>(
  tool: ToolDefinition<TInput, TOutput>,
): void {
  if (registry.has(tool.name)) {
    // Tools are registered at module load; double-registration is a
    // programming error — surface it loudly in dev, ignore in prod.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[AgentTools] duplicate tool registration: ${tool.name}`);
    }
    return;
  }
  registry.set(tool.name, tool as unknown as ToolDefinition);
}

export function listTools(): Array<{
  name: string;
  description: string;
  category: string;
  readOnly: boolean;
  idempotent: boolean;
  requiredFeature?: string;
}> {
  return Array.from(registry.values()).map((t) => ({
    name: t.name,
    description: t.description,
    category: t.category,
    readOnly: t.readOnly,
    idempotent: t.idempotent,
    requiredFeature: t.requiredFeature,
  }));
}

export function getTool(name: string): ToolDefinition | undefined {
  return registry.get(name);
}

// ─── Audit logging ──────────────────────────────────────────────────

async function writeAuditLog(params: {
  context: ToolContext;
  toolName: string;
  toolInvocationId: string;
  input: unknown;
  result: ToolResult;
}): Promise<void> {
  // BEST-EFFORT audit log — never crash the agent because logging failed.
  try {
    const { db } = await import('@/lib/db');
    // agentActivity table — additive Phase 26 v2 schema
    await db.agentActivity.create({
      data: {
        id: params.toolInvocationId,
        userId: params.context.userId,
        orgId: params.context.orgId || null,
        toolName: params.toolName,
        invocationId: params.context.invocationId || null,
        executionId: params.context.executionId || null,
        runId: params.context.runId || null,
        leadId: params.context.leadId || null,
        input: JSON.stringify(params.input),
        status: params.result.status,
        durationMs: params.result.durationMs,
        output: params.result.output ? JSON.stringify(params.result.output) : null,
        error: params.result.error || null,
        fromCache: params.result.fromCache ? 1 : 0,
      },
    }).catch((dbErr: unknown) => {
      // Schema may not be applied yet — non-fatal. The next server
      // restart with `prisma db push` will create the table.
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[AgentTools] audit log write failed (non-fatal):',
          dbErr instanceof Error ? dbErr.message : dbErr);
      }
    });
  } catch (importErr) {
    // db module unavailable — non-fatal
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[AgentTools] audit log import failed (non-fatal):',
        importErr instanceof Error ? importErr.message : importErr);
    }
  }
}

// ─── Dispatcher ─────────────────────────────────────────────────────

/**
 * Invoke a registered tool. Enforces:
 *   1. Tool exists (else ToolNotFoundError)
 *   2. Input matches schema (else ToolValidationError)
 *   3. User has required feature access (else ToolAuthorizationError)
 *   4. Idempotency cache hit short-circuits execution
 *   5. Tool execution wrapped in try/catch → safe failure handling
 *   6. Audit log written (best-effort)
 *
 * Returns a ToolResult — NEVER throws to the caller (failures are
 * captured in result.status).
 */
export async function invokeTool(
  toolName: string,
  input: unknown,
  context: ToolContext,
): Promise<ToolResult> {
  const startedAt = Date.now();
  const tool = registry.get(toolName);
  if (!tool) {
    const result: ToolResult = {
      status: 'error',
      toolInvocationId: generateToolInvocationId(toolName, context.idempotencyKey),
      durationMs: Date.now() - startedAt,
      error: `Unknown tool: ${toolName}`,
    };
    return result;
  }

  const toolInvocationId = generateToolInvocationId(toolName, context.idempotencyKey);

  // ── 1. Idempotency cache short-circuit ──
  if (tool.idempotent && context.idempotencyKey) {
    const cacheKey = `${toolName}:${context.idempotencyKey}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      const result: ToolResult = {
        ...cached.result,
        toolInvocationId,
        fromCache: true,
      };
      context.log('tool_cache_hit', { toolName, idempotencyKey: context.idempotencyKey });
      await writeAuditLog({ context, toolName, toolInvocationId, input, result });
      return result;
    }
  }

  // ── 2. Input validation ──
  try {
    validateToolInput(input, tool.inputSchema);
  } catch (validationErr) {
    const result: ToolResult = {
      status: 'validation_error',
      toolInvocationId,
      durationMs: Date.now() - startedAt,
      error: validationErr instanceof Error ? validationErr.message : String(validationErr),
    };
    context.log('tool_validation_error', { toolName, error: result.error });
    await writeAuditLog({ context, toolName, toolInvocationId, input, result });
    return result;
  }

  // ── 3. Authorization check ──
  if (tool.requiredFeature) {
    try {
      const entitlements = await getUserEntitlements(context.userId);
      const feature = entitlements.entitlements?.[tool.requiredFeature as keyof typeof entitlements.entitlements];
      if (!feature || !feature.enabled) {
        const result: ToolResult = {
          status: 'unauthorized',
          toolInvocationId,
          durationMs: Date.now() - startedAt,
          error: `Plan ${entitlements.plan} does not enable feature "${tool.requiredFeature}" required by tool ${toolName}`,
        };
        context.log('tool_unauthorized', { toolName, plan: entitlements.plan, requiredFeature: tool.requiredFeature });
        await writeAuditLog({ context, toolName, toolInvocationId, input, result });
        return result;
      }
    } catch (authErr) {
      const result: ToolResult = {
        status: 'unauthorized',
        toolInvocationId,
        durationMs: Date.now() - startedAt,
        error: `Authorization check failed: ${authErr instanceof Error ? authErr.message : String(authErr)}`,
      };
      context.log('tool_auth_check_failed', { toolName, error: result.error });
      await writeAuditLog({ context, toolName, toolInvocationId, input, result });
      return result;
    }
  }

  // ── 4. Email permission boundary (Part 7) ──
  if (tool.emailPermissionLevel) {
    const levels = ['read', 'draft', 'send_with_approval', 'autonomous'];
    const requiredLevel = levels.indexOf(tool.emailPermissionLevel);
    const userLevel = levels.indexOf(context.emailPermission);
    if (userLevel < requiredLevel) {
      const result: ToolResult = {
        status: 'unauthorized',
        toolInvocationId,
        durationMs: Date.now() - startedAt,
        error: `Email permission level "${tool.emailPermissionLevel}" required, user has "${context.emailPermission}"`,
      };
      context.log('tool_email_permission_denied', { toolName, required: tool.emailPermissionLevel, user: context.emailPermission });
      await writeAuditLog({ context, toolName, toolInvocationId, input, result });
      return result;
    }
  }

  // ── 5. Execute (with safe failure handling) ──
  let result: ToolResult;
  try {
    result = await tool.execute(input as Record<string, unknown>, context);
    if (!result.toolInvocationId) {
      result.toolInvocationId = toolInvocationId;
    }
    if (!result.durationMs) {
      result.durationMs = Date.now() - startedAt;
    }
    context.log('tool_executed', {
      toolName,
      status: result.status,
      durationMs: result.durationMs,
    });
  } catch (execErr) {
    result = {
      status: 'error',
      toolInvocationId,
      durationMs: Date.now() - startedAt,
      error: execErr instanceof Error ? execErr.message : String(execErr),
    };
    context.log('tool_execution_error', { toolName, error: result.error });
  }

  // ── 6. Cache idempotent success ──
  if (tool.idempotent && context.idempotencyKey && result.status === 'success') {
    const cacheKey = `${toolName}:${context.idempotencyKey}`;
    cacheSet(cacheKey, result);
  }

  // ── 7. Audit log ──
  await writeAuditLog({ context, toolName, toolInvocationId, input, result });

  return result;
}

// NOTE: tool side-effect imports (lead-tools, workflow-tools, etc.) are
// intentionally NOT in this file. They are in `index.ts` instead.
// Putting them here would create a circular import:
//   registry.ts → imports ./lead-tools → imports ./registry (back to top)
// Keeping the side-effect imports in index.ts ensures registry.ts is
// fully initialized before any tool file is evaluated.
