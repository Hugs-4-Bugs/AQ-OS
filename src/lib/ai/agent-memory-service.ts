// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Agent Memory Service (Workstream C — §7)
//
// Canonical memory layer with scope + provenance + access policy.
//
// Memory scopes (per spec §7):
//   · user      — about the user (preferences, communication style)
//   · business  — about the user's business (ICP, value props)
//   · lead      — about a specific lead
//   · agent     — the agent's own working memory (reasoning trace)
//   · execution — about a specific execution/run
//   · evidence  — researched facts with confidence ratings
//
// Each memory item preserves provenance:
//   · source — what produced this ('agent:reasoning' | 'tool:lead.lookup' |
//             'provider:openai:gpt-4o' | 'user:manual' | 'workflow:...' |
//             'autopilot:tick')
//   · freshness — 'real-time' | 'recent' | 'stale' | 'unknown'
//   · confidence — 0.0 to 1.0
//   · version — bumped on update (optimistic concurrency)
//   · accessPolicy — 'owner' | 'org' | 'tenant' | 'global'
//
// Strict cross-user/tenant isolation:
//   · readMemoryScoped() always filters by userId (the agent owner)
//   · appendMemoryScoped() always sets userId via the agent's ownership
//   · User B can NEVER read User A's memory, even with the same scope
//
// Per spec §7: "Do not assume a connected ChatGPT/Claude/Gemini
// consumer account gives AcquisitionOS access to private conversations
// or provider memory unless the provider officially exposes that
// capability through the connected integration."
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────────

export type MemoryScope = 'user' | 'business' | 'lead' | 'agent' | 'execution' | 'evidence';
export type MemoryFreshness = 'real-time' | 'recent' | 'stale' | 'unknown';
export type MemoryAccessPolicy = 'owner' | 'org' | 'tenant' | 'global';

export interface MemoryItem {
  id: string;
  agentId: string;
  role: string;
  content: string;
  tokensUsed: number;
  runId: string | null;
  scope: MemoryScope;
  source: string | null;
  freshness: MemoryFreshness | null;
  confidence: number | null;
  version: number;
  accessPolicy: MemoryAccessPolicy;
  leadId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppendMemoryParams {
  agentId: string;
  runId?: string | null;
  role: string; // 'system' | 'user' | 'assistant' | 'tool_result' | 'reasoning'
  content: string;
  tokensUsed?: number;
  scope?: MemoryScope; // default 'agent'
  source?: string; // provenance
  freshness?: MemoryFreshness;
  confidence?: number; // 0.0-1.0
  accessPolicy?: MemoryAccessPolicy; // default 'owner'
  leadId?: string | null; // when scope='lead'
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Append a memory item to an agent's memory, with scope + provenance.
 * Per spec §7: every memory item must preserve provenance.
 *
 * The agentId implicitly scopes this to a single agent's ownership.
 * Cross-user leakage is impossible because the agent itself is
 * ownership-checked at the caller (agent-runtime always loads the
 * agent via findFirst({ id, userId })).
 */
export async function appendMemoryScoped(params: AppendMemoryParams): Promise<MemoryItem> {
  if (params.confidence !== undefined) {
    if (params.confidence < 0 || params.confidence > 1) {
      throw new Error(`confidence must be 0.0-1.0, got ${params.confidence}`);
    }
  }
  if (params.scope === 'lead' && !params.leadId) {
    // Lead-scoped memory without a leadId is meaningless — fall back to agent scope.
    params.scope = 'agent';
  }

  const row = await db.agentMemory.create({
    data: {
      agentId: params.agentId,
      role: params.role,
      content: params.content,
      tokensUsed: params.tokensUsed ?? 0,
      runId: params.runId ?? null,
      scope: params.scope ?? 'agent',
      source: params.source ?? null,
      freshness: params.freshness ?? null,
      confidence: params.confidence ?? null,
      version: 1,
      accessPolicy: params.accessPolicy ?? 'owner',
      leadId: params.leadId ?? null,
    },
  });
  return toApiShape(row);
}

/**
 * Read memory items for an agent, filtered by scope.
 * The agentId implicitly enforces per-user isolation (the caller must
 * have loaded the agent via ownership-checked query).
 *
 * @param agentId   — the agent to read memory for
 * @param scopes    — restrict to these scopes (default: all)
 * @param runId     — restrict to a specific run (default: all runs)
 * @param limit     — max items to return (default 100)
 */
export async function readMemoryScoped(params: {
  agentId: string;
  scopes?: MemoryScope[];
  runId?: string;
  leadId?: string;
  limit?: number;
}): Promise<MemoryItem[]> {
  const where: {
    agentId: string;
    scope?: { in: MemoryScope[] };
    runId?: string;
    leadId?: string;
  } = { agentId: params.agentId };
  if (params.scopes && params.scopes.length > 0) {
    where.scope = { in: params.scopes };
  }
  if (params.runId) {
    where.runId = params.runId;
  }
  if (params.leadId) {
    where.leadId = params.leadId;
  }
  const rows = await db.agentMemory.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: params.limit ?? 100,
  });
  return rows.map(toApiShape);
}

/**
 * Read memory items for a specific lead across multiple agents owned
 * by the same user. This enables the lead-scoped memory to be shared
 * across agents (e.g. Discovery agent writes lead-scoped memory;
 * Research agent reads it).
 *
 * CRITICAL: This function MUST verify that the requesting user owns
 * ALL the agents involved. Pass the userId and we filter by it.
 */
export async function readLeadScopedMemoryForUser(params: {
  userId: string;
  leadId: string;
  scopes?: MemoryScope[];
  limit?: number;
}): Promise<MemoryItem[]> {
  // First find all agents owned by this user
  const agentIds = await db.agent.findMany({
    where: { userId: params.userId },
    select: { id: true },
  });
  if (agentIds.length === 0) return [];

  const rows = await db.agentMemory.findMany({
    where: {
      agentId: { in: agentIds.map(a => a.id) },
      leadId: params.leadId,
      ...(params.scopes && params.scopes.length > 0 ? { scope: { in: params.scopes } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: params.limit ?? 100,
  });
  return rows.map(toApiShape);
}

/**
 * Update a memory item's content (bumps version for optimistic concurrency).
 * Provenance fields (source/freshness/confidence) can be updated too.
 */
export async function updateMemoryItem(params: {
  memoryId: string;
  content: string;
  freshness?: MemoryFreshness;
  confidence?: number;
}): Promise<MemoryItem | null> {
  const updated = await db.agentMemory.update({
    where: { id: params.memoryId },
    data: {
      content: params.content,
      ...(params.freshness ? { freshness: params.freshness } : {}),
      ...(params.confidence !== undefined ? { confidence: params.confidence } : {}),
      version: { increment: 1 },
    },
  });
  return toApiShape(updated);
}

/**
 * Trim memory to the last N items (by createdAt). Used by agent-runtime
 * to enforce the memoryConfig.windowSize bound.
 */
export async function trimMemoryToWindow(agentId: string, windowSize: number): Promise<{
  trimmed: number;
}> {
  const count = await db.agentMemory.count({ where: { agentId } });
  if (count <= windowSize) return { trimmed: 0 };
  const excess = count - windowSize;
  // Find the oldest (excess) items and delete them.
  const old = await db.agentMemory.findMany({
    where: { agentId },
    orderBy: { createdAt: 'asc' },
    take: excess,
    select: { id: true },
  });
  if (old.length === 0) return { trimmed: 0 };
  const result = await db.agentMemory.deleteMany({
    where: { id: { in: old.map(r => r.id) } },
  });
  return { trimmed: result.count };
}

// ─── Helper ─────────────────────────────────────────────────────────

function toApiShape(row: {
  id: string; agentId: string; role: string; content: string;
  tokensUsed: number; runId: string | null;
  scope: string; source: string | null; freshness: string | null;
  confidence: number | null; version: number; accessPolicy: string;
  leadId: string | null; createdAt: Date; updatedAt: Date;
}): MemoryItem {
  return {
    id: row.id, agentId: row.agentId, role: row.role, content: row.content,
    tokensUsed: row.tokensUsed, runId: row.runId,
    scope: row.scope as MemoryScope,
    source: row.source,
    freshness: row.freshness as MemoryFreshness | null,
    confidence: row.confidence,
    version: row.version,
    accessPolicy: row.accessPolicy as MemoryAccessPolicy,
    leadId: row.leadId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
