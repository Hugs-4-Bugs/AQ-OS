---
Task ID: 7
Agent: Main Agent
Task: Phase 4 - Subscription System + Credits Engine + Plan Gates + Billing Foundation

Work Log:
- Audited existing codebase: subscription-store.ts, entitlement-service.ts, subscription-service.ts, credit-service.ts, credit-display.tsx, upgrade-modal.tsx, dashboard-layout.tsx, auth-gate.tsx, Prisma schema, .env files
- Created useSubscriptionSync hook (/src/hooks/use-subscription-sync.ts):
  - Fetches /api/subscriptions/current and /api/subscriptions/entitlements on mount
  - Syncs subscription data from backend to Zustand store (syncFromBackend + syncEntitlements)
  - Auto-refreshes every 5 minutes
  - Re-syncs on window focus (if >30s since last fetch)
  - Prevents concurrent syncs
  - Resets store on 401 (unauthenticated)
- Created TrialBanner component (/src/components/dashboard/trial-banner.tsx):
  - Shows banner when user is on trial (isTrial=true && currentPlan=free)
  - Displays days remaining with urgency coloring (≤3 days = amber, expired = red)
  - CTA button "Upgrade Now" triggers upgrade modal
  - Animated entrance/exit with Framer Motion
- Created CreditWarningBanner component (/src/components/dashboard/credit-warning-banner.tsx):
  - Shows banner when creditWarningStatus is 'low' or 'zero'
  - Zero credits: red urgent banner with "Get Credits" CTA
  - Low credits: amber warning with percentage display and "Top Up" CTA
  - Dismissible with X button
  - Animated entrance/exit with Framer Motion
- Integrated subscription sync + banners in auth-gate.tsx:
  - Added AuthenticatedWrapper component that:
    - Calls useSubscriptionSync() to sync subscription data
    - Displays TrialBanner at top of dashboard
    - Displays CreditWarningBanner (dismissible) below trial banner
    - Passes upgradeModalOpen state to DashboardLayout via externalUpgradeModalOpen prop
  - State for upgrade modal and credit warning dismissal managed at AuthGate level
  - DashboardLayout rendered inside flex container to fill remaining space after banners
- Integrated subscription sync in dashboard-layout.tsx:
  - Added externalUpgradeModalOpen and onExternalUpgradeModalChange props
  - Falls back to internal state when props not provided (backward compatible)
  - Connected rolloverCredits and addonCredits from subscription store to CreditDisplay
  - All 3 CreditDisplay instances now receive store-driven props
  - creditWarningStatus read from store (available for future UI enhancements)
- Added UsageTracking model to Prisma schema:
  - Fields: id, userId, feature, action, count, periodStart, periodEnd
  - Relation to User model (onDelete: Cascade)
  - Unique constraint on [userId, feature, periodStart]
  - Indexes on userId, feature, periodStart, periodEnd
  - Added usageTracking UsageTracking[] relation to User model
- Added billingCycle field to Subscription model:
  - billingCycle String @default("monthly") with comment // monthly, yearly
- Ran prisma db push successfully — schema applied, Prisma Client regenerated
- Created seed-entitlements.ts script (/scripts/seed-entitlements.ts):
  - Seeds PlanEntitlement table from ENTITLEMENTS config (51 records: 17 features × 3 plans)
  - Checks if entitlements already exist before inserting
  - Updates existing records if values differ
  - Detailed progress logging with emoji indicators
  - Can be run with: bun run scripts/seed-entitlements.ts
  - Successfully seeded 51 entitlements (0 errors)
- Updated .env.local.example with new sections:
  - Billing & Credits Configuration: TRIAL_DURATION_DAYS, CREDIT_WARNING_THRESHOLD, CREDIT_LOW_THRESHOLD, MONTHLY_CREDIT_RESET_ENABLED, CREDIT_ROLLOVER_ENABLED, MAX_ROLLOVER_CREDITS, IDEMPOTENCY_WINDOW_MINUTES
  - Feature Flags (Server-side): FEATURE_MAGIC_LINK, FEATURE_OTP_LOGIN, FEATURE_GOOGLE_OAUTH, FEATURE_GMAIL_INTEGRATION, FEATURE_TELEGRAM_INTEGRATION, FEATURE_WHATSAPP_INTEGRATION
  - Billing Webhook: BILLING_WEBHOOK_SECRET
  - Realtime-ready billing: BILLING_WS_ENABLED, BILLING_WS_PORT
- Updated .env with same new variables (with sensible defaults)
- Lint: 0 errors, 1 pre-existing warning (TanStack Table)
- Dev server: Running successfully on port 3000

Stage Summary:
- SUBSCRIPTION SYNC: useSubscriptionSync hook auto-fetches + auto-refreshes subscription data
- TRIAL BANNER: Shows days remaining + upgrade CTA for trial users
- CREDIT WARNING: Shows low/zero credit warnings with dismiss and top-up CTA
- AUTH GATE: Fully integrated with banners + sync + modal state passthrough
- DASHBOARD LAYOUT: Props-driven upgrade modal + store-connected CreditDisplay
- DATABASE: UsageTracking model + billingCycle field added and pushed
- SEED SCRIPT: 51 plan entitlements seeded (free=17, pro=17, elite=17)
- ENVIRONMENT: Complete billing/credits/feature flag configuration added
- LINT: 0 errors, 1 pre-existing warning
- BACKWARD COMPATIBLE: DashboardLayout still works without external props

Files Created:
- /src/hooks/use-subscription-sync.ts
- /src/components/dashboard/trial-banner.tsx
- /src/components/dashboard/credit-warning-banner.tsx
- /scripts/seed-entitlements.ts

Files Modified:
- /src/components/dashboard/auth-gate.tsx (added imports, AuthenticatedWrapper with sync+banners, upgradeModal state)
- /src/components/dashboard/dashboard-layout.tsx (added external props, store-driven CreditDisplay props)
- /prisma/schema.prisma (UsageTracking model, billingCycle on Subscription, usageTracking relation on User)
- /.env (added billing/credits/feature flags/webhook/ws config)
- /.env.local.example (added billing/credits/feature flags/webhook/ws config)
