import { create } from "zustand";
// Re-export CREDIT_COSTS, ACTION_LABELS, CreditAction from credit-costs.ts
// (single source of truth — keeps the client-side store in sync with the
// backend credit-service.ts which uses the same module). Previously this
// file carried a STALE copy (deep_analysis=5 vs the real 1.5, etc.) which
// caused the client to display wrong prices and the
// `subscription-store.test.ts > CREDIT_COSTS consistency` test to fail.
// The actual charged values are unchanged — credit-costs.ts remains the
// authoritative source used by the backend deduction path.
import {
  CREDIT_COSTS,
  ACTION_LABELS,
  type CreditAction,
} from "./credit-costs";
export { CREDIT_COSTS, ACTION_LABELS, type CreditAction };

// ===== Plan Types =====
export type PlanType = "free" | "starter" | "pro" | "elite";

export interface PlanDetails {
  name: string;
  plan: PlanType;
  priceINR: number;
  priceUSD: number;
  yearlyINR: number;
  yearlyUSD: number;
  creditsMonthly: number;
  maxLeads: number | null;
  features: string[];
  disabledFeatures: string[];
}



// ===== Plan Definitions =====
export const PLAN_DETAILS: Record<PlanType, PlanDetails> = {
  free: {
    name: "Free",
    plan: "free",
    priceINR: 0,
    priceUSD: 0,
    yearlyINR: 0,
    yearlyUSD: 0,
    creditsMonthly: 50,
    maxLeads: 10,
    features: [
      "50 credits per month",
      "Up to 10 leads",
      "Basic lead discovery",
      "Simple outreach messages",
      "Basic dashboard & stats",
      "Email support",
    ],
    disabledFeatures: [
      "Deep lead analysis",
      "Outreach sequences",
      "Sales coaching",
      "Proposal generation",
      "Competitor analysis",
      "White-label reports",
      "Team collaboration",
    ],
  },
  starter: {
    name: "Starter",
    plan: "starter",
    // AcquisitionOS subscription pricing (Starter monthly price update, Sep 2026).
    //   Starter Monthly: ₹399/month (reduced from ₹499; ₹471 incl. 18% GST)
    //   Starter Yearly:  ₹4,999/year (unchanged; ≈ ₹416/month billed annually)
    priceINR: 399,
    priceUSD: 5,
    yearlyINR: 4999,
    yearlyUSD: 60,
    creditsMonthly: 150,
    maxLeads: 25,
    features: [
      "150 credits per month",
      "Up to 25 leads",
      "Basic lead discovery",
      "Simple outreach messages",
      "Email support",
      "Basic dashboard",
    ],
    disabledFeatures: [
      "Deep lead analysis",
      "Outreach sequences",
      "Sales coaching",
      "Proposal generation",
      "Competitor analysis",
      "White-label reports",
      "Team collaboration",
    ],
  },
  pro: {
    name: "Pro",
    plan: "pro",
    // AcquisitionOS subscription pricing (final plan update, Sep 2026).
    //   Pro Monthly:  ₹1,599/month
    //   Pro Yearly:   ₹14,999/year  (≈ ₹1,249/month billed annually — Save ₹4,189/year vs monthly)
    priceINR: 1599,
    priceUSD: 19,
    yearlyINR: 14999,
    yearlyUSD: 180,
    creditsMonthly: 750,
    maxLeads: null,
    features: [
      "750 credits per month",
      "Unlimited leads",
      "All AI-powered features",
      "Deep lead analysis",
      "Outreach sequences",
      "Sales coaching sessions",
      "Proposal generation",
      "Competitor analysis",
      "Data export (PDF)",
      "Priority support",
    ],
    disabledFeatures: [
      "White-label reports",
      "Team collaboration",
      "Custom integrations",
    ],
  },
  elite: {
    name: "Elite",
    plan: "elite",
    // AcquisitionOS subscription pricing (final plan update, Sep 2026).
    //   Elite Monthly: ₹5,199/month
    //   Elite Yearly:  ₹44,999/year (≈ ₹3,749/month billed annually — Save ₹17,389/year vs monthly)
    priceINR: 5199,
    priceUSD: 63,
    yearlyINR: 44999,
    yearlyUSD: 540,
    creditsMonthly: 2000,
    maxLeads: null,
    features: [
      "2,000 credits per month",
      "Unlimited everything",
      "All Pro features +",
      "White-label reports",
      "Team collaboration (up to 10)",
      "Custom integrations",
      "Dedicated account manager",
      "Custom AI training",
      "API access",
      "SLA guarantee",
    ],
    disabledFeatures: [],
  },
};

// ===== Plan level hierarchy for upgrade checks =====
const PLAN_LEVELS: Record<PlanType, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  elite: 3,
};

// ===== Backend Subscription Data (from /api/subscriptions/current) =====
export interface BackendSubscriptionData {
  subscription: {
    id: string;
    plan: PlanType;
    status: "trialing" | "active" | "past_due" | "canceled" | "expired";
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    scheduledPlanChange: string | null;
  } | null;
  planDetails: PlanDetails;
  trialInfo: {
    isTrial: boolean;
    trialEndsAt: string | null;
    daysRemaining: number;
    isExpired?: boolean;
    hasUsedTrial?: boolean;
  };
  creditBalance: {
    total: number;
    monthly: number;
    rollover: number;
    addons: number;
    plan: PlanType;
    percentage: number;
    /** Part 2 — daily outreach quota snapshot (absent on older
     * backend responses; the store keeps its last known values). */
    dailyOutreach?: {
      used: number;
      limit: number | null;
      remaining: number | null;
      resetsAt: string | null;
      timezone: string;
    };
  };
}

// ===== Backend Entitlements Data (from /api/subscriptions/entitlements) =====
export interface BackendEntitlementsData {
  plan: PlanType;
  planLevel: number;
  entitlements: Record<string, { limit: number | null; enabled: boolean }>;
  disabledFeatures: string[];
  totalFeatures: number;
  enabledFeaturesCount: number;
  disabledFeaturesCount: number;
}

// ===== Subscription sync state (P3, permanent fix Sep 2026) =====
// The client NEVER treats "loading / never verified / temporarily
// unavailable" as a Free entitlement:
//   idle        — no authoritative data yet (initial state)
//   loading     — a sync is in flight
//   verified    — at least one authoritative lookup succeeded
//   unavailable — the latest sync failed with an infrastructure error;
//                 the last-KNOWN-GOOD plan is PRESERVED (never reset to free)
// Only an authoritative backend response may change currentPlan.
export type SubscriptionSyncState = 'idle' | 'loading' | 'verified' | 'unavailable';

// ===== Store Interface =====
interface SubscriptionState {
  // Plan info
  currentPlan: PlanType;
  subscriptionStatus: "trialing" | "active" | "past_due" | "canceled" | "expired";
  billingCycle: "monthly" | "yearly";

  // Credit info
  credits: number;
  creditsMonthly: number;
  rolloverCredits: number;
  addonCredits: number;

  // Part 2 — daily outreach quota (authoritative from backend; cosmetic
  // until first sync — enforcement is ALWAYS server-side)
  dailyOutreachUsed: number;
  dailyOutreachLimit: number | null;
  dailyOutreachRemaining: number | null;
  dailyOutreachResetsAt: string | null;
  dailyOutreachTimezone: string;

  // Trial info
  isTrial: boolean;
  trialEndsAt: string | null;
  trialDaysRemaining: number;

  // Entitlements
  entitlements: Record<string, { limit: number | null; enabled: boolean }> | null;
  disabledFeatures: string[];

  // Credit warning
  creditWarningStatus: "ok" | "low" | "zero";

  // Sync state (P3) — see SubscriptionSyncState above
  syncState: SubscriptionSyncState;
  hasEverVerified: boolean;

  // Loading state
  isLoading: boolean;
  lastFetchedAt: number | null;

  // Computed
  canPerform: (action: CreditAction) => boolean;
  isPlanLocked: (action: CreditAction) => boolean;
  getUpgradePlanForAction: (action: CreditAction) => PlanType | null;
  deductCredits: (action: CreditAction) => boolean;
  getActionCost: (action: CreditAction) => number;
  getPlanDetails: () => PlanDetails;
  getCreditPercentage: () => number;
  hasFeatureAccess: (feature: string) => boolean;
  getUpgradePlanForFeature: (feature: string) => PlanType | null;

  // Setters (used by hooks to sync from backend)
  setPlan: (plan: PlanType) => void;
  setCredits: (remaining: number, monthly: number) => void;
  setTrial: (isTrial: boolean, trialEndsAt: string | null) => void;
  setEntitlements: (entitlements: Record<string, { limit: number | null; enabled: boolean }>) => void;
  setSubscriptionStatus: (status: string) => void;
  setRolloverCredits: (amount: number) => void;
  setAddonCredits: (amount: number) => void;
  setCreditWarningStatus: (status: "ok" | "low" | "zero") => void;
  setLoading: (loading: boolean) => void;
  markUnavailable: () => void;
  syncFromBackend: (data: BackendSubscriptionData) => void;
  syncEntitlements: (data: BackendEntitlementsData) => void;
  syncFromAuth: (plan: string) => void;
  reset: () => void;
}

// ===== Default state values =====
const DEFAULT_STATE = {
  currentPlan: "free" as PlanType,
  subscriptionStatus: "trialing" as const,
  billingCycle: "monthly" as const,
  credits: 50,
  creditsMonthly: 50,
  rolloverCredits: 0,
  addonCredits: 0,
  dailyOutreachUsed: 0,
  dailyOutreachLimit: null as number | null,
  dailyOutreachRemaining: null as number | null,
  dailyOutreachResetsAt: null as string | null,
  dailyOutreachTimezone: "UTC",
  isTrial: true,
  trialEndsAt: null as string | null,
  trialDaysRemaining: 14,
  entitlements: null as Record<string, { limit: number | null; enabled: boolean }> | null,
  disabledFeatures: PLAN_DETAILS.free.disabledFeatures,
  creditWarningStatus: "ok" as const,
  syncState: "idle" as SubscriptionSyncState,
  hasEverVerified: false,
  isLoading: false,
  lastFetchedAt: null as number | null,
};

// ===== LOCAL CACHE (prevents subscription flickering on page load) =====
// On page load, the store starts with DEFAULT_STATE (free/50/trial).
// The sync hook fetches /api/subscriptions/current asynchronously —
// during the fetch (1-3 seconds), the UI shows DEFAULT_STATE (free/50).
// This causes Pro/Elite users to briefly see "Free / 50 credits / trial"
// before the correct plan loads.
//
// FIX: Cache the last-known-good subscription state in localStorage.
// On page load, initialize from the cache instead of DEFAULT_STATE.
// The sync hook still refreshes in the background — but the UI starts
// with the correct plan/credits from the cache, eliminating flicker.
const CACHE_KEY = 'aqos_subscription_cache';
const CACHE_FIELDS = [
  'currentPlan', 'subscriptionStatus', 'billingCycle',
  'credits', 'creditsMonthly', 'rolloverCredits', 'addonCredits',
  'dailyOutreachUsed', 'dailyOutreachLimit', 'dailyOutreachRemaining',
  'dailyOutreachResetsAt', 'dailyOutreachTimezone',
  'isTrial', 'trialEndsAt', 'trialDaysRemaining',
  'disabledFeatures', 'creditWarningStatus',
  'hasEverVerified', 'lastFetchedAt',
] as const;

function loadCachedState(): Partial<typeof DEFAULT_STATE> {
  if (typeof window === 'undefined') return {}; // SSR safe
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    // Only restore known fields + only if hasEverVerified was true
    // (don't restore a cache that was never successfully synced)
    if (!parsed.hasEverVerified) return {};
    const result: Record<string, unknown> = {};
    for (const field of CACHE_FIELDS) {
      if (field in parsed) {
        result[field] = parsed[field];
      }
    }
    // Mark as "loading" — the sync hook will verify this cache is still current
    result.syncState = 'loading';
    result.isLoading = true;
    return result as Partial<typeof DEFAULT_STATE>;
  } catch {
    return {};
  }
}

function saveCachedState(state: Partial<SubscriptionState>): void {
  if (typeof window === 'undefined') return; // SSR safe
  try {
    const toCache: Record<string, unknown> = {};
    for (const field of CACHE_FIELDS) {
      if (field in state) {
        toCache[field] = (state as Record<string, unknown>)[field];
      }
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(toCache));
  } catch {
    // localStorage might be full or disabled — non-fatal
  }
}

function clearCachedState(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // non-fatal
  }
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  ...DEFAULT_STATE,
  ...loadCachedState(), // Restore last-known-good state from localStorage (prevents flicker)

  // ── Computed: canPerform ──────────────────────────────────────
  // Checks BOTH credits AND entitlements before allowing an action
  canPerform: (action: CreditAction) => {
    const { credits, entitlements } = get();
    const cost = CREDIT_COSTS[action];

    // Must have enough credits
    if (credits < cost) return false;

    // Must have entitlement enabled for this action
    if (entitlements) {
      const entitlement = entitlements[action];
      if (entitlement && !entitlement.enabled) return false;
    }

    return true;
  },

  // ── Computed: isPlanLocked ────────────────────────────────────
  // Returns true if the action is locked by plan (entitlement disabled), not credits
  isPlanLocked: (action: CreditAction) => {
    const { entitlements } = get();
    if (!entitlements) return false; // If no entitlements loaded, not locked
    const entitlement = entitlements[action];
    if (entitlement && !entitlement.enabled) return true;
    return false;
  },

  // ── Computed: getUpgradePlanForAction ───────────────────────────
  // Returns the minimum plan needed to unlock a credit action
  getUpgradePlanForAction: (action: CreditAction) => {
    return get().getUpgradePlanForFeature(action);
  },

  // ── Computed: deductCredits ──────────────────────────────────
  // Deducts credits locally (optimistic). Returns false if insufficient.
  deductCredits: (action: CreditAction) => {
    const { credits } = get();
    const cost = CREDIT_COSTS[action];
    if (credits < cost) return false;
    set({ credits: credits - cost });
    // Update warning status after deduction
    const { credits: newCredits, creditsMonthly } = get();
    if (newCredits <= 0) {
      set({ creditWarningStatus: "zero" });
    } else if (newCredits <= creditsMonthly * 0.2) {
      set({ creditWarningStatus: "low" });
    }
    return true;
  },

  // ── Computed: getActionCost ──────────────────────────────────
  getActionCost: (action: CreditAction) => {
    return CREDIT_COSTS[action];
  },

  // ── Computed: getPlanDetails ─────────────────────────────────
  getPlanDetails: () => {
    const { currentPlan } = get();
    return PLAN_DETAILS[currentPlan];
  },

  // ── Computed: getCreditPercentage ────────────────────────────
  getCreditPercentage: () => {
    const { credits, creditsMonthly } = get();
    if (creditsMonthly === 0) return 0;
    return Math.round((credits / creditsMonthly) * 100);
  },

  // ── Computed: hasFeatureAccess ───────────────────────────────
  // Checks the entitlements map for a feature key
  hasFeatureAccess: (feature: string) => {
    const { entitlements } = get();
    if (!entitlements) return true; // If no entitlements loaded, allow access (graceful)
    const entitlement = entitlements[feature];
    if (!entitlement) return false; // Unknown feature, deny by default (secure default)
    return entitlement.enabled;
  },

  // ── Computed: getUpgradePlanForFeature ───────────────────────
  // Returns the minimum plan needed for a disabled feature, or null if accessible
  getUpgradePlanForFeature: (feature: string) => {
    const { entitlements } = get();
    if (!entitlements) return null;

    const entitlement = entitlements[feature];
    if (entitlement && entitlement.enabled) return null;

    // Check plans in ascending order to find the first that enables the feature
    const planOrder: PlanType[] = ["free", "starter", "pro", "elite"];
    const currentLevel = PLAN_LEVELS[get().currentPlan];

    for (const plan of planOrder) {
      if (PLAN_LEVELS[plan] <= currentLevel) continue;
      // For the static PLAN_DETAILS, check if the feature is NOT in disabledFeatures
      const planInfo = PLAN_DETAILS[plan];
      if (!planInfo.disabledFeatures.includes(feature)) {
        return plan;
      }
    }

    return null;
  },

  // ── Setters ──────────────────────────────────────────────────

  setPlan: (plan: PlanType) => {
    const details = PLAN_DETAILS[plan];
    set({
      currentPlan: plan,
      creditsMonthly: details.creditsMonthly,
      disabledFeatures: details.disabledFeatures,
    });
  },

  setCredits: (remaining: number, monthly: number) => {
    // Determine credit warning status based on new values
    let creditWarningStatus: "ok" | "low" | "zero" = "ok";
    if (remaining <= 0) {
      creditWarningStatus = "zero";
    } else if (remaining <= monthly * 0.2) {
      creditWarningStatus = "low";
    }
    set({ credits: remaining, creditsMonthly: monthly, creditWarningStatus });
  },

  setTrial: (isTrial: boolean, trialEndsAt: string | null) => {
    // Calculate days remaining
    let trialDaysRemaining = 0;
    if (isTrial && trialEndsAt) {
      const endDate = new Date(trialEndsAt);
      const now = new Date();
      trialDaysRemaining = Math.max(
        0,
        Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      );
    }
    set({ isTrial, trialEndsAt, trialDaysRemaining });
  },

  setEntitlements: (entitlements: Record<string, { limit: number | null; enabled: boolean }>) => {
    set({ entitlements });
  },

  setSubscriptionStatus: (status: string) => {
    set({
      subscriptionStatus: status as SubscriptionState["subscriptionStatus"],
    });
  },

  setRolloverCredits: (amount: number) => {
    set({ rolloverCredits: amount });
  },

  setAddonCredits: (amount: number) => {
    set({ addonCredits: amount });
  },

  setCreditWarningStatus: (status: "ok" | "low" | "zero") => {
    set({ creditWarningStatus: status });
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  // ── markUnavailable (P3) ─────────────────────────────────────
  // Infrastructure failure during sync. The plan is NEVER overwritten —
  // the last-known-good plan stays authoritative until the backend can
  // verify again. A "temporarily unavailable" state is distinguishable
  // from Free in the UI (gates must not show false upgrade prompts).
  markUnavailable: () => {
    set({
      syncState: "unavailable",
      isLoading: false,
      lastFetchedAt: Date.now(),
    });
  },

  // ── syncFromBackend ──────────────────────────────────────────
  // Updates ALL store fields from a single /api/subscriptions/current response
  syncFromBackend: (data: BackendSubscriptionData) => {
    const sub = data.subscription;
    const trial = data.trialInfo;
    const credits = data.creditBalance;

    // Determine subscription status
    const subscriptionStatus = sub?.status ?? "trialing";
    const currentPlan = sub?.plan ?? credits.plan ?? "free";

    // Determine billing cycle from period dates
    let billingCycle: "monthly" | "yearly" = "monthly";
    if (sub?.currentPeriodStart && sub?.currentPeriodEnd) {
      const start = new Date(sub.currentPeriodStart);
      const end = new Date(sub.currentPeriodEnd);
      const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 180) billingCycle = "yearly";
    }

    // Calculate trial days remaining
    let trialDaysRemaining = 0;
    if (trial.isTrial && trial.trialEndsAt) {
      const endDate = new Date(trial.trialEndsAt);
      const now = new Date();
      trialDaysRemaining = Math.max(
        0,
        Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      );
    }

    // Determine credit warning
    let creditWarningStatus: "ok" | "low" | "zero" = "ok";
    if (credits.total <= 0) {
      creditWarningStatus = "zero";
    } else if (credits.total <= credits.monthly * 0.2) {
      creditWarningStatus = "low";
    }

    set({
      currentPlan,
      subscriptionStatus,
      billingCycle,
      credits: credits.total,
      creditsMonthly: credits.monthly,
      rolloverCredits: credits.rollover,
      addonCredits: credits.addons,
      ...(credits.dailyOutreach
        ? {
            dailyOutreachUsed: credits.dailyOutreach.used,
            dailyOutreachLimit: credits.dailyOutreach.limit,
            dailyOutreachRemaining: credits.dailyOutreach.remaining,
            dailyOutreachResetsAt: credits.dailyOutreach.resetsAt,
            dailyOutreachTimezone: credits.dailyOutreach.timezone,
          }
        : {}),
      isTrial: trial.isTrial,
      trialEndsAt: trial.trialEndsAt,
      trialDaysRemaining: trial.daysRemaining ?? trialDaysRemaining,
      disabledFeatures: data.planDetails?.disabledFeatures ?? PLAN_DETAILS[currentPlan].disabledFeatures,
      creditWarningStatus,
      // P3: this IS the authoritative verification
      syncState: "verified",
      hasEverVerified: true,
      lastFetchedAt: Date.now(),
      isLoading: false,
    });
    // Persist to localStorage so the next page load starts with correct plan/credits
    saveCachedState(get());
  },

  // ── syncEntitlements ─────────────────────────────────────────
  // Updates entitlements from /api/subscriptions/entitlements response
  syncEntitlements: (data: BackendEntitlementsData) => {
    set({
      entitlements: data.entitlements,
      disabledFeatures: data.disabledFeatures,
    });
  },

  // ── syncFromAuth ─────────────────────────────────────────────
  // Called IMMEDIATELY when the auth user object becomes available
  // (from /api/auth/me or JWT). Sets the plan + estimated credits from
  // the auth state BEFORE the subscription API fetch completes.
  //
  // This is the PRIMARY fix for subscription flickering:
  //   1. Page loads → auth fetches /api/auth/me → user.plan = "pro"
  //   2. syncFromAuth("pro") → store immediately sets currentPlan="pro",
  //      creditsMonthly=PLAN_CREDITES["pro"] — NO Free flicker
  //   3. useSubscriptionSync fetches /api/subscriptions/current (async)
  //   4. syncFromBackend updates with exact credits/trial/daily-outreach
  //   5. If subscription API fails (503) → store keeps auth-derived plan
  //      (pro), does NOT fall back to Free
  //
  // Priority: auth (immediate) > subscription API (authoritative) >
  //           localStorage cache (hydration fallback) > DEFAULT_STATE
  syncFromAuth: (plan: string) => {
    const currentPlan = (plan || 'free') as PlanType;
    const planDetails = PLAN_DETAILS[currentPlan];
    if (!planDetails) return; // unknown plan — don't change anything

    // Only update if the plan actually changed from what we have.
    // This prevents unnecessary re-renders when auth and store agree.
    const current = get();
    if (current.currentPlan === currentPlan && current.syncState === 'verified') {
      return; // already correct and verified — no need to update
    }

    set({
      currentPlan,
      creditsMonthly: planDetails.creditsMonthly,
      // Don't override credits if we already have a verified exact value
      // (the subscription API gives exact credits; auth only gives plan)
      ...(current.syncState !== 'verified' ? {
        credits: planDetails.creditsMonthly, // estimate from plan
      } : {}),
      disabledFeatures: planDetails.disabledFeatures,
      // Mark as "loading" — the subscription API will verify exact values
      syncState: current.syncState === 'verified' ? 'verified' : 'loading',
      isLoading: current.syncState !== 'verified',
    });
  },

  // ── reset ────────────────────────────────────────────────────
  // Resets store to default values (used on logout)
  reset: () => {
    clearCachedState(); // Clear localStorage on logout
    set(DEFAULT_STATE);
  },
}));
