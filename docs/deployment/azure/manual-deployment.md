# Manual Deployment — AcquisitionOS on Azure, Click by Click

This is the core guide: every command, in order, with what it does, why it exists, expected output, and how to verify. Do the steps in order. Each block is copy-pasteable; lines in `YOUR_...` placeholders must be replaced (each placeholder says where its value comes from).

Portal equivalents are given for the most important steps. If a command fails, the **Verify** line tells you what to check before retrying.

---

## 0. Variables you will use everywhere

**What/Why:** every later step uses these shell variables. Setting them once prevents typos (an ACR name typo creates a *new empty registry*, which is a classic beginner trap).

```bash
# ---- Fill these in -----------------------------------------------------------
export SUBSCRIPTION_ID="YOUR_SUBSCRIPTION_ID"     # Portal → Subscriptions (prerequisites.md §2)
export AZ_LOCATION="eastus2"                      # primary region (prerequisites.md §6)
export RG="rg-acquisitionos"                      # resource group name
export ACR="YOUR_ACR_NAME"                        # 5-50 lowercase alphanumeric, GLOBAL name (e.g. "acqosprodcr")
export PG="pg-acquisitionos"                      # PostgreSQL Flexible Server name (lowercase, hyphens)
export KV="kv-acq-YOUR-INITIALS"                  # Key Vault name: globally unique, lowercase+hyphens
export APP="acquisitionos-api"                    # Container App name
export ENV_NAME="cae-acquisitionos"               # Container Apps environment
export LAW="log-acquisitionos"                    # Log Analytics workspace
export APP_FQDN="app.yourdomain.com"              # your public hostname
# ---- Derived / generated ------------------------------------------------------
export GIT_SHA=$(git rev-parse --short HEAD)
export IMAGE="$ACR.azurecr.io/acquisitionos:$GIT_SHA"
export ACR_LOGIN_SERVER="$ACR.azurecr.io"
```

**Verify:**

```bash
az account set --subscription "$SUBSCRIPTION_ID"
echo "$IMAGE"    # should read YOUR_ACR_NAME.azurecr.io/acquisitionos:<sha>
```

Also generate (do **not** echo them anywhere public):

```bash
export JWT_SECRET=$(openssl rand -hex 32)     # app auth signing key
export CRON_SECRET=$(openssl rand -hex 32)    # protects /api/cron/**
export DB_APP_PASSWORD=$(openssl rand -hex 24)  # app_user DB password
export PG_ADMIN_PASSWORD=$(openssl rand -hex 24) # server admin password
```

---

## 1. Resource group

**What/Why:** one container for every resource; one command deletes the whole experiment.

**Command:**

```bash
az group create --name "$RG" --location "$AZ_LOCATION"
```

**Expected output:** JSON ending in `"provisioningState": "Succeeded"`.

**Verify:** `az group show -n "$RG" --query name -o tsv` prints the name.

---

## 2. Azure Container Registry + build and push the image

**What:** ACR is the private Docker registry; `az acr build` builds **in Azure** from the uploaded source — no local Docker needed.

**Why (for AcquisitionOS):** the Container App will pull `acquisitionos:<git-sha>` from ACR. Tagging by Git SHA makes every deploy traceable ([`../03-docker.md`](../03-docker.md) §1).

> **Before the first build:** the repository must contain `.npmrc` (`legacy-peer-deps=true`) and a `.dockerignore` — both currently missing from the repo and both REQUIRED or the build fails (see [`../03-docker.md`](../03-docker.md) §3).

**Option A — build in Azure (no local Docker):**

```bash
az acr create --resource-group "$RG" --name "$ACR" --sku Basic --location "$AZ_LOCATION"
# Expected output: JSON with provisioningState Succeeded and loginServer "$ACR.azurecr.io"

cd /path/to/acquisitionos        # repository root (Dockerfile lives here)
az acr build --registry "$ACR" \
  --image "acquisitionos:$GIT_SHA" --image "acquisitionos:latest" .
```

**Expected output:** the remote build streams npm/next build logs for ~5–15 minutes and ends with `Successfully built image ... ` listing both tags.

**Option B — build locally, push:**

```bash
az acr login --name "$ACR"       # configures docker login for <ACR>.azurecr.io
docker build -t "$IMAGE" -t "$ACR.azurecr.io/acquisitionos:latest" .
docker push "$IMAGE"
docker push "$ACR.azurecr.io/acquisitionos:latest"
```

**Verify:**

```bash
az acr repository list --name "$ACR" -o tsv                  # shows acquisitionos
az acr repository show-tags --name "$ACR" --repository acquisitionos -o tsv   # shows your SHA
```

---

## 3. Azure Database for PostgreSQL Flexible Server

**What:** the managed PostgreSQL the app connects to via Prisma. Full sizing/backups/pooling deep dive: [`database.md`](./database.md) and [`../04-database-production.md`](../04-database-production.md).

**Why these flags (for AcquisitionOS):** GeneralPurpose 2 vCPU is a realistic production start; storage autogrow prevents write outages; TLS is enforced by default (`sslmode=require` in every connection string); zone-redundant HA doubles cost — start without it and revisit (trade-off in [`database.md`](./database.md) §4).

```bash
az postgres flexible-server create \
  --resource-group "$RG" --name "$PG" --location "$AZ_LOCATION" \
  --tier GeneralPurpose --sku-name Standard_D2ds_v4 \
  --storage-size 128 --storage-autogrow Enabled \
  --version 16 \
  --admin-user pgadmin --admin-password "$PG_ADMIN_PASSWORD" \
  --database-name acquisitionos \
  --backup-retention 14 \
  --geo-redundant-backup Disabled \
  --high-availability Disabled \
  --public-access "$YOUR_IP"      # your current public IP: curl -s https://api.ipify.org
```

**Expected output:** JSON with `state: Ready` (takes 5–10 minutes) and `fullyQualifiedDomainName: "$PG.postgres.database.azure.com"`.

Add the two firewall rules that matter:

```bash
# 1) your machine (for prisma db push / psql) — replace with your IP
az postgres flexible-server firewall-rule create \
  --resource-group "$RG" --name "$PG" \
  --rule-name my-machine --start-ip-address "$YOUR_IP" --end-ip-address "$YOUR_IP"

# 2) allow Azure services (this is how Container Apps reaches a public-access server)
az postgres flexible-server firewall-rule create \
  --resource-group "$RG" --name "$PG" \
  --rule-name azure-services --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0
```

> Networking honesty note: rule 2 permits connections from *any* Azure-origin IP; security rests on TLS + strong passwords. The hardened alternative — VNet-integrated Container Apps + a **private endpoint** for PostgreSQL — is documented in [`networking.md`](./networking.md) §3 (OPTIONAL).

### 3.1 Create the least-privilege application user

**What/Why:** the app must not run as the server admin ([`../04-database-production.md`](../04-database-production.md) §2).

```bash
export PGHOST="$PG.postgres.database.azure.com"
PGPASSWORD="$PG_ADMIN_PASSWORD" psql \
  "host=$PGHOST port=5432 dbname=acquisitionos user=pgadmin sslmode=require" <<'SQL'
CREATE ROLE app_user WITH LOGIN PASSWORD 'REPLACE_WITH_DB_APP_PASSWORD';
GRANT CONNECT ON DATABASE acquisitionos TO app_user;
\c acquisitionos
GRANT USAGE, CREATE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
GRANT USAGE, CREATE ON ALL SEQUENCES IN SCHEMA public TO app_user;
SQL
```

(Swap `REPLACE_WITH_DB_APP_PASSWORD` for `$DB_APP_PASSWORD` before running — do it by editing the heredoc, never by pasting the password into a shell history line.)

**Verify:**

```bash
PGPASSWORD="$DB_APP_PASSWORD" psql \
  "host=$PGHOST port=5432 dbname=acquisitionos user=app_user sslmode=require" -c "select 1;"
```

### 3.2 Record the connection strings

```bash
export DATABASE_URL="postgresql://app_user:${DB_APP_PASSWORD}@${PGHOST}:5432/acquisitionos?sslmode=require&connection_limit=10"
export DIRECT_URL="postgresql://app_user:${DB_APP_PASSWORD}@${PGHOST}:5432/acquisitionos?sslmode=require"
```

These two values go into Key Vault next. `connection_limit=10` is the per-instance Prisma pool cap — see the connection-budget formula in [`database.md`](./database.md) §9.

---

## 4. Key Vault + secrets + Managed Identity access

**What:** Key Vault stores every secret; the app reads them at deploy/start time via its **system-assigned Managed Identity** — no secrets in Git, images, or CLI history ([`secrets.md`](./secrets.md) has the full inventory and rotation).

```bash
az keyvault create --name "$KV" --resource-group "$RG" --location "$AZ_LOCATION" \
  --enable-rbac-authorization true --enable-purge-protection true
# Expected: JSON with vaultUri "https://kv-...vault.azure.net/"
```

Give **yourself** the data-plane role to write secrets (RBAC model requires a data role, not just Owner):

```bash
az role assignment create \
  --assignee "$(az ad signed-in-user show --query id -o tsv)" \
  --role "Key Vault Administrator" \
  --scope "$(az keyvault show -n "$KV" --query id -o tsv)"
```

Wait a few minutes for the role to propagate, then store the core secrets (name mapping: Key Vault names use hyphens, app env vars use underscores):

```bash
az keyvault secret set --vault-name "$KV" --name database-url  --value "$DATABASE_URL"
az keyvault secret set --vault-name "$KV" --name direct-url    --value "$DIRECT_URL"
az keyvault secret set --vault-name "$KV" --name jwt-secret    --value "$JWT_SECRET"
az keyvault secret set --vault-name "$KV" --name cron-secret   --value "$CRON_SECRET"
```

Store the rest of the inventory the same way (`smtp-password`, `stripe-secret-key`, `stripe-webhook-secret`, `razorpay-key-secret`, `razorpay-webhook-secret`, `google-client-secret`, `openai-api-key` …) — the complete grouped list with which are REQUIRED vs OPTIONAL is in [`secrets.md`](./secrets.md) §3 and [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md).

**Verify:**

```bash
az keyvault secret show --vault-name "$KV" --name jwt-secret --query value -o tsv | wc -c   # 65 (64 + newline)
```

---

## 5. Log Analytics workspace + Container Apps environment

**What:** the environment is the shared networking/ingress boundary for Container Apps; Log Analytics collects container console logs.

```bash
az monitor log-analytics workspace create --resource-group "$RG" --workspace-name "$LAW" --location "$AZ_LOCATION"

export LAW_ID=$(az monitor log-analytics workspace show -g "$RG" -n "$LAW" --query customerId -o tsv)
export LAW_KEY=$(az monitor log-analytics workspace get-shared-keys -g "$RG" -n "$LAW" --query primarySharedKey -o tsv)

az containerapp env create \
  --name "$ENV_NAME" --resource-group "$RG" --location "$AZ_LOCATION" \
  --logs-workspace-id "$LAW_ID" --logs-workspace-key "$LAW_KEY"
```

**Expected output:** `"provisioningState": "Succeeded"` after a few minutes.

**Verify:** `az containerapp env list -g "$RG" --query "[].name" -o tsv` shows `cae-acquisitionos`.

VNet integration for the environment is OPTIONAL — see [`networking.md`](./networking.md) §2.

---

## 6. Deploy the app (az containerapp create)

**What:** creates `acquisitionos-api` running the image, external ingress on port 3000, minimum 1 replica, secrets pulled from Key Vault by the Managed Identity and injected as environment variables.

**Why (for AcquisitionOS):** min 1 replica keeps SSE streams alive; `transport auto` accepts both HTTP versions; secret refs mean the app image never contains credentials ([`architecture.md`](./architecture.md) §3–4).

```bash
az containerapp create \
  --name "$APP" --resource-group "$RG" --environment "$ENV_NAME" \
  --image "$IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --system-assigned-identity \
  --target-port 3000 \
  --ingress external --transport auto \
  --min-replicas 1 --max-replicas 5 \
  --secrets \
    jwt-secret="keyvaultref:https://${KV}.vault.azure.net/secrets/jwt-secret,identityref:system" \
    database-url="keyvaultref:https://${KV}.vault.azure.net/secrets/database-url,identityref:system" \
    direct-url="keyvaultref:https://${KV}.vault.azure.net/secrets/direct-url,identityref:system" \
    cron-secret="keyvaultref:https://${KV}.vault.azure.net/secrets/cron-secret,identityref:system" \
  --env-vars \
    NODE_ENV=production \
    APP_PUBLIC_URL=https://$APP_FQDN \
    NEXT_PUBLIC_APP_URL=https://$APP_FQDN \
    DATABASE_URL=secretref:database-url \
    DIRECT_URL=secretref:direct-url \
    JWT_SECRET=secretref:jwt-secret \
    CRON_SECRET=secretref:cron-secret \
    SMTP_HOST=YOUR_SMTP_HOST SMTP_PORT=587 SMTP_USER=YOUR_SMTP_USER \
    SMTP_PASSWORD=secretref:smtp-password SMTP_FROM="AcquisitionOS <notifications@yourdomain.com>" \
    STRIPE_SECRET_KEY=secretref:stripe-secret-key \
    STRIPE_WEBHOOK_SECRET=secretref:stripe-webhook-secret \
    OPENAI_API_KEY=secretref:openai-api-key \
    GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID \
    GOOGLE_CLIENT_SECRET=secretref:google-client-secret
```

Every `secretref:X` above requires the corresponding Key Vault secret to exist first. Add remaining OPTIONAL variables (`REDIS_URL`, `VAPID_*`, `TELEGRAM_BOT_TOKEN`, `OTEL_*`) the same way later — full list in [`secrets.md`](./secrets.md) §3.

Grant the app's identity the two roles it needs (run after create; the identity exists now):

```bash
PRINCIPAL_ID=$(az containerapp show -n "$APP" -g "$RG" --query identity.principalId -o tsv)

az role assignment create --assignee-object-id "$PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal --role "Key Vault Secrets User" \
  --scope "$(az keyvault show -n "$KV" --query id -o tsv)"

az role assignment create --assignee-object-id "$PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal --role "AcrPull" \
  --scope "$(az acr show -n "$ACR" --query id -o tsv)"
```

**Expected output:** JSON role assignments with `provisioningState: Succeeded`. (RBAC propagation can take a few minutes; if the first revision fails to resolve a secretref, wait and run `az containerapp revision restart -n "$APP" -g "$RG"`.)

**Verify:**

```bash
az containerapp show -n "$APP" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv
curl -s "https://$(az containerapp show -n "$APP" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)/api/health"
```

Expect HTTP 200 JSON. `database` will be unhealthy until §7 completes — that is expected. Console logs: `az containerapp logs show -n "$APP" -g "$RG" --follow`.

### 6.1 Health probe on /api/health

**Why:** the platform then restarts unhealthy replicas instead of serving errors. Configure in the portal: Container App → **Containers** → **Health probes** → add an HTTP liveness/readiness probe, path `/api/health`, port 3000, initial delay ~40 s (matches the Dockerfile HEALTHCHECK's start period). CLI probe flags vary across az versions — NEEDS VERIFICATION; use the portal if the flags are rejected.

### 6.2 Updating the app later

```bash
# new image revision
az containerapp update -n "$APP" -g "$RG" --image "$ACR.azurecr.io/acquisitionos:NEW_SHA"
# add/change one env var (creates a new revision)
az containerapp update -n "$APP" -g "$RG" --set-env-vars LOG_LEVEL=info
```

---

## 7. First schema deployment (prisma db push)

**What/Why:** the production database is empty; the app expects 53+ tables. The repo's documented command is `db push` against the PostgreSQL schema ([`../04-database-production.md`](../04-database-production.md) §3). Run it from your machine (firewall rule `my-machine` allows you) or CI — never bake it into the image.

```bash
cd /path/to/acquisitionos
export DIRECT_URL="postgresql://app_user:YOUR_DB_PASSWORD@$PG.postgres.database.azure.com:5432/acquisitionos?sslmode=require"
npx prisma db push --schema=prisma/schema.production.prisma
```

**Expected output:** `The database is now in sync with your Prisma schema.`

**Verify:**

```bash
PGPASSWORD="$DB_APP_PASSWORD" psql "$DIRECT_URL" -c "\dt" | head -20   # tables exist
curl -s "https://$(az containerapp show -n "$APP" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)/api/health"
# "database" now reports healthy
```

If any table already exists with a different shape, **stop** — destructive-change rules are in [`../04-database-production.md`](../04-database-production.md) §6.

---

## 8. Custom domain + TLS (and Front Door, optional)

### 8.1 Azure DNS zone (one-time)

```bash
az network dns zone create --resource-group "$RG" --name yourdomain.com
# At your REGISTRAR: set the nameservers to the NS records shown by:
az network dns record-set ns show --resource-group "$RG" --zone-name yourdomain.com --name "@" --query nsRecords
```

**Verify:** `dig NS yourdomain.com +short` returns the Azure nameservers (allow minutes to 48 h — [`../06-dns-and-domains.md`](../06-dns-and-domains.md)).

### 8.2 Bind the hostname to the Container App

```bash
az containerapp hostname add --name "$APP" --resource-group "$RG" --hostname "$APP_FQDN"
az containerapp show -n "$APP" -g "$RG" \
  --query properties.configuration.ingress.customDomainVerificationId -o tsv
```

Then in Azure DNS create: a **TXT** record named `asuid.$APP_FQDN` with that verification id, and a **CNAME** `app` → the app's default domain (`$APP.azurecontainerapps.io`). Finally bind the **managed certificate**: portal → Container App → **Custom domains** → your hostname → choose *Managed certificate* and wait for state **Issued**. The exact CLI command for managed-cert issuance varies by az version — NEEDS VERIFICATION; the portal path is reliable. Full background: [`networking.md`](./networking.md) §8 and `dns-ssl.md`.

### 8.3 Azure Front Door (OPTIONAL)

Only if you want the global edge/CDN. Essential shape (flags abbreviated — verify with `--help`):

```bash
az afd profile create -g "$RG" --profile-name fd-acquisitionos
az afd endpoint create -g "$RG" --profile-name fd-acquisitionos -n fde-acquisitionos
az afd origin-group create -g "$RG" --profile-name fd-acquisitionos --endpoint-name fde-acquisitionos \
  --origin-group-name og-acquisitionos
az afd origin create -g "$RG" --profile-name fd-acquisitionos --endpoint-name fde-acquisitionos \
  --origin-group-name og-acquisitionos --origin-name cao-origin \
  --host-name "$APP.azurecontainerapps.io" --origin-host-header "$APP.azurecontainerapps.io" \
  --https-port 443 --priority 1 --weight 1000
az afd route create -g "$RG" --profile-name fd-acquisitionos --endpoint-name fde-acquisitionos \
  --route-name route-main --origin-group og-acquisitionos \
  --patterns-to-match "/*" --supported-protocols Https --forwarding-protocol HttpsOnly --caching Disabled
```

`--caching Disabled` matters: the app sets its own `Cache-Control` headers, and SSE routes must never be cached or buffered (see [`networking.md`](./networking.md) §6). Point DNS at the Front Door endpoint, then re-set `APP_PUBLIC_URL` if your public hostname changes.

---

## 9. Scheduler — the 15 cron endpoints (REQUIRED)

The app has **no in-app scheduler**. An external trigger must call these endpoints with `Authorization: Bearer <CRON_SECRET>` ([`../01-architecture.md`](../01-architecture.md) §2.4):

| Endpoint | Suggested cadence |
| --- | --- |
| `/api/cron/process-sequences` | every 5–15 min |
| `/api/cron/sequence-processing` | every 5–15 min |
| `/api/cron/meeting-reminders` | every 5–15 min |
| `/api/cron/process-gmail-replies` | every 5–15 min (skip if Gmail Pub/Sub push configured) |
| `/api/cron/expire-api-keys` | every 15–30 min |
| `/api/cron/hot-lead-scan` | every 15–60 min |
| `/api/cron/autonomous-outreach` | every 15–60 min |
| `/api/cron/sdr-cycle` | every 15–60 min |
| `/api/cron/credit-renewal` | daily, off-peak |
| `/api/cron/end-of-period` | daily, off-peak |
| `/api/cron/renew-subscriptions` | daily, off-peak |
| `/api/cron/payment-reconciliation` | daily, off-peak |
| `/api/payments/process-billing` | daily, off-peak (tune to your billing cycle — NEEDS VERIFICATION) |
| `/api/feedback/retry-emails` | every few hours (tune — NEEDS VERIFICATION) |
| `/api/gmail/jobs/process` | every 5–15 min; protected by `GMAIL_CRON_API_KEY`, not `CRON_SECRET` |

**Method note:** this handbook uses POST; if a route answers 405, that endpoint expects GET — switch per endpoint (NEEDS VERIFICATION per route).

### 9.1 Option A — Azure Functions timer trigger (recommended, simplest)

One Function App, one timer function per cadence bucket, iterating an endpoint list.

`src/functions/cron-bucket/index.js`:

```javascript
const BASE_URL = process.env.APP_PUBLIC_URL;          // https://app.yourdomain.com
const SECRET = process.env.CRON_SECRET;               // Function App setting (can be a Key Vault reference)
const ENDPOINTS = process.env.CRON_ENDPOINTS.split(","); // e.g. "/api/cron/hot-lead-scan,/api/cron/sdr-cycle"

module.exports = async function (context, myTimer) {
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetch(`${BASE_URL}${ep}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SECRET}` },
      });
      context.log(`${ep} -> ${res.status}`);
    } catch (err) {
      context.log.error(`${ep} failed: ${err}`);
    }
  }
};
```

`src/functions/cron-bucket/function.json`:

```json
{
  "bindings": [
    { "name": "myTimer", "type": "timerTrigger", "direction": "in", "schedule": "0 */15 * * * *" }
  ],
  "scriptFile": "../dist/cron-bucket/index.js"
}
```

Notes: Azure NCRONTAB has **six** fields (seconds first). `0 */15 * * * *` = every 15 minutes. Create four buckets (15 min, 30 min, 10 min, daily `0 0 3 * * *`) with the endpoint lists from the table. The Function App's settings: `APP_PUBLIC_URL`, `CRON_SECRET` (set as a Key Vault reference so no secret sits in Function config), `CRON_ENDPOINTS`. On Consumption plans timer triggers work without Always On; prefer the Flex Consumption plan and verify behavior (NEEDS VERIFICATION).

### 9.2 Option B — Container Apps Job (schedule trigger)

A schedule-triggered Job runs a one-shot container per firing — e.g. a `curlimages/curl` image whose shell expands `CRON_SECRET` into the header:

```bash
az containerapp job create \
  --name cron-bucket-15m --resource-group "$RG" --environment "$ENV_NAME" \
  --trigger-type Schedule --cron-expression "0 */15 * * * *" \
  --image "curlimages/curl:latest" \
  --replica-timeout 300 --replica-retry-limit 1 \
  --secrets cron-secret="keyvaultref:https://${KV}.vault.azure.net/secrets/cron-secret,identityref:system" \
  --env-vars CRON_SECRET=secretref:cron-secret
```

The container must run something like `sh -c 'curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://app.yourdomain.com/api/cron/hot-lead-scan'` — configure command/args per `az containerapp job create --help` (exact flag names NEEDS VERIFICATION). One Job per cadence bucket, mirroring §9.1.

**Verify:** after the first firing, `az containerapp logs show -n "$APP" -g "$RG"` (or Function logs) shows the endpoint returning `200`, and `Bearer`-less calls to `/api/cron/hot-lead-scan` return `401`.

---

## 10. Register inbound webhooks (once DNS is live)

- Stripe dashboard → Developers → Webhooks → `https://app.yourdomain.com/api/payments/webhook/stripe`; copy the signing secret into Key Vault as `stripe-webhook-secret` and update the app env var.
- Razorpay → same idea, `razorpay-webhook-secret`.
- Gmail Pub/Sub push (OPTIONAL): `GMAIL_PUBSUB_WEBHOOK_URL=https://app.yourdomain.com/api/gmail/pubsub/webhook`.

**Verify:** send a Stripe test event; it appears in `az containerapp logs show -n "$APP" -g "$RG"` and changes app state.

---

## 11. Final verification checklist

```text
[ ] az acr repository show-tags shows acquisitionos:<sha>
[ ] Flexible Server state Ready; psql as app_user connects with sslmode=require
[ ] Key Vault holds all REQUIRED secrets; app identity has Key Vault Secrets User
[ ] Container App: fqdn resolves; min replicas 1; health probe /api/health configured
[ ] curl https://<fqdn>/api/health -> 200, database healthy
[ ] prisma db push completed; \dt shows tables
[ ] Custom domain bound; managed certificate Issued; APP_PUBLIC_URL correct
[ ] All 15 cron endpoints scheduled; one verified firing with 200
[ ] Stripe test webhook processed
[ ] Login works: password + OTP + magic link; SSE notifications bell streams
[ ] One real workflow run; discovery; one AI feature output
```

When all boxes tick, production is live. Next: [`terraform.md`](./terraform.md) to codify it, `monitoring.md`/`backups.md`/`security.md` for hardening, [`../05-cicd.md`](../05-cicd.md) for CI/CD.
