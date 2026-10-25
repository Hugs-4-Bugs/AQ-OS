// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Agentic Tool Layer (Phase 26 v2)
//
// Canonical tool schema + execution context for AI agents that need to
// take approved AcquisitionOS actions (lead ops, workflow ops, message
// drafting, email read/send, profile lookup, activity logging).
//
// CRITICAL RULES (per user spec Part 6):
// - Tools MUST have explicit JSON schemas (input + output).
// - Tools MUST run with an authenticated ToolContext (userId + orgId).
// - Tools MUST enforce authorization checks (plan/feature access).
// - Tools MUST enforce user-ownership checks before reading/writing.
// - Tools MUST perform server-side validation of all arguments.
// - Tools MUST write audit logs (agentActivity table).
// - Tools MUST be idempotent where required (idempotencyKey).
// - Tools MUST fail safely (never expose secrets, never crash the agent).
// - Tools MUST NEVER allow arbitrary model-generated database queries or
//   arbitrary server commands.
// ═══════════════════════════════════════════════════════════════════

import type { ProviderType } from '@/lib/ai/ai-provider';

// ─── Tool definition ─────────────────────────────────────────────────

export interface ToolInputSchema {
  /** JSON-schema-like field definitions; the registry validates inputs. */
  type: 'object';
  properties: Record<string, ToolInputField>;
  required: string[];
  additionalProperties: boolean;
}

export interface ToolInputField {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  enum?: Array<string | number>;
  items?: ToolInputField;
  default?: unknown;
}

export interface ToolOutputSchema {
  type: 'object';
  properties: Record<string, ToolInputField>;
}

export type ToolCategory =
  | 'lead'
  | 'workflow'
  | 'message'
  | 'email'
  | 'profile'
  | 'activity'
  | 'task';

export interface ToolDefinition<TInput = Record<string, unknown>, TOutput = Record<string, unknown>> {
  /** Stable identifier, e.g. 'lead.lookup'. */
  name: string;
  /** Human-readable summary shown to the model + audit log. */
  description: string;
  /** Logical grouping for permission scoping. */
  category: ToolCategory;
  /** JSON-schema for input validation. */
  inputSchema: ToolInputSchema;
  /** JSON-schema for output (informational). */
  outputSchema: ToolOutputSchema;
  /** Whether the tool is read-only (safe to retry) or has side effects. */
  readOnly: boolean;
  /** Whether the tool requires an explicit idempotencyKey for retries. */
  idempotent: boolean;
  /**
   * Permission required to invoke this tool. Maps to FeatureKey in
   * entitlement-service. Tools with side effects (e.g. email.send)
   * require stricter permissions.
   */
  requiredFeature?: string;
  /**
   * Email tools specifically carry an additional permission boundary
   * (read-only / draft-only / send-with-approval / autonomous-send)
   * per the user spec Part 7.
   */
  emailPermissionLevel?: 'read' | 'draft' | 'send_with_approval' | 'autonomous';
  /** Execute the tool. MUST throw on validation/auth failure. */
  execute: (input: TInput, context: ToolContext) => Promise<ToolResult<TOutput>>;
}

// ─── Execution context ───────────────────────────────────────────────

export interface ToolContext {
  /** Authenticated user ID. Set by the caller, NEVER trusted from input. */
  userId: string;
  /** Optional org scope. */
  orgId: string | null;
  /**
   * Email permission level resolved from the user's settings + plan.
   * Email tools MUST refuse operations beyond this level.
   */
  emailPermission: 'read' | 'draft' | 'send_with_approval' | 'autonomous';
  /**
   * The model invocation that triggered this tool call — used to
   * attribute audit entries back to the originating model.
   */
  invocationId?: string;
  /** The workflow execution ID (when invoked from a workflow). */
  executionId?: string;
  /** The autopilot run ID (when invoked from an autopilot tick). */
  runId?: string;
  /** The lead ID (when invoked per-lead). */
  leadId?: string;
  /**
   * Idempotency key for safe retries — derived from
   * (invocationId + toolName + sha256(input)). Tools that declare
   * `idempotent: true` MUST use this to deduplicate.
   */
  idempotencyKey?: string;
  /** Internal request logger — NEVER logs secrets. */
  log: (event: string, details?: Record<string, unknown>) => void;
}

// ─── Result ──────────────────────────────────────────────────────────

export type ToolResultStatus = 'success' | 'error' | 'unauthorized' | 'not_found' | 'validation_error';

export interface ToolResult<TOutput = Record<string, unknown>> {
  status: ToolResultStatus;
  /** Stable identifier for this tool invocation. */
  toolInvocationId: string;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Tool-specific output payload. */
  output?: TOutput;
  /** Error message when status !== 'success'. */
  error?: string;
  /** Whether the result was served from the idempotency cache. */
  fromCache?: boolean;
}

// ─── Validation helpers ──────────────────────────────────────────────

/**
 * Lightweight input validator. Validates required fields + basic types
 * against the schema. Throws on validation failure.
 */
export function validateToolInput(
  input: unknown,
  schema: ToolInputSchema,
): asserts input is Record<string, unknown> {
  if (typeof input !== 'object' || input === null) {
    throw new ToolValidationError('Input must be a non-null object');
  }
  const obj = input as Record<string, unknown>;
  for (const requiredField of schema.required) {
    if (!(requiredField in obj) || obj[requiredField] === undefined || obj[requiredField] === null) {
      throw new ToolValidationError(`Missing required field: ${requiredField}`);
    }
  }
  for (const [fieldName, fieldValue] of Object.entries(obj)) {
    const fieldSchema = schema.properties[fieldName];
    if (!fieldSchema) {
      if (schema.additionalProperties === false) {
        throw new ToolValidationError(`Unknown field: ${fieldName}`);
      }
      continue;
    }
    if (fieldValue === undefined || fieldValue === null) continue;
    const actualType = Array.isArray(fieldValue) ? 'array' : typeof fieldValue;
    if (actualType !== fieldSchema.type) {
      throw new ToolValidationError(
        `Field ${fieldName}: expected ${fieldSchema.type}, got ${actualType}`,
      );
    }
    if (fieldSchema.enum && !fieldSchema.enum.includes(fieldValue as string | number)) {
      throw new ToolValidationError(
        `Field ${fieldName}: value not in allowed enum [${fieldSchema.enum.join(', ')}]`,
      );
    }
  }
}

export class ToolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolValidationError';
  }
}

export class ToolAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolAuthorizationError';
  }
}

export class ToolNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolNotFoundError';
  }
}

// ─── Tool invocation identifier ──────────────────────────────────────

/**
 * Generate a stable, unique toolInvocationId. Combination of:
 *   - idempotencyKey (when provided, deduplicates retries)
 *   - tool name
 *   - timestamp + random suffix (when no idempotency key)
 */
export function generateToolInvocationId(
  toolName: string,
  idempotencyKey?: string,
): string {
  if (idempotencyKey) {
    // Stable ID — same idempotency key + tool name = same ID
    return `toolinv-${toolName}-${idempotencyKey}`;
  }
  return `toolinv-${toolName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
