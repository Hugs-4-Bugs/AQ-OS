# Task ID: 2 - CSS & Core Fixes Agent

## Task
Fix missing CSS classes, connect credits to DB, fix QueryClient, fix notification bug

## Work Completed

### 1. Missing CSS Classes (globals.css)
- Added `gradient-border-animated-2` with emerald-to-primary gradient border animation
- Added `dot-pattern` with radial gradient dot background (light/dark mode)
- Added `skeleton-wave` animation with keyframes plus 10 skeleton variants (stat-card, icon, value, label, name, sub, badge, score, checkbox, table-row)
- Added `refresh-spinning` rotation animation
- Added `glow-pulse-emerald` box-shadow pulse animation
- Added `fade-in-up` animation with 5 delay variants (delay-1 through delay-5)

### 2. Credits API Database Migration (api/credits/route.ts)
- Replaced in-memory `mockCredits` with Prisma-backed implementation
- `getDefaultUser()` function creates demo user if none exists (500 credits, pro plan, 14-day trial)
- GET endpoint reads from database with percentage calculation
- POST endpoint uses `db.$transaction()` for atomic credit deduction + ledger entry
- Proper error handling with 400/402/500 status codes

### 3. QueryClient Fix (page.tsx)
- Moved QueryClient from module scope to `useState(() => new QueryClient(...))` pattern
- Prevents shared state across SSR requests and potential hydration issues

### 4. Notification Title Fix (dashboard-layout.tsx)
- Added missing `title: 'Follow-up Overdue'` to overdue reminder notification
- Reformatted message to use colon separator instead of dash for clarity

## Verification
- `bun run lint` passes with 0 errors (only 1 pre-existing TanStack Table warning)
- Dev server compiles successfully
