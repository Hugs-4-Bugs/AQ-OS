# Common Errors — Exact Causes and Fixes

Every entry below reflects real issues encountered in this codebase/deployment. Order: auth → email → OAuth → platform → payments → discovery/AI → realtime.

---

## 1. `SESSION_FAILED` / "session init failed"

- **Cause:** `JWT_SECRET` (or `JWT_REFRESH_SECRET`) missing or `DATABASE_URL` unreachable — the server cannot mint or validate session cookies. On the GLM platform it also appears when the sandbox idle-killed the server.
- **Fix:**
  1. Set `JWT_SECRET` + `JWT_REFRESH_SECRET` in the secrets panel (generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
  2. Verify DB: `curl -s http://localhost:3000/api/health/database`.
  3. GLM sandbox: run `/home/z/my-project/keepalive-v2.sh` (restores env AND restarts server).
  4. If on a deployed URL (Vercel/Railway): confirm the SAME secrets exist on that platform — env vars are per-platform.

## 2. "Email delivery failed" / "Email not configured on server" / `emailConfigured:false`

- **Cause:** SMTP variable names in the environment don't match what the code resolves (or creds are wrong). The reader accepts 9 password aliases (`SMTP_PASSWORD`, `SMTP_PASS`, `SMTP_AUTH_PASSWORD`, `GMAIL_APP_PASSWORD`, `GMAIL_PASSWORD`, `EMAIL_PASSWORD`, `EMAIL_PASS`, `MAIL_PASSWORD`, `MAIL_PASS`) but the canonical set must be present and valid.
- **Fix:**
  1. Check boot logs `[SMTP-Env-Diag] user/pass/host/port/from` — each shows SET/MISSING per alias.
  2. Align to canonical: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=<gmail>`, `SMTP_PASSWORD=<16-char app password, no spaces>`, `EMAIL_FROM=<same gmail>`.
  3. Validate handshake: `node scripts/smtp-verify.js` → expect `SMTP AUTH SUCCESS`.
  4. Restart the server (env is read at boot) → `/api/auth/config` → `emailConfigured:true`.
  5. If creds ARE set but auth fails → the password is the Gmail LOGIN password or has spaces — regenerate an App Password (see `GMAIL-SMTP-SETUP.md`).

## 3. `redirect_uri_mismatch` (Google Error 400)

- **Cause:** the `redirect_uri` the app sent is not registered **byte-identically** in GCP Console → the OAuth client's Authorized redirect URIs (http vs https, trailing slash, wrong domain, new preview domain).
- **Fix:**
  1. Find the exact URI being sent: open **`/api/auth/google/redirect-uri` ON the failing domain** (diagnostic route returns the dynamic redirect_uri), or read server logs (state route logs `resolvedOrigin`).
  2. Add exactly that string in GCP Console → APIs & Services → Credentials → OAuth client → Authorized redirect URIs → Save.
  3. Wait 1–5 minutes (Google propagation) → retry login.
- **Context:** the app now builds redirect_uri dynamically per request domain (x-forwarded-host), so preview and production both work — but EVERY domain must be pre-registered. A new GLM preview session = new domain = new registration.

## 4. Google Callback Goes to the Wrong Domain

- **Cause (historical):** redirect_uri was built from `APP_URL`, so logins initiated on the preview URL redirected to `acquisition.space-z.ai` (which had no live backend).
- **Status:** FIXED in code — `state` route resolves origin from request headers (priority `?origin=` → `x-forwarded-host`+`proto` → `host` → `Origin` → `Referer` → env fallback); the callback uses the redirectUri carried in the state JSON, so both sides always agree.
- **If you still see it:** ensure the deployed code includes the fix (check `src/app/api/auth/google/state/route.ts` for `resolvePublicOrigin`); clear cached authUrl; confirm `APP_URL` isn't overriding via `?origin=` misuse; verify with the dual-domain test (`curl -H "x-forwarded-host: <domain>" /api/auth/google/state`).

## 5. Sandbox Inactive / `session_failed` on GLM / "Sandbox paused"

- **Cause:** GLM platform idle timeout — NOT a code issue. The sandbox (and preview URL) stops after inactivity; the dev server is killed and `.env` may be wiped.
- **Fix:** cannot be fixed by code. Resume/reopen the session; then run `keepalive-v2.sh` to restore env + server. For anything durable, deploy to Railway (`DEPLOYMENT-RAILWAY.md`).

## 6. Deployment Failed on GLM ("deployment failed")

- **Cause:** the deploy runs `next build`; any TypeScript error (or an OOM kill — see #7) fails it.
- **Fix:**
  1. Stop the dev server first (`pkill -9 -f 'next dev'`), kill zombie builders (`pkill -9 -f 'next build'; pkill -9 -f 'tsc'`).
  2. `NODE_OPTIONS='--max-old-space-size=3000' npx next build` — fix every TS error it lists; repeat until `✓ Compiled successfully`.
  3. Restart the dev server; deploy again.
  4. Known benign warnings: `instrumentation.ts` fs/path/process.cwd ESM notices — not errors, do not chase them.

## 7. Dev Server Keeps Dying / OOM `exit 137` (GLM)

- **Cause:** 4 GB sandbox; running `next build` (Turbopack) concurrently with the dev server OOMs, and orphan `next build`/`tsc --noEmit` processes keep consuming RAM afterward, killing the dev server in a loop.
- **Fix:** `ps aux | sort -k6 -rn | head` to spot fat processes → kill PIDs individually (`kill -9 <pid>`) → confirm ~3+ GB free → restart server (`setsid npx next dev -p 3000 > dev.log 2>&1 &`) → only build when the dev server is stopped. Never `pkill -f tsc` casually while the dev server runs (`next dev` spawns tsc internally — you'll kill your own server).

## 8. Payment Failed Immediately Without Reaching Stripe

- **Cause:** `STRIPE_SECRET_KEY` missing/wrong on THAT deployment, or the request didn't carry the plan (priceId/plan resolution failed).
- **Fix:**
  1. `GET /api/payments/provider-status` — shows what's configured.
  2. Set `STRIPE_SECRET_KEY` (+ webhook secret for fulfillment) in the platform's env panel; restart.
  3. Retry checkout with body `{plan:"pro", billingCycle:"monthly"}`; watch server logs for the Stripe error detail.
  4. Remember: this app uses inline `price_data` — there are no `STRIPE_PRICE_*` env vars to set (see `STRIPE-SETUP.md` §3).

## 9. Paid but Plan Didn't Change / Credits Not Granted

- **Cause:** webhook not delivered or signature mismatch (fulfillment is webhook-driven).
- **Fix:** Stripe → Developers → Webhooks → Attempts (look for non-200) → fix `STRIPE_WEBHOOK_SECRET`/URL → use `/api/payments/verify-session` to sync the client → if an event shows `processingError`, inspect `PaymentWebhook` rows (admin: `/api/admin/billing/webhooks`) and replay via `/api/payments/webhook-replay`.

## 10. OTP Never Arrives (signup/login/reset)

- **Cause:** SMTP not configured/invalid (see #2), or dev flags set so OTP is returned in the response instead of emailed, or Gmail rate limit hit.
- **Fix:** check `/api/auth/config` → `emailConfigured`; with `AUTH_DEV_OTP_IN_LOG=true` the OTP appears in server logs (dev only!); in production fix SMTP per GMAIL-SMTP-SETUP.md; respect Gmail 500/day limit.

## 11. `account has been locked` / Can't Log In After Failed Attempts

- **Cause:** OTP brute-force protection — `otpAttemptCount` exceeded → `otpLockedUntil` set.
- **Fix:** wait for lockout expiry or admin-clear the fields (see `ADMIN-WORKFLOWS.md` → unlock). MFA failures have the same pattern.

## 12. Discovery Returns No Leads

- **Cause:** Google Custom Search keys missing/invalid, engine not configured to "search entire web", or daily quota exhausted (100/day free).
- **Fix:** verify `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID` (a.k.a. `GOOGLE_SEARCH_CX`); test the engine manually via the Custom Search API playground; check `GET /api/lead-discovery` (capability flags) and `DiscoveryJob.error`; enable SerpAPI fallback (`SERPAPI_KEY`) as backup.

## 13. AI Calls Fail ("AI analysis failed" / provider errors)

- **Cause:** Z-AI SDK unavailable outside GLM without fallback key; or credit balance zero.
- **Fix:** inside GLM it should just work (no key). Elsewhere: set `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`). Check credits: `GET /api/credits`; top up or wait for monthly renewal. Cost/usage detail: `/api/ai/costs`, `/api/ai/usage`.

## 14. Telegram/WhatsApp Notifications Not Arriving

- **Cause:** channel not connected/verified, or platform credentials absent (`TELEGRAM_BOT_TOKEN` / Twilio creds), or per-user preferences disabled.
- **Fix:** Settings → Integrations → connect + OTP-verify the channel; check `NotificationPreferences` enable the event; test send (`/api/telegram/send`, `/api/whatsapp/twilio/send`); inspect `MessageDelivery` + `DeliveryDeadLetter` for the failure reason.

## 15. Realtime Widgets Frozen (no live updates)

- **Cause:** SSE/WebSocket connection lost (server restart, proxy buffering) without recovery.
- **Fix:** `GET /api/realtime/status`; the client auto-recovers (`use-live-*.ts`, `/api/realtime/recover`); hard refresh re-establishes. On Vercel prefer SSE over WS (serverless limits — see DEPLOYMENT-VERCEL.md §7).

## 16. `P1001`/`P1003` Prisma Errors (can't reach DB / file missing)

- **Cause:** SQLite file deleted (sandbox wipe) or Postgres URL wrong.
- **Fix:** sandbox: `keepalive-v2.sh` (restores DATABASE_URL) + `npx prisma db push` if the db file is gone. Postgres: verify URL/whitelist; `npx prisma migrate deploy`.

## 17. Build Succeeds Locally, Fails on Platform

- **Cause:** env differences (missing vars used at build-time by `NEXT_PUBLIC_*`), Node version mismatch, or OOM on small builders.
- **Fix:** replicate env in the platform dashboard (esp. `NEXT_PUBLIC_APP_URL`); pin Node 20; add memory (`NODE_OPTIONS=--max-old-space-size=3072` on Railway config or upgrade builder).

## 18. 401/403 on Admin or Settings APIs

- **Cause:** role insufficient (`/api/admin/*` needs owner/admin), or session cookie missing on cross-origin API calls.
- **Fix:** verify role in `OrgMember`; call APIs same-origin (cookies are SameSite=Lax); check `getAuthUser` presence in custom callers.
