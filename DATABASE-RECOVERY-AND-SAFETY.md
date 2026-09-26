# DATABASE RECOVERY AND SAFETY — AcquisitionOS

_Last verified: 2026-09-23 (incident 2026-09-22/23 fully recovered)._

## 1. Current DB architecture

| Environment | Database | Provider | Notes |
|---|---|---|---|
| GLM workspace (current) | `db/custom.db` | SQLite (`prisma/schema.prisma`) | **Ephemeral filesystem** — gitignored by design (`*.db`), destroyed by workspace resets |
| Production (intended) | Managed PostgreSQL | `postgresql` (`prisma/schema.production.prisma`, Supabase-style `directUrl`) | Recommended host: **Railway** (`docs/03-setup-and-deployment/DEPLOYMENT-RAILWAY.md`); Vercel+Supabase and Docker Compose (`docker-compose.prod.yml`, postgres:15) also supported |

**Production DB is NOT yet deployed** — no PostgreSQL instance exists today; all data lives in the workspace SQLite file.

## 2. Recovery history (the 2026-09-22/23 incident)

- The workspace SQLite file was committed to git until commit `4e5d87b` untracked it (2026-09-22 05:23 UTC) — correct for PII, but no backup mechanism replaced it.
- Workspace sandbox reset(s) then **physically destroyed the untracked file**.
- The app recreated a fresh empty DB at the same path → every previously-registered email became "user not found" → 3 reported symptoms (login failures, new-account-with-default-credits, silent OTP no-op for unknown emails).
- Recovery performed 2026-09-23 03:15 UTC from git-history snapshot `efbc216` (blob `60f8e3b`, 2026-09-22 04:15 UTC): **34 users, 89 leads, 32 subscriptions, 149 credit-ledger entries, 1 credit addon, 6 payment orders, 2 invoices, 6 feedback reports, 1,232 audit logs, 2 API keys, 2 workflows (+6 runs), 20 lead activities, 8 discovery jobs**.
- Pre-recovery live DB (1 duplicate-identity test account, zero business records) preserved at `db-backups/pre-recovery-LIVE-20260923T031506Z.db` (sha256 `01807731262b40e1…`).
- **Root cause:** data-loss architecture (gitignored ephemeral SQLite + no automated snapshots). NOT an auth-code bug; NOT a database-disconnection.

## 3. User identity invariant (verified in code + tests)

```
normalize email (toLowerCase().trim())   ← identical in ALL 5 auth paths
        ↓
lookup existing user (findUnique/findFirst)
        ↓
user exists? YES → authenticate/link existing identity
             NO  → create new user (signup + both Google callbacks only)
```

- **ONE USER EMAIL = ONE USER ID.** No billing/cron/subscription code path can create a user (`grep user.create` → signup + 2 Google callbacks only).
- Google OAuth links by `email OR googleId` and never duplicates (backfill/link logic).
- SQLite's `@unique` on `User.email` blocks exact-string duplicates only; case/whitespace variants are blocked by the application-layer normalization (SQLite has no case-insensitive unique). Guarded by regression test `src/__tests__/persistence/subscription-persistence.test.ts` (source-level guard fails if any creation site drops normalization).

## 4. Backup architecture

### Workspace (SQLite, active today)

| Layer | Mechanism | Status |
|---|---|---|
| Primary | `db/custom.db` | ✅ healthy (105/105 tables, drift 0) |
| Layer 1 — local snapshots | `scripts/db-safety.mjs` → `db-backups/` (gitignored, sha256-verified, retention 10) + **boot-time auto-snapshot** via `ensure-env.sh` | ✅ active |
| Layer 2 — deep history | git blobs of old DB snapshots (`efbc216` et al.) — read-only forensics via `scripts/snapshot-inventory.mjs` | ✅ available (static, historical only) |
| Layer 3 — off-site | **not configured** (no S3 bucket / external target set for workspace dev) | ❌ |

### Production (PostgreSQL, when deployed) — target design

| Layer | Mechanism | Status |
|---|---|---|
| Primary | Managed PostgreSQL (Railway/Supabase), encrypted connection, least-privilege app user | designed, not deployed |
| Layer 2 — continuous / PITR | Provider-managed WAL archiving + point-in-time recovery (Railway/Supabase built-in) — **use the provider's implementation, never a custom file-copy hack** | not configured (provider-dependent) |
| Layer 3 — independent off-site | `scripts/backup/backup.sh` supports `S3_BACKUP_BUCKET` env → separate object storage/account; daily logical dump + retention 30d | not configured (no bucket set) |

**Never implement three writable SQLite copies** ("db1/db2/db3") — that adds corruption/sync risk, not safety. SQLite gets one writable file + read-only snapshots.

## 5. Backup policy (workspace, enforced)

- **When:** every dev-server boot (`ensure-env.sh` → `db-safety auto`) + before every `db:push` / `db:migrate` (npm pre-hooks).
- **What:** full-file copy, sha256-verified, chmod 444, `.meta` records timestamp/users/sha.
- **Retention:** last 10 snapshots; retention pruning is **skipped** when data-loss is suspected.
- **Restore-test:** `node scripts/db-safety.mjs restore-test` — restores the newest snapshot into an isolated `/tmp` file and verifies counts/schema; live DB untouched. Run after every backup change; recommended weekly.
- **RPO (realistic):** workspace — up to one boot cycle (typically minutes of work); a reset between boots loses changes since the last snapshot. Production target (once deployed): ≤ 5 min with provider PITR.
- **RTO (realistic):** workspace — < 5 min (guarded restore + server restart, proven 2026-09-23). Production target: < 30 min.
- No "real-time backup" claim is made: the workspace has no continuous WAL stream; that capability belongs to the production PostgreSQL provider.

## 6. Data-loss early warning

- `db-safety snapshot/auto` compares live user count with the newest prior snapshot; a collapse writes `db-backups/DATA-LOSS-ALERT.txt` and **freezes retention pruning**.
- `ensure-env.sh` distinguishes first-ever setup (no snapshots, empty/missing DB → proceed) from **unexpected missing DB** (snapshots exist, live file gone → CRITICAL warning, refuses to silently init an empty DB).
- `node scripts/db-safety.mjs identity` — full database identity diagnostic (environment class, provider, host/path, counts, schema drift, last backup + age, alert marker, off-site status). Never prints credentials.

## 7. Prohibited destructive operations (protected)

- `npm run db:reset` is guarded by `db-safety guard-reset` — **refuses when the DB contains any user** unless `ALLOW_DB_RESET=1` **and** `--force` are passed deliberately.
- `db:push` / `db:migrate` auto-snapshot first.
- Never run `prisma migrate reset`, `prisma db push --force-reset`, `DROP DATABASE/TABLE`, `TRUNCATE`, or unscoped `DELETE` against any DB holding user data. See `DATABASE-DR-RUNBOOK.md`.
- Production must never execute destructive operations automatically; dev tooling remains usable locally behind the guards.

## 8. Pricing

No pricing, credit-cost, GST, or checkout amounts were changed by the recovery/safety work (verified: `src/lib/credit-costs.ts`, `src/lib/prospecting/types.ts`, payment routes untouched).
