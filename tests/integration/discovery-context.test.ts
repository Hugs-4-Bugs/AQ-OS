// ═══════════════════════════════════════════════════════════════════
// Integration Tests: Discover Page Context / Campaign Selector
// POST /api/leads/discover with body.context — campaign ownership
// verification, instruction merge, business-context mode, 'none'
// passthrough, hard-criteria enforcement on merged text.
// DB + auth + entitlement usage mocked — no real DB / credits / AI.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockUser: Record<string, unknown> = { id: 'user_disc_1', plan: 'pro', orgId: null };

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: vi.fn((request: unknown, handler: (user: unknown) => Promise<Response>) =>
    handler(mockUser)
  ),
}));

const campaignFindFirstMock = vi.fn();
const settingsFindUniqueMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    acquisitionCampaign: {
      findFirst: (...args: unknown[]) => campaignFindFirstMock(...args),
    },
    userSettings: {
      findUnique: (...args: unknown[]) => settingsFindUniqueMock(...args),
    },
  },
}));

const startDiscoveryJobMock = vi.fn();

vi.mock('@/lib/lead-discovery-service', () => ({
  startDiscoveryJob: (...args: unknown[]) => startDiscoveryJobMock(...args),
}));

vi.mock('@/lib/entitlement-service', () => ({
  getEntitlements: vi.fn(() => ({ lead_discovery: { enabled: true, limit: null } })),
  ENTITLEMENTS: {},
}));

vi.mock('@/lib/entitlement-middleware', () => ({
  getFeatureUsage: vi.fn().mockResolvedValue(0),
}));

import { POST } from '@/app/api/leads/discover/route';

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost:3000/api/leads/discover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const BASE_BODY = { niche: 'dentist', source: 'ai_search', country: 'India' };

beforeEach(() => {
  campaignFindFirstMock.mockReset();
  settingsFindUniqueMock.mockReset();
  mockUser = { id: 'user_disc_1', plan: 'pro', orgId: null };
  startDiscoveryJobMock.mockReset().mockResolvedValue({
    jobId: 'job_1',
    status: 'pending',
    message: 'started',
  });
});

function jobArgs() {
  return startDiscoveryJobMock.mock.calls[0][1] as Record<string, unknown>;
}

describe('POST /api/leads/discover — context selector', () => {
  it('legacy body (no context) → context null, requirements untouched', async () => {
    const res = await POST(makeRequest({ ...BASE_BODY, requirements: 'family clinics only' }));
    expect(res.status).toBe(202);
    const args = jobArgs();
    expect(args.context).toBeNull();
    expect(args.requirements).toBe('family clinics only');
    expect(startDiscoveryJobMock).toHaveBeenCalledTimes(1);
  });

  it('context.mode "none" → context null, unchanged behaviour', async () => {
    const res = await POST(makeRequest({ ...BASE_BODY, context: { mode: 'none' } }));
    expect(res.status).toBe(202);
    expect(jobArgs().context).toBeNull();
  });

  it('campaign mode: owned campaign resolved, instructions merged into requirements', async () => {
    campaignFindFirstMock.mockResolvedValueOnce({
      id: 'camp_1',
      niche: 'wellness clinics',
      country: 'India',
      city: 'Pune',
      customInstructions: 'Focus on premium segments. 10 to 50 employees.',
    });
    const res = await POST(
      makeRequest({ ...BASE_BODY, context: { mode: 'campaign', campaignId: 'camp_1' } })
    );
    expect(res.status).toBe(202);
    const args = jobArgs();
    expect(args.context).toMatchObject({
      mode: 'campaign',
      campaignId: 'camp_1',
      campaignNiche: 'wellness clinics',
      instructions: 'Focus on premium segments. 10 to 50 employees.',
    });
    expect(args.requirements).toBe('Focus on premium segments. 10 to 50 employees.');
    // Ownership check scoped to the authenticated user:
    const where = (campaignFindFirstMock.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ id: 'camp_1', userId: 'user_disc_1' });
  });

  it('campaign mode: campaign instructions carrying hard criteria ARE enforced', async () => {
    campaignFindFirstMock.mockResolvedValueOnce({
      id: 'camp_1',
      niche: null,
      customInstructions: 'Only companies with 10 to 50 employees.',
    });
    await POST(makeRequest({ ...BASE_BODY, context: { mode: 'campaign', campaignId: 'camp_1' } }));
    const criteria = jobArgs().criteria as { employeeMin?: number; employeeMax?: number };
    expect(criteria.employeeMin).toBe(10);
    expect(criteria.employeeMax).toBe(50);
  });

  it('campaign mode: user requirements AND campaign instructions both kept', async () => {
    campaignFindFirstMock.mockResolvedValueOnce({
      id: 'camp_1',
      niche: null,
      customInstructions: 'Premium focus',
    });
    await POST(
      makeRequest({
        ...BASE_BODY,
        requirements: 'family clinics',
        context: { mode: 'campaign', campaignId: 'camp_1' },
      })
    );
    expect(jobArgs().requirements).toBe('family clinics | Premium focus');
  });

  it('campaign mode: foreign / non-existent campaign → 400, no job started', async () => {
    campaignFindFirstMock.mockResolvedValueOnce(null);
    const res = await POST(
      makeRequest({ ...BASE_BODY, context: { mode: 'campaign', campaignId: 'camp_other_user' } })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('not found');
    expect(startDiscoveryJobMock).not.toHaveBeenCalled();
  });

  it('campaign mode: missing campaignId → 400, no job started', async () => {
    const res = await POST(makeRequest({ ...BASE_BODY, context: { mode: 'campaign' } }));
    expect(res.status).toBe(400);
    expect(startDiscoveryJobMock).not.toHaveBeenCalled();
  });

  it('business mode: composes instructions from businessDescription + personalContext', async () => {
    settingsFindUniqueMock.mockResolvedValueOnce({
      businessDescription: 'We build booking websites for clinics',
      personalContext: JSON.stringify({
        targetAudience: 'clinic owners in Pune',
        goals: '10 new clients',
      }),
    });
    const res = await POST(makeRequest({ ...BASE_BODY, context: { mode: 'business' } }));
    expect(res.status).toBe(202);
    const args = jobArgs();
    expect(args.context).toMatchObject({ mode: 'business' });
    expect(args.requirements).toContain('User business: We build booking websites for clinics');
    expect(args.requirements).toContain('clinic owners in Pune');
    expect(args.requirements).toContain('10 new clients');
  });

  it('business mode: no settings row → context still persisted with no instructions', async () => {
    settingsFindUniqueMock.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ ...BASE_BODY, context: { mode: 'business' } }));
    expect(res.status).toBe(202);
    expect(jobArgs().context).toEqual({ mode: 'business', instructions: undefined });
    expect(jobArgs().requirements).toBeUndefined();
  });

  it('invalid context.mode → 400', async () => {
    const res = await POST(makeRequest({ ...BASE_BODY, context: { mode: 'hacker' } }));
    expect(res.status).toBe(400);
    expect(startDiscoveryJobMock).not.toHaveBeenCalled();
  });

  it('failed job start still surfaces the failure (entitlements/credits untouched)', async () => {
    startDiscoveryJobMock.mockResolvedValueOnce({
      jobId: '',
      status: 'failed',
      message: 'Source not configured',
    });
    const res = await POST(makeRequest(BASE_BODY));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Source not configured');
  });
});
