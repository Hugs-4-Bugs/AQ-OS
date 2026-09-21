# AcquisitionOS — Codebase Overview (KT)

> **Audience:** a developer joining this project with zero context.
> **Last updated: 2026-09-09**
> **Verified against:** README.md, docs/README.md, docs/02-architecture/SYSTEM-ARCHITECTURE.md, worklog.md (6,055 lines), package.json, prisma/schema.prisma, src/lib/*, Caddyfile, ensure-env.sh, keepalive-v2.sh, .env (names only).

---

## 1. What the product is

**AcquisitionOS** (package name is still `vantage` — a leftover from the previous product iteration; the README.md also still describes the older "Vantage" feature set, treat it as partially stale) is an **AI-powered B2B client-acquisition SaaS**. It runs the whole acquisition lifecycle in one Next.js app: **lead discovery** (Google Custom Search API → website scraping/scoring with Cheerio heuristics → Z-AI company research and 4-factor predictive scoring), **AI outreach** (LLM-generated personalized messages sent over Email/WhatsApp/LinkedIn/Instagram, with sequences, open/click/reply tracking and Gmail inbox sync for replies), a **visual pipeline/deals** board with AI proposal generation, **meetings** (Google Calendar OAuth, free/busy availability checks, autonomous slot proposals with human approval, Google Meet links via `conferenceData`, reminders and post-meeting AI notes), an **inbox** (Gmail OAuth + Pub/Sub sync), **workflow automation** (trigger/step/action engine), **competitor intelligence**, and **billing** (Stripe + Razorpay, a credits system metered per AI action, and Free/Pro/Elite plans). Everything is served by ~485+ API route files under `src/app/api` with the real business logic in ~200 service modules under `src/lib`, backed by Prisma 6 over a local SQLite file (`db/custom.db`).

---

## 2. Where to start (reading order)

| # | Document / file | Why |
|---|---|---|
| 1 | `README.md` | Product intent + feature list. **Caveat:** describes the older "Vantage" iteration (Supabase/Vercel messaging) — architecture section is outdated, features are directionally right. |
| 2 | `docs/README.md` | Index of the 10-folder documentation suite; the docs there were generated from the actual source and are trustworthy. |
| 3 | `docs/02-architecture/SYSTEM-ARCHITECTURE.md` | The single best technical map: auth flows, SMTP chain, Google OAuth, Stripe flow, discovery pipeline, meeting orchestration, AI provider chain, notification fan-out. |
| 4 | `docs/kt/CODEBASE-OVERVIEW.md` | This file — sandbox-specific reality, quirks, pitfalls. |
| 5 | `worklog.md` | 6,000+ lines of session-by-session engineering history. **Read the last ~400 lines first** — they cover the 18-fix batch, the 7-fix batch, and the source-corruption repair session (all dated 2026-09). Grep for `Task ID:` to navigate. |
| 6 | `docs/04-secrets-and-configuration/ALL-SECRETS.md` | Every env var, where to get it, required/optional. |

---

## 3. How the code is organized

```
/home/z/my-project
├── src/
│   ├── app/                     # Next.js 16 App Router
│   │   ├── api/                 # ~485 API route files (489 route.ts at last count)
│   │   │   ├── auth/            # signup, signin, otp/, magic-link/, google/, callback/, 2fa
│   │   │   ├── leads/           # CRUD, [id]/analyze, communications, outreach
│   │   │   ├── discovery/       # POST /api/discovery/start → DiscoveryJob
│   │   │   ├── meetings/        # scheduling, detect-intent, suggest-slots, ai-book
│   │   │   ├── calendar/        # connect/disconnect/availability/events (Google)
│   │   │   ├── payments/        # stripe + razorpay checkout, webhooks, verify
│   │   │   ├── gmail/           # OAuth, sync, threads, replies
│   │   │   ├── workflows/       # definition/execution engine endpoints
│   │   │   ├── cron/            # 12 cron endpoints (see §8)
│   │   │   └── ...
│   │   ├── page.tsx             # 'use client' AuthGate → the whole dashboard SPA
│   │   ├── auth/signin|signup/  # auth pages (auth-pages-v2.tsx)
│   │   ├── dashboard/billing|calendar|feedback|meetings/
│   │   ├── admin/feedback/      # admin moderation UI
│   │   ├── api-docs/page.tsx    # public API docs page (~410 lines)
│   │   └── (marketing)|(public)/# privacy/terms/legal
│   ├── components/
│   │   ├── ui/                  # shadcn/ui primitives (40+)
│   │   ├── dashboard/           # ~181 feature components (tabs, panels, dialogs)
│   │   ├── meetings/            # meeting UI components
│   │   ├── feedback/            # feedback widget + crash reporter
│   │   └── providers.tsx        # theme + TanStack Query providers
│   ├── hooks/                   # use-mobile, use-toast, use-keyboard-shortcuts, use-payment…
│   ├── lib/                     # ~200 libs — the real business logic (168 top-level .ts files)
│   └── proxy.ts                 # Next 16 proxy (replaces middleware.ts — see §7)
├── prisma/schema.prisma         # 2,831 lines, 104 models, [MIGRATE-SAFE] annotations
├── db/custom.db                 # SQLite file DB (per-deployment!)
├── scripts/                     # ops + self-heal scripts (see §9)
├── mini-services/               # independent Bun services: email-service, proxy,
│                                # realtime-service, server-watchdog, ws-service
├── docs/                        # 10-folder documentation suite + kt/ (this file)
├── Caddyfile                    # gateway: :81 → localhost:3000 (or XTransformPort override)
├── ensure-env.sh                # regenerates .env (sandbox wipes it) — source of truth
├── keepalive-v2.sh              # health-check-based server keepalive (v3 logic inside)
├── worklog.md                   # engineering history — read recent entries
└── dev.log                      # live dev-server log — tail this for errors
```

### Key `src/lib` modules (name the ones you'll actually touch)

| Module | Role |
|---|---|
| `auth.ts` | Custom JWT sessions (NOT next-auth runtime). Access + refresh secrets, httpOnly cookies, TOTP/MFA verification, session rows in `UserSession`. |
| `auth-middleware.ts` | `withAuth(request, async (user) => …)`, `withDualAuth` (session **or** API key), `withPermission`, `withAdmin`, `withBillingRead/Write`. Wrap every route handler with these. |
| `db.ts` | Prisma client singleton. Import `{ db }` from here everywhere; never instantiate PrismaClient elsewhere. |
| `email.ts` | Email orchestration: Resend tier → SMTP tier; supports cc/bcc/replyTo (added 2026-09). |
| `email-ethereal.ts` | **Alias helpers** (`getSmtpUser()`/`getSmtpPassword()` reading `SMTP_PASSWORD \|\| SMTP_PASS \|\| GMAIL_APP_PASSWORD \| …`), placeholder detection, `[SMTP-Env-Diag]` logging. The historical `SMTP_PASS` vs `SMTP_PASSWORD` mismatch is fixed HERE — use these helpers, never raw `process.env`. |
| `meeting-orchestration-service.ts` | Live meetings engine: availability check (`isTimeSlotAvailable` → Google freeBusy), Meet link creation via platform adapter, 409 mapping for busy slots. Imports from `@/lib/meeting/` (see duplication note below). |
| `google-oauth.ts` | Calendar/Gmail OAuth variants, token storage/refresh (`GoogleCalendarToken`). |
| `api-key-service.ts` | Hashed API keys, per-plan rate limits (free 50 / pro 500 / elite 2000 per hour), scope gating, monthly lead quotas. |
| `credit-service.ts` | `deductCredits` / `addCredits` / `checkCreditSufficiency` — credits enforced BEFORE AI calls. |
| `credit-costs.ts` | Cost table per AI action (lead analysis, outreach generation, etc.). |
| `payment-service.ts` | Stripe + Razorpay checkout, `confirmPaymentAndActivate` transaction (Subscription + User.plan + CreditsLedger + Invoice). |
| `ai/ai-provider.ts` | Z-AI SDK default → OpenAI-compatible fallback (`OPENAI_API_KEY`) → Anthropic fallback (`ANTHROPIC_API_KEY`). Every call metered to `AiCostRecord`. |
| `app-url.ts` | `getAppUrl()` — **the** way to build public URLs. Never hardcode localhost or a preview host. |
| `notification-engine.ts` | Fans events out to in-app/email/Telegram/WhatsApp/push honoring `NotificationPreferences`. |
| `telegram-service.ts` | Bot API notifications; bot token lives encrypted per-user in `TelegramConfig` (DB), webhook via `TELEGRAM_WEBHOOK_URL`. |

### ⚠️ Known duplication: `lib/meeting` vs `lib/meetings` (tech debt — document honestly)

Two **parallel folder trees** exist and both are live:

| Tree | Contents | Used by |
|---|---|---|
| `src/lib/meeting/` (6 files) | autonomy-engine, crm-sync, meeting-email, meeting-reminders, meeting-service, platform-adapter | **`lib/meeting-orchestration-service.ts`** (top-level, the engine actually invoked by `POST /api/meetings`), `api/meetings/{approve,reminders,pending-approvals}`, `ai/chat-service.ts` |
| `src/lib/meetings/` (8 files) | same files **plus** calendar-intelligence, meeting-assistant, meeting-orchestration-service | `gmail-reply-processor`, `lead-discovery/reply-handler`, `api/cron/meeting-reminders`, `api/meetings/[id]/{agenda,status,prep,follow-up,…}`, `api/dashboard/meetings`, `api/calendar/events/[id]`, `api/settings/*` |

Similarly `lib/calendar/` holds both `calendar-service.ts` and `calendar-intelligence.ts`, and `meetings/calendar-intelligence.ts` duplicates the latter. **Do not "clean this up" casually** — both trees have live callers; dedup is a tracked tech-debt item (see HANDOVER-CHECKLIST.md). When adding meeting features, check which tree the calling route already imports.

---

## 4. Key files to understand first (top 15)

| # | File | Why it matters |
|---|---|---|
| 1 | `src/lib/auth.ts` | Every request's identity: JWT sign/verify, refresh rotation, cookie names, TOTP. Break this and nothing logs in. |
| 2 | `src/lib/auth-middleware.ts` | The `withAuth` / `withDualAuth` wrappers you'll copy for any new route. |
| 3 | `src/lib/db.ts` | Prisma singleton — the only sanctioned DB entrypoint. |
| 4 | `prisma/schema.prisma` | 2,831 lines, 104 models. Read the header ([MIGRATE-SAFE] tags) before touching. |
| 5 | `src/lib/app-url.ts` | Origin resolution (headers → env → production fallback). Root cause of ~3 historical outage classes. |
| 6 | `src/lib/email-ethereal.ts` | SMTP/Resend config detection + alias helpers + startup diagnostics. |
| 7 | `src/lib/meeting-orchestration-service.ts` | Meetings engine: freeBusy availability, Meet links, 409 busy-slot mapping. |
| 8 | `src/lib/ai/ai-provider.ts` | The Z-AI → OpenAI → Anthropic provider chain all AI features flow through. |
| 9 | `src/lib/credit-service.ts` + `credit-costs.ts` | How every AI action is metered and gated. |
| 10 | `src/lib/stripe-service.ts` | Checkout session creation, webhook verification, `isStripeConfigured()` (currently false). |
| 11 | `src/app/api/auth/config/route.ts` | Capability flags the login page renders (`googleAvailable`, `emailConfigured`). First thing to curl when auth "looks broken". |
| 12 | `src/app/api/auth/otp/**` | **FRAGILE, WORKING — DO NOT MODIFY** (see §7). |
| 13 | `src/app/api/auth/callback/google/route.ts` | OAuth callback with dynamic-origin + state-based redirect logic; backfill/reactivate of legacy users (2026-09 fix). |
| 14 | `ensure-env.sh` + `keepalive-v2.sh` | How the sandbox keeps `.env` and the server alive. Read before debugging "disappeared" config. |
| 15 | `worklog.md` (last 400 lines) | What was just changed and why — prevents redoing or reverting recent fixes. |

---

## 5. Patterns used throughout

**Route handlers.** Every API route exports `GET`/`POST`/`PATCH`/`DELETE` and wraps its body:

```ts
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/api-error-handler'; // observability wrapper

export const POST = withApiLogging(async (request: Request) =>
  withAuth(request, async (user) => {
    // ... use `user.id`; return NextResponse.json(...)
  })
);
```

- `withDualAuth` accepts a valid session **or** an `Authorization: Bearer <api-key>` (hashed `ApiKey` rows, per-plan rate limits/scopes). Use it for endpoints meant for external API consumers.
- Always return `NextResponse.json(...)` — never plain `Response.json` conventions from other frameworks.
- **Client fetches use relative paths only** (`fetch('/api/leads')`) — the gateway/Caddy terminates TLS and proxies to port 3000; absolute URLs break preview/production portability.
- Cron routes (`/api/cron/*`) are protected by a `CRON_SECRET` bearer check — never leave one unwrapped.

**Client state.** Zustand store in `src/lib/store.ts` (global UI state: activeTab, notifications, sidebar) + TanStack Query for all server state (polling patterns are common — e.g. notification-center 30s poll). Toasts: **sonner** (`toast.success/error`) — not the old `use-toast`.

**AI calls.** Server-side only: `import { ZAI } from 'z-ai-web-dev-sdk'` (see `src/lib/ai/*`). Never import Z-AI in a client component. Credits are checked via `credit-service`/`credit-costs.ts` **before** generating; costs recorded to `AiCostRecord`.

**URLs.** `getAppUrl()` from `src/lib/app-url.ts` for any public URL (magic links, OAuth redirects, webhooks). It resolves headers → `APP_URL` env → production fallback and rejects internal hosts (localhost, RFC1918, `*.fcapp.run`, `*.aliyuncs.com`). **NEVER hardcode `localhost` or a specific preview host** — preview URLs change every sandbox session.

**Logging.** `[PREFIX-Tag]`-style console logs survive in `dev.log`; `[SMTP-Env-Diag]` prints SET/MISSING per alias (never values).

---

## 6. Environment & runtime

| Fact | Detail |
|---|---|
| `.env` | **Auto-generated by `ensure-env.sh`** — the sandbox wipes `.env` periodically; the script rebuilds it (preserving `SMTP_PASSWORD`, `SMTP_PASS`, `GMAIL_APP_PASSWORD`, `RESEND_API_KEY`, `STRIPE_*` if present). Treat `ensure-env.sh` as the source of truth for base vars. |
| `APP_URL` / `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` | Must be the **public** preview or production URL. Wrong values caused the magic-link/localhost bug class (fixed 2026-09 with host validation + fallback, but keep them correct). |
| Dev server | **Auto-runs on port 3000.** Never run `bun run build` (OOM-kills the sandbox) and never start `bun run dev` manually — the keepalive watchdog owns the process. |
| `dev.log` | The dev server pipes output here (`next dev … | tee dev.log`). **Tail it first** for any error diagnosis. |
| Database | SQLite at `db/custom.db` via `DATABASE_URL=file:…`. Per-deployment — sessions/tokens do NOT cross deployments. |
| Gateway | `Caddyfile`: port 81 → `localhost:3000` (default) or `localhost:{XTransformPort}` when the query param is present. WebSockets pass through `/?XTransformPort=`. |
| Production | `https://acquisition.space-z.ai`; sandbox previews are `https://preview-chat-<id>.space-z.ai` (changes per session). |

---

## 7. What NOT to touch

| Target | Rule |
|---|---|
| `src/app/api/auth/otp/*` | **OTP login is fragile and working. Do not modify** — multiple sessions have broken it by "improving" it. Recent worklogs explicitly end with "Did NOT touch the OTP flow" as a success criterion. |
| `prisma/schema.prisma` | No changes without DBA review. SQLite + `[MIGRATE-SAFE]` tags mark what is safe for the planned PostgreSQL migration; a careless edit can make the migration impossible. `bun run db:push` only. |
| `src/middleware.ts.disabled` vs `src/proxy.ts` | Next 16 **requires `proxy.ts`**; both present simultaneously is a fatal boot error (`Both middleware file and proxy file detected`). `middleware.ts` is disabled **on purpose**; the keepalive script re-disables it if it reappears. |
| `keepalive-v2.sh` / `ensure-env.sh` | Sandbox server lifecycle. The 2026-09 rewrite made keepalive health-check-based (it exits 0 and does nothing when healthy). An earlier version blindly `pkill -9`'d the server every 5 minutes causing "changes every 3 minutes" reports — do not reintroduce that. |
| `dev.log` | Runtime log, regenerated by the server. Never commit; never rely on it as state. |
| `feature-flags.ts` | All five functions hard-return `false` (dev-mode/OTP-bypass removal, task REAL-AUTH-20260618). Do not re-enable simulation paths. |

---

## 8. Cron & scheduled work

System crontab is **not available** in this sandbox (`crontab: command not found`). Scheduled jobs are **platform scheduler jobs** (HTTP pings) hitting `/api/cron/*` routes, authenticated with `Authorization: Bearer $CRON_SECRET`:

| Job | Route / script | Cadence |
|---|---|---|
| Keepalive (Job 304271) | `keepalive-v2.sh` (health-check based) | every 5 min |
| API key expiration (Job 161223) | `/api/cron/expire-api-keys` (+ standalone `cron-expire-api-keys.ts` fallback) | hourly |
| webDevReview (15-min review loop) | platform review job (Job 370376 current scheduler; logged as 286616 in older worklog entries) | 15 min |
| Autonomous outreach | `/api/cron/autonomous-outreach` | scheduled |
| SDR cycle / hot-lead scan | `/api/cron/sdr-cycle`, `/api/cron/hot-lead-scan` | scheduled |
| Sequences | `/api/cron/process-sequences`, `/api/cron/sequence-processing` | scheduled |
| Gmail replies | `/api/cron/process-gmail-replies` | scheduled |
| Meeting reminders | `/api/cron/meeting-reminders` | scheduled |
| Billing | `/api/cron/payment-reconciliation`, `/api/cron/renew-subscriptions`, `/api/cron/credit-renewal`, `/api/cron/end-of-period` | scheduled |

---

## 9. Known quirks & pitfalls (read this twice)

**(a) Random byte-drop source corruption in this sandbox.** Files have occasionally been served/committed with byte-pairs dropped — e.g. `const [meetingSettings` became `const eetingSettings`, `const [modalOpen` → `const odalOpen`, `const [messages` → `const essages`. If `tsc`/`next` suddenly reports **impossible** syntax errors: (1) re-read the file, (2) `git diff`/`git show HEAD:<path>` to compare, (3) repair manually or run `python3 scripts/repair-corruption.py` (idempotent), (4) round-trip verify (copy to /tmp and grep). Targeted self-heal scripts exist: `scripts/rebuild-from-snapshot.py`, `scripts/fix-settings-shell.py`, `scripts/fix-fabs-modal.py`.

**(b) Orphaned / dead components.** Check imports before editing anything in `src/components/dashboard/`:
- `email-compose-dialog.tsx` — a mock, imported by nothing.
- `schedule-meeting-dialog.tsx` and `meeting-settings-dialog.tsx` — imported only by `meeting-scheduler-calendar.tsx` and `meeting-orchestration-panel.tsx`, which are themselves orphaned (imported nowhere). Note: a *different*, live settings UI (`settings-shell.tsx` Meeting Preferences card) is the real one.
- `floating-feedback-button.tsx` — orphaned; the real rendered feedback button lives in `feedback-provider.tsx`.

**(c) Duplicate implementations.** `lib/meeting` vs `lib/meetings` (§3) and `calendar-service` vs `calendar-intelligence` (both in `lib/calendar/` and mirrored in `lib/meetings/`). Both sides have live callers — grep before assuming which is canonical.

**(d) Preview URL changes per sandbox session.** `preview-chat-<id>.space-z.ai` is ephemeral. All URLs must come from `getAppUrl()`/headers. Each new preview domain needs its `/api/auth/callback/google` redirect URI registered in Google Cloud Console or OAuth fails with `redirect_uri_mismatch`.

**(e) SQLite is per-deployment.** `db/custom.db` does not migrate between sandbox sessions or deployments: users, sessions, refresh tokens, OAuth tokens, API keys created in one deployment do not exist in the next. Test users must be recreated.

**(f) `SMTP_PASS` vs `SMTP_PASSWORD`.** `notification-engine.ts` historically checked `SMTP_PASS` while `.env` defines `SMTP_PASSWORD` → email channel silently disabled. The fix is the alias helpers in `email-ethereal.ts` (`getSmtpPassword()` reads `SMTP_PASSWORD || SMTP_PASS || GMAIL_APP_PASSWORD || …`). Rule: **never read SMTP env vars directly**; use the helpers, and call `logSmtpEnvAliases()` when debugging delivery.

**(g) README.md is stale.** It describes "Vantage" v0.2 with Supabase/Vercel deployment. The `docs/` suite reflects the current AcquisitionOS reality (SQLite, GLM sandbox, space-z.ai hosting). Prefer docs/ + worklog over README when they conflict.

**(h) The sandbox kills processes.** Expect 1–3 dev-server kills per working session (observed repeatedly in worklog). keepalive restores it; if HTTP on :3000 is dead, run `bash keepalive-v2.sh` manually and wait ~25s.

**(i) Pre-existing lint/tsc errors.** `crypto.ts`, `db-pool.ts` and a handful of files carry known pre-existing errors. New errors in *unrelated* files are not yours — but verify it's the known list, not corruption (see (a)).

---

## 10. Verification workflow

```bash
# Lint (touched files only — repo has pre-existing errors elsewhere)
bun run lint                     # or: bunx eslint src/path/to/file.ts

# Types (incremental tsbuildinfo can go stale — touch the file and re-run
#  if results look like they predate your edit)
bunx tsc --noEmit --skipLibCheck

# UI checks (login flows, dialogs, FABs) — headless browser
#   use the agent-browser skill: navigate, snapshot, click, assert

# Server liveness + auth capability (the two fastest health probes)
curl -s http://localhost:3000/api/auth/config
#   → {"googleAvailable":true,"emailConfigured:true"} expected
tail -50 dev.log
```

Never run `bun run build` (sandbox OOM) and never restart the server manually while keepalive is healthy — it owns the lifecycle.

---

## 11. Deployment topology

```
Browser
  └─► https://preview-chat-<id>.space-z.ai  (sandbox)   /  https://acquisition.space-z.ai (prod)
        └─► space-z.ai gateway / Caddy (:81)
              ├─ default        → reverse_proxy localhost:3000   (Next.js dev server)
              └─ ?XTransformPort=N → reverse_proxy localhost:N   (mini-services, websockets)
```

- One port is exposed; everything else multiplexes through the `XTransformPort` query mechanism.
- `src/instrumentation.ts` runs on boot: env validation, `[SMTP-Env-Diag]`, auth-provider availability logging (SET/MISSING only).
- OAuth redirect URIs must be registered per public domain in Google Cloud Console (client `22873135381-*.apps.googleusercontent.com`).
- Production deployment target: `https://acquisition.space-z.ai`; a PostgreSQL migration is planned before scale (ADR-012, `scripts/migrate-to-postgresql.sh`).

---

## 12. Quick reference card

| I need to… | Do this |
|---|---|
| Add an API route | `src/app/api/<domain>/<name>/route.ts`, wrap `withAuth` (+`withApiLogging`), return `NextResponse.json` |
| Add a feature flag/env var | Add to `ensure-env.sh` template **and** `docs/04-secrets-and-configuration/ALL-SECRETS.md`; read via a helper if it has aliases |
| Make an AI call | `src/lib/ai/ai-provider.ts` → `generate()`; check credits first (`credit-service`) |
| Send email | `src/lib/email.ts` `sendEmail()` (Resend → SMTP chain); cc/bcc/replyTo supported |
| Build a public URL | `getAppUrl()` from `app-url.ts` — never hardcode |
| Debug "email not configured" | `tail dev.log` → look for `[SMTP-Env-Diag]` lines (SET/MISSING per alias) |
| Debug "changes every few minutes" | Verify keepalive is the health-check version; check for source corruption (§9a) |
| Find anything auth-related but fragile | Stop. Re-read §7. Then `worklog.md` grep `Task ID:` for the subsystem |
| Check which meeting lib a route uses | `grep -rn "lib/meeting" src/app/api/<route>` BEFORE importing — see §3 duplication warning |

---

## 13. Data model cheat sheet (the 10 models you'll touch weekly)

Full field-level reference: `docs/02-architecture/DATABASE-SCHEMA.md` (all 104 models). The daily drivers:

| Model | Notes |
|---|---|
| `User` | plan/role/isTrial/trialEndsAt, `loginOtp*` columns (hashed OTP + lockout), credits balance, `consecutivePaymentFailures`. |
| `UserSession` | One row per login (refresh token hash, device, IP) — sessions are listable/revocable at `/api/auth/sessions`. |
| `Lead` + `LeadAnalysis` (1:1) | Scores (reply/conversion/urgency/revenuePotential) + `scoreReasoning` + digital weaknesses. |
| `DiscoveryJob` | One discovery run (niche, location, maxResults, status). |
| `Communication` | Every outbound/inbound touch; the Outreach tab's send path lives in `api/leads/[id]/communications`. |
| `OutreachMessage` + `SequenceEnrollment` | Sequences engine state; processed by `/api/cron/process-sequences`. |
| `Meeting` + `MeetingIntentLog` + `MeetingReminder` | proposed → approved → confirmed → completed; intent detection from reply text. |
| `GoogleCalendarToken` / `CalendarWatch` | Per-user Google OAuth tokens for Calendar/Gmail; the source of truth for `googleCalendarConnected`. |
| `Subscription` → `PaymentOrder` → `Invoice` (+ `PaymentWebhook`) | Billing spine; `PaymentOrder.idempotencyKey @unique`, `PaymentWebhook.eventId @unique` (replay-safe). |
| `CreditsLedger` / `AiCostRecord` | Every credit grant/deduction and every AI token spend — the two audit tables for "where did credits go". |

---

## 14. Mini-services & realtime

`mini-services/` holds **independent Bun services** — separate processes, reached through the gateway's `?XTransformPort=` mechanism, not part of the Next build:

| Service | Role |
|---|---|
| `realtime-service/` | WebSocket fan-out for live dashboard updates |
| `ws-service/` | Raw WS endpoint support |
| `email-service/` | Isolated email processing |
| `proxy/` | Auxiliary proxying |
| `server-watchdog/` | Process watchdog (complements keepalive-v2.sh) |

Inside the Next process, realtime is served by `/api/ws` + SSE streams (`/api/events/{notifications,payments,workflows,messages,ai}`), fanned out by `realtime-event-bus.ts` (optional Redis pub/sub via `REDIS_URL`). OTel instrumentation hooks exist in `instrumentation.ts` (exporters configured but endpoints are environment-dependent).

---

## 15. API surface at a glance (~485 route files; full inventory in `docs/06-api-reference/API-ROUTES.md`)

| Group | Representative routes |
|---|---|
| auth | `signup`, `signin`, `otp/*`, `magic-link/*`, `google/*`, `callback/google`, `refresh`, `sessions`, `2fa/*`, `config` |
| leads/discovery | `leads/*` (CRUD, analyze, communications, outreach), `discovery/start` |
| outreach/sequences | `outreach/*`, `sequences/*`, `email-tracking/*` (open/click pixels) |
| meetings/calendar | `meetings/*` (schedule, detect-intent, suggest-slots, ai-book, `[id]/{status,agenda,prep,follow-up}`), `calendar/{connect,disconnect,availability,events}` |
| gmail | `gmail/*` (oauth, sync, threads, replies) |
| payments | `payments/{create-stripe-session, create-checkout-session, webhook/stripe, verify-session, razorpay/*}` |
| ai | `ai/{chat, costs, usage}` + `sales-assistant` |
| workflows | `workflows/*` (definitions, executions, logs) |
| admin/settings | `admin/*`, `settings/*` (api-keys, meeting-provider, autonomy-mode) |
| system | `cron/*` (12 endpoints), `health`, `events/*`, `ws` |

Rate limits for API-key consumers are per-plan (free 50 / pro 500 / elite 2000 req/hour) enforced in `api-key-service.ts` + `api-key-middleware.ts`; monthly lead quotas likewise (50/500/2000).
