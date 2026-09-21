# Deployment Runbook — AcquisitionOS

> Owner: Operations. Status: Living document. Last reviewed: 2026-09-09.
> Source: `next.config.ts`, `package.json`, `keepalive-v2.sh`, `ensure-env.sh`, `Dockerfile`, `docker-compose.prod.yml`, `vercel.json`, `deploy/`, the existing `docs/03-setup-and-deployment/*`.

## 1. Pre-Deployment Checklist

Run through this **every** deployment, no exceptions.

### Code
- [ ] `bun run lint` passes (or only pre-existing warnings in untouched files).
- [ ] `bunx tsc --noEmit` has no new errors in touched files.
- [ ] PR reviewed + approved (see [CODE-REVIEW-CHECKLIST.md](../developer/CODE-REVIEW-CHECKLIST.md)).
- [ ] Tests pass: `bun run test` (unit) + `bun run test:integration` (integration). (Skip if no tests touch the change.)
- [ ] No new secrets committed to git (run `git diff origin/main -- '*.env*' '*.json' '*.yml'` to scan).
- [ ] No `console.log` of secrets / PII in the diff.
- [ ] No `http://localhost` / `http://127.0.0.1` hardcoded URLs in production code (the dev-server `localhost` in `keepalive-v2.sh` is OK).
- [ ] Changelog entry written (`docs/product/CHANGELOG.md`).

### Database
- [ ] If the Prisma schema changed: `bun run db:push` (dev) + migration SQL reviewed; tested against a copy of the production DB (`scripts/backup/`).
- [ ] No destructive migration (DROP COLUMN/TABLE) without a backfill plan.
- [ ] Migration is reversible (down-migration script exists).

### Environment
- [ ] All required secrets in the platform's secret manager (see [SECRETS-MANAGEMENT.md](../security/SECRETS-MANAGEMENT.md) §2).
- [ ] `APP_URL` set to the production public URL (NOT localhost).
- [ ] `NODE_ENV=production`.
- [ ] `AUTH_DEV_MODE=false`, `AUTH_AUTO_VERIFY=false`, `AUTH_BYPASS_EMAIL=false`.
- [ ] `ENABLE_GOOGLE_OAUTH=true`, `ENABLE_MAGIC_LINK=true`, `ENABLE_OTP_LOGIN=true`.
- [ ] SMTP / Resend configured (test via `/api/auth/email-diagnostic`).
- [ ] Stripe keys (test mode first, then live).
- [ ] Google OAuth redirect URIs in Google Cloud Console include the production URL `/api/auth/callback/google`.

### Integrations
- [ ] Stripe webhook endpoint configured (`<APP_URL>/api/payments/webhook/stripe`) with the required events.
- [ ] Google Pub/Sub topic (for Gmail push) configured if Gmail inbox sync is used.
- [ ] Sentry DSN configured.
- [ ] Custom domain DNS pointed at the platform (Vercel / Railway / Cloudflare in front).

## 2. Deployment Steps

### Option A — Vercel (recommended for the simplest path)
1. Push to `main`. Vercel auto-deploys from `main`.
2. Vercel runs `bun run build` (or `vercel-build`).
3. Vercel serves the Next.js app on the configured domain.
4. Set environment variables in the Vercel dashboard (Project Settings → Environment Variables). **Never commit `.env` to git.**
5. Configure the Stripe webhook endpoint in the Stripe Dashboard to point at `https://<domain>/api/payments/webhook/stripe`.
6. Configure the Google OAuth redirect URI in Google Cloud Console to include `https://<domain>/api/auth/callback/google`.

**Vercel caveats:**
- Long-running jobs (discovery, AI batch) hit Vercel's function timeout (60s on Pro, 10s on Hobby). Mitigation: move to a background worker (ADR-011) OR deploy on a platform without the timeout.
- The SQLite `db/custom.db` is **ephemeral** on Vercel serverless. Use a managed Postgres (Supabase/Neon) or a persistent volume. **The SQLite path is local-dev / single-instance only.**

### Option B — Railway (recommended for the persistent-DB + no-timeout path)
1. Push to `main`. Railway auto-deploys.
2. Add a PostgreSQL database plugin (Railway-managed) — this gives you the `DATABASE_URL`.
3. Set `DATABASE_URL` in the Railway service env to the Postgres plugin's connection string.
4. Change `prisma/schema.prisma` `datasource db` provider to `postgresql` (see ADR-012).
5. Run `bun run db:push` on the first deploy (Railway runs the build command + a release command if configured).
6. Set the rest of the env vars in the Railway service.
7. Configure the Stripe webhook + Google OAuth redirect URI as above.
8. (Optional) Add a Redis plugin for the planned background queue.

### Option C — AWS EC2 / Aliyun FC (the current sandbox deployment)
1. SSH into the host.
2. `git pull origin main`.
3. `bun install` (or `npm ci`).
4. `ensure-env.sh` to restore `.env` if the sandbox wiped it.
5. `bun run db:push` if the schema changed.
6. `bun run build` (if running `next start`) — **or** run `next dev` for the dev server (current sandbox pattern).
7. Restart via `keepalive-v2.sh` (health-check based — does nothing if healthy; restarts if not).
8. Configure the Stripe webhook + Google OAuth redirect URI as above.

**Current sandbox specifics (Aliyun FC / GLM):**
- The dev server runs on port 3000 (`next dev`).
- `.env` is periodically wiped by the sandbox → `ensure-env.sh` restores it.
- A cron job (every 5 min) runs `keepalive-v2.sh` → health-check based; no restart if healthy.
- The `@next/swc-linux-x64-gnu` binary is restored by `keepalive-v2.sh` from `node_modules/@next/swc-linux-x64-gnu/next-swc.linux-x64-gnu.node` if missing.
- `src/middleware.ts` is renamed to `src/middleware.ts.disabled` (Next 16 uses `proxy.ts` instead).

### Option D — Docker (`Dockerfile` + `docker-compose.prod.yml`)
1. `docker build -t acquisitionos .`
2. `docker-compose -f docker-compose.prod.yml up -d`
3. The compose file defines the app + Postgres + Redis (for the planned queue).
4. Set env vars in a `.env.prod` (gitignored) or via the compose `environment:` block referencing the secret manager.
5. Run the migration: `docker-compose -f docker-compose.prod.yml exec app bun run db:push`.

## 3. Post-Deployment Verification

Within 10 minutes of a deploy, verify:

### Smoke test (manual, browser)
- [ ] `https://<domain>/` loads the sign-in / landing page (no white screen, no error boundary).
- [ ] Sign-in with a test account works (password / OTP / magic link / Google).
- [ ] Dashboard loads; the overview tab renders.
- [ ] Create a test lead; it appears in the list.
- [ ] Trigger a small discovery (3 leads); it completes.
- [ ] Send a test outreach email to yourself; you receive it + the BCC confirmation.
- [ ] Connect Google Calendar; book a test meeting; the Google Meet link is generated.
- [ ] Upgrade to a test plan via Stripe test mode; the webhook activates the subscription.

### API smoke test (curl)
```bash
# Health
curl -s https://<domain>/api/health
# Auth config
curl -s https://<domain>/api/auth/config   # → {"googleAvailable":true,"emailConfigured":true}
# Auth gate (unauthenticated)
curl -s -o /dev/null -w '%{http_code}' https://<domain>/api/leads   # → 401
```

### Logs
- [ ] `dev.log` (or the platform's log stream) shows the new build compiled cleanly; no fatal errors.
- [ ] Sentry has no new `fatal`-level issues post-deploy.
- [ ] Stripe webhook deliveries in the Stripe Dashboard are 200 (not 5xx).
- [ ] Prometheus / Grafana shows error rate < 1%, p95 latency < target.

### Rollback-readiness check
- [ ] Confirm the previous version is still deployable (git tag / Docker image tag exists).
- [ ] Confirm the DB migration is reversible (the down-migration was tested).

## 4. Rollback Procedure

### Code rollback (no schema change)
1. Re-deploy the previous git commit (`git revert` + push, or re-deploy the previous Docker tag).
2. Verify the smoke test.

### Code rollback (with a schema change that needs reverting)
1. **First:** back up the DB (`scripts/backup/backup.sh`).
2. Re-deploy the previous code.
3. Run the down-migration (`scripts/migrate.sh --down` or the specific SQL).
4. Verify the smoke test + that the DB is consistent.
5. If the down-migration is destructive (data loss), restore from the backup instead.

### Stripe / Google OAuth misconfiguration rollback
- Stripe: revert the webhook endpoint config in the Stripe Dashboard.
- Google: revert the OAuth client config in Google Cloud Console.
- Both are independent of the app deploy.

### DB rollback (data loss / corruption)
1. Stop the app (or put it in maintenance mode).
2. `scripts/backup/restore.sh <backup-file>`.
3. Restart the app.
4. Verify the smoke test.
5. Investigate the root cause before accepting new writes.

## 5. Database Migration Safety

- **Always back up before a migration:** `scripts/backup/backup.sh`.
- **Test the migration against a copy of the DB first:** `cp db/custom.db db/custom.db.test && DATABASE_URL=file:./db/custom.db.test bun run db:push`.
- **Never run a destructive migration (DROP COLUMN/TABLE) without a backfill plan + a down-migration.**
- **For SQLite → PostgreSQL:** follow the phased plan in `prisma/schema.prisma` (header) + `scripts/migrate-to-postgresql.sh`. Test against a copy first.
- **For zero-downtime:** deploy the new code that's compatible with both the old + new schema (expand-then-contract), run the migration, then deploy the code that uses the new schema only.

## 6. Maintenance Window

For destructive migrations or major upgrades:
1. Announce 48 h in advance (email + in-app banner).
2. Put the app in maintenance mode (a feature flag or `503 Service Unavailable` from the gateway).
3. Back up the DB.
4. Run the migration.
5. Smoke test.
6. Take the app out of maintenance mode.
7. Confirm in the status page.

## 7. Common Deployment Issues + Fixes

| Issue | Cause | Fix |
|---|---|---|
| `Ecmascript file had an error` in `dev.log` | A syntax error in a committed file | Find the file (tsc / `next build` reports it); fix; redeploy |
| Auth fails for everyone after deploy | `JWT_SECRET` changed without session reset | Acceptable (rotate intentionally); or revert the secret change |
| Stripe webhooks 401 | `STRIPE_WEBHOOK_SECRET` mismatch | Verify the secret in `.env` matches the Stripe Dashboard endpoint |
| Google sign-in `redirect_uri_mismatch` | The new domain isn't in Google Console | Add `https://<domain>/api/auth/callback/google` to the OAuth client's authorized redirect URIs |
| Magic link emails point at `localhost:3000` | `APP_URL` set to localhost or unset | Set `APP_URL` to the public URL in `.env` |
| `db custom.db does not exist` | SQLite file missing | Run `bun run db:push` to create it; or restore from backup |
| Out of memory during `next build` | Turbopack memory | Use `next dev` (sandbox) or upgrade the build host; or use the SWC binary restore in `keepalive-v2.sh` |
| App starts but `GET /` is 500 | A runtime error in a server component | Check `dev.log`; Sentry; fix the component |

## 8. Review Cadence

- **After every deploy** — post-deploy verification checklist above.
- **Quarterly** — review this runbook + the env-var list + the rollback procedure.
- **After every incident** — review the deploy's role in the incident; update the runbook.

---

*See also: [MONITORING-AND-ALERTING.md](MONITORING-AND-ALERTING.md), [DATABASE-OPERATIONS.md](DATABASE-OPERATIONS.md), [ON-CALL-RUNBOOK.md](ON-CALL-RUNBOOK.md), [../security/SECRETS-MANAGEMENT.md](../security/SECRETS-MANAGEMENT.md), `docs/03-setup-and-deployment/*`.*
