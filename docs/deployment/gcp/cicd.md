# GCP CI/CD — GitHub Actions with Workload Identity Federation

This is the GCP-specific half of the pipeline defined in [`../../05-cicd.md`](../05-cicd.md). That page owns the cross-cloud pieces (pipeline shape, branch strategy, environments, anti-patterns); this page gives the exact GCP wiring: Workload Identity Federation (no static keys), build + push to Artifact Registry, `gcloud run deploy`, the `prisma db push` step, health verification, a rollback job, and the one-time Cloud Scheduler setup.

> This handbook does **not** add CI to your repository — it documents the pipeline for you to add when ready. Commands below assume the manual deploy of [`manual-deployment.md`](./manual-deployment.md) already exists.

---

## 1. The GCP pipeline at a glance

```text
push to main
  → test (lint + vitest + prisma generate)          ← identical on every cloud: 05-cicd.md §4
  → build & push image: REGION-docker.pkg.dev/.../acquisitionos:<sha>
  → deploy-staging (Cloud Run, environment: staging)
       curl https://staging.yourdomain.com/api/health
  → deploy-production (environment: production, required reviewers)
       prisma db push (DIRECT_URL from Secret Manager)
       gcloud run deploy --image <sha>
       curl https://app.yourdomain.com/api/health
  → on failure: redeploy previous tag (rollback job, §7)
```

One immutable image per commit; the same `sha` tag promotes staging → production; humans gate production. `REQUIRED FOR CURRENT ACQUISITIONOS` once more than one person ships code.

---

## 2. One-time GCP setup — Workload Identity Federation (WIF)

**What:** GitHub's OIDC token exchange: your workflow presents a GitHub-issued token; GCP exchanges it for short-lived credentials of a service account you designate. **Why:** no `KEY_JSON` secret in GitHub — static service-account keys are the #1 CI credential leak (see [`security.md`](./security.md) §2 and [`../../05-cicd.md`](../05-cicd.md) §3).

### 2a. Create the deployer service account — least privilege

**What:** one SA only CI uses. **Why:** it can push images and update Cloud Run; it cannot touch billing, delete SQL instances, or edit IAM.

```bash
export PROJECT_ID="YOUR_PROJECT_ID"          # gcloud config get-value project
export REGION="us-central1"                  # the region used everywhere else
export REPO_NAME="acquisitionos"             # Artifact Registry repo (manual-deployment.md step 5)
export RUNTIME_SA="acquisitionos-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
export DEPLOY_SA="github-deployer"           # new, CI-only

gcloud iam service-accounts create "$DEPLOY_SA" --display-name="GitHub Actions deployer"

for ROLE in roles/run.admin roles/artifactregistry.writer roles/secretmanager.secretAccessor roles/cloudsql.client; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com" --role="$ROLE"
done
# Expected output per role: Updated policy [projects/YOUR_PROJECT_ID].

# Deploying impersonates the runtime SA (Cloud Run acts as it):
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

| Role | Why it is needed | What it must NOT include |
| --- | --- | --- |
| `roles/run.admin` | create/update Cloud Run revisions | no `roles/editor` (primitive roles are over-grants) |
| `roles/artifactregistry.writer` | push images | |
| `roles/secretmanager.secretAccessor` | resolve `--set-secrets`, fetch `DIRECT_URL` | |
| `roles/cloudsql.client` | run the Cloud SQL Auth Proxy for `db push` | no `roles/cloudsql.admin` |
| `roles/iam.serviceAccountUser` on the runtime SA | deploy as the runtime SA | |

### 2b. Create the pool + GitHub OIDC provider

```bash
gcloud iam workload-identity-pools create github-pool \
  --project="$PROJECT_ID" --location="global" --display-name="GitHub pool"

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --project="$PROJECT_ID" --location="global" \
  --workload-identity-pool="github-pool" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='YOUR_GH_ORG/YOUR_REPO'"
# Expected output: Created workload identity pool provider [github-provider].
```

> `--attribute-condition` restricts the exchange to **your repository** — without it, any GitHub repo that can mint a token could try. This condition is `REQUIRED FOR CURRENT ACQUISITIONOS` in any shared organization.

### 2c. Allow the pool to impersonate the deployer

```bash
gcloud iam service-accounts add-iam-policy-binding \
  "${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/YOUR_GH_ORG/YOUR_REPO"
```

Where to get the numbers: `PROJECT_NUMBER` — `gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)'`; org/repo — from the GitHub URL.

**Verify the whole chain later** by running the workflow's `auth` step; a policy error there names the missing binding (see [`troubleshooting.md`](./troubleshooting.md) §secret-role).

---

## 3. Build + push job

**What:** build the same Dockerfile from [`../../03-docker.md`](../03-docker.md) and push it tagged with the Git SHA. **Why:** the SHA tag is the unit of promotion, verification, and rollback ([`rollback.md`](./rollback.md) §2).

```yaml
# .github/workflows/deploy.yml — GCP jobs (the `test` job is in 05-cicd.md §4)
env:
  PROJECT_ID: YOUR_PROJECT_ID
  REGION: us-central1
  IMAGE: us-central1-docker.pkg.dev/YOUR_PROJECT_ID/acquisitionos/acquisitionos

jobs:
  build-push:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    outputs: { sha: "${{ github.sha }}" }
    permissions: { contents: read, id-token: write }   # id-token: write = OIDC, REQUIRED
    steps:
      - uses: actions/checkout@v4
      - id: auth
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider
          service_account: github-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com
      - uses: google-github-actions/setup-gcloud@v2
      - run: gcloud auth configure-docker us-central1-docker.pkg.dev --quiet
      - run: docker build -t "$IMAGE:${GITHUB_SHA::7}" .
      - run: docker push "$IMAGE:${GITHUB_SHA::7}"
      # Optional but recommended (05-cicd.md §1): image scan before push
      - run: |
          curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
          trivy image --exit-code 1 --severity CRITICAL --ignore-unfixed "$IMAGE:${GITHUB_SHA::7}"
```

> `NEEDS VERIFICATION`: pin action versions (`@v2` shown) to the current major, and the OIDC token's `aud`/credential-lifetime behavior per the `google-github-actions/auth` docs — both evolve.

---

## 4. Deploy job (staging, then production)

```yaml
  deploy-staging:
    needs: build-push
    runs-on: ubuntu-latest
    environment: staging                       # GitHub Environment: no reviewers required
    permissions: { contents: read, id-token: write }
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider
          service_account: github-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com
      - uses: google-github-actions/setup-gcloud@v2
      - run: |
          gcloud run deploy acquisitionos-staging \
            --region "$REGION" \
            --image "$IMAGE:${GITHUB_SHA::7}" \
            --min-instances 1 --no-cpu-throttling --timeout 3600 --port 3000 \
            --set-secrets=DATABASE_URL=DATABASE_URL:latest,DIRECT_URL=DIRECT_URL:latest,JWT_SECRET=JWT_SECRET:latest,CRON_SECRET=CRON_SECRET:latest
      - run: curl -fsS https://staging.yourdomain.com/api/health | grep -q '"status":"ok"'

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production                    # REQUIRED REVIEWERS configured in GitHub (05-cicd.md §5)
    permissions: { contents: read, id-token: write }
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2   # same provider/SA as above
        with: { ... }
      - uses: google-github-actions/setup-gcloud@v2
      - run: gcloud secrets versions access latest --secret=DIRECT_URL > /tmp/direct_url   # for §5
      - run: ../path/to/cloud-sql-proxy steps below → prisma db push (§5)
      - run: |
          gcloud run deploy acquisitionos \
            --region "$REGION" \
            --image "$IMAGE:${GITHUB_SHA::7}" \
            --set-secrets=DATABASE_URL=DATABASE_URL:latest,DIRECT_URL=DIRECT_URL:latest,JWT_SECRET=JWT_SECRET:latest,CRON_SECRET=CRON_SECRET:latest
      - run: curl -fsS https://app.yourdomain.com/api/health | grep -q '"status":"ok"'
```

Notes:

- `--set-secrets` list shown short for readability — carry the **full** list from [`manual-deployment.md`](./manual-deployment.md) step 11 ([`secrets.md`](./secrets.md) §4).
- Keep every other service flag (`--min-instances`, `--no-cpu-throttling`, `--timeout`, `--set-env-vars`) in the deploy command so CI and the live service cannot drift. If you adopt the LB, add `--ingress=internal-and-cloud-load-balancing` ([`networking.md`](./networking.md) §3).
- Health-check shape: adjust the grep once against real `/api/health` output and keep it strict ([`../../05-cicd.md`](../05-cicd.md) §7).

---

## 5. The `prisma db push` step — `DIRECT_URL` from Secret Manager

**What:** apply the schema before/with the new image. **Why:** `db push` needs a **direct** connection (pooled URLs break DDL-ish operations) — [`../../04-database-production.md`](../04-database-production.md) §5. The runner reaches Cloud SQL through the Auth Proxy (public-IP instance, IAM-authenticated by the proxy — no authorized-networks juggling).

```yaml
      - run: |
          curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-proxy/latest/cloud-sql-proxy.linux.amd64
          chmod +x cloud-sql-proxy
          ./cloud-sql-proxy --quiet "PROJECT_ID:REGION:INSTANCE_NAME" &   # e.g. YOUR_PROJECT_ID:us-central1:acquisitionos-pg
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci && npx prisma generate
      - run: |
          export DATABASE_URL="postgresql://app_user:PASS@127.0.0.1:5432/acquisitionos?sslmode=disable"  # via proxy tunnel
          export DIRECT_URL="postgresql://app_user:PASS@127.0.0.1:5432/acquisitionos?sslmode=disable"
          export $(echo "$DIRECT_URL_SECRET" | sed 's/[?]/\&/')  # or read the full string from the secret, see note
          npx prisma db push --schema=prisma/schema.production.prisma
```

Simpler and safer: store the **full** `DIRECT_URL` connection string as the Secret Manager secret (as [`secrets.md`](./secrets.md) §3.1 does), `gcloud secrets versions access latest --secret=DIRECT_URL` it, and export it verbatim — no string surgery in the workflow.

Guardrails (from [`../../04-database-production.md`](../04-database-production.md) §4/§6):

- One migration step per deploy — never parallel jobs against the same DB.
- A failed migration fails the deploy; investigate before re-running. `--accept-data-loss` is forbidden in CI.
- The deployer SA needs `roles/cloudsql.client` (§2a) for the proxy; nothing more.

---

## 6. Concurrency guard + environments recap

```yaml
concurrency:
  group: production-deploy
  cancel-in-progress: false      # queue, don't cancel — a cancelled mid-deploy is worse than waiting
```

GitHub → Settings → Environments: `staging` (no reviewers), `production` (**required reviewers**, restrict deployable branches to `main`). Full rationale: [`../../05-cicd.md`](../05-cicd.md) §5. Branch protection on `main` (PRs only, status checks required): [`../../05-cicd.md`](../05-cicd.md) §2.

---

## 7. Rollback job

**What:** a `workflow_dispatch` workflow that redeploys a chosen previous SHA. **Why:** the fastest "undo" is a new revision of the old image — no git revert needed ([`rollback.md`](./rollback.md) §2).

```yaml
name: rollback
on:
  workflow_dispatch:
    inputs:
      sha: { description: "Previous image tag, e.g. a1b2c3d", required: true }
      target: { description: "staging | production", required: true, default: production }
jobs:
  redeploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.target }}
    permissions: { contents: read, id-token: write }
    steps:
      - uses: google-github-actions/auth@v2
        with: { ... }                                   # same WIF provider/SA
      - uses: google-github-actions/setup-gcloud@v2
      - run: |
          gcloud run deploy acquisitionos \
            --region "$REGION" \
            --image "$IMAGE:${{ inputs.sha }}" \
            --set-secrets=DATABASE_URL=DATABASE_URL:latest,DIRECT_URL=DIRECT_URL:latest,JWT_SECRET=JWT_SECRET:latest,CRON_SECRET=CRON_SECRET:latest
      - run: curl -fsS https://app.yourdomain.com/api/health | grep -q '"status":"ok"'
```

Find candidate tags with `gcloud artifacts docker tags list us-central1-docker.pkg.dev/PROJECT/acquisitionos/acquisitionos`. Keep the last ~10 tags ([`rollback.md`](./rollback.md) §2). Never point rollback at a tag whose **schema** is newer than the DB ([`rollback.md`](./rollback.md) §4).

---

## 8. Cloud Scheduler — one-time infrastructure, NOT a CI step

**What:** the 15 HTTP jobs that drive `/api/cron/*`. **Why one-time:** scheduler jobs point at a stable URL and are independent of deploys — recreating them in CI on every push is how duplicate-fire accidents happen ([`../../05-cicd.md`](../05-cicd.md) §8). `REQUIRED FOR CURRENT ACQUISITIONOS` — the app has no in-app scheduler.

**Auth contract (verified in the app):** every endpoint compares `Authorization: Bearer ${CRON_SECRET}`; all are `POST` except `payment-reconciliation` (`GET`). Do **not** use the `--oidc-*` flags — Scheduler would overwrite the Authorization header and every run 401s ([`architecture.md`](./architecture.md) §5).

```bash
gcloud scheduler jobs create http cron-expire-api-keys \
  --location="$REGION" --schedule="*/30 * * * *" \
  --uri="https://app.yourdomain.com/api/cron/expire-api-keys" \
  --http-method=POST \
  --headers="Authorization=Bearer ${CRON_SECRET}"
# Expected output: create request issued ... done.
```

The full 15-job table (identical to [`manual-deployment.md`](./manual-deployment.md) step 13; cadences from [`../../01-architecture.md`](../01-architecture.md) §2.4):

| Scheduler job | URI path | Method | Schedule |
| --- | --- | --- | --- |
| `cron-expire-api-keys` | `/api/cron/expire-api-keys` | POST | `*/30 * * * *` (every 15–30 min) |
| `cron-hot-lead-scan` | `/api/cron/hot-lead-scan` | POST | `*/30 * * * *` (every 15–60 min) |
| `cron-process-sequences` | `/api/cron/process-sequences` | POST | `*/10 * * * *` (every 5–15 min) |
| `cron-sequence-processing` | `/api/cron/sequence-processing` | POST | `*/10 * * * *` |
| `cron-meeting-reminders` | `/api/cron/meeting-reminders` | POST | `*/10 * * * *` |
| `cron-autonomous-outreach` | `/api/cron/autonomous-outreach` | POST | `*/30 * * * *` (every 15–60 min) |
| `cron-sdr-cycle` | `/api/cron/sdr-cycle` | POST | `*/30 * * * *` |
| `cron-process-gmail-replies` | `/api/cron/process-gmail-replies` | POST | `*/10 * * * *` (skip if Gmail Pub/Sub push configured) |
| `cron-credit-renewal` | `/api/cron/credit-renewal` | POST | `0 3 * * *` |
| `cron-end-of-period` | `/api/cron/end-of-period` | POST | `0 3 * * *` |
| `cron-renew-subscriptions` | `/api/cron/renew-subscriptions` | POST | `0 3 * * *` |
| `cron-payment-reconciliation` | `/api/cron/payment-reconciliation` | **GET** | `0 4 * * *` |
| `cron-process-billing` | `/api/payments/process-billing` | POST | `0 4 * * *` |
| `cron-retry-emails` | `/api/feedback/retry-emails` | POST | `*/30 * * * *` (suggested) |
| `cron-gmail-jobs` | `/api/gmail/jobs/process` | POST | `*/10 * * * *` — header `x-api-key=${GMAIL_CRON_API_KEY}` instead |

After a domain change, re-point URIs (`gcloud scheduler jobs update http ... --uri=...`) — [`dns-ssl.md`](./dns-ssl.md) §7. `CRON_SECRET` never belongs in GitHub secrets ([`../../05-cicd.md`](../05-cicd.md) §3).

---

## 9. Official documentation

- Workload Identity Federation for GitHub Actions — https://cloud.google.com/iam/docs/workload-identity-federation
- `google-github-actions/auth@v2` — https://github.com/google-github-actions/auth
- Cloud Run deploy from CI (gcloud) — https://cloud.google.com/run/docs/deploying
- Artifact Registry (push from CI) — https://cloud.google.com/artifact-registry/docs/docker/pushing-and-pulling
- Cloud SQL Auth Proxy (systemd/CI use) — https://cloud.google.com/sql/docs/postgres/sql-proxy
- Cloud Scheduler HTTP targets — https://cloud.google.com/scheduler/docs/http-targets
- GitHub Environments & protections — https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment
- Handbook: [`../../05-cicd.md`](../05-cicd.md) · [`../../04-database-production.md`](../04-database-production.md) · [`./terraform.md`](./terraform.md) (IaC apply gates)
