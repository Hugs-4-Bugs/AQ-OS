# Admin Workflows

> Sources: `/api/admin/*`, `/api/audit/*`, `/api/health/*`, `/api/settings/api-keys/*`, `scripts/backup/`, worklog.

## How to Access Admin Features

- Admin APIs require an authenticated user with role **owner** or **admin** (`rbac.ts` + `entitlement-middleware.ts` gate every `/api/admin/*` route).
- Role assignment: the first user in an organization is `owner`; owners promote members via organization settings (`/api/settings/org/*`, member roles owner/admin/member/viewer).
- Admin UI: the **`/admin/feedback`** console (feedback moderation). Other admin surfaces are API-first (use the dashboard widgets that call them, or an API client).
- There is no separate "admin login" — it's the same auth with elevated role checks.

## Managing User Accounts

- **List/inspect users:** via the database (Prisma) or dashboard account widgets; `GET /api/auth/me` for self. There is no bulk user-admin endpoint — direct DB/Prisma access is the current path for deep user ops.
- **Deactivate a user:** set `User.isActive=false` (soft, preserves FKs) — kills login ability on next session check.
- **Force sign-out everywhere:** delete/revoke the user's `UserSession` rows (or `POST /api/settings/sessions/revoke-all` as that user).
- **Reset a user's MFA:** delete their `MfaConfig` row; they can re-enroll.
- **Unlock a locked account:** clear `otpLockedUntil` / lock fields on `User` (see `account-lock-service.ts`).
- **Grant plan/credits manually:** update `User.plan`/`credits` + write a matching `CreditsLedger` row to keep the ledger truthful.
- **Organization/team:** create org, invite (`/api/settings/org/invites`), accept (`/api/settings/team/accept`), revoke invites; roles per `OrgMember`.

## Viewing Feedback Reports

1. Open `/admin/feedback` (or `GET /api/admin/feedback`): list with type (bug/feature/general), severity, status (`open → in_review → resolved → closed`), screenshots, assignee.
2. Update status: `PATCH /api/admin/feedback/[id]` — every change logged in `FeedbackStatusLog`.
3. Reply/comment: `POST /api/admin/feedback/[id]/comment` — visible to the reporting user in their feedback view.
4. **Crash reports:** `GET /api/admin/feedback/crashes` (`CrashReport`: stack, browser, URL) — triage by frequency/last-seen.
5. **Analytics:** `GET /api/admin/feedback/analytics` — volume by day, category distribution, resolution stats.

## Monitoring System Health

| Check | Endpoint | Healthy looks like |
|---|---|---|
| Liveness | `GET /api/health` | 200 `{status:"ok"}` |
| Deep health | `GET /api/health/detailed` | DB ok, memory sane, AI provider reachable, SMTP configured |
| Database | `GET /api/health/database` | Prisma query round-trip ok |
| AI provider chain | `GET /api/ai/usage`, `/api/ai/costs` | Recent calls succeeding, costs within budget |
| Email | `/api/auth/email-diagnostic` | Transport resolves, recent sends not all bounced |
| Payment webhooks (once Stripe live) | `GET /api/admin/billing/webhooks` | Recent events `processed:true`, no repeating `processingError` |
| Failed payments | `GET /api/admin/billing/failed-payments` | Short list; retries scheduled |
| Realtime | `GET /api/realtime/status` | Connected clients, event throughput |
| Metrics | `GET /api/metrics`, `/api/metrics/dashboard` | Counters/gauges from `SystemMetrics` |

Alert-worthy log patterns: `[SMTP-Env-Diag]` showing MISSING after restarts, repeated `session init failed`, OOM kills (sandbox), webhook signature failures.

## Database Maintenance

- **Backups:** `npm run backup` (`scripts/backup/backup.sh`) — scheduled backups recommended (cron). Admin API: `/api/admin/backup` (list/create/restore by id). Restore: `npm run backup:restore`.
- **Schema changes:** edit `prisma/schema.prisma` → `npx prisma migrate dev` (local) / `migrate deploy` (prod). The schema carries SQLite→PostgreSQL migration annotations — follow the phase order in its header comment for the big move.
- **Data hygiene:** soft-deleted rows (`deletedAt`) can be purged periodically; GDPR retention jobs via `/api/gdpr/retention` + `src/lib/compliance/retention.ts`.
- **Index sanity:** the schema ships with comprehensive indexes; after large imports, consider `ANALYZE` on PostgreSQL.

## How to Rotate API Keys and Secrets

| Secret | Rotation procedure |
|---|---|
| `JWT_SECRET` | Generate new → deploy alongside old as grace (users re-login) → remove old. Rotating invalidates all sessions (that's the point) |
| `JWT_REFRESH_SECRET` | Same; force refresh-token re-issue |
| `SMTP_PASSWORD` | Revoke old App Password in Google account → create new → update secret → restart server → `smtp-verify.js` |
| `GOOGLE_CLIENT_SECRET` | GCP Console → OAuth client → reset secret → update env → restart (no data loss) |
| `CRON_SECRET` | Update secret AND every scheduler using it (Railway cron/Vercel cron/external) simultaneously |
| `STRIPE_SECRET_KEY` | Rotate in Stripe Dashboard (test/live) → update env → webhooks unaffected (separate secret) |
| `STRIPE_WEBHOOK_SECRET` | Rotate per endpoint in Stripe → update env |
| `DATABASE_URL` | Change DB password at provider → update env → migrate connections (app restart) |
| User API keys (`ApiKey`) | Self-service: rotate/revoke at `/api/settings/api-keys/[id]/rotate` & `/revoke`; expiry cron: `/api/cron/expire-api-keys` |

**Golden rules:** rotate in the secrets panel (not in `.env` only), restart the server after, and verify each rotation with the matching probe (`/api/auth/config` for OAuth/SMTP, `smtp-verify.js`, a cron ping for `CRON_SECRET`).
