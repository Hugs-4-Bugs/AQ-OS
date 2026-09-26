# Terraform — AcquisitionOS on Cloudflare

Infrastructure as Code for the Cloudflare deployment: Hyperdrive, DNS, WAF, (optional) R2, and the Worker's infrastructure. Written for the same beginner audience as [`manual-deployment.md`](./manual-deployment.md) — read that first and run the manual flow once; Terraform then makes the second and third environment reproducible.

> **Provider versions.** Resource names below were verified against the **`cloudflare/cloudflare` provider v5.x** documentation at the time of writing. v5 renamed several resources your older notes may use: `cloudflare_record` → **`cloudflare_dns_record`**, `cloudflare_worker_script` → **`cloudflare_workers_script`**, `cloudflare_worker_custom_domain` → **`cloudflare_workers_custom_domain`**, `cloudflare_worker_route` → **`cloudflare_workers_route`** (see the provider's v5 upgrade guide). If `terraform plan` reports an invalid resource name, you are on a different major version — check https://registry.terraform.io/providers/cloudflare/cloudflare and pin the version. Attribute-level shapes are marked `NEEDS VERIFICATION` where they are easy to get wrong.

---

## 1. Terraform basics (30-second refresher)

| Concept | Meaning | Example in this guide |
| --- | --- | --- |
| **Provider** | The plugin that knows Cloudflare's APIs | `cloudflare/cloudflare` |
| **Resource** | A thing you create and keep | `cloudflare_hyperdrive_config` |
| **Data source** | A thing that already exists, read-only | `cloudflare_zone` (your DNS zone) |
| **Variable** | Input parameter | `var.environment`, `var.worker_name` |
| **Output** | Value printed after apply | the Hyperdrive config id |
| **Module** | Reusable bundle of resources | `modules/worker-infra/` |
| **State** | Terraform's record of what it created | remote backend (§6) |
| **Backend** | Where state is stored | Terraform Cloud / S3(-compatible) |

**What Terraform owns here vs what wrangler owns.** Honest split, used by most teams on this platform:

- **Terraform owns:** Hyperdrive configs, DNS records, Custom Domains, WAF rulesets, R2 buckets, API tokens' scopes (optionally), zone settings.
- **wrangler/CI owns:** the Worker *code* deployment (`opennextjs-cloudflare deploy` — the built OpenNext bundle changes on every commit and is a poor fit for Terraform state).

This guide still shows `cloudflare_workers_script` (§5.1) because some teams do manage the script declaratively (content from a build artifact); if you adopt that, wire it to the same artifact CI produces and `terraform plan` will diff it. The simpler default: let `wrangler deploy` manage the script, and never put it in state.

---

## 2. Project structure

```text
deploy/terraform-cloudflare/            # NOTE: deploy/terraform/ already holds the AWS stack — do not mix providers in one root
├── README.md                           # how to run this stack (commands, prerequisites)
├── modules/
│   └── worker-infra/                   # reusable bundle: hyperdrive + domain + dns + waf + optional r2
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
└── environments/
    ├── dev/
    │   ├── main.tf                     # module call with dev values
    │   ├── backend.tf                  # state backend (§6)
    │   └── terraform.tfvars
    ├── staging/
    │   ├── main.tf
    │   ├── backend.tf
    │   └── terraform.tfvars
    └── production/
        ├── main.tf
        ├── backend.tf
        └── terraform.tfvars
```

**Why this shape:** each environment is a thin, separate root with its own state (so `terraform destroy` in dev can never touch production), and everything real lives in one module. This mirrors the environments strategy in [`../05-cicd.md`](../05-cicd.md).

---

## 3. Provider configuration + data source

**What:** pins the provider and authenticates via the `CLOUDFLARE_API_TOKEN` environment variable — never a token in `.tf` files.
**Why:** the token from [`prerequisites.md`](./prerequisites.md) §6 is scoped to exactly this account/zone (see §9 for handling).

`environments/production/main.tf`:

```hcl
terraform {
  required_version = ">= 1.6.0"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"    # pin the major; minor upgrades deliberate
    }
  }
}

provider "cloudflare" {
  # api_token is read from the CLOUDFLARE_API_TOKEN environment variable.
  # NEVER write the token here.
}

# The DNS zone that already exists (created in prerequisites.md §2)
data "cloudflare_zone" "main" {
  name = "yourdomain.com"   # NOTE: data-source attribute shapes changed across major versions — verify against your pinned provider version
}

variable "environment" {
  type    = string
  default = "production"
}

variable "worker_name" {
  type    = string
  default = "acquisitionos"
}
```

**Expected output:** `terraform init` downloads the provider and reports "Terraform has been successfully initialized!".

**Verify:** `terraform providers` lists `cloudflare/cloudflare` at the pinned version.

---

## 4. The module: resources for one environment

`modules/worker-infra/main.tf` — representative code. Comments mark everything volatile.

### 4.1 Hyperdrive

```hcl
resource "cloudflare_hyperdrive_config" "main" {
  account_id = var.account_id
  name       = "acquisitionos-pg-${var.environment}"

  origin = {
    scheme   = "postgres"
    host     = var.db_host       # external Postgres host (database.md §2)
    port     = 5432
    user     = var.db_user
    password = var.db_password   # sensitive var — see §8
    database = var.db_name
  }

  caching = {
    enabled  = true
    max_age  = 60   # seconds; tune per Hyperdrive docs — NEEDS VERIFICATION for current attribute names
  }
}
```

Why: same object wrangler created in [`manual-deployment.md`](./manual-deployment.md) §3 — once Terraform owns it, remove the wrangler-created duplicate (or import it, §7) so there is exactly one source of truth. The schema shown matches the provider docs page for `cloudflare_hyperdrive_config` at the time of writing.

### 4.2 The Worker script (optional — read §1 first)

```hcl
# OPTIONAL. Only if you want Terraform to own the script contents (built by CI via opennextjs-cloudflare build).
# If wrangler deploy owns the script, DELETE this block and manage the script outside state.
resource "cloudflare_workers_script" "app" {
  account_id         = var.account_id
  name               = var.worker_name
  content_file       = "${path.module}/../../artifacts/.open-next/worker.js"  # build artifact from CI
  main_module        = "worker.js"                                            # verify against the adapter output — NEEDS VERIFICATION
  compatibility_date = "2024-09-23"                                           # match wrangler.jsonc
  compatibility_flags = ["nodejs_compat", "global_fetch_strictly_public"]

  bindings = [
    { type = "hyperdrive",  name = "HYPERDRIVE",  id = cloudflare_hyperdrive_config.main.id },
    { type = "plain_text",  name = "APP_PUBLIC_URL", text = var.app_public_url },
    { type = "secret_text", name = "JWT_SECRET",   text = var.jwt_secret },   # sensitive — §8
    # assets binding and WORKER_SELF_REFERENCE service binding are produced/maintained by the
    # OpenNext toolchain — replicate them exactly from wrangler.jsonc if Terraform owns the script.
    # Exact binding-object attribute names: verify against the v5 docs — NEEDS VERIFICATION.
  ]
}
```

### 4.3 Custom Domain + DNS

```hcl
resource "cloudflare_workers_custom_domain" "app" {
  account_id  = var.account_id
  zone_id     = data.cloudflare_zone.main.id
  hostname    = var.app_hostname        # e.g. app.yourdomain.com
  service     = var.worker_name
  environment = "production"
}

# Explicit DNS record is only needed for NON-custom-domain hostnames.
# Custom Domains create their own proxied record; do not double-create it.
resource "cloudflare_dns_record" "www_redirect" {
  zone_id  = data.cloudflare_zone.main.id
  name     = "www.yourdomain.com"
  type     = "CNAME"
  content  = "yourdomain.com"
  ttl      = 1        # 1 = auto/proxied when proxied = true
  proxied  = true
}
```

### 4.4 Optional R2 bucket

```hcl
resource "cloudflare_r2_bucket" "uploads" {
  count        = var.r2_enabled ? 1 : 0
  account_id   = var.account_id
  name         = "acquisitionos-${var.environment}"
  # location: EU/WNAM/ENAM/APAC/OC — omit for auto — verify attribute name against your provider version
}
```

### 4.5 WAF — custom rule + rate limit

```hcl
# Challenge unauthenticated abuse on the API surface (managed rulesets are enabled by default per zone plan)
resource "cloudflare_ruleset" "waf_custom" {
  account_id = var.account_id           # account-scoped custom rules; a zone-scoped variant also exists
  name       = "acquisitionos-waf-custom-${var.environment}"
  kind       = "custom"
  phase      = "http_request_firewall_custom"

  rules = [{
    action     = "managed_challenge"
    expression = "(http.host eq \"${var.app_hostname}\" and starts_with(http.request.uri.path, \"/api/\") and not http.request.method in {\"GET\" \"HEAD\"})"
    description = "Challenge suspicious POSTs to /api/*"
    enabled    = true
    # rate-limit action shape differs between provider versions — for a strict rate limit use the
    # http_ratelimit phase ruleset instead; verify current syntax — NEEDS VERIFICATION
  }]
}

resource "cloudflare_ruleset" "rate_limit_api" {
  account_id = var.account_id
  name       = "acquisitionos-ratelimit-${var.environment}"
  kind       = "custom"
  phase      = "http_ratelimit"

  rules = [{
    action     = "block"
    expression = "(http.host eq \"${var.app_hostname}\" and starts_with(http.request.uri.path, \"/api/\"))"
    description = "Rate limit /api/* (60 requests / 60 s per IP) — tune before enabling"
    enabled    = false   # enable deliberately after load-testing; SSE clients poll/stream — do not strangle them
    ratelimit = {
      characteristics     = ["ip.src"]
      period              = 60
      requests_per_period = 60
      mitigation_timeout  = 60
    }
  }]
}
```

Why: [`networking.md`](./networking.md) §6 explains the full WAF strategy; keep `/api/events/*` in mind when tuning (SSE = one long request, not many).

### 4.6 Outputs

```hcl
output "hyperdrive_config_id" {
  value     = cloudflare_hyperdrive_config.main.id
  description = "Paste into wrangler.jsonc hyperdrive[].id (manual-deployment.md §5)"
}

output "worker_domain" {
  value = cloudflare_workers_custom_domain.app.hostname
}
```

**Expected output after `terraform apply`:** the Hyperdrive id and hostname. **Verify:** `curl https://app.yourdomain.com/api/health` and `npx wrangler hyperdrive list`.

---

## 5. Variables per environment

`modules/worker-infra/variables.tf` declares: `account_id`, `environment`, `worker_name`, `app_hostname`, `app_public_url`, `db_host`, `db_user`, `db_name`, `db_password` (sensitive), `jwt_secret` (sensitive), `r2_enabled`. Non-sensitive values live in `terraform.tfvars`; **sensitive values come from the environment (TF_VAR_db_password, TF_VAR_jwt_secret) or a secret manager — never committed `.tfvars`** (§8).

```hcl
variable "db_password" {
  type      = string
  sensitive = true
}
variable "jwt_secret" {
  type      = string
  sensitive = true
}
```

---

## 6. State: backend, locking, environments strategy

**What:** state maps `.tf` config to real resources. Losing or corrupting it is the worst-case Terraform incident.

**Remote backend options (pick one):**

| Backend | Locking | Notes |
| --- | --- | --- |
| Terraform Cloud / HCP Terraform | Built-in | Easiest; free tier suffices; runs plans/apply in its own workers |
| S3 (with DynamoDB locking) | DynamoDB | The classic; the repo's AWS stack already uses an S3 backend (`deploy/terraform/`) |
| R2 as S3-compatible backend | via S3 `use_lockfile` | R2 speaks the S3 API; Terraform's S3 backend accepts a custom `endpoint`. Works, but verify current support and the lockfile flag (Terraform ≥ 1.9) before adopting — `NEEDS VERIFICATION`. |

`environments/production/backend.tf` (S3 example; per-environment key isolates state):

```hcl
terraform {
  backend "s3" {
    bucket         = "your-terraform-state-bucket"
    key            = "acquisitionos/cloudflare/production.tfstate"
    region         = "us-east-1"
    # endpoint/dynamodb settings if storing on R2 or non-AWS S3-compatible storage — verify current flags
  }
}
```

**Locking note:** two concurrent `apply`s against one state corrupt infrastructure. Backends above provide locking; a plain local backend does not — never share local state, never commit `.tfstate` (it contains secrets in plaintext!).

**Environments strategy:** one state per environment (`dev`, `staging`, `production`), one module shared by all, separate variable files. Promotion = merging config changes through the environments in Git, never "copy prod state".

---

## 7. Adopting resources created manually (`import`)

If you followed [`manual-deployment.md`](./manual-deployment.md) first, Hyperdrive/the domain already exist. Import them instead of re-creating:

```bash
cd environments/production
terraform init
terraform import cloudflare_hyperdrive_config.main YOUR_ACCOUNT_ID/YOUR_HYPERDRIVE_ID
# import address/ID shapes vary by resource — read the "Import" section of each resource's docs page
terraform plan   # expect: "No changes." — that is the goal
```

**Expected output:** `No changes. Your infrastructure matches the configuration.` If plan wants to destroy/recreate something after import, the config does not match reality — fix the config, not reality.

---

## 8. Commands + secrets handling

```bash
terraform init                 # first time / after provider changes
terraform fmt -recursive       # canonical formatting (run in CI)
terraform validate             # syntax/type check (run in CI)
terraform plan -out=tfplan     # preview; READ IT — every +/−/~ line is an API call
terraform apply tfplan         # execute exactly what was planned
terraform destroy              # see warning below
```

**Secrets handling rules (non-negotiable):**

1. `CLOUDFLARE_API_TOKEN` enters via environment variable (CI secret) — never in `.tf`, never in `.tfvars`.
2. Sensitive variables (`db_password`, `jwt_secret`) are `sensitive = true` **and** provided via `TF_VAR_*` environment variables or a secret manager — no committed values.
3. `.tfstate` and `.tfplan` files contain decrypted secrets — they live in the locked remote backend only; `.gitignore` them locally.
4. `terraform plan` output masks sensitive values — never work around that masking.

**When NOT to run `terraform destroy`:** when any real user data path exists — the Hyperdrive config is harmless to destroy, but a destroy that also removes a DNS record or Custom Domain takes the app offline instantly (webhooks, OAuth, SSE all break), and destroying shared zone-level resources (WAF, DNS) can affect more than this app. In production, prefer targeted `terraform apply -target=...` or explicit resource removal from config; reserve `destroy` for ephemeral dev stacks.

---

## 9. CI/CD for Terraform (plan on PR, apply gated)

Pipeline shape (GitHub Actions; full patterns in [`../05-cicd.md`](../05-cicd.md)):

1. **Pull request** → run `terraform fmt -check`, `terraform validate`, and `terraform plan` for each changed environment; post the plan as a PR comment. Read-only token is sufficient for plan (Zone Read + Hyperdrive Read + Workers Scripts Read, scoped — verify exact permission names in the token UI).
2. **Merge to main** → `terraform apply` for the changed environment, gated by a **GitHub Environment** (e.g., `cloudflare-production`) with required reviewers. The apply job uses the scoped deploy token stored as a GitHub secret (`CLOUDFLARE_API_TOKEN`).
3. **Worker code deploy** stays a separate job (`opennextjs-cloudflare deploy`) so Terraform diffs and app releases are decoupled events — see [`frontend.md`](./frontend.md) §8 for the deploy/rollback pairing.

Minimal gate sketch:

```yaml
jobs:
  apply:
    if: github.ref == 'refs/heads/main'
    environment: cloudflare-production      # required reviewers configured in repo settings
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - name: Terraform apply
        working-directory: environments/production
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          TF_VAR_db_password:  ${{ secrets.DB_PASSWORD }}
          TF_VAR_jwt_secret:   ${{ secrets.JWT_SECRET }}
        run: |
          terraform init
          terraform apply -auto-approve
```

**Verify:** the Actions run shows the plan summary before apply; the GitHub Environment page shows the review approval; `terraform state list` afterwards matches `wrangler hyperdrive list`.

---

## 10. Official Documentation

- Cloudflare provider (registry) — https://registry.terraform.io/providers/cloudflare/cloudflare
- Cloudflare Terraform docs hub — https://developers.cloudflare.com/terraform/
- Resource: `cloudflare_hyperdrive_config` — https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/hyperdrive_config
- Resource: `cloudflare_workers_script` — https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/workers_script
- Resource: `cloudflare_workers_custom_domain` — https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/workers_custom_domain
- Resource: `cloudflare_dns_record` — https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/dns_record
- Resource: `cloudflare_ruleset` (WAF) — https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/ruleset
- Resource: `cloudflare_r2_bucket` — https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/r2_bucket
- Terraform language/backend docs — https://developer.hashicorp.com/terraform/language
