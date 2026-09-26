# Manual Deployment — AcquisitionOS on Cloudflare Workers

The core guide: every step from "I have a Cloudflare account" to "production serves real users", with commands, expected output, and verification. Read [`./README.md`](./README.md) §3 (reality check) and [`./architecture.md`](./architecture.md) §2 (constraints) first — this page does not re-argue them.

**Conventions:** replace every `UPPERCASE_PLACEHOLDER` with your real value. Where each value comes from is stated next to the command. Secrets never go into `wrangler.jsonc`, Git, or screenshots (see [`secrets.md`](./secrets.md)).

---

## 0. Set your working variables

**What:** shell exports used by every later step.
**Why:** copy-paste safety — commands below reference these names.

```bash
export CF_ACCOUNT_ID="YOUR_CLOUDFLARE_ACCOUNT_ID"   # Dashboard → Workers & Pages → right sidebar (also `wrangler whoami`)
export APP_DOMAIN="app.yourdomain.com"              # Your Custom Domain (prerequisites.md §2)
export DB_HOST="your-db-host.provider.com"          # From your managed Postgres provider (§1)
export DB_USER="app_user"                           # Least-privilege user (NOT the instance superuser)
export DB_PASSWORD="YOUR_DB_PASSWORD"               # From the provider console; keep in a password manager
```

(The Worker is named `acquisitionos`; the database is `acquisitionos`; the app URL is `https://app.yourdomain.com` — used literally below.)

**Verify:** `echo "$CF_ACCOUNT_ID $APP_DOMAIN"` prints both values.

---

## 1. Create the external PostgreSQL database

**Label:** `REQUIRED FOR CURRENT ACQUISITIONOS`
**What:** a managed PostgreSQL 14+ instance at a database provider.
**Why:** AcquisitionOS is Prisma + PostgreSQL (53+ models, `prisma/schema.production.prisma`). The database **does not live on Cloudflare** — D1 is explicitly not applicable ([`architecture.md`](./architecture.md) §4). Any managed Postgres works: Neon or Supabase (serverless-friendly, common with Hyperdrive), Amazon RDS, Google Cloud SQL, or Azure Flexible Server. The repository's own comments document Supabase usage, so Supabase/Neon are the smoothest first choices; the steps below are provider-agnostic.

**Command:** create the project/database in your provider's dashboard or CLI; record `DB_HOST`, `DB_USER`, `DB_PASSWORD`; ensure TLS is enforced (most managed providers require `sslmode=require`).

**How to verify (from your local machine — the direct connection):**

```bash
psql "postgresql://app_user:YOUR_DB_PASSWORD@your-db-host.provider.com:5432/acquisitionos?sslmode=require" -c "select version();"
```

**Expected output:** one row starting with `PostgreSQL 14...` (or newer). If this fails, nothing later will work — fix connectivity/TLS first.

Full guidance (pooling, backup, restore): [`../../04-database-production.md`](../04-database-production.md) and [`database.md`](./database.md).

---

## 2. Generate the application secrets

**What:** the random secrets the app requires.
**Why:** the app validates `JWT_SECRET`, and the cron endpoints require `CRON_SECRET`; defaults are dev-only ([`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §1).

```bash
export JWT_SECRET="$(openssl rand -hex 32)"
export CRON_SECRET="$(openssl rand -hex 32)"
export ENCRYPTION_KEY="$(openssl rand -hex 32)"
echo "$JWT_SECRET" | pbcopy 2>/dev/null || true   # or print/record each into your password manager
```

**Expected output:** three 64-hex-char values. **Record them now** — you will store them with `wrangler secret put` in §4.

---

## 3. Create the Hyperdrive config

**Label:** `REQUIRED FOR CURRENT ACQUISITIONOS`
**What:** a Hyperdrive configuration that points at your external Postgres. Hyperdrive pools connections close to the Worker and caches eligible read queries.
**Why:** Workers open connections from Cloudflare's network to your database; Hyperdrive keeps those connections warm and pooled so per-request latency and provider connection limits stay sane ([`database.md`](./database.md) §3).

**Command (from the project root, with wrangler logged in):**

```bash
npx wrangler hyperdrive create acquisitionos-pg \
  --connection-string="postgresql://app_user:YOUR_DB_PASSWORD@your-db-host.provider.com:5432/acquisitionos?sslmode=require"
```

- `acquisitionos-pg` — the config name you will reference in `wrangler.jsonc` (§5).
- The connection string is the **origin** (direct) Postgres string from §1. Hyperdrive stores it server-side; it does not go into your repo.

**Expected output:** JSON/SDK-style confirmation containing an **`id`** (a 32-hex string) — copy it: `export HYPERDRIVE_ID="PASTE_THE_ID_HERE"` (used in §5).

**How to verify:**

```bash
npx wrangler hyperdrive list
```

Expected: your `acquisitionos-pg` config listed with its id. Notes:

- Migrations and `prisma db push` do **not** go through Hyperdrive — they use the direct connection (`DIRECT_URL`). See §8 and [`database.md`](./database.md) §5.
- Caching behavior (`--caching-disabled`, `--max-age`) is configurable; defaults are documented at https://developers.cloudflare.com/hyperdrive/.

---

## 4. Store the application secrets

**Label:** `REQUIRED` — the full inventory is in [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md); the Workers-specific mapping is in [`secrets.md`](./secrets.md).
**What/why:** `wrangler secret put` stores an encrypted value attached to the Worker (per environment); anything secret must never be plaintext config — non-secret runtime values go in `wrangler.jsonc` `vars` (§5). Use the secrets generated in §2.

**Command (run each; you will be prompted to paste the value — or pipe it in):**

```bash
printf "%s" "$JWT_SECRET" | npx wrangler secret put JWT_SECRET
printf "%s" "$CRON_SECRET" | npx wrangler secret put CRON_SECRET
printf "%s" "$DB_PASSWORD" | npx wrangler secret put DB_PASSWORD
# DATABASE_URL: prefer the Hyperdrive binding pattern (§5-§7 + database.md §4); only the
# env-var pattern alternative would store it here as a secret.
```

```bash
# --- Email: Resend HTTP API is the recommended path on Workers (see §13 caveat 3) ---
printf "%s" "YOUR_RESEND_API_KEY" | npx wrangler secret put RESEND_API_KEY
# If you must try SMTP instead (NOT recommended on Workers — §13):
# printf "%s" "YOUR_SMTP_PASSWORD" | npx wrangler secret put SMTP_PASSWORD
printf "%s" "sk_live_YOUR_STRIPE_SECRET_KEY" | npx wrangler secret put STRIPE_SECRET_KEY
printf "%s" "whsec_YOUR_STRIPE_WEBHOOK_SECRET" | npx wrangler secret put STRIPE_WEBHOOK_SECRET
printf "%s" "YOUR_RAZORPAY_KEY_SECRET" | npx wrangler secret put RAZORPAY_KEY_SECRET
printf "%s" "YOUR_RAZORPAY_WEBHOOK_SECRET" | npx wrangler secret put RAZORPAY_WEBHOOK_SECRET
printf "%s" "GOCSPX-YOUR_CLIENT_SECRET" | npx wrangler secret put GOOGLE_CLIENT_SECRET
printf "%s" "YOUR_GOOGLE_API_KEY" | npx wrangler secret put GOOGLE_API_KEY
printf "%s" "YOUR_GOOGLE_SEARCH_API_KEY" | npx wrangler secret put GOOGLE_SEARCH_API_KEY
printf "%s" "YOUR_OPENAI_API_KEY" | npx wrangler secret put OPENAI_API_KEY   # at least one AI fallback REQUIRED

# --- OPTIONAL (only if used) ---
printf "%s" "YOUR_UPSTASH_REDIS_URL" | npx wrangler secret put REDIS_URL      # multi-instance SSE fan-out
printf "%s" "YOUR_GMAIL_CRON_KEY" | npx wrangler secret put GMAIL_CRON_API_KEY # protects /api/gmail/jobs/process
printf "%s" "YOUR_SERPAPI_KEY" | npx wrangler secret put SERPAPI_KEY           # alternative discovery provider
printf "%s" "YOUR_VAPID_PUBLIC_KEY" | npx wrangler secret put VAPID_PUBLIC_KEY
printf "%s" "YOUR_VAPID_PRIVATE_KEY" | npx wrangler secret put VAPID_PRIVATE_KEY
printf "%s" "YOUR_TELEGRAM_BOT_TOKEN" | npx wrangler secret put TELEGRAM_BOT_TOKEN
printf "%s" "YOUR_ENCRYPTION_KEY" | npx wrangler secret put ENCRYPTION_KEY
```

**Expected output per command:** `Success! Uploaded secret JWT_SECRET` (wrangler may print an additional progress line; wording varies by version).

**How to verify:**

```bash
npx wrangler secret list
```

Expected: every name above with a populated `timestamp`. Also run the app's own validation: `GET /api/health` after §7 — the app flags missing critical env ([`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §1 notes).

> Secrets are stored **per Worker**; if you deploy a separate staging Worker (`--name acquisitionos-staging`), repeat `wrangler secret put` for it (ideally with staging values) — see [`frontend.md`](./frontend.md) §7.

---

## 5. Write `wrangler.jsonc` (the Worker configuration)

**What:** the declarative config wrangler deploys with: entry point, compatibility settings, bindings, and plain (non-secret) variables.
**Why:** this is the Cloudflare equivalent of the task definition / deployment manifest on other clouds. The shape below follows the OpenNext get-started config (https://opennext.js.org/cloudflare) — `main` and `assets` are adapter conventions and should not be renamed.

**Command:** create `wrangler.jsonc` in the project root:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "acquisitionos",
  "main": ".open-next/worker.js",                 // OpenNext output — do not change
  "compatibility_date": "2024-09-23",             // >= date required by the adapter; check opennext.js.org/cloudflare
  "compatibility_flags": [
    "nodejs_compat",                              // REQUIRED for Node-API surface (jose, bcryptjs, Prisma)
    "global_fetch_strictly_public"                // recommended by the adapter get-started guide
  ],
  "assets": {
    "directory": ".open-next/assets",             // Workers Assets: _next/static + public files
    "binding": "ASSETS"
  },
  "services": [
    { "binding": "WORKER_SELF_REFERENCE", "service": "acquisitionos" } // adapter-internal; name must match "name"
  ],
  "hyperdrive": [
    { "binding": "HYPERDRIVE", "id": "PASTE_THE_ID_FROM_STEP_3" }      // binds env.HYPERDRIVE
  ],
  "vars": {
    // Non-secret RUNTIME values only — secrets live in wrangler secrets (§4).
    "APP_PUBLIC_URL": "https://app.yourdomain.com",
    "NEXT_PUBLIC_APP_URL": "https://app.yourdomain.com",  // build-time inlined: also set in CI (secrets.md §5)
    "LOG_LEVEL": "info",
    "NODE_ENV": "production"
  }
  // OPTIONAL: "r2_buckets": [ { "binding": "NEXT_INC_CACHE_R2_BUCKET", "bucket_name": "acquisitionos-cache" } ]
}
```

**How to verify:** `npx wrangler deploy --dry-run` (after §6/§7 installs the adapter and builds) parses the config without deploying; it should report the worker, bindings, and assets directory. Fix every warning about unknown bindings before deploying. (`wrangler.toml` is equivalent if you prefer TOML; this guide uses `wrangler.jsonc` because the OpenNext docs do.)

---

## 6. Integrate the OpenNext adapter (one-time app integration)

**Label:** `REQUIRED FOR CURRENT ACQUISITIONOS` — and note honestly: **this is a change you make to the application** (devDependency + config files). The handbook documents it; it does not silently modify your app. Review https://opennext.js.org/cloudflare/get-started for the authoritative current steps and the `npx @opennextjs/cloudflare migrate` shortcut before doing this by hand.

**What:** install the adapter and add its config files.
**Why:** the adapter transforms the Next.js build output into a Worker bundle; without it there is no Workers deployment of a Node-runtime Next.js app ([`architecture.md`](./architecture.md) §2).

**(a) Install (devDependency — it is a build tool):**

```bash
npm install --save-dev @opennextjs/cloudflare@latest
```

**(b) `package.json` scripts** (the repo's existing `"build"` script already runs `prisma generate && next build`; the adapter invokes that build itself):

```json
"scripts": {
  "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
  "deploy:cf": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
  "cf-typegen": "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts"
}
```

**(c) `open-next.config.ts`** in the project root (optional but the standard shape; the R2 incremental-cache override applies only if you add the R2 binding in §5):

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
// import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default defineCloudflareConfig({
  // incrementalCache: r2IncrementalCache,
});
```

**(d) `.dev.vars`** in the project root (local preview values; **gitignored — never commit**):

```text
NEXTJS_ENV=development
```

**(e) Prisma + Next.js adjustments for Workers** (from https://opennext.js.org/cloudflare/howtos/db — full explanation in [`database.md`](./database.md) §4):

- `prisma/schema.production.prisma` generator: add `previewFeatures = ["driverAdapters"]`; do **not** set a custom `output` directory (OpenNext patches the generated client).
- `next.config.ts`: `serverExternalPackages` already includes `@prisma/client`; add `".prisma/client"` to the same array.
- `src/lib/db.ts`: switch from a global client to the per-request `PrismaPg` adapter pattern with `maxUses: 1` (code in [`database.md`](./database.md) §4). This is an application-code change — keep the current global pattern working for Docker/local runs if you maintain both paths (e.g., environment-conditional initialization), and run `npm test` after the change.

**Expected output:** `npm ls @opennextjs/cloudflare` shows the installed version; the files above exist and `.open-next` is in `.gitignore` (the adapter outputs there).

---

## 7. Build, preview locally, deploy

**Why:** the three-stage loop — build the Worker bundle, exercise it locally in the real runtime, deploy.

**Command 1 — build:**

```bash
npx opennextjs-cloudflare build
```

Expected: the Next.js build runs (Prisma generate → `next build`), then the adapter emits `.open-next/worker.js` and `.open-next/assets/`. Failures here are usually the Node-API caveats from §13 — read the log, fix, rebuild.

**Command 2 — local preview in the Workers runtime:**

```bash
npx wrangler dev
```

Expected: a local server on `http://localhost:8787` running your app **inside workerd** (not Node). **Verify:** open `http://localhost:8787/api/health` → `{"status":"ok",...}`; log in locally if you configured local `.dev.vars` values for the database. This is the closest local analogue to production and catches most adapter issues cheaply.

**Command 3 — deploy:**

```bash
npx opennextjs-cloudflare deploy        # equivalent to: opennextjs-cloudflare build && wrangler deploy
```

Expected output ends with a deployed URL like `https://acquisitionos.YOUR_SUBDOMAIN.workers.dev`.

**How to verify (remote):**

```bash
curl -s https://acquisitionos.YOUR_SUBDOMAIN.workers.dev/api/health
npx wrangler tail --format pretty     # live logs; keep it open while you test
```

> The `*.workers.dev` URL works before DNS is set up. Email/OAuth/webhook flows that validate exact origins will only fully work after §10 attaches `app.yourdomain.com`.

---

## 8. Push the production schema (direct connection — not through Hyperdrive)

**Label:** `REQUIRED`
**What:** `prisma db push` creates/updates the PostgreSQL schema from `prisma/schema.production.prisma`.
**Why:** Prisma migrations need a direct, prepared-statement-capable connection (`directUrl`); pooled/proxied connections through Hyperdrive are for **runtime queries**, not migrations ([`database.md`](./database.md) §5, [`../../04-database-production.md`](../04-database-production.md)).

**Command (from local machine or CI — never from inside the Worker):**

```bash
export DIRECT_URL="postgresql://app_user:YOUR_DB_PASSWORD@your-db-host.provider.com:5432/acquisitionos?sslmode=require"
export DATABASE_URL="$DIRECT_URL"    # db push itself uses the direct URL too
npx prisma db push --schema=prisma/schema.production.prisma
```

**Expected output:** `The database is now in sync with your Prisma schema.`

**How to verify:**

```bash
psql "$DIRECT_URL" -c "\dt" | head    # expect 50+ tables (users, leads, workflows, ...)
curl -s https://acquisitionos.YOUR_SUBDOMAIN.workers.dev/api/health/database  # richer check; keep this route protected
```

---

## 9. Schedule the 15 cron endpoints (Workers Cron Triggers)

**Label:** `REQUIRED FOR CURRENT ACQUISITIONOS`
**What/why:** the app has no internal scheduler; 15 HTTP endpoints must be called with `Authorization: Bearer <CRON_SECRET>` (one, `/api/gmail/jobs/process`, uses `GMAIL_CRON_API_KEY`) — full list in [`../01-architecture.md`](../01-architecture.md) §2.4. The simple, recommended Cloudflare path is a **tiny dedicated "cron dispatcher" Worker**: its `scheduled()` handler (driven by `triggers.crons`) fetches the main app's own cron URLs over HTTPS — it keeps OpenNext's generated worker untouched and survives app redeploys. An external uptime pinger (cron-job.org, GitHub Actions schedule, ...) is the equally valid zero-code alternative.

**Endpoints and cadences** (tune to your usage; §2.4 of [`../01-architecture.md`](../01-architecture.md) is the source):

| Endpoint | Suggested cadence |
| --- | --- |
| `/api/cron/process-sequences`, `/api/cron/sequence-processing`, `/api/cron/meeting-reminders` | every 5–15 min |
| `/api/cron/expire-api-keys`, `/api/cron/hot-lead-scan` | every 15–30 min |
| `/api/cron/autonomous-outreach`, `/api/cron/sdr-cycle` | every 15–60 min |
| `/api/cron/process-gmail-replies` | every 5–15 min (skip if Gmail Pub/Sub push configured) |
| `/api/cron/credit-renewal`, `/api/cron/end-of-period`, `/api/cron/renew-subscriptions`, `/api/cron/payment-reconciliation`, `/api/payments/process-billing`, `/api/feedback/retry-emails` | daily (off-peak) |
| `/api/gmail/jobs/process` | every 5–15 min (GMAIL_CRON_API_KEY) |

Free-plan accounts allow only 5 Cron Triggers per account (Paid: 250 — at the time of writing; `NEEDS VERIFICATION`), so **batch endpoints into grouped schedules** as below rather than one trigger per endpoint.

**Command:** create a small separate directory `cron-dispatcher/` (outside the Next.js app) with `wrangler.jsonc`:

```jsonc
{
  "name": "acquisitionos-cron",
  "main": "src/index.js",
  "compatibility_date": "2024-09-23",
  "triggers": { "crons": ["*/10 * * * *", "*/30 * * * *", "0 3 * * *"] }, // 5–15min / 15–60min / daily groups
  "vars": { "APP_BASE_URL": "https://app.yourdomain.com" }
}
```

and `src/index.js`:

```js
const GROUPS = {
  "*/10 * * * *": ["/api/cron/process-sequences", "/api/cron/sequence-processing", "/api/cron/meeting-reminders"],
  "*/30 * * * *": ["/api/cron/expire-api-keys", "/api/cron/hot-lead-scan", "/api/cron/autonomous-outreach", "/api/cron/sdr-cycle"],
  "0 3 * * *":    ["/api/cron/credit-renewal", "/api/cron/end-of-period", "/api/cron/renew-subscriptions", "/api/cron/payment-reconciliation", "/api/payments/process-billing", "/api/feedback/retry-emails"],
};

export default {
  async scheduled(controller, env, ctx) {
    const paths = GROUPS[controller.cron] ?? [];
    ctx.waitUntil(Promise.all(paths.map(async (p) => {
      const res = await fetch(`${env.APP_BASE_URL}${p}`, {
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      });
      console.log(p, res.status);
    })));
  },
};
```

Then:

```bash
cd cron-dispatcher
npx wrangler secret put CRON_SECRET          # same value as the main app's
npx wrangler deploy
```

**Expected output:** `Uploaded acquisitionos-cron` + the schedule echoed back. Changes to cron schedules can take up to ~15 minutes to propagate (documented at https://developers.cloudflare.com/workers/configuration/cron-triggers/).

**How to verify:**

```bash
npx wrangler dev
curl "http://localhost:8787/__scheduled?cron=*/30+*+*+*+*"    # trigger the scheduled handler locally
npx wrangler tail --name acquisitionos                        # then watch the main app's logs
```

Also verify the endpoints reject unauthenticated calls: `curl -i https://app.yourdomain.com/api/cron/process-sequences` → `401`. Advanced alternative: integrating `scheduled()` into the OpenNext Worker itself via its custom-worker override (https://opennext.js.org/cloudflare/howtos/custom-worker) — `NEEDS VERIFICATION` against current adapter docs; the dispatcher above is simpler and sufficient.

---

## 10. Attach the Custom Domain + Universal SSL

**What/why:** a Workers **Custom Domain** serves the Worker on `app.yourdomain.com` with an automatically issued Universal SSL certificate; OAuth redirect URIs, webhooks, cookies, and `APP_PUBLIC_URL` all expect the real domain ([`../06-dns-and-domains.md`](../06-dns-and-domains.md)).

**Command (dashboard: Workers & Pages → acquisitionos → Settings → Domains & Routes → Add → Custom Domain → `app.yourdomain.com`), or declaratively in `wrangler.jsonc`:**

```jsonc
"routes": [ { "pattern": "app.yourdomain.com", "custom_domain": true } ]
```

then `npx opennextjs-cloudflare deploy` (or `npx wrangler deploy`) again.

**Expected output:** the domain appears under the Worker's Domains & Routes with status **Active**; the DNS record is created for you with proxy enabled (orange cloud).

**How to verify:**

```bash
curl -sI https://app.yourdomain.com/api/health | head -5   # HTTP/2 200, TLS valid
curl -s https://app.yourdomain.com/api/health
```

Certificate details (issuer "Google Trust Services", universal-ssl): check the padlock in the browser. ACM options and edge/TLS policy: [`networking.md`](./networking.md) §3–4.

---

## 11. Register the payment webhooks

**What/why:** point Stripe/Razorpay at the public webhook URL so billing state changes reach the app ([`../01-architecture.md`](../01-architecture.md) §1 — webhooks are inbound).

**Steps:**

1. Stripe Dashboard → Developers → Webhooks → **Add endpoint**: `https://app.yourdomain.com/api/payments/webhook/stripe`; subscribe to checkout/subscription/invoice events; copy the signing secret (`whsec_...`) into `wrangler secret put STRIPE_WEBHOOK_SECRET` (§4).
2. Razorpay Dashboard → Settings → Webhooks: same URL; set the secret into `RAZORPAY_WEBHOOK_SECRET`.
3. **Verify reachability through the Worker:** Stripe/Razorpay POST plain HTTPS — Workers with Custom Domains accepts this normally. Send a test event and watch `npx wrangler tail` for the `POST /api/payments/webhook/stripe 200` line.

**Webhook test (Stripe CLI):**

```bash
stripe trigger checkout.session.completed
```

Expected: delivery `200` in the dashboard; the app records the event (billing UI reflects it).

---

## 12. Verification checklist (production)

- [ ] `https://app.yourdomain.com/api/health` → 200
- [ ] **Login**: password sign-in works; **email OTP** code arrives (Resend path); **magic link** click logs you in
- [ ] **SSE notifications bell**: trigger a notification from a second session; it appears live; connection stays open across heartbeats (15–30 s)
- [ ] **One real workflow run** completes without 5xx
- [ ] **Discovery** search returns results (Google CSE or SerpAPI key active)
- [ ] **AI feature** responds (fallback provider key active — the built-in primary is sandbox-wired)
- [ ] **Billing webhook** test event delivered with `200`
- [ ] **Gmail connect** (if used): OAuth connect succeeds; cron or Pub/Sub ingestion runs
- [ ] All 15 cron endpoints return 200 when invoked with `Bearer $CRON_SECRET` (spot-check several; unauthenticated → 401)
- [ ] `npx wrangler tail` clean during all of the above; `wrangler secret list` matches [`secrets.md`](./secrets.md) §3

---

## 13. OpenNext caveats you must explicitly test

Honest list — the known risk areas of running this app on Workers; test each in staging before go-live and record findings in the troubleshooting pointers in [`frontend.md`](./frontend.md) §9.

1. **SSE notifications** (`/api/events/**`): streaming is supported and (at the time of writing) HTTP wall-time is unlimited while the client stays connected (`NEEDS VERIFICATION` per plan — https://developers.cloudflare.com/workers/platform/limits/). Confirm heartbeats keep the stream alive > 5 minutes and that `Last-Event-ID` replay (`/api/realtime/recover`) works after a reconnect. Cache bypass for `/api/*` is required — [`networking.md`](./networking.md) §7.
2. **PDF invoice generation** (`pdfkit` + Node streams — `src/lib/invoice-pdf-service.ts`): `nodejs_compat` covers `node:stream`, but real-world pdfkit behavior on Workers is `NEEDS VERIFICATION` — generate one invoice in staging. If it fails, the honest fallbacks are: generate invoices on a scheduled job outside Workers, move invoice generation to a container-based path (`FUTURE/ALTERNATIVE` — Cloudflare Containers, `NEEDS VERIFICATION`), or pre-render invoice PDFs at payment time and store them in R2.
3. **Outbound email via nodemailer SMTP**: raw SMTP conversations from Workers are unreliable/undocumented territory. The app already supports **Resend** — prefer `RESEND_API_KEY` (HTTP API) on this platform. If you need SMTP, use a provider with an HTTPS send API. Do not skip the OTP login test either way.
4. **`next/image` optimization**: not automatic on Workers (sharp-like processing). Decide between the Cloudflare Images binding, an external loader, or `images.unoptimized = true` — trade-offs in [`frontend.md`](./frontend.md) §4.
5. **Prisma runtime**: per-request client with `@prisma/adapter-pg` + Hyperdrive binding ([`database.md`](./database.md) §4). Test a write-heavy page (workflows) and a read-heavy page (analytics) under real load; watch `wrangler tail` for connection errors.
6. **Worker size + CPU**: the app is large and bcrypt-hashing is CPU-billed; if build/deploy warns about size limits (64 MiB at the time of writing — `NEEDS VERIFICATION`), consult the adapter's size guidance (https://opennext.js.org/cloudflare). Measure login CPU in `wrangler tail` — the Paid plan gives ample headroom, Free does not.

Next: [`terraform.md`](./terraform.md) for the same resources as code, [`networking.md`](./networking.md) for WAF/cache/header behavior, [`secrets.md`](./secrets.md) for hygiene and rotation, [`../../05-cicd.md`](../05-cicd.md) + [`frontend.md`](./frontend.md) §8 for CI/CD.
