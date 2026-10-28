// ═══════════════════════════════════════════════════════════════════
// Phase 26 v2 — Agentic Tool Layer tests
//
// Tests the canonical tool registry + dispatcher + individual tools.
// Mock Prisma + Gmail OAuth to keep tests fast and deterministic.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Prisma before importing any module that uses @/lib/db ──────
// vi.mock factories are hoisted ABOVE top-level `const` declarations by
// vitest, so `mockDb` MUST be created via `vi.hoisted()` to be in scope
// when the factory runs. This regression appeared when Workstream C/D
// added `connected-accounts/service.ts` which is transitively imported
// via agent-tools/index.ts → business-email-tools.ts → service.ts →
// @/lib/db (the mocked module). The vi.hoisted pattern matches the
// existing entitlements mock below.
const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    lead: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    workflowExecution: {
      findFirst: vi.fn(),
    },
    task: {
      create: vi.fn(),
    },
    messageDraft: {
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    businessProfile: {
      findFirst: vi.fn(),
    },
    agentActivity: {
      create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    },
    emailAccount: {
      findFirst: vi.fn(),
    },
    usageTracking: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
  return { mockDb };
});

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

// Workstream D added connected-accounts/service.ts as a transitive
// import through agent-tools/index.ts → business-email-tools.ts → service.ts.
// Mock it here so the test stays isolated from the new module's transitive
// imports (crypto/encryption, adapter registry). This test suite does NOT
// exercise businessEmail.send/reply — only the Gmail-OAuth email tools
// and lead/workflow/etc tools — so a stub mock is safe.
vi.mock('@/lib/connected-accounts/service', () => ({
  resolveAccountForCapability: vi.fn(),
  scopeRequiresApproval: vi.fn().mockReturnValue(false),
  scopeGrantsCapability: vi.fn().mockReturnValue(true),
  getAdapter: vi.fn().mockReturnValue(null),
  connectBusinessAccount: vi.fn(),
  disconnectAccount: vi.fn(),
  revokeAccount: vi.fn(),
  validateAccount: vi.fn(),
  listUnifiedConnectedAccounts: vi.fn().mockResolvedValue([]),
  SUPPORTED_BUSINESS_PROVIDERS: [],
  defaultScopesFor: vi.fn().mockReturnValue([]),
}));

// Mock entitlement service — use vi.hoisted so the mock value is
// available when the vi.mock factory is hoisted to top-of-file.
const { mockEntitlements, mockGetUserEntitlements } = vi.hoisted(() => {
  const mockEntitlements = {
    userId: 'user-elite',
    plan: 'elite' as const,
    planLevel: 3,
    autopilot: { allowed: true, limit: 7, used: 0, overLimit: false },
    profiles: { limit: 7, used: 0, overLimit: false },
    workflow: { eligible: true, limit: null as number | null },
    credits: { monthlyAllocation: 2000 },
    source: 'db' as const,
    entitlements: {
      lead_discovery: { limit: null as number | null, enabled: true },
      deep_analysis: { limit: null as number | null, enabled: true },
      outreach_messages: { limit: null as number | null, enabled: true },
      workflow_access: { limit: null as number | null, enabled: true },
      business_profiles: { limit: 7, enabled: true },
      autopilot_access: { limit: 7, enabled: true },
    },
  };
  const mockGetUserEntitlements = vi.fn().mockResolvedValue(mockEntitlements);
  return { mockEntitlements, mockGetUserEntitlements };
});
vi.mock('@/lib/entitlement-service', () => ({
  getUserEntitlements: mockGetUserEntitlements,
}));

vi.mock('@/lib/execution-activity', () => ({
  logExecutionActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/gmail-oauth-service', () => ({
  getValidAccessToken: vi.fn().mockResolvedValue('mock-gmail-token'),
}));

// ── Import after mocks are set up ───────────────────────────────────
import { invokeTool, listTools, getTool } from '@/lib/ai/agent-tools';

// Build a ToolContext for tests
function makeCtx(overrides: Partial<Parameters<typeof invokeTool>[2]> = {}) {
  return {
    userId: 'user-elite',
    orgId: null,
    emailPermission: 'autonomous' as const,
    log: vi.fn(),
    ...overrides,
  };
}

describe('Phase 26 v2 — Agent Tool Layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Registry + dispatcher ────────────────────────────────────────

  describe('Registry + Dispatcher', () => {
    it('registers all expected tools', () => {
      const tools = listTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('lead.lookup');
      expect(names).toContain('lead.create');
      expect(names).toContain('lead.update');
      expect(names).toContain('lead.enrich');
      expect(names).toContain('workflow.status');
      expect(names).toContain('task.create');
      expect(names).toContain('message.draft');
      expect(names).toContain('profile.lookup');
      expect(names).toContain('company.profile.lookup');
      expect(names).toContain('activity.log');
      expect(names).toContain('email.search');
      expect(names).toContain('email.read');
      expect(names).toContain('email.thread');
      expect(names).toContain('email.draft');
      expect(names).toContain('email.reply');
      expect(names).toContain('email.send');
    });

    it('returns error result for unknown tool name', async () => {
      const result = await invokeTool('nonexistent.tool', {}, makeCtx());
      expect(result.status).toBe('error');
      expect(result.error).toContain('Unknown tool');
      expect(result.toolInvocationId).toMatch(/^toolinv-nonexistent\.tool-/);
    });

    it('validates input schema — rejects missing required fields', async () => {
      const result = await invokeTool('lead.create', {}, makeCtx());
      expect(result.status).toBe('validation_error');
      expect(result.error).toContain('Missing required field');
    });

    it('validates input schema — rejects unknown fields when additionalProperties=false', async () => {
      const result = await invokeTool(
        'lead.create',
        { businessName: 'Acme', niche: 'tech', bogus: 'extra' },
        makeCtx(),
      );
      expect(result.status).toBe('validation_error');
      expect(result.error).toContain('Unknown field');
    });

    it('idempotent tool returns cached result on second call with same idempotencyKey', async () => {
      mockDb.lead.create.mockResolvedValueOnce({ id: 'lead-1' });
      const ctx = makeCtx({ idempotencyKey: 'key-001' });
      const input = { businessName: 'Acme', niche: 'tech' };
      const r1 = await invokeTool('lead.create', input, ctx);
      expect(r1.status).toBe('success');
      expect(r1.fromCache).toBeUndefined();
      // Second call with same idempotencyKey — should hit cache, NOT call create again
      const r2 = await invokeTool('lead.create', input, ctx);
      expect(r2.status).toBe('success');
      expect(r2.fromCache).toBe(true);
      // Verify create was only called once
      expect(mockDb.lead.create).toHaveBeenCalledTimes(1);
    });
  });

  // ── Lead tools ──────────────────────────────────────────────────

  describe('lead.lookup', () => {
    it('returns lead when owned by caller', async () => {
      mockDb.lead.findFirst.mockResolvedValueOnce({
        id: 'lead-1', businessName: 'Acme', email: 'a@b.com',
      });
      const result = await invokeTool('lead.lookup', { leadId: 'lead-1' }, makeCtx());
      expect(result.status).toBe('success');
      expect(result.output?.lead).toBeDefined();
      // Verify ownership filter was applied
      expect(mockDb.lead.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-elite' }),
      }));
    });

    it('returns not_found when lead is not owned by caller', async () => {
      mockDb.lead.findFirst.mockResolvedValueOnce(null);
      const result = await invokeTool('lead.lookup', { leadId: 'other-user-lead' }, makeCtx());
      expect(result.status).toBe('not_found');
    });

    it('rejects call without leadId or email', async () => {
      const result = await invokeTool('lead.lookup', {}, makeCtx());
      expect(result.status).toBe('validation_error');
    });
  });

  describe('lead.create', () => {
    it('creates a lead with userId from ctx (never from input)', async () => {
      mockDb.lead.create.mockResolvedValueOnce({ id: 'new-lead-1' });
      const result = await invokeTool(
        'lead.create',
        { businessName: 'Acme', niche: 'tech' },
        makeCtx({ userId: 'user-elite' }),
      );
      expect(result.status).toBe('success');
      expect(result.output).toEqual({ leadId: 'new-lead-1', created: true });
      // CRITICAL: userId must come from ctx, never from input
      expect(mockDb.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-elite',
          businessName: 'Acme',
          niche: 'tech',
        }),
        select: { id: true },
      });
    });
  });

  describe('lead.update', () => {
    it('uses updateMany with userId filter — enforces ownership', async () => {
      mockDb.lead.updateMany.mockResolvedValueOnce({ count: 1 });
      const result = await invokeTool(
        'lead.update',
        { leadId: 'lead-1', replyScore: 75 },
        makeCtx(),
      );
      expect(result.status).toBe('success');
      expect(mockDb.lead.updateMany).toHaveBeenCalledWith({
        where: { id: 'lead-1', userId: 'user-elite' },
        data: { replyScore: 75 },
      });
    });

    it('returns not_found when lead not owned by caller', async () => {
      mockDb.lead.updateMany.mockResolvedValueOnce({ count: 0 });
      const result = await invokeTool(
        'lead.update',
        { leadId: 'other-lead', replyScore: 50 },
        makeCtx(),
      );
      expect(result.status).toBe('not_found');
    });
  });

  // ── Email permission boundaries ─────────────────────────────────

  describe('Email permission boundaries', () => {
    it('email.send requires send_with_approval or autonomous level', async () => {
      const ctx = makeCtx({ emailPermission: 'read' });
      const result = await invokeTool(
        'email.send',
        { to: 'a@b.com', subject: 'hi', body: 'hello' },
        ctx,
      );
      expect(result.status).toBe('unauthorized');
      expect(result.error).toContain('Email permission level');
    });

    it('email.draft requires draft or higher level', async () => {
      const ctx = makeCtx({ emailPermission: 'read' });
      // Need a connected email account to even attempt — but the permission
      // check happens BEFORE the account lookup, so this still rejects.
      const result = await invokeTool(
        'email.draft',
        { to: 'a@b.com', subject: 'hi', body: 'hello' },
        ctx,
      );
      expect(result.status).toBe('unauthorized');
    });

    it('email.search succeeds with read permission when account connected', async () => {
      mockDb.emailAccount.findFirst.mockResolvedValueOnce({
        id: 'acct-1', gmailEmail: 'test@gmail.com',
      });
      // Mock the fetch call to Gmail API
      const mockMessages = { messages: [{ id: 'm1', threadId: 't1' }] };
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockMessages,
      } as Response);
      const result = await invokeTool(
        'email.search',
        { query: 'from:customer@example.com' },
        makeCtx({ emailPermission: 'read' }),
      );
      expect(result.status).toBe('success');
      expect(result.output?.messages).toBeDefined();
      globalThis.fetch = originalFetch;
    });
  });

  // ── Authorization check ─────────────────────────────────────────

  describe('Authorization (entitlement check)', () => {
    it('blocks tool calls when plan lacks required feature', async () => {
      const { getUserEntitlements } = await import('@/lib/entitlement-service');
      (getUserEntitlements as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ...mockEntitlements,
        plan: 'free' as const,
        entitlements: {
          ...mockEntitlements.entitlements,
          deep_analysis: { limit: 0, enabled: false },
        },
      });
      const result = await invokeTool(
        'lead.enrich',
        { leadId: 'lead-1', linkedin: 'https://linkedin.com/x' },
        makeCtx(),
      );
      expect(result.status).toBe('unauthorized');
      expect(result.error.toLowerCase()).toContain('plan free');
    });
  });

  // ── Audit log writes ────────────────────────────────────────────

  describe('Audit logging', () => {
    it('writes an AgentActivity row on every tool call (success or failure)', async () => {
      mockDb.lead.findFirst.mockResolvedValueOnce({ id: 'lead-1', businessName: 'Acme' });
      await invokeTool('lead.lookup', { leadId: 'lead-1' }, makeCtx());
      // Audit log is best-effort — verify it was called
      expect(mockDb.agentActivity.create).toHaveBeenCalled();
      const call = mockDb.agentActivity.create.mock.calls[0][0];
      expect(call.data.toolName).toBe('lead.lookup');
      expect(call.data.userId).toBe('user-elite');
      expect(call.data.status).toBe('success');
    });
  });

  // ── Message draft ownership ─────────────────────────────────────

  describe('message.draft ownership', () => {
    it('rejects when leadId is not owned by caller', async () => {
      mockDb.lead.findFirst.mockResolvedValueOnce(null);
      const result = await invokeTool(
        'message.draft',
        { leadId: 'other-user-lead', subject: 'hi', body: 'hello' },
        makeCtx(),
      );
      expect(result.status).toBe('not_found');
    });

    it('creates draft when lead is owned by caller', async () => {
      mockDb.lead.findFirst.mockResolvedValueOnce({ id: 'lead-1', email: 'lead@example.com' });
      mockDb.messageDraft.create.mockResolvedValueOnce({ id: 'draft-1' });
      const result = await invokeTool(
        'message.draft',
        { leadId: 'lead-1', subject: 'Hello', body: 'World' },
        makeCtx(),
      );
      expect(result.status).toBe('success');
      expect(result.output).toEqual({ draftId: 'draft-1' });
    });
  });

  // ── Profile lookup ──────────────────────────────────────────────

  describe('profile.lookup', () => {
    it('returns the authenticated user profile', async () => {
      mockDb.user.findUnique.mockResolvedValueOnce({
        name: 'Elite User',
        email: 'elite@example.com',
        phone: '',
        country: 'Singapore',
        company: 'Acme Inc',
        avatar: null,
        bio: null,
        settings: { companyName: 'Acme Inc' },
      });
      const result = await invokeTool('profile.lookup', {}, makeCtx({ userId: 'user-elite' }));
      expect(result.status).toBe('success');
      expect(result.output?.profile?.name).toBe('Elite User');
      // CRITICAL: lookup uses ctx.userId, never an input-supplied ID
      expect(mockDb.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-elite' },
        select: expect.any(Object),
      });
    });
  });

  // ── Activity log ────────────────────────────────────────────────

  describe('activity.log', () => {
    it('writes to Phase 25 ExecutionActivity', async () => {
      const { logExecutionActivity } = await import('@/lib/execution-activity');
      const result = await invokeTool(
        'activity.log',
        { type: 'AGENT_TOOL_CALLED', message: 'tool invoked' },
        makeCtx(),
      );
      expect(result.status).toBe('success');
      expect(logExecutionActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-elite',
          type: 'AGENT_TOOL_CALLED',
        }),
      );
    });
  });
});
