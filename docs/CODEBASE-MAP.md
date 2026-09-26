# CODEBASE-MAP — AcquisitionOS

> **"If you want to change X, go to this file/folder."**
> Every path in this map was verified against the actual repository (507 API routes,
> 105 Prisma models, 192 lib modules, 187 dashboard components, 23 hooks).
> Verified: 2026-09-22, HEAD `efbc216`.

## 0. Architecture at a Glance

- **Stack**: Next.js 16 App Router + TypeScript + React 19 + Tailwind 4 + shadcn/Radix · Prisma + SQLite (`db/custom.db`) · custom JWT auth (next-auth installed but unused) · in-memory rate limiting · optional Redis (lazy `import('ioredis')`, app runs without it)
- **Shape**: single-process modular monolith. The app is an SPA — `src/app/page.tsx` → `AuthGate` → `DashboardLayout`; tabs are client state (`TabId` in `src/lib/types.ts`), not routes. Real route pages exist only for billing, meetings, calendar, feedback, admin, legal, auth, api-docs, workflows docs.
- **Edge protection**: `src/proxy.ts` (Next.js 16 "proxy" = middleware) — JWT verification, CSRF, security headers, admin gate. Legacy `src/middleware.ts.*` files are dead artifacts.
- **Env loading**: `src/instrumentation.ts` → `src/lib/env-safeguard.ts` + `src/lib/env-validation.ts`

## 1. Feature Map

| Feature | Frontend | API | Services/Libs | DB Models | Env |
|---|---|---|---|---|---|
| Landing/Auth UI | `src/components/dashboard/auth-gate.tsx` (view router), `src/app/auth/signin`, `src/app/auth/signup` | `src/app/api/auth/**` (38 routes) | `src/lib/auth.ts`, `auth-middleware.ts`, `magic-link-validator.ts`, `account-lock-service.ts`, `suspicious-login-service.ts`, `device-fingerprint.ts` | User, UserSession, LoginHistory, MfaConfig, OnboardingProgress | `JWT_SECRET`, `AUTH_SECRET`/`NEXTAUTH_SECRET`, `AUTH_DEV_MODE` |
| OTP / Magic link / MFA | views inside auth-gate | `api/auth/otp/*`, `api/auth/magic-link/*`, `api/auth/mfa/*` | `src/lib/auth.ts` (TOTP), `src/lib/dev-auth.ts` | MfaConfig | `ENABLE_OTP_LOGIN`, `ENABLE_MAGIC_LINK` |
| Google OAuth | google buttons in auth-gate; `src/app/auth/dev/google-consent` | `api/auth/google*`, `api/auth/callback/google`, `api/integrations/google/*` | `src/lib/google-oauth.ts`, `oauth-relay.ts`, `encryption.ts` (AES-256-GCM) | — | `GOOGLE_CLIENT_ID/SECRET` |
| Dashboard shell | `src/components/dashboard/dashboard-layout.tsx`, `command-palette.tsx`, `live-stats-bar.tsx` | `api/dashboard/*` (56 widget routes), `api/dashboard/search` | `src/lib/store.ts` (Zustand), `rbac.ts` (TAB_PERMISSIONS) | — | — |
| Leads core | `leads-tab.tsx`, `lead-detail-panel.tsx`, `lead-activity-timeline.tsx` | `api/leads/**` (32+ routes incl. `[id]/activities`, `/notes`, `/analyze`, `/enrich`, `/research`, `/move-stage`) | `src/lib/lead-resolution.ts` (canUserAccessLead), `lead-audit.ts`, `ai/scoring-engine.ts` | Lead, LeadNote, LeadActivity, LeadAnalysis, LeadScore, Communication | — |
| Lead import/export | `import-leads-dialog.tsx`, `export-dialog.tsx`, `data-export-center.tsx` | `api/leads/import`, `api/leads/export`, `api/export` | `src/lib/lead-import-export-service.ts`, `data-export.ts` | — | `IMPORT_MAX_ROWS` |
| Discovery | `discover-tab.tsx` | `api/leads/discover`, `api/discovery/*`, `api/lead-discovery` | `src/lib/lead-discovery-service.ts`, `src/lib/lead-discovery/*` (discovery-engine, source-adapters, website-scorer) | DiscoveryJob | `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_CX`, `SERPAPI_KEY` |
| Enrichment / Deep research | `batch-research-dialog.tsx` | `api/leads/[id]/enrich`, `api/leads/[id]/research`, `api/prospecting/research-batch/*` | `src/lib/lead-enrichment-service.ts`, `src/lib/prospecting/*` (pipeline, batch-research) | — | — |
| Deals / Pipeline | `deals-tab.tsx`, `pipeline-tab.tsx`, `deals-pipeline-board.tsx` | `api/deals/*`, `api/pipeline`, `api/prospecting/pipeline/*` | `src/lib/pipeline-service.ts` | Deal, PipelineStage, PipelineCustomStage, ProspectPipeline | — |
| AI chat / assistant | `assistant-tab.tsx`, `ai-chat-bubble.tsx`, `ai-copilot-panel.tsx` | `api/ai/chat`, `api/ai/chat/stream`, `api/ai/analysis/[leadId]`, `api/sales-assistant` | `src/lib/ai/` (ai-provider — z-ai primary with OpenAI/Anthropic/OpenRouter fallbacks, chat-service, memory-service, credit-enforcement) | AiChatSession, AiChatMessage, AiCostRecord | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY` (optional) |
| RAG / vector search | (no dedicated tab) | `api/ai/rag/*`, `api/ai/vector-search` | `src/lib/rag-service.ts` (SSRF-guarded fetch via `src/lib/security/url-guard.ts`), `vector-search-service.ts` | RagDocument, FileContext | — |
| Workflows | `workflows-tab.tsx`, `workflow-builder.tsx`, `workflow-execution-history.tsx` | `api/workflows/**` (25 routes incl. `webhook/[id]` + `webhook/[...path]` triggers) | `src/lib/workflow-engine.ts`, `workflow-executor.ts`, `workflow-triggers.ts`, `workflow-dead-letter.ts` | WorkflowDefinition, WorkflowStep, WorkflowExecution, WorkflowLog, WorkflowTemplate | — |
| Outreach / sequences | `outreach-tab.tsx`, `email-compose-dialog.tsx`, `email-template-builder.tsx` | `api/outreach/*`, `api/sequences/*` (17 routes), `api/email/*` | `src/lib/email-sequence-engine.ts`, `sequence-execution-engine.ts`, `autonomous-outreach*.ts` | OutreachMessage, OutreachSequence, SequenceStep, SequenceEnrollment, ScheduledEmail | — |
| Gmail integration | `gmail-integration-tab.tsx`, `inbox-tab.tsx` | `api/gmail/**` (24 routes incl. `pubsub/webhook`, `tracking/*`) | `src/lib/gmail-oauth-service.ts`, `gmail-delivery-service.ts`, `gmail-inbox-service.ts`, `gmail-tracking-service.ts` | EmailAccount, EmailThread, EmailMessage, EmailBounce, EmailUnsubscribe, EmailOpen/ClickEvent | `GMAIL_PUBSUB_*`, `GMAIL_ENCRYPTION_KEY` |
| WhatsApp / Telegram | `whatsapp-integration-tab.tsx`, `telegram-integration-tab.tsx` | `api/whatsapp/**`, `api/telegram/**`, `api/integrations/whatsapp|telegram/*` | `src/lib/whatsapp-service.ts` (Meta+Twilio), `telegram-service.ts` | WhatsappConfig, TelegramConfig | `TELEGRAM_BOT_TOKEN` |
| Messaging hub | `messaging-hub-tab.tsx` | `api/messaging/*` (broadcasts, templates, media), `api/messages/*` | `src/lib/broadcast-service.ts`, `message-delivery-service.ts`, `media-upload-service.ts` | MessageBroadcast, MessageTemplate, MessageDelivery, MediaFile, Conversation | — |
| Meetings / Calendar | `src/app/dashboard/meetings/**`, `src/components/meetings/`, `meeting-orchestration-panel.tsx` | `api/meetings/*` (27 routes), `api/calendar/*` (14 routes) | `src/lib/meeting-orchestration-service.ts`, `src/lib/meeting/` AND `src/lib/meetings/` (duplicate dirs — see §4), `src/lib/calendar/` | Meeting, MeetingReminder, GoogleCalendarToken, CalendarWatch | — |
| Notifications | `notifications-tab.tsx`, `notification-center.tsx` | `api/notifications/*`, `api/dashboard/notifications` | `src/lib/notification-engine.ts`, `notification-channels/` (gmail/telegram/whatsapp/push) | Notification, NotificationPreferences | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |
| Credits | `credit-display.tsx`, `credit-gate.tsx`, `credit-usage-breakdown.tsx` | `api/credits`, `api/credits/history` | `src/lib/credit-service.ts` (atomic tx + ledger), `credit-costs.ts`, `usage-service.ts` | CreditsLedger, CreditAddon | — |
| Payments / Billing | `src/app/dashboard/billing/page.tsx`, `checkout-modal.tsx`, `payment-history.tsx` | `api/payments/**` (30 routes), `api/subscriptions/*`, `api/billing/*` | `src/lib/payments/` (registry, stripe-provider, razorpay-provider, plan-config), `subscription-service.ts`, `payment-service.ts`, `invoice-pdf-service.ts`, `refund-service.ts`, `coupon-service.ts` | Subscription, PaymentOrder, PaymentWebhook, Invoice, Coupon | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RAZORPAY_KEY_ID/SECRET`, plan price IDs |
| Admin | `src/app/admin/**` (overview/users/billing/feedback), `src/components/admin/admin-nav.tsx` | `api/admin/**` (14 routes, all `withSuperAdmin`) | `src/lib/admin-guard.ts`, `admin-billing-service.ts` | AuditLog, SystemEvent, SystemMetrics | — |
| Feedback / crashes | `src/components/feedback/`, `src/app/dashboard/feedback/page.tsx` | `api/feedback/*`, `api/feedback/crash` | `src/lib/feedback/` (crash-reporter, ai-triage, rate-limiter) | FeedbackReport, CrashReport | — |
| Developer / API keys | `api-keys-panel.tsx`, `src/app/api-docs/page.tsx` | `api/settings/api-keys/**` | `src/lib/api-key-service.ts` (SHA-256 hashed, `aq_live_` prefix), `api-key-middleware.ts` (dual-auth) | ApiKey, ApiKeyUsage | — |
| Settings / Org / Team / GDPR | `settings-panel.tsx` (10 tabs), `privacy-settings.tsx` | `api/settings/*` (44 routes), `api/team/*`, `api/gdpr/*` | `src/lib/org-branding-service.ts`, `white-label-service.ts`, `invite-lifecycle-service.ts`, `compliance/retention.ts` | Organization, OrgMember, OrgInvitation, UserSettings, GdprRequest, DataExport | — |
| Realtime (SSE) | `src/hooks/use-sse.ts`, `use-payment-sse.ts` | `api/ws` (main SSE), `api/events/*` (6 channels), `api/payments/sse`, `api/realtime/recover` | `src/lib/realtime-engine.ts`, `sse-manager.ts`, `redis-pubsub-service.ts` (optional) | RealtimeEvent | `REDIS_URL` (optional) |
| Realtime (WS, external) | `src/hooks/use-websocket.ts` (→ `/?XTransformPort=3003`) | — | `mini-services/realtime-service/index.ts` (prod, port 3003, JWT-verified), `mini-services/ws-service/index.ts` (dev) | — | `JWT_SECRET` (shared) |
| Analytics / insights | `insights-tab.tsx`, `overview-tab.tsx`, `report-builder.tsx` | `api/analytics/*` (17 routes), `api/reports/*`, `api/metrics/*` | `src/lib/analytics-engine.ts`, `auto-insight-engine.ts`, `predictive-analytics-engine.ts` | AnalyticsPrediction/Insight/Anomaly/Benchmark, Report, DashboardShare | — |
| Competitors | (in insights) | `api/competitors/*` | `src/lib/competitor-*` | CompetitorData, CompetitorAnalysis | — |

## 2. "Where do I change this?" — exact paths

| If you want to change… | Go to |
|---|---|
| UI tabs/layout | `src/components/dashboard/dashboard-layout.tsx` + `src/lib/types.ts` (`TabId`) |
| An API route | `src/app/api/<group>/<route>/route.ts` |
| Business logic | `src/lib/<domain>-service.ts` |
| Database schema | `prisma/schema.prisma` (105 models) → `npm run db:push` (SQLite) |
| Migrations | `prisma/migrations/` (4 migrations; `scripts/migrate-to-postgresql.sh` for PG) |
| Auth / JWT | `src/lib/auth.ts` (sign/verify/cookies), `src/lib/auth-middleware.ts` (`withAuth`, `withSuperAdmin`) |
| Edge protection/CSRF/headers | `src/proxy.ts` |
| RBAC matrix | `src/lib/rbac.ts` |
| Admin guard | `src/lib/admin-guard.ts` (server components) + `withSuperAdmin` (APIs) |
| Credits | `src/lib/credit-service.ts`, `src/lib/credit-costs.ts` |
| Subscriptions/plans | `src/lib/subscription-service.ts`, `src/lib/payments/plan-config.ts`, `src/lib/entitlement-service.ts` |
| Stripe | `src/lib/payments/stripe-provider.ts`, `src/lib/stripe-service.ts`, webhook `src/app/api/payments/webhook/stripe/route.ts` |
| Razorpay | `src/lib/payments/razorpay-provider.ts`, `src/lib/razorpay-service.ts`, webhook `.../webhook/razorpay/route.ts` |
| Email/SMTP | `src/lib/email.ts` (Resend→SMTP chain) |
| AI providers | `src/lib/ai/ai-provider.ts` (+ `ai-provider-fallback.ts`) |
| Deep research | `src/lib/prospecting/batch-research.ts` |
| Lead discovery | `src/lib/lead-discovery/discovery-engine.ts`, `src/lib/lead-discovery-service.ts` |
| Workflow engine | `src/lib/workflow-engine.ts`, `src/lib/workflow-executor.ts` |
| Cron jobs | `src/app/api/cron/*` (12 endpoints, CRON_SECRET Bearer; external scheduling — see `docs/operations/CRON-JOBS.md`) |
| Redis (optional) | `src/lib/redis-pubsub-service.ts` |
| File upload | `src/lib/media-upload-service.ts` (messaging), `src/app/api/settings/avatar/route.ts` (avatar) |
| Invoice PDFs | `src/lib/invoice-pdf-service.ts` + `invoice-pdf-generator.ts` (stored in `data/invoices/`, served via authed routes only) |
| Security modules | `src/lib/security/` (rate-limiter, input-validator, url-guard, jwt-security, csrf-protection, cors-config) |
| Logging | `src/lib/api-request-logger.ts`, `src/lib/observability/` |
| Env vars | `.env` (untracked) / `.env.example` / `ENVIRONMENT-VARIABLES.md`; validation in `src/lib/env-validation.ts` |
| Rate limits | `src/lib/security/rate-limiter.ts` (RATE_LIMITERS map) |
| Tests | `vitest.config.ts`; `src/__tests__/` (12 files), `tests/` (unit/integration/e2e/load), pentest suite `scripts/pentest/` |

## 3. Cross-cutting inventory

- **Prisma**: `prisma/schema.prisma` — 105 models, 0 enums, 4 migrations; datasource SQLite (`file:./db/custom.db`); prod variant `prisma/schema.production.prisma` (untracked). Domain groups: Identity (8), Org (3), Billing (11), Leads (8), Pipeline (4), Outreach/Email (11), Messaging (11), AI (6), Workflows (5), Competitors (3), Meetings (5), Platform (24+).
- **Components**: `src/components/ui/` (50 shadcn primitives), `src/components/dashboard/` (187), `meetings/` (4), `feedback/` (3), `admin/` (1).
- **Hooks (23)**: `use-auth`, `use-token-refresh`, `use-subscription-sync`, `use-entitlements`, `use-credits`, `use-sse`, `use-websocket`, `use-live-*`, `use-payment*`, `use-notifications`, `use-mobile`…
- **Mini-services (5)**: `ws-service` (:3003 dev), `realtime-service` (:3003 prod, Redis pub/sub), `email-service` (:3031), `proxy` (:3002 preview forward), `server-watchdog` (:3001).
- **Deploy surface**: `Dockerfile`, `docker-compose.{yml,local,prod}.yml`, `vercel.json`, `Caddyfile` (XTransformPort proxy), `nginx*.conf`, `deploy/{ec2,k8s,terraform,render,railway}`, `scripts/backup/`, `Makefile`, `start.js`/`server.js`/`custom-server.js`.
- **Python backend** (`backend/`): FastAPI + Celery + Redis — parallel/legacy stack, NOT part of the Next.js runtime.
- **Scripts of note**: `scripts/security-scan.ts` (dep + env audit), `scripts/db-inspect.ts`, `scripts/cleanup-test-data.ts` (safe test-data purge, dry-run default), `scripts/backup/{backup,restore}.sh`, `scripts/clean-standalone.js` (post-build).

## 4. Known quirks (do not "clean these up" blindly)

- `src/middleware.ts.{bak,bak2,old,disabled}` are dead — `src/proxy.ts` is the live edge file.
- `src/lib/meeting/` vs `src/lib/meetings/` — two real dirs used by different routes; merging requires code changes.
- `landing-page.tsx` / `pricing-page.tsx` are orphaned (0 imports).
- `src/app/api/gmail/tracking/pixel/essageId]/route.ts` — corrupted dir name (missing `[m`); the working pixel route is `email/tracking/open/[id]`.
- `api/chat-sessions` returns a 501 stub.
- ioredis is a dependency but never statically imported — the app intentionally runs without Redis.

## 5. Authentication pipeline maps (verified 2026-09-23)

### Google OAuth — end-to-end files

```text
Login UI (button):
  src/components/dashboard/auth-pages-v2.tsx        # fetches /api/auth/google/state?origin=<window.origin>, redirects to authUrl
  src/components/dashboard/auth-pages.tsx           # legacy variant, same behavior
OAuth initiation:
  src/app/api/auth/google/state/route.ts            # canonical: builds state {nonce, redirectUri, origin} + real accounts.google.com authUrl; dev-consent fallback ONLY when no GOOGLE_CLIENT_ID + dev mode
  src/app/api/auth/google/route.ts                  # alt entry: direct 302 to Google (same canonical callback path)
OAuth callback:
  src/app/api/auth/callback/google/route.ts        # state decode → token exchange (client_secret) → userinfo → email-verified check → user upsert/link → session cookies; cross-domain relay
  src/app/api/auth/google/relay/route.ts           # accepts short-lived signed JWT (60 s) and sets cookies on the user's origin
  src/app/api/auth/google/redirect-uri/route.ts    # reports the exact URI to whitelist in Google Cloud Console
Google/credential helpers:
  src/lib/email-ethereal.ts                         # isRealGoogleConfigured(), getGoogleClientId/Secret() (misnamed file — no Ethereal code remains)
  src/lib/oauth-relay.ts                            # createRelayToken/verifyRelayToken (JWT_SECRET-signed, 60 s expiry)
  src/lib/dev-auth.ts                               # isDevAuthDeliveryEnabled() — production can NEVER activate simulated flow
Simulated dev consent page (dev-only):
  src/app/auth/dev/google-consent/page.tsx          # unreachable when real GOOGLE_CLIENT_ID is configured
Environment configuration:
  .env (gitignored) / .env.example / ENVIRONMENT-VARIABLES.md; recovery: scripts/recover-credentials.mjs
```

### OTP login — end-to-end files

```text
Login UI:
  src/components/dashboard/auth-pages-v2.tsx        # email → POST /api/auth/otp/request → OTP input → POST /api/auth/otp/verify
OTP request API:
  src/app/api/auth/otp/request/route.ts             # rate limit (5/min/IP) → 60 s resend cooldown → generateOTP() → store + expiry → sendOtpLoginEmail() → [OTP Delivery] diagnostics (recipientDomain/provider/messageId/failureCategory; OTP never logged)
OTP verification API:
  src/app/api/auth/otp/verify/route.ts              # rate limit → account lock → OTP lock → secureCompare → expiry check → one-time clear → tokens + session cookies
OTP service:
  src/lib/auth.ts                                   # generateOTP() = crypto.randomInt(100000,999999); secureCompare(); OTP_MAX_ATTEMPTS=5; OTP_EXPIRY_SECONDS=600; incrementOtpAttempts/resetOtpAttempts/isOtpLocked; account lock via recordLoginAttemptByEmail/isAccountLocked
Email service:
  src/lib/email.ts                                  # real-only chain: Resend → Gmail SMTP (nodemailer); NO test-inbox fallback
  src/lib/email-ethereal.ts                         # SMTP env-alias resolution + isRealSmtpConfigured()/isRealResendConfigured()
Email template:
  src/lib/email.ts                                  # sendOtpLoginEmail() / sendMagicLinkEmail() / sendVerificationEmail() templates (same file)
Database model:
  prisma/schema.prisma → model User                 # fields: loginOtp, loginOtpExpiry, emailVerificationOtp(+Expiry), resetOtp(+Expiry), magicLinkToken(+Expiry), otpAttemptCount, otpLockedUntil
  src/app/api/auth/otp/{request,verify}/route.ts    # Prisma calls via src/lib/db.ts
```

### Related verification tooling

```text
scripts/recover-credentials.mjs      # restore real creds from git history after a workspace reset (self-healed via ensure-env.sh)
scripts/verify-real-creds.js         # SMTP AUTH verify + Google client probe (no secret values printed)
scripts/runtime-verify-auth.mjs      # /api/auth/config + state + email-diagnostic runtime checks
scripts/auth-test-matrix.mjs         # 17-case auth test matrix (OTP loops, rate limits, admin guards)
scripts/verify-imap-inbox.py         # IMAP read of the app's own Gmail to confirm physical delivery (subjects only)
```

### Database identity & auth data path (verified 2026-09-23)

```text
DATABASE_URL (workspace): file:/home/z/my-project/db/custom.db      # gitignored SQLite; NEVER tracked after 4e5d87b
Prisma provider:          sqlite (prisma/schema.prisma)             # schema.production.prisma = postgresql for real prod
Client singleton:         src/lib/db.ts                             # one PrismaClient; FC /tmp redirect only when dir read-only
Auth data path:
  any auth route → src/lib/db.ts (single `db`) → db.user.findUnique/findFirst({ email: normalized })
    ├── found    → reuse existing row (link/upsert; subscription ensured, never duplicated)
    └── NOT found → OTP route: silent generic 200, NO mail (anti-enumeration, otp/request/route.ts:46)
                    signin route: timing-safe 401 "Invalid email or password"
                    signup / Google callback: create NEW user (+ default free trial subscription)
```

⚠️ Because the DB file is gitignored and the workspace resets periodically, a wipe makes every
previously-registered email "not found" — the exact mechanism behind the 2026-09-22/23 incident
(see LOCAL-DEVELOPMENT-SETUP.md §10.7). Mitigation: `scripts/db-safety.mjs` (boot-time snapshot
via ensure-env.sh; dual-gated restore).

**Authoritative DB/recovery docs:** DATABASE-RECOVERY-AND-SAFETY.md (architecture, backup
policy, RPO/RTO), SUBSCRIPTION-DATA-PERSISTENCE.md (identity/credit lifecycle invariants),
DATABASE-DR-RUNBOOK.md (emergency procedures). Recovery verification:
`scripts/verify-recovery.cjs` (13 checks) + `src/__tests__/persistence/subscription-persistence.test.ts` (9 invariants).

### Credit path (verified 2026-09-23)

```text
User (plan, isTrial) → Subscription (plan/status/creditsTotal/creditsUsed/creditsRemaining)
  creation defaults: prisma/schema.prisma  User.credits @default(50), Subscription.creditsTotal @default(50)
  signup grant:      src/app/api/auth/signup/route.ts (nested subscriptions.create; trial = 14 days)
  Google grant:      src/app/api/auth/callback/google/route.ts (same defaults for new users)
  display:           src/app/api/subscriptions/current/route.ts, /api/dashboard/credit-usage
  deduction:         src/lib/credit-service.ts (deductCredits/addCredits/refundCredits/getCreditBalance)
  monthly reset:     src/app/api/cron/renew-subscriptions/route.ts (PLAN_CREDITS + ROLLOVER_MAX → resets creditsUsed, updates User.credits/creditsMonthly/rolloverCredits)
  ledger:            CreditsLedger rows written by credit-service actions (initial 50-credit default grant is implicit from schema defaults, NOT a ledger row)
```
