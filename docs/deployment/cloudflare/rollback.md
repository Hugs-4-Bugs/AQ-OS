# Rollback — Application, Database, Infrastructure

When a change goes wrong, you need to know *which kind* of wrong it is, because the three rollback kinds on this platform have completely different speeds and rules. This page is the runbook; the underlying mechanics (Worker Versions, PITR, Terraform state) are documented in [`./backups.md`](./backups.md) and [`./terraform.md`](./terraform.md).

**The three kinds:**

| Kind | What changed | Speed | Primary tool |
| --- | --- | --- | --- |
| **1. Application** | A Worker Version (code/config) | **Instant** | `wrangler rollback` / dashboard |
| **2. Database schema** | Prisma schema push over `DIRECT_URL` | Minutes-to-hours; *forward-fix preferred* | Provider PITR / forward migration |
| **3. Infrastructure** | Terraform-managed Cloudflare resources (Hyperdrive, DNS, WAF, R2) | Minutes | `git revert` + `terraform plan/apply` |

---

## 1. The 30-second decision tree

```text
Is the app erroring?
  │
  ├─ Did it start right after a DEPLOY (wrangler/CI)?        → Kind 1 (§2). Roll the version back NOW.
  ├─ Did it start after a SCHEMA PUSH?                       → Kind 2 (§3). Do NOT redeploy blindly.
  ├─ Did it start after a terraform apply?                   → Kind 3 (§4).
  └─ No change, just broke?                                  → Provider status, Cloudflare status,
                                                               then troubleshooting.md runbook.
```

**First move regardless of kind:** keep `npx wrangler tail --format pretty` open ([`./monitoring.md`](./monitoring.md) §2) and check `curl -s https://app.yourdomain.com/api/health`.

---

## 2. Application rollback — instant, by design

### 2.1 What a Worker Version is

**What:** every `opennextjs-cloudflare deploy` (or `wrangler versions upload`) creates an immutable snapshot of the Worker bundle + config. Traffic points at the "active" version; history is retained.

**Why this replaces the container dance:** there is no previous image to pull, no registry, no rebuild. Rolling back is a pointer change — seconds, globally.

### 2.2 Roll back

**Command:**

```bash
npx wrangler versions list        # note the version IDs + timestamps + sources (CI vs local)
npx wrangler rollback             # interactive: pick the previous version; or target an ID —
npx wrangler versions rollback <VERSION_ID>   # exact subcommand shape varies by wrangler version — NEEDS VERIFICATION
```

**Expected output:** confirmation that the previous version is active; the dashboard (Workers & Pages → acquisitionos → Deployments) shows the old version live again.

**How to verify:** `curl -s https://app.yourdomain.com/api/health` → 200; one login works; SSE connects; `wrangler tail` shows the old (good) behavior. Total elapsed time: under a minute.

**Dashboard path (no CLI at hand):** Workers & Pages → `acquisitionos` → Deployments → **Rollback** to the prior version.

### 2.3 Gradual deployments (canary) — `NEEDS VERIFICATION` with the adapter

**What:** Workers gradual deployments let you split traffic percentages between versions (e.g. 10% canary) via the dashboard or wrangler versions flow.

**Why:** better than rollback — a canary finds the break before all users do.

**Honest caveat:** whether the full gradual-deploy flow behaves cleanly with the OpenNext adapter's bundle (which also ships Workers Assets) is **`NEEDS VERIFICATION`** — test it in staging before relying on it (https://developers.cloudflare.com/workers/configuration/versions-and-deployments/gradual-deployments/). The always-available alternative: deploy to the staging Worker first ([`cicd.md`](./cicd.md) §7), soak, then promote.

### 2.4 Keep version IDs

**What:** record the version ID of every production deploy (the CI deploy step prints it; or `wrangler versions list`).

**Why:** at 2 a.m. you want "roll back to `abcd-1234`", not "roll back to whatever was before whatever was before". One line in the deploy log or a pinned message in your ops channel is enough. Bookkeeping tip from [`../../05-cicd.md`](../05-cicd.md) §2: a `release-YYYY-MM-DD` Git tag marking what is live pairs the Worker version with the source commit.

**Caveat — config is part of the version:** rollback restores the *bundled* config of that version too (e.g. `vars` from that deploy's `wrangler.jsonc`). If the incident was a bad `vars` change, rollback fixes it; if a secret was rotated meanwhile, secrets are separate from versions and unaffected.

---

## 3. Database schema rollback — slow, careful, forward-fix preferred

**Label:** the discipline in [`../04-database-production.md`](../04-database-production.md) §4 applies verbatim; this section adds the Workers interaction.

### 3.1 Why "roll back the schema" is not a button

**What:** Prisma `db push` is a diff-apply against the live database. "Undoing" it means either a reverse diff (destructive: data loss) or a restore from backup (big hammer).

**Why forward-fix wins:** if a migration added a column the new Worker uses, the *old* Worker ignores the column — additive changes are backward-compatible. The correct response to a bad additive migration is usually a **new migration that repairs** (rename back, re-add constraints), not a restore.

### 3.2 When NOT to roll back the app version instead

**What:** the classic trap — schema and app versions must stay compatible in *both* directions:

- **Additive schema + new Worker:** old Worker still works → if the new Worker misbehaves, **roll back the app version (§2) and leave the schema**. This is the safe, boring case.
- **Destructive schema change** (dropped/renamed columns/tables): the old Worker likely breaks → rolling back the app version does *not* fix it. Do not push destructive changes without a backup + tested restore path (§3.3).

**Rule:** after any schema push, the minimum app version that works with the schema is the one you just deployed — keep that pair in mind before touching either.

### 3.3 The real database rollback: provider-side PITR

**What:** restore the database to a point-in-time before the bad write/migration, into a **scratch** database first ([`./backups.md`](./backups.md) §7 Drill A), verify, then promote.

**Command shape:**

```bash
# 1. Provider console: PITR restore → scratch database (never in place on prod).
# 2. Point a scratch Hyperdrive config + staging Worker at it; smoke-test.
# 3. Promote per your provider's procedure (swap endpoint / export-import) — provider-specific, NEEDS VERIFICATION per provider.
```

**Expected output:** a verified-good database; app pointed at it; `wrangler tail` clean.

### 3.4 Never destructive `db push` without a backup

**What:** before any schema push that Prisma warns will drop data (the prompt that says data loss may occur):

1. Confirm today's provider backup/PITR exists and is current.
2. Run the push against staging's schema copy first.
3. Export the affected tables (`pg_dump --table=...`) as a belt-and-suspenders copy.

**Verify:** the warning prompt is a *stop*, not a formality — if you cannot state what data will be lost and how you would get it back, do not enter the confirmation.

---

## 4. Infrastructure rollback — `git revert` + `terraform plan/apply`

**What:** changes made through Terraform (Hyperdrive configs, WAF rules, DNS records, R2 buckets — [`terraform.md`](./terraform.md)) are rolled back by reverting the code that declared them and re-applying.

**Command:**

```bash
git revert <bad-infra-commit>        # or edit the .tf files forward
cd deploy/cloudflare/production      # your env dir (terraform.md §2)
terraform plan                       # READ THE PLAN: expect exactly the inverse of the bad change
terraform apply                      # only after the plan shows no surprises
```

**Expected output:** a plan whose diff undoes the bad resource change; apply succeeds; `terraform plan` afterwards is clean.

**How to verify per resource:** Hyperdrive — `npx wrangler hyperdrive list` + a healthy `/api/health` (DB leg); DNS/WAF — the checks in [`./dns-ssl.md`](./dns-ssl.md) §3/§7 and [`./security.md`](./security.md) §2; R2 — bucket present, binding resolves.

**State caution:** if `terraform state` and reality diverged (someone clicked the dashboard), reconcile first ([`terraform.md`](./terraform.md) §7 import flow) — a rollback applied to drifted state makes it worse. And never `terraform destroy` in anger ([`../../05-cicd.md`](../05-cicd.md) §9).

### 4.1 DNS / Hyperdrive notes

- **DNS:** a wrong Custom Domain/DNS change is fixed by re-adding the correct config and redeploying ([`./dns-ssl.md`](./dns-ssl.md) §3); DNS itself propagates fast inside Cloudflare once authoritative — do not wait out TTLs that do not exist (§6 there).
- **Hyperdrive:** re-creating a Hyperdrive config issues a **new `id`** — update `wrangler.jsonc` and redeploy the Worker, or the binding still points at the old config. Keep the origin connection string (not the old id) in your password manager; the id is derivable, the string is not.

---

## 5. Emergency checklist (print this)

```text
[ ] 1. HEALTH      curl -s https://app.yourdomain.com/api/health        → note status
[ ] 2. WATCH       npx wrangler tail --format pretty                    → note errors (1101? 1102? DB?)
[ ] 3. IDENTIFY    What changed last? (deploy / schema push / terraform / nothing)
[ ] 4a. DEPLOY     → npx wrangler rollback (or dashboard Rollback)      → verify health + login
[ ] 4b. SCHEMA     → do NOT rollback app blindly; assess §3.2:
                     additive? keep schema, fix forward
                     destructive+data-loss? PITR to scratch (§3.3), verify, promote
[ ] 4c. TERRAFORM  → git revert → terraform plan (read!) → apply        → verify per resource
[ ] 5. COMMUNICATE → status note to users/team if >5 min customer-visible
[ ] 6. WRITE DOWN  → timeline + version IDs + what fixed it → troubleshooting.md update
```

**When NOT to roll back anything:** if `/api/health` is green and errors are cosmetic/route-specific, rolling back all traffic over one broken route may cost more than it saves — use the triage runbook first ([`./troubleshooting.md`](./troubleshooting.md) "first 10 minutes") and decide with data.

---

## 6. Rehearsal (make the muscle memory)

**Quarterly, in staging:** deploy a deliberately cosmetic-bad version, roll it back with `wrangler rollback`, and time it (expect < 1 minute); restore a PITR copy into scratch and boot staging against it ([`./backups.md`](./backups.md) Drill A). An unpracticed runbook is a document; a practiced one is a capability.

---

## 7. Official Documentation

- Workers Versions, deployments & rollbacks — https://developers.cloudflare.com/workers/configuration/versions-and-deployments/ (gradual deployments: https://developers.cloudflare.com/workers/configuration/versions-and-deployments/gradual-deployments/)
- Wrangler commands (`versions`, `rollback`) — https://developers.cloudflare.com/workers/wrangler/commands/
- Terraform CLI (plan/apply/state) — https://developer.hashicorp.com/terraform/cli
- Hyperdrive configuration — https://developers.cloudflare.com/hyperdrive/
- Database migration discipline — [`../04-database-production.md`](../04-database-production.md) §4, §7
