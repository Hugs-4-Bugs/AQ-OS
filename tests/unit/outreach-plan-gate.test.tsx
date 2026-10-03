/**
 * MASTER-FIX regression test — Bug #4: inline Pro/Elite gate on restricted
 * outreach sequence functionality.
 *
 * Failure modes covered (task spec §6/§14):
 *  - Free + Starter: the Campaigns (sequences) view shows the inline
 *    PlanGate upgrade explanation — NOT a silent view that only fails via
 *    a toast/API 403 later.
 *  - Pro: full sequence authoring UI remains available.
 *  - The Direct Messages (manual outreach) view is NOT gated — every plan
 *    keeps manual outreach.
 *  - Backend 403 enforcement itself is covered by
 *    tests/unit/automation-plan-gates.test.ts (unchanged, must keep passing).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// jsdom lacks ResizeObserver (needed by Select/ScrollArea).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
vi.stubGlobal(
  'DOMRectReadOnly',
  class {
    top = 0;
    left = 0;
    bottom = 0;
    right = 0;
    width = 0;
    height = 0;
    x = 0;
    y = 0;
  }
);

vi.mock('@/lib/api', () => ({
  fetchLeads: vi.fn().mockResolvedValue({ leads: [], pagination: { page: 1, limit: 15, total: 0, totalPages: 1 } }),
  generateOutreach: vi.fn(),
  addCommunication: vi.fn(),
  fetchCommunications: vi.fn().mockResolvedValue([]),
  createReminder: vi.fn(),
  fetchReminders: vi.fn().mockResolvedValue([]),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import OutreachTab from '@/components/dashboard/outreach-tab';
import { useSubscriptionStore } from '@/lib/subscription-store';

function setPlan(plan: 'free' | 'starter' | 'pro' | 'elite') {
  useSubscriptionStore.setState({
    currentPlan: plan,
    syncState: 'verified',
    hasEverVerified: true,
  } as Partial<typeof useSubscriptionStore extends { getState: () => infer S } ? S : never>);
}

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OutreachTab />
    </QueryClientProvider>
  );
}

async function openCampaignsView() {
  await userEvent.click(screen.getByRole('button', { name: /campaigns/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  setPlan('free');
});

describe('OutreachTab — inline plan gate for automated sequences', () => {
  it('Free plan: Campaigns view shows the inline Pro upgrade gate instead of sequence authoring UI', async () => {
    setPlan('free');
    renderTab();
    await openCampaignsView();

    expect(await screen.findByText(/Automated Outreach Sequences requires Pro/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /create campaign/i })).toBeNull();
  });

  it('Starter plan: same inline gate as Free', async () => {
    setPlan('starter');
    renderTab();
    await openCampaignsView();

    expect(await screen.findByText(/Automated Outreach Sequences requires Pro/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /create campaign/i })).toBeNull();
  });

  it('Pro plan: full Campaigns view (stats + Create Campaign) remains available', async () => {
    setPlan('pro');
    renderTab();
    await openCampaignsView();

    expect(await screen.findByRole('button', { name: /create campaign/i })).toBeTruthy();
    expect(screen.queryByText(/Automated Outreach Sequences requires Pro/i)).toBeNull();
  });

  it('Elite plan: full Campaigns view remains available', async () => {
    setPlan('elite');
    renderTab();
    await openCampaignsView();

    expect(await screen.findByRole('button', { name: /create campaign/i })).toBeTruthy();
  });

  it('manual outreach (Direct Messages view) is NOT gated on Free', async () => {
    setPlan('free');
    renderTab();

    // Direct Messages is the default view — its generator CTA must be
    // present for every plan (only credit-shortage can block it, not plan).
    expect(screen.getByText(/outreach generator/i)).toBeTruthy();
    expect(screen.queryByText(/Automated Outreach Sequences requires Pro/i)).toBeNull();
  });
});
