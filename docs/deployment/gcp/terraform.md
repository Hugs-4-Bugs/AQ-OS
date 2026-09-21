# GCP Infrastructure as Code — Terraform for AcquisitionOS

Terraform lets you recreate this entire deployment — Cloud Run, Cloud SQL, secrets, scheduler jobs, DNS — from version-controlled code. Read [`manual-deployment.md`](./manual-deployment.md) first: every resource below is one you already created by hand, now expressed as code.

All code blocks are **representative and complete enough to run** (placeholders: `YOUR_PROJECT_ID`, `app.yourdomain.com`, `YOUR_BUDGET`-style values come from [`prerequisites.md`](./prerequisites.md)). Compare against the official provider docs when a version difference appears — GCP evolves faster than any handbook.

---

## 1. Concepts in one table

| Concept | What it is | Why it matters here |
| --- | --- | --- |
| **Provider** | The plugin that talks to an API (`google`, `random`) | `google` creates GCP resources; `random` generates passwords/secrets |
| **Resource** | A thing that exists (`google_cloud_run_v2_service`) | Each block = one piece of the architecture |
| **Variable** | An input parameter (`var.region`) | Keeps `YOUR_PROJECT_ID`-style values out of the code |
| **Output** | A printed result after apply | Service URL, DB connection name — the values you need next |
| **Data source** | Read existing state (`data "..."`) | Fetch values you created elsewhere |
| **State** | Terraform's record of what it created (`terraform.tfstate`) | Never edit by hand; store remotely (§5) |
| **Backend** | Where state is stored | GCS bucket with locking (§5) |
| **Module** | A reusable folder of resources | One `modules/acquisitionos`, three environments (§6) |

Label reminder: everything Terraform creates below is `REQUIRED FOR CURRENT ACQUISITIONOS` unless commented `OPTIONAL`.

---

## 2. Project structure

Environments are **folders** (not Terraform workspaces): a production state file must never be able to affect dev. Workspaces still exist for the rare same-folder variation — prefer folders.

```text
deploy/terraform-gcp/
├── README.md                     ← how to run this (init/plan/apply rules, state bucket setup)
├── modules/
│   └── acquisitionos/
│       ├── versions.tf           ← terraform + provider requirements
│       ├── main.tf               ← all resources (or split: apis.tf, db.tf, run.tf, ...)
│       ├── variables.tf          ← inputs with types + descriptions
│       └── outputs.tf
└── environments/
    ├── dev/
    │   ├── main.tf               ← module "acquisitionos" { source = "../../modules/acquisitionos" ... }
    │   └── terraform.tfvars      ← dev values (NON-SECRETS only)
    ├── staging/
    │   ├── main.tf
    │   └── terraform.tfvars
    └── production/
        ├── main.tf
        └── terraform.tfvars
```

---

## 3. The representative module

### 3.1 `versions.tf` — providers

```hcl
terraform {
  required_version = ">= 1.5"

  backend "gcs" {                       # remote state — see section 5
    bucket = "YOUR_STATE_BUCKET_NAME"   # created once, per environment (6.1)
    prefix = "acquisitionos/production" # change per environment folder
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"                # check the registry for the current line
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# The `random` provider generates secrets (JWT_SECRET, DB password) without
# you ever typing one into code or tfvars.
provider "random" {}
```

### 3.2 `variables.tf` — inputs (no secrets in tfvars, ever)

```hcl
variable "project_id" { type = string }                       # YOUR_PROJECT_ID
variable "region" { type = string, default = "us-central1" }  # prerequisites.md §9
variable "app_domain" { type = string }                       # app.yourdomain.com
variable "db_tier" { type = string, default = "db-custom-2-8192" }
variable "db_ha" { type = bool, default = false }             # true = REGIONAL (HA, ~2x cost)
variable "image" { type = string }                            # REGION-docker.pkg.dev/PROJECT/acquisitionos/acquisitionos:GITSHA
variable "max_instances" { type = number, default = 3 }
```

### 3.3 Enable APIs

```hcl
resource "google_project_service" "required" {
  for_each = toset([
    "run.googleapis.com", "sqladmin.googleapis.com", "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com", "dns.googleapis.com", "cloudscheduler.googleapis.com",
    "pubsub.googleapis.com", "cloudbuild.googleapis.com", "monitoring.googleapis.com",
    "logging.googleapis.com", "iam.googleapis.com",
  ])
  service            = each.key
  disable_on_destroy = false   # a `terraform destroy` must not switch APIs off
}
```

### 3.4 Artifact Registry

```hcl
resource "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = "acquisitionos"
  format        = "DOCKER"
  description   = "AcquisitionOS container images"
  depends_on    = [google_project_service.required]
}
```

### 3.5 Secrets (Secret Manager) — generated, never typed

```hcl
resource "random_password" "db_password"  { length = 32, special = false }
resource "random_password" "jwt_secret"   { length = 64, special = false }
resource "random_password" "cron_secret"  { length = 64, special = false }

# The runtime connection string uses the Cloud Run unix socket (manual-deployment.md step 11).
resource "google_secret_manager_secret" "database_url" {
  secret_id = "DATABASE_URL"
  replication { auto {} }
}
resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = "postgresql://app_user:${random_password.db_password.result}@/acquisitionos?host=/cloudsql/${google_sql_database_instance.postgres.connection_name}&connection_limit=10"
}

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id   = "JWT_SECRET"
  replication { auto {} }
}
resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = random_password.jwt_secret.result
}

resource "google_secret_manager_secret" "cron_secret" {
  secret_id   = "CRON_SECRET"
  replication { auto {} }
}
resource "google_secret_manager_secret_version" "cron_secret" {
  secret      = google_secret_manager_secret.cron_secret.id
  secret_data = random_password.cron_secret.result
}

# Provider-supplied values (STRIPE_SECRET_KEY, SMTP_PASSWORD, GOOGLE_CLIENT_SECRET,
# OPENAI_API_KEY, ...) must NOT be generated by Terraform — create their secret
# containers here and add VERSIONS from a secure pipeline or by hand:
resource "google_secret_manager_secret" "stripe_secret_key" {
  secret_id   = "STRIPE_SECRET_KEY"
  replication { auto {} }
}
# gcloud secrets versions add STRIPE_SECRET_KEY --data-file=-   (you type the value; Terraform never sees it)
```

### 3.6 Cloud SQL (PostgreSQL 16, backups + PITR, deletion protected)

```hcl
resource "google_sql_database_instance" "postgres" {
  name             = "acquisitionos-pg"
  database_version = "POSTGRES_16"
  region           = var.region

  settings {
    tier              = var.db_tier
    availability_type = var.db_ha ? "REGIONAL" : "ZONAL"
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      start_time                     = "07:00"
      point_in_time_recovery_enabled = true       # PITR — ../../04-database-production.md §7
      backup_retention_settings { retained_backups = 30 }
    }

    database_flags { name = "cloudsql.require_ssl", value = "on" }

    ip_configuration {
      ipv4_enabled = true   # public IP; connections still require TLS + credentials.
                            # OPTIONAL hardening: ipv4_enabled = false + private_network
                            # (needs a VPC + Direct VPC egress on Cloud Run) — networking.md §2.
    }
  }

  deletion_protection = true   # terraform destroy REFUSES while true — flip only knowingly
  depends_on          = [google_project_service.required]
}

resource "google_sql_database" "app" {
  name     = "acquisitionos"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "app_user" {
  name     = "app_user"
  instance = google_sql_database_instance.postgres.name
  password = random_password.db_password.result   # never printed to logs; see §5 state caveat
}
```

### 3.7 Cloud Run v2 service (SSE-correct settings)

```hcl
resource "google_cloud_run_v2_service" "app" {
  name     = "acquisitionos"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"   # switch to "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER" with the LB

  deletion_protection = false        # set true in production once the service is precious

  template {
    service_account                  = google_service_account.runtime.email
    timeout                          = "3600s"    # Cloud Run max; SSE requirement
    max_instance_count               = var.max_instances
    min_instance_count               = 1          # REQUIRED FOR CURRENT ACQUISITIONOS (SSE)

    volumes {
      name = "cloudsql"
      cloud_sql_instance { instances = [google_sql_database_instance.postgres.connection_name] }
    }

    containers {
      image = var.image
      ports { container_port = 3000 }

      resources {
        limits = { cpu = "1000m", memory = "1Gi" }
        startup_cpu_boost = true
        cpu_idle          = true   # CPU always allocated (SSE); needs a recent google provider —
                                   # if your version rejects it, set via gcloud --no-cpu-throttling (NEEDS VERIFICATION for exact minimum provider version)
      }

      volume_mounts { name = "cloudsql", mount_path = "/cloudsql" }

      # Secrets as ENV (alternative: same value_source pattern on a volume):
      env {
        name = "DATABASE_URL"
        value_source { secret_key_source { secret = google_secret_manager_secret.database_url.secret_id } }
      }
      env {
        name = "JWT_SECRET"
        value_source { secret_key_source { secret = google_secret_manager_secret.jwt_secret.secret_id } }
      }
      env {
        name = "CRON_SECRET"
        value_source { secret_key_source { secret = google_secret_manager_secret.cron_secret.secret_id } }
      }

      # Non-secret runtime config:
      env { name = "APP_PUBLIC_URL",     value = "https://${var.app_domain}" }
      env { name = "NEXT_PUBLIC_APP_URL", value = "https://${var.app_domain}" } # build-time too — frontend.md
      env { name = "LOG_LEVEL",          value = "info" }
    }
  }

  depends_on = [google_project_service.required, google_secret_manager_secret_version.database_url]
}
```

### 3.8 IAM bindings (least privilege)

```hcl
resource "google_service_account" "runtime" {
  account_id   = "acquisitionos-runtime"
  display_name = "AcquisitionOS runtime"
}

resource "google_project_iam_member" "runtime" {
  for_each = toset([
    "roles/secretmanager.secretAccessor", # read its env secrets
    "roles/cloudsql.client",              # unix-socket Cloud SQL connection
    "roles/artifactregistry.reader",      # pull the image
  ])
  project = var.project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.runtime.email}"
}
```

(Your *deployer* identity — you, or CI's federated identity from §7 — needs `roles/run.admin`, `roles/iam.serviceAccountUser`, `roles/artifactregistry.writer`, `roles/secretmanager.secretAccessor`, `roles/cloudsql.client`. Grant it once, outside this module, and keep it separate from the runtime identity.)

### 3.9 Cloud Scheduler jobs (the 15 cron endpoints)

```hcl
locals {
  base_url = "https://${var.app_domain}"
  jobs = {
    cron-expire-api-keys         = { path = "/api/cron/expire-api-keys",         method = "POST", schedule = "*/30 * * * *" }
    cron-hot-lead-scan           = { path = "/api/cron/hot-lead-scan",           method = "POST", schedule = "*/30 * * * *" }
    cron-process-sequences       = { path = "/api/cron/process-sequences",       method = "POST", schedule = "*/10 * * * *" }
    cron-sequence-processing     = { path = "/api/cron/sequence-processing",     method = "POST", schedule = "*/10 * * * *" }
    cron-meeting-reminders       = { path = "/api/cron/meeting-reminders",       method = "POST", schedule = "*/10 * * * *" }
    cron-autonomous-outreach     = { path = "/api/cron/autonomous-outreach",     method = "POST", schedule = "*/30 * * * *" }
    cron-sdr-cycle               = { path = "/api/cron/sdr-cycle",               method = "POST", schedule = "*/30 * * * *" }
    cron-process-gmail-replies   = { path = "/api/cron/process-gmail-replies",   method = "POST", schedule = "*/10 * * * *" }
    cron-credit-renewal          = { path = "/api/cron/credit-renewal",          method = "POST", schedule = "0 3 * * *" }
    cron-end-of-period           = { path = "/api/cron/end-of-period",           method = "POST", schedule = "0 3 * * *" }
    cron-renew-subscriptions     = { path = "/api/cron/renew-subscriptions",     method = "POST", schedule = "0 3 * * *" }
    cron-payment-reconciliation  = { path = "/api/cron/payment-reconciliation",  method = "GET",  schedule = "0 4 * * *" }
    cron-process-billing         = { path = "/api/payments/process-billing",     method = "POST", schedule = "0 4 * * *" }
    cron-retry-emails            = { path = "/api/feedback/retry-emails",        method = "POST", schedule = "*/30 * * * *" }
    # /api/gmail/jobs/process uses x-api-key + GMAIL_CRON_API_KEY — add it as its own secret if used.
  }
}

resource "google_cloud_scheduler_job" "cron" {
  for_each         = local.jobs
  name             = each.key
  region           = var.region
  attempt_deadline = "540s"

  retry_config {
    retry_count = 1
  }

  http_target {
    http_method = each.value.method
    uri         = "${local.base_url}${each.value.path}"

    # The app verifies exactly `Authorization: Bearer <CRON_SECRET>` — do NOT use
    # oidc_token here (it would overwrite this header and cause 401s).
    headers = { Authorization = "Bearer ${google_secret_manager_secret_version.cron.secret_data}" }
  }

  depends_on = [google_project_service.required]
}
```

### 3.10 Cloud DNS zone + record

```hcl
resource "google_dns_managed_zone" "app" {
  name        = "acquisitionos"
  dns_name    = "yourdomain.com."          # trailing dot required
  description = "AcquisitionOS production"
  # Skip this resource if DNS stays at your registrar — create the record set there instead.
}

resource "google_dns_record_set" "app" {
  name         = "app.${google_dns_managed_zone.app.dns_name}"
  type         = "CNAME"                    # domain-mapping path. LB path uses type A/AAAA with LB IPs.
  ttl          = 300                        # 300 while wiring; raise to 3600 when stable
  managed_zone = google_dns_managed_zone.app.name
  rrdatas      = ["aos-xxxxx-uc.a.run.app"] # Cloud Run domain-mapping target (manual-deployment.md step 14)
}
```

### 3.11 `outputs.tf`

```hcl
output "service_url"      { value = google_cloud_run_v2_service.app.uri }
output "db_connection_name" { value = google_sql_database_instance.postgres.connection_name }
output "dns_nameservers"  { value = google_dns_managed_zone.app.name_servers } # set at your registrar once
```

---

## 4. Commands — and what each one actually does

Run inside an environment folder (`environments/production`), never at the repo root:

| Command | What happens | When to use |
| --- | --- | --- |
| `terraform init` | Downloads providers; connects to the GCS backend; **acquires a state lock** | First run, after provider/backend changes |
| `terraform fmt -recursive` | Rewrites files to canonical style | Before every commit |
| `terraform validate` | Syntax + internal consistency check (no API calls) | In CI on every PR |
| `terraform plan -out=tfplan` | Diff between code and real world; writes a plan file | Review **every** plan before apply; also posted on PRs |
| `terraform apply tfplan` | Executes the reviewed plan exactly | After human review; in CI only via the protected pipeline (§7) |
| `terraform destroy` | Deletes everything it manages | Almost never — see below |

**When NOT to destroy:** production Cloud SQL (deletion_protection=true blocks it — keep it that way), any environment with real user data, or when the plan says more than you understand. To retire a *service* without touching the database, deploy the change (`terraform apply`) rather than destroying. `terraform destroy` anywhere in CI is an anti-pattern ([`../../05-cicd.md`](../05-cicd.md) §9).

Expected `plan` output for a first apply: `11 to add, 0 to change, 0 to destroy` (roughly: APIs, repo, SQL instance+db+user, secrets, SA+IAM, run service, scheduler jobs, DNS).

---

## 5. State: where it lives, why it is dangerous

**What:** `terraform.tfstate` maps code to real resources and **contains attribute values in plaintext — including `secret_data`** (Terraform cannot keep secrets out of state; `sensitive = true` only hides them from CLI output).

**Rules for this project:**

1. **Remote state in GCS** (already in `versions.tf`): create the bucket once per environment —
   ```bash
   gcloud storage buckets create gs://YOUR_STATE_BUCKET_NAME --location=us-central1 --uniform-bucket-level-access
   gcloud storage buckets update gs://YOUR_STATE_BUCKET_NAME --versioning
   ```
   GCS backends **lock state** automatically during writes (no concurrent applies), and bucket **versioning** keeps history so a corrupted state can be recovered.
2. **Restrict bucket IAM** to the people/CI identities that may see secrets. No public access, ever.
3. **No secrets in tfvars or Git**: provider keys (Stripe/SMTP/Google/OpenAI) get secret *versions* added by hand or by a secure pipeline (§3.5) — never as variables. Generated ones (`JWT_SECRET`, `CRON_SECRET`, DB password) come from `random_password`.
4. Never commit `.terraform/`, `*.tfstate*`, or plan files (they contain values too). Add them to `.gitignore`.
5. State file lost = Terraform "forgets" your resources (they still exist; import is possible but painful). Treat the state bucket as production data — it also needs the backup treatment.

---

## 6. Environments strategy

Three folders, one module:

```text
environments/dev/main.tf:
module "acquisitionos" {
  source     = "../../modules/acquisitionos"
  project_id = "YOUR_PROJECT_ID"          # dev project
  region     = "us-central1"
  app_domain = "dev.yourdomain.com"
  image      = "us-central1-docker.pkg.dev/YOUR_PROJECT_ID/acquisitionos/acquisitionos:GITSHA"
  db_ha      = false
}
```

- **dev**: smallest tier, `min_instance_count` can stay 1, cheap DB tier, can be destroyed nightly if desired.
- **staging**: mirrors production settings; the CI pipeline deploys here first.
- **production**: `db_ha = true` when the business justifies it, `deletion_protection = true` on Cloud SQL, applies gated behind approval (§7).
- Each environment gets its own state prefix (`prefix = "acquisitionos/<env>"`) and its own DNS names.
- Terraform manages *infrastructure*; **Prisma schema push stays a deploy step** (`npx prisma db push --schema=prisma/schema.production.prisma` via the Auth Proxy — [`manual-deployment.md`](./manual-deployment.md) step 9b, [`../../04-database-production.md`](../04-database-production.md)).

---

## 7. Terraform in CI/CD — safe usage

Pipeline shape (details in [`../../05-cicd.md`](../05-cicd.md)):

1. **PR** → `terraform fmt -check`, `validate`, and `plan` — the plan is posted as a PR comment for review.
2. **main (after approval)** → `apply` against staging; production apply is a manual approval step via a GitHub **Environment** with required reviewers.
3. **Never** `terraform destroy` or `apply -auto-approve` on production from CI.

**Authentication: Workload Identity Federation (OIDC) — never static keys.** GitHub Actions authenticates by exchanging its OIDC token for a short-lived GCP credential impersonating a *deployer service account*. No JSON key is stored in GitHub anywhere.

High-level setup (one-time, by an admin):

```bash
gcloud iam workload-identity-pools create github --location=global --display-name="GitHub"
gcloud iam workload-identity-pools providers create-oidc github-oidc \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository==\"YOUR_GITHUB_ORG/YOUR_REPO\""
# Then allow the pool to impersonate the deployer SA:
gcloud iam service-accounts add-iam-policy-binding DEPLOYER_SA@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/YOUR_GITHUB_ORG/YOUR_REPO"
```

And in the workflow:

```yaml
- uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: "projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github-oidc"
    service_account: "DEPLOYER_SA@YOUR_PROJECT_ID.iam.gserviceaccount.com"
- run: terraform -chdir=environments/staging init
- run: terraform -chdir=environments/staging apply -auto-approve tfplan   # only on main, protected environment
```

The exact pool/provider resource IDs follow Google's current WIF guide (linked below) — copy values from the console output rather than trusting any handbook.

---

## 8. Official documentation

- Terraform Google provider — https://registry.terraform.io/providers/hashicorp/google/latest/docs
- Terraform Random provider — https://registry.terraform.io/providers/hashicorp/random/latest/docs
- Terraform language docs (resources, variables, modules, state) — https://developer.hashicorp.com/terraform/language
- GCS backend (state + locking) — https://developer.hashicorp.com/terraform/language/backend/gcs
- google_cloud_run_v2_service reference — https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/cloud_run_v2_service
- google_sql_database_instance reference — https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/sql_database_instance
- google_cloud_scheduler_job reference — https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/cloud_scheduler_job
- Workload Identity Federation for GitHub Actions — https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines
- HashiCorp: sensitive values in state — https://developer.hashicorp.com/terraform/language/state/sensitive-data
