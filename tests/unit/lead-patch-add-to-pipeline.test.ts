// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Unit Tests: PATCH /api/leads/[id] (Add to Pipeline)
//
// Regression coverage for the "Failed to add lead to pipeline" defect:
// the route implemented only GET/PUT/DELETE, so the client's updateLead()
// — which issues PATCH — hit a Next.js 405 Method Not Allowed on EVERY
// Add to Pipeline click (proven live pre-fix: PATCH→405, PUT→200).
//
// PATCH now delegates to the PUT handler: same ownership checks, same
// validation, same audit log. Stage updates are inherently idempotent —
// repeated "Add to Pipeline" clicks set the same scalar and never create
// duplicate pipeline entries (pipeline membership in AcquisitionOS is the
// lead's stage; there is no separate membership row to duplicate).
// ═══════════════════════════════════════════════════════════════════
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  user: null as null | { id: string; orgId: string | null },
  leadRow: null as null | {
    id: string;
    userId: string;
    orgId: string | null;
    businessName: string;
    stage: string;
  },
  updates: [] as Array<{ where: { id: string }; data: Record<string, unknown> }>,
}));

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: vi.fn(async (_request: unknown, handler: (user: unknown) => Promise<unknown>) => {
    if (!state.user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    return handler(state.user);
  }),
}));

vi.mock('@/lib/db', () => ({
  db: {
    lead: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = state.leadRow;
        if (!row || row.id !== where.id) return null;
        return row;
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        state.updates.push(args);
        return { ...state.leadRow, ...args.data };
      }),
    },
  },
}));

vi.mock('@/lib/lead-audit', () => ({ logAuditEvent: vi.fn(async () => {}) }));

import { PATCH, PUT } from '@/app/api/leads/[id]/route';
import { logAuditEvent } from '@/lib/lead-audit';

const LEAD_ID = 'lead-abc-1';
const OWNER_ID = 'user-owner-1';

function request(body: unknown) {
  return {
    json: async () => body,
  } as unknown as Parameters<typeof PATCH>[0];
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  state.user = { id: OWNER_ID, orgId: null };
  state.leadRow = {
    id: LEAD_ID,
    userId: OWNER_ID,
    orgId: null,
    businessName: 'Discovered Co',
    stage: 'discovered',
  };
  state.updates.length = 0;
  vi.mocked(logAuditEvent).mockClear();
});

function resStatus(res: unknown): number {
  return (res as Response).status;
}

async function resJson(res: unknown): Promise<Record<string, unknown>> {
  return ((res as Response).json ? await (res as Response).json() : {}) as Record<string, unknown>;
}

describe('PATCH /api/leads/[id] — Add to Pipeline', () => {
  it('succeeds where it previously returned 405: stage → analyzed', async () => {
    const res = await PATCH(request({ stage: 'analyzed' }), routeContext(LEAD_ID));
    expect(resStatus(res)).toBe(200);
    const body = await resJson(res);
    expect((body.lead as { stage: string }).stage).toBe('analyzed');
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].data.stage).toBe('analyzed');
    // Ownership + audit still enforced through the shared handler.
    expect(vi.mocked(logAuditEvent).mock.calls[0][0]).toBe(OWNER_ID);
    expect(vi.mocked(logAuditEvent).mock.calls[0][1]).toBe('lead_updated');
  });

  it('is idempotent: repeated Add to Pipeline clicks never create duplicates', async () => {
    const first = await PATCH(request({ stage: 'analyzed' }), routeContext(LEAD_ID));
    const second = await PATCH(request({ stage: 'analyzed' }), routeContext(LEAD_ID));
    const third = await PATCH(request({ stage: 'analyzed' }), routeContext(LEAD_ID));
    expect(resStatus(first)).toBe(200);
    expect(resStatus(second)).toBe(200);
    expect(resStatus(third)).toBe(200);
    // Each click updates the same scalar on the same row — no new rows,
    // no duplicate pipeline membership.
    expect(state.updates).toHaveLength(3);
    for (const u of state.updates) {
      expect(u.where.id).toBe(LEAD_ID);
      expect(u.data.stage).toBe('analyzed');
    }
  });

  it('returns an actionable 400 for an invalid stage', async () => {
    const res = await PATCH(request({ stage: 'not-a-real-stage' }), routeContext(LEAD_ID));
    expect(resStatus(res)).toBe(400);
    const body = await resJson(res);
    expect(body.code).toBe('INVALID_STAGE');
    expect(String(body.error)).toContain('not-a-real-stage');
    expect(String(body.error)).toContain('analyzed');
    expect(state.updates).toHaveLength(0);
  });

  it('returns 404 for an unknown lead id', async () => {
    const res = await PATCH(request({ stage: 'analyzed' }), routeContext('lead-does-not-exist'));
    expect(resStatus(res)).toBe(404);
  });

  it('returns 403 when the lead belongs to another user', async () => {
    state.leadRow = { ...state.leadRow!, userId: 'someone-else' };
    const res = await PATCH(request({ stage: 'analyzed' }), routeContext(LEAD_ID));
    expect(resStatus(res)).toBe(403);
    expect(state.updates).toHaveLength(0);
  });

  it('returns 401 when unauthenticated', async () => {
    state.user = null;
    const res = await PATCH(request({ stage: 'analyzed' }), routeContext(LEAD_ID));
    expect(resStatus(res)).toBe(401);
    expect(state.updates).toHaveLength(0);
  });

  it('behaves identically to PUT (single shared handler)', async () => {
    const viaPut = await PUT(request({ stage: 'analyzed' }), routeContext(LEAD_ID));
    const viaPatch = await PATCH(request({ stage: 'analyzed' }), routeContext(LEAD_ID));
    expect(resStatus(viaPut)).toBe(200);
    expect(resStatus(viaPatch)).toBe(200);
  });
});
