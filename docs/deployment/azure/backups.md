# Backups on Azure — PostgreSQL, Config, Images, and What Is Not Covered

AcquisitionOS has exactly **one stateful REQUIRED component**: PostgreSQL Flexible Server. Everything else can be rebuilt from Git + ACR + Key Vault. This page covers what is backed up automatically, what you must do by hand, how a restore actually works (it always creates a **new server**), the drill that proves it, and the things that are deliberately **not** backed up. Cross-cloud concepts (RPO/RTO, expand→migrate→contract, restore drills) live in [`../04-database-production.md`](../04-database-production.md) §7 — that page is authoritative for targets; this one is the Azure mechanics.

---

## 1. What is backed up, by component

| Component | Backup mechanism | Where it lives | Notes |
| --- | --- | --- | --- |
| PostgreSQL data | Automated daily backups + WAL archiving → **PITR** | Azure-managed storage | REQUIRED — created with the server (`--backup-retention 14`) |
| Key Vault secrets | Vault **soft delete + purge protection** (enabled at creation) | The vault itself | Secrets are versioned; deletion is recoverable ([`secrets.md`](./secrets.md) §7) |
| Terraform state | Blob storage **versioning** on the state container | Storage account ([`terraform.md`](./terraform.md) §6) | Roll back IaC by restoring a blob version |
| ACR images | Every SHA tag you do not delete | The registry | Your application-rollback surface ([`rollback.md`](./rollback.md) §2) |
| `public/` uploads, invoices | **None — ephemeral by design** | Container filesystem | See §7; OPTIONAL Blob adoption is the fix |
| The app itself | Git + ACR | — | Redeployable from scratch ([`manual-deployment.md`](./manual-deployment.md)) |

---

## 2. Automated backups + PITR on Flexible Server

**What:** Flexible Server takes a full backup daily and continuously archives WAL, giving **point-in-time recovery to any second** within the retention window (7–35 days; the handbook sets **14**).

**Why PITR matters more than "backups":** the realistic disaster is not a datacenter fire — it is a bad `db push`, a buggy migration, or a misbehaving workflow writing wrong rows for an hour. PITR rewinds *data*, not just files.

```bash
az postgres flexible-server show -g "$RG" -n "$PG" \
  --query "{retention: storageBackup.backupRetentionDays, geo: storageBackup.geoRedundantBackup}" -o jsonc
```

**Expected output:** `backupRetentionDays: 14`, plus the geo-redundancy flag.

**Geo-redundant backup — the factual trade-off** (OPTIONAL):

| | `--geo-redundant-backup Disabled` (handbook start) | `Enabled` |
| --- | --- | --- |
| Protects against | Data errors, server loss | + regional outage |
| Restore options | PITR in-region | + **geo-restore** into the paired region |
| Cost | Included | Higher (cross-region storage) |
| Decision rule | Fine while RPO/RTO from [`../04-database-production.md`](../04-database-production.md) §7 (5–15 min / ≤ 1 h) are acceptable *in-region* | Turn on when regional-outage risk must be covered; the paired-region mapping is Microsoft's list — verify there (NEEDS VERIFICATION per [`prerequisites.md`](./prerequisites.md) §6) |

Enabling geo-redundancy later requires a server update with downtime — decide consciously either way.

**Verify a backup exists:** Portal → server → **Backups** lists completed backups; the only *real* proof is the drill (§5).

---

## 3. Manual safety point before a risky schema change

**What/Why:** before any migration you cannot fully reverse mentally, capture a restore point. Flexible Server has no separate "create on-demand backup now" button — use one of these two equivalent mechanisms:

- **A PITR bookmark (zero cost):** note the exact UTC timestamp — `date -u +%Y-%m-%dT%H:%M:%SZ` — right before the change. Because PITR covers any second in the window, that timestamp *is* your restore point.
- **A logical export (portable, cheap insurance):**

```bash
pg_dump --no-owner --format=custom "$DIRECT_URL" > aos-$(date +%F-%H%M).dump
# Expected: a file of tens of MB (schema + data); keep it out of Git and off shared drives
```

**Prefer a real restore copy for risky changes:** restore the current database to a **new server** (next §), point `db push` or the new app version at the copy, and rehearse. That is testing on a restored backup — the exact discipline [`../04-database-production.md`](../04-database-production.md) §6 asks for.

---

## 4. Restore procedure — step by step

**The rule:** a restore **always creates a new server**; the original is never touched in place. The restore's name matters — it becomes your new production database host.

**Step 1 — PITR restore to a new server:**

```bash
# 15 minutes ago (any second in the retention window works)
RESTORE_TIME=$(date -u -d '-15 minutes' +%Y-%m-%dT%H:%M:%SZ)
az postgres flexible-server create --restore-time "$RESTORE_TIME" \
  --source-server "$PG" -g "$RG" -n "$PG-restored"
# Expected: JSON with state Ready after several minutes; FQDN pg-acquisitionos-restored.postgres.database.azure.com
```

**Step 2 — verify the copy before touching anything:**

```bash
PGHOST="pg-acquisitionos-restored.postgres.database.azure.com"
psql "host=$PGHOST port=5432 dbname=acquisitionos user=app_user sslmode=require" \
  -c "\dt" | head -20                    # 53+ tables present
psql "... user=app_user sslmode=require" \
  -c "select count(*) from \"User\";"    # row counts sane for the point in time
```

(Check the admin-vs-`app_user` grants carried over — they replicate with the data; re-run the grant script from [`manual-deployment.md`](./manual-deployment.md) §3.1 if a grant is missing.)

**Step 3 — repoint the application:**

```bash
# build the two new connection strings with the -restored host and the same app_user password
# (or reset DB_APP_PASSWORD first if you prefer)
az keyvault secret set --vault-name "$KV" --name database-url \
  --value "postgresql://app_user:${DB_APP_PASSWORD}@${PGHOST}:5432/acquisitionos?sslmode=require&connection_limit=10"
az keyvault secret set --vault-name "$KV" --name direct-url \
  --value "postgresql://app_user:${DB_APP_PASSWORD}@${PGHOST}:5432/acquisitionos?sslmode=require"
az containerapp revision restart -n "$APP" -g "$RG"      # re-resolve secretrefs
```

**Step 4 — confirm and clean up:**

```bash
curl -s "https://app.yourdomain.com/api/health" | grep -o '"database":[^}]*}'   # healthy
az postgres flexible-server delete -g "$RG" -n "$PG"     # only after a soak period
```

Keep the old server (stopped billing = deleted; *kept* = costs money) for a short soak window if you can afford it, then delete. Firewall rules do **not** carry over silently — recreate `my-machine` + `azure-services` on the restored server before the app restarts ([`troubleshooting.md`](./troubleshooting.md) §Database connection failure).

---

## 5. Restore drills — the backup is real only after a restore

**Cadence:** once **before launch**, then **quarterly** (per [`../04-database-production.md`](../04-database-production.md) §7). Same procedure as §4, into a scratch name (`$PG-drill`), then delete it.

**Measure the RTO:** timestamp `start`/`end` around the drill. Realistic components: restore provisioning (minutes), verification, Key Vault update, revision restart. That measured number **is** your RTO — compare against the target:

| Term | Target for this app | Source |
| --- | --- | --- |
| **RPO** | 5–15 min (PITR granularity + WAL) | [`../04-database-production.md`](../04-database-production.md) §7 |
| **RTO** | ≤ 1 h (restore + repoint + verify) | same |

**Verify:** drill log entry in your runbook doc with the measured duration and any surprises (missing grants, firewall rules, Key Vault typos).

---

## 6. App-config backups: Key Vault and Terraform state

**Key Vault:** nothing to "back up" manually — secrets are **versioned** (old versions stay readable), and soft delete + purge protection (on by default in this handbook, [`secrets.md`](./secrets.md) §7) means a deleted secret or vault is recoverable within the retention window. Do **not** export secret values to files or repos to "be safe" — that creates the leak surface the vault exists to prevent. Recover a bad rotation by reading the **previous version**:

```bash
az keyvault secret list-versions --vault-name "$KV" --name jwt-secret -o table
az keyvault secret show --vault-name "$KV" --name jwt-secret --version <older-version-id> -o tsv
```

**Terraform state:** the azurerm backend stores state in a Blob container — enable **blob versioning** on that container so a corrupted/destroyed state file can be rolled back to a prior version ([`terraform.md`](./terraform.md) §6). Never hand-edit state.

---

## 7. What is NOT backed up — and the Blob adoption path

**Ephemeral `public/` uploads:** feedback uploads (`public/feedback-uploads/`) and generated invoices (`public/invoices/`) live on the container filesystem. They **vanish on every redeploy, scale-in, or restart** ([`../01-architecture.md`](../01-architecture.md) §2.5). No Azure backup covers them because they are not in a backed-up store.

**Consequences to decide on consciously:**

- During a §4 database restore-and-repoint, recent uploads on the *old* replicas are irrelevant — but uploads made before an earlier point-in-time never existed anywhere durable. If users start attaching files that matter, this becomes a data-loss bug.
- **OPTIONAL hardening — Blob Storage adoption:** store uploads in an Azure Storage container and serve via URL/presigned links. The app currently writes to local disk, so this needs a small code change (an object-storage adapter); until that lands, treat uploads as ephemeral and say so to users. Marked OPTIONAL in [`architecture.md`](./architecture.md) §1 — FUTURE/ALTERNATIVE until integrated.

---

## 8. ACR image retention as a rollback surface

**What:** your last-known-good *application* rollback is the previous ACR tag — as long as it still exists.

**Practice:** keep **≥ 10** recent `acquisitionos:<sha>` tags; never delete SHA tags on a schedule you have not thought through. (ACR Premium's retention policy auto-deletes *untagged* manifests — fine — but do not wire tag-purges against the repository while it is your only rollback surface.)

```bash
az acr repository show-tags --name "$ACR" --repository acquisitionos -o tsv | tail -10
```

**Verify:** `rollback.md` §2 can name the second-newest tag from memory — that is the retention working.

---

## 9. Disaster scenarios (factual, no panic)

| Scenario | What survives | Path to recovery |
| --- | --- | --- |
| Bad data / bad migration | Everything up to any second in the PITR window | §4 restore to new server, repoint (the §3 timestamp is your bookmark) |
| Accidental secret deletion | Vault soft delete | Recover deleted secret/vault (`az keyvault secret recover`) — [`secrets.md`](./secrets.md) §7 |
| Bad app deploy | Previous ACR tags + revisions | Application rollback — [`rollback.md`](./rollback.md) §2 (no DB involvement) |
| Server-level DB outage | Backups + WAL; HA standby if ZoneRedundant enabled ([`database.md`](./database.md) §4) | Azure fails over (HA) or you restore via §4 |
| **Region outage** | Backups only if **geo-redundant** (§2); ACR/images regional; Container Apps re-creatable | Recreate infrastructure in the paired region from Git + ACR + Key Vault (or geo-restored backups if enabled), repoint DNS ([`dns-ssl.md`](./dns-ssl.md)). Cross-region specifics (paired-region list, geo-restore support per feature) are Microsoft-doc-sourced and evolve — NEEDS VERIFICATION before relying on any specific pair/behavior |
| Key Vault/ACR/whole-RG deletion | Purge protection (vault), Git, your discipline | Recreate from `terraform apply` + §4 restore; DR checklist below |

**Why this is honest:** Container Apps, ACR, and Key Vault are quickly re-creatable from code — the *only* slow, irreplaceable asset is the database, which is why §2–§5 exist.

---

## 10. DR checklist

```text
[ ] Backup retention >= 7 (handbook 14); geo-redundancy decision made consciously
[ ] Pre-migration ritual documented: UTC timestamp + pg_dump (§3)
[ ] Restore procedure (§4) written down with YOUR server/vault/app names filled in
[ ] Firewall + grants re-creation included in the runbook (they do not carry over by magic)
[ ] Restore drill done before launch + quarterly; RTO measured and recorded
[ ] RPO/RTO targets acknowledged: 5-15 min / <= 1 h (04-database-production.md §7)
[ ] Key Vault: soft delete + purge protection on; rotation = new version, not delete (§6)
[ ] Terraform state blob versioning enabled (§6)
[ ] >= 10 recent ACR SHA tags retained (§8)
[ ] Uploads: ephemeral status communicated, or Blob adoption planned (§7)
[ ] Region-outage decision made: geo-redundant backups on or risk accepted (§2, §9)
```

## 11. Official Documentation

- Flexible Server backup + restore concepts — https://learn.microsoft.com/azure/postgresql/flexible-server/concepts-backup-restore
- `az postgres flexible-server` restore reference — https://learn.microsoft.com/cli/azure/postgres/flexible-server
- Key Vault soft delete & purge protection — https://learn.microsoft.com/azure/key-vault/general/soft-delete-overview
- Blob storage versioning (state backup pattern) — https://learn.microsoft.com/azure/storage/blobs/versioning-overview
- Cross-region replication / paired regions — https://learn.microsoft.com/azure/reliability/cross-region-replication-azure
- Shared targets & drills — [`../04-database-production.md`](../04-database-production.md) §7
