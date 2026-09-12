# Task 7 - PlanGate/CreditGate Integration

## Summary
Wired PlanGate and CreditGate components into the dashboard layout's `renderTab()` function to enforce plan-level and credit-based feature restrictions.

## Changes Made
**File: `/home/z/my-project/src/components/dashboard/dashboard-layout.tsx`**

1. Added imports:
   - `import PlanGate from './plan-gate';`
   - `import CreditGate from './credit-gate';`

2. Modified `renderTab()` switch cases:
   - `discover` → wrapped with `<CreditGate action="lead_discovery">` (1 credit)
   - `outreach` → wrapped with `<CreditGate action="outreach_message">` (2 credits per message)
   - `workflows` → wrapped with `<PlanGate requiredPlan="pro" featureName="Workflows">`
   - `assistant` → wrapped with `<CreditGate action="sales_coaching">` (3 credits)
   - `competitors` → wrapped with `<PlanGate requiredPlan="pro" featureName="Competitor Analysis">`

3. Ungated tabs (available on Free plan): OverviewTab, LeadsTab, PipelineTab, MessagingTab, InsightsTab, DealsTab, SettingsShell

4. All gates use `onUpgrade={() => setUpgradeModalOpen(true)}` which opens the UpgradeModal.

## Verification
- ESLint: 0 new errors (only pre-existing 9 in legacy JS files)
- Dev server: compiles and serves without errors
