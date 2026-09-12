// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Frontend Entitlement Hooks
// Phase 4: Subscription System + Credits Engine + Plan Gates + Billing
//
// React hooks for checking plan entitlements, credit sufficiency,
// and quota status. Uses TanStack Query for caching and
// auto-refreshing.
// ═══════════════════════════════════════════════════════════════════

'use client';

import { useQuery } from '@tanstack/react-query';
import type { CreditAction } from '@/lib/credit-service';
import type { PlanType, FeatureKey, EntitlementsMap } from '@/lib/entitlement-service';
import { apiCall } from '@/lib/api-error-handler';

// ===== API RESPONSE TYPES =====

interface EntitlementsResponse {
  plan: PlanType;
  entitlements: EntitlementsMap;
  enabledFeatures: FeatureKey[];
  disabledFeatures: FeatureKey[];
  upgradeHints: Record<string, PlanType | null>;
  credits: {
    total: number;
    monthly: number;
    rollover: number;
    addons: number;
    plan: PlanType;
  };
}

interface CreditCheckResponse {
  action: string;
  cost: number;
  balance: number;
  sufficient: boolean;
  shortfall: number;
}

interface QuotaItem {
  feature: FeatureKey;
  used: number;
  limit: number | null;
  remaining: number | null;
  percentage: number | null;
  enabled: boolean;
}

interface QuotaStatusResponse {
  plan: PlanType;
  quotas: QuotaItem[];
}

// ===== HOOK: useEntitlements =====

/**
 * Hook to check plan entitlements.
 * Fetches the user's plan entitlements, enabled/disabled features,
 * upgrade hints, and credit balance. Provides helper functions
 * for checking feature access.
 *
 * @example
 * const { canAccess, entitlements, isLoading } = useEntitlements();
 * if (canAccess('deep_analysis')) { ... }
 */
export function useEntitlements() {
  const { data, isLoading, error, refetch } = useQuery<EntitlementsResponse>({
    queryKey: ['entitlements'],
    queryFn: async () => {
      return apiCall<EntitlementsResponse>('/api/entitlements', undefined, {
        errorMessage: 'Failed to fetch entitlements',
        showToast: false,
      });
    },
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });

  /**
   * Check if the current plan has access to a specific feature.
   */
  function canAccess(feature: FeatureKey): boolean {
    if (!data) return false;
    return data.enabledFeatures.includes(feature);
  }

  /**
   * Check if the current plan has access to multiple features.
   * Returns true only if ALL features are accessible.
   */
  function canAccessAll(features: FeatureKey[]): boolean {
    if (!data) return false;
    return features.every((f) => data.enabledFeatures.includes(f));
  }

  /**
   * Check if the current plan has access to any of the given features.
   */
  function canAccessAny(features: FeatureKey[]): boolean {
    if (!data) return false;
    return features.some((f) => data.enabledFeatures.includes(f));
  }

  /**
   * Get the minimum plan needed to unlock a feature.
   */
  function getUpgradePlan(feature: FeatureKey): PlanType | null {
    if (!data) return null;
    return data.upgradeHints[feature] ?? null;
  }

  /**
   * Get the limit for a specific feature.
   * Returns null for unlimited, 0 for disabled.
   */
  function getFeatureLimit(feature: FeatureKey): number | null {
    if (!data) return 0;
    const entitlement = data.entitlements[feature];
    if (!entitlement || !entitlement.enabled) return 0;
    return entitlement.limit;
  }

  return {
    /** Current plan type */
    plan: data?.plan ?? 'free',
    /** Full entitlements map */
    entitlements: data?.entitlements ?? null,
    /** List of enabled feature keys */
    enabledFeatures: data?.enabledFeatures ?? [],
    /** List of disabled feature keys */
    disabledFeatures: data?.disabledFeatures ?? [],
    /** Upgrade hints mapping feature → required plan */
    upgradeHints: data?.upgradeHints ?? {},
    /** Credit balance info */
    credits: data?.credits ?? null,
    /** Loading state */
    isLoading,
    /** Error state */
    error,
    /** Refetch entitlements */
    refetch,
    // Helper functions
    canAccess,
    canAccessAll,
    canAccessAny,
    getUpgradePlan,
    getFeatureLimit,
  };
}

// ===== HOOK: useCreditCheck =====

/**
 * Hook to check credit sufficiency for a specific action.
 * Fetches credit check info from the backend and provides
 * a helper to determine if the user can perform the action.
 *
 * @example
 * const { hasCredits, creditInfo, isLoading } = useCreditCheck('deep_analysis');
 * if (hasCredits) { ... }
 */
export function useCreditCheck(action: CreditAction | null) {
  const { data, isLoading, error, refetch } = useQuery<CreditCheckResponse>({
    queryKey: ['credit-check', action],
    queryFn: async () => {
      return apiCall<CreditCheckResponse>('/api/entitlements/check-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      }, { errorMessage: 'Failed to check credits', showToast: false });
    },
    enabled: !!action, // Only fetch when action is provided
    staleTime: 30 * 1000, // 30 seconds (credits change frequently)
    refetchInterval: 60 * 1000, // 1 minute
  });

  return {
    /** Whether the user has enough credits for the action */
    hasCredits: data?.sufficient ?? false,
    /** Detailed credit check info */
    creditInfo: data
      ? {
          action: data.action,
          cost: data.cost,
          balance: data.balance,
          sufficient: data.sufficient,
          shortfall: data.shortfall,
        }
      : null,
    /** The cost of the action */
    cost: data?.cost ?? 0,
    /** Current credit balance */
    balance: data?.balance ?? 0,
    /** Shortfall (0 if sufficient) */
    shortfall: data?.shortfall ?? 0,
    /** Loading state */
    isLoading,
    /** Error state */
    error,
    /** Refetch credit check */
    refetch,
  };
}

// ===== HOOK: useQuotaStatus =====

/**
 * Hook to get quota status for all features.
 * Shows usage vs. limits for each feature on the user's plan.
 *
 * @example
 * const { quotas, isLoading, getQuota } = useQuotaStatus();
 * const leadQuota = getQuota('lead_discovery');
 * // { used: 5, limit: 10, remaining: 5, percentage: 50, enabled: true }
 */
export function useQuotaStatus() {
  const { data, isLoading, error, refetch } = useQuery<QuotaStatusResponse>({
    queryKey: ['quota-status'],
    queryFn: async () => {
      return apiCall<QuotaStatusResponse>('/api/entitlements/quota', undefined, {
        errorMessage: 'Failed to fetch quota status',
        showToast: false,
      });
    },
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 2 * 60 * 1000, // 2 minutes
  });

  /**
   * Get quota info for a specific feature.
   */
  function getQuota(feature: FeatureKey): QuotaItem | null {
    if (!data) return null;
    return data.quotas.find((q) => q.feature === feature) ?? null;
  }

  /**
   * Check if a feature's usage limit is reached.
   */
  function isQuotaReached(feature: FeatureKey): boolean {
    const quota = getQuota(feature);
    if (!quota) return true; // Unknown feature = no access
    if (!quota.enabled) return true; // Disabled = quota reached
    if (quota.limit === null) return false; // Unlimited
    return quota.used >= quota.limit;
  }

  /**
   * Get remaining uses for a feature.
   * Returns null for unlimited features.
   */
  function getRemaining(feature: FeatureKey): number | null {
    const quota = getQuota(feature);
    if (!quota || !quota.enabled) return 0;
    return quota.remaining;
  }

  /**
   * Get usage percentage for a feature.
   * Returns null for unlimited features.
   */
  function getUsagePercentage(feature: FeatureKey): number | null {
    const quota = getQuota(feature);
    return quota?.percentage ?? null;
  }

  return {
    /** Current plan */
    plan: data?.plan ?? 'free',
    /** All quota items */
    quotas: data?.quotas ?? [],
    /** Loading state */
    isLoading,
    /** Error state */
    error,
    /** Refetch quota status */
    refetch,
    // Helper functions
    getQuota,
    isQuotaReached,
    getRemaining,
    getUsagePercentage,
  };
}
