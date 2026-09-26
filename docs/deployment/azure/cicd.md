# CI/CD on Azure — GitHub Actions to ACR + Container Apps

The pipeline this page documents: **test → build image → push to ACR → `prisma db push` → deploy revision → health check → (optionally) roll back**. Branch strategy, OIDC principles, environment protection, and anti-patterns live in the shared chapter [`../05-cicd.md`](../05-cicd.md) — this page is the Azure-specific deploy job. IaC pipelines (`terraform plan/apply`) are in [`terraform.md`](./terraform.md) §7; the two can share one OIDC credential.

---

## 1. Prerequisites (one-time)

### 1.1 OIDC login — no static Azure secrets in GitHub

**What:** GitHub Actions obtains short-lived Azure tokens by exchanging its own OIDC token through `azure/login@v2` — no service-principal password ever exists to leak.

**Why:** [`../05-cicd.md`](../05-cicd.md) §3 lists static cloud keys as the first anti-pattern; [`terraform.md`](./terraform.md) §7.1 already set this up for Terraform — reuse the same app registration if you like, with a federated credential per GitHub environment.

```bash
# App registration + service principal (skip if done in terraform.md §7.1)
APP_ID=$(az ad app create --display-name "github-acquisitionos" --query appId -o tsv)
OBJECT_ID=$(az ad sp create --id "$APP_ID" --query id -o tsv)

# Federated credential bound to the repo (add one per GitHub Environment as needed)
az ad app federated-credential create --id "$APP_ID" --parameters '{
  "name": "gh-production",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:YOUR_ORG/YOUR_REPO:environment:production",
  "audiences": ["api://AzureADTokenExchange"]
}'

# Least privilege: Contributor on the deployment resource group ONLY (not Owner, not subscription-wide)
az role assignment create \
  --assignee-object-id "$OBJECT_ID" --assignee-principal-type ServicePrincipal \
  --role Contributor \
  --scope "/subscriptions/YOUR_SUBSCRIPTION_ID/resourceGroups/rg-acquisitionos"
```

(`YOUR_ORG/YOUR_REPO` from the GitHub URL; `YOUR_SUBSCRIPTION_ID` from Portal → Subscriptions or `az account show`.)

GitHub repo → Settings → Secrets → Actions → store **non-secret identifiers**: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`.

**Verify:** a tiny workflow running `azure/login@v2` + `az account show` prints the subscription.

### 1.2 Runner access to Key Vault (for the migration step, §3)

The deploy job reads `DIRECT_URL` from Key Vault at run time, so the same service principal also needs the data-plane role:

```bash
az role assignment create \
  --assignee-object-id "$OBJECT_ID" --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" \
  --scope "$(az keyvault show -n "$KV" --query id -o tsv)"
```

(`$KV` = your vault name from [`manual-deployment.md`](./manual-deployment.md) §0; the runtime app's identity keeps its own separate `Key Vault Secrets User` assignment — [`secrets.md`](./secrets.md) §4.)

---

## 2. Build + push the image to ACR

**What:** build the Next.js standalone image per commit and tag it with the Git SHA — one immutable artifact per commit ([`../05-cicd.md`](../05-cicd.md) §1).

**Why SHA tags:** every deploy and rollback refers to a known image; `latest` tells you nothing during an incident ([`../03-docker.md`](../03-docker.md) §1).

**Option A — build in the runner, push via OIDC login** (keeps `docker build` + trivy in the workflow):

```yaml
      - uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
      - uses: azure/docker-login@v1
        with:
          login-server: ${{ vars.ACR_LOGIN_SERVER }}        # e.g. acqosprodcr.azurecr.io
      - run: |
          docker build \
            --build-arg NEXT_PUBLIC_APP_URL=https://app.yourdomain.com \
            -t ${{ vars.ACR_LOGIN_SERVER }}/acquisitionos:${GITHUB_SHA::7} .
          docker push ${{ vars.ACR_LOGIN_SERVER }}/acquisitionos:${GITHUB_SHA::7}
      - run: trivy image --exit-code 1 --severity CRITICAL \
            ${{ vars.ACR_LOGIN_SERVER }}/acquisitionos:${GITHUB_SHA::7}
```

**Option B — `az acr build`** (build in Azure; no local Docker in the runner):

```bash
az acr build --registry acqosprodcr \
  --build-arg NEXT_PUBLIC_APP_URL=https://app.yourdomain.com \
  --image acquisitionos:${GITHUB_SHA::7} .
```

The `--build-arg NEXT_PUBLIC_APP_URL` matters: it is a **build-time** variable ([`frontend.md`](./frontend.md) §2); a staging build gets `https://staging.yourdomain.com`. The repo needs `.npmrc` + `.dockerignore` present or the build fails ([`../03-docker.md`](../03-docker.md) §3).

**Verify:** `az acr repository show-tags --name acqosprodcr --repository acquisitionos -o tsv` shows the new SHA tag.

---

## 3. Migration step — `prisma db push` from the runner

**What:** fetch `DIRECT_URL` from Key Vault inside the runner, then apply the production schema — the repo's documented production path ([`../04-database-production.md`](../04-database-production.md) §3–4).

```yaml
      - uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
      - name: Fetch DIRECT_URL from Key Vault
        run: |
          DIRECT_URL=$(az keyvault secret show --vault-name "$KV_NAME" \
            --name direct-url --query value -o tsv)
          echo "::add-mask::$DIRECT_URL"
          echo "DIRECT_URL=$DIRECT_URL" >> "$GITHUB_ENV"
        env: { KV_NAME: kv-acq-YOUR-INITIALS }
      - name: Apply schema
        run: npx prisma db push --schema=prisma/schema.production.prisma
        env: { DIRECT_URL: ${{ env.DIRECT_URL }} }
```

(`add-mask` keeps the URL out of logs. The `direct-url` secret name is the vault key from [`manual-deployment.md`](./manual-deployment.md) §4. The runner must also be able to reach PostgreSQL — with the handbook's firewall setup, that means allowing the runner's egress or running the step via a self-hosted runner in Azure; simplest is `--public-access` + a firewall rule for the runner, or the private-endpoint path of [`networking.md`](./networking.md) §3.)

**Rules from the shared chapter** ([`../05-cicd.md`](../05-cicd.md) §6): migrations run once per deploy, sequentially (never two jobs in parallel — use the `concurrency` guard §5); `db push` **or** `migrate deploy`, never both; a failed migration **fails the deploy** and stops there — do not auto-retry destructive operations.

**Verify:** step log ends `The database is now in sync with your Prisma schema.` and the app's `/api/health` reports `database` healthy.

---

## 4. Deploy step — new Container Apps revision

**Option A — the dedicated action:**

```yaml
      - uses: azure/container-apps-deploy-action@v2
        with:
          containerAppName: acquisitionos-api
          resourceGroup: rg-acquisitionos
          imageToDeploy: ${{ vars.ACR_LOGIN_SERVER }}/acquisitionos:${{ github.sha }}
```

(Exact inputs per action version — check the action's README in your pin; version-specific input names NEEDS VERIFICATION.)

**Option B — plain CLI (no third-party action semantics to learn):**

```bash
az containerapp update -n acquisitionos-api -g rg-acquisitionos \
  --image acqosprodcr.azurecr.io/acquisitionos:${GITHUB_SHA::7}
```

Both create a **new revision**; the old one stays addressable for instant rollback ([`backend.md`](./backend.md) §13, [`rollback.md`](./rollback.md) §2). Canary/traffic-split deploys are a strict improvement once you are comfortable — see [`backend.md`](./backend.md) §13.

**Verify:** `az containerapp ingress traffic show -n acquisitionos-api -g rg-acquisitionos` shows the new revision active.

---

## 5. Health check + rollback job

**What:** after deploy, the workflow itself verifies `/api/health` and fails — loudly — if the app did not come up.

```yaml
      - name: Health check
        run: |
          for i in $(seq 1 12); do
            if curl -fsS "https://app.yourdomain.com/api/health" | grep -q '"database"'; then
              echo "healthy"; exit 0
            fi
            sleep 10
          done
          echo "App failed health check after deploy" && exit 1
```

(Adjust the `grep` to the real `/api/health` JSON shape once and keep it strict — [`../05-cicd.md`](../05-cicd.md) §7.)

A failed check should page a human **and** offer the one-command revert — wire the automated variant as a second job:

```yaml
  rollback:
    needs: deploy-production
    if: failure()
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: azure/login@v2
        with: { client-id: '${{ secrets.AZURE_CLIENT_ID }}', tenant-id: '${{ secrets.AZURE_TENANT_ID }}', subscription-id: '${{ secrets.AZURE_SUBSCRIPTION_ID }}' }
      - name: Re-activate previous revision
        run: |
          az containerapp revision list -n acquisitionos-api -g rg-acquisitionos -o table
          az containerapp ingress traffic set -n acquisitionos-api -g rg-acquisitionos \
            --revision-weight <previous-revision>=100
```

Full rollback theory: [`rollback.md`](./rollback.md).

---

## 6. GitHub Environments — staging and production

Per [`../05-cicd.md`](../05-cicd.md) §2/§5, in repo Settings → Environments:

1. **`staging`** — auto-deploys on every `main` push; no reviewers.
2. **`production`** — **required reviewers** (you), deployable branch restricted to `main`, optional deploy window.
3. **Concurrency guard** so two deploys cannot race:

```yaml
concurrency:
  group: production-deploy
  cancel-in-progress: false
```

4. Add one federated credential per environment on the Azure app registration (`...:environment:staging`, §1.1) so each job can only log in for its own environment.

---

## 7. Reference workflow (complete shape)

```yaml
name: ci-cd
on:
  push: { branches: [main] }
  pull_request:

permissions:
  id-token: write     # OIDC
  contents: read

jobs:
  test:               # lint + vitest + prisma generate (see ../05-cicd.md §4)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx prisma generate
      - run: npm run lint && npm test

  deploy-staging:
    if: github.ref == 'refs/heads/main'
    needs: test
    runs-on: ubuntu-latest
    environment: staging
    steps: [ ...azure/login@v2, build+push (§2, staging build-arg), db push (§3), deploy (§4), health check staging.yourdomain.com (§5) ... ]

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production          # required reviewers configured (§6)
    concurrency: { group: production-deploy, cancel-in-progress: false }
    steps: [ ...same steps against production names, health check app.yourdomain.com... ]

  rollback:
    needs: deploy-production
    if: failure()
    steps: [ ...previous revision to 100% (§5)... ]
```

Branch protection (`main`: PRs + reviews, no force pushes) — recap in [`../05-cicd.md`](../05-cicd.md) §2; Terraform pipelines gated the same way in [`terraform.md`](./terraform.md) §7.2.

---

## 8. The scheduler is one-time infrastructure (not part of CI)

**What:** the 15 cron endpoints are fired by an **Azure Functions timer trigger** (the handbook's choice, [`manual-deployment.md`](./manual-deployment.md) §9.1; Container Apps Job is the alternative, §9.2). It is created **once** and is untouched by application deploys ([`../05-cicd.md`](../05-cicd.md) §8).

**Why not CI:** schedules are not versioned app state; only the app's endpoints change per deploy. The Function just POSTs URLs with `Authorization: Bearer <CRON_SECRET>`.

One-time creation + settings:

```bash
az storage account create -g "$RG" -n acqosfuncstorage --location "$AZ_LOCATION" --sku Standard_LRS
az functionapp create -g "$RG" -n func-acquisitionos-cron \
  --storage-account acqosfuncstorage --consumption-plan-location "$AZ_LOCATION" \
  --runtime node --functions-version 4 --os-type Linux

az functionapp config appsettings set -g "$RG" -n func-acquisitionos-cron --settings \
  APP_PUBLIC_URL=https://app.yourdomain.com \
  CRON_SECRET="@Microsoft.KeyVault(SecretUri=https://$KV.vault.azure.net/secrets/cron-secret)" \
  CRON_ENDPOINTS="/api/cron/process-sequences,/api/cron/sequence-processing,/api/cron/meeting-reminders"
```

(The Key Vault reference requires the Function's Managed Identity to hold `Key Vault Secrets User` on the vault — same pattern as the app, [`secrets.md`](./secrets.md) §4. Exact Key Vault-reference syntax support per Functions version NEEDS VERIFICATION; plain `az keyvault secret show` at setup time is the fallback.)

The timer function code (iterating `CRON_ENDPOINTS`, sending the Bearer header) is in [`manual-deployment.md`](./manual-deployment.md) §9.1 — four cadence buckets, Azure NCRONTAB with six fields (seconds first).

**Cadences (start here, tune to usage — full table with NEEDS VERIFICATION items in [`manual-deployment.md`](./manual-deployment.md) §9):**

| Function bucket (NCRONTAB) | Endpoints |
| --- | --- |
| `0 */10 * * * *` | `/api/cron/process-sequences`, `/api/cron/sequence-processing`, `/api/cron/meeting-reminders` |
| `0 */15 * * * *` | `/api/cron/process-gmail-replies` (skip if Gmail Pub/Sub push configured), `/api/gmail/jobs/process` (`GMAIL_CRON_API_KEY`) |
| `0 */30 * * * *` | `/api/cron/expire-api-keys` |
| `0 0 */1 * * *` hourly bucket | `/api/cron/hot-lead-scan`, `/api/cron/autonomous-outreach`, `/api/cron/sdr-cycle` |
| `0 0 3 * * *` daily off-peak | `/api/cron/credit-renewal`, `/api/cron/end-of-period`, `/api/cron/renew-subscriptions`, `/api/cron/payment-reconciliation`, `/api/payments/process-billing` |
| every few hours | `/api/feedback/retry-emails` (cadence tune — NEEDS VERIFICATION) |

Bucket overlap is harmless (endpoints are idempotent), but stagger the daily bucket away from deploys and DB maintenance windows ([`database.md`](./database.md) §6).

**Verify:**

```bash
az functionapp logs tail -g "$RG" -n func-acquisitionos-cron     # first firing
az containerapp logs show -n "$APP" -g "$RG" --tail 200 | grep "cron"   # 200s in app logs
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "https://app.yourdomain.com/api/cron/hot-lead-scan"     # 401 without the Bearer header
```

Webhooks (Stripe/Razorpay/Gmail/Telegram) are likewise registered once, not per deploy — [`backend.md`](./backend.md) §14.

---

## 9. CI/CD checklist

```text
[ ] OIDC: app registration + federated credential(s), Contributor scoped to rg-acquisitionos (never Owner)
[ ] GitHub secrets: AZURE_CLIENT_ID / AZURE_TENANT_ID / AZURE_SUBSCRIPTION_ID (identifiers only)
[ ] SP also has Key Vault Secrets User for the migration step; DIRECT_URL masked in logs
[ ] Image tagged with git SHA; NEXT_PUBLIC_APP_URL build-arg per environment
[ ] trivy (or equivalent) gates the build (CRITICAL -> fail)
[ ] prisma db push single-flight via concurrency guard; failed migration stops the deploy
[ ] Health check after deploy; automatic previous-revision rollback job on failure
[ ] Environments: staging (auto) + production (required reviewers, main only)
[ ] Scheduler Function App + 15 endpoints verified firing with 200; Bearer-less calls get 401
[ ] Webhook URLs registered once and independent of deploys
```

## 10. Official Documentation

- `azure/login` (OIDC) — https://github.com/Azure/login
- `azure/container-apps-deploy-action` — https://github.com/Azure/container-apps-deploy-action
- Connect GitHub Actions to Azure — https://learn.microsoft.com/azure/developer/github/connect-from-azure
- Container Apps deploy from CI — https://learn.microsoft.com/azure/container-apps/github-actions
- `az acr build` (Tasks quick reference) — https://learn.microsoft.com/azure/container-registry/container-registry-tutorial-quick-task
- Functions timer triggers + NCRONTAB — https://learn.microsoft.com/azure/azure-functions/functions-bindings-timer
- Shared pipeline principles — [`../05-cicd.md`](../05-cicd.md)
