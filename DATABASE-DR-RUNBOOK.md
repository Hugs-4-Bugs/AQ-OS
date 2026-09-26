# DATABASE DR RUNBOOK — AcquisitionOS

_Emergency procedures. Read the situation first: `node scripts/db-safety.mjs identity`._

## 0. Triage — which incident is this?

| Symptom | Go to |
|---|---|
| `db/custom.db` missing / workspace reset | §1 |
| DB exists but users/leads suddenly gone | §2 |
| DB corrupt / "database disk image is malformed" | §3 |
| Bad migration / failed deploy | §4 |
| Production PostgreSQL incident (when deployed) | §5 |
| Credential compromise | §6 |

**Universal rules:** never run `prisma migrate reset` / `db push --force-reset` / DROP/TRUNCATE
as a "fix". Always snapshot the current (even broken) state before touching anything.
`db-safety restore` refuses to overwrite a live DB that has MORE users than the snapshot.

---

## 1. Workspace reset / missing DB (happened 2026-09-22/23)

`ensure-env.sh` detects this at boot (snapshots exist, live file missing) and screams.

1. `node scripts/db-safety.mjs status` — list snapshots (`db-backups/custom-*.db`).
2. `node scripts/db-safety.mjs restore db-backups/<newest>.db` — **read the refusal/help output first**; then re-run with `--confirm`.
   - The tool: sha256-verifies, auto-snapshots the current (broken/empty) state, copies, and reminds you to restart.
3. `node scripts/db-safety.mjs restore-test` then `node scripts/verify-recovery.cjs` (13 checks: counts, known accounts, FK integrity, duplicates).
4. Restart the dev server. Verify `/api/health` → healthy and `/api/auth/config` → `{"googleAvailable":true,"emailConfigured":true}`.
5. If `.env` was also wiped: it self-heals (`scripts/recover-credentials.mjs` via `ensure-env.sh`). Verify with `node scripts/verify-real-creds.js`.

**Deep history fallback:** git blobs (`git log --all --oneline -- db/custom.db`; last tracked =
`efbc216`, 2026-09-22 04:15 UTC, 34 users). Extract read-only:
`git cat-file -p efbc216:db/custom.db > /tmp/recover.db` → profile with
`node scripts/snapshot-inventory.mjs` → restore via `db-safety restore /tmp/recover.db --confirm`.

## 2. Data loss but file exists (accidental deletes, bad job)

1. **Stop writes**: stop the dev server NOW (SQLite is file-copy-safe when idle).
2. Snapshot the damaged state: `node scripts/db-safety.mjs snapshot` (evidence + rollback point).
3. Pick the newest **pre-incident** snapshot (`db-backups/*.meta` has users+timestamp).
4. Restore (guarded) per §1 steps 2–4.
5. Reconcile: rows created between snapshot and incident exist only in the damaged snapshot — export from it (`node -e` + Prisma pointed at the copy in `db-backups/`) and re-insert deliberately. Never guess: report conflicts instead of overwriting newer data.

## 3. Corrupted DB

1. Stop server. `cp db/custom.db db-backups/corrupt-$(date -u +%Y%m%dT%H%M%SZ).db`.
2. Try SQLite integrity: `node -e "…PRAGMA integrity_check…"` (via Prisma `$queryRawUnsafe`).
3. If corrupt: restore newest healthy snapshot (§1). If snapshots are also corrupt: use git-history fallback (§1 box).
4. If only partially corrupt: `.recover`-style extraction into a fresh file is a specialist step — do NOT run destructive SQLite tooling against the only copy; copy first, experiment on the copy.

## 4. Bad migration / failed deploy

1. `npm run db:push` and `db:migrate` auto-snapshot BEFORE schema changes — find that snapshot.
2. Schema drift check: `node scripts/db-safety.mjs identity` (`X/105 tables vs models`).
3. Forward-fix only: write a new migration/`db push` that moves the schema forward; **never** `migrate reset`. If data was damaged, restore the pre-migration snapshot per §2 and re-apply the corrected migration.
4. Production (PostgreSQL, when deployed): use provider PITR to just before the migration (§5), re-deploy corrected code.

## 5. Production PostgreSQL (Railway/Supabase — when deployed)

- **First choice: provider PITR / backup restore** (Railway: service → Backups; Supabase: PITR) — recover to a point minutes before the incident. Use the provider's mechanism; do not hand-roll WAL tooling.
- Restore validation = the same checklist: `verify-recovery.cjs` adapted to the Postgres URL (13 checks), auth smoke (`/api/auth/config`, OTP login), admin guard (401/403), lead ownership (IDOR test).
- Off-site layer: `scripts/backup/backup.sh` with `S3_BACKUP_BUCKET` (daily logical dump, 30-day retention, upload + verification). Currently **not configured** — set the bucket before go-live.
- Documented targets: **RPO ≤ 5 min** (provider PITR), **RTO ≤ 30 min**. Workspace SQLite: RPO = one boot cycle; RTO < 5 min.

## 6. Credential compromise

1. Rotate the affected provider secrets (Google Cloud Console, Gmail app password, provider dashboards) — see `LOCAL-CREDENTIALS-STATUS.md` (gitignored) for the inventory and rotation table.
2. JWT/AUTH/NEXTAUTH secrets: regenerate 64-hex (`ensure_random_secret` in `ensure-env.sh`) → invalidates all sessions (safe, forced re-login).
3. `CRON_SECRET`: rotate + update the scheduler.
4. Database credentials (prod): rotate at provider, update `DATABASE_URL`/`DIRECT_URL` only in the provider's secret store — never commit.

## 7. Post-recovery acceptance (always run)

```bash
node scripts/db-safety.mjs restore-test          # isolated restore verification
node scripts/verify-recovery.cjs                 # 13-point integrity + identity checks
npx vitest run src/__tests__/persistence/subscription-persistence.test.ts   # 9 invariants
TEST_BASE_URL=... TEST_DATABASE_URL=... node scripts/auth-test-matrix.mjs   # 15-case auth matrix (isolated copy!)
curl -s localhost:3000/api/health && curl -s localhost:3000/api/auth/config
```

⚠️ `scripts/auth-test-matrix.mjs` MUTATES data (role promotion, OTP fields) — run it ONLY
against an isolated DB copy (`TEST_DATABASE_URL` + a server booted with that `DATABASE_URL`),
never against a DB holding real users.
