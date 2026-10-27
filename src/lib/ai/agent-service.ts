// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Agent Service (Phase 26 v3 + Workstream C §2)
//
// CRUD for AI agents + per-tool permissions enforcement.
// Workstream C additions:
//   · objective, classification (system|custom), systemKey
//   · modelStrategy (single|sequential|parallel|fallback)
//   · memoryScopes (user|business|lead|agent|execution|evidence)
//   · executionState (idle|running|reasoning|awaiting_tool|...)
//   · System agent seeding (idempotent upsert on userId+systemKey)
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { isProviderAvailable } from '@/lib/ai/user-ai-provider-service';
import {
  ensureSystemAgentsSeeded,
  type SystemAgentKey,
} from '@/lib/ai/system-agents';

export interface AgentRow {
  id: string;
  userId: string;
  orgId: string | null;
  name: string;
  description: string | null;
  // ── Workstream C §2 additions ──
  objective: string | null;
  classification: 'system' | 'custom';
  systemKey: string | null;
  modelStrategy: { strategy: 'single' | 'sequential' | 'parallel' | 'fallback'; models?: Array<{ provider?: string; model?: string; role?: string }>; concurrency?: number };
  memoryScopes: string[];
  executionState: string;
  // ── Phase 26 v3 fields ──
  provider: string;
  model: string;
  toolPermissions: Record<string, string>; // { "email.send": "send_with_approval", ... }
  schedule: { type: 'none' | 'cron' | 'interval'; cron?: string; intervalSeconds?: number; nextRunAt?: string };
  triggers: Array<{ event: string; condition?: Record<string, unknown> }>;
  approvalPolicy: 'approval_required' | 'autonomous';
  retryPolicy: { maxRetries: number; backoffMs: number };
  memoryConfig: { windowSize: number; maxTokens: number };
  status: 'draft' | 'active' | 'paused' | 'disabled';
  maxIterations: number;
  timeoutMs: number;
  totalRuns: number;
  totalTokensUsed: number;
  lastRunAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  objective?: string;
  classification?: 'system' | 'custom';
  systemKey?: string | null;
  provider?: string;
  model?: string;
  modelStrategy?: AgentRow['modelStrategy'];
  memoryScopes?: string[];
  toolPermissions?: Record<string, string>;
  schedule?: AgentRow['schedule'];
  triggers?: AgentRow['triggers'];
  approvalPolicy?: 'approval_required' | 'autonomous';
  retryPolicy?: AgentRow['retryPolicy'];
  memoryConfig?: AgentRow['memoryConfig'];
  maxIterations?: number;
  timeoutMs?: number;
}

export async function createAgent(userId: string, orgId: string | null, input: CreateAgentInput): Promise<AgentRow> {
  if (!input.name || input.name.trim().length < 2) {
    throw new Error('Agent name must be at least 2 characters');
  }
  // Validate that the configured provider is available (user-connected OR platform).
  if (input.provider) {
    const avail = await isProviderAvailable(userId, input.provider);
    if (!avail.available) {
      throw new Error(`Provider "${input.provider}" is not available. Connect it in Settings → Integrations → AI Providers first.`);
    }
  }
  // Workstream C §2 — systemKey UNIQUE enforcement
  if (input.classification === 'system' && input.systemKey) {
    const existing = await db.agent.findUnique({
      where: { userId_systemKey: { userId, systemKey: input.systemKey } },
    });
    if (existing) {
      throw new Error(`System agent "${input.systemKey}" already exists for this user. Use updateAgent to modify it.`);
    }
  }

  const row = await db.agent.create({
    data: {
      userId,
      orgId: orgId || null,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      objective: input.objective?.trim() || null,
      classification: input.classification || 'custom',
      systemKey: input.systemKey || null,
      provider: input.provider || 'z-ai',
      model: input.model || 'glm-4.6',
      modelStrategy: JSON.stringify(input.modelStrategy || { strategy: 'single' }),
      memoryScopes: JSON.stringify(input.memoryScopes || ['agent']),
      executionState: 'idle',
      toolPermissions: JSON.stringify(input.toolPermissions || {}),
      schedule: JSON.stringify(input.schedule || { type: 'none' }),
      triggers: JSON.stringify(input.triggers || []),
      approvalPolicy: input.approvalPolicy || 'approval_required',
      retryPolicy: JSON.stringify(input.retryPolicy || { maxRetries: 2, backoffMs: 1000 }),
      memoryConfig: JSON.stringify(input.memoryConfig || { windowSize: 20, maxTokens: 4000 }),
      status: 'draft',
      maxIterations: input.maxIterations || 25,
      timeoutMs: input.timeoutMs || 300000,
    },
  });
  return toApiShape(row);
}

export async function getAgent(userId: string, agentId: string): Promise<AgentRow | null> {
  const row = await db.agent.findFirst({
    where: { id: agentId, userId }, // ownership filter
  });
  return row ? toApiShape(row) : null;
}

export async function listAgents(userId: string): Promise<AgentRow[]> {
  // Workstream C §3 — auto-seed system agents on first list call.
  // ensureSystemAgentsSeeded is idempotent.
  await ensureSystemAgentsSeeded(userId).catch(err => {
    // Non-fatal — system agents may not seed if DB is temporarily
    // unavailable. The user can still see their custom agents.
    console.warn('[agent-service] system agent seeding failed (non-fatal):',
      err instanceof Error ? err.message : String(err));
  });
  const rows = await db.agent.findMany({
    where: { userId },
    orderBy: [{ classification: 'asc' }, { createdAt: 'desc' }],
  });
  return rows.map(toApiShape);
}

export async function updateAgent(userId: string, agentId: string, patch: Partial<CreateAgentInput> & { status?: AgentRow['status']; executionState?: AgentRow['executionState'] }): Promise<AgentRow> {
  // Ownership-checked update
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = patch.name.trim();
  if (patch.description !== undefined) data.description = patch.description?.trim() || null;
  if (patch.objective !== undefined) data.objective = patch.objective?.trim() || null;
  if (patch.classification !== undefined) data.classification = patch.classification;
  if (patch.systemKey !== undefined) data.systemKey = patch.systemKey;
  if (patch.provider !== undefined) {
    const avail = await isProviderAvailable(userId, patch.provider);
    if (!avail.available) {
      throw new Error(`Provider "${patch.provider}" is not available.`);
    }
    data.provider = patch.provider;
  }
  if (patch.model !== undefined) data.model = patch.model;
  if (patch.modelStrategy !== undefined) data.modelStrategy = JSON.stringify(patch.modelStrategy);
  if (patch.memoryScopes !== undefined) data.memoryScopes = JSON.stringify(patch.memoryScopes);
  if (patch.executionState !== undefined) data.executionState = patch.executionState;
  if (patch.toolPermissions !== undefined) data.toolPermissions = JSON.stringify(patch.toolPermissions);
  if (patch.schedule !== undefined) data.schedule = JSON.stringify(patch.schedule);
  if (patch.triggers !== undefined) data.triggers = JSON.stringify(patch.triggers);
  if (patch.approvalPolicy !== undefined) data.approvalPolicy = patch.approvalPolicy;
  if (patch.retryPolicy !== undefined) data.retryPolicy = JSON.stringify(patch.retryPolicy);
  if (patch.memoryConfig !== undefined) data.memoryConfig = JSON.stringify(patch.memoryConfig);
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.maxIterations !== undefined) data.maxIterations = patch.maxIterations;
  if (patch.timeoutMs !== undefined) data.timeoutMs = patch.timeoutMs;

  const updated = await db.agent.updateMany({
    where: { id: agentId, userId }, // ownership filter
    data,
  });
  if (updated.count === 0) {
    throw new Error('Agent not found or not owned by caller');
  }
  const row = await db.agent.findUnique({ where: { id: agentId } });
  if (!row) throw new Error('Agent vanished after update');
  return toApiShape(row);
}

export async function deleteAgent(userId: string, agentId: string): Promise<{ deleted: boolean }> {
  // Cascade: AgentRun, AgentMemory, AgentApproval are NOT FK-linked to Agent
  // (no Prisma relation) — they remain as historical audit records after deletion.
  // This is intentional: agents can be deleted but their past runs + memory
  // persist for compliance/audit. The userId on those rows preserves ownership.
  const result = await db.agent.deleteMany({
    where: { id: agentId, userId },
  });
  return { deleted: result.count > 0 };
}

// ─── Workstream C §3 — System agent helpers ──────────────────────────

/**
 * Get the user's instance of a system agent by systemKey.
 * Auto-seeds system agents if not yet present (idempotent).
 */
export async function getSystemAgentByKey(userId: string, systemKey: SystemAgentKey): Promise<AgentRow | null> {
  await ensureSystemAgentsSeeded(userId).catch(() => { /* non-fatal */ });
  const row = await db.agent.findUnique({
    where: { userId_systemKey: { userId, systemKey } },
  });
  return row ? toApiShape(row) : null;
}

/**
 * List only the system agents (classification='system') for a user.
 */
export async function listSystemAgents(userId: string): Promise<AgentRow[]> {
  await ensureSystemAgentsSeeded(userId).catch(() => { /* non-fatal */ });
  const rows = await db.agent.findMany({
    where: { userId, classification: 'system' },
    orderBy: { systemKey: 'asc' },
  });
  return rows.map(toApiShape);
}

/**
 * List only the custom agents (classification='custom') for a user.
 */
export async function listCustomAgents(userId: string): Promise<AgentRow[]> {
  const rows = await db.agent.findMany({
    where: { userId, classification: 'custom' },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toApiShape);
}

/**
 * Clone a system agent as a custom agent for the user. The cloned agent
 * has classification='custom', systemKey=null, status='draft', and the
 * user can freely modify it without affecting the canonical system agent.
 */
export async function cloneSystemAgentAsCustom(userId: string, systemKey: SystemAgentKey, newName?: string): Promise<AgentRow> {
  const systemAgent = await getSystemAgentByKey(userId, systemKey);
  if (!systemAgent) {
    throw new Error(`System agent "${systemKey}" not found`);
  }
  return createAgent(userId, systemAgent.orgId, {
    name: newName || `${systemAgent.name} (custom)`,
    description: systemAgent.description || undefined,
    objective: systemAgent.objective || undefined,
    classification: 'custom',
    systemKey: null,
    provider: systemAgent.provider,
    model: systemAgent.model,
    modelStrategy: systemAgent.modelStrategy,
    memoryScopes: systemAgent.memoryScopes,
    toolPermissions: systemAgent.toolPermissions,
    approvalPolicy: systemAgent.approvalPolicy,
    retryPolicy: systemAgent.retryPolicy,
    memoryConfig: systemAgent.memoryConfig,
    maxIterations: systemAgent.maxIterations,
    timeoutMs: systemAgent.timeoutMs,
  });
}

// ─── Permission helpers (Decision 8) ────────────────────────────────────

export function getToolPermission(agent: AgentRow, toolName: string): string | null {
  // Returns the permission level for a tool, or null if the tool is not allowed.
  // For email tools: read | draft | send_with_approval | autonomous
  // For other tools: read | read-write | disabled
  const perms = agent.toolPermissions || {};
  return perms[toolName] || null;
}

export function isToolAllowed(agent: AgentRow, toolName: string): boolean {
  const perm = getToolPermission(agent, toolName);
  return perm !== null && perm !== 'disabled';
}

// ─── Helper ────────────────────────────────────────────────────────────

function toApiShape(row: {
  id: string; userId: string; orgId: string | null; name: string; description: string | null;
  objective: string | null; classification: string; systemKey: string | null;
  provider: string; model: string;
  modelStrategy: string; memoryScopes: string; executionState: string;
  toolPermissions: string; schedule: string; triggers: string;
  approvalPolicy: string; retryPolicy: string; memoryConfig: string;
  status: string; maxIterations: number; timeoutMs: number;
  totalRuns: number; totalTokensUsed: number;
  lastRunAt: Date | null; lastError: string | null;
  createdAt: Date; updatedAt: Date;
}): AgentRow {
  let toolPerms: Record<string, string> = {};
  let schedule: AgentRow['schedule'] = { type: 'none' };
  let triggers: AgentRow['triggers'] = [];
  let retryPolicy: AgentRow['retryPolicy'] = { maxRetries: 2, backoffMs: 1000 };
  let memoryConfig: AgentRow['memoryConfig'] = { windowSize: 20, maxTokens: 4000 };
  let modelStrategy: AgentRow['modelStrategy'] = { strategy: 'single' };
  let memoryScopes: string[] = ['agent'];
  try { toolPerms = JSON.parse(row.toolPermissions || '{}'); } catch { /* keep default */ }
  try { schedule = JSON.parse(row.schedule || '{"type":"none"}'); } catch { /* keep default */ }
  try { triggers = JSON.parse(row.triggers || '[]'); } catch { /* keep default */ }
  try { retryPolicy = JSON.parse(row.retryPolicy || '{"maxRetries":2,"backoffMs":1000}'); } catch { /* keep default */ }
  try { memoryConfig = JSON.parse(row.memoryConfig || '{"windowSize":20,"maxTokens":4000}'); } catch { /* keep default */ }
  try { modelStrategy = JSON.parse(row.modelStrategy || '{"strategy":"single"}'); } catch { /* keep default */ }
  try { memoryScopes = JSON.parse(row.memoryScopes || '["agent"]'); } catch { /* keep default */ }
  return {
    id: row.id, userId: row.userId, orgId: row.orgId,
    name: row.name, description: row.description,
    objective: row.objective,
    classification: row.classification as 'system' | 'custom',
    systemKey: row.systemKey,
    provider: row.provider, model: row.model,
    modelStrategy,
    memoryScopes,
    executionState: row.executionState || 'idle',
    toolPermissions: toolPerms,
    schedule, triggers,
    approvalPolicy: row.approvalPolicy as AgentRow['approvalPolicy'],
    retryPolicy, memoryConfig,
    status: row.status as AgentRow['status'],
    maxIterations: row.maxIterations, timeoutMs: row.timeoutMs,
    totalRuns: row.totalRuns, totalTokensUsed: row.totalTokensUsed,
    lastRunAt: row.lastRunAt, lastError: row.lastError,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}
