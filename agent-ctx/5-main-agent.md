---
Task ID: 5
Agent: Main Agent
Task: Phase 4 - Subscription System + Credits Engine + Plan Gates + Billing Foundation (Frontend Components)

Work Log:
- Created 6 new billing/gating components and enhanced 2 existing components
- All components use 'use client' directive, Framer Motion animations, shadcn/ui, Lucide icons
- All components are fully responsive (mobile-first) and accessible (ARIA, roles, live regions)
- Dark theme compatible with primary color (#6C63FF) support

Files Created:

1. /src/components/dashboard/credit-gate.tsx
   - Credit check gate component similar to PlanGate but for credit checks
   - Props: action (CreditAction), children, fallback, showCost, onUpgrade
   - Checks if user has enough credits for the action
   - If insufficient: shows "Not Enough Credits" UI with:
     - Current/required credits comparison with animated progress bar
     - Cost badge for the action
     - Affordable actions hint (when credits > 0 but insufficient)
     - Quick credit add-on purchase buttons
     - "Get More Credits" and "Upgrade plan" CTAs
   - Uses amber/red color coding for low/zero credits
   - Zap icon with amber/red styling

2. /src/components/dashboard/usage-limit-banner.tsx
   - Usage limit warning banner that slides in from top
   - Props: feature, used, limit (null=unlimited), plan, onUpgrade
   - Only shows when usage >= 80% of limit
   - At 80-99%: amber warning banner with Progress bar
   - At 100%: red blocked banner with ShieldAlert icon
   - Dismissible per session (sessionStorage)
   - Shows remaining count and upgrade button

3. /src/components/dashboard/trial-banner.tsx
   - Trial status banner for trial users, sticky below header
   - Props: daysRemaining, onUpgrade, onDismiss
   - >7 days: subtle primary/info banner
   - 3-7 days: amber warning banner
   - <3 days: red urgent banner
   - Countdown badge with Clock icon
   - Collapsible "See what you'll lose" features list
   - "Upgrade Now" CTA button
   - Dismissible per session

4. /src/components/dashboard/downgrade-modal.tsx
   - AlertDialog-based confirmation modal for plan downgrades
   - Props: open, onOpenChange, currentPlan, targetPlan, onConfirm
   - Shows plan comparison (current → target)
   - Lists features that will be lost (with icons)
   - Credit difference display (amber accent)
   - Data impact section (what happens to leads, etc.)
   - Effective date (end of billing period)
   - Red warning box about irreversible action
   - "Keep My Plan" cancel button (emerald Shield icon)
   - "I Understand, Downgrade" destructive action button
   - Uses Button import for asChild pattern on AlertDialogAction/Cancel

5. /src/components/dashboard/credit-warning-banner.tsx
   - Low/zero credit warning banner (prominent, color-coded)
   - Props: status ('low'|'zero'), credits, creditsMonthly, onUpgrade, onBuyCredits
   - 'low' (<20%): amber banner with "Buy Credits" and "Upgrade" buttons
   - 'zero' (0 credits): red critical banner with urgent upgrade CTA
   - Shows which actions are still affordable (Badge list)
   - Reactive to subscription store — auto-dismisses when credits are added
   - useMemo for affordable actions (moved before early return to fix hooks rule)

6. /src/components/dashboard/pricing-page.tsx
   - Full pricing/subscription page component (for billing settings tab)
   - Props: currentPlan, onSelectPlan(plan, billingCycle)
   - 3-column plan cards (Free, Pro, Elite) with monthly/yearly toggle
   - "Most Popular" badge on Pro card
   - "Current Plan" highlight on active card
   - Feature comparison table (14 features × 3 plans)
   - Credit add-ons section (4 packs: 100/500/1000/2500 credits)
   - Coupon code input with validation (supports "LAUNCH20" offline)
   - FAQ section (6 questions) with Accordion
   - GST notice for Indian users
   - Trust badges (Secure Payments, 30-Day Money-Back, SSL, Razorpay Verified)
   - Save 20% badge on yearly billing

Files Modified:

7. /src/components/dashboard/upgrade-modal.tsx
   - Added real backend integration:
     - Fetches upgrade preview from /api/subscription/preview on open
     - Proration credit display from current plan
     - Loading states for preview
   - Added coupon code input with validation:
     - POST to /api/subscription/validate-coupon
     - Offline fallback for "LAUNCH20" coupon
     - Applied coupon badge with discount percentage
     - Error handling with red alert messages
   - Added GST display for Indian users:
     - Base price + GST (18%) + Total breakdown on each plan card
     - GST amounts on credit add-on packs
   - Added "Confirm Upgrade" button that calls /api/subscription/create-order:
     - Supports payment gateway redirect
     - Offline fallback to store update
     - Processing state with spinner per plan card
   - Better loading states throughout
   - Link to credit add-ons with GST amounts

8. /src/components/dashboard/credit-display.tsx
   - Added rolloverCredits and addonCredits props
   - Rollover credits display: "+N extra" below credit count with Sparkles icon
   - Credit warning indicator: pulsing red dot when credits ≤ 20%
   - Click to open credit purchase dialog (new CreditPurchaseDialog component):
     - 3 addon packs with prices
     - Note about credits never expiring
   - Enhanced tooltip shows full credit breakdown:
     - Monthly credits
     - Rollover credits (labeled, primary color)
     - Add-on credits (labeled, amber color)
     - Total available (sum)
     - Per-action cost table
     - "Click to buy credits" hint
   - Total credits shown in compact mode includes rollover + addons

Lint Results:
- 0 errors, 1 pre-existing warning (TanStack Table incompatible-library)
- Fixed react-hooks/set-state-in-effect errors by using lazy state initialization
- Fixed react-hooks/rules-of-hooks by moving useMemo before early return
- Fixed react/jsx-no-undef by adding Button import to downgrade-modal

Stage Summary:
- CREDIT GATE: Full credit check gate with affordable actions hint, add-on quick buy
- USAGE LIMIT BANNER: 80% warning / 100% blocked with progress bar, session-dismissed
- TRIAL BANNER: 3 urgency levels with countdown, collapsible features lost list
- DOWNGRADE MODAL: Full feature/data/credit impact, destructive confirm, effective date
- CREDIT WARNING BANNER: Low/zero credit reactive banner with affordable actions
- PRICING PAGE: Full SaaS pricing page with comparison table, FAQ, coupons, trust badges
- UPGRADE MODAL: Enhanced with backend integration, coupons, GST, loading states
- CREDIT DISPLAY: Enhanced with rollover, warning pulse, purchase dialog, breakdown tooltip
