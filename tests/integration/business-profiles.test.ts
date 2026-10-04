// ═══════════════════════════════════════════════════════════════════
// Integration Tests: Business Profiles API
// GET/POST /api/business-profiles + PUT/DELETE /api/business-profiles/[id]
// — ownership scoping, server-side plan limits (pro=3/elite=7 active),
// archive/activate behavior. DB + auth mocked — no real database.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockUser: Record<string, unknown> = { id: 'user_bp_1', plan: 'pro' };

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: vi.fn((request: unknown, handler: (user: unknown) => Promise<Response>) =>
    handler(mockUser)
  ),
}));

const findManyMock = vi.fn();
const countMock = vi.fn();
const createMock = vi.fn();
const findFirstMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    businessProfile: {
      findMany: (...args: unknown[]) => findManyMock(...args),
      count: (...args: unknown[]) => countMock(...args),
      create: (...args: unknown[]) => createMock(...args),
      findFirst: (...args: unknown[]) => findFirstMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
      delete: (...args: unknown[]) => deleteMock(...args),
    },
  },
}));

import { GET, POST } from '@/app/api/business-profiles/route';
import { PUT as PUT_ONE, DELETE as DELETE_ONE } from '@/app/api/business-profiles/[id]/route';

function makeRequest(method: 'GET' | 'POST', body?: unknown, url = 'http://localhost:3000/api/business-profiles') {
  return new Request(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

const profile = (overrides: Record<string, unknown>) => ({
  id: overrides.id ?? 'bp-1',
  userId: 'user_bp_1',
  name: 'Dental Outreach',
  status: 'active',
  industry: 'healthcare',
  ...overrides,
});

beforeEach(() => {
  mockUser = { id: 'user_bp_1', plan: 'pro' };
  findManyMock.mockReset().mockResolvedValue([]);
  countMock.mockReset().mockResolvedValue(0);
  createMock.mockReset().mockImplementation((args: { data: Record<string, unknown> }) => ({
    id: 'bp-new',
    status: 'active',
    ...args.data,
  }));
  findFirstMock.mockReset().mockResolvedValue(null);
  updateMock.mockReset().mockImplementation((args: { data: Record<string, unknown> }) => ({
    id: 'bp-1',
    status: 'active',
    ...args.data,
  }));
  deleteMock.mockReset().mockResolvedValue({});
});

describe('GET /api/business-profiles', () => {
  it('lists only the caller\u2019s profiles with plan limit info', async () => {
    findManyMock.mockResolvedValueOnce([profile({}), profile({ id: 'bp-2', status: 'archived' })]);
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(2);
    expect(data.activeCount).toBe(1);
    expect(data.planLimit).toBe(3); // pro
    // ownership scope enforced in the query
    expect(findManyMock.mock.calls[0][0].where).toEqual({ userId: 'user_bp_1' });
  });
});

describe('POST /api/business-profiles — plan limits (server-side)', () => {
  it('creates a profile when under the plan limit', async () => {
    countMock.mockResolvedValueOnce(2); // pro allows 3
    const res = await POST(makeRequest('POST', { name: 'SaaS Niche', industry: 'software' }));
    expect(res.status).toBe(201);
    expect(createMock.mock.calls[0][0].data.userId).toBe('user_bp_1');
    expect(createMock.mock.calls[0][0].data.name).toBe('SaaS Niche');
  });

  it('rejects the 4th active profile on Pro with PLAN_LIMIT_REACHED', async () => {
    countMock.mockResolvedValueOnce(3);
    const res = await POST(makeRequest('POST', { name: 'One too many' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe('PLAN_LIMIT_REACHED');
    expect(data.planLimit).toBe(3);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('enforces Elite limit of 7 active profiles', async () => {
    mockUser = { id: 'user_bp_1', plan: 'elite' };
    countMock.mockResolvedValueOnce(7);
    const res = await POST(makeRequest('POST', { name: 'Eighth' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.planLimit).toBe(7);
  });

  it('allows Free/Starter exactly one active profile', async () => {
    mockUser = { id: 'user_bp_1', plan: 'free' };
    countMock.mockResolvedValueOnce(0);
    const res = await POST(makeRequest('POST', { name: 'My only niche' }));
    expect(res.status).toBe(201);

    mockUser = { id: 'user_bp_1', plan: 'starter' };
    countMock.mockResolvedValueOnce(1);
    const res2 = await POST(makeRequest('POST', { name: 'Second niche' }));
    expect(res2.status).toBe(403);
  });

  it('rejects a profile without a name', async () => {
    const res = await POST(makeRequest('POST', { industry: 'software' }));
    expect(res.status).toBe(400);
  });

  it('counts only ACTIVE profiles toward the limit (archived do not block)', async () => {
    // 2 ACTIVE profiles (under the pro limit of 3) + 2 archived → allowed.
    countMock.mockResolvedValueOnce(2);
    findManyMock.mockResolvedValueOnce([profile({}), profile({ id: 'bp-3', status: 'archived' })]);
    const res = await POST(makeRequest('POST', { name: 'Third active' }));
    expect(res.status).toBe(201);
  });
});

describe('PUT /api/business-profiles/[id]', () => {
  it('updates fields with ownership enforced', async () => {
    findFirstMock.mockResolvedValueOnce(profile({}));
    const res = await PUT_ONE(
      makeRequest('PUT', { valueProposition: 'Fastest clinic onboarding' }, 'http://localhost:3000/api/business-profiles/bp-1'),
      { params: Promise.resolve({ id: 'bp-1' }) } as never
    );
    expect(res.status).toBe(200);
    expect(findFirstMock.mock.calls[0][0].where).toEqual({ id: 'bp-1', userId: 'user_bp_1' });
    expect(updateMock.mock.calls[0][0].data.valueProposition).toBe('Fastest clinic onboarding');
  });

  it('blocks re-activation when the active-profile limit is already used', async () => {
    findFirstMock.mockResolvedValueOnce(profile({ status: 'archived' }));
    countMock.mockResolvedValueOnce(3);
    const res = await PUT_ONE(
      makeRequest('PUT', { status: 'active' }, 'http://localhost:3000/api/business-profiles/bp-1'),
      { params: Promise.resolve({ id: 'bp-1' }) } as never
    );
    expect(res.status).toBe(403);
  });

  it('archives without touching the limit', async () => {
    findFirstMock.mockResolvedValueOnce(profile({}));
    const res = await PUT_ONE(
      makeRequest('PUT', { status: 'archived' }, 'http://localhost:3000/api/business-profiles/bp-1'),
      { params: Promise.resolve({ id: 'bp-1' }) } as never
    );
    expect(res.status).toBe(200);
    expect(countMock).not.toHaveBeenCalled();
  });

  it('returns 404 for another user\u2019s profile', async () => {
    findFirstMock.mockResolvedValueOnce(null);
    const res = await PUT_ONE(
      makeRequest('PUT', { name: 'Hijack' }, 'http://localhost:3000/api/business-profiles/bp-other'),
      { params: Promise.resolve({ id: 'bp-other' }) } as never
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/business-profiles/[id]', () => {
  it('deletes only the owner\u2019s profile', async () => {
    findFirstMock.mockResolvedValueOnce(profile({}));
    const res = await DELETE_ONE(
      makeRequest('DELETE', undefined, 'http://localhost:3000/api/business-profiles/bp-1'),
      { params: Promise.resolve({ id: 'bp-1' }) } as never
    );
    expect(res.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: 'bp-1' } });
  });

  it('returns 404 when the profile belongs to someone else', async () => {
    findFirstMock.mockResolvedValueOnce(null);
    const res = await DELETE_ONE(
      makeRequest('DELETE', undefined, 'http://localhost:3000/api/business-profiles/bp-other'),
      { params: Promise.resolve({ id: 'bp-other' }) } as never
    );
    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });
});

describe('entitlement config — business_profiles', () => {
  it('exposes the canonical plan limits (free=1, starter=1, pro=3, elite=7)', async () => {
    const { ENTITLEMENTS } = await import('@/lib/entitlement-service');
    expect(ENTITLEMENTS.free.business_profiles).toEqual({ limit: 1, enabled: true });
    expect(ENTITLEMENTS.starter.business_profiles).toEqual({ limit: 1, enabled: true });
    expect(ENTITLEMENTS.pro.business_profiles).toEqual({ limit: 3, enabled: true });
    expect(ENTITLEMENTS.elite.business_profiles).toEqual({ limit: 7, enabled: true });
  });
});
