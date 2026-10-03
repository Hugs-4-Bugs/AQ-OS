// ═══════════════════════════════════════════════════════════════════
// Unit Tests — GET /api/leads metric filter params (stages, minReplyScore)
//
// The dashboard/insights metric detail drawer fetches the underlying
// records of a card with EXACT metric semantics (e.g. "Contacted" =
// contacted..negotiation, "Hot Leads" = replyScore > 70). This verifies
// the additive `stages` and `minReplyScore` query params while proving
// the existing single-`stage` behavior is untouched (backward compat).
// ═══════════════════════════════════════════════════════════════════
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  user: null as null | { id: string },
  capturedWhere: null as Record<string, unknown> | null,
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/auth-middleware', () => ({
  // Dual-auth wrapper: session users pass straight through to the handler;
  // unauthenticated requests are rejected with 401 before the handler runs
  withDualAuthPermission: vi.fn(
    async (_req: unknown, _perm: string, handler: (user: unknown, apiKey: null) => Promise<unknown>) => {
      if (!state.user) {
        return Response.json({ error: 'Authentication required' }, { status: 401 });
      }
      return handler(state.user, null);
    }
  ),
}));

vi.mock('@/lib/observability/middleware', () => ({
  withMonitoring: vi.fn((fn: unknown) => fn),
}));

vi.mock('@/lib/db', () => ({
  db: {
    lead: {
      findMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
        state.capturedWhere = args.where;
        return state.rows;
      }),
      count: vi.fn(async () => state.rows.length),
    },
  },
}));

import { GET } from '@/app/api/leads/route';

function makeRequest(query: string): Request {
  return new Request(`http://localhost/api/leads${query}`);
}

beforeEach(() => {
  state.user = { id: 'user-1' };
  state.capturedWhere = null;
  state.rows = [{ id: 'lead-1' }];
});

describe('GET /api/leads — metric filter params', () => {
  it('returns 401 when unauthenticated', async () => {
    state.user = null;
    const res = await GET(makeRequest('') as never);
    expect(res.status).toBe(401);
  });

  it('supports comma-separated stages for compound metrics', async () => {
    const res = await GET(makeRequest('?stages=won,lost') as never);
    expect(res.status).toBe(200);
    expect(state.capturedWhere?.stage).toEqual({ in: ['won', 'lost'] });
    expect(state.capturedWhere?.userId).toBe('user-1');
  });

  it('accepts the legacy "interested" stage for metric parity with /api/leads/stats', async () => {
    await GET(makeRequest('?stages=contacted,replied,interested,discussion,proposal,negotiation') as never);
    expect(state.capturedWhere?.stage).toEqual({
      in: ['contacted', 'replied', 'interested', 'discussion', 'proposal', 'negotiation'],
    });
  });

  it('drops unknown stage tokens instead of returning everything', async () => {
    await GET(makeRequest('?stages=won,not-a-stage') as never);
    expect(state.capturedWhere?.stage).toEqual({ in: ['won'] });
  });

  it('yields an empty (never unfiltered) set when every token is invalid', async () => {
    await GET(makeRequest('?stages=nope') as never);
    expect(state.capturedWhere?.stage).toEqual({ in: [] });
  });

  it('supports the minReplyScore lower bound (Hot Leads = replyScore > 70 → gte 71)', async () => {
    await GET(makeRequest('?minReplyScore=71') as never);
    expect(state.capturedWhere?.replyScore).toEqual({ gte: 71 });
  });

  it('combines stages and minReplyScore with the ownership scope', async () => {
    await GET(makeRequest('?stages=won,lost&minReplyScore=71') as never);
    expect(state.capturedWhere?.stage).toEqual({ in: ['won', 'lost'] });
    expect(state.capturedWhere?.replyScore).toEqual({ gte: 71 });
    expect(state.capturedWhere?.userId).toBe('user-1');
  });

  it('backward compat: plain single-stage filter behaves exactly as before', async () => {
    await GET(makeRequest('?stage=won') as never);
    expect(state.capturedWhere?.stage).toBe('won');
  });

  it('backward compat: no filter params leaves stage and replyScore untouched', async () => {
    await GET(makeRequest('') as never);
    expect(state.capturedWhere).not.toHaveProperty('stage');
    expect(state.capturedWhere).not.toHaveProperty('replyScore');
    expect(state.capturedWhere?.userId).toBe('user-1');
  });

  it('backward compat: single stage param takes precedence over stages', async () => {
    await GET(makeRequest('?stage=won&stages=lost') as never);
    expect(state.capturedWhere?.stage).toBe('won');
  });
});
