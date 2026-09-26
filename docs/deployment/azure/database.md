# Database on Azure — PostgreSQL Flexible Server for AcquisitionOS

Everything specific to Azure Database for PostgreSQL **Flexible Server**. Cross-cloud database concepts (dev-SQLite → prod-PostgreSQL, `db push` vs `migrate deploy`, expand→migrate→contract changes, restore drills) live in [`../04-database-production.md`](../04-database-production.md) — read it first; this page tells you how Azure implements each piece.

---

## 1. What you are creating

One Flexible Server (`pg-acquisitionos`) in your resource group, one database (`acquisitionos`), one least-privilege login (`app_user`), TLS enforced, automated backups with PITR. The app gets two connection strings: `DATABASE_URL` (runtime) and `DIRECT_URL` (schema operations) — both stored in Key Vault.

---

## 2. Create the server

### Portal

1. Portal → **Create a resource** → **Azure Database for PostgreSQL Flexible Server**.
2. Subscription/resource group → server name `pg-acquisitionos` → region = your primary region → PostgreSQL **16**.
3. Workload type: **Production — small** (GeneralPurpose, 2 vCores) or pick **Burstable** for staging.
4. High availability: **Disabled** to start (§4). Backups: retention 14 days, geo-redundancy off (§5).
5. Admin: `pgadmin` + a generated password (`openssl rand -hex 24`) — you will never use it in the app.
6. Networking: **Public access** with firewall rules (§7) — private access only if you planned the VNet path ([`networking.md`](./networking.md) §3).

### CLI (same settings)

```bash
az postgres flexible-server create \
  --resource-group "$RG" --name "$PG" --location "$AZ_LOCATION" \
  --tier GeneralPurpose --sku-name Standard_D2ds_v4 \
  --storage-size 128 --storage-autogrow Enabled \
  --version 16 \
  --admin-user pgadmin --admin-password "$PG_ADMIN_PASSWORD" \
  --database-name acquisitionos \
  --backup-retention 14 --geo-redundant-backup Disabled \
  --high-availability Disabled \
  --public-access "$YOUR_IP"
```

**Expected output:** JSON with `"state": "Ready"` (5–10 minutes) and `fullyQualifiedDomainName`.

**Verify:** `az postgres flexible-server show -g "$RG" -n "$PG" --query "{state: state, fqdn: fullyQualifiedDomainName, version: version}"`.

---

## 3. Sizing tiers

| Tier | Purpose | For AcquisitionOS |
| --- | --- | --- |
| **Burstable** (B1ms/B2s) | Dev, staging, tiny traffic | Good default for **staging** |
| **GeneralPurpose** (D2ds_v4 = 2 vCPU / 8 GiB) | Production workloads | REQUIRED-adjacent default for production start (see [`../04-database-production.md`](../04-database-production.md) §2: 2 vCPU / 4–8 GB is realistic) |
| BusinessCritical | High IOPS / HA pair by default | FUTURE/ALTERNATIVE — upgrade when metrics say so |

Scale **up** (vCPU/RAM) is a quick portal/CLI change with a short restart. Watch the metrics (§12) rather than guessing.

---

## 4. High availability (zone-redundant) — the trade-off

- **What it is:** a standby in a second availability zone with synchronous replication; automatic failover.
- **What it costs:** roughly **2x database compute/billing**, and a small write-latency penalty.
- **For AcquisitionOS:** start with `--high-availability Disabled`. Your RPO/RTO targets (5–15 min data loss / ≤1 h recovery per [`../04-database-production.md`](../04-database-production.md) §7) are met by backups + PITR alone. Add ZoneRedundant HA when downtime costs more than the second DB — revisit after launch.

```bash
# enabling later (brief failover/restart involved)
az postgres flexible-server update -g "$RG" -n "$PG" --high-availability ZoneRedundant
```

Check zone support for your region first (NEEDS VERIFICATION per region — see the Flexible Server docs).

---

## 5. Backups and PITR

- Automated daily full backups + WAL archiving give **point-in-time recovery** to any second in the retention window.
- Retention: **7–35 days** (`--backup-retention 14` in this handbook). Set ≥ 7.
- **Geo-redundant backup** (`--geo-redundant-backup Enabled`) copies backups to the paired region — OPTIONAL; costs more; decide per your DR posture (region-pair list: verify in Microsoft's docs, see [`prerequisites.md`](./prerequisites.md) §6).
- A restore creates a **new server** — original remains untouched:

```bash
# PITR to 15 minutes ago
az postgres flexible-server create --restore-time "$(date -u -d '-15 minutes' +%Y-%m-%dT%H:%M:%SZ)" \
  --source-server "$PG" -g "$RG" -n "$PG-restored"
```

**Verify backups for real:** run one restore drill before launch and quarterly (per [`../04-database-production.md`](../04-database-production.md) §7). Time it — that duration is your measured RTO.

---

## 6. Maintenance window

**What:** Microsoft patches the server in a weekly window you control.

```bash
az postgres flexible-server update -g "$RG" -n "$PG" \
  --maintenance-window "Sun:05:00"      # day:startHour UTC (NEEDS VERIFICATION: exact format per docs)
```

**Why:** patching can restart the server. Pick your quietest period (e.g. Sunday early UTC morning). The app reconnects automatically (Prisma pool), but don't schedule it during your busiest hour.

---

## 7. Networking

Two supported shapes (detailed comparison and the private-endpoint variant in [`networking.md`](./networking.md) §3):

1. **Public access + firewall rules** (handbook default):
   ```bash
   az postgres flexible-server firewall-rule create -g "$RG" -n "$PG" \
     --rule-name my-machine --start-ip-address "$YOUR_IP" --end-ip-address "$YOUR_IP"
   az postgres flexible-server firewall-rule create -g "$RG" -n "$PG" \
     --rule-name azure-services --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0
   ```
   The `0.0.0.0` rule admits Azure-origin traffic (your Container App). TLS + `app_user` least privilege carry the security load.
2. **Private access (VNet / private endpoint):** strongest isolation; requires the VNet-integrated Container Apps environment.

**Verify:** `az postgres flexible-server firewall list -g "$RG" -n "$PG" -o table`.

---

## 8. TLS enforcement

Flexible Server **enforces TLS by default** (`require_secure_transport` semantics); connections without SSL fail. Keep it that way, and make it explicit in every connection string with `sslmode=require`:

```text
postgresql://app_user:PASSWORD@pg-acquisitionos.postgres.database.azure.com:5432/acquisitionos?sslmode=require
```

The repo's `prisma/schema.production.prisma` reads `DATABASE_URL` + `DIRECT_URL` — both include `sslmode=require`. Never weaken it; the JWT cookies and DB contents both depend on encrypted transport.

---

## 9. Admin vs `app_user` (least privilege)

Run as `pgadmin` once (full SQL with explanation: [`manual-deployment.md`](./manual-deployment.md) §3.1; pattern from [`../04-database-production.md`](../04-database-production.md) §2):

```sql
CREATE ROLE app_user WITH LOGIN PASSWORD 'REPLACE_WITH_DB_APP_PASSWORD';
GRANT CONNECT ON DATABASE acquisitionos TO app_user;
\c acquisitionos
GRANT USAGE, CREATE ON SCHEMA public TO app_user;   -- CREATE: prisma db push needs it
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
GRANT USAGE, CREATE ON ALL SEQUENCES IN SCHEMA public TO app_user;
```

- `pgadmin` = server control (settings, users, restart). Never used by the app.
- `app_user` = data plane only: DML + schema sync. This is the login in both connection strings.
- Note: on Flexible Server the admin is a member of `azure_pg_admin`, which is *not* a true PostgreSQL superuser — the grants above are sufficient (verified pattern; if a grant fails, connect as admin and re-run that statement).

---

## 10. Connection strings (DATABASE_URL + DIRECT_URL)

Flexible Server has **no built-in connection pooler** (unlike some providers) — pooling is handled client-side by Prisma's `connection_limit`, which is correct for Container Apps' handful of long-lived instances (per [`../04-database-production.md`](../04-database-production.md) §5). External poolers (PgBouncer, pgpool) are OPTIONAL/FUTURE.

```text
DATABASE_URL="postgresql://app_user:PASSWORD@pg-acquisitionos.postgres.database.azure.com:5432/acquisitionos?sslmode=require&connection_limit=10&pool_timeout=20"
DIRECT_URL="postgresql://app_user:PASSWORD@pg-acquisitionos.postgres.database.azure.com:5432/acquisitionos?sslmode=require"
```

- `DATABASE_URL` → the running app (`connection_limit=10` per replica).
- `DIRECT_URL` → `prisma db push`/migrations, one-shot.
- Both go to Key Vault (`database-url`, `direct-url`) — see [`secrets.md`](./secrets.md) §3.

---

## 11. `prisma db push` procedure

From your machine (firewall `my-machine`) or CI, after the server/database exist:

```bash
cd /path/to/acquisitionos
export DIRECT_URL="postgresql://app_user:PASSWORD@pg-acquisitionos.postgres.database.azure.com:5432/acquisitionos?sslmode=require"
npx prisma db push --schema=prisma/schema.production.prisma
```

**Expected:** `The database is now in sync with your Prisma schema.` Then verify: `psql "$DIRECT_URL" -c "\dt" | head` and the app's `/api/health` flips `database` to healthy. Destructive-change safety rules: [`../04-database-production.md`](../04-database-production.md) §4–6 (never mix `db push` and `migrate deploy`; `--accept-data-loss` means stop).

---

## 12. `max_connections` and the connection budget

Check the current value:

```bash
az postgres flexible-server parameter show -g "$RG" -n "$PG" -m max_connections \
  --query "{value: value, default: defaultValue}" -o table
```

Budget formula ([`../04-database-production.md`](../04-database-production.md) §5):

```text
connections_needed ≈ (app_replicas × connection_limit)   # 5 × 10 = 50
                   + scheduler + one-off jobs + admin margin (~10)
keep connections_needed < max_connections × 0.8
```

The D2ds_v4 default `max_connections` comfortably covers `min 1 / max 5` replicas at `connection_limit=10`. If you scale replicas up, either raise `connection_limit` per instance carefully or raise the SKU. Change `max_connections` only with the formula in hand — it is not free (each connection costs RAM).

---

## 13. Query Store and the performance dashboard

- **Query Store** is available on Flexible Server and is **enabled by default** — it records query plans and runtime stats; inspect them in the portal: server → **Query Performance Insight** (and **Performance diagnostics**). Find the slow leads/workflows queries there before adding indexes ([`../04-database-production.md`](../04-database-production.md) §8: high-volume tables like `Lead`, `WorkflowRun`, `Notification`).
- `pg_stat_statements` can be enabled via server parameters as the SQL-level alternative (NEEDS VERIFICATION for the parameter name on Flexible Server — the portal's performance page documents it).

---

## 14. Metric alerts

Portal → server → **Metrics** / **Alerts**; CLI sketch:

```bash
az monitor metrics alert create -g "$RG" -n pg-connections-high \
  --scopes "$(az postgres flexible-server show -g "$RG" -n "$PG" --query id -o tsv)" \
  --condition "avg connections_active > 80" --window-size 5m --evaluation-frequency 1m \
  --action YOUR_ACTION_GROUP
```

Alert rules worth setting on day one (mirrors [`../04-database-production.md`](../04-database-production.md) §8):

| Metric | Condition | Meaning |
| --- | --- | --- |
| `connections_active` | > 80% of budget | Pool leak or under-sized instance |
| `cpu_percent` | avg > 80% for 10 min | Sustained load / slow queries |
| `storage_percent` | > 75% | Autogrow is a cushion, not a plan |
| `connections_failed` | any sustained | Auth/firewall/TLS problem |

Exact metric names may vary slightly (NEEDS VERIFICATION per metrics reference) — pick them from the portal's metric picker.

---

## 15. Checklist

```text
[ ] Server created (GeneralPurpose D2ds_v4, version 16, region = primary)
[ ] Storage autogrow Enabled; maintenance window off-peak
[ ] HA decision made (start Disabled; revisit with cost justification)
[ ] Backup retention >= 7 (handbook: 14); geo-redundant decided
[ ] Firewall: your IP + azure-services only; nothing broader
[ ] TLS enforced; sslmode=require in both URLs
[ ] app_user least-privileged; pgadmin never used by the app
[ ] DATABASE_URL + DIRECT_URL in Key Vault (database-url, direct-url)
[ ] prisma db push succeeded; /api/health database healthy
[ ] max_connections budget checked against replicas × connection_limit
[ ] Metric alerts: connections, CPU, storage
[ ] Restore drill done once; RTO recorded
```

## 16. Official Documentation

- Flexible Server overview — https://learn.microsoft.com/azure/postgresql/flexible-server/
- Networking & private access — https://learn.microsoft.com/azure/postgresql/flexible-server/concepts-networking
- Backups & PITR — https://learn.microsoft.com/azure/postgresql/flexible-server/concepts-backup-restore
- High availability — https://learn.microsoft.com/azure/postgresql/flexible-server/concepts-high-availability
- Server parameters (incl. `max_connections`) — https://learn.microsoft.com/azure/postgresql/flexible-server/concepts-parameter-exceptions
- Monitoring & Query Performance Insight — https://learn.microsoft.com/azure/postgresql/flexible-server/concepts-monitoring
