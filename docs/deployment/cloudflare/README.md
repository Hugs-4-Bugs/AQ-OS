# AcquisitionOS on Cloudflare — Guide Entry Point

**What this guide is:** the complete, beginner-friendly path for deploying AcquisitionOS (one Next.js 16 application: UI + API together) to **Cloudflare Workers** using the official **OpenNext Cloudflare adapter** (`@opennextjs/cloudflare`), while keeping the production database as **external PostgreSQL accessed through Cloudflare Hyperdrive**.

**Read this before the other files.** This page defines the component map, the honest "reality check" of what changes on Cloudflare, the deployment order, and the end-to-end checklist. The shared facts about the application itself come from [`../01-architecture.md`](../01-architecture.md) and the conventions from [`../README.md`](../README.md).

> **Honesty note (read first):** unlike the GCP/AWS/Azure guides, the Cloudflare path does **not** run a Node.js container. Your Next.js app is transformed by an adapter and executed inside Cloudflare's `workerd` runtime. That runtime is *mostly* Node-compatible but not perfectly. Everything in this guide is written to reflect that reality — including its constraints, its caveats, and the features you should explicitly test before go-live.

---

## 1. Component map — which Cloudflare service does what

| AcquisitionOS need | Cloudflare service used | Label | Notes |
| --- | --- | --- | --- |
| Run the Next.js app (UI + API in one unit) | **Workers** via the OpenNext adapter (`@opennextjs/cloudflare`) | `REQUIRED FOR CURRENT ACQUISITIONOS` | One Worker serves pages, `/api/**`, SSE, and cron/webhook routes. |
| Serve static assets (`_next/static`, public files) | **Workers Assets** (binding `ASSETS`, directory `.open-next/assets`) | `REQUIRED` | Part of the same Worker deployment; no separate CDN setup needed. |
| PostgreSQL | **Stays external** (Neon, Supabase, RDS, Cloud SQL, Flexible Server, ...) + **Hyperdrive** binding | `REQUIRED` | Prisma + PostgreSQL schema unchanged. **Do NOT migrate to D1** — see [`architecture.md`](./architecture.md). |
| Database connection pooling/caching at the edge | **Hyperdrive** | `REQUIRED` | The Worker binds Hyperdrive and uses its connection string; the origin Postgres stays where it is. |
| Secrets (`JWT_SECRET`, `STRIPE_SECRET_KEY`, ...) | **Wrangler secrets** (`wrangler secret put`) | `REQUIRED` | Encrypted Worker secrets; plaintext non-secrets live in `wrangler.jsonc` `vars`. See [`secrets.md`](./secrets.md). |
| Scheduled jobs (15 HTTP cron endpoints) | **Workers Cron Triggers** (scheduled handler) or any external pinger | `REQUIRED` | Endpoints are Bearer-protected HTTP URLs; see [`manual-deployment.md`](./manual-deployment.md) §9. |
| DNS for `app.yourdomain.com` | **Cloudflare DNS** | `REQUIRED` | Zone on Cloudflare (full setup or NS delegation — [`prerequisites.md`](./prerequisites.md)). |
| TLS certificate | **Universal SSL** (included) or Advanced Certificate Manager | `REQUIRED` | Issued automatically for the Custom Domain on the Worker. |
| Web application firewall | **Cloudflare WAF** (managed rules + custom rate-limit rules) | `RECOMMENDED` | E.g., rate-limit and challenge `/api/*`; see [`networking.md`](./networking.md). |
| Upload / invoice file storage | **R2** (optional binding) | `OPTIONAL` | The app writes `public/` uploads to an ephemeral filesystem today; Workers is even more ephemeral than a container. R2 is the mitigation — see [`frontend.md`](./frontend.md). |
| Multi-instance SSE fan-out | **Upstash for Redis** (external) via `REDIS_URL` | `OPTIONAL` | Same role as on other clouds. (Cloudflare KV/DO-based designs are `FUTURE/ALTERNATIVE`.) |
| Next.js ISR / incremental cache | **R2** binding `NEXT_INC_CACHE_R2_BUCKET` (OpenNext override) | `OPTIONAL` | Only matters if you use ISR/`revalidate`; AcquisitionOS relies mostly on SSR + client caching. |
| The application database itself | **D1** | **`NOT APPLICABLE`** | D1 is SQLite-based. AcquisitionOS is Prisma + PostgreSQL (53+ models). Migrating to D1 would require rewriting the schema and SQL. **Rejected — do not do this.** |
| Queue-based background jobs | **Queues** | `FUTURE/ALTERNATIVE` | The app runs jobs in-process and via HTTP cron today. |
| Coordination / alarms / KV cache | **Durable Objects, Workers KV** | `FUTURE/ALTERNATIVE` | Not used by the current code. |
| Containers if OpenNext limits bite | **Cloudflare Containers** (Containers-based Workers) | `FUTURE/ALTERNATIVE` | `NEEDS VERIFICATION` — availability/limits are newer and changing; check the official docs if you need a full Node container on Cloudflare. |
| Infrastructure as Code | **Terraform** (`cloudflare` provider) | `OPTIONAL` | [`terraform.md`](./terraform.md); manual `wrangler` flow first. |

---

## 2. High-level architecture on Cloudflare

```mermaid
flowchart TB
    U[Browser / Mobile user] -->|HTTPS| DNS["Cloudflare DNS + Universal SSL (app.yourdomain.com)"]
    DNS --> Edge["Cloudflare global edge - WAF + Cache rules"]
    Edge --> W["Cloudflare Worker - Next.js 16 via @opennextjs/cloudflare<br/>UI (SSR) + /api/** + SSE + webhooks, assets via Workers Assets"]
    W -->|"Hyperdrive binding (pooled + cached)"| HD["Cloudflare Hyperdrive"]
    HD -->|TLS| PG[("External managed PostgreSQL<br/>Neon / Supabase / RDS / Cloud SQL / ...")]
    W -->|SMTP or Resend HTTP API| Mail[("Outbound email")]
    Stripe["Stripe / Razorpay"] -->|webhook POST /api/payments/webhook/stripe (+ /razorpay)| W
    W -->|HTTPS APIs| Stripe
    Google["Google OAuth + Gmail + Calendar + Custom Search"] <-->|HTTPS| W
    W -->|server-side only| AI["AI provider:<br/>OpenAI / Anthropic / OpenRouter"]
    Cron["Workers Cron Triggers<br/>(scheduled handler)"] -->|"fetch + Bearer CRON_SECRET"| W
    W -.->|"OPTIONAL binding"| R2[("R2 object storage<br/>uploads / ISR cache")]
    W -.->|"OPTIONAL REDIS_URL"| Redis[("Upstash Redis<br/>multi-instance SSE fan-out")]
```

What the diagram means in one sentence: **one Worker at the Cloudflare edge replaces the "container + load balancer" pair from the other clouds**, the PostgreSQL database stays exactly where it would be on any other platform, and Hyperdrive is the pooled, cached bridge between them.

---

## 3. Reality check: what changes on Cloudflare vs container clouds

This is the most important section in this guide. Compared to GCP Cloud Run / AWS ECS / Azure Container Apps (see [`../README.md`](../README.md) §5):

**Changes:**

1. **No Docker container in production.** The build is `opennextjs-cloudflare build`, which runs `next build` and transforms the output into a Worker bundle (`.open-next/worker.js` + static assets). The Dockerfile from [`../../03-docker.md`](../03-docker.md) is still useful for local parity testing, but Workers never sees a container.
2. **An adapter sits between Next.js and the runtime.** `@opennextjs/cloudflare` converts the Next.js build output for `workerd`. Adapter coverage of Next.js features is broad (App Router, route handlers, SSR, SSG, ISR, middleware) but documented exceptions exist — always check the adapter's compatibility page (https://opennext.js.org/cloudflare) when upgrading Next.js.
3. **Node.js compatibility mode, not Node.js.** You must enable the `nodejs_compat` compatibility flag and a recent `compatibility_date`. A large subset of Node APIs is available (`node:buffer`, `node:crypto`, `node:events`, `node:stream`, `node:util`, ...), but some Node APIs and behaviors differ or are unavailable. Native add-ons that expect real Node internals (some image/PDF native modules) are the classic risk area.
4. **CPU-time limits, per plan.** At the time of writing (verify at https://developers.cloudflare.com/workers/platform/limits/): Workers Free allows **10 ms CPU per request**; Workers Paid allows **5 minutes (30 s default)** per request; memory is 128 MB on both plans. A full SSR Next.js app with Prisma, JWT auth (bcrypt!), and AI calls will exceed 10 ms CPU routinely — **the Workers Paid plan is effectively required** for this app. `NEEDS VERIFICATION` — limits change; re-check before committing.
5. **No writable filesystem.** Writes to `public/feedback-uploads/` and `public/invoices/` do not persist. Plan the R2/object-storage path (or keep invoice generation on a container-based cloud). See [`frontend.md`](./frontend.md) §3.
6. **The database connection goes through Hyperdrive.** `DATABASE_URL` inside the Worker points at Hyperdrive's connection string; migrations (`DIRECT_URL`) run from CI/local over the direct connection. Details in [`database.md`](./database.md).
7. **Outbound SMTP is not a given.** Workers can open outbound TCP (with limits — 6 simultaneous connections per request at the time of writing), but raw SMTP from Workers is a known friction point. The honest recommendation on this platform: use **Resend's HTTP API** (`RESEND_API_KEY`) for email instead of nodemailer SMTP. The app supports both; this is a provider choice, not a code change.
8. **Per-request client pattern for Prisma.** The OpenNext docs explicitly warn against one global pooled client on Workers; the app's `src/lib/db.ts` needs the per-request adapter pattern documented in [`database.md`](./database.md) §4 when you choose this path.
9. **Version/rollback model changes.** Instead of "redeploy the container", you get Workers Versions and instant rollbacks (dashboard or `wrangler versions`). See [`frontend.md`](./frontend.md) §8.

**Does NOT change (this is why the port is tractable):**

- **One app, one deployment unit** — UI + API stay together in the single Worker.
- **PostgreSQL + Prisma schema** — untouched; the same `prisma/schema.production.prisma`, same migrations.
- **All environment variables and their meanings** — see [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) and [`secrets.md`](./secrets.md).
- **Auth** — custom JWT cookies, OTP/magic-link email, Google OAuth all behave the same (cookie flags, `Host`/`X-Forwarded-Proto` handling covered in [`networking.md`](./networking.md)).
- **Webhooks** — Stripe still POSTs to `/api/payments/webhook/stripe` and Razorpay to `/api/payments/webhook/razorpay`; the URLs are just served by a Worker.
- **Cron contract** — the same 15 Bearer-protected `/api/cron/**` endpoints from [`../01-architecture.md`](../01-architecture.md) §2.4.
- **SSE contract** — same endpoints, same 15–30 s heartbeats; Workers streams responses and (at the time of writing) imposes no hard wall-time limit on HTTP requests while the client stays connected. Re-verify per plan: `NEEDS VERIFICATION`.

---

## 4. Deployment order (follow this sequence)

1. Prepare local tools + Cloudflare account + domain on Cloudflare DNS → [`prerequisites.md`](./prerequisites.md)
2. Create the **external** managed PostgreSQL database (not on Cloudflare) → [`database.md`](./database.md) + [`../../04-database-production.md`](../04-database-production.md)
3. Create the Hyperdrive config pointing at that database → [`manual-deployment.md`](./manual-deployment.md) §3, [`database.md`](./database.md) §3
4. Produce all secrets (`JWT_SECRET`, `CRON_SECRET`, provider keys) → [`../../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md), [`secrets.md`](./secrets.md)
5. Integrate the OpenNext adapter into the app (manual, one-time code/config change) → [`manual-deployment.md`](./manual-deployment.md) §6
6. Store secrets with `wrangler secret put`; write `wrangler.jsonc` → [`manual-deployment.md`](./manual-deployment.md) §4–5, [`secrets.md`](./secrets.md)
7. Build, preview locally (`wrangler dev`), deploy → [`manual-deployment.md`](./manual-deployment.md) §7
8. Run `prisma db push` against production Postgres over the **direct** connection → [`manual-deployment.md`](./manual-deployment.md) §8, [`../../04-database-production.md`](../04-database-production.md)
9. Attach the Custom Domain + Universal SSL; verify proxy status → [`manual-deployment.md`](./manual-deployment.md) §10, [`networking.md`](./networking.md)
10. Register webhooks (Stripe → `/api/payments/webhook/stripe`, Razorpay → `/api/payments/webhook/razorpay`) → [`manual-deployment.md`](./manual-deployment.md) §11
11. Schedule the 15 cron endpoints (Cron Triggers or external pinger) → [`manual-deployment.md`](./manual-deployment.md) §9
12. Verify end-to-end (checklist below) → then CI/CD + monitoring + backups
13. Optional hardening: Terraform for the same resources → [`terraform.md`](./terraform.md); WAF + cache rules → [`networking.md`](./networking.md); R2 → [`frontend.md`](./frontend.md)

Docker is **not** used on this deployment path (no container is built or pushed), but [`../../03-docker.md`](../03-docker.md) remains the recommended way to run the app locally for parity testing before you adopt the Workers runtime.

---

## 5. End-to-end checklist

### Before deployment
- [ ] Cloudflare account created; Workers Paid plan decision made (CPU limits — see §3.4 above)
- [ ] Domain added to Cloudflare DNS (registrar nameservers pointed at Cloudflare or zone delegated)
- [ ] `wrangler` installed and `wrangler login` completed (verify with `wrangler whoami`)
- [ ] Node.js 20 + npm available locally (same versions as [`../../00-prerequisites.md`](../00-prerequisites.md))
- [ ] External managed PostgreSQL created; connection string recorded in your password manager
- [ ] Secrets generated: `JWT_SECRET`, `CRON_SECRET`, `ENCRYPTION_KEY` (`openssl rand -hex 32`)
- [ ] Email provider chosen: **Resend API key recommended on Workers** (SMTP from Workers is unreliable — §3.7)
- [ ] AI provider key configured (at least one fallback: `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` — the built-in primary is sandbox-wired, per [`../01-architecture.md`](../01-architecture.md) §2.6)
- [ ] Google OAuth redirect URI updated to `https://app.yourdomain.com/api/auth/google/callback`

### Infrastructure
- [ ] Hyperdrive config created (`wrangler hyperdrive create ...`) and bound in `wrangler.jsonc`
- [ ] `wrangler.jsonc` present with `main`, `assets`, `compatibility_date`, `nodejs_compat`, Hyperdrive binding
- [ ] Worker deployed once (`opennextjs-cloudflare build && opennextjs-cloudflare deploy`) — even to the `*.workers.dev` preview URL
- [ ] Custom Domain attached to the Worker; Universal SSL certificate active (browser shows a valid padlock)
- [ ] (OPTIONAL) R2 bucket created if you want durable uploads / ISR cache
- [ ] (OPTIONAL) WAF custom rate-limit rule on `/api/*` configured

### Application
- [ ] `wrangler secret put` completed for every REQUIRED secret (list in [`secrets.md`](./secrets.md) §3)
- [ ] `APP_PUBLIC_URL` + build-time `NEXT_PUBLIC_APP_URL` set to `https://app.yourdomain.com`
- [ ] Prisma client set up per the Workers pattern (driver adapter, no global client — [`database.md`](./database.md) §4)
- [ ] `prisma db push --schema=prisma/schema.production.prisma` run over the direct connection
- [ ] `GET https://app.yourdomain.com/api/health` returns 200 (unauthenticated health check)

### Production wiring
- [ ] Stripe webhook endpoint `https://app.yourdomain.com/api/payments/webhook/stripe` registered; `STRIPE_WEBHOOK_SECRET` stored as a Worker secret
- [ ] Razorpay webhook registered (if using Razorpay); `RAZORPAY_WEBHOOK_SECRET` stored
- [ ] Cron scheduler active: Cron Trigger(s) firing (or external pinger) hitting all 15 endpoints with the correct Bearer secret (endpoint + cadence table in [`manual-deployment.md`](./manual-deployment.md) §9)
- [ ] `GMAIL_CRON_API_KEY` set if you schedule `/api/gmail/jobs/process`
- [ ] OTP/magic-link emails arrive from your domain (send test; SPF/DKIM for the sending domain)
- [ ] Backups/PITR enabled on the Postgres provider (inheritance from provider — [`database.md`](./database.md) §7)

### Verification (do all of these before announcing success)
- [ ] **Login works**: sign in with password; then email OTP; then magic link (all three flows exist in the app)
- [ ] **SSE works**: log in, open the notifications bell, trigger a notification from a second browser/session, see it arrive live (this exercises `/api/events/notifications` + heartbeats)
- [ ] **One real workflow run**: execute one end-to-end workflow in the UI without 5xx errors
- [ ] **Discovery works**: run one lead-discovery search (Google Custom Search or SerpAPI key configured)
- [ ] **AI feature works**: submit one AI action (chat/analysis/outreach) and confirm the fallback provider responds
- [ ] **Billing webhook test**: trigger one Stripe test event (e.g., `checkout.session.completed` in test mode) and confirm the app records it
- [ ] **Gmail connect** (if used): connect a Gmail account via OAuth and confirm reply ingestion runs (cron mode or Pub/Sub push)
- [ ] `wrangler tail` shows no unexpected exceptions during the above

---

## 6. File map for this guide

| File | Contents |
| --- | --- |
| [`README.md`](./README.md) | This page — component map, reality check, deployment order, checklist |
| [`architecture.md`](./architecture.md) | What runs on Workers vs stays external; runtime constraint table; rejected options |
| [`prerequisites.md`](./prerequisites.md) | Cloudflare account, plans, domain on Cloudflare DNS, wrangler, API tokens |
| [`manual-deployment.md`](./manual-deployment.md) | The complete step-by-step production deployment (the core file) |
| [`terraform.md`](./terraform.md) | Infrastructure as Code with the `cloudflare` Terraform provider |
| [`networking.md`](./networking.md) | Edge model, DNS, SSL, WAF, caching rules, SSE streaming behavior |
| [`database.md`](./database.md) | External PostgreSQL + Hyperdrive deep dive, Prisma on Workers, migrations |
| [`secrets.md`](./secrets.md) | Workers secrets vs vars, `.dev.vars`, full env-var mapping, rotation |
| [`frontend.md`](./frontend.md) | The Next.js UI on Workers: assets, caching, image optimization, staging, rollback |

Operational companions written in the same style as the other cloud folders (backend/dns-ssl/cicd/monitoring/backups/security/scaling/rollback/troubleshooting) follow the conventions in [`../README.md`](../README.md) §3; where this folder does not yet have a dedicated page, use the matching common doc (e.g. [`../../05-cicd.md`](../05-cicd.md)) plus this guide's manual steps.

---

## 7. Official Documentation

- Cloudflare Workers — https://developers.cloudflare.com/workers/
- Workers Static Assets — https://developers.cloudflare.com/workers/static-assets/
- Hyperdrive — https://developers.cloudflare.com/hyperdrive/
- D1 (documented as **NOT APPLICABLE** for AcquisitionOS — linked for completeness) — https://developers.cloudflare.com/d1/
- R2 — https://developers.cloudflare.com/r2/
- Workers KV — https://developers.cloudflare.com/kv/
- Queues — https://developers.cloudflare.com/queues/
- Durable Objects — https://developers.cloudflare.com/durable-objects/
- Cron Triggers — https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Workers limits (CPU/memory/duration) — https://developers.cloudflare.com/workers/platform/limits/
- DNS — https://developers.cloudflare.com/dns/
- SSL — https://developers.cloudflare.com/ssl/
- WAF — https://developers.cloudflare.com/waf/
- Zero Trust (Access, if you harden admin areas later) — https://developers.cloudflare.com/zero-trust/
- OpenNext Cloudflare adapter (the authoritative source for adapter behavior) — https://opennext.js.org/cloudflare
- Cloudflare Terraform provider — https://registry.terraform.io/providers/cloudflare/cloudflare
- Cloudflare Terraform docs hub — https://developers.cloudflare.com/terraform/
