# Azure Prerequisites — Account, Costs, CLI, Access

Everything you need before the first Azure resource exists. Work through this page once; it takes about 30–60 minutes.

---

## 1. What you need before Azure

| Need | Where it comes from |
| --- | --- |
| A credit card (or invoiced account) | For the Azure subscription |
| A Microsoft account or Entra ID account | You create this when signing up |
| A domain you control | Purchased at any registrar — [`../06-dns-and-domains.md`](../06-dns-and-domains.md) |
| Your laptop with a terminal | Azure CLI runs on macOS, Linux, Windows |
| Git + Docker locally | Image build — [`../03-docker.md`](../03-docker.md) |

---

## 2. Account, tenant, subscription (What → Why → How → Verify)

**What:** an Azure *tenant* (Entra ID directory) holds your identity; a *subscription* is the billing and resource container. Resources live in *resource groups* inside a subscription.

**Why (for AcquisitionOS):** one subscription is enough to start. Everything in this guide goes into one resource group in one region, so costs and permissions stay easy to reason about.

**How (beginner path):**

1. Go to https://portal.azure.com and sign up (a free account with a start credit works; production should use a Pay-As-You-Go subscription).
2. In the portal search bar type **Subscriptions** → confirm you have one, and note its **Subscription ID** (a GUID). This is your `YOUR_SUBSCRIPTION_ID` used throughout this folder.
3. Note your **tenant** (shown as Directory in the portal). Most single-team setups never need more than the default tenant.

**Verify:**

```bash
az account show --query "{name:name, id:id, tenantId:tenantId}"
```

(Install the CLI first if needed — §4.)

---

## 3. Cost Management: budgets and alerts

**What:** Azure Cost Management lets you create a **budget** (monthly spending limit) with **alerts** at thresholds.

**Why (for AcquisitionOS):** the always-on pieces (PostgreSQL Flexible Server, Container App with min 1 replica, Log Analytics) bill continuously. A budget alert is your smoke detector, not a spending cap.

**How (portal, recommended):**

1. Portal → search **Cost Management + Billing** → **Cost Management** → select your subscription.
2. **Budgets** → **+ Add** → name `acquisitionos-monthly`.
3. Amount: start with a number you are comfortable with (e.g. 200 USD/month for a small staging+prod footprint; Flexible Server is the biggest line item — see [`database.md`](./database.md) §3).
4. Alert conditions: 50%, 80%, 100% → email the owners group.

**How (CLI, optional):**

```bash
az consumption budget create \
  --budget-name acquisitionos-monthly \
  --amount 200 \
  --category Cost \
  --time-grain Monthly \
  --time-period start-date=$(date +%Y-%m-%d) end-date=$(date -d "+1 year" +%Y-%m-%d)
```

Exact flag behavior varies across CLI versions — verify with `az consumption budget create --help`. NEEDS VERIFICATION for end-date semantics.

**Verify:** Cost Management → Budgets shows the budget; you receive the threshold emails when spend crosses them.

---

## 4. Install the Azure CLI and log in

**What:** `az` is the command-line for everything in `manual-deployment.md`.

**Why:** the whole deployment can be driven from the CLI, which is copy-pasteable, reviewable, and repeatable.

**How:**

```bash
# macOS (Homebrew)
brew install azure-cli

# Ubuntu/Debian
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Windows (winget)
winget install Microsoft.AzureCLI
```

Log in and set the default subscription:

```bash
az login
# browser opens; sign in with the account from §2

export SUBSCRIPTION_ID="YOUR_SUBSCRIPTION_ID"   # from §2 / portal → Subscriptions
az account set --subscription "$SUBSCRIPTION_ID"
```

**Verify:**

```bash
az version                              # CLI installed
az account show --query name -o tsv    # prints your default subscription
```

---

## 5. Resource groups

**What:** a logical container for related Azure resources. Deleting the group deletes everything in it.

**Why (for AcquisitionOS):** one group per environment (`rg-acquisitionos`, later `rg-acquisitionos-staging`) means one command cleans up an experiment and the billing view stays tidy.

**How (you will run this again in `manual-deployment.md` §1 — shown here to explain it):**

```bash
export AZ_LOCATION="eastus2"     # primary region — see §6
export RG="rg-acquisitionos"

az group create --name "$RG" --location "$AZ_LOCATION"
```

**Expected output:** JSON with `provisioningState: Succeeded`.

**Verify:** `az group list --query "[].name" -o tsv` includes `rg-acquisitionos`.

> Caution: `az group delete` removes **everything** in the group, including the database. Treat the group name as a production boundary.

---

## 6. Regions and region pairs

**What:** an Azure *region* is a physical datacenter location. Regions are organized in *pairs* for some disaster-recovery features.

**Why (for AcquisitionOS):** choose **one primary region** close to your users; deploy *all* resources there so latency and egress stay low and the deployment is simple. For this handbook the example region is **`eastus2`** (wide service availability); **`swedencentral`** is an equally good example for European users. Single-region + backups + restore drills is the correct starting posture for this app; multi-region is FUTURE/ALTERNATIVE.

**How:** pick a region and check it offers what you need before committing:

```bash
az account list-locations --query "[?name=='eastus2'].{name:name, display:displayName}" -o table
```

Check Flexible Server availability zones / HA support for your chosen region in Microsoft's docs before enabling zone-redundant HA ([`database.md`](./database.md) §4).

**Region pairs:** some Azure services use the *paired* region for geo-redundancy (for example geo-redundant PostgreSQL backups or storage replication). The authoritative, current list of pairs is Microsoft's "Cross-region replication in Azure" page — verify there before relying on a specific pairing (NEEDS VERIFICATION for any specific pair, since the list changes as new regions launch). For this handbook's defaults, geo-redundant backup is optional; see [`database.md`](./database.md) §5.

---

## 7. RBAC in five minutes (Owner vs Contributor vs Reader)

**What:** Azure RBAC (role-based access control) decides who can manage which resources. Key built-in roles:

| Role | Can do | Use for |
| --- | --- | --- |
| **Owner** | Everything, **including granting access** | The person bootstrapping the deployment (likely you) |
| **Contributor** | Create and manage everything **except** granting access | Day-to-day operators and CI deploy identities |
| **Reader** | View only | Auditing, dashboards, interns |
| **Key Vault Secrets User** | *Read* secret values from a Key Vault using the RBAC data-plane model | The Container App's Managed Identity — REQUIRED for `secretref` |
| **AcrPull** | Pull images from ACR | The Container App's Managed Identity |

**Why (for AcquisitionOS):** you operate as Owner/Contributor; the **app itself** runs as a Managed Identity with only `AcrPull` (registry) + `Key Vault Secrets User` (secrets). That is least privilege: no database admin rights, no billing, no group management.

**How (check your own access):**

```bash
az role assignment list --assignee "$(az ad signed-in-user show --query id -o tsv)" \
  --output table
```

**Verify:** you can create a resource group (§5). Creating resources requires at least Contributor at subscription or resource-group scope.

---

## 8. Resource provider registration

**What:** each Azure service family has a *resource provider* (`Microsoft.App`, `Microsoft.DBforPostgreSQL`, …). Most are auto-registered on first use; occasionally one must be registered manually.

**Why:** if `az ... create` fails with *"subscription is not registered to use namespace 'Microsoft.App'"*, this is the fix.

**How — check and register the providers this guide uses:**

```bash
for p in Microsoft.App Microsoft.ContainerRegistry Microsoft.DBforPostgreSQL \
         Microsoft.KeyVault Microsoft.Network Microsoft.OperationalInsights \
         Microsoft.Insights Microsoft.Storage Microsoft.Web; do
  state=$(az provider show -n "$p" --query registrationState -o tsv 2>/dev/null)
  echo "$p: ${state:-not registered}"
done
```

Register any that are not `Registered`:

```bash
az provider register --namespace Microsoft.App
```

**Verify:** re-run the loop; every line says `Registered` (registration can take a few minutes).

---

## 9. Quotas

**What:** subscriptions have per-region capacity limits (vCPUs, instances).

**Why (for AcquisitionOS):** the relevant ones are Container Apps' regional vCPU quota and PostgreSQL Flexible Server's vCore limit per subscription per region. The starting footprint (1–5 app replicas at 0.5–1 vCPU, one D2ds_v4 database) sits far below typical defaults, but a *"QuotaExceeded"* error means you raise it.

**How:**

```bash
# Container Apps environment quota for a region (usage + limit)
az network list-usages --location "$AZ_LOCATION" --output table
```

Raise or check app-specific quotas in the portal: search **Quotas** → Container Apps → your region. For PostgreSQL vCore limits see https://learn.microsoft.com/azure/postgresql/flexible-server/concepts-limits (NEEDS VERIFICATION for current per-SKU numbers — always confirm there).

**Verify:** after creating resources, the portal's resource pages show them healthy — that is the practical quota check.

---

## 10. Prerequisites checklist

```text
[ ] Subscription created; Subscription ID recorded (YOUR_SUBSCRIPTION_ID)
[ ] Budget + 50/80/100% alerts created
[ ] Azure CLI installed; az login works; default subscription set
[ ] Primary region chosen (example eastus2 or swedencentral)
[ ] You (or your group) hold Owner or Contributor on the subscription
[ ] Resource providers from §8 all show Registered
[ ] Domain purchased and ready (for later DNS steps)
[ ] Read ../02-environment-variables-and-secrets.md — know which secrets you must generate
```

Next: [`manual-deployment.md`](./manual-deployment.md) — the full deployment, step by step.
