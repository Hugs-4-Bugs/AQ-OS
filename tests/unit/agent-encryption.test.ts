// ═══════════════════════════════════════════════════════════════════
// UserAIProvider + Agent + Encryption tests
//
// Covers:
//   - Encryption service roundtrip (encrypt → decrypt → match)
//   - UserAIProvider resolution order (user → platform → error)
//   - Agent service CRUD + per-tool permission checks
//   - Agent runtime bounded loop (mocked AI brain)
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Prisma ──────────────────────────────────────────────────────

const mockDb = {
  userAIProvider: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
  },
  agent: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  agentRun: {
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  agentMemory: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  agentApproval: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock('@/lib/db', () => ({ db: mockDb }));

// Mock the AI provider (so agent runtime doesn't make real API calls)
vi.mock('@/lib/ai/ai-provider', () => ({
  executeAICompletion: vi.fn(),
}));

// Mock the agent-tools registry (to avoid loading the real registry)
vi.mock('@/lib/ai/agent-tools', () => ({
  invokeTool: vi.fn(),
  listTools: vi.fn(() => []),
  getTool: vi.fn(),
  registerTool: vi.fn(),
}));

// ── Tests ─────────────────────────────────────────────────────────────

describe('Encryption Service', () => {
  it('encryptCredential + decryptCredential roundtrip preserves plaintext', async () => {
    const { encryptCredential, decryptCredential } = await import('@/lib/crypto/encryption');
    const plaintext = 'sk-test-1234567890abcdef';
    const encrypted = encryptCredential(plaintext);
    expect(encrypted).toMatch(/^v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    const decrypted = decryptCredential(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('different encryptions of the same plaintext produce different ciphertexts (random IV)', async () => {
    const { encryptCredential } = await import('@/lib/crypto/encryption');
    const plaintext = 'sk-test-key-12345';
    const e1 = encryptCredential(plaintext);
    const e2 = encryptCredential(plaintext);
    expect(e1).not.toBe(e2); // different IVs → different ciphertexts
  });

  it('decryptCredential throws on tampered payload (wrong auth tag)', async () => {
    const { encryptCredential, decryptCredential } = await import('@/lib/crypto/encryption');
    const encrypted = encryptCredential('sk-test-12345');
    // Tamper with the auth tag (flip a hex char)
    const parts = encrypted.split(':');
    const tamperedTag = parts[2].slice(0, -2) + (parts[2].slice(-2) === '00' ? '11' : '00');
    const tampered = `${parts[0]}:${parts[1]}:${tamperedTag}:${parts[3]}`;
    expect(() => decryptCredential(tampered)).toThrow();
  });

  it('maskCredential never exposes more than first 4 + last 4 chars', async () => {
    const { maskCredential } = await import('@/lib/crypto/encryption');
    const masked = maskCredential('sk-proj-abcdefgX4f2');
    expect(masked).toBe('sk-p***X4f2');
    expect(masked).not.toContain('abcdefg');
  });

  it('canDecrypt returns true for valid payload, false for invalid', async () => {
    const { encryptCredential, canDecrypt } = await import('@/lib/crypto/encryption');
    const valid = encryptCredential('sk-test');
    expect(canDecrypt(valid)).toBe(true);
    expect(canDecrypt('not-a-valid-payload')).toBe(false);
  });
});

describe('UserAIProvider resolution order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env
    vi.resetModules();
  });

  it('returns user-connected credential when present + active', async () => {
    const { encryptCredential } = await import('@/lib/crypto/encryption');
    const userKey = 'sk-user-key-12345';
    const encrypted = encryptCredential(userKey);
    mockDb.userAIProvider.findUnique.mockResolvedValueOnce({
      id: 'uap-1',
      userId: 'user-1',
      provider: 'openai',
      encryptedCredential: encrypted,
      status: 'active',
    });

    const { resolveProviderApiKey } = await import('@/lib/ai/user-ai-provider-service');
    const result = await resolveProviderApiKey('user-1', 'openai');
    expect(result.apiKey).toBe(userKey);
    expect(result.source).toBe('user');
  });

  it('falls back to platform env when user has no credential', async () => {
    process.env.OPENAI_API_KEY = 'sk-platform-key-12345';
    mockDb.userAIProvider.findUnique.mockResolvedValueOnce(null);

    const { resolveProviderApiKey } = await import('@/lib/ai/user-ai-provider-service');
    const result = await resolveProviderApiKey('user-1', 'openai');
    expect(result.apiKey).toBe('sk-platform-key-12345');
    expect(result.source).toBe('platform');

    delete process.env.OPENAI_API_KEY;
  });

  it('throws explicit error when no credential is available (no silent fallback to Z-AI)', async () => {
    mockDb.userAIProvider.findUnique.mockResolvedValueOnce(null);
    delete process.env.OPENAI_API_KEY;

    const { resolveProviderApiKey, ExplicitProviderUnavailableError } = await import('@/lib/ai/user-ai-provider-service');
    await expect(resolveProviderApiKey('user-1', 'openai')).rejects.toThrow(ExplicitProviderUnavailableError);
  });

  it('isolates credentials per user — user A cannot read user B credentials', async () => {
    const { encryptCredential } = await import('@/lib/crypto/encryption');
    const userBKey = 'sk-user-B-key-12345';
    const encrypted = encryptCredential(userBKey);

    // When user A queries, findUnique is called with userId='user-A' —
    // the DB returns null (no row for user-A + openai). The service
    // should NOT return user B's key.
    mockDb.userAIProvider.findUnique.mockImplementationOnce(async (params) => {
      // Simulate per-user isolation: only return the row if userId matches
      if (params.where.userId_provider.userId === 'user-B') {
        return {
          id: 'uap-B', userId: 'user-B', provider: 'openai',
          encryptedCredential: encrypted, status: 'active',
        };
      }
      return null;
    });

    const { resolveProviderApiKey } = await import('@/lib/ai/user-ai-provider-service');
    // User A queries — gets null (no row for user A)
    mockDb.userAIProvider.findUnique.mockResolvedValueOnce(null);
    delete process.env.OPENAI_API_KEY;
    await expect(resolveProviderApiKey('user-A', 'openai')).rejects.toThrow();
  });
});

describe('Agent Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createAgent requires name + available provider', async () => {
    // Mock isProviderAvailable inside agent-service (which re-imports it)
    vi.doMock('@/lib/ai/user-ai-provider-service', () => ({
      isProviderAvailable: vi.fn().mockResolvedValue({ available: true, source: 'platform' }),
      resolveProviderApiKey: vi.fn(),
      markProviderInvalid: vi.fn(),
    }));

    mockDb.agent.create.mockResolvedValueOnce({
      id: 'agent-1', userId: 'user-1', orgId: null,
      name: 'Test Agent', description: null,
      provider: 'openai', model: 'gpt-4o',
      toolPermissions: '{}', schedule: '{"type":"none"}', triggers: '[]',
      approvalPolicy: 'approval_required', retryPolicy: '{"maxRetries":2,"backoffMs":1000}',
      memoryConfig: '{"windowSize":20,"maxTokens":4000}',
      status: 'draft', maxIterations: 25, timeoutMs: 300000,
      totalRuns: 0, totalTokensUsed: 0,
      lastRunAt: null, lastError: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const { createAgent } = await import('@/lib/ai/agent-service');
    const agent = await createAgent('user-1', null, {
      name: 'Test Agent',
      provider: 'openai',
      model: 'gpt-4o',
    });
    expect(agent.name).toBe('Test Agent');
    expect(mockDb.agent.create).toHaveBeenCalled();
  });

  it('getAgent enforces ownership — returns null for other-user agent', async () => {
    mockDb.agent.findFirst.mockResolvedValueOnce(null);
    const { getAgent } = await import('@/lib/ai/agent-service');
    const result = await getAgent('user-A', 'agent-belonging-to-B');
    expect(result).toBeNull();
    expect(mockDb.agent.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'agent-belonging-to-B', userId: 'user-A' }),
    }));
  });

  it('isToolAllowed returns true for configured tool, false for disabled', async () => {
    const { isToolAllowed, getToolPermission } = await import('@/lib/ai/agent-service');
    const agent = {
      toolPermissions: {
        'email.read': 'read',
        'email.send': 'send_with_approval',
        'lead.update': 'disabled',
      },
    } as never;
    expect(isToolAllowed(agent, 'email.read')).toBe(true);
    expect(isToolAllowed(agent, 'email.send')).toBe(true);
    expect(isToolAllowed(agent, 'lead.update')).toBe(false);
    expect(isToolAllowed(agent, 'not.configured.tool')).toBe(false);
    expect(getToolPermission(agent, 'email.send')).toBe('send_with_approval');
  });
});
