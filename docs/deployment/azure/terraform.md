# Terraform on Azure — Infrastructure as Code for AcquisitionOS

Terraform reproduces everything `manual-deployment.md` built by hand: resource group, Log Analytics, Container Apps environment + app, PostgreSQL Flexible Server, Key Vault, ACR, and DNS. This page teaches the basics first, then gives a representative working project. **Read `manual-deployment.md` first** — Terraform is the same resources with fewer clicks, not a different architecture.

---

## 1. Concepts in plain words

| Term | Meaning | AcquisitionOS example |
| --- | --- | --- |
| **Provider** | The plugin that speaks to a cloud's API | `azurerm` (Azure) |
| **Resource** | One thing you create and keep alive | `azurerm_postgresql_flexible_server` |
| **Data source** | Read-only lookup of something that exists | `azurerm_client_config` (your tenant id) |
| **Variable** | An input value with a type | `var.location`, `var.jwt_secret` |
| **Output** | A value printed after apply | the app's default FQDN |
| **Module** | A reusable folder of resources | `modules/acquisitionos/` |
| **State** | Terraform's record of what exists | `production.tfstate` in a storage blob |
| **Backend** | Where state is stored | `azurerm` backend (storage account) |

**Why state matters:** `terraform apply` diffs your `.tf` files against state. Azure adds locking to the azurerm backend automatically: an in-progress apply takes a **blob lease** on the state file, so two engineers cannot apply at once.

---

## 2. Project structure

```text
terraform/
├── README.md                     # how to run this project (your own notes)
├── modules/
│   └── acquisitionos/            # one module holding the whole stack
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
└── environments/
    ├── dev/
    │   ├── main.tf               # module call + dev backend key
    │   ├── terraform.tfvars      # dev values (non-secret only in Git)
    │   └── backend.hcl
    ├── staging/
    │   └── ...                   # same shape, own state key
    └── production/
        └── ...
```

**Environments strategy:** one **directory per environment**, each with its **own state key** (`dev.tfstate`, `staging.tfstate`, `production.tfstate`) and its own tfvars. Same module, different sizes (dev: Burstable DB, `min_replicas = 1`; production: GeneralPurpose + HA as decided). Do **not** use `terraform workspace` for environments — the blast radius of a wrong workspace selection is too big for beginners. Staging exists as a separate, small stack (see [`frontend.md`](./frontend.md) §5).

---

## 3. Provider, backend, data source

`environments/production/main.tf` (top):

```hcl
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "azurerm" {
    # values supplied by backend.hcl (not committed with real names):
    resource_group_name  = "rg-tfstate"
    storage_account_name = "YOUR_STATE_STORAGE"
    container_name       = "tfstate"
    key                  = "acquisitionos/production.tfstate"
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}

data "azurerm_client_config" "current" {}
```

`backend.hcl` (per environment, referenced at init):

```hcl
resource_group_name  = "rg-tfstate"
storage_account_name = "YOUR_STATE_STORAGE"
container_name       = "tfstate"
key                  = "acquisitionos/production.tfstate"
```

The state storage account is created once by hand (resource group `rg-tfstate`, storage account with **blob public access disabled** and **versioning enabled** — see §6). The azurerm backend authenticates with your `az login` locally and with OIDC in CI (§7).

---

## 4. Representative module (`modules/acquisitionos/main.tf`)

Resource by resource, mirroring `manual-deployment.md`. Abbreviated but valid-shape HCL; check the azurerm provider docs for full argument lists of your provider version (NEEDS VERIFICATION for version-specific arguments).

### 4.1 Resource group, Log Analytics, Container Apps environment

```hcl
resource "azurerm_resource_group" "this" {
  name     = var.resource_group_name
  location = var.location
}

resource "azurerm_log_analytics_workspace" "this" {
  name                = "log-${var.project}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_container_app_environment" "this" {
  name                       = "cae-${var.project}"
  location                   = azurerm_resource_group.this.location
  resource_group_name        = azurerm_resource_group.this.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.this.id
}
```

### 4.2 Azure Container Registry

```hcl
resource "azurerm_container_registry" "this" {
  name                = var.acr_name            # globally unique, alphanumeric
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  sku                 = "Basic"
  admin_enabled       = false                   # use identities, not admin creds
}
```

### 4.3 PostgreSQL Flexible Server

```hcl
resource "random_password" "pg_admin" {
  length  = 32
  special = false
}

resource "azurerm_postgresql_flexible_server" "this" {
  name                         = "pg-${var.project}"
  resource_group_name          = azurerm_resource_group.this.name
  location                     = azurerm_resource_group.this.location
  version                      = "16"
  administrator_login          = "pgadmin"
  administrator_password       = random_password.pg_admin.result
  sku_name                     = var.postgres_sku          # "GP_Standard_D2ds_v4" in production
  storage_mb                   = var.postgres_storage_mb   # 131072 = 128 GiB
  storage_autogrow_enabled     = true
  backup_retention_days        = var.backup_retention_days # 14
  geo_redundant_backup_enabled = var.geo_redundant_backup  # false to start
  deletion_protection_enabled  = true                      # prod stays deletable only on purpose

  high_availability {
    mode = "ZoneRedundant"   # enable only when the budget justifies ~2x DB cost
    # standby_zone = "2"
  }

  # public_network_access_enabled defaults to true; pair with firewall rules
  # below, or set false + private endpoint (OPTIONAL hardening — networking.md §3)
}

resource "azurerm_postgresql_flexible_server_database" "app" {
  name      = "acquisitionos"
  server_id = azurerm_postgresql_flexible_server.this.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "azure_services" {
  name             = "azure-services"
  server_id        = azurerm_postgresql_flexible_server.this.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}
```

The `app_user` role and its grants (SQL from [`database.md`](./database.md) §7 / [`../04-database-production.md`](../04-database-production.md) §2) run as a one-off after the first apply — Terraform for Azure does not manage in-database users for Flexible Server cleanly; document the SQL as a runbook step.

### 4.4 Key Vault + secrets

```hcl
resource "azurerm_key_vault" "this" {
  name                        = var.key_vault_name
  location                    = azurerm_resource_group.this.location
  resource_group_name         = azurerm_resource_group.this.name
  tenant_id                   = data.azurerm_client_config.current.tenant_id
  sku_name                    = "standard"
  soft_delete_retention_days  = 90
  purge_protection_enabled    = true
  enable_rbac_authorization   = true
}

# Secrets are stored per ../02-environment-variables-and-secrets.md.
# Values come from TF_VAR_... env vars or -var flags — NEVER hardcoded here.
resource "azurerm_key_vault_secret" "database_url" {
  name         = "database-url"
  value        = var.database_url
  key_vault_id = azurerm_key_vault.this.id
}

resource "azurerm_key_vault_secret" "jwt_secret" {
  name         = "jwt-secret"
  value        = var.jwt_secret
  key_vault_id = azurerm_key_vault.this.id
}
# ... repeat for direct-url, cron-secret, smtp-password, stripe-*, google-*, ai keys
```

### 4.5 The Container App (secrets via Key Vault refs, min replicas, probes)

```hcl
resource "azurerm_container_app" "app" {
  name                         = "${var.project}-api"
  container_app_environment_id = azurerm_container_app_environment.this.id
  resource_group_name          = azurerm_resource_group.this.name
  revision_mode                = "Multiple"   # keeps old revisions for rollback

  identity {
    type = "SystemAssigned"
  }

  registry {
    server   = azurerm_container_registry.this.login_server
    identity = "system"                       # AcrPull assigned below
  }

  secret {
    name                = "database-url"
    identity            = "system"
    key_vault_secret_id = azurerm_key_vault_secret.database_url.versionless_id
  }
  secret {
    name                = "jwt-secret"
    identity            = "system"
    key_vault_secret_id = azurerm_key_vault_secret.jwt_secret.versionless_id
  }
  # ... direct-url, cron-secret, provider keys

  template {
    min_replicas = 1          # REQUIRED for SSE — never scale to zero
    max_replicas = 5

    container {
      name   = "acquisitionos"
      image  = var.image                      # "<acr>.azurecr.io/acquisitionos:<sha>"
      cpu    = 1.0
      memory = "2Gi"

      env {
        name        = "APP_PUBLIC_URL"
        value       = "https://${var.app_hostname}"
      }
      env {
        name        = "NEXT_PUBLIC_APP_URL"   # remember: build-time inlined
        value       = "https://${var.app_hostname}"
      }
      env {
        name        = "NODE_ENV"
        value       = "production"
      }
      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }
      env {
        name        = "JWT_SECRET"
        secret_name = "jwt-secret"
      }

      readiness_probe {
        transport        = "Http"
        port             = 3000
        path             = "/api/health"
        interval_seconds = 30
      }
      liveness_probe {
        transport        = "Http"
        port             = 3000
        path             = "/api/health"
        initial_delay    = 40
        interval_seconds = 30
      }
    }
  }

  ingress {
    target_port      = 3000
    external_enabled = true
    transport        = "auto"
  }
}
```

### 4.6 Role assignments (least privilege)

```hcl
resource "azurerm_role_assignment" "app_kv_secrets_user" {
  scope                = azurerm_key_vault.this.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_container_app.app.identity[0].principal_id
}

resource "azurerm_role_assignment" "app_acr_pull" {
  scope                = azurerm_container_registry.this.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_container_app.app.identity[0].principal_id
}
```

### 4.7 DNS (and optional Front Door)

```hcl
resource "azurerm_dns_zone" "this" {
  name                = var.dns_zone_name      # yourdomain.com
  resource_group_name = azurerm_resource_group.this.name
}

resource "azurerm_dns_cname_record" "app" {
  name                = "app"                  # app.yourdomain.com
  zone_name           = azurerm_dns_zone.this.name
  resource_group_name = azurerm_resource_group.this.name
  ttl                 = 300
  record              = azurerm_container_app.app.latest_revision_fqdn
}
```

The custom-domain + managed-certificate binding on the Container App can be managed by the `azurerm_container_app_custom_domain` resource in recent provider versions (verify availability in your provider version — NEEDS VERIFICATION) or applied once via portal/CLI per `manual-deployment.md` §8.2. A Front Door profile (`azurerm_cdn_frontdoor_profile/endpoint/origin_group/origin/route`) with **caching disabled** on the main route is the OPTIONAL global edge — see [`networking.md`](./networking.md) §6.

---

## 5. Variables and tfvars

`variables.tf` (excerpt):

```hcl
variable "subscription_id"    { type = string }
variable "location"           { type = string, default = "eastus2" }
variable "project"            { type = string, default = "acquisitionos" }
variable "resource_group_name" { type = string }
variable "acr_name"           { type = string }
variable "key_vault_name"     { type = string }
variable "app_hostname"       { type = string }   # app.yourdomain.com
variable "dns_zone_name"      { type = string }
variable "image"              { type = string }
variable "postgres_sku"       { type = string, default = "GP_Standard_D2ds_v4" }
variable "backup_retention_days" { type = number, default = 14 }
variable "geo_redundant_backup"  { type = bool, default = false }

variable "database_url" { type = string, sensitive = true }
variable "jwt_secret"   { type = string, sensitive = true }
```

`terraform.tfvars` handling:

- Non-secret values (`location`, `postgres_sku`, hostnames) may live in a committed `terraform.tfvars`.
- **Secrets never do.** Supply them as environment variables — `TF_VAR_database_url`, `TF_VAR_jwt_secret` — from your local shell or from CI using OIDC + Key Vault reads, or pass `-var` interactively.
- Keep a committed `terraform.tfvars.example` with empty strings as documentation.
- Add `*.tfvars` (except the example) and `.terraform/` to `.gitignore`. Never commit `terraform.tfstate*` either.

---

## 6. Commands — and state security

```bash
cd environments/production

terraform init -backend-config=backend.hcl     # first time / after backend change
terraform fmt -recursive                        # canonical formatting
terraform validate                              # syntax + type check
terraform plan -out=tfplan                      # preview: "+ create / ~ update / - destroy"
terraform apply tfplan                          # execute exactly what was planned
terraform output                                # print outputs (app FQDN, KV uri, ...)
```

**State security checklist:**

- Storage account: `allow_blob_public_access = false`, **versioning enabled** (rollback for state corruption), soft delete for blobs on, and (OPTIONAL) network rules limiting access to your IPs / CI subnet.
- One state key per environment; never share state between dev and production.
- Local state (no backend) is for throwaway experiments only — it stores secrets in **plaintext** on disk.
- `sensitive = true` on secret variables and outputs keeps them out of plan logs, not out of state. Protect the state file itself accordingly.

### When NOT to destroy

- **Never** `terraform destroy` a production environment: `deletion_protection_enabled = true` on PostgreSQL and purge-protected Key Vault will (should) refuse, but the destroy plan would also delete the Container App and DNS. Decommissioning production is a **manual, reviewed, backed-up** operation: export backups ([`../04-database-production.md`](../04-database-production.md) §7), verify the restore, then destroy.
- Destroy is legitimate for **dev/throwaway stacks** — that is why they live in separate state keys.
- `az group delete` on `rg-tfstate` deletes the state itself — the last-resort escape hatch, not a tool.

---

## 7. CI/CD — OIDC with azure/login@v2 (no static secrets)

**Goal:** GitHub Actions logs into Azure via **federated identity** (short-lived tokens), runs `terraform plan` on pull requests, and applies only after a human approval on the `production` **GitHub Environment**. Static service-principal secrets never exist to leak (pattern from [`../05-cicd.md`](../05-cicd.md) §3).

### 7.1 One-time setup

```bash
# 1) App registration + service principal
APP_ID=$(az ad app create --display-name "github-acquisitionos" --query appId -o tsv)
OBJECT_ID=$(az ad sp create --id "$APP_ID" --query id -o tsv)

# 2) Federated credential for the production GitHub Environment
az ad app federated-credential create --id "$APP_ID" --parameters '{
  "name": "gh-production",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:YOUR_ORG/YOUR_REPO:environment:production",
  "audiences": ["api://AzureADTokenExchange"]
}'

# 3) Least-privilege role: Contributor on the deployment resource group
az role assignment create \
  --assignee-object-id "$OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role Contributor \
  --scope "/subscriptions/YOUR_SUBSCRIPTION_ID/resourceGroups/rg-acquisitionos"
```

Add another federated credential per environment (`...:environment:staging`, `...:ref:refs/heads/main` for PR plans) as needed. GitHub secrets to store (non-secret identifiers only): `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`.

### 7.2 Workflow shape

```yaml
name: terraform
on:
  pull_request:
    paths: ["terraform/**"]
  push:
    branches: [main]
    paths: ["terraform/**"]

permissions:
  id-token: write     # OIDC
  contents: read
  pull-requests: write

jobs:
  plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
      - uses: hashicorp/setup-terraform@v3
      - run: terraform init -backend-config=backend.hcl
        working-directory: terraform/environments/production
      - run: terraform fmt -check -recursive && terraform validate
        working-directory: terraform/environments/production
      - run: terraform plan -out=tfplan
        working-directory: terraform/environments/production

  apply:
    needs: plan
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: production          # required reviewers configured in GitHub
    steps:
      - uses: actions/checkout@v4
      - uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
      - uses: hashicorp/setup-terraform@v3
      - run: terraform init -backend-config=backend.hcl
        working-directory: terraform/environments/production
      - run: terraform apply -auto-approve
        working-directory: terraform/environments/production
```

**Safety rails (from [`../05-cicd.md`](../05-cicd.md)):** `apply` runs only from `main`, behind the `production` GitHub Environment with required reviewers; a concurrency guard prevents racing applies; and there is **no `terraform destroy` anywhere in CI**.

---

## 8. Where manual steps remain

Terraform does not cover everything — keep these as documented runbook steps:

1. `app_user` + grants SQL (§4.3 note).
2. `npx prisma db push --schema=prisma/schema.production.prisma` after the first apply ([`database.md`](./database.md) §8).
3. Key Vault secret *values* when you choose not to put them in tfvars (set once via `az keyvault secret set`, or via CI).
4. The 15 cron schedules (Functions/Container Apps Jobs) — treat as app config, documented in [`manual-deployment.md`](./manual-deployment.md) §9.
5. Registrar nameserver delegation to the Azure DNS zone (`manual-deployment.md` §8.1).

## 9. Official Documentation

- azurerm provider registry page — https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs
- azurerm backend (state, lease locking) — https://developer.hashicorp.com/terraform/language/backend/azurerm
- Container Apps on Terraform (`azurerm_container_app`) — https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/container_app
- PostgreSQL Flexible Server resource — https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/postgresql_flexible_server
- Azure/GitHub Actions OIDC login — https://learn.microsoft.com/azure/developer/github/
- GitHub Actions: configuring OpenID Connect in Azure — https://learn.microsoft.com/azure/developer/github/connect-from-azure
