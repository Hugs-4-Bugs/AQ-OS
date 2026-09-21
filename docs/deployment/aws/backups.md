# Backups and Disaster Recovery on AWS

Backups answer one question under stress: *can we be serving again, with the data, within an hour?* This page covers what RDS already does for you (automated backups + PITR), what you must do by hand (snapshot discipline, restore drills, config backups), and what is deliberately not backed up (ephemeral uploads). RPO/RTO targets come from [`../04-database-production.md`](../04-database-production.md) §7: **RPO 5–15 minutes** (PITR), **RTO ≤ 1 hour** (restore + deploy + verify).

Labels: REQUIRED FOR CURRENT ACQUISITIONOS unless marked OPTIONAL. Instance name `acquisitionos-prod`, secrets prefix `acquisitionos/prod/*` — from [`manual-deployment.md`](./manual-deployment.md) §5-6.

---

## 1. What RDS does automatically (and how to confirm it)

**What:** RDS takes a full automated backup daily (in your chosen backup window) plus continuous WAL uploads, giving **point-in-time recovery (PITR)** to any second within the retention window. **Why:** PITR is the antidote to bad *data writes* (a bug deleting rows), not just file loss — you restore to the moment before the mistake.

Your `create-db-instance` from [`manual-deployment.md`](./manual-deployment.md) §5.3 already set: `--backup-retention-period 7 --preferred-backup-window "03:00-04:00"`. Confirm:

```bash
aws rds describe-db-instances --db-instance-identifier acquisitionos-prod \
  --query "DBInstances[0].[BackupRetentionPeriod,PreferredBackupWindow,StorageEncrypted,DeletionProtection]" \
  --output text --region ${AWS_REGION}
# → 7  03:00-04:00  True  True
```

- Retention: **≥ 7 days REQUIRED** (7–35 is the sane band; longer retention bills more for little benefit if you snapshot before risky changes).
- Backup window `03:00-04:00` UTC is off-peak for most audiences — keep or adjust, but always defined.
- `StorageEncrypted: True` and `DeletionProtection: True` are security/DR prerequisites ([`security.md`](./security.md) §9, [`database.md`](./database.md) §4).

**Verify:** `aws rds describe-db-instance-automated-backups --db-instance-identifier acquisitionos-prod` shows the automated backup with `LatestRestorableTime` near "now" — that timestamp is your real-time RPO answer.

---

## 2. Manual snapshot before every risky change

**What/Why:** a manual snapshot is an explicit, retention-immune copy you take **before** every `prisma db push` that could destroy data (any change that would need `--accept-data-loss`) and before large backfills. The habit is the whole discipline ([`../04-database-production.md`](../04-database-production.md) §6).

```bash
aws rds create-db-snapshot \
  --db-instance-identifier acquisitionos-prod \
  --db-snapshot-identifier acquisitionos-pre-schema-$(date +%F-%H%M) \
  --region ${AWS_REGION}
aws rds wait db-snapshot-completed \
  --db-instance-identifier acquisitionos-prod \
  --db-snapshot-identifier acquisitionos-pre-schema-$(date +%F-%H%M)
```

**Expected output:** `describe-db-snapshots` lists it with status `available`. **Verify before you rely on it:** the restore drill in §5 is how a snapshot stops being a hope.

Name snapshots with what and why: `acquisitionos-pre-schema-2025-06-01`, `acquisitionos-pre-backfill-leads`. Delete only with a dated note in your ops log.

---

## 3. Second-region snapshot copies (OPTIONAL — regional DR)

**What/Why:** RDS backups live in one region. Copying snapshots to a second region protects against a region outage or a catastrophic account-level mistake.

```bash
aws rds copy-db-snapshot \
  --source-db-snapshot-identifier arn:aws:rds:us-east-1:YOUR_ACCOUNT_ID:snapshot:acquisitionos-pre-schema-2025-06-01 \
  --target-db-snapshot-identifier acquisitionos-dr-2025-06-01 \
  --region eu-west-1
```

Trade-offs, honestly: copies cost cross-region data transfer + storage; restores in the second region need the whole VPC stack recreated there (Terraform makes this feasible — [`terraform.md`](./terraform.md)); do it only if a multi-hour regional outage is an accepted scenario for your users. It pairs with, or substitutes for, the cross-region read replica in §4.

---

## 4. Cross-region read replicas (OPTIONAL — know the trade-offs first)

**What:** an RDS read replica in another region that can be promoted to a standalone instance. **Factual trade-offs:**

- **Pro:** near-warm DR (promotion is minutes, not restore-hours); replication lag visible as a metric.
- **Con:** continuous cross-region data transfer cost; the replica is **read-only** — the app cannot use it for scaling reads unless the application code adds a read path, and the current app has none (single `DATABASE_URL`; verified — [`../01-architecture.md`](../01-architecture.md)); promotion is **one-way**; async replication means the replica can lag (RPO = lag at failure time).
- Verdict for a first deployment: snapshot copies (§3) give most of the DR value for less complexity. Add a replica when you also want the read path (FUTURE/ALTERNATIVE) or need minutes-grade regional RPO.

**Verify (if enabled):** `aws rds describe-db-instances --db-instance-identifier aos-dr-replica --query "DBInstances[0].[ReadReplicaSourceDBInstanceIdentifier,StatusInfos]"` and its `ReplicaLag` metric stays under minutes.

---

## 5. Restore procedure (the part you actually practice)

**What/Why:** restores go to a **new** instance — never in place — so you can verify before switching. Two entry points:

**5.1 Restore a named snapshot:**

```bash
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier acquisitionos-restored \
  --db-snapshot-identifier acquisitionos-pre-schema-2025-06-01 \
  --db-instance-class db.t4g.medium --no-publicly-accessible \
  --vpc-security-group-ids ${RDS_SG_ID} \
  --db-subnet-group-name acquisitionos-db-subnets \
  --region ${AWS_REGION}
aws rds wait db-instance-available --db-instance-identifier acquisitionos-restored
export RESTORED_HOST=$(aws rds describe-db-instances --db-instance-identifier acquisitionos-restored \
  --query "DBInstances[0].Endpoint.Address" --output text)
```

**5.2 Restore to a point in time (PITR):**

```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier acquisitionos-prod \
  --target-db-instance-identifier acquisitionos-pitr \
  --restore-time 2025-06-01T11:59:30Z \
  --db-instance-class db.t4g.medium --no-publicly-accessible \
  --vpc-security-group-ids ${RDS_SG_ID} \
  --db-subnet-group-name acquisitionos-db-subnets
```

**5.3 Verify the restored copy (before repointing anything):**

```bash
psql "postgresql://app_user:YOUR_DB_PASSWORD@${RESTORED_HOST}:5432/acquisitionos?sslmode=require" -c '\dt' | head -20
psql "..." -c 'SELECT count(*) FROM "User";'        # plausible row count
psql "..." -c 'SELECT max("createdAt") FROM "Lead";' # data is from the expected moment
```

Then an app smoke test: run a scratch Fargate task (or the ECS service) pointed at the restored host, log in, run one workflow, check `/api/health` reports `database: healthy` ([`backend.md`](./backend.md) §2).

**5.4 Repoint the app.** Two equivalent ways; the first is cleaner:

1. **Update the secrets, restart the service** — `aws secretsmanager put-secret-value --secret-id acquisitionos/prod/DATABASE_URL --secret-string "postgresql://app_user:...@${RESTORED_HOST}:5432/acquisitionos?sslmode=require&connection_limit=10"`, same for `DIRECT_URL`, then a new task def revision (or `aws ecs update-service --force-new-deployment`) so tasks re-read secrets ([`secrets.md`](./secrets.md) §3).
2. **Recreate RDS under the old name** — delete `acquisitionos-prod` (deletion protection forces you to disable it — that friction is intentional) and rename the restored instance to `acquisitionos-prod`. Zero secret changes, but more steps and a longer window.

**Verify:** `curl -s https://${APP_HOST}/api/health` → `database: healthy`; a login works; one workflow run completes.

---

## 6. Restore drills — measure your RTO

**What/Why:** a backup is real only after a restore proves it ([`../04-database-production.md`](../04-database-production.md) §7). **Cadence: quarterly** (and always after the first production week and after any restore-path change).

Drill script (staging hours, ~30 min):

1. Start the clock. Note current time as `T0`.
2. Take a fresh manual snapshot (§2) — or use the latest automated one.
3. Restore it to `acquisitionos-drill` (§5.1).
4. Verify data with `psql` + app smoke (§5.3).
5. Record `T1` when the app answered `/api/health` against the restored instance.

**RTO = T1 − T0.** If it exceeds 1 hour, either your instance class is too small to restore quickly (restore time scales with data size; `db.t4g.medium` restores tens of GB in minutes) or your procedure has steps you should script. **Verify the drill itself:** a row in an ops log with date, snapshot used, RTO, and any procedure fixes.

---

## 7. Application-config backups

Everything that is not the database but the deployment needs:

| What | Where it lives | How it is protected |
| --- | --- | --- |
| Secrets (`JWT_SECRET`, DB URLs, provider keys) | Secrets Manager | Versioned (`put-secret-value` keeps previous versions); rotation guidance [`security.md`](./security.md) §7 |
| Non-secret env (`APP_PUBLIC_URL`, SMTP host, OTEL vars) | Task definition revisions | Every `register-task-definition` is retained — `list-task-definitions` is a config history ([`rollback.md`](./rollback.md) §2) |
| Infrastructure definition | Terraform in Git + **S3 state** | The repo's backend (`deploy/terraform/main.tf`) stores state in S3 — enable **bucket versioning** so a bad `terraform apply` is recoverable: `aws s3api put-bucket-versioning --bucket ${PROJECT}-terraform-state --versioning-configuration Status=Enabled` ([`terraform.md`](./terraform.md) §6) |
| ECR images | ECR | Old SHA tags are the rollback surface — **keep at least the last 10 SHA tags**; do not add a lifecycle policy that expires tagged images ([`rollback.md`](./rollback.md) §2) |
| Schedules + DNS + certs | EventBridge rules, Route 53, ACM | Re-creatable from Terraform/CLI docs; not data — verify, don't back up |

**Verify (one-time):** bucket versioning `Status=Enabled`; `aws ecr describe-images --repository-name acquisitionos` shows ≥ 10 retained SHA tags; `aws secretsmanager list-secret-version-ids --secret-id acquisitionos/prod/JWT_SECRET --include-planned-deletion` shows prior versions retained.

---

## 8. What is NOT backed up — and the fix path

| Not backed up | Why | What to do |
| --- | --- | --- |
| `public/` uploads (`public/feedback-uploads/`, `public/invoices/`) | They live on the **ephemeral container filesystem** ([`../01-architecture.md`](../01-architecture.md) §2.5) — gone on every redeploy, unique per instance | OPTIONAL: adopt S3 for uploads (app-level change; task role gains `s3:PutObject` on one bucket, [`security.md`](./security.md) §3). Until then, treat uploads as disposable and tell users so |
| ElastiCache Redis (if used) | It is a **cache/pub-sub bus**, not source of truth | Never back up; rebuilding it loses nothing durable |
| ALB logs, CloudTrail beyond retention | Observability, not state | Size retention to your audit needs ([`monitoring.md`](./monitoring.md) §11) |

---

## 9. Disaster scenarios and the recovery path

| Scenario | Primary recovery | RPO | First command |
| --- | --- | --- | --- |
| Bad deploy, app broken | ECS rollback (no data impact) | n/a | [`rollback.md`](./rollback.md) §2 |
| Destructive `db push` dropped a column | Manual snapshot restore (§5.1) or PITR to just before (§5.2) | minutes | `aws rds create-db-snapshot` of *current* state for forensics, then restore |
| Bug deleted/wrote bad data days ago | PITR to the moment before (§5.2) | seconds–minutes | `describe-db-instance-automated-backups` → confirm window covers it |
| RDS instance/AZ failure | Multi-AZ failover is automatic if enabled ([`database.md`](./database.md) §3); else recreate from latest automated backup | ≤ 5 min (failover) / ≤ backup window (no Multi-AZ) | `describe-db-instances` → check status/failover |
| Accidental instance deletion | **Deletion protection blocks it**; final snapshot still created on forced delete | 0 (final snapshot) | `restore-db-instance-from-db-snapshot` with the final snapshot |
| Region outage | Second-region snapshot copy (§3) — full stack rebuild via Terraform | = last copy | `copy-db-snapshot` cadence defines it |
| Credential leak / ransomware-style wipe | PITR + rotate all secrets + CloudTrail forensics | minutes | Disable leaked credentials first ([`security.md`](./security.md) §11) |

---

## 10. DR checklist

```text
[ ] Automated backups ON, retention >= 7 days, backup window defined
[ ] PITR confirmed: LatestRestorableTime is recent
[ ] StorageEncrypted + DeletionProtection + Multi-AZ (production) verified
[ ] Manual snapshot taken before every schema change and big backfill (named, dated)
[ ] OPTIONAL: snapshot copy cadence to a second region documented
[ ] Restore procedure executed once as a drill; RTO recorded <= 1 h
[ ] Quarterly drill on the calendar; ops log entry per drill
[ ] Secrets Manager versions retained; Terraform state bucket versioned
[ ] >= 10 ECR SHA tags retained as the app rollback surface
[ ] Team knows: uploads in public/ are NOT backed up until S3 is adopted
```

---

## 11. Official Documentation

- RDS backup and restore — https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_BackupWorkingWith.html
- Point-in-time recovery — https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html
- Restoring from a snapshot — https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_RestoreFromSnapshot.html
- Copying snapshots cross-region — https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_CopySnapshot.html
- RDS read replicas — https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html
- S3 bucket versioning — https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html
- ECR lifecycle policies (use with care — §7) — https://docs.aws.amazon.com/AmazonECR/latest/userguide/lifecycle_policy_examples.html
