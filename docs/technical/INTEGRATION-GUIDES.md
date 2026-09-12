# Integration Guides — AcquisitionOS

> Owner: Engineering. Status: Living document. Last reviewed: 2026-09-09.
> Source: `src/lib/*`, `src/app/api/*/route.ts`, `.env`. Each integration: what it does, credentials needed, how it's configured, what happens if it fails.

---

## 1. Google OAuth (Sign-In)

**What it does:** Lets users sign in / sign up with their Google account instead of email+password.

**Credentials needed:**
- `GOOGLE_CLIENT_ID` — from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID (Web application type).
- `GOOGLE_CLIENT_SECRET` — the matching secret.

**How it's configured:**
- Google Cloud Console → OAuth consent screen (External, with the app's logo + privacy + terms URLs).
- Authorized redirect URIs must include `<APP_URL>/api/auth/callback/google` for *every* deployment domain. Because preview URLs change per session, the platform's `/api/auth/google/redirect-uri` endpoint reports the current redirect URI to register.
- `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ENABLE_GOOGLE_OAUTH=true`.
- `/api/auth/config` returns `{ googleAvailable: true }` (hardcoded — credentials validated at token exchange).

**Flow:** frontend `startGoogleOAuth` → `GET /api/auth/google/state?origin=<window.location.origin>` → returns `{ authUrl }` → browser redirects to Google → Google redirects back to `/api/auth/callback/google` → token exchange → user lookup/backfill/create → JWT session → cross-domain relay if needed → cookies set → redirect to `/`.

**What happens if it fails:**
- `redirect_uri_mismatch` (Google's 400 page): the current deployment's redirect URI isn't in Google Console. Fix: add it (visit `/api/auth/google/redirect-uri` on that domain).
- `?auth_error=google_failed` (toast "Google sign-in failed"): the callback's `handleGoogleOAuth` returned null — check server logs for `[G-CB] Step N` to find the failing step (token exchange, userinfo, DB upsert, session creation).
- `?auth_error=no_code`: Google returned without a `code` (user cancelled).
- `?auth_error=relay_invalid_token`: the cross-domain relay JWT (60s TTL) expired or signature mismatch (different `JWT_SECRET` between canonical + user-origin deployments).

**Key files:** `src/app/api/auth/google/state/route.ts`, `callback/google/route.ts`, `google/relay/route.ts`, `src/lib/oauth-relay.ts`, `src/components/dashboard/auth-pages-v2.tsx` (`startGoogleOAuth`).

---

## 2. Gmail SMTP (Outbound Email)

**What it does:** Sends outreach + confirmation + magic-link + invoice + notification emails via the user's own Gmail (or any SMTP) using an App Password.

**Credentials needed:**
- `SMTP_HOST` (e.g. `smtp.gmail.com`)
- `SMTP_PORT` (e.g. `587` for TLS, `465` for SSL)
- `SMTP_USER` (the Gmail address)
- `SMTP_PASSWORD` (a Gmail **App Password** — 16 chars, not the account password; requires 2FA on the Google account)
- `EMAIL_FROM` (defaults to SMTP_USER)
- Optional: `SMTP_FROM` (display-name override), `RESEND_API_KEY` (preferred provider if set).

**How it's configured:**
- Google Account → Security → 2-Step Verification → App Passwords → generate one for "Mail".
- `.env`: the vars above.
- `src/lib/email.ts` `sendEmail()` tries Resend first (if `RESEND_API_KEY` set), then Nodemailer SMTP. 3 retries with 2s/4s/8s backoff. Permanent errors (Gmail daily limit 5.4.5, auth failure 535, invalid from 553, mailbox unavailable 550) are NOT retried.
- Alias-aware env resolution (`src/lib/email-ethereal.ts`): accepts `SMTP_USER`/`GMAIL_USER`/`EMAIL_USER`, `SMTP_PASSWORD`/`SMTP_PASS`/`GMAIL_APP_PASSWORD` etc.

**What happens if it fails:**
- Gmail daily sending limit exceeded (5.4.5): `sendEmail` returns `{ sent:false, error }` permanently; the calling route returns 502 / surfaces a "delivery failed" toast. The user must wait until the next day or switch to Resend / their own SMTP.
- Auth failure (535): wrong App Password. The `/api/auth/email-diagnostic` endpoint (CRON_SECRET-gated) tests SMTP connectivity.
- Magic-link / OTP delivery failure: the `/api/auth/magic-link/request` route returns `deliveryIssue: true` + a human message; the frontend shows it.

**Key files:** `src/lib/email.ts`, `src/lib/email-ethereal.ts`, `src/app/api/auth/email-diagnostic/route.ts`, `docs/04-secrets-and-configuration/GMAIL-SMTP-SETUP.md`.

---

## 3. Gmail API (Inbox Sync + Send + Reply via OAuth)

**What it does:** Per-user Gmail OAuth — read inbox, sync threads, send as the user, reply to threads, create drafts, unsubscribe, classify replies. This is separate from SMTP; OAuth is used when the user connects their Gmail account in the app (not for sign-in).

**Credentials needed:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (same as sign-in). Scopes: `gmail.readonly`, `gmail.send`, `gmail.modify`, `gmail.metadata`.

**How it's configured:**
- User clicks "Connect Gmail" → `POST /api/integrations/gmail/connect` → redirects to Google consent → `GET /api/integrations/google/callback` → stores `EmailAccount` (encrypted access + refresh tokens).
- `src/lib/gmail-oauth-service.ts` (`getValidGmailAccessToken`) auto-refreshes expired tokens.
- `src/lib/gmail-delivery-service.ts` sends via the Gmail API (raw RFC-822). Rate-limited (per-user Gmail quota). Bounce detection.
- Pub/Sub push (`/api/gmail/pubsub/webhook`) for real-time inbox updates; setup via `/api/gmail/pubsub/setup`.

**What happens if it fails:**
- Token refresh failure: `EmailAccount.status` flipped to `expired`; UI shows "Reconnect Gmail".
- Gmail daily quota: `gmail-delivery-service` detects the 429 + backoff; falls back to SMTP if available.
- Pub/Sub verification failure (401 on the webhook): the webhook returns 401; Google retries. Fix: re-run `/api/gmail/pubsub/setup`.

**Key files:** `src/app/api/integrations/google/{connect,callback,disconnect}/route.ts`, `src/lib/gmail-oauth-service.ts`, `src/lib/gmail-delivery-service.ts`, `src/lib/gmail-inbox-service.ts`, `src/lib/gmail-reply-processor.ts`, `src/app/api/gmail/pubsub/{setup,webhook}/route.ts`.

---

## 4. Google Calendar + Google Meet

**What it does:** Per-user Calendar OAuth — real-time free/busy availability, create events with auto-generated Google Meet links, update/cancel/reschedule events, push notifications (watch channels) for calendar changes.

**Credentials needed:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Scopes: `calendar.readonly`, `calendar.events`. Optional `GOOGLE_API_KEY` (referenced in some freeBusy URLs but not required when using OAuth).

**How it's configured:**
- Meeting Preferences dialog → "Connect Google Calendar" → `POST /api/calendar/connect` → `buildGoogleCalendarAuthUrl` → Google consent → `GET /api/calendar/callback` → stores `GoogleCalendarToken` (encrypted) + sets `UserSettings.googleCalendarConnected=true`.
- Real-time connection status: `/api/meetings/settings` GET derives `googleCalendarConnected` from the actual `GoogleCalendarToken` row (not the stale UserSettings flag).
- Availability: `POST /api/calendar/availability` (free/busy for a date) and `POST /api/meetings/check-availability` (free/busy for a range, merged with DB meetings, respecting working hours + buffer).
- Meeting creation: `POST /api/meetings` → `createGoogleMeetMeeting` → `GoogleMeetAdapter.createMeeting` → `POST calendars/primary/events?conferenceDataVersion=1&sendUpdates=all` with `conferenceData.createRequest.conferenceSolutionKey.type='hangoutsMeet'` → extracts `event.hangoutLink` (or `conferenceData.entryPoints[].uri` where `entryPointType==='video'`).
- Watch channels (push notifications): `/api/calendar/watch` + `/api/calendar/webhook`.

**What happens if it fails:**
- Token expired: `getValidCalendarAccessToken` auto-refreshes; if refresh fails, `GoogleCalendarToken.status='expired'` + UI shows "Reconnect".
- 401 from Google API: token marked disconnected; the route returns 401 "Calendar token expired. Please reconnect."
- `conferenceData` not generated (Meet link missing): the meeting is saved with `meetingUrl=null` and the orchestration continues "without calendar event" (logged). The user can re-create the event later.
- Hardcoded `calendars/primary`: every Google call uses the user's primary calendar. Multi-calendar selection is on the roadmap.

**Key files:** `src/lib/google-oauth.ts` (`buildGoogleCalendarAuthUrl`, `getValidCalendarAccessToken`, `refreshGoogleToken`, `disconnectGoogleCalendar`), `src/lib/meetings/platform-adapter.ts` (`GoogleMeetAdapter`), `src/lib/meeting-orchestration-service.ts` (`checkAvailability`, `createGoogleMeetMeeting`), `src/app/api/calendar/*`.

---

## 5. Stripe (Payments)

**What it does:** Subscription billing + one-time credit packs + invoices. Stripe is the primary global provider.

**Credentials needed:**
- `STRIPE_SECRET_KEY` (`sk_live_...` or `sk_test_...`)
- `STRIPE_WEBHOOK_SECRET` (`whsec_...`)
- (Optional) `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (for Stripe Elements if used)

**How it's configured:**
- Stripe Dashboard → Products + Prices (monthly Pro, monthly Elite, credit packs).
- Stripe Dashboard → Webhooks → endpoint `<APP_URL>/api/payments/webhook/stripe`, events: `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.updated`.
- `.env`: the keys above.
- `src/lib/stripe-service.ts` + `src/lib/payment-service.ts` (`createStripeCheckoutSession`, `confirmPaymentAndActivate`, `handleStripeEvent`).
- Checkout `success_url` = `${APP_URL}/?payment=success&plan=<plan>&session_id={CHECKOUT_SESSION_ID}`; `cancel_url` = `${APP_URL}/?payment=cancelled`. Activation is via webhook, NOT via the redirect-back.

**What happens if it fails:**
- Missing `STRIPE_SECRET_KEY`: `/api/payments/create-stripe-session` returns 500 "Stripe is not configured."
- Webhook signature mismatch: 400 (Stripe retries — if it keeps failing, Stripe emails the account owner).
- Webhook idempotency: `PaymentWebhook` table keys on event ID; retries are no-ops.
- Activation transaction failure: `db.$transaction` rolls back; we return 5xx; Stripe retries the webhook.
- `/api/payments/confirm` in production: 403 "Direct payment confirmation is disabled in production. Subscriptions are activated automatically by the Stripe/Razorpay webhook." (dev-only endpoint; defense in depth).

**Key files:** `src/app/api/payments/{create-stripe-session,create-checkout-session,webhook/stripe}/route.ts`, `src/lib/payment-service.ts`, `src/lib/stripe-service.ts`, `src/lib/stripe-portal-service.ts`, `docs/04-secrets-and-configuration/STRIPE-SETUP.md`.

---

## 6. Razorpay (India Payments + GST)

**What it does:** INR payments for Indian users with GST invoice generation.

**Credentials needed:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (or via the Razorpay service). GST: `src/lib/gst-service.ts` + `src/lib/tax-service.ts` compute tax per the user's state of supply.

**How it's configured:**
- Razorpay Dashboard → create the plan + add-on products.
- `.env`: the keys.
- `src/lib/razorpay-service.ts` creates orders; the frontend `checkout-modal.tsx` + `upgrade-modal.tsx` + `pricing-page.tsx` open the Razorpay checkout (Razorpay JS SDK).
- Webhook (Razorpay): handled alongside Stripe in the payment-service abstraction.
- GST invoice: generated via `src/lib/invoice-service.ts` + `src/lib/invoice-pdf-service.ts`; emailed via `src/lib/invoice-email-service.ts`.

**What happens if it fails:**
- Razorpay SDK fails to load: the modal shows an error (no mock fallback — ADR).
- Payment failure: order marked `failed`; the user is shown the failure; dunning flow triggers.
- GST computation error: invoice generated without tax + flagged for manual review.

**Key files:** `src/lib/razorpay-service.ts`, `src/lib/gst-service.ts`, `src/lib/tax-service.ts`, `src/components/dashboard/{checkout,upgrade,pricing-page}.tsx`.

---

## 7. Telegram (Notifications)

**What it does:** Sends the user notifications via a Telegram bot (their chosen chat). One-way (notifications out); replies are not processed.

**Credentials needed:** a Telegram Bot token (from @BotFather) + the user's chat ID.

**How it's configured:**
- User goes to Settings → Integrations → Telegram → "Connect" → `POST /api/integrations/telegram/generate-code` returns a one-time code → user messages the bot `/start <code>` → `/api/integrations/telegram/link` links the chat → stores `TelegramConfig` (bot token encrypted, chat ID).
- `src/lib/telegram-service.ts` sends messages via the Telegram Bot API.
- `src/lib/notification-channels/telegram-channel.ts` is the notification fan-out for Telegram.

**What happens if it fails:**
- Bot token invalid: send fails silently (logged); the channel is marked unhealthy.
- User blocked the bot: 403 from Telegram; channel disabled.

**Key files:** `src/app/api/integrations/telegram/*/route.ts`, `src/lib/telegram-service.ts`, `src/lib/notification-channels/telegram-channel.ts`, `docs/05-features/AUTHENTICATION.md` (mentions Telegram as a notification channel).

---

## 8. WhatsApp via Twilio (Notifications)

**What it does:** Sends the user notifications via WhatsApp (Twilio's WhatsApp Business API). Notification-only; not a 2-way conversation.

**Credentials needed:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (the WhatsApp Business number), the user's WhatsApp number (verified via OTP).

**How it's configured:**
- Twilio Console → WhatsApp Business → sender number → message templates.
- `.env`: the keys.
- User goes to Settings → Integrations → WhatsApp → "Connect" → `POST /api/integrations/whatsapp/send-otp` sends an OTP via WhatsApp → user enters it → `POST /api/integrations/whatsapp/verify-otp` verifies → stores `WhatsappConfig`.
- `src/lib/whatsapp-service.ts` sends messages via the Twilio API.
- `src/lib/notification-channels/whatsapp-channel.ts` is the notification fan-out.

**What happens if it fails:**
- Twilio credentials invalid: send fails (logged); channel unhealthy.
- WhatsApp number not verified: `verify-otp` returns 400.
- Template not approved by WhatsApp: send rejected by Twilio; logged.

**Key files:** `src/app/api/integrations/whatsapp/*/route.ts`, `src/lib/whatsapp-service.ts`, `src/lib/notification-channels/whatsapp-channel.ts`, `docs/08-whatsapp-integration/WHATSAPP-SETUP.md`.

---

## 9. Google Custom Search API (Lead Discovery)

**What it does:** Powers lead discovery — queries Google Custom Search for businesses in a niche + location, returns URLs the scraper then processes.

**Credentials needed:**
- `GOOGLE_SEARCH_API_KEY` (Google Cloud Console → Custom Search API → enable + create API key)
- `GOOGLE_SEARCH_CX` (a Custom Search Engine ID, configured to search the whole web or a specific site set)

**How it's configured:**
- Google Cloud Console → Custom Search API → enable.
- Programmable Search Engine → create one configured for "Search the entire web" → copy the CX.
- `.env`: the keys.
- `src/lib/lead-discovery/discovery-engine.ts` builds the query (`<niche> in <location>`), calls the CSE API, returns URLs.
- Cost: $5 per 1,000 queries (we batch; the credits system covers this).

**What happens if it fails:**
- 403 (API key invalid / API not enabled): discovery job fails; user shown "Search API not configured."
- 429 (quota exceeded): backoff + retry; if persistent, job fails.
- Daily quota (100/day free tier): the team monitors; upgrade to paid tier when needed.

**Key files:** `src/lib/lead-discovery/discovery-engine.ts`, `src/lib/lead-discovery-service.ts`, `docs/04-secrets-and-configuration/GOOGLE-CLOUD-SETUP.md`.

---

## 10. Z-AI Provider (Chat + Embeddings + Outreach Generation)

**What it does:** Primary AI provider for: lead scoring (with reasoning), outreach generation, reply classification, AI chat assistant, RAG, vector search, meeting prep/follow-up/action-items/sentiment/objections.

**Credentials needed:** the `z-ai-web-dev-sdk` (configured in the runtime environment; no per-user key). Used **only in the backend** (ADR-006).

**How it's configured:**
- The SDK is initialised in `src/lib/ai/ai-provider.ts` + `src/lib/ai-provider-fallback.ts`.
- Every AI call goes through the provider abstraction; fallback chain if the primary fails.
- Cost tracking: `src/lib/ai-cost-tracker.ts` records tokens in / out / cost per call → `AiCostRecord` → credits deducted via `src/lib/credit-service.ts`.
- Prompt centralisation: `src/lib/ai/prompt-manager.ts` + `src/app/api/ai/prompts`.

**What happens if it fails:**
- Provider outage: fallback chain kicks in (ADR-006); if all providers fail, the calling route returns 503 "AI service unavailable."
- Cost spike: per-user `AiCostRecord` lets the admin dashboard spot abusers.
- Rate limit (provider-side): backoff + retry; credits are only deducted on success.

**Key files:** `src/lib/ai/ai-provider.ts`, `src/lib/ai-provider-fallback.ts`, `src/lib/ai/{scoring-engine,outreach-generator,chat-service,memory-service,meeting-assistant,lead-analysis-engine}.ts`, `src/lib/ai-cost-tracker.ts`, `src/lib/credit-service.ts`.

---

## 11. Resend (Email, Optional Primary)

**What it does:** Optional primary email provider (preferred over SMTP if configured). Higher deliverability + a real sending domain.

**Credentials needed:** `RESEND_API_KEY` (`re_...`).

**How it's configured:**
- Resend Dashboard → API key (sending domain verified).
- `.env`: `RESEND_API_KEY`.
- `src/lib/email.ts` `sendEmail()` tries Resend first (if `isRealResendConfigured()`), then SMTP.
- `sendViaResend` passes `cc`/`bcc`/`reply_to` through (added 2026-09).

**What happens if it fails:**
- Resend error: falls through to SMTP; if SMTP also fails, returns the last error.
- Invalid API key: `isRealResendConfigured()` returns false → SMTP path only.

**Key files:** `src/lib/email.ts` (`sendViaResend`, `isRealResendConfigured`).

---

*See also: [API-REFERENCE.md](API-REFERENCE.md), [ERROR-CODES.md](ERROR-CODES.md), [ARCHITECTURE-DECISION-RECORDS.md](ARCHITECTURE-DECISION-RECORDS.md), and `docs/04-secrets-and-configuration/ALL-SECRETS.md` for the complete env-var reference.*
