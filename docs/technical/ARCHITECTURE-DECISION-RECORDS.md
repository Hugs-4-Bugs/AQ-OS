# Architecture Decision Records — AcquisitionOS

> Owner: Engineering. Status: Living document. Format: ADR-N — Title — Date — Status (Accepted / Superseded / Deprecated). Each ADR: Context, Decision, Alternatives Considered, Consequences.

> These ADRs are reconstructed from the codebase as it stands (Sept 2026). Decisions made before the worklog era are reconstructed from the code itself + git history.

---

## ADR-001 — Use Next.js 16 (App Router) as the full-stack framework

**Date:** project inception. **Status:** Accepted.

### Context
The product is a single SPA-style dashboard (client-rendered, auth-gated) PLUS a large API surface (485 routes today) PLUS server-side concerns (webhooks, OAuth callbacks, SMTP, AI calls, file uploads). We needed one framework that handles SSR, API routes, static assets, and deployment simplicity for a small team.

### Decision
Next.js 16 with the App Router. One repo, one deploy. UI is client-rendered (`'use client'`), API routes are serverless-style route handlers.

### Alternatives Considered
- **Separate Next.js + Express API** — rejected: doubles deploy surface for a 1–5 person team; OAuth callback + webhook + SMTP all want to live next to the UI anyway.
- **Remix** — rejected at the time: smaller ecosystem, fewer shadcn/ui examples; App Router covered the same ground.
- **Pure Vite SPA + separate API** — rejected: no SSR for the marketing/landing surface; harder SEO.
- **SvelteKit / Nuxt** — rejected: the founding team's TypeScript/React fluency was decisive.

### Consequences
- ✅ One deploy, one bill, one set of env vars.
- ✅ shadcn/ui + Radix ecosystem works out of the box.
- ✅ API route handlers + Server Components when useful.
- ❌ Long-running jobs (discovery, scraping) are awkward in serverless route handlers — mitigated by cron endpoints + the plan to move to a background queue (ADR-011).
- ❌ Edge Runtime limitations (the `instrumentation.ts` warnings in dev.log) — mitigated by keeping instrumentation Node-only.

---

## ADR-002 — Use Prisma ORM with SQLite (dev) → PostgreSQL (prod target)

**Date:** project inception. **Status:** Accepted (SQLite for now; PostgreSQL migration planned — see ADR-011).

### Context
We needed a type-safe ORM that works with TypeScript, supports migrations, and lets us develop locally without a DB server. The schema is large (90+ models).

### Decision
Prisma ORM. SQLite for local dev and the current single-instance production. PostgreSQL as the documented migration target — the schema file is annotated with `[MIGRATE-SAFE]` / `[MIGRATE-CAUTION]` / `[MIGRATE-RISK]` tags and a migration order.

### Alternatives Considered
- **Drizzle** — rejected at the time: smaller ecosystem; Prisma's migration story + Studio were more mature for a small team.
- **Raw SQL + a query builder (Kysely)** — rejected: too much boilerplate for 90 models.
- **Mongoose + MongoDB** — rejected: the data is relational (User → Subscription → PaymentOrder → Invoice → Lead → OutreachMessage); a document DB would force joins-by-hand.
- **Supabase / PlanetScale from day 1** — rejected: adds a managed-service dependency and a network round-trip in local dev; SQLite keeps local dev instant.

### Consequences
- ✅ Type-safe DB access; auto-generated types catch schema drift at compile time.
- ✅ Local dev with zero DB setup (just a file).
- ✅ Migration to PostgreSQL is a documented, annotated path (not a rewrite).
- ❌ SQLite locks the whole DB on writes — we will hit write contention around ~500 concurrent writers. Migration to PostgreSQL is on the roadmap (Q4 2026).
- ❌ Prisma's client bundle is non-trivial in size — mitigated by lazy imports in hot paths.

---

## ADR-003 — Use Stripe as the primary payment provider, Razorpay for India + GST

**Date:** project inception. **Status:** Accepted.

### Context
We bill in USD globally and INR in India. India users need GST invoices for tax credit. Stripe doesn't natively handle Indian GST cleanly; Razorpay is the local standard.

### Decision
Stripe as the primary (global, USD). Razorpay as the secondary (India, INR, GST). The payment-service abstraction (`src/lib/payment-service.ts`) + `src/lib/razorpay-service.ts` + `src/lib/gst-service.ts` keep both behind a common interface. Webhook → atomic subscription activation via `db.$transaction`.

### Alternatives Considered
- **Stripe only** — rejected: Indian users can't easily pay in USD; no GST invoice = lost Indian market.
- **Razorpay only** — rejected: global users expect Stripe; Razorpay's global coverage is weaker.
- **Paddle (merchant-of-record)** — rejected at the time: Paddle takes a larger cut; the team wanted direct Stripe relationship for cash-flow control. (Re-evaluate if international tax compliance becomes a burden.)

### Consequences
- ✅ Global + India both first-class.
- ✅ GST invoices generated for Indian users (tax credit eligibility).
- ❌ Two webhook paths to maintain + two idempotency implementations.
- ❌ Two provider dashboards to monitor; refund flows differ.

---

## ADR-004 — Use JWT sessions in httpOnly cookies (not NextAuth database sessions)

**Date:** project inception. **Status:** Accepted.

### Context
We need sessions that work across the SPA + the API + the upcoming public API (third-party integrators). NextAuth was available but its database-session model couples session storage to the DB on every request.

### Decision
Custom JWT auth: `access_token` (15 min, HS256, `path /`) + `refresh_token` (30 days, `path /api/auth`) in httpOnly, `SameSite=strict`, `secure` in production cookies. `UserSession` table records the refresh-token hash for revocation. `getAuthUser` reads the cookie, verifies the JWT, loads the user.

### Alternatives Considered
- **NextAuth.js v4 database sessions** — rejected: a DB hit per request is fine at 100 users, painful at 10,000; JWTs let the API scale statelessly.
- **NextAuth JWT strategy** — rejected: NextAuth's JWT is opaque; we wanted full control of claims (plan, orgId, isTrial, trialEndsAt) for the entitlement middleware without a DB lookup on every gated request.
- **Opaque session IDs in cookies + Redis lookup** — rejected: adds Redis as a hard dependency; we want to run on a single instance for as long as possible.

### Consequences
- ✅ Stateless API auth; horizontal scale without session sharing.
- ✅ Claims carry plan/orgId — entitlement gating without a DB hit.
- ❌ Refresh-token rotation + revocation needs the `UserSession` table; a revoked refresh token isn't invalidated until the user's next /api/auth/refresh.
- ❌ Cookie `SameSite=strict` blocks the cross-domain Google OAuth callback cookie set — mitigated by the relay-token pattern (ADR-005).

---

## ADR-005 — Cross-domain Google OAuth via a short-lived relay JWT

**Date:** 2026-06. **Status:** Accepted.

### Context
Google OAuth redirects the user from `accounts.google.com` back to our `/api/auth/callback/google`. Because we run on multiple preview domains + production, the canonical callback domain can differ from the domain the user started on. `SameSite=strict` cookies can't be set cross-domain.

### Decision
After Google callback, if the user's start-origin (from the `state` param) differs from the canonical callback origin, we mint a 60-second JWT (`oauth-relay.ts`, signed with `JWT_SECRET`) containing the access + refresh tokens, redirect the user to `${startOrigin}/api/auth/google/relay?token=...`, and that endpoint (on the user's origin) sets the auth cookies and redirects to `/`.

### Alternatives Considered
- **Force all users to one canonical domain** — rejected: preview domains are how the team demonstrates; locking to one domain breaks the demo flow.
- **Set `SameSite=None; Secure` on auth cookies** — rejected: weakens CSRF posture globally for one flow.
- **Pass tokens in the URL fragment** — rejected: tokens in URLs leak via Referer / logs.

### Consequences
- ✅ User stays authenticated on the domain they started on.
- ✅ Cookies stay `SameSite=strict`.
- ❌ 60-second relay JWT is a brief window of token-in-URL exposure — mitigated by short TTL + single-use intent + HTTPS-only.
- ❌ Two round-trips on the OAuth flow (callback → relay → /) — acceptable.

---

## ADR-006 — Z-AI as the primary AI provider with multi-provider fallback

**Date:** project inception. **Status:** Accepted.

### Context
AI is core to discovery (scoring, outreach generation, reply classification, chat, RAG). We need a provider that's reliable, cheap enough for credits-based pricing, and has both chat + embeddings. We also need resilience — a single provider outage shouldn't brick the product.

### Decision
`z-ai-web-dev-sdk` as the primary provider (chat + embeddings), used **only in the backend** (never client-side). `src/lib/ai-provider-fallback.ts` wraps every call with a fallback chain. `src/lib/ai/prompt-manager.ts` centralises prompts. `src/lib/ai-cost-tracker.ts` records cost per user / per action for credits billing.

### Alternatives Considered
- **OpenAI directly** — rejected: cost variability + the India data-residency question; Z-AI's regional posture fit better.
- **Anthropic Claude only** — rejected: higher cost per token than our credits model supports at the Free tier.
- **Self-hosted open-weights (Llama / Mistral)** — rejected: the team doesn't want to run GPU infra; the AI provider abstraction means we can swap in self-hosted later without rewriting callers.
- **One provider, no fallback** — rejected: a single provider outage would brick discovery + outreach; fallback is required for an AI-dependent product.

### Consequences
- ✅ Resilience: provider outage → silent fallback.
- ✅ Cost tracking per action enables the credits billing model.
- ✅ Prompt centralisation makes A/B + iteration cheap.
- ❌ SDK coupling to `z-ai-web-dev-sdk` — mitigated by the provider abstraction; swap is a one-file change.
- ❌ Backend-only constraint means no client-side AI features (e.g. local autocomplete) — accepted.

---

## ADR-007 — Per-user Gmail OAuth + SMTP for outreach (not a shared sender domain)

**Date:** project inception. **Status:** Accepted.

### Context
Cold outreach email deliverability depends on sender reputation. If we send from a shared `*@acquisitionos.com` domain, one bad user's spam complaints sink everyone's deliverability. If we send as the user (their own Gmail via OAuth, or their own SMTP via App Password), their reputation is theirs alone.

### Decision
- Primary: **per-user Gmail OAuth** (`src/lib/gmail-oauth-service.ts`) — send outreach as the user's Gmail, with their reputation.
- Fallback: **per-user SMTP** (`src/lib/email.ts`, `src/lib/email-ethereal.ts`) — Gmail App Password / Resend / any SMTP.
- Both behind `sendEmail()` which tries Resend first (if configured) then SMTP, with retry + permanent-error detection.

### Alternatives Considered
- **Shared `*@acquisitionos.com` sender** — rejected: one bad actor sinks all deliverability.
- **Resend-only / SendGrid-only** — rejected: the user's domain reputation is lost; we'd be a black box.
- **No email sending — copy-paste only** — rejected: kills the core loop.

### Consequences
- ✅ Each user's deliverability is their own; one bad user can't sink the platform.
- ✅ Replies land in the user's own inbox (Gmail) — natural reply-handling flow.
- ❌ Gmail OAuth has rate limits + daily sending caps — mitigated by SMTP fallback + sequence pacing + the credits system.
- ❌ Per-user OAuth onboarding friction — mitigated by SMTP as a no-OAuth fallback.

---

## ADR-008 — Credits-based pricing, not per-seat (see PRICING-STRATEGY.md)

**Date:** project inception. **Status:** Accepted.

### Context
Unit cost is dominated by AI + search-API + SMTP, not by user count. Per-seat pricing would decouple revenue from cost.

### Decision
Credits meter AI-heavy actions. Monthly grant per plan + rollover + add-on packs. `src/lib/credit-service.ts`, `src/lib/credit-costs.ts`, `src/lib/plan-gates.ts` enforce the model. `CreditsLedger` is the source of truth.

### Alternatives Considered
- **Per-seat** — rejected (see ADR context).
- **Unlimited with fair-use** — rejected: invites the abuser; no hard cap means negative-margin users.
- **Usage-based with no plan** — rejected: no predictable revenue; users want a predictable bill.

### Consequences
- ✅ Revenue tracks cost.
- ✅ Free tier is sustainable (capped at 50 credits → ~$0.80/mo max cost per free user).
- ❌ Surprise-bill risk on credit exhaustion — mitigated by pre-action cost preview + add-on packs + hard stop (not silent overage).

---

## ADR-009 — React Query (TanStack Query) for server state + Zustand for client state

**Date:** project inception. **Status:** Accepted.

### Context
A large dashboard SPA with many tabs, each fetching + polling. We needed a server-state cache that handles refetch / invalidation / dedupe, and a client-state store for cross-tab UI state (active tab, theme, notifications).

### Decision
TanStack Query for server state (fetching, caching, polling). Zustand for client state (active tab, notification store, settings store). `src/lib/store.ts` is the Zustand root.

### Alternatives Considered
- **Redux Toolkit + RTK Query** — rejected: heavier boilerplate; TanStack Query is sufficient for server state.
- **SWR** — rejected: TanStack Query's devtools + mutation story were stronger.
- **Single Zustand for everything** — rejected: hand-rolling cache invalidation + polling is error-prone.

### Consequences
- ✅ Server-state concerns (cache, invalidation, polling) are library-handled.
- ✅ Client state is lightweight + cross-tab.
- ❌ Two mental models (query cache vs. zustand store) — documented in CONTRIBUTING.
- ❌ Some polling intervals (30s notifications, 60s credits) overlap — accepted; dev.log shows it's not a real cost.

---

## ADR-010 — shadcn/ui (New York style) + Tailwind CSS 4 + Radix primitives

**Date:** project inception. **Status:** Accepted.

### Context
A large UI surface (150+ dashboard components) needs consistent, accessible primitives. The team wanted copy-paste-able components (not a black-box library) so we can customise freely.

### Decision
shadcn/ui (New York variant) — components live in `src/components/ui/` and are owned by us. Tailwind 4 for styling. Radix primitives under the hood for accessibility.

### Alternatives Considered
- **Material UI / Mantine** — rejected: opinionated styling that fights Tailwind; harder to match a custom brand.
- **Headless UI + custom Tailwind** — rejected: more boilerplate; shadcn gives the same headless foundation + pre-built styled starting points.
- **Native components** — rejected: accessibility is hard; Radix gives us focus traps, ARIA, keyboard nav for free.

### Consequences
- ✅ Accessible by default (Radix).
- ✅ Customisable (we own the files).
- ✅ Consistent visual language across 150+ components.
- ❌ Component files in-repo means updates are manual (no `npm update` for shadcn) — accepted; the trade-off is customisation.

---

## ADR-011 — Background job queue (planned, not yet shipped)

**Date:** 2026-09 (planned). **Status:** Proposed — to be built Q4 2026.

### Context
Long-running jobs (discovery, scraping, AI batch, sequence processing, Gmail sync) currently run inside API route handlers or cron endpoints. At scale these will exceed HTTP timeouts + hold DB connections.

### Decision (proposed)
Introduce Redis + BullMQ (or similar). Move discovery, scraping, AI batch, sequence processing, Gmail sync, and the 12 cron jobs to a worker queue. API routes enqueue; workers process; status via SSE/WebSocket.

### Alternatives Considered
- **Stay on cron + HTTP** — rejected: doesn't scale past ~500 users; 30s discovery jobs will time out.
- **AWS SQS / Lambda** — rejected: vendor lock-in; the team wants a single deploy for now.
- **Inngest / Trigger.dev** — considered: managed, but adds an external dependency; BullMQ keeps us self-hosted.

### Consequences (expected)
- ✅ API routes stay fast (enqueue + return).
- ✅ Long jobs don't block request threads.
- ❌ Adds Redis as a dependency — operational cost + a thing to monitor.

---

## ADR-012 — SQLite → PostgreSQL migration (planned)

**Date:** 2026-09 (planned). **Status:** Proposed — to be executed before crossing ~500 paying accounts.

### Context
SQLite locks the whole DB on writes. The schema is already annotated for the migration (`prisma/schema.prisma` header). `scripts/migrate-to-postgresql.sh` exists.

### Decision (proposed)
Change `datasource` provider to `postgresql`. Run the annotated migration in 5 phases (User+Org → Subscription+Payment → Lead+Pipeline → Email+Chat → rest). Verify FK integrity at each phase. Use Supabase or Neon for managed PostgreSQL to avoid running our own Postgres.

### Alternatives Considered
- **Stay on SQLite forever** — rejected: write contention at ~500 concurrent writers.
- **CockroachDB / TiDB** — rejected: overkill for our scale; Postgres is well-understood.
- **PlanetScale (MySQL)** — rejected: Prisma's MySQL story is fine but Postgres's JSON + extensions fit our JSON-field-heavy schema better.

### Consequences (expected)
- ✅ Write concurrency unblocked.
- ✅ Managed Postgres (Supabase/Neon) handles backups, PITR.
- ❌ One-time migration risk — mitigated by the phased plan + backups.

---

## ADR-013 — API versioning via `/api/v1/...` (planned)

**Date:** 2026-09 (planned). **Status:** Proposed — to ship before the first breaking change.

### Context
The API is currently unversioned (`/api/leads`, `/api/meetings`, etc.). The first paying API user (Liam persona) will churn on the first breaking change. We need a stability contract.

### Decision (proposed)
Introduce `/api/v1/...` as the stable surface. Current unversioned routes remain as deprecated aliases for 6 months. Document the stability contract in `/api-docs`. SemVer for the API.

### Alternatives Considered
- **Header-based versioning** — rejected: harder to test + document.
- **No versioning, "we'll just not break things"** — rejected: not a contract; the Liam persona won't trust it.

### Consequences (expected)
- ✅ Contract for API integrators.
- ❌ Maintenance burden of two surfaces for 6 months — accepted.

---

## ADR-014 — Webhook signing + replay (planned)

**Date:** 2026-09 (planned). **Status:** Proposed.

### Context
Outbound webhooks (for Liam / Marcus) need signing (so receivers can verify) + a delivery log + replay (so receivers can recover from their own downtime).

### Decision (proposed)
HMAC-SHA256 with a per-endpoint secret. `WebhookDelivery` table records each attempt + response + status. Admin UI to view + replay. Idempotency via a delivery ID header.

### Alternatives Considered
- **JWT-signed webhooks** — rejected: receivers prefer a static secret to a key-exchange dance.
- **No signing** — rejected: receivers can't verify; man-in-the-middle risk.

### Consequences (expected)
- ✅ Verifiable + recoverable.
- ❌ One more thing for the receiver to implement — documented in `/api-docs`.

---

*See also: [API-REFERENCE.md](API-REFERENCE.md), [DATABASE-SCHEMA.md](DATABASE-SCHEMA.md), [DATA-FLOW-DIAGRAMS.md](DATA-FLOW-DIAGRAMS.md), [INTEGRATION-GUIDES.md](INTEGRATION-GUIDES.md).*
