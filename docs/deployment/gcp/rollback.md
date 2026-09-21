# GCP Rollback — Applications, Database Schema, and Infrastructure

Rollback is three different operations that beginners often confuse. This page separates them, because each has a different speed, a different risk profile, and a different rulebook:

| Kind | Speed | Risk | Main tool |
| --- | --- | --- | --- |
| 1. Application (code/image) | **minutes**, near-zero risk | low | Cloud Run revisions / Artifact Registry tags |
| 2. Database schema | **slow**, data-bearing, sometimes impossible as-is | high | forward-fix preferred; PITR as the real rollback |
| 3. Infrastructure (Terraform) | minutes–hour | medium | `git revert` → plan → apply |

Related pages: [`backups.md`](./backups.md) (PITR procedure), [`../../04-database-production.md`](../04-database-production.md) (migration discipline), [`troubleshooting.md`](./troubleshooting.md) §1 (the 10-minute triage that decides *whether* to roll back).

---

## 1. First, decide: roll back or fix forward

Run the triage ([`troubleshooting.md`](./troubleshooting.md) §1). The decision heuristic:

- **Symptom started right after a deploy, and the previous deploy was fine** → application rollback (§2). Do this first; diagnose calmly afterward.
- **Symptom is data-shaped** (wrong values, missing rows, failed jobs writing garbage) → schema/data problem (§3–4); an app rollback may not help and can make it worse (§5).
- **Symptom is infra-shaped** (new ALB behavior, changed SQL flags, DNS) → infra rollback (§5).
- **Site is down and the cause is unknown** → application rollback is still the default first move *if* a deploy preceded it — reverting the last change removes the largest variable.

## 2. Application rollback — `REQUIRED` capability, minutes to execute

You have two mechanisms. Both end with a new revision serving old code; both are reversible.

### 2a. Redeploy the previous image tag

**What:** deploy an older, still-present image from Artifact Registry. **Why:** this is the canonical rollback — the exact bytes that ran before run again.

```bash
# 1. Find the previous tag (keep the last ~10 — set a tag-retention habit, see the note below):
gcloud artifacts docker tags list \
  us-central1-docker.pkg.dev/YOUR_PROJECT_ID/acquisitionos/acquisitionos \
  --format="table(tag, version)" | head
# Expected output: tags like <sha7> — the second-newest is usually your rollback target.

# 2. Redeploy it (all service flags identical to the normal deploy):
gcloud run deploy acquisitionos --region="$REGION" \
  --image=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/acquisitionos/acquisitionos:PREV_SHA \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,DIRECT_URL=DIRECT_URL:latest,JWT_SECRET=JWT_SECRET:latest,CRON_SECRET=CRON_SECRET:latest
# Expected output: revision [acquisitionos-000xx+N] has deployed (100% traffic).

# 3. Verify immediately:
curl -s https://app.yourdomain.com/api/health | grep -q '"status":"ok"' && echo HEALTHY
```

**Keep the last 10 tags:** every pushed SHA is a rollback candidate. If CI/retention policies prune tags, exempt the last ~10 from cleanup — an Artifact Registry with only `latest` leaves you with nothing to roll back to. (Optionally tag the live revision `live` before each deploy: `gcloud artifacts docker tags add ...@sha256:... acquisitionos:live`.)

### 2b. Revision traffic rollback (no new deploy at all)

**What:** Cloud Run keeps every revision with its config; route traffic back to an older revision instantly.

```bash
# List revisions (newest first):
gcloud run revisions list --service=acquisitionos --region="$REGION" \
  --format="table(REVISION, ACTIVE, TRAFFIC)"

# Send 100% of traffic to the known-good revision:
gcloud run services update-traffic acquisitionos --region="$REGION" \
  --to-revisions=acquisitionos-00042=100
# Expected output: traffic split updated (acquisitionos-00042: 100%).
```

Prefer **2a** when the previous *config* also changed (env/secrets live on revisions — 2b restores both code and config of that revision). Prefer **2b** when you need the fastest possible revert and the older revision is still active. Canary experiments (`--traffic=10`) are the same mechanism used preemptively ([`backend.md`](./backend.md) §12).

CI integration: the `rollback` workflow_dispatch job in [`cicd.md`](./cicd.md) §7 does 2a from GitHub.

## 3. Database schema rollback — NOT automatic

**What it is not:** `prisma db push` has no `down`. There is no automatic inverse migration. **What it is:** a deliberate choice between two slow paths.

### Path A — forward-fix (preferred)

Write the next change that undoes the damage: restore a dropped column from backup data, re-add a removed column, ship a hotfix release correcting behavior. Additive schema changes mean an app rollback (§2) remains safe at any time — see §5.

```text
incident → stop the bleeding (§2 app rollback if needed) → write the corrective change
         → pre-migration backup (backups.md §3) → db push → verify
```

### Path B — PITR restore (the real rollback)

When data was destroyed (bad destructive migration, buggy job), the only true rollback is point-in-time recovery into a **new instance**, verify, repoint. Full command sequence: [`backups.md`](./backups.md) §5 (restore a backup / a timestamp → `prisma validate` + app smoke test → switch `DATABASE_URL` → new revision). RPO/RTO expectations and the why: [`../../04-database-production.md`](../04-database-production.md) §7 and [`database.md`](./database.md) §6.

**The rule that makes Path B possible:** never run `db push --accept-data-loss` (or destructive manual SQL) without a fresh manual backup ([`backups.md`](./backups.md) §3) and a written rollback plan. The repo's own annotations (`[MIGRATE-SAFE]`, `[MIGRATE-CAUTION]`, `[MIGRATE-RISK]`, `[CRITICAL-FK]` in the Prisma schema) tell you which changes carry risk — honor them, and see the expand → migrate → contract pattern in [`../../04-database-production.md`](../04-database-production.md) §6.

## 4. Application rollback + schema changes — the compatibility question

**When NOT to roll back the DB — or the app:**

- **App rollback with additive migrations:** safe. Schema gained columns/tables; the older code ignores them. Roll back the app (§2), fix, redeploy. Do **not** also revert the schema.
- **App rollback *after* a destructive migration:** the old code may not know the schema lost something it used → 500s on the old code too. In that case the fix is forward (§3 Path A), possibly paired with a PITR restore.
- **Never "roll back" by re-running old migrations against newer schema** — `db push` diffing will propose destructive changes to get back to the old shape. That is the disaster path.

Rule of thumb: **schema only moves forward; code can move backward when the schema moves are additive.**

## 5. Infrastructure rollback — Terraform

**What:** undo a bad infrastructure change (SQL flag, LB config, scheduler, IAM). **Why Terraform keeps it honest:** the state file is the source of truth; reverting the *commit* and applying is the safe undo.

```bash
# 1. Identify the bad commit:
git log --oneline -5            # the change you regret is HEAD (or near it)
git revert <bad-commit-sha>     # a NEW commit that undoes it — never force-push history

# 2. Review what the revert will do — plan is the safety net:
cd deploy/terraform   # or your IaC root per terraform.md
terraform init && terraform plan
# Expected output: plan showing ONLY the intended resource changes. Read every line.

# 3. Apply after review (production applies are gated — terraform.md §CI):
terraform apply
```

**Never** perform state surgery (`terraform state rm`, editing the state file) to force an undo — reconcile via commits. Full IaC workflow, state/locking, and destroy rules: [`terraform.md`](./terraform.md). Some resources do not roll back cleanly (databases keep data; deleted instances are gone) — Terraform rollback is for *configuration*, never a substitute for backups ([`backups.md`](./backups.md)).

## 6. Emergency checklist — site down

```text
[ ] 1. Health:   curl -s https://app.yourdomain.com/api/health   → status? DB field?
[ ] 2. Logs:     gcloud beta run services logs tail acquisitionos --region=$REGION   (or monitoring.md §7)
[ ] 3. Deploys:  gcloud run revisions list --service=acquisitionos --region=$REGION
                 Was a deploy/config change made in the last 2 h?
[ ] 4. If yes → application rollback (§2a) → re-verify /api/health → open the incident thread
[ ] 5. If no  → check DB state (health 'database' field, monitoring.md §4 rows 4-6) and scheduler
                 (cron storm? job failure?) before touching anything else
[ ] 6. Communicate: post status to the team channel with what you know NOW and next update time
```

The expanded symptom-indexed version of this checklist is [`troubleshooting.md`](./troubleshooting.md) §1.

---

## 7. Rollback quick-reference card

Print this into your runbook — it is the whole page compressed:

```text
APP ROLLBACK (minutes, safe)
  gcloud artifacts docker tags list .../acquisitionos/acquisitionos   # pick PREV_SHA
  gcloud run deploy acquisitionos --region=$REGION --image=...:PREV_SHA + normal flags
  # or, no new deploy: gcloud run services update-traffic --to-revisions=PREV_REVISION=100
  verify: curl -s https://app.yourdomain.com/api/health

SCHEMA ROLLBACK (slow, deliberate)
  destructive change?  → backups.md §5 PITR into NEW instance → verify → repoint
  additive change?     → app rollback only; schema stays; forward-fix the code
  never:               → db push --accept-data-loss without a fresh backup + written plan

INFRA ROLLBACK
  git revert <bad-commit> && terraform plan   # read the plan line by line
  terraform apply                             # production apply is gated (terraform.md)
  never: state surgery; terraform destroy in incident mode
```

---

## 8. Official documentation

- Cloud Run revisions & traffic management — https://cloud.google.com/run/docs/rollbacks-troubleshooting
- Artifact Registry (tags, retention) — https://cloud.google.com/artifact-registry/docs/docker/manage-tags
- Cloud SQL restore / PITR — https://cloud.google.com/sql/docs/postgres/backup-recovery/restoring
- Terraform CLI (plan/apply/revert workflows) — https://developer.hashicorp.com/terraform/cli
- Prisma schema migration concepts — https://www.prisma.io/docs/orm/prisma-migrate
- Handbook: [`../../04-database-production.md`](../04-database-production.md) §4, §6–7 · [`backups.md`](./backups.md) §3, §5 · [`cicd.md`](./cicd.md) §7
