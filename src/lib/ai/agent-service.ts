// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Agent Service (Phase 26 v3 — Decisions 5+8+12)
//
// CRUD for AI agents + per-tool permissions enforcement.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { isProviderAvailable } from '@/lib/ai/user-ai-provider-service';

export interface AgentRow {
  id: string;
  userId: string;
  orgId: string | null;
  name: string;
  description: string | null;
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
  provider?: string;
  model?: string;
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
  const row = await db.agent.create({
    data: {
      userId,
      orgId: orgId || null,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      provider: input.provider || 'z-ai',
      model: input.model || 'glm-4.6',
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
  const rows = await db.agent.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toApiShape);
}

export async function updateAgent(userId: string, agentId: string, patch: Partial<CreateAgentInput> & { status?: AgentRow['status'] }): Promise<AgentRow> {
  // Ownership-checked update
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = patch.name.trim();
  if (patch.description !== undefined) data.description = patch.description?.trim() || null;
  if (patch.provider !== undefined) {
    const avail = await isProviderAvailable(userId, patch.provider);
    if (!avail.available) {
      throw new Error(`Provider "${patch.provider}" is not available.`);
    }
    data.provider = patch.provider;
  }
  if (patch.model !== undefined) data.model = patch.model;
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
  provider: string; model: string; toolPermissions: string; schedule: string; triggers: string;
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
  try { toolPerms = JSON.parse(row.toolPermissions || '{}'); } catch { /* keep default */ }
  try { schedule = JSON.parse(row.schedule || '{"type":"none"}'); } catch { /* keep default */ }
  try { triggers = JSON.parse(row.triggers || '[]'); } catch { /* keep default */ }
  try { retryPolicy = JSON.parse(row.retryPolicy || '{"maxRetries":2,"backoffMs":1000}'); } catch { /* keep default */ }
  try { memoryConfig = JSON.parse(row.memoryConfig || '{"windowSize":20,"maxTokens":4000}'); } catch { /* keep default */ }
  return {
    id: row.id, userId: row.userId, orgId: row.orgId,
    name: row.name, description: row.description,
    provider: row.provider, model: row.model,
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
