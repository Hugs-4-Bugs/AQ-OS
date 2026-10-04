// ═══════════════════════════════════════════════════════════════════
// Component Test: LeadDetailPanel shell-bounded portal (overlay bug)
//
// REGRESSION: the panel is always mounted by LeadsTab with lead=null.
// The mount-only effect that resolves the app shell's
// [data-app-content-region] used to run while the null-branch early
// return had ALREADY removed the measuring anchor from the DOM, so the
// portal container never resolved and every open fell back to a
// document.body portal — a fixed full-viewport sheet + overlay that
// covered the global header, sidebar and footer.
//
// These tests pin the correct behaviour: the anchor must exist at mount
// and, when a lead opens, the dialog must render INSIDE the app shell
// content region (never a direct child of document.body).
// React Query + network are mocked (fetch stub) — no real backend.
// ═══════════════════════════════════════════════════════════════════

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LeadDetailPanel from '@/components/dashboard/lead-detail-panel';
import type { Lead } from '@/lib/types';

// Stub fetch for the panel's internal react-query calls (notes, activities,
// pipeline) — always ok, empty payloads; no network, no backend.
const fetchMock = vi.fn(async () =>
  new Response(JSON.stringify({ notes: [], activities: [], items: [], stages: [], steps: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
);

vi.stubGlobal('fetch', fetchMock);

vi.mock('framer-motion', () => ({
  motion: { div: ({ children }: { children?: React.ReactNode }) => <div>{children}</div> },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

function makeLead(): Lead {
  return {
    id: 'lead_1',
    businessName: 'Acme Dental',
    ownerName: 'Dr. Who',
    website: 'https://acme.example',
    email: 'info@acme.example',
    phone: '9663076023',
    city: 'Pune',
    country: 'India',
    niche: 'dental',
    stage: 'new',
    hasWebsite: true,
    websiteQuality: 'good',
    rating: 4.5,
    reviews: 12,
    estimatedRevenue: 'medium',
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as Lead;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function renderPanel(ui: React.ReactElement) {
  const queryClient = makeQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <div data-app-content-region className="relative flex flex-col flex-1 min-h-0">
        {ui}
      </div>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  fetchMock.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('LeadDetailPanel shell-bounded portal', () => {
  it('renders its measuring anchor even when no lead is selected (null branch)', () => {
    const { container } = renderPanel(
      <LeadDetailPanel lead={null} open={false} onClose={() => {}} />
    );
    const region = container.querySelector('[data-app-content-region]');
    expect(region).not.toBeNull();
    // The anchor span is the panel's only output in the null branch — it must
    // exist inside the shell region so the mount effect can resolve it.
    expect(region!.querySelector('span[aria-hidden="true"]')).not.toBeNull();
  });

  it('opens INSIDE the app shell content region (never a document.body portal)', async () => {
    const { container } = renderPanel(
      <LeadDetailPanel lead={makeLead()} open onClose={() => {}} />
    );
    const region = container.querySelector('[data-app-content-region]');
    expect(region).not.toBeNull();

    // The panel's dialog is uniquely named by its sr-only SheetDescription
    // ("Lead details and actions") — this excludes dialogs rendered by child
    // components (e.g. the prospect pipeline tab), which may legitimately
    // portal to body by their own design.
    const dialog = await screen.findByRole('dialog', { name: /acme dental/i });

    // THE REGRESSION ASSERTION: the lead detail dialog must be a DOM
    // descendant of the app shell content region — pre-fix it portalled to
    // document.body and covered the global header/sidebar/footer.
    expect(region!.contains(dialog)).toBe(true);
  });

  it('never renders the lead detail dialog as a direct child of document.body', async () => {
    renderPanel(<LeadDetailPanel lead={makeLead()} open onClose={() => {}} />);
    const dialog = await screen.findByRole('dialog', { name: /acme dental/i });
    // THE REGRESSION ASSERTION (direct form): the panel's dialog must not sit
    // in a portal wrapper appended straight to <body>.
    expect(dialog.parentElement).not.toBe(document.body);
    expect(document.body.contains(dialog)).toBe(true); // sanity: it exists in the document
  });
});
