# Debugging Guide — AcquisitionOS

> Owner: Engineering. Status: Living document. Last reviewed: 2026-09-09.
> Audience: the engineer staring at a bug at 11pm.

## 1. How to Read Logs

### The dev.log structure
```
[timestamp] [METHOD] /api/path [status] in [duration]ms (compile: [n]ms, proxy.ts: [n]ms, render: [n]ms)
```
- **compile:** time to compile the route (first hit or after a code change).
- **proxy.ts:** the Next 16 proxy overhead.
- **render:** the handler's actual execution time.

### Filter patterns
```bash
# Errors + failures
tail -500 dev.log | grep -iE 'error|failed|✗|Ecmascript|5xx'

# A specific route
tail -1000 dev.log | grep '/api/leads'

# A specific user (audit log) — query the DB
sqlite3 db/custom.db "SELECT action, details, createdAt FROM AuditLog WHERE userId = '...' ORDER BY createdAt DESC LIMIT 50;"

# Auth flow (magic link / Google OAuth) — they have distinctive log prefixes
tail -1000 dev.log | grep -iE 'Magic Link|G-CB|AUTH-CONFIG'

# Email service
tail -1000 dev.log | grep -iE 'EmailService|SMTP|Resend'

# AI
tail -1000 dev.log | grep -iE 'AI|provider|fallback'

# Slow requests (> 1s)
tail -1000 dev.log | grep -E 'in [0-9]+s' | sort -t' ' -k3 -r | head
```

### Sentry
- The Sentry dashboard (URL in `.env` `SENTRY_DSN`) → Issues → filter by environment + time. Each issue has a stack trace + breadcrumbs.
- **Reproduce locally:** Sentry's "Tags" show the user + the URL + the release. Use those to reproduce.

### Prometheus / Grafana
- (When deployed) Grafana → the `acquisitionos-overview` dashboard → error rate, p95, DB connections.
- Prometheus → Alerts → firing alerts.

## 2. How to Trace a Request

1. **Get the request ID.** The `api-logger.ts` doesn't currently log a per-request ID, but the timestamp + method + path is usually enough.
2. **Find the request in `dev.log`:**
   ```bash
   tail -2000 dev.log | grep "POST /api/leads/cmt.*"
   ```
3. **Follow the chain.** The route handler logs (if any) appear after the request line; the response line appears last. Anything between is the handler's work.
4. **For auth flows:** the `[G-CB] Step N` / `[Magic Link Request]` / `[AUTH-CONFIG]` prefixes trace the chain step-by-step. The step that fails has a `✗` or an `error:` line.
5. **For payments:** `tail -2000 dev.log | grep -iE 'stripe|webhook|payment'` shows the webhook receipt + the DB transaction.
6. **For AI:** `tail -2000 dev.log | grep -iE 'AI|provider|tokens'` shows the provider call + token counts.

## 3. Common Error Messages + Causes

### `Ecmascript file had an error`
- **Cause:** a syntax error in a committed file (often a half-edited file or a merge artefact).
- **Where:** the log names the file. Or run `bunx tsc --noEmit` to find it.
- **Fix:** fix the syntax; the dev server auto-reloads.

### `Cannot find module '...'`
- **Cause:** a missing dependency, OR the SWC native binary removed by the sandbox.
- **Fix:** `bun install` (missing dep); `keepalive-v2.sh` restores the SWC binary.

### `Both middleware file and proxy file detected`
- **Cause:** `src/middleware.ts` exists alongside `src/proxy.ts` (Next 16 uses `proxy.ts`).
- **Fix:** `mv src/middleware.ts src/middleware.ts.disabled` (the keepalive does this).

### `address already in use :::3000`
- **Cause:** a stale Next.js process.
- **Fix:** `pkill -9 -f next; sleep 2; bun run dev`.

### `SQLITE_BUSY: database is locked`
- **Cause:** concurrent writers on SQLite (single-writer).
- **Fix:** restart the app (releases the lock); investigate which route is doing the long write; plan the PostgreSQL migration (ADR-012).

### `Too many connections` (Postgres, when live)
- **Cause:** connection pool exhaustion.
- **Fix:** reduce `connection_limit` per instance; scale the DB's `max_connections`; check for connection leaks (a route that opens a connection without closing — Prisma usually handles this, but `$disconnect` is sometimes needed in scripts).

### `Prisma Client not generated`
- **Cause:** schema changed but the client wasn't regenerated.
- **Fix:** `bun run db:generate`.

### `relation does not exist` / `column does not exist`
- **Cause:** schema drift — the code expects a column the DB doesn't have (migration not applied), or the DB has a column the code doesn't expect (old code, new DB).
- **Fix:** apply the migration (`bun run db:migrate deploy`) or revert the code.

### `redirect_uri_mismatch` (Google OAuth)
- **Cause:** the current deployment URL isn't in Google Cloud Console's authorized redirect URIs.
- **Fix:** visit `/api/auth/google/redirect-uri` on the current domain; copy the URI; add it to the Google OAuth client.

### Magic-link email points at `localhost:3000`
- **Cause:** `APP_URL` unset or set to localhost; the verify route's origin resolver fell through.
- **Fix:** `ensure-env.sh` (sets `APP_URL` to the preview domain); verify in `.env`; if the route's `isPublicAppUrl` rejected it, the value points at an internal host — fix it.

### `Google sign-in failed. Please try again or use email/password.`
- **Cause:** the Google callback's `handleGoogleOAuth` returned null.
- **Where:** `tail -500 dev.log | grep -E 'G-CB.*✗|G-CB.*failed'` shows the failing step. Common: token exchange failed (redirect_uri mismatch), userinfo failed, DB upsert failed, session creation failed.
- **Fix:** depends on the step — see [INTEGRATION-GUIDES.md](../technical/INTEGRATION-GUIDES.md) §1.

### `Failed to send email: ...`
- **Cause:** SMTP / Resend returned an error.
- **Where:** the message includes the SMTP error code:
  - `535` → auth failed (wrong `SMTP_PASSWORD` / App Password).
  - `5.4.5` → Gmail daily sending limit.
  - `553` → invalid from address.
  - `550` → mailbox unavailable / spam-flagged.
  - `Connection timeout` → SMTP host unreachable.
- **Fix:** see [INTEGRATION-GUIDES.md](../technical/INTEGRATION-GUIDES.md) §2.

### `Stripe webhook signature verification failed`
- **Cause:** `STRIPE_WEBHOOK_SECRET` mismatch (rotated in Stripe but not in `.env`, or vice versa).
- **Fix:** verify the secret in `.env` matches the Stripe Dashboard endpoint's signing secret; restart.

### `Credits insufficient. Need X, have Y.`
- **Cause:** the user ran out of credits.
- **Fix:** not a bug; the user buys a pack or upgrades. If it's a system error (credits deducted but not logged), check the `CreditsLedger` for the user.

### `Rate limit exceeded`
- **Cause:** the API key (or IP) exceeded its rate limit.
- **Fix:** not a bug; the user waits or upgrades. If it's a false positive, the rate limiter is in-process (per-instance) — a multi-instance deploy may double-count.

### `Cannot schedule meetings in the past`
- **Cause:** the meeting start time is before `now`.
- **Fix:** not a bug; the user picks a future time.

### `Calendar token expired. Please reconnect your Google Calendar.`
- **Cause:** the OAuth refresh failed (revoked by the user, or Google revoked it).
- **Fix:** the user reconnects Calendar.

## 4. Debugging Database Queries

### Enable Prisma query logging (dev only)
In `src/lib/db.ts`:
```typescript
export const db = new PrismaClient({
  log: ['query', 'warn', 'error'],
});
```
This logs every query + its duration. Disable in prod (perf impact).

### Find slow queries
- In dev: the Prisma log shows durations; `grep "in [0-9]+ms"` + sort.
- In PostgreSQL: `pg_stat_statements` shows the slowest by total time.

### Explain a query
- SQLite: `EXPLAIN QUERY PLAN <sql>;` in `sqlite3` / Prisma Studio.
- PostgreSQL: `EXPLAIN ANALYZE <sql>;`.

### Add an index
- Edit `prisma/schema.prisma`; add `@@index([field1, field2])` to the model; `bun run db:push` (dev) or `bun run db:migrate -- --name add_index_X` (prod).

## 5. Debugging Email Sending

1. **Verify config:** `curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/auth/email-diagnostic` — tests SMTP connectivity + reports the issue.
2. **Check `.env`:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` are set + correct.
3. **Tail the log:** `tail -500 dev.log | grep -iE 'EmailService|SMTP|Resend'`.
4. **Send a test:** trigger a magic link to your own email; watch the log.
5. **Common:**
   - `535` → App Password is wrong (Google Account → Security → App Passwords → regenerate).
   - `5.4.5` → Gmail daily limit; switch to Resend or wait.
   - `Connection timeout` → firewall / port blocked; try port 587 (TLS) vs 465 (SSL).

## 6. Debugging Stripe Webhooks

1. **Stripe Dashboard → Webhooks → the endpoint → recent deliveries.** Each shows the request + response + the signature verification result.
2. **If 5xx:** the app is the problem. `tail -500 dev.log | grep -iE 'stripe|webhook|payment'`.
3. **If signature verification fails:** `STRIPE_WEBHOOK_SECRET` mismatch. Compare `.env` to the Stripe Dashboard endpoint's signing secret.
4. **If the DB transaction fails:** check the DB; if locked, restart; if a constraint violation, the payload may be malformed (rare — Stripe's payloads are well-tested).
5. **Replay:** Stripe Dashboard → the event → "Resend" (idempotent on our side — `PaymentWebhook` dedupes).

## 7. Debugging AI Calls

1. **Tail the log:** `tail -500 dev.log | grep -iE 'AI|provider|fallback'`.
2. **Check the cost:** query `AiCostRecord` for the user — are the costs reasonable, or is a runaway prompt burning credits?
3. **Check the provider:** the Z-AI SDK has its own error log; check the runtime environment.
4. **Fallback:** `src/lib/ai-provider-fallback.ts` — if the primary fails, it tries the fallback; if all fail, the route returns 503.

## 8. Debugging the Frontend

1. **Browser DevTools → Console** for JS errors.
2. **Network tab** for failed API calls (the response body usually has the error).
3. **React DevTools** for component state + props.
4. **TanStack Query Devtools** (the floating button in dev) for the query cache.
5. **Sentry** for production errors (with source maps).

## 9. The "Is It the Sandbox?" Check

Before deep-diving, check whether the issue is the sandbox:
- Is `.env` intact? `grep GOOGLE_CLIENT_ID .env` — if missing, `ensure-env.sh` + restart.
- Is the server actually down? `curl http://localhost:3000/` — if not 200, `keepalive-v2.sh`.
- Is the SWC binary present? `ls node_modules/next/dist/server/next-swc.linux-x64-gnu.node` — if missing, `keepalive-v2.sh` restores it.
- Is `src/middleware.ts` present? `ls src/middleware.ts` — if yes, `mv src/middleware.ts src/middleware.ts.disabled`.

Many "mysterious" bugs are a wiped `.env` or a missing SWC binary. Check these first.

## 10. When You're Stuck

1. **Read the worklog** (`worklog.md`) — the last 200 lines often have the context.
2. **Read the ADRs** (`/docs/technical/ARCHITECTURE-DECISION-RECORDS.md`) — the decision may explain the constraint.
3. **Read the existing docs** (`docs/09-troubleshooting/COMMON-ERRORS.md` + the `_legacy` docs if relevant).
4. **Write a minimal reproduction** — strip the bug down to the smallest trigger.
5. **Pair** — explain the bug to a colleague (or a rubber duck); the explanation often surfaces the fix.
6. **Sleep on it** — if it's not SEV-1.

## 11. Review Cadence

- **Quarterly** — review this document against the recent bugs; add new common errors.
- **After every SEV-1/2 incident** — add the error pattern + the fix to §3.

---

*See also: [LOCAL-DEVELOPMENT.md](LOCAL-DEVELOPMENT.md), [ON-CALL-RUNBOOK.md](../operations/ON-CALL-RUNBOOK.md), [ERROR-CODES.md](../technical/ERROR-CODES.md), [INTEGRATION-GUIDES.md](../technical/INTEGRATION-GUIDES.md), [../operations/ON-CALL-RUNBOOK.md](../operations/ON-CALL-RUNBOOK.md) §3 (common incidents + fixes).*
