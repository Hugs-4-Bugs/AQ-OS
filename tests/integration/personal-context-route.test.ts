// ═══════════════════════════════════════════════════════════════════
// Integration Tests: User Preference / Personal Business Context API
// GET/PUT /api/settings/personal-context — validation, persistence via
// UserSettings upsert, legacy (absent) row support.
// DB + auth mocked — no real database, no real AI.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockUser: Record<string, unknown> = { id: 'user_ctx_1', plan: 'pro' };

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: vi.fn((request: unknown, handler: (user: unknown) => Promise<Response>) =>
    handler(mockUser)
  ),
}));

const upsertMock = vi.fn();
const findUniqueMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    userSettings: {
      upsert: (...args: unknown[]) => upsertMock(...args),
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
    },
  },
}));

vi.mock('@/lib/observability/api-logger', () => ({
  withApiLogging: vi.fn((handler: unknown) => handler),
}));

import { GET, PUT } from '@/app/api/settings/personal-context/route';

function makeRequest(method: 'GET' | 'PUT', body?: unknown) {
  return new Request('http://localhost:3000/api/settings/personal-context', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  upsertMock.mockReset().mockResolvedValue({});
  findUniqueMock.mockReset().mockResolvedValue(null);
});

describe('GET /api/settings/personal-context', () => {
  it('returns an empty context when no settings row exists (legacy users)', async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ context: {} });
  });

  it('parses a stored personalContext JSON string', async () => {
    findUniqueMock.mockResolvedValueOnce({
      personalContext: JSON.stringify({ whatYouDo: 'I run an agency', goals: 'More B2B leads' }),
    });
    const res = await GET(makeRequest('GET'));
    const data = await res.json();
    expect(data.context).toEqual({ whatYouDo: 'I run an agency', goals: 'More B2B leads' });
  });

  it('returns {} (not 500) for corrupted stored JSON', async () => {
    findUniqueMock.mockResolvedValueOnce({ personalContext: '}}}corrupted{{{' });
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    expect((await res.json()).context).toEqual({});
  });
});

describe('PUT /api/settings/personal-context', () => {
  it('persists a valid context via upsert (update path)', async () => {
    const res = await PUT(makeRequest('PUT', { context: { whatYouDo: 'SaaS founder' } }));
    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const call = upsertMock.mock.calls[0][0] as {
      where: { userId: string };
      update: { personalContext: string };
      create: { userId: string; personalContext: string };
    };
    expect(call.where.userId).toBe('user_ctx_1');
    expect(JSON.parse(call.update.personalContext)).toEqual({ whatYouDo: 'SaaS founder' });
    expect(JSON.parse(call.create.personalContext)).toEqual({ whatYouDo: 'SaaS founder' });
  });

  it('creates the settings row when it does not exist yet', async () => {
    const res = await PUT(makeRequest('PUT', { context: { goals: 'x' } }));
    expect(res.status).toBe(200);
    const call = upsertMock.mock.calls[0][0] as { create: { userId: string } };
    expect(call.create.userId).toBe('user_ctx_1');
  });

  it('stores null when the submitted context is empty (clears personalization)', async () => {
    const res = await PUT(makeRequest('PUT', { context: {} }));
    expect(res.status).toBe(200);
    const call = upsertMock.mock.calls[0][0] as { update: { personalContext: string | null } };
    expect(call.update.personalContext).toBeNull();
  });

  it('rejects over-limit fields with 400 + details, without writing', async () => {
    const res = await PUT(makeRequest('PUT', { context: { goals: 'x'.repeat(501) } }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.details.join(' ')).toContain('"goals"');
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('rejects non-string field values with 400, without writing', async () => {
    const res = await PUT(makeRequest('PUT', { context: { goals: 42 } }));
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('strips unknown fields before persisting', async () => {
    const res = await PUT(
      makeRequest('PUT', { context: { whatYouDo: 'ok', injected: '<script>' } })
    );
    expect(res.status).toBe(200);
    const call = upsertMock.mock.calls[0][0] as { update: { personalContext: string } };
    const stored = JSON.parse(call.update.personalContext) as Record<string, unknown>;
    expect(stored).toEqual({ whatYouDo: 'ok' });
    expect(stored.injected).toBeUndefined();
  });

  it('accepts top-level context object (body.context ?? body)', async () => {
    const res = await PUT(makeRequest('PUT', { whatYouDo: 'direct body' }));
    expect(res.status).toBe(200);
    const call = upsertMock.mock.calls[0][0] as { update: { personalContext: string } };
    expect(JSON.parse(call.update.personalContext)).toEqual({ whatYouDo: 'direct body' });
  });
});
