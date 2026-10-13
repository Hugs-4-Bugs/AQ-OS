(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/lib/auth-store.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useAuthStore",
    ()=>useAuthStore
]);
// AcquisitionOS — Client-side Auth Store (Zustand)
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/zustand/esm/react.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/zustand/esm/middleware.mjs [app-client] (ecmascript)");
;
;
const useAuthStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["create"])()((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["persist"])((set)=>({
        user: null,
        isAuthenticated: false,
        isLoading: true,
        mfaRequired: false,
        mfaSessionToken: null,
        setUser: (user)=>set({
                user,
                isAuthenticated: !!user,
                isLoading: false,
                mfaRequired: false,
                mfaSessionToken: null
            }),
        setLoading: (isLoading)=>set({
                isLoading
            }),
        setMfaRequired: (mfaRequired, sessionToken)=>set({
                mfaRequired,
                mfaSessionToken: sessionToken || null,
                isLoading: false
            }),
        logout: ()=>set({
                user: null,
                isAuthenticated: false,
                isLoading: false,
                mfaRequired: false,
                mfaSessionToken: null
            }),
        updatePlan: (plan)=>set((state)=>({
                    user: state.user ? {
                        ...state.user,
                        plan
                    } : null
                })),
        updateEmailVerified: (emailVerified)=>set((state)=>({
                    user: state.user ? {
                        ...state.user,
                        emailVerified
                    } : null
                })),
        updateMfaEnabled: (mfaEnabled)=>set((state)=>({
                    user: state.user ? {
                        ...state.user,
                        mfaEnabled
                    } : null
                }))
    }), {
    name: 'acquisitionos-auth',
    partialize: (state)=>({
            user: state.user,
            isAuthenticated: state.isAuthenticated
        })
}));
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/subscription-store.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ACTION_LABELS",
    ()=>ACTION_LABELS,
    "CREDIT_COSTS",
    ()=>CREDIT_COSTS,
    "PLAN_DETAILS",
    ()=>PLAN_DETAILS,
    "useSubscriptionStore",
    ()=>useSubscriptionStore
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/zustand/esm/react.mjs [app-client] (ecmascript)");
;
const CREDIT_COSTS = {
    lead_discovery: 1,
    deep_analysis: 5,
    outreach_message: 2,
    outreach_sequence: 8,
    sales_coaching: 3,
    proposal_generation: 10,
    competitor_analysis: 8,
    data_export: 5
};
const ACTION_LABELS = {
    lead_discovery: "Lead Discovery",
    deep_analysis: "Deep Lead Analysis",
    outreach_message: "Outreach Message",
    outreach_sequence: "Outreach Sequence",
    sales_coaching: "Sales Coaching",
    proposal_generation: "Proposal Generation",
    competitor_analysis: "Competitor Analysis",
    data_export: "Data Export (PDF)"
};
const PLAN_DETAILS = {
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
            "Email support"
        ],
        disabledFeatures: [
            "Deep lead analysis",
            "Outreach sequences",
            "Sales coaching",
            "Proposal generation",
            "Competitor analysis",
            "White-label reports",
            "Team collaboration"
        ]
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
            "Basic dashboard"
        ],
        disabledFeatures: [
            "Deep lead analysis",
            "Outreach sequences",
            "Sales coaching",
            "Proposal generation",
            "Competitor analysis",
            "White-label reports",
            "Team collaboration"
        ]
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
            "Priority support"
        ],
        disabledFeatures: [
            "White-label reports",
            "Team collaboration",
            "Custom integrations"
        ]
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
            "SLA guarantee"
        ],
        disabledFeatures: []
    }
};
// ===== Plan level hierarchy for upgrade checks =====
const PLAN_LEVELS = {
    free: 0,
    starter: 1,
    pro: 2,
    elite: 3
};
// ===== Default state values =====
const DEFAULT_STATE = {
    currentPlan: "free",
    subscriptionStatus: "trialing",
    billingCycle: "monthly",
    credits: 50,
    creditsMonthly: 50,
    rolloverCredits: 0,
    addonCredits: 0,
    isTrial: true,
    trialEndsAt: null,
    trialDaysRemaining: 14,
    entitlements: null,
    disabledFeatures: PLAN_DETAILS.free.disabledFeatures,
    creditWarningStatus: "ok",
    syncState: "idle",
    hasEverVerified: false,
    isLoading: false,
    lastFetchedAt: null
};
const useSubscriptionStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["create"])((set, get)=>({
        ...DEFAULT_STATE,
        // ── Computed: canPerform ──────────────────────────────────────
        // Checks BOTH credits AND entitlements before allowing an action
        canPerform: (action)=>{
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
        isPlanLocked: (action)=>{
            const { entitlements } = get();
            if (!entitlements) return false; // If no entitlements loaded, not locked
            const entitlement = entitlements[action];
            if (entitlement && !entitlement.enabled) return true;
            return false;
        },
        // ── Computed: getUpgradePlanForAction ───────────────────────────
        // Returns the minimum plan needed to unlock a credit action
        getUpgradePlanForAction: (action)=>{
            return get().getUpgradePlanForFeature(action);
        },
        // ── Computed: deductCredits ──────────────────────────────────
        // Deducts credits locally (optimistic). Returns false if insufficient.
        deductCredits: (action)=>{
            const { credits } = get();
            const cost = CREDIT_COSTS[action];
            if (credits < cost) return false;
            set({
                credits: credits - cost
            });
            // Update warning status after deduction
            const { credits: newCredits, creditsMonthly } = get();
            if (newCredits <= 0) {
                set({
                    creditWarningStatus: "zero"
                });
            } else if (newCredits <= creditsMonthly * 0.2) {
                set({
                    creditWarningStatus: "low"
                });
            }
            return true;
        },
        // ── Computed: getActionCost ──────────────────────────────────
        getActionCost: (action)=>{
            return CREDIT_COSTS[action];
        },
        // ── Computed: getPlanDetails ─────────────────────────────────
        getPlanDetails: ()=>{
            const { currentPlan } = get();
            return PLAN_DETAILS[currentPlan];
        },
        // ── Computed: getCreditPercentage ────────────────────────────
        getCreditPercentage: ()=>{
            const { credits, creditsMonthly } = get();
            if (creditsMonthly === 0) return 0;
            return Math.round(credits / creditsMonthly * 100);
        },
        // ── Computed: hasFeatureAccess ───────────────────────────────
        // Checks the entitlements map for a feature key
        hasFeatureAccess: (feature)=>{
            const { entitlements } = get();
            if (!entitlements) return true; // If no entitlements loaded, allow access (graceful)
            const entitlement = entitlements[feature];
            if (!entitlement) return false; // Unknown feature, deny by default (secure default)
            return entitlement.enabled;
        },
        // ── Computed: getUpgradePlanForFeature ───────────────────────
        // Returns the minimum plan needed for a disabled feature, or null if accessible
        getUpgradePlanForFeature: (feature)=>{
            const { entitlements } = get();
            if (!entitlements) return null;
            const entitlement = entitlements[feature];
            if (entitlement && entitlement.enabled) return null;
            // Check plans in ascending order to find the first that enables the feature
            const planOrder = [
                "free",
                "starter",
                "pro",
                "elite"
            ];
            const currentLevel = PLAN_LEVELS[get().currentPlan];
            for (const plan of planOrder){
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
        setPlan: (plan)=>{
            const details = PLAN_DETAILS[plan];
            set({
                currentPlan: plan,
                creditsMonthly: details.creditsMonthly,
                disabledFeatures: details.disabledFeatures
            });
        },
        setCredits: (remaining, monthly)=>{
            // Determine credit warning status based on new values
            let creditWarningStatus = "ok";
            if (remaining <= 0) {
                creditWarningStatus = "zero";
            } else if (remaining <= monthly * 0.2) {
                creditWarningStatus = "low";
            }
            set({
                credits: remaining,
                creditsMonthly: monthly,
                creditWarningStatus
            });
        },
        setTrial: (isTrial, trialEndsAt)=>{
            // Calculate days remaining
            let trialDaysRemaining = 0;
            if (isTrial && trialEndsAt) {
                const endDate = new Date(trialEndsAt);
                const now = new Date();
                trialDaysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
            }
            set({
                isTrial,
                trialEndsAt,
                trialDaysRemaining
            });
        },
        setEntitlements: (entitlements)=>{
            set({
                entitlements
            });
        },
        setSubscriptionStatus: (status)=>{
            set({
                subscriptionStatus: status
            });
        },
        setRolloverCredits: (amount)=>{
            set({
                rolloverCredits: amount
            });
        },
        setAddonCredits: (amount)=>{
            set({
                addonCredits: amount
            });
        },
        setCreditWarningStatus: (status)=>{
            set({
                creditWarningStatus: status
            });
        },
        setLoading: (loading)=>{
            set({
                isLoading: loading
            });
        },
        // ── markUnavailable (P3) ─────────────────────────────────────
        // Infrastructure failure during sync. The plan is NEVER overwritten —
        // the last-known-good plan stays authoritative until the backend can
        // verify again. A "temporarily unavailable" state is distinguishable
        // from Free in the UI (gates must not show false upgrade prompts).
        markUnavailable: ()=>{
            set({
                syncState: "unavailable",
                isLoading: false,
                lastFetchedAt: Date.now()
            });
        },
        // ── syncFromBackend ──────────────────────────────────────────
        // Updates ALL store fields from a single /api/subscriptions/current response
        syncFromBackend: (data)=>{
            const sub = data.subscription;
            const trial = data.trialInfo;
            const credits = data.creditBalance;
            // Determine subscription status
            const subscriptionStatus = sub?.status ?? "trialing";
            const currentPlan = sub?.plan ?? credits.plan ?? "free";
            // Determine billing cycle from period dates
            let billingCycle = "monthly";
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
                trialDaysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
            }
            // Determine credit warning
            let creditWarningStatus = "ok";
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
                // P3: this IS the authoritative verification
                syncState: "verified",
                hasEverVerified: true,
                lastFetchedAt: Date.now(),
                isLoading: false
            });
        },
        // ── syncEntitlements ─────────────────────────────────────────
        // Updates entitlements from /api/subscriptions/entitlements response
        syncEntitlements: (data)=>{
            set({
                entitlements: data.entitlements,
                disabledFeatures: data.disabledFeatures
            });
        },
        // ── reset ────────────────────────────────────────────────────
        // Resets store to default values (used on logout)
        reset: ()=>{
            set(DEFAULT_STATE);
        }
    }));
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/api-error-handler.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ApiError",
    ()=>ApiError,
    "apiCall",
    ()=>apiCall,
    "getErrorFallbackMessage",
    ()=>getErrorFallbackMessage,
    "isNetworkError",
    ()=>isNetworkError,
    "isRetryableError",
    ()=>isRetryableError,
    "safeApiCall",
    ()=>safeApiCall
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Global API Error Handler
// Task 9: Comprehensive Error Handling — NO SILENT ERRORS
//
// Every API call should use this utility for consistent error handling,
// user feedback via toast notifications, retry logic, and auth redirect.
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/sonner/dist/index.mjs [app-client] (ecmascript)");
;
class ApiError extends Error {
    status;
    code;
    constructor(message, status, code){
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
}
async function apiCall(url, options, { errorMessage = 'Something went wrong', showToast = true, retryCount = 0, retryDelay = 1000, credentials = true } = {}) {
    let lastError = null;
    for(let attempt = 0; attempt <= retryCount; attempt++){
        try {
            const res = await fetch(url, {
                credentials: credentials ? 'include' : undefined,
                ...options
            });
            // ── 401 Unauthorized ──
            if (res.status === 401) {
                const data = await res.json().catch(()=>({}));
                const err = new ApiError(data.error || 'Session expired. Please sign in again.', 401, 'UNAUTHORIZED');
                // CRITICAL FIX (auto-refresh bug):
                // Do NOT call window.location.reload() here. Previously, every 401
                // response from any API would trigger a full page reload after 1.5s.
                // If a polling endpoint kept returning 401 (e.g., session briefly
                // expired or token refresh race), the page would reload every few
                // seconds, making the app unusable.
                //
                // Instead: just surface the error to the caller. The caller can
                // decide whether to redirect to login (e.g., the auth gate checks
                // auth state on mount) — but no silent background reloads.
                if (showToast) {
                    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].error(err.message);
                }
                throw err;
            }
            // ── 402 Payment Required ──
            if (res.status === 402) {
                const data = await res.json().catch(()=>({}));
                throw new ApiError(data.error || 'Payment required', 402, data.code || 'PAYMENT_REQUIRED');
            }
            // ── 429 Rate Limited ──
            if (res.status === 429) {
                throw new ApiError('Too many requests. Please wait a moment.', 429, 'RATE_LIMITED');
            }
            // ── Other non-OK responses ──
            if (!res.ok) {
                const data = await res.json().catch(()=>({}));
                const serverMessage = data.error;
                const serverCode = data.code;
                throw new ApiError(serverMessage || errorMessage, res.status, serverCode);
            }
            // ── Success ──
            return await res.json();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            // Don't retry auth errors — they need user action
            if (error instanceof ApiError && error.status === 401) {
                break;
            }
            // Don't retry on the last attempt
            if (attempt === retryCount) {
                break;
            }
            // Don't retry client errors (4xx) except 429 and 408
            if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429 && error.status !== 408) {
                break;
            }
            // Wait before retry with exponential backoff
            await new Promise((resolve)=>setTimeout(resolve, retryDelay * (attempt + 1)));
        }
    }
    // Show toast for the final error
    if (showToast && lastError) {
        const message = getErrorFallbackMessage(lastError);
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].error(message);
    }
    throw lastError || new Error(errorMessage);
}
function isNetworkError(error) {
    return error instanceof TypeError && (error.message === 'Failed to fetch' || error.message === 'NetworkError when attempting to fetch resource.' || error.message.includes('NetworkError'));
}
function getErrorFallbackMessage(error) {
    if (isNetworkError(error)) {
        return 'Network error. Please check your connection.';
    }
    if (error instanceof ApiError) {
        switch(error.status){
            case 400:
                return error.message || 'Invalid request. Please check your input.';
            case 401:
                return 'Session expired. Please sign in again.';
            case 403:
                return 'You do not have permission to perform this action.';
            case 404:
                return 'The requested resource was not found.';
            case 408:
                return 'Request timed out. Please try again.';
            case 409:
                return error.message || 'Conflict. The resource may have been modified.';
            case 422:
                return error.message || 'Validation error. Please check your input.';
            case 429:
                return 'Too many requests. Please wait a moment.';
            case 500:
                return 'Server error. Please try again later.';
            case 502:
                return 'Service temporarily unavailable.';
            case 503:
                return 'Service unavailable. Please try again later.';
            case 504:
                return 'Request timed out. The server is taking too long to respond.';
            default:
                return error.message;
        }
    }
    if (error instanceof Error) {
        return error.message;
    }
    return 'An unexpected error occurred.';
}
function isRetryableError(error) {
    if (isNetworkError(error)) return true;
    if (error instanceof ApiError) {
        return error.status === 429 || error.status === 408 || error.status >= 500;
    }
    return false;
}
async function safeApiCall(url, options, apiCallOptions) {
    try {
        return await apiCall(url, options, {
            ...apiCallOptions,
            showToast: apiCallOptions?.showToast ?? true
        });
    } catch  {
        return null;
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/cache-invalidation.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * ACCOUNT ISOLATION (client cache layer).
 *
 * Purges every account-scoped client-side cache. Called on sign-out (and
 * available for account switches) so the next authenticated account can
 * never briefly observe the previous account's data through persisted
 * browser state:
 *
 *  - React Query snapshots    → cleared via the `aqos:auth-logout` window
 *                               event (providers.tsx listens and calls
 *                               queryClient.clear()).
 *  - Discovery jobs/history   → `acquisitionos_discovery_*`
 *  - Assistant saved replies  → `acq-os-saved-responses`
 *  - Assistant pinned msgs    → `acq-os-pinned-messages`
 *  - Onboarding local mirror  → `acquisitionos_onboarding_*` (DB is the
 *                               source of truth; the mirror is re-created
 *                               from the DB on next login)
 *  - Settings-shell persists  → `war-room-settings` zustand store reset
 *
 * Theme (`acquisitionos-theme`) and the auth identity key are NOT removed
 * here: theme is device-level, and the auth store's own logout() owns the
 * identity snapshot.
 */ /** Zustand settings store with persistence (`war-room-settings`). */ __turbopack_context__.s([
    "clearAccountScopedClientState",
    ()=>clearAccountScopedClientState,
    "resetPersistedSettingsStore",
    ()=>resetPersistedSettingsStore
]);
function resetPersistedSettingsStore() {
    // Imported lazily to keep this module dependency-light and avoid cycles.
    __turbopack_context__.A("[project]/src/lib/settings-store.ts [app-client] (ecmascript, async loader)").then(({ useSettingsStore })=>useSettingsStore.getState().resetAll()).catch(()=>{
    // Store unavailable — nothing else to do.
    });
}
function clearAccountScopedClientState() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    const KEYS_TO_REMOVE = [
        'acquisitionos_discovery_jobs',
        'acquisitionos_discovery_history',
        'acq-os-saved-responses',
        'acq-os-pinned-messages',
        'acquisitionos_onboarding_completed',
        'acquisitionos_onboarding_data'
    ];
    for (const key of KEYS_TO_REMOVE){
        try {
            window.localStorage.removeItem(key);
        } catch  {
        // Storage unavailable — ignore.
        }
    }
    resetPersistedSettingsStore();
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/silent-refresh.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Silent token refresh (client, shared)
//
// WHY (2026-09-29, "Remember me does not persist" RCA):
// Every /api/auth/refresh call ROTATES the refresh token (revoke old
// session row → create new). Two concurrent refresh calls that share the
// same pre-rotation cookie (multi-tab 14-min intervals, tab-focus
// refreshes, double-mounted init effects) race: the loser reads a
// now-REVOKED session and receives 401 SESSION_REVOKED, which logs the
// user out. This module serializes all silent refreshes through the
// Web Locks API so only ONE refresh is ever in flight per browser —
// the follower always sends the freshly-rotated cookie.
//
// SECURITY: no credential values are stored or logged here. The server
// keeps its strict single-use rotation semantics; revocation, logout and
// absolute expiry are untouched.
// ═══════════════════════════════════════════════════════════════════
__turbopack_context__.s([
    "REAL_LOGOUT_CODES",
    ()=>REAL_LOGOUT_CODES,
    "isAuthoritativeLogout",
    ()=>isAuthoritativeLogout,
    "isRefreshThrottled",
    ()=>isRefreshThrottled,
    "silentRefresh",
    ()=>silentRefresh
]);
const REAL_LOGOUT_CODES = new Set([
    'NO_TOKEN',
    'INVALID_TOKEN',
    'SESSION_EXPIRED',
    'SESSION_IDLE_EXPIRED',
    'SESSION_REVOKED',
    'USER_UNAVAILABLE'
]);
function isAuthoritativeLogout(result) {
    if (result.status !== 401 && result.status !== 403) return false;
    // Legacy servers answered 401 without a code — treat as authoritative.
    if (!result.code) return true;
    return REAL_LOGOUT_CODES.has(result.code);
}
const REFRESH_LOCK_NAME = 'aqos-auth-refresh';
const REFRESH_THROTTLE_MS = 10 * 60 * 1000; // 10 minutes
let lastSuccessAt = 0;
function isRefreshThrottled() {
    return Date.now() - lastSuccessAt < REFRESH_THROTTLE_MS;
}
/** Run fn while holding the cross-tab refresh lock (Web Locks API). */ async function withRefreshLock(fn) {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (locks && typeof locks.request === 'function') {
        return locks.request(REFRESH_LOCK_NAME, fn);
    }
    // Older browsers: no cross-tab serialization available — same as before.
    return fn();
}
async function silentRefresh(options) {
    const force = options?.force === true;
    if (!force && isRefreshThrottled()) {
        return {
            ok: true,
            status: 0,
            code: 'RECENT'
        };
    }
    try {
        return await withRefreshLock(async ()=>{
            // Re-check the throttle inside the lock: another tab may have just
            // finished a successful refresh while we waited for the lock.
            if (!force && isRefreshThrottled()) {
                return {
                    ok: true,
                    status: 0,
                    code: 'RECENT'
                };
            }
            const res = await fetch('/api/auth/refresh', {
                method: 'POST',
                credentials: 'include'
            });
            let code = '';
            let user;
            try {
                const data = await res.json();
                code = data?.code || '';
                user = data?.user;
            } catch  {
            // non-JSON body — classify by status below
            }
            if (res.ok) {
                lastSuccessAt = Date.now();
                return {
                    ok: true,
                    status: res.status,
                    code: code || 'OK',
                    user
                };
            }
            return {
                ok: false,
                status: res.status,
                code
            };
        });
    } catch  {
        // Network failure — NEVER a logout; callers retry via their own loop.
        return {
            ok: false,
            status: 0,
            code: 'NETWORK_ERROR'
        };
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/types.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// AcquisitionOS — AI-Powered Client Acquisition System | Shared TypeScript Types
__turbopack_context__.s([
    "COUNTRY_OPTIONS",
    ()=>COUNTRY_OPTIONS,
    "NICHE_OPTIONS",
    ()=>NICHE_OPTIONS,
    "STAGE_CHART_COLORS",
    ()=>STAGE_CHART_COLORS,
    "STAGE_COLORS",
    ()=>STAGE_COLORS,
    "STAGE_LABELS",
    ()=>STAGE_LABELS,
    "STAGE_ORDER",
    ()=>STAGE_ORDER,
    "revenueScoreToLabel",
    ()=>revenueScoreToLabel,
    "urgencyScoreToLabel",
    ()=>urgencyScoreToLabel
]);
const STAGE_ORDER = [
    "discovered",
    "analyzed",
    "contacted",
    "replied",
    "discussion",
    "proposal",
    "negotiation",
    "won",
    "lost"
];
const STAGE_LABELS = {
    discovered: "Discovered",
    analyzed: "Analyzed",
    contacted: "Contacted",
    replied: "Replied",
    discussion: "Discussion",
    proposal: "Proposal",
    negotiation: "Negotiation",
    won: "Won",
    lost: "Lost"
};
const STAGE_COLORS = {
    discovered: "bg-slate-500",
    analyzed: "bg-cyan-500",
    contacted: "bg-blue-500",
    replied: "bg-amber-500",
    discussion: "bg-orange-500",
    proposal: "bg-purple-500",
    negotiation: "bg-pink-500",
    won: "bg-emerald-500",
    lost: "bg-red-500"
};
const STAGE_CHART_COLORS = {
    discovered: "#64748b",
    analyzed: "#06b6d4",
    contacted: "#3b82f6",
    replied: "#f59e0b",
    discussion: "#f97316",
    proposal: "#a855f7",
    negotiation: "#ec4899",
    won: "#10b981",
    lost: "#ef4444"
};
function urgencyScoreToLabel(score) {
    if (score >= 75) return "critical";
    if (score >= 50) return "high";
    if (score >= 25) return "medium";
    return "low";
}
function revenueScoreToLabel(score) {
    if (score >= 80) return "premium";
    if (score >= 55) return "high";
    if (score >= 30) return "medium";
    return "low";
}
const NICHE_OPTIONS = [
    "Restaurant",
    "Cafe",
    "Gym",
    "Salon",
    "Clinic",
    "Hotel",
    "Legal",
    "Real Estate",
    "Interior Design",
    "Repair Shop",
    "Coaching",
    "Manufacturing",
    "Logistics",
    "Service",
    "Dental",
    "Healthcare",
    "E-commerce",
    "Fitness",
    "Hospitality",
    "Education",
    "Automotive",
    "Construction"
];
const COUNTRY_OPTIONS = [
    "India",
    "UAE",
    "USA",
    "UK",
    "Canada",
    "Australia"
];
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/api.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "addCommunication",
    ()=>addCommunication,
    "analyzeLead",
    ()=>analyzeLead,
    "analyzeWebsite",
    ()=>analyzeWebsite,
    "askSalesAssistant",
    ()=>askSalesAssistant,
    "completeReminder",
    ()=>completeReminder,
    "connectGmail",
    ()=>connectGmail,
    "createCompetitorAnalysis",
    ()=>createCompetitorAnalysis,
    "createDeal",
    ()=>createDeal,
    "createGmailDraft",
    ()=>createGmailDraft,
    "createLead",
    ()=>createLead,
    "createLeadActivity",
    ()=>createLeadActivity,
    "createReminder",
    ()=>createReminder,
    "deleteCompetitorAnalysis",
    ()=>deleteCompetitorAnalysis,
    "deleteLead",
    ()=>deleteLead,
    "disconnectGmail",
    ()=>disconnectGmail,
    "discoverBusinesses",
    ()=>discoverBusinesses,
    "dismissMeetingReminder",
    ()=>dismissMeetingReminder,
    "explainScores",
    ()=>explainScores,
    "fetchCommunications",
    ()=>fetchCommunications,
    "fetchCompetitorAnalyses",
    ()=>fetchCompetitorAnalyses,
    "fetchCompetitorAnalysis",
    ()=>fetchCompetitorAnalysis,
    "fetchDeals",
    ()=>fetchDeals,
    "fetchGmailAccounts",
    ()=>fetchGmailAccounts,
    "fetchGmailStatus",
    ()=>fetchGmailStatus,
    "fetchGmailThread",
    ()=>fetchGmailThread,
    "fetchGmailThreads",
    ()=>fetchGmailThreads,
    "fetchInsights",
    ()=>fetchInsights,
    "fetchLeadActivities",
    ()=>fetchLeadActivities,
    "fetchLeadById",
    ()=>fetchLeadById,
    "fetchLeadReminders",
    ()=>fetchLeadReminders,
    "fetchLeads",
    ()=>fetchLeads,
    "fetchMeetingReminders",
    ()=>fetchMeetingReminders,
    "fetchReminders",
    ()=>fetchReminders,
    "fetchStats",
    ()=>fetchStats,
    "generateOutreach",
    ()=>generateOutreach,
    "generateProposal",
    ()=>generateProposal,
    "processMeetingReminders",
    ()=>processMeetingReminders,
    "replyGmailEmail",
    ()=>replyGmailEmail,
    "sendGmailEmail",
    ()=>sendGmailEmail,
    "sendTelegramMessage",
    ()=>sendTelegramMessage,
    "snoozeMeetingReminder",
    ()=>snoozeMeetingReminder,
    "updateDeal",
    ()=>updateDeal,
    "updateLead",
    ()=>updateLead
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/types.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/api-error-handler.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/sonner/dist/index.mjs [app-client] (ecmascript)");
;
;
;
function parseDigitalWeaknesses(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.map((w)=>{
                if (typeof w === 'string') {
                    return {
                        issue: w,
                        severity: 'medium'
                    };
                }
                return w;
            });
        }
        return [];
    } catch  {
        return [];
    }
}
function transformLead(raw) {
    const communications = raw.communications?.map(transformCommunication) || [];
    const deals = raw.deals?.map(transformDeal) || [];
    // Derive lastContact from communications
    const outboundComms = communications.filter((c)=>c.direction === 'outbound' || c.direction === 'inbound');
    const lastContact = outboundComms.length > 0 ? outboundComms.sort((a, b)=>new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0].createdAt : undefined;
    return {
        id: raw.id,
        businessName: raw.businessName,
        ownerName: raw.ownerName || undefined,
        website: raw.website || undefined,
        email: raw.email || undefined,
        phone: raw.phone || undefined,
        whatsapp: raw.whatsapp || undefined,
        linkedin: raw.linkedin || undefined,
        instagram: raw.instagram || undefined,
        facebook: raw.facebook || undefined,
        googleMapsListing: raw.googleMapsListing || undefined,
        rating: raw.rating ?? undefined,
        employeeCount: typeof raw.employeeCount === 'number' ? raw.employeeCount : undefined,
        employeeRange: raw.employeeRange || undefined,
        sourceUrl: raw.sourceUrl || undefined,
        discoveredVia: raw.discoveredVia || undefined,
        verificationStatus: raw.verificationStatus || undefined,
        niche: raw.niche || undefined,
        country: raw.country || undefined,
        city: raw.city || undefined,
        stage: raw.stage,
        replyScore: raw.replyScore,
        conversionScore: raw.conversionScore,
        urgencyScore: raw.urgencyScore,
        revenuePotentialScore: raw.revenuePotentialScore,
        urgency: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["urgencyScoreToLabel"])(raw.urgencyScore),
        revenuePotential: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["revenueScoreToLabel"])(raw.revenuePotentialScore),
        digitalWeaknesses: parseDigitalWeaknesses(raw.digitalWeaknesses),
        hasWebsite: raw.hasWebsite,
        websiteQuality: raw.websiteQuality || undefined,
        scoreReasoning: raw.scoreReasoning || undefined,
        bestContactPerson: raw.bestContactPerson || undefined,
        bestChannel: raw.bestChannel || undefined,
        bestTiming: raw.bestTiming || undefined,
        outreachStyle: raw.outreachStyle || undefined,
        opportunityNotes: raw.opportunityNotes || undefined,
        source: raw.source || undefined,
        notes: raw.notes || undefined,
        tags: (()=>{
            if (!raw.tags) return [];
            try {
                const parsed = JSON.parse(raw.tags);
                return Array.isArray(parsed) ? parsed : [];
            } catch  {
                return [];
            }
        })(),
        lastContact,
        communications,
        deals,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt
    };
}
function transformCommunication(raw) {
    return {
        id: raw.id,
        leadId: raw.leadId,
        channel: raw.channel,
        direction: raw.direction,
        content: raw.content,
        messageGeneratedByAI: raw.messageGeneratedByAI,
        responseSummary: raw.responseSummary || undefined,
        intent: raw.intent || undefined,
        buyingSignals: raw.buyingSignals || undefined,
        hesitationReasons: raw.hesitationReasons || undefined,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt
    };
}
function transformDeal(raw) {
    return {
        id: raw.id,
        leadId: raw.leadId,
        projectType: raw.projectType || undefined,
        projectScope: raw.projectScope || undefined,
        proposedPrice: raw.proposedPrice ?? undefined,
        finalPrice: raw.finalPrice ?? undefined,
        currency: raw.currency,
        status: raw.status,
        notes: raw.notes || undefined,
        implementationTimeline: raw.implementationTimeline || undefined,
        maintenancePlan: raw.maintenancePlan || undefined,
        proposalContent: raw.proposalContent || undefined,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt
    };
}
async function fetchLeads(params) {
    const searchParams = new URLSearchParams();
    if (params?.stage) searchParams.set('stage', params.stage);
    if (params?.stages && params.stages.length > 0) searchParams.set('stages', params.stages.join(','));
    if (typeof params?.minReplyScore === 'number') searchParams.set('minReplyScore', String(params.minReplyScore));
    if (params?.niche) searchParams.set('niche', params.niche);
    if (params?.country) searchParams.set('country', params.country);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.source) searchParams.set('source', params.source);
    if (params?.city) searchParams.set('city', params.city);
    if (params?.hasEmail) searchParams.set('hasEmail', 'true');
    if (params?.hasPhone) searchParams.set('hasPhone', 'true');
    if (params?.hasWebsite) searchParams.set('hasWebsite', 'true');
    if (params?.verificationStatus) searchParams.set('verificationStatus', params.verificationStatus);
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/leads?${searchParams.toString()}`, undefined, {
        errorMessage: 'Failed to fetch leads',
        showToast: false
    });
    return {
        leads: data.leads.map(transformLead),
        pagination: data.pagination
    };
}
async function fetchLeadById(id) {
    try {
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/leads/${id}`, undefined, {
            errorMessage: 'Failed to fetch lead',
            showToast: false
        });
        return transformLead(data);
    } catch (error) {
        // 404 means lead not found — return null instead of throwing
        if (error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ApiError"] && error.status === 404) return null;
        // For other errors, also return null but log the issue
        console.error('[fetchLeadById] Error:', error);
        return null;
    }
}
async function createLead(data) {
    const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/leads', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    }, {
        errorMessage: 'Failed to create lead'
    });
    return transformLead(result);
}
async function updateLead(id, data) {
    const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    }, {
        errorMessage: 'Failed to update lead'
    });
    return transformLead(result);
}
async function deleteLead(id) {
    // Idempotent delete: if the server responds 404 LEAD_NOT_FOUND, the lead
    // is already gone (e.g. deleted in another session, or the browser is
    // showing a stale list after a data reset). Treating that as SUCCESS
    // lets the UI report success and invalidate the leads query, which
    // refetches the list and removes the phantom row. Previously this case
    // surfaced as "Deleted 0 leads, N failed", which confused users.
    try {
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/leads/${id}`, {
            method: 'DELETE'
        }, {
            errorMessage: 'Failed to delete lead',
            // We handle error toasts below so that the "already deleted" case
            // stays silent (it is a success, not an error).
            showToast: false
        });
        return true;
    } catch (error) {
        // Already deleted → success (idempotent). Any 404 from this endpoint
        // means the lead does not exist, so the user's goal is achieved.
        if (error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ApiError"] && error.status === 404) {
            return true;
        }
        // apiCall's built-in toast is suppressed for this call, so surface
        // the real error here (401 sessions expired, 403 forbidden, 500...).
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].error((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getErrorFallbackMessage"])(error));
        throw error;
    }
}
async function fetchStats() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/leads/stats', undefined, {
        errorMessage: 'Failed to fetch dashboard stats',
        showToast: false
    });
}
async function discoverBusinesses(niche, country, city) {
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/leads/discover', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            niche,
            country,
            city
        })
    }, {
        errorMessage: 'Failed to discover businesses',
        retryCount: 1
    });
    return data.leads.map(transformLead);
}
async function analyzeLead(id) {
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/leads/${id}/analyze`, {
        method: 'POST'
    }, {
        errorMessage: 'Failed to analyze lead'
    });
    return {
        lead: transformLead(data.lead),
        analysis: data.analysis
    };
}
async function generateOutreach(leadId, channel) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/leads/${leadId}/outreach`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            channel
        })
    }, {
        errorMessage: 'Failed to generate outreach message'
    });
}
async function addCommunication(leadId, data) {
    const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/leads/${leadId}/communications`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    }, {
        errorMessage: 'Failed to add communication'
    });
    return transformCommunication(result);
}
async function fetchCommunications(leadId) {
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/leads/${leadId}/communications`, undefined, {
        errorMessage: 'Failed to fetch communications',
        showToast: false
    });
    return data.map(transformCommunication);
}
async function createDeal(leadId, data) {
    const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/leads/${leadId}/deals`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    }, {
        errorMessage: 'Failed to create deal'
    });
    return transformDeal(result);
}
async function updateDeal(id, data) {
    const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/deals/${id}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    }, {
        errorMessage: 'Failed to update deal'
    });
    return {
        ...transformDeal(result),
        lead: result.lead
    };
}
async function fetchDeals(leadId) {
    const url = leadId ? `/api/leads/${leadId}/deals` : '/api/deals';
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(url, undefined, {
        errorMessage: 'Failed to fetch deals',
        showToast: false
    });
    return data.map((d)=>({
            ...transformDeal(d),
            lead: d.lead
        }));
}
async function askSalesAssistant(leadId, message, context) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/sales-assistant', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            leadId,
            message,
            context
        })
    }, {
        errorMessage: 'Failed to get sales assistant response'
    });
    // Transform the structured AI response into an AssistantMessage
    const analysis = data.analysis || {};
    const psych = data.psychologicalApproach || {};
    const closing = data.closingStrategy || {};
    const buyingSignals = Array.isArray(analysis.buyingSignals) ? analysis.buyingSignals : [];
    const hesitationFactors = Array.isArray(analysis.hesitationPoints) ? analysis.hesitationPoints : [];
    const contentParts = [];
    if (analysis.intent) {
        contentParts.push(`**Intent Analysis:** ${analysis.intent}`);
    }
    if (buyingSignals.length > 0) {
        contentParts.push(`**Buying Signals:**\n${buyingSignals.map((s)=>`- ${s}`).join('\n')}`);
    }
    if (hesitationFactors.length > 0) {
        contentParts.push(`**Hesitation Factors:**\n${hesitationFactors.map((s)=>`- ${s}`).join('\n')}`);
    }
    if (data.suggestedResponse) {
        contentParts.push(`**Recommended Response:**\n${data.suggestedResponse}`);
    }
    if (psych.framework || psych.lever) {
        contentParts.push(`**Psychological Approach:** ${psych.framework || ''} — ${psych.lever || ''}. ${psych.rationale || ''}`);
    }
    if (closing.type || closing.nextMilestone) {
        contentParts.push(`**Closing Strategy:** ${closing.type || ''}. Next milestone: ${closing.nextMilestone || 'N/A'}. Timing: ${closing.timing || 'N/A'}`);
    }
    return {
        id: `asst-${Date.now()}`,
        role: "assistant",
        content: contentParts.join('\n\n'),
        intentAnalysis: analysis.intent,
        buyingSignals,
        hesitationFactors,
        recommendedResponse: data.suggestedResponse,
        closingStrategy: closing.type,
        meetingIntent: data.meetingIntent,
        createdAt: new Date().toISOString()
    };
}
async function fetchInsights() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/insights', undefined, {
        errorMessage: 'Failed to fetch insights',
        showToast: false
    });
    return {
        bestChannels: data.bestChannels || [],
        conversionByNiche: data.conversionByNiche || [],
        performanceByCountry: data.performanceByCountry || [],
        stageFunnel: data.stageFunnel || [],
        scoreDistribution: data.scoreDistribution || [],
        weeklyPerformance: data.weeklyPerformance || [],
        topLeadsToContact: data.topLeadsToContact || [],
        followUpsNeeded: data.followUpsNeeded || [],
        recommendations: data.recommendations || [],
        sourceEffectiveness: data.sourceEffectiveness || [],
        leadScoreHeatmap: data.leadScoreHeatmap || [],
        performanceTrends: data.performanceTrends || {
            leads: {
                current: 0,
                previous: 0,
                trend: 0
            },
            deals: {
                current: 0,
                previous: 0,
                trend: 0
            },
            reply: {
                current: 0,
                previous: 0,
                trend: 0
            },
            pipeline: {
                current: 0,
                previous: 0,
                trend: 0
            }
        },
        summary: data.summary || {
            totalLeads: 0,
            totalCommunications: 0,
            totalDeals: 0,
            totalPipelineValue: 0
        }
    };
}
async function generateProposal(dealId) {
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/sales-assistant', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            action: 'generate_proposal',
            dealId
        })
    }, {
        errorMessage: 'Failed to generate proposal'
    });
    return data.proposal;
}
async function analyzeWebsite(leadId) {
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/leads/${leadId}/analyze-website`, {
        method: 'POST'
    }, {
        errorMessage: 'Failed to analyze website'
    });
    return data.analysis;
}
async function fetchLeadActivities(leadId) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/leads/${leadId}/activities`, undefined, {
        errorMessage: 'Failed to fetch lead activities',
        showToast: false
    });
}
async function createLeadActivity(leadId, data) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/leads/${leadId}/activities`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    }, {
        errorMessage: 'Failed to create activity'
    });
}
async function explainScores(leadId) {
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/leads/${leadId}/explain-scores`, {
        method: 'POST'
    }, {
        errorMessage: 'Failed to explain scores'
    });
    return data.explanation;
}
async function fetchReminders(overdue) {
    const params = new URLSearchParams();
    if (overdue) params.set('overdue', 'true');
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/reminders?${params.toString()}`, undefined, {
        errorMessage: 'Failed to fetch reminders',
        showToast: false
    });
    return data.map((r)=>({
            ...r,
            dueAt: r.dueAt,
            lead: r.lead ? {
                id: r.lead.id,
                businessName: r.lead.businessName,
                niche: r.lead.niche,
                country: r.lead.country,
                stage: r.lead.stage
            } : undefined
        }));
}
async function fetchLeadReminders(leadId) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/leads/${leadId}/reminders`, undefined, {
        errorMessage: 'Failed to fetch lead reminders',
        showToast: false
    });
}
async function createReminder(leadId, message, dueAt) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/leads/${leadId}/reminders`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message,
            dueAt
        })
    }, {
        errorMessage: 'Failed to create reminder'
    });
}
async function completeReminder(reminderId, leadId) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/leads/${leadId}/reminders`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            reminderId,
            completed: true
        })
    }, {
        errorMessage: 'Failed to complete reminder'
    });
}
async function fetchMeetingReminders(limit) {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/meetings/reminders?${params.toString()}`, undefined, {
        errorMessage: 'Failed to fetch meeting reminders',
        showToast: false
    });
    return (data.reminders || []).map((r)=>({
            ...r,
            startDateTime: r.startDateTime,
            endDateTime: r.endDateTime,
            remindAt: r.remindAt
        }));
}
async function processMeetingReminders() {
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/meetings/reminders', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    }, {
        errorMessage: 'Failed to process meeting reminders'
    });
    return {
        processed: data.processed,
        failed: data.failed,
        total: data.total
    };
}
async function dismissMeetingReminder(reminderId) {
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/meetings/reminders', {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            reminderId,
            action: 'dismiss'
        })
    }, {
        errorMessage: 'Failed to dismiss reminder'
    });
}
async function snoozeMeetingReminder(reminderId, snoozeMinutes) {
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/meetings/reminders', {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            reminderId,
            action: 'snooze',
            snoozeMinutes
        })
    }, {
        errorMessage: 'Failed to snooze reminder'
    });
}
function transformCompetitorAnalysis(raw) {
    let analysisData;
    if (raw.analysisData) {
        try {
            analysisData = JSON.parse(raw.analysisData);
        } catch  {
            analysisData = undefined;
        }
    }
    const parsed = analysisData;
    return {
        id: raw.id,
        userId: raw.userId,
        leadId: raw.leadId || undefined,
        competitorName: raw.competitorName,
        competitorUrl: raw.competitorUrl,
        techStack: parsed?.techStack ? parsed.techStack : undefined,
        seoScore: raw.seoScore ?? undefined,
        socialScore: raw.socialScore ?? undefined,
        strengths: parsed?.strengths ? parsed.strengths : undefined,
        weaknesses: parsed?.weaknesses ? parsed.weaknesses : undefined,
        opportunities: parsed?.opportunities ? parsed.opportunities : undefined,
        threats: parsed?.threats ? parsed.threats : undefined,
        threatLevel: raw.threatLevel ?? undefined,
        pricingModel: parsed?.pricingModel,
        estimatedTrafficTier: parsed?.estimatedTrafficTier ?? undefined,
        differentiationOpportunities: parsed?.differentiationOpportunities,
        analysisData: raw.analysisData ?? undefined,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt
    };
}
async function fetchCompetitorAnalyses() {
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/competitor', undefined, {
        errorMessage: 'Failed to fetch competitor analyses',
        showToast: false
    });
    return data.map(transformCompetitorAnalysis);
}
async function fetchCompetitorAnalysis(id) {
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/competitor/${id}`, undefined, {
        errorMessage: 'Failed to fetch competitor analysis',
        showToast: false
    });
    return transformCompetitorAnalysis(data);
}
async function createCompetitorAnalysis(data) {
    const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/competitor', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    }, {
        errorMessage: 'Failed to create competitor analysis'
    });
    return transformCompetitorAnalysis(result);
}
async function deleteCompetitorAnalysis(id) {
    try {
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/competitor/${id}`, {
            method: 'DELETE'
        }, {
            errorMessage: 'Failed to delete competitor analysis'
        });
        return true;
    } catch  {
        return false;
    }
}
async function fetchGmailStatus() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/gmail/status', {}, {
        errorMessage: 'Failed to fetch Gmail status'
    });
}
async function fetchGmailAccounts() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/gmail/accounts', {}, {
        errorMessage: 'Failed to fetch Gmail accounts'
    });
}
async function fetchGmailThreads(params = {}) {
    const qs = new URLSearchParams();
    if (params.emailAccountId) qs.set('emailAccountId', params.emailAccountId);
    if (params.query) qs.set('query', params.query);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.page) qs.set('page', String(params.page));
    if (params.labelIds?.length) qs.set('labelIds', params.labelIds.join(','));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/gmail/threads${suffix}`, {}, {
        errorMessage: 'Failed to fetch Gmail threads'
    });
}
async function fetchGmailThread(threadId) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/gmail/thread/${encodeURIComponent(threadId)}`, {}, {
        errorMessage: 'Failed to fetch Gmail thread'
    });
}
async function connectGmail() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/gmail/connect', {
        method: 'POST'
    }, {
        errorMessage: 'Failed to start Gmail connection'
    });
}
async function disconnectGmail(emailAccountId) {
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/gmail/disconnect', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            emailAccountId
        })
    }, {
        errorMessage: 'Failed to disconnect Gmail account'
    });
}
async function sendGmailEmail(params) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/gmail/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
    }, {
        errorMessage: 'Failed to send email'
    });
}
async function createGmailDraft(params) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/gmail/draft', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
    }, {
        errorMessage: 'Failed to save draft'
    });
}
async function replyGmailEmail(params) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/gmail/reply', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
    }, {
        errorMessage: 'Failed to send reply'
    });
}
async function sendTelegramMessage(params) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/telegram/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            chatId: params.chatId,
            content: params.message,
            parseMode: params.parseMode,
            replyToMessageId: params.replyToMessageId
        })
    }, {
        errorMessage: 'Failed to send Telegram message'
    });
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/settings-store.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useSettingsStore",
    ()=>useSettingsStore
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/zustand/esm/react.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/zustand/esm/middleware.mjs [app-client] (ecmascript)");
'use client';
;
;
const DEFAULT_SETTINGS = {
    defaultNiche: '',
    defaultCountry: '',
    notificationsEnabled: true,
    reminderCheckInterval: 60,
    autoAnalyzeOnDiscover: false,
    // FIX 14: default theme is light — this flag mirrors the next-themes
    // defaultTheme="light" setting (providers.tsx). Users who explicitly
    // choose dark keep their preference (persisted via next-themes storage).
    darkMode: false,
    compactView: false,
    pipelineAutoRefresh: false
};
const useSettingsStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["create"])()((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["persist"])((set)=>({
        ...DEFAULT_SETTINGS,
        updateSetting: (key, value)=>set({
                [key]: value
            }),
        resetAll: ()=>set(DEFAULT_SETTINGS)
    }), {
    name: 'war-room-settings'
}));
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/legal-store.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useLegalStore",
    ()=>useLegalStore
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/zustand/esm/react.mjs [app-client] (ecmascript)");
;
const useLegalStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["create"])((set)=>({
        open: false,
        activePage: 'privacy',
        openLegal: (page = 'privacy')=>set({
                open: true,
                activePage: page
            }),
        closeLegal: ()=>set({
                open: false
            }),
        setActivePage: (page)=>set({
                activePage: page
            })
    }));
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/notification-navigation.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "navigateNotificationTarget",
    ()=>navigateNotificationTarget,
    "openNotificationPreferences",
    ()=>openNotificationPreferences,
    "openNotificationsPage",
    ()=>openNotificationsPage
]);
/**
 * Notification click-through navigation.
 *
 * Maps a notification's `actionUrl` (as written by backend event producers)
 * onto the AcquisitionOS SPA tab system where a meaningful in-app destination
 * exists, and falls back to real navigation for routes that live outside the
 * SPA (admin console, dashboard sub-apps, external links).
 *
 * Returns `true` when some navigation was performed, `false` when the URL
 * had no resolvable destination (caller keeps the notification purely
 * informational).
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/store.ts [app-client] (ecmascript)");
;
/** Legacy absolute paths written by older producers → their SPA tabs. */ const LEGACY_PREFIXES = [
    {
        prefix: '/business-ai',
        tab: 'overview'
    },
    {
        prefix: '/leads',
        tab: 'leads'
    },
    {
        prefix: '/pipeline',
        tab: 'pipeline'
    },
    {
        prefix: '/discover',
        tab: 'discover'
    },
    {
        prefix: '/outreach',
        tab: 'outreach'
    },
    {
        prefix: '/workflows',
        tab: 'workflows'
    },
    {
        prefix: '/messaging',
        tab: 'messaging'
    },
    {
        prefix: '/assistant',
        tab: 'assistant'
    },
    {
        prefix: '/insights',
        tab: 'insights'
    },
    {
        prefix: '/analytics',
        tab: 'insights'
    },
    {
        prefix: '/deals',
        tab: 'deals'
    },
    {
        prefix: '/proposals',
        tab: 'deals'
    },
    {
        prefix: '/competitors',
        tab: 'competitors'
    },
    {
        prefix: '/settings',
        tab: 'settings'
    }
];
function openNotificationsPage() {
    __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAppStore"].getState().setActiveTab('notifications');
}
function openNotificationPreferences() {
    __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAppStore"].getState().requestSettingsSection('notifications');
}
function navigateNotificationTarget(actionUrl) {
    if (!actionUrl) return false;
    const store = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAppStore"].getState();
    const url = actionUrl.trim();
    // 1. Direct SPA tab routes (/business-ai/* or '/')
    const pathOnly = url.split('?')[0];
    const directTab = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pathToTab"])(pathOnly);
    if (directTab) {
        store.setActiveTab(directTab);
        return true;
    }
    // 2. Lead detail (/leads/<id>) → Leads tab with the lead pre-selected
    const leadMatch = url.match(/^\/leads\/([^/?#]+)/);
    if (leadMatch) {
        store.setSelectedLeadId(decodeURIComponent(leadMatch[1]));
        store.setActiveTab('leads');
        return true;
    }
    // 3. Legacy top-level paths → SPA tabs (longest prefix wins)
    const sorted = [
        ...LEGACY_PREFIXES
    ].sort((a, b)=>b.prefix.length - a.prefix.length);
    for (const { prefix, tab } of sorted){
        if (pathOnly === prefix || pathOnly.startsWith(prefix + '/')) {
            // The /business-ai entry is only a catch-all when pathToTab failed
            // (unknown sub-path) — land on overview rather than doing nothing.
            store.setActiveTab(tab);
            return true;
        }
    }
    // 4. In-app non-SPA routes (admin console, dashboard sub-apps)
    if (url.startsWith('/')) {
        window.location.assign(url);
        return true;
    }
    // 5. Absolute external URL → new tab
    if (/^https?:\/\//i.test(url)) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return true;
    }
    return false;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/notification-realtime.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "acquireNotificationRealtime",
    ()=>acquireNotificationRealtime,
    "isNotificationRealtimeConnected",
    ()=>isNotificationRealtimeConnected,
    "releaseNotificationRealtime",
    ()=>releaseNotificationRealtime
]);
/**
 * Notification real-time delivery — module-level SINGLETON.
 *
 * NotificationCenter is mounted three times in the dashboard layout (mobile
 * header, sidebar footer, desktop topbar). Each instance used to open its
 * OWN EventSource to /api/events/notifications, so a single backend event
 * was processed three times: three store additions (deduped by id), three
 * unread-count increments (WRONG badge: +3 instead of +1) and up to three
 * identical toasts.
 *
 * This module guarantees exactly ONE EventSource connection and ONE
 * processing pass per event, no matter how many component instances are
 * mounted. Consumers use acquire/release (reference counted): the
 * connection opens on first acquire and closes on the last release.
 *
 * Processing per event (exactly once):
 *   1. De-duplicate by server notification id.
 *   2. Add to the shared zustand notification store (persisted id kept).
 *   3. Increment the authoritative server unread count (badge).
 *   4. Toast + chime (respecting the mute preference and sound setting).
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/sonner/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/store.ts [app-client] (ecmascript)");
;
;
let eventSource = null;
let refCount = 0;
const seenIds = new Set();
function capSeenIds() {
    if (seenIds.size > 500) {
        const entries = Array.from(seenIds);
        seenIds.clear();
        for (const id of entries.slice(-250))seenIds.add(id);
    }
}
/** Map a notification type to a sonner toast severity + call. */ function toastForType(type, title, message) {
    const opts = {
        description: message,
        duration: 4000
    };
    switch(type){
        case 'deal_won':
        case 'payment_success':
        case 'meeting_completed':
        case 'calendar_connected':
        case 'calendar_synced':
        case 'sequence_completed':
        case 'new_lead_discovered':
        case 'team_member_joined':
        case 'workflow_completed':
        case 'workflow_execution_complete':
        case 'discovery_completed':
        case 'campaign_completed':
        case 'api_key_created':
        case 'subscription_renewed':
        case 'refund_processed':
        case 'credit_assigned':
            __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].success(title, opts);
            break;
        case 'deal_lost':
        case 'payment_failed':
        case 'credit_critical':
        case 'gmail_token_expired':
        case 'meeting_cancelled':
        case 'workflow_failed':
        case 'discovery_failed':
        case 'campaign_failed':
        case 'api_key_revoked':
        case 'security_alert':
        case 'chargeback_received':
        case 'subscription_expired':
            __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].error(title, opts);
            break;
        case 'credit_low':
        case 'trial_ending':
        case 'calendar_disconnected':
        case 'subscription_cancelling':
            __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].warning(title, opts);
            break;
        default:
            __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].info(title, opts);
    }
}
/** Two-tone chime (shared with the polling path in the component). */ let audioContext = null;
function playNotificationSound() {
    try {
        if (!audioContext || audioContext.state === 'closed') {
            audioContext = new AudioContext();
        }
        const ctx = audioContext;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        const gain2 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, ctx.currentTime);
        osc1.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.1);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.15);
        osc2.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.25);
        gain1.gain.setValueAtTime(0.08, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        gain2.gain.setValueAtTime(0.06, ctx.currentTime + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.3);
        osc2.start(ctx.currentTime + 0.15);
        osc2.stop(ctx.currentTime + 0.45);
    } catch  {
    // Silently fail if audio context is not available
    }
}
function handleNotificationEvent(raw) {
    try {
        const payload = JSON.parse(raw);
        const id = payload?.id ? String(payload.id) : '';
        if (!id || seenIds.has(id)) return;
        capSeenIds();
        seenIds.add(id);
        const store = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useNotificationStore"].getState();
        const notifType = payload.type || 'info';
        // One store add (store also dedupes defensively) + one badge increment.
        store.addNotification({
            id,
            type: notifType,
            title: payload.title || 'Notification',
            message: payload.message || '',
            timestamp: payload.createdAt ? new Date(payload.createdAt) : new Date(),
            read: payload.read ?? false,
            actionUrl: payload.actionUrl ?? null
        });
        if (!payload.read) {
            store.adjustServerUnreadCount(1);
        }
        // Toast + chime once, honoring the mute preference.
        if (!store.isMuted()) {
            if (store.preferences.soundEnabled && !document.hasFocus()) {
                playNotificationSound();
            }
            toastForType(notifType, payload.title || 'New Notification', payload.message);
        }
    } catch (parseErr) {
        console.warn('[NotificationRealtime] SSE payload parse failed:', parseErr);
    }
}
function acquireNotificationRealtime() {
    refCount += 1;
    if (eventSource || ("TURBOPACK compile-time value", "object") === 'undefined') return;
    try {
        const es = new EventSource('/api/events/notifications');
        es.addEventListener('notification_created', (ev)=>{
            handleNotificationEvent(ev.data);
        });
        // EventSource auto-reconnects on error; polling in the component is the
        // fallback for dropped connections.
        es.onerror = ()=>{
        /* auto-reconnect */ };
        eventSource = es;
    } catch  {
        // EventSource unavailable — polling fallback remains active.
        eventSource = null;
    }
}
function releaseNotificationRealtime() {
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0 && eventSource) {
        eventSource.close();
        eventSource = null;
    }
}
function isNotificationRealtimeConnected() {
    return eventSource !== null;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/modal-safe-area.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * NAVBAR-SAFE MODAL POSITIONING - responsive fix (2026-09-20)
 *
 * The shared DialogContent vertically centers dialogs, which made the
 * Choose Your Plan and Create API Key modals start BEHIND the sticky
 * navbar (z-[100] above the z-50 dialog) whenever the dialog was taller
 * than the viewport, clipping the title/close button at the top and the
 * content at the bottom.
 *
 * Instead of hardcoding a top offset, the two modals measure the REAL
 * chrome at open time and expose two CSS custom properties on the dialog
 * node itself:
 *
 *   --aos-modal-top   top edge  = visible header bottom + 12px safe gap
 *   --aos-modal-maxh  max height = (bottom chrome top - 12px gap) - top
 *
 * The app header is pushed down by any full-width banner above it (e.g.
 * the trial banner), so measuring the header's rect covers every banner
 * state. The mobile/tablet bottom nav (below lg) and the desktop footer
 * are both treated as bottom chrome. Re-applied on window resize so the
 * dialog follows breakpoint changes while it stays open.
 *
 * Presentation-only: no dialog data, logic, or other components change.
 * Consumed via:
 *   top-[var(--aos-modal-top,60px)]!
 *   max-h-[var(--aos-modal-maxh,calc(100dvh-145px))]
 */ __turbopack_context__.s([
    "applyModalSafeArea",
    ()=>applyModalSafeArea
]);
function applyModalSafeArea(node) {
    const apply = ()=>{
        const vis = (el)=>!!el && el.offsetHeight > 0;
        // Top chrome: first VISIBLE header (the mobile one is display:none on
        // desktop and vice versa). Its bottom edge already includes any banner
        // rendered above it in the flex column.
        const header = Array.from(document.querySelectorAll('[role="banner"]')).find(vis) ?? null;
        const bottomNav = document.querySelector('[aria-label="Mobile navigation"]');
        const footer = document.querySelector('[role="contentinfo"]');
        const TOP_GAP = 12;
        const BOTTOM_GAP = 12;
        const top = header ? Math.round(header.getBoundingClientRect().bottom) + TOP_GAP : TOP_GAP + 56;
        const bn = vis(bottomNav) ? bottomNav.getBoundingClientRect() : null;
        const fr = vis(footer) ? footer.getBoundingClientRect() : null;
        // Bottom chrome = whichever of (bottom nav, footer, viewport edge) is
        // highest. The viewport edge hard-cap keeps the dialog inside the
        // screen even if a bottom bar were misdetected (or on odd window
        // shapes), so the dialog can never spill past the visible area.
        const hardBottom = Math.min(bn ? bn.top : Number.POSITIVE_INFINITY, fr ? fr.top : Number.POSITIVE_INFINITY, window.innerHeight - 4);
        const bottomLimit = Number.isFinite(hardBottom) ? Math.round(hardBottom) - BOTTOM_GAP : window.innerHeight - BOTTOM_GAP;
        // No 240px floor: a floor larger than the real available space
        // (landscape phones, short desktop windows) re-introduces exactly the
        // bottom-clipping / bottom-nav overlap this helper exists to prevent.
        // 96px is a last-resort usability floor that only engages below real
        // device minimums; on every actual viewport the dialog is bounded by
        // the measured space instead.
        const maxH = Math.max(96, bottomLimit - top);
        node.style.setProperty('--aos-modal-top', `${top}px`);
        node.style.setProperty('--aos-modal-maxh', `${maxH}px`);
    };
    apply();
    // The trial banner animates its height in (framer-motion); re-measure
    // once it has settled so a dialog opened during the animation is still
    // positioned correctly.
    const settleTimer = window.setTimeout(apply, 400);
    window.addEventListener('resize', apply);
    return ()=>{
        window.clearTimeout(settleTimer);
        window.removeEventListener('resize', apply);
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/support-constants.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Support Center shared constants (client-safe)
//
// Category / subcategory taxonomy for support tickets. Imported by both
// the client form components and the API routes so the frontend and the
// backend always validate against the SAME source of truth.
// ═══════════════════════════════════════════════════════════════════
__turbopack_context__.s([
    "KB_CATEGORIES",
    ()=>KB_CATEGORIES,
    "PRIORITY_LABELS",
    ()=>PRIORITY_LABELS,
    "STATUS_LABELS",
    ()=>STATUS_LABELS,
    "SUPPORT_CATEGORIES",
    ()=>SUPPORT_CATEGORIES,
    "TICKET_PRIORITIES",
    ()=>TICKET_PRIORITIES,
    "TICKET_STATUSES",
    ()=>TICKET_STATUSES,
    "findCategory",
    ()=>findCategory,
    "findKbCategory",
    ()=>findKbCategory,
    "isValidCategory",
    ()=>isValidCategory,
    "isValidSubcategory",
    ()=>isValidSubcategory
]);
const TICKET_STATUSES = [
    'OPEN',
    'IN_PROGRESS',
    'WAITING_FOR_USER',
    'RESOLVED',
    'CLOSED'
];
const TICKET_PRIORITIES = [
    'LOW',
    'NORMAL',
    'HIGH',
    'URGENT'
];
const STATUS_LABELS = {
    OPEN: 'Open',
    IN_PROGRESS: 'In Progress',
    WAITING_FOR_USER: 'Waiting for You',
    RESOLVED: 'Resolved',
    CLOSED: 'Closed'
};
const PRIORITY_LABELS = {
    LOW: 'Low',
    NORMAL: 'Normal',
    HIGH: 'High',
    URGENT: 'Urgent'
};
const SUPPORT_CATEGORIES = [
    {
        value: 'billing',
        label: 'Billing & Subscription',
        description: 'Plans, payments, invoices, refunds, downgrade / upgrade',
        subcategories: [
            {
                value: 'downgrade_plan',
                label: 'Downgrade Plan'
            },
            {
                value: 'upgrade_plan',
                label: 'Upgrade Plan'
            },
            {
                value: 'billing_cycle',
                label: 'Billing Cycle (Monthly / Annual)'
            },
            {
                value: 'payment_failure',
                label: 'Payment Failure'
            },
            {
                value: 'invoice_receipt',
                label: 'Invoice / Receipt'
            },
            {
                value: 'refund',
                label: 'Refund'
            },
            {
                value: 'subscription_status',
                label: 'Subscription Status'
            },
            {
                value: 'other',
                label: 'Other'
            }
        ]
    },
    {
        value: 'credits',
        label: 'Credits & Usage',
        description: 'Credit balance, consumption, add-on packs, resets',
        subcategories: [
            {
                value: 'credit_balance',
                label: 'Credit Balance'
            },
            {
                value: 'credit_consumption',
                label: 'Credit Consumption'
            },
            {
                value: 'credit_addon',
                label: 'Credit Add-On Purchase'
            },
            {
                value: 'credit_reset',
                label: 'Monthly Credit Reset'
            },
            {
                value: 'other',
                label: 'Other'
            }
        ]
    },
    {
        value: 'leads',
        label: 'Leads & Discovery',
        description: 'Finding leads, filters, analysis, lead limits, data issues',
        subcategories: [
            {
                value: 'finding_leads',
                label: 'Finding Leads'
            },
            {
                value: 'lead_filters',
                label: 'Lead Filters'
            },
            {
                value: 'lead_analysis',
                label: 'Lead Analysis'
            },
            {
                value: 'lead_limits',
                label: 'Lead Limits'
            },
            {
                value: 'lead_data_issue',
                label: 'Lead Data Issue'
            },
            {
                value: 'other',
                label: 'Other'
            }
        ]
    },
    {
        value: 'outreach',
        label: 'Outreach & Messaging',
        description: 'Messages, sequences, sending issues, outreach limits',
        subcategories: [
            {
                value: 'outreach_messages',
                label: 'Outreach Messages'
            },
            {
                value: 'outreach_sequences',
                label: 'Outreach Sequences'
            },
            {
                value: 'sending_issues',
                label: 'Sending Issues'
            },
            {
                value: 'outreach_limits',
                label: 'Outreach Limits'
            },
            {
                value: 'other',
                label: 'Other'
            }
        ]
    },
    {
        value: 'ai_features',
        label: 'AI Features',
        description: 'AI analysis, sales coaching, proposals, competitor analysis',
        subcategories: [
            {
                value: 'ai_analysis',
                label: 'AI Analysis'
            },
            {
                value: 'sales_coaching',
                label: 'Sales Coaching'
            },
            {
                value: 'proposal_generation',
                label: 'Proposal Generation'
            },
            {
                value: 'competitor_analysis',
                label: 'Competitor Analysis'
            },
            {
                value: 'ai_credits',
                label: 'AI Credit Consumption'
            },
            {
                value: 'other',
                label: 'Other'
            }
        ]
    },
    {
        value: 'account',
        label: 'Account & Security',
        description: 'Login, OTP, Google sign-in, profile, security',
        subcategories: [
            {
                value: 'login_issue',
                label: 'Login Issue'
            },
            {
                value: 'otp_issue',
                label: 'OTP / Verification'
            },
            {
                value: 'google_login',
                label: 'Google Login'
            },
            {
                value: 'profile_settings',
                label: 'Profile Settings'
            },
            {
                value: 'account_security',
                label: 'Account Security'
            },
            {
                value: 'other',
                label: 'Other'
            }
        ]
    },
    {
        value: 'technical',
        label: 'Technical Troubleshooting',
        description: 'Dashboard problems, errors, slowness, browser issues',
        subcategories: [
            {
                value: 'dashboard_problem',
                label: 'Dashboard Problem'
            },
            {
                value: 'feature_not_working',
                label: 'Feature Not Working'
            },
            {
                value: 'slow_performance',
                label: 'Slow Requests'
            },
            {
                value: 'errors',
                label: 'Errors'
            },
            {
                value: 'browser_issue',
                label: 'Browser / Mobile Issue'
            },
            {
                value: 'other',
                label: 'Other'
            }
        ]
    },
    {
        value: 'integrations',
        label: 'Integrations & API',
        description: 'API access, connected services, custom integrations',
        subcategories: [
            {
                value: 'api_access',
                label: 'API Access'
            },
            {
                value: 'api_errors',
                label: 'API Errors'
            },
            {
                value: 'connected_services',
                label: 'Connected Services'
            },
            {
                value: 'custom_integration',
                label: 'Custom Integrations'
            },
            {
                value: 'other',
                label: 'Other'
            }
        ]
    },
    {
        value: 'other',
        label: 'Other',
        description: 'Anything that does not fit the categories above',
        subcategories: [
            {
                value: 'other',
                label: 'General Question'
            }
        ]
    }
];
function findCategory(value) {
    return SUPPORT_CATEGORIES.find((c)=>c.value === value);
}
function isValidCategory(value) {
    return SUPPORT_CATEGORIES.some((c)=>c.value === value);
}
function isValidSubcategory(category, subcategory) {
    if (!subcategory) return true; // optional
    const cat = findCategory(category);
    if (!cat) return false;
    return cat.subcategories.some((s)=>s.value === subcategory);
}
const KB_CATEGORIES = [
    {
        value: 'getting_started',
        label: 'Getting Started',
        description: 'Account setup, dashboard, credits, leads, prospecting basics',
        icon: 'Rocket'
    },
    {
        value: 'leads',
        label: 'Leads & Discovery',
        description: 'Finding leads, filters, analysis, lead limits, data issues',
        icon: 'Search'
    },
    {
        value: 'outreach',
        label: 'Outreach',
        description: 'Outreach messages, sequences, email support, sending issues',
        icon: 'Send'
    },
    {
        value: 'ai_features',
        label: 'AI Features',
        description: 'AI analysis, sales coaching, proposals, competitor analysis',
        icon: 'Sparkles'
    },
    {
        value: 'credits',
        label: 'Credits & Usage',
        description: 'How credits work, consumption, balance, add-ons',
        icon: 'Zap'
    },
    {
        value: 'plans_billing',
        label: 'Plans & Billing',
        description: 'Free, Starter, Pro, Elite — upgrade, downgrade, payments',
        icon: 'CreditCard'
    },
    {
        value: 'account_security',
        label: 'Account & Security',
        description: 'Login, OTP, Google login, profile settings',
        icon: 'ShieldCheck'
    },
    {
        value: 'troubleshooting',
        label: 'Technical Troubleshooting',
        description: 'Dashboard problems, errors, slow requests, browser issues',
        icon: 'Wrench'
    },
    {
        value: 'integrations_api',
        label: 'Integrations & API',
        description: 'API access, connected services, API errors',
        icon: 'Plug'
    }
];
function findKbCategory(value) {
    return KB_CATEGORIES.find((c)=>c.value === value);
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/auth-client.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Remember-me client preference (P5, Sep 2026)
//
// The sign-in checkbox is now a CONTROLLED input. The choice is carried
// through multi-step flows (password → MFA, password → Google redirect)
// via a SHORT-LIVED (10 min), non-sensitive, non-httpOnly cookie that the
// API routes read with readRememberMeCookie(). Forging it only changes
// session LIFETIME POLICY (30d absolute + 48h idle) — never privileges.
// ═══════════════════════════════════════════════════════════════════
__turbopack_context__.s([
    "REMEMBER_ME_COOKIE",
    ()=>REMEMBER_ME_COOKIE,
    "getRememberMePreference",
    ()=>getRememberMePreference,
    "setRememberMeCookie",
    ()=>setRememberMeCookie
]);
const REMEMBER_ME_COOKIE = 'aqos_remember_me';
const TEN_MINUTES_SECONDS = 10 * 60;
function setRememberMeCookie(checked) {
    if (typeof document === 'undefined') return;
    if (checked) {
        document.cookie = `${REMEMBER_ME_COOKIE}=1; path=/; max-age=${TEN_MINUTES_SECONDS}; samesite=lax`;
    } else {
        document.cookie = `${REMEMBER_ME_COOKIE}=; path=/; max-age=0; samesite=lax`;
    }
}
function getRememberMePreference() {
    if (typeof document === 'undefined') return false;
    return document.cookie.split(';').some((c)=>c.trim().startsWith(`${REMEMBER_ME_COOKIE}=1`));
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/hooks/use-auth.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useAuth",
    ()=>useAuth
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/auth-store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/subscription-store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/api-error-handler.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$cache$2d$invalidation$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/cache-invalidation.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
// AcquisitionOS — Authentication Hook
'use client';
;
;
;
;
;
;
function useAuth() {
    _s();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const { user, isAuthenticated, isLoading, mfaRequired, mfaSessionToken, setUser, setLoading, setMfaRequired, logout, updatePlan, updateEmailVerified, updateMfaEnabled } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAuthStore"])();
    // Fetch current user on mount
    // ── P11 (Sep 2026): infrastructure failures are NOT anonymous ──
    // 401 → genuinely unauthenticated → setUser(null).
    // 5xx / network / 503 → backend temporarily unavailable → KEEP the
    // current user (if any). Converting a 503 into setUser(null) silently
    // logged users out during every transient backend failure.
    const fetchUser = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAuth.useCallback[fetchUser]": async ()=>{
            try {
                const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/auth/me', {
                    credentials: 'include'
                }, {
                    errorMessage: 'Failed to fetch user',
                    showToast: false
                });
                setUser(data.user);
            } catch (error) {
                const status = error?.status;
                if (status === 401) {
                    setUser(null);
                }
            // Non-401: keep the last-known user state; the next successful
            // fetch/refresh will reconcile. If we have no user yet, stay
            // unauthenticated-but-pending rather than forcing null (same
            // observable result for a fresh browser, but a transient failure
            // can no longer DESTROY an existing session view).
            }
        }
    }["useAuth.useCallback[fetchUser]"], [
        setUser
    ]);
    // Sign in with email and password
    //
    // NOTE: We intentionally do NOT toggle the global `setLoading` here (same
    // rationale as signUp below). AuthGate renders a full-screen LoadingScreen
    // while `isLoading` is true, which UNMOUNTS SignInPage and destroys its
    // local state — the inline error alert and filled fields would be lost on
    // remount. SignInPage tracks its own `isSubmitting` for the button spinner.
    const signIn = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAuth.useCallback[signIn]": async (email, password, rememberMe)=>{
            try {
                const res = await fetch('/api/auth/signin', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        email,
                        password,
                        rememberMe: !!rememberMe
                    })
                });
                const data = await res.json();
                if (!res.ok) {
                    // Handle email verification required
                    if (data.requiresVerification) {
                        return {
                            success: false,
                            error: data.error || 'Email verification required',
                            requiresVerification: true,
                            email: data.email
                        };
                    }
                    // Propagate account-state flags so the UI can show actionable alerts
                    // (unified login: a registered email can log in via ANY method).
                    return {
                        success: false,
                        error: data.error || 'Sign in failed',
                        mfaRequired: data.mfaRequired || false,
                        emailNotVerified: data.emailNotVerified || false,
                        verificationResent: data.verificationResent || false,
                        noPasswordSet: data.noPasswordSet || false,
                        email: data.email,
                        // DEV-ONLY (sandbox): the fresh verification code the server just
                        // generated for the unverified account, when it cannot be emailed.
                        devDelivery: data.devDelivery || undefined
                    };
                }
                // If MFA is required, set the state
                if (data.mfaRequired) {
                    setMfaRequired(true, data.mfaSessionToken);
                    return {
                        success: false,
                        error: 'MFA verification required',
                        mfaRequired: true
                    };
                }
                setUser(data.user);
                return {
                    success: true,
                    user: data.user,
                    mfaRequired: false
                };
            } catch (error) {
                return {
                    success: false,
                    error: 'Network error. Please try again.',
                    mfaRequired: false
                };
            }
        }
    }["useAuth.useCallback[signIn]"], [
        setUser,
        setMfaRequired
    ]);
    // Sign up with email and password
    //
    // IMPORTANT: We intentionally do NOT toggle the global `setLoading` here.
    // AuthGate uses `isLoading` to decide whether to show the full-screen
    // LoadingScreen, which would unmount the SignUpPage and discard its
    // `showSuccess` state — preventing the post-signup "Check your email" screen
    // from ever rendering. Instead, the SignUpPage component tracks its own
    // local `isSubmitting` state for the button spinner, and we leave the global
    // loading flag alone so the auth pages stay mounted across the request.
    const signUp = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAuth.useCallback[signUp]": async (params)=>{
            try {
                const res = await fetch('/api/auth/signup', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify(params)
                });
                const data = await res.json();
                if (!res.ok) {
                    return {
                        success: false,
                        error: data.error || 'Sign up failed',
                        emailRegistered: data.emailRegistered || false,
                        email: data.email
                    };
                }
                // If signup requires email verification, don't set user (they're not authenticated yet)
                if (data.requiresVerification) {
                    return {
                        success: true,
                        requiresVerification: true,
                        email: data.email,
                        emailProvider: data.emailProvider,
                        // DEV-ONLY (sandbox): verification code surfaced in-place when the
                        // server has no email provider configured. Never set in production.
                        devDelivery: data.devDelivery || undefined
                    };
                }
                setUser(data.user);
                return {
                    success: true,
                    user: data.user
                };
            } catch (error) {
                return {
                    success: false,
                    error: 'Network error. Please try again.'
                };
            }
        }
    }["useAuth.useCallback[signUp]"], [
        setUser
    ]);
    // Verify MFA TOTP code
    const verifyMfa = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAuth.useCallback[verifyMfa]": async (code, rememberMe)=>{
            if (!mfaSessionToken) {
                return {
                    success: false,
                    error: 'No MFA session found'
                };
            }
            try {
                const res = await fetch('/api/auth/mfa/verify', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        code,
                        mfaSessionToken,
                        rememberMe: !!rememberMe
                    })
                });
                const data = await res.json();
                if (!res.ok) {
                    return {
                        success: false,
                        error: data.error || 'MFA verification failed'
                    };
                }
                setUser(data.user);
                return {
                    success: true,
                    user: data.user
                };
            } catch  {
                return {
                    success: false,
                    error: 'Network error. Please try again.'
                };
            }
        }
    }["useAuth.useCallback[verifyMfa]"], [
        mfaSessionToken,
        setUser
    ]);
    // Verify email with OTP
    const verifyEmail = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAuth.useCallback[verifyEmail]": async (email, otp)=>{
            try {
                const res = await fetch('/api/auth/verify-email', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email,
                        otp
                    })
                });
                const data = await res.json();
                if (!res.ok) {
                    return {
                        success: false,
                        error: data.error || 'Verification failed'
                    };
                }
                updateEmailVerified(true);
                return {
                    success: true
                };
            } catch  {
                return {
                    success: false,
                    error: 'Network error. Please try again.'
                };
            }
        }
    }["useAuth.useCallback[verifyEmail]"], [
        updateEmailVerified
    ]);
    // Request password reset
    const forgotPassword = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAuth.useCallback[forgotPassword]": async (email)=>{
            try {
                const res = await fetch('/api/auth/forgot-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email
                    })
                });
                const data = await res.json();
                if (!res.ok) {
                    return {
                        success: false,
                        error: data.error || 'Request failed'
                    };
                }
                return {
                    success: true,
                    message: data.message,
                    emailProvider: data.emailProvider,
                    // DEV-ONLY (sandbox): reset code surfaced in-place when the server
                    // has no email provider configured. Never set in production.
                    devDelivery: data.devDelivery || undefined
                };
            } catch  {
                return {
                    success: false,
                    error: 'Network error. Please try again.'
                };
            }
        }
    }["useAuth.useCallback[forgotPassword]"], []);
    // Reset password with OTP
    const resetPassword = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAuth.useCallback[resetPassword]": async (params)=>{
            try {
                const res = await fetch('/api/auth/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(params)
                });
                const data = await res.json();
                if (!res.ok) {
                    return {
                        success: false,
                        error: data.error || 'Reset failed'
                    };
                }
                return {
                    success: true
                };
            } catch  {
                return {
                    success: false,
                    error: 'Network error. Please try again.'
                };
            }
        }
    }["useAuth.useCallback[resetPassword]"], []);
    // Sign out
    const signOut = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAuth.useCallback[signOut]": async ()=>{
            try {
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/auth/signout', {
                    method: 'POST',
                    credentials: 'include'
                }, {
                    errorMessage: 'Sign out failed',
                    showToast: false
                });
            } catch  {
            // Continue even if API call fails — still clear local state
            }
            // ACCOUNT ISOLATION (cache layer): purge every account-scoped client
            // cache BEFORE the next login so account B can never briefly observe
            // account A's data through React Query snapshots, zustand persists or
            // user-scoped localStorage keys.
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$cache$2d$invalidation$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clearAccountScopedClientState"])();
            window.dispatchEvent(new Event('aqos:auth-logout')); // React Query clear (providers.tsx)
            logout();
            __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"].getState().reset(); // Reset subscription store
            router.push('/');
        }
    }["useAuth.useCallback[signOut]"], [
        logout,
        router
    ]);
    // Refresh auth state
    const refreshAuth = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAuth.useCallback[refreshAuth]": async ()=>{
            setLoading(true);
            await fetchUser();
        }
    }["useAuth.useCallback[refreshAuth]"], [
        setLoading,
        fetchUser
    ]);
    return {
        user,
        isAuthenticated,
        isLoading,
        mfaRequired,
        mfaSessionToken,
        signIn,
        signUp,
        signOut,
        verifyMfa,
        verifyEmail,
        forgotPassword,
        resetPassword,
        refreshAuth,
        updatePlan,
        updateMfaEnabled,
        fetchUser
    };
}
_s(useAuth, "NEnkC2CGRNrDnYy1fJ2qa0RhScg=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAuthStore"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/hooks/use-token-refresh.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useTokenRefresh",
    ()=>useTokenRefresh
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/auth-store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$silent$2d$refresh$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/silent-refresh.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
const REFRESH_INTERVAL_MS = 14 * 60 * 1000; // 14 minutes (tokens expire in 15 min)
// ── P4 (Sep 2026): bounded backoff for infrastructure failures ──────
// A 5xx/network failure during refresh is "temporarily unavailable", NOT
// "logged out". We retry with bounded exponential backoff (60s → 120s →
// 240s → 480s, capped). After MAX_CONSECUTIVE_INFRA_FAILURES the interval
// stays at the cap until the backend recovers — bounded, no infinite tight
// loop, and the user is never falsely logged out.
const INFRA_BACKOFF_STEPS_MS = [
    60_000,
    120_000,
    240_000,
    480_000
];
const MAX_CONSECUTIVE_INFRA_FAILURES = 12;
function useTokenRefresh() {
    _s();
    const { isAuthenticated, setUser, logout } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAuthStore"])();
    const timerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const isRefreshing = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(false);
    const infraFailures = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    const doRefresh = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useTokenRefresh.useCallback[doRefresh]": async (force)=>{
            // Prevent concurrent refreshes within this tab. Cross-tab concurrency
            // is serialized inside silentRefresh() via the Web Locks API —
            // without that, two tabs racing the same pre-rotation cookie caused
            // a false SESSION_REVOKED and logged the user out (RCA 2026-09-29).
            if (isRefreshing.current) return;
            isRefreshing.current = true;
            try {
                const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$silent$2d$refresh$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["silentRefresh"])({
                    force
                });
                if (result.ok) {
                    infraFailures.current = 0; // recovered
                    if (result.user) {
                        setUser(result.user);
                    }
                    return;
                }
                if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$silent$2d$refresh$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isAuthoritativeLogout"])(result)) {
                    // Only an AUTHORITATIVE invalid-session response logs the user
                    // out (SESSION_EXPIRED / SESSION_REVOKED / INVALID_TOKEN / ...).
                    logout();
                    return;
                }
                // 401/403 with a non-logout code, 5xx, 429, network errors →
                // infrastructure or transient failure. NEVER logout on these.
                infraFailures.current = Math.min(infraFailures.current + 1, MAX_CONSECUTIVE_INFRA_FAILURES);
            } finally{
                isRefreshing.current = false;
            }
        }
    }["useTokenRefresh.useCallback[doRefresh]"], [
        setUser,
        logout
    ]);
    // Interval refresh MUST be forced: it is the keep-alive that prevents
    // the 15-minute access token from expiring between intervals. The
    // visibility/focus refresh is throttled inside silentRefresh (skipped
    // when a refresh succeeded within the last 10 minutes) to avoid
    // pointless token rotation on every tab switch.
    const refreshTokens = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useTokenRefresh.useCallback[refreshTokens]": ()=>doRefresh(true)
    }["useTokenRefresh.useCallback[refreshTokens]"], [
        doRefresh
    ]);
    const refreshOnFocus = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useTokenRefresh.useCallback[refreshOnFocus]": ()=>doRefresh(false)
    }["useTokenRefresh.useCallback[refreshOnFocus]"], [
        doRefresh
    ]);
    // ── Set up interval timer (with bounded infra backoff) ─────────
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useTokenRefresh.useEffect": ()=>{
            if (!isAuthenticated) {
                infraFailures.current = 0;
                if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }
                return;
            }
            const scheduleNext = {
                "useTokenRefresh.useEffect.scheduleNext": ()=>{
                    if (timerRef.current) clearInterval(timerRef.current);
                    const step = Math.min(infraFailures.current, INFRA_BACKOFF_STEPS_MS.length - 1);
                    const interval = infraFailures.current === 0 ? REFRESH_INTERVAL_MS : INFRA_BACKOFF_STEPS_MS[step];
                    timerRef.current = setInterval({
                        "useTokenRefresh.useEffect.scheduleNext": ()=>{
                            refreshTokens().then(scheduleNext);
                        }
                    }["useTokenRefresh.useEffect.scheduleNext"], interval);
                }
            }["useTokenRefresh.useEffect.scheduleNext"];
            scheduleNext();
            return ({
                "useTokenRefresh.useEffect": ()=>{
                    if (timerRef.current) {
                        clearInterval(timerRef.current);
                        timerRef.current = null;
                    }
                }
            })["useTokenRefresh.useEffect"];
        }
    }["useTokenRefresh.useEffect"], [
        isAuthenticated,
        refreshTokens
    ]);
    // ── Handle visibility change (refresh when tab becomes active) ─
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useTokenRefresh.useEffect": ()=>{
            if (!isAuthenticated) return;
            const handleVisibilityChange = {
                "useTokenRefresh.useEffect.handleVisibilityChange": ()=>{
                    if (document.visibilityState === 'visible') {
                        refreshOnFocus();
                    }
                }
            }["useTokenRefresh.useEffect.handleVisibilityChange"];
            document.addEventListener('visibilitychange', handleVisibilityChange);
            return ({
                "useTokenRefresh.useEffect": ()=>{
                    document.removeEventListener('visibilitychange', handleVisibilityChange);
                }
            })["useTokenRefresh.useEffect"];
        }
    }["useTokenRefresh.useEffect"], [
        isAuthenticated,
        refreshOnFocus
    ]);
}
_s(useTokenRefresh, "9q+o/aqks/T7/09HD1o4jOArg9Y=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAuthStore"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/hooks/use-subscription-sync.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useSubscriptionSync",
    ()=>useSubscriptionSync
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/subscription-store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/api-error-handler.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — useSubscriptionSync Hook
// Phase 4: Subscription System + Credits Engine + Plan Gates + Billing
//
// Syncs subscription data from the backend to the Zustand store.
// Called once when the user enters the dashboard to ensure fresh
// subscription/credits/entitlements data.
// ═══════════════════════════════════════════════════════════════════
'use client';
;
;
;
// Sync interval: 5 minutes
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
function useSubscriptionSync() {
    _s();
    const syncFromBackend = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"])({
        "useSubscriptionSync.useSubscriptionStore[syncFromBackend]": (s)=>s.syncFromBackend
    }["useSubscriptionSync.useSubscriptionStore[syncFromBackend]"]);
    const syncEntitlements = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"])({
        "useSubscriptionSync.useSubscriptionStore[syncEntitlements]": (s)=>s.syncEntitlements
    }["useSubscriptionSync.useSubscriptionStore[syncEntitlements]"]);
    const setLoading = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"])({
        "useSubscriptionSync.useSubscriptionStore[setLoading]": (s)=>s.setLoading
    }["useSubscriptionSync.useSubscriptionStore[setLoading]"]);
    const markUnavailable = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"])({
        "useSubscriptionSync.useSubscriptionStore[markUnavailable]": (s)=>s.markUnavailable
    }["useSubscriptionSync.useSubscriptionStore[markUnavailable]"]);
    const lastFetchedAt = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"])({
        "useSubscriptionSync.useSubscriptionStore[lastFetchedAt]": (s)=>s.lastFetchedAt
    }["useSubscriptionSync.useSubscriptionStore[lastFetchedAt]"]);
    const reset = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"])({
        "useSubscriptionSync.useSubscriptionStore[reset]": (s)=>s.reset
    }["useSubscriptionSync.useSubscriptionStore[reset]"]);
    const isFetchingRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(false);
    const doSync = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useSubscriptionSync.useCallback[doSync]": async ()=>{
            // Prevent concurrent syncs
            if (isFetchingRef.current) return;
            isFetchingRef.current = true;
            setLoading(true);
            // ── P3 (Sep 2026): failure semantics ─────────────────────────
            // 401               → genuinely unauthenticated → reset store.
            // 403/5xx/network   → infrastructure/unavailable → markUnavailable()
            //                     and KEEP the last-known-good plan. NEVER map a
            //                     backend failure to plan "free" (that falsely
            //                     stripped Pro/Elite users of their features).
            let sawInfraFailure = false;
            try {
                // Fetch subscription current status
                try {
                    const subData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/subscriptions/current', {
                        credentials: 'include'
                    }, {
                        errorMessage: 'Failed to sync subscription status',
                        showToast: false
                    });
                    syncFromBackend(subData);
                } catch (error) {
                    if (error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ApiError"] && error.status === 401) {
                        // Not authenticated — reset store (correct: real logout state)
                        reset();
                        return;
                    }
                    sawInfraFailure = true;
                    // Other errors — log but don't block entitlements fetch
                    console.warn('[SubscriptionSync] Failed to fetch subscription status (plan state preserved):', error);
                }
                // Fetch entitlements
                try {
                    const entData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/subscriptions/entitlements', {
                        credentials: 'include'
                    }, {
                        errorMessage: 'Failed to sync entitlements',
                        showToast: false
                    });
                    syncEntitlements(entData);
                } catch (error) {
                    if (error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ApiError"] && error.status === 401) {
                        reset();
                        return;
                    }
                    sawInfraFailure = true;
                    console.warn('[SubscriptionSync] Failed to fetch entitlements (entitlements preserved):', error);
                }
                // P3: only after BOTH fetch attempts resolved — if any failed with a
                // non-401 error, mark the store "unavailable". currentPlan keeps its
                // last-known-good value (loading/never-verified is NOT Free).
                if (sawInfraFailure) {
                    markUnavailable();
                }
            } catch (error) {
                console.error('[SubscriptionSync] Unexpected error during sync:', error);
                markUnavailable();
            } finally{
                isFetchingRef.current = false;
                setLoading(false);
            }
        }
    }["useSubscriptionSync.useCallback[doSync]"], [
        syncFromBackend,
        syncEntitlements,
        setLoading,
        markUnavailable,
        reset
    ]);
    // Initial sync on mount
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useSubscriptionSync.useEffect": ()=>{
            doSync();
        }
    }["useSubscriptionSync.useEffect"], [
        doSync
    ]);
    // Periodic sync every 5 minutes
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useSubscriptionSync.useEffect": ()=>{
            const interval = setInterval({
                "useSubscriptionSync.useEffect.interval": ()=>{
                    doSync();
                }
            }["useSubscriptionSync.useEffect.interval"], SYNC_INTERVAL_MS);
            return ({
                "useSubscriptionSync.useEffect": ()=>clearInterval(interval)
            })["useSubscriptionSync.useEffect"];
        }
    }["useSubscriptionSync.useEffect"], [
        doSync
    ]);
    // Re-sync on window focus (if more than 30 seconds since last fetch)
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useSubscriptionSync.useEffect": ()=>{
            const handleFocus = {
                "useSubscriptionSync.useEffect.handleFocus": ()=>{
                    const now = Date.now();
                    if (!lastFetchedAt || now - lastFetchedAt > 30 * 1000) {
                        doSync();
                    }
                }
            }["useSubscriptionSync.useEffect.handleFocus"];
            window.addEventListener('focus', handleFocus);
            return ({
                "useSubscriptionSync.useEffect": ()=>window.removeEventListener('focus', handleFocus)
            })["useSubscriptionSync.useEffect"];
        }
    }["useSubscriptionSync.useEffect"], [
        doSync,
        lastFetchedAt
    ]);
}
_s(useSubscriptionSync, "KWvLetfP/kSN1cJezjVVeDLUGbo=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/hooks/use-plan-availability.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "isPlanCheckoutAvailable",
    ()=>isPlanCheckoutAvailable,
    "usePlanAvailability",
    ()=>usePlanAvailability
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — usePlanAvailability
//
// Fetches the public GET /api/payments/provider-status response and
// exposes both halves of the FINAL PAYMENT ACTIVATION ARCHITECTURE:
//
//   • planStatus — every paid plan (Starter/Pro/Elite) is IMPLEMENTED
//     and ACTIVE. The pricing surfaces must NEVER render "Coming Soon"
//     for a paid plan; a missing provider env var is a configuration
//     state, not a product availability decision.
//
//   • planAvailability — per plan/cycle provider configuration
//     booleans. Used ONLY to decide whether the plan card shows the
//     "checkout implemented — payment provider configuration required"
//     notice under an ENABLED CTA. It never disables the CTA.
//
// Server-side checkout routes remain the real enforcement point: an
// enabled CTA clicked without provider configuration reaches the
// server, which reports the missing configuration honestly (no fake
// payment path).
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
'use client';
;
function usePlanAvailability() {
    _s();
    const [availability, setAvailability] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "usePlanAvailability.useEffect": ()=>{
            let cancelled = false;
            fetch('/api/payments/provider-status').then({
                "usePlanAvailability.useEffect": (r)=>r.ok ? r.json() : null
            }["usePlanAvailability.useEffect"]).then({
                "usePlanAvailability.useEffect": (data)=>{
                    if (!cancelled && data && data.planAvailability) {
                        setAvailability(data.planAvailability);
                    }
                }
            }["usePlanAvailability.useEffect"]).catch({
                "usePlanAvailability.useEffect": ()=>{
                /* availability is advisory — server-side checkout still enforces */ }
            }["usePlanAvailability.useEffect"]);
            return ({
                "usePlanAvailability.useEffect": ()=>{
                    cancelled = true;
                }
            })["usePlanAvailability.useEffect"];
        }
    }["usePlanAvailability.useEffect"], []);
    return availability;
}
_s(usePlanAvailability, "0PUW0eFbiQYqkLkSsOMWPQirR70=");
function isPlanCheckoutAvailable(availability, plan, cycle) {
    if (!availability) return null;
    const entry = availability[plan]?.[cycle];
    if (!entry) return null;
    return entry.available;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/hooks/use-keyboard-shortcuts.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useKeyboardShortcuts",
    ()=>useKeyboardShortcuts
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/store.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
'use client';
;
;
const TAB_KEYS = {
    '1': 'overview',
    '2': 'leads',
    '3': 'pipeline',
    '4': 'discover',
    '5': 'outreach',
    '6': 'assistant',
    '7': 'insights',
    '8': 'deals',
    '9': 'competitors'
};
function useKeyboardShortcuts({ onShowShortcuts, onOpenCommandPalette, onNewLead }) {
    _s();
    const { setActiveTab } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAppStore"])();
    const handleKeyDown = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useKeyboardShortcuts.useCallback[handleKeyDown]": (e)=>{
            const target = e.target;
            const tagName = target.tagName.toLowerCase();
            const isInputLike = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
            // Ctrl+K / Cmd+K: Open Command Palette (works even in inputs)
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                onOpenCommandPalette();
                return;
            }
            // Don't process other shortcuts when in an input-like element
            if (isInputLike) return;
            // 1-8: Switch tabs
            if (TAB_KEYS[e.key]) {
                e.preventDefault();
                setActiveTab(TAB_KEYS[e.key]);
                return;
            }
            // N: Create new lead
            if (e.key === 'n' || e.key === 'N') {
                e.preventDefault();
                onNewLead?.();
                return;
            }
            // ?: Show shortcuts help
            if (e.key === '?' || e.shiftKey && e.key === '/') {
                e.preventDefault();
                onShowShortcuts();
                return;
            }
        }
    }["useKeyboardShortcuts.useCallback[handleKeyDown]"], [
        setActiveTab,
        onShowShortcuts,
        onOpenCommandPalette,
        onNewLead
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useKeyboardShortcuts.useEffect": ()=>{
            document.addEventListener('keydown', handleKeyDown);
            return ({
                "useKeyboardShortcuts.useEffect": ()=>document.removeEventListener('keydown', handleKeyDown)
            })["useKeyboardShortcuts.useEffect"];
        }
    }["useKeyboardShortcuts.useEffect"], [
        handleKeyDown
    ]);
}
_s(useKeyboardShortcuts, "at8sYY283ebQM8h53Aarq4A5BXc=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAppStore"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/hooks/use-payment-redirect.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "usePaymentRedirect",
    ()=>usePaymentRedirect
]);
// ═════════════════════════════════════════════════════════════════════
// usePaymentRedirect — handles the Stripe redirect back to /dashboard.
//
// PART 5 of SUBSCRIPTION-PAYMENT-FIX-20260909:
//   Stripe success_url → /dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}
//   Stripe cancel_url  → /dashboard?payment=cancelled
//   Credit add-on success_url → /dashboard?credits_added=true&session_id=...
//
// On mount this hook:
//   1. Reads payment=success | payment=cancelled | credits_added=true
//      (+ session_id) from the URL.
//   2. For success flows, calls POST /api/payments/verify-session with
//      { sessionId }. The server retrieves the session from Stripe and —
//      when payment_status === 'paid' — atomically activates the plan
//      (confirmPaymentAndActivate) or fulfills the credit add-on
//      (fulfillCreditAddon). This covers the case where the Stripe
//      webhook hasn't arrived yet.
//   3. Re-syncs the local subscription store from /api/subscriptions/current.
//   4. Shows the success toast:
//        - Subscription: "Welcome to [Plan Name]! Your plan is now active."
//        - Credit add-on: "N credits added to your account"
//   5. Cleans the URL (history.replaceState) so refreshes don't re-trigger.
// ═════════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/sonner/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/subscription-store.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
function usePaymentRedirect() {
    _s();
    const syncFromBackend = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"])({
        "usePaymentRedirect.useSubscriptionStore[syncFromBackend]": (s)=>s.syncFromBackend
    }["usePaymentRedirect.useSubscriptionStore[syncFromBackend]"]);
    // Guard against double-invocation (React 18 StrictMode runs effects twice
    // in dev — without the ref we'd fire the verify call twice).
    const handledRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(false);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "usePaymentRedirect.useEffect": ()=>{
            if (handledRef.current) return;
            if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
            ;
            const params = new URLSearchParams(window.location.search);
            const payment = params.get('payment');
            const creditsAdded = params.get('credits_added');
            const sessionId = params.get('session_id');
            if (!payment && creditsAdded !== 'true') return;
            handledRef.current = true;
            const cleanUrl = {
                "usePaymentRedirect.useEffect.cleanUrl": ()=>{
                    window.history.replaceState({}, '', window.location.pathname);
                }
            }["usePaymentRedirect.useEffect.cleanUrl"];
            const run = {
                "usePaymentRedirect.useEffect.run": async ()=>{
                    // ── Cancelled on Stripe ──
                    if (payment === 'cancelled') {
                        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].info('Payment cancelled — you were not charged.');
                        cleanUrl();
                        return;
                    }
                    // ── Success (subscription or credit add-on) ──
                    const isCredits = creditsAdded === 'true';
                    let verified = false;
                    let planName = null;
                    let creditsGranted = 0;
                    if (sessionId) {
                        try {
                            const res = await fetch('/api/payments/verify-session', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                credentials: 'include',
                                body: JSON.stringify({
                                    sessionId
                                })
                            });
                            if (res.ok) {
                                const data = await res.json();
                                verified = data.paid === true;
                                planName = data.plan || null;
                                creditsGranted = typeof data.credits === 'number' ? data.credits : 0;
                            }
                        } catch  {
                        // Network failure — fall through to sync-only + generic message.
                        // The Stripe webhook remains the authoritative activator.
                        }
                    }
                    // Re-sync the subscription store so the UI reflects the new plan /
                    // credit balance immediately.
                    try {
                        const subRes = await fetch('/api/subscriptions/current', {
                            credentials: 'include'
                        });
                        if (subRes.ok) {
                            syncFromBackend(await subRes.json());
                        }
                    } catch  {
                    // Ignore — the 60s credit poll and 5-min subscription sync will
                    // pick up the change.
                    }
                    if (verified) {
                        if (isCredits) {
                            __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].success(creditsGranted > 0 ? `${creditsGranted.toLocaleString()} credits added to your account` : 'Credits added to your account');
                        } else {
                            const display = planName === 'pro' ? 'Pro' : planName === 'elite' ? 'Elite' : planName ? planName.charAt(0).toUpperCase() + planName.slice(1) : 'your new plan';
                            __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].success(`Welcome to ${display}! Your plan is now active.`);
                        }
                    } else {
                        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].info('Payment received. Your plan will update automatically within a minute.');
                    }
                    cleanUrl();
                }
            }["usePaymentRedirect.useEffect.run"];
            void run();
        }
    }["usePaymentRedirect.useEffect"], [
        syncFromBackend
    ]);
}
_s(usePaymentRedirect, "wr8SYsD+VPmn3S9tAPPXs6E75TE=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Home
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$auth$2d$gate$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/dashboard/auth-gate.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$providers$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/providers.tsx [app-client] (ecmascript)");
'use client';
;
;
;
function Home() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$providers$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Providers"], {
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$auth$2d$gate$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
            fileName: "[project]/src/app/page.tsx",
            lineNumber: 9,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/app/page.tsx",
        lineNumber: 8,
        columnNumber: 5
    }, this);
}
_c = Home;
var _c;
__turbopack_context__.k.register(_c, "Home");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_da61e538._.js.map