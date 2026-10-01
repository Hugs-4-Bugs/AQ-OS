// ═══════════════════════════════════════════════════════════════════
// Unit Tests — GET /api/leads/stats additive reply-count fields
//
// The Insights "Reply Rate" card detail needs the underlying counts
// (leads contacted via outbound, leads replied via inbound). The stats
// endpoint already computed these internally; they are now exposed
// additively as contactedLeadCount / repliedLeadCount. All existing
// fields are unchanged.
// ═══════════════════════════════════════════════════════════════════
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string },
  leads: [] as Array<Record<string, unknown>>,
  communications: [] as Array<{ channel: string; direction: string; intent: string | null; leadId: string }>,
  deals: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: vi.fn(
    async (_req: unknown, handler: (user: unknown) => Promise<unknown>) => handler(state.user)
  ),
}));

vi.mock('@/lib/db', () => ({
  db: {
    lead: {
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) =>
        state.leads.filter((l) => {
          if (where && typeof where.userId === 'string' && where.userId !== state.user.id) return false;
          // Honor the replyScore gt filter used by the hotLeads count
          const rs = where?.replyScore as { gt?: number } | undefined;
          if (rs && typeof rs.gt === 'number' && !(Number(l.replyScore) > rs.gt)) return false;
          // Honor exact stage filters used by contacted/replied/won/lost counts
          const stage = where?.stage as string | { in: string[] } | undefined;
          if (typeof stage === 'string' && l.stage !== stage) return false;
          if (stage && typeof stage === 'object' && 'in' in stage && !(stage.in as string[]).includes(String(l.stage))) return false;
          return true;
        }).length
      ),
      findMany: vi.fn(async () => state.leads),
    },
    communication: {
      findMany: vi.fn(async () => state.communications),
    },
    deal: {
      findMany: vi.fn(async () => state.deals),
    },
  },
}));

import { GET } from '@/app/api/leads/stats/route';

function makeRequest(): Request {
  return new Request('http://localhost/api/leads/stats');
}

beforeEach(() => {
  state.leads = [];
  state.communications = [];
  state.deals = [];
});

describe('GET /api/leads/stats — reply breakdown counts', () => {
  it('exposes contactedLeadCount and repliedLeadCount from communications', async () => {
    state.leads = [
      { stage: 'contacted', niche: 'dentist', country: 'India', replyScore: 10, conversionScore: 20, urgencyScore: 5, revenuePotentialScore: 30 },
      { stage: 'replied', niche: 'dentist', country: 'India', replyScore: 80, conversionScore: 60, urgencyScore: 40, revenuePotentialScore: 70 },
    ];
    state.communications = [
      { channel: 'email', direction: 'outbound', intent: null, leadId: 'l1' },
      { channel: 'email', direction: 'outbound', intent: null, leadId: 'l2' },
      { channel: 'email', direction: 'inbound', intent: null, leadId: 'l2' },
    ];

    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.contactedLeadCount).toBe(2); // two distinct leads got outbound
    expect(data.repliedLeadCount).toBe(1); // one distinct lead sent inbound
    expect(data.replyRate).toBe(50);
    // Existing fields untouched
    expect(data.totalLeads).toBe(2);
    expect(data.hotLeads).toBe(1);
  });

  it('returns zero counts when there is no communication history', async () => {
    state.leads = [{ stage: 'discovered', niche: 'gym', country: 'UAE', replyScore: 0, conversionScore: 0, urgencyScore: 0, revenuePotentialScore: 0 }];

    const res = await GET(makeRequest() as never);
    const data = await res.json();

    expect(data.contactedLeadCount).toBe(0);
    expect(data.repliedLeadCount).toBe(0);
    expect(data.replyRate).toBe(0);
  });
});
