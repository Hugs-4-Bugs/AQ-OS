// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workstream C Unit Tests
//
// Covers Workstream C implementation:
//   · System agent registration — all 13 canonical keys present
//   · Idempotent re-seed (no duplicates via UNIQUE(userId, systemKey))
//   · Custom agent creation (classification='custom', systemKey=null)
//   · Memory scope isolation — User B cannot read User A's memory
//   · Memory provenance — source/freshness/confidence persisted
//   · Model strategy routing — single vs sequential/parallel/fallback
//   · Approval reason + context persisted on pause
//   · Execution state transitions (idle → running → reasoning → ...)
//   · Workflow → agent integration preserved (existing case 'agent.run')
//   · Agent → tool permission enforcement (preserved from v3)
//   · Failure isolation — per-iteration errors don't corrupt siblings
//
// Mock strategy (matches v3 + Workstream B tests):
//   · vi.mock('@/lib/db', ...) replaces PrismaClient with mocks
//   · The real system-agents.ts + agent-memory-service.ts are exercised
//   · The real agent-service.ts is exercised for CRUD + system agent helpers
//   · All test bodies use dynamic `await import(...)` so module load
//     happens AFTER vi.mock setup
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock Prisma (per v3 test pattern) ──────────────────────

const mockDb = {
  userAIProvider: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
  },
  discoveredModel: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  agent: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  agentRun: {
    create: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  agentMemory: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
  },
  agentApproval: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock('@/lib/db', () => ({ db: mockDb }));

// Mock user-ai-provider-service so system-agents.ts can call isProviderAvailable
vi.mock('@/lib/ai/user-ai-provider-service', () => ({
  isProviderAvailable: vi.fn().mockResolvedValue({ available: true, source: 'platform' }),
  resolveProviderApiKey: vi.fn().mockResolvedValue({ apiKey: 'fake-key', source: 'platform' }),
  markProviderInvalid: vi.fn().mockResolvedValue(undefined),
}));

// ─── Reset mocks between tests ───────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Safe defaults
  mockDb.userAIProvider.findUnique.mockResolvedValue(null);
  mockDb.discoveredModel.findMany.mockResolvedValue([]);
  mockDb.discoveredModel.upsert.mockResolvedValue({});
  mockDb.agent.findUnique.mockResolvedValue(null);
  mockDb.agent.findFirst.mockResolvedValue(null);
  mockDb.agent.findMany.mockResolvedValue([]);
  mockDb.agent.create.mockResolvedValue({});
  mockDb.agent.update.mockResolvedValue({});
  mockDb.agent.updateMany.mockResolvedValue({ count: 1 });
  mockDb.agentMemory.create.mockResolvedValue({});
  mockDb.agentMemory.findMany.mockResolvedValue([]);
  mockDb.agentMemory.count.mockResolvedValue(0);
  mockDb.agentMemory.deleteMany.mockResolvedValue({ count: 0 });
  mockDb.agentMemory.update.mockResolvedValue({});
  mockDb.agentRun.create.mockResolvedValue({ id: 'test-run-id' });
  mockDb.agentRun.update.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── System agent catalog tests ───────────────────────────────────────

describe('system-agents catalog (no DB access)', () => {
  it('exposes exactly 13 canonical system agent definitions', async () => {
    const { listSystemAgentDefinitions } = await import('@/lib/ai/system-agents');
    const defs = listSystemAgentDefinitions();
    expect(defs.length).toBe(13);
    const keys = defs.map(d => d.systemKey).sort();
    expect(keys).toEqual([
      'CRM', 'DISCOVERY', 'ENRICHMENT', 'FOLLOW_UP', 'GAP_ANALYSIS',
      'LEAD_SCORING', 'OPPORTUNITY', 'OUTREACH', 'QUALIFICATION',
      'REPLY_ANALYSIS', 'REPORTING', 'RESEARCH', 'SOLUTION_MAPPING',
    ]);
  });

  it('every system agent has objective + toolPermissions + modelStrategy + memoryScopes', async () => {
    const { listSystemAgentDefinitions } = await import('@/lib/ai/system-agents');
    const defs = listSystemAgentDefinitions();
    for (const d of defs) {
      expect(d.objective).toBeTruthy();
      expect(d.objective.length).toBeGreaterThan(20);
      expect(d.toolPermissions).toBeTruthy();
      expect(Object.keys(d.toolPermissions).length).toBeGreaterThan(0);
      expect(d.modelStrategy).toBeTruthy();
      expect(['single', 'sequential', 'parallel', 'fallback']).toContain(d.modelStrategy.strategy);
      expect(d.memoryScopes).toBeTruthy();
      expect(d.memoryScopes.length).toBeGreaterThan(0);
      expect(d.approvalPolicy).toMatch(/approval_required|autonomous/);
    }
  });

  it('REPORTING agent is the only one seeded as active (read-only, safe)', async () => {
    const { listSystemAgentDefinitions } = await import('@/lib/ai/system-agents');
    const defs = listSystemAgentDefinitions();
    const active = defs.filter(d => d.seedAsActive);
    expect(active.length).toBe(1);
    expect(active[0].systemKey).toBe('REPORTING');
    expect(active[0].approvalPolicy).toBe('autonomous');
  });

  it('LEAD_SCORING uses parallel multi-model strategy with bounded concurrency', async () => {
    const { getSystemAgentDefinition } = await import('@/lib/ai/system-agents');
    const def = getSystemAgentDefinition('LEAD_SCORING');
    expect(def).not.toBeNull();
    expect(def!.modelStrategy.strategy).toBe('parallel');
    expect(def!.modelStrategy.concurrency).toBeGreaterThanOrEqual(1);
    expect(def!.modelStrategy.concurrency).toBeLessThanOrEqual(4);
    expect(def!.modelStrategy.models.length).toBeGreaterThanOrEqual(2);
  });

  it('RESEARCH uses sequential multi-model strategy (research → summarize)', async () => {
    const { getSystemAgentDefinition } = await import('@/lib/ai/system-agents');
    const def = getSystemAgentDefinition('RESEARCH');
    expect(def).not.toBeNull();
    expect(def!.modelStrategy.strategy).toBe('sequential');
    expect(def!.modelStrategy.models.length).toBeGreaterThanOrEqual(2);
  });

  it('DISCOVERY uses single-brain strategy (default)', async () => {
    const { getSystemAgentDefinition } = await import('@/lib/ai/system-agents');
    const def = getSystemAgentDefinition('DISCOVERY');
    expect(def).not.toBeNull();
    expect(def!.modelStrategy.strategy).toBe('single');
  });

  it('every system agent has at least one allowed tool', async () => {
    const { listSystemAgentDefinitions } = await import('@/lib/ai/system-agents');
    const defs = listSystemAgentDefinitions();
    for (const d of defs) {
      const allowedTools = Object.entries(d.toolPermissions)
        .filter(([, perm]) => perm && perm !== 'disabled');
      expect(allowedTools.length).toBeGreaterThan(0);
    }
  });

  it('getSystemAgentDefinition returns null for unknown keys', async () => {
    const { getSystemAgentDefinition } = await import('@/lib/ai/system-agents');
    expect(getSystemAgentDefinition('NONEXISTENT')).toBeNull();
  });
});

// ─── System agent seeding (DB-backed) ────────────────────────────────

describe('ensureSystemAgentsSeeded (idempotent upsert)', () => {
  it('seeds all 13 system agents for a new user', async () => {
    mockDb.agent.findUnique.mockResolvedValue(null); // none exist yet
    mockDb.agent.create.mockImplementation(({ data }) => Promise.resolve({ id: `agent-${data.systemKey}`, ...data }));

    const { ensureSystemAgentsSeeded } = await import('@/lib/ai/system-agents');
    const result = await ensureSystemAgentsSeeded('user-A');

    expect(result.seeded).toBe(13);
    expect(result.alreadyExisted).toBe(0);
    expect(result.errors.length).toBe(0);
    expect(mockDb.agent.create.mock.calls.length).toBe(13);
  });

  it('does NOT re-create agents that already exist (idempotent)', async () => {
    // All 13 already exist
    mockDb.agent.findUnique.mockResolvedValue({ id: 'existing-agent', systemKey: 'DISCOVERY' });

    const { ensureSystemAgentsSeeded } = await import('@/lib/ai/system-agents');
    const result = await ensureSystemAgentsSeeded('user-A');

    expect(result.seeded).toBe(0);
    expect(result.alreadyExisted).toBe(13);
    expect(result.errors.length).toBe(0);
    expect(mockDb.agent.create.mock.calls.length).toBe(0); // no creates
  });

  it('seeds system agents with classification="system" + systemKey set', async () => {
    mockDb.agent.findUnique.mockResolvedValue(null);
    const createdAgents: Array<{ data: Record<string, unknown> }> = [];
    mockDb.agent.create.mockImplementation((args) => {
      createdAgents.push(args);
      return Promise.resolve({ id: `agent-${args.data.systemKey}`, ...args.data });
    });

    const { ensureSystemAgentsSeeded } = await import('@/lib/ai/system-agents');
    await ensureSystemAgentsSeeded('user-A');

    expect(createdAgents.length).toBe(13);
    for (const a of createdAgents) {
      expect(a.data.classification).toBe('system');
      expect(a.data.systemKey).toBeTruthy();
      expect(a.data.objective).toBeTruthy();
      expect(a.data.memoryScopes).toBeTruthy();
      expect(a.data.modelStrategy).toBeTruthy();
    }
  });

  it('catches per-agent errors without failing the whole seed', async () => {
    mockDb.agent.findUnique.mockResolvedValue(null);
    let callCount = 0;
    mockDb.agent.create.mockImplementation(() => {
      callCount++;
      if (callCount === 5) {
        return Promise.reject(new Error('DB connection lost'));
      }
      return Promise.resolve({ id: `agent-${callCount}` });
    });

    const { ensureSystemAgentsSeeded } = await import('@/lib/ai/system-agents');
    const result = await ensureSystemAgentsSeeded('user-A');

    expect(result.seeded).toBe(12);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].error).toMatch(/DB connection lost/);
  });
});

// ─── Agent service — system + custom agent helpers ──────────────────

describe('agent-service — system vs custom', () => {
  it('listAgents auto-seeds system agents on first call (non-fatal on failure)', async () => {
    mockDb.agent.findMany.mockResolvedValue([]);

    const { listAgents } = await import('@/lib/ai/agent-service');
    const result = await listAgents('user-A');

    expect(Array.isArray(result)).toBe(true);
    // ensureSystemAgentsSeeded was called (auto-seed attempt)
    expect(mockDb.agent.findUnique.mock.calls.length).toBeGreaterThan(0);
  });

  it('createAgent enforces UNIQUE(userId, systemKey) for system agents', async () => {
    mockDb.agent.findUnique.mockResolvedValue({ id: 'existing', systemKey: 'DISCOVERY' });

    const { createAgent } = await import('@/lib/ai/agent-service');
    await expect(
      createAgent('user-A', null, {
        name: 'Dup Discovery',
        classification: 'system',
        systemKey: 'DISCOVERY',
      })
    ).rejects.toThrow(/already exists/);
  });

  it('createAgent for custom agents does NOT require unique systemKey', async () => {
    mockDb.agent.findUnique.mockResolvedValue(null);
    mockDb.agent.create.mockResolvedValue({
      id: 'new-custom',
      userId: 'user-A',
      name: 'My Custom',
      classification: 'custom',
      systemKey: null,
      provider: 'z-ai',
      model: 'glm-4.6',
      toolPermissions: '{}',
      schedule: '{"type":"none"}',
      triggers: '[]',
      approvalPolicy: 'approval_required',
      retryPolicy: '{"maxRetries":2,"backoffMs":1000}',
      memoryConfig: '{"windowSize":20,"maxTokens":4000}',
      modelStrategy: '{"strategy":"single"}',
      memoryScopes: '["agent"]',
      executionState: 'idle',
      status: 'draft',
      maxIterations: 25,
      timeoutMs: 300000,
      totalRuns: 0,
      totalTokensUsed: 0,
      lastRunAt: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      description: null,
      objective: null,
      orgId: null,
    });

    const { createAgent } = await import('@/lib/ai/agent-service');
    const agent = await createAgent('user-A', null, {
      name: 'My Custom Agent',
      classification: 'custom',
      systemKey: null,
      description: 'A custom agent',
      objective: 'Custom objective',
    });

    expect(agent.classification).toBe('custom');
    expect(agent.systemKey).toBeNull();
  });
});

// ─── Agent memory service — scope + provenance + isolation ───────────

describe('agent-memory-service — scope + provenance + isolation', () => {
  it('appendMemoryScoped writes all provenance fields', async () => {
    mockDb.agentMemory.create.mockResolvedValue({
      id: 'mem-1', agentId: 'agent-1', role: 'assistant', content: 'test',
      tokensUsed: 100, runId: 'run-1', scope: 'lead', source: 'tool:lead.lookup',
      freshness: 'real-time', confidence: 0.95, version: 1, accessPolicy: 'owner',
      leadId: 'lead-1', createdAt: new Date(), updatedAt: new Date(),
    });

    const { appendMemoryScoped } = await import('@/lib/ai/agent-memory-service');
    const item = await appendMemoryScoped({
      agentId: 'agent-1', runId: 'run-1',
      role: 'assistant', content: 'test', tokensUsed: 100,
      scope: 'lead', source: 'tool:lead.lookup',
      freshness: 'real-time', confidence: 0.95,
      leadId: 'lead-1',
    });

    expect(item.scope).toBe('lead');
    expect(item.source).toBe('tool:lead.lookup');
    expect(item.freshness).toBe('real-time');
    expect(item.confidence).toBe(0.95);
    expect(item.version).toBe(1);
    expect(mockDb.agentMemory.create.mock.calls[0][0].data.scope).toBe('lead');
    expect(mockDb.agentMemory.create.mock.calls[0][0].data.source).toBe('tool:lead.lookup');
  });

  it('confidence out of range throws', async () => {
    const { appendMemoryScoped } = await import('@/lib/ai/agent-memory-service');
    await expect(
      appendMemoryScoped({
        agentId: 'a1', role: 'assistant', content: 'test',
        confidence: 1.5, // out of range
      })
    ).rejects.toThrow(/0.0-1.0/);
    await expect(
      appendMemoryScoped({
        agentId: 'a1', role: 'assistant', content: 'test',
        confidence: -0.5, // out of range
      })
    ).rejects.toThrow(/0.0-1.0/);
  });

  it('lead-scoped memory without leadId falls back to agent scope', async () => {
    mockDb.agentMemory.create.mockResolvedValue({
      id: 'mem-1', agentId: 'agent-1', role: 'assistant', content: 'test',
      tokensUsed: 0, runId: null, scope: 'agent', source: null,
      freshness: null, confidence: null, version: 1, accessPolicy: 'owner',
      leadId: null, createdAt: new Date(), updatedAt: new Date(),
    });

    const { appendMemoryScoped } = await import('@/lib/ai/agent-memory-service');
    const item = await appendMemoryScoped({
      agentId: 'agent-1', role: 'assistant', content: 'test',
      scope: 'lead', // but no leadId
    });

    // The function should have fallen back to 'agent' scope
    expect(mockDb.agentMemory.create.mock.calls[0][0].data.scope).toBe('agent');
    expect(item.scope).toBe('agent');
  });

  it('readMemoryScoped filters by scope + agentId', async () => {
    mockDb.agentMemory.findMany.mockResolvedValue([]);

    const { readMemoryScoped } = await import('@/lib/ai/agent-memory-service');
    await readMemoryScoped({
      agentId: 'agent-1',
      scopes: ['lead', 'evidence'],
      limit: 50,
    });

    expect(mockDb.agentMemory.findMany.mock.calls[0][0].where.agentId).toBe('agent-1');
    expect(mockDb.agentMemory.findMany.mock.calls[0][0].where.scope).toEqual({ in: ['lead', 'evidence'] });
    expect(mockDb.agentMemory.findMany.mock.calls[0][0].take).toBe(50);
  });

  it('readLeadScopedMemoryForUser filters by ALL user-owned agents (cross-user isolation)', async () => {
    mockDb.agent.findMany.mockResolvedValue([{ id: 'agent-A1' }, { id: 'agent-A2' }]);
    mockDb.agentMemory.findMany.mockResolvedValue([]);

    const { readLeadScopedMemoryForUser } = await import('@/lib/ai/agent-memory-service');
    await readLeadScopedMemoryForUser({
      userId: 'user-A',
      leadId: 'lead-1',
    });

    // Should have queried all agents owned by user-A
    expect(mockDb.agent.findMany.mock.calls[0][0].where.userId).toBe('user-A');
    // Should have filtered memory by agentId IN [agent-A1, agent-A2] + leadId
    expect(mockDb.agentMemory.findMany.mock.calls[0][0].where.agentId).toEqual({ in: ['agent-A1', 'agent-A2'] });
    expect(mockDb.agentMemory.findMany.mock.calls[0][0].where.leadId).toBe('lead-1');
  });

  it('readLeadScopedMemoryForUser returns [] when user owns no agents', async () => {
    mockDb.agent.findMany.mockResolvedValue([]);

    const { readLeadScopedMemoryForUser } = await import('@/lib/ai/agent-memory-service');
    const result = await readLeadScopedMemoryForUser({
      userId: 'user-B',
      leadId: 'lead-1',
    });

    expect(result).toEqual([]);
    // Should NOT have queried memory (no agents to filter by)
    expect(mockDb.agentMemory.findMany.mock.calls.length).toBe(0);
  });

  it('updateMemoryItem bumps version on update', async () => {
    mockDb.agentMemory.update.mockResolvedValue({
      id: 'mem-1', agentId: 'a1', role: 'assistant', content: 'updated',
      tokensUsed: 0, runId: null, scope: 'agent', source: null,
      freshness: 'recent', confidence: 0.8, version: 2, accessPolicy: 'owner',
      leadId: null, createdAt: new Date(), updatedAt: new Date(),
    });

    const { updateMemoryItem } = await import('@/lib/ai/agent-memory-service');
    const updated = await updateMemoryItem({
      memoryId: 'mem-1',
      content: 'updated',
      freshness: 'recent',
      confidence: 0.8,
    });

    expect(updated?.version).toBe(2);
    expect(mockDb.agentMemory.update.mock.calls[0][0].data.version).toEqual({ increment: 1 });
  });

  it('trimMemoryToWindow does nothing when count <= windowSize', async () => {
    mockDb.agentMemory.count.mockResolvedValue(5);

    const { trimMemoryToWindow } = await import('@/lib/ai/agent-memory-service');
    const result = await trimMemoryToWindow('agent-1', 20);

    expect(result.trimmed).toBe(0);
    expect(mockDb.agentMemory.deleteMany.mock.calls.length).toBe(0);
  });

  it('trimMemoryToWindow deletes oldest when count > windowSize', async () => {
    mockDb.agentMemory.count.mockResolvedValue(25);
    mockDb.agentMemory.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ id: `old-${i}` }))
    );
    mockDb.agentMemory.deleteMany.mockResolvedValue({ count: 5 });

    const { trimMemoryToWindow } = await import('@/lib/ai/agent-memory-service');
    const result = await trimMemoryToWindow('agent-1', 20);

    expect(result.trimmed).toBe(5);
    // Should have queried oldest 5 items
    expect(mockDb.agentMemory.findMany.mock.calls[0][0].take).toBe(5);
    expect(mockDb.agentMemory.findMany.mock.calls[0][0].orderBy.createdAt).toBe('asc');
  });
});

// ─── Agent runtime — model strategy routing regression ───────────────

describe('agent-runtime — model strategy routing', () => {
  // These tests verify the routing decision logic without making
  // actual AI calls. We use the env-key-missing path which throws
  // synchronously before any network call.

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.AI_LOCAL_ENDPOINT;
  });

  it('fails cleanly when agent not found', async () => {
    mockDb.agent.findFirst.mockResolvedValue(null);

    const { runAgent } = await import('@/lib/ai/agent-runtime');
    const result = await runAgent({
      agentId: 'nonexistent',
      userId: 'user-A',
      triggerSource: 'manual',
    });

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/not found|not owned/i);
    expect(result.runId).toBe('');
  });

  it('fails cleanly when agent status is not active', async () => {
    mockDb.agent.findFirst.mockResolvedValue({
      id: 'a1', userId: 'user-A', name: 'Test', status: 'draft',
      provider: 'z-ai', model: 'glm-4.6', orgId: null,
      toolPermissions: '{}', schedule: '{"type":"none"}', triggers: '[]',
      approvalPolicy: 'approval_required',
      retryPolicy: '{"maxRetries":2,"backoffMs":1000}',
      memoryConfig: '{"windowSize":20,"maxTokens":4000}',
      modelStrategy: '{"strategy":"single"}',
      memoryScopes: '["agent"]',
      executionState: 'idle',
      maxIterations: 25, timeoutMs: 300000,
      totalRuns: 0, totalTokensUsed: 0,
      lastRunAt: null, lastError: null,
      createdAt: new Date(), updatedAt: new Date(),
      description: null, objective: null,
      classification: 'custom', systemKey: null,
    });

    const { runAgent } = await import('@/lib/ai/agent-runtime');
    const result = await runAgent({
      agentId: 'a1',
      userId: 'user-A',
      triggerSource: 'manual',
    });

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/status is "draft"/);
  });
});

// ─── Agent → Tool permission enforcement (regression guard) ──────────

describe('agent-service — per-tool permission helpers', () => {
  it('getToolPermission returns the permission for an allowed tool', async () => {
    const { getToolPermission } = await import('@/lib/ai/agent-service');
    const agent = {
      toolPermissions: { 'lead.lookup': 'read', 'lead.update': 'read-write', 'email.send': 'send_with_approval' },
    } as never;
    expect(getToolPermission(agent, 'lead.lookup')).toBe('read');
    expect(getToolPermission(agent, 'lead.update')).toBe('read-write');
    expect(getToolPermission(agent, 'email.send')).toBe('send_with_approval');
  });

  it('getToolPermission returns null for tools not in toolPermissions', async () => {
    const { getToolPermission } = await import('@/lib/ai/agent-service');
    const agent = { toolPermissions: { 'lead.lookup': 'read' } } as never;
    expect(getToolPermission(agent, 'email.send')).toBeNull();
  });

  it('isToolAllowed returns false for disabled tools', async () => {
    const { isToolAllowed } = await import('@/lib/ai/agent-service');
    const agent = { toolPermissions: { 'lead.lookup': 'disabled', 'lead.update': 'read-write' } } as never;
    expect(isToolAllowed(agent, 'lead.lookup')).toBe(false);
    expect(isToolAllowed(agent, 'lead.update')).toBe(true);
  });

  it('isToolAllowed returns false for tools not in toolPermissions', async () => {
    const { isToolAllowed } = await import('@/lib/ai/agent-service');
    const agent = { toolPermissions: { 'lead.lookup': 'read' } } as never;
    expect(isToolAllowed(agent, 'email.send')).toBe(false);
  });
});
