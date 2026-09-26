# Backend — the API Side of the One Worker

AcquisitionOS has **no separate backend service** ([`../01-architecture.md`](../01-architecture.md) §1): the Next.js 16 app renders UI *and* handles `/api/**` in one unit. On Cloudflare that unit is a single Worker built by the OpenNext adapter ([`./architecture.md`](./architecture.md)). This page covers the **API side** of that same Worker: health checks, environment, database connectivity, logging, limits, background work, deployment strategy, and webhook registration.

`frontend.md` covers the UI side of the same Worker; the two pages share one deployment and one domain.

---

## 1. Health checks — external monitoring, no internal probes

**Label:** `REQUIRED FOR CURRENT ACQUISITIONOS` (the monitoring wiring around them is what you build here)

**What:** the app exposes:

| Endpoint | Auth | Contents | Use it for |
| --- | --- | --- | --- |
| `GET /api/health` | **Unauthenticated** | DB check (`db.user.count()`), heap memory, in-process error counts | Uptime monitoring — the only endpoint a public monitor should hit |
| `GET /api/health/detailed` | none (protect it) | Richer diagnostics | Manual debugging only |
| `GET /api/health/database` | none (protect it) | Database-specific detail | Manual debugging only |

**Why external:** on container clouds a load balancer probes the app on your behalf. On Cloudflare **there is no internal load balancer and no probe mechanism** for a Worker — the platform treats a Worker that fails to start/serve as a per-request error. The equivalent of an LB health check is an **external uptime monitor** (UptimeRobot, Better Stack, Checkly, cron-job.org, ...) that `GET`s `https://app.yourdomain.com/api/health` every 1–5 minutes from one or more regions.

**Command (verify locally first):**

```bash
curl -s https://app.yourdomain.com/api/health
```

**Expected output:** JSON with a healthy status (the shape includes the DB/memory/error summaries; adjust your monitor's assertion to the real body — e.g. check HTTP 200 *and* that the body parses as JSON).

**How to verify the monitor works:** pause the Worker (dashboard → Workers & Pages → acquisitionos → Settings → Disable) for two minutes in a test window, confirm the monitor alerts, re-enable. A monitor you have never seen fire is not a monitor.

### Protect the diagnostic endpoints

**What:** `/api/health/detailed` and `/api/health/database` leak infrastructure detail (DB host identity, memory profile, error counts). Keep them out of public reach.

**Two mechanisms (pick one):**

1. **WAF custom rule** (simplest) — zone → Security → WAF → Custom rules:

   | Field | Value |
   | --- | --- |
   | Expression | `(starts_with(http.request.uri.path, "/api/health/detailed")) or (starts_with(http.request.uri.path, "/api/health/database"))` |
   | Action | Block |

2. **Cloudflare Access** (`OPTIONAL`, needs Zero Trust) — put an email-OTP/SSO gate in front of `/api/health/detailed*` and `/api/health/database*`. Stronger (identity-aware), more setup. See [`security.md`](./security.md) §4.

**Verify:** `curl -s -o /dev/null -w "%{http_code}\n" https://app.yourdomain.com/api/health/detailed` → `403` (WAF block) or a login interstitial (Access), while `/api/health` stays `200`.

---

## 2. Runtime environment: vars vs secrets

**What:** the Worker reads configuration from two sources — plaintext `vars` in `wrangler.jsonc` and encrypted **secrets** via `wrangler secret put` — plus one build-time class (`NEXT_PUBLIC_*`) inlined by `opennextjs-cloudflare build`.

**Why:** the golden rule ([`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §11): if leaking a value is an incident, it is a secret. The complete per-variable mapping lives in [`secrets.md`](./secrets.md) §3 — that table is authoritative; this section only anchors the API-relevant ones.

| Variable (API-relevant) | Storage | Notes |
| --- | --- | --- |
| `APP_PUBLIC_URL` | `vars` (`wrangler.jsonc`) | `https://app.yourdomain.com` — server-side origin for magic links/OAuth ([`../01-architecture.md`](../01-architecture.md) §2.2) |
| `NEXT_PUBLIC_APP_URL` | **Build-time** env (+`vars` harmless) | Must be set when the CI build runs; wrong build-time value = browser code talks to the wrong origin ([`frontend.md`](./frontend.md) §1) |
| `JWT_SECRET`, `CRON_SECRET`, `ENCRYPTION_KEY` | secrets | `openssl rand -hex 32` |
| `DATABASE_URL` (if used as env-var pattern) | secret or Hyperdrive binding | §3 below |
| `RESEND_API_KEY`, `STRIPE_*`, `RAZORPAY_*`, `GOOGLE_*`, AI keys | secrets | Full list: [`secrets.md`](./secrets.md) §3 |
| `LOG_LEVEL`, `OTEL_*` | `vars` | §6–§7 below |
| `AUTH_DEV_MODE` | **unset** | Must be unset/false in production; hard-gated off under `NODE_ENV=production`, but never set it on purpose |

**Command (refresh a runtime var without a rebuild):** edit `vars` in `wrangler.jsonc`, then `npx opennextjs-cloudflare deploy` (or `npx wrangler deploy`).

**Expected output:** a new Worker Version; the var applies to subsequently started isolates. **Verify:** `npx wrangler tail --format pretty` while exercising the affected route; and `npx wrangler secret list` for the secrets inventory.

---

## 3. Database connectivity: Hyperdrive binding + Prisma notes

**Label:** `REQUIRED FOR CURRENT ACQUISITIONOS` — the full deep dive is [`database.md`](./database.md) §3–§5; the API-relevant summary:

1. The Worker binds Hyperdrive (`"hyperdrive": [{ "binding": "HYPERDRIVE", "id": "..." }]` in `wrangler.jsonc`) and the runtime connection string is `env.HYPERDRIVE.connectionString`. Your Postgres provider never learns about Workers directly — Hyperdrive pools connections from Cloudflare's network.
2. Prisma runs with the **driver-adapter pattern** (`@prisma/adapter-pg`, `previewFeatures = ["driverAdapters"]`, no custom generator output, **per-request** client with `maxUses: 1`) — a global pooled client is explicitly unsupported on Workers. Code: [`database.md`](./database.md) §4.
3. Alternative without a code change: point `DATABASE_URL` at the Hyperdrive-hosted string and verify prepared-statement behavior in staging — **`NEEDS VERIFICATION`** (Prisma-on-Workers guidance evolves: https://www.prisma.io/docs/orm/prisma-client/deployment and https://opennext.js.org/cloudflare/howtos/db).
4. **Migrations never run inside the Worker.** `prisma db push` / `migrate` run from CI or your laptop over the **direct** connection (`DIRECT_URL`) — see [`database.md`](./database.md) §5 and [`../04-database-production.md`](../04-database-production.md).

**Verify from the API's perspective:** `curl -s https://app.yourdomain.com/api/health` exercises `db.user.count()` — a 200 with a healthy DB field is the end-to-end proof that Worker → Hyperdrive → Postgres works. For deeper proof while testing, `npx wrangler tail --format pretty` shows query errors verbatim.

---

## 4. CORS: not needed (same origin)

**What:** the browser client and `/api/**` are served from the same origin (`app.yourdomain.com`) — one Worker, one domain ([`frontend.md`](./frontend.md) §6). No CORS configuration exists anywhere in this stack, and none is needed on Cloudflare.

**Why this page repeats it:** the most common API "bug" on this platform is *self-inflicted* — someone adds a permissive `Access-Control-Allow-Origin` at the edge while debugging, or splits `api.` onto a second host. Do neither: cookie-based JWT auth depends on same-origin, and cross-origin looseness is pure attack surface. CORS failures only become possible when you split hosts (see [`./troubleshooting.md`](./troubleshooting.md) "CORS failure").

**Verify:** browser console shows no CORS errors during login, SSE, and API calls.

---

## 5. Logging the API

**What:** three layers, in order of immediacy:

| Layer | What | How |
| --- | --- | --- |
| `wrangler tail` | Live request logs + `console.log`/errors, streamed locally | `npx wrangler tail --format pretty` |
| **Workers Logs** | Persisted, searchable logs in the dashboard (Workers & Pages → acquisitionos → Logs) | Enable `"observability": { "enabled": true }` in `wrangler.jsonc` |
| Logpush (OPTIONAL) | Export logs to R2/destinations for retention | [`monitoring.md`](./monitoring.md) §6 |

**Command:**

```bash
npx wrangler tail --format pretty                       # everything
npx wrangler tail --format pretty --status error        # only failed requests
npx wrangler tail --format pretty --search "webhook"    # filter by sampling+search
```

**Expected output:** one line per request (`GET /api/health 200 ...`) plus any `console.*` output and exceptions from your handlers. Keep it open during smoke tests ([`manual-deployment.md`](./manual-deployment.md) §12).

**Verify:** trigger `GET /api/health` in another terminal; the request appears within seconds. If it does not, see [`./troubleshooting.md`](./troubleshooting.md) "Logs unavailable".

---

## 6. Limits the API actually runs into (per plan)

**What:** the Worker runtime's hard ceilings. The full honest table with sources is [`./architecture.md`](./architecture.md) §2 — the API-relevant rows:

| Limit | Value (at the time of writing — `NEEDS VERIFICATION` at https://developers.cloudflare.com/workers/platform/limits/) | API impact |
| --- | --- | --- |
| CPU time per request | Free: 10 ms · Paid: 30 s default (5 min max configurable) | SSR + Prisma + bcrypt auth routinely exceed 10 ms → **Workers Paid effectively required** |
| Memory per isolate | 128 MB | Large fan-out responses / big payloads: watch for 1102 (memory exceeded) |
| Simultaneous outbound connections | 6 per request | A handler that concurrently opens DB + AI + email + search can brush this |
| Subrequests per invocation | Free: 50 · Paid: higher cap (figures per [`./architecture.md`](./architecture.md) §2 — `NEEDS VERIFICATION`) | Batch endpoints (discovery, outreach) fan out to external APIs |
| Worker bundle size | 64 MiB compressed (`NEEDS VERIFICATION`) | Surfaced at build/deploy time, not runtime |
| Wall-clock duration | Unlimited while the client stays connected (streaming) — `NEEDS VERIFICATION` per plan | SSE lives or dies here (§7) |
| Cron scheduled handler | 15 min CPU/wall time | Generous headroom for the dispatcher fetches ([`cicd.md`](./cicd.md) §8) |

**Why CPU matters more than on containers:** CPU time is *billed and capped*; time waiting on Postgres/AI is not. A slow query costs latency, not CPU. bcrypt hashing and AI response assembly are the CPU-heavy spots — measure them once in staging via `wrangler tail`.

**Verify:** run one login, one SSE connection, one AI action in staging with `npx wrangler tail --format pretty` open; note any `Exceeded CPU` / `1101` / `1102` errors (decode them in [`./troubleshooting.md`](./troubleshooting.md)).

---

## 7. Scaling model for the API

**What:** Workers scale **automatically per request** — there are no instances to size, no min/max replicas, no warm-up pool you own. Each request runs in an isolate; isolates are created/evicted freely.

**The one nuance for AcquisitionOS — SSE connection math:**

- Each `/api/events/**` stream is **one long-lived request** occupying an isolate (mostly idle between 15–30 s heartbeats). Idle streams are cheap, but the "multi-instance" concern from container clouds becomes a **per-isolate** concern here: two SSE clients may land on isolates that do not share the in-process event bus.
- Same mitigation as every other platform: optional `REDIS_URL` (Upstash) fans events out across isolates — `OPTIONAL`, same code path ([`../01-architecture.md`](../01-architecture.md) §2.3).
- Duration: heartbeats keep streams alive; documented wall-time is unlimited-while-connected at the time of writing — **`NEEDS VERIFICATION` per plan** before you promise long-lived dashboards.

**Verify:** open the notifications bell in two browsers for >10 minutes across many heartbeats ([`manual-deployment.md`](./manual-deployment.md) §13.1); with Redis configured, confirm an event triggered on one isolate's request path still arrives on the other's stream.

Deeper: [`./scaling.md`](./scaling.md).

---

## 8. Background work and graceful completion (`ctx.waitUntil`)

**What:** the Workers primitive for "respond now, finish work without the client": `ctx.waitUntil(promise)` keeps the invocation alive until the promise settles.

**Why (for this app):** the OpenNext-generated Worker already uses this internally where Next.js needs it. You encounter `ctx.waitUntil` directly in the two pieces of *your* infrastructure: the cron-dispatcher's `scheduled()` handler ([`manual-deployment.md`](./manual-deployment.md) §9 — every endpoint fetch is wrapped in `ctx.waitUntil(...)` so a slow downstream response is not cut off) and any custom Worker code you add later.

**Rule of thumb:** never fire-and-forget a promise in Worker code — an un-awaited promise is killed when the runtime considers the invocation done. Wrap it in `ctx.waitUntil`.

**Verify (dispatcher):** `curl "http://localhost:8787/__scheduled?cron=*/30+*+*+*+*"` under `wrangler dev`, then check the dispatcher's own tail shows each path logged with its status code.

**Graceful shutdown:** there is no "drain connections" phase like a container stop. During deploys, in-flight requests finish and new requests hit the new version; SSE clients re-establish automatically via `EventSource` retry and replay missed events through `/api/realtime/recover` (`Last-Event-ID` — [`../01-architecture.md`](../01-architecture.md) §2.3). Deploying during peak is therefore survivable by design — but still schedule deploys off-peak.

---

## 9. Deployment strategy and rollback (pointer)

**What:** every deploy creates an immutable **Worker Version**. Options beyond plain `opennextjs-cloudflare deploy`:

- **Gradual Deployments / version traffic splitting** (dashboard or `wrangler versions` flows): shift a percentage of traffic to a new version before going all-in. Whether the full gradual-deploy feature set works cleanly with the OpenNext adapter bundle is **`NEEDS VERIFICATION`** — test it in staging; the fallback is deploy-to-staging-Worker-first (always safe).
- **Rollback:** instant, via dashboard or `wrangler rollback` / `wrangler versions rollback` (exact subcommand names vary by wrangler version — `NEEDS VERIFICATION`). Full runbook: [`./rollback.md`](./rollback.md) §2.

**Verify:** deploy a cosmetic change; `npx wrangler versions list` shows the new version ID; roll back; confirm the old behavior returns within seconds ([`frontend.md`](./frontend.md) §8 does this exercise).

---

## 10. Webhook registration (exact paths)

**What:** inbound webhooks are plain HTTPS POSTs that hit the Worker like any other request — no special platform wiring. Signature verification runs inside the handlers, exactly as on container clouds. Register these in each provider's dashboard **after** the Custom Domain is live ([`./dns-ssl.md`](./dns-ssl.md)):

| Provider | Register this URL | Method | Secret stored as |
| --- | --- | --- | --- |
| Stripe | `https://app.yourdomain.com/api/payments/webhook/stripe` | POST | `STRIPE_WEBHOOK_SECRET` (wrangler secret) |
| Razorpay | `https://app.yourdomain.com/api/payments/webhook/razorpay` | POST | `RAZORPAY_WEBHOOK_SECRET` |
| Google Pub/Sub (Gmail push, OPTIONAL) | `https://app.yourdomain.com/api/gmail/pubsub/webhook` (set as `GMAIL_PUBSUB_WEBHOOK_URL`) | POST | per [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §5 |
| Telegram (OPTIONAL) | `https://app.yourdomain.com/api/telegram/webhook` (set as `TELEGRAM_WEBHOOK_URL`) | POST | `TELEGRAM_BOT_TOKEN` |

> **Path note (verified in the repository):** the current code exposes per-provider handlers at `/api/payments/webhook/stripe` and `/api/payments/webhook/razorpay` (`src/app/api/payments/webhook/*/route.ts`) — there is no single `/api/payments/webhook` route. Register the exact per-provider path and confirm with a test event.

**Why signatures still work:** the provider signs the raw body; the Worker receives that body unmodified (no proxy re-encryption, no buffering rewrite for POSTs). Verify HMAC in-handler as usual.

**Command (test):**

```bash
stripe trigger checkout.session.completed        # from the Stripe CLI, test mode
npx wrangler tail --format pretty                # in another terminal
```

**Expected output:** `POST /api/payments/webhook/stripe 200` in the tail (or the razorpay path for Razorpay), and the billing UI reflects the event. **Verify:** the provider's dashboard shows a `200` delivery; a `400`/`401` usually means a signing-secret mismatch ([`./troubleshooting.md`](./troubleshooting.md) "Webhook failure").

**Exempt webhooks from WAF challenges:** provider IPs must not be challenged or deliveries bounce — [`networking.md`](./networking.md) §6 and [`security.md`](./security.md) §3.

---

## 11. Official Documentation

- Workers limits (CPU/memory/duration/subrequests) — https://developers.cloudflare.com/workers/platform/limits/
- Workers observability / tail — https://developers.cloudflare.com/workers/observability/logs/workers-logs/ and https://developers.cloudflare.com/workers/wrangler/commands/#tail
- Handlers and `waitUntil` — https://developers.cloudflare.com/workers/runtime-apis/handlers/ and https://developers.cloudflare.com/workers/runtime-apis/context/
- Workers Versions & gradual deployments — https://developers.cloudflare.com/workers/configuration/versions-and-deployments/
- Secrets — https://developers.cloudflare.com/workers/configuration/secrets/
- OpenNext Cloudflare adapter (authoritative for app behavior) — https://opennext.js.org/cloudflare
- Webhook contracts (verified in repo) — `src/app/api/payments/webhook/*/route.ts`, `src/app/api/gmail/pubsub/webhook/route.ts`, `src/app/api/telegram/webhook/route.ts`, `src/app/api/health/**`
- Shared operational docs — [`../01-architecture.md`](../01-architecture.md), [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md), [`../05-cicd.md`](../05-cicd.md)
