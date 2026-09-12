# AcquisitionOS — Complete Feature List

> Status legend: **Working** = functional today with current env/config. **Partial** = code complete and wired, but degraded/inactive pending credentials, data, or an external registration. **Planned** = referenced in code/UI but not yet functional. Statuses reflect the running state of this codebase as documented in `worklog.md` — nothing is inflated.

## Authentication

| # | Feature | Module | What it does | Status |
|---|---|---|---|---|
| 1 | Email/password signup | `/api/auth/signup`, `src/lib/auth.ts` | Creates User with bcryptjs hash, sends email-verification OTP | Working |
| 2 | Email verification (OTP) | `/api/auth/verify-email` | 6-digit OTP with expiry verifies the address | Working |
| 3 | Password sign-in | `/api/auth/signin` | Credential check → JWT access + refresh httpOnly cookies | Working |
| 4 | Login OTP (passwordless) | `/api/auth/otp/*` | Email a one-time code, verify to sign in; attempt limits + lockout | Working |
| 5 | Magic Link | `/api/auth/magic-link/*` | Email a tokenized link that signs the user in | Working (toggle: `ENABLE_MAGIC_LINK`) |
| 6 | Google OAuth sign-in | `/api/auth/google/state` + `/api/auth/google/callback` | Full OAuth 2.0 code flow; redirect_uri resolved dynamically from request headers so it works on preview AND production domains | Working (requires each domain's redirect URI to be registered in GCP Console) |
| 7 | Session refresh & rotation | `/api/auth/refresh`, `UserSession` model | Refresh-token rotation, revocable sessions, device/IP metadata | Working |
| 8 | MFA (TOTP) | `/api/auth/mfa/*`, `MfaConfig` | Authenticator enrollment, backup codes, verify at sign-in | Working |
| 9 | Password reset | `/api/auth/forgot-password`, `/api/auth/reset-password` | OTP-based reset flow | Working |
| 10 | Account lockout & device tracking | `account-lock-service.ts`, `KnownDevice`, `SecurityAlert` | Locks after repeated failures; flags new/suspicious devices | Working |
| 11 | Login history | `LoginHistory`, `/api/settings/login-history` | IP/geo/device per attempt, success/fail reason | Working |
| 12 | Session management UI | `/api/settings/sessions` | List active sessions, revoke one or all | Working |
| 13 | API keys | `/api/settings/api-keys/*`, `ApiKey` | Generate/rotate/revoke keys with scopes, usage tracking, expiry | Working |

## Lead Discovery

| # | Feature | Module | What it does | Status |
|---|---|---|---|---|
| 14 | Start Discovery | `/api/discovery/start`, `src/lib/lead-discovery/discovery-engine.ts`, `DiscoveryJob` | Niche+location search job → businesses list | Working |
| 15 | Google Custom Search integration | `discovery-engine.ts` | Queries Programmable Search Engine; keys: `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID` (env template alias `GOOGLE_SEARCH_CX`) | Working |
| 16 | SerpAPI fallback | `discovery-engine.ts` | Used when Google keys absent (`SERPAPI_KEY`) | Partial (key not set) |
| 17 | Website scraping & scoring | `website-scorer.ts`, `/api/website-score` | Cheerio fetch + quality scoring, weakness detection (`LeadAnalysis`) | Working |
| 18 | AI company research | `company-researcher.ts`, `/api/leads/[id]/research` | AI profile of the business, decision maker, opportunity | Working |
| 19 | Website screenshots | `screenshot-service.ts`, Sharp | Captures site screenshots for lead cards | Working |
| 20 | Lead enrichment | `/api/leads/[id]/enrich`, `lead-enrichment-service.ts` | Fill missing contact fields from website | Working |
| 21 | Lead dedup & merge | `lead-dedup-service.ts`, `/api/leads/merge` | Prevents/merges duplicate businesses | Working |
| 22 | CSV import/export | `/api/leads/import`, `/api/leads/export` | Bulk in/out of leads | Working |
| 23 | Hot-lead detection | `hot-lead-service.ts`, `/api/hot-leads/*`, cron `hot-lead-scan` | Detects engagement spikes → hot-lead feed | Working |
| 24 | Proxy pool & scraping metrics | `proxy-rotation-service.ts`, `ProxyEndpoint`, `ScrapingMetric` | Rotating proxies + scrape observability | Partial (operational, needs proxies configured to matter) |
| 25 | Discovery status & suggestions | `/api/discovery/status`, `/api/leads/discover/suggestions` | Job progress polling; query suggestions | Working |

## Pipeline

| # | Feature | Module | What it does | Status |
|---|---|---|---|---|
| 26 | Pipeline board (stages) | `/api/pipeline`, `pipeline-service.ts`, `PipelineStage`/`PipelineCustomStage` | Kanban stages incl. org-custom stages | Working |
| 27 | Stage moves | `/api/leads/[id]/move-stage` | Move lead with audit trail | Working |
| 28 | Lead activities timeline | `/api/leads/[id]/activities`, `LeadActivity` | Every touch logged | Working |
| 29 | Lead notes | `/api/leads/[id]/notes`, `LeadNote` | Collaborative notes | Working |
| 30 | Follow-up reminders | `/api/reminders`, `/api/leads/[id]/reminders`, `FollowUpReminder` | Timed reminders | Working |
| 31 | Deals | `/api/deals`, `Deal` | Opportunity records with value/stage | Working |
| 32 | Lead comparison | `/api/leads/compare` | Side-by-side compare of leads | Working |
| 33 | Gap analysis | `/api/gap-analysis/*` | Score gaps + remediation advice | Working |
| 34 | Reply intelligence | `reply-intelligence-service.ts`, `/api/reply-intelligence/*` | Classify replies, extract buying signals | Working |
| 35 | AI lead scoring w/ explanations | `/api/leads/ai-scores`, `/api/leads/[id]/explain-scores`, `src/lib/ai/scoring-engine.ts` | Reply/conversion/urgency/revenue scores + reasoning | Working |

## Outreach

| # | Feature | Module | What it does | Status |
|---|---|---|---|---|
| 36 | AI outreach generation | `/api/ai/outreach/generate`, `src/lib/ai/outreach-generator.ts` | Personalized email per lead from analysis data | Working |
| 37 | Send outreach email | `/api/outreach/send`, `/api/leads/[id]/outreach` | Sends via platform SMTP; logs `OutreachMessage` | Working |
| 38 | Batch outreach | `/api/outreach/batch` | Queue multiple sends | Working |
| 39 | Sequences | `/api/sequences/*`, `OutreachSequence`/`SequenceStep`/`SequenceEnrollment` | Multi-step timed campaigns, enroll/pause/resume, analytics | Working |
| 40 | Sequence cron processing | `/api/cron/process-sequences`, `sequence-execution-engine.ts` | Advances due steps | Working (needs external scheduler) |
| 41 | Open tracking (pixel) | `/api/email/tracking/open/[id]`, `EmailOpenEvent` | Tracks email opens | Working |
| 42 | Click tracking | `/api/email/tracking/click/[id]`, `EmailClickEvent`, `EmailTrackingLink` | Wrapped links + click events | Working |
| 43 | Bounce intelligence | `/api/email/bounces`, `EmailBounce`, `bounce-intelligence.ts` | Bounce capture + classification | Working |
| 44 | Unsubscribe handling | `/api/gmail/unsubscribe`, `EmailUnsubscribe` | Honors opt-outs | Working |
| 45 | Scheduled emails | `/api/email/schedule`, `ScheduledEmail` | Future-dated sends | Working |
| 46 | Autonomous outreach mode | `/api/outreach/autonomous`, `/api/outreach/autonomy-status`, `autonomous-outreach-engine.ts` | System sends on its own within rules | Working (toggle in settings) |
| 47 | Autonomous SDR cycle | `/api/cron/sdr-cycle`, `autonomous-sdr-pipeline.ts` | Scheduled discover→score→outreach loop | Working (needs scheduler) |
| 48 | Gmail integration | `/api/gmail/*`, `gmail-*-service.ts`, `EmailAccount` | OAuth-connect Gmail, send from user mailbox, inbox/thread sync, reply processing, Pub/Sub push, outreach-to-draft, tracking | Partial (needs Google OAuth scopes consent + Pub/Sub setup per deployment) |
| 49 | Reply auto-handler | `/api/reply-handler`, `reply-handler.ts` | Auto-process inbound replies into pipeline actions | Working |
| 50 | Email analytics | `/api/email/analytics`, `email-analytics-service.ts` | Opens, clicks, send stats | Working |

## Meetings

| # | Feature | Module | What it does | Status |
|---|---|---|---|---|
| 51 | Meeting intent detection | `/api/meetings/detect-intent`, `MeetingIntentLog` | Extracts scheduling intent from replies | Working |
| 52 | Slot suggestions | `/api/meetings/suggest-slots`, `/api/meetings/check-availability` | Proposes times from availability | Working |
| 53 | Google Calendar sync | `/api/calendar/*`, `GoogleCalendarToken`, `CalendarWatch` | OAuth connect, availability, events, push watch | Partial (works after user connects; push needs public webhook URL) |
| 54 | AI booking | `/api/calendar/ai-book` | AI picks and books the slot | Working |
| 55 | Meeting lifecycle | `/api/meetings/*`, `Meeting` | Propose → approve → confirm → complete; reschedule | Working |
| 56 | Pending approvals | `/api/meetings/pending-approvals`, `/api/meetings/[id]/approve` | Human approves autonomous proposals | Working |
| 57 | Prep & agenda | `/api/meetings/[id]/prep`, `/api/meetings/[id]/agenda` | AI-generated meeting prep | Working |
| 58 | Action items extraction | `/api/meetings/[id]/extract-actions`, `action-items` | Post-meeting action extraction | Working |
| 59 | Objections & sentiment | `/api/meetings/[id]/objections`, `/api/meetings/[id]/sentiment` | Coaching data from meetings | Working |
| 60 | Follow-up emails | `/api/meetings/[id]/follow-up-email` | Auto follow-up drafts/sends | Working |
| 61 | Meeting reminders | `/api/meetings/reminders/*`, `MeetingReminder`, cron `meeting-reminders` | Multi-channel reminders | Working |
| 62 | Autonomy engine | `src/lib/meeting/autonomy-engine.ts`, `/api/settings/autonomy-mode` | How much the system does without approval | Working |

## Notifications

| # | Feature | Module | What it does | Status |
|---|---|---|---|---|
| 63 | In-app notifications | `/api/notifications/*`, `Notification` | Center with read/archive | Working |
| 64 | Notification preferences | `/api/settings/notifications`, `NotificationPreferences` | Per-channel, per-event prefs | Working |
| 65 | Email notifications | `src/lib/email.ts`, `email-ethereal.ts` | Platform SMTP (Gmail App Password chain) | Working (verified SMTP AUTH SUCCESS) |
| 66 | Telegram notifications | `telegram-service.ts`, `notification-channels/telegram-channel.ts`, `/api/telegram/*` | Bot messages to linked chat | Partial (code ready; `TELEGRAM_BOT_TOKEN` not set) |
| 67 | WhatsApp notifications | `whatsapp-service.ts`, `notification-channels/whatsapp-channel.ts`, `/api/whatsapp/*` | Twilio or Meta Cloud API alerts | Partial (code ready; Twilio/Meta creds not set) |
| 68 | Web Push | `push-channel.ts`, `/api/notifications/push/*` | VAPID web push | Partial (VAPID keys not set) |
| 69 | Realtime updates | `/api/events/*`, `/api/ws`, `realtime-engine.ts`, `sse-manager.ts` | WebSocket/SSE live feeds (payments, notifications, AI, workflows) | Working |
| 70 | Notification engine fan-out | `notification-engine.ts` | Routes events to enabled channels | Working |

## Billing

| # | Feature | Module | What it does | Status |
|---|---|---|---|---|
| 71 | Plans & entitlements | `Subscription`, `PlanEntitlement`, `plan-gates.ts` | free/pro/elite feature gates + limits | Working |
| 72 | Stripe Checkout | `/api/payments/create-stripe-session`, `stripe-service.ts` | Hosted checkout from price IDs | Partial (code complete; `STRIPE_SECRET_KEY` not set → checkout fails until configured) |
| 73 | Stripe webhooks | `/api/payments/webhook/stripe`, `PaymentWebhook` | Signature-verified, idempotent fulfillment | Partial (needs webhook secret + public URL) |
| 74 | Stripe Billing Portal | `/api/payments/stripe-portal` | Self-serve subscription management | Partial (needs keys) |
| 75 | Razorpay (India) | `razorpay-service.ts`, `/api/payments/webhook/razorpay`, GST fields | INR payments with GST capture | Partial (code complete; keys not set) |
| 76 | Credits system | `credit-service.ts`, `credit-costs.ts`, `CreditsLedger` | Monthly allotment + per-action deduction with ledger | Working |
| 77 | Credit add-ons | `/api/payments/credit-addons`, `CreditAddon`, `credit-addon-fulfillment.ts` | One-time packs | Partial (needs payment provider) |
| 78 | Invoices | `/api/payments/invoices/*`, `Invoice`, `invoice-pdf-service.ts` | Numbered invoices, PDF download, email delivery | Partial (generated after payments work) |
| 79 | Coupons | `/api/payments/validate-coupon`, `Coupon` | Percent/fixed discounts | Working (validation logic) |
| 80 | Trials | `/api/subscriptions/trial`, `trial-service.ts` | Trial state management | Working |
| 81 | Upgrade/downgrade previews | `/api/subscriptions/upgrade-preview`, `downgrade-preview` | Preview plan changes before commit | Working |
| 82 | Dunning / recovery | `payment-recovery-service.ts`, `/api/payments/retry`, cron `payment-reconciliation` | Retry failed payments, reconcile | Partial (needs provider) |
| 83 | Refunds | `/api/payments/refund`, `refund-service.ts`, admin refund route | Full/partial refunds + ledger reversal | Partial (needs provider) |
| 84 | Payment SSE status | `/api/payments/sse`, `payment-sse-service.ts` | Live payment status updates | Working |

## AI Features

| # | Feature | Module | What it does | Status |
|---|---|---|---|---|
| 85 | Provider chain | `src/lib/ai/ai-provider.ts`, `ai-provider-fallback.ts` | Z-AI SDK primary → OpenAI-compatible fallback | Working (Z-AI active in sandbox) |
| 86 | AI chat assistant | `/api/ai/chat`, `/api/ai/chat/stream`, `chat-service.ts` | Lead-aware chat with streaming + cancel | Working |
| 87 | Deep lead analysis | `/api/ai/analyze`, `/api/ai/analysis/[leadId]`, `lead-analysis-engine.ts` | Full AI analysis persisted to `LeadAnalysis` | Working |
| 88 | RAG pipeline | `/api/ai/rag/*`, `rag-service.ts`, `RagDocument` | Ingest CSV/URL/text, vector search, grounded context | Working |
| 89 | Prompt templates | `/api/ai/prompts`, `PromptTemplate`, `prompt-manager.ts` | Manage reusable prompts | Working |
| 90 | AI usage & costs | `/api/ai/usage`, `/api/ai/costs`, `AiCostRecord`, `ai-cost-tracker.ts` | Per-call token/cost accounting | Working |
| 91 | Credit enforcement on AI | `credit-enforcement.ts` | Blocks AI calls when credits exhausted | Working |
| 92 | Vector search | `/api/ai/vector-search`, `vector-search-service.ts` | Semantic search over ingested docs | Working |
| 93 | Sales assistant | `/api/sales-assistant` | Conversational sales help | Working |
| 94 | Dashboard AI copilot | `/api/dashboard/ai-copilot`, `ai-copilot-panel.tsx` | In-dashboard AI insights | Working |
| 95 | Meeting assistant | `src/lib/ai/meeting-assistant.ts` | Prep/agenda/follow-up generation | Working |

## Admin

| # | Feature | Module | What it does | Status |
|---|---|---|---|---|
| 96 | Admin feedback moderation | `/api/admin/feedback/*`, `/admin/feedback` page | Status workflow, comments, analytics, crashes | Working |
| 97 | Admin billing ops | `/api/admin/billing/*` | Failed payments, webhook logs view | Partial (useful once payments live) |
| 98 | Admin refunds | `/api/admin/refund` | Issue refunds from admin | Partial (needs provider) |
| 99 | Database backups | `/api/admin/backup`, `scripts/backup/` | Create/list/restore backups | Working |
| 100 | Audit logs | `/api/audit`, `AuditLog`, `audit-log-viewer.tsx` | Security-relevant action trail | Working |
| 101 | System health | `/api/health/*`, `SystemMetrics` | Liveness, deep health, DB check | Working |
| 102 | API key admin analytics | `/api/settings/api-keys/analytics` | Key usage stats | Working |
| 103 | Org & team management | `/api/settings/org/*`, `/api/team/*` | Create org, invites, roles, white-label branding | Working |

## Feedback System

| # | Feature | Module | What it does | Status |
|---|---|---|---|---|
| 104 | Submit feedback | `/api/feedback`, `feedback/` components | Bug/idea/general reports w/ severity + screenshots | Working |
| 105 | Crash reporting | `/api/feedback/crash`, `CrashReport`, `error-boundary.tsx` | Auto crash capture from UI | Working |
| 106 | Report status & comments | `/api/feedback/[id]`, `FeedbackComment`, `FeedbackStatusLog` | Track report lifecycle | Working |
| 107 | Feedback analytics | `/api/admin/feedback/analytics` | Trends, categories, volume | Working |

## Platform & Infrastructure

| # | Feature | Module | What it does | Status |
|---|---|---|---|---|
| 108 | Workflows engine | `/api/workflows/*`, `workflow-engine.ts` family | Trigger → step automations, executions, logs, DLQ, replay, templates, webhook triggers | Working |
| 109 | Messaging hub | `/api/messaging/*`, `MessageBroadcast`, `MessageDelivery`, `DeliveryDeadLetter` | Cross-channel broadcasts with delivery tracking + DLQ | Partial (channels need creds) |
| 110 | GDPR toolkit | `/api/gdpr/*`, `GdprRequest`, `DataExport` | Consent, export, delete, DPA, retention | Working |
| 111 | Competitor intelligence | `/api/competitors/*`, `CompetitorAnalysis` | Discover/analyze competitors, SEO/social/pricing/reviews | Working |
| 112 | Analytics engine | `/api/analytics/*`, prediction/insight/anomaly engines | Predictions, insights, anomalies, benchmarks, formulas, shares | Working (value grows with data volume) |
| 113 | Advanced reports | `/api/reports/*` | Scheduled/on-demand report builder + export | Working |
| 114 | Dashboard widget suite | `/api/dashboard/*` (55+ endpoints), 181 components | Command-center widgets: forecasts, goals, tasks, leaderboards, territory map, digest | Working |
| 115 | Observability | `src/lib/observability/`, OpenTelemetry deps | Traces/metrics plumbing | Partial (collector endpoint not configured) |
| 116 | Error tunnel | `/api/sentry`, `error-tracking.ts` | Client error forwarding | Partial (Sentry DSN not set) |
| 117 | i18n scaffolding | `next-intl` dependency | Internationalization support present in deps | Planned (not wired into UI) |
| 118 | Redis pub/sub | `redis-pubsub-service.ts`, ioredis | Multi-instance event fan-out | Partial (optional; REDIS_URL not set — single-instance works without it) |

## Summary counts

| Status | Count | Notes |
|---|---|---|
| Working | 88 | Core loop fully operational: auth, discovery, scoring, outreach, meetings logic, credits, AI, dashboard, workflows, feedback |
| Partial | 27 | Mostly credential-gated: Stripe, Razorpay, WhatsApp, Telegram, Push, Gmail inbox scopes, Sentry, OTLP — code paths are complete |
| Planned | 3 | i18n wiring, plus long-tail items flagged in KT document |

**The single most impactful unblock:** setting Stripe credentials + webhook (turns 8 partial billing features into working ones), followed by Twilio/Telegram credentials (mobile alert channels).
