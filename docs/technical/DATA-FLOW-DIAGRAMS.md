# Data Flow Diagrams — AcquisitionOS

> Owner: Engineering. Status: Living document. Last reviewed: 2026-09-09.
> Source: the codebase (`src/app/api/`, `src/lib/`). Each diagram is a sequence, not a static architecture.

## 1. User Signs Up

```
Browser                       Next.js API                      Database                     Email (SMTP)
  |                              |                                |                            |
  |--POST /api/auth/signup------->|                               |                            |
  |   {email, password, name}     |                                |                            |
  |                              |--validate email format--------->|                            |
  |                              |--check email not taken--------->|                            |
  |                              |--hash password (bcrypt)-------->|                            |
  |                              |--create User (emailVerified=false, plan=free, isTrial=true,-->| 
  |                              |   trialEndsAt=+14d, credits=50) |                            |
  |                              |--create Subscription (trial)-->|                            |
  |                              |--create UserSettings----------->|                            |
  |                              |--generate email OTP------------>|                            |
  |                              |--store OTP+expiry on User----->|                            |
  |                              |--send verification email--------------------------------------->|
  |<-200 {user, message}---------|                                |                            |
  |                              |                                |                            |
  |--POST /api/auth/verify-email->|                                |                            |
  |   {email, otp}               |                                |                            |
  |                              |--verify OTP (secureCompare)-->|                            |
  |                              |--clear OTP, set emailVerified=true-->|                     |
  |<-200 {verified:true}---------|                                |                            |
  |                              |                                |                            |
  |--POST /api/auth/signin------->|                                |                            |
  |   {email, password}          |                                |                            |
  |                              |--verify password (bcrypt)----->|                            |
  |                              |--gate: emailVerified?---------->|                            |
  |                              |--generate access+refresh JWT-->|                            |
  |                              |--create UserSession----------->|                            |
  |                              |--set httpOnly cookies (access /, refresh /api/auth)---------->|
  |<-200 {user} + Set-Cookie-----|                                |                            |
```

**Key files:** `src/app/api/auth/signup/route.ts`, `signin/route.ts`, `verify-email/route.ts`, `src/lib/auth.ts` (`hashPassword`, `verifyPassword`, `generateAccessToken`, `createSession`, `setAuthCookies`).

---

## 2. User Discovers Leads

```
Browser                       Next.js API                      Discovery Engine           Google CSE       Scraper (Cheerio)
  |                              |                                |                         |                |
  |--POST /api/discovery/start-->|                                |                         |                |
  |   {niche, location, limit}    |                                |                         |                |
  |                              |--withAuth (session or API key)->|                         |                |
  |                              |--check entitlement (discover:write)                      |                |
  |                              |--check credits (OUTREACH_CREDIT_COST * limit)            |                |
  |                              |--deduct credits atomically (CreditsLedger)               |                |
  |                              |--create DiscoveryJob (status=running)-->|                |                |
  |                              |--call discoveryEngine.discover(niche, location, limit)-->|                |
  |                              |                                |--query Google CSE------->|                |
  |                              |                                |<-results (URLs+titles)---|                |
  |                              |                                |--for each URL: scrape--->|                |
  |                              |                                |                                |--fetch HTML-->|
  |                              |                                |                                |<-HTML---------|
  |                              |                                |                                |--Cheerio parse|
  |                              |                                |                                |--compute website-quality score|
  |                              |                                |<-Leads[] (businessName, email, website, score)|
  |                              |                                |                                |                |
  |                              |--for each lead: db.lead.create (stage=discovered)         |                |
  |                              |--for each lead: queue AI scoring (async)                 |                |
  |                              |--update DiscoveryJob (status=complete, progress=100)     |                |
  |<-202 {jobId}-----------------|                                |                         |                |
  |                              |                                |                         |                |
  |--GET /api/discovery/status?jobId-->|                          |                         |                |
  |<-200 {progress, leadsCount}------|                            |                         |                |
  |                              |                                |                         |                |
  |--GET /api/leads?discoveryJobId=-->|                          |                         |                |
  |<-200 {leads[]}--------------|                                |                         |                |
```

**Key files:** `src/app/api/discovery/start/route.ts`, `src/lib/lead-discovery/discovery-engine.ts`, `company-researcher.ts`, `website-scorer.ts`, `src/lib/credit-service.ts` (deductCredits), `src/lib/entitlement-middleware.ts`.

**Async tail:** AI scoring runs via `/api/ai/score` or the autonomous pipeline cron; each scored lead gets a `LeadScore` row with reasoning.

---

## 3. Outreach Email Is Sent

```
Browser                       Next.js API (communications)      SMTP (Nodemailer/Resend)    Lead inbox       User inbox
  |                              |                                |                          |                |
  |--(Outreach tab) user clicks  |                                |                          |                |
  |  "Generate" -> POST /api/leads/[id]/outreach                 |                          |                |
  |<-200 {messages:{subject,body}}|                                |                          |                |
  |  (no email sent yet)         |                                |                          |                |
  |                              |                                |                          |                |
  |--user edits, clicks "Send & Log"                              |                          |                |
  |--POST /api/leads/[id]/communications->|                       |                          |                |
  |   {channel:'email', direction:'outbound', content}            |                          |                |
  |                              |--withAuth (session or API key) |                          |                |
  |                              |--load lead (id, email, businessName, userId)                |                |
  |                              |--gate: channel==='email' && direction==='outbound'         |                |
  |                              |--gate: lead.email exists? (else 400)                       |                |
  |                              |--gate: isEmailServiceConfigured()? (else 503)             |                |
  |                              |--load user (id, name, email, company, settings.companyName) |
  |                              |--derive subject (parse "Subject:" prefix or synthesize)    |
  |                              |--build HTML body (signature from user name+business)       |
  |                              |--emailPayload = {to: lead.email, subject, html, text}      |
  |                              |--if user.email != lead.email: emailPayload.bcc = user.email|
  |                              |--sendEmail(emailPayload)------->|                          |                |
  |                              |                                |--try Resend (if configured)               |                |
  |                              |                                |--else Nodemailer SMTP (3 retries)        |                |
  |                              |                                |   host=SMTP_HOST, auth=SMTP_USER/SMTP_PASS|                |
  |                              |                                |--SMTP 250 OK--------------------------------->|              |
  |                              |<-{sent:true, messageId}--------|                          |                |
  |                              |                                |  (BCC delivers copy to user inbox)--------->|--------------->|
  |                              |                                |                          |                |
  |                              |--send confirmation email to user (separate sendEmail)----->|                |
  |                              |   subject: "✉️ Outreach sent to {businessName} — copy"    |                |
  |                              |   html: confirmation template                              |--------------->|
  |                              |                                |                          |                |
  |                              |--db.lead.update (lastContactedAt=now, emailStatus='sent')  |                |
  |                              |--db.leadActivity.create (type='email_sent')                |                |
  |                              |--db.communication.create (channel, direction, content, ...)|
  |                              |--auto-update lead stage (discovered→contacted)            |
  |<-201 {communication, emailSent:true, emailMessageId}                                         |
```

**Key files:** `src/app/api/leads/[id]/communications/route.ts`, `src/lib/email.ts` (`sendEmail`, `sendViaResend`, `sendViaSmtp`), `src/lib/lead-discovery/outreach-sender.ts` (the autonomous path).

---

## 4. Lead Replies and Meeting Is Scheduled

```
Gmail Inbox                  Gmail Pub/Sub              Next.js API                  Reply Intel          Meeting Engine           Google Calendar API
  |                              |                        |                            |                    |                        |
  |--reply lands in user's Gmail->|                       |                            |                    |                        |
  |<-Pub/Sub push (POST /api/gmail/pubsub/webhook)-------->|                         |                    |                        |
  |                              |                        |--verify Pub/Sub token    |                    |                        |
  |                              |                        |--fetch full message (Gmail API)               |                        |
  |                              |                        |--db.emailMessage.create (direction=inbound) |                        |
  |                              |                        |--db.leadActivity.create (type=email_received)|                       |
  |                              |                        |--replyIntel.classify(content, thread context)-->|                       |
  |                              |                        |                            |--AI classify (interested/not/meeting/unsubscribe)
  |                              |                        |                            |--extract buying signals                       |
  |                              |                        |<-{intent:'meeting_request', buyingSignals:[...]}|                       |
  |                              |                        |--db.communication.create (intent, buyingSignals)                    |
  |                              |                        |--if intent==='meeting_request':                                       |
  |                              |                        |  meetingOrchestrator.detectMeetingIntent(replyText)-->|                |
  |                              |                        |                            |                    |--parse proposed time     |
  |                              |                        |                            |                    |--db.meetingIntentLog.create|
  |                              |                        |                            |                    |                        |
  |                              |                        |--per autonomyMode:                                                  |
  |                              |                        |   approval  -> create Meeting(status=pending_approval)               |
  |                              |                        |                -> notify user, wait for /api/meetings/[id]/approve     |
  |                              |                        |   assisted   -> propose slots, auto-create on user click             |
  |                              |                        |   autonomous-> checkAvailability(userId, proposedTime)------------->|
  |                              |                        |                            |                    |  --freeBusy query------>|
  |                              |                        |                            |                    |<-busy slots-------------|
  |                              |                        |                            |                    |--if slot free:          |
  |                              |                        |                            |                    |  GoogleMeetAdapter.createMeeting()
  |                              |                        |                            |                    |   POST calendars/primary/events?conferenceDataVersion=1
  |                              |                        |                            |                    |   {conferenceData:{createRequest:{type:'hangoutsMeet'}}}
  |                              |                        |                            |                    |<-{id, hangoutLink, conferenceData}|
  |                              |                        |                            |                    |--db.meeting.create (status=scheduled, meetingUrl=hangoutLink, calendarEventId)
  |                              |                        |                            |                    |--send confirmation email to lead + user
  |                              |                        |                            |                    |--create MeetingReminders
  |                              |                        |<-201 {meeting, googleMeetLink}|                   |
  |<-200 (ack Pub/Sub)---------|                        |                            |                    |                        |
```

**Key files:** `src/app/api/gmail/pubsub/webhook/route.ts`, `src/lib/gmail-reply-processor.ts`, `src/lib/reply-intelligence.ts`, `src/lib/meeting-orchestration-service.ts`, `src/lib/meetings/platform-adapter.ts`, `src/app/api/meetings/route.ts`.

---

## 5. User Upgrades Plan and Payment Is Processed

```
Browser                  Next.js API                 Stripe                  User DB
  |                       |                          |                       |
  |--click "Upgrade to Pro" (pricing-page or upgrade-modal)                |
  |--POST /api/payments/create-stripe-session {plan:'pro', period:'monthly'}|
  |                       |--withAuth (session)     |                       |
  |                       |--create Stripe Checkout session (line items, success_url=APP_URL/?payment=success&plan=pro&session_id={CHECKOUT_SESSION_ID}, cancel_url=APP_URL/?payment=cancelled)-->|
  |                       |<-{url: checkout.session.url}                    |
  |<-200 {url}------------|                          |                       |
  |                       |                          |                       |
  |--window.location.href = url (redirect to Stripe Checkout)              |
  |                       |                          |                       |
  |--user pays on Stripe Checkout (Stripe-hosted page)                    |
  |                       |                          |                       |
  |                       |<-Stripe webhook (checkout.session.completed) (POST /api/payments/webhook/stripe)|
  |                       |--verify Stripe signature (STRIPE_WEBHOOK_SECRET)|
  |                       |--idempotency: check PaymentWebhook by event ID  |
  |                       |--db.paymentWebhook.create (eventId, payloadHash)|
  |                       |--find PaymentOrder by metadata.order_id         |
  |                       |--verify amount matches                          |
  |                       |--db.$transaction:                              |
  |                       |   - update Subscription (plan=pro, status=active, currentPeriodEnd)|
  |                       |   - update User.plan=pro, creditsMonthly=500, rolloverCredits|
  |                       |   - create CreditsLedger (monthly grant)        |
  |                       |   - create Invoice (number, pdfUrl)             |
  |                       |--send invoice email to user                    |
  |                       |                          |                       |
  |--(browser returns from Stripe) GET /?payment=success&plan=pro&session_id=...|
  |                       |--AuthGate detects ?payment=success           |
  |                       |--toast.info("Payment received. Your plan will be updated to Pro shortly.")|
  |                       |--fetch /api/auth/me (new plan visible after webhook processed)|
  |<-200 (dashboard renders with Pro entitlements)                         |
```

**Key files:** `src/app/api/payments/create-stripe-session/route.ts`, `src/app/api/payments/webhook/stripe/route.ts`, `src/lib/payment-service.ts` (`createStripeCheckoutSession`, `confirmPaymentAndActivate`), `src/lib/stripe-service.ts`, `src/components/dashboard/upgrade-modal.tsx`, `pricing-page.tsx`, `src/components/dashboard/auth-gate.tsx`.

**Critical:** the user's plan is activated by the webhook, not by the redirect-back. The redirect-back only shows a toast. This is deliberate (ADR-003) — activation by redirect-back is forgeable; activation by webhook is verified by Stripe signature.

---

## 6. Stripe Webhook Fires and Credits Are Added

```
Stripe                  Next.js (webhook route)          DB (transaction)          Credits service
  |                       |                                |                         |
  |--POST /api/payments/webhook/stripe (raw body + Stripe-Signature header)   |
  |                       |--read raw body (NOT parsed JSON — signature needs raw)|
  |                       |--stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)|
  |                       |--if signature invalid: 400 (Stripe will retry)   |
  |                       |--switch event.type:                              |
  |                       |   case 'checkout.session.completed':              |
  |                       |     --extract metadata (order_id, user_id, plan) |
  |                       |     --find PaymentOrder by metadata.order_id      |
  |                       |     --if already processed (PaymentWebhook by event.id): 200 (idempotent)|
  |                       |     --verify amount matches PaymentOrder         |
  |                       |     --db.$transaction:                           |
  |                       |        - db.paymentWebhook.create (eventId, payloadHash)|
  |                       |        - update Subscription (plan, status, currentPeriodEnd)|
  |                       |        - update User (plan, creditsMonthly, rolloverCredits)|
  |                       |        - creditService.grantMonthlyCredits(userId, plan)|
  |                       |           --CreditsLedger.create (action='monthly_grant', cost=+creditsMonthly, balanceAfter)|
  |                       |        - create Invoice (number, amount, tax, pdfUrl from Stripe invoice)|
  |                       |        - send invoice email                       |
  |                       |        - create Notification (payment_success)   |
  |                       |     --if any step fails: transaction rolls back, return 500 (Stripe retries)|
  |                       |   case 'invoice.payment_succeeded': (renewal)    |
  |                       |     --same flow, marks renewal, grants new monthly credits|
  |                       |   case 'customer.subscription.deleted':          |
  |                       |     --update Subscription status=cancelled        |
  |                       |     --update User.plan=free, creditsMonthly=50   |
  |                       |   case 'invoice.payment_failed':                  |
  |                       |     --update Subscription status=past_due        |
  |                       |     --create Notification (payment_failed)        |
  |                       |     --trigger dunning email                      |
  |                       |   default: log + 200 (unhandled event)          |
  |<-200 {}--------------|                                |                         |
  |                       |                                |                         |
  |  (if we returned 5xx, Stripe retries per its schedule)                  |
```

**Key files:** `src/app/api/payments/webhook/stripe/route.ts`, `src/lib/payment-service.ts` (`confirmPaymentAndActivate`, `handleStripeEvent`), `src/lib/credit-service.ts` (`grantMonthlyCredits`), `src/lib/invoice-service.ts`, `src/lib/invoice-email-service.ts`.

**Idempotency:** the `PaymentWebhook` table keys on Stripe event ID. A retried webhook (Stripe retries on 5xx) is processed exactly once.

**Atomicity:** the entire activation (subscription + user + credits + invoice) is one `db.$transaction`. A failure at any step rolls back everything; we return 5xx and Stripe retries.

---

## Cross-Cutting: Auth on Every Request

```
Browser                proxy.ts (middleware)           API route handler          auth-middleware (withAuth)        DB
  |                       |                              |                          |                                |
  |--request + cookies---->|                              |                          |                                |
  |                       |--attach request headers------>|                         |                                |
  |                       |                              |--withAuth(request, cb)--->|                                |
  |                       |                              |                          |--read access_token cookie (or Authorization: Bearer)|
  |                       |                              |                          |--verify JWT (JWT_SECRET)        |
  |                       |                              |                          |--if API key: verifyApiKey (hashCompare, scopes, rate limit)|
  |                       |                              |                          |--db.user.findUnique (id from JWT)|
  |                       |                              |                          |--check user.isActive            |
  |                       |                              |                          |--load subscription (entitlements)|
  |                       |                              |<-AuthUser {id, email, plan, role, orgId}|
  |                       |                              |--cb(authUser)              |                                |
  |                       |                              |--handler logic             |                                |
  |<-response-------------|                              |                          |                                |
```

**Key files:** `src/proxy.ts` (the Next 16 proxy), `src/lib/auth-middleware.ts` (`withAuth`, `withDualAuth`), `src/lib/auth.ts` (`getAuthUser`, `verifyToken`), `src/lib/api-key-middleware.ts` (`verifyApiKey`).

---

*See also: [API-REFERENCE.md](API-REFERENCE.md), [DATABASE-SCHEMA.md](DATABASE-SCHEMA.md), [INTEGRATION-GUIDES.md](INTEGRATION-GUIDES.md), [ARCHITECTURE-DECISION-RECORDS.md](ARCHITECTURE-DECISION-RECORDS.md).*
