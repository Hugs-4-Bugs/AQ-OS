# WhatsApp Integration — Setup & Honest Scope

## The Direct Answer First

**Will this application work 100% on WhatsApp?**

**No — and it is not designed to.** WhatsApp in AcquisitionOS is a **notification channel only**: it pushes alerts TO you (lead replied, meeting booked, payment event, reminders, digest). You cannot operate the application FROM WhatsApp — there is no WhatsApp command interface, no lead browsing, no discovery triggers, no pipeline editing via chat. The application must be used through a **web browser** (the dashboard SPA at `/`). The WhatsApp webhook endpoints (`/api/whatsapp/*/webhook`) exist to receive replies/verification events and keep delivery status current — they do not turn WhatsApp into an app interface.

## What WhatsApp Notifications Are Sent and When

Channel is invoked by the notification engine (`notification-engine.ts` → `notification-channels/whatsapp-channel.ts`), honoring the user's `NotificationPreferences`. Typical events routed to WhatsApp when enabled:

| Event | When |
|---|---|
| Lead replied | Reply intelligence classifies an inbound reply as interesting/hot |
| Meeting scheduled / rescheduled / reminder | Meeting orchestration lifecycle + `MeetingReminder` queue |
| Hot lead detected | Hot-lead scanner promotes a lead |
| Payment events | Subscription charge issues / confirmations (once payments active) |
| Weekly digest | Scheduled summary |
| Security alerts | New device / suspicious login |

Every send is tracked in `MessageDelivery` (lifecycle pending→queued→sent→delivered→read, or failed→bounced) with a dead-letter queue (`DeliveryDeadLetter`) after retries. Template content goes through `MessageTemplateApproval` where provider pre-approval is needed.

## Two Supported Providers

| Provider | Code path | Connect route | Notes |
|---|---|---|---|
| **Twilio WhatsApp** | `whatsapp-service.ts` (Twilio REST) | `POST /api/whatsapp/twilio/connect` | Fastest to start (sandbox works) |
| **Meta WhatsApp Cloud API** | `/api/whatsapp/meta/*` | `POST /api/whatsapp/meta/connect` | Official Cloud API; needs Meta app + template approvals |

Credentials are stored **per user, encrypted**, in the `WhatsappConfig` row (entered in Settings → Integrations), verified by OTP to the target number (`/api/integrations/whatsapp/send-otp` → `verify-otp`). Platform-level `TWILIO_*` env vars are optional fallbacks/status probes (see `ALL-SECRETS.md`).

## How to Set Up Twilio for WhatsApp (recommended path)

1. Create a [Twilio account](https://www.twilio.com) (free trial includes WhatsApp sandbox).
2. Console → **Messaging → Try it out → Send a WhatsApp message** → join the sandbox by sending the shown code from your WhatsApp to the sandbox number.
3. Collect credentials: **Account SID** (`ACxxxxxxxx…`), **Auth Token**, **WhatsApp sender number** (`+14155238886` format — sandbox or a registered WhatsApp sender).
4. In AcquisitionOS: Settings → Integrations → WhatsApp → choose **Twilio** → paste SID/token/number → `POST /api/whatsapp/twilio/connect`.
5. Verify the destination number: app sends an OTP over WhatsApp (`send-otp`) → enter it (`verify-otp`) → `WhatsappConfig` becomes verified/enabled.
6. Enable WhatsApp in Settings → Notifications for the events you want.

For **Meta Cloud API**: create a Meta app with the WhatsApp product, get the permanent token + phone-number ID, connect via `/api/whatsapp/meta/connect`, register the webhook URL `https://your-domain/api/whatsapp/meta/webhook` with the verify token in your Meta app config.

## Required Twilio Credentials (summary)

| Credential | Where to get | Stored where |
|---|---|---|
| `TWILIO_ACCOUNT_SID` (`AC…`) | Twilio Console → Account Info | `WhatsappConfig.twilioAccountSid` (DB, encrypted) or `TWILIO_ACCOUNT_SID` env |
| `TWILIO_AUTH_TOKEN` | Twilio Console → same page | `WhatsappConfig` (encrypted) or `TWILIO_AUTH_TOKEN` env |
| WhatsApp sender number | Twilio WhatsApp sender / sandbox | `WhatsappConfig` / `TWILIO_WHATSAPP_NUMBER` env |
| (Optional) `WHATSAPP_API_TOKEN` | Meta app token | env (`WHATSAPP_API_TOKEN`) for status display |

**Current status: code-complete, credentials NOT configured** in this deployment — the channel stays disabled until a user connects it (per-user credentials) and/or `TWILIO_*` envs are set.

## How to Connect WhatsApp in App Settings (user flow)

1. Sign in → **Settings → Integrations**.
2. WhatsApp card → pick provider (Twilio or Meta) → paste credentials → Save (`connect` route).
3. Enter your WhatsApp number → click **Send code** → receive OTP in WhatsApp → enter it → **Verify**.
4. Toggle the WhatsApp channel ON for desired event types under **Notifications**.
5. Send a test notification (or wait for a real event) and check delivery state in the messaging/delivery logs (`MessageDelivery`).

## Testing WhatsApp Notifications

```bash
# after connecting, simplest end-to-end test:
curl -X POST https://your-domain/api/whatsapp/twilio/send \
  -H "Content-Type: application/json" \
  -d '{"to":"+9xxxxxxxxxx","body":"AcquisitionOS test notification"}'
# then trigger a real event: reply to a tracked outreach email from another mailbox,
# or run a meeting-reminder cron and watch the WhatsApp message + MessageDelivery row.
```

Check delivery telemetry: `MessageDelivery.status` progression and (on failure) `DeliveryDeadLetter.reason` — typical failure causes are wrong number format (must be E.164 `+country…`), unverified sandbox recipient, or template not approved (Meta).

## Limitations of the WhatsApp Integration (be aware)

1. **Notifications only** — no two-way app control (the big one; see top of this doc).
2. **24-hour messaging window**: free-form replies only within 24h of the user's last inbound message; outside it, providers require pre-approved **templates** (Meta especially) — that's what `MessageTemplateApproval` manages.
3. **Per-number verification**: each recipient must pass OTP verification (anti-spam + provider policy).
4. **Sandbox constraints (Twilio trial)**: only joined/sandbox-verified numbers receive messages.
5. **Cost**: Twilio/Meta charge per conversation/message — heavy alert volume has real cost; tune event selection in preferences.
6. **Delivery depends on external uptime**: provider outages land in the DLQ and retry — notifications are best-effort, not transactional guarantees.
7. **Not for outreach spam**: WhatsApp outreach to leads violates provider policy — the outreach module uses EMAIL; WhatsApp is for the account owner's own alerts.
