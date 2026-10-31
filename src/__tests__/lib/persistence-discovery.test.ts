// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Phases 11–17 — Persistence / Multiple Profiles /
// Default Selection / Discovery Context & Snapshot / User Isolation
//
// Route-level tests exercising the REAL route handlers (personal-context,
// business-profiles + [id], offer-profile, leads/discover) against an
// in-memory db double with a SWITCHABLE authenticated user, so
// cross-user access attempts hit the real server-side ownership checks.
//
// THE MODEL this suite locks down (Oct 2026, Phases 11–15):
//   • My Context / Business Profile / My Offer persist via DB writes
//     (create → read → update → re-read roundtrips).
//   • Profile creation is deterministic and idempotent: GET never creates
//     rows; no duplicate profile appears on reload/session init.
//   • Multiple profiles coexist; editing one never mutates another.
//   • Default selection is explicit (isDefault, exactly one) with a
//     deterministic fallback (earliest active).
//   • Discovery: explicit profile override + default fallback + FULL
//     profileSnapshot persisted on the job row; later profile edits
//     never rewrite the historical snapshot; foreign profile ids are
//     rejected server-side.
//   • USER ISOLATION: user B's GET/PUT/DELETE on user A's profile → 404;
//     B's discovery with A's profileId → 400.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── In-memory db + switchable auth ─────────────────────────────────
const sim = vi.hoisted(() => {
  const state = {
    currentUserId: 'userA',
    users: { userA: { id: 'userA', plan: 'pro' }, userB: { id: 'userB', plan: 'pro' } },
    userSettings: new Map<string, Record<string, unknown>>(),
    businessProfiles: new Map<string, Record<string, unknown>>(),
    discoveryJobs: new Map<string, Record<string, unknown>>(),
    profileCounter: 0,
    jobCounter: 0,
    now: new Date('2026-10-22T12:00:00Z'),
  };

  const clone = <T>(v: T): T => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);

  const userSettings = {
    findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => {
      const s = state.userSettings.get(where.userId);
      return s ? clone(s) : null;
    }),
    upsert: vi.fn(async ({ where, update, create }: {
      where: { userId: string };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }) => {
      const existing = state.userSettings.get(where.userId);
      const row = existing ? { ...existing, ...update } : { id: `us_${where.userId}`, ...create };
      state.userSettings.set(where.userId, row);
      return clone(row);
    }),
  };

  const businessProfile = {
    findMany: vi.fn(async ({ where }: { where: { userId: string } }) => {
      const rows = [...state.businessProfiles.values()].filter((p) => p.userId === where.userId);
      rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return rows.map(clone);
    }),
    count: vi.fn(async ({ where }: { where: { userId: string; status?: string } }) => {
      return [...state.businessProfiles.values()].filter(
        (p) => p.userId === where.userId && (!where.status || p.status === where.status)
      ).length;
    }),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const rows = [...state.businessProfiles.values()].filter((p) => {
        if (where.id && p.id !== where.id) return false;
        if (where.userId && p.userId !== where.userId) return false;
        if (where.status && p.status !== where.status) return false;
        if (where.isDefault !== undefined && p.isDefault !== where.isDefault) return false;
        return true;
      });
      // Deterministic ordering mirrors orderBy createdAt asc, id asc.
      rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)));
      const first = rows[0];
      return first ? clone(first) : null;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      state.profileCounter++;
      const row = {
        id: `bp_${state.profileCounter}`,
        status: 'active',
        isDefault: false,
        createdAt: new Date(state.now.getTime() + state.profileCounter * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
        ...data,
      };
      state.businessProfiles.set(row.id, row);
      return clone(row);
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = state.businessProfiles.get(where.id);
      if (!row) throw new Error('Record not found');
      Object.assign(row, data, { updatedAt: new Date().toISOString() });
      return clone(row);
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0;
      for (const row of state.businessProfiles.values()) {
        if (where.userId && row.userId !== where.userId) continue;
        if (where.isDefault !== undefined && row.isDefault !== where.isDefault) continue;
        if (where.NOT && where.NOT.id && row.id === where.NOT.id) continue;
        Object.assign(row, data);
        count++;
      }
      return { count };
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      const row = state.businessProfiles.get(where.id);
      if (!row) throw new Error('Record not found');
      state.businessProfiles.delete(where.id);
      return clone(row);
    }),
  };

  return { state, userSettings, businessProfile };
});

vi.mock('@/lib/db', () => ({
  db: {
    userSettings: sim.userSettings,
    businessProfile: sim.businessProfile,
  },
}));

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: vi.fn(async (_req: unknown, handler: (u: unknown) => unknown) =>
    handler(sim.state.users[sim.state.currentUserId as keyof typeof sim.state.users])),
}));

vi.mock('@/lib/observability/api-logger', () => ({
  withApiLogging: vi.fn((fn: unknown) => fn),
}));

vi.mock('@/lib/entitlement-service', () => ({
  // Synchronous in the real service — must stay sync here too.
  canPerformAction: vi.fn(() => ({ allowed: true, limit: 7 })),
  getFeatureLimit: vi.fn(() => 7),
  getEntitlements: vi.fn(() => ({ lead_discovery: { enabled: true, limit: null } })),
}));

vi.mock('@/lib/entitlement-middleware', () => ({
  getFeatureUsage: vi.fn(async () => 0),
  checkPlanEntitlement: vi.fn(async () => ({ allowed: true })),
}));

// Discovery job creator captures the params (incl. resolved context).
const discovery = vi.hoisted(() => ({ startDiscoveryJob: vi.fn() }));
vi.mock('@/lib/lead-discovery-service', () => ({
  startDiscoveryJob: discovery.startDiscoveryJob,
}));

// Route handlers under test (imported AFTER the mocks).
import { GET as getContext, PUT as putContext } from '@/app/api/settings/personal-context/route';
import { GET as listProfiles, POST as createProfile } from '@/app/api/business-profiles/route';
import { GET as getProfile, PUT as updateProfile, DELETE as deleteProfile } from '@/app/api/business-profiles/[id]/route';
import { GET as getOffer, PUT as putOffer } from '@/app/api/prospecting/offer-profile/route';
import { POST as discover } from '@/app/api/leads/discover/route';

// ── helpers ─────────────────────────────────────────────────────────
function req(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  sim.state.currentUserId = 'userA';
  sim.state.userSettings.clear();
  sim.state.businessProfiles.clear();
  sim.state.discoveryJobs.clear();
  sim.state.profileCounter = 0;
  discovery.startDiscoveryJob.mockImplementation(async (_userId: string, params: Record<string, unknown>) => {
    sim.state.jobCounter++;
    sim.state.discoveryJobs.set(`job_${sim.state.jobCounter}`, { params });
    return { jobId: `job_${sim.state.jobCounter}`, status: 'queued', message: 'queued' };
  });
});

// ═══ PHASE 11 — MY CONTEXT PERSISTENCE ═════════════════════════════

describe('My Context persistence', () => {
  it('create/save: PUT persists, GET returns the stored context', async () => {
    const put = await putContext(req('PUT', '/api/settings/personal-context', {
      context: { whatYouDo: 'I run a B2B SaaS agency', services: 'Web automation', goals: 'Sign 5 clients' },
    }), {} as never);
    expect(put.status).toBe(200);

    const get = await getContext(req('GET', '/api/settings/personal-context'));
    const body = await json(get);
    expect(get.status).toBe(200);
    expect(body.context).toMatchObject({
      whatYouDo: 'I run a B2B SaaS agency',
      services: 'Web automation',
      goals: 'Sign 5 clients',
    });
  });

  it('edit/update: a second PUT replaces the stored fields and persists', async () => {
    await putContext(req('PUT', '/api/settings/personal-context', {
      context: { whatYouDo: 'old', goals: 'old goal' },
    }), {} as never);
    const put = await putContext(req('PUT', '/api/settings/personal-context', {
      context: { whatYouDo: 'I sell dental software', goals: 'new goal' },
    }), {} as never);
    expect(put.status).toBe(200);

    const get = await getContext(req('GET', '/api/settings/personal-context'));
    const body = await json(get);
    expect(body.context).toMatchObject({ whatYouDo: 'I sell dental software', goals: 'new goal' });
    // The DB row itself (not just frontend state) carries the update:
    const row = sim.state.userSettings.get('userA');
    expect(JSON.parse(String(row?.personalContext))).toMatchObject({ whatYouDo: 'I sell dental software' });
  });

  it('survives "reload"/"session change": a fresh GET (new request, no client state) returns the DB row', async () => {
    await putContext(req('PUT', '/api/settings/personal-context', {
      context: { whatYouDo: 'persisted' },
    }), {} as never);
    // Simulate reload: brand-new request object, nothing cached client-side.
    const get = await getContext(new NextRequest('http://localhost/api/settings/personal-context'));
    expect((await json(get)).context).toMatchObject({ whatYouDo: 'persisted' });
    // Simulate logout/login: same DB, different session, same user id.
    sim.state.currentUserId = 'userB';
    sim.state.currentUserId = 'userA';
    const get2 = await getContext(new NextRequest('http://localhost/api/settings/personal-context'));
    expect((await json(get2)).context).toMatchObject({ whatYouDo: 'persisted' });
  });

  it('user isolation: user B never reads user A\'s context', async () => {
    await putContext(req('PUT', '/api/settings/personal-context', {
      context: { whatYouDo: 'A secret context' },
    }), {} as never);
    sim.state.currentUserId = 'userB';
    const get = await getContext(new NextRequest('http://localhost/api/settings/personal-context'));
    expect((await json(get)).context).toEqual({});
  });

  it('no automatic deletion: a read never clears stored context', async () => {
    await putContext(req('PUT', '/api/settings/personal-context', {
      context: { whatYouDo: 'kept' },
    }), {} as never);
    await getContext(new NextRequest('http://localhost/api/settings/personal-context'));
    await getContext(new NextRequest('http://localhost/api/settings/personal-context'));
    const get = await getContext(new NextRequest('http://localhost/api/settings/personal-context'));
    expect((await json(get)).context).toMatchObject({ whatYouDo: 'kept' });
  });
});

// ═══ PHASE 12 — BUSINESS PROFILE PERSISTENCE ═══════════════════════

describe('Business Profile persistence', () => {
  it('create → read roundtrip persists to the DB row', async () => {
    const post = await createProfile(req('POST', '/api/business-profiles', {
      name: 'Dental SaaS Co', industry: 'Healthcare IT', preferredTone: 'formal', cta: 'Book a demo',
    }));
    expect(post.status).toBe(201);
    const created = (await json(post)).profile as Record<string, unknown>;

    const get = await getProfile(req('GET', `/api/business-profiles/${created.id}`), {
      params: Promise.resolve({ id: String(created.id) }),
    });
    expect(get.status).toBe(200);
    expect((await json(get)).profile).toMatchObject({ name: 'Dental SaaS Co', industry: 'Healthcare IT' });
  });

  it('edit persists: PUT updates the SAME row (no replacement, no duplicate)', async () => {
    const post = await createProfile(req('POST', '/api/business-profiles', { name: 'Original' }));
    const id = String(((await json(post)).profile as Record<string, unknown>).id);

    const put = await updateProfile(req('PUT', `/api/business-profiles/${id}`, {
      name: 'Edited Name', preferredTone: 'urgent',
    }), { params: Promise.resolve({ id }) });
    expect(put.status).toBe(200);

    const list = await listProfiles(req('GET', '/api/business-profiles'));
    const body = await json(list);
    expect(body.total).toBe(1); // still ONE row — edited, not duplicated
    expect((body.profiles as Array<Record<string, unknown>>)[0]).toMatchObject({ name: 'Edited Name' });
    // Same row id — history preserved, not archived/replaced:
    expect((body.profiles as Array<Record<string, unknown>>)[0].id).toBe(id);
  });

  it('no duplicate creation on reload/session init: GET list never creates rows', async () => {
    await createProfile(req('POST', '/api/business-profiles', { name: 'Only One' }));
    for (let i = 0; i < 5; i++) {
      await listProfiles(new NextRequest('http://localhost/api/business-profiles'));
      await getProfile(req('GET', '/api/business-profiles/bp_1'), { params: Promise.resolve({ id: 'bp_1' }) });
    }
    const body = await json(await listProfiles(new NextRequest('http://localhost/api/business-profiles')));
    expect(body.total).toBe(1);
  });

  it('correct user ownership: the created row belongs to the caller', async () => {
    const post = await createProfile(req('POST', '/api/business-profiles', { name: 'A profile' }));
    const profile = (await json(post)).profile as Record<string, unknown>;
    expect(profile.userId).toBe('userA');
  });
});

// ═══ PHASE 13 — MY OFFER PERSISTENCE ═══════════════════════════════

describe('My Offer persistence', () => {
  it('create/update roundtrips through the DB row (exact user data)', async () => {
    const put = await putOffer(req('PUT', '/api/prospecting/offer-profile', {
      services: [
        { id: 's1', label: 'AI Automation', category: 'ai_automation', description: 'Workflow automation for clinics' },
        { id: 's2', label: 'Web Development', category: 'web', description: 'Websites and portals' },
      ],
    }), {} as never);
    expect(put.status).toBe(200);

    const get = await getOffer(new NextRequest('http://localhost/api/prospecting/offer-profile'));
    const body = await json(get);
    expect(get.status).toBe(200);
    expect(body.services).toHaveLength(2);
    expect(body.services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'AI Automation', description: 'Workflow automation for clinics' }),
      ])
    );
    // The actual DB record (not just the response):
    const row = sim.state.userSettings.get('userA');
    const stored = JSON.parse(String(row?.servicesOffered));
    expect(stored).toHaveLength(2);
    expect(stored[0].label).toBe('AI Automation');
  });

  it('survives refresh and session change (fresh requests hit the DB)', async () => {
    await putOffer(req('PUT', '/api/prospecting/offer-profile', {
      services: [{ id: 's1', label: 'Consulting', category: 'general', description: '' }],
    }), {} as never);
    const get = await getOffer(new NextRequest('http://localhost/api/prospecting/offer-profile'));
    expect((await json(get)).services).toHaveLength(1);
  });

  it('no cross-user leakage: user B sees their own (empty) offer', async () => {
    await putOffer(req('PUT', '/api/prospecting/offer-profile', {
      services: [{ id: 's1', label: 'A service', category: 'general', description: '' }],
    }), {} as never);
    sim.state.currentUserId = 'userB';
    const get = await getOffer(new NextRequest('http://localhost/api/prospecting/offer-profile'));
    expect((await json(get)).services).toEqual([]);
  });
});

// ═══ PHASE 14 — MULTIPLE PROFILES + DEFAULT SELECTION ══════════════

describe('multiple saved profiles & explicit default', () => {
  it('multiple profiles coexist; editing one does not mutate another', async () => {
    const p1 = (await json(await createProfile(req('POST', '/api/business-profiles', { name: 'Profile One', industry: 'IT' })))).profile as Record<string, unknown>;
    const p2 = (await json(await createProfile(req('POST', '/api/business-profiles', { name: 'Profile Two', industry: 'Health' })))).profile as Record<string, unknown>;

    await updateProfile(req('PUT', `/api/business-profiles/${p2.id}`, { industry: 'Medical' }), {
      params: Promise.resolve({ id: String(p2.id) }),
    });

    const g1 = await json(await getProfile(req('GET', `/api/business-profiles/${p1.id}`), { params: Promise.resolve({ id: String(p1.id) }) }));
    expect(g1.profile).toMatchObject({ name: 'Profile One', industry: 'IT' }); // untouched
    const g2 = await json(await getProfile(req('GET', `/api/business-profiles/${p2.id}`), { params: Promise.resolve({ id: String(p2.id) }) }));
    expect(g2.profile).toMatchObject({ name: 'Profile Two', industry: 'Medical' }); // edited
    expect(sim.state.businessProfiles.size).toBe(2);
  });

  it('first profile becomes default implicitly (deterministic); explicit isDefault switches it exactly-once', async () => {
    const p1 = (await json(await createProfile(req('POST', '/api/business-profiles', { name: 'First' })))).profile as Record<string, unknown>;
    const p2 = (await json(await createProfile(req('POST', '/api/business-profiles', { name: 'Second' })))).profile as Record<string, unknown>;

    // First-ever active profile becomes the default automatically.
    expect(p1.isDefault).toBe(true);
    expect(p2.isDefault).toBe(false);

    // Explicit switch: p2 becomes the sole default.
    await updateProfile(req('PUT', `/api/business-profiles/${p2.id}`, { isDefault: true }), {
      params: Promise.resolve({ id: String(p2.id) }),
    });
    expect(sim.state.businessProfiles.get(String(p1.id))?.isDefault).toBe(false);
    expect(sim.state.businessProfiles.get(String(p2.id))?.isDefault).toBe(true);

    // The list response exposes the deterministic default.
    const list = await json(await listProfiles(new NextRequest('http://localhost/api/business-profiles')));
    expect(list.defaultProfileId).toBe(p2.id);
  });

  it('archiving the current default clears the flag (a default is always active)', async () => {
    const p1 = (await json(await createProfile(req('POST', '/api/business-profiles', { name: 'Will Archive' })))).profile as Record<string, unknown>;
    await updateProfile(req('PUT', `/api/business-profiles/${p1.id}`, { status: 'archived' }), {
      params: Promise.resolve({ id: String(p1.id) }),
    });
    expect(sim.state.businessProfiles.get(String(p1.id))?.isDefault).toBe(false);
  });

  it('no automatic archive/delete: profiles persist across repeated reads', async () => {
    await createProfile(req('POST', '/api/business-profiles', { name: 'Stays' }));
    for (let i = 0; i < 3; i++) {
      await listProfiles(new NextRequest('http://localhost/api/business-profiles'));
    }
    expect(sim.state.businessProfiles.size).toBe(1);
    expect([...sim.state.businessProfiles.values()][0].status).toBe('active');
  });
});

// ═══ USER ISOLATION (cross-user probes) ═════════════════════════════

describe('User isolation — server-side ownership enforcement', () => {
  beforeEach(async () => {
    await createProfile(req('POST', '/api/business-profiles', { name: 'A profile', industry: 'IT' }));
    await putContext(req('PUT', '/api/settings/personal-context', { context: { whatYouDo: 'A context' } }), {} as never);
  });

  it('user B GET on A\'s profile id → 404', async () => {
    const id = [...sim.state.businessProfiles.keys()][0];
    sim.state.currentUserId = 'userB';
    const res = await getProfile(req('GET', `/api/business-profiles/${id}`), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(404);
  });

  it('user B PUT on A\'s profile id → 404 (no cross-user update)', async () => {
    const id = [...sim.state.businessProfiles.keys()][0];
    sim.state.currentUserId = 'userB';
    const res = await updateProfile(req('PUT', `/api/business-profiles/${id}`, { name: 'HACKED' }), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(404);
    expect(sim.state.businessProfiles.get(id)?.name).toBe('A profile'); // untouched
  });

  it('user B DELETE on A\'s profile id → 404', async () => {
    const id = [...sim.state.businessProfiles.keys()][0];
    sim.state.currentUserId = 'userB';
    const res = await deleteProfile(req('DELETE', `/api/business-profiles/${id}`), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(404);
    expect(sim.state.businessProfiles.has(id)).toBe(true); // still there
  });

  it('user B discovery using A\'s profileId → rejected', async () => {
    const id = [...sim.state.businessProfiles.keys()][0];
    sim.state.currentUserId = 'userB';
    const res = await discover(req('POST', '/api/leads/discover', {
      niche: 'dental', source: 'ai_search', context: { mode: 'profile', profileId: id },
    }));
    expect(res.status).toBe(400);
    expect(discovery.startDiscoveryJob).not.toHaveBeenCalled();
  });

  it('user B cannot flip A\'s default (PUT isDefault → 404)', async () => {
    const id = [...sim.state.businessProfiles.keys()][0];
    sim.state.currentUserId = 'userB';
    const res = await updateProfile(req('PUT', `/api/business-profiles/${id}`, { isDefault: true }), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(404);
    expect(sim.state.businessProfiles.get(id)?.isDefault).toBe(true); // A's default intact
  });
});

// ═══ PHASE 15 — DISCOVERY CONTEXT SELECTION & SNAPSHOT ═════════════

describe('discovery context selection + snapshot', () => {
  beforeEach(async () => {
    await createProfile(req('POST', '/api/business-profiles', {
      name: 'Dental SaaS', industry: 'Healthcare IT', description: 'Practice management software',
      productsServices: 'Scheduling, billing', offers: 'Free 30-day trial',
      preferredTone: 'formal', cta: 'Book a demo',
    }));
  });

  it('explicit profile override: selected profile snapshot rides the discovery job', async () => {
    const id = [...sim.state.businessProfiles.keys()][0];
    const res = await discover(req('POST', '/api/leads/discover', {
      niche: 'dental', source: 'ai_search', context: { mode: 'profile', profileId: id },
    }));
    expect(res.status).toBe(202);
    const params = discovery.startDiscoveryJob.mock.calls[0][1] as Record<string, unknown>;
    const ctx = params.context as Record<string, unknown>;
    expect(ctx.mode).toBe('profile');
    expect(ctx.profileId).toBe(id);
    expect(ctx.profileSnapshot).toMatchObject({
      id,
      name: 'Dental SaaS',
      industry: 'Healthcare IT',
      description: 'Practice management software',
    });
    // Context instructions merged into requirements:
    expect(String(params.requirements)).toContain('Practice management software');
  });

  it('no override supplied → deterministic DEFAULT profile is used', async () => {
    const res = await discover(req('POST', '/api/leads/discover', {
      niche: 'dental', source: 'ai_search', context: { mode: 'profile' }, // no profileId
    }));
    expect(res.status).toBe(202);
    const params = discovery.startDiscoveryJob.mock.calls[0][1] as Record<string, unknown>;
    const ctx = params.context as Record<string, unknown>;
    expect(ctx.profileId).toBe([...sim.state.businessProfiles.keys()][0]);
    expect(ctx.profileSnapshot).toMatchObject({ name: 'Dental SaaS' });
  });

  it('SNAPSHOT PRESERVATION: editing the profile after discovery does NOT rewrite the snapshot', async () => {
    const id = [...sim.state.businessProfiles.keys()][0];
    await discover(req('POST', '/api/leads/discover', {
      niche: 'dental', source: 'ai_search', context: { mode: 'profile', profileId: id },
    }));
    const firstCtx = (discovery.startDiscoveryJob.mock.calls[0][1] as Record<string, unknown>).context as Record<string, unknown>;

    // Later edit of the saved profile:
    await updateProfile(req('PUT', `/api/business-profiles/${id}`, {
      description: 'TOTALLY NEW DESCRIPTION', offers: 'New enterprise plan',
    }), { params: Promise.resolve({ id }) });

    // The historical discovery snapshot is unchanged:
    expect((firstCtx.profileSnapshot as Record<string, unknown>).description).toBe('Practice management software');
    expect((firstCtx.profileSnapshot as Record<string, unknown>).offers).toBe('Free 30-day trial');
    // And a NEW discovery run snapshots the NEW values:
    await discover(req('POST', '/api/leads/discover', {
      niche: 'dental', source: 'ai_search', context: { mode: 'profile', profileId: id },
    }));
    const secondCtx = (discovery.startDiscoveryJob.mock.calls[1][1] as Record<string, unknown>).context as Record<string, unknown>;
    expect((secondCtx.profileSnapshot as Record<string, unknown>).description).toBe('TOTALLY NEW DESCRIPTION');
  });

  it('selecting a profile never mutates the saved profile', async () => {
    const id = [...sim.state.businessProfiles.keys()][0];
    const before = JSON.parse(JSON.stringify(sim.state.businessProfiles.get(id)));
    await discover(req('POST', '/api/leads/discover', {
      niche: 'dental', source: 'ai_search', context: { mode: 'profile', profileId: id },
    }));
    const after = sim.state.businessProfiles.get(id);
    expect(after).toEqual(before);
  });

  it('invalid/foreign profile ids are rejected (400, no job started)', async () => {
    sim.state.currentUserId = 'userB';
    const res = await discover(req('POST', '/api/leads/discover', {
      niche: 'dental', source: 'ai_search',
      context: { mode: 'profile', profileId: 'nonexistent-profile-id' },
    }));
    expect(res.status).toBe(400);
    expect(discovery.startDiscoveryJob).not.toHaveBeenCalled();
  });

  it('no profile at all + mode=profile → actionable 400', async () => {
    sim.state.currentUserId = 'userB';
    const res = await discover(req('POST', '/api/leads/discover', {
      niche: 'dental', source: 'ai_search', context: { mode: 'profile' },
    }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(String(body.error)).toContain('business profile');
  });

  it('mode none/absent keeps legacy discovery behavior (no profile resolution)', async () => {
    const res = await discover(req('POST', '/api/leads/discover', {
      niche: 'dental', source: 'ai_search',
    }));
    expect(res.status).toBe(202);
    const params = discovery.startDiscoveryJob.mock.calls[0][1] as Record<string, unknown>;
    expect(params.context).toBeNull();
  });
});
