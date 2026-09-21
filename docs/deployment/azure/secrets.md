# Secrets on Azure — Key Vault + Managed Identity for AcquisitionOS

Every secret AcquisitionOS needs lives in **Azure Key Vault**; the app reads them at deploy/start time through its **system-assigned Managed Identity** — no secret ever sits in Git, in the image, or in a CI variable. The authoritative inventory is [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md); this page shows the Azure mechanics for each group.

---

## 1. Why Key Vault for this app

| AcquisitionOS fact | Consequence on Azure |
| --- | --- |
| `JWT_SECRET` signs auth cookies; DB/payment/AI keys are credentials | All belong in a vault, not in env files or images |
| Only `NEXT_PUBLIC_*` values are browser-safe | Build-time vars are the only ones you may keep as plain CI variables |
| The app reads `process.env` at runtime | Container Apps injects vault values as normal env vars via `secretref` |
| Sessions depend on `JWT_SECRET` staying stable | Rotation = users re-login; plan it, don't improvise it (§6) |

---

## 2. Create the vault — RBAC model vs access-policy model

**What:** Key Vault has two permission models. **RBAC** (recommended, and used by this handbook) manages vault *and* secret access with standard Azure roles; the older **access-policy** model uses vault-local policies.

**Recommendation:** RBAC model. It lets one mechanism (role assignments) govern everything, which is easier to audit.

```bash
az keyvault create --name "$KV" --resource-group "$RG" --location "$AZ_LOCATION" \
  --enable-rbac-authorization true \
  --enable-purge-protection true
# Expected: JSON with vaultUri "https://<KV>.vault.azure.net/"
```

With the RBAC model, **you** also need a data-plane role before writing secrets (Owner alone is not enough for secrets):

```bash
az role assignment create \
  --assignee "$(az ad signed-in-user show --query id -o tsv)" \
  --role "Key Vault Administrator" \
  --scope "$(az keyvault show -n "$KV" --query id -o tsv)"
# wait ~5 minutes for propagation, then set secrets
```

**Verify:** `az keyvault show -n "$KV" --query "{uri: properties.vaultUri, rbac: properties.enableRbacAuthorization, purge: properties.enablePurgeProtection}"`.

---

## 3. The full variable inventory → vault secrets

Key Vault names allow letters, digits, hyphens only — the mapping is `JWT_SECRET` → `jwt-secret`, etc. Values marked *build-time* are **not** vault material (see §4). Generate hex secrets with `openssl rand -hex 32`.

### 3.1 Critical — REQUIRED

```bash
az keyvault secret set --vault-name "$KV" --name database-url --value "$DATABASE_URL"
az keyvault secret set --vault-name "$KV" --name direct-url   --value "$DIRECT_URL"
az keyvault secret set --vault-name "$KV" --name jwt-secret   --value "$JWT_SECRET"
```

- `database-url` → `DATABASE_URL` (pooled, `sslmode=require&connection_limit=10`)
- `direct-url` → `DIRECT_URL` (migrations; [`database.md`](./database.md) §10)
- `jwt-secret` → `JWT_SECRET`

Also REQUIRED but non-secret (plain Container App env vars, **not** in the vault): `APP_PUBLIC_URL`, `NEXT_PUBLIC_APP_URL` (build-time), `NODE_ENV`. `AUTH_DEV_MODE` stays unset in production.

### 3.2 Scheduler + encryption — REQUIRED

```bash
az keyvault secret set --vault-name "$KV" --name cron-secret    --value "$CRON_SECRET"
az keyvault secret set --vault-name "$KV" --name encryption-key --value "$ENCRYPTION_KEY"   # REQUIRED if you use credential encryption
az keyvault secret set --vault-name "$KV" --name gmail-cron-key --value "$GMAIL_CRON_API_KEY" # if Gmail pull mode is used
```

### 3.3 Email (SMTP or Resend) — REQUIRED for email auth

```bash
az keyvault secret set --vault-name "$KV" --name smtp-password  --value "$SMTP_PASSWORD"
az keyvault secret set --vault-name "$KV" --name resend-api-key --value "$RESEND_API_KEY"   # only if using Resend
```

Plain env vars (non-secret): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_FROM`.

### 3.4 Payments — REQUIRED for billing

```bash
az keyvault secret set --vault-name "$KV" --name stripe-secret-key    --value "$STRIPE_SECRET_KEY"
az keyvault secret set --vault-name "$KV" --name stripe-webhook-secret --value "$STRIPE_WEBHOOK_SECRET"
az keyvault secret set --vault-name "$KV" --name razorpay-key-secret  --value "$RAZORPAY_KEY_SECRET"
az keyvault secret set --vault-name "$KV" --name razorpay-webhook-secret --value "$RAZORPAY_WEBHOOK_SECRET"
```

Plain env var: `STRIPE_PUBLISHABLE_KEY` (public by design).

### 3.5 Google — REQUIRED for Google sign-in / Gmail / discovery

```bash
az keyvault secret set --vault-name "$KV" --name google-client-secret --value "$GOOGLE_CLIENT_SECRET"
az keyvault secret set --vault-name "$KV" --name google-api-key       --value "$GOOGLE_API_KEY"
az keyvault secret set --vault-name "$KV" --name google-search-api-key --value "$GOOGLE_SEARCH_API_KEY"
az keyvault secret set --vault-name "$KV" --name serpapi-key          --value "$SERPAPI_KEY"   # if used
```

Plain env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_SEARCH_ENGINE_ID`, and (OPTIONAL Gmail push) `GMAIL_PUBSUB_TOPIC`, `GMAIL_PUBSUB_SUBSCRIPTION`, `GMAIL_PUBSUB_WEBHOOK_URL`.

### 3.6 AI provider — one REQUIRED in production

```bash
az keyvault secret set --vault-name "$KV" --name openai-api-key     --value "$OPENAI_API_KEY"
# or/and:
az keyvault secret set --vault-name "$KV" --name anthropic-api-key  --value "$ANTHROPIC_API_KEY"
az keyvault secret set --vault-name "$KV" --name openrouter-api-key --value "$OPENROUTER_API_KEY"
```

The built-in `z-ai` provider reads no keys; its availability outside the GLM sandbox is NEEDS VERIFICATION — always store at least one fallback key. Plain (optional) tuning vars: `OPENAI_MODEL`, `AI_DEFAULT_TIMEOUT_MS`, … (full list in [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §6).

### 3.7 OPTIONAL integrations

```bash
az keyvault secret set --vault-name "$KV" --name redis-url         --value "$REDIS_URL"
az keyvault secret set --vault-name "$KV" --name vapid-private-key --value "$VAPID_PRIVATE_KEY"
az keyvault secret set --vault-name "$KV" --name telegram-bot-token --value "$TELEGRAM_BOT_TOKEN"
```

Plain (non-secret) optionals: `VAPID_PUBLIC_KEY`, `TELEGRAM_WEBHOOK_URL`, `OTEL_*`, `LOG_LEVEL`, branding vars.

**Verify the whole set:** `az keyvault secret list --vault-name "$KV" --query "[].name" -o tsv` — every name above appears exactly once.

---

## 4. Managed Identity: what the app gets

**What:** a system-assigned identity is an Azure-managed identity bound to the Container App's lifecycle — Azure handles its credentials.

**Why (for AcquisitionOS):** the app needs exactly two data-plane powers: pull its image, read its secrets. Nothing else.

```bash
PRINCIPAL_ID=$(az containerapp show -n "$APP" -g "$RG" --query identity.principalId -o tsv)

az role assignment create --assignee-object-id "$PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal --role "Key Vault Secrets User" \
  --scope "$(az keyvault show -n "$KV" --query id -o tsv)"

az role assignment create --assignee-object-id "$PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal --role "AcrPull" \
  --scope "$(az acr show -n "$ACR" --query id -o tsv)"
```

**Verify:** `az role assignment list --assignee "$PRINCIPAL_ID" --output table` shows both roles. RBAC propagation can take minutes; a too-early revision start fails to resolve `secretref`s — wait and restart the revision.

---

## 5. Referencing secrets from the Container App (secretref)

The two-layer indirection: a Container App **secret** wraps a Key Vault URI; the app **env var** points at that secret.

```bash
az containerapp create \
  --secrets jwt-secret="keyvaultref:https://${KV}.vault.azure.net/secrets/jwt-secret,identityref:system" \
  --env-vars JWT_SECRET=secretref:jwt-secret ...
```

- `keyvaultref:<uri>,identityref:system` — resolve the vault secret **as the app's managed identity** (not yours).
- `secretref:<secret-name>` — inject it as the env var the app reads.
- Updating the vault value does **not** auto-refresh a running revision — after rotating, run:
  ```bash
  az containerapp revision restart -n "$APP" -g "$RG"
  ```
- `versionless_id` (used in Terraform, [`terraform.md`](./terraform.md) §4.5) means future vault updates apply on the next revision restart.

**Verify:** `az containerapp show -n "$APP" -g "$RG" --query "properties.template.containers[0].env"` lists every env var with `secretRef` where applicable — and no plaintext values.

---

## 6. Rotation guidance

| Secret | Rotation effect | How to rotate |
| --- | --- | --- |
| `JWT_SECRET` | **Invalidates all sessions** — every user re-logs in | Schedule a window; set new value in vault; restart revisions; confirm login works. Do it on suspected compromise, not casually |
| `DATABASE_URL` / `DIRECT_URL` password | App loses DB until updated | Create/alter `app_user` password in SQL → update both vault secrets → restart revisions → verify `/api/health` |
| `STRIPE_WEBHOOK_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Webhooks rejected until updated | New secret in provider dashboard → vault → restart |
| `SMTP_PASSWORD` / `RESEND_API_KEY` | OTP/magic-link emails fail until updated | Provider-side change → vault → restart |
| `CRON_SECRET` | Scheduler calls fail until scheduler updated | New value → vault → update Function App / Job config → restart |
| Provider API keys (Google/AI) | Feature degrades until updated | Provider-side rotation → vault → restart |

Rotation is safe to perform **live** (vault update + `az containerapp revision restart`) because the running app only re-reads env on revision start — but note the session/`CRON_SECRET` side effects above.

---

## 7. Soft delete and purge protection

- **Soft delete:** deleted vaults and secrets are recoverable for 7–90 days (default 90 vaults / 90 secrets). Reuse the same name only after purging or recovering.
- **Purge protection** (`--enable-purge-protection true`, set at creation): deleted items **cannot** be permanently purged during the retention window — ransomware/mistake protection. This handbook enables it on every vault.
- Recovering a secret: `az keyvault secret recover --vault-name "$KV" --name jwt-secret` (undelete) — or `az keyvault secret purge ...` only if purge protection is off.

**Verify:** `az keyvault show -n "$KV" --query "{softDelete: properties.enableSoftDelete, purge: properties.enablePurgeProtection}"`.

---

## 8. What never goes anywhere but the vault

Per the handling rules in [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §11:

- `.env*` files, key files, tokens — never in Git (`.gitignore` already excludes `.env*`).
- Never in Dockerfiles or baked `.env` in images ([`../03-docker.md`](../03-docker.md) §6.1).
- Never in GitHub repository variables/secrets where a vault reference can be used instead.
- Never in worklog/docs/Slack/pastes — this folder documents **names**, never values.
- In Terraform: secrets only via `TF_VAR_*` env vars or CI reads from the vault — not committed `terraform.tfvars` ([`terraform.md`](./terraform.md) §5).

---

## 9. Checklist

```text
[ ] Vault created: RBAC model, soft delete (90d), purge protection enabled
[ ] You hold Key Vault Administrator on the vault
[ ] All REQUIRED secrets stored (§3.1-3.6) with hyphenated names
[ ] App identity: Key Vault Secrets User + AcrPull, nothing more
[ ] Every app env var with a secret uses secretref — no plaintext values in CLI history
[ ] Rotation plan written for JWT_SECRET and CRON_SECRET (side effects known)
[ ] One rotation rehearsed end to end (vault set -> revision restart -> health check)
[ ] terraform.tfvars / .env / docs contain zero secret values
```

## 10. Official Documentation

- Key Vault overview — https://learn.microsoft.com/azure/key-vault/
- Key Vault security fundamentals (RBAC vs policies) — https://learn.microsoft.com/azure/key-vault/general/security-features
- Container Apps secrets (incl. Key Vault refs) — https://learn.microsoft.com/azure/container-apps/manage-secrets
- Managed identities overview — https://learn.microsoft.com/entra/identity/managed-identities-azure-resources/overview
- `az keyvault` CLI reference — https://learn.microsoft.com/cli/azure/keyvault
