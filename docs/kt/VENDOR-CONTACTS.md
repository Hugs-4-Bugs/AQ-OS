# AcquisitionOS — Vendor & External Services Register (KT)

> **Last updated: 2026-09-09**
> **Scope:** every external service the platform talks to, what it's used for, the exact env var names it reads (values intentionally NEVER written here), account details discoverable from the repo, support channels, rotation notes, and blast radius when it fails.
> **Sources read:** `.env` (names only), `ensure-env.sh`, `src/lib/email-ethereal.ts`, `src/lib/email.ts`, `src/lib/stripe-service.ts`, `src/lib/razorpay-service.ts`, `src/lib/telegram-service.ts`, `src/lib/whatsapp-service.ts`, `src/lib/ai/ai-provider.ts`, `src/lib/lead-discovery/discovery-engine.ts`, `src/lib/meetings/platform-adapter.ts`, `src/lib/google-oauth.ts`, `docs/02-architecture/SYSTEM-ARCHITECTURE.md`, `worklog.md`.
>
> **Status legend:** `[ACTIVE]` configured and working today · `[NOT CONFIGURED]` code ready, credentials absent from current `.env` · `[OPTIONAL]` supported fallback, not required.

---

## 1. Service inventory (summary table)

| # | Service | Purpose | Key env vars | Status | Failure impact |
|---|---|---|---|---|---|
| 1 | Google Cloud (OAuth) | Google sign-in, Gmail API, Calendar API | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `[ACTIVE]` | No Google login; calendar/meet broken; Gmail inbox sync dead |
| 2 | Gmail SMTP | Transactional + outreach email sending | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` (`+` aliases), `EMAIL_FROM` | `[ACTIVE]` | OTP/magic-link/verification emails fail → **login breaks** |
| 3 | Resend | Alternative email provider (tier 1) | `RESEND_API_KEY` | `[OPTIONAL]` | Falls through to SMTP tier — no impact if SMTP healthy |
| 4 | Z-AI (z-ai-web-dev-sdk) | All AI: scoring, research, outreach, assistant, meetings AI | (SDK authenticates via deployment; no key in `.env`) | `[ACTIVE]` | Every AI feature degrades to OpenAI/Anthropic fallback or errors |
| 5 | Stripe | Subscriptions, webhooks, invoices | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL` | `[NOT CONFIGURED]` | Checkout fails fast (loud 500 "Stripe is not configured") — paid upgrades impossible |
| 6 | Razorpay | India-market payments (INR + GST) | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | `[NOT CONFIGURED]` | Indian checkout path unavailable |
| 7 | Google Custom Search API | Lead discovery web search | `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_CX` (`GOOGLE_SEARCH_ENGINE_ID` alias) | `[ACTIVE]` | Discovery pipeline stalls (SerpAPI fallback if `SERPAPI_KEY` set — it is not) |
| 8 | Telegram Bot API | Outbound notifications | token stored **per-user in DB** (`TelegramConfig`, encrypted); `TELEGRAM_WEBHOOK_URL` | `[ACTIVE]` (per-user opt-in) | Telegram channel silent; in-app/email unaffected |
| 9 | Twilio (WhatsApp) | WhatsApp OTP + messaging | creds stored **per-user in DB** (`WhatsappConfig`: SID/token encrypted) | `[NOT CONFIGURED]` (no global env) | WhatsApp channel unavailable |
| 10 | OpenAI | AI fallback provider #1 | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` | `[OPTIONAL]` / not set | AI chain skips to Anthropic / errors |
| 11 | Anthropic | AI fallback provider #2 | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL` | `[OPTIONAL]` / not set | AI chain exhausts fallbacks |
| 12 | SerpAPI | Discovery search fallback | `SERPAPI_KEY` | `[OPTIONAL]` / not set | No discovery fallback when Google CSE fails |
| 13 | Aliyun FC / sandbox host | App hosting (this deployment) | n/a (platform-managed) | `[ACTIVE]` | Server killed; keepalive restores; sessions lost |
| 14 | space-z.ai preview platform | Preview URLs + gateway + scheduler (cron jobs) | n/a (platform-managed) | `[ACTIVE]` | Preview domain changes; cron jobs stop firing |
| 15 | Gmail API (via #1) | Inbox sync, reply tracking, Pub/Sub push | same Google OAuth client | `[ACTIVE]` | Replies stop syncing → reply-intelligence stops |

---

## 2. Detailed entries

### 2.1 Google Cloud — OAuth client `22873135381-*.apps.googleusercontent.com` `[ACTIVE]`

- **Used for:** (a) "Sign in with Google" auth; (b) **Gmail API** — inbox sync, thread/message reads, reply processing, Pub/Sub push notifications; (c) **Google Calendar API** — freeBusy availability checks, event creation, **Google Meet links** via `conferenceData` (`conferenceSolutionKey.type = 'hangoutsMeet'`, `hangoutLink` extracted in `src/lib/meetings/platform-adapter.ts`).
- **Env vars:** `GOOGLE_CLIENT_ID` (public identifier — safe to reference), `GOOGLE_CLIENT_SECRET` (secret — stored in `.env`/`ensure-env.sh`; **never** quote the value).
- **Account details:** single GCP project; OAuth client is a *Web application* type. Real client secret has the `GOCSPX-` prefix (note: a historical bug in `env-safeguard.ts` falsely flagged `GOCSPX-` values as placeholders — fixed; `isRealGoogleConfigured()` in `email-ethereal.ts` is authoritative).
- **Critical deployment constraint:** every public origin (each new sandbox preview URL **and** production) needs its redirect URI registered in the OAuth client, e.g. `https://<domain>/api/auth/callback/google`. The callback resolves origins dynamically (state JSON → headers → env) so code needs no change per domain, but Google will still reject unregistered URIs with `Error 400: redirect_uri_mismatch`. Both `/api/auth/callback/google` (primary) and `/api/auth/google/callback` (legacy) are live.
- **Console:** https://console.cloud.google.com → APIs & Services → Credentials. Enable: Google+ sign-in scopes, Gmail API, Calendar API.
- **Support:** Google Cloud Support console (free tier = community/docs only). Rotation: client secret rotates in Credentials → client → *Reset secret*; update `GOOGLE_CLIENT_SECRET` in the secrets panel **and** `ensure-env.sh` at the same moment (brief login outage during rotation).
- **Renewal notes:** OAuth consent screen verification status should be re-checked quarterly (unverified apps show warning screens to new users after grace periods); test-user lists expire.

### 2.2 Gmail SMTP — `smtp.gmail.com:587` `[ACTIVE]`

- **Used for:** every outbound email — OTP login codes, magic links, email verification, password reset, security alerts, outreach sends (+ user BCC copies), invoices, meeting invites/reminders, notification email channel, weekly digest.
- **Env vars (with the alias system from `src/lib/email-ethereal.ts`):**
  - user: `SMTP_USER` (also reads `SMTP_USERNAME`, `GMAIL_USER`, `EMAIL_USER`, `EMAIL_USERNAME`, `MAIL_USER`, `MAIL_USERNAME`)
  - pass: `SMTP_PASSWORD` (also reads `SMTP_PASS`, `SMTP_AUTH_PASSWORD`, `GMAIL_APP_PASSWORD`, `GMAIL_PASSWORD`, `EMAIL_PASSWORD`, `EMAIL_PASS`, `MAIL_PASSWORD`, `MAIL_PASS`)
  - host/port/from: `SMTP_HOST` (default `smtp.gmail.com`), `SMTP_PORT` (587, STARTTLS), `EMAIL_FROM`.
- **Account details:** consumer Gmail account (found in repo/screenshots; see HANDOVER-CHECKLIST.md §platform access) with a **16-char App Password**. Verified working: SMTP AUTH success, `250 OK` deliveries, `/api/auth/config` → `emailConfigured:true`.
- **Limits:** ~500 recipients/day for consumer Gmail — outreach batches and digests must respect this; the sequence engines do not hard-enforce it. Consider Resend for volume.
- **Support:** none (consumer Gmail). Diagnose via `[SMTP-Env-Diag]` lines in `dev.log` (SET/MISSING per alias, never values) and `scripts/smtp-verify.js`.
- **Rotation notes:** App password rotates in Google Account → Security → App passwords. Revoking it kills **login emails** within seconds — rotate during a low-traffic window and update `SMTP_PASSWORD` (+ the `ensure-env.sh` preserve list keeps it across env wipes). Watch for `535` auth errors in `dev.log` after rotation.

### 2.3 Resend `[OPTIONAL]` — not currently set

- **Used for:** tier-1 email transport when `RESEND_API_KEY` is set (HTTP API, better deliverability than SMTP); chosen automatically before SMTP in `src/lib/email.ts`.
- **Env vars:** `RESEND_API_KEY` (placeholder detection: keys starting `re_your-` are treated as unconfigured).
- **Status:** `[OPTIONAL]` — absent from current `.env`; SMTP is doing all delivery. Listed in the `ensure-env.sh` preserve list, so if you add it, it survives env regeneration.
- **Support:** resend.com dashboard + support@resend.io; generous free tier, paid plans per month.
- **Rotation:** dashboard → API Keys → create/revoke. Update `RESEND_API_KEY`; effect is immediate on next cold start.

### 2.4 Z-AI (`z-ai-web-dev-sdk` v0.0.18) `[ACTIVE]`

- **Used for:** the default AI provider behind `src/lib/ai/ai-provider.ts` — lead analysis/scoring, company research, score explanations, outreach + sequence message generation, sales assistant chat (incl. streaming), meeting assistant/agenda/notes, reply classification, RAG answers, website analysis, VLM reads of screenshots, proposal generation. Server-only (never import in client components).
- **Env vars:** none required in `.env` — the SDK authenticates the sandbox/panel deployment automatically (`ZAI.create()`).
- **Account/billing:** consumed via the Z-AI platform credits/plan of the workspace that owns the deployment; every call is metered into the app's own `AiCostRecord` table (visible at `/api/ai/costs`, `/api/ai/usage`) — app-side credits are a separate, product-level system (`credit-service.ts`).
- **Support:** Z-AI platform panel/docs (the SDK ships with the environment; `docs/03-setup-and-deployment/DEPLOYMENT-GLM.md` covers platform behavior).
- **Failure impact:** if the SDK is unavailable, the provider chain in `ai-provider.ts` falls back to OpenAI-compatible (`OPENAI_API_KEY`) then Anthropic (`ANTHROPIC_API_KEY`) — both currently unset, so AI features would hard-fail. This is the single biggest functional dependency.
- **Rotation:** nothing to rotate locally; manage keys/quota in the Z-AI platform panel.

### 2.5 Stripe `[NOT CONFIGURED]`

- **Used for:** plan subscriptions (Free/Pro/Elite), credit packs, Stripe Checkout (`/api/payments/create-stripe-session`, alias `/api/payments/create-checkout-session`), webhooks (`/api/payments/webhook/stripe`, signature-verified, idempotent via `PaymentWebhook.eventId @unique`), invoices + PDFs, refunds (`refund-service.ts`), dunning/recovery, billing portal (`stripe-portal-service.ts`).
- **Env vars:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_ID` / `STRIPE_PRICE_PREMIUM_ID` / `STRIPE_PRICE_ELITE_ID` (+ credit-pack price ids), optional overrides `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`. **`STRIPE_SECRET_KEY` is missing from the current `.env`** — `isStripeConfigured()` returns false and checkout fails fast with a loud "Stripe is not configured" error (by design, no mocks; verified 2026-09).
- **Status:** `[NOT CONFIGURED]` — full flow coded and webhook-verified in past sessions (see worklog `WAVE2-B`), just needs live keys + one webhook endpoint per public domain (`https://<domain>/api/payments/webhook/stripe`), events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated/deleted`, `charge.refunded`.
- **Support:** Stripe Dashboard support chat; excellent docs. Rotation: Developers → API keys (restrict + roll secret), Webhooks → signing secret per endpoint. All Stripe vars are in the `ensure-env.sh` preserve list — adding them once survives env wipes.

### 2.6 Razorpay `[NOT CONFIGURED]`

- **Used for:** Indian-market payments: INR pricing (`PLAN_PRICES_INR` in `stripe-service.ts`), GST capture (`gst-service.ts`), order creation/verification (`razorpay-service.ts`, `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` + `RAZORPAY_WEBHOOK_SECRET`).
- **Status:** `[NOT CONFIGURED]` — none of the three vars are present in the current `.env`; the code path logs `[RazorpayService] Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET` and exits when invoked.
- **Support:** razorpay.com dashboard + support tickets; KYC/KYC-docs managed in dashboard.
- **Rotation:** dashboard → Account & Settings → API keys (regenerate; old key stays valid until revoked). Webhook secret per webhook URL.

### 2.7 Google Custom Search API (Programmable Search) `[ACTIVE]`

- **Used for:** the first stage of lead discovery (`src/lib/lead-discovery/discovery-engine.ts`): queries per niche/country to find businesses + websites, feeding the website scorer and AI research stages.
- **Env vars:** `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_CX` (engine id; `GOOGLE_SEARCH_ENGINE_ID` also referenced in code). Both set and active.
- **Quota/plan:** 100 free queries/day tier — discovery runs are throttled by this; heavier usage needs GCP billing enabled on the Custom Search API (paid tier ~$5/1k queries). SerpAPI (`SERPAPI_KEY`) is the coded fallback but is not configured.
- **Support:** GCP console quotas page; Programmable Search control panel manages the `cx` engine (site list, region).
- **Rotation:** rotate `GOOGLE_SEARCH_API_KEY` in GCP → APIs & Services → Credentials (same flow as OAuth client). Monitor daily quota graph; 429s in `dev.log` mean the free tier is exhausted for the day.

### 2.8 Telegram Bot API `[ACTIVE]` (per-user opt-in)

- **Used for:** the Telegram notification channel of `notification-engine.ts` (meeting reminders, lead alerts, digests) + inbound webhook for bot commands.
- **Env vars / storage:** bot token + chat id are stored **per user** in the `TelegramConfig` table (encrypted at rest with `GMAIL_ENCRYPTION_KEY`); the only global env var is `TELEGRAM_WEBHOOK_URL` (not set — webhook mode optional, polling/send-only works without it).
- **Status:** `[ACTIVE]` as a feature; delivery depends on each user connecting their own bot in-app. No platform-level bot credential exists in `.env`.
- **Support:** @BotFather (bot creation/rotation) + Telegram API docs. Rotation: /revoke in BotFather → paste new token into each user's `TelegramConfig` via app settings.
- **Failure impact:** Telegram channel goes silent; all other channels unaffected. API outages degrade gracefully (`TELEGRAM_API_ERROR` codes logged).

### 2.9 Twilio (WhatsApp) `[NOT CONFIGURED]` (global) / per-user in DB

- **Used for:** WhatsApp OTP verification + outbound WhatsApp messages/notifications via `whatsapp-service.ts` (Twilio REST `Accounts/<sid>/Messages.json`; Meta Cloud API also supported as an alternative provider per `WhatsappConfig`).
- **Env vars / storage:** credentials are **per-user DB rows** in `WhatsappConfig` (`twilioAccountSid`, auth token, sender number — encrypted); Twilio webhook signature validation is implemented (inbound status callbacks). No `TWILIO_*` env vars are defined in the current `.env` → globally `[NOT CONFIGURED]`.
- **Failure impact:** WhatsApp channel + OTP-over-WhatsApp unavailable; email/SMS paths unaffected.
- **Support:** Twilio console (trial accounts: sandbox numbers, expiry + message-lock caveats). Rotation: console → Account → API keys/credentials; update per-user configs via app settings.

### 2.10 OpenAI `[OPTIONAL]` and 2.11 Anthropic `[OPTIONAL]`

- **Used for:** AI provider fallback chain in `src/lib/ai/ai-provider.ts` (`ai-provider-fallback.ts` orchestrates retries): `OPENAI_API_KEY` (model default `OPENAI_MODEL` → `gpt-4o`, base `OPENAI_BASE_URL` → `api.openai.com/v1`) and `ANTHROPIC_API_KEY` (default `claude-sonnet-4-20250514`, base `ANTHROPIC_BASE_URL`). **Neither key is set in the current `.env`** — they activate automatically if present.
- **Failure impact:** none while Z-AI is healthy; their absence means no safety net when Z-AI is down (AI features hard-fail).
- **Rotation:** standard provider dashboards; add keys to the secrets panel + consider appending to the `ensure-env.sh` preserve list.

### 2.12 SerpAPI `[OPTIONAL]`

- Discovery search fallback (`SERPAPI_KEY`) when Google Custom Search is missing/exhausted. Not set. Free tier = 100 searches/month. Rotate in serpapi.com dashboard.

### 2.13 Aliyun Function Compute / sandbox host `[ACTIVE]`

- **Used for:** hosting this deployment. Periodically **kills long-running processes and wipes `.env`** (documented repeatedly in worklog; historical internal hostnames `*.fcapp.run` / `*.aliyuncs.com` are explicitly rejected by origin-resolution code).
- **Mitigations:** `keepalive-v2.sh` (health-check based, cron Job 304271 every 5 min), `ensure-env.sh` (rebuilds `.env`), `src/lib/env-safeguard.ts` (restores from `.env.backup`), `instrumentation.ts` (boot-time config logging).
- **Support:** platform panel only; treat as unmanaged. Failure impact: server death → keepalive restart within ~5 min; in-memory state lost; SQLite persists on disk unless the whole sandbox is recycled.

### 2.14 space-z.ai preview platform `[ACTIVE]`

- **Used for:** preview URLs (`https://preview-chat-<id>.space-z.ai` — **changes per session**), the public gateway (Caddyfile: `:81` → `localhost:3000`, websocket/mini-services via `?XTransformPort=`), and the **platform cron scheduler** that fires keepalive (Job 304271), API-key expiry (Job 161223) and the 15-min webDevReview job (Job 370376 current scheduler; older worklog entries logged it as 286616).
- **Production domain:** `https://acquisition.space-z.ai` (same gateway pattern).
- **Failure impact:** preview domain churn breaks registered OAuth redirect URIs until re-registered; scheduler outage silently stops cron-driven automation (SDR cycle, sequences, reminders, renewals) — check via `/api/cron/*` route logs in `dev.log`.

---

## 3. Credential locations & rotation calendar

| Credential | Where it lives today | Rotate | How |
|---|---|---|---|
| `GOOGLE_CLIENT_SECRET` | secrets panel + `ensure-env.sh` + `.env` | **Every 6 months** or on staff change | GCP → Credentials → Reset secret → update both stores |
| Gmail App Password (`SMTP_PASSWORD`) | `ensure-env.sh` + `.env` (preserve list) | **Every 6 months**; immediately if inbox compromise suspected | Google Account → Security → App passwords |
| `GOOGLE_SEARCH_API_KEY` | `ensure-env.sh` + `.env` | **Every 6 months** | GCP → Credentials → API key → Regenerate |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | `ensure-env.sh` template (static values) | **On schedule — currently overdue** (static since inception) | Generate `openssl rand -base64 32`; note: rotation invalidates all sessions |
| `CRON_SECRET` | `ensure-env.sh` + platform cron job config | **Yearly** | New value must be updated in platform Job 304271/161223/370376 headers simultaneously |
| `RESEND_API_KEY` | not set | On adoption | Resend dashboard |
| `STRIPE_SECRET_KEY` / webhook secret | not set | On adoption + yearly | Stripe dashboard |
| `RAZORPAY_KEY_ID/SECRET` | not set | On adoption | Razorpay dashboard |
| Z-AI credentials | platform-managed | platform-managed | Z-AI panel |
| Telegram bot tokens | per-user `TelegramConfig` rows (DB, encrypted) | On user request | @BotFather /revoke |
| Twilio WhatsApp creds | per-user `WhatsappConfig` rows (DB, encrypted) | On user request | Twilio console |

**Rotation procedure (any env var):**
1. Generate new value in the vendor console.
2. Update the platform **secrets panel** entry (exact var name) — this is what injected deployments read.
3. Update `ensure-env.sh` if the var belongs in the base template or preserve list.
4. Let keepalive regenerate `.env` (or run it manually) and verify via `dev.log` `[SMTP-Env-Diag]` / `instrumentation.ts` SET/MISSING lines.
5. Curl `/api/auth/config` (expect `googleAvailable:true, emailConfigured:true`) and run one end-to-end action (e.g. request a magic link) before closing out.

---

## 4. Dependency blast-radius map

```
Google OAuth down ──► Google login ✗, Calendar/Meet ✗, Gmail inbox sync ✗
Gmail SMTP down ────► OTP login ✗, magic links ✗, signup verification ✗, outreach ✗,
                       invoices ✗, reminders(email) ✗     ← WORST single point of failure
Z-AI down ──────────► discovery scoring ✗, outreach generation ✗, assistant ✗,
                       meeting AI ✗  (no fallback keys configured)
Google CSE down ────► new lead discovery ✗ (no SerpAPI key configured)
Stripe absent ──────► upgrades ✗ (fails fast, by design)
Platform cron down ─► autonomous SDR/sequences/reminders/renewals silently stop
Host kill (Aliyun) ─► ~5 min outage via keepalive; sessions lost; DB intact
```

**Practical rule:** when something breaks, check in this order — (1) is the server up (`curl localhost:3000/api/auth/config`), (2) is `.env` intact (grep the var name), (3) does `dev.log` show `[SMTP-Env-Diag]` resolving the right alias, (4) did the vendor quota/credential change (429/535/401 patterns in `dev.log`).

---

## 5. Failure playbooks (per vendor)

### 5.1 "Nobody can log in" (Gmail SMTP / Google OAuth)

- [ ] `curl -s localhost:3000/api/auth/config` → expect `{"googleAvailable":true,"emailConfigured":true}`.
- [ ] `tail -200 dev.log` → look for `[SMTP-Env-Diag]` block: which alias groups are SET/MISSING?
- [ ] If password aliases MISSING: `.env` was wiped → run `bash ensure-env.sh` (preserve list restores secrets), wait for keepalive or restart via `bash keepalive-v2.sh`.
- [ ] If SMTP `535` in dev.log: app password was revoked/rotated → §2.2 rotation procedure.
- [ ] If Google `redirect_uri_mismatch` in browser: current public domain's redirect URI missing in GCP → add `https://<domain>/api/auth/callback/google` (§2.1).
- [ ] Never "fix" this by editing `src/app/api/auth/otp/*` — that subsystem is off-limits (see CODEBASE-OVERVIEW §7).

### 5.2 "AI features return errors" (Z-AI)

- [ ] Check `dev.log` for provider-chain errors from `ai-provider.ts` (`ai-provider-fallback.ts` retries are logged).
- [ ] Confirm Z-AI platform quota/credits in the platform panel — the SDK authenticates the deployment, so failures are usually quota/platform-side.
- [ ] Stopgap: set `OPENAI_API_KEY` (and optionally `ANTHROPIC_API_KEY`) in the secrets panel — the chain picks them up automatically; verify via one AI action + an `AiCostRecord` row.
- [ ] Confirm credits: `/api/ai/costs` and the app-side credit gate (`credit-service.ts`) — insufficient user credits produce 402-class errors before any vendor call.

### 5.3 "Discovery finds nothing" (Google Custom Search)

- [ ] `dev.log` → look for discovery-engine errors; 429 = daily 100-query free tier exhausted (resets midnight PT).
- [ ] Verify `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_CX` still resolve (SET in `.env` after a wipe).
- [ ] Longer term: enable paid CSE quota or configure `SERPAPI_KEY` fallback (coded, currently unset).

### 5.4 "Checkout says Stripe is not configured"

- [ ] Expected behavior while `STRIPE_SECRET_KEY` is absent — the app fails fast loudly **by design** (no mock activation; mock route `/api/payments/confirm` was deleted in 2026-09, replaced by real `create-checkout-session`).
- [ ] Go-live checklist: products/prices → env vars (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*_ID`) → webhook endpoint per domain → test-mode purchase → verify `PaymentOrder` + `Subscription` + `CreditsLedger` rows.

### 5.5 "Server unreachable / app 'changed by itself'"

- [ ] Sandbox killed the process → `bash keepalive-v2.sh`, wait ~25 s, re-curl `:3000`.
- [ ] If symptoms were "state changing every few minutes": historically caused by (a) blind-restart keepalive (fixed 2026-09 — verify the health-check version is still deployed) and (b) source byte-drop corruption — run `python3 scripts/repair-corruption.py`, verify via git diff, see CODEBASE-OVERVIEW §9(a).
- [ ] `.env` missing vars after a crash loop → `ensure-env.sh` + check `PRESERVE_KEYS` list still covers the secret you added.

---

## 6. Env var appendix by vendor (names ONLY — values live in secrets panel / `.env`)

| Vendor | Variables read by the code |
|---|---|
| Google OAuth/Calendar/Gmail | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Gmail SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` (+ `SMTP_USERNAME`, `GMAIL_USER`, `EMAIL_USER`, `EMAIL_USERNAME`, `MAIL_USER`, `MAIL_USERNAME`), `SMTP_PASSWORD` (+ `SMTP_PASS`, `SMTP_AUTH_PASSWORD`, `GMAIL_APP_PASSWORD`, `GMAIL_PASSWORD`, `EMAIL_PASSWORD`, `EMAIL_PASS`, `MAIL_PASSWORD`, `MAIL_PASS`), `SMTP_FROM` (+ `EMAIL_FROM`, `MAIL_FROM`, `MAIL_FROM_ADDRESS`, `FROM_EMAIL`) |
| Resend | `RESEND_API_KEY` |
| Google Custom Search | `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_CX` (+ `GOOGLE_SEARCH_ENGINE_ID` alias), fallback `SERPAPI_KEY` |
| OpenAI fallback | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` |
| Anthropic fallback | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_ID`, `STRIPE_PRICE_PREMIUM_ID`, `STRIPE_PRICE_ELITE_ID`, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| Telegram | per-user DB (`TelegramConfig`, encrypted via `GMAIL_ENCRYPTION_KEY`), global `TELEGRAM_WEBHOOK_URL` |
| Twilio WhatsApp | per-user DB (`WhatsappConfig`: SID/token/sender encrypted), webhook signature validation built-in |
| Sessions | `JWT_SECRET`, `JWT_REFRESH_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` |
| Runtime | `DATABASE_URL`, `APP_URL`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, `GMAIL_ENCRYPTION_KEY` (crypto of stored integration creds), `REDIS_URL` (optional pub/sub) |
| Dev-mode flags (all `false`, must stay `false`) | `AUTH_DEV_MODE`, `AUTH_AUTO_VERIFY`, `AUTH_DEV_OTP_IN_RESPONSE`, `AUTH_DEV_OTP_IN_LOG`, `AUTH_BYPASS_EMAIL` |
| Feature toggles | `ENABLE_GOOGLE_OAUTH`, `ENABLE_MAGIC_LINK`, `ENABLE_OTP_LOGIN` |

> `.env` currently present vars (verified 2026-09): `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`, `APP_URL`, `CRON_SECRET`, `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_CX`, the 5 `AUTH_*` flags, the 3 `ENABLE_*` flags, plus a duplicate `SMTP_PASSWORD` line (harmless; last-wins). Everything else in the table above is unset.

---

## 7. Vendor-related history worth knowing (from worklog.md)

| Incident | Outcome / lesson |
|---|---|
| OAuth `redirect_uri_mismatch` on preview + prod (multi-session saga) | Fixed with dynamic origin resolution + state-JSON origin preference; every new domain still needs GCP registration. |
| `.env` wiped / placeholder credentials repeatedly | Root-caused to sandbox wipes → `ensure-env.sh` + `env-safeguard.ts` + preserve list now restore secrets automatically. |
| `env-safeguard.ts` flagged real `GOCSPX-` secrets as placeholders | Fixed; `isRealGoogleConfigured()` in `email-ethereal.ts` is the authoritative check. |
| Magic links pointed to `localhost:3000` | Fixed 2026-09 (APP_URL validation rejects internal hosts; verify route prefers `APP_URL`). Related: `getAppUrl()` NODE_ENV gating bug on FC cold starts (earlier session). |
| "Google sign-in unavailable" | Was a runtime env-detection gate; now `/api/auth/config` hard-reports availability and credentials are validated at token exchange. |
| Gmail SMTP AUTH verified (`250 OK` deliveries) | Consumer Gmail + App Password is the working transport; Resend reserved for volume. |
| Mock Stripe activation deleted (2026-09) | Checkout now fails fast without keys — no silent fake payments; real alias route `create-checkout-session` created. |
| Blind-restart keepalive disrupted sessions every 5 min | Rewritten health-check based (Job 304271); do not regress. |
| Twilio/Telegram creds never in `.env` | By design per-user DB rows — onboarding happens in-app, not via deployment config. |

---

## 8. Support channels & escalation summary

| Vendor | Self-service support | Paid support | Escalation path for this app |
|---|---|---|---|
| Google Cloud | Docs, community forums, status dashboard (status.cloud.google.com) | GCP Support plans (paid) | Free tier: debug from `dev.log` + console logs; escalate only with a support plan |
| Gmail (consumer) | No support | — | Treat as unmanaged; keep Resend ready as transport backup |
| Resend | Dashboard docs, email support | On paid plans | Not adopted yet |
| Z-AI | Platform panel + docs (`docs/03-setup-and-deployment/DEPLOYMENT-GLM.md`) | Platform-managed | Panel tickets; SDK issues → fallback keys stopgap |
| Stripe | Dashboard chat, extensive docs | Included with account | Test-mode reproduction + webhook event logs before contacting |
| Razorpay | Dashboard tickets, docs | Account-manager on higher plans | KYC issues are the usual blocker — keep entity docs ready |
| Telegram | Bot docs only | — | Regenerate token via @BotFather and update `TelegramConfig` |
| Twilio | Console help center | Support plans | Check per-user config in-app first (creds are DB-stored) |
| OpenAI / Anthropic | Dashboards + docs | Plans available | Not adopted; stopgap providers only |
| SerpAPI | Dashboard + docs | Plans available | Not adopted; fallback only |
| Aliyun / sandbox host | Platform panel only | — | Treat as unmanaged: keepalive is the only real mitigation |
| space-z.ai platform | Platform panel | — | Scheduler/gateway issues → verify cron jobs + Caddyfile passthrough |

---

## 9. Monitoring probes & service-level expectations

Add these to whatever monitoring the incoming owner adopts (or run by hand weekly):

| Probe | Command / location | Healthy signal |
|---|---|---|
| App + auth config | `curl -s localhost:3000/api/auth/config` | `{"googleAvailable":true,"emailConfigured":true}` |
| Email transport | request a magic link; grep `dev.log` for `250 OK` / provider name | SMTP (or Resend) accepted the message |
| Google Calendar | connect a test user → `POST /api/calendar/availability` | free/busy JSON returned |
| Google Meet links | schedule a test meeting | `hangoutLink` present on the Meeting row |
| AI chain | run one lead analysis; check `AiCostRecord` rows (`/api/ai/costs`) | new row with model + tokens |
| Discovery search | one small discovery run | `DiscoveryJob` completes; leads created |
| Stripe (when live) | Stripe dashboard → Webhooks → endpoint logs | `200` responses, no signature failures |
| Razorpay (when live) | dashboard → webhook logs | verified signature events |
| Telegram | in-app "send test" from user settings | message lands in the user's chat |
| Cron automation | `dev.log` shows periodic `/api/cron/*` hits | regular 200s from platform scheduler |
| Keepalive | cron Job 304271 output | "✅ Server healthy … no action taken" on healthy ticks |
| DB health | `/api/health` | `{"status":"healthy"}` |

**Expectation setting:** consumer Gmail SMTP, the 100/day Custom Search tier, and the single-node SQLite deployment are all fine for pilot scale and all three become ceilings near production scale — the 60/90-day plan in `HANDOVER-CHECKLIST.md` §9 sequences the fixes (Resend adoption → paid CSE → ADR-012 PostgreSQL).

---

## 10. Runbook: adding a new vendor/integration

1. [ ] Write the service module in `src/lib/<vendor>-service.ts` following the existing singleton + `[VendorService]` log-prefix pattern (see `razorpay-service.ts` / `telegram-service.ts`).
2. [ ] Read credentials via `process.env.<VENDOR_VAR>` with a placeholder check (`isPlaceholderValue`-style) — never log values.
3. [ ] Add the var name to: `ensure-env.sh` `PRESERVE_KEYS` (so env wipes keep it), `docs/04-secrets-and-configuration/ALL-SECRETS.md`, and the appendix table in §6 above.
4. [ ] Store per-user secrets in the appropriate config table with `GMAIL_ENCRYPTION_KEY` encryption (Telegram/Twilio pattern) rather than global env where multi-tenant.
5. [ ] Add a failure mode: degrade gracefully, log a `[PREFIX]` error, and surface channel status in user-facing settings (the notification-engine pattern).
6. [ ] Register any webhooks per public domain and validate signatures (Stripe `constructEvent` / Twilio signature patterns are in-repo references).
7. [ ] Update `VENDOR-CONTACTS.md` §1 summary table + rotation calendar §3, and add the probe to §9.
8. [ ] Update this file's blast-radius map (§4) with the new dependency edge.
