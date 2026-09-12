# Feature Roadmap — AcquisitionOS

> Owner: Product + Engineering. Status: Living document. Last reviewed: 2026-09-09.
> Source of truth for "shipped": the codebase (`src/`), `docs/01-overview/FEATURE-LIST.md`, and the API inventory (485 routes). Source for "in progress / planned": the worklog + this document.

## How to Read This Roadmap

- **Shipped** = works in the current build, exercised by at least one user flow. May still have bugs.
- **In Progress** = code exists but incomplete, or actively being built this sprint.
- **Planned (Next Quarter)** = scoped, prioritised, will be built in the next ~90 days.
- **Planned (Next Year)** = on the 12-month horizon, not yet scoped in detail.

Priority notation: **P0** = must do / blocks release. **P1** = should do / high impact. **P2** = nice to have / strategic.

---

## 1. Shipped (Current Features)

### Authentication & Accounts
- Email/password signup + signin with bcrypt-hashed passwords (`src/app/api/auth/signup`, `signin`)
- Email verification via OTP (`/api/auth/otp/request`, `/api/auth/otp/verify`, `/api/auth/verify-email`)
- Passwordless login OTP + Magic Link (`/api/auth/magic-link/request|verify`, `/api/auth/otp/request`)
- Google OAuth 2.0 sign-in with dynamic redirect_uri resolution (`/api/auth/google/state`, `/api/auth/callback/google`)
- JWT sessions in httpOnly cookies, refresh-token rotation, revocable sessions (`src/lib/auth.ts`)
- TOTP MFA with backup codes (`/api/auth/mfa/*`, `/api/settings/2fa/*`)
- Account lockout, known-device tracking, security alerts, login history
- Profile + avatar upload, password change, 2FA settings, session revoke-all

### Lead Discovery & Scoring
- Google Custom Search discovery (`/api/discovery/start`, `/api/leads/discover`)
- Website scraping (Cheerio) + website-quality score (`src/lib/lead-discovery/website-scorer.ts`)
- AI lead scoring (reply / conversion / urgency / revenue) with written reasoning (`src/lib/ai/scoring-engine.ts`, `/api/ai/score`, `/api/leads/ai-scores`)
- Lead enrichment, research, website re-analysis
- Lead import (CSV), export, merge, dedup, bulk operations
- Lead comparison view, lead-detail panel with timeline, notes, activities, communications, reminders

### Outreach & Messaging
- AI outreach generation (email / WhatsApp / LinkedIn / Instagram) per lead (`/api/leads/[id]/outreach`, `/api/ai/outreach/generate`)
- Outreach send to lead's email with BCC copy to user + separate confirmation email (`/api/leads/[id]/communications`)
- Email sequences / campaigns with multi-step delays (`src/lib/email-sequence-engine.ts`, `/api/outreach/*`)
- Reply intelligence: classify interested / not / meeting-request / unsubscribe, extract buying signals (`/api/reply-intelligence/*`)
- Gmail integration (OAuth, inbox sync, reply, draft, send) (`/api/gmail/*`, `src/lib/gmail-*.ts`)
- Telegram + WhatsApp (notification channels; WhatsApp is notification-only, not 2-way)
- Message templates with approval workflow
- Scheduled sends, email open / click tracking, unsubscribe handling, bounce intelligence

### Pipeline & CRM
- Pipeline tab with drag-and-drop stages (Kanban) (`src/components/dashboard/pipeline-tab.tsx`)
- Deals with custom stages, value, close date, risk assessment (`/api/deals`)
- Deal room war board, deal velocity, win-rate analytics
- Lead activities timeline, follow-up reminders
- Custom reports + report builder + scheduled reports (`/api/reports/*`)
- Executive summary dashboard, KPI dashboards, custom dashboard builder

### Meetings & Calendar
- Google Calendar OAuth connect/disconnect with real-time connection status (`/api/calendar/connect|disconnect|callback`)
- Real-time free/busy availability check (`/api/calendar/availability`, `/api/meetings/check-availability`)
- Meeting scheduling with Google Meet link generation via `conferenceData` (`/api/meetings`, `/api/calendar/events`)
- Meeting preferences (platform, working hours, days, timezone, buffer, autonomy mode)
- Meeting orchestration: detect intent in replies, propose slots, approve/assisted/autonomous modes
- Meeting reminders, agenda, prep notes, follow-up emails, action-items extraction, sentiment, objections

### AI Assistant & Copilot
- In-app AI chat assistant with lead context, sales-coach mode (`src/components/dashboard/assistant-tab.tsx`, `/api/ai/chat`)
- Streaming chat (`/api/ai/chat/stream`), cancel
- RAG: ingest URLs / CSVs / text, context retrieval, vector search (`/api/ai/rag/*`, `/api/ai/vector-search`)
- Prompt templates + management (`/api/ai/prompts`, `src/lib/ai/prompt-manager.ts`)
- AI cost tracking per user / per action (`/api/ai/costs`, `src/lib/ai-cost-tracker.ts`)
- AI provider fallback (multi-provider resilience) (`src/lib/ai-provider-fallback.ts`)

### Billing & Credits
- Plan tiers: Free / Pro / Elite with entitlements + plan gates (`src/lib/plan-gates.ts`, `src/lib/entitlement-service.ts`)
- Credits system metering AI actions + monthly grant + rollover + add-on packs (`src/lib/credit-service.ts`)
- Stripe checkout (real, no mocks) + webhook → atomic subscription activation (`src/lib/payment-service.ts`, `src/lib/stripe-service.ts`)
- Razorpay for India + GST invoices + tax handling (`src/lib/razorpay-service.ts`, `src/lib/gst-service.ts`)
- Coupon validation, payment recovery (dunning), failed-payment modal, past-due banner
- Invoice generation + PDF + email delivery (`src/lib/invoice-pdf-service.ts`)
- Billing analytics, refund processing, subscription cancel / downgrade preview

### Workflows & Automation
- Visual workflow builder + 30+ templates (`src/components/dashboard/workflow-builder.tsx`, `src/lib/workflow-templates.ts`)
- Workflow triggers, execution engine, step-by-step logs, pause/resume/cancel/retry
- Dead-letter queue for failed workflow executions
- Autonomous SDR pipeline + autonomous outreach engine with autonomy modes
- Workflow analytics, metrics, execution history

### Analytics & Insights
- Overview dashboard with live stats, revenue forecast, funnel velocity, pipeline health
- Competitor intelligence (discover, analyze, snapshots, SEO, pricing, reviews, social) (`/api/competitors/*`)
- Hot-lead detection + hot-lead scanning cron
- Anomaly detection, predictive analytics, auto-insight engine
- Benchmarking, territory map, churn-risk center, engagement-score center
- Custom analytics formulas, shareable dashboards (token-protected)
- Weekly digest reports

### Integrations
- Google OAuth (sign-in + Gmail + Calendar), Gmail SMTP, Resend
- Telegram (bot notifications), WhatsApp via Twilio (notifications only)
- Stripe, Razorpay
- Google Search API (Custom Search), Z-AI provider (chat/embeddings)
- Integration marketplace UI + integration health monitor

### Platform / Ops
- Admin endpoints: billing, feedback, backups, refunds (`/api/admin/*`)
- Feedback + crash-report system with AI triage (`src/lib/feedback/*`)
- Observability: metrics, traces, logs, health, API monitor (`src/lib/observability/*`)
- OpenTelemetry instrumentation, Sentry integration
- 12 cron endpoints (expire-api-keys, sdr-cycle, autonomous-outreach, hot-lead-scan, sequence-processing, meeting-reminders, credit-renewal, renew-subscriptions, end-of-period, payment-reconciliation, process-gmail-replies, process-sequences)
- API keys with scopes, rate limits, per-month lead quotas, usage analytics, rotate/revoke
- Public API docs page (`/api-docs`)
- Compliance: cookie consent, GDPR / DPDP / legal pages, data retention, data export, account deletion request
- Accessibility: a11y utils, responsive validator, audit panel, keyboard shortcuts
- Real-time: WebSocket + SSE + live updates (leads, messages, payments, AI), notification center with polling
- White-label / org branding (half-built)

---

## 2. In Progress (This Sprint)

| Feature | Status | Why | Priority |
|---|---|---|---|
| **Magic Link direct-auth + correct public URL** | In progress — verify route + request route fixed to use public APP_URL | Reported bug: link opened localhost:3000 | P0 |
| **Google Sign-In for already-registered emails** | In progress — backfill + reactivate logic added | Reported bug: "Google sign-in failed" for registered users | P0 |
| **Google Calendar real-time config + Meet link** | In progress — Meeting Preferences dialog now has Connect/Disconnect/Test-availability | Required: real-time calendar config + Meet link on schedule | P0 |
| **Outreach email actual delivery + user copy** | In progress — communications route now sends via SMTP + BCC + confirmation email | Reported bug: outreach only logged, never delivered | P0 |
| **API Key modal responsive + no outside-click close** | In progress — modal now `max-h-[calc(100vh-2rem)] overflow-y-auto` + `onPointerDownOutside` preventDefault | Reported bug: modal overlapped nav, closed on outside click | P0 |
| **Assistant floating-button overlap with input** | In progress — FABs now `return null` on assistant tab | Reported bug: FABs cover Send button | P0 |
| **"Changes every 3 minutes" (keepalive blind restart)** | In progress — keepalive-v2.sh rewritten to be health-check based | Reported bug: server restarted every 5 min | P0 |
| **API versioning (`/api/v1/...`)** | Scoping | Liam persona churn risk; first breaking change will cost users | P1 |
| **Outbound webhooks** (lead.replied, meeting.booked, credits.low) | Scoping | Liam persona; currently must poll | P1 |

---

## 3. Planned — Next Quarter (Q4 2026)

### P0 — Must Ship

1. **API versioning v1.** Wrap the current API surface in `/api/v1/…` with a stability contract. Current unversioned routes remain as deprecated aliases for 6 months. *Why: first paying API user (Liam) will churn on the first breaking change otherwise.*

2. **Outbound webhooks.** Emit signed webhooks for `lead.created`, `lead.replied`, `meeting.booked`, `credits.low`, `subscription.cancelled`. Admin UI to register endpoints + view delivery logs + replay. *Why: API integrators (Marcus, Liam) need push, not poll.*

3. **Deliverability dashboard.** Per-user sender-reputation view: open rate, reply rate, bounce rate, spam-rate, with warm-up guidance and a "stop sending if X" threshold. *Why: Prabhat's #1 churn risk is a deliverability disaster; he needs to see it coming.*

4. **Weekly digest email (cron).** Monday-morning email per user: "Last week: N leads scored, N outreach sent, N replies, N meetings booked. This week's suggested actions: …". *Why: Prabhat forgets to log in; the value must come to him.*

5. **Mobile-responsive dashboard audit + fixes.** The dashboard renders on mobile but several tabs (pipeline, workflow builder, report builder) are not genuinely usable on a phone. *Why: Sarah works from cafes/trains; Marcus's SDRs are mobile-first.*

### P1 — Should Ship

6. **Vertical templates v1 (web-design agencies).** Pre-built discovery queries, scoring weights, outreach templates, and report templates for "web-design agencies selling to local businesses." *Why: first named vertical from the vision; Prabhat is the template.*

7. **Sequence analytics per step.** Show open/reply/booked rate per step in a sequence so users can see which step is losing people. *Why: Sarah and Marcus both optimize sequences; they need step-level signal.*

8. **Inbound event subscription UI.** Let users register their own webhook endpoint (not just the platform's internal workflow webhooks). *Why: completes the webhook story for Liam.*

9. **Cost-per-tenant dashboard (admin).** AI cost, SMTP cost, search-API cost broken down per tenant so Ananya can spot the abuser. *Why: Ananya's #3 churn risk is cost > MRR.*

10. **GS1/GST invoice polish + Indian tax report.** Make the Indian invoice path flawless (GSTIN, HSN, place-of-supply, reverse-charge). *Why: Prabhat needs this for tax credit; it's a localization moat.*

### P2 — Nice to Have

11. **White-label GA.** Promote the half-built white-label / org-branding to production for agency partners.
12. **Report scheduler UI overhaul.** The report builder is powerful but the scheduling UX is rough.
13. **Accessibility audit remediation.** Run the in-built a11y audit panel against every tab and fix the top findings.

---

## 4. Planned — Next Year (2026–2027)

### Supply-side Intelligence Layer
- **Niche-conversion benchmarks.** Aggregated, anonymised data: "the average plumber's website scores 42/100; the average plumber replies to email in 9 hours." Sold as a separate data product.
- **Service-recommendation engine.** Suggests *what to sell* based on which niches convert best for this user.
- **Competitor pricing intelligence.** Track competitors' pricing over time, surface underpricing opportunities.

### Delivery / Lifecycle Extension
- **AI-generated proposals.** After a meeting, generate a draft SOW / proposal from the meeting notes.
- **E-signature.** Sign the proposal in-app. (Likely an integration with an existing e-sign provider rather than building crypto from scratch.)
- **Invoice + payment follow-up automation.** Post-meeting, auto-generate the invoice, auto-send, auto-chase.

### Platform / Scale
- **PostgreSQL migration.** The schema is already annotated for SQLite→PostgreSQL migration. Execute it before crossing ~500 paying accounts. *Why: SQLite locks the whole DB on writes; we will hit write contention.*
- **Background job queue (Redis + BullMQ or similar).** Move long-running jobs (discovery, scraping, AI batch) off the request path. *Why: at scale, a 30-second discovery job will time out the HTTP request.*
- **Multi-region deployment** for India + US data residency.
- **Public API SDKs** (JS + Python) generated from the OpenAPI spec.
- **Marketplace for vertical templates** — certified partners sell vertical packs.

### Compliance
- **SOC 2 Type 1** readiness (the org/role/audit-log/backup infrastructure is largely there).
- **DPDP Act** full alignment (data localisation, consent flow, data-fiduciary registration).
- **GDPR DPO contact** published + DSAR automation via the existing GdprRequest model.

---

## 5. Explicitly NOT on the Roadmap

- **A native mobile app.** Responsive web only for the 12-month horizon. Mobile apps are a 3-year consideration.
- **A pre-built contact database** (Apollo / ZoomInfo model). We discover in real time. This is positioning, not a gap.
- **Replacing the user's CRM.** AcquisitionOS feeds the CRM; it doesn't replace Salesforce/HubSpot.
- **A free tier without limits.** Credits gate AI cost; the free tier will always have limits.
- **Bulk cold-email sending** (10k+/day). We are personalization-first; volume play is a different business.

---

## 6. Roadmap Cadence

- **Quarterly review** of this document by Product + Engineering.
- **Monthly** sprint planning pulls from "In Progress" + top of "Next Quarter."
- **Weekly** worklog updates track actual progress; this roadmap is reconciled to the worklog monthly.
- Any item that slips two quarters is either re-prioritised or explicitly dropped (not silently ignored).

---

*See also: [PRODUCT-VISION.md](PRODUCT-VISION.md), [COMPETITIVE-ANALYSIS.md](COMPETITIVE-ANALYSIS.md), [PRICING-STRATEGY.md](PRICING-STRATEGY.md), [CHANGELOG.md](CHANGELOG.md).*
