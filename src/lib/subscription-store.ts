import { create } from "zustand";

// ===== Plan Types =====
export type PlanType = "free" | "pro" | "elite";

export type CreditAction =
  | "lead_discovery"
  | "deep_analysis"
  | "outreach_message"
  | "outreach_sequence"
  | "sales_coaching"
  | "proposal_generation"
  | "competitor_analysis"
  | "data_export";

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

// ===== Credit Costs =====
export const CREDIT_COSTS: Record<CreditAction, number> = {
  lead_discovery: 1,
  deep_analysis: 5,
  outreach_message: 2,
  outreach_sequence: 8,
  sales_coaching: 3,
  proposal_generation: 10,
  competitor_analysis: 8,
  data_export: 5,
};

export const ACTION_LABELS: Record<CreditAction, string> = {
  lead_discovery: "Lead Discovery",
  deep_analysis: "Deep Lead Analysis",
  outreach_message: "Outreach Message",
  outreach_sequence: "Outreach Sequence",
  sales_coaching: "Sales Coaching",
  proposal_generation: "Proposal Generation",
  competitor_analysis: "Competitor Analysis",
  data_export: "Data Export (PDF)",
};

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
  pro: {
    name: "Pro",
    plan: "pro",
    // AcquisitionOS subscription pricing (Sep 2026).
    //   Pro Monthly:  ₹1,599/month
    //   Pro Yearly:   ₹11,999/year  (≈ ₹999/month billed annually — Save ₹7,189/year vs monthly)
    priceINR: 1599,
    priceUSD: 19,
    yearlyINR: 11999,
    yearlyUSD: 144,
    creditsMonthly: 500,
    maxLeads: null,
    features: [
      "500 credits per month",
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
    // AcquisitionOS subscription pricing (Sep 2026).
    //   Elite Monthly: ₹5,199/month
    //   Elite Yearly:  ₹37,999/year (≈ ₹3,166/month billed annually — Save ₹24,389/year vs monthly)
    priceINR: 5199,
    priceUSD: 63,
    yearlyINR: 37999,
    yearlyUSD: 456,
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
  pro: 1,
  elite: 2,
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

  // Trial info
  isTrial: boolean;
  trialEndsAt: string | null;
  trialDaysRemaining: number;

  // Entitlements
  entitlements: Record<string, { limit: number | null; enabled: boolean }> | null;
  disabledFeatures: string[];

  // Credit warning
  creditWarningStatus: "ok" | "low" | "zero";

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
  syncFromBackend: (data: BackendSubscriptionData) => void;
  syncEntitlements: (data: BackendEntitlementsData) => void;
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
  isTrial: true,
  trialEndsAt: null as string | null,
  trialDaysRemaining: 14,
  entitlements: null as Record<string, { limit: number | null; enabled: boolean }> | null,
  disabledFeatures: PLAN_DETAILS.free.disabledFeatures,
  creditWarningStatus: "ok" as const,
  isLoading: false,
  lastFetchedAt: null as number | null,
};

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  ...DEFAULT_STATE,

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
    const planOrder: PlanType[] = ["free", "pro", "elite"];
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
      isTrial: trial.isTrial,
      trialEndsAt: trial.trialEndsAt,
      trialDaysRemaining: trial.daysRemaining ?? trialDaysRemaining,
      disabledFeatures: data.planDetails?.disabledFeatures ?? PLAN_DETAILS[currentPlan].disabledFeatures,
      creditWarningStatus,
      lastFetchedAt: Date.now(),
      isLoading: false,
    });
  },

  // ── syncEntitlements ─────────────────────────────────────────
  // Updates entitlements from /api/subscriptions/entitlements response
  syncEntitlements: (data: BackendEntitlementsData) => {
    set({
      entitlements: data.entitlements,
      disabledFeatures: data.disabledFeatures,
    });
  },

  // ── reset ────────────────────────────────────────────────────
  // Resets store to default values (used on logout)
  reset: () => {
    set(DEFAULT_STATE);
  },
}));
