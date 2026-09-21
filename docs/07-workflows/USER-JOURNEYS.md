# User Journeys — Step-by-Step

Real routes and pages referenced throughout. Routes marked ⛔ require credentials not yet configured (Stripe, channels) — see status notes in `01-overview/FEATURE-LIST.md`.

## 1. New User Signup and First Login

1. Visit the app root (`/`) → unauthenticated visitors are redirected by `AuthGate` to `/auth/signup`.
2. Choose **Email** → enter name/email/password → `POST /api/auth/signup`.
3. Verification OTP is emailed (or returned in the response when `AUTH_DEV_OTP_IN_RESPONSE=true` in dev) → enter it → account verified.
   - Prefer passwordless? Use **Send me a code** (OTP) or **Magic link** buttons instead.
   - Prefer Google? **Continue with Google** → consent → back on the dashboard (requires the domain's redirect URI registered in GCP).
4. `POST /api/auth/signin` (or OTP/Google callback) sets httpOnly session cookies → `AuthGate` renders the dashboard shell at `/`.
5. New accounts start on the **free plan with 50 credits**; the onboarding checklist (`OnboardingProgress`, `/api/settings/onboarding`) tracks first steps: set niche, run first discovery, connect channels.
6. Optional hardening: enable MFA (Settings → Security → `/api/auth/mfa/setup` — scan TOTP QR, save backup codes).

## 2. Running Lead Discovery for the First Time

1. Dashboard → **Lead Discovery** tab → enter a **niche** (e.g. "dentist") and **location** (e.g. "Austin, TX"), set result count → **Start Discovery** (`POST /api/discovery/start`).
2. The job runs: Google search → scrape → score → AI research. Watch progress (`/api/discovery/status`) or the live activity feed.
3. When complete, the leads list shows each business with: website quality badge, digital weaknesses, AI scores (reply/conversion/urgency/revenue) with reasoning, contact info.
4. Open a lead → **Research** for the deep AI profile (decision maker, opportunity, estimated deal value) → costs credits.
5. Filter by `replyScore` to find the most reachable prospects first. Tags/notes can be added (`/api/leads/[id]/notes`).

## 3. Sending Outreach Emails

1. From a lead (or multi-select in the leads table) → **Generate outreach** (`POST /api/ai/outreach/generate`) → the draft references the lead's actual weaknesses — edit if needed.
2. Send now (`POST /api/outreach/send`) or schedule (`/api/email/schedule`), or **Batch** select many → `/api/outreach/batch`.
3. For multi-touch: create a **Sequence** (e.g. Day 0 intro, Day 3 bump, Day 7 case study) → enroll leads (`/api/sequences/enroll`) → cron advances steps.
4. Track outcomes in the lead record: open/click events (`EmailOpenEvent/EmailClickEvent`), bounces, replies.
5. Sending identity: platform SMTP by default; or connect your own Gmail (`/api/gmail/connect`) to send from your mailbox.

## 4. Managing the Sales Pipeline

1. Dashboard → **Pipeline**: Kanban board with default stages (discovered → contacted → replied → qualified → proposal → won/lost) plus org-custom stages.
2. Drag or use the lead menu → **Move stage** (`/api/leads/[id]/move-stage`) — every move is audited (`LeadActivity`).
3. Add **deals** with values (`/api/deals`) for qualified leads; deal risk + funnel velocity widgets show health.
4. Set **follow-up reminders** (`/api/leads/[id]/reminders`) so nobody goes cold; reminders surface in notifications and (optionally) Telegram/WhatsApp.
5. **Hot leads** (`/api/hot-leads/feed`) automatically surface leads whose engagement spikes (opens + clicks + positive reply signals).

## 5. Handling a Lead Reply and Scheduling a Meeting

1. Reply arrives (Gmail-integrated inbox sync, `/api/gmail/process-replies`, or reply webhook) → reply-intelligence classifies it: interested / not-interested / meeting-request / unsubscribe (`/api/reply-intelligence/classify`).
2. Buying signals are extracted and the lead's scores/stage update automatically (`/api/autonomous/classify-reply`, pipeline move).
3. If scheduling intent is detected (`/api/meetings/detect-intent` — "Tuesday 3pm works"), the meeting engine proposes slots from your Google Calendar availability (`/api/meetings/suggest-slots`).
4. Depending on **autonomy mode** (Settings → Autonomy): the system auto-books (`/api/calendar/ai-book`) or waits in **Pending approvals** for your one-click confirm (`/api/meetings/[id]/approve`).
5. On confirmation: calendar event created, invite emailed, reminders queued (`MeetingReminder` → email/Telegram/WhatsApp/in-app).
6. After the meeting: AI generates prep→notes→**action items** (`/api/meetings/[id]/extract-actions`) and a **follow-up email** draft; CRM sync logs everything.

## 6. Setting Up Google Calendar Integration

1. Settings → Integrations → **Connect Google Calendar** (`GET /api/calendar/connect`) → Google consent (Calendar scope) → `/api/calendar/callback` stores the token.
2. Availability check (`/api/calendar/availability`) now reflects real free/busy.
3. Optional: push notifications for changes via `/api/calendar/watch` (needs a public webhook URL).
4. Disconnect anytime (`/api/calendar/disconnect`) — tokens are deleted, meetings engine falls back to manual slots.

## 7. Upgrading from Free to Paid Plan ⛔ (inactive until Stripe keys set)

1. Credits running low or a plan gate hit → **Upgrade** CTA (credit-gate dialog) → billing page (`/dashboard/billing`).
2. Choose plan (pro/elite) + cycle (monthly/yearly) → Checkout modal → `POST /api/payments/create-stripe-session` → Stripe hosted page.
3. Pay (test card `4242…` in test mode) → redirect back → webhook fulfills (subscription + credits + invoice) → plan badge updates.
4. Manage later via Stripe portal (`/api/payments/stripe-portal`) or subscriptions APIs (cancel/downgrade previews).
5. Until Stripe keys are configured, this journey stops at step 2 with a provider-status error — that is expected, not a bug.

## 8. Connecting Notification Channels (Telegram / WhatsApp)

1. Settings → Integrations → **Telegram**: generate link code (`/api/integrations/telegram/generate-code`) → message the bot → chat linked (`TelegramConfig`).
2. **WhatsApp**: enter number + Twilio/Meta credentials where prompted (`/api/whatsapp/twilio/connect` or Meta connect) → OTP verification (`send-otp`/`verify-otp`) → channel enabled.
3. Choose per-event channels in Settings → Notifications (`NotificationPreferences`): lead replied, meeting booked, payment events, weekly digest.
