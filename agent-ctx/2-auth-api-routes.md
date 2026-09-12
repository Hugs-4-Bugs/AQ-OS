# Task 2 — Auth API Routes Creation

## Agent: Code Agent
## Status: ✅ Completed

## Summary
Created 6 missing auth API routes for the AcquisitionOS Next.js 16 project, following existing patterns from the auth system.

## Files Created

### 1. `/src/app/api/auth/otp/request/route.ts` — OTP Login Request
- POST handler accepting `{ email }`
- Validates email format with `validateEmail()`
- Returns same message regardless of user existence (anti-enumeration)
- Rate limits: checks if OTP requested within last 60 seconds via `resetOtpExpiry` field
- Generates 6-digit OTP with `generateOTP()`, stores on `user.resetOtp` / `user.resetOtpExpiry`
- Logs `otp_login` audit event
- Returns `devOtp` in development mode

### 2. `/src/app/api/auth/otp/verify/route.ts` — OTP Login Verify
- POST handler accepting `{ email, otp }`
- Validates email format and 6-digit OTP format
- Checks account lockout with `isAccountLocked()`
- Verifies OTP against `user.resetOtp` (compare + expiry check)
- On invalid: records failed login attempt, logs `signin_failed`, returns 401
- On valid: clears OTP fields, checks email verified, checks account active, generates access+refresh tokens, creates session, updates `lastLoginAt`, records successful login, logs `otp_login` + `signin` audit events, sets auth cookies
- Returns user data + tokens

### 3. `/src/app/api/auth/magic-link/request/route.ts` — Magic Link Request
- POST handler accepting `{ email }`
- Validates email, returns same message regardless of user existence
- Rate limits: checks last magic link request timestamp (60s cooldown)
- Generates secure token with `generateMagicLinkToken()`, stores on `user.resetOtp` / `user.resetOtpExpiry` (15-minute expiry)
- Logs `magic_link_sent` audit event
- Returns `devToken` and `devLink` in development mode

### 4. `/src/app/api/auth/magic-link/verify/route.ts` — Magic Link Verify
- **GET handler** (for click-in-email): accepts `token` + `email` from query params, verifies token, auto-verifies email, generates tokens, creates session, redirects to "/" with auth cookies (or to `/signin?error=...` on failure)
- **POST handler** (for API-based verification): accepts `{ email, token }`, same logic as GET but returns JSON response instead of redirect
- Both handlers: clear token fields, auto-verify email, check account active, log `magic_link_used` + `signin` audit events

### 5. `/src/app/api/auth/google/callback/route.ts` — Google OAuth Callback
- POST handler accepting `{ code }` (authorization code from Google)
- Exchanges code for tokens at `https://oauth2.googleapis.com/token` using `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` from env
- Fetches user profile from `https://www.googleapis.com/oauth2/v3/userinfo`
- Finds existing user by email or `googleId`
- If user exists: updates `googleId` if not set, checks account active
- If user doesn't exist: creates new user with Google profile data (email, name, avatar, googleId), `emailVerified=true`, `authProvider='google'`, trial subscription
- Logs `signup` event for new users
- Generates tokens, creates session, updates `lastLoginAt`, records login, logs `google_oauth_login` + `signin` audit events, sets auth cookies
- Returns user data

### 6. `/src/app/api/auth/resend-verification/route.ts` — Resend Verification
- POST handler accepting `{ email }`
- Returns generic message regardless of user existence
- If user exists and not verified: rate limits (60s cooldown), generates new OTP, updates `emailVerificationOtp` / `emailVerificationOtpExpiry`, logs `email_verification_sent` audit event
- Returns `devOtp` in development mode

## Patterns Followed
- Used `getClientIp(request)` and `getUserAgent(request)` for all audit logs
- Used `logAuthEvent()` for all security events
- Used `isAccountLocked()` before login verification (OTP verify)
- Used `recordLoginAttemptByEmail()` / `recordLoginAttempt()` for login attempts
- Used `setAuthCookies()` for setting auth cookies
- Used `generateAccessToken()` and `generateRefreshToken()` for token generation
- Used `createSession()` for session creation
- All routes wrapped in try/catch with proper error responses
- Followed exact same code style as existing routes (section comments, validation flow, etc.)
- Anti-enumeration: generic messages on request routes where user might not exist

## Lint Result
- 0 errors, 1 pre-existing warning (TanStack Table `useReactTable` incompatible library)
- All 6 new routes pass lint cleanly
