# AcquisitionOS — System Architecture

> Sources: `src/` tree, `prisma/schema.prisma`, `src/lib/*` services, `worklog.md`. Route counts are real (485 route files inventoried).

## 1. Application Structure (Next.js App Router)

The app is a **single Next.js 16 application** (App Router) serving three concerns from one process:

```
Browser
  │
  ├─ src/app/page.tsx  ──────►  <AuthGate /> SPA  (the whole dashboard lives here)
  │                              181 dashboard components, client-rendered,
  │                              talks to /api/* via fetch + TanStack Query
  │
  ├─ src/app/auth/signin|signup ►  Auth pages (auth-pages-v2.tsx)
  ├─ src/app/dashboard/billing|calendar|feedback|meetings ► focused sub-routes
  ├─ src/app/admin/feedback      ►  admin moderation UI
  └─ src/app/(marketing)|(public) ► privacy / terms / legal static pages
```

- **Rendering model:** the dashboard is client-side (`'use client'` at `src/app/page.tsx`); API routes are server-side Node handlers under `src/app/api/**/route.ts`.
- **API layer:** 485 route files grouped by domain (auth, leads, discovery, outreach, meetings, payments, notifications, workflows, admin…). Full inventory: `06-api-reference/API-ROUTES.md`.
- **Service layer:** `src/lib/` contains 180+ service modules — the real business logic lives there, routes stay thin.
- **Middleware:** `src/middleware.ts` is DISABLED in this deployment (`middleware.ts.disabled`) — the GLM sandbox cannot run it reliably; edge-level checks are compensated by per-route auth.
- **Realtime:** a WebSocket endpoint (`/api/ws`) plus Server-Sent-Events (`/api/events/*`) feed live updates; `realtime-event-bus.ts` fans out events; optional Redis pub/sub (`redis-pubsub-service.ts`) when `REDIS_URL` is set.
- **Startup:** `instrumentation.ts` runs on server boot (env validation, OTel hooks); `src/lib/env-validation.ts` + `env-safeguard.ts` guard configuration.

## 2. Database Schema Overview (all 104 Prisma models)

Full field-level documentation: **[DATABASE-SCHEMA.md](DATABASE-SCHEMA.md)**. Datasource is **SQLite** today (`DATABASE_URL=file:...`) with annotated migration path to PostgreSQL. Relationship map (only principal edges shown; every model has a `user FK` unless noted):

```
User ──┬─ UserSession / LoginHistory / MfaConfig          (auth)
       ├─ Subscription ── PaymentOrder ── Invoice
       │        │              └── PaymentWebhook[]
       │        └─ CreditsLedger / CreditAddon / UsageTracking
       ├─ Organization ── OrgMember / OrgInvitation / PipelineCustomStage
       ├─ Lead ──┬─ LeadAnalysis (1:1) / LeadScore / LeadNote
       │         ├─ Communication / Deal / LeadActivity / FollowUpReminder
       │         ├─ OutreachMessage / SequenceEnrollment
       │         └─ Conversation ── ConversationMessage
       ├─ EmailAccount ── EmailThread ── EmailMessage / EmailBounce / EmailUnsubscribe
       ├─ DiscoveryJob (discovery runs)
       ├─ Meeting ── MeetingIntentLog / MeetingReminder   + GoogleCalendarToken / CalendarWatch
       ├─ Notification / NotificationPreferences
       ├─ TelegramConfig / WhatsappConfig
       ├─ AiChatSession ── AiChatMessage  + AiCostRecord / PromptTemplate / FileContext
       ├─ WorkflowDefinition ── WorkflowStep / WorkflowExecution ── WorkflowLog
       ├─ ApiKey ── ApiKeyUsage         (hashed keys)
       ├─ GdprRequest / DataExport / OnboardingProgress / AuditLog / SecurityAlert / KnownDevice
       └─ FeedbackReport ── FeedbackComment / FeedbackStatusLog   + CrashReport
Standalone: FeatureFlag, PlanEntitlement, Coupon, TaxRate, WorkflowTemplate,
CompetitorData/Analysis/Snapshot, Analytics* (6 models), RagDocument, MediaFile,
MessageBroadcast/MessageTemplate/MessageDelivery/DeliveryDeadLetter, SystemEvent…
```

Key integrity rules: `PaymentOrder.idempotencyKey @unique` (prevents double charges), `PaymentWebhook.eventId @unique` (webhook dedupe), `Invoice.paymentOrderId @unique` (1:1), `LeadAnalysis.leadId @unique` (1:1), cascade deletes from `User`.

## 3. Authentication End to End

**Primitive:** custom JWT sessions (NOT next-auth runtime, NOT AUTH_SECRET). `src/lib/auth.ts`:
- `JWT_SECRET` signs short-lived access tokens; `JWT_REFRESH_SECRET` signs refresh tokens.
- Tokens are stored in **httpOnly, SameSite=Lax cookies** (`secure` in production).
- Every session has a `UserSession` row (refresh token, device, IP) → sessions are listable/revocable.
- Routes call `getAuthUser(request)`; entitlements via `entitlement-middleware.ts`; RBAC roles: owner/admin/member/viewer.

**Method flows:**
1. **Email/password:** `POST /api/auth/signup` → bcrypt hash → OTP email → `verify-email` → `signin` sets cookies.
2. **OTP login:** `POST /api/auth/otp/request` emails a code (stored hashed with expiry + attempt counters in `User.loginOtp*`) → `otp/verify` sets cookies. Lockout via `otpLockedUntil`.
3. **Magic link:** `magic-link/request` emails a single-use token → `magic-link/verify` sets cookies.
4. **Google OAuth:** detailed in §5 below.
5. **MFA:** TOTP secret (encrypted) + hashed backup codes in `MfaConfig`; required at sign-in when `isEnabled`.

**Session expiry:** access token short TTL; `POST /api/auth/refresh` rotates using the refresh cookie and updates `UserSession`; `signout` revokes the row and clears cookies.

## 4. Email Sending (SMTP Flow)

`src/lib/email-ethereal.ts` implements a **three-tier transport chain**:

```
sendEmail(to, subject, html)
  │
  ├─ Tier 1: Resend API          if RESEND_API_KEY set        (HTTP API, best deliverability)
  ├─ Tier 2: Nodemailer SMTP     if SMTP_USER/SMTP_PASSWORD    (Gmail, port 587 STARTTLS)
  │            host = SMTP_HOST (default smtp.gmail.com), port = SMTP_PORT (587)
  │            user aliases: SMTP_USER → SMTP_USERNAME → GMAIL_USER → EMAIL_USER
  │                            → EMAIL_USERNAME → MAIL_USER → MAIL_USERNAME
  │            pass aliases: SMTP_PASSWORD → SMTP_PASS → SMTP_AUTH_PASSWORD → GMAIL_APP_PASSWORD
  │                            → GMAIL_PASSWORD → EMAIL_PASSWORD → EMAIL_PASS → MAIL_PASSWORD → MAIL_PASS
  │            from = EMAIL_FROM
  └─ Tier 3: Ethereal test account (dev only) — messages never really delivered
```

- `/api/auth/config` exposes capability flags: `emailConfigured:true` once tier 1 or 2 resolves.
- `[SMTP-Env-Diag]` logs print which alias groups are SET/MISSING (never values) at startup.
- Verified live: Gmail SMTP AUTH SUCCESS with the configured app password; `emailConfigured:true`.
- Consumers: OTP/verification/magic-link emails, outreach sends, invoice emails, meeting invites/reminders, notification email channel, weekly digest.

## 5. Google OAuth — Full Flow (login button → dashboard)

Implemented in `/api/auth/google/state` (initiation) and `/api/auth/google/callback` (completion), with `src/lib/google-oauth.ts` for the calendar/gmail integration variants.

```
1. User clicks "Sign in with Google" on https://<current-domain>/auth/signin
2. Frontend GETs /api/auth/google/state  (same origin as the page)
3. state route resolves the PUBLIC ORIGIN from the request, priority order:
     ① ?origin= query param
     ② x-forwarded-host + x-forwarded-proto   ← set by GLM proxy (preview or prod)
     ③ host header
     ④ Origin header
     ⑤ Referer header
     ⑥ APP_URL / NEXT_PUBLIC_APP_URL env
     ⑦ fallback https://acquisition.space-z.ai
   Every candidate is rejected if isInternalHost() (localhost/127./10./192.168./172./
   *.fcapp.run/*.aliyuncs.com/*.functioncompute.com).
4. redirect_uri = `${resolvedOrigin}/api/auth/callback/google`
   state = base64url(JSON{ redirectUri, origin, nonce })
   → 302 to Google consent with client_id=GOOGLE_CLIENT_ID
5. Google redirects the browser to EXACTLY redirect_uri (must be pre-registered in GCP).
6. Callback route: verifies signature, decodes state JSON, reads redirectUri FROM STATE
   → token exchange uses the identical redirect_uri (Google requirement), fetches userinfo,
   upserts User (by googleId or email), creates session cookies.
7. If callback origin == app origin → redirect to dashboard, done (normal case).
   Else (rare cross-domain) → OAuth relay token hands the session to the app domain.
```

The dynamic-resolution fix (worklog `DYNAMIC-REDIRECT-1`) means the same code serves preview AND production domains — Google still requires **each unique redirect URI to be registered** in the GCP OAuth client, otherwise `Error 400: redirect_uri_mismatch`.

## 6. Stripe Payments (checkout → webhook → fulfillment)

Primary provider Stripe; Razorpay is the Indian-market alternative with GST capture. Code in `src/lib/stripe-service.ts` + `/api/payments/*`.

```
1. Client picks plan → POST /api/payments/create-stripe-session {plan, billingCycle}
2. Server: resolves STRIPE_PRICE_{PRO|PREMIUM|ELITE}_ID (or credits price), creates
   PaymentOrder (status=pending, idempotencyKey) + Stripe Checkout Session
   success_url/cancel_url built from NEXT_PUBLIC_APP_URL (or STRIPE_SUCCESS_URL override)
3. User pays on Stripe-hosted page → redirected to /dashboard/billing?session_id=…&status=success
4. Stripe POSTs the event to /api/payments/webhook/stripe
   - Signature verified with STRIPE_WEBHOOK_SECRET (constructEvent)
   - Event stored in PaymentWebhook (eventId @unique → idempotent replay-safe)
5. Fulfillment (webhook-processor.ts):
   checkout.session.completed / invoice.paid
        → PaymentOrder.status=completed → Subscription upsert (plan, period bounds)
        → Invoice row + PDF (invoice-pdf-service) + email
        → CreditsLedger grant of plan credits; Coupon usedCount++
   customer.subscription.updated/deleted → status sync (active/past_due/canceled)
   charge.refunded → refund-service reverses credits/plan
6. Client verifies via /api/payments/verify-session (also /verify, /status, SSE /sse)
Failed payment path: subscription past_due → User.consecutivePaymentFailures++
→ payment-recovery retries (cron payment-reconciliation) → dunning emails.
```

**Current status:** the entire flow is coded, but no `STRIPE_*` keys are configured, so checkout fails fast until they are set (see `04-secrets-and-configuration/ALL-SECRETS.md`).

## 7. Lead Discovery Pipeline

```
DiscoveryJob (niche, location, maxResults)
   │ POST /api/discovery/start
   ▼
discovery-engine.ts ── Google Custom Search API  (GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_ENGINE_ID)
   │                   └─ SerpAPI fallback (SERPAPI_KEY)
   ▼ raw results (name, website, phone, maps listing…)
website-scorer.ts ── Cheerio fetch + heuristics → hasWebsite, websiteQuality, digitalWeaknesses
   │               (proxy rotation + ScrapingMetric observability)
   ▼
company-researcher.ts ── AI provider chain → decisionMaker, opportunityNotes, estimated values
   ▼
scoring-engine.ts ── replyScore / conversionScore / urgencyScore / revenuePotentialScore
   │               + scoreReasoning (persisted on Lead + LeadAnalysis)
   ▼
outreach-generator.ts ── personalized email referencing actual weaknesses
   ▼ (user sends or autonomous mode sends)
OutreachMessage + sequence enrollment → open/click tracking → reply-handler
```

Credits are deducted per stage (`credit-costs.ts`), enforced by `credit-enforcement.ts`. Cron endpoints (`sdr-cycle`, `process-sequences`, `hot-lead-scan`) automate the loop when an external scheduler calls them with `CRON_SECRET`.

## 8. Meeting Orchestration

`src/lib/meeting/*` implements an autonomous scheduler:

1. **Intent:** inbound reply text → `/api/meetings/detect-intent` → `MeetingIntentLog` (confidence + parsed datetime entities).
2. **Slots:** user availability (Google Calendar free/busy via `GoogleCalendarToken`) → `suggest-slots` proposes times; `ai-book` can pick autonomously.
3. **Approvals:** if autonomy mode requires it, proposals wait in `pending-approvals` for a human yes.
4. **Lifecycle:** `Meeting` rows move proposed → approved → confirmed → completed (with reschedule branch); platform creates the calendar event and provider link (`platform-adapter.ts`).
5. **Comms:** `meeting-email.ts` sends invites; `meeting-reminders.ts` queues `MeetingReminder` rows delivered by cron across email/Telegram/WhatsApp/in-app.
6. **After:** agenda/notes/action items/objections/sentiment via the AI meeting assistant; follow-up emails queued; CRM sync (`crm-sync.ts`).

## 9. AI Features (Z-AI Provider Chain)

`src/lib/ai/ai-provider.ts`:

```
generate(messages, config)
  ├─ Z-AI SDK (default): ZAI.create() → chat.completions.create  ← no API key needed
  │    (SDK authenticates the sandbox/panel deployment automatically)
  └─ OpenAI-compatible fallback: OPENAI_API_KEY (+ OPENAI_MODEL, default gpt-4o)
     — auto-used when Z-AI unavailable; ai-provider-fallback.ts orchestrates retries
```

- Every call is metered: tokens + estimated cost → `AiCostRecord` (`/api/ai/costs`, `/api/ai/usage`).
- Credit enforcement runs BEFORE calls (`credit-enforcement.ts`); costs per action defined in `credit-costs.ts`.
- Consumers: lead analysis, scoring, company research, outreach generation, chat (incl. streaming + cancel + file context), meeting assistant, reply classification, RAG answers, copilot.
- RAG: documents (CSV/URL/text) → chunked into `RagDocument` → vector search (`vector-search-service.ts`) feeds grounded context.

## 10. Notifications (in-app, email, Telegram, WhatsApp)

`notification-engine.ts` fans a single event out to enabled channels, honoring `NotificationPreferences` per event type:

```
Event (lead replied, meeting booked, payment failed, digest…)
   ├─ in-app  → Notification row → delivered live via SSE/WebSocket
   ├─ email   → §4 SMTP chain
   ├─ telegram→ telegram-service (bot token + chat id from TelegramConfig; webhook for inbound)
   ├─ whatsapp→ whatsapp-service: Twilio (TWILIO_*) OR Meta Cloud API, per WhatsappConfig
   │            (OTP-verified number; MessageDelivery tracks lifecycle; DLQ after retries)
   └─ web push→ push-channel (VAPID subscription)
```

Cross-channel deliveries are tracked in `MessageDelivery` (pending→queued→sent→delivered→read / failed→bounced) with `DeliveryDeadLetter` for poison messages. Broadcasting (bulk campaigns) reuses the same delivery plumbing (`MessageBroadcast`/`BroadcastTarget`). Realtime: `realtime-event-bus.ts` publishes to `/api/events/{notifications,payments,workflows,messages,ai}` SSE streams and the `/api/ws` socket.
