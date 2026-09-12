# Authentication

> AcquisitionOS / `vantage` v0.2.0 — Auth subsystem reference. All paths,
> function names, model names, and constants below are taken verbatim from the
> codebase (see the file references at the bottom of each section).

---

## 1. Overview

The auth subsystem lives under `src/app/api/auth/*` and is backed by
`src/lib/auth.ts`. It supports **five login methods** and a session layer built
on JWTs plus server-side session rows in the `UserSession` Prisma model.

### Library facts (verified)

| Concern | Library actually used | Notes |
| --- | --- | --- |
| JWT signing / verification | `jsonwebtoken` (`^9.0.3`) | `src/lib/auth.ts:6` does `import jwt from 'jsonwebtoken'`. The project also lists `jose@^6.2.3` in `package.json`, but the auth code itself uses `jsonwebtoken`. The `jose` dependency is used by `src/lib/security/jwt-security.ts`, not by the auth path. |
| Secret env var | `JWT_SECRET` | `src/lib/auth.ts:15`. There is no `AUTH_SECRET` alias in code — that name only appears in the worklog (Aliyun FC deploy notes). `NEXTAUTH_SECRET` is listed via `next-auth@^4.24.11` but the project's own auth code does **not** read it. |
| Password hashing | `bcryptjs@^3.0.3`, `BCRYPT_ROUNDS = 12` | `src/lib/auth.ts:25`. |
| Access token TTL | `15m` | `JWT_ACCESS_EXPIRY = '15m'`. |
| Refresh token TTL | `30d` | `JWT_REFRESH_EXPIRY = '30d'`. Stored on the `UserSession` row (refreshToken @unique). |
| OTP TTL | `OTP_EXPIRY_SECONDS = 600` (10 min) | `src/lib/auth.ts:26`. |
| OTP attempt cap | `OTP_MAX_ATTEMPTS = 5`, `LOCKOUT_MINUTES = 15` | `src/lib/auth.ts:27,29`. Stored on `User.otpAttemptCount` + `User.otpLockedUntil`. |
| Login brute-force cap | `MAX_LOGIN_ATTEMPTS = 5` (per email, 15-min window) | Counted from `LoginHistory` rows. |
| Magic link TTL | `15 * 60 = 900s` | `src/app/api/auth/magic-link/request/route.ts:14`. |

> **Status note**: All five methods are implemented and the routes exist. The
> only externally-broken things are environmental (missing SMTP creds,
> unregistered OAuth redirect URIs) — see §5.

---

## 2. Authentication Methods

### 2.1 Email / Password

**Signup** — `POST /api/auth/signup` (`src/app/api/auth/signup/route.ts`)

1. `withRateLimit(request, 'auth')` — 5 auth requests/min/IP (`src/lib/security/rate-limiter.ts`).
2. Validates `name`, `email` (`validateEmail`), `password`
   (`validatePasswordStrength` requires ≥8 chars + upper + lower + digit + symbol).
3. Normalises email to lower-case.
4. Anti-enumeration: if a user already exists, returns HTTP 201 with the same
   "If this email is available..." message **without** revealing the existence
   of the account (no email is sent in that case).
5. `hashPassword(password)` → bcrypt 12 rounds.
6. `generateOTP()` (6-digit `crypto.randomInt`).
7. Creates `User` row with:
   - `passwordHash`, `role: 'owner'`, `plan: 'free'`, `authProvider: 'email'`
   - `emailVerified: false`
   - `emailVerificationOtp`, `emailVerificationOtpExpiry` (now + 600s)
   - `isTrial: true`, `trialEndsAt: now + 14d`
   - A `Subscription` row `plan: 'free', status: 'trial'`
8. `logAuthEvent({ action: 'signup' })` — writes an `AuditLog` row.
9. If `isEmailServiceConfigured()` is true, calls
   `sendVerificationEmail(email, name, otp)` from `src/lib/email.ts`.
   - The OTP is **never** returned in the response — the user must read it
     from their real inbox.
   - If delivery fails, the server logs `[Signup] Email delivery failed:`
     but the user still sees the success message (they will not be able to
     verify until SMTP works).
10. Returns HTTP 201 with `{ message, requiresVerification: true, email }`.

**Email verification** — `POST /api/auth/verify-email`
(`src/app/api/auth/verify-email/route.ts`)

1. Body: `{ email, otp }` (6-digit string).
2. Looks up user, enforces OTP lockout via `isOtpLocked(user.id)`.
3. `secureCompare(user.emailVerificationOtp, otp)` (constant-time).
4. On mismatch: `incrementOtpAttempts(user.id)` — at 5 attempts it sets
   `otpLockedUntil = now + 15min` and returns HTTP 423.
5. On match + not expired: clears `emailVerificationOtp` and
   `emailVerificationOtpExpiry`, sets `emailVerified: true`,
   `resetOtpAttempts(userId)`.
6. No session is created here — the user is sent back to the sign-in page to
   actually log in.

> Note: `POST /api/auth/resend-verification` regenerates `emailVerificationOtp`
> and emails it again, gated by the same `isEmailServiceConfigured()` check.

**Signin** — `POST /api/auth/signin` (`src/app/api/auth/signin/route.ts`)

1. `withRateLimit(request, 'auth')`.
2. `isAccountLocked(email)` — counts `LoginHistory` failures in the last
   15 minutes; ≥5 returns HTTP 423.
3. Looks up user by email with `mfaConfig` relation.
4. If user not found, **or** the account is Google-only (`authProvider === 'google' && !passwordHash`),
   a constant-time fake bcrypt compare is run to prevent timing attacks, then
   the same `Invalid email or password` is returned.
5. `verifyPassword(password, user.passwordHash)` — `bcrypt.compare`.
6. If password wrong: `recordLoginAttemptByEmail({ success: false })`,
   `logAuthEvent({ action: 'signin_failed' })`, return 401.
7. If `!user.emailVerified` or `!user.isActive` — generic 401 (anti-enumeration).
8. **MFA gate**: if `user.mfaConfig?.isEnabled`, returns 200 with
   `{ mfaRequired: true, mfaSessionToken }` — a short-lived access JWT — instead
   of issuing full tokens. The client then calls `/api/auth/mfa/verify`.
9. Otherwise issues `generateAccessToken` + `generateRefreshToken`,
   `createSession({ userId, refreshToken, deviceInfo, ipAddress, userAgent })`,
   updates `lastLoginAt`.
10. `recordLoginAttemptByEmail({ success: true })`, `logAuthEvent({ action: 'signin' })`.
11. `detectSuspiciousLogin({ userId, ip, userAgent })` — if suspicious, fires
    `sendSecurityAlert(...)` in the background (never blocks login).
12. `setAuthCookies(response, accessToken, refreshToken)` → 200 with user object.

### 2.2 OTP Login (passwordless)

**Request OTP** — `POST /api/auth/otp/request`
(`src/app/api/auth/otp/request/route.ts`)

1. Validates `email` (returns same "If an account exists..." message
   regardless of user existence — anti-enumeration).
2. If `user.loginOtpExpiry` is less than 60s old, returns HTTP 429.
3. `generateOTP()` → 6-digit code. Sets `user.loginOtp`, `user.loginOtpExpiry`
   (now + 600s), resets `otpAttemptCount = 0`, `otpLockedUntil = null`.
4. `logAuthEvent({ action: 'otp_login' })`.
5. If `!isEmailServiceConfigured()`: returns the same generic message but with
   `deliveryIssue: true` and a "Email delivery is not configured on the server"
   message.
6. `sendOtpLoginEmail(email, name, otp)` from `src/lib/email.ts`.
7. If send fails: returns `deliveryIssue: true` with a temporary-failure
   message.

**Verify OTP** — `POST /api/auth/otp/verify`
(`src/app/api/auth/otp/verify/route.ts`)

1. Body: `{ email, otp }`. Validates 6-digit.
2. `isAccountLocked(email)` → 423.
3. `isOtpLocked(user.id)` → 423 ("Too many failed OTP attempts").
4. `secureCompare(user.loginOtp, otp)`. On mismatch:
   `recordLoginAttemptByEmail({ success: false, failReason: 'Invalid OTP login code' })`,
   `incrementOtpAttempts(user.id)` → may set `locked: true`, returns 423 or 401.
5. On match: checks `loginOtpExpiry` (expired → 400), clears `loginOtp` and
   `loginOtpExpiry`, `resetOtpAttempts(userId)`.
6. Re-checks `emailVerified` and `isActive` (anti-enumeration 401 if not).
7. `generateAccessToken` + `generateRefreshToken`, `createSession`,
   `update lastLoginAt`, audit log entries (`otp_login` + `signin`).
8. `setAuthCookies(response, accessToken, refreshToken)` → 200 with user.

### 2.3 Magic Link

**Request** — `POST /api/auth/magic-link/request`
(`src/app/api/auth/magic-link/request/route.ts`)

1. Same anti-enumeration 200 + rate-limit pattern as OTP.
2. 60s cooldown between requests (`MAGIC_LINK_EXPIRY_SECONDS = 15 * 60`).
3. `generateMagicLinkToken()` → `crypto.randomBytes(32).toString('hex')` (64 hex chars).
4. Stores `magicLinkToken` + `magicLinkTokenExpiry` on the user.
5. Builds the URL via `getAppUrl(request)` from `src/lib/app-url.ts`, suffixing
   `/api/auth/magic-link/verify?token=...&email=...`.
6. `sendMagicLinkEmail(email, name, magicLinkUrl)` — uses the same Resend → SMTP
   chain. If unconfigured or send fails, returns `deliveryIssue: true`.

**Verify (click from email)** — `GET /api/auth/magic-link/verify`
(`src/app/api/auth/magic-link/verify/route.ts`)

> This route is one of the most heavily instrumented in the codebase. Every
> step is wrapped in try-catch and there is a 3-layer fallback (`NextResponse.redirect` →
> HTML meta-refresh → plain text) so the user never sees a bare 500.

1. Reads `token` and `email` from query string.
2. `getDynamicOrigin(request)` — derives the origin from `request.url`,
   rejects internal cloud hostnames (`*.fcapp.run`, `*.aliyuncs.com`,
   `*.functioncompute.com`, `localhost`, `127.*`, `10.*`, `192.168.*`,
   `172.*`), then falls back to `Origin`/`Referer`/`x-forwarded-host` headers.
3. Lazy-loads `@/lib/auth` and `@/lib/db`.
4. Looks up user; if missing → `/?auth_error=invalid_link`.
5. `secureCompare(user.magicLinkToken, token)` → on mismatch,
   `/?auth_error=invalid_link`.
6. `user.magicLinkTokenExpiry` expired → `/?auth_error=expired_link`.
7. **Single-use enforcement**: clears `magicLinkToken` and
   `magicLinkTokenExpiry` immediately after a successful match.
8. Auto-sets `emailVerified = true` if it was false.
9. `isActive` check → `/?auth_error=invalid_link` if not.
10. Generates access + refresh tokens, `createSession`, `update lastLoginAt`,
    `recordLoginAttempt({ success: true })`, `logAuthEvent('magic_link_used' + 'signin')`.
11. `setAuthCookies` on the 307 redirect to `/`.

> There is also a POST handler on the same route for API-based verification
> (used by tests and programmatic clients) — same logic, returns JSON instead
> of redirecting.

### 2.4 Google OAuth

The frontend calls `/api/auth/google/state?origin=<window.location.origin>` to
get an `authUrl`, then `window.location = authUrl` to send the user to Google.

**Initiation — `GET /api/auth/google/state`**
(`src/app/api/auth/google/state/route.ts`)

1. Reads `GOOGLE_CLIENT_ID` from env. If missing → 503.
2. `getGoogleClientSecret()` from `src/lib/email-ethereal.ts`.
3. **Dynamic-origin resolution** (the fix for the "wrong domain" bug, see §5):
   `resolvePublicOrigin()` tries, in order:
   1. `?origin=` query param (frontend passes `window.location.origin`)
   2. `x-forwarded-host` + `x-forwarded-proto`
   3. `host` header
   4. `Origin` header
   5. `Referer` header
   6. Last-resort hardcoded `https://preview-chat-ab88c1b0-...space-z.ai`
   - `isInternalHost()` rejects `localhost`, `0.0.0.0`, `127.*`, `10.*`,
     `192.168.*`, `172.*`, `*.fcapp.run`, `*.aliyuncs.com`,
     `*.functioncompute.com` at every step.
4. `redirectUri = ${resolvedOrigin}/api/auth/callback/google`
5. **Encodes state JSON** with `{ nonce, redirectUri, origin }`,
   base64url-encoded. Both `redirectUri` and `origin` are the resolved origin
   — this guarantees the callback uses the **same** redirect_uri for token
   exchange that was used to build the auth URL.
6. Builds `https://accounts.google.com/o/oauth2/v2/auth?...` with
   `client_id`, `redirect_uri`, `response_type=code`, `scope=openid email profile`,
   `state`, `access_type=offline`, `prompt=select_account consent`.
7. Returns `{ authUrl, state, googleEnabled: true }`.

**Callback — `GET /api/auth/callback/google`**
(`src/app/api/auth/callback/google/route.ts`)

1. Reads `code`, `state`, `error` from query.
2. `error` → 307 redirect to `/?auth_error=oauth_failed`.
3. No `code` → 307 to `/?auth_error=no_code`.
4. **State decode** (CAUSE A in the code comments): decodes base64url state,
   reads `decoded.redirectUri` and `decoded.origin`. If decode fails, falls
   back to `getDynamicOrigin(request)` + `/api/auth/callback/google`.
5. **Token exchange** (CAUSE B): `POST https://oauth2.googleapis.com/token` with
   `{ code, client_id, client_secret, redirect_uri, grant_type: 'authorization_code' }`.
   - Uses the **same redirect_uri** decoded from state — this is what makes
     the dynamic-origin fix work end-to-end. If the redirect_uri sent here
     doesn't match the one registered in Google Cloud Console → Google
     returns `Error 400: redirect_uri_mismatch`.
6. **Profile fetch** (CAUSE D): `GET https://www.googleapis.com/oauth2/v3/userinfo`
   with `Authorization: Bearer <access_token>`.
7. **User upsert** (CAUSE E): `db.user.findFirst({ OR: [{ email }, { googleId }] })`.
   - If found and `!user.googleId && googleUser.sub` → updates `googleId`.
   - If not found → creates with `emailVerified: googleUser.email_verified ?? true`,
     `authProvider: 'google'`, 14-day trial + free Subscription row.
8. `generateAccessToken` + `generateRefreshToken`, `createSession`,
   `update lastLoginAt`, `recordLoginAttempt({ success: true })`,
   `logAuthEvent('google_oauth_login' + 'signin')`.
9. **Cross-domain relay**: if the state's `origin` differs from the canonical
   callback origin (e.g. user started on a preview domain, Google sent them
   back to the production callback), `createRelayToken(accessToken, refreshToken, stateOrigin)`
   from `src/lib/oauth-relay.ts` mints a 60-second signed JWT
   (`type: 'google_oauth_relay'`), and the route 307-redirects to
   `${stateOrigin}/api/auth/google/relay?token=...`.
10. Same-domain case: `setAuthCookies` on a 307 to `/`.

**Relay** — `GET /api/auth/google/relay` (`src/app/api/auth/google/relay/route.ts`)

1. Reads `?token=` from query.
2. `verifyRelayToken(token)` from `src/lib/oauth-relay.ts` — checks signature
   via `RELAY_SECRET` (`JWT_SECRET` or `RELAY_SECRET` env, dev fallback), type,
   expiry, and that the decoded `origin` matches the current request origin.
3. Extracts `accessToken` + `refreshToken` from the relay payload, sets them
   via `setAuthCookies`, redirects to `/`.

> **Note on the older route**: `/api/auth/google` and `/api/auth/google/callback`
> still exist in the codebase (`src/app/api/auth/google/route.ts`,
> `src/app/api/auth/google/callback/route.ts`), but the frontend uses
> `/api/auth/google/state` → `/api/auth/callback/google` (canonical path). The
> legacy routes are unused by the production frontend.

### 2.5 MFA (TOTP)

The MFA flow uses RFC 6238 TOTP with a 30-second step, 6 digits, ±1 window
(`TOTP_PERIOD = 30`, `TOTP_DIGITS = 6`, `TOTP_WINDOW = 1` in `src/lib/auth.ts`).
Base32 encode/decode is implemented inline (no external OTP library).

**Setup** — `POST /api/auth/mfa/setup` (`src/app/api/auth/mfa/setup/route.ts`)

1. `requireAuth(request)` — must be logged in.
2. Body: `{ password }`. `verifyPassword(password, user.passwordHash)` — confirms
   the user is who they say they are before enabling MFA.
3. If `MfaConfig.isEnabled` already true → 400 "MFA is already enabled".
4. `generateTotpSecret()` — base32 of 20 random bytes.
5. `generateBackupCodes(8)` — 8 backup codes; each one hashed with
   `hashPassword(code)` (bcrypt) before storage.
6. Creates/updates `MfaConfig` row with `{ secret, backupCodes: JSON.stringify(hashedCodes), isEnabled: false, verifiedAt: null }`.
7. `generateTotpUri({ secret, label: email, issuer: 'AcquisitionOS' })` —
   returns `otpauth://totp/...` URI for QR generation.
8. Returns `{ secret, qrCodeUrl, backupCodes }` — **backup codes shown once**;
   the client is expected to persist them.

**Confirm** — `POST /api/auth/mfa/confirm` (`src/app/api/auth/mfa/confirm/route.ts`)

1. `requireAuth`.
2. Body: `{ code }`. Looks up the user's `MfaConfig` (must exist, must not
   be enabled).
3. `verifyTotpCode(mfaConfig.secret, code)` — checks current and ±1 window.
4. On success: sets `MfaConfig.isEnabled = true`, `verifiedAt = now`.
5. `logAuthEvent({ action: 'mfa_enabled' })`.

**Verify on login** — `POST /api/auth/mfa/verify`
(`src/app/api/auth/mfa/verify/route.ts`)

1. `withRateLimit(request, 'mfa')`.
2. Body: `{ mfaSessionToken, code }` (6-digit).
3. `verifyToken(mfaSessionToken)` — must be a valid access-type JWT (issued
   by `/api/auth/signin` when MFA was required).
4. Loads user + `mfaConfig`; if `!mfaConfig.isEnabled` → 400.
5. `verifyTotpCode(mfaConfig.secret, code)`. On failure, iterates the stored
   backup codes (`JSON.parse(mfaConfig.backupCodes)`) and `verifyPassword` against
   each — backup codes are case-insensitive upper-cased before comparison.
   - On backup-code match: removes that code from the array and writes the
     remaining set back. Warns at ≤2 remaining.
6. Issues fresh access + refresh tokens, `createSession`, audit logs
   (`mfa_verified` with `via ${'TOTP' | 'backup code'}`, plus `signin`).
7. `setAuthCookies` → 200 with user.

**Disable** — `POST /api/auth/mfa/disable`
(`src/app/api/auth/mfa/disable/route.ts`)

1. `requireAuth`.
2. Body: `{ password, code }`. **Both required** — disables require password
   re-confirmation plus a live TOTP code.
3. `verifyPassword` + `verifyTotpCode` — both must pass.
4. Clears `MfaConfig`: `{ isEnabled: false, secret: '', backupCodes: '[]', verifiedAt: null }`.
5. `logAuthEvent({ action: 'mfa_disabled' })`.

> **Note**: The `MfaConfig.secret` field is documented in the Prisma schema as
> "Encrypted TOTP secret", but the auth code stores the base32 secret
> directly (no at-rest encryption wrapper is applied in `src/lib/auth.ts`).
> This is a known gap; the documentation in the schema describes intent, not
> current behaviour.

---

## 3. Session Management

### 3.1 Tokens and cookies

| Cookie | HttpOnly | SameSite | Secure | Path | maxAge | Source |
| --- | --- | --- | --- | --- | --- | --- |
| `access_token` | yes | `strict` | `process.env.NODE_ENV === 'production'` | `/` | 15 min | `setAuthCookies` (`src/lib/auth.ts:157`) |
| `refresh_token` | yes | `strict` | same | `/api/auth` | 30 days | same |

The access token is also accepted via `Authorization: Bearer <token>` (used by
the API-only clients and tests) — `extractBearerToken()` in `src/lib/auth.ts:148`.

### 3.2 `UserSession` model (Prisma)

```
model UserSession {
  id           String   @id @default(cuid())
  userId       String
  refreshToken String   @unique
  deviceInfo   String?
  ipAddress    String?
  userAgent    String?
  expiresAt    DateTime
  isRevoked    Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

`createSession(params)` (`src/lib/auth.ts:306`) writes a fresh row with
`expiresAt = now + 30d`. It pre-emptively `deleteMany` on the
`refreshToken` (to handle re-login race conditions) and retries on a Prisma
`P2002` unique violation.

`isSessionValid(refreshToken)` returns `false` if `isRevoked` or past
`expiresAt`.

`revokeSession(refreshToken)` flips `isRevoked = true`.
`revokeAllUserSessions(userId)` revokes every active session.

### 3.3 Endpoints

| Method | Route | Effect | Source |
| --- | --- | --- | --- |
| POST | `/api/auth/refresh` | Reads `refresh_token` cookie, verifies JWT type `refresh`, checks `isSessionValid`, **revokes** old session, issues a new pair, rotates cookie. Audit logs `refresh_token_rotated`. | `src/app/api/auth/refresh/route.ts` |
| POST | `/api/auth/signout` | Optional `?allDevices=true`. Revokes the session (or all sessions for the user), `clearAuthCookies`. Always succeeds — even if revocation throws, cookies are cleared. | `src/app/api/auth/signout/route.ts` |
| GET | `/api/auth/me` | `getAuthUser(request)` (cookie or Bearer). Returns user object or 401. | `src/app/api/auth/me/route.ts` |
| GET | `/api/settings/sessions` | Lists `getUserActiveSessions(userId)`. Flags the session matching the current `refresh_token` cookie as `isCurrent`. | `src/app/api/settings/sessions/route.ts` |
| DELETE | `/api/settings/sessions/[id]` | Revoke a single session by ID. | `src/app/api/settings/sessions/[id]/route.ts` |
| POST | `/api/settings/sessions/revoke-all` | Revoke all sessions for the user. | `src/app/api/settings/sessions/revoke-all/route.ts` |

### 3.4 Audit log

Every auth event calls `logAuthEvent({ userId, action, details, ipAddress, userAgent })`
which writes an `AuditLog` row. The `AuthEventType` union
(`src/lib/auth.ts:57`) enumerates: `signup`, `signin`, `signin_failed`,
`signout`, `password_reset`, `mfa_enabled`, `mfa_disabled`, `mfa_verified`,
`magic_link_sent`, `magic_link_used`, `otp_login`, `email_verification_sent`,
`email_verified`, `session_revoked`, `suspicious_login`, `account_locked`,
`account_unlocked`, `google_oauth_login`, `refresh_token_rotated`.

`LoginHistory` rows are separate — they record every login attempt with
`success`, `failReason`, `ip`, `userAgent`, `country`, `city`. They drive the
`isAccountLocked` check (5 failures / 15 min).

---

## 4. Security Measures

### 4.1 Password hashing
- `bcryptjs`, 12 rounds. `hashPassword` and `verifyPassword` in `src/lib/auth.ts`.
- `validatePasswordStrength` enforces: length 8–128, ≥1 upper, ≥1 lower,
  ≥1 digit, ≥1 symbol.

### 4.2 OTP rate limiting & lockout
- Per-user: `User.otpAttemptCount` increments on every wrong OTP. At
  `OTP_MAX_ATTEMPTS = 5` the user row is stamped with
  `otpLockedUntil = now + LOCKOUT_MINUTES * 60_000` (15 min).
- Per-account (broader): `isAccountLocked(email)` counts `LoginHistory` rows
  with `success: false` in the last 15 minutes — ≥5 returns HTTP 423.
- Per-IP: `withRateLimit(request, 'auth')` — 5 auth requests/min/IP.
- Cooldown: a new OTP / magic link can only be requested if the previous one
  is more than 60s old.

### 4.3 Magic link safety
- `crypto.randomBytes(32).toString('hex')` — 256-bit token.
- 15-minute expiry. **Single-use**: `magicLinkToken` and
  `magicLinkTokenExpiry` are cleared immediately on successful verify.
- `secureCompare` (constant-time via `crypto.timingSafeEqual`) on the token.
- The verify route never reveals whether the account exists — `invalid_link`,
  `expired_link`, `server_error` are the only error flags returned.

### 4.4 MFA TOTP
- See §2.5. ±1 window for clock drift. 8 single-use backup codes (bcrypt
  hashed). Disabling requires both password + live TOTP code.

### 4.5 Device fingerprinting
- `src/lib/device-fingerprint.ts` parses `User-Agent` into structured
  `DeviceInfo` (browser, OS, device type, mobile/tablet/bot flags).
- `KnownDevice` Prisma model (`@@unique([userId, deviceFingerprint])`):
  trusted devices, `lastSeenAt`. Used by `src/lib/suspicious-login-service.ts`
  to flag new-device logins.

### 4.6 Suspicious login detection
- `src/lib/suspicious-login-service.ts` — `detectSuspiciousLogin()` checks:
  - new country (vs. user's login history)
  - new /24 IP range
  - impossible travel (>800 km/h between two logins)
  - new device fingerprint
- If suspicious, `sendSecurityAlert({ userId, email, name, event, ip, userAgent })`
  fires in the background — never blocks the login flow.

### 4.7 Account lock service
- `src/lib/account-lock-service.ts` — centralised lock/unlock helpers used by
  the rate-limit + brute-force paths above.

### 4.8 Audit log
- `AuditLog` model (`prisma/schema.prisma:1428`): `userId`, `action`,
  `details` (JSON string), `ipAddress`, `userAgent`, `resource`,
  `resourceId`, `metadata`. Indexed on `[userId, createdAt]`.

### 4.9 Other security files (present in `src/lib/security/`)
- `rate-limiter.ts` — `withRateLimit(request, 'auth' | 'mfa' | ...)`
- `jwt-security.ts` — uses the `jose` library for additional JWT checks
  (separate from the `jsonwebtoken`-based auth core).
- `csrf-protection.ts`, `cors-config.ts`, `security-headers.ts`,
  `webhook-security.ts`, `input-validator.ts`, `upload-security.ts`,
  `security-audit.ts`.

### 4.10 Anti-enumeration posture
- Signup returns the same success message regardless of whether the email is
  already registered.
- Signin and OTP verify return generic `Invalid email or password` / `Invalid
  email or OTP` for: unknown user, Google-only account trying password,
  unverified email, inactive account, wrong password/OTP. A constant-time
  fake bcrypt compare is run in the unknown-user path to match timing.

---

## 5. Known Issues and Status

> Cited from `/home/z/my-project/worklog.md`. The auth code itself is sound;
> every issue below is environmental (env vars / external Google Cloud
> Console configuration), not a code bug.

### 5.1 "Email delivery failed / not configured on the server"
- **Symptom**: signup / OTP request / magic-link request returns the generic
  success message but no email arrives, or the API response includes
  `deliveryIssue: true, deliveryMessage: 'Email delivery is not configured on
  the server...'`.
- **Root cause** (worklog Tasks 1, 3, 6, EMAIL-FIX-1): missing or
  placeholder `SMTP_USER` / `SMTP_PASSWORD` (or their aliases
  `GMAIL_USER` / `GMAIL_APP_PASSWORD`), or a Gmail App Password containing
  spaces.
- **Code reads these env vars** (`src/lib/email-ethereal.ts`, `src/lib/email.ts`):
  - `SMTP_HOST` (e.g. `smtp.gmail.com`)
  - `SMTP_PORT` (e.g. `587` for STARTTLS, `465` for implicit TLS — the code
    auto-sets `secure = (SMTP_PORT === 465)`, ignoring `SMTP_SECURE`)
  - `SMTP_USER` (alias: `GMAIL_USER`)
  - `SMTP_PASSWORD` (aliases: `SMTP_PASS`, `GMAIL_APP_PASSWORD`)
  - `SMTP_FROM` — for Gmail **must match** `SMTP_USER` exactly, otherwise
    Gmail rejects with a sender-mismatch error. (Worklog b7345f5 made the
    default fallback `SMTP_USER` rather than `noreply@acquisitionos.com`.)
  - `RESEND_API_KEY` (alternative provider)
- **Verification**: `GET /api/auth/config` should return
  `{ "googleAvailable": true, "emailConfigured": true }`.
- **Fix steps**:
  1. Set the four `SMTP_*` vars with the exact names above.
  2. If using Gmail: use a 16-char App Password with **no spaces**.
  3. Set `SMTP_FROM` to the same address as `SMTP_USER`.
  4. Restart the server so `instrumentation.ts` reloads `.env`.
  5. Confirm `/api/auth/config` returns `emailConfigured: true`.

### 5.2 "Google OAuth `redirect_uri_mismatch` (Error 400)"
- **Symptom**: Google shows `Error 400: redirect_uri_mismatch` after picking
  an account.
- **Root cause**: the redirect_uri the state route resolved for this request
  is not registered in **Google Cloud Console → APIs & Services →
  Credentials → OAuth 2.0 Client ID → Authorized redirect URIs**.
- **Fix**:
  1. Read the server log line
     `[Google OAuth State] Generated auth URL. redirectUri=..., origin=...`.
     That is the **exact** URL the user is being sent to Google with.
  2. Add it (no trailing slash, `https://`) to GCP Console → Authorized
     redirect URIs.
  3. With the dynamic-origin fix in place, the redirect_uri is the host the
     login request came from (preview workspace URL or production domain).
  4. Each preview workspace URL has a new domain — re-register it for each
     preview session.

### 5.3 "session_failed / session init failed"
- **Symptom**: magic-link verify route redirects to `/?auth_error=session_failed`.
- **Root cause**: `createSession(...)` threw — almost always because
  `JWT_SECRET` is missing (so token signing failed earlier) or the DB is
  unreachable (so the `UserSession.create` call fails).
- **Fix**:
  1. Set `JWT_SECRET` to 32+ hex chars in `.env` (worklog Task 1
     documented adding `AUTH_SECRET` as an alias for `NEXTAUTH_SECRET`; the
     auth code itself only reads `JWT_SECRET` — `src/lib/auth.ts:15`).
  2. Verify `DATABASE_URL` is reachable (`/api/health/database` returns OK).
  3. Check server logs for the `[Magic Link Verify] Step 11: Create
     session` failure message — the underlying Prisma error is logged.

### 5.4 "Google callback goes to wrong domain"
- **Was** caused by `APP_URL` being hardcoded to
  `https://acquisition.space-z.ai` in `src/lib/app-url.ts` and the state
  route building `redirect_uri` from that env var. Users on a preview
  workspace URL were redirected to the production domain after Google
  login, ending up unauthenticated on the wrong origin.
- **FIX** (worklog Task `DYNAMIC-REDIRECT-1`,
  files `src/app/api/auth/google/state/route.ts` +
  `src/app/api/auth/callback/google/route.ts`):
  - State route now resolves the public origin from request headers
    (`?origin=`, `x-forwarded-host`, `host`, `Origin`, `Referer`) and
    rejects internal cloud hostnames at every step.
  - State JSON carries `redirectUri` and `origin`, so the callback uses the
    same redirect_uri for token exchange that the state route sent to Google.
  - Cross-domain relay via `src/lib/oauth-relay.ts` mints a 60-second signed
    JWT and bounces the user back to their original domain's
    `/api/auth/google/relay` endpoint, which sets the auth cookies there.
- **Confirmed by tests** in the worklog: `curl` with
  `x-forwarded-host: preview-chat-...space-z.ai` returns
  `redirectUri=https://preview-chat-...space-z.ai/api/auth/callback/google`;
  with `x-forwarded-host: acquisition.space-z.ai` returns the production
  redirect_uri.

### 5.5 Google OAuth on GLM preview URLs
- Each GLM preview session is on a new subdomain (e.g.
  `https://preview-chat-ab88c1b0-...space-z.ai`).
- The dynamic-origin fix means the state route will *correctly* emit a
  redirect_uri on that preview subdomain — but **Google Cloud Console still
  requires each unique redirect_uri to be pre-registered**.
- **Operator action required every preview session**: add the new
  `https://preview-chat-...space-z.ai/api/auth/callback/google` URL to the
  Authorized redirect URIs list in GCP Console. Without this, Google
  returns `Error 400: redirect_uri_mismatch`.

### 5.6 Status of `jose` vs `jsonwebtoken`
- `package.json` lists `jose@^6.2.3` and `jsonwebtoken@^9.0.3`.
- The auth core (`src/lib/auth.ts`) uses **`jsonwebtoken`** exclusively for
  signing and verifying access/refresh tokens.
- `jose` is imported by `src/lib/security/jwt-security.ts` (a separate
  security-hardening module) and `src/lib/oauth-relay.ts` uses
  `jsonwebtoken`. Treat the worklog's "jose 6" line as a dependency
  inventory item; do not assume the auth JWT path goes through `jose`.

---

## 6. `/api/auth/config` Endpoint

`GET /api/auth/config` (`src/app/api/auth/config/route.ts`)

- Returns `{ googleAvailable, emailConfigured }`.
- `googleAvailable` is **hardcoded to `true`** (worklog FIX 3, permanent
  comment in the route). The state route still validates `GOOGLE_CLIENT_ID`
  and the callback validates both `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` at call time — if they are truly missing the
  routes return proper errors (503 / 307-to-`/?auth_error=google_failed`).
- `emailConfigured` is computed by `isEmailServiceConfigured()` from
  `src/lib/email.ts` — returns `true` if either a real `RESEND_API_KEY` or
  real SMTP credentials (`SMTP_HOST` + `SMTP_PORT` + `SMTP_USER` + non-placeholder
  `SMTP_PASSWORD`) are present.
- The route is wrapped in defensive try-catch with lazy imports so it can
  **never** crash — the frontend's `fetch().catch()` defaults to
  `googleAvailable: false` if this endpoint 500s, which would hide the Google
  button.

### Other auth diagnostic endpoints
- `GET /api/auth/google/redirect-uri` — returns the dynamic redirect_uri the
  state route would emit for the current request, plus step-by-step GCP
  Console registration instructions. Useful when the user is hitting
  `redirect_uri_mismatch`.
- `GET /api/auth/email-diagnostic` — admin-only (`Authorization: Bearer
  acquisitionos-cron-dev`) — returns the real SMTP error, diagnosis, and
  recommendations.
- `GET /api/auth/security/lock-status` — current lock state for the
  authenticated user.
- `GET /api/auth/security/devices` — known devices list.
- `GET /api/auth/security/alerts` — security alerts list.

---

## 7. File Reference

### Routes (`src/app/api/auth/`)
| Path | Purpose |
| --- | --- |
| `signup/route.ts` | Email/password signup + verification OTP |
| `signin/route.ts` | Email/password signin (+MFA gate) |
| `signout/route.ts` | Revoke session, clear cookies |
| `verify-email/route.ts` | Confirm signup OTP |
| `resend-verification/route.ts` | Resend signup OTP |
| `forgot-password/route.ts` | Generate reset OTP |
| `reset-password/route.ts` | Verify reset OTP + set new password |
| `otp/request/route.ts` | OTP login — request |
| `otp/verify/route.ts` | OTP login — verify + session |
| `magic-link/request/route.ts` | Magic link — request |
| `magic-link/verify/route.ts` | Magic link — verify (GET from email + POST) |
| `google/route.ts` | Legacy OAuth initiation (unused by frontend) |
| `google/state/route.ts` | OAuth initiation — used by frontend |
| `google/callback/route.ts` | Legacy OAuth callback (unused) |
| `callback/google/route.ts` | OAuth callback — canonical |
| `google/relay/route.ts` | Cross-domain session relay |
| `google/redirect-uri/route.ts` | Diagnostic — shows redirect_uri |
| `mfa/setup/route.ts` | Generate TOTP secret + backup codes |
| `mfa/confirm/route.ts` | Verify TOTP code, enable MFA |
| `mfa/verify/route.ts` | Verify TOTP code on login |
| `mfa/disable/route.ts` | Disable MFA (password + TOTP required) |
| `me/route.ts` | Get current user |
| `refresh/route.ts` | Rotate tokens |
| `config/route.ts` | Provider availability |
| `debug/route.ts` | Internal debug |
| `email-diagnostic/route.ts` | Admin SMTP diagnostic |
| `security/devices/route.ts` | Known devices |
| `security/alerts/route.ts` | Security alerts |
| `security/lock-status/route.ts` | Account lock state |

### Lib (`src/lib/`)
| Path | Purpose |
| --- | --- |
| `auth.ts` | JWT, bcrypt, OTP, TOTP, session, audit, brute-force helpers |
| `auth-middleware.ts` | `withAuth`, `withAdmin` route wrappers |
| `auth-store.ts` | Auth state store |
| `auth-edge-cases.ts` | Edge-case helpers |
| `app-url.ts` | `getAppUrl`, `getOriginFromRequest` |
| `google-oauth.ts` | Google OAuth helpers |
| `magic-link-validator.ts` | Magic link validation helpers |
| `oauth-state-store.ts` | OAuth state store |
| `oauth-relay.ts` | Cross-domain relay JWT (60s TTL) |
| `device-fingerprint.ts` | UA parsing + KnownDevice integration |
| `suspicious-login-service.ts` | Suspicious login detection |
| `account-lock-service.ts` | Lock / unlock orchestration |
| `email.ts` | `sendEmail`, `isEmailServiceConfigured`, OTP/magic-link email templates |
| `email-ethereal.ts` | SMTP/Resend detection helpers, `getGoogleClientSecret` |

### Prisma models involved
`User`, `UserSession`, `LoginHistory`, `MfaConfig`, `AuditLog`,
`KnownDevice`, `Subscription` (created at signup), `UserSettings` (created at
signup), `SecurityAlert`.
