# AcquisitionOS — File Structure

> Generated from the actual tree. Line counts approximate. "…" inside `src/app/api` means many more route files — the full list is in `06-api-reference/API-ROUTES.md`.

```
/home/z/my-project
│
├── package.json                 # App manifest (name "vantage" v0.2.0): scripts, deps, versions
├── next.config.ts               # Next.js config (standalone output for deploys)
├── tsconfig.json                # TypeScript config
├── eslint.config.mjs            # ESLint 9 flat config
├── vitest.config.ts             # Vitest unit-test config
├── next-env.d.ts                # Next.js type shims
├── components.json              # shadcn/ui generator config
├── dev.log                      # Dev server log (sandbox)
├── start.js                     # Production start wrapper used by `npm start`
│
├── .env                         # Local env file (WIPED periodically in GLM sandbox — see docs 03/04)
├── .env.example                 # Template
├── ensure-env.sh                # AUTHORITATIVE env restore template (PRESERVE_KEYS mechanism)
├── keepalive-v2.sh              # Cron runbook: restore env + restart dev server
├── middleware-disabled note     # src/middleware.ts disabled in sandbox → middleware.ts.disabled
│
├── prisma/
│   ├── schema.prisma            # 104 models, SQLite datasource, PostgreSQL migration annotations
│   └── migrations/              # Migration history (db push used in dev)
│
├── scripts/
│   ├── clean-standalone.js      # Post-build cleanup for standalone output
│   ├── security-scan.ts         # `npm run security:scan`
│   ├── backup/                  # backup.sh / restore.sh (npm run backup / backup:restore)
│   ├── migrate-to-postgresql.sh # SQLite → PostgreSQL migration helper
│   └── smtp-verify.js           # Standalone SMTP verify() test script
│
├── public/                      # Static assets (icons, images, manifest)
│
├── docs/                        # THIS documentation suite (README.md = index)
│
└── src/
    ├── instrumentation.ts       # Server boot hook: env validation, telemetry init
    ├── middleware.ts.disabled   # Edge middleware (disabled in GLM sandbox — see 03/09 docs)
    ├── app/                     # ── NEXT.JS APP ROUTER ──
    │   ├── layout.tsx           # Root layout, providers, fonts
    │   ├── page.tsx             # '/' → <AuthGate/> SPA dashboard shell
    │   ├── error.tsx / loading.tsx / not-found.tsx
    │   ├── globals.css          # Tailwind 4 + design tokens
    │   ├── (marketing)/         # privacy, terms (public marketing pages)
    │   ├── (public)/legal/      # legal pages
    │   ├── auth/
    │   │   ├── signin/page.tsx  # Sign-in page (all auth methods)
    │   │   └── signup/page.tsx  # Sign-up page
    │   ├── dashboard/           # Focused sub-routes of the SPA
    │   │   ├── billing/         #   billing & invoices UI
    │   │   ├── calendar/        #   calendar view
    │   │   ├── meetings/        #   meetings view
    │   │   └── feedback/        #   my feedback reports
    │   ├── admin/feedback/      # Admin: feedback moderation console
    │   ├── payment/success/     # Post-checkout landing
    │   └── api/                 # 485 route files — grouped by domain:
    │       ├── auth/            #   signup/signin/otp/magic-link/google/mfa/sessions…
    │       ├── admin/           #   backups, billing ops, feedback moderation, refunds
    │       ├── ai/              #   chat(+stream/cancel), analyze, score, outreach gen, RAG, costs
    │       ├── analytics/       #   predictions, insights, anomalies, formulas, shares
    │       ├── autonomous/      #   SDR campaigns, research, reply classify, pipeline moves
    │       ├── billing|payments/ #  checkout, webhooks(stripe/razorpay), invoices, refunds, SSE
    │       ├── calendar/        #   google calendar connect/events/availability/watch/webhook
    │       ├── gmail/           #   oauth, inbox, send, pubsub webhook, tracking, replies
    │       ├── leads/           #   CRUD, discover, import/export/merge, scores, activities
    │       ├── discovery/       #   start/status of discovery jobs
    │       ├── outreach|sequences/ # send/batch/enroll + multi-step sequences
    │       ├── meetings/        #   intent, slots, lifecycle, prep, reminders, approvals
    │       ├── notifications/   #   list/read/archive, push subscribe, vapid keys
    │       ├── whatsapp/        #   twilio + meta cloud api connect/send/webhook
    │       ├── telegram/        #   connect/send/status/webhook
    │       ├── workflows/       #   definitions, executions, DLQ, templates, webhooks, metrics
    │       ├── cron/            #   12 scheduler endpoints (CRON_SECRET bearer)
    │       ├── dashboard/       #   55+ widget data endpoints for the SPA
    │       ├── health/          #   liveness, deep health, db ping
    │       └── …                #   competitors, gdpr, audit, reports, messaging, events, ws
    │
    ├── components/              # ── REACT COMPONENTS ──
    │   ├── providers.tsx        # App-wide providers (theme, query, toast)
    │   ├── error-boundary.tsx   # Crash reporting boundary → /api/feedback/crash
    │   ├── ui/                  # 50 shadcn-style primitives (button, dialog, table…)
    │   ├── dashboard/           # 181 dashboard components:
    │   │   ├── auth-gate.tsx    #   SPA shell: redirects unauth users, loads main layout
    │   │   ├── dashboard-layout.tsx, command-center.tsx, command-palette.tsx
    │   │   ├── ai-*.tsx         #   copilot panel, outreach dialog, scoring, chat bubble
    │   │   ├── credit-*.tsx     #   display, gates, usage breakdown, cost badges
    │   │   ├── *-tab.tsx        #   assistant/competitor/leads/pipeline tab shells
    │   │   └── …                #   billing-page, analytics, imports, sharing, builder…
    │   ├── meetings/            # Meeting UI components
    │   ├── feedback/            # Feedback widget + report dialogs
    │   └── cookie-consent-banner.tsx
    │
    ├── hooks/                   # ── CLIENT HOOKS ──
    │   ├── use-auth.ts          # Session state, login/logout, token refresh
    │   ├── use-credits.ts / use-entitlements.ts
    │   ├── use-live-*.ts        # SSE/WebSocket live feeds (leads, payments, messages, AI)
    │   ├── use-payment*.ts      # Checkout + SSE payment status
    │   ├── use-notifications.ts, use-toast.ts, use-websocket.ts, use-sse.ts
    │   └── use-responsive.ts, use-mobile.ts, use-keyboard-shortcuts.ts
    │
    ├── lib/                     # ── SERVICE LAYER (business logic) ──
    │   ├── db.ts / db-pool.ts   # Prisma client singleton + pooling
    │   ├── auth.ts              # JWT sessions (JWT_SECRET/JWT_REFRESH_SECRET), getAuthUser()
    │   ├── auth-middleware.ts / rbac.ts / entitlement-middleware.ts / plan-gates.ts
    │   ├── email.ts / email-ethereal.ts   # Transport chain: Resend → Gmail SMTP → Ethereal
    │   ├── google-oauth.ts      # Calendar/Gmail OAuth helpers
    │   ├── oauth-relay.ts / oauth-state-store.ts  # Cross-domain OAuth fallback
    │   ├── stripe-service.ts / razorpay-service.ts / payment-service.ts
    │   ├── credit-service.ts / credit-costs.ts / entitlement-service.ts
    │   ├── subscription-service.ts / invoice-*.ts / refund-service.ts / coupon-service.ts
    │   ├── ai/                  # provider, chat, scoring, analysis, outreach, prompts, credits
    │   ├── ai-provider-fallback.ts / ai-cost-tracker.ts
    │   ├── lead-discovery/      # discovery-engine, website-scorer, company-researcher,
    │   │                        # outreach-sender, reply-handler
    │   ├── meeting/             # autonomy-engine, meeting-service, email, reminders, crm-sync
    │   ├── calendar/            # calendar-service, calendar-intelligence
    │   ├── gmail-*.ts           # 10+ services: oauth, inbox, delivery, replies, pubsub, tracking
    │   ├── notification-engine.ts / notification-service.ts
    │   ├── notification-channels/ # gmail, push, telegram, whatsapp channel adapters
    │   ├── telegram-service.ts / whatsapp-service.ts
    │   ├── workflow-*.ts        # engine, executor, triggers, actions, DLQ, metrics, templates
    │   ├── lead-*               # enrichment, dedup, import/export, audit services
    │   ├── reply-intelligence*.ts / hot-lead-*.ts / bounce-intelligence.ts
    │   ├── competitor-intelligence-service.ts / gap-analysis-service.ts
    │   ├── rag-service.ts / rag-enhanced-service.ts / vector-search-service.ts
    │   ├── realtime-*.ts / sse-manager.ts / websocket.ts / redis-pubsub-service.ts
    │   ├── security/            # rate-limiter, csrf, cors, headers, input validation, webhooks
    │   ├── compliance/retention.ts, gdpr/data-export.ts
    │   ├── encryption.ts / crypto.ts / device-fingerprint.ts / suspicious-login-service.ts
    │   ├── analytics-engine.ts / predictive-analytics-engine.ts / anomaly-detection-engine.ts
    │   ├── proxy-rotation-service.ts / distributed-scraping-service.ts / screenshot-service.ts
    │   ├── env-validation.ts / env-safeguard.ts / logger.ts / error-tracking.ts
    │   └── …                    # ~180 modules total (see KT-DOCUMENT for map)
    │
    └── __tests__/               # Vitest suites (api/, lib/, helpers/)
```

## Count summary

| Area | Path | Count |
|---|---|---|
| API route files | `src/app/api/**/route.ts` | 485 |
| Prisma models | `prisma/schema.prisma` | 104 |
| Dashboard components | `src/components/dashboard/` | 181 |
| UI primitives | `src/components/ui/` | 50 |
| Service modules | `src/lib/*.ts` + subfolders | ~180 |
| Client hooks | `src/hooks/` | 24 |
| Cron endpoints | `src/app/api/cron/` | 12 |
