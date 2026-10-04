module.exports = [
"[project]/src/lib/business-profile.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "archiveBusinessProfile",
    ()=>archiveBusinessProfile,
    "buildBusinessContextBlock",
    ()=>buildBusinessContextBlock,
    "createBusinessProfile",
    ()=>createBusinessProfile,
    "fetchBusinessProfiles",
    ()=>fetchBusinessProfiles,
    "updateBusinessProfile",
    ()=>updateBusinessProfile
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Business Profiles (client API + server-side context
// resolution)
//
// Two halves:
//  1. Client helpers (fetch/create/update/archive) used by the settings UI
//     and profile selectors.
//  2. The server-side resolver (`resolveBusinessContext`) lives in
//     ./business-profile-server (SERVER-ONLY — imports Prisma). It applies
//     the spec resolution order: profile defaults first, campaign overrides
//     win where provided, nothing cross-user or fabricated.
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/api-error-handler.ts [app-ssr] (ecmascript)");
;
async function fetchBusinessProfiles() {
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiCall"])('/api/business-profiles', undefined, {
        errorMessage: 'Failed to load business profiles'
    });
    return data.profiles;
}
async function createBusinessProfile(input) {
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiCall"])('/api/business-profiles', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(input)
    }, {
        errorMessage: 'Failed to create business profile'
    });
    return data.profile;
}
async function updateBusinessProfile(id, input) {
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiCall"])(`/api/business-profiles/${id}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(input)
    }, {
        errorMessage: 'Failed to update business profile'
    });
    return data.profile;
}
async function archiveBusinessProfile(id) {
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiCall"])(`/api/business-profiles/${id}`, {
        method: 'DELETE'
    }, {
        errorMessage: 'Failed to archive business profile'
    });
}
function joinList(items) {
    return items.map((s)=>s.description ? `${s.name} — ${s.description}` : s.name).join('; ');
}
function buildBusinessContextBlock(ctx) {
    if (!ctx || !ctx.companyName && !ctx.description && ctx.productsServices.length === 0) {
        return '';
    }
    const lines = [];
    lines.push('=== SENDER BUSINESS CONTEXT (who is reaching out) ===');
    if (ctx.companyName) lines.push(`Business name: ${ctx.companyName}`);
    if (ctx.industry) lines.push(`Industry: ${ctx.industry}`);
    if (ctx.website) lines.push(`Website: ${ctx.website}`);
    if (ctx.description) lines.push(`What they do: ${ctx.description}`);
    if (ctx.valueProposition) lines.push(`Value proposition: ${ctx.valueProposition}`);
    if (ctx.productsServices.length > 0) {
        lines.push(`Products/services offered: ${joinList(ctx.productsServices)}`);
    }
    if (ctx.targetAudience) lines.push(`Target customers: ${ctx.targetAudience}`);
    if (ctx.serviceAreas) lines.push(`Service areas: ${ctx.serviceAreas}`);
    if (ctx.goals) lines.push(`Campaign goal: ${ctx.goals}`);
    if (ctx.preferredCta) lines.push(`Preferred call to action: ${ctx.preferredCta}`);
    if (ctx.differentiators.length > 0) lines.push(`Differentiators/proof: ${ctx.differentiators.join('; ')}`);
    if (ctx.additionalContext) lines.push(`Additional sender instructions: ${ctx.additionalContext}`);
    if (ctx.overriddenFields.length > 0) {
        lines.push(`Campaign-specific overrides applied: ${ctx.overriddenFields.join(', ')}`);
    }
    lines.push('Use ONLY this context to describe the sender. If a detail is not listed here, treat it as unknown — never invent products, results, statistics, or client relationships for the sender.');
    return lines.join('\n');
}
}),
"[project]/src/lib/plan-feature-limits.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Client-Safe Plan Limit Constants
//
// Plan Eligibility Correction (Oct 2026):
//   • Autonomous workflows and the complete AI Business Growth Agent
//     automation are available EXCLUSIVELY to Pro and Elite subscribers.
//     Free and Starter subscribers have no access — enforced in the UI
//     (PlanGate) AND on the backend (workflow_access entitlement).
//   • Active business profiles / niches per plan:
//       Free 1 · Starter 1 · Pro 3 · Elite 7
//     The limits apply to PROFILES/NICHES, never to the number of leads
//     a workflow processes.
//
// This module is intentionally dependency-free (no `@/lib/db`, no server
// modules) so both client components and the server-side entitlement
// service can import the SAME single source of truth.
// ═══════════════════════════════════════════════════════════════════
__turbopack_context__.s([
    "AUTOMATION_MIN_PLAN",
    ()=>AUTOMATION_MIN_PLAN,
    "AUTOMATION_PLAN_TIERS",
    ()=>AUTOMATION_PLAN_TIERS,
    "BUSINESS_PROFILE_LIMITS",
    ()=>BUSINESS_PROFILE_LIMITS,
    "PLAN_TIER_LABELS",
    ()=>PLAN_TIER_LABELS,
    "PLAN_TIER_ORDER",
    ()=>PLAN_TIER_ORDER,
    "nextProfileLimitPlan",
    ()=>nextProfileLimitPlan,
    "toPlanTier",
    ()=>toPlanTier
]);
const PLAN_TIER_ORDER = [
    'free',
    'starter',
    'pro',
    'elite'
];
const PLAN_TIER_LABELS = {
    free: 'Free',
    starter: 'Starter',
    pro: 'Pro',
    elite: 'Elite'
};
const BUSINESS_PROFILE_LIMITS = {
    free: 1,
    starter: 1,
    pro: 3,
    elite: 7
};
const AUTOMATION_MIN_PLAN = 'pro';
const AUTOMATION_PLAN_TIERS = [
    'pro',
    'elite'
];
function toPlanTier(plan) {
    const normalized = (plan ?? '').toLowerCase().trim();
    return PLAN_TIER_ORDER.includes(normalized) ? normalized : 'free';
}
function nextProfileLimitPlan(plan) {
    const current = BUSINESS_PROFILE_LIMITS[plan] ?? BUSINESS_PROFILE_LIMITS.free;
    for (const tier of PLAN_TIER_ORDER){
        if (BUSINESS_PROFILE_LIMITS[tier] > current) return tier;
    }
    return null;
}
}),
];

//# sourceMappingURL=src_lib_640332ba._.js.map