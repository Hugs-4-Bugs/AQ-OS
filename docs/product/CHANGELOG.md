# Changelog — AcquisitionOS

> Owner: Engineering. Status: Living document. Format: `[version] — YYYY-MM-DD — summary`, then Added / Changed / Fixed / Removed / Security sections. Versions are taken from `package.json` (currently `0.2.0`) and the worklog milestones.

> Note: this changelog was started at v0.2.0 (Sept 2026). Pre-0.2.0 history is reconstructed from `worklog.md` and is approximate. From v0.3.0 onward every release gets a real entry.

---

## [Unreleased] — 2026-09-09 (in progress)

### Added
- **Magic Link public-URL hardening** — `request` route now rejects localhost / private / cloud-internal `APP_URL` values and falls back to header-derived public origin; `verify` route prefers `process.env.APP_URL` as the post-login redirect origin. Magic-link emails now always contain the public preview URL.
- **Google Sign-In backfill + reactivate** — for already-registered email/password users, the Google callback now reactivates `isActive=false` accounts and backfills missing `plan` / `role` / `isTrial` / `trialEndsAt` / `emailVerified` / `authProvider` fields, and ensures a `Subscription` row exists. Registered users can now sign in with Google instead of seeing "Google sign-in failed."
- **Real-time Google Calendar config in Meeting Preferences** — `googleCalendarConnected` is now derived from the actual `GoogleCalendarToken` DB record on every settings fetch; the dialog has Connect / Disconnect / Test-Availability buttons + a live connection indicator + the connected calendar email.
- **Outreach email actual delivery + user copy** — `POST /api/leads/[id]/communications` (the route the Outreach tab uses) now actually sends the email via SMTP to the lead's company email, BCCs the user, sends a separate labeled confirmation email, updates `lead.lastContactedAt` + `emailStatus`, and logs a `LeadActivity`. Previously it only inserted a DB row.
- **EmailPayload `cc` / `bcc` / `replyTo` support** — propagated through both Resend and Nodemailer SMTP providers.
- **Health-check-based keepalive** — `keepalive-v2.sh` rewritten to do nothing when the server is healthy (HTTP 200 + Google OAuth config OK + `.env` has `GOOGLE_CLIENT_ID`); only restores `.env` + restarts when unhealthy. Eliminates the disruptive every-5-minute restart.

### Changed
- **API Key Creation modal** — now `max-h-[calc(100vh-2rem)] overflow-y-auto` (no more top-nav / bottom overlap) and `onPointerDownOutside` / `onInteractOutside` preventDefault (outside-click no longer closes the modal; only Cancel or X).
- **Outreach tab success toast** — "Message sent and logged" → "Email sent to lead — a copy has been sent to your inbox"; error toast now surfaces the actual backend error.
- **QuickActionsFAB + FloatingFeedbackButton** — both now `return null` when `activeTab === 'assistant'`, so the floating "+" and green feedback buttons no longer overlap the Assistant message input / Send button.

### Fixed
- Magic-link email URL pointing at `localhost:3000` (now the public preview URL).
- Google sign-in failing for already-registered emails.
- Outreach "Send & Log" not actually sending any email.
- API Key creation modal closing on outside-click + overlapping the viewport.
- Assistant page floating buttons covering the Send button.
- Dev server restarting every ~5 minutes (the keepalive cron blindly killed the server even when healthy).

### Security
- No new security issues in this release. (See `/docs/security/`.)

---

## [0.2.0] — 2026-09-08

### Added
- **Real Stripe checkout** — removed all `handleDevModePayment` mock paths from `upgrade-modal.tsx`, `pricing-page.tsx`, `auth-gate.tsx`; Stripe `success_url` / `cancel_url` now use `getAppUrl()` (no hardcoded localhost); pre-flight `STRIPE_SECRET_KEY` check on the create-session route; production guard on `/api/payments/confirm` (403 in prod — activation is via webhook only).
- **Payment-in-progress modal lock** — checkout + upgrade modals now block outside-click / Esc / X while a payment is in flight, with a "Complete or cancel your payment before closing." banner.
- **2FA settings** — `setup` / `verify` / `disable` / `status` endpoints + full 2FA card in settings-shell (status badge, pending-setup panel, backup-codes panel, collapsible disable form).
- **Avatar click-to-upload** with camera overlay + spinner + navbar refresh + toast.
- **API key plan limits** — `PLAN_LEAD_LIMITS_PER_MONTH` (Free 50 / Pro 500 / Elite 2000) enforced in `POST /api/leads` when authenticated via API key (HTTP 429 with `X-RateLimit-*` headers when exceeded); `PLAN_RATE_LIMITS_PER_HOUR` + `PLAN_ALLOWED_SCOPES` scope gating at key creation.
- **Public API docs page** (`/api-docs`) — 6 sections (Authentication, Endpoints, Rate Limits, Code Examples, Error Codes, Webhooks), sticky TOC, mobile-responsive.
- **Real-time notifications** — fixed `unread=true` → `unreadOnly=true` polling bug; `markAsRead` / `markAllAsRead` now persist to DB; type-aware toasts for new polling-detected notifications; 30s interval.
- **Revoke-all-sessions** now reads the `refresh_token` from the HTTP-only cookie as the primary source of truth (body field kept as fallback).
- **NotificationErrorBoundary** — prevents notification crashes from taking down the whole app.

### Changed
- **Settings gear** now navigates to the full-page SettingsShell (was a mini-panel).
- **Footer** text → "A Product of QuantumFusion Solutions".
- **Default theme** → light (was dark).
- **Lead detail panel** Sheet now `modal={false}` so the navbar stays interactive.
- **Pipeline tab** columns now scroll internally (`max-height: calc(100vh - 200px)`).
- **Recent Activity** card overflow guarded.

### Fixed
- `redirect_uri_mismatch` popup removed (replaced with a simple toast).
- `M_ID` crash on leads tab (null guard on `lead.businessName.charAt(0)`).
- Auto page reload on 401 (removed the `setTimeout(reload, 1500)` in the API error handler).
- Three floating buttons vertically stacked with explicit bottom positions (no overlap).
- Notification bell crash (added `NOTIFICATION_ICONS[type] || Bell` fallback).

### Removed
- All mock / dev-mode payment paths.
- Dead `SettingsPanel` import + `FloatingFeedbackButton` dead import + `settingsOpen` state from dashboard-layout.
- `const oreNavOpen` syntax error → `const [moreNavOpen]`.

### Security
- Production guard on direct payment confirmation.
- Cookie-aware revoke-all-sessions (no longer trusts a body field the frontend can't read).

---

## [0.1.x] — 2026-05 to 2026-08 (reconstructed from worklog)

### Added (highlights)
- Google OAuth sign-in with dynamic redirect_uri resolution.
- Magic link + OTP login.
- Lead discovery pipeline (Google CSE → scrape → score).
- AI lead scoring with reasoning.
- AI outreach generation (email / WhatsApp / LinkedIn / Instagram).
- Email sequences + reply intelligence + meeting orchestration.
- Stripe + Razorpay + credits + invoices + GST.
- Workflow builder + 30 templates + dead-letter queue.
- Competitor intelligence + custom reports + dashboards.
- Admin endpoints + feedback/crash system + observability.
- 12 cron endpoints.
- API keys with scopes + rate limits + analytics + rotate/revoke.
- Compliance: GDPR / DPDP / cookie consent / data export / account deletion.

### Known issues carried forward (being addressed in Unreleased)
- Magic link email URL pointing at localhost on some deployments.
- Google sign-in failing for already-registered emails.
- Outreach "Send & Log" not delivering email.
- API Key modal responsiveness + outside-click close.
- Assistant floating-button overlap.
- Server restarting every ~5 minutes.

---

## Versioning Policy

- **0.x.x** — pre-1.0; breaking changes allowed within a minor bump, documented here.
- **1.0.0** — first stable release; from here, breaking changes require a major bump and a 6-month deprecation window for the public API.
- **Patch** (0.x.Y) — bug fixes only.
- **Minor** (0.Y.0) — new features, no breaking changes to existing user-facing flows.
- **Major** (Y.0.0) — breaking changes; will be announced via email + in-app banner + this changelog at least 30 days in advance.

## Release Cadence

- **Patch releases** — as needed (hotfixes).
- **Minor releases** — every 2–4 weeks.
- **Major releases** — every 6–12 months.

---

*See also: [FEATURE-ROADMAP.md](FEATURE-ROADMAP.md), [PRODUCT-VISION.md](PRODUCT-VISION.md).*
