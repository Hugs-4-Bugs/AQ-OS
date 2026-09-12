# Task 7 — QA Bug Fixes (HIGH + MEDIUM)

## Summary
Fixed 5 QA bugs across the AcquisitionOS project: password validation mismatch, credit gate logic, cookie consent persistence, exposed env vars, and inconsistent plan display.

## Bug Fixes

### 1. [HIGH] Client/server validation mismatch on signup
- **File**: `src/components/dashboard/auth-pages-v2.tsx`
- **Problem**: Client only checked `password.length < 8`, but server required uppercase, lowercase, number, and special character via `validatePasswordStrength()`. Server errors were shown but only after a round-trip.
- **Fix**:
  - Added `validatePasswordRules()` function matching server-side `validatePasswordStrength()` exactly
  - Updated `SignUpPage.validate()` to use the new function instead of just length check
  - Updated `ResetPasswordPage.validate()` similarly
  - Updated `PasswordStrengthIndicator` to show missing requirements (e.g., "Needs: An uppercase letter, A number")
  - Updated password placeholder text from "Min. 8 characters" to "8+ chars, uppercase, lowercase, number, symbol"
  - Updated `getPasswordStrength()` to also return `errors` array for real-time feedback

### 2. [MEDIUM] Credit logic bug on Assistant tab
- **File**: `src/components/dashboard/credit-gate.tsx`
- **Problem**: When `canPerform()` returned `false` due to entitlement restrictions (not credits), the gate showed misleading "Not Enough Credits — 3 credits needed but you only have 50 remaining". Also, "100% of monthly used" was mathematically backwards (showed remaining %, not used %).
- **Fix**:
  - Added `isEntitlementBlocked` vs `isCreditShortage` distinction
  - When entitlement-blocked: shows "Upgrade Required" with purple theme, explains feature isn't available on current plan
  - When credit-short: shows "Not Enough Credits" with amber/red theme
  - Fixed percentage calculation: now shows `(creditsMonthly - credits) / creditsMonthly * 100` (USED %, not REMAINING %)
  - Added Lock icon for entitlement blocks vs Zap icon for credit shortage
  - Filtered "affordable actions" to only show entitlement-enabled actions
  - Only show credit add-on options for credit shortage (not entitlement blocks)

### 3. [MEDIUM] Cookie consent banner keeps reappearing
- **File**: `src/components/dashboard/cookie-consent.tsx`
- **Problem**: The `useSyncExternalStore` subscription used `window.addEventListener('storage', ...)` which only fires for cross-tab changes, not same-tab localStorage writes. So clicking "Accept All" wrote to localStorage but the store didn't re-read it in the same tab.
- **Fix**:
  - Added custom event `acquisitionos_consent_change` for intra-tab notifications
  - `subscribeToConsent()` now listens for both the custom event and native `storage` event
  - `saveConsent()` dispatches both the custom event and a `StorageEvent` for cross-tab sync
  - `getConsentSnapshot()` now has try/catch for SSR safety

### 4. [MEDIUM] Env var names exposed in payment provider message
- **Files**: `src/components/dashboard/upgrade-modal.tsx`, `src/components/dashboard/pricing-page.tsx`
- **Problem**: The "No Payment Provider Configured" message showed internal env var names like `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to end users.
- **Fix**: Replaced with generic message: "Payment provider not configured. Please contact support or check your billing settings."

### 5. [MEDIUM] Inconsistent plan display
- **Files**: `src/components/dashboard/settings-panel.tsx`, `src/components/dashboard/upgrade-modal.tsx`, `src/components/dashboard/pricing-page.tsx`
- **Problem**: During trial, the Billing page showed "Free Plan" (because DB stores `plan: 'free'` for trial users), but the trial info section showed "Pro Features" — creating confusion. The upgrade modal also showed "Free" as current plan during trial.
- **Fix**:
  - Added `effectivePlan` computed value: `(isTrial && currentPlan === 'free') ? 'pro' : currentPlan`
  - Settings panel: uses `effectivePlanLabel` which shows "Pro (Trial)" during trial, or "Free Plan"/"Pro Plan"/"Elite Plan" otherwise
  - Upgrade modal: `isCurrent` check uses `effectivePlan` instead of `currentPlan`
  - Pricing page: `isCurrent` check uses `effectivePlan` instead of `currentPlan`
  - All three components now consistently show "Pro (Trial)" during trial period

## Lint Results
- Only pre-existing errors in non-project JS files (custom-server.js, server.js, process-manager.js, mini-services/proxy/index.js)
- No new lint errors introduced
- Dev server compiles and runs successfully
