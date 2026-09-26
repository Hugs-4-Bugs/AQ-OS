# AcquisitionOS — Complete Zero-to-Local Development Setup

> **Audience:** a developer receiving a brand-new Apple Mac (nothing installed) who must get AcquisitionOS running locally, end-to-end.
>
> **Verification basis:** every command, path, version and variable in this document was inspected in the actual repository on 2026-09-22 (HEAD `30624fe`, branch `main`). Items verified from the codebase are marked **VERIFIED**; items that depend on external accounts are marked **EXTERNAL REQUIREMENT**.
>
> **Security:** this document contains **no real credentials**. Where a value must come from an external account, the exact source is named. See `ENVIRONMENT-VARIABLES.md` for the full inventory.

---

## 1. What AcquisitionOS Actually Is (verified)

AcquisitionOS (package name `vantage`, version 0.2.0) is a **single Next.js 16 full-stack application** — frontend and backend are the same project and the same process. There is **no separate backend server to start**.

| Fact | Value | Verified from |
|---|---|---|
| Framework | Next.js **16.1.3** (App Router) | `package.json`, `src/app/layout.tsx` |
| React | **19.2.3** | `package.json` / lockfile |
| TypeScript | **5.9.3** (strict, `noImplicitAny: false`) | `tsconfig.json` |
| UI | Tailwind CSS **4.1.18** + shadcn/ui (new-york) + 27 Radix packages | `globals.css`, `components.json` |
| Backend API | **507 Next.js Route Handlers** under `src/app/api/` | file count |
| Database | **SQLite** file `db/custom.db` via Prisma **6.19.2** (105 models) | `prisma/schema.prisma` line `provider = "sqlite"` |
| Redis | **Not required** — optional pub/sub only | `src/lib/redis-pubsub-service.ts` |
| AI | Built-in Z-AI SDK (no key needed) + optional OpenAI/Anthropic/OpenRouter/local fallbacks | `src/lib/ai/ai-provider.ts` |
| Auth | Custom JWT stack (jsonwebtoken + jose), OTP email, magic link, Google OAuth, TOTP MFA | `src/lib/auth.ts` |
| Realtime | SSE (`/api/events/*`) built-in; optional Socket.IO sidecar on port 3003 | `src/hooks/use-websocket.ts` |
| Ports | App **3000**; optional realtime sidecar **3003** | `package.json`, `Makefile` |

**What you do NOT need locally:** PostgreSQL, Redis, Docker, the Python `backend/` FastAPI service, Celery, or any mini-service. The app runs with Node.js + a SQLite file alone.

---

## 2. Required Software (brand-new Mac)

| Software | Version | Why | Install method |
|---|---|---|---|
| macOS | 13 Ventura or newer | Node 20 requirement | — |
| Xcode Command Line Tools | latest | Git + compilers | `xcode-select --install` |
| Homebrew | latest | Package manager | official installer |
| Git | ≥ 2.30 (ships with CLT) | Clone repo | included with CLT |
| **Node.js** | **20 LTS or newer** (≥ 20.9 required by Next 16; repo Dockerfile pins `node:20-alpine`; workspace tested on v24) | Run Next.js | `brew install node@20` |
| npm | ≥ 10 (bundled with Node) | Package manager (matches `vercel.json` install command) | bundled |
| Bun | ≥ 1.1 (**optional**) | Only needed for `scripts/seed.ts`, mini-services, `make` targets | `brew install oven-sh/bun/bun` |
| Editor | VS Code or similar | Editing | `brew install --cask visual-studio-code` |

Not required locally: PostgreSQL, Redis, Docker, Python (the `backend/` FastAPI stack is a separate optional service; Prisma/Node need no Python).

---

## 3. Installation Order (exact commands)

```bash
# 1. Xcode Command Line Tools (provides Git)
xcode-select --install

# 2. Homebrew (follow the prompt; Apple Silicon installs to /opt/homebrew)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 3. Node.js 20 LTS + npm
brew install node@20
brew link node@20
node -v   # expect v20.x or newer
npm -v    # expect 10.x

# 4. Editor (optional)
brew install --cask visual-studio-code
```

---

## 4. Git Repository Setup

The canonical remote is `https://github.com/Hugs-4-Bugs/AQ-OS.git`, branch **`main`**.

```bash
# Authenticate with GitHub once (HTTPS + browser keychain is simplest)
git config --global user.name  "Your Name"
git config --global user.email "you@example.com"

# Clone and check out the current main branch
git clone https://github.com/Hugs-4-Bugs/AQ-OS.git AcquisitionOS
cd AcquisitionOS
git checkout main

# VERIFY you are on the correct branch and a clean tree
git branch --show-current      # must print: main
git rev-parse HEAD             # note this commit hash
git status --porcelain         # must print nothing
```

> ⚠️ **Never** reset, revert, checkout an older commit, or force-pull over the working tree. The repository state at `main` HEAD is the single source of truth.

---

## 5. Install Dependencies

The repository uses npm with `--legacy-peer-deps` (verified in `vercel.json` and required because `next-auth@4` and `nodemailer@8` have conflicting peer ranges — both packages ship in `package.json`):

```bash
npm install --legacy-peer-deps
```

Expected: install completes and `prisma generate` runs automatically via the `postinstall` hook (verified: `"postinstall": "prisma generate || true"`). The Prisma Client is generated into `node_modules/@prisma/client`.

> `bun install` also works (a `bun.lock` exists) and is what the `Makefile` uses, but **npm is the documented default** because production (`vercel.json`, `Dockerfile`) uses npm.

---

## 6. Environment Configuration

```bash
cp .env.example .env      # template with placeholders (safe to commit — contains no secrets)
```

Then edit `.env` and fill in real values. The **minimum for a fully working local app including real authentication**:

| Variable | Value | Source |
|---|---|---|
| `DATABASE_URL` | `file:./db/custom.db` | keep from template (SQLite — nothing to install) |
| `JWT_SECRET` / `AUTH_SECRET` / `NEXTAUTH_SECRET` | 64-char random hex | generate yourself: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | your local origin |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | your OAuth client | **EXTERNAL:** Google Cloud Console (§10) |
| `SMTP_HOST/PORT/USER/PASSWORD`, `EMAIL_FROM` | Gmail SMTP + 16-char App Password | **EXTERNAL:** Google Account (§10) |
| `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_CX` | Custom Search key + engine id | **EXTERNAL:** Google Cloud + Programmable Search (needed only for lead discovery) |
| `CRON_SECRET` | any long random string | generate yourself (used by §13 curl examples) |

Generate-and-append helper for the secrets:

```bash
node -e "
const fs=require('fs');
const s=require('crypto').randomBytes(32).toString('hex');
fs.appendFileSync('.env','\nJWT_SECRET='+s+'\nAUTH_SECRET='+s+'\nNEXTAUTH_SECRET='+s+'\nCRON_SECRET='+require('crypto').randomBytes(24).toString('hex')+'\n');
console.log('secrets appended to .env');"
```

**Verify `.env` is protected** (it must never be committed):

```bash
git check-ignore -v .env      # must print: .gitignore:<line>:.env*     .env
git status --porcelain | grep -c "\.env$"   # must print 0 (untracked/ignored)
```

---

## 7. Database Setup (SQLite — zero external services)

The app **actually uses SQLite** (verified: `prisma/schema.prisma` → `provider = "sqlite"`, `.env` → `file:` URL, `db/custom.db` on disk with 105 tables). Nothing to install or start.

```bash
# 1. Generate the Prisma Client (already done by postinstall; idempotent)
npm run db:generate

# 2. Push the schema to the SQLite file (creates/updates tables; non-destructive for dev)
npm run db:push

# 3. OPTIONAL — sample dev data (leads, deals, communications). DESTRUCTIVE: it
#    deleteMany()s existing Lead/Deal/Communication/Insight rows first. Dev-only.
bun run scripts/seed.ts        # requires Bun; skip if you don't want sample data

# 4. Inspect the database visually (browser UI on localhost:5555)
npx prisma studio
```

| Operation | Command | Notes |
|---|---|---|
| Start DB | nothing to start | it is a file: `db/custom.db` |
| Stop DB | nothing to stop | close Prisma Studio / the app |
| Schema change | `npm run db:push` | the repo's real workflow (only 4 migrations exist vs 105 models — `db push` is canonical, verified in `infra/db-migration-rollback.md`) |
| Migrations (formal) | `npm run db:migrate` | works but migration state has drifted from schema; prefer `db:push` in dev |
| Backup | `npm run backup` | ⚠️ `scripts/backup/backup.sh` defaults `DB_PATH=/opt/...` — pass the real path: `DB_PATH=db/custom.db bash scripts/backup/backup.sh` |
| Destructive reset | `npm run db:reset` | **DEV ONLY — deletes all data. NEVER run against any shared/production database.** |

---

## 8. Redis — NOT Required (explicit statement)

**The application runs fully without Redis.** Verified: the only Redis client usage (`src/lib/redis-pubsub-service.ts`, `src/lib/observability/health.ts`) lazily connects **only if `REDIS_URL` is set**, and the current `.env` has no `REDIS_URL`. Caching, rate limiting and queues all have in-memory implementations (`src/lib/gmail-cache-service.ts`, `src/lib/security/rate-limiter.ts`, `src/lib/performance/cache-manager.ts`).

Without Redis, the only degradation is **cross-process realtime event fan-out** in multi-instance deployments — irrelevant for single-process local dev. The health endpoint reports `Redis not configured — skipped`.

Do not install Redis on the Mac unless you later run the optional Socket.IO sidecar (§14).

---

## 9. Start the Application (frontend + backend together)

```bash
npm run dev
```

- Exact script (verified): `node node_modules/next/dist/bin/next dev -p 3000 2>&1 | tee dev.log` — Next.js **Turbopack** dev server on **http://localhost:3000**, logging to `dev.log`.
- Expected output: `▲ Next.js 16.x (Turbopack) … Ready in …`.
- There is **no separate backend to start** — all 507 API routes are served by this same process. Verify the API directly:

```bash
curl -s http://localhost:3000/api/health | head -c 300     # expect {"status":"ok"...}
open http://localhost:3000                                  # homepage renders
```

- **Stop:** press `Ctrl-C` in the terminal (or `lsof -ti :3000 | xargs kill` if backgrounded).

> ⚠️ If your Mac has ≤ 8 GB RAM and the dev server is killed (`exit 137`), close other apps first. Production **builds** already use webpack (`next build --webpack`, verified in `package.json`) to avoid Turbopack's higher memory use.

Production build smoke test (optional at this point):

```bash
npm run build     # prisma generate → next build --webpack → clean-standalone
npm start         # serves the standalone build via start.js on :3000 (Ctrl-C to stop)
```

---

## 10. Real Authentication Setup (Google OAuth + real OTP email)

The workspace credentials you shared are already installed in the local `.env` and **verified working** (SMTP login accepted by Gmail; Google consent flow reachable). On a new Mac, fill the same variables from your own accounts.

### 10.1 Real OTP email (Gmail SMTP) — fixes the "Dev mode — email delivery not configured" screen

1. Google Account → **Security** → 2-Step Verification **on** → **App passwords** → create one (16 characters).
2. Put in `.env`:
   ```text
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your_email@gmail.com
   SMTP_PASSWORD=<16-char app password>
   EMAIL_FROM=your_email@gmail.com
   ```
3. Provider chain (verified in `src/lib/email.ts`): **Resend** (`RESEND_API_KEY`) is primary when set, **Gmail SMTP** is the fallback, and the dev-mode "OTP shown in response" fallback only fires when **neither** provider is configured **and** `NODE_ENV !== 'production'` **and** `AUTH_DEV_MODE !== 'false'` (`src/lib/dev-auth.ts`). With SMTP configured, the OTP is **emailed for real** and the dev banner disappears.

Trigger → service → recipient map (verified):

```text
OTP login        POST /api/auth/otp/request → sendEmail() → Resend or Gmail SMTP → user's inbox
Magic link       POST /api/auth/magic-link/request → same chain → user's inbox
Security alerts  suspicious-login detection → sendSecurityAlertEmail() → user's inbox
Invoices/failed  payment flows → invoice emails → user's inbox
```

### 10.2 Real Google sign-in (OAuth)

1. Google Cloud Console → **APIs & Services → Credentials → OAuth client ID** (Web application).
2. Whitelist these **Authorized redirect URIs** (exact paths verified in code):
   ```text
   http://localhost:3000/api/auth/callback/google
   https://<your-deployed-domain>/api/auth/callback/google
   ```
3. Copy Client ID + Client secret into `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
4. Flow (verified): `/auth/signin` → `GET /api/auth/google/state` (builds `authUrl`; redirect_uri derived **dynamically from request origin**, not hardcoded) → Google consent → `GET /api/auth/callback/google` → token exchange → user upsert (role `owner`, plan `free`, 14-day trial) → httpOnly cookies (`access_token` 15 min SameSite=strict; `refresh_token` 30 d path `/api/auth`).
5. Verify: `curl -s http://localhost:3000/api/auth/config` → `"googleAvailable": true`; then click **Sign in with Google**.

### 10.3 Verified redirect URIs (whitelist exactly these in Google Cloud Console)

The callback path is `/api/auth/callback/google` on whichever origin the user is on
(dynamic detection in `src/app/api/auth/google/state/route.ts`). Whitelist:

```text
# Local
http://localhost:3000/api/auth/callback/google
# Testing / staging (this workspace's preview origin — probe-verified ✅)
https://preview-chat-ab88c1b0-d6fd-4199-b9d5-ec3a018502fc.space-z.ai/api/auth/callback/google
# Production (probe-verified ✅)
https://acquisition.space-z.ai/api/auth/callback/google
```

If you deploy on a NEW domain, add `<new-domain>/api/auth/callback/google` there too —
otherwise Google returns `redirect_uri_mismatch`. Probe any candidate URI without a real
login: `node scripts/verify-real-creds.js`.

### 10.4 Production safety (simulated consent can NEVER fire in prod)

The in-app simulated Google consent page (`src/app/auth/dev/google-consent/page.tsx`) is
triple-gated (verified in `src/app/api/auth/callback/google/route.ts` + `src/lib/dev-auth.ts`):

1. `?dev=1&dev_email=…` params present, AND
2. `GOOGLE_CLIENT_ID` **missing** on the server, AND
3. `isDevAuthDeliveryEnabled()` → `NODE_ENV !== 'production'` **and** `AUTH_DEV_MODE !== 'false'`.

In a production build the dev gate is always false → with missing credentials the state
route returns **503 "Google OAuth is not configured"** and the callback **ignores `dev=1`**
(`auth_error=google_failed`) — production can never silently authenticate a fake Google
account. OTP dev-delivery (`devDelivery` in API responses) is disabled the same way, and
`AUTH_DEV_MODE=false` additionally hard-disables it in dev.

### 10.5 Sandbox-reset self-healing + recovery runbook

Workspace resets truncate `.env` to a bare `DATABASE_URL` (happened 2026-09-22 **and**
2026-09-23). Recovery is now automatic: `ensure-env.sh` runs
`node scripts/recover-credentials.mjs` whenever `GOOGLE_CLIENT_ID` is missing from `.env` —
the real credentials live in this repo's git history (old `ensure-env.sh` revisions) and are
re-merged without printing values. Manual runbook:

```bash
node scripts/recover-credentials.mjs   # restore real creds + generate JWT/CRON secrets
node scripts/verify-real-creds.js      # SMTP AUTH verify + Google client probe (masked output)
# restart the dev server so the new .env is loaded, then:
curl -s http://localhost:3000/api/auth/config     # → {"googleAvailable":true,"emailConfigured":true}
node scripts/runtime-verify-auth.mjs              # config + state + email-diagnostic (masked)
```

### 10.6 Troubleshooting (verified error signatures)

| Symptom | Root cause | Fix |
|---|---|---|
| `redirect_uri_mismatch` at Google consent | Callback origin not whitelisted in Google Cloud Console | Add `<origin>/api/auth/callback/google` (§10.3) |
| Google button shows "Simulated consent — dev environment only" | `GOOGLE_CLIENT_ID` missing from `.env` (server side) | `node scripts/recover-credentials.mjs` + restart server |
| OTP screen shows "Email delivery is not configured" | `SMTP_USER`/`SMTP_PASSWORD` missing or placeholder | Recovery script + check `/api/auth/email-diagnostic` (Bearer `CRON_SECRET`) |
| `535` in email-diagnostic sendTest | Gmail rejected the app password | New App Password at myaccount.google.com/apppasswords → update `SMTP_PASSWORD` |
| `Daily user sending limit exceeded` (550-5.4.5) | Gmail consumer quota (~100-500/day), resets midnight PT | Wait for reset or set `RESEND_API_KEY` (primary provider) |
| OTP never arrives but provider `sent=true` | Recipient-side (spam/suppression) | Check spam; diagnostics: `[OTP Delivery]` log line has recipientDomain/provider/messageId/failureCategory |

---

### 10.7 Database identity loss — 2026-09-22/23 incident (diagnosed) + DB safety tooling

**Symptoms reported:** (1) a previously-registered email could not log in; (2) a previously-used
email appeared as a NEW account with default credits; (3) OTP never arrived for another email.
**Root cause (proven, not guessed):** the live SQLite file `db/custom.db` is gitignored
(`*.db`) and was destroyed by the workspace sandbox reset(s). The app then recreated a fresh,
empty DB at the same path (born 2026-09-23 00:53 UTC). Every "existing" email was therefore
absent from the CURRENT database:

- password login → 401 `Invalid email or password` (timing-safe, anti-enumeration);
- OTP login → generic 200 with **no OTP generated and no email sent** (`src/app/api/auth/otp/request/route.ts`
  returns early when the user row does not exist — by design, so it *looks* like "OTP never arrives");
- re-signup / Google sign-in → lookup misses → **new user row with a new ID** and the schema-default
  free trial (`User.credits @default(50)`, `Subscription.creditsTotal @default(50)`) — the "default
  credit behavior".

No code bug: email normalization (`toLowerCase().trim()`) is identical in signin, signup, OTP
request/verify, magic-link, and both Google callbacks; all creation paths do lookup-first; the
`User.email @unique` constraint held (zero duplicate/case-variant rows ever existed in either DB).

**Forensic proof (read-only):** the last git-tracked DB snapshot is commit `efbc216`
(2026-09-22 04:15 UTC, blob `60f8e3b`): 34 users, incl. the previously-active accounts. The
current DB (1 user) was created after the wipe — same email now maps to a DIFFERENT user ID with
default credits. Extracted copies live in `tool-results/db-forensics/` (read-only, gitignored).

**Recovery options (require explicit operator authorization — never auto-run):**
1. If you ran the app locally, your Mac's `db/custom.db` still has your accounts: copy it into the
   workspace `db/` (or point `DATABASE_URL` at it) and restart.
2. Restore the git-history snapshot:
   `git cat-file -p efbc216:db/custom.db > db/custom.db` (34 users as of 2026-09-22 04:15 UTC;
   anything created after that snapshot is unrecoverable).

**Prevention (shipped 2026-09-23):** `scripts/db-safety.mjs` — `snapshot|auto|status|restore`.
Boot-time auto-snapshot wired into `ensure-env.sh` (skips when DB is empty/unchanged; keeps last
10 in gitignored `db-backups/`). Restore is dual-gated: requires `--confirm` AND refuses if the
live DB has more users than the snapshot. Manual: `npm run db:snapshot` / `npm run db:safety`.

**Related latent issue (flagged, not changed):** `ensure-env.sh` injects
`NEXTAUTH_URL`/`APP_URL`/`NEXT_PUBLIC_APP_URL` defaults pointing at a hardcoded preview domain.
Harmless today (live `.env` has none of them; `src/lib/app-url.ts` resolves dynamically with
`PRODUCTION_URL` priority-0), but do NOT reuse that default in a real production `.env` —
override `APP_PUBLIC_URL` explicitly instead.

---

## 11. Local End-to-End Verification Checklist

Run through this after setup (each item verified against a real route/page):

**Application** — homepage `/` renders; `/auth/signin` renders; OTP request emails a real 6-digit code (arrives in inbox); verify → dashboard loads; signout works.

**Database** — `curl -s http://localhost:3000/api/health` → ok; `curl -s http://localhost:3000/api/health/database` → SQLite stats; CRUD via any dashboard tab; `npx prisma studio` shows rows.

**AI** — dashboard AI chat replies (Z-AI, no key needed); Lead Analysis on a lead; **Lead Discovery** requires `GOOGLE_SEARCH_API_KEY`+`GOOGLE_SEARCH_CX` (or `SERPAPI_KEY`) — without them the API returns the explicit error "No search API configured" (verified `src/lib/lead-discovery/discovery-engine.ts`).

**Credits** — each AI action deducts per `PIPELINE_CREDIT_COST` / credit-service rules; the billing page shows the ledger.

**Payments (optional)** — Stripe/Razorpay are disabled until keys exist; provider-status route reflects it. To test locally: Stripe test keys + `brew install stripe/stripe-cli && stripe login && stripe listen --forward-to localhost:3000/api/payments/webhook/stripe` (11 event types handled, verified in the webhook route).

**Admin** — admin is a DB role (`User.role = 'super_admin'`); there is **no promotion API** (verified). Promote your account directly in SQLite: `npx prisma studio` → User → role. Then `/admin` (server-side guard `getSuperAdminSession()` re-checks the DB every request). Sections: `/admin`, `/admin/users`, `/admin/billing`, `/admin/feedback`. The documented super-admin account `contact@prabhat.online` logs in through the **same public OTP/Google flows** — there is no backdoor and none should be created.

**Security** — a normal user hitting `/admin` is redirected to `/`; `/api/admin/*` returns 403; unauthenticated API calls return 401.

---

## 12. Cron / Background Jobs (local)

12 HTTP cron endpoints exist under `/api/cron/*`, all Bearer-protected by `CRON_SECRET` (verified; note: `payment-reconciliation` and `meetings/reminders/process` also accept their legacy dev fallback — do not rely on it). **No local scheduler is wired**; trigger manually with curl:

```bash
curl -X POST http://localhost:3000/api/cron/expire-api-keys       -H "Authorization: Bearer $CRON_SECRET"
curl -X POST http://localhost:3000/api/cron/renew-subscriptions   -H "Authorization: Bearer $CRON_SECRET"
curl -X POST http://localhost:3000/api/cron/process-sequences     -H "Authorization: Bearer $CRON_SECRET"
```

Scheduled *workflow* triggers additionally need the optional Python Celery stack (`make celery-worker`, `make celery-beat`) — not required for normal local use.

---

## 13. Optional Components (all verified optional)

| Component | Purpose | Start command | Required? |
|---|---|---|---|
| Realtime sidecar (`mini-services/realtime-service`) | Socket.IO live updates on :3003 | `cd mini-services/realtime-service && bun install && bun run dev` | No — SSE fallback built-in |
| Python FastAPI backend (`backend/`) | Alternative async backend + Celery | `make install-backend && make backend` | No — separate stack |
| Docker compose local stack | Postgres/Redis/Mailpit for prod-like testing | `make docker-up` | No |

---

## 14. Command Reference (consolidated)

| Purpose | Directory | Command |
|---|---|---|
| Install dependencies | project root | `npm install --legacy-peer-deps` |
| Generate Prisma client | project root | `npm run db:generate` |
| Push schema to SQLite | project root | `npm run db:push` |
| Seed sample data | project root | `bun run scripts/seed.ts` |
| Start app (dev) | project root | `npm run dev` |
| Start app (prod build) | project root | `npm run build && npm start` |
| Run tests | project root | `npm test` (vitest, 37 files) |
| Run lint | project root | `npm run lint` |
| Typecheck | project root | `npx tsc --noEmit` (large; ~322 pre-existing errors tracked separately) |
| Prisma Studio | project root | `npx prisma studio` |
| Security scan | project root | `npm run security:scan` (needs Bun) |
| DB backup / restore | project root | `npm run backup` / `npm run backup:restore` |
| Trigger a cron locally | project root | `curl -X POST localhost:3000/api/cron/<job> -H "Authorization: Bearer $CRON_SECRET"` |

---

## 15. Troubleshooting (verified causes)

| Symptom | Cause | Verify | Fix |
|---|---|---|---|
| `npm install` peer-conflict ERESOLVE | next-auth@4 vs nodemailer@8 ranges | error text names both packages | use `npm install --legacy-peer-deps` (exact repo command) |
| `next dev` killed, exit 137 | Turbopack out of memory on small-RAM machines | `dev.log` ends with `Killed` | free RAM; dev is Turbopack by design — for builds `--webpack` is already pinned |
| Port 3000 in use | stale process | `lsof -i :3000` | `lsof -ti :3000 \| xargs kill` |
| Prisma "Cannot find module '@prisma/client'" | generate skipped | `ls node_modules/.prisma/client` | `npm run db:generate` |
| `SQLITE_BUSY` / database locked | concurrent writers to the SQLite file | repeated on heavy parallel jobs | retry; keep single app instance in dev |
| OTP shows "Dev mode" banner | no email provider configured | `/api/auth/email-diagnostic` (Bearer CRON_SECRET) | set real `SMTP_*` values (§10.1) |
| Gmail SMTP `535` auth error | wrong/missing App Password or missing 2FA | SMTP diag route | recreate the 16-char App Password |
| Google sign-in `redirect_uri_mismatch` | localhost redirect not whitelisted | Google shows the exact expected URI | add `http://localhost:3000/api/auth/callback/google` in Google Console |
| `401` on APIs after login | JWT cookie missing/expired (15 min access token) | DevTools cookies `access_token` | re-login; `/api/auth/refresh` rotates |
| `403` on `/api/admin/*` | account not `super_admin` in DB | `npx prisma studio` → User.role | set role (§11 Admin) |
| Lead discovery error "No search API configured" | discovery keys missing | `/api/lead-discovery` GET status | add `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_CX` |
| Build OOM (exit 137) | 4 GB machine | build log | `NODE_OPTIONS=--max-old-space-size=2560 npm run build`; build already uses webpack |
| Docker build fails at `.npmrc` COPY | `.npmrc` absent from repo | `ls .npmrc` | create an empty `.npmrc` or remove the COPY line (deployment doc §notes) |
