# Backend on Azure — The API Side of the One Container

There is **no separate backend service** on Azure. The same Container App (`acquisitionos-api`) that renders the UI also serves every `/api/**` route, the SSE streams, and the webhook receivers, in one process on **port 3000** ([`../01-architecture.md`](../01-architecture.md) §1 "one unit, two roles"). This page covers the API-specific configuration: health probes, database connectivity, timeouts, autoscaling, graceful shutdown, deployment strategy, and webhook registration. Variables come from [`manual-deployment.md`](./manual-deployment.md) §0 (`$APP`, `$RG`, `$KV`, …).

---

## 1. One app, two roles

```text
Container App: acquisitionos-api  (external ingress, target port 3000)
  /api/health          -> unauthenticated liveness/readiness source of truth
  /api/**              -> REST API (auth, leads, workflows, billing, ...)
  /api/events/**       -> SSE streams (15-30 s heartbeats)
  /api/cron/**         -> called by the external scheduler (Bearer CRON_SECRET)
  /api/payments/webhook/stripe + /api/payments/webhook/razorpay, /api/gmail/pubsub/webhook, Telegram webhook -> inbound webhooks
```

Do **not** split an `api.` subdomain out of this app "for scale" — the UI renders API data in-process, and splitting would force CORS onto a same-origin app ([`../06-dns-and-domains.md`](../06-dns-and-domains.md) §3). A split is FUTURE/ALTERNATIVE only.

---

## 2. Health probes on `/api/health`

**What:** Container Apps can run three probe types per container — **startup** (is the process ready to accept traffic at all), **readiness** (should this replica receive traffic now), and **liveness** (is this replica wedged and needs a restart). All three should point at **`GET /api/health`**, the only unauthenticated health endpoint (it checks database connectivity, heap memory, and in-process error counts — [`../01-architecture.md`](../01-architecture.md) §1).

**Why (for AcquisitionOS):** probes let the platform restart a replica whose database connection is broken, and stop sending traffic to a replica that is still booting. Keep `/api/health/detailed` and `/api/health/database` out of the probes and out of public reach — they expose richer diagnostics (see [`security.md`](./security.md) §9).

**Portal steps (most reliable path):**

1. Portal → your resource group → Container App `acquisitionos-api` → **Containers** → the container → **Health probes**.
2. Add three probes with: type `HTTP`, path `/api/health`, port `3000`, scheme `HTTP` (TLS terminates at ingress).
3. Suggested timings: **startup** — initial delay 40 s, interval 10 s, failure threshold 12 (matches the Dockerfile HEALTHCHECK start period, ~2 min boot budget); **readiness** — period 30 s, failure threshold 3; **liveness** — period 30 s, initial delay 40 s, failure threshold 3.
4. Save. A new revision is created.

**YAML shape** (for IaC users; the equivalent HCL is in [`terraform.md`](./terraform.md) §4.5):

```yaml
properties:
  template:
    containers:
      - name: acquisitionos
        image: YOUR_ACR_NAME.azurecr.io/acquisitionos:YOUR_SHA
        probes:
          - type: Startup
            httpGet: { path: /api/health, port: 3000, scheme: HTTP }
            initialDelaySeconds: 40
            periodSeconds: 10
            failureThreshold: 12
          - type: Readiness
            httpGet: { path: /api/health, port: 3000, scheme: HTTP }
            periodSeconds: 30
            failureThreshold: 3
          - type: Liveness
            httpGet: { path: /api/health, port: 3000, scheme: HTTP }
            initialDelaySeconds: 40
            periodSeconds: 30
            failureThreshold: 3
```

**CLI:** probe flags on `az containerapp create/update` vary across az versions (NEEDS VERIFICATION — same caveat as [`manual-deployment.md`](./manual-deployment.md) §6.1). Use the portal if flags are rejected, and verify afterwards:

**Verify:**

```bash
az containerapp show -n "$APP" -g "$RG" \
  --query "properties.template.containers[0].probes" -o json   # three probes on /api/health
curl -s "https://app.yourdomain.com/api/health"                 # HTTP 200
```

---

## 3. Environment variables vs Key Vault secretrefs

**What:** non-secret configuration travels as plain env vars; secrets travel as Container App **secrets** whose value is a Key Vault reference (`secretref:`), fetched at start time by the app's **Managed Identity**.

| Kind | Example | How it is set |
| --- | --- | --- |
| Plain env var | `NODE_ENV=production`, `APP_PUBLIC_URL`, `SMTP_HOST`, `LOG_LEVEL` | `--env-vars KEY=VALUE` |
| secretref-backed secret | `DATABASE_URL`, `JWT_SECRET`, `CRON_SECRET`, `STRIPE_SECRET_KEY` | `--secrets name=keyvaultref:...` + `--env-vars KEY=secretref:name` |

**Why:** secrets never sit in the image, Git, or CLI history; rotating a value means updating Key Vault and restarting the revision ([`secrets.md`](./secrets.md) §5–6). The full REQUIRED/OPTIONAL variable inventory maps to vault names in [`secrets.md`](./secrets.md) §3.

**Verify:**

```bash
az containerapp show -n "$APP" -g "$RG" --query "properties.configuration.secrets[].name" -o tsv
az containerapp show -n "$APP" -g "$RG" --query "properties.template.containers[0].env" -o table
```

Env values show `secretref:database-url` etc. — never the values themselves.

---

## 4. Database connectivity from the app

**What the app expects:** two PostgreSQL connection strings, both TLS-enforced:

```text
DATABASE_URL = postgresql://app_user:PASSWORD@pg-acquisitionos.postgres.database.azure.com:5432/acquisitionos?sslmode=require&connection_limit=10
DIRECT_URL   = postgresql://app_user:PASSWORD@pg-acquisitionos.postgres.database.azure.com:5432/acquisitionos?sslmode=require
```

- `DATABASE_URL` is what the **running app** uses; `connection_limit=10` caps Prisma's pool **per replica** (Flexible Server has no built-in pooler — [`database.md`](./database.md) §10).
- `DIRECT_URL` is for schema operations only (`prisma db push`, [`database.md`](./database.md) §11). The running app must still have it defined because `prisma/schema.production.prisma` declares `directUrl`, but nothing in request handling uses it.
- Both stay in Key Vault (`database-url`, `direct-url`) and reach the app via `secretref`.
- **Connection budget** every time you touch replicas or DB size: `replicas × connection_limit + scheduler margin < max_connections × 0.8` ([`database.md`](./database.md) §12, [`../04-database-production.md`](../04-database-production.md) §5).

**Verify:**

```bash
curl -s "https://app.yourdomain.com/api/health" | grep -o '"database":[^}]*}'   # healthy
az postgres flexible-server show -g "$RG" -n "$PG" --query state -o tsv          # Ready
```

---

## 5. CORS — nothing to configure

The UI calls `/api/**` on the **same origin** (one host, one container), so the browser never issues cross-origin requests — no CORS headers, no preflights, first-party cookies only. This is a *feature* of the single-host design ([`frontend.md`](./frontend.md) §6). CORS becomes necessary only in the FUTURE/ALTERNATIVE `api.`-split scenario, and the repo already ships tooling for it (`src/lib/security/cors-config.ts`) — do not enable it speculatively.

**Verify (negative check):** browser devtools → Network — the app's own requests show no `OPTIONS` preflights and no CORS errors.

---

## 6. API/public URL configuration

**The one rule that bites:** URLs the app prints and redirects to are built in `src/lib/app-url.ts` from proxy headers first, then `APP_PUBLIC_URL`, then `NEXT_PUBLIC_APP_URL` ([`../01-architecture.md`](../01-architecture.md) §2.2).

| Variable | Fixed when | Where it lives on Azure |
| --- | --- | --- |
| `APP_PUBLIC_URL` | **Runtime** | Container App env var (change + restart revision, no rebuild) |
| `NEXT_PUBLIC_APP_URL` | **Build time** (inlined into client JS) | `--build-arg` on `az acr build` / `docker build` → baked into the image ([`frontend.md`](./frontend.md) §2) |

**Why it matters for the API:** OAuth callback redirects (`/api/auth/google/callback`), magic-link emails, and webhook-visible URLs all come from this resolution chain. If `APP_PUBLIC_URL` is missing or points at the `azurecontainerapps.io` host, users get links to the wrong domain.

```bash
az containerapp update -n "$APP" -g "$RG" \
  --set-env-vars APP_PUBLIC_URL="https://app.yourdomain.com"    # runtime fix; new revision
```

**Verify:** request a magic link; the email link points at `https://app.yourdomain.com/...` — never `localhost`, the legacy fallback domain, or the default `azurecontainerapps.io` host.

---

## 7. Logging (console → Log Analytics)

**What:** the Next.js process writes structured logs to stdout/stderr; the Container Apps environment ships them to the **Log Analytics workspace** created with it (`log-acquisitionos`, [`manual-deployment.md`](./manual-deployment.md) §5). `LOG_LEVEL` (e.g. `info` in production) controls verbosity.

**Why:** this is your request trail, webhook receiver log, and cron outcome log — no agent to install.

```bash
az containerapp logs show -n "$APP" -g "$RG" --tail 50
az containerapp logs show -n "$APP" -g "$RG" --follow          # live tail during deploys
```

**Expected output:** JSON-ish console lines with timestamps, severity, and message. Query them in KQL (Log Analytics → Logs):

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "acquisitionos-api"
| where Level_s in ("Error", "Critical") or Log_s has "error"
| project TimeGenerated, Level_s, Log_s
| order by TimeGenerated desc
```

(Table/column names vary slightly by schema version — pick fields from the portal's schema pane; more queries in [`monitoring.md`](./monitoring.md) §2.) OpenTelemetry traces/metrics are a separate export path via the `OTEL_*` variables — see [`monitoring.md`](./monitoring.md) §3.

---

## 8. Autoscaling (KEDA scale rules)

**What:** Container Apps autoscales replicas using KEDA rules. The default HTTP scale rule adds replicas as **concurrent requests per replica** crosses a threshold.

**Why min 1 is REQUIRED:** with `--min-replicas 0` the app scales to zero and every live SSE stream (`/api/events/**`) is killed, and the first request after idle pays a cold start ([`architecture.md`](./architecture.md) §3).

```bash
az containerapp update -n "$APP" -g "$RG" \
  --min-replicas 1 --max-replicas 5 \
  --scale-rule-name http-rule --scale-rule-type http --scale-rule-http-concurrency 20
```

(If your az version rejects the scale-rule flags, check `az containerapp update --help` — flag coverage varies; NEEDS VERIFICATION per version. `--min-replicas/--max-replicas` are stable.)

**Expected output:** JSON with `"scale": { "minReplicas": 1, "maxReplicas": 5, ... }`.

**Verify:**

```bash
az containerapp show -n "$APP" -g "$RG" --query properties.template.scale -o json
az containerapp replica list -n "$APP" -g "$RG" -o table    # watch replicas grow under load
```

Start with **HTTP concurrency 20** (conservative for an app whose routes hit PostgreSQL and hold SSE streams); KEDA custom-metrics rules are OPTIONAL and rarely needed at this scale — see [`scaling.md`](./scaling.md) §2 before adding them.

---

## 9. CPU and memory per replica

**What:** each replica gets CPU/RAM from the Container Apps **Consumption** plan. The handbook default for AcquisitionOS:

| Resource | Start | Raise when |
| --- | --- | --- |
| CPU | 0.5–1.0 vCPU | Sustained CPU near limit; slow `next build`-free runtime paths, AI response assembly |
| Memory | 1.0–2.0 Gi | `Working set bytes` approaching the limit; **OOM restarts** (replica "Restart count" > 0 without a deploy) |

```bash
az containerapp update -n "$APP" -g "$RG" --cpu 1.0 --memory 2.0Gi   # new revision
```

**Expected output:** JSON with the new container resources; replicas restart rolling. Monitor via the portal **Metrics** pane (`Usage nano cores`, `Working set bytes`) — alert suggestions in [`monitoring.md`](./monitoring.md) §4. Dedicated workload profiles (more CPU/RAM headroom) are OPTIONAL — [`scaling.md`](./scaling.md) §3.

---

## 10. Timeouts and SSE

**The contract:** `/api/events/**` streams with heartbeats every **15–30 s**; any idle timeout below that breaks the notifications bell ([`../01-architecture.md`](../01-architecture.md) §2.3: LB idle timeout ≥ 120 s, recommend ≥ 120 s at every hop).

- **Container Apps ingress:** heartbeats keep streams well inside platform idle limits. A per-revision HTTP idle-timeout knob is not verified to exist (NEEDS VERIFICATION — same flag as [`architecture.md`](./architecture.md) §3). Do not remove or lengthen the app's heartbeats; they are the keepalive.
- **Front Door (if you added it):** set the origin **response** timeout as high as allowed (up to ~240 s) and disable caching on the SSE routes ([`networking.md`](./networking.md) §6; current maximum and per-route flag names NEEDS VERIFICATION — verify against the Front Door docs).
- **Scheduler routes** (`/api/cron/**`) can take minutes for large batches — the Functions timer (or Container Apps Job) timeout must exceed the slowest endpoint (Function App default timeout is generous; Job `--replica-timeout 300` in [`manual-deployment.md`](./manual-deployment.md) §9.2).

**Verify an SSE stream end to end** ( [`networking.md`](./networking.md) §6): `curl -N` a stream with an auth cookie; a comment/heartbeat line must arrive every 15–30 s, unbuffered.

---

## 11. Request limits

**What:** the ingress forwards request bodies to port 3000; Next.js route handlers apply their own body parsing. Container Apps imposes a platform-level request size limit whose current value is NEEDS VERIFICATION — check the ingress docs before promising large uploads.

**For AcquisitionOS today:** uploads land under `public/` on the container's **ephemeral** filesystem (feedback uploads, invoices — [`../01-architecture.md`](../01-architecture.md) §2.5). Practical guidance:

- Keep request bodies modest; nothing in the current API is designed for multi-hundred-MB uploads.
- Durable/large uploads are the OPTIONAL Blob Storage integration path (FUTURE/ALTERNATIVE until the app gains an adapter — [`backups.md`](./backups.md) §7).

**Verify:** POST a representative-sized payload to a real route and confirm HTTP 200/4xx from the *app* (not 413 from the platform).

---

## 12. Graceful shutdown

**What:** when a revision is replaced or a replica scales in, the platform sends `SIGTERM` and waits a termination grace period before killing the container.

**For AcquisitionOS:** in-flight HTTP requests usually finish; **SSE streams do not drain** — clients are disconnected and *automatically reconnect, replaying missed events with `Last-Event-ID` via `/api/realtime/recover`* (verified app behavior, [`../01-architecture.md`](../01-architecture.md) §2.3). That replay path is your graceful-shutdown story for real-time users; do not add your own retry storm logic on top.

- Long cron requests are the real risk: keep scheduler intervals staggered ([`manual-deployment.md`](./manual-deployment.md) §9) so a restart rarely lands mid-run, and cron endpoints are idempotent by design.
- The template field is `terminationGracePeriodSeconds` (YAML/IaC); CLI flag coverage varies by az version (NEEDS VERIFICATION). Default grace is sufficient when deploys are staggered off cron windows.

**Verify:** during a deploy, watch `az containerapp logs show --follow` — in-flight requests complete or log cleanly; no crash loops.

---

## 13. Deployment strategy (revisions and traffic split)

**What:** Container Apps runs in **multiple revisions mode**: every `az containerapp update` creates a new revision; the old one stays warm and addressable.

**Why (for AcquisitionOS):** a bad deploy is a *traffic-weight* problem, not a redeploy problem — you can send 1% of traffic to the new revision, verify `/api/health` + one login, then shift to 100% ([`../05-cicd.md`](../05-cicd.md) §7).

```bash
# deploy the new image (new revision, 100% by default)
az containerapp update -n "$APP" -g "$RG" --image "$ACR.azurecr.io/acquisitionos:$GIT_SHA"

# optional canary: shift 90/10 old/new, then 0/100 after verification
az containerapp ingress traffic set -n "$APP" -g "$RG" --revision-weight <old-rev>=90 <new-rev>=10
az containerapp ingress traffic set -n "$APP" -g "$RG" --revision-weight <new-rev>=100
```

**Expected output:** JSON showing `properties.configuration.ingress.traffic` with weights per revision.

**Verify:**

```bash
az containerapp ingress traffic show -n "$APP" -g "$RG" -o table
az containerapp revision list -n "$APP" -g "$RG" -o table
```

**Rollback pointer:** reactivating the previous revision is a one-command revert — full procedure in [`rollback.md`](./rollback.md) §2.

---

## 14. Registering inbound webhooks (exact paths)

**What/Why:** Stripe, Razorpay, Google (Gmail push), and Telegram are *configured in the provider's dashboard* to POST to your public HTTPS endpoint. Redeploys never change these URLs (same domain), but the signature secrets they carry must be present in the app.

| Provider | Method + path | Register where | Secret to store |
| --- | --- | --- | --- |
| Stripe | `POST /api/payments/webhook/stripe` | Stripe dashboard → Developers → Webhooks → *Add endpoint* | Signing secret → Key Vault `stripe-webhook-secret` |
| Razorpay | `POST /api/payments/webhook/razorpay` | Razorpay dashboard → Settings → Webhooks | Webhook secret → `razorpay-webhook-secret` |
| Gmail Pub/Sub (OPTIONAL) | `POST /api/gmail/pubsub/webhook` | Google Cloud Pub/Sub push subscription → push URL `GMAIL_PUBSUB_WEBHOOK_URL` | No signature secret; `GMAIL_PUBSUB_*` env vars ([`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §5) |
| Telegram (OPTIONAL) | `POST` webhook URL (set via `setWebhook`) | Telegram Bot API | Token is `TELEGRAM_BOT_TOKEN` in the vault |

Requirements the endpoint side must meet: **public HTTPS** (custom domain + managed certificate, [`dns-ssl.md`](./dns-ssl.md)), reachable **without** login (webhooks are unauthenticated by definition — signature verification *is* the auth), and no edge buffering that delays signature-sensitive bodies.

**Verify (Stripe test event):**

```bash
az containerapp logs show -n "$APP" -g "$RG" --tail 200 | grep -i webhook   # event arrives, 200
```

A Stripe test event appears in the logs and changes app state; an invalid signature yields a 4xx and a log line. Scheduler-side calls to `/api/cron/**` are *outbound* from the Function App — those live in [`cicd.md`](./cicd.md) §8 / [`manual-deployment.md`](./manual-deployment.md) §9.

---

## 15. Backend checklist

```text
[ ] Probes: startup/readiness/liveness on /api/health, port 3000, boot budget ~2 min
[ ] /api/health/detailed and /api/health/database not probed and not public (security.md §9)
[ ] Plain env vars vs secretref split correct; vault names per secrets.md §3
[ ] DATABASE_URL pooled + connection_limit=10; DIRECT_URL present; sslmode=require in both
[ ] APP_PUBLIC_URL (runtime) and NEXT_PUBLIC_APP_URL (build-time) = https://app.yourdomain.com
[ ] LOG_LEVEL set; console logs visible in Log Analytics
[ ] min-replicas 1 (SSE); scale rule HTTP concurrency configured; max 5 to start
[ ] CPU 0.5-1 vCPU / memory 1-2 Gi; no unexplained restarts
[ ] SSE stream verified streaming 15-30 s heartbeats end to end
[ ] Graceful deploy done once: canary 10% -> 100%; rollback path known (rollback.md)
[ ] Stripe + Razorpay webhooks registered and test events processed; Gmail/Telegram if used
```

## 16. Official Documentation

- Container Apps health probes — https://learn.microsoft.com/azure/container-apps/health-probes
- Container Apps scale rules (KEDA) — https://learn.microsoft.com/azure/container-apps/scale-app
- Container Apps revisions & traffic splitting — https://learn.microsoft.com/azure/container-apps/revisions-manage
- Key Vault secrets via secretref — https://learn.microsoft.com/azure/container-apps/manage-secrets
- Container Apps logging / Log Analytics — https://learn.microsoft.com/azure/container-apps/log-monitoring
- Ingress overview (timeouts, transport) — https://learn.microsoft.com/azure/container-apps/ingress-overview
- Prisma connection management — https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/postgresql
- Stripe webhooks — https://docs.stripe.com/webhooks
- Razorpay webhooks — https://razorpay.com/docs/webhooks/
