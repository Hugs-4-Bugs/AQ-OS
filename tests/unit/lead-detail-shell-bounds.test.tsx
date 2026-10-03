/**
 * MASTER-FIX regression test — Bug #3: lead detail panel must render INSIDE
 * the application shell (never covering the global navbar/sidebar).
 *
 * Root cause regression: the panel mounted with lead=null and its one-shot
 * region-resolution effect ran before the anchor span existed, so the Radix
 * sheet body-ported as a viewport-fixed z-50 layer over the whole app.
 * The fix re-resolves the shell region when a lead opens; this test proves
 * the panel now lands as an ABSOLUTE child of [data-app-content-region].
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Lead } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  fetchLeads: vi.fn().mockResolvedValue({ leads: [], pagination: { page: 1, limit: 15, total: 0, totalPages: 1 } }),
  fetchCommunications: vi.fn().mockResolvedValue([]),
  updateLead: vi.fn(),
  deleteLead: vi.fn(),
}));

vi.mock('@/components/dashboard/website-research-section', () => ({ default: () => null }));

import LeadDetailPanel from '@/components/dashboard/lead-detail-panel';

function makeLead(): Lead {
  return {
    id: 'lead-1',
    businessName: 'Acme Dental Clinic',
    ownerName: 'Dr. Jane Doe',
    niche: 'Dental',
    country: 'United States',
    city: 'Austin',
    stage: 'discovered',
    replyScore: 10,
    conversionScore: 42,
    urgencyScore: 5,
    revenuePotentialScore: 30,
    urgency: 'low',
    revenuePotential: 'medium',
    digitalWeaknesses: [],
    hasWebsite: true,
    tags: [],
  } as Lead;
}

function makeWrapper(client: QueryClient, lead: Lead | null, open: boolean) {
  return (
    <QueryClientProvider client={client}>
      <div data-app-content-region="">
        <LeadDetailPanel lead={lead} open={open} onClose={() => {}} />
      </div>
    </QueryClientProvider>
  );
}

describe('LeadDetailPanel — shell-bounded positioning', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('re-resolves the shell region when a lead opens AFTER mount (mount null → open lead)', async () => {
    // Mount exactly like leads-tab does: panel present, NO lead selected —
    // this is the sequence that used to break (effect ran once with no
    // anchor in the DOM and resolved null forever).
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const view = render(makeWrapper(queryClient, null, false));

    // The user clicks a lead → props update on the SAME mounted instance.
    view.rerender(makeWrapper(queryClient, makeLead(), true));

    await waitFor(() => {
      const region = document.querySelector('[data-app-content-region]');
      expect(region).not.toBeNull();
      const sheetInRegion = region!.querySelector('[data-slot="sheet-content"]');
      expect(sheetInRegion).not.toBeNull();
      const cls = (sheetInRegion as HTMLElement).className;
      expect(cls).toContain('absolute');
      expect(cls).toContain('inset-y-0');
      expect(cls).toContain('right-0');
      expect(cls).not.toMatch(/(^|\s)fixed(\s|$)/);
    });
  });

  it('bounds the panel inside the region — Radix must NOT portal a sheet-portal to document.body', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(makeWrapper(queryClient, makeLead(), true));

    await waitFor(() => {
      expect(document.querySelector('[data-slot="sheet-content"]')).not.toBeNull();
    });

    // sheet-portal containers must live inside the app region, never directly on <body>.
    const bodyLevelPortals = Array.from(document.body.children).filter(
      (el) => (el as HTMLElement).dataset?.slot === 'sheet-portal'
    );
    expect(bodyLevelPortals).toHaveLength(0);
  });
});
