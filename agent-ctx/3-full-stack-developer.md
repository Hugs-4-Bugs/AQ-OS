# Task 3: Enhance user profile with real data + Billing tab in Settings

## Work Summary

### 1. Real User Profile in Sidebar/Topbar (dashboard-layout.tsx)
- Imported `useAuthStore` from `@/lib/auth-store`
- Derived `userInitials` and `userDisplayName` from real user data
- Updated sidebar profile section: shows avatar image if `user.avatarUrl` exists, otherwise shows initials from real name
- Updated topbar profile avatar: same avatar/initials logic
- Falls back to "BA" / "Business Acq." when no user is authenticated

### 2. Billing Tab Enhancements (settings-panel.tsx)
- Added `billingCycle` from subscription store
- Enhanced Current Plan card:
  - Shows monthly/yearly pricing based on billing cycle
  - Billing cycle badge
  - Next billing date with calendar icon
  - Billing cycle info card with save percentage for yearly
- Added Credit Balance card:
  - 3-column breakdown: Monthly Credits, Rollover, Add-on
  - Usage progress bar with remaining count and percentage
- Added Subscription Actions:
  - Upgrade/Change Plan button (opens UpgradeModal)
  - View Invoices button
  - Cancel Subscription button with AlertDialog confirmation (only for active paid plans)
- Updated Profile tab to use auth store avatarUrl
- Updated Account tab to show real email verification status, subscription status, and user role

### 3. Code Quality
- Lint: 0 errors, 1 pre-existing warning
- Dev server compiles successfully
