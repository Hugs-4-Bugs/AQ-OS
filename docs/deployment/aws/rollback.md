# Rollback — Three Kinds of Undo on AWS

When something breaks you need to know **which layer** broke, because each layer rolls back differently: the **application** (task definitions + ECR tags), the **database schema** (where "rollback" usually means "restore" or "forward-fix"), and the **infrastructure** (Terraform). This page is the decision guide; the commands assume the names from [`manual-deployment.md`](./manual-deployment.md): cluster `acquisitionos-prod`, service `acquisitionos-app`, task def family `acquisitionos-prod`, ECR repo `acquisitionos`.

The 60-second version:

```text
App broken after a deploy?      → circuit breaker may have already reverted (§2)
Schema broken after a db push?  → forward-fix if possible; else snapshot/PITR restore (§3)
Infra broken after terraform?   → git revert the commit, terraform plan/apply (§4)
Not sure?                       → emergency checklist §5, DB decision tree §6
```

---

## 1. Application rollback (most common)

### 1.1 What the circuit breaker already did — check first

**What/Why:** the service runs with `deploymentCircuitBreaker={enable=true,rollback=true}` ([`backend.md`](./backend.md) §10). When new tasks repeatedly fail the ALB health check, ECS **stops the rollout and reverts to the last stable task definition automatically**. So before touching anything, check whether the system healed itself:

```bash
aws ecs describe-services --cluster acquisitionos-prod --services acquisitionos-app \
  --query "services[0].[events[0:3],deployments[].{status:status,running:runningCount,td:taskDefinition}]"
```

**Reading it:** a `rollback` event in `events[]`, or two deployments where the old task definition is at `running` while the new one is at 0 → auto-rollback happened; find the deploy's root cause in `aws logs tail /acquisitionos/production` before retrying ([`troubleshooting.md`](./troubleshooting.md) §9).

### 1.2 Manual rollback to a previous task definition revision

**What/Why:** the app boots fine but is *wrong* (500s, broken feature) — the breaker sees a healthy container, so you revert manually. Task definitions are immutable; revision N-1 is exactly what was running before.

```bash
# 1. List recent revisions (newest first)
aws ecs list-task-definitions --family-prefix acquisitionos-prod \
  --sort DESC --max-items 5 --query "taskDefinitionArns"

# 2. Identify the last known-good revision (note the :N suffix)

# 3. Roll the service back to it
aws ecs update-service --cluster acquisitionos-prod --service acquisitionos-app \
  --task-definition acquisitionos-prod:27
aws ecs wait services-stable --cluster acquisitionos-prod --service acquisitionos-app
```

**Expected output:** `update-service` prints the service description with the old task definition; `wait services-stable` returns when new tasks are healthy. **Verify:** `curl -s https://${APP_HOST}/api/health` → 200 and the broken symptom is gone; `describe-services` shows one deployment, the old revision, at full `runningCount`.

How to know which revision was running before the bad deploy: CloudTrail (`lookup-events` for `UpdateService`, [`monitoring.md`](./monitoring.md) §11) or the CI run history ([`cicd.md`](./cicd.md) §3 logs the rendered revision).

### 1.3 Redeploy a previous image tag (when config, not just image, drifted)

**What/Why:** if someone also changed env/secrets since, revision N-1 may no longer be valid. The fix: take the *current* task definition, set only the `image` to a previous SHA tag, register, deploy — the same three-step flow as CI ([`cicd.md`](./cicd.md) §3).

```bash
aws ecs describe-task-definition --task-definition acquisitionos-prod --query "taskDefinition" > td.json
# edit td.json: image → YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/acquisitionos:<PREV_SHA>
aws ecs register-task-definition --cli-input-json file://td.json
aws ecs update-service --cluster acquisitionos-prod --service acquisitionos-app \
  --task-definition acquisitionos-prod:NEW_REVISION
```

**Tag retention rule:** keep **≥ 10 SHA tags** in ECR — they are your rollback surface ([`backups.md`](./backups.md) §7). Never deploy mutable `latest` in production for exactly this reason: `latest` cannot be rolled back to unambiguously ([`manual-deployment.md`](./manual-deployment.md) §7 uses it only for first setup).

### 1.4 Rollback is not a fix

Reverting buys calm, not correctness. Every rollback ends with: write down the failure (logs, revision numbers), fix on a branch, redeploy through CI ([`cicd.md`](./cicd.md)), and let the pipeline verify `/api/health`.

---

## 2. Database schema rollback (the dangerous one)

**What/Why:** `prisma db push` syncs the schema with **no migration history** — there is no `prisma` undo button. The safe responses, in preference order ([`../04-database-production.md`](../04-database-production.md) §6-7):

1. **Forward-fix (preferred).** Write a schema change that restores compatibility with the *previous app version*. Additive changes (add back a nullable column, re-create an index) are instant and lossless. This is why the app and schema should change together, small steps.
2. **Restore from snapshot / PITR (real rollback, last resort).** This reverts *data* too — anything written after the restore point is lost. Procedure end to end: [`backups.md`](./backups.md) §5 (restore to a NEW instance → verify with psql + app smoke → repoint `DATABASE_URL`/`DIRECT_URL` secrets → roll tasks). RPO: minutes (PITR) or to the snapshot's moment.
3. **Never:** attempt to hand-edit tables live to "undo" a push while the new app is running against them.

**The rules that make §2 survivable:**

- A **manual snapshot before every `db push`** is REQUIRED discipline ([`backups.md`](./backups.md) §2) — it is the rollback path.
- **Never run a destructive push without that snapshot.** `db push` that asks for `--accept-data-loss` is the signal to stop, snapshot, and plan — never run it blindly in CI ([`cicd.md`](./cicd.md) §4).
- Test schema changes on staging first ([`frontend.md`](./frontend.md) §6 — staging is a separate ECS service + database for exactly this).

---

## 3. Infrastructure rollback (Terraform)

**What/Why:** a bad `terraform apply` changed a security group, ALB attribute, or instance class. Terraform state is the source of truth, so the rollback is **re-applying good code** — never editing state or clicking console fixes that drift it.

```bash
cd environments/production
git revert <bad-commit>          # or git checkout <last-good-tag> into a branch
terraform plan                    # read it: does it undo exactly the bad change?
terraform apply                   # after the plan review (production gated, ../05-cicd.md §5)
```

- **No manual state edits** (`terraform state mv/rm` only for recovery procedures with a written plan) and no console changes for Terraform-managed resources — both create drift that makes the *next* rollback dangerous ([`terraform.md`](./terraform.md) §5-6).
- State bucket versioning ([`backups.md`](./backups.md) §7) is the safety net if an apply corrupts state.
- **No `terraform destroy`** — in CI it is banned outright ([`../05-cicd.md`](../05-cicd.md) §9).

**ALB/ACM/DNS notes:**

- ALB/listener changes roll back like any other Terraform change (§3). If only *DNS* is wrong, the fastest revert is the Route 53 record — aliases are free and instant ([`dns-ssl.md`](./dns-ssl.md) §4), and a 60 s alias TTL means users recover in minutes.
- **ACM cannot be "rolled back"** — certificates are either issued and attached or not. A broken TLS state is almost always: wrong-region cert, deleted validation CNAME, or a listener pointing at the wrong ARN ([`troubleshooting.md`](./troubleshooting.md) §3).
- EventBridge schedules are infra too — re-running the §8 creation loop of [`cicd.md`](./cicd.md) is idempotent (`put-rule`/`put-targets` overwrite).

---

## 4. When NOT to roll back the database

**The asymmetry:** app versions and schema versions must stay compatible in *one direction* — old app + new schema is usually fine if changes were additive; new app + old schema rarely is.

```text
Deploy added a nullable column / new table / index (additive)?
  → App rollback is SAFE. Old app ignores the new columns. Do NOT restore the DB.

Deploy removed/renamed a column the old app needs? (you used --accept-data-loss)
  → App rollback alone is NOT safe (old app reads the missing column).
  → Forward-fix the schema (§2 option 1), or restore (§2 option 2) accepting data loss.

Only the app is broken, schema untouched?
  → Task definition rollback (§1). Database: hands off.
```

This is exactly why the expand → migrate → contract pattern exists: while a change is mid-rollout, **both** app versions must run against **one** schema ([`../04-database-production.md`](../04-database-production.md) §6). Honor the schema's `[MIGRATE-SAFE]`/`[MIGRATE-RISK]` annotations (repo-verified) when judging which case you are in.

---

## 5. Emergency checklist (print this)

```text
1. IS IT UP?         curl -i https://${APP_HOST}/api/health        (200? what is database.status?)
2. TARGETS           aws elbv2 describe-target-health (any unhealthy?)
3. EVENTS            aws ecs describe-services  (deployment events — did the breaker fire?)
4. LOGS              aws logs tail /acquisitionos/production --since 15m (stack traces?)
5. RECENT CHANGE?    CI run history / CloudTrail UpdateService / git log
6. APP BROKEN        → §1.2 previous task def revision → wait services-stable → verify 1.
7. APP+SCHEMA BROKEN → §2: snapshot NOW (preserve evidence), forward-fix or restore
8. INFRA BROKEN      → §3: git revert + terraform plan/apply
9. DATA FEAR         → §2 option 2: PITR restore to a NEW instance, verify, repoint
10. STILL STUCK      → troubleshooting.md §1 triage runbook, 10 minutes, in order
```

---

## 6. Official Documentation

- ECS deployment circuit breaker — https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-ecs.html
- Updating a service / task definition — https://docs.aws.amazon.com/AmazonECS/latest/developerguide/update-service.html
- Prisma: production and `db push` trade-offs — https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/databases-on-read-replica (and schema push: https://www.prisma.io/docs/orm/reference/prisma-cli-reference#db-push)
- Terraform: state and recovery — https://developer.hashicorp.com/terraform/language/state
- Route 53 changing records — https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-editing.html
