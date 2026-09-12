import { create } from 'zustand';

export type DashboardType = 'executive' | 'sales' | 'ai' | 'ops';
export type AnalyticsPeriod = '7d' | '30d' | '90d' | '1y';

interface AnalyticsState {
  // Active dashboard view
  activeDashboard: DashboardType;
  setActiveDashboard: (dashboard: DashboardType) => void;

  // Period selector
  period: AnalyticsPeriod;
  setPeriod: (period: AnalyticsPeriod) => void;

  // Cached analytics data
  analyticsData: Record<string, unknown> | null;
  setAnalyticsData: (data: Record<string, unknown> | null) => void;

  // Loading states
  loading: boolean;
  setLoading: (loading: boolean) => void;

  // Error state
  error: string | null;
  setError: (error: string | null) => void;

  // Last refreshed timestamp
  lastRefreshed: Date | null;
  setLastRefreshed: (date: Date) => void;

  // Realtime connection status
  realtimeConnected: boolean;
  setRealtimeConnected: (connected: boolean) => void;

  // Reset
  reset: () => void;
}

const initialState = {
  activeDashboard: 'executive' as DashboardType,
  period: '30d' as AnalyticsPeriod,
  analyticsData: null,
  loading: false,
  error: null,
  lastRefreshed: null,
  realtimeConnected: false,
};

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  ...initialState,

  setActiveDashboard: (dashboard) => set({ activeDashboard: dashboard }),
  setPeriod: (period) => set({ period }),
  setAnalyticsData: (data) => set({ analyticsData: data }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setLastRefreshed: (date) => set({ lastRefreshed: date }),
  setRealtimeConnected: (connected) => set({ realtimeConnected: connected }),

  reset: () => set(initialState),
}));
