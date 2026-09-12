# Task 6: Billing Settings Panel - Real Backend Data Integration

## Agent: Main Agent
## Date: 2025-03-05

## Summary

Enhanced the billing settings panel in `settings-panel.tsx` to use REAL backend data instead of mock data. All billing-related sections now pull from the subscription store, TanStack Query hooks, and real API endpoints.

## Changes Made

### File Modified: `/home/z/my-project/src/components/dashboard/settings-panel.tsx`

### 1. Imports Updated
- Added `useQuery`, `useMutation`, `useQueryClient` from `@tanstack/react-query`
- Added `Loader2`, `ArrowUpRight`, `Info`, `ShieldAlert` from lucide-react
- Added `Progress`, `Skeleton`, `Tooltip`/`TooltipContent`/`TooltipProvider`/`TooltipTrigger` from shadcn/ui
- Added `TrialBanner` from `@/components/dashboard/trial-banner`
- Added `CreditWarningBanner` from `@/components/dashboard/credit-warning-banner`
- Added `DowngradeModal` from `@/components/dashboard/downgrade-modal`
- Added `UpgradeModal` from `@/components/dashboard/upgrade-modal`
- Added `PLAN_DETAILS` from `@/lib/subscription-store`
- Added `useCredits` from `@/hooks/use-credits`

### 2. Mock Data Removed
- Removed `MOCK_PLAN` constant (was hardcoded `'pro'`)
- Removed `MOCK_BILLING_HISTORY` constant
- Added `CREDIT_ADDON_PACKS` matching backend `/api/payments/credit-addons` data

### 3. Real Data Integration (Subscription Store)
Added 11 subscription store selectors:
- `currentPlan` - real plan type from store
- `subscriptionStatus` - trialing/active/past_due/canceled/expired
- `credits` - current credit balance
- `creditsMonthly` - monthly credit allocation
- `isTrial` - whether user is on trial
- `trialEndsAt` - trial expiration date
- `trialDaysRemaining` - days left in trial
- `creditWarningStatus` - ok/low/zero
- `rolloverCredits` - rolled over credits
- `addonCredits` - purchased addon credits
- `setPlan` - plan setter for downgrade

### 4. TanStack Query Hooks
- **Credit History Query**: Fetches from `/api/credits/history?limit=20` with 30s stale time and 60s refetch interval
- **Addon Purchase Mutation**: POSTs to `/api/payments/credit-addons`, refetches credits on success
- **Coupon Validation Mutation**: POSTs to `/api/payments/validate-coupon`, shows toast on success/error

### 5. New State Variables
- `gstNumber` - GST number input with save button
- `couponCode` - coupon code input
- `upgradeModalOpen` / `downgradeModalOpen` - modal controls
- `downgradeTargetPlan` - target plan for downgrade modal
- `processingAddonId` - tracks which addon is being purchased

### 6. Subscription Tab Complete Rewrite

**Trial Banner**: Shows `TrialBanner` component if user is trialing with days remaining

**Credit Warning Banner**: Shows `CreditWarningBanner` if credits are low/zero, with scroll-to-addons action

**Current Plan Card**:
- Real plan name and price from `PLAN_DETAILS`
- Subscription status badge (color-coded: green=active, purple=trialing, red=past_due, amber=canceled)
- Credit balance badge (remaining/total)
- Credit warning indicator
- Credit progress bar (used/total) with `Progress` component
- Rollover/addon credit indicators
- Trial countdown with expiry date and upgrade button
- "Change Plan" button opens `UpgradeModal`

**Trial Info Card** (only when trialing):
- Days remaining, trial credits, Pro features stats
- Upgrade CTA button

**Usage Summary Card**:
- Progress bars per feature category (Lead Discovery, Deep Analysis, Outreach, Other)
- Skeleton loaders while loading
- Color-coded progress bars

**Payment Method Card**:
- Shows "Not configured - Will be set up on first payment"
- "Update" button disabled with tooltip "Available after first payment"

**Credit Transaction History**:
- Fetches from `/api/credits/history` via TanStack Query
- Shows action label, date, credits (green for +/red for -), balance after
- Skeleton loaders while loading
- Empty state with icon
- Max height 96 with scroll

**Coupon Code Section**:
- Input + Apply button
- Enter key support
- Loading spinner while validating
- Real API call to `/api/payments/validate-coupon`

**GST Number Section**:
- Input with Save button
- Uppercase auto-formatting
- Help text for Indian businesses

**Credit Add-ons**:
- Three packs matching backend: 100 (₹199), 500 (₹799), 1000 (₹1,299)
- Real API call via addon mutation
- Processing spinner per addon
- Refetches credits after purchase

### 7. Modal Integration
- `UpgradeModal` rendered outside Sheet content
- `DowngradeModal` with confirm handler that updates store
- Both modals accessible from billing tab buttons

### 8. Fixed Other Tabs
- Profile tab: `{MOCK_PLAN}` → `{currentPlan}`
- Account tab: `{MOCK_PLAN} Plan — $49/month` → dynamic from store
- Team tab: `{MOCK_PLAN}` → `{currentPlan}` in LocalPlanGate
- Developer tab: `{MOCK_PLAN}` → `{currentPlan}` in LocalPlanGate

## Lint Status
- 0 errors, 1 pre-existing warning (TanStack Table incompatible library)

## No Breaking Changes
- All 10 tabs (profile, subscription, account, integrations, security, notifications, data, team, developer, danger) preserved
- Other tab functionality unchanged
- Purple (#6C63FF) accent theme maintained
- Section header pattern with icons maintained
- Responsive design maintained
