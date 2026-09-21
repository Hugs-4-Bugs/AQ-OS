# API Reference — AcquisitionOS

> Owner: Engineering. Status: Living document. Last reviewed: 2026-09-09.
> Source of truth: `src/app/api/` (485 route files). Full machine-readable inventory: `scripts/api-inventory.json` + the in-app `/api-docs` page.

## How to Read This Reference

- Every API route lives under `/api/...` (relative path only — absolute paths are forbidden by the gateway).
- **Auth:** most routes require a session cookie (httpOnly JWT) **or** a Bearer API key. Routes marked `🔐 Auth required` need one of the two. Routes marked `🌐 Public` are unauthenticated. Routes marked `🛡️ Admin` require the `admin` role.
- **Rate limits:** per-IP for auth routes (5/min), per-API-key for the public API (Free 50/hr, Pro 500/hr, Elite 2000/hr). Response headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- **Errors:** standard HTTP status codes + JSON `{ error: string, code?: string }`. See [ERROR-CODES.md](ERROR-CODES.md) for the full catalog.
- **Examples:** `curl` examples use `localhost` for illustration; in the deployed app, use relative paths from the browser or the public preview domain.

This document is a **category-organised summary** of all 485 routes. The exhaustive route-by-route table is in [`docs/06-api-reference/API-ROUTES.md`](../06-api-reference/API-ROUTES.md) (generated from source). Below is the navigable reference: the categories, the key routes per category, their methods, auth, and a one-line description.

---

## 1. Authentication (`/api/auth/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | 🌐 | Email/password signup; stores lowercased email; sends verification OTP |
| POST | `/api/auth/signin` | 🌐 | Email/password sign-in; gates on `emailVerified` |
| POST | `/api/auth/signout` | 🔐 | Revoke current session; clears cookies |
| GET | `/api/auth/me` | 🔐 | Current user from `access_token` cookie |
| POST | `/api/auth/refresh` | 🔐 (refresh cookie) | Rotate access + refresh tokens |
| GET | `/api/auth/config` | 🌐 | `{ googleAvailable, emailConfigured }` |
| POST | `/api/auth/forgot-password` | 🌐 | Send reset OTP |
| POST | `/api/auth/reset-password` | 🌐 | Reset password with OTP |
| POST | `/api/auth/resend-verification` | 🌐 | Resend email-verification OTP |
| POST | `/api/auth/verify-email` | 🌐 | Verify email with OTP |
| POST | `/api/auth/otp/request` | 🌐 | Request a login OTP (passwordless) |
| POST | `/api/auth/otp/verify` | 🌐 | Verify login OTP → session |
| POST | `/api/auth/magic-link/request` | 🌐 | Send a magic link email (15-min validity) |
| GET,POST | `/api/auth/magic-link/verify` | 🌐 | Click a magic link → session + cookies |
| GET | `/api/auth/google/state` | 🌐 | Generate Google OAuth state + authUrl (used by frontend) |
| GET | `/api/auth/google` | 🌐 | Legacy Google OAuth initiation (redirects browser) |
| GET | `/api/auth/callback/google` | 🌐 | Primary Google OAuth callback → session |
| GET | `/api/auth/google/callback` | 🌐 | Legacy Google OAuth callback |
| GET | `/api/auth/google/relay` | 🌐 | Cross-domain relay: sets cookies on the user's origin |
| GET | `/api/auth/google/redirect-uri` | 🌐 | Diagnostic: reports the redirect URI to register |
| GET | `/api/auth/debug` | 🌐 | Diagnostic: env, headers, computed URLs, DB count |
| GET | `/api/auth/email-diagnostic` | 🛡️ (CRON_SECRET) | SMTP connectivity + Gmail quota diagnostic |
| POST | `/api/auth/mfa/setup` | 🔐 | Begin TOTP MFA setup → secret + backup codes |
| POST | `/api/auth/mfa/confirm` | 🔐 | Confirm TOTP code → enable MFA |
| POST | `/api/auth/mfa/disable` | 🔐 | Disable MFA (password + code) |
| GET | `/api/auth/security/devices` | 🔐 | List known devices |
| GET | `/api/auth/security/alerts` | 🔐 | List security alerts |
| GET | `/api/auth/security/lock-status` | 🔐 | Account-lock status |

**Example:**
```bash
curl -X POST https://app.acquisitionos.com/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"..."}'
# → 200 { user: {...}, accessToken: "..." } + Set-Cookie: access_token=...
```

---

## 2. Lead Discovery & Scoring (`/api/leads`, `/api/discovery`, `/api/ai/score`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/leads` | 🔐 / API | List leads (paginated, filterable) |
| POST | `/api/leads` | 🔐 / API | Create a lead manually (API: subject to monthly quota) |
| GET,PATCH,DELETE | `/api/leads/[id]` | 🔐 | Lead CRUD |
| POST | `/api/leads/[id]/analyze` | 🔐 | Re-run AI analysis |
| POST | `/api/leads/[id]/research` | 🔐 | Deep research |
| POST | `/api/leads/[id]/enrich` | 🔐 | Enrich from external sources |
| POST | `/api/leads/[id]/analyze-website` | 🔐 | Re-score website |
| POST | `/api/leads/[id]/outreach` | 🔐 | AI-generate outreach message (no send) |
| GET,POST | `/api/leads/[id]/communications` | 🔐 / API | List / send + log a communication (outbound email is sent via SMTP + BCC user) |
| GET,POST | `/api/leads/[id]/notes` | 🔐 | Lead notes |
| GET,POST | `/api/leads/[id]/activities` | 🔐 | Lead activity timeline |
| GET,POST | `/api/leads/[id]/reminders` | 🔐 | Follow-up reminders |
| POST | `/api/leads/[id]/move-stage` | 🔐 | Move lead stage |
| GET | `/api/leads/[id]/deals` | 🔐 | Deals for this lead |
| GET | `/api/leads/[id]/explain-scores` | 🔐 | AI-score reasoning |
| GET | `/api/leads/search` | 🔐 | Search leads |
| GET | `/api/leads/hot` | 🔐 | Hot leads |
| GET | `/api/leads/hot/scan` | 🔐 | Trigger a hot-lead scan |
| GET | `/api/leads/hot/stats` | 🔐 | Hot-lead stats |
| GET | `/api/leads/ai-scores` | 🔐 | AI-scored leads list |
| GET | `/api/leads/stats` | 🔐 | Lead stats |
| GET | `/api/leads/export` | 🔐 | CSV export |
| POST | `/api/leads/import` | 🔐 | CSV import |
| POST | `/api/leads/merge` | 🔐 | Merge duplicates |
| GET | `/api/leads/compare` | 🔐 | Compare leads |
| GET | `/api/leads/gap-analysis` | 🔐 | Gap analysis |
| GET | `/api/leads/scraping-metrics` | 🔐 | Scraping metrics |
| GET | `/api/leads/reply-intelligence` | 🔐 | Reply-intel per lead |
| GET | `/api/leads/proxy-pool` | 🔐 | Proxy pool status |
| POST | `/api/discovery/start` | 🔐 | Start a discovery job (niche + location) |
| GET | `/api/discovery/status` | 🔐 | Discovery job status |
| GET | `/api/discovery/leads` | 🔐 | Discovered leads |
| GET | `/api/leads/discover` | 🔐 | Discover endpoint (alt) |
| GET | `/api/leads/discover/status/[jobId]` | 🔐 | Discovery job status by ID |
| GET | `/api/leads/discover/suggestions` | 🔐 | Discovery suggestions |
| POST | `/api/ai/score` | 🔐 | AI-score a lead |
| POST | `/api/ai/analyze` | 🔐 | AI analyze |
| GET | `/api/ai/analysis/[leadId]` | 🔐 | AI analysis for a lead |

**Example (API key):**
```bash
curl -X POST https://app.acquisitionos.com/api/leads \
  -H "Authorization: Bearer aq_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"businessName":"Acme Cafe","email":"owner@acmecafe.com","niche":"restaurant","city":"Bengaluru"}'
# → 201 { id, ... } or 429 { error, code:"LEAD_LIMIT_EXCEEDED", limit, used, plan }
```

---

## 3. Outreach & Messaging (`/api/outreach`, `/api/leads/[id]/communications`, `/api/gmail`, `/api/messages`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/outreach/send` | 🔐 | Generate + send outreach for a lead (autonomous path) |
| GET | `/api/outreach` | 🔐 | List outreach sequences (campaigns) |
| POST | `/api/outreach/enroll` | 🔐 | Enroll a lead in a sequence |
| POST | `/api/outreach/execute` | 🔐 | Execute a sequence step |
| POST | `/api/outreach/batch` | 🔐 | Batch outreach |
| GET | `/api/outreach/autonomous` | 🔐 | Autonomous outreach |
| GET | `/api/outreach/autonomy-status` | 🔐 | Autonomy status |
| POST | `/api/autonomous/send-outreach` | 🔐 | Autonomous send (Gmail API) |
| POST | `/api/autonomous-outreach/dispatch` | 🔐 | Autonomous dispatch |
| POST | `/api/autonomous-outreach/generate` | 🔐 | Autonomous generate |
| GET,POST | `/api/messages` | 🔐 | Messages list / create |
| GET,PATCH,DELETE | `/api/messages/[id]` | 🔐 | Message CRUD |
| POST | `/api/ai/outreach/generate` | 🔐 | AI outreach generation (credits) |
| GET | `/api/gmail/accounts` | 🔐 | Gmail accounts |
| POST | `/api/gmail/connect` | 🔐 | Start Gmail OAuth |
| GET | `/api/gmail/callback` | 🌐 | Gmail OAuth callback |
| GET | `/api/gmail/inbox` | 🔐 | Inbox |
| GET | `/api/gmail/threads` | 🔐 | Threads |
| GET | `/api/gmail/thread/[id]` | 🔐 | Thread |
| POST | `/api/gmail/send` | 🔐 | Send via Gmail |
| POST | `/api/gmail/reply` | 🔐 | Reply via Gmail |
| POST | `/api/gmail/draft` | 🔐 | Create draft |
| POST | `/api/gmail/outreach-to-draft` | 🔐 | Outreach → Gmail draft |
| POST | `/api/gmail/sync` | 🔐 | Sync inbox |
| POST | `/api/gmail/disconnect` | 🔐 | Disconnect Gmail |
| GET | `/api/gmail/status` | 🔐 | Gmail status |
| POST | `/api/gmail/unsubscribe` | 🔐 | Mark unsubscribe |
| POST | `/api/gmail/reply-intelligence` | 🔐 | Classify a reply |
| POST | `/api/gmail/process-replies` | 🔐 | Process replies |
| GET | `/api/gmail/process-replies/status` | 🔐 | Status |
| POST | `/api/gmail/jobs/process` | 🔐 | Process jobs |
| POST | `/api/gmail/pubsub/setup` | 🔐 | Setup Pub/Sub |
| POST | `/api/gmail/pubsub/webhook` | 🌐 (verified) | Gmail Pub/Sub push |
| GET | `/api/gmail/tracking/pixel/[messageId]` | 🌐 | Open-tracking pixel |
| POST | `/api/gmail/tracking/click` | 🌐 | Click tracking |
| POST | `/api/reply-intelligence/analyze` | 🔐 | Analyze reply |
| POST | `/api/reply-intelligence/classify` | 🔐 | Classify reply |
| GET | `/api/reply-intelligence/buying-signals` | 🔐 | Buying signals |
| GET | `/api/reply-intelligence/analytics` | 🔐 | Reply-intel analytics |
| POST | `/api/reply-intel/process` | 🔐 | Process reply intelligence |

---

## 4. Pipeline & Deals (`/api/deals`, `/api/dashboard/deal-*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET,POST | `/api/deals` | 🔐 | Deals list / create |
| GET,PATCH,DELETE | `/api/deals/[id]` | 🔐 | Deal CRUD |
| GET | `/api/dashboard/deal-pipeline` | 🔐 | Pipeline view |
| GET | `/api/dashboard/deals-performance` | 🔐 | Performance |
| GET | `/api/dashboard/deal-risk` | 🔐 | Risk assessment |
| GET | `/api/dashboard/pipeline-health` | 🔐 | Pipeline health |
| GET | `/api/dashboard/pipeline-forecast` | 🔐 | Forecast |
| GET | `/api/dashboard/funnel-velocity` | 🔐 | Funnel velocity |
| GET | `/api/dashboard/revenue-waterfall` | 🔐 | Revenue waterfall |

---

## 5. Meetings & Calendar (`/api/meetings`, `/api/calendar`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET,POST | `/api/meetings` | 🔐 | List / create meeting (creates Google Calendar event + Meet link) |
| GET,PATCH,DELETE | `/api/meetings/[id]` | 🔐 | Meeting CRUD |
| POST | `/api/meetings/check-availability` | 🔐 | Real-time free/busy check |
| POST | `/api/meetings/suggest-slots` | 🔐 | Suggest slots |
| GET | `/api/meetings/stats` | 🔐 | Meeting stats |
| GET,PUT | `/api/meetings/settings` | 🔐 | Meeting preferences (real-time `googleCalendarConnected`) |
| POST | `/api/meetings/approve` | 🔐 | Approve pending meeting |
| POST | `/api/meetings/[id]/approve` | 🔐 | Approve by ID |
| POST | `/api/meetings/[id]/complete` | 🔐 | Complete |
| POST | `/api/meetings/[id]/reschedule` | 🔐 | Reschedule (PATCHes Calendar event) |
| GET,POST | `/api/meetings/[id]/agenda` | 🔐 | Agenda |
| GET,POST | `/api/meetings/[id]/prep` | 🔐 | Prep notes |
| GET,POST | `/api/meetings/[id]/follow-up` | 🔐 | Follow-up |
| GET,POST | `/api/meetings/[id]/follow-up-email` | 🔐 | Follow-up email |
| GET,POST | `/api/meetings/[id]/action-items` | 🔐 | Action items |
| GET,POST | `/api/meetings/[id]/extract-actions` | 🔐 | Extract actions (AI) |
| GET,POST | `/api/meetings/[id]/objections` | 🔐 | Objections |
| GET,POST | `/api/meetings/[id]/sentiment` | 🔐 | Sentiment |
| GET,POST | `/api/meetings/[id]/status` | 🔐 | Status |
| GET,POST | `/api/meetings/detect-intent` | 🔐 | Detect meeting intent in text |
| GET,POST | `/api/meetings/reminders` | 🔐 | Reminders |
| GET,POST | `/api/meetings/pending-approvals` | 🔐 | Pending approvals |
| POST | `/api/calendar/connect` | 🔐 | Start Calendar OAuth |
| GET | `/api/calendar/callback` | 🌐 | Calendar OAuth callback |
| POST | `/api/calendar/disconnect` | 🔐 | Disconnect Calendar |
| GET,POST | `/api/calendar/events` | 🔐 | List / create Calendar event (+ Meet link) |
| GET,PATCH,DELETE | `/api/calendar/events/[id]` | 🔐 | Event CRUD |
| GET | `/api/calendar/[eventId]` | 🔐 | Event by ID |
| POST | `/api/calendar/availability` | 🔐 | Real-time free/busy for a date |
| POST | `/api/calendar/ai-book` | 🔐 | AI picks slot + books |
| GET,POST | `/api/calendar/watch` | 🔐 | Start push channel |
| POST | `/api/calendar/watch/stop` | 🔐 | Stop channel |
| POST | `/api/calendar/webhook` | 🌐 (verified) | Calendar push notification |
| GET | `/api/calendar/intelligence` | 🔐 | AI recommendations |
| GET,POST | `/api/calendar/reminders` | 🔐 | Calendar reminders |

---

## 6. AI Assistant & Copilot (`/api/ai/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET,POST | `/api/ai/chat` | 🔐 | Chat (non-streaming) |
| POST | `/api/ai/chat/stream` | 🔐 | Streaming chat (SSE) |
| DELETE | `/api/ai/chat/cancel` | 🔐 | Cancel stream |
| GET,POST | `/api/ai/prompts` | 🔐 | Prompt templates |
| GET | `/api/ai/costs` | 🔐 | AI cost tracking |
| GET | `/api/ai/usage` | 🔐 | AI usage |
| POST | `/api/ai/vector-search` | 🔐 | Vector search |
| POST | `/api/ai/rag/ingest` | 🔐 | RAG ingest (text) |
| POST | `/api/ai/rag/ingest-url` | 🔐 | RAG ingest (URL) |
| POST | `/api/ai/rag/ingest-csv` | 🔐 | RAG ingest (CSV) |
| GET,POST | `/api/ai/rag/context` | 🔐 | RAG context retrieval |

---

## 7. Billing & Credits (`/api/payments`, `/api/subscriptions`, `/api/billing`, `/api/settings/api-keys`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/payments/create-stripe-session` | 🔐 | Create Stripe Checkout session |
| POST | `/api/payments/create-checkout-session` | 🔐 | Alias for create-stripe-session |
| POST | `/api/payments/create-order` | 🔐 | Create order (Stripe or Razorpay) |
| POST | `/api/payments/confirm` | 🔐 (dev only) | Confirm payment (prod: 403 — webhook only) |
| POST | `/api/payments/webhook/stripe` | 🌐 (verified) | Stripe webhook |
| GET | `/api/subscriptions/current` | 🔐 | Current subscription |
| GET | `/api/subscriptions/entitlements` | 🔐 | Entitlements |
| GET | `/api/subscriptions/usage` | 🔐 | Usage |
| GET | `/api/subscriptions/trial` | 🔐 | Trial status |
| POST | `/api/subscriptions/cancel` | 🔐 | Cancel |
| GET | `/api/subscriptions/upgrade-preview` | 🔐 | Upgrade preview |
| GET | `/api/subscriptions/downgrade-preview` | 🔐 | Downgrade preview |
| GET | `/api/subscriptions/check-eligibility` | 🔐 | Eligibility |
| GET | `/api/billing/history` | 🔐 | Billing history |
| GET | `/api/billing/recovery` | 🔐 | Payment recovery (dunning) |
| GET | `/api/billing/invoices/[invoiceId]/download` | 🔐 | Download invoice PDF |
| GET,POST | `/api/settings/api-keys` | 🔐 | API keys list / create |
| GET,PATCH,DELETE | `/api/settings/api-keys/[id]` | 🔐 | API key CRUD |
| POST | `/api/settings/api-keys/[id]/rotate` | 🔐 | Rotate key |
| POST | `/api/settings/api-keys/[id]/revoke` | 🔐 | Revoke key |
| GET | `/api/settings/api-keys/analytics` | 🔐 | Per-key analytics |
| GET | `/api/settings/api-keys/docs` | 🔐 | Docs JSON |

---

## 8. Workflows & Automation (`/api/workflows`, `/api/autonomous*`, `/api/events`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET,POST | `/api/workflows` | 🔐 | Workflows list / create |
| GET,PATCH,DELETE | `/api/workflows/[id]` | 🔐 | Workflow CRUD |
| POST | `/api/workflows/[id]/execute` | 🔐 | Execute |
| POST | `/api/workflows/[id]/pause|cancel|resume` | 🔐 | Lifecycle |
| POST | `/api/workflows/[id]/duplicate` | 🔐 | Duplicate |
| GET | `/api/workflows/executions` | 🔐 | Executions |
| GET,PATCH | `/api/workflows/executions/[executionId]` | 🔐 | Execution CRUD |
| POST | `/api/workflows/executions/[executionId]/retry|replay|pause|resume|cancel` | 🔐 | Execution lifecycle |
| GET | `/api/workflows/executions/[executionId]/logs` | 🔐 | Logs |
| GET | `/api/workflows/templates` | 🔐 | Templates |
| GET | `/api/workflows/metrics` | 🔐 | Metrics |
| GET | `/api/workflows/metrics/timeline` | 🔐 | Metrics timeline |
| POST | `/api/workflows/trigger` | 🔐 | Manual trigger |
| POST | `/api/workflows/validate` | 🔐 | Validate |
| GET | `/api/workflows/logs` | 🔐 | Logs |
| GET,POST | `/api/workflows/dead-letter` | 🔐 | Dead-letter queue |
| GET,PATCH,DELETE | `/api/workflows/dead-letter/[executionId]` | 🔐 | DLQ item |
| GET,POST | `/api/workflows/webhook/[id]` | 🔐 | Outbound webhook |
| GET,POST | `/api/workflows/webhook/[...path]` | 🔐 | Outbound webhook catch-all |
| POST | `/api/autonomous/campaign/parse` | 🔐 | Parse natural-language campaign |
| GET,POST | `/api/autonomous/campaign` | 🔐 | Campaign CRUD |
| GET | `/api/autonomous/campaign/list` | 🔐 | Campaign list |
| GET,PATCH,DELETE | `/api/autonomous/campaign/[campaignId]` | 🔐 | Campaign item |
| POST | `/api/autonomous/research` | 🔐 | Autonomous research |
| POST | `/api/autonomous/classify-reply` | 🔐 | Classify reply |
| POST | `/api/autonomous/pipeline/move` | 🔐 | Move pipeline |
| GET,POST | `/api/events/workflows|ai|messages|notifications|analytics|payments` | 🔐 | SSE event streams |

---

## 9. Analytics & Insights (`/api/analytics`, `/api/dashboard/*`)

The dashboard surface has ~50 endpoints (`/api/dashboard/*`) — overview, leads, deals, revenue, funnel, competitors, churn, territory, budget, campaigns, etc. The analytics surface (`/api/analytics/*`) adds formulas, predictions, anomalies, insights, benchmarks, shareable dashboards.

Key routes:
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/analytics` | 🔐 | Analytics summary |
| GET | `/api/analytics/insights` | 🔐 | Auto-insights |
| GET | `/api/analytics/predictions` | 🔐 | Predictions |
| GET | `/api/analytics/anomalies` | 🔐 | Anomalies |
| GET | `/api/analytics/benchmarks` | 🔐 | Benchmarks |
| GET,POST | `/api/analytics/formulas` | 🔐 | Custom formulas |
| GET,POST | `/api/analytics/share` | 🔐 | Shareable dashboards (token) |
| GET | `/api/dashboard/...` | 🔐 | ~50 dashboard endpoints (see API-ROUTES.md) |
| GET,POST | `/api/reports` | 🔐 | Reports |
| GET,POST | `/api/reports/templates` | 🔐 | Report templates |
| GET | `/api/reports/[id]/execute|export|schedule` | 🔐 | Report actions |

---

## 10. Competitor Intelligence (`/api/competitors`, `/api/competitor`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET,POST | `/api/competitors` | 🔐 | Competitors |
| GET,PATCH,DELETE | `/api/competitors/[id]` | 🔐 | Competitor CRUD |
| POST | `/api/competitors/discover` | 🔐 | Discover competitors |
| POST | `/api/competitors/analyze` | 🔐 | Analyze |
| GET | `/api/competitors/[id]/{snapshots,seo,pricing,reviews,social,insights,opportunities,website,compare}` | 🔐 | Per-competitor intelligence |

---

## 11. Settings (`/api/settings/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET,PUT | `/api/settings/profile` | 🔐 | Profile |
| POST | `/api/settings/avatar` | 🔐 | Avatar upload |
| PUT | `/api/settings/password` | 🔐 | Password change |
| GET,PUT | `/api/settings/notifications` | 🔐 | Notification prefs |
| GET,PUT | `/api/settings/appearance` | 🔐 | Appearance |
| GET | `/api/settings/audit-log` | 🔐 | Audit log |
| GET | `/api/settings/login-history` | 🔐 | Login history |
| GET | `/api/settings/sessions` | 🔐 | Active sessions |
| POST | `/api/settings/sessions/revoke-all` | 🔐 | Revoke all other sessions |
| DELETE | `/api/settings/sessions/[id]` | 🔐 | Revoke one session |
| GET | `/api/settings/2fa/status` | 🔐 | 2FA status |
| POST | `/api/settings/2fa/{setup,verify,disable}` | 🔐 | 2FA lifecycle |
| GET,PUT | `/api/settings/meeting-provider` | 🔐 | Meeting provider |
| GET,POST,PUT | `/api/settings/integrations` | 🔐 | Integrations status + actions |
| GET,PUT | `/api/settings/autonomy-mode` | 🔐 | Autonomy mode |
| GET,POST | `/api/settings/org` | 🔐 | Organization |
| POST | `/api/settings/org/create` | 🔐 | Create org |
| GET,POST | `/api/settings/org/invites` | 🔐 | Invites |
| GET,PATCH,DELETE | `/api/settings/org/invites/[id]` | 🔐 | Invite item |
| GET,PUT | `/api/settings/org/branding` | 🔐 | White-label branding |
| GET,PUT | `/api/settings/org/white-label` | 🔐 | White-label config |
| GET | `/api/settings/checklist` | 🔐 | Onboarding checklist |
| GET,PUT | `/api/settings/onboarding` | 🔐 | Onboarding state |
| POST | `/api/settings/export` | 🔐 | Data export |
| POST | `/api/settings/clear-data` | 🔐 | Clear data |
| POST | `/api/settings/delete-account` | 🔐 | Delete account |
| POST | `/api/settings/account/{export-request,delete-request}` | 🔐 | GDPR-style requests |
| GET,POST | `/api/settings/team/invite` | 🔐 | Team invite |
| GET,PATCH,DELETE | `/api/settings/team/invite/[id]` | 🔐 | Team invite item |
| POST | `/api/settings/team/accept` | 🔐 | Accept team invite |

---

## 12. Integrations (`/api/integrations/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/integrations/google/connect` | 🔐 | Start Google integration OAuth (Gmail + Calendar) |
| GET | `/api/integrations/google/callback` | 🌐 | Google integration OAuth callback |
| POST | `/api/integrations/google/disconnect` | 🔐 | Disconnect Google |
| GET,POST | `/api/integrations/gmail` | 🔐 | Gmail integration |
| POST | `/api/integrations/gmail/revoke` | 🔐 | Revoke Gmail |
| POST | `/api/integrations/gmail/connect` | 🔐 | Connect Gmail |
| GET,POST | `/api/integrations/whatsapp` | 🔐 | WhatsApp (Twilio) |
| POST | `/api/integrations/whatsapp/send-otp|verify-otp` | 🔐 | WhatsApp OTP |
| GET,POST | `/api/integrations/telegram` | 🔐 | Telegram |
| POST | `/api/integrations/telegram/disconnect` | 🔐 | Disconnect Telegram |
| POST | `/api/integrations/telegram/generate-code` | 🔐 | Generate Telegram code |

---

## 13. Admin (`/api/admin/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/billing` | 🛡️ | Billing overview |
| GET | `/api/admin/billing/failed-payments` | 🛡️ | Failed payments |
| GET | `/api/admin/billing/webhooks` | 🛡️ | Webhook log |
| POST | `/api/admin/refund` | 🛡️ | Refund |
| GET | `/api/admin/feedback` | 🛡️ | Feedback list |
| GET,PATCH | `/api/admin/feedback/[id]` | 🛡️ | Feedback item |
| POST | `/api/admin/feedback/[id]/comment` | 🛡️ | Comment |
| GET | `/api/admin/feedback/analytics` | 🛡️ | Analytics |
| GET,PATCH | `/api/admin/feedback/crashes` | 🛡️ | Crashes |
| GET,POST | `/api/admin/backup` | 🛡️ | Backup list / create |
| GET,DELETE | `/api/admin/backup/[id]` | 🛡️ | Backup item |

---

## 14. Cron Jobs (`/api/cron/*`)

All cron endpoints require `Authorization: Bearer <CRON_SECRET>`. See [operations/CRON-JOBS.md](../operations/CRON-JOBS.md).

| Method | Path | Description |
|---|---|---|
| POST | `/api/cron/expire-api-keys` | Expire past-due API keys |
| POST | `/api/cron/sdr-cycle` | Advance the autonomous SDR pipeline |
| POST | `/api/cron/autonomous-outreach` | Run autonomous outreach |
| POST | `/api/cron/hot-lead-scan` | Scan + flag hot leads |
| POST | `/api/cron/sequence-processing` | Process due sequence steps |
| POST | `/api/cron/process-sequences` | Process sequences (alt) |
| POST | `/api/cron/meeting-reminders` | Send due meeting reminders |
| POST | `/api/cron/credit-renewal` | Renew monthly credits |
| POST | `/api/cron/renew-subscriptions` | Renew subscriptions |
| POST | `/api/cron/end-of-period` | End-of-period processing |
| POST | `/api/cron/payment-reconciliation` | Reconcile payments |
| POST | `/api/cron/process-gmail-replies` | Process Gmail replies |

---

## 15. Notifications, Feedback, WebSocket, Misc

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/notifications` | 🔐 | Notifications |
| PATCH | `/api/notifications/[id]/read` | 🔐 | Mark read |
| POST | `/api/notifications/mark-read` | 🔐 | Mark all read |
| GET,POST | `/api/feedback` | 🔐 | Feedback |
| POST | `/api/feedback/crash` | 🌐 | Crash report |
| GET,PATCH | `/api/feedback/[id]` | 🔐 | Feedback item |
| POST | `/api/feedback/[id]/comment` | 🔐 | Comment |
| GET,POST | `/api/ws` | 🔐 | WebSocket upgrade |
| GET | `/api/website-score` | 🔐 | Website score |
| GET | `/api/route` | 🔐 | API root |
| GET | `/api/health` | 🌐 | Health check |
| GET | `/api/lead-discovery` | 🔐 | Lead discovery (alt) |
| GET | `/api/sdr` | 🔐 | SDR |
| GET | `/api/audit` | 🔐 | Audit log |
| GET | `/api/audit/export` | 🔐 | Audit export |
| GET | `/api/export` | 🔐 | Data export |
| GET | `/api/export/preview` | 🔐 | Export preview |

---

## Auth Header Examples

**Session cookie auth (browser):**
```bash
curl https://app.acquisitionos.com/api/leads --cookie "access_token=eyJhbGci..."
```

**API key auth (programmatic):**
```bash
curl https://app.acquisitionos.com/api/leads \
  -H "Authorization: Bearer aq_live_xxxxxxxxxxxxxxxxxxxxxxxx"
```

**Cron auth:**
```bash
curl -X POST https://app.acquisitionos.com/api/cron/expire-api-keys \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## Rate Limit Headers

Every API response includes:
```
X-RateLimit-Limit: 2000
X-RateLimit-Remaining: 1999
X-RateLimit-Reset: 1693600000
```
On exhaustion: HTTP 429 with `{ error, code: "RATE_LIMITED", retryAfter }`.

---

*See also: [ERROR-CODES.md](ERROR-CODES.md), [INTEGRATION-GUIDES.md](INTEGRATION-GUIDES.md), [PERFORMANCE-BENCHMARKS.md](PERFORMANCE-BENCHMARKS.md), and the in-app `/api-docs` page.*
