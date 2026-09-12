'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useSubscriptionStore,
  type CreditAction,
  type BackendSubscriptionData,
  type BackendEntitlementsData,
} from '@/lib/subscription-store';
import { apiCall } from '@/lib/api-error-handler';

// ═══════════════════════════════════════════════════════════════
// Response types from API routes
// ═══════════════════════════════════════════════════════════════

interface CreditsResponse {
  credits: number;
  creditsMonthly: number;
  rolloverCredits: number;
  addonCredits: number;
  plan: string;
  isTrial: boolean;
  creditWarning: 'ok' | 'low' | 'zero';
  percentage: number;
  creditActionEntitlements: Record<string, { cost: number; enabled: boolean; limit: number | null }>;
}

interface DeductResponse {
  success: boolean;
  credits: number;
  deducted: number;
  action: string;
  alreadyProcessed?: boolean;
  ledgerEntryId?: string;
  creditWarning: 'ok' | 'low' | 'zero';
  percentage: number;
}

// ═══════════════════════════════════════════════════════════════
// useSubscriptionSync — One-time sync hook for AuthGate
// Fetches all subscription data and syncs to the store.
// Call this once in AuthGate after user is authenticated.
// ═══════════════════════════════════════════════════════════════

export function useSubscriptionSync() {
  const {
    syncFromBackend,
    syncEntitlements,
    setLoading,
    lastFetchedAt,
  } = useSubscriptionStore();
  const hasSynced = useRef(false);

  useEffect(() => {
    // Only sync once per mount, or if data is stale (>5 min)
    const isStale = !lastFetchedAt || Date.now() - lastFetchedAt > 5 * 60 * 1000;
    if (hasSynced.current && !isStale) return;

    let cancelled = false;

    const fetchAll = async () => {
      setLoading(true);
      try {
        // Fetch subscription status and entitlements in parallel
        const [subResult, entResult] = await Promise.allSettled([
          apiCall<BackendSubscriptionData>('/api/subscriptions/current', {
            credentials: 'include',
          }, { errorMessage: 'Failed to sync subscription', showToast: false }),
          apiCall<BackendEntitlementsData>('/api/subscriptions/entitlements', {
            credentials: 'include',
          }, { errorMessage: 'Failed to sync entitlements', showToast: false }),
        ]);

        // Sync subscription data
        if (subResult.status === 'fulfilled' && !cancelled) {
          syncFromBackend(subResult.value);
        }

        // Sync entitlements data
        if (entResult.status === 'fulfilled' && !cancelled) {
          syncEntitlements(entResult.value);
        }

        // If subscription fetch failed, try credits endpoint as fallback
        if (subResult.status === 'rejected') {
          try {
            const creditsData = await apiCall<CreditsResponse>('/api/credits', {
              credentials: 'include',
            }, { errorMessage: 'Failed to fetch credits', showToast: false });
            
            if (!cancelled) {
              // Build minimal BackendSubscriptionData from credits response
              syncFromBackend({
                subscription: {
                  id: '',
                  plan: creditsData.plan as 'free' | 'pro' | 'elite',
                  status: creditsData.isTrial ? 'trialing' : 'active',
                  currentPeriodStart: null,
                  currentPeriodEnd: null,
                  cancelAtPeriodEnd: false,
                  scheduledPlanChange: null,
                },
                planDetails: {
                  name: creditsData.plan.charAt(0).toUpperCase() + creditsData.plan.slice(1),
                  plan: creditsData.plan as 'free' | 'pro' | 'elite',
                  priceINR: 0,
                  priceUSD: 0,
                  yearlyINR: 0,
                  yearlyUSD: 0,
                  creditsMonthly: creditsData.creditsMonthly,
                  maxLeads: null,
                  features: [],
                  disabledFeatures: [],
                },
                trialInfo: {
                  isTrial: creditsData.isTrial,
                  trialEndsAt: null,
                  daysRemaining: 14,
                },
                creditBalance: {
                  total: creditsData.credits,
                  monthly: creditsData.creditsMonthly,
                  rollover: creditsData.rolloverCredits,
                  addons: creditsData.addonCredits,
                  plan: creditsData.plan as 'free' | 'pro' | 'elite',
                  percentage: creditsData.percentage,
                },
              });
            }
          } catch {
            // Credits fallback also failed — store will use defaults
          }
        }
      } catch (error) {
        console.error('[useSubscriptionSync] Failed to sync subscription data:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
          hasSynced.current = true;
        }
      }
    };

    fetchAll();

    return () => {
      cancelled = true;
    };
  }, [syncFromBackend, syncEntitlements, setLoading, lastFetchedAt]);
}

// ═══════════════════════════════════════════════════════════════
// useCredits — Main credits hook for components
// Fetches credit balance, handles deductions, and provides
// real-time sync with the subscription store.
// ═══════════════════════════════════════════════════════════════

export function useCredits() {
  const queryClient = useQueryClient();
  const {
    setCredits,
    setPlan,
    setTrial,
    setRolloverCredits,
    setAddonCredits,
    setCreditWarningStatus,
    setEntitlements,
    canPerform,
    deductCredits,
    getCreditPercentage,
  } = useSubscriptionStore();

  // Fetch credits from backend
  const { data, isLoading } = useQuery<CreditsResponse>({
    queryKey: ['credits'],
    queryFn: async () => {
      return apiCall<CreditsResponse>('/api/credits', {
        credentials: 'include',
      }, { errorMessage: 'Failed to fetch credits', showToast: false });
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000, // Refresh every minute
  });

  // Sync backend data to Zustand store
  useEffect(() => {
    if (data) {
      setPlan(data.plan as 'free' | 'pro' | 'elite');
      setCredits(data.credits, data.creditsMonthly);
      setTrial(data.isTrial, null);
      setRolloverCredits(data.rolloverCredits);
      setAddonCredits(data.addonCredits);
      setCreditWarningStatus(data.creditWarning);

      // Sync credit action entitlements from the credits response
      if (data.creditActionEntitlements) {
        const entitlementsMap: Record<string, { limit: number | null; enabled: boolean }> = {};
        for (const [action, info] of Object.entries(data.creditActionEntitlements)) {
          entitlementsMap[action] = { limit: info.limit, enabled: info.enabled };
        }
        setEntitlements(entitlementsMap);
      }
    }
  }, [data, setCredits, setPlan, setTrial, setRolloverCredits, setAddonCredits, setCreditWarningStatus, setEntitlements]);

  // Deduct credits mutation with enhanced 402 handling
  const deductMutation = useMutation<DeductResponse, Error, CreditAction>({
    mutationFn: async (action: CreditAction) => {
      return apiCall<DeductResponse>('/api/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      }, {
        errorMessage: 'Failed to deduct credits',
        showToast: false, // We handle errors manually below for 402/403
      }).catch((error) => {
        // Handle 402 — Insufficient credits (apiCall re-throws as ApiError)
        if (error instanceof Error && 'status' in error && (error as { status: number }).status === 402) {
          const apiErr = error as { status: number; message: string };
          // Update local warning status to reflect reality
          setCreditWarningStatus('zero');
          throw new Error(apiErr.message || 'Insufficient credits');
        }

        // Handle 403 — Feature not available on current plan
        if (error instanceof Error && 'status' in error && (error as { status: number }).status === 403) {
          throw new Error(
            error.message || 'This feature is not available on your current plan. Please upgrade.'
          );
        }

        throw error;
      });
    },
    onSuccess: (responseData) => {
      // Update both the query cache and the Zustand store
      queryClient.setQueryData(['credits'], {
        ...data,
        credits: responseData.credits,
        creditWarning: responseData.creditWarning,
        percentage: responseData.percentage,
      });
      setCredits(responseData.credits, useSubscriptionStore.getState().creditsMonthly);
      setCreditWarningStatus(responseData.creditWarning);
    },
    onError: (error) => {
      // On error, refetch credits to get the real balance (optimistic deduction may have been wrong)
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      console.error('[useCredits] Deduction error:', error.message);
    },
  });

  const deductCreditsAction = useCallback(
    (action: CreditAction) => {
      // First check locally for fast feedback (checks credits AND entitlements)
      if (!canPerform(action)) return false;
      // Optimistically deduct locally
      deductCredits(action);
      // Then deduct on backend
      deductMutation.mutate(action);
      return true;
    },
    [canPerform, deductCredits, deductMutation]
  );

  return {
    credits: useSubscriptionStore((s) => s.credits),
    creditsMonthly: useSubscriptionStore((s) => s.creditsMonthly),
    currentPlan: useSubscriptionStore((s) => s.currentPlan),
    isTrial: useSubscriptionStore((s) => s.isTrial),
    trialEndsAt: useSubscriptionStore((s) => s.trialEndsAt),
    trialDaysRemaining: useSubscriptionStore((s) => s.trialDaysRemaining),
    rolloverCredits: useSubscriptionStore((s) => s.rolloverCredits),
    addonCredits: useSubscriptionStore((s) => s.addonCredits),
    subscriptionStatus: useSubscriptionStore((s) => s.subscriptionStatus),
    creditWarningStatus: useSubscriptionStore((s) => s.creditWarningStatus),
    entitlements: useSubscriptionStore((s) => s.entitlements),
    disabledFeatures: useSubscriptionStore((s) => s.disabledFeatures),
    percentage: getCreditPercentage(),
    isLoading,
    canPerform,
    deductCredits: deductCreditsAction,
    isDeducting: deductMutation.isPending,
    deductError: deductMutation.error,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['credits'] }),
  };
}
