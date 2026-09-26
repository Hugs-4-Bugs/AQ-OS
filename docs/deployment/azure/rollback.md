# Rollback on Azure — Application, Database, Infrastructure

Rollback is three different procedures that beginners fuse into one panic. This page separates them: **(1) application** (seconds, no data involved), **(2) database schema** (usually a forward-fix, sometimes a PITR restore), **(3) infrastructure** (Git + Terraform). Read §2 before you ever need it — the revision history that makes it instant only exists if deploys behaved normally beforehand.

---

## 1. Decide in 60 seconds

```text
Symptom right after a deploy?
  -> Application rollback (§2). Fast, safe, reversible. Do it; investigate after.
Symptom WITHOUT a recent deploy?
  -> Logs + metrics first (troubleshooting.md "First 10 minutes"), then decide.
Data looks wrong (missing rows, bad values, failed migration)?
  -> Database path (§3-4). Application rollback alone will NOT fix data.
Infrastructure change involved (Terraform apply, DNS, Front Door)?
  -> Infrastructure path (§5).
```

Bookmark before anything else: run `date -u +%Y-%m-%dT%H:%M:%SZ` and write it down — it is your PITR restore point if data recovery becomes necessary ([`backups.md`](./backups.md) §3).

---

## 2. Application rollback (revisions + ACR tags)

**What:** Container Apps runs **multiple revisions mode** — every `az containerapp update` keeps the previous revision addressable and warmed. Rolling back = sending traffic back to it.

**Why it is instant:** no rebuild, no image pull surprises (the old revision's image reference is already resolved), no config re-entry.

**Step 1 — list revisions and spot the last good one:**

```bash
az containerapp revision list -n "$APP" -g "$RG" -o table
# Expected: revisions with creation time + traffic weight; the newest has 100%
```

**Step 2 — shift traffic back (weight-based, keeps both running):**

```bash
az containerapp ingress traffic set -n "$APP" -g "$RG" \
  --revision-weight <good-revision-name>=100
# Expected: JSON traffic block showing the good revision at 100
```

Portal equivalent: Container App → **Revisions** → select the last good revision → *Activate* / set traffic (the portal's revisions + traffic slider is the same operation; exact `az containerapp update --rollback` shorthand varies by CLI version — NEEDS VERIFICATION; the traffic-weight and revision-activate forms above are the reliable mechanics, as used in [`backend.md`](./backend.md) §13).

**Step 3 — verify:**

```bash
curl -s "https://app.yourdomain.com/api/health" | grep -o '"database":[^}]*}'
az containerapp logs show -n "$APP" -g "$RG" --tail 20
```

**Plan B — redeploy the previous ACR tag** (use when you also changed env vars/secrets and a bare revision reactivation is not enough, or the revision history was reset):

```bash
az acr repository show-tags --name "$ACR" --repository acquisitionos -o tsv | tail -10
az containerapp update -n "$APP" -g "$RG" \
  --image "$ACR.azurecr.io/acquisitionos:<previous-good-sha>"
```

This is why [`backups.md`](./backups.md) §8 keeps ≥ 10 recent SHA tags and why CI tags by Git SHA ([`cicd.md`](./cicd.md) §2).

**What application rollback does NOT touch:** the database. If the bad deploy also ran schema changes, read §3 before celebrating.

---

## 3. Database schema rollback — forward-fix first

**What:** undoing a schema change. The repo's production path is `prisma db push` against `prisma/schema.production.prisma` ([`../04-database-production.md`](../04-database-production.md) §3–4) — push has **no built-in down migration**, so the options are:

1. **Forward-fix (preferred).** Write the *next* `db push` that restores correctness, and a matching app fix if needed. Additive changes usually need nothing at all — see §6.
2. **PITR restore (the real rollback).** Restore to the pre-change timestamp into a **new server** and repoint — full procedure in [`backups.md`](./backups.md) §4:

```bash
az postgres flexible-server create \
  --restore-time "THE-UTC-TIMESTAMP-YOU-BOOKMARKED" \
  --source-server "$PG" -g "$RG" -n "$PG-restored"
# then: verify copy -> update Key Vault database-url/direct-url -> revision restart
```

**Hard rules** (from [`../04-database-production.md`](../04-database-production.md) §6 — verbatim discipline):

- **Never run a destructive `db push` (`--accept-data-loss`) without a fresh backup/restore point and a written rollback plan.**
- Never combine a destructive column change with an app release in one step.
- Honor the schema's own annotations (`[MIGRATE-CAUTION]`, `[MIGRATE-RISK]`, `[CRITICAL-FK]`).
- Downtiming note: the restore path costs the RTO you measured in the drill ([`backups.md`](./backups.md) §5) — minutes, not seconds; that is why forward-fix wins when data loss is not on the table.

**Decision tree:**

```text
Was the change additive only (new nullable columns/tables)?
  -> YES: no schema rollback needed; app rollback (§2) alone restores service. (§6)
Did data change destructively?
  -> Forward-fix possible without losing more data? Do it.
     Otherwise: PITR restore to the bookmarked timestamp (above), accept the measured RTO.
```

---

## 4. Emergency decision tree (app vs DB combined)

```text
1. curl /api/health
     200 + database healthy   -> app-tier problem -> §2
     unhealthy/database down  -> DB-tier problem  -> logs, then §3/§4
2. az containerapp logs show --tail 100
     migration errors?        -> §3 (do NOT re-run destructive pushes blindly)
     Prisma connection errors?-> troubleshooting.md §Database connection failure
3. Recent terraform apply?    -> §5
4. Still ambiguous: roll the APP back (§2) - it is safe even if the DB also needs work,
   because additive schema changes stay compatible with the older app (§6).
```

---

## 5. Infrastructure rollback (Terraform + DNS + Front Door)

**What:** undoing infrastructure changes — Terraform applies, DNS cutover, Front Door routes.

- **Terraform:** the rollback is `git revert` the commit, then the normal pipeline (`terraform plan` → review → `apply`) — [`terraform.md`](./terraform.md) §6–7. **Never hand-edit state files** and never run `terraform destroy` as a "quick revert" — a state edit makes the next plan lie to you. State file history is recoverable via blob versioning ([`backups.md`](./backups.md) §6).
- **DNS:** revert records in Azure DNS; TTL is the speed limit — this is why cutover uses TTL 300 ([`dns-ssl.md`](./dns-ssl.md) §6). Reverting the `app` CNAME restores the previous origin within minutes.
- **Front Door:** route/origin changes are reversible in the portal or `az afd` commands; keep the previous origin group before editing. WAF policy flips (Prevention → Detection) are the quick "did the WAF break it?" check ([`security.md`](./security.md) §4).
- **Certificates:** do not delete custom-domain bindings to "reset TLS" — you trade minutes of debugging for a re-issuance wait ([`dns-ssl.md`](./dns-ssl.md) §4).

**Verify:** after the revert apply, `terraform plan` reports **no changes**; `dig` + `/api/health` confirm the previous origin.

---

## 6. When NOT to roll back the database

**The rule:** additive migrations are designed to be compatible with the *older* app. If the last `db push` only added nullable columns/tables or new indexes, the previous app version runs fine against the new schema — rolling the schema back is pure risk with zero benefit ([`../04-database-production.md`](../04-database-production.md) §6 expand→migrate→contract).

Concretely, **do not** DB-rollback when:

- The change was additive and the app rollback (§2) resolves the incident.
- The "problem" is a new column that the old app ignores.
- A cron endpoint misbehaved but wrote only *correctable* rows (fix forward with an admin/utility action if one exists — e.g. the billing webhook-replay utility, [`security.md`](./security.md) §9).

**Do** consider the PITR path only when data is *wrong* (corrupted, lost, mis-migrated) and a forward fix would lose more than the restore costs. And keep the expand→migrate→contract rhythm: contract (drop old columns) happens **two releases later**, which is what makes "roll the app back" permanently safe.

---

## 7. Rollback checklist

```text
[ ] UTC timestamp bookmarked before any intervention (backups.md §3)
[ ] Revisions list inspected; last-good revision identified
[ ] Traffic shifted to last-good revision; /api/health verified
[ ] ACR tag retention >= 10 confirmed (Plan B available)
[ ] Schema-change nature classified: additive (no DB rollback) vs destructive (forward-fix or PITR)
[ ] If PITR: backups.md §4 followed step-by-step; firewall + grants recreated; Key Vault repointed
[ ] If infra: git revert + plan/apply; no manual state edits; no destroy
[ ] Post-incident: alert added for the missing signal (monitoring.md §4); drill note updated
```

## 8. Official Documentation

- Manage revisions & traffic splitting — https://learn.microsoft.com/azure/container-apps/revisions-manage
- `az containerapp revision` reference — https://learn.microsoft.com/cli/azure/containerapp/revision
- Flexible Server PITR — https://learn.microsoft.com/azure/postgresql/flexible-server/concepts-backup-restore
- Prisma schema push guidance — https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections
- Shared zero-downtime change rules — [`../04-database-production.md`](../04-database-production.md) §6
- Terraform state & workflows — [`terraform.md`](./terraform.md) §6
