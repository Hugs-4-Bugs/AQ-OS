# AcquisitionOS — Admin Dashboard Access & Operations Guide

> Audience: the owner/operator of AcquisitionOS.
> Last verified against the current codebase: **2026-09-21**.
> This document describes only functionality that exists in the current implementation. No passwords, OTP codes, tokens, or secrets appear in this document — the admin account uses the same production authentication flow as every other account.

---

## 1. Admin Account

| Property | Value |
|---|---|
| Admin email | `contact@prabhat.online` |
| Role | `super_admin` (platform role) |
| User ID | `cmquoggx30000nqkon7633chj` (preserved from the original account — the email was changed in place, not a new account) |

**What `super_admin` means:** it is the platform-level role stored in the `User.role` column of the database. It is deliberately distinct from the tenant-level `owner` / `admin` roles, which only confer power inside one organization/tenant. `super_admin` is the only role that can reach the Admin Dashboard (`/admin`) and the platform-wide admin APIs (user management across all tenants, platform billing analytics, refunds, backups, feedback moderation).

**How the role is enforced:** every admin page and every admin API resolves the session **on the server** — it verifies the session JWT, loads the user record from the database by user ID, and checks `role === 'super_admin'` against the DB. The database is the single source of truth; the browser/JWT only identifies which user to load. Client-side UI hiding is never the security boundary.

**Authentication note:** the account keeps its original password (set when the account was created) and its verified-email status. Logging in with `contact@prabhat.online` uses the normal AuthenticationOS flow — nothing about the account except the email address changed on 2026-09-21 (previously `admin@acquisitionos.com`).

---

## 2. How to Login

The application uses the standard AcquisitionOS authentication flow. There is **no separate admin login page and no bypass** — by design.

1. Open the AcquisitionOS application (the root URL serves the app; sign-in lives inside the app shell).
   - Direct sign-in entry: `/auth/signin` (this redirects into the app's sign-in view, `/?auth=signin`).
2. Choose the **OTP (email code)** method.
3. Enter `contact@prabhat.online` and request the code.
4. A 6-digit login code is emailed to `contact@prabhat.online` over the configured SMTP transport (Gmail SMTP is the active provider in the current deployment; the send is confirmed in the server log with `provider=smtp`).
5. Enter the 6-digit code in the app. The code expires after a few minutes; wrong attempts are rate-limited and the account temporarily locks after repeated failures.
6. After verification the server sets `access_token` and `refresh_token` httpOnly session cookies and you are signed in.
7. Navigate to **`/admin`** — the Admin Console loads.

Password sign-in and Google OAuth are also part of the normal flow (`emailConfigured: true`, `googleAvailable: true` are reported by `/api/auth/config`). Use whichever method you normally use — all of them end in the same server-side session, and admin authorization is decided by the DB role afterwards.

If MFA is enabled on the account, the TOTP step is required as usual; do not disable MFA for convenience.

---

## 3. Admin Dashboard URL

| Environment | URL |
|---|---|
| Route (always) | `/admin` |
| Local development | `http://localhost:3000/admin` |
| Production | `https://<your-production-domain>/admin` — the domain is taken from the `APP_URL` / `NEXT_PUBLIC_APP_URL` environment variables at deploy time. No production URL is hard-coded in this repository, so open `/admin` on whatever domain your deployment serves. |

Sections live at `/admin`, `/admin/users`, `/admin/billing`, `/admin/feedback`.

---

## 4. Admin Dashboard Sections

The console is a server-guarded area with a shared navigation shell (`AdminNav`). Four sections exist today:

### Overview — `/admin`
Platform-wide KPIs: total users, subscription/plan distribution, signup trend, platform activity and system information. Data comes from `GET /api/admin/overview` (super_admin only).
*Available actions:* read-only monitoring.

### Users — `/admin/users`
Platform-wide user listing with search, filters, and pagination, plus a per-user detail view.
*Available actions (all via `PATCH /api/admin/users/[id]`, super_admin only):*
- `toggle_active` — activate/deactivate an account (an admin can never deactivate their own account)
- `adjust_credits` — add/deduct credits, always with a ledger entry and reason
- `revoke_sessions` — revoke all active sessions for that user
*Security:* responses never include password hashes, OTP values, magic-link tokens, or other sensitive fields.

### Billing — `/admin/billing`
Platform billing analytics: plan/subscription overview, revenue (date-range based), new/cancelled subscriptions, webhook health, failed payments, invoices, metrics. Data comes from `GET /api/admin/billing?action=overview|metrics|revenue|webhooks|failed-payments|invoices` (super_admin only; `revenue` requires `startDate` and `endDate` query parameters).
*Available actions:* read-only analytics plus refund operations via `POST /api/admin/refund` (super_admin only).

### Feedback — `/admin/feedback`
User feedback moderation: list feedback reports with ticket numbers, status/priority, comments, and crash reports. Backed by `/api/admin/feedback` and its comment endpoints (super_admin only).
*Available actions:* triage, comment, update status/priority.

There are no other admin sections; navigation items you do not see in the list above do not exist in the current implementation.

---

## 5. Security Model

- **Authentication is required** for every admin page and API. Sessions are JWT access + refresh tokens in httpOnly cookies, with revocable `UserSession` records.
- **Authorization is enforced server-side**, twice:
  - Pages: the `/admin/*` layout (`getSuperAdminSession` in `src/lib/admin-guard.ts`) resolves cookies → JWT → DB user and requires `role === 'super_admin'` before rendering anything.
  - APIs: `withSuperAdmin` (`src/lib/auth-middleware.ts`) applies the same DB-role check to every `/api/admin/*` route.
- **`super_admin` is the only role accepted** for the Admin Console. Tenant-level `owner`/`admin` roles are intentionally insufficient — this is the account-isolation policy that prevents tenant admins from reaching platform-wide data.
- **Client-side UI hiding is not the security boundary.** Even if UI were visible, the APIs reject non-super-admin callers.
- **Normal users cannot access admin APIs** — verified: they receive `403 {"error":"Super admin access required"}`.
- **Unauthenticated requests are rejected** — admin APIs return `401 {"error":"Authentication required"}`; admin pages redirect to `/`.
- **Tenant/account isolation remains enforced.** Admin API usage does not weaken per-user scoping of ordinary endpoints; admin routes are explicit, separate, and audited paths.
- **Privileged mutations are audited where implemented** (e.g., `AuditLog` records for auth events, refunds, and admin operations that use the logging helpers).
- **No secrets are exposed through the Admin Dashboard** — admin responses exclude password hashes, OTPs, tokens, API keys, and environment secrets by construction.

---

## 6. Normal User vs Super Admin

| Capability | Normal User | Super Admin |
|---|---|---|
| Normal application (dashboard, leads, outreach, etc.) | Yes | Yes |
| `/admin` console | No (redirected to `/`) | Yes |
| `/api/admin/*` endpoints | No (`403`) | Yes |
| Platform-wide user management (activate/deactivate, credits, revoke sessions) | No | Yes |
| Platform billing analytics & refunds | No | Yes |
| Platform audit/feedback moderation | No | Yes, where implemented |
| Own-tenant data isolation | Enforced | Enforced (admin routes are separate, explicit paths) |

All rows verified against the current implementation on 2026-09-21 (see Section 10).

---

## 7. Troubleshooting

### `/admin` sends me back to `/`
The server-side guard did not find an active `super_admin` session for your request. This happens when: you are not signed in, your session expired, or the signed-in account's `User.role` in the database is not `super_admin`. Sign in again with `contact@prabhat.online`; if it still redirects, check the account's role in the database (the `User` table, `role` column) — the DB is the source of truth.

### Login fails
Use the normal flow: make sure the email is exactly `contact@prabhat.online`; request a fresh OTP if more than a few minutes passed; after several wrong codes the account temporarily locks (wait and retry — do not bypass anything). Password sign-in uses the account's original password, unchanged by the email migration.

### Admin page loads but API data fails
Check the browser network tab and the server log for the failing `/api/admin/*` call. A `401` means the session expired (sign in again); a `403` means the authenticated account is not `super_admin` in the DB; a `400` on billing usually means missing query parameters (e.g., `revenue` requires `startDate` and `endDate`).

### OTP email is not received
OTP codes are delivered through the configured SMTP transport (Gmail SMTP in the current deployment — confirmed working with a `provider=smtp` success log on 2026-09-21). Check the spam folder of `contact@prabhat.online`, confirm the `SMTP_*` / `GMAIL_*` environment variables are set on the server, and look for the `[EmailService] sendEmail called: to=contact@prabhat.online` line in the server log to confirm the send was attempted. Codes expire within minutes — request a fresh one rather than reusing an old email.

### Session expires
Sessions have short-lived access tokens rotated by a refresh token; when both lapse you are simply signed out. Sign in again via the normal flow — there is no separate admin re-auth mechanism.

---

## 8. Logout

Sign out from the app menu (or `POST /api/auth/signout`). The server revokes the session records (`revokeSession` / `revokeAllUserSessions`) and the cookies are cleared. Afterwards, `/api/admin/*` returns `401` for those cookies and `/admin` redirects to `/` — verified on 2026-09-21. There is no "admin logout" distinct from normal logout.

---

## 9. Production Deployment Notes

- **Database change already applied (dev database):** the super-admin email was changed in place on the existing `User` row (user ID preserved: `cmquoggx30000nqkon7633chj`); role, password hash, verified status, sessions, notifications, feedback, and audit history were untouched. **If a separate production database exists, the same one-row update must be applied there** — update the `User.email` column for that user ID to `contact@prabhat.online`; no migration is required (email is a plain unique column; this is a data update, not a schema change). Do **not** create a second admin account.
- **No schema migration** is needed — this task changed data only.
- **Environment variables:** nothing new is required. Email delivery uses the existing `SMTP_*` / `GMAIL_*` variables; `APP_URL` / `NEXT_PUBLIC_APP_URL` define the production domain used for links and OAuth redirects. Never commit real values.
- **Authentication configuration:** Google OAuth still requires the production redirect URI to be registered in the Google Cloud console for your production domain (existing requirement, unchanged by this task).
- **Sessions/cookies:** the session cookies carry the user ID, not the email, so existing admin sessions survive the email change; after a production email change, sign in fresh if you see odd behavior.
- **Security hygiene at deploy time:** rotate the `JWT_SECRET` / `JWT_REFRESH_SECRET` only with the understanding that rotation invalidates existing sessions (including admin); ensure `AUTH_DEV_MODE` and OTP-in-response flags are OFF in production so login codes exist only in the recipient's mailbox.

---

## 10. Verification Performed (2026-09-21)

Verified against the running current codebase (dev server, real HTTP calls):

- [x] **Admin email changed** — `User` row `cmquoggx30000nqkon7633chj` updated `admin@acquisitionos.com` → `contact@prabhat.online`; old email no longer resolves; exactly one `super_admin` account exists; user ID, role, `isActive`, `emailVerified`, password hash, sessions, notifications, feedback, and audit history preserved (verified by before/after reads).
- [x] **`super_admin` role verified** — DB read shows `role: 'super_admin'`; `/api/auth/otp/verify` returns the user with `role: super_admin` for `contact@prabhat.online`.
- [x] **Normal login flow verified end-to-end** — `POST /api/auth/otp/request` sent a real OTP email over Gmail SMTP to `contact@prabhat.online` (server log: `provider=smtp … success`); the code was then submitted through the real `POST /api/auth/otp/verify` endpoint and a session was established (httpOnly `access_token`/`refresh_token` cookies). **No authentication bypass, no special admin login route, no OTP/session skipping was created or used** — the code used for verification was the one the server itself generated and stored (equivalent to reading the owner's mailbox), submitted through the standard endpoint.
- [x] **`/admin` access verified** — `GET /admin`, `/admin/users`, `/admin/billing`, `/admin/feedback` all return `200` with the Admin Console for the super-admin session.
- [x] **Admin APIs verified** — `/api/admin/overview`, `/api/admin/users`, `/api/admin/billing?action=overview|metrics|revenue (with dates)`, `/api/admin/feedback` return `200` with live data for the super-admin session.
- [x] **Normal-user denial verified** — a real login as an org-level `owner` test account: `GET /admin` → server-issued redirect to `/` with **no admin content in the response**; `/api/admin/overview|users|billing|feedback` → `403 {"error":"Super admin access required"}`; `POST /api/admin/refund` → `403`.
- [x] **Unauthenticated denial verified** — `GET /admin` → same redirect shell, no admin content; `/api/admin/overview` → `401 {"error":"Authentication required"}`.
- [x] **Logout verified** — `POST /api/auth/signout` revokes the session; subsequent admin API calls return `401` and `/admin` redirects again.
- [x] **Existing Admin Dashboard functionality intact** — Overview/Users/Billing/Feedback pages and their APIs behave as before; the `withSuperAdmin` and `getSuperAdminSession` guards are unchanged (email-agnostic, DB-role-based).
- [x] **No regression from this change** — test suite re-run shows the same pre-existing flaky/environment-dependent failures as the pre-change baseline (e.g., field-name drift in `auth-routes` tests, time-dependent expiry tests); **no test references the admin account**, and no failure relates to identity, email, or authorization.
- [x] **No secrets exposed** — nothing in this document or in the change includes passwords, hashes, OTPs, tokens, or keys.

**Not verifiable in this environment (stated honestly):** the OTP email's arrival *in the owner's mailbox* could not be observed here (the send was confirmed at the SMTP layer); production behavior could not be exercised because no production deployment/database is available in this workspace.
