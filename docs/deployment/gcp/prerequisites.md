# GCP Prerequisites — Account, Project, Billing, CLI, APIs, Quotas, Region

Complete this page once, on the machine you will deploy from. It gives you everything the later pages assume. For cross-platform concepts (domain, DNS, Docker, Terraform basics, Git) see [`../../00-prerequisites.md`](../00-prerequisites.md).

---

## 1. Checklist of what you will have at the end

| Item | Where it comes from | Used by |
| --- | --- | --- |
| Google Cloud account (+ MFA) | console.cloud.google.com sign-up | Everything |
| Project `YOUR_PROJECT_ID` | §3 | Every resource (resources live inside projects) |
| Billing account linked + budget alerts | §4 | Prevents surprise bills |
| gcloud CLI installed + authenticated | §5 | All commands in this guide |
| 11 APIs enabled | §7 | Cloud Run, Cloud SQL, Secret Manager, … |
| Region chosen (example: `us-central1`) | §9 | Cloud Run, Cloud SQL, Artifact Registry, Scheduler |
| Quota sanity check | §8 | Deploys that do not fail at 80% |

---

## 2. GCP account: organization vs personal

**What:** a Google account signed up for Google Cloud (billing enabled). GCP resources live in **projects**; projects can stand alone (personal) or inside an **organization** (company with Google Workspace / Cloud Identity).

**Why AcquisitionOS cares:** the deployment needs one project with a handful of services; either account type works. The differences you will actually notice:

| Aspect | Personal account | Organization account |
| --- | --- | --- |
| Creating projects | Always allowed (unless org policy blocks) | You may need an admin to create the project or grant `resourcemanager.projectCreator` |
| Org policies | None | May restrict external IPs, domain-scoped sharing, or service usage — if a step fails with `constraints/...` errors, ask your admin |
| Billing | Create your own billing account | Usually assigned to an existing billing account |
| Recommended for | Learning, solo products | Company production (use a dedicated project, e.g. `acquisitionos-prod`) |

**How:** sign up at https://console.cloud.google.com with any Google account; accept terms; enable MFA on the Google account itself (Security → 2-Step Verification).

**Verify:** you can open the console dashboard and see "Project" selector working.

> Best practice for production: use a **dedicated Google account** (not your personal one) with MFA as the owner/admin, and do the daily work with less-privileged identities. Least-privilege details: [`security.md`](./security.md).

---

## 3. Create the project

**What:** a project is the unit that owns resources, APIs, and IAM. **Why:** everything in this guide (Cloud Run, Cloud SQL, secrets) is created inside one project, so all defaults line up.

Console: Manage resources → **Create Project** → name `AcquisitionOS` → note the generated **Project ID**.

CLI (recommended — deterministic):

```bash
# What: create a project and set it as your gcloud default.
# Why: every later command uses it; avoids "no project set" errors.
# Replace YOUR_PROJECT_ID: globally unique, 6-30 chars, lowercase letters/digits/hyphens.
gcloud projects create YOUR_PROJECT_ID --name="AcquisitionOS"
gcloud config set project YOUR_PROJECT_ID
```

Expected output: `Created project [YOUR_PROJECT_ID].` then `Updated property [core/project].`

Link billing to the project (required to use most services):

```bash
# List billing accounts you can access, then link one:
gcloud billing accounts list
gcloud billing projects link YOUR_PROJECT_ID --billing-account=YOUR_BILLING_ACCOUNT_ID
```

Verify: `gcloud config get-value project` prints your ID; the console top bar shows the project.

Where the value comes from: **you choose** `YOUR_PROJECT_ID`; GCP guarantees uniqueness (add random digits if taken). Keep it stable — it appears in image URLs (`REGION-docker.pkg.dev/YOUR_PROJECT_ID/...`).

---

## 4. Billing account + budget alerts

**What:** a billing account pays for usage; a **budget** watches spend and sends alerts. **Why:** Cloud SQL bills continuously even when Cloud Run is idle; a budget alert is the single most important beginner safety step.

Console: Billing → Budgets & alerts → **Create budget** → scope: your project → amount: `YOUR_BUDGET` → thresholds **50%, 90%, 100%** → email alerts on.

CLI (Cloud Billing budgets are managed with the `gcloud billing budgets` command group):

```bash
# What: create a monthly budget with threshold alerts.
# Why: email before the bill surprises you.
gcloud billing budgets create \
  --billing-account=YOUR_BILLING_ACCOUNT_ID \
  --display-name="acquisitionos-monthly" \
  --budget-amount=YOUR_BUDGET \
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
```

Expected output: a table showing `acquisitionos-monthly` with your amount and thresholds.

Verify: `gcloud billing budgets list --billing-account=YOUR_BILLING_ACCOUNT_ID`.

This handbook deliberately does not quote prices (they change) — see each product's pricing page; the biggest steady cost in this architecture is Cloud SQL.

---

## 5. Install the gcloud CLI, authenticate, initialize

**What:** `gcloud` is the CLI for every command in this guide. **Why:** the console changes its UI; the CLI is copy-pasteable and scriptable.

```bash
# Install (macOS with Homebrew; other OS: https://cloud.google.com/sdk/docs/install)
brew install --cask google-cloud-sdk
# Debian/Ubuntu: follow the apt instructions at the URL above.
# Windows: use the GoogleCloudSDKInstaller.exe from the URL above.

# What: authenticate gcloud as YOUR Google user (browser flow).
# Why: the deploy commands run with your user's permissions.
gcloud auth login

# What: set the default project and region for all commands.
# Why: lets later commands omit --project and shortens them.
gcloud config set project YOUR_PROJECT_ID
gcloud config set compute/region us-central1

# What: install the component that lets `docker` push to Artifact Registry.
# Why: needed in manual-deployment.md step 7.
gcloud components install gke-gcloud-auth-plugin   # helper auth plugin
gcloud auth configure-docker us-central1-docker.pkg.dev
```

Expected output: `gcloud auth login` opens a browser and ends with `You are now logged in as [your@email].`; `configure-docker` ends with `Docker credential helper configured for ...`.

Verify:

```bash
gcloud --version                 # a recent version prints (≥ 450.x is fine — NEEDS VERIFICATION for exact floor)
gcloud auth list                 # your account marked ACTIVE
gcloud config list               # project + region set correctly
gcloud projects describe YOUR_PROJECT_ID   # lifecycleState: ACTIVE
```

You also need, from [`../../00-prerequisites.md`](../00-prerequisites.md): **Docker** (build/push), **Node 20 + npm** (Prisma schema push), **openssl** (secret generation), and optionally **Terraform ≥ 1.5** and **psql**.

---

## 6. Service account vs user account (IAM concept)

**What:** a *user account* is your Google identity; a *service account* (SA) is a robot identity for software. Permissions are granted as **IAM roles** on project resources.

**Why AcquisitionOS cares — you will create two identities:**

| Identity | Used by | Roles it needs (least privilege, added in `manual-deployment.md` step 4) |
| --- | --- | --- |
| **Your user account** (or a dedicated deployer SA) | Running `gcloud run deploy`, pushing images, creating secrets | `roles/run.admin`, `roles/iam.serviceAccountUser`, `roles/artifactregistry.writer`, `roles/secretmanager.secretAccessor`, `roles/cloudsql.client` |
| **Runtime SA** (e.g. `acquisitionos-runtime@YOUR_PROJECT_ID.iam.gserviceaccount.com`) | The Cloud Run container while it runs | `roles/secretmanager.secretAccessor`, `roles/cloudsql.client`, `roles/artifactregistry.reader` |

**Never** use the default compute service account or an over-privileged editor for the runtime SA. Never download long-lived JSON keys for CI — CI uses OIDC federation instead ([`terraform.md`](./terraform.md), [`../../05-cicd.md`](../05-cicd.md)).

---

## 7. APIs to enable

**What:** each GCP product must be switched on per project. **Why:** without an API enabled, its `gcloud` commands fail with `PERMISSION_DENIED` / "API not enabled".

```bash
# What: enable all APIs this deployment uses, in one command.
# Why: one step instead of eleven; idempotent (re-running is safe).
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  dns.googleapis.com \
  cloudscheduler.googleapis.com \
  pubsub.googleapis.com \
  cloudbuild.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com \
  iam.googleapis.com
```

Expected output: a `Operation "operations/..." finished successfully.` line per API (or `already enabled`).

Why each one:

| API | Needed for |
| --- | --- |
| `run` | The Cloud Run service itself |
| `sqladmin` | Create/manage Cloud SQL (and Auth Proxy connections) |
| `secretmanager` | All secret variables |
| `artifactregistry` | Image repository |
| `dns` | Cloud DNS zone + records (skip if keeping registrar DNS) |
| `cloudscheduler` | The 15 cron jobs |
| `pubsub` | Gmail push (`OPTIONAL`), and Terraform/GitHub OIDC plumbing |
| `cloudbuild` | `OPTIONAL` image builds on GCP |
| `monitoring`, `logging` | Alerts, dashboards, request logs |
| `iam` | Service accounts + role bindings |

Verify: `gcloud services list --enabled` — all of the above present.

---

## 8. Quotas — the basics you need

**What:** GCP caps resource amounts per project/region (CPUs, in-use IPs, Cloud SQL instances…). **Why:** a deploy can fail with `QUOTA_EXCEEDED` even when everything else is right; and Cloud Run enforces per-region **CPU limit** on minimum instances.

What to check before deploying:

```bash
# Cloud Run: regional CPU quota (min-instances=1 with CPU-always consumes quota even when idle)
gcloud services enable run.googleapis.com
gcloud compute project-info describe --project=YOUR_PROJECT_ID | less   # general quotas
# Console: IAM & Admin → Quotas → filter "Cloud Run API" and your region.
```

Beginner guidance:

- The defaults are enough for `min-instances=1`, CPU 1 vCPU. If you raise `min-instances` later, remember it reserves that many vCPUs against the Cloud Run regional quota.
- Cloud SQL: default ~a handful of instances per project — fine for one (+ staging).
- If a deploy fails with a quota error, the message names the exact quota — request more in console (IAM & Admin → Quotas → Edit quotas) or lower `min-instances`.
- Anything beyond this (VPC quotas, etc.) is only relevant for the `OPTIONAL` private-IP path ([`networking.md`](./networking.md)).

---

## 9. Region choice

**What:** a region is the physical location of your resources. **Why:** latency for users (pick a region near them) and consistency — **keep Cloud Run, Cloud SQL, and Artifact Registry in the SAME region** to avoid cross-region latency and egress costs.

Rules of thumb for AcquisitionOS:

1. Pick **one region close to your users** and write it down; every command in this guide uses `REGION`.
2. Example used throughout this handbook: **`us-central1`** (Iowa) — cheapest, most capacity, fine for a global-first SaaS. Alternatives: `europe-west1` (Belgium) for EU users, `asia-south1` (Mumbai) if Razorpay/India-focused, `asia-northeast1` (Tokyo) for Japan.
3. Cloud Scheduler jobs must be created in a region (use the same one; any works, same region is simplest).
4. The `OPTIONAL` global load balancer is *global* by design — it fronts your single region.

```bash
export REGION="us-central1"   # <-- the one value used by every later command
```

Verify: `gcloud config get-value compute/region` prints it (and every page below assumes `PROJECT_ID`, `REGION` are set).

---

## 10. Export the shared values now

All later pages assume these are set in your shell (adjust per the "where the value comes from" notes):

```bash
export PROJECT_ID="YOUR_PROJECT_ID"                      # §3 — your unique project id
export REGION="us-central1"                              # §9 — chosen region
export APP_DOMAIN="app.yourdomain.com"                   # your real domain (from your registrar)
export SA_NAME="acquisitionos-runtime"                   # runtime service account name (you choose)
export RUNTIME_SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
```

Verify: `echo $PROJECT_ID $REGION $APP_DOMAIN` prints your values.

---

## 11. Official documentation

- Creating and managing projects — https://cloud.google.com/resource-manager/docs/creating-managing-projects
- Billing budgets — https://cloud.google.com/billing/docs/how-to/budgets
- Install gcloud CLI — https://cloud.google.com/sdk/docs/install
- `gcloud` reference — https://cloud.google.com/sdk/gcloud/reference
- Enabling APIs — https://cloud.google.com/endpoints/docs/openapi/enable-api
- Quotas and limits — https://cloud.google.com/docs/quotas/view-manage
- Cloud Run regions — https://cloud.google.com/run/docs/locations
- Cloud SQL locations — https://cloud.google.com/sql/docs/instance-locations
