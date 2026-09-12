# Task 6 - Auth & Credits Sync Agent

## Work Completed

### Task A: useCredits Hook
- Created `/src/hooks/use-credits.ts`
- Uses TanStack Query to fetch credits from `/api/credits` (GET) with 30s stale time and 60s refetch interval
- Syncs backend data to Zustand store via useEffect (setPlan → setCredits → setTrial order ensures correct final state)
- Deduct mutation POSTs to `/api/credits` with optimistic local deduction + backend sync
- Returns reactive selectors for credits, creditsMonthly, currentPlan, isTrial, trialEndsAt, percentage
- Exposes isLoading, canPerform, deductCredits, isDeducting, deductError, refetch

### Task B: Auth API Routes
- Created 7 auth API routes:
  1. `/api/auth/signup` - POST: Creates user with 14-day Pro trial, hashes password with bcryptjs, stores OTP in audit log
  2. `/api/auth/verify-email` - POST: Validates 6-digit OTP from audit log, marks as verified
  3. `/api/auth/signin` - POST: Compares password with bcryptjs, generates JWT access (15m) + refresh (30d) tokens, sets httpOnly cookie
  4. `/api/auth/me` - GET: Verifies JWT from Authorization header or refresh token cookie
  5. `/api/auth/forgot-password` - POST: Generates 6-digit OTP stored in audit log (doesn't reveal user existence)
  6. `/api/auth/reset-password` - POST: Validates OTP, hashes new password with bcryptjs, updates user
  7. `/api/auth/signout` - POST: Clears refresh_token cookie

### Key Fixes from Original Spec
- Added `passwordHash` field to User Prisma model (original spec stored hash but model had no field)
- Fixed signin route: uses `compare(password, user.passwordHash)` instead of incorrect `compare(password, user.name || '')`
- Added actual password update in reset-password route (original spec was missing the hash+update step)
- Fixed useCredits hook: calls setPlan BEFORE setCredits (setPlan resets credits to monthly amount, setCredits then overrides with actual remaining)

### Task C: Package Installation
- Installed `bcryptjs@3.0.3` and `jsonwebtoken@9.0.3`
- Installed `@types/bcryptjs@3.0.0` and `@types/jsonwebtoken@9.0.10` as dev dependencies

### Task D: Environment Variable Templates
- Created `.env.example` with all required variables (JWT_SECRET, DATABASE_URL, payment keys, OAuth, Telegram, WhatsApp, SMTP, S3, etc.)
- Created `.env.local.example` with frontend variables (API URLs, NextAuth, feature flags, Stripe/Razorpay public keys)

### Schema Change
- Added `passwordHash String?` field to User model
- Ran `bun run db:push` to apply schema change

### Lint
- `bun run lint` passes with 0 errors (only 1 pre-existing TanStack Table warning)
