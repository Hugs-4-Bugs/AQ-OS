### Q9-3: How did you implement Google OAuth integration on the backend
**DIFFICULTY:** Hard
**CATEGORY TAG:** Third-Party Integration / Security

**ANSWER:**
OAuth2 authorization-code flow with PKCE, implemented via Spring Security's `oauth2-client` with our own persistence layer for multi-account support. Flow: frontend hits `/api/auth/google/start` → server builds the authorization request (client_id, redirect_uri = exact registered URL, scope = `openid email profile` + calendar scopes ONLY when the user opts into scheduling, `state` = CSRF-bound nonce stored server-side (Redis, 10-min TTL, single-use), `code_challenge` for PKCE) → Google consent → callback `/api/auth/google/callback` receives `code` + `state` → server validates state (lookup + delete — replay-proof), exchanges code at Google's token endpoint (client_id + client_secret + code_verifier) → receives `access_token` + `id_token` + `refresh_token`. The `id_token` is a JWT — we verify signature against Google's JWKS (`iss`, `aud`, `exp`, `nonce`), extract `sub` (immutable Google user id — the account key, NOT email: emails can change/re-assign), and link-or-create the local user.

The decisions interviewers probe: **refresh token storage** — encrypted (AES-256-GCM envelope encryption, KMS-held key) in `oauth_connection`, because a refresh token is a PERMANENT credential to the user's Google identity; **scope discipline** — sign-in scopes vs calendar scopes are separate consent moments (incremental auth) so "sign in with Google" doesn't scare users with calendar warnings; **account linking rules** — Google `sub` already linked to another local user → deny with a clear message (never silently merge identities — account-takeover vector); **token lifecycle** — access tokens (~1h) used for Calendar/Gmail API calls are refreshed on-demand by a provider wrapper (single-flight refresh per user — concurrent 401s trigger ONE refresh, others await; Google's token-revocation-on-parallel-refresh behavior makes unguarded refresh a bug factory); **disconnection** — revoke at Google (token revoke endpoint) AND delete local rows, because leaving orphaned grants is both a security smell and a support mystery.

Failure handling: state mismatch/expired → 400 with generic message (no oracle about what failed); token exchange failure → 502 with correlation id; JWKS fetch failure → cached keys + retry (key rotation tolerance — Google rotates, our cache honors `kid`); and the whole flow is rate-limited (per-IP on start, per-account on callback) because auth endpoints are attack surface even when delegated to Google.

**KEY TERMS TO MENTION:**
- Authorization code + PKCE + server-side single-use state (CSRF/replay)
- `id_token` JWKS verification; `sub` as identity key (not email)
- Envelope-encrypted refresh tokens; incremental scopes
- Single-flight token refresh wrapper (parallel-refresh hazard)
- Account-linking rules (no silent merges) + full disconnect revocation

**FOLLOW-UP QUESTIONS:**
1. Why server-side flow instead of implicit/token flow from the browser?
2. Google returns email X but the local account with that email has a password — what happens?

**FOLLOW-UP ANSWERS:**
1. Implicit is dead (deprecated in OAuth 2.1): tokens in URL fragments leak via history/referrers, no refresh tokens, no client authentication. Code + PKCE gets us short-lived codes, PKCE binding (interception-proof), refresh tokens server-side, and one place to enforce state/nonce. Every serious integration moved; I can cite the 2.1 spec shifts if asked.
2. The linking decision: if the local account is VERIFIED (email verified via our OTP/magic flow), we auto-link (Google verified the same email) and audit-log it; if unverified, we require the password (prove prior ownership) before linking — because an attacker who hijacks a Google account must not inherit a local account by email collision alone. The rule is written in the auth ADR with the attack tree it closes.

**RED FLAGS TO AVOID:**
- Storing refresh tokens in plaintext or localStorage
- Using email as the immutable identity key
- No state/PKCE (the "we skipped it for demo" answer — instant red flag at senior level)

---

### Q9-4: How did you integrate Gmail SMTP for sending
**DIFFICULTY:** Medium
**CATEGORY TAG:** Third-Party Integration

**ANSWER:**
Two distinct Gmail integrations, often confused: **transactional/platform email** (order confirmations, invoices — from OUR sender) uses classic SMTP with an app password/OAuth service account via `JavaMailSender` — boring, reliable, and it should be boring. **User-identity outreach email** (the product core — sends from the USER's own Gmail so deliverability rides their domain reputation) uses Gmail API with OAuth (Q9-3's stored refresh tokens) rather than SMTP — API gives us message threading (thread_id for conversations), labels, and bounce metadata SMTP lacks. The sending wrapper (`GmailSendAdapter implements EmailPort`): builds `MimeMessage`-equivalent (`base64Url` raw RFC2822), sets our idempotency header (`X-Acq-Message-Key` — the dedupe key from Q2-15), sends, and persists the returned provider message id back to the message row — that id is the reconciliation key for bounces (Gmail PubSub push on bounce events → match → mark BOUNCED → suppression list).

Rate and quota management is the operational heart: per-user Gmail quotas (send limits ~500/day consumer, 2000/day workspace) enforced by our Redis token bucket PER MAILBOX (delay-not-fail semantics — campaign sends queue to next window rather than erroring), plus burst pacing (10/min/mailbox — human-shaped sending patterns protect deliverability; machine-gun sends from a fresh mailbox are the classic spam signal we engineer away). Failure taxonomy in the adapter: 429 → retry with backoff + bucket tightening (provider is telling us our pacing is wrong — listen); 401/403 (token revoked, app suspended) → mark connection NEEDS_REAUTH, user notification via in-app banner (never retry-loop an auth failure); 5xx → circuit breaker territory (Q3-12); and the timeout false-negative handled by the idempotency key + reconciliation sweep (the Q2-15 war story). Deliverability hygiene built-in: SPF/DKIM/DMARC ride the user's own domain (their Gmail handles it — a core product argument), unsubscribe headers on sequences, and per-recipient suppression checked BEFORE compose (bounce lists, unsubscribes, manual blocks — one SQL check, non-negotiable).

**KEY TERMS TO MENTION:**
- Two integrations: platform SMTP (JavaMailSender) vs user-identity Gmail API
- Idempotency header + provider message id reconciliation
- Per-mailbox token bucket (delay-not-fail) + human-paced bursts
- Failure taxonomy: 429 backoff vs 401 reauth-flow vs 5xx breaker
- Pre-compose suppression check (bounces/unsubscribes/blocks)

**FOLLOW-UP QUESTIONS:**
1. Why Gmail API over raw SMTP for user sending?
2. A user's mailbox hits its daily cap mid-campaign — what's the UX?

**FOLLOW-UP ANSWERS:**
1. Threading and reply-intelligence need thread_id and label context (our reply classifier reads thread state); SMTP gives us a fire-and-forget pipe with no conversation graph. Also OAuth-scoped API access is narrower (gmail.send only) than full SMTP credentials — least privilege for the same job. SMTP remains the fallback transport for providers without APIs (some IMAP-only setups) via the same EmailPort.
2. The campaign engine's bucket delays remaining sends to the next window automatically — the UI shows "sending: 340/1200, resuming at 04:00 UTC (mailbox daily limit)" rather than an error wall; users get a deliverability notice suggesting warm-up pacing. The alternative (blast until provider errors) burns the user's sender reputation — protecting it IS the product's job.

**RED FLAGS TO AVOID:**
- Confusing the two Gmail integrations (platform vs user identity)
- Retry loops on 401/403 (auth failures aren't transient)
- No suppression check before compose (bounce spiral)

---

### Q9-5: How did you integrate Google Calendar API
**DIFFICULTY:** Medium
**CATEGORY TAG:** Third-Party Integration

**ANSWER:**
The scheduler's Calendar layer (full product flow in Q2-12) — the integration engineering: **connection bootstrap** — OAuth with calendar scopes (incremental consent), store encrypted refresh token, immediately verify with a `calendarList.list` probe (fail fast on scope gaps); **free/busy reads** — the `freebusy` batch query (up to N calendars per call) for 14-day windows, response cached in Redis (30s TTL — booking pages re-render frequently; staleness of 30s is invisible but protects quota); **event writes** — `events.insert` with conferenceData (Meet links), attendees, and our metadata in extendedProperties (our slot id rides the event — the reconciliation anchor), on failure-after-DB-commit the compensation job (Q2-12) retries using that anchor; **push sync** — watch channels per connected calendar (expiration-based — channels expire in ~7 days, a `@Scheduled` job renews them BEFORE expiry; a lapsed channel silently degrades to stale busy-data, which is the failure mode that books double-bookings — so channel-expiry monitoring is an alarm, not a log line); **incremental sync** — `events.list` with `syncToken` on push notification (full resync on 410 GONE — token expired — with a window cap).

Quota engineering: Calendar API budget is per-project and shared across all users — the integration tracks per-user AND project-level quota via response headers, and degrades gracefully (booking-page availability checks fall back to a longer cache TTL under quota pressure — a booking page that's 2-min stale beats one that 500s). Timezone correctness is where integrations die: all reads/writes carry explicit timeZone params, the user's working-hours config stores tz with IANA ids, DST transitions handled by computing slots in the USER'S tz then converting at the boundary — the test suite has DST-transition fixtures (spring-forward gap hours) because "meeting moved an hour after DST" is the bug every scheduler ships once. Reliability grading: Calendar outages degrade scheduling to "propose slots from last-known busy map + user confirmation" (explicitly flagged in UI) — the show goes on with human verification, never silently books against stale data.

**KEY TERMS TO MENTION:**
- freebusy batch + Redis-cached reads; events.insert with extendedProperties anchor
- Watch channels with expiry + renewal job + lapse alarm
- syncToken incremental sync + 410 full-resync path
- Quota headers + graceful TTL degradation under pressure
- DST-transition test fixtures (the scheduler's classic bug)

**FOLLOW-UP QUESTIONS:**
1. A watch channel dies silently — what actually breaks and when do you know?
2. Why cache free/busy — isn't correctness critical for bookings?

**FOLLOW-UP ANSWERS:**
1. Busy maps go stale: bookings get proposed against outdated calendars → conflicts discovered at the Google-insert step (our compensation flow catches them — user gets an apology + re-propose). Detection: channel-expiry sweeper alarms 48h before lapse AND a "last push received" freshness metric per connection (>25h silence on an active calendar = investigate). The compensation layer is what makes the failure soft; the monitoring is what makes it rare.
2. Correctness at BOOKING time is DB-enforced (slot claim + conflict check at insert + compensation), not cache-enforced — the cache serves proposal RENDERING (which slots to show), the commit path re-validates against Google directly. Stale-render shows a slot that then fails atomically; uncached-render hammers quota at 300µs-per-read × every booking-page view. Layer the consistency where it's enforcement vs presentation.

**RED FLAGS TO AVOID:**
- Polling Calendar instead of watch channels (quota death)
- No channel-expiry awareness (the silent staleness killer)
- Timezone hand-waving (DST fixtures or it isn't real)

---

### Q9-6: How did you implement Telegram bot notifications
**DIFFICULTY:** Easy
**CATEGORY TAG:** Third-Party Integration

**ANSWER:**
The lightest integration in the system, which is exactly why it's a good interview answer — showing engineering proportion. Users connect via a bot deep-link (`t.me/OurBot?start=<linkToken>`); the linkToken (single-use, 10-min TTL, bound to the pending user) ties the Telegram chat_id to the local account on the bot's `/start` — stored in `notification_channel` (channel=TELEGRAM, handle=chat_id, verified=true). Sending is one HTTP call to the Bot API (`sendMessage` with parse_mode=HTML, disable_web_page_preview) wrapped in the standard `ChannelSender` SPI (Q3-20's router) — retries on 429 (Telegram's per-chat flood limits: ~1 msg/sec/chat, 30/min broadcast-ish) with backoff, permanent fail on 403 (user blocked the bot → mark channel UNVERIFIED + stop sending — respect the block, never retry it).

Where the engineering actually lives: **notification shaping** — Telegram gets SHORT messages (2-3 lines + one action link), composed per-channel from the same domain event (the `NotificationComposer` renders per-channel templates: Telegram = terse, Email = full, Push = one line) — channel-appropriate rendering, not copy-paste; **bot command surface** — `/stop` (opt-out instantly, honors Telegram's TOS — messaging platforms REQUIRE clean opt-out or they ban your bot), `/status` (read-only account summary via a scoped internal API — the bot backend uses a service account with minimal scopes, not user tokens); **webhook vs polling** — webhook (setWebhook to our HTTPS endpoint with the secret_token header filter — Telegram sends the secret we validate, killing spoofed updates) over long-polling (no idle connections on our API pods); **rate and abuse** — per-chat send bucket + a global bot budget, and link tokens are single-use to prevent account-link hijacking via guessed tokens. The whole integration is ~600 lines, one adapter class, one table — and it respects one principle: lightweight channel, proportionate engineering, but the same security and failure discipline as the big ones (verified linking, opt-out, rate limits, idempotent sends).

**KEY TERMS TO MENTION:**
- Deep-link token binding (single-use, TTL) for account linking
- ChannelSender SPI + per-channel template rendering (terse-not-copied)
- Webhook with secret-token validation (not polling); 403 = permanent opt-out
- Per-chat flood limits + global bot budget (429 backoff)
- /stop instant opt-out (platform TOS survival)

**FOLLOW-UP QUESTIONS:**
1. Why not reuse the notification table for chat state?
2. Bot API is down — what degrades?

**FOLLOW-UP ANSWERS:**
1. It IS the same table (`notification_channel`) — that's the design: channels are a type, handlers register by type, adding WhatsApp later touched zero shared schema. The point of the answer is the SHAPE (SPI + typed channels) rather than the specific channel; Telegram was chosen as the demo because its simplicity shows the pattern without clouding it.
2. Telegram joins the circuit-breaker registry: opens → sends queue in the job table (at-least-once, TTL-capped — a 6-hour-old "meeting reminder" is worse than none, so notifications have freshness windows per type) and the dashboard marks the channel degraded. Critical-tier notifications (security alerts) have an email fallback chain — the channel router tries TELEGRAM → falls to EMAIL on breaker-open, per the notification's criticality class.

**RED FLAGS TO AVOID:**
- Treating a light integration as no engineering (linking security, opt-out still apply)
- Retrying blocked-user 403s (burns quota, annoys users)
- Copy-pasting email copy into Telegram (channel-inappropriate rendering)

---

### Q9-7: How did you handle WhatsApp integration via Twilio
**DIFFICULTY:** Medium
**CATEGORY TAG:** Third-Party Integration

**ANSWER:**
WhatsApp is the highest-friction channel (platform rules, template approvals, per-message costs) — the integration design reflects that. Architecture: Twilio WhatsApp Business API via their REST (`/Messages.json`), through the same `ChannelSender` SPI; outbound requires **pre-approved templates** (Meta's policy — no free-form business-initiated messages outside a 24h customer-service window): template names + variable maps are config (`whatsapp_templates` table — name, language, body-variables, approval status), the composer renders variable payloads, and a template NOT in approved state refuses to send (a config check, not a hope — sending unapproved = Twilio error + platform reputation damage). Inbound replies arrive via Twilio webhook (`/api/webhooks/twilio/whatsapp`) with **signature validation** (X-Twilio-Signature HMAC over the URL + params with our auth token — Twilio's exact algorithm, implemented and unit-tested; an unsigned/spoofed webhook must die at the filter, this is the injection surface), then the same pipeline as email replies: dedupe by MessageSid (UNIQUE), classify (reply intelligence), attach to lead thread.

Cost and rate discipline: per-message cost is metered into the org's credit system (WhatsApp costs 4 credits vs email 1 — the credit table IS the productization of channel costs), send rate respects Twilio's per-number throughput (queue + pacing in the job layer), and the number-quality dashboard (engagement + block rates) is operational surface — WhatsApp numbers degrade (quality rating drops → messaging limits drop), so block-rate spikes alarm (users marking messages as spam is the channel's health signal). Failure handling follows the Q9-4 taxonomy (429 backoff, 6xxxx codes → permanent vs transient classification, template-rejection → config alert) plus the idempotency key header (Twilio doesn't dedupe — OUR message-key dedupes via the unique constraint + pre-send Bloom check). The 24-hour session window logic: inbound user message opens a 24h free-form window (stored on the conversation row with expiry) — replies within it are free-form; after it, template-only — the composer checks the window state per send, because that platform rule, encoded in code, is the difference between a compliant integration and a suspended number.

**KEY TERMS TO MENTION:**
- Twilio REST via ChannelSender SPI; pre-approved templates as config with send-time enforcement
- X-Twilio-Signature HMAC validation (spoof-proof webhooks) + MessageSid dedupe
- Channel costs metered via credits (WhatsApp 4× email)
- 24h customer-service window encoded in the composer
- Number quality metrics (block rates) as alarms

**FOLLOW-UP QUESTIONS:**
1. Why Twilio over Meta's Cloud API directly?
2. A campaign's block rate jumps 5× — walk me through your response.

**FOLLOW-UP ANSWERS:**
1. Twilio bought us: one API for SMS+WhatsApp fallback, sane webhook infra, compliance tooling, and time-to-market — the trade is per-message margin. The Meta Cloud API is the direct path (lower cost, first-party) and our `ChannelSender` SPI makes that swap an adapter change, not a product change — the abstraction exists precisely so vendor economics can be revisited without re-architecture. I can name the migration checklist (number porting, template re-approval, webhook cutover) if asked.
2. Treat as an incident: pause the campaign (auto-triggered at threshold — the pause is automated, the INVESTIGATION is human), segment the blocks (which template, which audience slice, which day), usual culprits: template drift (content no longer matching approved tone), audience quality (purchased-ish lists), frequency (3 messages in 2 days). Remediation: kill the offending template, tighten the audience filter, re-space the sequence; number quality recovers over sends. The metric exists so this is caught in hours, not when Twilio downgrades the number.

**RED FLAGS TO AVOID:**
- Free-form business-initiated messages (policy violation = number suspension)
- Unsigned webhook acceptance (spoofable injection surface)
- No block-rate monitoring (channel death is silent until limits hit)

---

### Q9-8: How did you implement webhook handling generally (the pattern, not one provider)
**DIFFICULTY:** Hard
**CATEGORY TAG:** Third-Party Integration

**ANSWER:**
Every provider webhook (Stripe, Twilio, Gmail PubSub, Google Calendar, WhatsApp) flows through ONE pipeline with provider-specific entry validators — because the failure modes are universal and the pipeline should be written once. The stages: **(1) Transport gate** — dedicated routes OUTSIDE session auth (`permitAll` + their own defense: signature/HMAC validation per provider's exact algorithm — Stripe's `Stripe-Signature` with tolerance window, Twilio HMAC, Google's OIDC JWT on PubSub pushes — all unit-tested against forged vectors); **(2) Raw capture** — the RAW body is read (signature checks need raw bytes, not re-serialized JSON — a classic bug when frameworks parse first), and the event is persisted IMMEDIATELY as `webhook_event` (provider, event id, type, payload, received_at, status=RECEIVED) returning 2xx fast — **persist-then-ack**: providers retry on non-2xx, so durability must precede the ack; slow downstream processing MUST NOT delay the ack (provider timeout → retry storm); **(3) Dedupe** — provider event id UNIQUE constraint; replays (Stripe's at-least-once, manual replays) hit the constraint and no-op — idempotency is structural, not behavioral; **(4) Async dispatch** — job-table worker processes by type via a handler registry (`Map<eventType, Handler>` — adding a provider = validator + handler + config, the pipeline untouched); handlers are idempotent + transactional; failures mark the row FAILED with attempt counts → retry with backoff → dead-letter state for manual replay (the admin UI has a replay button — webhook debugging is a UI, not SQL archaeology); **(5) Observability** — per-provider success/latency metrics, freshness alarms (Stripe webhooks silent > 30 min = connectivity break — the earliest signal, before customers notice missing invoices).

The interview-worthy war story embedded in the design: early on, a Stripe handler threw AFTER the ack during a deploy (new code, old handler gone) — events sat RECEIVED forever because "acked = done" was assumed. The pipeline fix was the freshness alarm + a reconciliation sweep (hourly: RECEIVED rows older than 10 min → re-dispatch), which converts any future handling gap from silent data loss to a self-healing blip. That's the pattern's real value: universal durability + universal replay, so provider quirks (replays, outages, our deploys) are absorbed by ONE mechanism instead of N handler conventions.

**KEY TERMS TO MENTION:**
- Raw-body capture BEFORE parsing (signature integrity)
- Persist-then-ack (2xx after durability — retry-storm prevention)
- Event-id UNIQUE dedupe (structural idempotency)
- Handler registry + job-table async processing + dead-letter replay UI
- Freshness alarms + hourly reconciliation sweep (the war story)

**FOLLOW-UP QUESTIONS:**
1. Why not process webhooks synchronously — the extra table seems heavy?
2. A provider sends an event type you don't know — behavior?

**FOLLOW-UP ANSWERS:**
1. Synchronous processing couples our p99 to provider retry behavior: a 2s handler under a Stripe timeout (they allow ~10s but retry aggressively) turns any slow patch into duplicate-event storms; and handler crashes after ack = lost events (the war story). The table IS the feature: durability, replay, debug, and audit in one — ~50ms of write overhead per event, cheap for transactional integrity on money-adjacent flows.
2. Persist + mark UNHANDLED + metric + no error (2xx — unknown types are versioning noise, not failures; erroring on them teaches the provider to retry forever). A weekly review of UNHANDLED types feeds the handler backlog — new Stripe event types appear without announcements, and the pipeline is designed so their arrival is data, not downtime.

**RED FLAGS TO AVOID:**
- Signature check after JSON re-serialization (validation always fails/mismatches)
- 500 on handler exception after ack (retry storms + duplicates)
- Per-provider ad-hoc pipelines (N places to fix the same bug)

---

### Q9-9: How did you manage API keys for third parties (storage, rotation, access)
**DIFFICULTY:** Medium
**CATEGORY TAG:** Third-Party Integration / Security

**ANSWER:**
Three key classes with three storage strategies. **Our credentials to providers** (Stripe secret key, Twilio auth token, Google client secret): secrets manager (AWS Secrets Manager) → init sidecar → env vars → `@ConfigurationProperties` — never in git, never in images, never in logs (the masking converter covers accidental prints); access is role-scoped (the app's IAM role reads only its secret path). **Provider keys ON BEHALF of users** (Google refresh tokens, mailbox tokens): envelope-encrypted at rest (AES-256-GCM, data key wrapped by KMS master key — the DB stores ciphertext + wrapped key; compromise of the DB alone yields nothing usable), decryption scoped to the request path (decrypt-in-memory, never persisted decrypted, audit-logged per use), and revocable both directions (our disconnect revokes upstream; provider-side revocation detected via 401 → connection marked NEEDS_REAUTH). **Customer-facing API keys** (partners calling OUR API): show-once + SHA-256 hash storage + scopes + expiry (Q4-13's full design).

Rotation discipline per class: provider credentials rotate quarterly via the secrets-manager versioning (two-valid window, rolling restart — the procedure is rehearsed, not theoretical); user-level tokens refresh themselves (rotation-on-refresh from Google's side); customer keys are customer-initiated (our dashboard drives it) with 90-day expiry defaults. The audit surface: every key USE is logged with key-id + purpose (Q4-15's audit trail), and a quarterly "key census" job inventories all secrets in the system (env-scan + repo-scan (gitleaks) + dashboard of every key with age/last-use/owner) — the census is what catches the zombie key (created for a 2024 POC, never rotated, owner gone) before an auditor or attacker does. Least-privilege is enforced at issuance: a Stripe key has webhook-signing and checkout scopes, never account-wide; the temptation to reuse an all-powerful key across features is a review-blocked pattern.

**KEY TERMS TO MENTION:**
- Secrets manager → sidecar → env → typed config (no git/image/logs)
- Envelope encryption (KMS-wrapped data keys) for user-granted tokens
- Rotation per class with two-valid windows + quarterly census (zombie-key detection)
- Use-attribution audit + least-privilege scoping at issuance
- Bidirectional revocation (our disconnect + upstream-revocation detection)

**FOLLOW-UP QUESTIONS:**
1. A third-party key leaks to a public repo — your response runbook?
2. Why envelope encryption over field-level encryption with one app key?

**FOLLOW-UP ANSWERS:**
1. Minutes: revoke/rotate at the provider (invalidates the leak — FIRST action, always), then purge history + force-push, then audit the exposure window (provider-side logs for misuse by that key), then postmortem the pipeline (gitleaks pre-commit + CI scan should have caught it — the fix is the scan, not the vigilance). The order matters: rotation first because git history is forever; everything else is containment of an already-invalidated credential.
2. Envelope encryption solves the rotation + scale problem: with one app key, rotation re-encrypts EVERY row under a new key (a migration with a window of double-failure risk); with per-row data keys wrapped by a master, rotating the MASTER re-wraps only the small data keys (fast, incremental), and key-access policies can differ per key class. It's the standard pattern (AWS KMS docs-tier) because the failure and rotation modes actually work at scale.

**RED FLAGS TO AVOID:**
- Secrets in config files "temporarily" (the most common real leak)
- No census/inventory (you can't rotate what you can't list)
- One all-powerful provider key shared across features

---

### Q9-10: How did you implement retry logic for external API calls
**DIFFICULTY:** Medium
**CATEGORY TAG:** Third-Party Integration

**ANSWER:**
Retry is a POLICY per dependency, not a reflex — the design starts with the question "which failures are worth repeating, and what does a repeat cost?" Classification first: **transient** (429, 502/503/504, timeouts) → retryable; **permanent** (400 validation, 401/403 auth, 404) → never (retrying a 401 is noise; retrying a 400 repeats the same bug); **unknown** (connection-reset mid-response) → treat as retryable WITH idempotency (the false-negative case — Q2-15's duplicate-email war story is exactly this class). Mechanics: Resilience4j Retry on the provider adapters — max 3 attempts, exponential backoff with jitter (100ms → 400ms → 1.6s + random), retry-on predicates per provider (status-based + exception-based), and the retry budget is bounded by the CALLER's context: a user-facing request retries at most once (latency budget), a background job retries the full ladder (no user waiting). Idempotency keys ride every retryable side-effecting call (Stripe idempotency key, our message-key header for SMTP-like APIs) — so a retry that lands twice is absorbed by the PROVIDER, not just our DB: the key makes double-execution harmless at the source, which is the only fully correct place.

The compounding protections around retry: **circuit breaker** opens when the retry ladder is obviously futile (provider down — retrying into a breaker wastes nothing, Q3-12); **timeout discipline** — client timeouts set BELOW the user-facing budget with margin (a 30s timeout inside a 10s API budget is a self-DoS); **backpressure at the queue** — background retries consume from the job table with per-provider concurrency caps (a provider hiccup doesn't pull our whole worker pool into one provider's retry storm — bulkheads); and **jitter everywhere** because synchronized retries from 3 instances are a thundering herd (the retry-storm lecture). Verification: each adapter's retry policy has fault-injection tests (WireMock returning the failure ladder — asserting attempt counts, backoff timing, idempotency-key presence), and production metrics track retry rates per provider — a rising retry rate is the early-warning signal that the PROVIDER is degrading, often before their status page admits it.

**KEY TERMS TO MENTION:**
- Failure classification (transient/permanent/unknown) BEFORE retry policy
- Exponential backoff + jitter; caller-context-bounded attempts (interactive vs batch)
- Idempotency keys as the provider-side dedupe (the only full fix for false-negatives)
- Breaker + bulkheads around retries (storm prevention)
- Fault-injection tests + retry-rate metrics per provider

**FOLLOW-UP QUESTIONS:**
1. Why is the idempotency key "the only full fix" for timeout-unknowns?
2. Retries are hammering a struggling provider — when do retries become the outage?

**FOLLOW-UP ANSWERS:**
1. A timeout is epistemically ambiguous: the request MAY have executed. Without a key, your options are skip (possible under-execution — lost email) or retry (possible double-execution). The key converts the ambiguity into a non-problem: execute-at-most-once semantics on the provider side regardless of how many attempts you make. Any retry design without keys is implicitly betting that false-negatives won't happen — at scale, they happen weekly.
2. At the retry-amplification point: N instances × 3 attempts × backoff-sync ≈ 10-20× the original load on an already-struggling provider — retries CAUSE the extended outage. The defenses are the breaker (cuts load to zero when futility is detected), jitter (desynchronizes), and the provider-level concurrency cap (a ceiling on in-flight regardless of queue depth). The rule I state: your retry policy is part of the provider's load profile — design it like you're their largest customer, because you might be.

**RED FLAGS TO AVOID:**
- Retrying 4xx / infinite retries
- No idempotency keys on side-effecting calls
- Synchronized backoff (no jitter) across instances
