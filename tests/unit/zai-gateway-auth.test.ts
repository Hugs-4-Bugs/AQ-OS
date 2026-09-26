// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Unit Tests: Z-AI Gateway X-Token Authentication
//
// Regression tests for the 2026-09-26 "missing X-Token header" RCA:
//  1. The X-Token header IS attached when the credential source
//     (.z-ai-config 'token' field) provides it.
//  2. Missing/blank token → fast, actionable CONFIGURATION_ERROR and
//     NO doomed request is sent.
//  3. Invalid token (gateway 401) → actionable AUTH_ERROR; existing
//     retry behavior is preserved (3 attempts for maxRetries=2).
//  4. Provider fallback still works when the gateway rejects auth.
//  5. Credential values are NEVER leaked into errors or results.
//
// These tests stub global fetch and point the SDK's config resolution
// at temp fixture dirs (cwd priority) — no network, no secrets.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

vi.mock('@/lib/db', () => ({
  db: {
    usageTracking: { upsert: vi.fn().mockResolvedValue({}) },
  },
}));

import { readZaiGatewayConfigStatus } from '@/lib/ai/zai-gateway-config';
import { executeAICompletion } from '@/lib/ai/ai-provider';

// Fake fixture credentials — these are NOT real secrets.
const FAKE = {
  baseUrl: 'https://gateway.invalid/v1',
  apiKey: 'test-fake-api-key-not-a-secret',
  token: 'test-fake-token-not-a-secret',
};

const TMP_ROOT = '/home/z/my-project/.test-tmp/zai-gateway-auth';
let originalCwd = '';

function writeConfig(dir: string, cfg: Record<string, string> | null): string {
  const full = path.join(TMP_ROOT, dir);
  fs.mkdirSync(full, { recursive: true });
  if (cfg !== null) {
    fs.writeFileSync(path.join(full, '.z-ai-config'), JSON.stringify(cfg), 'utf-8');
  }
  return full;
}

/** Candidate paths are FILE paths (mirroring the SDK) — e.g. <dir>/.z-ai-config */
function cfgFile(dir: string): string {
  return path.join(TMP_ROOT, dir, '.z-ai-config');
}

interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
}

function makeResponse(status: number, body: unknown) {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (k: string) => (String(k).toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    text: async () => text,
    json: async () => body,
  };
}

function stubFetch(handler: (url: string) => { status: number; body: unknown }) {
  const captured: CapturedRequest[] = [];
  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    const headers = Object.fromEntries(
      Object.entries((init?.headers as Record<string, string>) || {}).map(([k, v]) => [k, String(v)])
    );
    captured.push({ url: String(url), headers });
    const { status, body } = handler(String(url));
    return makeResponse(status, body);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { captured, fetchMock };
}

beforeAll(() => {
  originalCwd = process.cwd();
  fs.mkdirSync(TMP_ROOT, { recursive: true });
});

afterAll(() => {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

beforeEach(() => {
  vi.stubEnv('HOME', TMP_ROOT);
  vi.stubEnv('OPENAI_API_KEY', '');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('OPENROUTER_API_KEY', '');
  vi.stubEnv('AI_LOCAL_ENDPOINT', '');
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ═══════════════════════════════════════════════════════════════════
// A. Credential status helper (read-only, presence booleans only)
// ═══════════════════════════════════════════════════════════════════

describe('readZaiGatewayConfigStatus', () => {
  it('resolves a valid config and reports token presence WITHOUT values', () => {
    const p = writeConfig('valid', { baseUrl: FAKE.baseUrl, apiKey: FAKE.apiKey, token: FAKE.token });
    const status = readZaiGatewayConfigStatus([cfgFile('valid')]);
    expect(status.resolved).toBe(true);
    expect(status.path).toBe(cfgFile('valid'));
    expect(status.hasBaseUrl).toBe(true);
    expect(status.hasApiKey).toBe(true);
    expect(status.hasToken).toBe(true);
    // Security: no credential values may leak through the status object
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain(FAKE.apiKey);
    expect(serialized).not.toContain(FAKE.token);
  });

  it('reports hasToken=false when the token field is missing', () => {
    const p = writeConfig('no-token', { baseUrl: FAKE.baseUrl, apiKey: FAKE.apiKey });
    const status = readZaiGatewayConfigStatus([cfgFile('no-token')]);
    expect(status.resolved).toBe(true);
    expect(status.path).toBe(cfgFile('no-token'));
    expect(status.hasToken).toBe(false);
  });

  it('treats a blank token as missing', () => {
    const p = writeConfig('blank-token', { baseUrl: FAKE.baseUrl, apiKey: FAKE.apiKey, token: '   ' });
    const status = readZaiGatewayConfigStatus([cfgFile('blank-token')]);
    expect(status.hasToken).toBe(false);
  });

  it('skips invalid JSON and missing files, then reports not-resolved', () => {
    const badJson = path.join(TMP_ROOT, 'badjson');
    fs.mkdirSync(badJson, { recursive: true });
    fs.writeFileSync(path.join(badJson, '.z-ai-config'), '{not valid json', 'utf-8');
    const missing = path.join(TMP_ROOT, 'does-not-exist', '.z-ai-config');
    const status = readZaiGatewayConfigStatus([cfgFile('badjson'), missing]);
    expect(status.resolved).toBe(false);
    expect(status.reason).toContain(badJson);
    expect(status.reason).toContain(missing);
  });

  it('applies the SDK validity rule: baseUrl+apiKey required, first valid candidate wins', () => {
    const invalid = writeConfig('invalid-no-key', { baseUrl: FAKE.baseUrl });
    const valid = writeConfig('valid-second', { baseUrl: FAKE.baseUrl, apiKey: FAKE.apiKey, token: FAKE.token });
    const status = readZaiGatewayConfigStatus([cfgFile('invalid-no-key'), cfgFile('valid-second')]);
    expect(status.resolved).toBe(true);
    expect(status.path).toBe(cfgFile('valid-second')); // first VALID candidate wins, not the first listed
  });
});

// ═══════════════════════════════════════════════════════════════════
// B. callZAI header construction via executeAICompletion
// ═══════════════════════════════════════════════════════════════════

describe('callZAI X-Token authentication', () => {
  it('includes the X-Token header from the credential source on the outgoing request', async () => {
    const dir = writeConfig('with-token', {
      baseUrl: FAKE.baseUrl,
      apiKey: FAKE.apiKey,
      token: FAKE.token,
      chatId: 'chat-test',
      userId: 'user-test',
    });
    process.chdir(dir);
    const { captured } = stubFetch(() => ({
      status: 200,
      body: {
        choices: [{ message: { content: 'OK' } }],
        usage: { total_tokens: 3 },
        model: 'glm-4-plus',
      },
    }));

    const result = await executeAICompletion(
      { messages: [{ role: 'user', content: 'Reply with exactly: OK' }], config: { provider: 'z-ai' } },
      'test-user',
      'test_action'
    );

    expect(result.success).toBe(true);
    expect(result.provider).toBe('z-ai');
    expect(captured.length).toBe(1);
    expect(captured[0].url).toBe(`${FAKE.baseUrl}/chat/completions`);
    // THE fix under test: X-Token must be present, sourced from config token
    expect(captured[0].headers['X-Token']).toBe(FAKE.token);
    expect(captured[0].headers['Authorization']).toBe(`Bearer ${FAKE.apiKey}`);
    expect(captured[0].headers['Content-Type']).toBe('application/json');
  });

  it('fails fast with an actionable CONFIGURATION_ERROR and sends NO request when token is missing', async () => {
    const dir = writeConfig('missing-token', { baseUrl: FAKE.baseUrl, apiKey: FAKE.apiKey });
    process.chdir(dir);
    const { captured } = stubFetch(() => ({ status: 200, body: {} }));

    const result = await executeAICompletion(
      { messages: [{ role: 'user', content: 'hi' }], config: { provider: 'z-ai' } },
      'test-user',
      'test_action'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('CONFIGURATION_ERROR');
    expect(result.error).toContain("'token' field is missing");
    expect(result.error).toContain(dir); // names the exact file to fix
    // No doomed request may leave the process
    expect(captured.length).toBe(0);
    // Security: credential values must not leak into the error
    expect(result.error).not.toContain(FAKE.apiKey);
  });

  it('translates gateway 401 into an actionable AUTH_ERROR while preserving retry behavior', async () => {
    const dir = writeConfig('invalid-token', {
      baseUrl: FAKE.baseUrl,
      apiKey: FAKE.apiKey,
      token: FAKE.token,
    });
    process.chdir(dir);
    const { captured } = stubFetch(() => ({
      status: 401,
      body: { error: 'missing X-Token header' },
    }));

    const result = await executeAICompletion(
      { messages: [{ role: 'user', content: 'hi' }], config: { provider: 'z-ai' } },
      'test-user',
      'test_action'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('AUTH_ERROR');
    expect(result.error).toContain('401');
    expect(result.error).toContain(dir);
    expect(result.error).not.toContain(FAKE.token);
    // Existing retry behavior preserved: maxRetries=2 → 3 outgoing attempts
    expect(captured.length).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════
// C. Provider fallback integrity
// ═══════════════════════════════════════════════════════════════════

describe('provider fallback integrity', () => {
  it('falls back to OpenAI when the z-ai gateway rejects authentication', async () => {
    const dir = writeConfig('fallback-gateway', {
      baseUrl: FAKE.baseUrl,
      apiKey: FAKE.apiKey,
      token: FAKE.token,
    });
    process.chdir(dir);
    vi.stubEnv('OPENAI_API_KEY', 'test-fake-openai-key-not-a-secret');
    const { captured } = stubFetch((url) => {
      if (url.startsWith(FAKE.baseUrl)) return { status: 401, body: { error: 'missing X-Token header' } };
      if (url.startsWith('https://api.openai.com/v1')) {
        return {
          status: 200,
          body: { choices: [{ message: { content: 'OPENAI_OK' } }], usage: { total_tokens: 4 }, model: 'gpt-4o' },
        };
      }
      return { status: 500, body: { error: 'unexpected endpoint' } };
    });

    const result = await executeAICompletion(
      { messages: [{ role: 'user', content: 'hi' }], config: { provider: 'z-ai' } },
      'test-user',
      'test_action'
    );

    expect(result.success).toBe(true);
    expect(result.provider).toBe('openai');
    expect(result.content).toBe('OPENAI_OK');
    const zaiCalls = captured.filter((c) => c.url.startsWith(FAKE.baseUrl));
    const openaiCalls = captured.filter((c) => c.url.startsWith('https://api.openai.com/v1'));
    expect(zaiCalls.length).toBe(3); // z-ai exhausted its retries first
    expect(openaiCalls.length).toBe(1);
    expect(zaiCalls[0].headers['X-Token']).toBe(FAKE.token); // header still attached during fallback attempts
  });
});
