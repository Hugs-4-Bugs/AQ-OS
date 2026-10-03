/**
 * LeadsTab search input focus regression tests
 *
 * Bug: typing in the Leads search field filtered the list but the input lost
 * focus after every character. Root cause: the search string is part of the
 * React Query key and the component early-returned a full-page loading
 * skeleton whenever the new key had no cached data, unmounting (and then
 * remounting) the entire tree — including the <input> — on each keystroke.
 *
 * Fix: `placeholderData: keepPreviousData` keeps the previous results (and
 * therefore the whole tree, including the search input) mounted while a new
 * filter query is in flight; the clear button no longer steals focus on
 * mousedown.
 *
 * These tests render the real LeadsTab with a mocked fetchLeads and assert:
 *  1. the input DOM node is the SAME node after typing (not remounted),
 *  2. focus and caret/value survive continuous typing, mid-insertion,
 *     selection replacement, and backspacing,
 *  3. filtering still fires with the right search params,
 *  4. the clear button clears the query and keeps focus on the input.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Lead } from '@/lib/types';

// Mock the API layer used by LeadsTab — fetchLeads is the query that drives
// the list; delete/update are unused here but must exist on the module.
vi.mock('@/lib/api', () => ({
  fetchLeads: vi.fn(),
  deleteLead: vi.fn(),
  updateLead: vi.fn(),
}));

// Heavy child components are irrelevant to search-focus behaviour — stub them
// so the test stays focused and jsdom-light.
vi.mock('@/components/dashboard/lead-detail-panel', () => ({ default: () => null }));
vi.mock('@/components/dashboard/lead-import-dialog', () => ({ default: () => null }));
vi.mock('@/components/dashboard/create-lead-dialog', () => ({ default: () => null }));

import LeadsTab from '@/components/dashboard/leads-tab';
import * as api from '@/lib/api';

const fetchLeadsMock = vi.mocked(api.fetchLeads);

function makeLead(overrides: Partial<Lead> = {}): Lead {
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
    ...overrides,
  } as Lead;
}

function makePage(leads: Lead[], total = leads.length) {
  return {
    leads,
    pagination: { page: 1, limit: 15, total, totalPages: Math.max(1, Math.ceil(total / 15)) },
  };
}

function renderLeadsTab() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <LeadsTab />
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}

function getSearchInput(): HTMLInputElement {
  return screen.getByPlaceholderText('Search leads...') as HTMLInputElement;
}

async function findSearchInput(): Promise<HTMLInputElement> {
  return (await screen.findByPlaceholderText('Search leads...')) as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchLeadsMock.mockReset();
  // Default: every search returns one matching lead.
  fetchLeadsMock.mockResolvedValue(makePage([makeLead()]));
});

describe('LeadsTab search input focus', () => {
  it('keeps the SAME input DOM node focused while typing a multi-character query', async () => {
    const user = userEvent.setup();
    renderLeadsTab();

    const input = await findSearchInput();
    await act(async () => {
      input.focus();
    });
    expect(input).toHaveFocus();

    // Continuous typing — each keystroke changes the query key and starts a
    // new fetch; the tree must stay mounted (no skeleton swap).
    await user.type(input, 'acme');

    await waitFor(() => {
      expect(fetchLeadsMock).toHaveBeenCalledWith(expect.objectContaining({ search: 'acme' }));
    });

    const inputAfter = getSearchInput();
    // The node must be the exact same DOM element — not a remounted one.
    expect(inputAfter).toBe(input);
    // Focus must have survived every keystroke.
    expect(inputAfter).toHaveFocus();
    expect(inputAfter.value).toBe('acme');
    // Filtering actually happened for every intermediate keystroke.
    const searched = fetchLeadsMock.mock.calls.map((c) => (c[0] as { search?: string })?.search);
    expect(searched).toContain('a');
    expect(searched).toContain('ac');
    expect(searched).toContain('acm');
    expect(searched).toContain('acme');
  });

  it('supports caret edits: mid-word insert, select-and-replace, and backspace', async () => {
    const user = userEvent.setup();
    renderLeadsTab();

    const input = await findSearchInput();
    await act(async () => {
      input.focus();
    });
    await user.type(input, 'acme');
    expect(input.value).toBe('acme');

    // Insert in the middle: caret after "ac", type "X" -> "acXme"
    input.setSelectionRange(2, 2);
    await user.keyboard('X');
    expect(input.value).toBe('acXme');
    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(3);

    // Backspace removes the inserted char -> "acme", caret back at 2
    await user.keyboard('{backspace}');
    expect(input.value).toBe('acme');
    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(2);

    // Select "ac" and replace by typing "Z" -> "Zme"
    input.setSelectionRange(0, 2);
    await user.keyboard('Z');
    expect(input.value).toBe('Zme');
    expect(input).toHaveFocus();

    // Same node throughout all edits
    expect(getSearchInput()).toBe(input);
  });

  it('clear button clears the query and keeps focus on the input', async () => {
    const user = userEvent.setup();
    renderLeadsTab();

    const input = await findSearchInput();
    await act(async () => {
      input.focus();
    });
    await user.type(input, 'acme');
    await waitFor(() => {
      expect(fetchLeadsMock).toHaveBeenCalledWith(expect.objectContaining({ search: 'acme' }));
    });

    const clearButton = screen.getByLabelText('Clear search');
    // preventDefault on mousedown keeps focus on the input through the click.
    await user.click(clearButton);

    await waitFor(() => {
      expect(fetchLeadsMock).toHaveBeenLastCalledWith(expect.objectContaining({ search: undefined }));
    });
    expect(input.value).toBe('');
    expect(input).toHaveFocus();
    // Same node — clearing must not remount the input either.
    expect(getSearchInput()).toBe(input);
    // The clear button disappears once the query is empty.
    expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();
  });

  it('updates the rendered results when a filtered response arrives (filtering still works)', async () => {
    const user = userEvent.setup();
    renderLeadsTab();

    // The lead name renders in BOTH the mobile card view and the desktop
    // table view, so assert on the results count line instead of a single node.
    await screen.findByText(/1 lead( found)?|lead.*found/i);
    expect(screen.getByText(/1 lead/)).toBeInTheDocument();

    // Every subsequent fetch (one per keystroke of 'nomatch') returns no rows.
    fetchLeadsMock.mockReset();
    fetchLeadsMock.mockResolvedValue(makePage([], 0));
    const input = await findSearchInput();
    await act(async () => {
      input.focus();
    });
    await user.type(input, 'nomatch');

    await waitFor(() => {
      expect(fetchLeadsMock).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'nomatch' }));
    });
    await waitFor(() => {
      expect(screen.getByText(/0 leads/)).toBeInTheDocument();
    });
    // Input still mounted and focused after results swapped to empty state.
    expect(getSearchInput()).toBe(input);
    expect(input).toHaveFocus();
    expect(screen.getByText('No leads found')).toBeInTheDocument();
  });
});
