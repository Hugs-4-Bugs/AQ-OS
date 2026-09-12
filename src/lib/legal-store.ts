import { create } from 'zustand';

// ── Legal page types ──────────────────────────────────────────────
export type LegalPage = 'privacy' | 'terms' | 'dpa' | 'cookies';

interface LegalState {
  /** Whether the legal dialog is open */
  open: boolean;
  /** Which legal page tab is active */
  activePage: LegalPage;
  /** Open the legal dialog to a specific page */
  openLegal: (page?: LegalPage) => void;
  /** Close the legal dialog */
  closeLegal: () => void;
  /** Switch to a different legal page tab */
  setActivePage: (page: LegalPage) => void;
}

export const useLegalStore = create<LegalState>((set) => ({
  open: false,
  activePage: 'privacy',
  openLegal: (page = 'privacy') => set({ open: true, activePage: page }),
  closeLegal: () => set({ open: false }),
  setActivePage: (page) => set({ activePage: page }),
}));
