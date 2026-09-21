# Backups & Disaster Recovery — AcquisitionOS on Cloudflare

What can be lost, what backs it up, how to restore, and how to rehearse it. The database backup discipline is defined once in [`../04-database-production.md`](../04-database-production.md) §7 — this page applies it to the Cloudflare topology and covers the Cloudflare-side pieces (Worker versions, config, R2, Terraform state).

**The mental model:** on this platform, *the database is the state*. The Worker itself is stateless and re-creatable in minutes from Git; Cloudflare holds no application data outside optional R2 objects. So the backup story is: **Postgres provider backups (the real thing) + config in Git + instant Worker versions (the free app-side backup)**.

---

## 1. What lives where (the inventory to protect)

| Asset | Where it lives | Backup mechanism | Label |
| --- | --- | --- | --- |
| All application data | External managed PostgreSQL | Provider automated backups + PITR (§2) | `REQUIRED` |
| Schema | Same DB (`prisma/schema.production.prisma` in Git is its source) | Git + provider backups | `REQUIRED` |
| Worker code + bindings | Cloudflare (deployed from Git via wrangler) | Git + Worker Versions (§4) | `REQUIRED` |
| `wrangler.jsonc` (vars, routes, hyperdrive binding) | Repo | Git (§3) | `REQUIRED` |
| Secrets (`JWT_SECRET`, keys, ...) | Cloudflare secrets store | Documented list **without values** + password manager (§3) | `REQUIRED` |
| Hyperdrive config | Cloudflare account | Re-creatable from the origin connection string (§3) | `REQUIRED` |
| Uploaded/generated files (`public/...`, if you added R2) | R2 | R2 versioning (§5) | `OPTIONAL` |
| Terraform state | Remote backend (§6) | Backend versioning | `OPTIONAL` (if using Terraform) |

---

## 2. Database backups — the real backup (provider-side)

**Label:** `REQUIRED FOR CURRENT ACQUISITIONOS`

**What:** automated daily backups **plus PITR (point-in-time recovery)** on your external Postgres provider. PITR restores to *any second* within the retention window — the antidote to bad data writes, not just file loss. Hyperdrive does **not** back anything up; it is a connection layer ([`database.md`](./database.md) §7).

**Why:** `public/` uploads are ephemeral and code is in Git — if you lose only one thing catastrophically, it will be the database. Provider SLA and retention windows vary (7–35 days typical): **verify your provider's SLA and set the longest sensible retention**.

**Checklist (per [`../04-database-production.md`](../04-database-production.md) §7):**

1. Automated backups enabled on day one (provider dashboard).
2. PITR enabled (WAL archiving on managed providers is usually automatic — verify it is on for your tier).
3. Retention ≥ 7 days.
4. Optional extra safety: periodic **logical dump** to storage you control (`pg_dump` — the self-managed tooling in the repo's `scripts/backup/` documents the shape; on managed platforms prefer the native backups):

```bash
pg_dump "$DIRECT_URL" --format=custom --file=acquisitionos-$(date +%F).dump   # run where DIRECT_URL is reachable
```

**Expected output:** a dump file; provider dashboards show the latest automated snapshot timestamp. **Verify:** the backup list is *current* — a backup job silently failing last week is the classic disaster.

---

## 3. App-config backups (everything except the DB)

**What:** the pieces that make the deployment re-creatable:

1. **`wrangler.jsonc` in Git** — Worker name, compatibility flags, `vars` (`APP_PUBLIC_URL`, `LOG_LEVEL`), Hyperdrive binding ID, Custom Domain routes, `observability` flag. Never contains secrets ([`secrets.md`](./secrets.md) §1).
2. **A secrets inventory without values** — a `PRODUCTION-SECRETS.md` in your password manager (not the repo) listing *which* secrets exist (`JWT_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`, `STRIPE_*`, ...) and where each value comes from. After an incident you must know *what* to re-enter, even though you cannot (and should not) recover the old values — that is what re-issuing is for ([`secrets.md`](./secrets.md) §6 rotation).
3. **Hyperdrive config** — re-creatable in one command from the origin connection string:

```bash
npx wrangler hyperdrive create acquisitionos-pg \
  --connection-string="postgresql://app_user:YOUR_DB_PASSWORD@your-db-host.provider.com:5432/acquisitionos?sslmode=require"
```

**Expected output:** a new config `id` — paste it into `wrangler.jsonc` and redeploy. The *origin* connection string is the one thing Hyperdrive needs back; it lives in your password manager. **Verify:** `npx wrangler hyperdrive list` matches your docs.

**Drill:** `git clone` the repo on a clean machine, then count how many commands [`manual-deployment.md`](./manual-deployment.md) says you need to reach a healthy Worker. If the answer is not ~15 minutes of copy-paste, your config documentation has holes.

---

## 4. Worker Versions — the instant, free app-side backup

**What:** every deploy creates an immutable **Worker Version**. Cloudflare keeps the history; `wrangler rollback` re-points traffic at any previous version in seconds ([`./rollback.md`](./rollback.md) §2). This *is* the application's backup — there is no container image to pull from a registry.

**Why it changes the DR math:** a bad deploy is a non-event (instant rollback); a *lost* deployment (account compromised, accidental delete) is restored by redeploying from Git — which is why Git is the real source of truth, and why the Cloudflare-side history is a convenience, not the archive.

**Commands:**

```bash
npx wrangler versions list      # history: version IDs, timestamps, sources
npx wrangler rollback           # instant revert to the previous version
```

**Expected output:** the list shows your deploy lineage; rollback completes in seconds. **Verify:** after a test rollback, `curl -s https://app.yourdomain.com/api/health` → 200 and the app behaves as before ([`frontend.md`](./frontend.md) §8 exercise).

---

## 5. R2 object versioning — `OPTIONAL` (uploads/invoices)

**What:** if you adopted R2 for durable uploads/invoice storage ([`frontend.md`](./frontend.md) §3), enable **object versioning** on the bucket so overwrites/deletes keep prior object versions.

**Command:**

```bash
npx wrangler r2 bucket versioning enable acquisitionos-uploads
```

(If the subcommand shape differs in your wrangler version, enable it in the dashboard → R2 → bucket → Settings — `NEEDS VERIFICATION`.)

**Expected output:** confirmation; the bucket settings show versioning enabled. **Verify:** overwrite an object, then list versions — the old one is still there. Remember the default path without R2: uploads under `public/` are **ephemeral on Workers** and are not backed up at all — that is why R2 is the mitigation ([`../01-architecture.md`](../01-architecture.md) §2.5).

---

## 6. Terraform state backup — `OPTIONAL` (if using Terraform)

**What:** the remote state file *is* the record of what Terraform manages. Backends vary ([`terraform.md`](./terraform.md) §6): R2/S3-backed state with versioning gives you restore points; Cloudflare's managed state offerings handle it for you.

**Rules:**

- Enable **versioning** on the state bucket (S3/R2 both support it).
- Never store state locally on one laptop; never commit it to Git (plaintext secrets inside — [`secrets.md`](./secrets.md) §7).
- Test a restore once: check out the repo, restore the prior state version, `terraform plan` — expect a no-op or a small, explainable diff.

**Verify:** `terraform plan` against a restored state produces no surprise destroys.

---

## 7. Restore drills (rehearse before you need it)

**Label:** `REQUIRED` discipline from [`../04-database-production.md`](../04-database-production.md) §7 — a backup is real only after a restore proves it.

**Drill A — database PITR (quarterly):**

```bash
# 1. In the provider console: restore/PITR the latest backup into a SCRATCH database (never over production).
# 2. Point a scratch Hyperdrive config at it:
npx wrangler hyperdrive create acquisitionos-pg-restore-test --connection-string="postgresql://...scratch..."
# 3. Boot the staging Worker against it and smoke-test:
npx wrangler versions list && curl -s https://staging.yourdomain.com/api/health
#    (staging with restored data: login works, dashboards render, counts are plausible)
# 4. Record the duration — that measured number IS your realistic RTO (§8).
```

**Expected output:** a scratch deployment answering `/api/health` with restored data; a written RTO number in your runbook.

**Drill B — full app restore (quarterly):** restore DB copy (Drill A) **+** deploy the previous Worker version (`wrangler versions rollback` in staging) + verify login and one workflow. This rehearses the "provider outage → restore elsewhere" scenario (§9) at small scale.

**Drill C — config restore (annually):** clean machine → Git → follow [`manual-deployment.md`](./manual-deployment.md) to recreate Hyperdrive, secrets (new values), and deploys. Time it.

---

## 8. RPO / RTO targets

**What:** from [`../04-database-production.md`](../04-database-production.md) §7 — the handbook's standing targets:

| Target | Meaning | Value | How this platform meets it |
| --- | --- | --- | --- |
| **RPO** | Max tolerable data loss | **5–15 min** | Provider PITR (WAL-based) restores to any second in the window |
| **RTO** | Max tolerable restore time | **≤ 1 h** | PITR restore (measured in Drill A) + deploy Worker from Git (minutes) + verify |

**Why Workers helps RTO:** there is no image to rebuild, no LB to reconfigure, no DNS to move (the Custom Domain already points at the Worker; a Hyperdrive re-create is one command). The database restore dominates the clock — which is why the drill measures it.

**Verify:** your written runbook contains the measured numbers from §7, not the aspirational ones from this table.

---

## 9. Disaster scenarios (and the non-scenario)

| Scenario | What happens | Response |
| --- | --- | --- |
| **Bad deploy** | Errors spike after a version change | `npx wrangler rollback` — seconds. Not a disaster ([`./rollback.md`](./rollback.md)). |
| **Bad data write / bad migration** | Wrong rows, dropped columns | PITR to just before the event into a scratch DB, then promote per the runbook in [`../04-database-production.md`](../04-database-production.md) §7. |
| **Postgres provider outage** | `/api/health` fails on the DB check; Worker itself is up | Follow the provider's status/incident comms; if prolonged, restore the latest backup into a *different* provider/region, re-point Hyperdrive (one `wrangler hyperdrive create` + redeploy), update `DIRECT_URL` in CI. This is the scenario Drills A/B rehearse. |
| **Cloudflare-side loss (account compromise, accidental delete)** | Worker/config gone | Git + §3 config backup: re-create Hyperdrive, re-enter secrets (fresh values if compromise is suspected), redeploy, re-attach Custom Domain ([`./dns-ssl.md`](./dns-ssl.md) §3). Data is unaffected — it lives at the provider. |
| **Cloudflare global edge outage** | — | **NOT APPLICABLE as a single-tenant failure** — an edge-wide outage is Cloudflare's incident, visible on their status page (https://www.cloudflarestatus.com/); your runbook action is communication, not recovery. Multi-CDN failover is `FUTURE/ALTERNATIVE` territory and out of scope for a first deployment. |
| **Accidental secret leak** | Credentials exposed | Rotate per [`secrets.md`](./secrets.md) §6 (`JWT_SECRET` invalidates sessions; DB password requires Hyperdrive re-create) — then review audit logs ([`monitoring.md`](./monitoring.md) §9). |

---

## 10. DR checklist (print this)

- [ ] Provider automated backups + PITR enabled, retention ≥ 7 days, **SLA read and noted**
- [ ] Backup list checked *current* weekly (automated check if the provider offers it)
- [ ] Optional `pg_dump` to your own storage on a schedule, tested for restorability
- [ ] `wrangler.jsonc` + secrets inventory (no values) + origin connection string in the password manager
- [ ] Hyperdrive re-create command written down with real placeholders (§3)
- [ ] Worker Versions history exists; `wrangler rollback` tested once in staging
- [ ] R2 versioning enabled if R2 is in use (§5)
- [ ] Terraform state versioned in a remote backend (§6)
- [ ] Drill A (DB PITR) performed before launch and quarterly; RTO measured and recorded
- [ ] Drill B (app restore against restored data) performed once before launch
- [ ] Provider outage runbook written: restore elsewhere → re-point Hyperdrive → update `DIRECT_URL` → verify
- [ ] Contact/escalation list: provider support, Cloudflare support, who declares a disaster

---

## 11. Official Documentation

- Workers Versions & rollbacks — https://developers.cloudflare.com/workers/configuration/versions-and-deployments/
- R2 object versioning — https://developers.cloudflare.com/r2/buckets/object-versioning/
- Hyperdrive configuration — https://developers.cloudflare.com/hyperdrive/
- Terraform state (remote backends) — https://developer.hashicorp.com/terraform/language/state/remote
- Shared backup/restore discipline — [`../04-database-production.md`](../04-database-production.md) §7
- Provider docs (choose yours) — Neon / Supabase / AWS RDS / Cloud SQL / Azure Flexible Server backup & PITR pages
