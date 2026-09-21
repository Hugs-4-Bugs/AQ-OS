# On-Call Runbook — AcquisitionOS

> Owner: Operations. Status: Living document. Last reviewed: 2026-09-09.
> Audience: the on-call engineer at 3am. Keep this practical + scannable.

## 1. On-Call Rotation

- **Current:** founder + 1 engineer, weekly rotation, 24/7.
- **Handoff:** Monday 10:00 IST.
- **Escalation:** SEV-1 → page founder immediately. SEV-2 → page within 1 h. SEV-3 → next business day.
- **Tools:** (formalise with PagerDuty / Opsgenie when live; for now, Sentry + email alerts route to the on-call's phone).

## 2. The 3am Decision Tree

**You got paged. First 60 seconds:**
1. **Is it SEV-1?** (full outage, data breach, payment fraud). If yes → page the founder now; open the incident channel; follow [INCIDENT-RESPONSE-PLAN.md](../security/INCIDENT-RESPONSE-PLAN.md).
2. **Is it SEV-2?** (one major feature broken, suspicious pattern). Acknowledge; investigate; contain within 4 h.
3. **Is it a false positive?** (alert threshold too low, known benign pattern). Acknowledge; silence the alert; tune the threshold in the morning.

## 3. Common Incidents + Fixes

### A. The app is down (503 / no response)
1. SSH into the host (or open the platform's console).
2. Run `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/` — if not 200, the server is down.
3. Run `keepalive-v2.sh` — it's health-check based: does nothing if healthy; restores `.env` + restarts if not.
4. If `keepalive-v2.sh` failed, run the manual restart sequence:
   ```bash
   cd /home/z/my-project
   pkill -9 -f 'next' 2>/dev/null
   sleep 2
   ./ensure-env.sh
   [ -f src/middleware.ts ] && mv src/middleware.ts src/middleware.ts.disabled 2>/dev/null
   cp node_modules/@next/swc-linux-x64-gnu/next-swc.linux-x64-gnu.node node_modules/next/dist/server/next-swc.linux-x64-gnu.node 2>/dev/null
   setsid npx next dev -p 3000 > dev.log 2>&1 &
   sleep 25
   curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ --max-time 15
   ```
5. If still down, `tail -50 dev.log` and look for:
   - `Ecmascript file had an error` → a syntax error in a file. Find which (the log names it); fix; restart.
   - `Cannot find module` → a dependency issue; `bun install`; restart.
   - `address already in use :::3000` → a stale process; `pkill -9 -f next`; restart.
6. If the DB is the problem (`SQLITE_BUSY`, `relation does not exist`), see [DATABASE-OPERATIONS.md](DATABASE-OPERATIONS.md).
7. If you can't fix it in 30 min, escalate to SEV-1 + page the founder.

### B. Auth is failing for everyone
1. Check `/api/auth/config` — should return `{"googleAvailable":true,"emailConfigured":true}`. If not, `ensure-env.sh` + restart.
2. Check the audit log for `signin` failures — if 30%+ fail, it's credential stuffing; consider per-account lockout (not yet shipped — manual: disable the offending accounts).
3. Check `JWT_SECRET` / `JWT_REFRESH_SECRET` — if they changed, all sessions are invalidated (expected after a rotation; users re-auth).
4. If it's Google sign-in failing: check `dev.log` for `[G-CB] Step N` to find the failing step; check the Google OAuth redirect URI in Google Cloud Console.

### C. Stripe webhooks failing
1. Check the Stripe Dashboard → Webhooks → the endpoint's recent deliveries. If they're 5xx, the app is the problem.
2. `tail -200 dev.log | grep -i stripe` — look for the webhook route's errors.
3. Common causes:
   - `STRIPE_WEBHOOK_SECRET` mismatch → rotate in Stripe Dashboard + `ensure-env.sh` + restart.
   - DB transaction failure → check the DB; if locked, restart.
   - Idempotency conflict → check `PaymentWebhook` table for the event ID; if already processed, Stripe is retrying (return 200).
4. If the issue is the DB, see [DATABASE-OPERATIONS.md](DATABASE-OPERATIONS.md).

### D. Email sending failing
1. `tail -200 dev.log | grep -i 'EmailService'` — look for SMTP errors.
2. Common causes:
   - `535 Authentication failed` → wrong `SMTP_PASSWORD` / `GMAIL_APP_PASSWORD`. `ensure-env.sh` + restart.
   - `5.4.5 Daily sending limit exceeded` → Gmail quota; switch to Resend (`RESEND_API_KEY`) or wait.
   - `Connection timeout` → SMTP host unreachable; check `SMTP_HOST` / `SMTP_PORT`.
3. Run the diagnostic: `curl -s -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/auth/email-diagnostic` (admin-only).

### E. DB is locked / slow
1. Check `dev.log` for `SQLITE_BUSY` — concurrent writers on SQLite.
2. Restart the app (releases the lock).
3. If it recurs, plan the PostgreSQL migration (ADR-012) urgently.

### F. AI cost spike
1. Query `AiCostRecord` grouped by user, last 24h: find the top spender.
2. If they're on a plan whose credits wouldn't cover it, the credit gate was bypassed — investigate.
3. If they bought legitimate credit packs, it's revenue — but watch the pattern.
4. If they're abusing, disable their API keys; suspend the account via the admin endpoint.

### G. Deliverability dropped (spam complaints)
1. **Pause all outreach immediately** — set a feature flag (or comment out the send handler; deploy).
2. Check `EmailBounce` + `EmailUnsubscribe` tables for the spike.
3. Identify the offending sender(s) — per-user Gmail / Resend.
4. Notify affected users: "Some of your outreach may have landed in spam. We're working on it."
5. Post-mortem: what caused the spike?

### H. Cron job didn't fire
1. Check `audit-log` for `action=cron_*` in the expected window.
2. If no entry, the external scheduler didn't fire — check the cron-job-gateway / whatever fires the endpoint.
3. If the entry exists but with 5xx, `tail -200 dev.log | grep -i 'cron'` to find the error.
4. The jobs are idempotent — re-trigger manually: `curl -X POST https://<domain>/api/cron/<job> -H "Authorization: Bearer $CRON_SECRET"`.

## 4. How to Check Logs

- **App log:** `tail -200 /home/z/my-project/dev.log` (or `tail -f dev.log` to follow).
- **Filter:** `tail -500 dev.log | grep -iE 'error|failed|✗|Step [1-8]'`.
- **Specific route:** `tail -1000 dev.log | grep '/api/leads'`.
- **Specific user (audit):** query the `AuditLog` table via Prisma Studio (`bunx prisma studio`) or `sqlite3 db/custom.db "SELECT * FROM AuditLog WHERE userId = '...' ORDER BY createdAt DESC LIMIT 50;"`.
- **Sentry:** the Sentry dashboard → Issues → filter by environment + time.
- **Stripe:** Stripe Dashboard → Webhooks → recent deliveries.
- **Google:** Google Cloud Console → Logs Explorer (for OAuth + CSE errors).

## 5. How to Assess Severity

- **How many users affected?** All → SEV-1. One feature for all → SEV-2. One user → SEV-3.
- **Is data involved?** Yes (PII / payment) → SEV-1. No → SEV-2/3.
- **Is there a workaround?** No → higher severity. Yes → lower.
- **Is it a security issue?** Yes → SEV-1/2 (follow [INCIDENT-RESPONSE-PLAN.md](../security/INCIDENT-RESPONSE-PLAN.md)).

## 6. How to Roll Back a Bad Deployment

See [DEPLOYMENT-RUNBOOK.md](DEPLOYMENT-RUNBOOK.md) §4.

Quick version:
1. Re-deploy the previous commit / Docker tag.
2. If a schema change needs reverting, restore from the pre-deploy backup (see [DATABASE-OPERATIONS.md](DATABASE-OPERATIONS.md)).
3. Smoke test.
4. Communicate (status page + affected users).

## 7. Emergency Contacts

- **Founder:** <to fill — phone + email>
- **On-call engineer:** <the current on-call — phone + email>
- **Stripe support:** Stripe Dashboard → Help.
- **Google Cloud support:** Google Cloud Console → Support (if paid support).
- **Hosting platform support:** Aliyun FC / Vercel / Railway / Supabase support.
- **Legal counsel:** <to fill — for breach notifications>

(Update this section with real contacts when the program launches; keep it offline-only if sensitive.)

## 8. After the Incident

1. **Post-mortem** within 5 business days (template in [INCIDENT-RESPONSE-PLAN.md](../security/INCIDENT-RESPONSE-PLAN.md) §7).
2. **Action items** tracked to completion; reviewed weekly.
3. **Runbook update** — if the incident revealed a gap in this document, add it.

## 9. Tools Quick Reference

| Tool | Command / URL |
|---|---|
| SSH into host | `ssh <user>@<host>` (the current sandbox uses the platform's console) |
| Tail dev log | `tail -f /home/z/my-project/dev.log` |
| Restart server | `keepalive-v2.sh` (health-check) or the manual sequence in §3A |
| Restore .env | `ensure-env.sh` |
| Prisma Studio | `bunx prisma studio` (DB GUI) |
| Direct SQL | `sqlite3 /home/z/my-project/db/custom.db "<query>"` (SQLite CLI not always installed; use Prisma Studio) |
| Sentry | <Sentry dashboard URL> |
| Stripe Dashboard | <Stripe Dashboard URL> |
| Grafana | <Grafana URL> (when deployed) |
| Prometheus | <Prometheus URL> (when deployed) |

## 10. Review Cadence

- **Weekly** — on-call handoff; review the previous week's incidents.
- **Monthly** — review this runbook against actual incidents; update.
- **Quarterly** — drill a tabletop scenario from [INCIDENT-RESPONSE-PLAN.md](../security/INCIDENT-RESPONSE-PLAN.md) §5.

---

*See also: [DEPLOYMENT-RUNBOOK.md](DEPLOYMENT-RUNBOOK.md), [MONITORING-AND-ALERTING.md](MONITORING-AND-ALERTING.md), [DATABASE-OPERATIONS.md](DATABASE-OPERATIONS.md), [CRON-JOBS.md](CRON-JOBS.md), [../security/INCIDENT-RESPONSE-PLAN.md](../security/INCIDENT-RESPONSE-PLAN.md), [../developer/DEBUGGING-GUIDE.md](../developer/DEBUGGING-GUIDE.md).*
