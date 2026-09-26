# GCP Backups & Disaster Recovery — Cloud SQL, Secrets, and What Is NOT Backed Up

A backup that has never been restored is a rumor. This page sets up the backups that matter for AcquisitionOS on GCP, gives a step-by-step restore procedure you can rehearse, and states plainly what is **not** covered — including the app's ephemeral `public/` uploads.

Database specifics (instance flags, HA trade-offs, connection budget) live in [`database.md`](./database.md); the handbook-wide backup policy and RPO/RTO targets live in [`../../04-database-production.md`](../04-database-production.md) §7 — this page follows both.

```bash
export PROJECT_ID="YOUR_PROJECT_ID"      # gcloud config get-value project
export REGION="us-central1"              # your deployment region
export DB_INSTANCE="acquisitionos-pg"    # Cloud SQL instance (manual-deployment.md step 8)
```

---

## 1. What can be lost, and what covers it

| Asset | Covered by | Cadence | Label |
| --- | --- | --- | --- |
| PostgreSQL data (53+ models) | Cloud SQL automated backups + PITR (§2) | continuous (WAL) + daily | `REQUIRED` |
| Pre-migration safety point | manual on-demand backup (§3) | before every risky migration | `REQUIRED` |
| Off-platform copy | logical export to GCS + download (§4) | weekly (or weekly-ish manual) | `REQUIRED`-recommended |
| Restore capability | quarterly restore drill (§6) | quarterly | `REQUIRED`-recommended |
| App config/secrets | Secret Manager (IAM-protected) + offline record (§7) | on change | `REQUIRED`-recommended |
| Terraform state | GCS bucket object versioning (§7) | automatic once enabled | `OPTIONAL` |
| Container images | Artifact Registry (last ~10 tags kept) | every deploy | automatic |
| **`public/` uploads (feedback, invoices)** | **nothing — ephemeral by design** | — | fix path in §8 |

---

## 2. Automated backups + point-in-time recovery (PITR) — `REQUIRED FOR CURRENT ACQUISITIONOS`

**What:** Cloud SQL takes a daily backup and continuously archives write-ahead logs, letting you restore to any second within the retention window. **Why:** this is the mechanism behind the RPO targets in [`../../04-database-production.md`](../04-database-production.md) §7 (RPO 5–15 min; RTO ≤ 1 h).

```bash
# What: enable daily backups + PITR; keep 30 days of backups (valid range 1-365; handbook target 7-35)
# Why: retention defines how far back a restore can reach
gcloud sql instances patch "$DB_INSTANCE" \
  --backup-start-time="07:00" \
  --enable-point-in-time-recovery \
  --retained-backups-count=30
# Expected output: Patching Cloud SQL instance... done.

# What: verify the configuration
gcloud sql instances describe "$DB_INSTANCE" \
  --format="yaml(settings.backupConfiguration)"
# Expected: enabled: true, pointInTimeRecoveryEnabled: true, startTime: '07:00'
```

**Verify the last good backup exists** (do this weekly and before migrations):

```bash
gcloud sql backups list --instance="$DB_INSTANCE" --limit=5
# Expected output: rows with STATUS=SUCCESSFUL and recent ENDTIME. No recent SUCCESSFUL row = act now.
```

Notes: backups are region-local by default; PITR log retention follows the same setting; deletion protection on the instance ([`database.md`](./database.md)) prevents `gcloud sql instances delete` accidents.

---

## 3. Manual on-demand backup before migrations — `REQUIRED FOR CURRENT ACQUISITIONOS`

**What:** an explicit backup taken immediately before `prisma db push` or any manual SQL. **Why:** PITR is your second line; a named pre-migration snapshot is the first, and it survives even if the migration window overlaps a PITR edge.

```bash
gcloud sql backups create \
  --instance="$DB_INSTANCE" \
  --description="pre-migration $(date +%Y%m%d-%H%M)"
# Expected output: Creating Cloud SQL backup... done. (Note the BACKUP_ID printed.)
```

Standing procedure (repeat it every time, [`database.md`](./database.md) §10): manual backup → run `npx prisma db push --schema=prisma/schema.production.prisma` via Auth Proxy → smoke test `/api/health` → record the backup ID in your change log. Never run `db push --accept-data-loss` without a fresh backup **and** a written rollback plan ([`rollback.md`](./rollback.md) §4).

---

## 4. Off-platform copy — export logical dumps to GCS — `REQUIRED`-recommended

**What:** a `pg_dump`-format export written to a Cloud Storage bucket. **Why:** it is a portable, human-readable artifact independent of Cloud SQL — your escape hatch if the platform itself is the problem, and the copy you can download outside GCP entirely.

```bash
# One-time: a private bucket for exports
gcloud storage buckets create "gs://${PROJECT_ID}-acquisitionos-backups" --location="$REGION" --default-storage-class=COLDLINE

# Weekly (or pre-migration): logical export
gcloud sql export sql "$DB_INSTANCE" \
  "gs://${PROJECT_ID}-acquisitionos-backups/acquisitionos-$(date +%Y%m%d).sql.gz" \
  --database=acquisitionos
# Expected output: Exporting Cloud SQL database... done.

# Download off-platform (optional) and verify integrity:
gcloud storage cp "gs://${PROJECT_ID}-acquisitionos-backups/acquisitionos-$(date +%Y%m%d).sql.gz" .
```

Verify: file exists, non-zero size, and (quarterly) the restore drill in §6 proves it imports. GCS gives you durability; the *off-platform* copy is what protects against loss of control over the GCP project itself (credentials, billing, org mistakes).

---

## 5. Restore procedure — step by step

**What:** bring data back from a backup or a PITR timestamp. **Golden rule: always restore into a NEW instance first** — verify — then repoint the app. Restoring over the live instance is how a bad restore becomes a worse outage.

**5a. Restore a named backup into a new instance:**

```bash
gcloud sql backups restore BACKUP_ID \
  --restore-instance=acquisitionos-restore --backup-instance="$DB_INSTANCE"
# Expected output: Restoring Cloud SQL instance... done. (acquisitionos-restore is created or overwritten by this command)
```

**5b. Point-in-time recovery** (restore to a timestamp, e.g. 10 minutes before a bad migration):

```bash
gcloud sql instances restore-backup "$DB_INSTANCE" \
  --backup-run-datetime="2024-01-15T09:50:00Z" \
  --restore-instance=acquisitionos-restore
```

**5c. Verify the restore — in order:**

```bash
# 1. Schema is present and valid (from your machine, via Auth Proxy to the RESTORE instance):
npx prisma validate --schema=prisma/schema.production.prisma
# 2. Data sanity: user count, a recent record, entitlements table
# 3. App smoke test: run a temporary Cloud Run revision pointing DATABASE_URL at the restore instance
gcloud run deploy acquisitionos-restore-test --region="$REGION" \
  --image="$IMAGE_URL" \
  --set-secrets=JWT_SECRET=JWT_SECRET:latest,CRON_SECRET=CRON_SECRET:latest \
  --set-env-vars=APP_PUBLIC_URL=https://restore-test.yourdomain.com \
  --set-secrets=DATABASE_URL=DIRECT_URL_RESTORE:latest   # a secret holding the restore-instance URL
curl -s "https://restore-test-host/api/health" | grep '"status":"ok"'
```

**5d. Repoint production:**

```bash
# Update the DATABASE_URL secret to the restore instance's connection string, then:
gcloud secrets versions add DATABASE_URL --data-file=- < new_database_url.txt
gcloud run services update acquisitionos --region="$REGION"    # new revision re-resolves :latest
gcloud run services update-traffic acquisitionos --region="$REGION" --to-latest
```

**5e. Clean up:** delete `acquisitionos-restore-test` and the restore instance after recording what you learned (durations, gotchas).

**Verify:** `/api/health` returns `"status":"ok"`, a user can log in, and a real record you checked in 5c appears in the UI.

---

## 6. Restore drills — quarterly — `REQUIRED`-recommended

**What:** run §5 against a scratch instance on purpose, on a calendar. **Why:** [`../../04-database-production.md`](../04-database-production.md) §7: *a backup is real only after a restore proves it* — and the measured duration **is** your realistic RTO.

Drill script (30–60 min/quarter):

```text
1. Pick the newest SUCCESSFUL backup (or a random one — harder mode).
2. Restore into acquisitionos-restore (§5a). Record wall-clock time.        → RTO component 1
3. prisma validate + data sanity checks (§5c). Record time.                → RTO component 2
4. Boot the test revision, curl /api/health, sign in. Record time.         → RTO component 3
5. Total = your measured RTO. Compare to the ≤1 h target; investigate gaps.
6. Delete scratch resources; log the drill (date, backup ID, RTO, issues).
```

## 7. App-config backups — secrets and Terraform state

- **Secret Manager:** secrets are replicated and encrypted at rest; your real protection is IAM (only the runtime SA + humans you trust can read them — [`secrets.md`](./secrets.md) §5) and **soft delete/versions** keeping prior values recoverable. Keep an offline record of secret *values* (password manager) so a catastrophic project loss is recoverable — never in Git or chat.
- **Terraform state:** if you adopt IaC ([`terraform.md`](./terraform.md)) with a GCS backend, enable bucket versioning so a corrupted state file is recoverable:
  ```bash
  gcloud storage buckets update "gs://YOUR_TF_STATE_BUCKET" --versioning
  # Verify: gcloud storage buckets describe gs://YOUR_TF_STATE_BUCKET --format="value(versioning.enabled)"
  ```
- **Container images:** Artifact Registry keeps every pushed tag; adopt a tag-retention habit (keep last ~10, [`rollback.md`](./rollback.md) §2).

## 8. What is NOT backed up — the honest list

- **`public/` uploads (`public/feedback-uploads/`, `public/invoices/`)** — written to the container filesystem, which is **ephemeral**: files vanish on redeploy, scale-down, and across instances ([`../../01-architecture.md`](../01-architecture.md) §2.5). The fix is adopting Cloud Storage (`OPTIONAL`) for uploads — see [`architecture.md`](./architecture.md) §1 row 12. Until then, treat uploaded files as non-critical data and say so to users.
- **In-process SSE state** — events not yet delivered are lost on instance restart by design; clients replay via `/api/realtime/recover` for whatever the DB retained.
- **Container local caches** (AI analysis cache tables are in the DB; disk caches are not).

## 9. Disaster scenarios — quick table

| Scenario | Recovery path | Pointer |
| --- | --- | --- |
| Bad migration deployed | PITR restore to pre-migration timestamp into new instance → verify → repoint (§5b–5d); or forward-fix | [`../../04-database-production.md`](../04-database-production.md) §6–7, [`rollback.md`](./rollback.md) §4 |
| Data accidentally deleted by app bug | PITR to just before the deletion window | §5b |
| Zonal failure (single-zone instance) | `REGIONAL` HA auto-fails over (enable ahead of time — see trade-offs) | [`database.md`](./database.md) §5 |
| Region outage | Cross-region strategy = `FUTURE/ALTERNATIVE`: cross-region replica + DNS move; significant cost/complexity — document, don't improvise | [`database.md`](./database.md) §5 |
| Secret deleted / rotated badly | Secret Manager prior versions (and your offline record) | [`secrets.md`](./secrets.md) §6 |
| Bad app deploy (not data) | Not a backup problem — revision rollback | [`rollback.md`](./rollback.md) §2 |

## 10. DR checklist

```text
[ ] Automated backups enabled, PITR enabled, retention ≥ 7 days (30 recommended)
[ ] This week's gcloud sql backups list shows SUCCESSFUL rows
[ ] Manual backup taken before every migration; IDs recorded in the change log
[ ] Weekly logical export to GCS; last file verified non-zero size
[ ] One off-platform copy of the latest export exists outside GCP
[ ] Quarterly restore drill performed; measured RTO written down
[ ] RPO (5-15 min) and RTO (≤1 h) accepted by the team, per 04-database-production.md §7
[ ] Secret values recorded offline (password manager); IAM on secrets is least-privilege
[ ] Terraform state bucket versioning enabled (if using IaC)
[ ] Upload-ephemerality acknowledged; GCS adoption planned before it hurts
```

---

## 11. Official documentation

- Cloud SQL backup & PITR — https://cloud.google.com/sql/docs/postgres/backup-recovery
- `gcloud sql backups` reference — https://cloud.google.com/sdk/gcloud/reference/sql/backups
- Export/import logical dumps — https://cloud.google.com/sql/docs/postgres/import-export
- Restore to a new instance / PITR — https://cloud.google.com/sql/docs/postgres/backup-recovery/restoring
- GCS object versioning & storage classes — https://cloud.google.com/storage/docs
- Secret Manager (versions, soft delete) — https://cloud.google.com/secret-manager/docs
- Handbook: [`../../04-database-production.md`](../04-database-production.md) §6–7 · [`database.md`](./database.md) §6 · [`rollback.md`](./rollback.md)
