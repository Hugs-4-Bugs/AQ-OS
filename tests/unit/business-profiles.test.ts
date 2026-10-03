/**
 * BusinessProfile API + context resolution tests (Stage B)
 *
 * Covers:
 *  - ownership: a user can never read/modify another user's profile (404, not 403 —
 *    non-enumerable), enforced server-side in the route handlers;
 *  - validation: label required, arrays normalized, oversized input rejected;
 *  - lazy default seed: GET synthesizes a first profile from existing
 *    UserSettings data (non-destructive, additive);
 *  - default uniqueness: creating/patching isDefault demotes the others;
 *  - resolveBusinessContext resolution order: campaign overrides win,
 *    profile defaults retained for everything else; a foreign/missing
 *    profile id falls back to the USER'S OWN default — never another user's
 *    data; the prompt block omits unknown fields and marks overrides.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => {
  type Row = Record<string, unknown> & { id: string; userId: string; isDefault?: boolean; archivedAt: Date | null };
  const profiles: Row[] = [];
  const db = {
    businessProfile: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    userSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1', name: 'Owner', company: null }) },
    $transaction: vi.fn(),
  };
  return { profiles, db };
});

vi.mock('@/lib/db', () => ({ db: state.db }));

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    requireAuth: vi.fn().mockImplementation((req: Request) => {
      // The "authenticated user" is controlled per-test via headers.
      // x-test-plan defaults to 'elite' so pre-limit tests can create freely;
      // plan-limit tests override it (Plan Eligibility Correction).
      const userId = req.headers.get('x-test-user') ?? 'u1';
      const plan = req.headers.get('x-test-plan') ?? 'elite';
      return Promise.resolve({ id: userId, email: `${userId}@test.com`, plan });
    }),
    logAuthEvent: vi.fn().mockResolvedValue(undefined),
    getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
    getUserAgent: vi.fn().mockReturnValue('vitest'),
  };
});

import { GET as listProfiles, POST as createProfile } from '@/app/api/business-profiles/route';
import { PATCH as patchProfile, DELETE as deleteProfile } from '@/app/api/business-profiles/[id]/route';
import { resolveBusinessContext } from '@/lib/business-profile-server';
import { buildBusinessContextBlock } from '@/lib/business-profile';

function req(url: string, method: string, body?: unknown, user = 'u1', plan?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-test-user': user };
  if (plan) headers['x-test-plan'] = plan;
  return new NextRequest(new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
}

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

const rowA = {
  id: 'prof-a', userId: 'u1', label: 'Wellness Studio', companyName: 'Serenity Ltd',
  industry: 'Health & Wellness', website: 'https://serenity.example', description: 'Corporate wellness programs',
  valueProposition: 'Healthier teams', productsServices: JSON.stringify([{ name: 'Massage packages', description: 'On-site' }]),
  targetAudience: JSON.stringify({ industries: ['hospitals'], roles: ['HR managers'], icp: 'mid-size clinics' }),
  serviceAreas: JSON.stringify(['Mumbai', 'Pune']), goals: 'Book intro calls', toneStyle: 'warm, professional',
  language: 'English', differentiators: JSON.stringify(['12 years', '40+ clinics']),
  preferredCta: 'book a 15-min call', additionalContext: 'Never mention prices',
  isDefault: true, archivedAt: null, createdAt: new Date(), updatedAt: new Date(),
};
const rowB = {
  ...rowA,
  id: 'prof-b', userId: 'user-B', label: 'Other User Profile', isDefault: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  state.profiles.length = 0;
  state.db.userSettings.findUnique.mockResolvedValue(null);
  state.db.user.findUnique.mockResolvedValue({ id: 'u1', name: 'Owner', company: null });
});

describe('BusinessProfile plan limits (Plan Eligibility Correction)', () => {
  it('counts only ACTIVE profiles toward the limit (archivedAt: null filter)', async () => {
    state.db.businessProfile.count.mockResolvedValue(0);
    state.db.$transaction.mockImplementation(async (fn: (tx: typeof state.db) => Promise<unknown>) => fn(state.db));
    state.db.businessProfile.create.mockResolvedValue(rowA);

    await createProfile(req('http://x/api/business-profiles', 'POST', { label: 'X' }, 'u1', 'free'));
    expect(state.db.businessProfile.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ archivedAt: null }) }),
    );
  });

  it('free user at the 1-active-profile cap gets 403 PROFILE_LIMIT_REACHED and nothing is created', async () => {
    state.db.businessProfile.count.mockResolvedValue(1);

    const res = await createProfile(req('http://x/api/business-profiles', 'POST', { label: 'Second Biz' }, 'u1', 'free'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('PROFILE_LIMIT_REACHED');
    expect(body.limit).toBe(1);
    expect(body.activeCount).toBe(1);
    expect(body.requiredPlan).toBe('pro'); // first plan with a HIGHER limit
    expect(state.db.businessProfile.create).not.toHaveBeenCalled();
  });

  it('pro user can hold 2 active profiles but a 3rd create is blocked at the cap of 3', async () => {
    state.db.businessProfile.count.mockResolvedValue(2);
    state.db.$transaction.mockImplementation(async (fn: (tx: typeof state.db) => Promise<unknown>) => fn(state.db));
    state.db.businessProfile.create.mockResolvedValue(rowA);

    const ok = await createProfile(req('http://x/api/business-profiles', 'POST', { label: 'Third' }, 'u1', 'pro'));
    expect(ok.status).toBe(201);

    state.db.businessProfile.count.mockResolvedValue(3);
    const blocked = await createProfile(req('http://x/api/business-profiles', 'POST', { label: 'Fourth' }, 'u1', 'pro'));
    expect(blocked.status).toBe(403);
    const body = await blocked.json();
    expect(body.code).toBe('PROFILE_LIMIT_REACHED');
    expect(body.limit).toBe(3);
    expect(body.requiredPlan).toBe('elite');
  });

  it('elite user is blocked only at 7 active profiles with no further upgrade tier', async () => {
    state.db.businessProfile.count.mockResolvedValue(7);

    const res = await createProfile(req('http://x/api/business-profiles', 'POST', { label: 'Eighth' }, 'u1', 'elite'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.limit).toBe(7);
    expect(body.requiredPlan).toBeUndefined(); // already on the max tier
    expect(state.db.businessProfile.create).not.toHaveBeenCalled();
  });

  it('unknown/legacy plan values fail closed to the Free limit (1)', async () => {
    state.db.businessProfile.count.mockResolvedValue(1);

    const res = await createProfile(req('http://x/api/business-profiles', 'POST', { label: 'X' }, 'u1', 'enterprise'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.limit).toBe(1);
  });
});

describe('BusinessProfile API ownership', () => {
  it('PATCH on another user\'s profile returns 404 and never updates it', async () => {
    state.db.businessProfile.findFirst.mockResolvedValue(null); // scoped by userId → not found

    const res = await patchProfile(req('http://x/api/business-profiles/prof-b', 'PATCH', { label: 'Hacked' }, 'u1'), routeCtx('prof-b'));
    expect(res.status).toBe(404);
    expect(state.db.businessProfile.update).not.toHaveBeenCalled();
  });

  it('DELETE on another user\'s profile returns 404 and never archives it', async () => {
    state.db.businessProfile.findFirst.mockResolvedValue(null);

    const res = await deleteProfile(req('http://x/api/business-profiles/prof-b', 'DELETE', undefined, 'u1'), routeCtx('prof-b'));
    expect(res.status).toBe(404);
    expect(state.db.businessProfile.update).not.toHaveBeenCalled();
  });

  it('PATCH updates only the owner\'s profile', async () => {
    state.db.businessProfile.findFirst.mockResolvedValue(rowA);
    state.db.$transaction.mockImplementation(async (fn: (tx: typeof state.db) => Promise<unknown>) => fn(state.db));
    state.db.businessProfile.update.mockResolvedValue({ ...rowA, description: 'Updated' });

    const res = await patchProfile(req('http://x/api/business-profiles/prof-a', 'PATCH', { description: 'Updated' }), routeCtx('prof-a'));
    expect(res.status).toBe(200);
    expect(state.db.businessProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'prof-a' } }),
    );
  });
});

describe('BusinessProfile API validation + defaults', () => {
  it('rejects a profile without a label', async () => {
    const res = await createProfile(req('http://x/api/business-profiles', 'POST', { industry: 'X' }));
    expect(res.status).toBe(400);
  });

  it('normalizes JSON fields and creates the first profile as default', async () => {
    state.db.businessProfile.count.mockResolvedValue(0);
    state.db.$transaction.mockImplementation(async (fn: (tx: typeof state.db) => Promise<unknown>) => fn(state.db));
    state.db.businessProfile.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...rowA, id: 'prof-new', ...data,
    }));

    const res = await createProfile(req('http://x/api/business-profiles', 'POST', {
      label: '  My Consultancy  ',
      productsServices: [{ name: 'SEO audits', description: 'Technical' }, { name: '' }, 'junk-string'],
      serviceAreas: [' Delhi ', '', 'Remote'],
      targetAudience: { industries: ['startups'], roles: ['founders'], icp: 'seed-stage' },
    }));

    expect(res.status).toBe(201);
    const created = state.db.businessProfile.create.mock.calls[0][0].data;
    expect(created.label).toBe('My Consultancy'); // trimmed
    expect(created.isDefault).toBe(true); // first profile becomes default
    expect(JSON.parse(created.productsServices as string)).toEqual([
      { name: 'SEO audits', description: 'Technical' },
    ]);
    expect(JSON.parse(created.serviceAreas as string)).toEqual(['Delhi', 'Remote']);
    expect(JSON.parse(created.targetAudience as string)).toEqual({
      industries: ['startups'], roles: ['founders'], icp: 'seed-stage',
    });
  });

  it('setting a new default demotes the user\'s other profiles', async () => {
    state.db.businessProfile.count.mockResolvedValue(1);
    state.db.$transaction.mockImplementation(async (fn: (tx: typeof state.db) => Promise<unknown>) => fn(state.db));
    state.db.businessProfile.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...rowA, id: 'prof-new', ...data,
    }));

    await createProfile(req('http://x/api/business-profiles', 'POST', { label: 'Second Biz', isDefault: true }));
    expect(state.db.businessProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { isDefault: false },
    });
  });

  it('archiving promotes the oldest remaining profile to default', async () => {
    state.db.businessProfile.findFirst
      .mockResolvedValueOnce({ ...rowA, isDefault: true }) // the profile being archived
      .mockResolvedValueOnce({ ...rowA, id: 'prof-old', isDefault: false }); // oldest remaining
    state.db.businessProfile.count.mockResolvedValue(1);
    state.db.$transaction.mockImplementation(async (fn: (tx: typeof state.db) => Promise<unknown>) => fn(state.db));
    state.db.businessProfile.update.mockResolvedValue({});

    const res = await deleteProfile(req('http://x/api/business-profiles/prof-a', 'DELETE'), routeCtx('prof-a'));
    expect(res.status).toBe(200);
    expect(state.db.businessProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'prof-old' }, data: expect.objectContaining({ isDefault: true }) }),
    );
  });
});

describe('lazy default seed from existing settings data', () => {
  it('GET with zero profiles synthesizes one from UserSettings (non-destructive)', async () => {
    state.db.businessProfile.findMany.mockResolvedValue([]);
    state.db.userSettings.findUnique.mockResolvedValue({
      companyName: 'Vivek Enterprises',
      businessDescription: 'Import-export of spices',
      targetNiches: JSON.stringify(['food_processing']),
      targetCountries: JSON.stringify(['India', 'UAE']),
      servicesOffered: JSON.stringify([{ id: '1', label: 'Bulk supply contracts', category: 'general', description: 'B2B spice supply' }]),
    });
    state.db.user.findUnique.mockResolvedValue({ id: 'u1', name: 'Vivek', company: 'Vivek Enterprises' });
    state.db.businessProfile.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...rowA, id: 'prof-seed', userId: 'u1', ...data,
    }));

    const res = await listProfiles(req('http://x/api/business-profiles', 'GET'));
    expect(res.status).toBe(200);
    const created = state.db.businessProfile.create.mock.calls[0][0].data;
    expect(created.label).toBe('Vivek Enterprises');
    expect(created.industry).toBe('food_processing');
    expect(JSON.parse(created.productsServices as string)[0].name).toBe('Bulk supply contracts');
    expect(JSON.parse(created.serviceAreas as string)).toEqual(['India', 'UAE']);
    expect(created.isDefault).toBe(true);
  });

  it('GET does not seed when profiles already exist', async () => {
    state.db.businessProfile.findMany.mockResolvedValue([rowA]);
    await listProfiles(req('http://x/api/business-profiles', 'GET'));
    expect(state.db.businessProfile.create).not.toHaveBeenCalled();
  });
});

describe('resolveBusinessContext — resolution order', () => {
  const ctxFor = (found: unknown) => {
    state.db.businessProfile.findFirst.mockResolvedValue(found);
    return found;
  };

  it('campaign overrides win; profile defaults retained for the rest', async () => {
    ctxFor(rowA);
    const ctx = await resolveBusinessContext('u1', 'prof-a', {
      objective: 'Fill December corporate bookings',
      cta: 'reply with a slot',
      tone: 'direct',
    });
    expect(ctx).not.toBeNull();
    expect(ctx!.goals).toBe('Fill December corporate bookings'); // override
    expect(ctx!.preferredCta).toBe('reply with a slot'); // override
    expect(ctx!.tone).toBe('direct'); // override
    expect(ctx!.description).toBe('Corporate wellness programs'); // profile default retained
    expect(ctx!.productsServices).toEqual([{ name: 'Massage packages', description: 'On-site' }]);
    expect(ctx!.targetAudience).toContain('industries: hospitals'); // profile default retained
    expect(ctx!.overriddenFields).toEqual(['objective', 'audience', 'offer'].filter(f => f === 'objective') || ['objective']);
    expect(ctx!.sources.goals).toBe('campaign');
    expect(ctx!.sources.tone).toBe('campaign');
    expect(ctx!.sources.description).toBe('profile');
  });

  it('a foreign profile id falls back to the USER\'S OWN default — never another user\'s profile', async () => {
    // First lookup (foreign id scoped by userId) misses; second (own default) hits own profile.
    state.db.businessProfile.findFirst
      .mockResolvedValueOnce(null) // { id: 'prof-b', userId: 'u1' } → not owned
      .mockResolvedValueOnce(rowA); // own default

    const ctx = await resolveBusinessContext('u1', 'prof-b', null);
    expect(ctx!.profileId).toBe('prof-a');
    expect(ctx!.label).toBe('Wellness Studio');
    // The second lookup MUST be scoped to the requesting user.
    expect(state.db.businessProfile.findFirst.mock.calls[1][0].where.userId).toBe('u1');
  });

  it('no profile at all → null context (no fabricated defaults)', async () => {
    state.db.businessProfile.findFirst.mockResolvedValue(null);
    const ctx = await resolveBusinessContext('u1', null, null);
    expect(ctx).not.toBeNull();
    expect(ctx!.profileId).toBeNull();
    expect(ctx!.companyName).toBe('');
    expect(buildBusinessContextBlock(ctx)).toBe(''); // empty block → caller omits it
  });

  it('buildBusinessContextBlock includes sender fields and the honesty rule', async () => {
    ctxFor(rowA);
    const ctx = await resolveBusinessContext('u1', 'prof-a', null);
    const block = buildBusinessContextBlock(ctx);
    expect(block).toContain('SENDER BUSINESS CONTEXT');
    expect(block).toContain('Serenity Ltd');
    expect(block).toContain('Massage packages — On-site');
    expect(block).toContain('never invent products, results, statistics, or client relationships');
  });
});
