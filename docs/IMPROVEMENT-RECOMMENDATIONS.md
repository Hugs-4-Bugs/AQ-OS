# Improvement Recommendations — AcquisitionOS

> Owner: Product + Engineering + the founder. Status: Living document. Last reviewed: 2026-09-09.
> Scope: the honest, specific, ranked list of what's weak + what's missing across 10 categories. Read this before the roadmap; the roadmap pulls from here.

## How to Read This Document

This is the **honest** list. Every section names what is weak, why it's weak, and what would make it stronger — with concrete suggestions, not vagueness. Items are ranked within each section. The top 10 across all sections are summarised at the end (§11) with a priority order.

---

## Section 1 — Feature Improvements

### 1.1 Lead discovery quality — **weak**
**What's weak:** discovery returns businesses, but the *quality* of the website-score is basic (mobile-friendliness, SSL, meta, page speed). It doesn't catch the things that actually matter to a service-seller (no clear CTA, no lead-capture form, outdated copyright, broken internal links, thin content, no schema markup). The niche + location query is also coarse — "restaurant in Bengaluru" returns a mix of chains, single-location shops, food blogs, directories.

**What would make it stronger:**
- Expand the website-quality score to 12–15 dimensions; weight by the vertical (a dentist's site is judged differently than a SaaS company's).
- Add a "relevance filter" post-discovery: drop food blogs, directories, chains with >5 locations (the buyer can't service them). The filter is a classifier, not a keyword list.
- Let the user save a discovery query as a template + re-run it weekly (the "monitor a niche" use case).
- Show the *source* of each lead (which Google result, which page) so the user can sanity-check.
- Add a "discovery quality" feedback loop: the user marks leads as "good" / "bad"; the system learns.

**Priority:** P1 — discovery quality is the wedge; if it's weak, the whole loop is weak.

### 1.2 Outreach personalization — **partial**
**What's weak:** the AI references the website weakness, but the personalization is shallow — "I noticed your site isn't mobile-friendly" is the same sentence for every plumber. The outreach doesn't reference the *business* (their name, their recent activity, their reviews, their competition) — only the website.

**What would make it stronger:**
- Enrich the lead with more context before generating: their Google reviews (sentiment + recency), their recent social posts, their competitors' sites (the competitive-intelligence engine already exists).
- Let the user save "outreach angles" per vertical (the "angle" is the hook: "your reviews are dropping" / "your competitor X just did Y" / "you're not ranking for your own name").
- Generate 2–3 alternative opens + subject lines per lead; let the user pick.
- A/B-test the subject lines automatically (track open rate per subject pattern).

**Priority:** P1 — personalization depth is the moat against Lemlist.

### 1.3 AI accuracy — **partial**
**What's weak:** the scoring + outreach generation are single-shot (no self-critique). The reply classification is single-label (interested / not / meeting / unsubscribe) — doesn't handle multi-intent ("interested but next month"). The AI chat has no memory of the user's prior sessions (each session is isolated).

**What would make it stronger:**
- Add a self-critique step for scoring + outreach generation (the AI reads its own output + revises).
- Multi-label reply classification with confidence per label.
- AI chat memory: persist a summary per session; carry forward the user's preferences (their voice, their typical subject-line length).
- A prompt A/B framework (the `prompt-manager.ts` exists; add the experiment runner).

**Priority:** P2 — accuracy is good enough for v1; the depth pays off in retention.

### 1.4 Pipeline management — **adequate, with gaps**
**What's weak:** the Kanban works, but there's no "stale lead" warning (a lead sitting in `contacted` for 30 days with no reply is invisible). No automatic stage progression (a replied lead should move to `replied` automatically — the reply classification knows). No "next action" queue (what should I do *right now*?).

**What would make it stronger:**
- Stale-lead warnings (a lead in any stage > X days without activity gets a yellow badge).
- Auto-stage-progression on reply classification (interested → `interested`; meeting request → `meeting_scheduled`).
- A "Today's next actions" queue: leads to follow up, replies to act on, meetings to prep, sequences due.
- Bulk actions on the pipeline (mass-move, mass-assign, mass-archive).

**Priority:** P1 — the pipeline is where the user spends their day; small wins compound.

### 1.5 Meeting scheduling — **partial**
**What's weak:** no availability check on meeting creation (you can double-book). The `calendarId` is hardcoded to `primary` (no multi-calendar selection). The approval path for AI-proposed meetings doesn't create the Calendar event (only flips DB status). The orphaned `schedule-meeting-dialog.tsx` has wrong payload/keys (broken).

**What would make it stronger:**
- Wire `checkAvailability` into `createGoogleMeetMeeting` before the adapter call; reject with 409 if the slot is busy.
- Add `googleCalendarId` to `UserSettings` + a calendar-list picker (feed via Google Calendar List API).
- Make `/api/meetings/[id]/approve` create the Calendar event + Meet link for AI-proposed meetings.
- Delete or fix the orphaned `schedule-meeting-dialog.tsx`.

**Priority:** P0 (the double-booking risk is real) → P1 (the multi-calendar + approve-path).

### 1.6 Notification relevance — **adequate, noisy**
**What's weak:** the notification center fans out everything (every reply, every meeting reminder, every credit deduction) with no priority + no batching. The user gets 30 notifications a day; the important ones drown. The 30s polling (4 components in parallel) is overkill.

**What would make it stronger:**
- Priority levels in the notification model (urgent / normal / low); the bell badge counts only urgent.
- Batch low-priority notifications ("12 leads scored today" instead of 12 individual notifications).
- Smart delivery: urgent → in-app + email + push; normal → in-app; low → digest.
- Reduce the polling to one 30s poll (not 4); the components subscribe to the shared store.

**Priority:** P2 — noise is annoying but not blocking.

### 1.7 Reporting depth — **adequate, custom-report-builder is rough**
**What's weak:** the Overview tab is good for "what happened"; it's weak for "why" + "what to do next." The custom report builder is powerful but the UX is rough (the formula editor is intimidating; the schedule UX is buried). No cohort retention view. No outbound-funnel-by-step view.

**What would make it stronger:**
- A "Why did reply rate drop?" diagnostic: correlates reply rate with subject-line patterns, send-day, lead-score, niche.
- Cohort retention (sign-up month × months active).
- Outbound funnel by sequence step (sent → opened → replied → meeting → won, per step).
- The report-builder UX: a formula editor with autocomplete + live preview + a "schedule" wizard.

**Priority:** P2 — reporting depth drives the Elite tier; it's a retention + upgrade lever.

### 1.8 Search capabilities — **weak**
**What's weak:** there's a command palette (Cmd+K) but it searches nav + a few entities, not the full corpus (leads, communications, meetings, AI chat history). No semantic search across leads ("find leads similar to the ones I won"). The vector search exists for RAG but isn't wired to lead search.

**What would make it stronger:**
- A global search (Cmd+K) across leads + communications + meetings + AI chat.
- Semantic lead search ("find leads similar to this won deal") using the vector store.
- Saved searches + saved views.
- Search-by-example ("find more like these 3 leads").

**Priority:** P2 — the power user (Marcus) wants it; the casual user (Prabhat) doesn't.

---

## Section 2 — User Experience Improvements

### 2.1 Navigation — **adequate, the tab list is long**
**What's weak:** the dashboard has 30+ tabs in the sidebar; finding the right one is a hunt. The tab order isn't grouped (Overview, Leads, Discover, Pipeline, Deals, Outreach, Meetings, Calendar, Inbox, Insights, Competitors, Workflows, Reports, Settings, Assistant, ...). The mobile bottom nav is a different subset.

**What would make it stronger:**
- Group the tabs (Acquire: Discover, Leads, Pipeline, Deals; Engage: Outreach, Inbox, Meetings, Calendar; Understand: Insights, Competitors, Reports; Configure: Settings, Integrations, API).
- A "favorites" pin at the top (the user's most-used).
- The mobile nav should mirror the desktop favorites, not a different subset.

**Priority:** P2 — the long tab list is a daily annoyance.

### 2.2 Confusing flows — **several**
**What's weak:**
- The Outreach tab's "Send & Log" button — the user thinks "Log" means "store"; it actually sends + logs. (Fixed in the recent commit; the toast now says "Email sent to lead — a copy has been sent to your inbox".)
- The Autonomy Mode toggle — three modes (Approval / Assisted / Autonomous) but the difference isn't explained in-line; the user has to read the docs.
- The "Connect Gmail" vs "Connect Google Calendar" — two separate OAuth flows for the same Google account; the user expects one.
- The credits balance vs the monthly grant vs the rollover — three numbers; the user doesn't know which to watch.

**What would make it stronger:**
- Inline tooltips + a one-line explanation on every confusing toggle.
- A single "Connect Google" flow that asks for Gmail + Calendar scopes in one consent (Google allows multi-scope consent).
- A single "Credits available" number (monthly grant + rollover + packs), with a tooltip showing the breakdown.

**Priority:** P1 — confusion → support tickets → churn.

### 2.3 Missing feedback — **several**
**What's weak:**
- Discovery progress is a single progress bar; the user doesn't see "scoring lead 7 of 20" or "scraping acme-cafe.com".
- A long AI chat response streams but doesn't show "thinking..." before the first token.
- A failed payment webhook has no user-visible signal until the dunning email.

**What would make it stronger:**
- Granular progress on long operations (discovery: per-lead status; meeting booking: per-step status).
- A "thinking..." indicator before the first AI token (the streaming endpoint should send an initial heartbeat).
- A user-visible banner when a payment is past-due (before the dunning email).

**Priority:** P2.

### 2.4 Slow interactions — **the discovery is the slow path**
**What's weak:** a 20-lead discovery takes 30–60s (HTTP budget). The user waits. The frontend doesn't pre-fetch the next page of leads.

**What would make it stronger:**
- Background the discovery (ADR-011); the API returns a jobId immediately; the frontend polls status.
- Pre-fetch the next page of leads on the Leads tab (TanStack Query `getNextPageParam`).
- Optimistic UI for stage moves on the pipeline (the user drags; the UI updates before the server confirms).

**Priority:** P0 (background the discovery) → P2 (the rest).

### 2.5 Error messages that don't help — **several**
**What's weak:**
- "Failed to send email" (without the SMTP error) — the user can't fix it.
- "Invalid or expired magic link" — the user doesn't know if it's expired (request a new one) or invalid (already used).
- "Internal server error" — the user can't do anything.

**What would make it stronger:**
- Surface the actionable part of the error ("Gmail daily limit exceeded — wait until tomorrow or switch to Resend").
- Distinguish "expired" (request a new one) from "already used" (log in normally) for magic links.
- Replace generic "Internal server error" with "Something went wrong on our side. We've been notified. Try again in a few minutes, or contact support with this ID: <request-id>."

**Priority:** P1 — errors that don't help → support tickets → churn.

### 2.6 Missing empty states — **several**
**What's weak:** several tabs show a blank state ("No leads yet") without a CTA. The user lands on the Pipeline tab for the first time + sees nothing.

**What would make it stronger:**
- Every empty state has an illustration + a one-line explanation + a CTA ("Run your first discovery →").
- The Pipeline empty state: "Run a discovery, approve some leads, and they'll show up here."
- The Inbox empty state: "When leads reply, their messages land here."

**Priority:** P2 — polish, but it matters for the first-run experience.

### 2.7 Lack of onboarding — **weak**
**What's weak:** the onboarding checklist exists but is a list of tasks, not a guided tour. The user signs up + is dropped on the Overview tab with no idea what to do first.

**What would make it stronger:**
- A 5-step guided tour on first login (the video script exists; build the in-app tour).
- A "first discovery" wizard: pick a niche + location → run → review → send.
- A "first meeting" walkthrough: connect Calendar → book a test meeting with yourself.
- Progressive disclosure: hide the advanced tabs (Workflow Builder, Report Builder, API) until the user has done the basics.

**Priority:** P1 — first-run experience drives the Free → Pro conversion.

### 2.8 Missing tooltips + help text — **many**
**What's weak:** the AI score reasoning is shown, but the *meaning* of the score (what's "urgency 7"?) isn't. The credits cost of an action is shown after the action, not before.

**What would make it stronger:**
- A tooltip on every AI score explaining the scale + what "high" means.
- A pre-action cost preview ("This discovery will cost 50 credits. You have 200. Continue?").
- A `?` icon on every confusing field with a one-line explanation.

**Priority:** P2.

---

## Section 3 — Performance Improvements

### 3.1 What is slow + why

| Slow path | Cause | Fix |
|---|---|---|
| Discovery (20 leads, 30–60s) | Synchronous scrape + score in the HTTP request | Background job queue (ADR-011) |
| Dashboard initial load | 150+ components; some heavy (Pipeline, Report Builder) | Lazy-load + prefetch adjacent tabs |
| Analytics aggregations | Full-table scans on `Lead`, `Communication`, `Meeting` | Pre-materialise into `AnalyticsSnapshot` |
| Meeting booking (3–8s) | Google Calendar events.insert + conferenceData latency | Acceptable (user-initiated + a spinner); or background + notify |
| AI chat first token (1–4s) | Provider latency | Acceptable for streaming; send a "thinking" heartbeat |
| Stripe webhook (1–2s) | DB transaction (subscription + user + credits + invoice) | Acceptable (idempotent; Stripe retries) |
| 30s notification poll (×4 components) | 4 components each polling | One shared poll (Zustand store); subscribe in components |

### 3.2 What should be cached
| Data | Cache | TTL | Invalidation |
|---|---|---|---|
| Google CSE results (per query) | Redis | 1h | TTL |
| Google Calendar events (per user) | Redis | 5 min | TTL + watch-channel push |
| User entitlements | Redis | 5 min | On plan change |
| Analytics aggregations | `AnalyticsSnapshot` table | 1h–24h | Cron refresh + on-demand |
| AI prompts (the prompt text) | In-process | forever | On admin edit |
| The `/api/auth/me` response | In-process | per-request | (no cache; cheap) |

### 3.3 Likely-inefficient DB queries
- `db.lead.findMany` with `include: { activities, communications, notes, deals }` — N+1 risk if Prisma's eager loading isn't used. Audit the lead-detail-panel.
- Analytics aggregations that scan `Lead` / `Communication` / `Meeting` without a date filter — add a `WHERE createdAt > now() - interval '30 days'`.
- The notification poll queries `Notification` without an index on `(userId, read, createdAt)` — verify the index exists.
- The audit log search without an index on `(userId, action, createdAt)`.

### 3.4 What should be moved to background jobs
- Discovery (the 30s+ job) — P0.
- AI batch scoring (20 leads at once) — P0.
- Sequence step processing — P1.
- Gmail inbox sync — P1.
- Report generation + email delivery — P1.
- Invoice PDF generation + email — P2.
- The 12 cron jobs (each becomes a scheduled job, not an HTTP endpoint) — P2.

### 3.5 What assets should be optimized
- The 150+ dashboard components: tree-shake the unused; verify the per-tab chunk is < 100 KB.
- Images: the user-uploaded avatars — serve via the CDN with `next/image` (automatic WebP + responsive).
- The `/api-docs` page: it's static content; CDN-cache it.
- The legal pages (privacy, terms): static; CDN-cache.

### 3.6 Where CDN would help
- Static assets (`_next/static/*`, images) — Cloudflare / Vercel CDN.
- The `/api-docs` page + the legal pages — CDN with revalidation on deploy.
- API responses: NOT CDN-cached (auth + personalisation).

---

## Section 4 — Security Improvements

### 4.1 Authentication gaps
- **MFA bypass via Google OAuth** — the Google callback doesn't enforce MFA even when enabled. **Fix:** after Google login, if `mfaConfig.isEnabled`, prompt for TOTP before setting the session cookie. **P0.**
- **No per-account lockout on password signin** (only OTP). **Fix:** add per-account lockout (5 fails → 15-min lock). **P1.**
- **No breach-password check.** **Fix:** integrate HaveIBeenPwned password API (k-anonymity). **P1.**
- **No password-strength enforcement server-side.** **Fix:** enforce min 8 chars + not-in-breach server-side. **P2.**

### 4.2 Authorization bypass risks
- **No automated authz test suite.** The rules are in code (`userId` filter + RBAC) but not covered by tests; a refactor could break them silently. **Fix:** an integration test per gated route asserting 403 for wrong-user / wrong-org / wrong-role. **P1.**
- **The `findFirst OR` in the Google callback** can match the wrong row when one user has the email + another has the googleId. **Fix:** handle the ambiguity (prefer the email match; if the googleId matches a different user, log a security alert). **P2.**

### 4.3 Input validation gaps
- **No SSRF allowlist** on the website scraper + RAG URL ingest. **P0** (see [THREAT-MODEL.md](security/THREAT-MODEL.md) Scenario C).
- **`prisma.$queryRaw`** in a handful of analytics routes — audit for parameterisation. **P2.**
- **No server-side password-strength check.** **P2.**

### 4.4 Rate limiting weaknesses
- **In-process rate limiter** (not Redis). On multi-instance, a request to instance B isn't counted against instance A. **Fix:** Redis-backed limiter. **P1.**
- **No per-account rate limit** on auth (only per-IP). Credential stuffing from rotating IPs gets through. **Fix:** per-account limit on auth. **P1.**

### 4.5 Secret management risks
- **The `JWT_SECRET` is a single point of failure.** If it leaks, all tokens are forgeable. **Fix:** key rotation capability (currently no rotation without invalidating all sessions — acceptable but document). **P2.**
- **No `bun audit` in CI.** A dependency CVE could go unpatched. **Fix:** add `bun audit --severity=high` to CI. **P0.**
- **No SBOM.** **Fix:** generate SBOM on every release. **P1.**

### 4.6 Logging gaps
- **No audit-log entry on PII read** (only on write). **Fix:** log lead-read events (which user accessed which lead). **P1.**
- **No real-time alerting on suspicious patterns** (e.g. 100 logins from 1 IP in a minute). **Fix:** Prometheus alert rules for auth anomalies. **P1.**

### 4.7 Session management issues
- **Refresh-token rotation** — the rotated-out token is revoked server-side, but the window between rotation + revocation is the rotation request itself. Acceptable (atomic) but document.
- **`SameSite=strict`** blocks the cross-domain Google OAuth callback cookie set — mitigated by the relay-token pattern (ADR-005). Acceptable.

### 4.8 Third-party dependency risks
- **No `bun audit` / SBOM / Dependabot.** **P0.**
- **`postinstall` scripts** in dependencies could exfiltrate `.env`. **Fix:** review + allowlist. **P1.**
- **RAG content** is processed by the AI without sandboxing — prompt-injection risk. **Fix:** mark RAG content as "untrusted" in prompts. **P1.**

### 4.9 PII at rest
- `Communication.content` (outreach email bodies), `EmailMessage.body` (inbox emails), `Lead.email` / `phone` — **plaintext in SQLite**. **Fix:** AES-256-GCM with a per-tenant key. **P1.**

### 4.10 The honest summary
The security posture is **strong for the scale** (RBAC, per-user ownership, audit log, encrypted OAuth tokens, signed webhooks) but has **two P0 gaps** (SSRF allowlist, `bun audit`) + **several P1 gaps** (MFA-on-Google, per-account lockout, breach-password check, Redis rate limiter, PII encryption at rest, audit-on-read, real-time auth alerting). None is a known active exploit; all are "could become one."

---

## Section 5 — Scalability Improvements

(See [SCALABILITY-PLAN.md](technical/SCALABILITY-PLAN.md) for the full plan; this is the summary.)

### 5.1 What will break when the user count grows

| Will break at | What | Fix |
|---|---|---|
| ~50 concurrent writers | SQLite write lock | PostgreSQL migration (ADR-012) — **P0 before Stage B (1k users)** |
| ~10s HTTP timeout | Discovery (30s+) | Background job queue (ADR-011) — **P0 before Stage B** |
| ~200 concurrent sessions | In-memory cache divergence (2+ instances) | Redis cache — **P1 before Stage B** |
| ~500 concurrent WS connections | Per-process WebSocket/SSE | Pusher/Ably or sticky sessions — **P1 before Stage B** |
| ~1k users | Analytics full-table scans | Pre-materialise `AnalyticsSnapshot` — **P1 before Stage C (10k users)** |
| ~1k users | AI cost per abuser | Per-tenant cost caps + alerts — **P1** |
| ~5k users | Single PostgreSQL primary | Read replicas — **P2 at Stage C** |
| ~10k users | Single Redis | Redis cluster — **P2 at Stage C** |

### 5.2 Memory issues
- Node.js is single-threaded; one instance tops out around ~500 concurrent connections. **Fix:** cluster mode or multiple instances behind a LB.
- The `prisma client` holds a connection pool; verify `connection_limit` per instance doesn't exceed the DB's `max_connections`.
- The AI cost per request can spike memory (large prompts); the provider SDK should be configured with a timeout + a max-tokens cap.

### 5.3 API rate limits
- The per-key limit (Pro 50/hr, Elite 2,000/hr) is in-process; multi-instance doubles it. **Fix:** Redis-backed limiter (P1).
- The monthly lead quota (Free 50, Pro 500, Elite 2,000) is enforced per-key — a user with multiple keys could exceed it. **Fix:** enforce per-user, not per-key. **P2.**

### 5.4 Email sending limits
- Per-user Gmail (500/day free, 2,000/day Workspace) is the bottleneck for power users. **Fix:** Resend fallback + warm-up guidance + the deliverability dashboard. **P1.**

### 5.5 AI token costs at scale
- 1k users × ~$3/mo = $3k/mo AI cost. 10k users × ~$3/mo = $30k/mo. The credits model caps the per-user cost, but a single abuser can spike it. **Fix:** per-tenant cost caps + alerts (P1) + prompt caching (P2) + model routing (P2).

### 5.6 What needs to be refactored before scaling
- Move discovery + AI batch + sequence processing + Gmail sync to a worker queue (ADR-011). **P0.**
- SQLite → PostgreSQL (ADR-012). **P0.**
- In-memory cache → Redis. **P1.**
- Per-process WS → Pusher/Ably. **P1.**
- Pre-materialise analytics. **P1.**
- Per-tenant AI cost caps. **P1.**
- API versioning v1. **P1.**
- Outbound webhooks. **P2.**
- Read replicas. **P2 at Stage C.**
- Multi-region. **P2 at Stage C.**

---

## Section 6 — Reliability Improvements

### 6.1 Missing error boundaries
- The global `error.tsx` catches route-level crashes. **Gap:** component-level crashes inside a tab (e.g. the Pipeline tab) take down the whole tab, not just the component. **Fix:** add an error boundary per tab (the `error-fallback.tsx` exists; wire it per-tab). **P2.**

### 6.2 Unhandled promise rejections
- The API routes wrap in `withAuth` + `try/catch`, but the long-running jobs (discovery, AI batch) inside a route handler can throw an unhandled rejection if the await is missed. **Fix:** audit the long-running paths; ensure every `await` is inside the try. **P2.**

### 6.3 Missing retry logic
- The email send retries (3 attempts, 2/4/8s backoff). **Gap:** the Google Calendar API calls don't retry on 5xx; the Stripe API calls don't retry on 5xx. **Fix:** add a retry wrapper (`src/lib/retry.ts`) with exponential backoff for external API calls. **P1.**
- The AI provider has a fallback chain (ADR-006). **Gap:** the fallback is provider-level, not call-level — a single call's transient failure doesn't retry within the same provider. **Fix:** add a same-provider retry before falling over. **P2.**

### 6.4 No circuit breakers
- If Stripe / Google / Z-AI is down, every request still tries them (with retries), piling up. **Fix:** a circuit breaker (`src/lib/circuit-breaker.ts`) per external service — after N consecutive failures, fast-fail for M seconds, then half-open to test. **P1.**

### 6.5 No graceful degradation when external services fail
- If Gmail is down, the Outreach tab 500s. **Fix:** show a "Gmail is temporarily unavailable; your drafts are saved" state instead of a 500. **P2.**
- If the AI provider is down, the Assistant tab 500s. **Fix:** show "AI is temporarily unavailable; try again in a few minutes" + cache the last response. **P2.**
- If Stripe is down, the checkout 500s. **Fix:** show "Payment provider is temporarily unavailable; try again" + offer to save the cart. **P2.**

### 6.6 What causes the application to crash or become unavailable
- The sandbox kills the server periodically (the keepalive restores it).
- A syntax error in a committed file ("Ecmascript file had an error") — the dev server fails to compile.
- A DB lock (SQLite) — the app stalls.
- An OOM (Turbopack build) — only the build, not the dev server.
- A sub-process per-process (Node.js) crash — the dev server exits; the keepalive restarts it.

### 6.7 The reliability priorities
1. Per-tab error boundaries (so a component crash doesn't take the tab down). **P2.**
2. Circuit breakers on external services. **P1.**
3. Retry wrappers on external API calls. **P1.**
4. Graceful-degradation states for each external service. **P2.**
5. Audit the long-running paths for unhandled rejections. **P2.**

---

## Section 7 — Monetization Improvements

### 7.1 Features that could be premium
- **Vertical templates** (web-design agencies, marketing consultants) — P1; a Pro / Elite upsell.
- **Outbound webhooks** — Elite only (the API-integrator persona pays for it). P1.
- **White-label / agency** — $199/mo flat; a separate buyer. P2 (half-built → GA).
- **Custom report builder** — Pro + Elite; already gated; the formula editor + scheduling UX is the upsell lever. P2.
- **Team leaderboard + analytics** — Elite; already gated. P2.
- **The AI Copilot** — Pro; already gated. The "coach my stuck deal" feature is the upsell lever. P2.

### 7.2 Usage-based pricing opportunities
- **AI tokens** — already usage-based (credits). The opportunity: a "high-volume custom" tier above Elite for the user who needs 10k credits/mo. **P2.**
- **Seats** — already add-on ($9–$19/seat). The opportunity: a "team" plan that bundles 5 seats + 2k credits for a flat $79 (between Pro + Elite). **P2.**
- **Search-API queries** — currently bundled in credits. The opportunity: a "discovery add-on" for the user who wants 10k discoveries/mo without upgrading. **P3.**
- **Storage** (RAG documents, uploaded files) — currently unlimited. The opportunity: a "storage add-on" at scale. **P3.**

### 7.3 Partnership integrations that could generate revenue
- **HubSpot / Salesforce sync** — a paid add-on (the Marcus persona would pay $50/mo for native sync). **P2.**
- **Calendly / Cal.com** — a deep integration (alternative to the built-in scheduler). **P3.**
- **Clay / Smartlead** — cross-product data flow (the power user uses both). **P3.**
- **Vertical-marketplace templates** — partners sell vertical packs; we take a cut. **P3.**

### 7.4 Trial + conversion optimization
- **The 14-day Pro trial converts to Free, not to paid.** Opportunity: a "first-signed-client discount" — when the user marks a deal "won" in the pipeline, trigger a 20%-off Pro offer. **P1.**
- **The free → pro conversion is gated by hitting the 50-credit limit.** Opportunity: surface the upgrade CTA *before* the limit (at 40 credits, show "You're at 80% of your monthly discovery limit — upgrade for 500/mo"). **P1.**
- **No annual billing discount.** Opportunity: 2 months free on annual prepay. **P1.**
- **No referral program.** Opportunity: refer a friend → both get 500 credits. **P2.**

### 7.5 Churn prevention features
- **The weekly digest email** (planned, P0) — the value is visible even when the user doesn't log in.
- **The "stale user" re-engagement** — a user inactive for 14 days gets a personalised email ("Here's what changed in AcquisitionOS; here's a 50-credit pack on us"). **P2.**
- **The "churn-risk center"** (exists in the dashboard) — surface it to the admin, not just the user. **P2.**
- **Pause-over-cancel** — instead of "Cancel," offer "Pause for a month" (no charge; data retained; resume anytime). **P1.**

---

## Section 8 — Compliance and Legal Improvements

### 8.1 GDPR readiness
- ✅ Access, rectification, erasure, portability, object, consent withdrawal — all implemented.
- 🟡 **DPAs with sub-processors** — Stripe, Google, Z-AI, Resend, Sentry, hosting. **Roadmap: sign.** **P1.**
- 🟡 **Records of Processing Activities (Article 30)** — this document + the audit log; formalise a single register. **P2.**
- 🟡 **DPO** — not appointed (not required at our scale). **Roadmap: appoint when the threshold requires.** **P2.**
- 🟡 **DPIA** — not yet performed. **Roadmap: perform a DPIA for the lead-discovery + AI-outreach features.** **P1.**
- ❌ **Cross-border transfer safeguards (SCCs)** — needed in the DPAs. **Roadmap.** **P1.**
- ❌ **72-hour breach notification process** — defined in [INCIDENT-RESPONSE-PLAN.md](security/INCIDENT-RESPONSE-PLAN.md) but not yet drilled. **Roadmap: drill.** **P1.**

### 8.2 Indian DPDP Act readiness
- ✅ Consent, access + correction + erasure, retention — implemented.
- 🟡 **Data Fiduciary registration** — register with the Data Protection Board of India when the threshold is crossed. **Roadmap.** **P2.**
- 🟡 **Data localisation** — India-region deployment for Indian users when DPDP rules are finalised. **Roadmap.** **P2.**
- ❌ **Consent Manager** integration — when the spec is finalised. **Roadmap.** **P3.**
- ❌ **Grievance Officer** — appoint + publish contact on the privacy policy. **Roadmap.** **P1.**

### 8.3 Email marketing compliance (CAN-SPAM, GDPR)
- ✅ Unsubscribe link in every outreach email; honored within 1 business day via `EmailUnsubscribe`.
- ✅ Postal address in the template (the user must not remove it).
- ✅ Clear subject (no deceptive).
- 🟡 **The user is responsible for informing the lead** how they got the contact (GDPR Article 14). We provide a template; we don't enforce. **Roadmap:** add a pre-send check that the template includes the "how we found you" line. **P2.**
- 🟡 **Pre-existing business relationship exception** — not tracked. **Roadmap:** let the user mark a lead as "existing customer" to bypass the cold-outreach rules. **P3.**

### 8.4 Data retention policies
- ✅ Defined in `src/lib/compliance/retention.ts` + [DATA-PRIVACY-POLICY.md](security/DATA-PRIVACY-POLICY.md).
- 🟡 **The `end-of-period` cron** that enforces retention exists but isn't wired to the external scheduler. **Roadmap: wire it.** **P2.**

### 8.5 Right to deletion implementation
- ✅ Account deletion (`/api/settings/account/delete-request`) with a 30-day grace + hard delete.
- 🟡 **The audit log retains `userId`** after the user is hard-deleted (for forensic integrity); the `details` may still mention the email. **Roadmap: redact the email on hard delete.** **P2.**
- 🟡 **Invoices + billing records survive** (7-year tax retention). Acceptable but document in the deletion confirmation email.

### 8.6 Terms of service gaps
- ✅ The [TERMS-OF-SERVICE.md](legal/TERMS-OF-SERVICE.md) covers account, acceptable use, payment, cancellation, limitation of liability, governing law (India), indemnification.
- 🟡 **No SLA reference in the ToS** — the SLA is a separate document; the ToS should reference it. **P2.**
- 🟡 **No DPA for B2B customers** — enterprise customers will ask for a DPA. **Roadmap: a customer-facing DPA template.** **P2.**
- 🟡 **The indemnification is one-sided** (the user indemnifies us; we don't indemnify the user for IP infringement beyond the §13 carve-out). **Roadmap: balance it.** **P2.**

---

## Section 9 — Developer Experience Improvements

### 9.1 Missing tests
- **No authz matrix test.** **Fix:** integration tests asserting 403 for wrong-user / wrong-org / wrong-role per gated route. **P1.**
- **No webhook idempotency test.** **Fix:** test that a replayed Stripe webhook is a no-op. **P1.**
- **The e2e suite** (Playwright) — stubs exist; not configured. **Fix:** configure Playwright + write the smoke-test e2e. **P2.**
- **Coverage** is not measured continuously. **Fix:** add `bun run test:coverage` to CI + a coverage gate on `src/lib/`. **P2.**
- **No load-test schedule.** **Fix:** nightly load test against staging. **P3.**

### 9.2 Inconsistent patterns
- **Two meeting engines** (`lib/meeting-orchestration-service.ts` + `lib/meetings/meeting-orchestration-service.ts`) + **two platform adapters** (`lib/meeting/platform-adapter.ts` + `lib/meetings/platform-adapter.ts`) + **two calendar-intelligence files**. **Fix:** dedupe; the `meetings/` versions are the active ones. **P2.**
- **The `console.log` vs `logger.*` inconsistency** — some routes use `console.warn` (the magic-link route, for diagnostic visibility), most use `logger.*`. **Fix:** document the exception; standardise on `logger.*`. **P3.**
- **The `EmailPayload` had no `cc`/`bcc`/`replyTo` until recently** — some send paths still don't pass them. **Fix:** audit; ensure the user-copy pattern is consistent. **P2.**

### 9.3 Poor error messages in dev
- **`Ecmascript file had an error`** — names the file but not the line. **Fix:** run `bunx tsc --noEmit` to find the exact error. **P3.**
- **`Prisma Client not generated`** — no hint to run `db:generate`. **Fix:** add a hint in the error message. **P3.**

### 9.4 Missing type safety
- **`any` in a few places** (the Google callback's `user` after the backfill; the `prisma.$queryRaw` results). **Fix:** replace with `unknown` + a type guard, or a proper type. **P2.**
- **`User` type from Prisma is used loosely** (sometimes with `include: { mfaConfig }`, sometimes without) — the inferred type changes. **Fix:** use Prisma's `Prisma.UserGetPayload<{ include: {...} }>` for the variants. **P3.**

### 9.5 Hard-coded values that should be config
- **`PRODUCTION_URL` + `FALLBACK_URL`** in `src/lib/app-url.ts` — should be env-configurable. **P3.**
- **The keepalive's `GOOGLE_CLIENT_ID` check** — hardcoded; should be any critical secret. **P3.**
- **The `RELAY_SECRET`** in `src/lib/oauth-relay.ts` — falls back to `JWT_SECRET`; should be its own env var. **P3.**
- **The `14-day trial` duration** — hardcoded in several places; should be a single `TRIAL_DAYS` constant. **P3.**

### 9.6 Missing validation
- **Some route handlers don't validate the body shape** — they trust `body.field` to exist. **Fix:** add Zod schemas on every POST/PUT/PATCH. **P2.**
- **The webhook signature verification** is per-provider (Stripe, Google); no shared helper. **Fix:** a `verifyWebhookSignature(provider, rawBody, signature)` helper. **P3.**

### 9.7 Inconsistent naming conventions
- **`meeting-orchestration-service.ts`** (kebab) vs **`meetingOrchestrationService`** (camel) in imports — the alias `@/lib/meeting-orchestration-service` is kebab; the named export is camel. Pick one. **P3.**
- **`src/lib/meetings/`** (plural) vs **`src/lib/meeting/`** (singular) — both exist; the `meetings/` is active. **Fix:** delete `meeting/`. **P2.**

### 9.8 The DX priorities
1. Authz matrix test + webhook idempotency test. **P1.**
2. Dedupe the meeting engines + platform adapters. **P2.**
3. Zod schemas on every POST/PUT/PATCH. **P2.**
4. Configure Playwright + the smoke e2e. **P2.**
5. Coverage gate on `src/lib/`. **P2.**
6. Replace `any` with `unknown` + type guards. **P2.**
7. The rest (P3).

---

## Section 10 — Missing Features That Competitors Have

Based on Apollo.io, Hunter.io, Lemlist, Outreach.io, Salesloft public feature pages (2026).

### 10.1 Pre-built contact database (Apollo, Hunter, ZoomInfo)
- **What:** a searchable database of 100M+ verified B2B contacts with emails + phone numbers.
- **Why users want it:** the user who wants to prospect a known ICP (e.g. "VP Engineering at Series-B SaaS") can't discover that on Google Maps; they need a database.
- **How hard to build:** very hard (data acquisition + verification + maintenance is a separate business). Not on our roadmap (we're discovery-from-open-web, not database).
- **Priority:** ❌ Don't build. Partner with Hunter / Apollo for the "verify the email" use case instead.

### 10.2 Phone dialer (Outreach, Salesloft, Apollo)
- **What:** click-to-call from the lead record; call recording; voicemail drop; call analytics.
- **Why users want it:** high-intent leads want a call, not an email.
- **How hard to build:** medium (Twilio Voice integration; we have Twilio for WhatsApp already).
- **Priority:** P2 — for the Elite tier; the Prabhat persona doesn't need it; the Marcus persona does.

### 10.3 LinkedIn automation (Lemlist, Outreach, Salesloft)
- **What:** automated connection requests + messages + profile views on LinkedIn.
- **Why users want it:** LinkedIn is a major channel for B2B outreach.
- **How hard to build:** medium technically; high risk (LinkedIn's ToS prohibits automation; account-ban risk).
- **Priority:** P3 — we generate LinkedIn messages but don't automate; the user copies them. Don't automate (ToS risk).

### 10.4 CRM sync (Outreach, Salesloft, Lemlist)
- **What:** two-way sync with Salesforce, HubSpot, Pipedrive.
- **Why users want it:** the enterprise user has Salesforce as the system of record; they want AcquisitionOS to feed it, not replace it.
- **How hard to build:** medium per CRM (each has its own API + sync rules).
- **Priority:** P1 — for the Elite tier; the Marcus persona churns without it. Start with Salesforce (the most-requested); then HubSpot.

### 10.5 Email warm-up (Lemlist)
- **What:** a managed warm-up flow that sends + receives harmless emails to build the sender reputation before the user starts cold outreach.
- **Why users want it:** a new sender's outreach lands in spam; warm-up fixes that.
- **How hard to build:** medium (a network of warm-up mailboxes; we'd partner with a warm-up provider rather than build the network).
- **Priority:** P2 — the deliverability dashboard (planned, P0) is the prerequisite; warm-up is the next step.

### 10.6 Deliverability dashboard (Lemlist, Outreach)
- **What:** per-user sender-reputation view: open rate, reply rate, bounce rate, spam-complaint rate, with a "stop sending if X" threshold.
- **Why users want it:** the user needs to see a deliverability problem before the recipients do.
- **How hard to build:** low (we have the data in `EmailBounce`, `EmailOpenEvent`, `EmailClickEvent`, `Communication`).
- **Priority:** P0 — already on the roadmap; the Prabhat persona's #1 churn risk.

### 10.7 Multi-channel sequences (Lemlist, Outreach, Salesloft)
- **What:** a sequence that mixes email + LinkedIn + phone + SMS steps.
- **Why users want it:** multi-touch outperforms single-channel.
- **How hard to build:** medium (the sequence engine exists; the channel adapters for LinkedIn + phone + SMS need building).
- **Priority:** P2 — email-only is fine for v1; multi-channel is the v2.

### 10.8 Meeting scheduler as a shareable link (Calendly, Cal.com)
- **What:** a public "book a meeting with me" link the user can put in their email signature; the lead picks a slot; the meeting is booked.
- **Why users want it:** the inbound-meeting use case (the lead wants to book, not wait for the user to propose).
- **How hard to build:** medium (the Calendar integration exists; the public-link + the lead-facing scheduling page need building).
- **Priority:** P2 — a natural Elite feature.

### 10.9 Conversation intelligence (Gong, Chorus)
- **What:** record + transcribe + analyse the meeting (objections, next steps, sentiment) from the audio.
- **Why users want it:** post-meeting insights without manual note-taking.
- **How hard to build:** hard (audio capture + transcription + NLP). Partner with a CI provider (Gong, Fireflies) rather than build.
- **Priority:** P3 — partner, don't build.

### 10.10 Predictive analytics (Apollo, Outreach)
- **What:** "this lead is 73% likely to close in the next 30 days" — a trained model on the user's historical data.
- **Why users want it:** prioritisation of the pipeline.
- **How hard to build:** medium (the data exists in `Lead` + `Communication` + `Meeting` + `Deal`; train a model; serve it).
- **Priority:** P2 — the `AnalyticsPrediction` model exists; wire a real model.

### 10.11 Sales coaching (Gong, Outreach)
- **What:** AI that reviews the user's outreach + replies + gives feedback ("your subject lines are too long; your opens are generic").
- **Why users want it:** the user wants to improve.
- **How hard to build:** medium (the AI Copilot exists; add a "coach" mode that reviews patterns).
- **Priority:** P2 — the Sarah persona would pay for this.

### 10.12 Chrome extension (Apollo, Hunter, Lemlist)
- **What:** a browser extension that scrapes a lead's contact info from any website / LinkedIn profile + pushes it to AcquisitionOS.
- **Why users want it:** the user finds a lead outside AcquisitionOS + wants to add it without copy-paste.
- **How hard to build:** medium (the extension; the API endpoint to add a lead exists).
- **Priority:** P3 — a nice-to-have; the API + the CSV import cover most of the use case.

### 10.13 Mobile app (Apollo, Hunter, Outreach, Salesloft)
- **What:** a native iOS / Android app.
- **Why users want it:** on-the-go access (notifications, quick lead review, meeting join).
- **How hard to build:** high (a separate codebase; the API exists).
- **Priority:** ❌ Not on the 1-year roadmap (responsive web only).

### 10.14 The competitor gap summary
| Competitor feature | Our status | Priority |
|---|---|---|
| Contact database | ❌ (positioning) | Don't build |
| Phone dialer | ❌ | P2 (Elite) |
| LinkedIn automation | ❌ (ToS risk) | Don't build |
| CRM sync | ❌ | **P1** (Salesforce, then HubSpot) |
| Email warm-up | ❌ | P2 (after the deliverability dashboard) |
| Deliverability dashboard | 🟡 (planned) | **P0** |
| Multi-channel sequences | 🟡 (email-only) | P2 |
| Shareable scheduling link | ❌ | P2 |
| Conversation intelligence | ❌ | P3 (partner) |
| Predictive analytics | 🟡 (model exists, not wired) | P2 |
| Sales coaching | 🟡 (Copilot exists) | P2 |
| Chrome extension | ❌ | P3 |
| Mobile app | ❌ | Not on the 1-year roadmap |

---

## Section 11 — Top 10 Most Critical Improvements (across all sections)

Ranked by (impact × urgency). The first 5 are P0; the next 5 are P1.

1. **SSRF allowlist on the website scraper + RAG URL ingest** (Security §4.3, Threat-Model Scenario C). **P0.** An attacker can hit `http://169.254.169.254/` via the scraper today; the fix is a 50-line allowlist.
2. **`bun audit` + SBOM in CI** (Security §4.5, OWASP A06). **P0.** A dependency CVE could go unpatched; the fix is a CI step.
3. **MFA enforcement on the Google OAuth path** (Security §4.1, Threat-Model Scenario E). **P0.** The Google callback bypasses MFA; the fix is a TOTP prompt after Google login when MFA is enabled.
4. **Background the discovery job + move long-running crons to a worker queue** (Performance §3.4, Scalability §5.6, ADR-011). **P0.** Discovery is the #1 slow path + will time out at scale; the fix is Redis + BullMQ.
5. **SQLite → PostgreSQL migration** (Scalability §5.1, ADR-012). **P0 before 1k users.** SQLite's write lock is the scaling ceiling; the fix is managed Postgres (Supabase/Neon).
6. **Wire `checkAvailability` into meeting creation** (Feature §1.5). **P1.** You can double-book today; the fix is a free/busy check before the adapter call.
7. **Deliverability dashboard** (Feature §10.6, Monetization §7.5). **P1.** The Prabhat persona's #1 churn risk; we have the data; the fix is a UI.
8. **Weekly digest email (cron)** (Feature §1.6, Monetization §7.5). **P1.** The Prabhat persona forgets to log in; the value must come to him.
9. **Per-account lockout + breach-password check on password signin** (Security §4.1). **P1.** Credential stuffing is the highest-likelihood attack; the fix is per-account lockout + HIBP.
10. **Salesforce + HubSpot CRM sync** (Feature §10.4). **P1.** The Marcus persona churns without it; the API exists; the sync is the work.

## Section 12 — Estimated Priority Order for Addressing Improvements

A 90-day plan that respects dependencies + the team's realistic throughput.

### Days 0–30 (the P0 sweep)
- Week 1: SSRF allowlist (Security #1) + `bun audit` in CI (Security #2).
- Week 2: MFA on Google OAuth (Security #3) + the audit-on-read log (Security §4.6) + the authz matrix test (DX §9.1).
- Week 3: Background the discovery job (Performance #4) — the Redis + BullMQ setup + the discovery worker.
- Week 4: SQLite → PostgreSQL migration (Scalability #5) — the phased plan + the cutover.

### Days 31–60 (the P1 sweep)
- Week 5: Wire `checkAvailability` into meeting creation (Feature #6) + fix the orphaned `schedule-meeting-dialog.tsx` + the multi-calendar picker.
- Week 6: Deliverability dashboard (Feature #7) — the UI + the data aggregation.
- Week 7: Weekly digest email cron (Feature #8) — the template + the cron + the per-user opt-out.
- Week 8: Per-account lockout + breach-password check (Security #9) + Redis-backed rate limiter (Security §4.4).

### Days 61–90 (the P1 continued + P2 start)
- Week 9: Salesforce CRM sync (Feature #10) — the mapping + the sync engine.
- Week 10: HubSpot CRM sync (Feature #10 continued) + the outbound webhooks (Feature §10.4 + ADR-014).
- Week 11: API versioning v1 (ADR-013) + the in-app onboarding tour (UX §2.7).
- Week 12: PII encryption at rest (Security §4.9) + the DPIA (Compliance §8.1) + the DPA templates (Compliance §8.1).

### Beyond 90 days (P2 + P3)
- The reliability improvements (circuit breakers, retry wrappers, graceful degradation).
- The feature depth (vertical templates, predictive analytics, sales coaching, the shareable scheduling link).
- The DX cleanup (dedupe the meeting engines, Zod schemas everywhere, coverage gate).
- The compliance (DPDP data-fiduciary registration, India-region deployment, Consent Manager).
- The partner integrations (Gong / Fireflies for conversation intelligence; warm-up provider for deliverability).

### The recurring review
- **Monthly** — review this document against the actual state; tick off the done; re-rank the rest.
- **Quarterly** — full review with Product + Engineering + the founder; update the 90-day plan.

---

*This document is the honest mirror. Read it before the roadmap; the roadmap pulls from here. Update it whenever a fix lands or a new gap surfaces.*
