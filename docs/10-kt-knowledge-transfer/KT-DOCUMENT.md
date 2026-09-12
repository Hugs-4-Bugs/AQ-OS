# Knowledge Transfer Document (KT)

Complete handover for any developer taking over AcquisitionOS. Read top-to-bottom once; keep as reference after.

---

## 1. Project Overview & Business Context

**Product:** AcquisitionOS (package name `vantage`, v0.2.0) — an AI-powered B2B client-acquisition SaaS. It finds local businesses with weak websites, scores them with AI, generates personalized outreach, automates reply handling and meeting scheduling, and sells itself as a credits-metered subscription (free/pro/elite).

**Business model:** SaaS subscriptions + credit add-ons. Credits meter AI-heavy actions (discovery, analysis, outreach generation, chat) so cost scales with revenue. Razorpay exists specifically for Indian customers (GST capture, INR pricing); Stripe is the global primary.

**Current phase:** feature-complete for the core loop and operating in the GLM development sandbox. Payments and chat channels (WhatsApp/Telegram) are coded but credential-gated. Production deployment target recommended: Railway (docs included).

## 2. Tech Stack With Versions (from `package.json`)

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js App Router | ^16.1.1 |
| UI | React 19, Tailwind CSS 4, Radix UI (30 pkgs), 50 shadcn-style primitives, 181 dashboard components | ^19 / ^4 |
| Data | Prisma ^6.19.2 (SQLite now; PostgreSQL-annotated), TanStack Query/Table, Zustand ^5, Zod ^4 | — |
| Auth | Custom JWT via jose ^6 + jsonwebtoken ^9, bcryptjs ^3 (next-auth ^4 present but not the runtime) | — |
| Email | nodemailer ^8 (Gmail SMTP chain), Resend ^6 optional, Ethereal dev sink | — |
| Payments | stripe ^22, razorpay ^2 | — |
| AI | z-ai-web-dev-sdk ^0.0.18 primary; OpenAI-compatible fallback | — |
| Scraping | cheerio ^1.2, sharp ^0.34, custom proxy rotation | — |
| Realtime | socket.io-client ^4, custom SSE, ioredis ^5 optional | — |
| Observability | OpenTelemetry suites, custom logger/error-tracking | — |
| Tests | Vitest ^4 + Testing Library + MSW ^2 | — |
| Runtime | Node 20 (dev runs via bun in sandbox) | — |

## 3. Local Dev From Scratch (condensed)

Full guide: `03-setup-and-deployment/LOCAL-SETUP.md`.

```bash
npm install                 # runs prisma generate via postinstall
cp .env.example .env        # minimum: DATABASE_URL=file:./dev.db, JWT_SECRET, JWT_REFRESH_SECRET,
                            # APP_URL/NEXT_PUBLIC_APP_URL=http://localhost:3000, dev auth flags
npm run db:push             # create SQLite db with all 104 tables
npm run dev                 # http://localhost:3000 (AuthGate → signup)
```

Optional integrations (Google login, SMTP, discovery, payments) = env vars per `04-secrets-and-configuration/ALL-SECRETS.md`.

## 4. External Services Used and Why

| Service | Purpose | Env/Config | Status here |
|---|---|---|---|
| Google Cloud OAuth | Sign-in + Calendar/Gmail integrations | `GOOGLE_CLIENT_ID/SECRET` + per-domain redirect URI registration | Set; preview URI needs re-registration per session |
| Gmail SMTP | Outbound email (OTP, outreach, invoices, alerts) | `SMTP_USER/SMTP_PASSWORD/EMAIL_FROM` | Set, verified AUTH SUCCESS |
| Google Custom Search | Lead discovery web search | `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID`/`GOOGLE_SEARCH_CX` | Set |
| SerpAPI | Discovery fallback | `SERPAPI_KEY` | Not set (optional) |
| Stripe | Global payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, publishable (optional) | NOT set → billing inactive |
| Razorpay | Indian payments (GST) | per-code config (service) | Not set → inactive |
| Z-AI SDK | AI provider (no key in GLM) | — | Working |
| OpenAI-compatible | AI fallback | `OPENAI_API_KEY`, `OPENAI_MODEL` | Not set (optional) |
| Twilio / Meta WhatsApp | Notification channel | per-user DB creds (encrypted) + optional envs | Not set → channel off |
| Telegram Bot | Notification channel | per-user `TelegramConfig` (+ optional `TELEGRAM_BOT_TOKEN`) | Not set → channel off |
| Resend | Tier-1 email transport | `RESEND_API_KEY` | Not set (SMTP covers it) |
| Redis | Multi-instance pub/sub | `REDIS_URL` | Not set (single instance ok) |
| Sentry / OTLP | Error/trace export | DSN/OTEL vars | Not set (optional) |

## 5. Database Schema Explanation

**104 Prisma models** — full field-level reference: `02-architecture/DATABASE-SCHEMA.md` (generated from the schema). Mental map:

- **Identity:** `User` root; `UserSession`/`LoginHistory`/`MfaConfig`/`KnownDevice`/`SecurityAlert` for auth security; `ApiKey` for machine access.
- **Tenancy:** `Organization` + `OrgMember`/`OrgInvitation` (roles owner/admin/member/viewer).
- **Money:** `Subscription` (status lifecycle) ← `PaymentOrder` (idempotencyKey unique) ← `PaymentWebhook` (eventId unique = idempotency) ← `Invoice` (1:1 order); credits: `CreditsLedger` (append-only), `CreditAddon`, `UsageTracking`; `Coupon`, `TaxRate`, `PlanEntitlement`, `FeatureFlag`.
- **Acquisition core:** `DiscoveryJob` → `Lead` (46 fields: business/contact/AI scores/stage) ← `LeadAnalysis` (1:1 deep analysis) / `LeadScore` / `LeadNote` / `LeadActivity` / `FollowUpReminder` / `Deal` / `Communication` (legacy CRM).
- **Outreach:** `OutreachMessage`, `OutreachSequence` → `SequenceStep`/`SequenceEnrollment`; mailbox: `EmailAccount` → `EmailThread` → `EmailMessage`, `EmailBounce`, `EmailUnsubscribe`; tracking: `EmailOpenEvent/EmailClickEvent/EmailTrackingLink`, `ScheduledEmail`.
- **Messaging:** `Conversation`/`ConversationMessage`, cross-channel `MessageDelivery` + `DeliveryDeadLetter`, `MessageBroadcast`/`BroadcastTarget`, `MessageTemplate`, `MediaFile`.
- **Channels:** `TelegramConfig`, `WhatsappConfig` (encrypted creds per user).
- **Meetings:** `Meeting` (lifecycle) + `MeetingIntentLog` + `MeetingReminder`; `GoogleCalendarToken`/`CalendarWatch`.
- **AI:** `AiChatSession`/`AiChatMessage`, `AiCostRecord`, `PromptTemplate`, `FileContext`, `RagDocument`.
- **Automation:** `WorkflowDefinition` → `WorkflowStep`/`WorkflowExecution` → `WorkflowLog` (+ DLQ via code), `WorkflowTemplate`.
- **Ops/compliance:** `AuditLog`, `SystemEvent`, `SystemMetrics`, `GdprRequest`/`DataExport`, `OnboardingProgress`, `FeedbackReport` family, `CrashReport`, analytics suite (`AnalyticsPrediction/Insight/Anomaly/Benchmark/Formula/Snapshot`, `DashboardShare`), scraping infra (`ProxyEndpoint`, `ScrapingMetric`), realtime registries (`RealtimeEvent`, `WsConnection`, `SseConnection`).

## 6. Key Architectural Decisions & Why

1. **Custom JWT auth instead of next-auth runtime** — need for OTP/magic/MFA/session-revocation semantics mapped to `UserSession`; next-auth stays as a dependency for interop but the code paths are ours. Consequence: `JWT_SECRET`/`JWT_REFRESH_SECRET` are the real secrets (no `AUTH_SECRET`).
2. **Single SPA dashboard behind `AuthGate` at `/`** — one client-rendered shell keeps 181 components cohesive; focused sub-routes (`/dashboard/billing` etc.) exist where deep linking matters.
3. **Thin routes / fat `src/lib` services** — 485 route files mostly delegate to ~180 service modules; business logic is testable without HTTP.
4. **Dynamic OAuth origin resolution (request headers over env)** — the sandbox serves multiple domains over time (preview changes per session, prod differs); hardcoding APP_URL broke login across domains. Consequence: every new domain still needs GCP redirect registration.
5. **Webhook idempotency via unique DB keys** — `PaymentWebhook.eventId @unique` + `PaymentOrder.idempotencyKey @unique` make Stripe retries safe by construction, not by lock files.
6. **Credits as a ledger** — `CreditsLedger` append-only rows (never just `UPDATE balance`) give auditability and support renewals/rollover/add-ons.
7. **Transport chain for email** (Resend → Gmail SMTP → Ethereal) — dev works with zero config; prod upgrades without code changes.
8. **SQLite in dev with PostgreSQL annotations in the schema** — zero-infra local dev; the migration path (phase order, backfills, FK checks) is documented in the schema header.
9. **Middleware disabled in the sandbox** — GLM couldn't run edge middleware reliably; per-route auth compensates. Re-enable for self-hosted prod after verifying.
10. **Z-AI as default AI provider** — zero-key AI inside the GLM platform; explicit OpenAI-compatible fallback keeps portability.

## 7. Known Technical Debt & Incomplete Features

| Item | Detail |
|---|---|
| Payments not configured | Stripe/Razorpay coded, keys unset — billing journeys dead-end until configured |
| Channels inactive | Telegram/WhatsApp/Push coded; creds unset (`TELEGRAM_BOT_TOKEN`, Twilio/Meta, VAPID) |
| Gmail inbox sync | Requires Google OAuth consent per user + Pub/Sub setup per deployment; not exercised yet |
| Legacy CRM models | `Communication`/`Deal`/`Insight`/wide `UserSettings` kept for existing UI ("LEGACY COMPATIBILITY" section in schema) |
| JSON-in-String columns | SQLite JSON stored as TEXT — schema notes recommend Prisma `Json` when moving to PostgreSQL |
| `competitor-intelligence-service.ts.bak` | Stray backup file in src/lib — delete after review |
| Observability plumbing | OTel wired but no collector endpoint configured |
| i18n | `next-intl` installed, not wired |
| Tests | Vitest suites exist (`src/__tests__`) but coverage is partial relative to 485 routes |
| Lint | ESLint reports errors in files outside the recent fix scope (pre-existing) |

## 8. Features: Working vs Broken vs Partial

Authoritative per-feature matrix with 118 entries: `01-overview/FEATURE-LIST.md`. Snapshot: **88 working** (auth incl. Google OAuth, SMTP email, discovery, scoring, outreach + sequences, meeting logic, credits, AI, dashboard, workflows, feedback, admin), **27 partial** (credential-gated: Stripe, Razorpay, WhatsApp, Telegram, push, Gmail inbox, Sentry/OTLP, Redis), **3 planned**.

## 9. What Needs Fixing Before Public Launch

Priority order (see also `LAUNCH-CHECKLIST.md`):

1. Set Stripe keys + webhook → test end-to-end in live mode (billing is revenue; everything else is secondary).
2. PostgreSQL migration (`prisma/schema.prisma` provider + `scripts/migrate-to-postgresql.sh`) — SQLite won't survive real concurrency.
3. Deploy to Railway (always-on, stable domain); register production redirect URI in GCP; publish OAuth consent (verification if sensitive scopes).
4. Rotate ALL dev secrets (`JWT_*`, `CRON_SECRET`, SMTP app password, Google secret); set real `GMAIL_ENCRYPTION_KEY`.
5. Remove dev flags (`AUTH_DEV_MODE`, `AUTH_BYPASS_EMAIL`, `AUTH_DEV_OTP_IN_*`) from production env.
6. Rate limiting review on public routes (`src/lib/security/rate-limiter.ts` coverage), cron scheduling for the 12 `/api/cron/*` endpoints.
7. Error monitoring (Sentry DSN) + backups schedule (`npm run backup` cron).
8. Scrub any test credentials from code/env; run `npm run security:scan`.

## 10. Codebase Conventions & Patterns

- **Routes:** `src/app/api/<domain>/route.ts` exporting `GET/POST/...`; auth via `getAuthUser(request)`; errors `{error}` + status; Zod for body validation.
- **Services:** `src/lib/<feature>-service.ts`; engines (`workflow-engine`, `email-sequence-engine`) own state machines; stores (`*-store.ts`) wrap persistence corners.
- **Client:** hooks in `src/hooks` (data + live feeds); TanStack Query for server state; Zustand for local UI state; components co-located by feature under `src/components/<area>`.
- **Credits:** every AI action goes through `credit-enforcement` + `credit-costs` — new AI features MUST register a cost.
- **Notifications:** new event types route through `notification-engine` with `NotificationPreferences` honored; don't send channel-direct.
- **Realtime:** emit via `realtime-event-bus`; subscribe over `/api/events/*` SSE.
- **Logging:** structured prefixes (`[SMTP-Env-Diag]`, cron tags); never log secret values (aliases print SET/MISSING).
- **Env reading:** prefer canonical names documented in ALL-SECRETS.md; add alias chains only when platform variance demands.

## 11. Where to Find Things (codebase map)

| Need | Location |
|---|---|
| Auth logic / session cookie names | `src/lib/auth.ts`, `src/app/api/auth/**` |
| OAuth dynamic redirect fix | `src/app/api/auth/google/state/route.ts` (`resolvePublicOrigin`), callback reads state JSON |
| SMTP chain + aliases | `src/lib/email-ethereal.ts`, `src/lib/email.ts` |
| Stripe checkout/webhook/fulfillment | `src/lib/stripe-service.ts`, `/api/payments/**` |
| Credits costs/enforcement | `src/lib/credit-costs.ts`, `credit-enforcement.ts`, `credit-service.ts` |
| Discovery pipeline | `src/lib/lead-discovery/*`, `/api/discovery/*` |
| Meeting orchestration | `src/lib/meeting/*`, `/api/meetings/*` |
| Notification fan-out | `src/lib/notification-engine.ts`, `src/lib/notification-channels/*` |
| Workflow engine | `src/lib/workflow-*.ts`, `/api/workflows/*` |
| Rate limiting/security | `src/lib/security/*` |
| DB singleton | `src/lib/db.ts` |
| Env restore template (sandbox) | `ensure-env.sh` (+ `keepalive-v2.sh` runbook) |
| Backup/restore | `scripts/backup/` |
| Tests | `src/__tests__/` |

## 12. Contact & Credentials Handover Checklist

- [ ] Transfer: domain/DNS, Google Cloud project (owner), Stripe account, Twilio/Meta apps, Resend, hosting (Railway/Vercel) access
- [ ] Secrets handed over via password manager (NEVER in chat/docs): `JWT_SECRET`, `JWT_REFRESH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `SMTP_USER/SMTP_PASSWORD`, `CRON_SECRET`, `STRIPE_*`, `DATABASE_URL`
- [ ] GCP: confirm which redirect URIs are registered; add the production domain
- [ ] Stripe: webhook endpoint registered + secret stored; test-mode data flagged
- [ ] Gmail App Password: revoke the old one after handover, issue a new one to the new owner
- [ ] Database: backup taken (`npm run backup`) and restored-once-verified by the new owner
- [ ] This docs suite reviewed; `FEATURE-LIST.md` status matrix walked through with the new developer
